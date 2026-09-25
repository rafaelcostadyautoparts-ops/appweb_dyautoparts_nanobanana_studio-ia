BEGIN;

-- 1. Remover trigger e funcao de protecao da edicao manual de pacotes entregues
DROP TRIGGER IF EXISTS trg_proteger_pacotes_entregues ON public.separacao;
DROP FUNCTION IF EXISTS public.proteger_pacotes_entregues_direct_update();

-- 2. Remover RPC de ajuste manual de pacotes entregues
DROP FUNCTION IF EXISTS public.ajustar_pacotes_entregues_finalizado(text,text,integer,text,text,text);

-- 3. Remover tabela de auditoria de pacotes entregues
DROP TABLE IF EXISTS public.separacao_pacotes_entregues_auditoria CASCADE;

-- 4. Remover coluna total_pacotes_entregues da tabela separacao
ALTER TABLE public.separacao
DROP COLUMN IF EXISTS total_pacotes_entregues;

NOTIFY pgrst, 'reload schema';
COMMIT;
