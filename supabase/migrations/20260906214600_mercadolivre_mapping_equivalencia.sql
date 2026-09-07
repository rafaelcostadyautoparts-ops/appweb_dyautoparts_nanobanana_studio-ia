-- Migration: 20260906214600_mercadolivre_mapping_equivalencia.sql
-- Adiciona suporte a Grupos de Equivalência em mercadolivre_item_mapping_componentes

BEGIN;

-- 1. Permite produto_id ser nulo quando grupo_equivalencia_id for informado
ALTER TABLE public.mercadolivre_item_mapping_componentes
  ALTER COLUMN produto_id DROP NOT NULL;

-- 2. Adiciona grupo_equivalencia_id e produto_referencia_id
ALTER TABLE public.mercadolivre_item_mapping_componentes
  ADD COLUMN IF NOT EXISTS grupo_equivalencia_id uuid REFERENCES public.grupos_equivalencia(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS produto_referencia_id uuid REFERENCES public.produtos(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

-- 3. Remove constraint antiga de uniqueness se existir
ALTER TABLE public.mercadolivre_item_mapping_componentes
  DROP CONSTRAINT IF EXISTS mercadolivre_mapping_componentes_produto_unique;

-- 4. Adiciona Check de referencia operacional única (OU produto_id OU grupo_equivalencia_id)
ALTER TABLE public.mercadolivre_item_mapping_componentes
  DROP CONSTRAINT IF EXISTS mercadolivre_mapping_componentes_ref_check;

ALTER TABLE public.mercadolivre_item_mapping_componentes
  ADD CONSTRAINT mercadolivre_mapping_componentes_ref_check
  CHECK (
    (produto_id IS NOT NULL AND grupo_equivalencia_id IS NULL)
    OR
    (produto_id IS NULL AND grupo_equivalencia_id IS NOT NULL)
  );

-- 5. Atualiza a funcao de validacao de versao de mapeamento
CREATE OR REPLACE FUNCTION private.mapping_version_composicao_valida(p_mapping_id bigint, p_mapping_version_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mercadolivre_item_mapping_versions v
    WHERE v.id = p_mapping_version_id AND v.mapping_id = p_mapping_id
      AND (
        (v.tipo_identificacao = 'produto' AND (SELECT COUNT(*) FROM public.mercadolivre_item_mapping_componentes c WHERE c.mapping_version_id = v.id) = 1)
        OR
        (v.tipo_identificacao = 'kit' AND (SELECT COUNT(*) FROM public.mercadolivre_item_mapping_componentes c WHERE c.mapping_version_id = v.id) >= 2)
      )
  );
$$;

-- 6. Habilita RLS e Grants para acesso das roles da aplicacao
ALTER TABLE public.mercadolivre_item_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadolivre_item_mapping_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadolivre_item_mapping_componentes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mercadolivre_item_mappings' AND policyname = 'allow_all_ml_item_mappings') THEN
        CREATE POLICY allow_all_ml_item_mappings ON public.mercadolivre_item_mappings FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mercadolivre_item_mapping_versions' AND policyname = 'allow_all_ml_item_mapping_versions') THEN
        CREATE POLICY allow_all_ml_item_mapping_versions ON public.mercadolivre_item_mapping_versions FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mercadolivre_item_mapping_componentes' AND policyname = 'allow_all_ml_item_mapping_componentes') THEN
        CREATE POLICY allow_all_ml_item_mapping_componentes ON public.mercadolivre_item_mapping_componentes FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;

GRANT ALL ON TABLE public.mercadolivre_item_mappings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.mercadolivre_item_mapping_versions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.mercadolivre_item_mapping_componentes TO anon, authenticated, service_role;

COMMIT;
