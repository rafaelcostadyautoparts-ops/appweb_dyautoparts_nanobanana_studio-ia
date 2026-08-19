-- Mantem a sequencia diaria sem lacunas causadas por separacoes vazias.
-- Tambem centraliza a troca/remocao de itens para evitar duplicidades sob RLS.

-- Limpa duplicidades antigas conservando a linha mais recente e a maior
-- quantidade registrada para o produto na separacao (duplicatas eram copias,
-- nao novas unidades).
WITH ranked AS (
    SELECT id,
           first_value(id) OVER (
               PARTITION BY separacao_id, id_interno
               ORDER BY atualizado_em DESC NULLS LAST, id DESC
           ) AS keeper_id,
           max(qtd_solicitada) OVER (PARTITION BY separacao_id, id_interno) AS max_solicitada,
           max(qtd_separada) OVER (PARTITION BY separacao_id, id_interno) AS max_separada
      FROM public.separacao_itens
), updated AS (
    UPDATE public.separacao_itens si
       SET qtd_solicitada = r.max_solicitada,
           qtd_separada = r.max_separada
      FROM ranked r
     WHERE si.id = r.keeper_id
    RETURNING si.id
)
DELETE FROM public.separacao_itens si
 USING ranked r
 WHERE si.id = r.id
   AND r.id <> r.keeper_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_separacao_itens_sessao_produto
    ON public.separacao_itens (separacao_id, id_interno);

