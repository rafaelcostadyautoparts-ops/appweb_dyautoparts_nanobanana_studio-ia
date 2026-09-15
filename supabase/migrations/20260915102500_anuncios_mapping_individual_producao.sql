-- Migration: 20260915102500_anuncios_mapping_individual_producao.sql
-- Infraestrutura cirurgica de banco para Mapeamento Individual de Anuncios (Producao)
-- Criacao isolada de:
--   1. Schema private (para funcoes internas de validacao)
--   2. public.mercadolivre_accounts (entidade pai de contas, sem tokens/OAuth/credenciais)
--   3. public.mercadolivre_item_mappings (cabecalho de mapeamento de anuncios)
--   4. public.mercadolivre_item_mapping_versions (historico de versionamento imutavel)
--   5. public.mercadolivre_item_mapping_componentes (composicao por Produto Exato, Grupo de Equivalencia ou KIT imutavel)
--   6. public.salvar_mercadolivre_item_mapping_atomico (RPC de salvamento transacional com lock de concorrencia)

-- 0. SCHEMA PRIVADO PARA VALIDACOES INTERNAS
CREATE SCHEMA IF NOT EXISTS private;

-- 1. TABELA DE CONTAS (Suporte a Entidade Pai)
CREATE TABLE IF NOT EXISTS public.mercadolivre_accounts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nickname text NOT NULL,
    seller_id text,
    source_account_id text UNIQUE,
    marketplace text NOT NULL DEFAULT 'MERCADO_LIVRE',
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mercadolivre_accounts_nickname_check CHECK (btrim(nickname) <> '')
);

-- 2. TABELA CABECALHO DE MAPEAMENTO
CREATE TABLE IF NOT EXISTS public.mercadolivre_item_mappings (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mercadolivre_account_id bigint NOT NULL,
    item_id text NOT NULL,
    variation_id text,
    variation_key text GENERATED ALWAYS AS (coalesce(nullif(btrim(variation_id), ''), '__SEM_VARIACAO__')) STORED,
    current_version_id bigint,
    ativo boolean NOT NULL DEFAULT true,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    criado_por text NOT NULL DEFAULT 'sistema',
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mercadolivre_item_mappings_account_fkey FOREIGN KEY (mercadolivre_account_id) REFERENCES public.mercadolivre_accounts(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT mercadolivre_item_mappings_item_id_check CHECK (btrim(item_id) <> ''),
    CONSTRAINT mercadolivre_item_mappings_identity_unique UNIQUE (mercadolivre_account_id, item_id, variation_key)
);

-- 3. TABELA DE VERSIONAMENTO DE MAPEAMENTO
CREATE TABLE IF NOT EXISTS public.mercadolivre_item_mapping_versions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mapping_id bigint NOT NULL,
    versao integer NOT NULL,
    tipo_identificacao text NOT NULL,
    observacao text,
    criado_por text NOT NULL DEFAULT 'sistema',
    criado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mercadolivre_item_mapping_versions_mapping_fkey FOREIGN KEY (mapping_id) REFERENCES public.mercadolivre_item_mappings(id) ON DELETE CASCADE,
    CONSTRAINT mercadolivre_item_mapping_versions_tipo_check CHECK (tipo_identificacao IN ('produto', 'grupo_equivalencia', 'kit')),
    CONSTRAINT mercadolivre_item_mapping_versions_unique_versao UNIQUE (mapping_id, versao)
);

-- ADICAO DA FK CIRCULAR CURRENT_VERSION_ID DE FORMA SEGURA
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'mercadolivre_item_mappings_current_version_fkey'
    ) THEN
        ALTER TABLE public.mercadolivre_item_mappings
            ADD CONSTRAINT mercadolivre_item_mappings_current_version_fkey 
            FOREIGN KEY (current_version_id) REFERENCES public.mercadolivre_item_mapping_versions(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. TABELA DE COMPONENTES DO MAPEAMENTO (PRODUTO EXATO / GRUPO / KIT)
CREATE TABLE IF NOT EXISTS public.mercadolivre_item_mapping_componentes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version_id bigint NOT NULL,
    produto_id uuid,
    grupo_equivalencia_id uuid,
    produto_referencia_id uuid,
    quantidade integer NOT NULL DEFAULT 1,
    ordem integer NOT NULL DEFAULT 1,
    criado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mercadolivre_item_mapping_comp_version_fkey FOREIGN KEY (version_id) REFERENCES public.mercadolivre_item_mapping_versions(id) ON DELETE CASCADE,
    CONSTRAINT mercadolivre_item_mapping_comp_produto_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE RESTRICT,
    CONSTRAINT mercadolivre_item_mapping_comp_grupo_fkey FOREIGN KEY (grupo_equivalencia_id) REFERENCES public.grupos_equivalencia(id) ON DELETE RESTRICT,
    CONSTRAINT mercadolivre_item_mapping_comp_prod_ref_fkey FOREIGN KEY (produto_referencia_id) REFERENCES public.produtos(id) ON DELETE RESTRICT,
    CONSTRAINT mercadolivre_item_mapping_comp_qty_check CHECK (quantidade > 0),
    CONSTRAINT mercadolivre_item_mapping_comp_exclusive_check CHECK (
        (produto_id IS NOT NULL AND grupo_equivalencia_id IS NULL) OR
        (produto_id IS NULL AND grupo_equivalencia_id IS NOT NULL)
    )
);

