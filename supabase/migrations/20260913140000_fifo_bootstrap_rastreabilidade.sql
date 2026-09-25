-- Migration: 20260913140000_fifo_bootstrap_rastreabilidade.sql
-- FASE 3B.1: Infraestrutura de Rastreabilidade de Lotes e Bootstrap do Estoque Legado

BEGIN;

-- 1. Criar Tabela de Rastreabilidade de Lotes (movimento_lotes)
CREATE TABLE IF NOT EXISTS public.movimento_lotes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    movimento_id text NULL,
    lote_id uuid NOT NULL REFERENCES public.estoque_lotes(id) ON DELETE CASCADE,
    inventario_id text NULL,
    inventario_item_id uuid NULL,
    id_interno text NOT NULL,
    local_estoque text NOT NULL,
    tipo text NOT NULL,
    quantidade numeric NOT NULL,
    custo_unitario numeric NOT NULL DEFAULT 0,
    valor_total numeric NOT NULL DEFAULT 0,
    execution_id text NULL,
    criado_em timestamp with time zone DEFAULT now(),

    CONSTRAINT chk_movimento_lotes_tipo CHECK (tipo IN (
        'ENTRADA',
        'SAIDA_FIFO',
        'AJUSTE_INVENTARIO_FALTA',
        'AJUSTE_INVENTARIO_SOBRA',
        'TRANSFERENCIA_SAIDA',
        'TRANSFERENCIA_ENTRADA',
        'BOOTSTRAP'
    ))
);

-- Comentários descritivos
COMMENT ON TABLE public.movimento_lotes IS 'Tabela de auditoria e rastreabilidade que vincula alterações em estoque_lotes a movimentações operacionais e ajustes';
COMMENT ON COLUMN public.movimento_lotes.movimento_id IS 'Identificador do movimento em public.movimentos (pode ser NULL em bootstrap técnico)';
COMMENT ON COLUMN public.movimento_lotes.tipo IS 'Classificação da movimentação do lote: ENTRADA, SAIDA_FIFO, AJUSTE_INVENTARIO_FALTA, AJUSTE_INVENTARIO_SOBRA, TRANSFERENCIA_SAIDA, TRANSFERENCIA_ENTRADA, BOOTSTRAP';

-- Índices para performance de auditoria
CREATE INDEX IF NOT EXISTS idx_movimento_lotes_lote_id ON public.movimento_lotes (lote_id);
CREATE INDEX IF NOT EXISTS idx_movimento_lotes_id_interno ON public.movimento_lotes (id_interno);
CREATE INDEX IF NOT EXISTS idx_movimento_lotes_movimento_id ON public.movimento_lotes (movimento_id);
CREATE INDEX IF NOT EXISTS idx_movimento_lotes_inventario_id ON public.movimento_lotes (inventario_id);
CREATE INDEX IF NOT EXISTS idx_movimento_lotes_tipo ON public.movimento_lotes (tipo);

-- RLS e Permissões
ALTER TABLE public.movimento_lotes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE tablename = 'movimento_lotes'
           AND policyname = 'allow_all_movimento_lotes'
    ) THEN
        CREATE POLICY allow_all_movimento_lotes
        ON public.movimento_lotes
        FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT ALL ON TABLE public.movimento_lotes TO anon, authenticated, service_role;

-- 2. Criar Índice Determinístico de Ordenação FIFO em public.estoque_lotes
CREATE INDEX IF NOT EXISTS idx_estoque_lotes_fifo_determ 
ON public.estoque_lotes (id_interno, upper(btrim(local_estoque)), data_entrada ASC, criado_em ASC, id ASC);

