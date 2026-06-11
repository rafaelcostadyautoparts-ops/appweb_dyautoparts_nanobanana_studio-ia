ALTER TABLE public.produtos
    ADD COLUMN IF NOT EXISTS unidade_compra text,
    ADD COLUMN IF NOT EXISTS unidade_estoque text,
    ADD COLUMN IF NOT EXISTS unidade_venda text,
    ADD COLUMN IF NOT EXISTS fator_conversao_compra numeric(15,6);

ALTER TABLE public.entradas_nf
    ADD COLUMN IF NOT EXISTS status_financeiro text DEFAULT 'gerado',
    ADD COLUMN IF NOT EXISTS tipo_condicao_financeira text DEFAULT 'parcelas_nf',
    ADD COLUMN IF NOT EXISTS observacao_financeira text,
    ADD COLUMN IF NOT EXISTS financeiro_configurado_em timestamp with time zone,
    ADD COLUMN IF NOT EXISTS financeiro_configurado_por text;

ALTER TABLE public.entradas_nf_itens
    ADD COLUMN IF NOT EXISTS unidade_nf text,
    ADD COLUMN IF NOT EXISTS fator_conversao_usado numeric(15,6) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS quantidade_nf_original numeric(15,6),
    ADD COLUMN IF NOT EXISTS quantidade_estoque_calculada numeric(15,6),
    ADD COLUMN IF NOT EXISTS custo_unitario_nf numeric(14,6),
    ADD COLUMN IF NOT EXISTS custo_unitario_estoque numeric(14,6),
    ADD COLUMN IF NOT EXISTS custo_total_real_item numeric(14,6);

ALTER TABLE public.contas_pagar
    ADD COLUMN IF NOT EXISTS numero_parcela integer,
    ADD COLUMN IF NOT EXISTS boleto_recebido boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS codigo_barras text,
    ADD COLUMN IF NOT EXISTS observacao text;

UPDATE public.entradas_nf_itens
   SET unidade_nf = COALESCE(unidade_nf, unidade),
       fator_conversao_usado = COALESCE(fator_conversao_usado, 1),
       quantidade_nf_original = COALESCE(quantidade_nf_original, quantidade),
       quantidade_estoque_calculada = COALESCE(quantidade_estoque_calculada, quantidade),
       custo_unitario_nf = COALESCE(custo_unitario_nf, custo_nota_unitario, valor_unitario),
       custo_unitario_estoque = COALESCE(custo_unitario_estoque, custo_real_unitario, valor_unitario),
       custo_total_real_item = COALESCE(custo_total_real_item, custo_real_total, valor_total)
 WHERE quantidade_nf_original IS NULL
    OR quantidade_estoque_calculada IS NULL
    OR custo_unitario_estoque IS NULL;

CREATE INDEX IF NOT EXISTS idx_entradas_nf_status_financeiro
ON public.entradas_nf (status_financeiro);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_status_origem
ON public.contas_pagar (status, origem);