-- 5. FUNCAO PRIVADA DE VALIDACAO DE COMPOSICAO DE MAPEAMENTO
CREATE OR REPLACE FUNCTION private.mapping_version_composicao_valida(p_mapping_id bigint, p_version_id bigint)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_tipo text;
    v_total integer;
    v_distintos integer;
BEGIN
    SELECT tipo_identificacao INTO v_tipo 
      FROM public.mercadolivre_item_mapping_versions 
     WHERE id = p_version_id AND mapping_id = p_mapping_id;
    IF NOT FOUND THEN RETURN false; END IF;

    SELECT count(*), count(DISTINCT coalesce(produto_id::text, grupo_equivalencia_id::text))
      INTO v_total, v_distintos
      FROM public.mercadolivre_item_mapping_componentes
     WHERE version_id = p_version_id;

    IF v_total <= 0 THEN RETURN false; END IF;
    IF v_tipo = 'produto' AND v_total <> 1 THEN RETURN false; END IF;
    IF v_tipo = 'grupo_equivalencia' AND v_total <> 1 THEN RETURN false; END IF;
    IF v_tipo = 'kit' AND v_total < 2 THEN RETURN false; END IF;
    IF v_total <> v_distintos THEN RETURN false; END IF;

    RETURN true;
END;
$$;

-- 6. TRIGGERS DE IMUTABILIDADE DE HISTORICO E COMPONENTES
CREATE OR REPLACE FUNCTION private.bloquear_alteracao_mapping_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Versões de mapeamento são imutáveis e não podem ser alteradas ou excluídas.';
END;
$$;

CREATE OR REPLACE FUNCTION private.proteger_componentes_mapping_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Componentes de versões de mapeamento são imutáveis e não podem ser alterados ou excluídos.';
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bloquear_alteracao_mapping_version') THEN
        CREATE TRIGGER trg_bloquear_alteracao_mapping_version
            BEFORE UPDATE OR DELETE ON public.mercadolivre_item_mapping_versions
            FOR EACH ROW EXECUTE FUNCTION private.bloquear_alteracao_mapping_version();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_proteger_componentes_mapping_version') THEN
        CREATE TRIGGER trg_proteger_componentes_mapping_version
            BEFORE UPDATE OR DELETE ON public.mercadolivre_item_mapping_componentes
            FOR EACH ROW EXECUTE FUNCTION private.proteger_componentes_mapping_version();
    END IF;
END $$;

