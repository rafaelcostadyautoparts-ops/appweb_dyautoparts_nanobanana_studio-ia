ALTER TABLE public.garantias
ADD COLUMN IF NOT EXISTS local_atual text,
ADD COLUMN IF NOT EXISTS local_retorno text,
ADD COLUMN IF NOT EXISTS data_retorno timestamp without time zone,
ADD COLUMN IF NOT EXISTS resultado text,
ADD COLUMN IF NOT EXISTS laudo text,
ADD COLUMN IF NOT EXISTS fornecedor_id uuid,
ADD COLUMN IF NOT EXISTS fornecedor_cnpj text,
ADD COLUMN IF NOT EXISTS origem_referencia text,
ADD COLUMN IF NOT EXISTS movimento_envio_id text,
ADD COLUMN IF NOT EXISTS movimento_retorno_id text,
ADD COLUMN IF NOT EXISTS encerrado_em timestamp without time zone,
ADD COLUMN IF NOT EXISTS encerrado_por text;

CREATE INDEX IF NOT EXISTS idx_garantias_movimento_envio
ON public.garantias (movimento_envio_id);

CREATE INDEX IF NOT EXISTS idx_garantias_local_atual
ON public.garantias (local_atual);

CREATE OR REPLACE FUNCTION public.enviar_garantia(
    p_id_interno text,
    p_descricao_produto text,
    p_fornecedor text,
    p_tipo_operacao text,
    p_motivo text,
    p_observacao text,
    p_origem_estoque text,
    p_quantidade numeric,
    p_custo_unitario numeric DEFAULT 0,
    p_custo_total numeric DEFAULT 0,
    p_usuario text DEFAULT NULL,
    p_execution_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_execution_id text;
    v_garantia_id text;
    v_movimento_id text;
    v_now timestamp without time zone := now();
    v_id_interno text;
    v_origem text;
    v_destino text := 'EM_GARANTIA';
    v_quantidade integer;
    v_stock public.estoque_atual%ROWTYPE;
    v_destino_row public.estoque_atual%ROWTYPE;
    v_new_disponivel integer;
    v_new_total integer;
BEGIN
    v_id_interno := btrim(coalesce(p_id_interno, ''));
    v_origem := upper(regexp_replace(btrim(coalesce(p_origem_estoque, '')), '\s+', '_', 'g'));
    v_origem := replace(v_origem, '1_ANDAR', 'PRIMEIRO_ANDAR');
    v_origem := replace(v_origem, '1º_ANDAR', 'PRIMEIRO_ANDAR');
    v_origem := replace(v_origem, '1°_ANDAR', 'PRIMEIRO_ANDAR');
    v_quantidade := floor(coalesce(p_quantidade, 0))::integer;
    v_execution_id := coalesce(nullif(btrim(p_execution_id), ''), gen_random_uuid()::text);
    v_garantia_id := 'GAR-' || v_execution_id;
    v_movimento_id := 'MOV-GAR-' || v_execution_id;

    IF v_id_interno = '' THEN
        RAISE EXCEPTION 'Produto da garantia nao informado.';
    END IF;

    IF v_origem = '' THEN
        RAISE EXCEPTION 'Origem do estoque da garantia nao informada.';
    END IF;

    IF v_origem = v_destino THEN
        RAISE EXCEPTION 'Produto ja esta em garantia. Use o fluxo de retorno/resolucao para alterar o status.';
    END IF;

    IF v_quantidade <= 0 THEN
        RAISE EXCEPTION 'Quantidade da garantia invalida.';
    END IF;

    IF nullif(btrim(coalesce(p_usuario, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Usuario da garantia nao informado.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('enviar_garantia:' || v_id_interno || ':' || v_origem));

    IF EXISTS (
        SELECT 1
          FROM public.movimentos
         WHERE movimento_id = v_movimento_id
    ) THEN
        RETURN jsonb_build_object(
            'ok', true,
            'status', 'already_processed',
            'garantia_id', v_garantia_id,
            'movimento_id', v_movimento_id,
            'execution_id', v_execution_id
        );
    END IF;

    SELECT *
      INTO v_stock
      FROM public.estoque_atual ea
     WHERE ea.id_interno = v_id_interno
       AND ea.local = v_origem
     ORDER BY ea.id
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Estoque de origem % nao encontrado para o produto %.', v_origem, v_id_interno;
    END IF;

    IF coalesce(v_stock.saldo_disponivel, 0) < v_quantidade THEN
        RAISE EXCEPTION 'Estoque insuficiente em % para o produto %. Disponivel: %, solicitado: %.',
            v_origem,
            v_id_interno,
            coalesce(v_stock.saldo_disponivel, 0),
            v_quantidade;
    END IF;

    v_new_disponivel := coalesce(v_stock.saldo_disponivel, 0) - v_quantidade;
    v_new_total := v_new_disponivel
        + coalesce(v_stock.saldo_reservado, 0)
        + coalesce(v_stock.saldo_em_transito, 0);

    UPDATE public.estoque_atual
       SET saldo_disponivel = v_new_disponivel,
           saldo_total = v_new_total,
           atualizado_em = v_now
     WHERE id = v_stock.id;

    SELECT *
      INTO v_destino_row
      FROM public.estoque_atual ea
     WHERE ea.id_interno = v_id_interno
       AND ea.local = v_destino
     ORDER BY ea.id
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
        v_new_disponivel := coalesce(v_destino_row.saldo_disponivel, 0) + v_quantidade;
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
            v_id_interno,
            v_destino,
            v_quantidade,
            0,
            0,
            v_quantidade,
            v_now,
            v_id_interno || '|' || v_destino
        );
    END IF;

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
        'TRANSFERENCIA',
        v_id_interno,
        v_origem,
        v_destino,
        v_quantidade,
        p_usuario,
        'MODULO_GARANTIA',
        coalesce(nullif(btrim(p_tipo_operacao), ''), 'GARANTIA_TECNICA') ||
            ': Enviado de ' || v_origem || ' para ' || v_destino ||
            '. Motivo: ' || coalesce(nullif(btrim(p_motivo), ''), '-') ||
            CASE WHEN nullif(btrim(coalesce(p_observacao, '')), '') IS NULL
                THEN ''
                ELSE ' | Obs: ' || btrim(p_observacao)
            END
    );

    INSERT INTO public.garantias (
        garantia_id,
        data_envio,
        id_interno,
        descricao_produto,
        fornecedor,
        tipo_operacao,
        motivo,
        observacao,
        origem_estoque,
        quantidade,
        custo_unitario,
        custo_total,
        status,
        usuario,
        local_atual,
        movimento_envio_id,
        updated_at
    ) VALUES (
        v_garantia_id,
        v_now,
        v_id_interno,
        p_descricao_produto,
        p_fornecedor,
        coalesce(nullif(btrim(p_tipo_operacao), ''), 'GARANTIA_TECNICA'),
        p_motivo,
        p_observacao,
        v_origem,
        v_quantidade,
        coalesce(p_custo_unitario, 0),
        coalesce(p_custo_total, 0),
        'ENVIADO',
        p_usuario,
        v_destino,
        v_movimento_id,
        v_now
    );

    RETURN jsonb_build_object(
        'ok', true,
        'status', 'sent',
        'garantia_id', v_garantia_id,
        'movimento_id', v_movimento_id,
        'execution_id', v_execution_id,
        'id_interno', v_id_interno,
        'origem', v_origem,
        'destino', v_destino,
        'quantidade', v_quantidade
    );
END;
$$;

COMMENT ON FUNCTION public.enviar_garantia(text, text, text, text, text, text, text, numeric, numeric, numeric, text, text)
IS 'Envia produto para garantia de forma transacional: valida saldo, move estoque para EM_GARANTIA, registra movimento e cria registro em garantias.';

GRANT EXECUTE ON FUNCTION public.enviar_garantia(text, text, text, text, text, text, text, numeric, numeric, numeric, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.enviar_garantia(text, text, text, text, text, text, text, numeric, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_garantia(text, text, text, text, text, text, text, numeric, numeric, numeric, text, text) TO service_role;
