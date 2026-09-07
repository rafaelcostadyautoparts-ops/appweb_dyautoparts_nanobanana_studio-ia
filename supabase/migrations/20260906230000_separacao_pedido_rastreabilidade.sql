-- Migration: 20260906230000_separacao_pedido_rastreabilidade.sql
-- FASE 3B: Rastreabilidade de Origem e Bipagem de SKUs Fisicos/Equivalentes na Separacao

BEGIN;

-- 1. Criar tabela de Origens do Item da Separacao (Rastreabilidade do Pedido)
CREATE TABLE IF NOT EXISTS public.separacao_item_origens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    separacao_id text NOT NULL REFERENCES public.separacao(separacao_id) ON UPDATE CASCADE ON DELETE CASCADE,
    separacao_item_id uuid NOT NULL REFERENCES public.separacao_itens(id) ON UPDATE CASCADE ON DELETE CASCADE,
    pedido_id bigint NOT NULL REFERENCES public.mercadolivre_pedidos(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    pedido_item_id bigint NOT NULL REFERENCES public.mercadolivre_pedido_itens(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    mapping_version_id bigint,
    componente_index integer NOT NULL DEFAULT 0,
    quantidade_solicitada integer NOT NULL CHECK (quantidade_solicitada > 0),
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Criar tabela de Bipagens Fisicas Reais na Separacao
CREATE TABLE IF NOT EXISTS public.separacao_item_bipagens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    separacao_id text NOT NULL REFERENCES public.separacao(separacao_id) ON UPDATE CASCADE ON DELETE CASCADE,
    separacao_item_id uuid NOT NULL REFERENCES public.separacao_itens(id) ON UPDATE CASCADE ON DELETE CASCADE,
    produto_id uuid NOT NULL REFERENCES public.produtos(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    id_interno text NOT NULL,
    ean text,
    quantidade integer NOT NULL CHECK (quantidade > 0),
    bipado_por text,
    bipado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. Indices para buscas performaticas
CREATE INDEX IF NOT EXISTS separacao_item_origens_sep_idx ON public.separacao_item_origens(separacao_id);
CREATE INDEX IF NOT EXISTS separacao_item_origens_item_idx ON public.separacao_item_origens(separacao_item_id);
CREATE INDEX IF NOT EXISTS separacao_item_origens_pedido_idx ON public.separacao_item_origens(pedido_id, pedido_item_id);

CREATE INDEX IF NOT EXISTS separacao_item_bipagens_sep_idx ON public.separacao_item_bipagens(separacao_id);
CREATE INDEX IF NOT EXISTS separacao_item_bipagens_item_idx ON public.separacao_item_bipagens(separacao_item_id);
CREATE INDEX IF NOT EXISTS separacao_item_bipagens_produto_idx ON public.separacao_item_bipagens(produto_id);

-- 4. RLS e Grants
ALTER TABLE public.separacao_item_origens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.separacao_item_bipagens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'separacao_item_origens' AND policyname = 'allow_all_separacao_item_origens') THEN
        CREATE POLICY allow_all_separacao_item_origens ON public.separacao_item_origens FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'separacao_item_bipagens' AND policyname = 'allow_all_separacao_item_bipagens') THEN
        CREATE POLICY allow_all_separacao_item_bipagens ON public.separacao_item_bipagens FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;

GRANT ALL ON TABLE public.separacao_item_origens TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.separacao_item_bipagens TO anon, authenticated, service_role;

COMMIT;
