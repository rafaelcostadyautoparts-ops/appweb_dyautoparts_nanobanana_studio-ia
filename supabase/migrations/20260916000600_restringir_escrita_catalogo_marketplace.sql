-- Migration: 20260916000600_restringir_escrita_catalogo_marketplace.sql
-- Restringe escrita nas tabelas de contas e catálogo de marketplace,
-- mantendo SELECT para anon/authenticated e mutação exclusiva para service_role.

BEGIN;

-- 1. Remover policies temporárias de escrita criadas na Fase 1B
DROP POLICY IF EXISTS allow_write_mercadolivre_accounts ON public.mercadolivre_accounts;
DROP POLICY IF EXISTS allow_write_marketplace_anuncios_catalogo ON public.marketplace_anuncios_catalogo;

-- 2. Revogar privilégios de mutação (INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) de anon e authenticated
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.mercadolivre_accounts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.marketplace_anuncios_catalogo FROM anon, authenticated;

-- 3. Garantir privilégio exclusivo de leitura (SELECT) para anon e authenticated
GRANT SELECT ON TABLE public.mercadolivre_accounts TO anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_anuncios_catalogo TO anon, authenticated;

-- 4. Revogar privilégios em sequences para anon e authenticated
REVOKE ALL ON SEQUENCE public.mercadolivre_accounts_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.marketplace_anuncios_catalogo_id_seq FROM anon, authenticated;

-- 5. Garantir privilégios completos para service_role
GRANT ALL ON TABLE public.mercadolivre_accounts TO service_role;
GRANT ALL ON TABLE public.marketplace_anuncios_catalogo TO service_role;
GRANT ALL ON SEQUENCE public.mercadolivre_accounts_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.marketplace_anuncios_catalogo_id_seq TO service_role;

COMMIT;
