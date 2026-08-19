CREATE TABLE IF NOT EXISTS public.etiquetas_lotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_lote text,
    modelo_etiqueta text,
    usuario_id text,
    usuario_nome text,
    status text DEFAULT 'rascunho',
    observacoes text,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    impresso_em timestamp with time zone NULL
);

CREATE TABLE IF NOT EXISTS public.etiquetas_lotes_itens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lote_id uuid REFERENCES public.etiquetas_lotes(id) ON DELETE CASCADE,
    produto_id text,
    id_interno text,
    descricao_base text,
    descricao_completa text,
    ean text,
    quantidade_etiquetas integer DEFAULT 1,
    texto_etiqueta text,
    codigo_barra text,
    ordem integer DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_etiquetas_lotes_atualizado
ON public.etiquetas_lotes (atualizado_em DESC);

CREATE INDEX IF NOT EXISTS idx_etiquetas_lotes_usuario
ON public.etiquetas_lotes (usuario_id, usuario_nome);

CREATE INDEX IF NOT EXISTS idx_etiquetas_lotes_status
ON public.etiquetas_lotes (status);

CREATE INDEX IF NOT EXISTS idx_etiquetas_lotes_itens_lote
ON public.etiquetas_lotes_itens (lote_id, ordem);

ALTER TABLE public.etiquetas_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etiquetas_lotes_itens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'etiquetas_lotes'
          AND policyname = 'allow_all_etiquetas_lotes'
    ) THEN
        CREATE POLICY allow_all_etiquetas_lotes
        ON public.etiquetas_lotes
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'etiquetas_lotes_itens'
          AND policyname = 'allow_all_etiquetas_lotes_itens'
    ) THEN
        CREATE POLICY allow_all_etiquetas_lotes_itens
        ON public.etiquetas_lotes_itens
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

GRANT ALL ON TABLE public.etiquetas_lotes TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.etiquetas_lotes_itens TO anon, authenticated, service_role;
