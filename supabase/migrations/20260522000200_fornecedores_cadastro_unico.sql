ALTER TABLE public.fornecedores
ADD COLUMN IF NOT EXISTS estado text;

ALTER TABLE public.fornecedores
ADD COLUMN IF NOT EXISTS observacoes text;

ALTER TABLE public.fornecedores
ADD COLUMN IF NOT EXISTS whatsapp text;

ALTER TABLE public.fornecedores
ADD COLUMN IF NOT EXISTS contato_comercial text;

UPDATE public.fornecedores
   SET estado = COALESCE(estado, uf)
 WHERE estado IS NULL
   AND uf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fornecedores_razao_social
ON public.fornecedores (razao_social);

CREATE INDEX IF NOT EXISTS idx_fornecedores_nome_fantasia
ON public.fornecedores (nome_fantasia);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_fornecedor_id
ON public.contas_pagar (fornecedor_id);

CREATE INDEX IF NOT EXISTS idx_entradas_nf_fornecedor_id
ON public.entradas_nf (fornecedor_id);
