create table if not exists public.comissoes_vendas (
  id_interno text primary key,
  id text,
  data_venda date not null default current_date,
  cliente text,
  produto_id text,
  produto_codigo text,
  produto_nome text not null,
  valor_bruto numeric(12,2) not null default 0,
  desconto_valor numeric(12,2) not null default 0,
  desconto_percentual numeric(8,2) not null default 0,
  valor_final numeric(12,2) not null default 0,
  forma_pagamento text not null default 'PIX',
  parcelas integer not null default 1 check (parcelas >= 1),
  taxa_percentual numeric(8,2) not null default 0,
  valor_taxa numeric(12,2) not null default 0,
  base_comissao numeric(12,2) not null default 0,
  percentual_comissao numeric(8,2) not null default 10,
  valor_comissao numeric(12,2) not null default 0,
  observacao text,
  status text not null default 'Pendente'
    check (status in ('Pendente', 'Pago', 'Cancelado')),
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comissoes_vendas_data_venda_idx
  on public.comissoes_vendas (data_venda desc);

create index if not exists comissoes_vendas_status_idx
  on public.comissoes_vendas (status);

create index if not exists comissoes_vendas_produto_codigo_idx
  on public.comissoes_vendas (produto_codigo);

alter table public.comissoes_vendas enable row level security;

drop policy if exists "allow anon read comissoes vendas" on public.comissoes_vendas;
create policy "allow anon read comissoes vendas"
  on public.comissoes_vendas for select
  to anon
  using (true);

drop policy if exists "allow anon write comissoes vendas" on public.comissoes_vendas;
create policy "allow anon write comissoes vendas"
  on public.comissoes_vendas for all
  to anon
  using (true)
  with check (true);
