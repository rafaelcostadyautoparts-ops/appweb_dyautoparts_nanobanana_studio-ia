-- Migration: Adiciona colunas para rastrear o operador responsável pela liquidação de contas a pagar
-- Ambiente: Somente Homologação (doklsgduslimidfbyngj)
-- Data: 2026-10-04

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS pago_por_id text NULL,
  ADD COLUMN IF NOT EXISTS pago_por_nome text NULL;

COMMENT ON COLUMN public.contas_pagar.pago_por_id IS 'Identificador do operador que executou a liquidação (currentUserId)';
COMMENT ON COLUMN public.contas_pagar.pago_por_nome IS 'Snapshot do nome do operador no momento da liquidação (currentUser)';
