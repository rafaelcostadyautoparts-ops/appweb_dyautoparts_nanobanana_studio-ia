begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to service_role;

create table public.mercadolivre_pedidos (
  id bigint generated always as identity primary key,
  mercadolivre_account_id bigint not null,
  external_order_id text not null,
  status_mercadolivre text not null,
  status_identificacao text not null default 'novo',
  date_created timestamptz not null,
  date_closed timestamptz,
  shipping_id text,
  total_amount numeric(14,2) not null default 0,
  currency_id text not null,
  identificacao_iniciada_em timestamptz,
  separacao_id text,
  separacao_criada_em timestamptz,
  importado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint mercadolivre_pedidos_account_fkey foreign key (mercadolivre_account_id) references public.mercadolivre_accounts(id) on update restrict on delete restrict,
  constraint mercadolivre_pedidos_separacao_fkey foreign key (separacao_id) references public.separacao(separacao_id) on update restrict on delete restrict,
  constraint mercadolivre_pedidos_account_order_unique unique (mercadolivre_account_id, external_order_id),
  constraint mercadolivre_pedidos_external_order_check check (btrim(external_order_id) <> ''),
  constraint mercadolivre_pedidos_status_identificacao_check check (status_identificacao in ('novo','aguardando_identificacao','pronto_separacao')),
  constraint mercadolivre_pedidos_total_amount_check check (total_amount >= 0),
  constraint mercadolivre_pedidos_separacao_consistencia_check check (
    (separacao_id is null and separacao_criada_em is null) or
    (separacao_id is not null and separacao_criada_em is not null)
  )
);

create table public.mercadolivre_item_mappings (
  id bigint generated always as identity primary key,
  mercadolivre_account_id bigint not null,
  item_id text not null,
  variation_id text,
  variation_key text generated always as (coalesce(nullif(btrim(variation_id),''),'__SEM_VARIACAO__')) stored,
  current_version_id bigint,
  ativo boolean not null default true,
  last_seen_at timestamptz not null default now(),
  criado_por text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint mercadolivre_item_mappings_account_fkey foreign key (mercadolivre_account_id) references public.mercadolivre_accounts(id) on update restrict on delete restrict,
  constraint mercadolivre_item_mappings_item_id_check check (btrim(item_id) <> ''),
  constraint mercadolivre_item_mappings_identity_unique unique (mercadolivre_account_id,item_id,variation_key)
);

create table public.mercadolivre_item_mapping_versions (
  id bigint generated always as identity primary key,
  mapping_id bigint not null,
  versao integer not null,
  tipo_identificacao text not null,
  observacao text,
  criado_por text not null,
  criado_em timestamptz not null default now(),
  constraint mercadolivre_mapping_versions_mapping_fkey foreign key (mapping_id) references public.mercadolivre_item_mappings(id) on update restrict on delete restrict,
  constraint mercadolivre_mapping_versions_tipo_check check (tipo_identificacao in ('produto','kit')),
  constraint mercadolivre_mapping_versions_versao_check check (versao > 0),
  constraint mercadolivre_mapping_versions_mapping_versao_unique unique (mapping_id,versao),
  constraint mercadolivre_mapping_versions_mapping_id_id_unique unique (mapping_id,id)
);

alter table public.mercadolivre_item_mappings
  add constraint mercadolivre_item_mappings_current_version_fkey
  foreign key (id,current_version_id)
  references public.mercadolivre_item_mapping_versions(mapping_id,id)
  on update restrict on delete restrict;

