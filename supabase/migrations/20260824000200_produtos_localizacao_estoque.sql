-- Mantem o inventario por localizacao portavel entre producao e homologacao.
-- A coluna representa a posicao fisica cadastrada do produto (ex.: 1.2.C),
-- enquanto estoque_atual.local continua representando o local contabil (ex.: TERREO).

ALTER TABLE public.produtos
    ADD COLUMN IF NOT EXISTS localizacao_estoque text;

COMMENT ON COLUMN public.produtos.localizacao_estoque IS
    'Posicao fisica do produto dentro do local de estoque, usada no inventario por localizacao.';

CREATE INDEX IF NOT EXISTS produtos_localizacao_estoque_idx
    ON public.produtos (localizacao_estoque);
