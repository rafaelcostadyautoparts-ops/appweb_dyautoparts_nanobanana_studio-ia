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
    v_agora timestamp without time zone := timezone('America/Sao_Paulo', now());
BEGIN
    v_prefixo := regexp_replace(upper(coalesce(p_prefixo, 'OUTROS')), '[^A-Z0-9]', '', 'g');
    IF v_prefixo = '' THEN v_prefixo := 'OUTROS'; END IF;
    v_ddmm := to_char(v_agora, 'DDMM');

    IF nullif(trim(p_canal_nome), '') IS NULL THEN
        RAISE EXCEPTION 'Canal da separacao nao informado.';
    END IF;
    IF nullif(trim(p_id_interno), '') IS NULL THEN
        RAISE EXCEPTION 'Produto sem ID interno.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('iniciar_separacao:' || v_prefixo || ':' || v_ddmm));

    SELECT coalesce(max((regexp_match(s.separacao_id, '-([0-9]+)$'))[1]::integer), 0) + 1
      INTO v_sequencia
      FROM public.separacao s
     WHERE s.separacao_id ~ ('^SEP-' || v_prefixo || '-' || v_ddmm || '-[0-9]+$');

    v_separacao_id := 'SEP-' || v_prefixo || '-' || v_ddmm || '-' || lpad(v_sequencia::text, 2, '0');

    INSERT INTO public.separacao (
        separacao_id, pedido_referencia, canal_id, canal_nome, status,
        criado_por, criado_em, atualizado_em, observacao
    ) VALUES (
        v_separacao_id, NULL, coalesce(p_canal_id, ''), trim(p_canal_nome), 'em_separacao',
        coalesce(nullif(trim(p_criado_por), ''), 'N/A'), v_agora, v_agora,
        CASE WHEN coalesce(p_modo_rapido, false) THEN 'SAIDA_RAPIDA | CRIADA_NO_PRIMEIRO_BIP' ELSE 'SEPARACAO MANUAL POR NF | CRIADA_NO_PRIMEIRO_BIP' END
    );

    INSERT INTO public.separacao_itens (
        separacao_id, id_interno, ean, descricao, qtd_solicitada, qtd_separada, atualizado_em
    ) VALUES (
        v_separacao_id, trim(p_id_interno), nullif(trim(coalesce(p_ean, '')), ''),
        coalesce(p_descricao, ''), 1, 1, v_agora
    );

    RETURN jsonb_build_object(
        'ok', true,
        'separacao_id', v_separacao_id,
        'sequencia', v_sequencia,
        'criado_em', v_agora
    );
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_separacao_primeiro_item(text,text,text,text,boolean,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_separacao_primeiro_item(text,text,text,text,boolean,text,text,text) TO anon, authenticated;

COMMENT ON FUNCTION public.iniciar_separacao_primeiro_item(text,text,text,text,boolean,text,text,text)
IS 'Reserva atomicamente o proximo codigo e cria a separacao somente junto do primeiro item valido.';