create table public.mercadolivre_item_mapping_componentes (
  id bigint generated always as identity primary key,
  mapping_version_id bigint not null,
  produto_id uuid not null,
  quantidade_por_unidade integer not null,
  ordem integer not null default 1,
  criado_em timestamptz not null default now(),
  constraint mercadolivre_mapping_componentes_version_fkey foreign key (mapping_version_id) references public.mercadolivre_item_mapping_versions(id) on update restrict on delete restrict,
  constraint mercadolivre_mapping_componentes_produto_fkey foreign key (produto_id) references public.produtos(id) on update restrict on delete restrict,
  constraint mercadolivre_mapping_componentes_quantidade_check check (quantidade_por_unidade > 0),
  constraint mercadolivre_mapping_componentes_ordem_check check (ordem > 0),
  constraint mercadolivre_mapping_componentes_produto_unique unique (mapping_version_id,produto_id),
  constraint mercadolivre_mapping_componentes_ordem_unique unique (mapping_version_id,ordem)
);

create table public.mercadolivre_pedido_itens (
  id bigint generated always as identity primary key,
  pedido_id bigint not null,
  source_line_number integer not null,
  item_id text not null,
  variation_id text,
  variation_key text generated always as (coalesce(nullif(btrim(variation_id),''),'__SEM_VARIACAO__')) stored,
  titulo text not null,
  seller_sku text,
  ean text,
  quantidade_comprada integer not null,
  unit_price numeric(14,2),
  full_unit_price numeric(14,2),
  gross_price numeric(14,2),
  currency_id text,
  atributos jsonb not null default '{}'::jsonb,
  payload_original jsonb not null default '{}'::jsonb,
  mapping_id bigint,
  mapping_version_id bigint,
  importado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint mercadolivre_pedido_itens_pedido_fkey foreign key (pedido_id) references public.mercadolivre_pedidos(id) on update restrict on delete cascade,
  constraint mercadolivre_pedido_itens_mapping_version_fkey foreign key (mapping_id,mapping_version_id) references public.mercadolivre_item_mapping_versions(mapping_id,id) on update restrict on delete restrict,
  constraint mercadolivre_pedido_itens_mapping_consistencia_check check ((mapping_id is null and mapping_version_id is null) or (mapping_id is not null and mapping_version_id is not null)),
  constraint mercadolivre_pedido_itens_source_line_check check (source_line_number >= 0),
  constraint mercadolivre_pedido_itens_item_id_check check (btrim(item_id) <> ''),
  constraint mercadolivre_pedido_itens_quantidade_check check (quantidade_comprada > 0),
  constraint mercadolivre_pedido_itens_unit_price_check check (unit_price is null or unit_price >= 0),
  constraint mercadolivre_pedido_itens_full_unit_price_check check (full_unit_price is null or full_unit_price >= 0),
  constraint mercadolivre_pedido_itens_gross_price_check check (gross_price is null or gross_price >= 0),
  constraint mercadolivre_pedido_itens_atributos_object_check check (jsonb_typeof(atributos)='object'),
  constraint mercadolivre_pedido_itens_payload_object_check check (jsonb_typeof(payload_original)='object'),
  constraint mercadolivre_pedido_itens_source_line_unique unique (pedido_id,source_line_number)
);

create index mercadolivre_pedidos_status_data_idx on public.mercadolivre_pedidos(status_identificacao,date_created desc);
create index mercadolivre_pedidos_account_data_idx on public.mercadolivre_pedidos(mercadolivre_account_id,date_created desc);
create unique index mercadolivre_pedidos_separacao_unique_idx on public.mercadolivre_pedidos(separacao_id) where separacao_id is not null;
create index mercadolivre_pedido_itens_pedido_idx on public.mercadolivre_pedido_itens(pedido_id);
create index mercadolivre_pedido_itens_technical_identity_idx on public.mercadolivre_pedido_itens(item_id,variation_key);
create index mercadolivre_pedido_itens_mapping_idx on public.mercadolivre_pedido_itens(mapping_id,mapping_version_id) where mapping_version_id is not null;
create index mercadolivre_pedido_itens_nao_identificados_idx on public.mercadolivre_pedido_itens(pedido_id) where mapping_version_id is null;
create index mercadolivre_item_mappings_last_seen_idx on public.mercadolivre_item_mappings(last_seen_at desc);
create index mercadolivre_item_mappings_current_version_idx on public.mercadolivre_item_mappings(current_version_id) where current_version_id is not null;
create index mercadolivre_mapping_versions_mapping_idx on public.mercadolivre_item_mapping_versions(mapping_id,versao desc);
create index mercadolivre_mapping_componentes_version_idx on public.mercadolivre_item_mapping_componentes(mapping_version_id);
create index mercadolivre_mapping_componentes_produto_idx on public.mercadolivre_item_mapping_componentes(produto_id);

