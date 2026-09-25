-- Migration: 20260913100000_separacao_bipagens_local_origem.sql
-- FASE 2A: Rastreabilidade do Local de Retirada na Separação (local_origem)

BEGIN;

ALTER TABLE public.separacao_item_bipagens
    ADD COLUMN IF NOT EXISTS local_origem text NULL;

COMMENT ON COLUMN public.separacao_item_bipagens.local_origem IS
    'Local de estoque de onde o produto foi retirado na separação (ex: TERREO, PRIMEIRO_ANDAR, MOSTRUARIO). NULL para bipagens legadas.';

CREATE INDEX IF NOT EXISTS idx_separacao_item_bipagens_local_origem
    ON public.separacao_item_bipagens (local_origem);

COMMIT;
