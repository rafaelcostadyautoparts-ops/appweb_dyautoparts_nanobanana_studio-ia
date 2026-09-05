-- Migration: Preservar Observacao e Pedido Referência na Alocação Definitiva de Separação
-- Remove a sobrecarga antiga de 4 parâmetros para evitar ambiguidade no PostgREST e define a função única de 5 parâmetros com default.

DROP FUNCTION IF EXISTS public.alocar_numero_separacao_definitiva(text, text, text, text);

CREATE OR REPLACE FUNCTION public.alocar_numero_separacao_definitiva(
    p_draft_id text,
    p_canal_id text DEFAULT ''::text,
    p_canal_nome text DEFAULT 'GERAL'::text,
    p_criado_por text DEFAULT 'N/A'::text,
    p_observacao text DEFAULT NULL::text
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

        -- Passo 1: Criar/Garantir a linha pai oficial em public.separacao (copiando do rascunho se existir)
        INSERT INTO public.separacao (
            separacao_id, pedido_referencia, canal_id, canal_nome, status, criado_por, criado_em, atualizado_em,
            observacao, total_produtos_separados, total_itens_separados, total_pacotes_montados
        )
        SELECT
            v_separacao_id,
            pedido_referencia,
            coalesce(nullif(p_canal_id, ''), canal_id, 'GERAL'),
            coalesce(nullif(p_canal_nome, ''), canal_nome, 'GERAL'),
            'aguardando',
            coalesce(nullif(p_criado_por, ''), criado_por, 'N/A'),
            criado_em,
            v_agora,
            coalesce(nullif(p_observacao, ''), observacao),
            total_produtos_separados,
            total_itens_separados,
            total_pacotes_montados
          FROM public.separacao
         WHERE separacao_id = v_draft_id;

        IF NOT FOUND THEN
            INSERT INTO public.separacao (
                separacao_id, canal_id, canal_nome, status, criado_por, criado_em, atualizado_em, observacao
            ) VALUES (
                v_separacao_id,
                coalesce(nullif(p_canal_id, ''), 'GERAL'),
                coalesce(nullif(p_canal_nome, ''), 'GERAL'),
                'aguardando',
                coalesce(nullif(p_criado_por, ''), 'N/A'),
                v_agora,
                v_agora,
                nullif(p_observacao, '')
            ) ON CONFLICT (separacao_id) DO NOTHING;
        END IF;

        -- Passo 2: Migrar itens da separação para o novo separacao_id
        UPDATE public.separacao_itens
           SET separacao_id = v_separacao_id, atualizado_em = v_agora
         WHERE separacao_id = v_draft_id;

        -- Passo 3: Criar pacotes sob o novo separacao_id (o pai oficial v_separacao_id já existe!)
        INSERT INTO public.separacao_pacotes (
            pacote_id, separacao_id, tipo, status, criado_por, criado_em, atualizado_em
        )
        SELECT
            pacote_id, v_separacao_id, tipo, status, criado_por, criado_em, v_agora
          FROM public.separacao_pacotes
         WHERE separacao_id = v_draft_id;

        -- Passo 4: Migrar os itens dos pacotes para o novo separacao_id
        UPDATE public.separacao_pacote_itens
           SET separacao_id = v_separacao_id
         WHERE separacao_id = v_draft_id;

        -- Passo 5: Excluir os pacotes sob o rascunho antigo
        DELETE FROM public.separacao_pacotes
         WHERE separacao_id = v_draft_id;

        -- Passo 6: Migrar tabelas filhas dinamicamente caso existam no schema
        IF to_regclass('public.mercadolivre_pedidos') IS NOT NULL THEN
            EXECUTE 'UPDATE public.mercadolivre_pedidos SET separacao_id = $1 WHERE separacao_id = $2'
            USING v_separacao_id, v_draft_id;
        END IF;

        IF to_regclass('public.separacao_agrupamento_correcoes') IS NOT NULL THEN
            EXECUTE 'UPDATE public.separacao_agrupamento_correcoes SET separacao_id = $1 WHERE separacao_id = $2'
            USING v_separacao_id, v_draft_id;
        END IF;

        IF to_regclass('public.separacao_item_cancelamentos') IS NOT NULL THEN
            EXECUTE 'UPDATE public.separacao_item_cancelamentos SET separacao_id = $1 WHERE separacao_id = $2'
            USING v_separacao_id, v_draft_id;
        END IF;

        -- Passo 7: Excluir a linha original do rascunho em public.separacao
        DELETE FROM public.separacao
         WHERE separacao_id = v_draft_id;

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

-- Compatibilidade e Permissões
REVOKE ALL ON FUNCTION public.alocar_numero_separacao_definitiva(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alocar_numero_separacao_definitiva(text,text,text,text,text) TO anon, authenticated;

COMMENT ON FUNCTION public.alocar_numero_separacao_definitiva(text,text,text,text,text)
IS 'Gera atomicamente com advisory lock o numero oficial definitivo de separacao preservando observacao (SAIDA_RAPIDA) e pedido_referencia durante a migracao do rascunho.';
