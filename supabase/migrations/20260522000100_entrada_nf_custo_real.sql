ALTER TABLE public.entradas_nf_itens
    ADD COLUMN IF NOT EXISTS custo_nota_unitario numeric(14,6),
    ADD COLUMN IF NOT EXISTS custo_nota_total numeric(14,6),
    ADD COLUMN IF NOT EXISTS valor_ipi numeric(14,6) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_icms numeric(14,6) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_icms_st numeric(14,6) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_frete_rateado numeric(14,6) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_seguro_rateado numeric(14,6) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_outras_despesas_rateado numeric(14,6) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_desconto_rateado numeric(14,6) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS custo_real_unitario numeric(14,6),
    ADD COLUMN IF NOT EXISTS custo_real_total numeric(14,6);

UPDATE public.entradas_nf_itens
   SET custo_nota_unitario = COALESCE(custo_nota_unitario, valor_unitario),
       custo_nota_total = COALESCE(custo_nota_total, valor_total),
       custo_real_unitario = COALESCE(custo_real_unitario, valor_unitario),
       custo_real_total = COALESCE(custo_real_total, valor_total)
 WHERE custo_nota_unitario IS NULL
    OR custo_nota_total IS NULL
    OR custo_real_unitario IS NULL
    OR custo_real_total IS NULL;