create function private.mapping_version_composicao_valida(p_mapping_id bigint,p_mapping_version_id bigint)
returns boolean language sql stable security invoker set search_path=''
as $$
  select exists (
    select 1 from public.mercadolivre_item_mapping_versions v
    where v.id=p_mapping_version_id and v.mapping_id=p_mapping_id
      and ((v.tipo_identificacao='produto' and (select count(*) from public.mercadolivre_item_mapping_componentes c where c.mapping_version_id=v.id)=1)
        or (v.tipo_identificacao='kit' and (select count(*) from public.mercadolivre_item_mapping_componentes c where c.mapping_version_id=v.id)>=2))
  );
$$;
revoke all on function private.mapping_version_composicao_valida(bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function private.mapping_version_composicao_valida(bigint,bigint) to service_role;

create function private.validar_current_mapping_version()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if new.current_version_id is not null and not private.mapping_version_composicao_valida(new.id,new.current_version_id) then
    raise exception 'current_version_id aponta para composição inválida ou vazia';
  end if;
  return new;
end;
$$;
revoke all on function private.validar_current_mapping_version() from public,anon,authenticated,service_role;
create trigger mercadolivre_item_mappings_validar_current_version_trigger before insert or update of current_version_id on public.mercadolivre_item_mappings for each row execute function private.validar_current_mapping_version();

create function private.validar_mapping_version_pedido_item()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare v_account_id bigint; v_mapping_account_id bigint; v_mapping_item_id text; v_mapping_variation_key text;
begin
  if new.mapping_version_id is null then return new; end if;
  if not private.mapping_version_composicao_valida(new.mapping_id,new.mapping_version_id) then raise exception 'O item não pode usar versão com composição inválida ou vazia'; end if;
  select p.mercadolivre_account_id into v_account_id from public.mercadolivre_pedidos p where p.id=new.pedido_id;
  select m.mercadolivre_account_id,m.item_id,m.variation_key into v_mapping_account_id,v_mapping_item_id,v_mapping_variation_key from public.mercadolivre_item_mappings m where m.id=new.mapping_id;
  if v_mapping_account_id is distinct from v_account_id or v_mapping_item_id is distinct from new.item_id or v_mapping_variation_key is distinct from new.variation_key then
    raise exception 'O mapping não corresponde à conta, item_id ou variation_id';
  end if;
  return new;
end;
$$;
revoke all on function private.validar_mapping_version_pedido_item() from public,anon,authenticated,service_role;
create trigger mercadolivre_pedido_itens_validar_mapping_trigger before insert or update of pedido_id,item_id,variation_id,mapping_id,mapping_version_id on public.mercadolivre_pedido_itens for each row execute function private.validar_mapping_version_pedido_item();

create function private.bloquear_alteracao_mapping_version()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin raise exception 'Versões são imutáveis; crie uma nova versão'; end; $$;
revoke all on function private.bloquear_alteracao_mapping_version() from public,anon,authenticated,service_role;
create trigger mercadolivre_mapping_versions_immutable_trigger before update or delete on public.mercadolivre_item_mapping_versions for each row execute function private.bloquear_alteracao_mapping_version();

create function private.proteger_componentes_mapping_version()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare v_version_id bigint;
begin
  v_version_id:=coalesce(new.mapping_version_id,old.mapping_version_id);
  if tg_op in ('UPDATE','DELETE') then raise exception 'Componentes são imutáveis; crie uma nova versão'; end if;
  if exists(select 1 from public.mercadolivre_item_mappings m where m.current_version_id=v_version_id)
     or exists(select 1 from public.mercadolivre_pedido_itens i where i.mapping_version_id=v_version_id) then
    raise exception 'Não é possível adicionar componentes a uma versão confirmada';
  end if;
  return new;
end;
$$;
revoke all on function private.proteger_componentes_mapping_version() from public,anon,authenticated,service_role;
create trigger mercadolivre_mapping_componentes_proteger_trigger before insert or update or delete on public.mercadolivre_item_mapping_componentes for each row execute function private.proteger_componentes_mapping_version();

create function private.congelar_pedido_item_apos_separacao()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if row(old.pedido_id,old.source_line_number,old.item_id,old.variation_id,old.titulo,old.seller_sku,old.ean,old.quantidade_comprada,old.unit_price,old.full_unit_price,old.gross_price,old.currency_id,old.atributos,old.payload_original,old.mapping_id,old.mapping_version_id,old.importado_em)
     is distinct from
     row(new.pedido_id,new.source_line_number,new.item_id,new.variation_id,new.titulo,new.seller_sku,new.ean,new.quantidade_comprada,new.unit_price,new.full_unit_price,new.gross_price,new.currency_id,new.atributos,new.payload_original,new.mapping_id,new.mapping_version_id,new.importado_em)
     and exists(select 1 from public.mercadolivre_pedidos p where p.id in(old.pedido_id,new.pedido_id) and p.separacao_id is not null) then
    raise exception using errcode='23514',message='Item pertencente a pedido separado não pode ser alterado',detail='Campos históricos, operacionais, snapshots e identificação estão congelados após a Separação.';
  end if;
  return new;
end;
$$;
revoke all on function private.congelar_pedido_item_apos_separacao() from public,anon,authenticated,service_role;
create trigger mercadolivre_pedido_itens_congelar_apos_separacao_trigger
before update of pedido_id,source_line_number,item_id,variation_id,titulo,seller_sku,ean,quantidade_comprada,unit_price,full_unit_price,gross_price,currency_id,atributos,payload_original,mapping_id,mapping_version_id,importado_em
on public.mercadolivre_pedido_itens for each row execute function private.congelar_pedido_item_apos_separacao();

create function private.recalcular_status_identificacao(p_pedido_id bigint)
returns void language plpgsql security definer set search_path=''
as $$
declare v_iniciada_em timestamptz; v_total integer; v_identificados integer; v_status text;
begin
  select p.identificacao_iniciada_em into v_iniciada_em from public.mercadolivre_pedidos p where p.id=p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  select count(*),count(*) filter(where i.mapping_version_id is not null and private.mapping_version_composicao_valida(i.mapping_id,i.mapping_version_id))
    into v_total,v_identificados from public.mercadolivre_pedido_itens i where i.pedido_id=p_pedido_id;
  v_status:=case when v_iniciada_em is null then 'novo' when v_total>0 and v_total=v_identificados then 'pronto_separacao' else 'aguardando_identificacao' end;
  update public.mercadolivre_pedidos set status_identificacao=v_status,atualizado_em=now() where id=p_pedido_id;
end;
$$;
revoke all on function private.recalcular_status_identificacao(bigint) from public,anon,authenticated,service_role;
grant execute on function private.recalcular_status_identificacao(bigint) to service_role;

create function private.recalcular_status_apos_item()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin perform private.recalcular_status_identificacao(coalesce(new.pedido_id,old.pedido_id)); return null; end; $$;
revoke all on function private.recalcular_status_apos_item() from public,anon,authenticated,service_role;
create trigger mercadolivre_pedido_itens_recalcular_status_trigger after insert or update of mapping_id,mapping_version_id or delete on public.mercadolivre_pedido_itens for each row execute function private.recalcular_status_apos_item();

create function private.recalcular_status_apos_inicio()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin if old.identificacao_iniciada_em is distinct from new.identificacao_iniciada_em then perform private.recalcular_status_identificacao(new.id); end if; return null; end; $$;
revoke all on function private.recalcular_status_apos_inicio() from public,anon,authenticated,service_role;
create trigger mercadolivre_pedidos_recalcular_apos_inicio_trigger after update of identificacao_iniciada_em on public.mercadolivre_pedidos for each row execute function private.recalcular_status_apos_inicio();

create function private.confirmar_identificacao(p_pedido_item_id bigint,p_tipo_identificacao text,p_componentes jsonb,p_criado_por text,p_observacao text default null)
returns table(mapping_id bigint,mapping_version_id bigint,versao integer)
language plpgsql security invoker set search_path=''
as $$
declare
  v_pedido_id bigint; v_account_id bigint; v_item_id text; v_variation_id text;
  v_mapping_id bigint; v_version_id bigint; v_versao integer;
  v_total integer; v_distintos integer;
begin
  if p_tipo_identificacao not in ('produto','kit') then raise exception 'Tipo de identificação inválido'; end if;
  if p_criado_por is null or btrim(p_criado_por)='' then raise exception 'Responsável é obrigatório'; end if;
  if p_componentes is null or jsonb_typeof(p_componentes)<>'array' then raise exception 'Componentes devem ser um array JSON'; end if;

  select i.pedido_id,p.mercadolivre_account_id,i.item_id,i.variation_id
    into v_pedido_id,v_account_id,v_item_id,v_variation_id
    from public.mercadolivre_pedido_itens i join public.mercadolivre_pedidos p on p.id=i.pedido_id
    where i.id=p_pedido_item_id for update of i,p;
  if not found then raise exception 'Item do pedido não encontrado'; end if;
  if exists(select 1 from public.mercadolivre_pedidos p where p.id=v_pedido_id and p.separacao_id is not null) then raise exception 'Pedido separado não pode ser reidentificado'; end if;

  select count(*),count(distinct x.produto_id) into v_total,v_distintos
    from jsonb_to_recordset(p_componentes) as x(produto_id uuid,quantidade_por_unidade integer);
  if p_tipo_identificacao='produto' and v_total<>1 then raise exception 'Produto deve possuir exatamente um componente'; end if;
  if p_tipo_identificacao='kit' and v_total<2 then raise exception 'Kit deve possuir pelo menos dois componentes'; end if;
  if v_total<>v_distintos then raise exception 'Produto duplicado na composição'; end if;
  if exists(select 1 from jsonb_to_recordset(p_componentes) as x(produto_id uuid,quantidade_por_unidade integer) where x.produto_id is null or x.quantidade_por_unidade is null or x.quantidade_por_unidade<=0) then raise exception 'Componentes exigem produto e quantidade positiva'; end if;

  insert into public.mercadolivre_item_mappings(mercadolivre_account_id,item_id,variation_id,last_seen_at,criado_por,criado_em,atualizado_em)
  values(v_account_id,v_item_id,v_variation_id,now(),p_criado_por,now(),now())
  on conflict(mercadolivre_account_id,item_id,variation_key)
  do update set last_seen_at=greatest(public.mercadolivre_item_mappings.last_seen_at,excluded.last_seen_at),atualizado_em=now()
  returning id into v_mapping_id;

  perform 1 from public.mercadolivre_item_mappings m where m.id=v_mapping_id for update;
  select coalesce(max(v.versao),0)+1 into v_versao from public.mercadolivre_item_mapping_versions v where v.mapping_id=v_mapping_id;

  insert into public.mercadolivre_item_mapping_versions(mapping_id,versao,tipo_identificacao,observacao,criado_por)
  values(v_mapping_id,v_versao,p_tipo_identificacao,p_observacao,p_criado_por) returning id into v_version_id;

  insert into public.mercadolivre_item_mapping_componentes(mapping_version_id,produto_id,quantidade_por_unidade,ordem)
  select v_version_id,x.produto_id,x.quantidade_por_unidade,x.ordem::integer
  from jsonb_to_recordset(p_componentes) with ordinality as x(produto_id uuid,quantidade_por_unidade integer,ordem bigint);

  if not private.mapping_version_composicao_valida(v_mapping_id,v_version_id) then raise exception 'Composição criada é inválida'; end if;
  update public.mercadolivre_item_mappings set current_version_id=v_version_id,atualizado_em=now() where id=v_mapping_id;
  update public.mercadolivre_pedido_itens set mapping_id=v_mapping_id,mapping_version_id=v_version_id,atualizado_em=now() where id=p_pedido_item_id;
  update public.mercadolivre_pedidos set identificacao_iniciada_em=coalesce(identificacao_iniciada_em,now()),atualizado_em=now() where id=v_pedido_id;
  return query select v_mapping_id,v_version_id,v_versao;
end;
$$;
revoke all on function private.confirmar_identificacao(bigint,text,jsonb,text,text) from public,anon,authenticated,service_role;
grant execute on function private.confirmar_identificacao(bigint,text,jsonb,text,text) to service_role;

create function public.mercadolivre_confirmar_identificacao(p_pedido_item_id bigint,p_tipo_identificacao text,p_componentes jsonb,p_criado_por text,p_observacao text default null)
returns table(mapping_id bigint,mapping_version_id bigint,versao integer)
language sql security invoker set search_path=''
as $$
  select * from private.confirmar_identificacao(p_pedido_item_id,p_tipo_identificacao,p_componentes,p_criado_por,p_observacao);
$$;
revoke all on function public.mercadolivre_confirmar_identificacao(bigint,text,jsonb,text,text) from public,anon,authenticated,service_role;
grant execute on function public.mercadolivre_confirmar_identificacao(bigint,text,jsonb,text,text) to service_role;

alter table public.mercadolivre_pedidos enable row level security;
alter table public.mercadolivre_pedido_itens enable row level security;
alter table public.mercadolivre_item_mappings enable row level security;
alter table public.mercadolivre_item_mapping_versions enable row level security;
alter table public.mercadolivre_item_mapping_componentes enable row level security;

revoke all on public.mercadolivre_pedidos from public,anon,authenticated,service_role;
revoke all on public.mercadolivre_pedido_itens from public,anon,authenticated,service_role;
revoke all on public.mercadolivre_item_mappings from public,anon,authenticated,service_role;
revoke all on public.mercadolivre_item_mapping_versions from public,anon,authenticated,service_role;
revoke all on public.mercadolivre_item_mapping_componentes from public,anon,authenticated,service_role;

grant select on public.mercadolivre_pedidos to service_role;
grant insert(mercadolivre_account_id,external_order_id,status_mercadolivre,date_created,date_closed,shipping_id,total_amount,currency_id,identificacao_iniciada_em,separacao_id,separacao_criada_em,importado_em,atualizado_em) on public.mercadolivre_pedidos to service_role;
grant update(status_mercadolivre,date_closed,shipping_id,total_amount,currency_id,identificacao_iniciada_em,separacao_id,separacao_criada_em,importado_em,atualizado_em) on public.mercadolivre_pedidos to service_role;
grant select,insert,update on public.mercadolivre_pedido_itens to service_role;
grant select,insert,update on public.mercadolivre_item_mappings to service_role;
grant select,insert on public.mercadolivre_item_mapping_versions to service_role;
grant select,insert on public.mercadolivre_item_mapping_componentes to service_role;

grant usage,select on sequence public.mercadolivre_pedidos_id_seq to service_role;
grant usage,select on sequence public.mercadolivre_pedido_itens_id_seq to service_role;
grant usage,select on sequence public.mercadolivre_item_mappings_id_seq to service_role;
grant usage,select on sequence public.mercadolivre_item_mapping_versions_id_seq to service_role;
grant usage,select on sequence public.mercadolivre_item_mapping_componentes_id_seq to service_role;

commit;
