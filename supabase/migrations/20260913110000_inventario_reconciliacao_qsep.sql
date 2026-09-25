-- Migration: 20260913110000_inventario_reconciliacao_qsep.sql
-- FASE 2B.1: Snapshot Transacional de Q_sep no Momento da Contagem Física

BEGIN;

-- 1. Novas colunas em inventarios_itens para congelamento imutável de Q_sep
ALTER TABLE public.inventarios_itens
  ADD COLUMN IF NOT EXISTS q_sep_snapshot integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS q_sep_snapshot_em timestamp without time zone NULL;

COMMENT ON COLUMN public.inventarios_itens.q_sep_snapshot IS 'Fotografia congelada da quantidade em separacao no instante exato da contagem fisica';
COMMENT ON COLUMN public.inventarios_itens.q_sep_snapshot_em IS 'Timestamp gerado pelo PostgreSQL no momento em que a contagem e o snapshot de Q_sep foram salvos';

-- 2. RPC Transacional para Salvar Contagem Física e Congelar Snapshot
CREATE OR REPLACE FUNCTION public.salvar_contagem_inventario_item(
    p_inventario_id text,
    p_id_interno text,
    p_local text,
    p_saldo_fisico integer,
    p_usuario text,
    p_valor_unitario numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inventario public.inventarios%ROWTYPE;
    v_now timestamp without time zone := now();
    v_local text;
    v_id_interno text;
    v_has_null_origin boolean := false;
    v_q_sep integer := 0;
    v_saldo_sistema integer := 0;
    v_stock public.estoque_atual%ROWTYPE;
    v_item_id uuid;
    v_diferenca integer;
    v_valor_unitario numeric;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessao autenticada obrigatoria.'; END IF;
    IF nullif(btrim(coalesce(p_inventario_id, '')), '') IS NULL THEN RAISE EXCEPTION 'Inventario nao informado.'; END IF;
    IF nullif(btrim(coalesce(p_id_interno, '')), '') IS NULL THEN RAISE EXCEPTION 'Produto nao informado.'; END IF;
    IF p_saldo_fisico < 0 THEN RAISE EXCEPTION 'Saldo fisico nao pode ser negativo.'; END IF;

    v_id_interno := btrim(p_id_interno);

    -- Trava e valida inventario
    SELECT * INTO v_inventario
      FROM public.inventarios
     WHERE inventario_id = btrim(p_inventario_id)
     LIMIT 1 FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Inventario % nao encontrado.', p_inventario_id; END IF;
    IF upper(coalesce(v_inventario.status, '')) IN ('FECHADO', 'ANULADO') THEN
        RAISE EXCEPTION 'Inventario % encontra-se % e nao aceita novas contagens.', v_inventario.inventario_id, v_inventario.status;
    END IF;

    v_local := upper(btrim(coalesce(nullif(p_local, ''), v_inventario.local)));
    IF v_local = '' THEN RAISE EXCEPTION 'Local de estoque nao informado.'; END IF;

    -- 1. Validar se existe bipagem ativa sem local_origem (NULL) para este produto no exato instante da contagem
    SELECT EXISTS (
        SELECT 1
          FROM public.separacao_item_bipagens b
          JOIN public.separacao s ON s.separacao_id = b.separacao_id
         WHERE (b.id_interno = v_id_interno OR b.produto_id = (SELECT id FROM public.produtos WHERE id_interno = v_id_interno LIMIT 1))
           AND b.local_origem IS NULL
           AND s.status IN ('em_separacao', 'separado', 'em_conferencia')
    ) INTO v_has_null_origin;

    IF v_has_null_origin THEN
        RAISE EXCEPTION 'Existe material deste produto em separacao sem local de origem registrado (local_origem NULL). Resolva a separacao antes de confirmar a contagem.';
    END IF;

    -- 2. Calcular Q_sep do produto + local das separacoes ativas neste instante exato
    SELECT coalesce(SUM(b.quantidade), 0)
      INTO v_q_sep
      FROM public.separacao_item_bipagens b
      JOIN public.separacao s ON s.separacao_id = b.separacao_id
     WHERE (b.id_interno = v_id_interno OR b.produto_id = (SELECT id FROM public.produtos WHERE id_interno = v_id_interno LIMIT 1))
       AND upper(btrim(coalesce(b.local_origem, ''))) = v_local
       AND s.status IN ('em_separacao', 'separado', 'em_conferencia');

    -- 3. Obter saldo do sistema atual no local
    SELECT * INTO v_stock
      FROM public.estoque_atual
     WHERE id_interno = v_id_interno AND upper(btrim(local)) = v_local
     LIMIT 1;

    v_saldo_sistema := coalesce(v_stock.saldo_disponivel, 0);

    -- Definir valor unitario de custo
    IF p_valor_unitario IS NOT NULL AND p_valor_unitario > 0 THEN
        v_valor_unitario := p_valor_unitario;
    ELSE
        SELECT coalesce(preco_custo, valor_unitario, 0) INTO v_valor_unitario
          FROM public.produtos
         WHERE id_interno = v_id_interno LIMIT 1;
    END IF;

    v_diferenca := (p_saldo_fisico + v_q_sep) - v_saldo_sistema;

    -- 4. Gravar item do inventario com snapshot transacional usando timestamp do banco (v_now)
    SELECT id INTO v_item_id
      FROM public.inventarios_itens
     WHERE inventario_id = v_inventario.inventario_id
       AND id_interno = v_id_interno
       AND upper(btrim(local)) = v_local
     LIMIT 1 FOR UPDATE;

    IF v_item_id IS NOT NULL THEN
        UPDATE public.inventarios_itens
           SET saldo_sistema = v_saldo_sistema,
               saldo_fisico = p_saldo_fisico,
               q_sep_snapshot = v_q_sep,
               q_sep_snapshot_em = v_now,
               diferenca = v_diferenca,
               valor_unitario = coalesce(v_valor_unitario, valor_unitario, 0),
               valor_diferenca = v_diferenca * coalesce(v_valor_unitario, valor_unitario, 0),
               auditado_por = btrim(p_usuario),
               auditado_em = v_now,
               atualizado_em = v_now
         WHERE id = v_item_id;
    ELSE
        INSERT INTO public.inventarios_itens (
            inventario_id, id_interno, local, saldo_sistema, saldo_fisico,
            q_sep_snapshot, q_sep_snapshot_em, diferenca, valor_unitario,
            valor_diferenca, auditado_por, auditado_em, atualizado_em
        ) VALUES (
            v_inventario.inventario_id, v_id_interno, v_local, v_saldo_sistema, p_saldo_fisico,
            v_q_sep, v_now, v_diferenca, coalesce(v_valor_unitario, 0),
            v_diferenca * coalesce(v_valor_unitario, 0), btrim(p_usuario), v_now, v_now
        )
        RETURNING id INTO v_item_id;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'item_id', v_item_id,
        'inventario_id', v_inventario.inventario_id,
        'id_interno', v_id_interno,
        'local', v_local,
        'saldo_sistema', v_saldo_sistema,
        'saldo_fisico', p_saldo_fisico,
        'q_sep_snapshot', v_q_sep,
        'q_sep_snapshot_em', v_now,
        'saldo_reconciliado', p_saldo_fisico + v_q_sep,
        'diferenca', v_diferenca,
        'auditado_em', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_contagem_inventario_item(text, text, text, integer, text, numeric) TO authenticated, anon, service_role;

-- 3. RPC de Finalização do Inventário com base Exclusiva no Snapshot Congelado
CREATE OR REPLACE FUNCTION public.finalizar_inventario_estoque(
    p_inventario_id text,
    p_usuario text,
    p_execution_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inventario public.inventarios%ROWTYPE;
    v_item public.inventarios_itens%ROWTYPE;
    v_stock public.estoque_atual%ROWTYPE;
    v_local text;
    v_fisico integer;
    v_q_sep integer := 0;
    v_saldo_reconciliado integer;
    v_anterior integer;
    v_reservado integer;
    v_transito integer;
    v_diferenca integer;
    v_now timestamp without time zone := now();
    v_execution_id text := coalesce(nullif(btrim(p_execution_id), ''), 'inventario:' || btrim(p_inventario_id));
    v_total_skus integer := 0;
    v_total_itens integer := 0;
    v_total_contados integer := 0;
    v_total_divergencias integer := 0;
    v_valor_positivo numeric := 0;
    v_valor_negativo numeric := 0;
    v_has_post_mov boolean := false;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessao autenticada obrigatoria.'; END IF;
    IF nullif(btrim(coalesce(p_inventario_id, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Inventario nao informado.';
    END IF;
    IF nullif(btrim(coalesce(p_usuario, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Usuario nao informado.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('finalizar_inventario:' || btrim(p_inventario_id)));
    SELECT * INTO v_inventario
      FROM public.inventarios
     WHERE inventario_id = btrim(p_inventario_id)
     LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventario % nao encontrado.', p_inventario_id; END IF;
    IF upper(coalesce(v_inventario.status, '')) = 'FECHADO' THEN
        RETURN jsonb_build_object('ok', true, 'idempotente', true, 'inventario_id', v_inventario.inventario_id);
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.inventarios_itens
         WHERE inventario_id = v_inventario.inventario_id
         GROUP BY id_interno, upper(btrim(local))
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Inventario possui produto/local duplicado. Consolide os itens antes de finalizar.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inventarios_itens WHERE inventario_id = v_inventario.inventario_id) THEN
        RAISE EXCEPTION 'Inventario sem itens.';
    END IF;

    FOR v_item IN
        SELECT * FROM public.inventarios_itens
         WHERE inventario_id = v_inventario.inventario_id
         ORDER BY id_interno, local
    LOOP
        v_local := upper(btrim(coalesce(nullif(v_item.local, ''), v_inventario.local)));
        v_fisico := coalesce(v_item.saldo_fisico, 0);

        IF v_local = '' THEN RAISE EXCEPTION 'Local ausente no produto %.', v_item.id_interno; END IF;
        IF v_fisico < 0 THEN RAISE EXCEPTION 'Contagem fisica negativa no produto %.', v_item.id_interno; END IF;

        -- 1. Exigir Snapshot de Q_sep Válido (q_sep_snapshot_em nao pode ser NULL)
        IF v_item.q_sep_snapshot_em IS NULL THEN
            RAISE EXCEPTION 'O produto % no local % nao possui snapshot valido de separacao (contagem nao confirmada). Reconfirme a contagem antes de finalizar o inventario.', v_item.id_interno, v_local;
        END IF;

        -- 2. Detectar se houve movimentacao de estoque no produto/local apos o snapshot de contagem
        SELECT EXISTS (
            SELECT 1
              FROM public.movimentos m
             WHERE m.id_interno = v_item.id_interno
               AND (upper(btrim(coalesce(m.local_origem, ''))) = v_local OR upper(btrim(coalesce(m.local_destino, ''))) = v_local)
               AND m.data_hora > v_item.q_sep_snapshot_em
               AND coalesce(m.origem, '') <> 'ajuste_inventario'
        ) INTO v_has_post_mov;

        IF v_has_post_mov THEN
            RAISE EXCEPTION 'O produto % no local % sofreu movimentacao de estoque apos a contagem em %. Reconfirme a contagem antes de finalizar o inventario.',
                v_item.id_interno, v_local, to_char(v_item.q_sep_snapshot_em, 'DD/MM/YYYY HH24:MI:SS');
        END IF;

        -- 3. Utilizar EXCLUSIVAMENTE o Snapshot Congelado (Prateleira + Q_sep Snapshot)
        v_q_sep := coalesce(v_item.q_sep_snapshot, 0);
        v_saldo_reconciliado := v_fisico + v_q_sep;

        PERFORM pg_advisory_xact_lock(hashtext('estoque:' || v_item.id_interno || ':' || v_local));
        SELECT * INTO v_stock
          FROM public.estoque_atual
         WHERE id_interno = v_item.id_interno AND upper(btrim(local)) = v_local
         ORDER BY id LIMIT 1 FOR UPDATE;

        v_anterior := coalesce(v_stock.saldo_disponivel, 0);
        v_reservado := coalesce(v_stock.saldo_reservado, 0);
        v_transito := coalesce(v_stock.saldo_em_transito, 0);

        -- Diferenca de inventario calculada contra o saldo reconciliado do snapshot
        v_diferenca := v_saldo_reconciliado - v_anterior;

        IF FOUND THEN
            UPDATE public.estoque_atual
               SET local = v_local,
                   saldo_disponivel = v_saldo_reconciliado,
                   saldo_reservado = v_reservado,
                   saldo_em_transito = v_transito,
                   saldo_total = v_saldo_reconciliado + v_reservado + v_transito,
                   atualizado_em = v_now,
                   chave_estoque = coalesce(chave_estoque, v_item.id_interno || '|' || v_local)
             WHERE id = v_stock.id;
        ELSE
            INSERT INTO public.estoque_atual (
                id_interno, local, saldo_disponivel, saldo_reservado,
                saldo_em_transito, saldo_total, atualizado_em, chave_estoque
            ) VALUES (
                v_item.id_interno, v_local, v_saldo_reconciliado, 0, 0,
                v_saldo_reconciliado, v_now, v_item.id_interno || '|' || v_local
            );
        END IF;

        -- Atualizar item do inventario com informacoes reconciliadas finais
        UPDATE public.inventarios_itens
           SET saldo_sistema = v_anterior,
               diferenca = v_diferenca,
               valor_diferenca = v_diferenca * coalesce(valor_unitario, 0),
               auditado_por = coalesce(nullif(auditado_por, ''), btrim(p_usuario)),
               auditado_em = coalesce(auditado_em, v_now),
               atualizado_em = v_now
         WHERE id = v_item.id;

        -- Registrar movimento de ajuste somente se houver diferenca real
        IF v_diferenca <> 0 THEN
            INSERT INTO public.movimentos (
                movimento_id, data_hora, tipo, id_interno, local_origem,
                local_destino, quantidade, usuario, origem, observacao, execution_id, auth_user_id
            ) VALUES (
                'MOV-INV-' || v_execution_id || '-' || v_item.id::text,
                v_now,
                CASE WHEN v_diferenca > 0 THEN 'AJUSTE_POSITIVO' ELSE 'AJUSTE_NEGATIVO' END,
                v_item.id_interno,
                CASE WHEN v_diferenca > 0 THEN NULL ELSE v_local END,
                CASE WHEN v_diferenca > 0 THEN v_local ELSE NULL END,
                abs(v_diferenca),
                btrim(p_usuario),
                'ajuste_inventario',
                'Inventario ' || v_inventario.inventario_id || ' (' || v_inventario.tipo || ') [Prateleira: ' || v_fisico || ', Q_sep Snapshot: ' || v_q_sep || ', Reconciliado: ' || v_saldo_reconciliado || ']',
                v_execution_id,
                auth.uid()
            ) ON CONFLICT (movimento_id) DO NOTHING;
        END IF;

        v_total_skus := v_total_skus + 1;
        v_total_itens := v_total_itens + v_saldo_reconciliado;
        v_total_contados := v_total_contados + v_fisico;
        IF v_diferenca <> 0 THEN
            v_total_divergencias := v_total_divergencias + 1;
            IF v_diferenca > 0 THEN
                v_valor_positivo := v_valor_positivo + (v_diferenca * coalesce(v_item.valor_unitario, 0));
            ELSE
                v_valor_negativo := v_valor_negativo + (abs(v_diferenca) * coalesce(v_item.valor_unitario, 0));
            END IF;
        END IF;
    END LOOP;

    UPDATE public.inventarios
       SET status = 'FECHADO',
           data_fim = v_now,
           atualizado_em = v_now,
           usuario_responsavel = coalesce(nullif(usuario_responsavel, ''), btrim(p_usuario)),
           total_skus = v_total_skus,
           total_itens = v_total_itens,
           total_itens_contados = v_total_contados,
           total_divergencias = v_total_divergencias,
           valor_ajuste_positivo = v_valor_positivo,
           valor_ajuste_negativo = v_valor_negativo
     WHERE id = v_inventario.id;

    RETURN jsonb_build_object(
        'ok', true,
        'inventario_id', v_inventario.inventario_id,
        'total_skus', v_total_skus,
        'total_itens', v_total_itens,
        'total_divergencias', v_total_divergencias,
        'valor_ajuste_positivo', v_valor_positivo,
        'valor_ajuste_negativo', v_valor_negativo
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalizar_inventario_estoque(text, text, text) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.salvar_contagem_inventario_item(text, text, text, integer, text, numeric)
IS 'Salva a contagem fisica de um item de inventario e congela atomicamente o snapshot de Q_sep no mesmo instante.';

COMMENT ON FUNCTION public.finalizar_inventario_estoque(text, text, text)
IS 'Finaliza o inventario com base no snapshot congelado de Q_sep, validando movimentacoes de estoque posteriores.';

COMMIT;
