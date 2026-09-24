-- Migration: 20260923191000_finalizar_conferencia_local_origem_real_rpc.sql
-- FASE 2A.1 (ISOLADA PROMOÇÃO): Finalização de Conferência com Baixa de Estoque por local_origem Real
-- Contém EXCLUSIVAMENTE a RPC public.finalizar_conferencia_com_estoque
-- Isola e exclui qualquer alteração nas funções/triggers de cancelamento.

BEGIN;

CREATE OR REPLACE FUNCTION public.finalizar_conferencia_com_estoque(
    p_session_id text,
    p_usuario text,
    p_rows jsonb,
    p_execution_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_execution_id text;
    v_conferencia_id text;
    v_existing_conferencia_id text;
    v_has_separacao boolean := false;
    v_sep_items_count integer := 0;
    v_total_itens integer := 0;
    v_total_quantidade integer := 0;
    v_total_movimentos integer := 0;
    v_mov_seq integer := 0;
    v_now timestamp without time zone := now();
    v_bip record;
    v_stock record;
    v_has_null_local boolean := false;
    v_has_bipagens boolean := false;
    v_bip_total integer := 0;
    v_conf_total integer := 0;
    v_new_disponivel integer;
    v_new_total integer;
    v_divergencia_autorizada boolean := false;
    v_motivo_divergencia text;
    v_resumo_divergencia jsonb;
    v_has_alias_conflict boolean := false;
BEGIN
    -- Validar autenticação e usuário
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessao autenticada obrigatoria.'; END IF;

    IF EXISTS (
        SELECT 1
          FROM public.separacao s
         WHERE s.separacao_id = p_session_id
           AND nullif(btrim(coalesce(s.criado_por, '')), '') IS NOT NULL
           AND lower(regexp_replace(btrim(s.criado_por), '\s+', ' ', 'g'))
               = lower(regexp_replace(btrim(coalesce(p_usuario, '')), '\s+', ' ', 'g'))
    ) THEN
        RAISE EXCEPTION 'A conferencia deve ser realizada por outro usuario. Quem separou nao pode conferir.';
    END IF;

    v_divergencia_autorizada := COALESCE((p_rows->0->>'divergencia_autorizada')::boolean, false);
    v_motivo_divergencia := NULLIF(btrim(COALESCE(p_rows->0->>'motivo_divergencia', '')), '');

    IF NULLIF(btrim(p_session_id), '') IS NULL THEN
        RAISE EXCEPTION 'Separacao nao informada.';
    END IF;

    IF NULLIF(btrim(p_usuario), '') IS NULL THEN
        RAISE EXCEPTION 'Usuario da conferencia nao informado.';
    END IF;

    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
        RAISE EXCEPTION 'Nenhum item informado para finalizar a conferencia.';
    END IF;

    v_execution_id := COALESCE(NULLIF(btrim(p_execution_id), ''), gen_random_uuid()::text);
    v_conferencia_id := 'CONF-' || v_execution_id;

    -- Trava transacional idempotente por sessão
    PERFORM pg_advisory_xact_lock(hashtext('finalizar_conferencia:' || p_session_id));

    SELECT c.conferencia_id
      INTO v_existing_conferencia_id
      FROM public.conferencia c
     WHERE c.conferencia_id = v_conferencia_id
        OR (c.separacao_id = p_session_id AND c.status IN ('conferido', 'finalizada'))
     ORDER BY c.conferido_em DESC NULLS LAST, c.atualizado_em DESC NULLS LAST
     LIMIT 1;

    IF v_existing_conferencia_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'ok', true,
            'status', 'already_processed',
            'conferencia_id', v_existing_conferencia_id,
            'separacao_id', p_session_id,
            'execution_id', v_execution_id
        );
    END IF;

    PERFORM 1
       FROM public.separacao s
      WHERE s.separacao_id = p_session_id
      FOR UPDATE;
    v_has_separacao := FOUND;

    -- Tabela temporária de itens conferidos no payload
    DROP TABLE IF EXISTS pg_temp._finalizar_conferencia_rows;
    CREATE TEMP TABLE _finalizar_conferencia_rows (
        id_interno text NOT NULL,
        ean text,
        descricao text,
        qtd_separada integer NOT NULL,
        qtd_conferida integer NOT NULL,
        divergencia text
    ) ON COMMIT DROP;

    INSERT INTO _finalizar_conferencia_rows (
        id_interno, ean, descricao, qtd_separada, qtd_conferida, divergencia
    )
    SELECT
        btrim(r.id_interno),
        NULLIF(btrim(COALESCE(r.ean, '')), ''),
        NULLIF(btrim(COALESCE(r.descricao, '')), ''),
        COALESCE(r.qtd_separada, 0)::integer,
        COALESCE(r.qtd_conferida, 0)::integer,
        NULLIF(btrim(COALESCE(r.divergencia, '')), '')
      FROM jsonb_to_recordset(p_rows) AS r(
        id_interno text,
        ean text,
        descricao text,
        qtd_separada numeric,
        qtd_conferida numeric,
        divergencia text
      )
     WHERE NULLIF(btrim(COALESCE(r.id_interno, '')), '') IS NOT NULL;

    SELECT COUNT(*), COALESCE(SUM(qtd_conferida), 0)
      INTO v_total_itens, v_total_quantidade
      FROM _finalizar_conferencia_rows;

    IF v_total_itens = 0 THEN
        RAISE EXCEPTION 'Nenhum item valido informado para finalizar a conferencia.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM _finalizar_conferencia_rows WHERE qtd_separada < 0 OR qtd_conferida < 0
    ) THEN
        RAISE EXCEPTION 'A conferencia possui quantidade negativa.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM _finalizar_conferencia_rows WHERE qtd_separada <> qtd_conferida
    ) AND NOT v_divergencia_autorizada THEN
        RAISE EXCEPTION 'A conferencia possui divergencias. Corrija ou autorize o ajuste antes de finalizar.';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id_interno', id_interno, 'ean', ean, 'descricao', descricao,
        'qtd_separada', qtd_separada, 'qtd_conferida', qtd_conferida,
        'diferenca', qtd_conferida - qtd_separada
    )), '[]'::jsonb)
      INTO v_resumo_divergencia
      FROM _finalizar_conferencia_rows
     WHERE qtd_separada <> qtd_conferida;

    -- Validar existência de bipagens físicas salvas para a separação
    SELECT EXISTS (
        SELECT 1 FROM public.separacao_item_bipagens WHERE separacao_id = p_session_id
    ) INTO v_has_bipagens;

    IF NOT v_has_bipagens THEN
        RAISE EXCEPTION 'Nao existem bipagens fisicas salvas com local de origem para a separacao %. Impossivel determinar local_origem real para baixa de estoque.', p_session_id;
    END IF;

    -- Validar se existe bipagem com local_origem NULL (bloqueio de segurança)
    SELECT EXISTS (
        SELECT 1 FROM public.separacao_item_bipagens
         WHERE separacao_id = p_session_id
           AND nullif(btrim(coalesce(local_origem, '')), '') IS NULL
    ) INTO v_has_null_local;

    IF v_has_null_local THEN
        RAISE EXCEPTION 'Existe bipagem nesta separacao sem local de origem registrado (local_origem NULL). Resolva a separacao antes de finalizar a conferencia.';
    END IF;

    -- Tabela temporária de bipagens agrupadas por SKU FÍSICO REAL e LOCAL DE ORIGEM FÍSICO REAL
    DROP TABLE IF EXISTS pg_temp._conferencia_bipagens_agrupadas;
    CREATE TEMP TABLE _conferencia_bipagens_agrupadas (
        id_interno text NOT NULL,
        local_origem text NOT NULL,
        quantidade integer NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO _conferencia_bipagens_agrupadas (id_interno, local_origem, quantidade)
    SELECT btrim(id_interno), upper(btrim(local_origem)), SUM(quantidade)::integer
      FROM public.separacao_item_bipagens
     WHERE separacao_id = p_session_id
     GROUP BY btrim(id_interno), upper(btrim(local_origem));

    -- Validar se a quantidade total conferida bate com o total de bipagens físicas salvas
    SELECT COALESCE(SUM(quantidade), 0) INTO v_bip_total FROM _conferencia_bipagens_agrupadas;
    SELECT COALESCE(SUM(qtd_conferida), 0) INTO v_conf_total FROM _finalizar_conferencia_rows;

    IF v_conf_total <> v_bip_total AND NOT v_divergencia_autorizada THEN
        RAISE EXCEPTION 'A quantidade conferida (%) nao bate com o total de unidades bipadas na separacao (%).', v_conf_total, v_bip_total;
    END IF;

    -- Gravar registros de conferência e conferência itens
    INSERT INTO public.conferencia (
        conferencia_id, separacao_id, status, conferido_por, conferido_em, atualizado_em,
        divergencia_autorizada, motivo_divergencia, resumo_divergencia
    ) VALUES (
        v_conferencia_id, p_session_id, 'conferido', p_usuario, v_now, v_now,
        v_divergencia_autorizada, v_motivo_divergencia, v_resumo_divergencia
    );

    INSERT INTO public.conferencia_itens (
        conferencia_id, separacao_id, id_interno, ean, descricao,
        qtd_separada, qtd_conferida, divergencia
    )
    SELECT
        v_conferencia_id, p_session_id, id_interno, ean, descricao,
        qtd_separada, qtd_conferida,
        CASE
            WHEN qtd_conferida > qtd_separada THEN 'SOBRA'
            WHEN qtd_conferida < qtd_separada THEN 'FALTA'
            ELSE NULL
        END
      FROM _finalizar_conferencia_rows;

    -- REALIZAR A BAIXA DE ESTOQUE BASEADA RIGOROSAMENTE EM (id_interno + local_origem) DAS BIPAGENS FÍSICAS
    FOR v_bip IN
        SELECT id_interno, local_origem, quantidade
          FROM _conferencia_bipagens_agrupadas
         WHERE quantidade > 0
         ORDER BY id_interno, local_origem
    LOOP
        -- Checagem de conflito de alias entre PRIMEIRO_ANDAR e 1ANDAR
        IF v_bip.local_origem = 'PRIMEIRO_ANDAR' THEN
            SELECT EXISTS (
                SELECT 1 FROM public.estoque_atual
                 WHERE id_interno = v_bip.id_interno AND local = '1ANDAR'
                   AND NOT EXISTS (SELECT 1 FROM public.estoque_atual WHERE id_interno = v_bip.id_interno AND local = 'PRIMEIRO_ANDAR')
            ) INTO v_has_alias_conflict;
            IF v_has_alias_conflict THEN
                RAISE EXCEPTION 'Conflito de alias de local no produto %: bipagem registra "PRIMEIRO_ANDAR", porem estoque_atual possui saldo apenas em "1ANDAR". Corrija o cadastro de local antes de finalizar.', v_bip.id_interno;
            END IF;
        ELSIF v_bip.local_origem = '1ANDAR' THEN
            SELECT EXISTS (
                SELECT 1 FROM public.estoque_atual
                 WHERE id_interno = v_bip.id_interno AND local = 'PRIMEIRO_ANDAR'
                   AND NOT EXISTS (SELECT 1 FROM public.estoque_atual WHERE id_interno = v_bip.id_interno AND local = '1ANDAR')
            ) INTO v_has_alias_conflict;
            IF v_has_alias_conflict THEN
                RAISE EXCEPTION 'Conflito de alias de local no produto %: bipagem registra "1ANDAR", porem estoque_atual possui saldo apenas em "PRIMEIRO_ANDAR". Corrija o cadastro de local antes de finalizar.', v_bip.id_interno;
            END IF;
        END IF;

        -- Trava linha do estoque exatamente no id_interno e local_origem especificados
        SELECT * INTO v_stock
          FROM public.estoque_atual ea
         WHERE ea.id_interno = v_bip.id_interno
           AND upper(btrim(ea.local)) = v_bip.local_origem
         ORDER BY ea.id
         LIMIT 1
         FOR UPDATE;

        IF NOT FOUND OR COALESCE(v_stock.saldo_disponivel, 0) < v_bip.quantidade THEN
            RAISE EXCEPTION 'Estoque insuficiente para o produto % no local %. Disponivel: %, Necessario: %.',
                v_bip.id_interno, v_bip.local_origem, COALESCE(v_stock.saldo_disponivel, 0), v_bip.quantidade;
        END IF;

        -- Baixa atômica do estoque_atual no local_origem exato
        v_new_disponivel := COALESCE(v_stock.saldo_disponivel, 0) - v_bip.quantidade;
        v_new_total := v_new_disponivel
            + COALESCE(v_stock.saldo_reservado, 0)
            + COALESCE(v_stock.saldo_em_transito, 0);

        UPDATE public.estoque_atual
           SET saldo_disponivel = v_new_disponivel,
               saldo_total = v_new_total,
               atualizado_em = v_now
         WHERE id = v_stock.id;

        v_mov_seq := v_mov_seq + 1;

        -- Registrar movimento com local_origem físico exato
        INSERT INTO public.movimentos (
            movimento_id,
            data_hora,
            tipo,
            id_interno,
            local_origem,
            local_destino,
            quantidade,
            usuario,
            origem,
            observacao
        ) VALUES (
            'MOV-' || v_execution_id || '-' || v_mov_seq::text,
            v_now,
            'SAIDA',
            v_bip.id_interno,
            v_bip.local_origem,
            NULL,
            v_bip.quantidade,
            p_usuario,
            'APP_CONFERENCIA',
            'Baixa automatica da conferencia ' || p_session_id || ' [Local: ' || v_bip.local_origem || ']'
        );

        v_total_movimentos := v_total_movimentos + 1;
    END LOOP;

    IF v_has_separacao THEN
        UPDATE public.separacao
           SET status = 'finalizada',
               atualizado_em = v_now,
               finalizado_em = v_now
         WHERE separacao_id = p_session_id;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'status', 'finalized',
        'conferencia_id', v_conferencia_id,
        'separacao_id', p_session_id,
        'execution_id', v_execution_id,
        'separacao_atualizada', v_has_separacao,
        'itens', v_total_itens,
        'quantidade_total', v_total_quantidade,
        'movimentos', v_total_movimentos,
        'divergencia_autorizada', v_divergencia_autorizada,
        'motivo_divergencia', v_motivo_divergencia,
        'resumo_divergencia', v_resumo_divergencia
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalizar_conferencia_com_estoque(text, text, jsonb, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.finalizar_conferencia_com_estoque(text, text, jsonb, text)
IS 'Finaliza a conferencia e realiza a baixa em estoque_atual com base rigorosa nas bipagens relacionais (id_interno e local_origem).';

COMMIT;