CREATE OR REPLACE FUNCTION public.esvaziar_separacao_para_reutilizacao(
    p_session_id text,
    p_usuario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agora timestamp without time zone := timezone('America/Sao_Paulo', now());
    v_status text;
BEGIN
    IF nullif(trim(p_session_id), '') IS NULL THEN
        RAISE EXCEPTION 'Separacao nao informada.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('separacao_vazia:' || trim(p_session_id)));

    SELECT lower(coalesce(status, ''))
      INTO v_status
      FROM public.separacao
     WHERE separacao_id = trim(p_session_id)
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'missing', true, 'separacao_id', trim(p_session_id));
    END IF;

    IF v_status IN ('finalizada', 'finalizado', 'concluida', 'concluido', 'faturada', 'faturado') THEN
        RAISE EXCEPTION 'Separacao finalizada nao pode ser esvaziada.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.conferencia c WHERE c.separacao_id = trim(p_session_id)
    ) OR EXISTS (
        SELECT 1
          FROM public.movimentos m
         WHERE upper(coalesce(m.origem, '')) IN ('APP_SEPARACAO', 'APP_CONFERENCIA')
           AND coalesce(m.observacao, '') ILIKE ('%' || trim(p_session_id) || '%')
    ) THEN
        RAISE EXCEPTION 'Separacao com conferencia ou movimento nao pode ser reutilizada.';
    END IF;

    DELETE FROM public.separacao_itens WHERE separacao_id = trim(p_session_id);

    UPDATE public.separacao
       SET status = 'aguardando_produto',
           atualizado_em = v_agora,
           finalizado_em = NULL,
           total_produtos_separados = 0,
           total_itens_separados = 0,
           total_pacotes_montados = 0,
           observacao = 'SEPARACAO_VAZIA_REUTILIZAVEL | Ultimo item removido por '
               || coalesce(nullif(trim(p_usuario), ''), 'N/A')
     WHERE separacao_id = trim(p_session_id);

    RETURN jsonb_build_object(
        'ok', true,
        'separacao_id', trim(p_session_id),
        'status', 'aguardando_produto',
        'reutilizavel', true
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_item_separacao(
    p_session_id text,
    p_id_interno text,
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
    PERFORM pg_advisory_xact_lock(hashtext('separacao_item:' || trim(p_session_id)));

    DELETE FROM public.separacao_itens
     WHERE separacao_id = trim(p_session_id)
       AND id_interno = trim(p_id_interno);

    SELECT count(DISTINCT id_interno), coalesce(sum(qtd_separada), 0)
      INTO v_produtos, v_itens
      FROM public.separacao_itens
     WHERE separacao_id = trim(p_session_id);

    IF v_produtos = 0 THEN
        RETURN public.esvaziar_separacao_para_reutilizacao(p_session_id, p_usuario);
    END IF;

    UPDATE public.separacao
       SET atualizado_em = v_agora,
           total_produtos_separados = v_produtos,
           total_itens_separados = v_itens
     WHERE separacao_id = trim(p_session_id);

    RETURN jsonb_build_object(
        'ok', true,
        'separacao_id', trim(p_session_id),
        'status', 'em_separacao',
        'total_produtos_separados', v_produtos,
        'total_itens_separados', v_itens
    );
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
        separacao_id, id_interno, ean, descricao,
        qtd_solicitada, qtd_separada, atualizado_em
    )
    SELECT trim(p_session_id), trim(item->>'id_interno'),
           nullif(trim(coalesce(item->>'ean', '')), ''),
           coalesce(item->>'descricao', ''),
           greatest(0, coalesce((item->>'qtd_solicitada')::numeric, 0)),
           greatest(0, coalesce((item->>'qtd_separada')::numeric, 0)),
           v_agora
      FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) item
     WHERE nullif(trim(item->>'id_interno'), '') IS NOT NULL
    ON CONFLICT (separacao_id, id_interno) DO UPDATE
       SET ean = EXCLUDED.ean,
           descricao = EXCLUDED.descricao,
           qtd_solicitada = EXCLUDED.qtd_solicitada,
           qtd_separada = EXCLUDED.qtd_separada,
           atualizado_em = EXCLUDED.atualizado_em;

    SELECT count(DISTINCT id_interno), coalesce(sum(qtd_separada), 0)
      INTO v_produtos, v_itens
      FROM public.separacao_itens
     WHERE separacao_id = trim(p_session_id);

    IF v_produtos = 0 THEN
        RETURN public.esvaziar_separacao_para_reutilizacao(p_session_id, p_usuario);
    END IF;

    UPDATE public.separacao
       SET status = 'em_separacao',
           atualizado_em = v_agora,
           total_produtos_separados = v_produtos,
           total_itens_separados = v_itens
     WHERE separacao_id = trim(p_session_id);

    RETURN jsonb_build_object(
        'ok', true,
        'separacao_id', trim(p_session_id),
        'total_produtos_separados', v_produtos,
        'total_itens_separados', v_itens
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.iniciar_separacao_primeiro_item(
    p_prefixo text,
    p_canal_id text,
    p_canal_nome text,
    p_criado_por text,
    p_modo_rapido boolean,
    p_id_interno text,
    p_ean text DEFAULT NULL,
    p_descricao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prefixo text;
    v_ddmm text;
    v_sequencia integer;
    v_separacao_id text;
    v_reutilizada boolean := false;
    v_agora timestamp without time zone := timezone('America/Sao_Paulo', now());
BEGIN
    v_prefixo := regexp_replace(upper(coalesce(p_prefixo, 'OUTROS')), '[^A-Z0-9]', '', 'g');
    IF v_prefixo = '' THEN v_prefixo := 'OUTROS'; END IF;
    v_ddmm := to_char(v_agora, 'DDMM');

    IF nullif(trim(p_canal_nome), '') IS NULL THEN RAISE EXCEPTION 'Canal da separacao nao informado.'; END IF;
    IF nullif(trim(p_id_interno), '') IS NULL THEN RAISE EXCEPTION 'Produto sem ID interno.'; END IF;

    PERFORM pg_advisory_xact_lock(hashtext('iniciar_separacao:' || v_prefixo || ':' || v_ddmm));

    SELECT s.separacao_id,
           (regexp_match(s.separacao_id, '-([0-9]+)$'))[1]::integer
      INTO v_separacao_id, v_sequencia
      FROM public.separacao s
     WHERE s.separacao_id ~ ('^SEP-' || v_prefixo || '-' || v_ddmm || '-[0-9]+$')
       AND lower(coalesce(s.status, '')) = 'aguardando_produto'
       AND NOT EXISTS (SELECT 1 FROM public.separacao_itens si WHERE si.separacao_id = s.separacao_id)
       AND NOT EXISTS (SELECT 1 FROM public.conferencia c WHERE c.separacao_id = s.separacao_id)
       AND NOT EXISTS (
           SELECT 1 FROM public.movimentos m
            WHERE upper(coalesce(m.origem, '')) IN ('APP_SEPARACAO', 'APP_CONFERENCIA')
              AND coalesce(m.observacao, '') ILIKE ('%' || s.separacao_id || '%')
       )
     ORDER BY (regexp_match(s.separacao_id, '-([0-9]+)$'))[1]::integer
     LIMIT 1
     FOR UPDATE;

    IF v_separacao_id IS NULL THEN
        SELECT coalesce(max((regexp_match(s.separacao_id, '-([0-9]+)$'))[1]::integer), 0) + 1
          INTO v_sequencia
          FROM public.separacao s
         WHERE s.separacao_id ~ ('^SEP-' || v_prefixo || '-' || v_ddmm || '-[0-9]+$');
        v_separacao_id := 'SEP-' || v_prefixo || '-' || v_ddmm || '-' || lpad(v_sequencia::text, 2, '0');

        INSERT INTO public.separacao (
            separacao_id, pedido_referencia, canal_id, canal_nome, status,
            criado_por, criado_em, atualizado_em, observacao,
            total_produtos_separados, total_itens_separados, total_pacotes_montados
        ) VALUES (
            v_separacao_id, NULL, coalesce(p_canal_id, ''), trim(p_canal_nome), 'em_separacao',
            coalesce(nullif(trim(p_criado_por), ''), 'N/A'), v_agora, v_agora,
            CASE WHEN coalesce(p_modo_rapido, false) THEN 'SAIDA_RAPIDA | CRIADA_NO_PRIMEIRO_BIP' ELSE 'SEPARACAO MANUAL POR NF | CRIADA_NO_PRIMEIRO_BIP' END,
            1, 1, 0
        );
    ELSE
        v_reutilizada := true;
        UPDATE public.separacao
           SET pedido_referencia = NULL,
               canal_id = coalesce(p_canal_id, ''),
               canal_nome = trim(p_canal_nome),
               status = 'em_separacao',
               criado_por = coalesce(nullif(trim(p_criado_por), ''), 'N/A'),
               criado_em = v_agora,
               atualizado_em = v_agora,
               finalizado_em = NULL,
               total_produtos_separados = 1,
               total_itens_separados = 1,
               total_pacotes_montados = 0,
               observacao = CASE WHEN coalesce(p_modo_rapido, false) THEN 'SAIDA_RAPIDA | SEQUENCIA_VAZIA_REUTILIZADA' ELSE 'SEPARACAO MANUAL POR NF | SEQUENCIA_VAZIA_REUTILIZADA' END
         WHERE separacao_id = v_separacao_id;
    END IF;

    INSERT INTO public.separacao_itens (
        separacao_id, id_interno, ean, descricao, qtd_solicitada, qtd_separada, atualizado_em
    ) VALUES (
        v_separacao_id, trim(p_id_interno), nullif(trim(coalesce(p_ean, '')), ''),
        coalesce(p_descricao, ''), 1, 1, v_agora
    )
    ON CONFLICT (separacao_id, id_interno) DO UPDATE
       SET ean = EXCLUDED.ean,
           descricao = EXCLUDED.descricao,
           qtd_solicitada = 1,
           qtd_separada = 1,
           atualizado_em = v_agora;

    RETURN jsonb_build_object(
        'ok', true,
        'separacao_id', v_separacao_id,
        'sequencia', v_sequencia,
        'criado_em', v_agora,
        'reutilizada', v_reutilizada
    );
END;
$$;

REVOKE ALL ON FUNCTION public.esvaziar_separacao_para_reutilizacao(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remover_item_separacao(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.substituir_itens_separacao(text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.esvaziar_separacao_para_reutilizacao(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remover_item_separacao(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.substituir_itens_separacao(text,jsonb,text) TO anon, authenticated;

COMMENT ON FUNCTION public.esvaziar_separacao_para_reutilizacao(text,text)
IS 'Zera uma separacao sem movimentos/conferencia e preserva seu codigo para o proximo primeiro bip.';
COMMENT ON FUNCTION public.iniciar_separacao_primeiro_item(text,text,text,text,boolean,text,text,text)
IS 'Reutiliza atomicamente a menor sequencia vazia do canal/dia antes de criar um novo codigo.';
