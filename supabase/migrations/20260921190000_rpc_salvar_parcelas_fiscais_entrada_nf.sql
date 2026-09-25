-- Migration: RPC Transacional para Salvar/Substituir Parcelas Fiscais de Entrada NF
-- Data: 2026-09-21
-- Descrição: Criação de operação atômica no PostgreSQL com bloqueio FOR UPDATE,
--            validação rigorosa de centavos, proteção de contas pendentes/pagas e substituição segura de rascunhos.

CREATE OR REPLACE FUNCTION public.salvar_parcelas_fiscais_entrada_nf(
    p_entrada_nf_id uuid,
    p_tipo_condicao_financeira text,
    p_forma_pagamento text,
    p_observacao_financeira text,
    p_parcelas jsonb,
    p_usuario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entrada public.entradas_nf%ROWTYPE;
    v_valor_fiscal numeric(15,2);
    v_soma_parcelas numeric(15,2) := 0;
    v_total_parcelas integer;
    v_rec jsonb;
    v_num_parcela integer;
    v_vencimento date;
    v_valor numeric(15,2);
    v_forma_pagamento text;
    v_parcela_texto text;
    v_descricao text;
    v_inserted_count integer := 0;
    v_seen_nums integer[] := ARRAY[]::integer[];
BEGIN
    -- 1. Validar parâmetro de entrada
    IF p_entrada_nf_id IS NULL THEN
        RAISE EXCEPTION 'ID da Entrada NF não informado.';
    END IF;

    -- 2. Bloqueio FOR UPDATE na Entrada NF para evitar concorrência/duplo-clique
    SELECT * INTO v_entrada
      FROM public.entradas_nf
     WHERE id = p_entrada_nf_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Entrada NF % não encontrada.', p_entrada_nf_id;
    END IF;

    -- 3. Validar se a entrada não está finalizada
    IF v_entrada.estoque_finalizado OR lower(coalesce(v_entrada.status, '')) = 'finalizada' OR v_entrada.financeiro_lancado = true THEN
        RAISE EXCEPTION 'Não é permitido alterar parcelas de uma Entrada NF já finalizada (Entrada %).', p_entrada_nf_id;
    END IF;

    -- 4. Validar payload de parcelas
    IF p_parcelas IS NULL OR jsonb_typeof(p_parcelas) <> 'array' THEN
        RAISE EXCEPTION 'Payload de parcelas inválido. Deve ser um array JSON.';
    END IF;

    v_total_parcelas := jsonb_array_length(p_parcelas);
    IF v_total_parcelas <= 0 THEN
        RAISE EXCEPTION 'Ao menos uma parcela deve ser informada.';
    END IF;

    -- 5. Proteger contas já efetivadas (pendente ou pago)
    IF EXISTS (
        SELECT 1
          FROM public.contas_pagar
         WHERE entrada_nf_id = p_entrada_nf_id
           AND tipo_lancamento = 'nota_fiscal'
           AND status IN ('pendente', 'pago', 'efetivado')
    ) THEN
        RAISE EXCEPTION 'Existem parcelas fiscais da Entrada NF % que já estão pendentes ou pagas e não podem ser substituídas.', p_entrada_nf_id;
    END IF;

    -- 6. Validar cada parcela individualmente e calcular a soma monetária
    FOR v_rec IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
        v_num_parcela := COALESCE(NULLIF(v_rec->>'numero_parcela', '')::integer, NULLIF(v_rec->>'numero', '')::integer);
        IF v_num_parcela IS NULL OR v_num_parcela <= 0 THEN
            RAISE EXCEPTION 'Número de parcela inválido ou não informado: %', v_rec;
        END IF;

        IF v_num_parcela = ANY(v_seen_nums) THEN
            RAISE EXCEPTION 'Número de parcela duplicado: %', v_num_parcela;
        END IF;
        v_seen_nums := array_append(v_seen_nums, v_num_parcela);

        IF NULLIF(btrim(COALESCE(v_rec->>'vencimento', v_rec->>'data_vencimento', '')), '') IS NULL THEN
            RAISE EXCEPTION 'Data de vencimento obrigatória na parcela #%.', v_num_parcela;
        END IF;

        BEGIN
            v_vencimento := (COALESCE(v_rec->>'vencimento', v_rec->>'data_vencimento'))::date;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Data de vencimento inválida na parcela #%: %', v_num_parcela, COALESCE(v_rec->>'vencimento', v_rec->>'data_vencimento');
        END;

        v_valor := round(COALESCE(NULLIF(v_rec->>'valor', '')::numeric, 0), 2);
        IF v_valor <= 0 THEN
            RAISE EXCEPTION 'Valor da parcela #% deve ser maior que zero (recebido: %).', v_num_parcela, v_valor;
        END IF;

        v_soma_parcelas := v_soma_parcelas + v_valor;
    END LOOP;

    -- 7. Validar soma monetária exata contra o valor total fiscal da NF
    v_valor_fiscal := round(COALESCE(v_entrada.valor_total, 0), 2);
    IF abs(v_soma_parcelas - v_valor_fiscal) > 0.005 THEN
        RAISE EXCEPTION 'A soma das parcelas (R$ %) não confere com o valor fiscal da NF (R$ %). Diferença: R$ %.',
            to_char(v_soma_parcelas, 'FM999G999G990D00'),
            to_char(v_valor_fiscal, 'FM999G999G990D00'),
            to_char(abs(v_soma_parcelas - v_valor_fiscal), 'FM999G999G990D00');
    END IF;

    -- 8. Excluir SOMENTE os rascunhos fiscais anteriores da mesma Entrada NF
    DELETE FROM public.contas_pagar
     WHERE entrada_nf_id = p_entrada_nf_id
       AND tipo_lancamento = 'nota_fiscal'
       AND status = 'rascunho';

    -- 9. Inserir as novas parcelas fiscais
    v_forma_pagamento := LOWER(COALESCE(NULLIF(btrim(p_forma_pagamento), ''), 'boleto'));

    FOR v_rec IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
        v_num_parcela := COALESCE(NULLIF(v_rec->>'numero_parcela', '')::integer, NULLIF(v_rec->>'numero', '')::integer);
        v_vencimento := (COALESCE(v_rec->>'vencimento', v_rec->>'data_vencimento'))::date;
        v_valor := round(COALESCE(NULLIF(v_rec->>'valor', '')::numeric, 0), 2);
        v_parcela_texto := v_num_parcela || '/' || v_total_parcelas;
        v_descricao := 'Parcela ' || lpad(v_num_parcela::text, 3, '0') || ' - NF ' || COALESCE(v_entrada.numero_nf, '');

        INSERT INTO public.contas_pagar (
            entrada_nf_id,
            nf_id,
            numero_nf,
            fornecedor_id,
            fornecedor_cnpj,
            cnpj_fornecedor,
            fornecedor_nome,
            parcela,
            numero_parcela,
            descricao,
            tipo_lancamento,
            origem,
            vencimento,
            data_vencimento,
            valor,
            forma_pagamento,
            observacoes,
            status,
            status_vencimento,
            criado_em,
            atualizado_em
        ) VALUES (
            p_entrada_nf_id,
            p_entrada_nf_id,
            v_entrada.numero_nf,
            v_entrada.fornecedor_id,
            COALESCE(v_entrada.fornecedor_cnpj, v_entrada.cnpj_fornecedor),
            COALESCE(v_entrada.cnpj_fornecedor, v_entrada.fornecedor_cnpj),
            v_entrada.fornecedor_nome,
            v_parcela_texto,
            v_num_parcela,
            v_descricao,
            'nota_fiscal',
            'nota_fiscal',
            v_vencimento,
            v_vencimento,
            v_valor,
            v_forma_pagamento,
            NULLIF(btrim(p_observacao_financeira), ''),
            'rascunho',
            'em_aberto',
            now(),
            now()
        );

        v_inserted_count := v_inserted_count + 1;
    END LOOP;

    -- 10. Atualizar o cabeçalho financeiro de entradas_nf
    UPDATE public.entradas_nf
       SET tipo_condicao_financeira = CASE 
               WHEN lower(coalesce(p_tipo_condicao_financeira, '')) = 'parcelado' THEN 'parcelado' 
               ELSE 'a_vista' 
           END,
           status_financeiro = 'gerado',
           financeiro_configurado_em = now(),
           financeiro_configurado_por = COALESCE(NULLIF(btrim(p_usuario), ''), 'SISTEMA'),
           observacao_financeira = NULLIF(btrim(p_observacao_financeira), ''),
           atualizado_em = now(),
           updated_at = now()
     WHERE id = p_entrada_nf_id;

    RETURN jsonb_build_object(
        'ok', true,
        'entrada_nf_id', p_entrada_nf_id,
        'count', v_inserted_count,
        'valor_total', v_valor_fiscal,
        'soma_parcelas', v_soma_parcelas
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_parcelas_fiscais_entrada_nf(uuid, text, text, text, jsonb, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.salvar_parcelas_fiscais_entrada_nf(uuid, text, text, text, jsonb, text)
IS 'RPC atômica e transacional para validação, substituição segura de rascunhos e persistência das parcelas fiscais de Entrada NF em contas_pagar.';

NOTIFY pgrst, 'reload schema';
