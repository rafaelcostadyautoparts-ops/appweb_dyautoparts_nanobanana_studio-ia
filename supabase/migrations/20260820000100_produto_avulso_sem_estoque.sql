-- Produto virtual para componentes enviados sem cadastro individual.
-- Conta normalmente na separacao/pacotes, mas nunca movimenta estoque.

ALTER TABLE public.separacao_itens ADD COLUMN IF NOT EXISTS item_avulso boolean NOT NULL DEFAULT false;
ALTER TABLE public.separacao_itens ADD COLUMN IF NOT EXISTS item_avulso_id text;
ALTER TABLE public.separacao_itens ADD COLUMN IF NOT EXISTS motivo_avulso text;
ALTER TABLE public.conferencia_itens ADD COLUMN IF NOT EXISTS item_avulso boolean NOT NULL DEFAULT false;
ALTER TABLE public.conferencia_itens ADD COLUMN IF NOT EXISTS item_avulso_id text;
ALTER TABLE public.conferencia_itens ADD COLUMN IF NOT EXISTS motivo_avulso text;

DROP INDEX IF EXISTS public.uq_separacao_itens_sessao_produto;
CREATE UNIQUE INDEX uq_separacao_itens_sessao_produto
    ON public.separacao_itens (separacao_id, id_interno)
    WHERE id_interno <> 'DY-000.000';
CREATE UNIQUE INDEX IF NOT EXISTS uq_separacao_itens_item_avulso
    ON public.separacao_itens (separacao_id, item_avulso_id) WHERE item_avulso_id IS NOT NULL;

INSERT INTO public.produtos (
    id_interno, ean, sku_fornecedor, descricao_base, marca, cor, categoria,
    subcategoria, unidade, preco_custo, preco_varejo, preco_atacado,
    estoque_minimo, qtd_minima_atacado, status, observacoes, url_imagem,
    url_pdf_manual, descricao_completa, atributos, quantidade_embalagem
)
VALUES (
    'DY-000.000', '', '', 'ITEM AVULSO', 'DY AUTO PARTS', 'NAO SE APLICA',
    'OPERACIONAL', 'ITEM AVULSO', 'UN', 0, 0, 0, 0, 1, 'ATIVO',
    'Produto virtual. A descricao real e informada na separacao. Nao movimenta estoque.',
    '', '', 'ITEM AVULSO SEM CONTROLE DE ESTOQUE',
    '{"tipo_item":"AVULSO_NAO_ESTOQUE","movimenta_estoque":false}'::jsonb, 1
)
ON CONFLICT (id_interno) DO UPDATE SET
    descricao_base = EXCLUDED.descricao_base,
    descricao_completa = EXCLUDED.descricao_completa,
    observacoes = EXCLUDED.observacoes,
    atributos = coalesce(public.produtos.atributos, '{}'::jsonb) || EXCLUDED.atributos,
    status = 'ATIVO',
    atualizado_em = timezone('America/Sao_Paulo', now());

-- Preserva a RPC atual de conferencia como implementacao para itens de estoque.
ALTER FUNCTION public.finalizar_conferencia(text,text,jsonb,text)
    RENAME TO finalizar_conferencia_com_estoque;

