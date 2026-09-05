create table if not exists public.romaneios_retirada (
  id text primary key,
  dados jsonb not null,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint romaneios_retirada_dados_objeto check (jsonb_typeof(dados) = 'object'),
  constraint romaneios_retirada_sem_evidencias_sensiveis check (
    not (dados ?| array['assinatura','assinatura_entrega','foto_pacote','foto_devolucao','documento','email_destino'])
  )
);
create index if not exists idx_romaneios_retirada_criado_em on public.romaneios_retirada (criado_em desc);
alter table public.romaneios_retirada enable row level security;
revoke all on table public.romaneios_retirada from anon, authenticated;
create or replace function public.listar_romaneios_retirada(p_device_id text,p_usuario text)
returns table (id text,dados jsonb,criado_em timestamptz,atualizado_em timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.dispositivos_autorizados d where d.device_id=nullif(btrim(p_device_id),'') and d.ativo is true and lower(btrim(coalesce(d.nome_usuario,'')))=lower(btrim(coalesce(p_usuario,'')))) then raise exception 'Dispositivo nao autorizado para consultar romaneios.'; end if;
 return query select r.id,r.dados,r.criado_em,r.atualizado_em from public.romaneios_retirada r order by r.criado_em desc;
end; $$;
create or replace function public.salvar_romaneio_retirada(p_device_id text,p_usuario text,p_romaneio jsonb)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id text:=nullif(btrim(p_romaneio->>'id'),''); v_criado_em timestamptz; v_dados jsonb;
begin
 if not exists(select 1 from public.dispositivos_autorizados d where d.device_id=nullif(btrim(p_device_id),'') and d.ativo is true and lower(btrim(coalesce(d.nome_usuario,'')))=lower(btrim(coalesce(p_usuario,'')))) then raise exception 'Dispositivo nao autorizado para salvar romaneios.'; end if;
 if v_id is null or jsonb_typeof(p_romaneio)<>'object' then raise exception 'Romaneio invalido.'; end if;
 begin v_criado_em:=coalesce(nullif(p_romaneio->>'createdAt','')::timestamptz,now()); exception when others then v_criado_em:=now(); end;
 v_dados:=(p_romaneio-array['assinatura','assinatura_entrega','foto_pacote','foto_devolucao','documento','email_destino'])||jsonb_build_object('id',v_id);
 insert into public.romaneios_retirada(id,dados,criado_por,criado_em,atualizado_em) values(v_id,v_dados,p_usuario,v_criado_em,now())
 on conflict(id) do update set dados=excluded.dados,atualizado_em=now();
 return v_id;
end; $$;
revoke all on function public.listar_romaneios_retirada(text,text) from public;
revoke all on function public.salvar_romaneio_retirada(text,text,jsonb) from public;
grant execute on function public.listar_romaneios_retirada(text,text) to anon,authenticated;
grant execute on function public.salvar_romaneio_retirada(text,text,jsonb) to anon,authenticated;