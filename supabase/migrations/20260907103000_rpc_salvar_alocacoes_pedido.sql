-- Migration: BLOCO 3 - RPC Transacional para Salvar Alocacoes de Pedido de Compra
-- Data: 2026-09-07

CREATE OR REPLACE FUNCTION public.salvar_entrada_nf_pedido_alocacoes(
    p_entrada_nf_id uuid,
    p_tipo_vinculo text DEFAULT 'SEM_PEDIDO',
    p_alocacoes jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entrada public.entradas_nf%ROWTYPE;
    v_tipo text := UPPER(COALESCE(NULLIF(btrim(p_tipo_vinculo), ''), 'SEM_PEDIDO'));
    v_now timestamp with time zone := now();
    v_elem jsonb;
    v_item_id uuid;
    v_pci_id uuid;
    v_qtd_xml numeric(12,3);
    v_inserted_count integer := 0;
    v_item_check uuid;
    v_pci_status text;
BEGIN
    IF p_entrada_nf_id IS NULL THEN
        RAISE EXCEPTION 'ID da Entrada NF nao informado.';
    END IF;

    IF v_tipo NOT IN ('SEM_PEDIDO', 'COM_PEDIDO') THEN
        RAISE EXCEPTION 'Tipo de vinculo invalido: %. Use SEM_PEDIDO ou COM_PEDIDO.', p_tipo_vinculo;
    END IF;

    -- 1. Lock exclusivo da Entrada NF
    SELECT * INTO v_entrada
      FROM public.entradas_nf
     WHERE id = p_entrada_nf_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Entrada NF % nao encontrada.', p_entrada_nf_id;
    END IF;

    IF v_entrada.estoque_finalizado THEN
        RAISE EXCEPTION 'Entrada NF % ja esta finalizada. Alocacoes nao podem ser alteradas.', p_entrada_nf_id;
    END IF;

    -- 2. Atualizar tipo_vinculo_pedido no cabecalho da NF
    UPDATE public.entradas_nf
       SET tipo_vinculo_pedido = v_tipo,
           atualizado_em = v_now
     WHERE id = p_entrada_nf_id;

    -- 3. Limpar alocacoes anteriores transacionalmente
    DELETE FROM public.entrada_nf_item_pedido_alocacoes
     WHERE entrada_nf_id = p_entrada_nf_id;

    -- 4. Se for COM_PEDIDO, inserir o novo conjunto validado de alocacoes
    IF v_tipo = 'COM_PEDIDO' AND p_alocacoes IS NOT NULL AND jsonb_array_length(p_alocacoes) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_alocacoes)
        LOOP
            v_item_id := (v_elem->>'entrada_nf_item_id')::uuid;
            v_pci_id := (v_elem->>'pedido_compra_item_id')::uuid;
            v_qtd_xml := (v_elem->>'quantidade_alocada_xml')::numeric;

            IF v_item_id IS NULL OR v_pci_id IS NULL OR v_qtd_xml IS NULL OR v_qtd_xml <= 0 THEN
                RAISE EXCEPTION 'Dados de alocacao invalidos: item %, pedido %, quantidade %', v_item_id, v_pci_id, v_qtd_xml;
            END IF;

            -- Validar se entrada_nf_item_id pertence a esta entrada_nf_id
            SELECT id INTO v_item_check
              FROM public.entradas_nf_itens
             WHERE id = v_item_id AND (entrada_nf_id = p_entrada_nf_id OR nf_id = p_entrada_nf_id);

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Item fiscal % nao pertence a Entrada NF %.', v_item_id, p_entrada_nf_id;
            END IF;

            -- Validar se pedido_compra_item existe e nao esta CANCELADO
            SELECT status INTO v_pci_status
              FROM public.pedidos_compra_itens
             WHERE id = v_pci_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Pedido de Compra Item % nao encontrado.', v_pci_id;
            END IF;

            IF UPPER(COALESCE(v_pci_status, '')) = 'CANCELADO' THEN
                RAISE EXCEPTION 'Item do Pedido de Compra % esta CANCELADO e nao pode receber alocacoes.', v_pci_id;
            END IF;

            -- Inserir alocacao
            INSERT INTO public.entrada_nf_item_pedido_alocacoes (
                entrada_nf_id,
                entrada_nf_item_id,
                pedido_compra_item_id,
                quantidade_alocada_xml,
                quantidade_aceita_alocada,
                criado_em,
                atualizado_em
            ) VALUES (
                p_entrada_nf_id,
                v_item_id,
                v_pci_id,
                v_qtd_xml,
                0,
                v_now,
                v_now
            );

            v_inserted_count := v_inserted_count + 1;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'entrada_nf_id', p_entrada_nf_id,
        'tipo_vinculo_pedido', v_tipo,
        'alocacoes_salvas', v_inserted_count,
        'atualizado_em', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_entrada_nf_pedido_alocacoes(uuid, text, jsonb) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
