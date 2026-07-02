-- Planejamento de Compras: parametros manuais de reposicao.
-- O saldo permanece exclusivamente em public.estoque_atual.

ALTER TABLE public.produtos
    ADD COLUMN IF NOT EXISTS estoque_minimo integer;

UPDATE public.produtos
   SET estoque_minimo = 0
 WHERE estoque_minimo IS NULL;

ALTER TABLE public.produtos
    ALTER COLUMN estoque_minimo SET DEFAULT 0,
    ALTER COLUMN estoque_minimo SET NOT NULL;

ALTER TABLE public.produtos
    ADD COLUMN IF NOT EXISTS estoque_ideal integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS modo_reposicao text NOT NULL DEFAULT 'MANUAL';

UPDATE public.produtos
   SET estoque_ideal = 0
 WHERE estoque_ideal IS NULL;

UPDATE public.produtos
   SET modo_reposicao = 'MANUAL'
 WHERE modo_reposicao IS NULL
    OR modo_reposicao NOT IN ('MANUAL', 'AUTOMATICO');

ALTER TABLE public.produtos
    ALTER COLUMN estoque_ideal SET DEFAULT 0,
    ALTER COLUMN estoque_ideal SET NOT NULL,
    ALTER COLUMN modo_reposicao SET DEFAULT 'MANUAL',
    ALTER COLUMN modo_reposicao SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'produtos_modo_reposicao_check'
           AND conrelid = 'public.produtos'::regclass
    ) THEN
        ALTER TABLE public.produtos
            ADD CONSTRAINT produtos_modo_reposicao_check
            CHECK (modo_reposicao IN ('MANUAL', 'AUTOMATICO'));
    END IF;
END
$$;

COMMENT ON COLUMN public.produtos.estoque_minimo IS
    'Limite manual que indica necessidade de reposicao.';

COMMENT ON COLUMN public.produtos.estoque_ideal IS
    'Quantidade manual desejada para aproximadamente um mes de cobertura.';

COMMENT ON COLUMN public.produtos.modo_reposicao IS
    'Modo de calculo da reposicao. AUTOMATICO reservado para versoes futuras.';
