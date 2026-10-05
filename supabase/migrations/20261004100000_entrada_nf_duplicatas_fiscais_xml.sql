-- Migration: Estrutura Fiscal Imutável para Dados Financeiros e Duplicatas da NF-e (XML)
-- Data: 2026-10-04
-- Ambiente: Homologação

-- 1. Tabela para armazenar as duplicatas originais do XML da NF-e de forma imutável
CREATE TABLE IF NOT EXISTS public.entrada_nf_duplicatas_fiscais (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entrada_nf_id uuid NOT NULL REFERENCES public.entradas_nf(id) ON DELETE CASCADE,
    numero_duplicata text NOT NULL,
    vencimento_xml date,
    valor_xml numeric(15,2) NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    CONSTRAINT uq_entrada_nf_duplicatas_fiscais UNIQUE (entrada_nf_id, numero_duplicata)
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_entrada_nf_duplicatas_fiscais_entrada 
    ON public.entrada_nf_duplicatas_fiscais(entrada_nf_id);

-- 2. Habilitar RLS e criar políticas de acesso
ALTER TABLE public.entrada_nf_duplicatas_fiscais ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'entrada_nf_duplicatas_fiscais' 
          AND policyname = 'Acesso irrestrito autenticado e anon homologacao duplicatas fiscais'
    ) THEN
        CREATE POLICY "Acesso irrestrito autenticado e anon homologacao duplicatas fiscais" 
            ON public.entrada_nf_duplicatas_fiscais 
            FOR ALL 
            USING (true) 
            WITH CHECK (true);
    END IF;
END $$;

-- 3. Adicionar campos complementares de Fatura e Pagamento do XML na tabela entradas_nf
ALTER TABLE public.entradas_nf 
    ADD COLUMN IF NOT EXISTS fatura_xml_numero text,
    ADD COLUMN IF NOT EXISTS fatura_xml_valor_orig numeric(15,2),
    ADD COLUMN IF NOT EXISTS fatura_xml_valor_desc numeric(15,2),
    ADD COLUMN IF NOT EXISTS fatura_xml_valor_liq numeric(15,2),
    ADD COLUMN IF NOT EXISTS pagamentos_xml jsonb;
