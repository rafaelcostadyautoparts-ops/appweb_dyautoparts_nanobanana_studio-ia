-- Migration: 20260906221000_pedidos_snapshot_identificacao.sql
-- FASE 3A: Snapshot de Identificacao e Status Operacional de Pedidos

BEGIN;

-- 1. Adiciona coluna snapshot_componentes na tabela mercadolivre_pedido_itens
ALTER TABLE public.mercadolivre_pedido_itens
  ADD COLUMN IF NOT EXISTS snapshot_componentes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Atualiza constraint de status_identificacao em mercadolivre_pedidos
ALTER TABLE public.mercadolivre_pedidos
  DROP CONSTRAINT IF EXISTS mercadolivre_pedidos_status_identificacao_check;

ALTER TABLE public.mercadolivre_pedidos
  ADD CONSTRAINT mercadolivre_pedidos_status_identificacao_check
  CHECK (status_identificacao IN ('novo', 'pendente_identificacao', 'aguardando_identificacao', 'pronto_separacao'));

-- 3. Habilita RLS e Grants para acesso da aplicacao em mercadolivre_pedidos e mercadolivre_pedido_itens
ALTER TABLE public.mercadolivre_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadolivre_pedido_itens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mercadolivre_pedidos' AND policyname = 'allow_all_ml_pedidos') THEN
        CREATE POLICY allow_all_ml_pedidos ON public.mercadolivre_pedidos FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mercadolivre_pedido_itens' AND policyname = 'allow_all_ml_pedido_itens') THEN
        CREATE POLICY allow_all_ml_pedido_itens ON public.mercadolivre_pedido_itens FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;

GRANT ALL ON TABLE public.mercadolivre_pedidos TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.mercadolivre_pedido_itens TO anon, authenticated, service_role;

COMMIT;
