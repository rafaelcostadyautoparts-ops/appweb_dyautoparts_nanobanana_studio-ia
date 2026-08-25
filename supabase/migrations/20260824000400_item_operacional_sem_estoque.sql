-- DY-000.000 e um identificador operacional: conta na separacao/pacotes,
-- mas nunca representa saldo fisico nem pode gerar movimento de estoque.

ALTER TABLE public.separacao_itens
    ADD COLUMN IF NOT EXISTS sem_movimento_estoque boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS detalhes_operacionais jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.separacao_itens
   SET sem_movimento_estoque = true
 WHERE upper(btrim(id_interno)) = 'DY-000.000';

CREATE OR REPLACE FUNCTION public.normalizar_item_operacional_separacao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    NEW.sem_movimento_estoque := upper(btrim(NEW.id_interno)) = 'DY-000.000';
    IF jsonb_typeof(coalesce(NEW.detalhes_operacionais, '[]'::jsonb)) <> 'array' THEN
        RAISE EXCEPTION 'Os detalhes operacionais devem ser uma lista.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalizar_item_operacional_separacao ON public.separacao_itens;
CREATE TRIGGER trg_normalizar_item_operacional_separacao
BEFORE INSERT OR UPDATE OF id_interno, sem_movimento_estoque, detalhes_operacionais
ON public.separacao_itens FOR EACH ROW
EXECUTE FUNCTION public.normalizar_item_operacional_separacao();

CREATE OR REPLACE FUNCTION public.substituir_itens_separacao(
    p_session_id text, p_itens jsonb, p_usuario text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_agora timestamp without time zone := timezone('America/Sao_Paulo', now());
    v_produtos integer;
    v_itens numeric;
BEGIN
    IF jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Lista de itens invalida.'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('separacao_item:' || trim(p_session_id)));
    DELETE FROM public.separacao_itens WHERE separacao_id = trim(p_session_id);

    INSERT INTO public.separacao_itens (
        separacao_id, id_interno, ean, descricao, qtd_solicitada, qtd_separada,
        sem_movimento_estoque, detalhes_operacionais, atualizado_em
    )
    SELECT trim(p_session_id), trim(item->>'id_interno'), nullif(trim(coalesce(item->>'ean', '')), ''),
           coalesce(item->>'descricao', ''), greatest(0, coalesce((item->>'qtd_solicitada')::numeric, 0)),
           greatest(0, coalesce((item->>'qtd_separada')::numeric, 0)),
           upper(trim(item->>'id_interno')) = 'DY-000.000',
           CASE WHEN jsonb_typeof(item->'detalhes_operacionais') = 'array' THEN item->'detalhes_operacionais' ELSE '[]'::jsonb END,
           v_agora
      FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) item
     WHERE nullif(trim(item->>'id_interno'), '') IS NOT NULL
    ON CONFLICT (separacao_id, id_interno) DO UPDATE SET
        ean = EXCLUDED.ean, descricao = EXCLUDED.descricao,
        qtd_solicitada = EXCLUDED.qtd_solicitada, qtd_separada = EXCLUDED.qtd_separada,
        sem_movimento_estoque = EXCLUDED.sem_movimento_estoque,
        detalhes_operacionais = EXCLUDED.detalhes_operacionais, atualizado_em = EXCLUDED.atualizado_em;

    SELECT count(DISTINCT id_interno), coalesce(sum(qtd_separada), 0) INTO v_produtos, v_itens
      FROM public.separacao_itens WHERE separacao_id = trim(p_session_id);
    IF v_produtos = 0 THEN RETURN public.esvaziar_separacao_para_reutilizacao(p_session_id, p_usuario); END IF;
    UPDATE public.separacao SET status = 'em_separacao', atualizado_em = v_agora,
           total_produtos_separados = v_produtos, total_itens_separados = v_itens
     WHERE separacao_id = trim(p_session_id);
    RETURN jsonb_build_object('ok', true, 'separacao_id', trim(p_session_id),
        'total_produtos_separados', v_produtos, 'total_itens_separados', v_itens);
END;
$$;

-- Mantem as RPCs atuais e acrescenta a exclusao do identificador operacional
-- exatamente no conjunto que realiza baixa. A migracao falha se a assinatura
-- esperada mudar, evitando publicar uma protecao parcial silenciosamente.
DO $$
DECLARE
    v_oid regprocedure;
    v_sql text;
    v_old text;
    v_new text;
BEGIN
    v_oid := 'public.finalizar_conferencia(text,text,jsonb,text)'::regprocedure;
    SELECT pg_get_functiondef(v_oid) INTO v_sql;
    IF position('DY-000.000' IN v_sql) = 0 THEN
        v_old := 'WHERE qtd_conferida > 0' || chr(10) || '         GROUP BY id_interno';
        v_new := 'WHERE qtd_conferida > 0' || chr(10) || '           AND upper(btrim(id_interno)) <> ''DY-000.000''' || chr(10) || '         GROUP BY id_interno';
        IF position(v_old IN v_sql) = 0 THEN RAISE EXCEPTION 'Trecho de baixa da finalizar_conferencia nao encontrado.'; END IF;
        EXECUTE replace(v_sql, v_old, v_new);
    END IF;

    v_oid := 'public.finalizar_separacao_rapida_atomica(text,text,boolean)'::regprocedure;
    SELECT pg_get_functiondef(v_oid) INTO v_sql;
    IF position('DY-000.000' IN v_sql) = 0 THEN
        v_old := 'v_itens := v_itens + v_item.quantidade;' || chr(10) || '        v_restante := v_item.quantidade;';
        v_new := 'v_itens := v_itens + v_item.quantidade;' || chr(10) ||
                 '        IF upper(btrim(v_item.id_interno)) = ''DY-000.000'' THEN' || chr(10) ||
                 '            CONTINUE;' || chr(10) ||
                 '        END IF;' || chr(10) ||
                 '        v_restante := v_item.quantidade;';
        IF position(v_old IN v_sql) = 0 THEN RAISE EXCEPTION 'Trecho de baixa da separacao rapida nao encontrado.'; END IF;
        EXECUTE replace(v_sql, v_old, v_new);
    END IF;
END;
$$;

COMMENT ON COLUMN public.separacao_itens.detalhes_operacionais IS
'Historico de descricoes, motivos, datas e operadores informados para DY-000.000.';
COMMENT ON COLUMN public.separacao_itens.sem_movimento_estoque IS
'Protecao de dominio: DY-000.000 conta operacionalmente, mas nao movimenta estoque.';

GRANT EXECUTE ON FUNCTION public.substituir_itens_separacao(text,jsonb,text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