CREATE OR REPLACE FUNCTION public.finalizar_conferencia(
    p_session_id text,
    p_usuario text,
    p_rows jsonb,
    p_execution_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_catalog_rows jsonb;
    v_loose_rows jsonb;
    v_result jsonb;
    v_execution text := coalesce(nullif(btrim(coalesce(p_execution_id, '')), ''), gen_random_uuid()::text);
    v_conference_id text;
    v_now timestamp without time zone := timezone('America/Sao_Paulo', now());
BEGIN
    v_catalog_rows := coalesce((
        SELECT jsonb_agg(value)
          FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
         WHERE btrim(coalesce(value->>'id_interno', '')) <> 'DY-000.000'
    ), '[]'::jsonb);
    v_loose_rows := coalesce((
        SELECT jsonb_agg(value)
          FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
         WHERE btrim(coalesce(value->>'id_interno', '')) = 'DY-000.000'
    ), '[]'::jsonb);

    IF jsonb_array_length(v_loose_rows) = 0 THEN
        RETURN public.finalizar_conferencia_com_estoque(p_session_id, p_usuario, p_rows, v_execution);
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_loose_rows) r
         WHERE coalesce((r->>'qtd_separada')::integer, 0) <> coalesce((r->>'qtd_conferida')::integer, 0)
            OR nullif(btrim(coalesce(r->>'divergencia', '')), '') IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'O item avulso possui divergencia. Corrija antes de finalizar.';
    END IF;

    IF jsonb_array_length(v_catalog_rows) > 0 THEN
        v_result := public.finalizar_conferencia_com_estoque(p_session_id, p_usuario, v_catalog_rows, v_execution);
        v_conference_id := v_result->>'conferencia_id';
    ELSE
        PERFORM pg_advisory_xact_lock(hashtext('finalizar_conferencia:' || p_session_id));
        SELECT conferencia_id INTO v_conference_id
          FROM public.conferencia
         WHERE separacao_id = p_session_id AND status IN ('conferido', 'finalizada')
         ORDER BY conferido_em DESC NULLS LAST LIMIT 1;
        IF v_conference_id IS NULL THEN
            v_conference_id := 'CONF-' || v_execution;
            INSERT INTO public.conferencia (
                conferencia_id, separacao_id, status, conferido_por, conferido_em, atualizado_em
            ) VALUES (
                v_conference_id, p_session_id, 'conferido', p_usuario, v_now, v_now
            );
            UPDATE public.separacao SET status='finalizada', atualizado_em=v_now, finalizado_em=v_now
             WHERE separacao_id=p_session_id;
        END IF;
        v_result := jsonb_build_object(
            'ok', true, 'status', 'processed', 'conferencia_id', v_conference_id,
            'separacao_id', p_session_id, 'execution_id', v_execution, 'movimentos', 0
        );
    END IF;

    INSERT INTO public.conferencia_itens (
        conferencia_id, separacao_id, id_interno, ean, descricao,
        qtd_separada, qtd_conferida, divergencia,
        item_avulso, item_avulso_id, motivo_avulso
    )
    SELECT v_conference_id, p_session_id, 'DY-000.000',
           nullif(btrim(coalesce(r->>'ean', '')), ''),
           nullif(btrim(coalesce(r->>'descricao', '')), ''),
           coalesce((r->>'qtd_separada')::integer, 0),
           coalesce((r->>'qtd_conferida')::integer, 0), null, true,
           nullif(btrim(coalesce(r->>'item_avulso_id', '')), ''),
           nullif(btrim(coalesce(r->>'motivo_avulso', '')), '')
      FROM jsonb_array_elements(v_loose_rows) r
     WHERE NOT EXISTS (
         SELECT 1 FROM public.conferencia_itens ci
          WHERE ci.conferencia_id=v_conference_id
            AND ci.item_avulso_id=nullif(btrim(coalesce(r->>'item_avulso_id', '')), '')
     );

    RETURN v_result || jsonb_build_object('item_avulso_sem_estoque', true);
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_conferencia(text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_conferencia(text,text,jsonb,text) TO anon, authenticated, service_role;

-- Redefine a finalizacao rapida preservando a regra anterior e pulando apenas o item virtual.
CREATE OR REPLACE FUNCTION public.finalizar_separacao_rapida_atomica(
    p_separacao_id text,
    p_usuario text,
    p_permitir_negativo boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_sep public.separacao%ROWTYPE; v_item record; v_local text;
    v_disponivel integer; v_retirar integer; v_restante integer;
    v_movimentos integer := 0; v_produtos integer := 0; v_itens integer := 0;
    v_now timestamp without time zone := timezone('America/Sao_Paulo', now());
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessao autenticada obrigatoria.'; END IF;
    IF nullif(btrim(coalesce(p_separacao_id, '')), '') IS NULL THEN RAISE EXCEPTION 'Separacao nao informada.'; END IF;
    IF nullif(btrim(coalesce(p_usuario, '')), '') IS NULL THEN RAISE EXCEPTION 'Usuario nao informado.'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('finalizar_separacao_rapida:' || btrim(p_separacao_id)));
    SELECT * INTO v_sep FROM public.separacao WHERE separacao_id=btrim(p_separacao_id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Separacao % nao encontrada.', p_separacao_id; END IF;
    IF lower(coalesce(v_sep.status, '')) IN ('finalizada','finalizado','concluida','concluido','faturada','faturado') THEN
        RETURN jsonb_build_object('ok',true,'idempotente',true,'separacao_id',v_sep.separacao_id);
    END IF;
    IF lower(coalesce(v_sep.status, '')) IN ('cancelada','cancelado') THEN RAISE EXCEPTION 'Separacao cancelada.'; END IF;
    IF upper(coalesce(v_sep.observacao, '')) NOT LIKE '%SAIDA_RAPIDA%' THEN RAISE EXCEPTION 'A separacao % nao esta marcada como modo rapido.',v_sep.separacao_id; END IF;

    FOR v_item IN SELECT id_interno,sum(greatest(coalesce(qtd_separada,0),0))::integer quantidade
      FROM public.separacao_itens WHERE separacao_id=v_sep.separacao_id GROUP BY id_interno
      HAVING sum(greatest(coalesce(qtd_separada,0),0))>0 ORDER BY id_interno
    LOOP
        v_produtos:=v_produtos+1; v_itens:=v_itens+v_item.quantidade;
        IF v_item.id_interno='DY-000.000' THEN CONTINUE; END IF;
        v_restante:=v_item.quantidade;
        FOREACH v_local IN ARRAY ARRAY['TERREO','MOSTRUARIO','PRIMEIRO_ANDAR'] LOOP
            EXIT WHEN v_restante<=0;
            SELECT coalesce(sum(greatest(coalesce(saldo_disponivel,0),0)),0)::integer INTO v_disponivel
              FROM public.estoque_atual WHERE id_interno=v_item.id_interno AND upper(btrim(local))=v_local;
            v_retirar:=least(v_disponivel,v_restante);
            IF v_retirar>0 THEN
                PERFORM public.registrar_movimento_estoque('SAIDA',v_item.id_interno,v_local,'',v_retirar,btrim(p_usuario),'APP_SEPARACAO','Baixa automatica da separacao rapida '||v_sep.separacao_id,false,'sep-rapida:'||v_sep.separacao_id||':'||v_item.id_interno||':'||v_local||':saldo');
                v_restante:=v_restante-v_retirar; v_movimentos:=v_movimentos+1;
            END IF;
        END LOOP;
        IF v_restante>0 THEN
            IF coalesce(p_permitir_negativo,false) IS NOT TRUE THEN RAISE EXCEPTION 'Estoque insuficiente para %: faltam % unidades.',v_item.id_interno,v_restante; END IF;
            PERFORM public.registrar_movimento_estoque('SAIDA',v_item.id_interno,'TERREO','',v_restante,btrim(p_usuario),'APP_SEPARACAO','Baixa da separacao rapida '||v_sep.separacao_id||' com estoque negativo permitido.',true,'sep-rapida:'||v_sep.separacao_id||':'||v_item.id_interno||':TERREO:negativo');
            v_movimentos:=v_movimentos+1;
        END IF;
    END LOOP;
    IF v_produtos=0 THEN RAISE EXCEPTION 'Separacao sem itens validos.'; END IF;
    UPDATE public.separacao SET status='finalizada',atualizado_em=v_now,finalizado_em=v_now,total_produtos_separados=v_produtos,total_itens_separados=v_itens WHERE id=v_sep.id;
    RETURN jsonb_build_object('ok',true,'idempotente',false,'separacao_id',v_sep.separacao_id,'movimentos',v_movimentos,'total_produtos_separados',v_produtos,'total_itens_separados',v_itens,'item_avulso_sem_estoque',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.substituir_itens_separacao(
    p_session_id text,
    p_itens jsonb,
    p_usuario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agora timestamp without time zone := timezone('America/Sao_Paulo', now());
    v_produtos integer;
    v_itens numeric;
BEGIN
    IF jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' THEN
        RAISE EXCEPTION 'Lista de itens invalida.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('separacao_item:' || trim(p_session_id)));
    DELETE FROM public.separacao_itens WHERE separacao_id = trim(p_session_id);
    INSERT INTO public.separacao_itens (
        separacao_id, id_interno, ean, descricao, qtd_solicitada, qtd_separada,
        item_avulso, item_avulso_id, motivo_avulso, atualizado_em
    )
    SELECT trim(p_session_id), trim(item->>'id_interno'),
           nullif(trim(coalesce(item->>'ean', '')), ''),
           coalesce(item->>'descricao', ''),
           greatest(0, coalesce((item->>'qtd_solicitada')::numeric, 0)),
           greatest(0, coalesce((item->>'qtd_separada')::numeric, 0)),
           coalesce((item->>'item_avulso')::boolean, false),
           nullif(trim(coalesce(item->>'item_avulso_id', '')), ''),
           nullif(trim(coalesce(item->>'motivo_avulso', '')), ''),
           v_agora
      FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) item
     WHERE nullif(trim(item->>'id_interno'), '') IS NOT NULL;

    SELECT count(DISTINCT CASE WHEN item_avulso_id IS NOT NULL THEN item_avulso_id ELSE id_interno END),
           coalesce(sum(qtd_separada), 0)
      INTO v_produtos, v_itens
      FROM public.separacao_itens
     WHERE separacao_id = trim(p_session_id);
    IF v_produtos = 0 THEN
        RETURN public.esvaziar_separacao_para_reutilizacao(p_session_id, p_usuario);
    END IF;
    UPDATE public.separacao
       SET status='em_separacao', atualizado_em=v_agora,
           total_produtos_separados=v_produtos, total_itens_separados=v_itens
     WHERE separacao_id=trim(p_session_id);
    RETURN jsonb_build_object('ok',true,'separacao_id',trim(p_session_id),
        'total_produtos_separados',v_produtos,'total_itens_separados',v_itens);
END;
$$;

NOTIFY pgrst, 'reload schema';
