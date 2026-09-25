-- Migration: 20260918203000_entrada_nf_complementar_persistencia.sql
-- Descricao: Adiciona colunas complementar_id e incorporar_custo para suporte a lancamentos complementares na Entrada NF

ALTER TABLE public.contas_pagar
ADD COLUMN IF NOT EXISTS complementar_id uuid NULL,
ADD COLUMN IF NOT EXISTS incorporar_custo boolean NULL;

COMMENT ON COLUMN public.contas_pagar.complementar_id IS 'UUID de identificacao do grupo de lancamento complementar';
COMMENT ON COLUMN public.contas_pagar.incorporar_custo IS 'Flag indicando se o valor do lancamento complementar incorpora ao custo dos produtos da NF';
