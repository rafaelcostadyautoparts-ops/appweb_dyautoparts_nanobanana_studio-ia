-- Migration: 20261005160000_entrada_nf_identificacao_inteligente_aprendizado.sql
-- Descricao: Atualiza a RPC public.finalizar_recebimento_entrada_nf com aprendizado automatico seguro e atomico em public.fornecedor_produtos

CREATE OR REPLACE FUNCTION public.finalizar_recebimento_entrada_nf(
    p_entrada_nf_id uuid,
    p_usuario text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_entrada public.entradas_nf%ROWTYPE;
    v_rec RECORD;
    v_stock public.estoque_atual%ROWTYPE;
    v_now timestamp with time zone := now();
    v_user text := COALESCE(NULLIF(btrim(p_usuario), ''), 'SISTEMA');
    v_local_dest text;
    v_qtd_aceita numeric(15,4);
    v_custo_unit numeric(15,4);
    v_destino_novo numeric(15,4);
    v_movimento_id text;
    v_processed_count integer := 0;
    v_total_estoque_adicionado numeric(15,4) := 0;
    v_lotes_criados integer := 0;
    v_movimentos_criados integer := 0;
    v_alocacoes_processadas integer := 0;
    v_contas_promovidas integer := 0;
    v_tem_divergencia boolean := false;
    v_tem_recusa boolean := false;
    v_status_final text := 'finalizada';

    v_item_id uuid;
    v_item_qtd_aceita_total numeric(15,4);
    v_qtd_restante_distribuir numeric(15,4);
    v_aloc RECORD;
    v_qtd_aceita_aloc numeric(15,4);
    v_pci public.pedidos_compra_itens%ROWTYPE;
    v_nova_qtd_rec numeric(15,4);
    v_novo_status_pci text;

    -- Variaveis para recalculo de custo definitivo com complementares
    v_total_complementar_inc numeric(15,4) := 0;
    v_total_fiscal_itens numeric(15,4) := 0;
    v_item_row RECORD;
    v_proporcao numeric(15,8);
    v_rateio_comp numeric(15,4);
    v_custo_real_total_def numeric(15,4);
    v_custo_real_unit_def numeric(15,6);

    -- Variaveis para aprendizado seguro de fornecedor_produtos
    v_fornecedor_cnpj_limpo text := '';
    v_cprod_limpo text := '';
    v_fp_existente public.fornecedor_produtos%ROWTYPE;
    v_vinculos_aprendidos integer := 0;
    v_fp_rec RECORD;
BEGIN
    IF p_entrada_nf_id IS NULL THEN
        RAISE EXCEPTION 'ID da Entrada NF nao informado.';
    END IF;

    -- 1. Lock exclusivo da Entrada NF
    SELECT * INTO v_entrada
      FROM public.entradas_nf
     WHERE id = p_entrada_nf_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Entrada NF % nao encontrada.', p_entrada_nf_id;
    END IF;

    -- 2. Idempotencia & Bloqueio se ja finalizada
    IF v_entrada.estoque_finalizado OR lower(COALESCE(v_entrada.status, '')) = 'finalizada' THEN
        RAISE EXCEPTION 'Entrada NF % ja se encontra finalizada. Operacao bloqueada.', p_entrada_nf_id;
    END IF;

    IF v_entrada.afeta_estoque IS FALSE THEN
        RAISE EXCEPTION 'Entrada NF % marcada para nao afetar estoque.', p_entrada_nf_id;
    END IF;

    -- 3. Validacao da existencia de recebimentos fisicos
    IF NOT EXISTS (
        SELECT 1 FROM public.entrada_nf_item_recebimentos WHERE entrada_nf_id = p_entrada_nf_id
    ) THEN
        RAISE EXCEPTION 'Nenhum recebimento fisico encontrado para a Entrada NF %. Efetue a conferencia fisica antes de finalizar.', p_entrada_nf_id;
    END IF;

    -- 4. Bloqueio de itens NAO_IDENTIFICADO
    IF EXISTS (
        SELECT 1 FROM public.entrada_nf_item_recebimentos
         WHERE entrada_nf_id = p_entrada_nf_id
           AND upper(COALESCE(situacao, '')) = 'NAO_IDENTIFICADO'
    ) THEN
        RAISE EXCEPTION 'Existem produtos nao identificados no recebimento fisico da Entrada NF %. Realize o vinculo cadastral antes de finalizar.', p_entrada_nf_id;
    END IF;

    -- 4b. APURACAO DOS COMPLEMENTARES QUE INCORPORAM CUSTO
    SELECT COALESCE(SUM(grp_valor), 0) INTO v_total_complementar_inc
      FROM (
        SELECT COALESCE(complementar_id::text, id::text) AS grp_id,
               SUM(valor) AS grp_valor
          FROM public.contas_pagar
         WHERE entrada_nf_id = p_entrada_nf_id
           AND lower(COALESCE(tipo_lancamento, origem, '')) = 'complementar'
           AND incorporar_custo IS TRUE
         GROUP BY COALESCE(complementar_id::text, id::text)
      ) comp_groups;

    -- 4c. APURACAO DO TOTAL FISCAL BASE DOS ITENS DA NF
    SELECT COALESCE(SUM(custo_real_total), SUM(valor_total), 0) INTO v_total_fiscal_itens
      FROM public.entradas_nf_itens
     WHERE entrada_nf_id = p_entrada_nf_id;

    -- 4d. ATUALIZACAO DEFINITIVA DO CUSTO NOS ITENS DA ENTRADA
    IF v_total_complementar_inc > 0 AND v_total_fiscal_itens > 0 THEN
        FOR v_item_row IN
            SELECT id, quantidade, custo_real_total, valor_total
              FROM public.entradas_nf_itens
             WHERE entrada_nf_id = p_entrada_nf_id
        LOOP
            v_proporcao := COALESCE(v_item_row.custo_real_total, v_item_row.valor_total, 0) / v_total_fiscal_itens;
            v_rateio_comp := round(v_total_complementar_inc * v_proporcao, 2);
            v_custo_real_total_def := COALESCE(v_item_row.custo_real_total, v_item_row.valor_total, 0) + v_rateio_comp;
            IF COALESCE(v_item_row.quantidade, 0) > 0 THEN
                v_custo_real_unit_def := round(v_custo_real_total_def / v_item_row.quantidade, 6);
            ELSE
                v_custo_real_unit_def := 0;
            END IF;

            UPDATE public.entradas_nf_itens
               SET custo_real_total = v_custo_real_total_def,
                   custo_real_unitario = v_custo_real_unit_def,
                   atualizado_em = v_now
             WHERE id = v_item_row.id;
        END LOOP;
    END IF;

    -- 5. Loop sobre todas as alocacoes fisicas registradas para a entrada
    FOR v_rec IN
        SELECT r.*,
               i.quantidade AS quantidade_xml,
               i.valor_unitario AS item_valor_unitario,
               i.valor_total AS item_valor_total,
               i.custo_real_unitario AS item_custo_real_unitario,
               i.custo_real_total AS item_custo_real_total
          FROM public.entrada_nf_item_recebimentos r
          JOIN public.entradas_nf_itens i ON i.id = r.entrada_nf_item_id
         WHERE r.entrada_nf_id = p_entrada_nf_id
    LOOP
        v_qtd_aceita := COALESCE(v_rec.quantidade_aceita, 0);

        IF v_rec.quantidade_recusada > 0 OR v_rec.situacao <> 'CONFERE' THEN
            v_tem_divergencia := true;
        END IF;
        IF v_rec.quantidade_recusada > 0 THEN
            v_tem_recusa := true;
        END IF;

        IF v_qtd_aceita > 0 THEN
            v_local_dest := UPPER(COALESCE(NULLIF(btrim(v_rec.local_destino), ''), 'TERREO'));

            v_custo_unit := COALESCE(
                NULLIF(v_rec.item_custo_real_unitario, 0),
                CASE WHEN COALESCE(v_rec.quantidade_xml, 0) > 0 AND COALESCE(v_rec.item_custo_real_total, 0) > 0
                     THEN round(v_rec.item_custo_real_total / v_rec.quantidade_xml, 6)
                     ELSE NULL
                END,
                v_rec.item_valor_unitario,
                0
            );

            -- 5a. Atualizar saldo em public.estoque_atual por produto + local
            SELECT * INTO v_stock
              FROM public.estoque_atual
             WHERE id_interno = v_rec.id_interno AND upper(btrim(local)) = v_local_dest
             ORDER BY id LIMIT 1 FOR UPDATE;

            v_destino_novo := COALESCE(v_stock.saldo_disponivel, 0) + v_qtd_aceita;

            IF FOUND THEN
                UPDATE public.estoque_atual
                   SET local = v_local_dest,
                       saldo_disponivel = v_destino_novo,
                       saldo_reservado = COALESCE(saldo_reservado, 0),
                       saldo_em_transito = COALESCE(saldo_em_transito, 0),
                       saldo_total = v_destino_novo + COALESCE(saldo_reservado, 0) + COALESCE(saldo_em_transito, 0),
                       atualizado_em = v_now,
                       chave_estoque = COALESCE(chave_estoque, v_rec.id_interno || '|' || v_local_dest)
                 WHERE id = v_stock.id;
            ELSE
                INSERT INTO public.estoque_atual (
                    id_interno, local, saldo_disponivel, saldo_reservado,
                    saldo_em_transito, saldo_total, atualizado_em, chave_estoque
                ) VALUES (
                    v_rec.id_interno, v_local_dest, v_destino_novo, 0, 0,
                    v_destino_novo, v_now, v_rec.id_interno || '|' || v_local_dest
                );
            END IF;

            -- 5b. Inserir movimento em public.movimentos
            v_movimento_id := 'MOV-ENT-NF-' || p_entrada_nf_id || '-' || v_rec.id;

            INSERT INTO public.movimentos (
                movimento_id, data_hora, tipo, id_interno,
                local_origem, local_destino, quantidade, usuario, origem,
                observacao, execution_id, auth_user_id
            ) VALUES (
                v_movimento_id,
                v_now,
                'ENTRADA',
                v_rec.id_interno,
                NULL,
                v_local_dest,
                v_qtd_aceita,
                v_user,
                'APP_COMPRAS',
                'NF ' || COALESCE(v_entrada.numero_nf, '') || ' | Alocacao: ' || v_rec.id || ' | ' || v_rec.id_interno || ' em ' || v_local_dest,
                'entrada_nf_rec:' || v_rec.id,
                auth.uid()
            );
            v_movimentos_criados := v_movimentos_criados + 1;

            -- 5c. Criar camada de Lote FIFO em public.estoque_lotes
            INSERT INTO public.estoque_lotes (
                produto_id,
                id_interno,
                origem_tipo,
                origem_id,
                recebimento_id,
                numero_nf,
                data_entrada,
                quantidade_inicial,
                quantidade_atual,
                custo_unitario,
                custo_total,
                local_estoque,
                status,
                criado_em,
                atualizado_em
            ) VALUES (
                v_rec.produto_id,
                v_rec.id_interno,
                'entrada_nf',
                p_entrada_nf_id,
                v_rec.id,
                COALESCE(v_entrada.numero_nf, ''),
                COALESCE(v_entrada.data_recebimento, v_entrada.data_emissao, v_now),
                v_qtd_aceita,
                v_qtd_aceita,
                v_custo_unit,
                (v_qtd_aceita * v_custo_unit),
                LOWER(v_local_dest),
                'ativo',
                v_now,
                v_now
            );
            v_lotes_criados := v_lotes_criados + 1;

            -- 5d. Atualizar preco_custo de referencia do produto
            IF v_custo_unit > 0 THEN
                UPDATE public.produtos
                   SET preco_custo = round(v_custo_unit, 2),
                       atualizado_em = v_now
                 WHERE id = v_rec.produto_id OR id_interno = v_rec.id_interno;
            END IF;

            v_total_estoque_adicionado := v_total_estoque_adicionado + v_qtd_aceita;
        END IF;

        v_processed_count := v_processed_count + 1;
    END LOOP;

    -- 5e. APRENDIZADO SEGURO E ATOMICO DE FORNECEDOR + CPROD
    IF v_entrada.fornecedor_cnpj IS NOT NULL AND btrim(v_entrada.fornecedor_cnpj) <> '' THEN
        v_fornecedor_cnpj_limpo := regexp_replace(v_entrada.fornecedor_cnpj, '\D', '', 'g');
    ELSIF v_entrada.cnpj_fornecedor IS NOT NULL AND btrim(v_entrada.cnpj_fornecedor) <> '' THEN
        v_fornecedor_cnpj_limpo := regexp_replace(v_entrada.cnpj_fornecedor, '\D', '', 'g');
    ELSE
        v_fornecedor_cnpj_limpo := '';
    END IF;

    IF v_fornecedor_cnpj_limpo <> '' THEN
        FOR v_fp_rec IN
            SELECT DISTINCT ON (btrim(i.codigo_produto_fornecedor))
                   i.codigo_produto_fornecedor,
                   COALESCE(i.descricao_produto_fornecedor, i.descricao_xml) AS desc_forn,
                   COALESCE(i.ean_fornecedor, i.ean_xml) AS ean_forn,
                   i.id_interno,
                   i.produto_id,
                   COALESCE(i.custo_real_unitario, i.valor_unitario) AS custo_unit,
                   i.quantidade,
                   COALESCE(i.ean_divergente, false) AS ean_div
              FROM public.entradas_nf_itens i
             WHERE (i.entrada_nf_id = p_entrada_nf_id OR i.nf_id = p_entrada_nf_id)
               AND i.id_interno IS NOT NULL AND btrim(i.id_interno) <> ''
               AND i.codigo_produto_fornecedor IS NOT NULL AND btrim(i.codigo_produto_fornecedor) <> ''
        LOOP
            v_cprod_limpo := btrim(v_fp_rec.codigo_produto_fornecedor);

            SELECT * INTO v_fp_existente
              FROM public.fornecedor_produtos
             WHERE fornecedor_cnpj = v_fornecedor_cnpj_limpo
               AND codigo_produto_fornecedor = v_cprod_limpo
             LIMIT 1 FOR UPDATE;

            IF FOUND THEN
                -- Se o vínculo já existe para OUTRO produto -> CONFLITO (não sobrescrever silenciosamente)
                IF v_fp_existente.id_interno IS NOT NULL AND v_fp_existente.id_interno <> v_fp_rec.id_interno THEN
                    RAISE EXCEPTION 'CONFLITO DE VINCULO: O codigo "%" do fornecedor % ja esta vinculado ao produto %, divergindo do produto % recebido.',
                        v_cprod_limpo, v_fornecedor_cnpj_limpo, v_fp_existente.id_interno, v_fp_rec.id_interno;
                END IF;

                -- Se aponta para o mesmo produto: atualizar metadados operacionais com seguranca
                UPDATE public.fornecedor_produtos
                   SET ultimo_custo = COALESCE(v_fp_rec.custo_unit, v_fp_existente.ultimo_custo),
                       ultima_quantidade = COALESCE(v_fp_rec.quantidade, v_fp_existente.ultima_quantidade),
                       ultima_compra_em = COALESCE(v_entrada.data_emissao, v_entrada.data_recebimento, CURRENT_DATE),
                       atualizado_em = v_now
                 WHERE id = v_fp_existente.id;
            ELSE
                -- Criar novo vínculo com aprendizado seguro
                INSERT INTO public.fornecedor_produtos (
                    fornecedor_id,
                    fornecedor_cnpj,
                    codigo_produto_fornecedor,
                    descricao_produto_fornecedor,
                    ean_fornecedor,
                    id_interno,
                    produto_id,
                    ultimo_custo,
                    ultima_quantidade,
                    ultima_compra_em,
                    ean_divergente,
                    criado_em,
                    atualizado_em
                ) VALUES (
                    v_entrada.fornecedor_id,
                    v_fornecedor_cnpj_limpo,
                    v_cprod_limpo,
                    v_fp_rec.desc_forn,
                    v_fp_rec.ean_forn,
                    v_fp_rec.id_interno,
                    v_fp_rec.produto_id,
                    v_fp_rec.custo_unit,
                    v_fp_rec.quantidade,
                    COALESCE(v_entrada.data_emissao, v_entrada.data_recebimento, CURRENT_DATE),
                    v_fp_rec.ean_div,
                    v_now,
                    v_now
                );
                v_vinculos_aprendidos := v_vinculos_aprendidos + 1;
            END IF;
        END LOOP;
    END IF;

    -- 6. Processar Alocacoes de Pedidos de Compra
    FOR v_item_id IN
        SELECT DISTINCT entrada_nf_item_id
          FROM public.entrada_nf_item_pedido_alocacoes
         WHERE entrada_nf_id = p_entrada_nf_id
    LOOP
        SELECT COALESCE(SUM(quantidade_aceita), 0) INTO v_item_qtd_aceita_total
          FROM public.entrada_nf_item_recebimentos
         WHERE entrada_nf_item_id = v_item_id;

        v_qtd_restante_distribuir := v_item_qtd_aceita_total;

        FOR v_aloc IN
            SELECT a.id AS alocacao_id,
                   a.pedido_compra_item_id,
                   a.quantidade_alocada_xml,
                   pci.id_interno,
                   pci.data_pedido
              FROM public.entrada_nf_item_pedido_alocacoes a
              JOIN public.pedidos_compra_itens pci ON pci.id = a.pedido_compra_item_id
             WHERE a.entrada_nf_item_id = v_item_id
             ORDER BY pci.data_pedido ASC, a.criado_em ASC
        LOOP
            v_qtd_aceita_aloc := LEAST(v_qtd_restante_distribuir, v_aloc.quantidade_alocada_xml);

            UPDATE public.entrada_nf_item_pedido_alocacoes
               SET quantidade_aceita_alocada = v_qtd_aceita_aloc,
                   atualizado_em = v_now
             WHERE id = v_aloc.alocacao_id;

            v_qtd_restante_distribuir := GREATEST(v_qtd_restante_distribuir - v_qtd_aceita_aloc, 0);

            SELECT * INTO v_pci
              FROM public.pedidos_compra_itens
             WHERE id = v_aloc.pedido_compra_item_id
             FOR UPDATE;

            IF FOUND THEN
                v_nova_qtd_rec := COALESCE(v_pci.quantidade_recebida, 0) + v_qtd_aceita_aloc;

                IF v_nova_qtd_rec >= v_pci.quantidade_pedida THEN
                    v_novo_status_pci := 'ATENDIDO_TOTAL';
                ELSIF v_nova_qtd_rec > 0 THEN
                    v_novo_status_pci := 'ATENDIDO_PARCIAL';
                ELSE
                    v_novo_status_pci := v_pci.status;
                END IF;

                UPDATE public.pedidos_compra_itens
                   SET quantidade_recebida = v_nova_qtd_rec,
                       status = v_novo_status_pci,
                       atualizado_em = v_now
                 WHERE id = v_pci.id;
            END IF;

            v_alocacoes_processadas := v_alocacoes_processadas + 1;
        END LOOP;
    END LOOP;

    -- 7. Efetivacao Financeira Transacional (Promocao de parcelas rascunho em contas_pagar para pendente)
    IF COALESCE(v_entrada.afeta_financeiro, true) IS TRUE THEN
        WITH updated AS (
            UPDATE public.contas_pagar
               SET status = 'pendente',
                   atualizado_em = v_now
             WHERE entrada_nf_id = p_entrada_nf_id
               AND lower(COALESCE(status, '')) = 'rascunho'
             RETURNING id
        )
        SELECT COUNT(*) INTO v_contas_promovidas FROM updated;

        IF EXISTS (
            SELECT 1 FROM public.contas_pagar 
             WHERE entrada_nf_id = p_entrada_nf_id 
               AND lower(COALESCE(status, '')) <> 'rascunho'
        ) THEN
            UPDATE public.entradas_nf
               SET financeiro_lancado = true,
                   status_financeiro = 'gerado',
                   atualizado_em = v_now
             WHERE id = p_entrada_nf_id;
        END IF;
    END IF;

    -- 8. Atualizar status final da Entrada NF
    IF v_tem_divergencia THEN
        v_status_final := 'recebida_com_divergencia';
    ELSE
        v_status_final := 'finalizada';
    END IF;

    UPDATE public.entradas_nf
       SET status = v_status_final,
           estoque_finalizado = true,
           atualizado_em = v_now
     WHERE id = p_entrada_nf_id;

    RETURN jsonb_build_object(
        'ok', true,
        'entrada_nf_id', p_entrada_nf_id,
        'status_final', v_status_final,
        'total_complementar_incorporado', v_total_complementar_inc,
        'alocacoes_processadas', v_processed_count,
        'total_estoque_adicionado', v_total_estoque_adicionado,
        'movimentos_criados', v_movimentos_criados,
        'lotes_criados', v_lotes_criados,
        'alocacoes_pedidos_processadas', v_alocacoes_processadas,
        'contas_pagar_promovidas', v_contas_promovidas,
        'vinculos_aprendidos', v_vinculos_aprendidos,
        'atualizado_em', v_now
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.finalizar_recebimento_entrada_nf(uuid, text) TO anon, authenticated, service_role;
