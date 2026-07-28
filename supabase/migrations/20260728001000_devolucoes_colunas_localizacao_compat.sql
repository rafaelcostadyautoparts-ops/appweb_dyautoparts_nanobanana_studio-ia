-- Corrige instalacoes antigas em que a tabela devolucoes ja existia
-- sem as colunas de localizacao usadas pelas funcoes de salvamento.

alter table public.devolucoes
    add column if not exists cidade text,
    add column if not exists uf text;

comment on column public.devolucoes.cidade
    is 'Cidade informada na origem da devolucao, quando disponivel.';

comment on column public.devolucoes.uf
    is 'UF informada na origem da devolucao, quando disponivel.';

grant all on table public.devolucoes to anon, authenticated, service_role;

notify pgrst, 'reload schema';