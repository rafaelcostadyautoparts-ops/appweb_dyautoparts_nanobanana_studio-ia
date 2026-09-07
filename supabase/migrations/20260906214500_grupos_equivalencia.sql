-- Migration: 20260906214500_grupos_equivalencia.sql
-- FASE 1: Estrutura aditiva de Grupos de Equivalência

CREATE TABLE IF NOT EXISTS public.grupos_equivalencia (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_grupo text NOT NULL UNIQUE,
    nome text NOT NULL,
    descricao text,
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT grupos_equivalencia_codigo_check CHECK (btrim(codigo_grupo) <> ''),
    CONSTRAINT grupos_equivalencia_nome_check CHECK (btrim(nome) <> '')
);

CREATE TABLE IF NOT EXISTS public.grupo_equivalencia_skus (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id uuid NOT NULL REFERENCES public.grupos_equivalencia(id) ON DELETE CASCADE,
    produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    criado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT grupo_equivalencia_skus_grupo_produto_unique UNIQUE (grupo_id, produto_id),
    CONSTRAINT grupo_equivalencia_skus_produto_unique UNIQUE (produto_id)
);

CREATE INDEX IF NOT EXISTS idx_grupos_equivalencia_codigo ON public.grupos_equivalencia (codigo_grupo);
CREATE INDEX IF NOT EXISTS idx_grupo_equivalencia_skus_grupo ON public.grupo_equivalencia_skus (grupo_id);
CREATE INDEX IF NOT EXISTS idx_grupo_equivalencia_skus_produto ON public.grupo_equivalencia_skus (produto_id);

ALTER TABLE public.grupos_equivalencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_equivalencia_skus ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'grupos_equivalencia' AND policyname = 'allow_all_grupos_equivalencia') THEN
        CREATE POLICY allow_all_grupos_equivalencia ON public.grupos_equivalencia FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'grupo_equivalencia_skus' AND policyname = 'allow_all_grupo_equivalencia_skus') THEN
        CREATE POLICY allow_all_grupo_equivalencia_skus ON public.grupo_equivalencia_skus FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;

GRANT ALL ON TABLE public.grupos_equivalencia TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.grupo_equivalencia_skus TO anon, authenticated, service_role;
