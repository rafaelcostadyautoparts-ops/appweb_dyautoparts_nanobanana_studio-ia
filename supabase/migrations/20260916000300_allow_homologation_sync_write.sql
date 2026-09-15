-- Migration: 20260916000300_allow_homologation_sync_write.sql
-- Habilita permissão de escrita para carga em Homologação nas tabelas de contas e catálogo

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mercadolivre_accounts' AND policyname = 'allow_write_mercadolivre_accounts') THEN
        CREATE POLICY allow_write_mercadolivre_accounts ON public.mercadolivre_accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'marketplace_anuncios_catalogo' AND policyname = 'allow_write_marketplace_anuncios_catalogo') THEN
        CREATE POLICY allow_write_marketplace_anuncios_catalogo ON public.marketplace_anuncios_catalogo FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
    END IF;
END
$$;

GRANT ALL ON TABLE public.mercadolivre_accounts TO anon, authenticated;
GRANT ALL ON TABLE public.marketplace_anuncios_catalogo TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mercadolivre_accounts_id_seq TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.marketplace_anuncios_catalogo_id_seq TO anon, authenticated;

COMMIT;
