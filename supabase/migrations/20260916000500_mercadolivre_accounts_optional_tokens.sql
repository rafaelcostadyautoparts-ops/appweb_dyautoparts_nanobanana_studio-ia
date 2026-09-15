-- Migration: 20260916000500_mercadolivre_accounts_optional_tokens.sql
-- Torna colunas de tokens de acesso opcionais em public.mercadolivre_accounts para permitir contas vindas do SQL Server

BEGIN;

ALTER TABLE public.mercadolivre_accounts ALTER COLUMN access_token DROP NOT NULL;
ALTER TABLE public.mercadolivre_accounts ALTER COLUMN refresh_token DROP NOT NULL;
ALTER TABLE public.mercadolivre_accounts ALTER COLUMN token_expires_at DROP NOT NULL;

COMMIT;
