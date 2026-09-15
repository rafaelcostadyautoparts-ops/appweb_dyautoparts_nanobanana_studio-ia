-- Migration: 20260916000100_mercadolivre_accounts_multicanal.sql
-- Adapta public.mercadolivre_accounts para suporte multicanal neutro (Mercado Livre, Shopee, etc.)

BEGIN;

-- 1. Adiciona colunas neutras se não existirem (SEM default fixo para platform)
ALTER TABLE public.mercadolivre_accounts
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS source_account_id text,
  ADD COLUMN IF NOT EXISTS seller_externo_id text,
  ADD COLUMN IF NOT EXISTS nome_operacional text;

-- 2. Adiciona constraint unique para identidade da conta em sincronizacao
ALTER TABLE public.mercadolivre_accounts
  DROP CONSTRAINT IF EXISTS mercadolivre_accounts_platform_source_unique;

ALTER TABLE public.mercadolivre_accounts
  ADD CONSTRAINT mercadolivre_accounts_platform_source_unique UNIQUE (platform, source_account_id);

-- 3. Adiciona constraint unique composta (id, platform, source_account_id) para FK de consistência do catálogo
ALTER TABLE public.mercadolivre_accounts
  DROP CONSTRAINT IF EXISTS mercadolivre_accounts_full_identity_unique;

ALTER TABLE public.mercadolivre_accounts
  ADD CONSTRAINT mercadolivre_accounts_full_identity_unique UNIQUE (id, platform, source_account_id);

-- 4. Garante RLS e Grants para a tabela
ALTER TABLE public.mercadolivre_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mercadolivre_accounts' AND policyname = 'allow_select_mercadolivre_accounts') THEN
        CREATE POLICY allow_select_mercadolivre_accounts ON public.mercadolivre_accounts FOR SELECT TO anon, authenticated USING (true);
    END IF;
END
$$;

GRANT SELECT ON TABLE public.mercadolivre_accounts TO anon, authenticated;
GRANT ALL ON TABLE public.mercadolivre_accounts TO service_role;

COMMIT;
