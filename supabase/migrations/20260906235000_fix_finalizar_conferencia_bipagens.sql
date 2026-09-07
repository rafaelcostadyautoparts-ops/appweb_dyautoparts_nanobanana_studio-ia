-- Migration: FASE 4 - Suporte a separacao_item_bipagens em finalizar_conferencia_com_estoque
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
    v_item record;
    v_stock record;
    v_local text;
    v_needed integer;
    v_take integer;
    v_new_disponivel integer;
    v_new_total integer;
    v_allowed_locals text[] := ARRAY['TERREO', 'MOSTRUARIO'];
    v_divergencia_autorizada boolean := false;
    v_motivo_divergencia text;
    v_resumo_divergencia jsonb;
BEGIN
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
        id_interno,
        ean,
        descricao,
        qtd_separada,
        qtd_conferida,
        divergencia
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
        SELECT 1
          FROM _finalizar_conferencia_rows
         WHERE qtd_separada < 0 OR qtd_conferida < 0
    ) THEN
        RAISE EXCEPTION 'A conferencia possui quantidade negativa.';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM _finalizar_conferencia_rows
         WHERE qtd_separada <> qtd_conferida
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

    SELECT COUNT(*)
      INTO v_sep_items_count
      FROM public.separacao_itens si
     WHERE si.separacao_id = p_session_id;

    IF v_sep_items_count > 0 AND NOT v_divergencia_autorizada THEN
        -- Se a separacao possui bipagens fisicas salvas em separacao_item_bipagens, valida contra elas
        IF EXISTS (SELECT 1 FROM public.separacao_item_bipagens WHERE separacao_id = p_session_id) THEN
            IF EXISTS (
                SELECT 1
                  FROM (
                        SELECT id_interno, SUM(qtd_conferida) AS qtd
                          FROM _finalizar_conferencia_rows
                         GROUP BY id_interno
                  ) cr
                  LEFT JOIN (
                        SELECT id_interno, SUM(quantidade) AS qtd
                          FROM public.separacao_item_bipagens
                         WHERE separacao_id = p_session_id
                         GROUP BY id_interno
                  ) sib ON sib.id_interno = cr.id_interno
                 WHERE sib.id_interno IS NULL
                    OR cr.qtd > sib.qtd
            ) THEN
                RAISE EXCEPTION 'Itens conferidos nao batem com a separacao fisica salva.';
            END IF;
        ELSE
            IF EXISTS (
                SELECT 1
                  FROM (
                        SELECT id_interno, SUM(qtd_conferida) AS qtd
                          FROM _finalizar_conferencia_rows
                         GROUP BY id_interno
                  ) cr
                  LEFT JOIN (
                        SELECT id_interno, SUM(COALESCE(qtd_separada, qtd_solicitada, 0)) AS qtd
                          FROM public.separacao_itens
                         WHERE separacao_id = p_session_id
                         GROUP BY id_interno
                  ) si ON si.id_interno = cr.id_interno
                 WHERE si.id_interno IS NULL
                    OR cr.qtd > si.qtd
            ) THEN
                RAISE EXCEPTION 'Itens conferidos nao batem com a separacao salva.';
            END IF;
        END IF;
    END IF;

    INSERT INTO public.conferencia (
        conferencia_id,
        separacao_id,
        status,
        conferido_por,
        conferido_em,
        atualizado_em,
        divergencia_autorizada,
        motivo_divergencia,
        resumo_divergencia
    ) VALUES (
        v_conferencia_id,
        p_session_id,
        'conferido',
        p_usuario,
        v_now,
        v_now,
        v_divergencia_autorizada,
        v_motivo_divergencia,
        v_resumo_divergencia
    );

    INSERT INTO public.conferencia_itens (
        conferencia_id,
        separacao_id,
        id_interno,
        ean,
        descricao,
        qtd_separada,
        qtd_conferida,
        divergencia
    )
    SELECT
        v_conferencia_id,
        p_session_id,
        id_interno,
        ean,
        descricao,
        qtd_separada,
        qtd_conferida,
        CASE
            WHEN qtd_conferida > qtd_separada THEN 'SOBRA'
            WHEN qtd_conferida < qtd_separada THEN 'FALTA'
            ELSE NULL
        END
      FROM _finalizar_conferencia_rows;

    FOR v_item IN
        SELECT id_interno, SUM(qtd_conferida)::integer AS quantidade
          FROM _finalizar_conferencia_rows
         WHERE qtd_conferida > 0
         GROUP BY id_interno
         ORDER BY id_interno
    LOOP
        v_needed := v_item.quantidade;

        FOREACH v_local IN ARRAY v_allowed_locals
        LOOP
            EXIT WHEN v_needed <= 0;

            FOR v_stock IN
                SELECT *
                  FROM public.estoque_atual ea
                 WHERE ea.id_interno = v_item.id_interno
                   AND ea.local = v_local
                 ORDER BY ea.id
                 FOR UPDATE
            LOOP
                EXIT WHEN v_needed <= 0;

                IF COALESCE(v_stock.saldo_disponivel, 0) <= 0 THEN
                    CONTINUE;
                END IF;

                v_take := LEAST(COALESCE(v_stock.saldo_disponivel, 0), v_needed);
                v_new_disponivel := COALESCE(v_stock.saldo_disponivel, 0) - v_take;
                v_new_total := v_new_disponivel
                    + COALESCE(v_stock.saldo_reservado, 0)
                    + COALESCE(v_stock.saldo_em_transito, 0);

                UPDATE public.estoque_atual
                   SET saldo_disponivel = v_new_disponivel,
                       saldo_total = v_new_total,
                       atualizado_em = v_now
                 WHERE id = v_stock.id;

                v_mov_seq := v_mov_seq + 1;

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
                    v_item.id_interno,
                    v_local,
                    NULL,
                    v_take,
                    p_usuario,
                    'APP_CONFERENCIA',
                    'Baixa automatica da conferencia ' || p_session_id
                );

                v_total_movimentos := v_total_movimentos + 1;
                v_needed := v_needed - v_take;
            END LOOP;
        END LOOP;

        IF v_needed > 0 THEN
            RAISE EXCEPTION 'Estoque insuficiente para o produto %. Faltam % unidade(s) nos locais TERREO/MOSTRUARIO.',
                v_item.id_interno,
                v_needed;
        END IF;
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