-- 7. RPC TRANSACIONAL ATOMICA COM LOCK DE CONCORRENCIA
CREATE OR REPLACE FUNCTION public.salvar_mercadolivre_item_mapping_atomico(
    p_account_id bigint,
    p_item_id text,
    p_variation_id text,
    p_tipo_identificacao text,
    p_componentes jsonb,
    p_observacao text DEFAULT NULL,
    p_usuario text DEFAULT 'sistema'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_item_id_clean text;
    v_variation_id_clean text;
    v_variation_key text;
    v_usuario_clean text;
    v_lock_key bigint;
    v_mapping_id bigint;
    v_proxima_versao integer;
    v_version_id bigint;
    v_comp record;
    v_ordem integer := 1;
    v_produto_id uuid;
    v_grupo_equivalencia_id uuid;
    v_produto_referencia_id uuid;
    v_quantidade integer;
BEGIN
    -- 1. Validacao de parametros obrigatorios
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'ID da conta (account_id) é obrigatório.';
    END IF;

    v_item_id_clean := nullif(btrim(p_item_id), '');
    IF v_item_id_clean IS NULL THEN
        RAISE EXCEPTION 'ID do item (item_id) é obrigatório.';
    END IF;

    IF p_tipo_identificacao NOT IN ('produto', 'grupo_equivalencia', 'kit') THEN
        RAISE EXCEPTION 'Tipo de identificação inválido: %. Valores permitidos: produto, grupo_equivalencia, kit.', p_tipo_identificacao;
    END IF;

    IF p_componentes IS NULL OR jsonb_typeof(p_componentes) <> 'array' OR jsonb_array_length(p_componentes) = 0 THEN
        RAISE EXCEPTION 'A lista de componentes é obrigatória e deve ser um array não vazio.';
    END IF;

    -- 2. Verificar existencia da conta
    IF NOT EXISTS (SELECT 1 FROM public.mercadolivre_accounts WHERE id = p_account_id) THEN
        RAISE EXCEPTION 'Conta Mercado Livre com ID % não foi encontrada.', p_account_id;
    END IF;

    v_variation_id_clean := nullif(btrim(p_variation_id), '');
    v_variation_key := coalesce(v_variation_id_clean, '__SEM_VARIACAO__');
    v_usuario_clean := coalesce(nullif(btrim(p_usuario), ''), 'sistema');

    -- 3. Lock de Concorrencia Advisory por Transacao (Protege inclusive a primeira criacao)
    v_lock_key := hashtext(p_account_id::text || ':' || v_item_id_clean || ':' || v_variation_key);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- 4. Localizar ou criar cabecalho com SELECT FOR UPDATE
    SELECT id INTO v_mapping_id
      FROM public.mercadolivre_item_mappings
     WHERE mercadolivre_account_id = p_account_id
       AND item_id = v_item_id_clean
       AND variation_key = v_variation_key
     FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.mercadolivre_item_mappings (
            mercadolivre_account_id,
            item_id,
            variation_id,
            criado_por
        ) VALUES (
            p_account_id,
            v_item_id_clean,
            v_variation_id_clean,
            v_usuario_clean
        ) RETURNING id INTO v_mapping_id;
    END IF;

    -- 5. Calcular proxima versao
    SELECT coalesce(max(versao), 0) + 1 INTO v_proxima_versao
      FROM public.mercadolivre_item_mapping_versions
     WHERE mapping_id = v_mapping_id;

    -- 6. Criar nova versao
    INSERT INTO public.mercadolivre_item_mapping_versions (
        mapping_id,
        versao,
        tipo_identificacao,
        observacao,
        criado_por
    ) VALUES (
        v_mapping_id,
        v_proxima_versao,
        p_tipo_identificacao,
        p_observacao,
        v_usuario_clean
    ) RETURNING id INTO v_version_id;

    -- 7. Inserir componentes e validar referencias
    FOR v_comp IN SELECT * FROM jsonb_to_recordset(p_componentes) AS x(
        produto_id text,
        grupo_equivalencia_id text,
        produto_referencia_id text,
        quantidade integer
    )
    LOOP
        v_produto_id := nullif(btrim(v_comp.produto_id), '')::uuid;
        v_grupo_equivalencia_id := nullif(btrim(v_comp.grupo_equivalencia_id), '')::uuid;
        v_produto_referencia_id := nullif(btrim(v_comp.produto_referencia_id), '')::uuid;
        v_quantidade := coalesce(v_comp.quantidade, 1);

        IF v_quantidade <= 0 THEN
            RAISE EXCEPTION 'Quantidade do componente deve ser maior que zero.';
        END IF;

        IF (v_produto_id IS NOT NULL AND v_grupo_equivalencia_id IS NOT NULL) OR
           (v_produto_id IS NULL AND v_grupo_equivalencia_id IS NULL) THEN
            RAISE EXCEPTION 'Componente deve ter exatamente um produto_id ou um grupo_equivalencia_id preenchido.';
        END IF;

        IF v_produto_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = v_produto_id) THEN
            RAISE EXCEPTION 'Produto com ID % não foi encontrado.', v_produto_id;
        END IF;

        IF v_grupo_equivalencia_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grupos_equivalencia WHERE id = v_grupo_equivalencia_id) THEN
            RAISE EXCEPTION 'Grupo de Equivalência com ID % não foi encontrado.', v_grupo_equivalencia_id;
        END IF;

        IF v_produto_referencia_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = v_produto_referencia_id) THEN
            RAISE EXCEPTION 'Produto de referência com ID % não foi encontrado.', v_produto_referencia_id;
        END IF;

        INSERT INTO public.mercadolivre_item_mapping_componentes (
            version_id,
            produto_id,
            grupo_equivalencia_id,
            produto_referencia_id,
            quantidade,
            ordem
        ) VALUES (
            v_version_id,
            v_produto_id,
            v_grupo_equivalencia_id,
            v_produto_referencia_id,
            v_quantidade,
            v_ordem
        );

        v_ordem := v_ordem + 1;
    END LOOP;

    -- 8. Validar composicao final da versao
    IF NOT private.mapping_version_composicao_valida(v_mapping_id, v_version_id) THEN
        RAISE EXCEPTION 'Composição de mapeamento inválida para o tipo % (mapping_id=%, version_id=%).', p_tipo_identificacao, v_mapping_id, v_version_id;
    END IF;

    -- 9. Atualizar current_version_id e timestamps no cabecalho
    UPDATE public.mercadolivre_item_mappings
       SET current_version_id = v_version_id,
           last_seen_at = now(),
           atualizado_em = now()
     WHERE id = v_mapping_id;

    -- 10. Retornar payload estruturado
    RETURN jsonb_build_object(
        'ok', true,
        'mapping_id', v_mapping_id,
        'version_id', v_version_id,
        'versao', v_proxima_versao,
        'item_id', v_item_id_clean,
        'variation_id', v_variation_id_clean,
        'variation_key', v_variation_key,
        'tipo_identificacao', p_tipo_identificacao,
        'current_version_id', v_version_id
    );
