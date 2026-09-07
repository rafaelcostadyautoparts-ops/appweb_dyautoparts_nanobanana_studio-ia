-- Migration: BLOCO 3 - Integracao Pedido de Compra x XML x Recebimento Fisico
-- Data: 2026-09-07

-- 1. Adicionar tipo_vinculo_pedido em public.entradas_nf
ALTER TABLE public.entradas_nf
    ADD COLUMN IF NOT EXISTS tipo_vinculo_pedido text NOT NULL DEFAULT 'SEM_PEDIDO';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'entradas_nf_tipo_vinculo_pedido_check'
    ) THEN
        ALTER TABLE public.entradas_nf
            ADD CONSTRAINT entradas_nf_tipo_vinculo_pedido_check
            CHECK (tipo_vinculo_pedido IN ('SEM_PEDIDO', 'COM_PEDIDO'));
    END IF;
END $$;

-- 2. Tabela de Alocacao entre Item Fiscal da NF e Item do Pedido de Compra
CREATE TABLE IF NOT EXISTS public.entrada_nf_item_pedido_alocacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entrada_nf_id uuid NOT NULL REFERENCES public.entradas_nf(id) ON DELETE CASCADE,
    entrada_nf_item_id uuid NOT NULL REFERENCES public.entradas_nf_itens(id) ON DELETE CASCADE,
    pedido_compra_item_id uuid NOT NULL REFERENCES public.pedidos_compra_itens(id) ON DELETE CASCADE,
    quantidade_alocada_xml numeric(12,3) NOT NULL,
    quantidade_aceita_alocada numeric(12,3) NOT NULL DEFAULT 0,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    CONSTRAINT alocacao_quantidade_xml_check CHECK (quantidade_alocada_xml > 0),
    CONSTRAINT alocacao_quantidade_aceita_check CHECK (quantidade_aceita_alocada >= 0 AND quantidade_aceita_alocada <= quantidade_alocada_xml),
    CONSTRAINT entrada_nf_item_pedido_unique UNIQUE (entrada_nf_item_id, pedido_compra_item_id)
);

CREATE INDEX IF NOT EXISTS idx_alocacoes_entrada_nf_id ON public.entrada_nf_item_pedido_alocacoes(entrada_nf_id);
CREATE INDEX IF NOT EXISTS idx_alocacoes_entrada_nf_item_id ON public.entrada_nf_item_pedido_alocacoes(entrada_nf_item_id);
CREATE INDEX IF NOT EXISTS idx_alocacoes_pedido_compra_item_id ON public.entrada_nf_item_pedido_alocacoes(pedido_compra_item_id);

ALTER TABLE public.entrada_nf_item_pedido_alocacoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'entrada_nf_item_pedido_alocacoes'
           AND policyname = 'allow_all_entrada_nf_item_pedido_alocacoes'
    ) THEN
        CREATE POLICY allow_all_entrada_nf_item_pedido_alocacoes
        ON public.entrada_nf_item_pedido_alocacoes
        FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT ALL ON TABLE public.entrada_nf_item_pedido_alocacoes TO anon, authenticated, service_role;

