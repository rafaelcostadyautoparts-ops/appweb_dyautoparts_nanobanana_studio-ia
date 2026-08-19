CREATE OR REPLACE FUNCTION public.registrar_ajuste_estoque(
    p_id_interno text,
    p_local text,
    p_tipo_ajuste text,
    p_quantidade numeric,
    p_usuario text,
    p_observacao text DEFAULT '',
    p_permitir_negativo boolean DEFAULT false,
    p_execution_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id_interno text;
    v_local text;
    v_tipo_ajuste text;
    v_quantidade integer;
    v_execution_id text;
    v_now timestamp without time zone := now();
    v_stock public.estoque_atual%ROWTYPE;
    v_saldo_atual integer := 0;
    v_saldo_reservado integer := 0;
    v_saldo_transito integer := 0;
    v_novo_saldo integer := 0;
    v_diferenca integer := 0;
    v_tipo_movimento text;
    v_movimento_id text;
BEGIN
    v_id_interno := btrim(coalesce(p_id_interno, ''));
    v_local := upper(btrim(coalesce(p_local, '')));
    v_tipo_ajuste := lower(btrim(coalesce(p_tipo_ajuste, 'definir')));
    v_quantidade := round(coalesce(p_quantidade, 0))::integer;
    v_execution_id := coalesce(nullif(btrim(p_execution_id), ''), gen_random_uuid()::text);

    IF v_id_interno = '' THEN
        RAISE EXCEPTION 'Produto nao informado para ajuste.';
    END IF;

    IF v_local = '' THEN
        RAISE EXCEPTION 'Local de estoque nao informado para ajuste.';
    END IF;

    IF v_quantidade < 0 THEN
        RAISE EXCEPTION 'Quantidade invalida para ajuste.';
    END IF;

    IF v_tipo_ajuste NOT IN ('definir', 'somar', 'subtrair') THEN
        RAISE EXCEPTION 'Tipo de ajuste invalido: %.', v_tipo_ajuste;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('registrar_ajuste_estoque:' || v_id_interno || ':' || v_local));

    SELECT *
      INTO v_stock
      FROM public.estoque_atual ea
     WHERE ea.id_interno = v_id_interno
       AND ea.local = v_local
     ORDER BY ea.id
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
        v_saldo_atual := coalesce(v_stock.saldo_disponivel, 0);
        v_saldo_reservado := coalesce(v_stock.saldo_reservado, 0);
        v_saldo_transito := coalesce(v_stock.saldo_em_transito, 0);
    END IF;

    IF v_tipo_ajuste = 'definir' THEN
        v_novo_saldo := v_quantidade;
        v_diferenca := v_quantidade - v_saldo_atual;
    ELSIF v_tipo_ajuste = 'somar' THEN
        v_novo_saldo := v_saldo_atual + v_quantidade;
        v_diferenca := v_quantidade;
    ELSE
        v_novo_saldo := v_saldo_atual - v_quantidade;
        v_diferenca := -v_quantidade;
    END IF;

    IF v_novo_saldo < 0 AND coalesce(p_permitir_negativo, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Estoque ficaria negativo para o produto % no local %.', v_id_interno, v_local;
    END IF;

    IF v_diferenca = 0 THEN
        RAISE EXCEPTION 'Saldo informado ja e igual ao saldo atual. Nenhum ajuste foi gravado.';
    END IF;

    IF FOUND THEN
        UPDATE public.estoque_atual
           SET saldo_disponivel = v_novo_saldo,
               saldo_reservado = v_saldo_reservado,
               saldo_em_transito = v_saldo_transito,
               saldo_total = v_novo_saldo + v_saldo_reservado + v_saldo_transito,
               atualizado_em = v_now,
               chave_estoque = coalesce(chave_estoque, v_id_interno || '|' || v_local)
         WHERE id = v_stock.id;
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
            v_id_interno,
            v_local,
            v_novo_saldo,
            0,
            0,
            v_novo_saldo,
            v_now,
            v_id_interno || '|' || v_local
        );
    END IF;

    v_tipo_movimento := CASE WHEN v_diferenca >= 0 THEN 'AJUSTE_POSITIVO' ELSE 'AJUSTE_NEGATIVO' END;
    v_movimento_id := 'MOV-AJUSTE-' || v_execution_id;

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
        v_movimento_id,
        v_now,
        v_tipo_movimento,
        v_id_interno,
        v_local,
        '',
        abs(v_diferenca),
        coalesce(nullif(btrim(p_usuario), ''), 'N/A'),
        'MANUAL',
        coalesce(p_observacao, '')
    );

    RETURN jsonb_build_object(
        'ok', true,
        'movimento_id', v_movimento_id,
        'data_hora', v_now,
        'tipo', v_tipo_movimento,
        'id_interno', v_id_interno,
        'local', v_local,
        'saldo_anterior', v_saldo_atual,
        'novo_saldo', v_novo_saldo,
        'diferenca', v_diferenca,
        'quantidade_movimento', abs(v_diferenca)
    );
END;
$$;

COMMENT ON FUNCTION public.registrar_ajuste_estoque(text, text, text, numeric, text, text, boolean, text)
IS 'Registra ajuste manual de estoque de forma transacional, atualizando estoque_atual e criando movimento na mesma operacao.';

GRANT EXECUTE ON FUNCTION public.registrar_ajuste_estoque(text, text, text, numeric, text, text, boolean, text) TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_ajuste_estoque(text, text, text, numeric, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_ajuste_estoque(text, text, text, numeric, text, text, boolean, text) TO service_role;