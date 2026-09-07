-- Migration: RPC Transacional e Atômica para Envio de Pedido à Separação
CREATE OR REPLACE FUNCTION public.enviar_pedido_para_separacao(
    p_pedido_id bigint,
    p_usuario text DEFAULT 'Sistema'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agora timestamp without time zone := timezone('America/Sao_Paulo', now());
    v_agora_tz timestamp with time zone := timezone('America/Sao_Paulo', now());
    v_pedido record;
    v_separacao_id text;
    v_item record;
    v_comp jsonb;
    v_idx integer;
    v_comp_count integer;
    v_base_qtd numeric;
    v_qtd_comprada numeric;
    v_qtd_necessaria numeric;
    v_is_grupo boolean;
    v_tipo text;
    v_grupo_id uuid;
    v_produto_id uuid;
    v_skus_aceitos jsonb;
    v_sorted_skus text;
    v_key text;
    v_id_interno text;
    v_ean text;
    v_descricao text;
    v_origem jsonb;
    v_rec record;
    v_inserted_item_id uuid;
    v_total_produtos integer := 0;
BEGIN
    IF p_pedido_id IS NULL THEN
        RAISE EXCEPTION 'ID do pedido e obrigatorio.';
    END IF;

    -- 1. Advisory Lock para evitar race conditions simultaneos no mesmo pedido
    PERFORM pg_advisory_xact_lock(hashtext('enviar_pedido_separacao:' || p_pedido_id::text));

    -- 2. Lock de linha com FOR UPDATE
    SELECT * INTO v_pedido
      FROM public.mercadolivre_pedidos
     WHERE id = p_pedido_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido % nao encontrado.', p_pedido_id;
    END IF;

    -- 3. Validar status de identificacao
    IF lower(coalesce(v_pedido.status_identificacao, '')) <> 'pronto_separacao' THEN
        RAISE EXCEPTION 'Pedido nao esta pronto para separacao. Status atual: %', v_pedido.status_identificacao;
    END IF;

    -- 4. Validar status do marketplace
    IF lower(coalesce(v_pedido.status_mercadolivre, '')) = 'cancelled' THEN
        RAISE EXCEPTION 'Pedido cancelado no marketplace nao pode ser enviado para separacao.';
    END IF;

    -- 5. Idempotencia: Pedido ja possui separacao_id vinculada
    IF v_pedido.separacao_id IS NOT NULL AND trim(v_pedido.separacao_id) <> '' THEN
        RETURN jsonb_build_object(
            'ok', true,
            'separacao_id', trim(v_pedido.separacao_id),
            'created', false,
            'message', 'Pedido ja possui separacao criada anteriormente.'
        );
    END IF;

    v_separacao_id := 'SEP-PED-' || p_pedido_id::text;

    -- 6. Reutilizar separacao se ja existir na tabela separacao
    IF EXISTS (SELECT 1 FROM public.separacao WHERE separacao_id = v_separacao_id) THEN
        UPDATE public.mercadolivre_pedidos
           SET separacao_id = v_separacao_id,
               separacao_criada_em = coalesce(separacao_criada_em, v_agora_tz),
               atualizado_em = v_agora_tz
         WHERE id = p_pedido_id;

        RETURN jsonb_build_object(
            'ok', true,
            'separacao_id', v_separacao_id,
            'created', false,
            'message', 'Separacao recuperada e vinculada ao pedido.'
        );
    END IF;

    -- 7. Tabela temporaria para agrupamento transacional
    CREATE TEMP TABLE temp_necessidades (
        key text PRIMARY KEY,
        tipo text NOT NULL,
        grupo_id uuid,
        produto_id uuid,
        id_interno text NOT NULL,
        ean text,
        descricao text,
        qtd_solicitada numeric NOT NULL DEFAULT 0,
        skus_aceitos jsonb NOT NULL DEFAULT '[]'::jsonb,
        origens jsonb NOT NULL DEFAULT '[]'::jsonb
    ) ON COMMIT DROP;

    FOR v_item IN
        SELECT * FROM public.mercadolivre_pedido_itens
         WHERE pedido_id = p_pedido_id
         ORDER BY id ASC
    LOOP
        IF v_item.snapshot_componentes IS NULL OR jsonb_typeof(v_item.snapshot_componentes) <> 'array' OR jsonb_array_length(v_item.snapshot_componentes) = 0 THEN
            RAISE EXCEPTION 'Item % do pedido nao possui snapshot de componentes.', v_item.id;
        END IF;

        v_comp_count := jsonb_array_length(v_item.snapshot_componentes);
        FOR v_idx IN 0..(v_comp_count - 1) LOOP
            v_comp := v_item.snapshot_componentes->v_idx;

            v_grupo_id := nullif(trim(coalesce(v_comp->>'grupo_equivalencia_id', '')), '')::uuid;
            v_produto_id := nullif(trim(coalesce(v_comp->>'produto_id', '')), '')::uuid;

            v_is_grupo := (v_grupo_id IS NOT NULL OR (v_comp->>'tipo_componente') = 'grupo' OR (v_comp->>'tipo') = 'grupo' OR (v_comp->>'tipo') = 'grupo_equivalencia');
            v_tipo := CASE WHEN v_is_grupo THEN 'grupo_equivalencia' ELSE 'produto_isolado' END;

            v_base_qtd := greatest(1, coalesce((v_comp->>'quantidade_por_unidade')::numeric, 1));
            v_qtd_comprada := greatest(1, coalesce(v_item.quantidade_comprada::numeric, 1));
            v_qtd_necessaria := coalesce((v_comp->>'quantidade_total_calculada')::numeric, (v_comp->>'quantidade_total_necessaria')::numeric, (v_base_qtd * v_qtd_comprada));

            v_skus_aceitos := coalesce(v_comp->'skus_validos_snapshot', v_comp->'skus_aceitos', '[]'::jsonb);

            SELECT string_agg(sku_id, ',' ORDER BY sku_id)
              INTO v_sorted_skus
              FROM (
                  SELECT DISTINCT trim(coalesce(s->>'produto_id', s->>'id', '')) AS sku_id
                    FROM jsonb_array_elements(v_skus_aceitos) s
                   WHERE nullif(trim(coalesce(s->>'produto_id', s->>'id', '')), '') IS NOT NULL
              ) sub;
            v_sorted_skus := coalesce(v_sorted_skus, '');

            v_key := CASE WHEN v_is_grupo
                THEN 'GRP:' || coalesce(v_grupo_id::text, 'NOLINK') || '|SIG:' || v_sorted_skus
                ELSE 'ISO:' || coalesce(v_produto_id::text, coalesce(v_comp->>'sku', 'NOLINK'))
            END;

            v_id_interno := CASE WHEN v_is_grupo
                THEN coalesce(nullif(trim(v_comp->>'sku'), ''), nullif(trim(v_comp->>'id_interno'), ''), 'GRP-' || coalesce(v_grupo_id::text, 'X') || '-' || CASE WHEN v_sorted_skus <> '' THEN substr(v_sorted_skus, 1, 15) ELSE '0' END)
                ELSE coalesce(nullif(trim(v_comp->>'sku'), ''), nullif(trim(v_comp->>'id_interno'), ''), 'PROD-' || coalesce(v_produto_id::text, 'X'))
            END;

            v_ean := NULL;
            IF jsonb_array_length(v_skus_aceitos) > 0 THEN
                v_ean := nullif(trim(coalesce(v_skus_aceitos->0->>'ean', '')), '');
            END IF;

            v_descricao := coalesce(nullif(trim(v_comp->>'descricao'), ''), nullif(trim(v_comp->>'grupo_nome'), ''), CASE WHEN v_is_grupo THEN 'Grupo de Equivalencia' ELSE 'Produto Isolado' END);

            v_origem := jsonb_build_object(
                'pedido_id', p_pedido_id,
                'pedido_item_id', v_item.id,
                'mapping_version_id', v_item.mapping_version_id,
                'componente_index', v_idx,
                'quantidade_solicitada', v_qtd_necessaria
            );

            INSERT INTO temp_necessidades (
                key, tipo, grupo_id, produto_id, id_interno, ean, descricao, qtd_solicitada, skus_aceitos, origens
            ) VALUES (
                v_key, v_tipo, v_grupo_id, v_produto_id, v_id_interno, v_ean, v_descricao, v_qtd_necessaria, v_skus_aceitos, jsonb_build_array(v_origem)
            )
            ON CONFLICT (key) DO UPDATE
               SET qtd_solicitada = temp_necessidades.qtd_solicitada + EXCLUDED.qtd_solicitada,
                   origens = temp_necessidades.origens || EXCLUDED.origens;
        END LOOP;
    END LOOP;

    SELECT count(*) INTO v_total_produtos FROM temp_necessidades;

    -- 8. Inserir cabecalho em separacao
    INSERT INTO public.separacao (
        separacao_id, pedido_referencia, canal_id, canal_nome, status,
        criado_por, criado_em, atualizado_em,
        total_produtos_separados, total_itens_separados, total_pacotes_montados
    ) VALUES (
        v_separacao_id, v_pedido.external_order_id, 'mercadolivre', 'Mercado Livre', 'em_separacao',
        coalesce(nullif(trim(p_usuario), ''), 'Sistema'), v_agora, v_agora,
        v_total_produtos, 0, 0
    );

    -- 9. Inserir itens de separacao e origens relacionais
    FOR v_rec IN SELECT * FROM temp_necessidades ORDER BY key ASC LOOP
        INSERT INTO public.separacao_itens (
            separacao_id, id_interno, ean, descricao,
            qtd_solicitada, qtd_separada, item_avulso, sem_movimento_estoque,
            detalhes_operacionais, atualizado_em
        ) VALUES (
            v_separacao_id, v_rec.id_interno, v_rec.ean, v_rec.descricao,
            v_rec.qtd_solicitada, 0, false, false,
            jsonb_build_array(jsonb_build_object(
                'tipo_necessidade', v_rec.tipo,
                'grupo_equivalencia_id', v_rec.grupo_id,
                'produto_id', v_rec.produto_id,
                'skus_aceitos', v_rec.skus_aceitos,
                'origens', v_rec.origens,
                'bipagens_fisicas', '[]'::jsonb
            )),
            v_agora
        )
        RETURNING id INTO v_inserted_item_id;

        INSERT INTO public.separacao_item_origens (
            separacao_id, separacao_item_id, pedido_id, pedido_item_id,
            mapping_version_id, componente_index, quantidade_solicitada, criado_em
        )
        SELECT v_separacao_id, v_inserted_item_id,
               (o->>'pedido_id')::bigint,
               (o->>'pedido_item_id')::bigint,
               nullif(o->>'mapping_version_id', '')::bigint,
               (o->>'componente_index')::integer,
               (o->>'quantidade_solicitada')::numeric,
               v_agora_tz
          FROM jsonb_array_elements(v_rec.origens) o;
    END LOOP;

    -- 10. Vincular separacao_id ao pedido
    UPDATE public.mercadolivre_pedidos
       SET separacao_id = v_separacao_id,
           separacao_criada_em = v_agora_tz,
           atualizado_em = v_agora_tz
     WHERE id = p_pedido_id;

    RETURN jsonb_build_object(
        'ok', true,
        'separacao_id', v_separacao_id,
        'created', true,
        'message', 'Separacao criada e vinculada com sucesso.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enviar_pedido_para_separacao(bigint, text) TO anon, authenticated;
COMMENT ON FUNCTION public.enviar_pedido_para_separacao(bigint, text)
IS 'Gera transacionalmente a separacao de um pedido pronto, garantindo atomicidade, idempotencia e rastreabilidade.';
