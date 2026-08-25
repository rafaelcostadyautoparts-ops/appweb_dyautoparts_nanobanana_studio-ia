-- Alinha o nome curto usado em etiquetas entre os ambientes.

ALTER TABLE public.produtos
    ADD COLUMN IF NOT EXISTS etiqueta_nome text;

COMMENT ON COLUMN public.produtos.etiqueta_nome IS
    'Nome curto opcional usado na impressao e visualizacao de etiquetas.';
