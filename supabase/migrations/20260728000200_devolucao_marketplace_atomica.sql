-- DY Auto Parts - salvamento atomico da devolucao com movimento de estoque

ALTER TABLE public.devolucao_itens
    ADD COLUMN IF NOT EXISTS apto_venda boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS estoque_movimentado boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS estoque_local text,
    ADD COLUMN IF NOT EXISTS estoque_movimento_id text;

ALTER TABLE public.devolucao_itens
    ALTER COLUMN estoque_movimento_id TYPE text USING estoque_movimento_id::text;

CREATE OR REPLACE FUNCTION public.salvar_devolucao_marketplace_atomica(
    p_devolucao jsonb,
    p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_devolucao_id uuid;
    v_item jsonb;
    v_destino text;
    v_local_destino text;
    v_movimento jsonb;
    v_movimentos integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Acesso seguro expirado. Entre novamente com e-mail e senha.';
    END IF;

    IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
        RAISE EXCEPTION 'Adicione ao menos um produto a devolucao.';
    END IF;

    v_devolucao_id := public.salvar_devolucao_marketplace(p_devolucao, p_itens);

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
    LOOP
        v_destino := lower(coalesce(v_item->>'destino', ''));

        IF coalesce((v_item->>'estoque_movimentado')::boolean, false)
           OR v_destino IN ('nao_recebido', 'divergencia', 'descarte')
           OR coalesce(nullif(btrim(v_item->>'id_interno'), ''), '') = ''
           OR coalesce((v_item->>'quantidade')::numeric, 0) <= 0 THEN
            CONTINUE;
        END IF;

        v_local_destino := CASE
            WHEN coalesce((v_item->>'apto_venda')::boolean, false) THEN 'TERREO'
            ELSE 'DEFEITO'
        END;

        v_movimento := public.registrar_movimento_estoque(
            'ENTRADA',
            btrim(v_item->>'id_interno'),
            '',
            v_local_destino,
            (v_item->>'quantidade')::numeric,
            coalesce(nullif(btrim(p_devolucao->>'responsavel'), ''), 'N/A'),
            'MANUAL',
            'Devolucao marketplace pedido ' || coalesce(p_devolucao->>'pedido', '-')
                || CASE WHEN v_local_destino = 'TERREO'
                    THEN ' - produto apto para venda'
                    ELSE ' - produto nao apto enviado para defeito'
                END,
            false,
            'devolucao:' || v_devolucao_id::text || ':'
                || btrim(v_item->>'id_interno') || ':' || v_local_destino
        );

        UPDATE public.devolucao_itens
        SET apto_venda = (v_local_destino = 'TERREO'),
            estoque_movimentado = true,
            estoque_local = v_local_destino,
            estoque_movimento_id = nullif(v_movimento->>'movimento_id', '')
        WHERE devolucao_id = v_devolucao_id
          AND id_interno = btrim(v_item->>'id_interno');

        v_movimentos := v_movimentos + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'id', v_devolucao_id,
        'movimentos', v_movimentos,
        'atomic', true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_devolucao_marketplace_atomica(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salvar_devolucao_marketplace_atomica(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_devolucao_marketplace_atomica(jsonb, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
