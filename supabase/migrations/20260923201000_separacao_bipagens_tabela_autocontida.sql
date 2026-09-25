-- Migration: 20260923201000_separacao_bipagens_tabela_autocontida.sql
-- FASE 2A: Tabela Autocontida de Bipagens Físicas da Separação com local_origem (Para Produção)

BEGIN;

CREATE TABLE IF NOT EXISTS public.separacao_item_bipagens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    separacao_id text NOT NULL REFERENCES public.separacao(separacao_id) ON UPDATE CASCADE ON DELETE CASCADE,
    separacao_item_id uuid NOT NULL REFERENCES public.separacao_itens(id) ON UPDATE CASCADE ON DELETE CASCADE,
    produto_id uuid NOT NULL REFERENCES public.produtos(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    id_interno text NOT NULL,
    ean text NULL,
    quantidade integer NOT NULL CHECK (quantidade > 0),
    bipado_por text NULL,
    bipado_em timestamp with time zone DEFAULT now() NOT NULL,
    local_origem text NULL
);

COMMENT ON TABLE public.separacao_item_bipagens IS 'Bipagens fisicas reais realizadas na separacao de cada item com rastreabilidade de local_origem.';
COMMENT ON COLUMN public.separacao_item_bipagens.local_origem IS 'Local de estoque de onde o produto foi retirado na separação (ex: TERREO, PRIMEIRO_ANDAR, MOSTRUARIO).';

CREATE INDEX IF NOT EXISTS separacao_item_bipagens_sep_idx ON public.separacao_item_bipagens(separacao_id);
CREATE INDEX IF NOT EXISTS separacao_item_bipagens_item_idx ON public.separacao_item_bipagens(separacao_item_id);
CREATE INDEX IF NOT EXISTS separacao_item_bipagens_produto_idx ON public.separacao_item_bipagens(produto_id);
CREATE INDEX IF NOT EXISTS idx_separacao_item_bipagens_local_origem ON public.separacao_item_bipagens(local_origem);

ALTER TABLE public.separacao_item_bipagens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'separacao_item_bipagens' AND policyname = 'allow_all_separacao_item_bipagens') THEN
        CREATE POLICY allow_all_separacao_item_bipagens ON public.separacao_item_bipagens FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;

GRANT ALL ON TABLE public.separacao_item_bipagens TO anon, authenticated, service_role;

COMMIT;
