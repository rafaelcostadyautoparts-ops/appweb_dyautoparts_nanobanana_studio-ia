-- Padroniza precos de produto para exportacao e exibicao com duas casas decimais.
update public.produtos
   set preco_custo = round(coalesce(preco_custo, 0)::numeric, 2),
       preco_varejo = round(coalesce(preco_varejo, 0)::numeric, 2),
       preco_atacado = round(coalesce(preco_atacado, 0)::numeric, 2);

alter table public.produtos
    alter column preco_custo type numeric(12,2) using round(coalesce(preco_custo, 0)::numeric, 2),
    alter column preco_varejo type numeric(12,2) using round(coalesce(preco_varejo, 0)::numeric, 2),
    alter column preco_atacado type numeric(12,2) using round(coalesce(preco_atacado, 0)::numeric, 2);
