-- Migration: BLOCO 1 - Recebimento Fisico, Divergencias e Alocacao Multi-SKU de Entrada NF
-- Data: 2026-09-07

CREATE TABLE IF NOT EXISTS public.entrada_nf_item_recebimentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entrada_nf_id uuid NOT NULL REFERENCES public.entradas_nf(id) ON DELETE CASCADE,
    entrada_nf_item_id uuid NOT NULL REFERENCES public.entradas_nf_itens(id) ON DELETE CASCADE,
    produto_id uuid REFERENCES public.produtos(id),
    id_interno text NOT NULL,
    quantidade_fisica numeric(15,4) NOT NULL DEFAULT 0,
    quantidade_aceita numeric(15,4) NOT NULL DEFAULT 0,
    quantidade_recusada numeric(15,4) NOT NULL DEFAULT 0,
    local_destino text NOT NULL DEFAULT 'TERREO',
    situacao text NOT NULL DEFAULT 'CONFERE',
    motivo_divergencia text NULL,
    observacoes text NULL,
    criado_por text NULL,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_qtd_fisica_non_negative CHECK (quantidade_fisica >= 0),
    CONSTRAINT chk_qtd_aceita_non_negative CHECK (quantidade_aceita >= 0),
    CONSTRAINT chk_qtd_recusada_non_negative CHECK (quantidade_recusada >= 0),
    CONSTRAINT chk_qtd_soma_fisica CHECK (quantidade_aceita + quantidade_recusada = quantidade_fisica)
);

-- Indices para alta performance
CREATE INDEX IF NOT EXISTS idx_entrada_nf_item_recebimentos_entrada ON public.entrada_nf_item_recebimentos (entrada_nf_id);
CREATE INDEX IF NOT EXISTS idx_entrada_nf_item_recebimentos_item ON public.entrada_nf_item_recebimentos (entrada_nf_item_id);
CREATE INDEX IF NOT EXISTS idx_entrada_nf_item_recebimentos_produto ON public.entrada_nf_item_recebimentos (produto_id);
CREATE INDEX IF NOT EXISTS idx_entrada_nf_item_recebimentos_id_interno ON public.entrada_nf_item_recebimentos (id_interno);

-- Seguranca e RLS
ALTER TABLE public.entrada_nf_item_recebimentos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'entrada_nf_item_recebimentos' 
          AND policyname = 'allow_all_entrada_nf_item_recebimentos'
    ) THEN
        CREATE POLICY allow_all_entrada_nf_item_recebimentos ON public.entrada_nf_item_recebimentos 
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT ALL ON TABLE public.entrada_nf_item_recebimentos TO anon, authenticated, service_role;

COMMENT ON TABLE public.entrada_nf_item_recebimentos 
IS 'Armazena a camada de recebimento fisico, divergencias e alocacao multi-SKU por linha fiscal da Entrada NF.';
