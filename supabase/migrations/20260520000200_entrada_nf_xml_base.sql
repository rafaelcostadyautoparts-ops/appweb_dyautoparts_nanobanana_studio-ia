CREATE TABLE IF NOT EXISTS public.fornecedores (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cnpj text NOT NULL UNIQUE,
    razao_social text,
    nome_fantasia text,
    inscricao_estadual text,
    telefone text,
    email text,
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    uf text,
    status text DEFAULT 'ativo',
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fornecedor_produtos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    fornecedor_id uuid,
    fornecedor_cnpj text NOT NULL,
    codigo_produto_fornecedor text NOT NULL,
    descricao_produto_fornecedor text,
    ean_fornecedor text,
    id_interno text,
    produto_id uuid,
    ultimo_custo numeric(12,2),
    ultima_quantidade numeric(12,3),
    ultima_compra_em date,
    ean_divergente boolean DEFAULT false,
    observacoes text,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    CONSTRAINT fornecedor_produtos_fornecedor_codigo_key UNIQUE (fornecedor_cnpj, codigo_produto_fornecedor)
);

CREATE TABLE IF NOT EXISTS public.contas_pagar (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    entrada_nf_id uuid,
    nf_id uuid,
    fornecedor_id uuid,
    fornecedor_cnpj text,
    cnpj_fornecedor text,
    fornecedor_nome text,
    numero_nf text,
    parcela text,
    vencimento date,
    data_vencimento date,
    valor numeric(12,2) DEFAULT 0,
    status text DEFAULT 'pendente',
    status_vencimento text DEFAULT 'em_aberto',
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS entrada_nf_id uuid;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS nf_id uuid;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS fornecedor_id uuid;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS fornecedor_cnpj text;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS cnpj_fornecedor text;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS fornecedor_nome text;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS numero_nf text;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS parcela text;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS tipo_lancamento text;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS vencimento date;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS data_vencimento date;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS valor numeric(12,2) DEFAULT 0;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendente';
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS status_vencimento text DEFAULT 'em_aberto';
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS data_pagamento date;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS forma_pagamento text;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS observacoes text;
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();

ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS chave_acesso text;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS fornecedor_id uuid;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS fornecedor_cnpj text;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS data_recebimento date;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS valor_produtos numeric(12,2) DEFAULT 0;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS valor_icms numeric(12,2) DEFAULT 0;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS valor_st numeric(12,2) DEFAULT 0;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS valor_ipi numeric(12,2) DEFAULT 0;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS xml_original text;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS tipo_lancamento text DEFAULT 'entrada_normal';
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS afeta_estoque boolean DEFAULT true;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS afeta_financeiro boolean DEFAULT true;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS estoque_finalizado boolean DEFAULT false;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS financeiro_lancado boolean DEFAULT false;
ALTER TABLE public.entradas_nf ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone;

UPDATE public.entradas_nf
   SET fornecedor_cnpj = cnpj_fornecedor
 WHERE fornecedor_cnpj IS NULL
   AND cnpj_fornecedor IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'entradas_nf_chave_acesso_key'
          AND conrelid = 'public.entradas_nf'::regclass
    ) THEN
        ALTER TABLE public.entradas_nf
            ADD CONSTRAINT entradas_nf_chave_acesso_key UNIQUE (chave_acesso);
    END IF;
END $$;

ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS entrada_nf_id uuid;
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS numero_item integer;
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS codigo_produto_fornecedor text;
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS descricao_produto_fornecedor text;
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS ean_fornecedor text;
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS ncm text;
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS cfop text;
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS id_interno text;
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS produto_id uuid;
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS ean_divergente boolean DEFAULT false;
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.entradas_nf_itens ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone;

UPDATE public.entradas_nf_itens
   SET entrada_nf_id = nf_id
 WHERE entrada_nf_id IS NULL
   AND nf_id IS NOT NULL;

UPDATE public.entradas_nf_itens
   SET id_interno = produto_id_interno
 WHERE id_interno IS NULL
   AND produto_id_interno IS NOT NULL;

UPDATE public.entradas_nf_itens
   SET codigo_produto_fornecedor = produto_id_interno
 WHERE codigo_produto_fornecedor IS NULL
   AND produto_id_interno IS NOT NULL;

UPDATE public.entradas_nf_itens
   SET descricao_produto_fornecedor = descricao_xml
 WHERE descricao_produto_fornecedor IS NULL
   AND descricao_xml IS NOT NULL;

UPDATE public.entradas_nf_itens
   SET ean_fornecedor = ean_xml
 WHERE ean_fornecedor IS NULL
   AND ean_xml IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fornecedores_cnpj ON public.fornecedores (cnpj);
CREATE INDEX IF NOT EXISTS idx_fornecedor_produtos_lookup ON public.fornecedor_produtos (fornecedor_cnpj, codigo_produto_fornecedor);
CREATE INDEX IF NOT EXISTS idx_entradas_nf_chave_acesso ON public.entradas_nf (chave_acesso);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_entrada_nf ON public.contas_pagar (entrada_nf_id);

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedor_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fornecedores' AND policyname = 'allow_all_fornecedores') THEN
        CREATE POLICY allow_all_fornecedores ON public.fornecedores FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fornecedor_produtos' AND policyname = 'allow_all_fornecedor_produtos') THEN
        CREATE POLICY allow_all_fornecedor_produtos ON public.fornecedor_produtos FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contas_pagar' AND policyname = 'allow_all_contas_pagar') THEN
        CREATE POLICY allow_all_contas_pagar ON public.contas_pagar FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT ALL ON TABLE public.fornecedores TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.fornecedor_produtos TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.contas_pagar TO anon, authenticated, service_role;
