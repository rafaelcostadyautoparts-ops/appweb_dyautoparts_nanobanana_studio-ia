CREATE TABLE IF NOT EXISTS public.estoque_lotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id uuid NULL,
    id_interno text NOT NULL,
    origem_tipo text NOT NULL DEFAULT 'entrada_nf',
    origem_id uuid NULL,
    numero_nf text NULL,
    data_entrada timestamp with time zone DEFAULT now(),
    quantidade_inicial numeric(15,4) NOT NULL DEFAULT 0,
    quantidade_atual numeric(15,4) NOT NULL DEFAULT 0,
    custo_unitario numeric(15,4) NOT NULL DEFAULT 0,
    custo_total numeric(15,4) NOT NULL DEFAULT 0,
    local_estoque text NOT NULL DEFAULT 'terreo',
    status text NOT NULL DEFAULT 'ativo',
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_lotes_id_interno
ON public.estoque_lotes (id_interno);

CREATE INDEX IF NOT EXISTS idx_estoque_lotes_produto_id
ON public.estoque_lotes (produto_id);

CREATE INDEX IF NOT EXISTS idx_estoque_lotes_fifo
ON public.estoque_lotes (id_interno, local_estoque, data_entrada, criado_em);

CREATE INDEX IF NOT EXISTS idx_estoque_lotes_origem
ON public.estoque_lotes (origem_tipo, origem_id);

ALTER TABLE public.estoque_lotes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'estoque_lotes'
          AND policyname = 'allow_all_estoque_lotes'
    ) THEN
        CREATE POLICY allow_all_estoque_lotes
        ON public.estoque_lotes
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

GRANT ALL ON TABLE public.estoque_lotes TO anon, authenticated, service_role;