END;
$$;

-- 8. INDICES DE DESEMPENHO
CREATE INDEX IF NOT EXISTS idx_mercadolivre_item_mappings_lookup 
    ON public.mercadolivre_item_mappings (mercadolivre_account_id, item_id, variation_key);

CREATE INDEX IF NOT EXISTS idx_mercadolivre_item_mapping_versions_mapping 
    ON public.mercadolivre_item_mapping_versions (mapping_id, versao DESC);

CREATE INDEX IF NOT EXISTS idx_mercadolivre_item_mapping_componentes_version 
    ON public.mercadolivre_item_mapping_componentes (version_id);

-- 9. ROW LEVEL SECURITY (RLS) E POLICIES
ALTER TABLE public.mercadolivre_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadolivre_item_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadolivre_item_mapping_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadolivre_item_mapping_componentes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permite leitura em mercadolivre_accounts') THEN
        CREATE POLICY "Permite leitura em mercadolivre_accounts" 
            ON public.mercadolivre_accounts FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permite leitura de mercadolivre_item_mappings') THEN
        CREATE POLICY "Permite leitura de mercadolivre_item_mappings" 
            ON public.mercadolivre_item_mappings FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permite leitura de mercadolivre_item_mapping_versions') THEN
        CREATE POLICY "Permite leitura de mercadolivre_item_mapping_versions" 
            ON public.mercadolivre_item_mapping_versions FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permite leitura de mercadolivre_item_mapping_componentes') THEN
        CREATE POLICY "Permite leitura de mercadolivre_item_mapping_componentes" 
            ON public.mercadolivre_item_mapping_componentes FOR SELECT USING (true);
    END IF;
END $$;

-- 10. PERMISSOES (GRANTS E REVOKES SEGUROS)
-- Schema private nao possui permissao publica
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- Tabelas: anon possui APENAS SELECT. Gravacoes ocorrem exclusivamente via RPC SECURITY DEFINER
GRANT SELECT ON public.mercadolivre_accounts TO anon, authenticated, service_role;
GRANT ALL ON public.mercadolivre_accounts TO service_role;

GRANT SELECT ON public.mercadolivre_item_mappings TO anon, authenticated, service_role;
GRANT ALL ON public.mercadolivre_item_mappings TO service_role;

GRANT SELECT ON public.mercadolivre_item_mapping_versions TO anon, authenticated, service_role;
GRANT ALL ON public.mercadolivre_item_mapping_versions TO service_role;

GRANT SELECT ON public.mercadolivre_item_mapping_componentes TO anon, authenticated, service_role;
GRANT ALL ON public.mercadolivre_item_mapping_componentes TO service_role;

-- RPC Transacional Publica
GRANT EXECUTE ON FUNCTION public.salvar_mercadolivre_item_mapping_atomico TO anon, authenticated, service_role;