-- 3. Atualizacao da RPC Transacional de Finalizacao para processar Alocacoes de Pedidos de Compra
CREATE OR REPLACE FUNCTION public.finalizar_recebimento_entrada_nf(
    p_entrada_nf_id uuid,
    p_usuario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entrada public.entradas_nf%ROWTYPE;
    v_rec RECORD;
    v_stock public.estoque_atual%ROWTYPE;
    v_now timestamp with time zone := now();
    v_user text := COALESCE(NULLIF(btrim(p_usuario), ''), 'SISTEMA');
    v_local_dest text;
    v_qtd_aceita numeric(15,4);
    v_custo_unit numeric(15,4);
    v_destino_novo numeric(15,4);
    v_movimento_id text;
    v_processed_count integer := 0;
    v_total_estoque_adicionado numeric(15,4) := 0;
    v_lotes_criados integer := 0;
    v_movimentos_criados integer := 0;
    v_alocacoes_processadas integer := 0;
    v_tem_divergencia boolean := false;
    v_tem_recusa boolean := false;
    v_status_final text := 'finalizada';

    -- Variaveis para distribuicao de quantidade aceita nos pedidos alocados
    v_item_id uuid;
    v_item_qtd_aceita_total numeric(15,4);
    v_qtd_restante_distribuir numeric(15,4);
    v_aloc RECORD;
    v_qtd_aceita_aloc numeric(15,4);
    v_pci public.pedidos_compra_itens%ROWTYPE;
    v_nova_qtd_rec numeric(15,4);
    v_novo_status_pci text;
BEGIN
    IF p_entrada_nf_id IS NULL THEN
        RAISE EXCEPTION 'ID da Entrada NF nao informado.';
    END IF;

    -- 1. Lock exclusivo da Entrada NF
    SELECT * INTO v_entrada
      FROM public.entradas_nf
     WHERE id = p_entrada_nf_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Entrada NF % nao encontrada.', p_entrada_nf_id;
    END IF;

    -- 2. Idempotencia & Bloqueio se ja finalizada
    IF v_entrada.estoque_finalizado OR lower(COALESCE(v_entrada.status, '')) = 'finalizada' THEN
        RAISE EXCEPTION 'Entrada NF % ja se encontra finalizada. Operacao bloqueada.', p_entrada_nf_id;
    END IF;

    IF v_entrada.afeta_estoque IS FALSE THEN
        RAISE EXCEPTION 'Entrada NF % marcada para nao afetar estoque.', p_entrada_nf_id;
    END IF;

    -- 3. Validacao da existencia de recebimentos fisicos
    IF NOT EXISTS (
        SELECT 1 FROM public.entrada_nf_item_recebimentos WHERE entrada_nf_id = p_entrada_nf_id
    ) THEN
        RAISE EXCEPTION 'Nenhum recebimento fisico encontrado para a Entrada NF %. Efetue a conferencia fisica antes de finalizar.', p_entrada_nf_id;
    END IF;

    -- 4. Bloqueio de itens NAO_IDENTIFICADO
    IF EXISTS (
        SELECT 1 FROM public.entrada_nf_item_recebimentos
         WHERE entrada_nf_id = p_entrada_nf_id
           AND upper(COALESCE(situacao, '')) = 'NAO_IDENTIFICADO'
    ) THEN
        RAISE EXCEPTION 'Existem produtos nao identificados no recebimento fisico da Entrada NF %. Realize o vinculo cadastral antes de finalizar.', p_entrada_nf_id;
    END IF;

    -- 5. Loop sobre todas as alocacoes fisicas registradas para a entrada
    FOR v_rec IN
        SELECT r.*,
               i.quantidade AS quantidade_xml,
               i.valor_unitario AS item_valor_unitario,
               i.valor_total AS item_valor_total,
               i.custo_real_unitario AS item_custo_real_unitario,
               i.custo_real_total AS item_custo_real_total
          FROM public.entrada_nf_item_recebimentos r
          JOIN public.entradas_nf_itens i ON i.id = r.entrada_nf_item_id
         WHERE r.entrada_nf_id = p_entrada_nf_id
    LOOP
        v_qtd_aceita := COALESCE(v_rec.quantidade_aceita, 0);

        IF v_rec.quantidade_recusada > 0 OR v_rec.situacao <> 'CONFERE' THEN
            v_tem_divergencia := true;
        END IF;
        IF v_rec.quantidade_recusada > 0 THEN
            v_tem_recusa := true;
        END IF;

        -- Processa estoque, movimentos e lotes somente para quantidade aceita > 0
        IF v_qtd_aceita > 0 THEN
            v_local_dest := UPPER(COALESCE(NULLIF(btrim(v_rec.local_destino), ''), 'TERREO'));

            v_custo_unit := COALESCE(
                NULLIF(v_rec.item_custo_real_unitario, 0),
                CASE WHEN COALESCE(v_rec.quantidade_xml, 0) > 0 AND COALESCE(v_rec.item_custo_real_total, 0) > 0
                     THEN round(v_rec.item_custo_real_total / v_rec.quantidade_xml, 4)
                     ELSE NULL
                END,
                v_rec.item_valor_unitario,
                0
            );

            -- 5a. Atualizar saldo em public.estoque_atual por produto + local
            SELECT * INTO v_stock
              FROM public.estoque_atual
             WHERE id_interno = v_rec.id_interno AND upper(btrim(local)) = v_local_dest
             ORDER BY id LIMIT 1 FOR UPDATE;

            v_destino_novo := COALESCE(v_stock.saldo_disponivel, 0) + v_qtd_aceita;

            IF FOUND THEN
                UPDATE public.estoque_atual
                   SET local = v_local_dest,
                       saldo_disponivel = v_destino_novo,
                       saldo_reservado = COALESCE(saldo_reservado, 0),
                       saldo_em_transito = COALESCE(saldo_em_transito, 0),
                       saldo_total = v_destino_novo + COALESCE(saldo_reservado, 0) + COALESCE(saldo_em_transito, 0),
                       atualizado_em = v_now,
                       chave_estoque = COALESCE(chave_estoque, v_rec.id_interno || '|' || v_local_dest)
                 WHERE id = v_stock.id;
            ELSE
                INSERT INTO public.estoque_atual (
                    id_interno, local, saldo_disponivel, saldo_reservado,
                    saldo_em_transito, saldo_total, atualizado_em, chave_estoque
                ) VALUES (
                    v_rec.id_interno, v_local_dest, v_destino_novo, 0, 0,
                    v_destino_novo, v_now, v_rec.id_interno || '|' || v_local_dest
                );
            END IF;

            -- 5b. Inserir movimento em public.movimentos
            v_movimento_id := 'MOV-ENT-NF-' || p_entrada_nf_id || '-' || v_rec.id;

            INSERT INTO public.movimentos (
                movimento_id, data_hora, tipo, id_interno,
                local_origem, local_destino, quantidade, usuario, origem,
                observacao, execution_id, auth_user_id
            ) VALUES (
                v_movimento_id,
                v_now,
                'ENTRADA',
                v_rec.id_interno,
                NULL,
                v_local_dest,
                v_qtd_aceita,
                v_user,
                'APP_COMPRAS',
                'NF ' || COALESCE(v_entrada.numero_nf, '') || ' | Alocacao: ' || v_rec.id || ' | ' || v_rec.id_interno || ' em ' || v_local_dest,
                'entrada_nf_rec:' || v_rec.id,
                auth.uid()
            );
            v_movimentos_criados := v_movimentos_criados + 1;

            -- 5c. Criar camada de Lote FIFO em public.estoque_lotes
            INSERT INTO public.estoque_lotes (
                produto_id,
                id_interno,
                origem_tipo,
                origem_id,
                recebimento_id,
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
                'entrada_nf',
                p_entrada_nf_id,
                v_rec.id,
                COALESCE(v_entrada.numero_nf, ''),
                COALESCE(v_entrada.data_recebimento, v_entrada.data_emissao, v_now),
                v_qtd_aceita,
                v_qtd_aceita,
                v_custo_unit,
                (v_qtd_aceita * v_custo_unit),
                LOWER(v_local_dest),
                'ativo',
                v_now,
                v_now
            );
            v_lotes_criados := v_lotes_criados + 1;

            -- 5d. Atualizar preco_custo de referencia do produto
            IF v_custo_unit > 0 THEN
                UPDATE public.produtos
                   SET preco_custo = round(v_custo_unit, 2),
                       atualizado_em = v_now
                 WHERE id = v_rec.produto_id OR id_interno = v_rec.id_interno;
            END IF;

            v_total_estoque_adicionado := v_total_estoque_adicionado + v_qtd_aceita;
        END IF;

        v_processed_count := v_processed_count + 1;
    END LOOP;

    -- 6. Processar Alocacoes de Pedidos de Compra (somente para modo COM_PEDIDO ou se houver alocacoes gravadas)
    FOR v_item_id IN
        SELECT DISTINCT entrada_nf_item_id
          FROM public.entrada_nf_item_pedido_alocacoes
         WHERE entrada_nf_id = p_entrada_nf_id
    LOOP
        -- Calcular total aceito fisicamente para este item fiscal
        SELECT COALESCE(SUM(quantidade_aceita), 0) INTO v_item_qtd_aceita_total
          FROM public.entrada_nf_item_recebimentos
         WHERE entrada_nf_item_id = v_item_id;

        v_qtd_restante_distribuir := v_item_qtd_aceita_total;

        -- Distribuir por FIFO dos pedidos de compra alocados
        FOR v_aloc IN
            SELECT a.id AS alocacao_id,
                   a.pedido_compra_item_id,
                   a.quantidade_alocada_xml,
                   pci.id_interno,
                   pci.data_pedido
              FROM public.entrada_nf_item_pedido_alocacoes a
              JOIN public.pedidos_compra_itens pci ON pci.id = a.pedido_compra_item_id
             WHERE a.entrada_nf_item_id = v_item_id
             ORDER BY pci.data_pedido ASC, a.criado_em ASC
        LOOP
            v_qtd_aceita_aloc := LEAST(v_qtd_restante_distribuir, v_aloc.quantidade_alocada_xml);

            UPDATE public.entrada_nf_item_pedido_alocacoes
               SET quantidade_aceita_alocada = v_qtd_aceita_aloc,
                   atualizado_em = v_now
             WHERE id = v_aloc.alocacao_id;

            v_qtd_restante_distribuir := GREATEST(v_qtd_restante_distribuir - v_qtd_aceita_aloc, 0);

            -- Atualizar pedidos_compra_itens (lock FOR UPDATE)
            SELECT * INTO v_pci
              FROM public.pedidos_compra_itens
             WHERE id = v_aloc.pedido_compra_item_id
               FOR UPDATE;

            IF FOUND AND UPPER(COALESCE(v_pci.status, '')) <> 'CANCELADO' THEN
                v_nova_qtd_rec := COALESCE(v_pci.quantidade_recebida, 0) + v_qtd_aceita_aloc;

                IF v_nova_qtd_rec >= v_pci.quantidade_pedida THEN
                    v_novo_status_pci := 'RECEBIDO';
                ELSIF v_nova_qtd_rec > 0 THEN
                    v_novo_status_pci := 'PARCIAL';
                ELSE
                    v_novo_status_pci := 'PENDENTE';
                END IF;

                UPDATE public.pedidos_compra_itens
                   SET quantidade_recebida = v_nova_qtd_rec,
                       status = v_novo_status_pci,
                       data_recebimento = CASE WHEN v_novo_status_pci = 'RECEBIDO' THEN v_now::date ELSE data_recebimento END,
                       atualizado_em = v_now
                 WHERE id = v_pci.id;
            END IF;

            v_alocacoes_processadas := v_alocacoes_processadas + 1;
        END LOOP;
    END LOOP;

    -- 7. Atualizar status final da Entrada NF
    IF v_tem_divergencia THEN
        v_status_final := 'recebida_com_divergencia';
    ELSE
        v_status_final := 'finalizada';
    END IF;

    UPDATE public.entradas_nf
       SET status = v_status_final,
           estoque_finalizado = true,
           atualizado_em = v_now
     WHERE id = p_entrada_nf_id;

    RETURN jsonb_build_object(
        'ok', true,
        'entrada_nf_id', p_entrada_nf_id,
        'status_final', v_status_final,
        'alocacoes_processadas', v_processed_count,
        'total_estoque_adicionado', v_total_estoque_adicionado,
        'movimentos_criados', v_movimentos_criados,
        'lotes_criados', v_lotes_criados,
        'alocacoes_pedidos_processadas', v_alocacoes_processadas,
        'atualizado_em', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalizar_recebimento_entrada_nf(uuid, text) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
