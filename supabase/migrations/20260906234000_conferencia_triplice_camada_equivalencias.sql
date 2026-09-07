-- Migration: FASE 4 - Auditoria Tríplice Camada da Conferência (Pedido x Separação x Conferência) e Suporte a Equivalentes

-- 1. Função RPC para calcular a tríplice comparação sem alterar dados históricos
CREATE OR REPLACE FUNCTION public.analisar_consistencia_pedido_separacao_conferencia(
    p_separacao_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sep_id text := trim(coalesce(p_separacao_id, ''));
    v_pedido record;
    v_sep record;
    v_item record;
    v_comp jsonb;
    v_skus_aceitos jsonb;
    v_sep_bipagem record;
    v_conf_item record;
    v_qtd_conf numeric;
    
    v_ped_sep_ok boolean := true;
    v_sep_conf_ok boolean := true;
    
    v_ped_sep_divergencias jsonb := '[]'::jsonb;
    v_sep_conf_divergencias jsonb := '[]'::jsonb;
    v_classificacao_geral text := 'SEM_DIVERGENCIA';
    
    v_esperado_fisico jsonb := '[]'::jsonb;
    v_conferido_fisico jsonb := '[]'::jsonb;
BEGIN
    IF v_sep_id = '' THEN
        RAISE EXCEPTION 'ID da separacao nao informado.';
    END IF;

    -- Busca dados da separacao
    SELECT * INTO v_sep FROM public.separacao WHERE separacao_id = v_sep_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Separacao % nao encontrada.', v_sep_id;
    END IF;

    -- Busca pedido associado se existir
    SELECT * INTO v_pedido FROM public.mercadolivre_pedidos WHERE separacao_id = v_sep_id LIMIT 1;

    -- Se nao for pedido de marketplace, mantem fluxo tradicional sem divergencias de marketplace
    IF v_pedido.id IS NULL THEN
        RETURN jsonb_build_object(
            'modo_marketplace', false,
            'separacao_id', v_sep_id,
            'pedido_id', NULL,
            'pedido_separacao_status', 'OK',
            'separacao_conferencia_status', 'OK',
            'classificacao_geral', 'SEM_DIVERGENCIA',
            'detalhes_ped_sep', '[]'::jsonb,
            'detalhes_sep_conf', '[]'::jsonb
        );
    END IF;

    -- ================================================================
    -- CAMADA 1 x CAMADA 2: PEDIDO x SEPARAÇÃO
    -- ================================================================
    -- Monta mapa dos SKUs fisicos separados
    CREATE TEMP TABLE temp_sep_fisico (
        id_interno text PRIMARY KEY,
        produto_id uuid,
        ean text,
        qtd_separada numeric DEFAULT 0
    ) ON COMMIT DROP;

    -- Tenta obter de separacao_item_bipagens
    INSERT INTO temp_sep_fisico (id_interno, produto_id, ean, qtd_separada)
    SELECT id_interno, produto_id, max(ean), sum(quantidade)
      FROM public.separacao_item_bipagens
     WHERE separacao_id = v_sep_id
     GROUP BY id_interno, produto_id;

    -- Se separacao_item_bipagens nao tiver registros, usa separacao_itens
    IF NOT EXISTS (SELECT 1 FROM temp_sep_fisico) THEN
        INSERT INTO temp_sep_fisico (id_interno, ean, qtd_separada)
        SELECT id_interno, max(ean), sum(coalesce(qtd_separada, qtd_solicitada, 0))
          FROM public.separacao_itens
         WHERE separacao_id = v_sep_id
         GROUP BY id_interno;
    END IF;

    -- Analisa cada componente do snapshot do pedido
    FOR v_item IN SELECT * FROM public.mercadolivre_pedido_itens WHERE pedido_id = v_pedido.id LOOP
        IF v_item.snapshot_componentes IS NOT NULL AND jsonb_typeof(v_item.snapshot_componentes) = 'array' THEN
            FOR v_comp IN SELECT * FROM jsonb_array_elements(v_item.snapshot_componentes) LOOP
                v_skus_aceitos := coalesce(v_comp->'skus_validos_snapshot', v_comp->'skus_aceitos', '[]'::jsonb);
            END LOOP;
        END IF;
    END LOOP;

    -- Valida se algum SKU fisico separado NAO pertencia ao snapshot de nenhuma origem do pedido
    FOR v_sep_bipagem IN SELECT * FROM temp_sep_fisico LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM public.mercadolivre_pedido_itens pi,
                   jsonb_array_elements(coalesce(pi.snapshot_componentes, '[]'::jsonb)) comp,
                   jsonb_array_elements(coalesce(comp->'skus_validos_snapshot', comp->'skus_aceitos', '[]'::jsonb)) sku
             WHERE pi.pedido_id = v_pedido.id
               AND (
                   sku->>'id_interno' = v_sep_bipagem.id_interno
                   OR sku->>'sku' = v_sep_bipagem.id_interno
                   OR sku->>'produto_id' = coalesce(v_sep_bipagem.produto_id::text, '')
               )
        ) THEN
            v_ped_sep_ok := false;
            v_ped_sep_divergencias := v_ped_sep_divergencias || jsonb_build_object(
                'tipo', 'SKU_NAO_AUTORIZADO',
                'id_interno', v_sep_bipagem.id_interno,
                'qtd_separada', v_sep_bipagem.qtd_separada,
                'mensagem', 'SKU fisico ' || v_sep_bipagem.id_interno || ' nao pertencia ao snapshot do pedido.'
            );
        END IF;
    END LOOP;

    -- ================================================================
    -- CAMADA 2 x CAMADA 3: SEPARAÇÃO x CONFERÊNCIA
    -- ================================================================
    CREATE TEMP TABLE temp_conf_fisico (
        id_interno text PRIMARY KEY,
        ean text,
        qtd_conferida numeric DEFAULT 0
    ) ON COMMIT DROP;

    -- Obtem dados de conferencia (conferencia_itens)
    INSERT INTO temp_conf_fisico (id_interno, ean, qtd_conferida)
    SELECT ci.id_interno, max(ci.ean), sum(coalesce(ci.qtd_conferida, 0))
      FROM public.conferencia_itens ci
     WHERE ci.separacao_id = v_sep_id
     GROUP BY ci.id_interno;

    -- Compara item por item entre temp_sep_fisico e temp_conf_fisico
    FOR v_sep_bipagem IN SELECT * FROM temp_sep_fisico LOOP
        SELECT coalesce(sum(qtd_conferida), 0) INTO v_qtd_conf
          FROM temp_conf_fisico WHERE id_interno = v_sep_bipagem.id_interno;

        IF v_qtd_conf IS NULL OR v_qtd_conf <> v_sep_bipagem.qtd_separada THEN
            v_sep_conf_ok := false;
            v_sep_conf_divergencias := v_sep_conf_divergencias || jsonb_build_object(
                'id_interno', v_sep_bipagem.id_interno,
                'qtd_separada', v_sep_bipagem.qtd_separada,
                'qtd_conferida', coalesce(v_qtd_conf, 0),
                'diferenca', coalesce(v_qtd_conf, 0) - v_sep_bipagem.qtd_separada,
                'tipo', CASE
                    WHEN coalesce(v_qtd_conf, 0) < v_sep_bipagem.qtd_separada THEN 'FALTA'
                    ELSE 'SOBRA'
                END
            );
        END IF;
    END LOOP;

    -- Verifica se conferência possui SKUs que nao foram separados
    FOR v_conf_item IN SELECT * FROM temp_conf_fisico WHERE qtd_conferida > 0 LOOP
        IF NOT EXISTS (SELECT 1 FROM temp_sep_fisico WHERE id_interno = v_conf_item.id_interno) THEN
            v_sep_conf_ok := false;
            v_sep_conf_divergencias := v_sep_conf_divergencias || jsonb_build_object(
                'id_interno', v_conf_item.id_interno,
                'qtd_separada', 0,
                'qtd_conferida', v_conf_item.qtd_conferida,
                'diferenca', v_conf_item.qtd_conferida,
                'tipo', 'SKU_NAO_SEPARADO'
            );
        END IF;
    END LOOP;

    -- Classificacao Geral
    IF v_ped_sep_ok AND v_sep_conf_ok THEN
        v_classificacao_geral := 'SEM_DIVERGENCIA';
    ELSIF (NOT v_ped_sep_ok) AND v_sep_conf_ok THEN
        v_classificacao_geral := 'DIVERGENCIA_NA_SEPARACAO';
    ELSIF v_ped_sep_ok AND (NOT v_sep_conf_ok) THEN
        v_classificacao_geral := 'DIVERGENCIA_NA_CONFERENCIA';
    ELSE
        v_classificacao_geral := 'DIVERGENCIA_NA_SEPARACAO_E_NA_CONFERENCIA';
    END IF;

    -- Monta lista de itens esperados fisicamente
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id_interno', id_interno,
        'ean', ean,
        'qtd_separada', qtd_separada
    )), '[]'::jsonb) INTO v_esperado_fisico FROM temp_sep_fisico;

    -- Monta lista de itens conferidos fisicamente
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id_interno', id_interno,
        'ean', ean,
        'qtd_conferida', qtd_conferida
    )), '[]'::jsonb) INTO v_conferido_fisico FROM temp_conf_fisico;

    RETURN jsonb_build_object(
        'modo_marketplace', true,
        'separacao_id', v_sep_id,
        'pedido_id', v_pedido.id,
        'external_order_id', v_pedido.external_order_id,
        'pedido_separacao_status', CASE WHEN v_ped_sep_ok THEN 'OK' ELSE 'DIVERGENTE' END,
        'separacao_conferencia_status', CASE WHEN v_sep_conf_ok THEN 'OK' ELSE 'DIVERGENTE' END,
        'classificacao_geral', v_classificacao_geral,
        'esperado_fisico', v_esperado_fisico,
        'conferido_fisico', v_conferido_fisico,
        'detalhes_ped_sep', v_ped_sep_divergencias,
        'detalhes_sep_conf', v_sep_conf_divergencias
    );