-- 3. RPC Transacional de Bootstrap Idempotente (Com suporte a Dry-Run)
CREATE OR REPLACE FUNCTION public.bootstrap_estoque_lotes_legado(
    p_dry_run boolean DEFAULT true,
    p_execution_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_execution_id text := coalesce(nullif(btrim(p_execution_id), ''), 'bootstrap:' || gen_random_uuid()::text);
    v_bootstrap_em timestamp with time zone := now();
    v_rec record;
    v_lote_id uuid;
    v_total_lotes integer := 0;
    v_total_unidades numeric := 0;
    v_valor_total numeric := 0;
    v_custo_null_count integer := 0;
    v_custo_zero_count integer := 0;
    v_alias_1andar_count integer := 0;
    v_local_canonic text;
    v_custo_unit numeric;
    v_detalhes jsonb := '[]'::jsonb;
BEGIN
    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Sessao autenticada obrigatoria.';
    END IF;

    IF NOT p_dry_run THEN
        PERFORM pg_advisory_xact_lock(hashtext('bootstrap_estoque_lotes_legado'));
    END IF;

    -- Iterar sobre todos os saldos operacionais disponíveis em estoque_atual
    FOR v_rec IN
        SELECT ea.id_interno,
               ea.local,
               ea.saldo_disponivel,
               p.id AS produto_id,
               p.preco_custo
          FROM public.estoque_atual ea
          LEFT JOIN public.produtos p ON p.id_interno = ea.id_interno
         WHERE ea.saldo_disponivel > 0
         ORDER BY ea.id_interno, ea.local
    LOOP
        v_local_canonic := upper(btrim(v_rec.local));
        
        IF v_local_canonic = '1ANDAR' THEN
            v_alias_1andar_count := v_alias_1andar_count + 1;
        END IF;

        -- Checar idempotência: ignorar se já existe lote bootstrap para este SKU + local canônico
        IF EXISTS (
            SELECT 1
              FROM public.estoque_lotes l
             WHERE l.id_interno = v_rec.id_interno
               AND upper(btrim(l.local_estoque)) = v_local_canonic
               AND l.origem_tipo = 'bootstrap_estoque_inicial'
        ) THEN
            CONTINUE;
        END IF;

        -- Validar preço de custo do produto
        IF v_rec.preco_custo IS NULL THEN
            v_custo_null_count := v_custo_null_count + 1;
            -- Preco custo NULL não cria lote silenciosamente
            CONTINUE;
        END IF;

        v_custo_unit := round(v_rec.preco_custo, 2);

        IF v_custo_unit = 0 THEN
            v_custo_zero_count := v_custo_zero_count + 1;
        END IF;

        v_total_lotes := v_total_lotes + 1;
        v_total_unidades := v_total_unidades + v_rec.saldo_disponivel;
        v_valor_total := v_valor_total + (v_rec.saldo_disponivel * v_custo_unit);

        -- Se for execução real (não dry-run), persistir lote e movimento_lotes
        IF NOT p_dry_run THEN
            INSERT INTO public.estoque_lotes (
                produto_id,
                id_interno,
                origem_tipo,
                origem_id,
                numero_nf,
                data_entrada,
                quantidade_inicial,
                quantidade_atual,
                custo_unitario,
                custo_total,
                local_estoque,
                status,
                criado_em,
                atualizado_em
            ) VALUES (
                v_rec.produto_id,
                v_rec.id_interno,
                'bootstrap_estoque_inicial',
                NULL,
                NULL,
                v_bootstrap_em,
                v_rec.saldo_disponivel,
                v_rec.saldo_disponivel,
                v_custo_unit,
                (v_rec.saldo_disponivel * v_custo_unit),
                v_local_canonic,
                'ativo',
                v_bootstrap_em,
                v_bootstrap_em
            )
            RETURNING id INTO v_lote_id;

            -- Registrar histórico em movimento_lotes
            INSERT INTO public.movimento_lotes (
                movimento_id,
                lote_id,
                id_interno,
                local_estoque,
                tipo,
                quantidade,
                custo_unitario,
                valor_total,
                execution_id,
                criado_em
            ) VALUES (
                NULL,
                v_lote_id,
                v_rec.id_interno,
                v_local_canonic,
                'BOOTSTRAP',
                v_rec.saldo_disponivel,
                v_custo_unit,
                (v_rec.saldo_disponivel * v_custo_unit),
                v_execution_id,
                v_bootstrap_em
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'ok', true,
        'dry_run', p_dry_run,
        'execution_id', v_execution_id,
        'bootstrap_em', v_bootstrap_em,
        'total_lotes_previstos', v_total_lotes,
        'total_unidades_previstas', v_total_unidades,
        'valor_total_previsto', v_valor_total,
        'custo_null_count', v_custo_null_count,
        'custo_zero_count', v_custo_zero_count,
        'alias_1andar_count', v_alias_1andar_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_estoque_lotes_legado(boolean, text) TO authenticated, anon, service_role;

COMMIT;
