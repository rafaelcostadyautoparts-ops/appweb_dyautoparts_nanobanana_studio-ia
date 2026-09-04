-- Migration: Alocação Atômica de Número Definitivo de Separação na Finalização
-- Garante unicidade transacional, sem queima de números em rascunhos descartados
-- e protegida contra concorrência entre dispositivos.

CREATE OR REPLACE FUNCTION public.alocar_numero_separacao_definitiva(
    p_draft_id text,
    p_canal_id text DEFAULT '',
    p_canal_nome text DEFAULT 'GERAL',
    p_criado_por text DEFAULT 'N/A'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_draft_id text := trim(coalesce(p_draft_id, ''));
    v_canal text := upper(trim(coalesce(p_canal_nome, 'GERAL')));
    v_prefixo text;
    v_ddmm text;
    v_sequencia integer := 0;
    v_separacao_id text;
    v_agora timestamp without time zone := timezone('America/Sao_Paulo', now());
    v_existe boolean;
BEGIN
    IF v_draft_id = '' THEN
        RAISE EXCEPTION 'Identificador de rascunho nao informado.';
    END IF;

    -- Se ja for um numero oficial valido e ja existir no banco, preserva (idempotencia)
    IF v_draft_id ~ '^SEP-[A-Z0-9]+-[0-9]{4}-[0-9]+$' THEN
        SELECT exists(SELECT 1 FROM public.separacao WHERE separacao_id = v_draft_id) INTO v_existe;
        IF v_existe THEN
            RETURN jsonb_build_object(
                'ok', true,
                'separacao_id', v_draft_id,
                'reutilizado', true
            );
        END IF;
    END IF;

    -- Extrai prefixo padronizado por canal
    IF v_canal LIKE '%MERCADO%LIVRE%' OR v_canal LIKE '%ML%' THEN
        v_prefixo := 'MERCADOLIVRE';
    ELSIF v_canal LIKE '%SHOPEE%' THEN
        v_prefixo := 'SHOPEE';
    ELSIF v_canal LIKE '%MAGALU%' OR v_canal LIKE '%MAGAZINE%' THEN
        v_prefixo := 'MAGALU';
    ELSIF v_canal LIKE '%AMAZON%' THEN
        v_prefixo := 'AMAZON';
    ELSIF v_canal LIKE '%BALCAO%' OR v_canal LIKE '%PDV%' THEN
        v_prefixo := 'BALCAO';
    ELSE
        v_prefixo := regexp_replace(v_canal, '[^A-Z0-9]', '', 'g');
        IF v_prefixo = '' THEN v_prefixo := 'OUTROS'; END IF;
    END IF;

    v_ddmm := to_char(v_agora, 'DDMM');

    -- Lock transacional exclusivo por canal e data (DDMM)
    PERFORM pg_advisory_xact_lock(hashtext('alocar_separacao:' || v_prefixo || ':' || v_ddmm));

    -- Calcula o maior sequencial ja utilizado historicamente para o canal e dia
    SELECT coalesce(max((regexp_match(s.separacao_id, '-([0-9]+)$'))[1]::integer), 0) + 1
      INTO v_sequencia
      FROM public.separacao s
     WHERE s.separacao_id ~ ('^SEP-' || v_prefixo || '-' || v_ddmm || '-[0-9]+$');

    v_separacao_id := 'SEP-' || v_prefixo || '-' || v_ddmm || '-' || lpad(v_sequencia::text, 2, '0');

    -- Se havia registros no banco sob o ID de rascunho anterior, migra para o ID oficial
    IF v_draft_id <> v_separacao_id THEN
        UPDATE public.separacao_itens
           SET separacao_id = v_separacao_id, atualizado_em = v_agora
         WHERE separacao_id = v_draft_id;

        UPDATE public.separacao_pacote_itens
           SET separacao_id = v_separacao_id
         WHERE separacao_id = v_draft_id;

        UPDATE public.separacao_pacotes
           SET separacao_id = v_separacao_id, atualizado_em = v_agora
         WHERE separacao_id = v_draft_id;

        UPDATE public.separacao
           SET separacao_id = v_separacao_id, atualizado_em = v_agora
         WHERE separacao_id = v_draft_id;

        IF NOT FOUND THEN
            INSERT INTO public.separacao (
                separacao_id, canal_id, canal_nome, status, criado_por, criado_em, atualizado_em
            ) VALUES (
                v_separacao_id, coalesce(nullif(p_canal_id, ''), 'GERAL'), coalesce(nullif(p_canal_nome, ''), 'GERAL'), 'aguardando', coalesce(nullif(p_criado_por, ''), 'N/A'), v_agora, v_agora
            ) ON CONFLICT (separacao_id) DO NOTHING;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'separacao_id', v_separacao_id,
        'sequencia', v_sequencia,
        'draft_id_anterior', v_draft_id,
        'criado_em', v_agora
    );
END;
$$;

REVOKE ALL ON FUNCTION public.alocar_numero_separacao_definitiva(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alocar_numero_separacao_definitiva(text,text,text,text) TO anon, authenticated;

COMMENT ON FUNCTION public.alocar_numero_separacao_definitiva(text,text,text,text)
IS 'Gera atomicamente com advisory lock o numero oficial definitivo de separacao exclusivamente no momento da finalizacao.';