END;
$$;

-- 2. Função para obter os itens FÍSICOS esperados pela Conferência
CREATE OR REPLACE FUNCTION public.obter_itens_esperados_conferencia(
    p_separacao_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sep_id text := trim(coalesce(p_separacao_id, ''));
    v_res jsonb;
BEGIN
    IF v_sep_id = '' THEN
        RAISE EXCEPTION 'ID da separacao nao informado.';
    END IF;

    -- Se tiver registros em separacao_item_bipagens, usa os SKUs fisicos bipados na separacao
    IF EXISTS (SELECT 1 FROM public.separacao_item_bipagens WHERE separacao_id = v_sep_id) THEN
        SELECT coalesce(jsonb_agg(sub.item), '[]'::jsonb)
          INTO v_res
          FROM (
              SELECT jsonb_build_object(
                  'id_interno', b.id_interno,
                  'ean', max(b.ean),
                  'descricao', max(coalesce(p.descricao_base, b.id_interno)),
                  'qtd_separada', sum(b.quantidade),
                  'qtd_conferida', 0
              ) AS item
                FROM public.separacao_item_bipagens b
                LEFT JOIN public.produtos p ON p.id = b.produto_id
               WHERE b.separacao_id = v_sep_id
               GROUP BY b.id_interno
          ) sub;

        RETURN v_res;
    END IF;

    -- Caso contrario, retorna os itens de separacao_itens
    SELECT coalesce(jsonb_agg(sub.item), '[]'::jsonb)
      INTO v_res
      FROM (
          SELECT jsonb_build_object(
              'id_interno', si.id_interno,
              'ean', si.ean,
              'descricao', si.descricao,
              'qtd_separada', coalesce(si.qtd_separada, si.qtd_solicitada, 0),
              'qtd_conferida', 0
          ) AS item
            FROM public.separacao_itens si
           WHERE si.separacao_id = v_sep_id
      ) sub;

    RETURN coalesce(v_res, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.analisar_consistencia_pedido_separacao_conferencia(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_itens_esperados_conferencia(text) TO anon, authenticated;

COMMENT ON FUNCTION public.analisar_consistencia_pedido_separacao_conferencia(text)
IS 'Realiza a triplice comparacao auditada entre Pedido, Separacao e Conferencia de Marketplace.';
COMMENT ON FUNCTION public.obter_itens_esperados_conferencia(text)
IS 'Retorna a lista exata dos SKUs fisicos esperados para a conferencia baseados no material efetivamente separado.';
