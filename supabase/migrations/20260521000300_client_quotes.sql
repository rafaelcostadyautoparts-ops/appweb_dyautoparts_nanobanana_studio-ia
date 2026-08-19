create table if not exists public.companies (
  id text primary key,
  name text not null,
  legal_name text,
  cnpj text,
  email text,
  phone text,
  whatsapp text,
  logo_url text,
  pix_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_quotes (
  id_interno text primary key,
  quote_number text not null unique,
  created_at timestamptz not null default now(),
  expires_at date not null default (current_date + 7),
  status text not null default 'Rascunho'
    check (status in ('Rascunho', 'Aguardando aprovação', 'Aprovado', 'Cancelado', 'Expirado')),
  company_id text references public.companies(id),
  client_name text not null,
  client_cep text,
  client_address text,
  client_number text,
  client_complement text,
  client_neighborhood text,
  client_city text,
  client_state text,
  user_name text,
  payment_method text,
  notes text,
  availability_notes text,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  freight numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists client_quotes_created_at_idx on public.client_quotes (created_at desc);
create index if not exists client_quotes_status_idx on public.client_quotes (status);

alter table public.companies enable row level security;
alter table public.client_quotes enable row level security;

drop policy if exists "allow anon read companies" on public.companies;
create policy "allow anon read companies"
  on public.companies for select
  to anon
  using (true);

drop policy if exists "allow anon write companies" on public.companies;
create policy "allow anon write companies"
  on public.companies for all
  to anon
  using (true)
  with check (true);

drop policy if exists "allow anon read client quotes" on public.client_quotes;
create policy "allow anon read client quotes"
  on public.client_quotes for select
  to anon
  using (true);

drop policy if exists "allow anon write client quotes" on public.client_quotes;
create policy "allow anon write client quotes"
  on public.client_quotes for all
  to anon
  using (true)
  with check (true);

insert into public.companies (id, name, legal_name, cnpj, email, phone, whatsapp, logo_url)
values ('dy-autoparts', 'DY Auto Parts', 'DY Auto Parts', '', '', '', '', '')
on conflict (id) do nothing;
