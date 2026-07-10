create table if not exists public.devolucoes (
    id uuid primary key default gen_random_uuid(),
    tipo text not null default 'marketplace' check (tipo in ('marketplace', 'fornecedor')),
    canal text not null,
    pedido text not null,
    remetente text,
    cidade text,
    uf text,
    data_devolucao date not null default current_date,
    motivo text not null,
    impactou_reputacao boolean not null default false,
    marketplace_acionado boolean not null default false,
    observacao_acompanhamento text,
    saldo_marketplace numeric(14,2) not null default 0,
    status text not null default 'recebida' check (status in ('recebida', 'em_analise', 'resolvida', 'cancelada')),
    observacoes text,
    responsavel text,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create table if not exists public.devolucao_itens (
    id uuid primary key default gen_random_uuid(),
    devolucao_id uuid not null references public.devolucoes(id) on delete cascade,
    produto_id uuid references public.produtos(id) on delete set null,
    id_interno text,
    ean text,
    sku text,
    descricao text not null,
    categoria text,
    quantidade numeric(12,3) not null default 1 check (quantidade > 0),
    valor_unitario numeric(14,2) not null default 0 check (valor_unitario >= 0),
    valor_total numeric(14,2) generated always as (round((quantidade * valor_unitario)::numeric, 2)) stored,
    fornecedor text,
    devolveu_correto boolean not null default true,
    observacoes text,
    destino text not null default 'aguardando_analise'
        check (destino in ('aguardando_analise', 'disponivel', 'quarentena', 'garantia', 'divergencia', 'nao_recebido')),
    criado_em timestamptz not null default now()
);

create index if not exists idx_devolucoes_pedido on public.devolucoes (pedido);
create index if not exists idx_devolucoes_data_status on public.devolucoes (data_devolucao desc, status);
create index if not exists idx_devolucao_itens_devolucao on public.devolucao_itens (devolucao_id);
create index if not exists idx_devolucao_itens_produto on public.devolucao_itens (id_interno);

alter table public.devolucoes enable row level security;
alter table public.devolucao_itens enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'devolucoes' and policyname = 'allow_all_devolucoes') then
        create policy allow_all_devolucoes on public.devolucoes for all using (true) with check (true);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'devolucao_itens' and policyname = 'allow_all_devolucao_itens') then
        create policy allow_all_devolucao_itens on public.devolucao_itens for all using (true) with check (true);
    end if;
end
$$;

grant all on table public.devolucoes to anon, authenticated, service_role;
grant all on table public.devolucao_itens to anon, authenticated, service_role;

create or replace function public.salvar_devolucao_marketplace(p_devolucao jsonb, p_itens jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_devolucao_id uuid;
begin
    if coalesce(nullif(btrim(p_devolucao->>'pedido'), ''), '') = '' then
        raise exception 'O numero do pedido e obrigatorio';
    end if;
    if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
        raise exception 'Adicione ao menos um produto a devolucao';
    end if;

    insert into public.devolucoes (
        tipo, canal, pedido, remetente, cidade, uf, data_devolucao, motivo,
        impactou_reputacao, marketplace_acionado, observacao_acompanhamento, saldo_marketplace, status, observacoes, responsavel
    ) values (
        'marketplace', coalesce(nullif(btrim(p_devolucao->>'canal'), ''), 'MAGALU'),
        btrim(p_devolucao->>'pedido'), nullif(btrim(p_devolucao->>'remetente'), ''),
        nullif(btrim(p_devolucao->>'cidade'), ''), nullif(upper(btrim(p_devolucao->>'uf')), ''),
        coalesce(nullif(p_devolucao->>'data_devolucao', '')::date, current_date),
        coalesce(nullif(btrim(p_devolucao->>'motivo'), ''), 'Devolucao'),
        coalesce((p_devolucao->>'impactou_reputacao')::boolean, false),
        coalesce((p_devolucao->>'marketplace_acionado')::boolean, false),
        nullif(btrim(p_devolucao->>'observacao_acompanhamento'), ''),
        coalesce((p_devolucao->>'saldo_marketplace')::numeric, 0),
        case when coalesce((p_devolucao->>'marketplace_acionado')::boolean, false) then 'em_analise' else 'recebida' end,
        nullif(btrim(p_devolucao->>'observacoes'), ''), nullif(btrim(p_devolucao->>'responsavel'), '')
    ) returning id into v_devolucao_id;

    insert into public.devolucao_itens (
        devolucao_id, produto_id, id_interno, ean, sku, descricao, categoria,
        quantidade, valor_unitario, fornecedor, devolveu_correto, observacoes, destino
    )
    select v_devolucao_id, nullif(item->>'produto_id', '')::uuid,
        nullif(btrim(item->>'id_interno'), ''), nullif(btrim(item->>'ean'), ''),
        nullif(btrim(item->>'sku'), ''), coalesce(nullif(btrim(item->>'descricao'), ''), 'Produto sem descricao'),
        nullif(btrim(item->>'categoria'), ''), greatest(coalesce((item->>'quantidade')::numeric, 1), 0.001),
        greatest(coalesce((item->>'valor_unitario')::numeric, 0), 0), nullif(btrim(item->>'fornecedor'), ''),
        coalesce((item->>'devolveu_correto')::boolean, true), nullif(btrim(item->>'observacoes'), ''),
        case when coalesce((item->>'devolveu_correto')::boolean, true) then 'aguardando_analise' else 'divergencia' end
    from jsonb_array_elements(p_itens) item;

    return v_devolucao_id;
end;
$$;

grant execute on function public.salvar_devolucao_marketplace(jsonb, jsonb) to anon, authenticated, service_role;

create or replace function public.atualizar_status_devolucao(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_status not in ('recebida', 'em_analise', 'resolvida', 'cancelada') then
        raise exception 'Status de devolucao invalido';
    end if;
    update public.devolucoes set status = p_status, atualizado_em = now() where id = p_id;
end;
$$;

grant execute on function public.atualizar_status_devolucao(uuid, text) to anon, authenticated, service_role;

create or replace function public.atualizar_acompanhamento_devolucao(
    p_id uuid,
    p_marketplace_acionado boolean,
    p_observacao text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.devolucoes
       set marketplace_acionado = coalesce(p_marketplace_acionado, false),
           observacao_acompanhamento = nullif(btrim(coalesce(p_observacao, '')), ''),
           status = case
               when coalesce(p_marketplace_acionado, false)
                    and status not in ('resolvida', 'cancelada') then 'em_analise'
               else status
           end,
           atualizado_em = now()
     where id = p_id;
end;
$$;

grant execute on function public.atualizar_acompanhamento_devolucao(uuid, boolean, text)
    to anon, authenticated, service_role;


comment on table public.devolucoes is 'Cabecalho dos controles de devolucao de marketplace e fornecedor.';
comment on table public.devolucao_itens is 'Produtos vinculados as devolucoes; o cadastro nao altera estoque automaticamente.';
