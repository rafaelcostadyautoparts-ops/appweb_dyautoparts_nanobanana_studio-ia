CREATE OR REPLACE FUNCTION public.transferir_estoque(
    p_origem text,
    p_destino text,
    p_usuario text,
    p_items jsonb,
    p_execution_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_execution_id text;
    v_origem text;
    v_destino text;
    v_now timestamp without time zone := now();
    v_item record;
    v_stock record;
    v_destino_row public.estoque_atual%ROWTYPE;
    v_needed integer;
    v_take integer;
    v_new_disponivel integer;
    v_new_total integer;
    v_mov_seq integer := 0;
    v_total_itens integer := 0;
    v_total_quantidade integer := 0;
BEGIN
    v_origem := upper(btrim(coalesce(p_origem, '')));
    v_destino := upper(btrim(coalesce(p_destino, '')));
    v_execution_id := coalesce(nullif(btrim(p_execution_id), ''), gen_random_uuid()::text);

    IF v_origem = '' OR v_destino = '' THEN
        RAISE EXCEPTION 'Origem e destino sao obrigatorios.';
    END IF;

    IF v_origem = v_destino THEN
        RAISE EXCEPTION 'Origem e destino devem ser diferentes.';
    END IF;

    IF nullif(btrim(coalesce(p_usuario, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Usuario da transferencia nao informado.';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Nenhum item informado para transferencia.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('transferir_estoque:' || v_origem || ':' || v_destino));

    DROP TABLE IF EXISTS pg_temp._transferir_estoque_items;
    CREATE TEMP TABLE _transferir_estoque_items (
        id_interno text NOT NULL,
        quantidade integer NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO _transferir_estoque_items (id_interno, quantidade)
    SELECT
        btrim(r.id_interno),
        sum(coalesce(r.quantidade, 0))::integer
    FROM jsonb_to_recordset(p_items) AS r(
        id_interno text,
        quantidade numeric
    )
    WHERE nullif(btrim(coalesce(r.id_interno, '')), '') IS NOT NULL
    GROUP BY btrim(r.id_interno);

    IF EXISTS (SELECT 1 FROM _transferir_estoque_items WHERE quantidade <= 0) THEN
        RAISE EXCEPTION 'A transferencia possui quantidade invalida.';
    END IF;

    SELECT count(*), coalesce(sum(quantidade), 0)
      INTO v_total_itens, v_total_quantidade
      FROM _transferir_estoque_items;

    IF v_total_itens = 0 THEN
        RAISE EXCEPTION 'Nenhum item valido informado para transferencia.';
    END IF;

    FOR v_item IN
        SELECT id_interno, quantidade
          FROM _transferir_estoque_items
         ORDER BY id_interno
    LOOP
        v_needed := v_item.quantidade;

        FOR v_stock IN
            SELECT *
              FROM public.estoque_atual ea
             WHERE ea.id_interno = v_item.id_interno
               AND ea.local = v_origem
             ORDER BY ea.id
             FOR UPDATE
        LOOP
            EXIT WHEN v_needed <= 0;

            IF coalesce(v_stock.saldo_disponivel, 0) <= 0 THEN
                CONTINUE;
            END IF;

            v_take := least(coalesce(v_stock.saldo_disponivel, 0), v_needed);
            v_new_disponivel := coalesce(v_stock.saldo_disponivel, 0) - v_take;
            v_new_total := v_new_disponivel
                + coalesce(v_stock.saldo_reservado, 0)
                + coalesce(v_stock.saldo_em_transito, 0);

            UPDATE public.estoque_atual
               SET saldo_disponivel = v_new_disponivel,
                   saldo_total = v_new_total,
                   atualizado_em = v_now
             WHERE id = v_stock.id;

            v_needed := v_needed - v_take;
        END LOOP;

        IF v_needed > 0 THEN
            RAISE EXCEPTION 'Estoque insuficiente no local % para o produto %. Faltam % unidade(s).',
                v_origem,
                v_item.id_interno,
                v_needed;
        END IF;

        SELECT *
          INTO v_destino_row
          FROM public.estoque_atual ea
         WHERE ea.id_interno = v_item.id_interno
           AND ea.local = v_destino
         ORDER BY ea.id
         LIMIT 1
         FOR UPDATE;

        IF FOUND THEN
            v_new_disponivel := coalesce(v_destino_row.saldo_disponivel, 0) + v_item.quantidade;
            v_new_total := v_new_disponivel
                + coalesce(v_destino_row.saldo_reservado, 0)
                + coalesce(v_destino_row.saldo_em_transito, 0);

            UPDATE public.estoque_atual
               SET saldo_disponivel = v_new_disponivel,
                   saldo_total = v_new_total,
                   atualizado_em = v_now
             WHERE id = v_destino_row.id;
        ELSE
            INSERT INTO public.estoque_atual (
                id_interno,
                local,
                saldo_disponivel,
                saldo_reservado,
                saldo_em_transito,
                saldo_total,
                atualizado_em,
                chave_estoque
            ) VALUES (
                v_item.id_interno,
                v_destino,
                v_item.quantidade,
                0,
                0,
                v_item.quantidade,
                v_now,
                v_item.id_interno || '|' || v_destino
            );
        END IF;

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
            'MOV-TRANSF-' || v_execution_id || '-' || v_mov_seq::text,
            v_now,
            'TRANSFERENCIA',
            v_item.id_interno,
            v_origem,
            v_destino,
            v_item.quantidade,
            p_usuario,
            'APP_TRANSFERENCIA',
            'Transferencia manual via RPC'
        );
    END LOOP;

    RETURN jsonb_build_object(
        'ok', true,
        'status', 'transferred',
        'execution_id', v_execution_id,
        'origem', v_origem,
        'destino', v_destino,
        'itens', v_total_itens,
        'quantidade_total', v_total_quantidade,
        'movimentos', v_mov_seq
    );
END;
$$;

COMMENT ON FUNCTION public.transferir_estoque(text, text, text, jsonb, text)
IS 'Transfere estoque entre locais de forma transacional, atualizando estoque_atual e registrando movimentos em uma unica operacao.';

GRANT EXECUTE ON FUNCTION public.transferir_estoque(text, text, text, jsonb, text) TO anon;
GRANT EXECUTE ON FUNCTION public.transferir_estoque(text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transferir_estoque(text, text, text, jsonb, text) TO service_role;
