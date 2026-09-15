-- Migration: 20260916000200_marketplace_anuncios_catalogo.sql
-- Cria a tabela neutra de catálogo espelho dos anúncios vindos do SQL Server (dbo.Items)

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_anuncios_catalogo (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    marketplace text NOT NULL,
    source_account_id text NOT NULL,
    account_id bigint NOT NULL,
    item_id text NOT NULL,
    title text NOT NULL,
    price numeric(14,2),
    available_quantity integer NOT NULL DEFAULT 0,
    status text,
    seller_sku text,
    thumbnail text,
    permalink text,
    has_variations boolean NOT NULL DEFAULT false,
    variations_data jsonb NOT NULL DEFAULT '[]'::jsonb,
    last_updated_sql timestamptz,
    ausente_na_origem boolean NOT NULL DEFAULT false,
    sincronizado_em timestamptz NOT NULL DEFAULT now(),

    -- Restrição UNIQUE da identidade do anúncio por conta e marketplace
    CONSTRAINT uq_catalogo_item UNIQUE (marketplace, source_account_id, item_id),

    -- FK simples para a conta operacional
    CONSTRAINT fk_catalogo_account FOREIGN KEY (account_id)
        REFERENCES public.mercadolivre_accounts(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    -- FK de consistência estrita: garante que (account_id, marketplace, source_account_id) correspondem exatamente à mesma conta em mercadolivre_accounts
    CONSTRAINT fk_catalogo_account_full FOREIGN KEY (account_id, marketplace, source_account_id)
        REFERENCES public.mercadolivre_accounts(id, platform, source_account_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- Índices Mínimos Justificados
CREATE INDEX IF NOT EXISTS idx_catalogo_acc_status ON public.marketplace_anuncios_catalogo (account_id, status);
CREATE INDEX IF NOT EXISTS idx_catalogo_busca ON public.marketplace_anuncios_catalogo (marketplace, item_id, seller_sku);
CREATE INDEX IF NOT EXISTS idx_catalogo_updated_sql ON public.marketplace_anuncios_catalogo (last_updated_sql DESC);

-- RLS e Segurança
ALTER TABLE public.marketplace_anuncios_catalogo ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'marketplace_anuncios_catalogo' AND policyname = 'allow_select_marketplace_anuncios_catalogo') THEN
        CREATE POLICY allow_select_marketplace_anuncios_catalogo ON public.marketplace_anuncios_catalogo FOR SELECT TO anon, authenticated USING (true);
    END IF;
END
$$;

GRANT SELECT ON TABLE public.marketplace_anuncios_catalogo TO anon, authenticated;
GRANT ALL ON TABLE public.marketplace_anuncios_catalogo TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.marketplace_anuncios_catalogo_id_seq TO service_role;

COMMIT;
