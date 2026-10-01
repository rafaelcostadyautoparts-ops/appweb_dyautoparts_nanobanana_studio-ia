-- Migration: 20261001100000_allow_separado_status_identificacao.sql
-- FASE 3.9: Permite status 'separado' em mercadolivre_pedidos
-- Homologação somente (doklsgduslimidfbyngj)

BEGIN;

ALTER TABLE public.mercadolivre_pedidos
  DROP CONSTRAINT IF EXISTS mercadolivre_pedidos_status_identificacao_check;

ALTER TABLE public.mercadolivre_pedidos
  ADD CONSTRAINT mercadolivre_pedidos_status_identificacao_check
  CHECK (status_identificacao IN ('novo', 'pendente_identificacao', 'aguardando_identificacao', 'pronto_separacao', 'separado'));

COMMIT;
