-- Migration: 20260916000400_mercadolivre_accounts_optional_meli_user_id.sql
-- Torna meli_user_id opcional em public.mercadolivre_accounts para permitir contas de outros marketplaces (Shopee, Magalu, etc.)

BEGIN;

ALTER TABLE public.mercadolivre_accounts ALTER COLUMN meli_user_id DROP NOT NULL;

COMMIT;
