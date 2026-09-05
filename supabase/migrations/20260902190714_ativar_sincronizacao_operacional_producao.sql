-- Instalação inicial em produção autorizada em 02/09/2026. Não altera dispositivos nem estoque.
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

-- Homologação: sessões automáticas aprovadas com a autorização de dispositivos existente.
create schema if not exists operacional_sync;
revoke all on schema operacional_sync from public;
grant usage on schema operacional_sync to anon, authenticated;
create table operacional_sync.sessoes (
 id uuid primary key default gen_random_uuid(), device_id text not null,
 segredo_hash text not null unique, auth_user_id uuid, aprovado boolean not null default false,
 tentativas integer not null default 0, bloqueado_ate timestamptz,
 criado_em timestamptz not null default now()
);
alter table operacional_sync.sessoes enable row level security;
revoke all on operacional_sync.sessoes from anon,authenticated;
create table public.entrada_nf_rascunhos (
 id text primary key check (id ~ '^[0-9]{44}$'), dados jsonb not null check(jsonb_typeof(dados)='object'),
 revisao bigint not null default 1, status_sync text not null default 'ativo' check(status_sync in ('ativo','descartado','importado')),
 operacao_id uuid not null, atualizado_em timestamptz not null default now(), criado_em timestamptz not null default now(),
 atualizado_por text not null
);
alter table public.entrada_nf_rascunhos enable row level security;
revoke all on public.entrada_nf_rascunhos from anon,authenticated;
alter table public.romaneios_retirada
 add column revisao bigint not null default 1,
 add column status_sync text not null default 'ativo' check(status_sync='ativo'),
 add column operacao_id uuid,
 add column atualizado_por text;
create table operacional_sync.romaneio_evidencias (
 romaneio_id text primary key references public.romaneios_retirada(id),
 dados jsonb not null check(jsonb_typeof(dados)='object')
);
alter table operacional_sync.romaneio_evidencias enable row level security;
revoke all on operacional_sync.romaneio_evidencias from anon,authenticated;
-- A API antiga não possui revisão nem credencial de sessão: não pode contornar a nova proteção.
create function operacional_sync.sessao(p_token text, p_exigir_aprovacao boolean default true)
returns text language plpgsql security definer set search_path='' as $$
declare s operacional_sync.sessoes%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception using errcode='42501',message='Sessão de sincronização inválida.'; end if;
 select * into s from operacional_sync.sessoes where segredo_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found or (s.auth_user_id is not null and s.auth_user_id is distinct from auth.uid()) then
  raise exception using errcode='42501',message='Sessão de sincronização inválida.';
 end if;
 if p_exigir_aprovacao and (not s.aprovado or not exists(select 1 from public.dispositivos_autorizados d where d.device_id=s.device_id and d.ativo and d.status='aprovado')) then
  raise exception using errcode='42501',message='Autorize a sincronização deste aparelho com o administrador.';
 end if;
 return s.device_id;
end $$;
create function operacional_sync.registrar(p_device_id text,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s operacional_sync.sessoes%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' or nullif(btrim(p_device_id),'') is null or length(p_device_id)>200 then raise exception 'Sessão inválida.'; end if;
 if not exists(select 1 from public.dispositivos_autorizados where device_id=p_device_id) then raise exception using errcode='42501',message='Cadastre e aprove este aparelho em Segurança.'; end if;
 insert into operacional_sync.sessoes(device_id,segredo_hash,auth_user_id) values(p_device_id,encode(extensions.digest(p_token,'sha256'),'hex'),auth.uid()) on conflict(segredo_hash) do nothing;
 perform operacional_sync.sessao(p_token,false);
 select * into s from operacional_sync.sessoes where segredo_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if s.device_id<>p_device_id then raise exception using errcode='42501',message='Aparelho incompatível.'; end if;
 return jsonb_build_object('aprovado',s.aprovado and exists(select 1 from public.dispositivos_autorizados where device_id=s.device_id and ativo and status='aprovado'));
end $$;
create function operacional_sync.autorizar(p_token text,p_usuario text,p_pin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_device text; s operacional_sync.sessoes%rowtype;
begin
 v_device:=operacional_sync.sessao(p_token,false);
 select * into s from operacional_sync.sessoes where segredo_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if s.bloqueado_ate>now() then return jsonb_build_object('erro','Aguarde 15 minutos antes de tentar novamente.'); end if;
 begin
  perform public.alterar_acesso_dispositivo(v_device,p_usuario,v_device,'aprovar',p_pin);
 exception when others then
  update operacional_sync.sessoes set tentativas=case when tentativas>=4 then 0 else tentativas+1 end,bloqueado_ate=case when tentativas>=4 then now()+interval '15 minutes' else null end where id=s.id;
  return jsonb_build_object('erro','Autorização recusada. Use um administrador e o PIN mestre existente.');
 end;
 update operacional_sync.sessoes set aprovado=true,tentativas=0,bloqueado_ate=null where id=s.id;
 return jsonb_build_object('aprovado',true);
end $$;
create function operacional_sync.tabela(p_fluxo text) returns text language plpgsql immutable set search_path='' as $$
begin
 if p_fluxo='nf' then return 'public.entrada_nf_rascunhos'; end if;
 if p_fluxo='romaneio' then return 'public.romaneios_retirada'; end if;
 raise exception 'Fluxo inválido.';
end $$;
create function operacional_sync.listar(p_token text,p_fluxo text,p_depois text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform operacional_sync.sessao(p_token);
 execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from (select id,dados,revisao,status_sync,atualizado_em from %s where id>$1 order by id limit 100) x',operacional_sync.tabela(p_fluxo)) into v_result using p_depois;
 return v_result;
end $$;
create function operacional_sync.obter(p_token text,p_fluxo text,p_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 perform operacional_sync.sessao(p_token);
 execute format('select jsonb_build_object(''id'',id,''dados'',dados,''revisao'',revisao,''status_sync'',status_sync,''atualizado_em'',atualizado_em) from %s where id=$1',operacional_sync.tabela(p_fluxo)) into r using p_id;
 if r is not null and p_fluxo='romaneio' then r:=jsonb_set(r,'{dados}',(r->'dados')||coalesce((select dados from operacional_sync.romaneio_evidencias where romaneio_id=p_id),'{}'::jsonb)); end if;
 return r;
end $$;
create function operacional_sync.salvar(p_token text,p_fluxo text,p_id text,p_dados jsonb,p_revisao bigint,p_operacao uuid,p_status text default 'ativo') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_device text; t text; r record; v_dados jsonb; v_evidencias jsonb;
 v_campos text[]:=array['assinatura','assinatura_entrega','foto_pacote','foto_devolucao','documento','email_destino'];
begin
 v_device:=operacional_sync.sessao(p_token); t:=operacional_sync.tabela(p_fluxo);
 if p_id is null or length(p_id)>200 or jsonb_typeof(p_dados) is distinct from 'object' or p_revisao<0 or p_revisao is null or p_operacao is null then raise exception 'Registro inválido.'; end if;
 if octet_length(p_dados::text)>12000000 then raise exception 'Registro excede 12 MB. Reduza o tamanho das imagens.'; end if;
 if p_status not in ('ativo','descartado','importado') or (p_fluxo='romaneio' and p_status<>'ativo') then raise exception 'Estado inválido.'; end if;
 if p_fluxo='nf' and p_status='ativo' and exists(select 1 from public.entradas_nf where chave_acesso=p_id) then raise exception using errcode='PT409',message='Esta NF já foi importada. Consulte as notas abertas ou o histórico.'; end if;
 v_dados:=p_dados;
 if p_fluxo='nf' then v_dados:=v_dados||jsonb_build_object('chave_acesso',p_id); else
  v_dados:=(p_dados-v_campos)||jsonb_build_object('id',p_id);
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_evidencias from jsonb_each(p_dados) where key=any(v_campos);
 end if;
 -- Lock por registro também serializa a primeira gravação de dois aparelhos.
 perform pg_advisory_xact_lock(hashtextextended(p_fluxo||':'||p_id,0));
 execute format('select revisao,operacao_id,status_sync from %s where id=$1 for update',t) into r using p_id;
 if r.revisao is not null then
  if r.operacao_id=p_operacao then return operacional_sync.obter(p_token,p_fluxo,p_id); end if;
  if r.revisao<>p_revisao or r.status_sync<>'ativo' then raise exception using errcode='PT409',message='Outro aparelho alterou ou encerrou este registro. Sua cópia foi preservada.'; end if;
  execute format('update %s set dados=$2,revisao=revisao+1,status_sync=$3,operacao_id=$4,atualizado_em=clock_timestamp(),atualizado_por=$5 where id=$1',t) using p_id,v_dados,p_status,p_operacao,v_device;
 else
  if p_revisao<>0 then raise exception using errcode='PT409',message='Registro remoto não encontrado. Sua cópia foi preservada.'; end if;
  execute format('insert into %s(id,dados,revisao,status_sync,operacao_id,atualizado_por) values($1,$2,1,$3,$4,$5)',t) using p_id,v_dados,p_status,p_operacao,v_device;
 end if;
 if p_fluxo='romaneio' then
  insert into operacional_sync.romaneio_evidencias(romaneio_id,dados) values(p_id,v_evidencias)
  on conflict(romaneio_id) do update set dados=operacional_sync.romaneio_evidencias.dados||excluded.dados;
 end if;
 return operacional_sync.obter(p_token,p_fluxo,p_id);
end $$;
-- Somente wrappers invoker são expostos. Tabelas e credenciais não têm acesso direto.
create function public.registrar_sessao_operacional(p_device_id text,p_token text) returns jsonb language sql security invoker set search_path='' as $$select operacional_sync.registrar(p_device_id,p_token)$$;
create function public.autorizar_sessao_operacional(p_token text,p_usuario text,p_pin text) returns jsonb language sql security invoker set search_path='' as $$select operacional_sync.autorizar(p_token,p_usuario,p_pin)$$;
create function public.listar_registros_operacionais(p_token text,p_fluxo text,p_depois text default '') returns jsonb language sql security invoker set search_path='' as $$select operacional_sync.listar(p_token,p_fluxo,p_depois)$$;
create function public.obter_registro_operacional(p_token text,p_fluxo text,p_id text) returns jsonb language sql security invoker set search_path='' as $$select operacional_sync.obter(p_token,p_fluxo,p_id)$$;
create function public.salvar_registro_operacional(p_token text,p_fluxo text,p_id text,p_dados jsonb,p_revisao bigint,p_operacao uuid,p_status text default 'ativo') returns jsonb language sql security invoker set search_path='' as $$select operacional_sync.salvar(p_token,p_fluxo,p_id,p_dados,p_revisao,p_operacao,p_status)$$;
revoke all on all functions in schema operacional_sync from public;
grant execute on all functions in schema operacional_sync to anon,authenticated;
revoke all on function public.registrar_sessao_operacional(text,text),public.autorizar_sessao_operacional(text,text,text),public.listar_registros_operacionais(text,text,text),public.obter_registro_operacional(text,text,text),public.salvar_registro_operacional(text,text,text,jsonb,bigint,uuid,text) from public;
grant execute on function public.registrar_sessao_operacional(text,text),public.autorizar_sessao_operacional(text,text,text),public.listar_registros_operacionais(text,text,text),public.obter_registro_operacional(text,text,text),public.salvar_registro_operacional(text,text,text,jsonb,bigint,uuid,text) to anon,authenticated;

create table operacional_sync.autorizacao_limites (
 device_id text primary key, tentativas integer not null default 0, bloqueado_ate timestamptz
);
alter table operacional_sync.autorizacao_limites enable row level security;
revoke all on operacional_sync.autorizacao_limites from anon,authenticated;
create or replace function operacional_sync.autorizar(p_token text,p_usuario text,p_pin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_device text; limite operacional_sync.autorizacao_limites%rowtype;
begin
 v_device:=operacional_sync.sessao(p_token,false);
 insert into operacional_sync.autorizacao_limites(device_id) values(v_device) on conflict do nothing;
 select * into limite from operacional_sync.autorizacao_limites where device_id=v_device for update;
 if limite.bloqueado_ate>now() then return jsonb_build_object('erro','Aguarde 15 minutos antes de tentar novamente.'); end if;
 begin
  perform public.alterar_acesso_dispositivo(v_device,p_usuario,v_device,'aprovar',p_pin);
 exception when others then
  update operacional_sync.autorizacao_limites set tentativas=case when tentativas>=4 then 0 else tentativas+1 end,bloqueado_ate=case when tentativas>=4 then now()+interval '15 minutes' else null end where device_id=v_device;
  return jsonb_build_object('erro','Autorização recusada. Use um administrador e o PIN mestre existente.');
 end;
 update operacional_sync.sessoes set aprovado=true where segredo_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 update operacional_sync.autorizacao_limites set tentativas=0,bloqueado_ate=null where device_id=v_device;
 return jsonb_build_object('aprovado',true);
end $$;

create or replace function operacional_sync.listar(p_token text,p_fluxo text,p_depois text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform operacional_sync.sessao(p_token);
 if p_fluxo='romaneio' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_result from (
   select r.id,r.dados||jsonb_build_object('documento',coalesce(e.dados->>'documento',''),
    'possui_assinatura',coalesce(e.dados->>'assinatura','')<>'',
    'possui_fotos',coalesce(e.dados->>'foto_pacote','')<>'' or coalesce(e.dados->>'foto_devolucao','')<>'') as dados,
    r.revisao,r.status_sync,r.atualizado_em
   from public.romaneios_retirada r left join operacional_sync.romaneio_evidencias e on e.romaneio_id=r.id
   where r.id>p_depois order by r.id limit 100
  ) x;
 else
  execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from (select id,dados,revisao,status_sync,atualizado_em from %s where id>$1 order by id limit 100) x',operacional_sync.tabela(p_fluxo)) into v_result using p_depois;
 end if;
 return v_result;
end $$;

-- Reutiliza o PIN e os dispositivos ativos, sem alterar cadastro ou regras de acesso existentes.
create or replace function operacional_sync.sessao(p_token text, p_exigir_aprovacao boolean default true)
returns text language plpgsql security definer set search_path='' as $$
declare s operacional_sync.sessoes%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception using errcode='42501',message='Sessão de sincronização inválida.'; end if;
 select * into s from operacional_sync.sessoes where segredo_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found or (s.auth_user_id is not null and s.auth_user_id is distinct from auth.uid()) then
  raise exception using errcode='42501',message='Sessão de sincronização inválida.';
 end if;
 if p_exigir_aprovacao and (not s.aprovado or not exists(select 1 from public.dispositivos_autorizados d where d.device_id=s.device_id and d.ativo and coalesce(to_jsonb(d)->>'status','aprovado')='aprovado')) then
  raise exception using errcode='42501',message='Autorize a sincronização deste aparelho com o administrador.';
 end if;
 return s.device_id;
end $$;

create or replace function operacional_sync.registrar(p_device_id text,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s operacional_sync.sessoes%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' or nullif(btrim(p_device_id),'') is null or length(p_device_id)>200 then raise exception 'Sessão inválida.'; end if;
 if not exists(select 1 from public.dispositivos_autorizados where device_id=p_device_id) then raise exception using errcode='42501',message='Cadastre e aprove este aparelho em Segurança.'; end if;
 insert into operacional_sync.sessoes(device_id,segredo_hash,auth_user_id) values(p_device_id,encode(extensions.digest(p_token,'sha256'),'hex'),auth.uid()) on conflict(segredo_hash) do nothing;
 perform operacional_sync.sessao(p_token,false);
 select * into s from operacional_sync.sessoes where segredo_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if s.device_id<>p_device_id then raise exception using errcode='42501',message='Aparelho incompatível.'; end if;
 return jsonb_build_object('aprovado',s.aprovado and exists(select 1 from public.dispositivos_autorizados d where d.device_id=s.device_id and d.ativo and coalesce(to_jsonb(d)->>'status','aprovado')='aprovado'));
end $$;

create or replace function operacional_sync.autorizar(p_token text,p_usuario text,p_pin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_device text; limite operacional_sync.autorizacao_limites%rowtype;
begin
 v_device:=operacional_sync.sessao(p_token,false);
 insert into operacional_sync.autorizacao_limites(device_id) values(v_device) on conflict do nothing;
 select * into limite from operacional_sync.autorizacao_limites where device_id=v_device for update;
 if limite.bloqueado_ate>now() then return jsonb_build_object('erro','Aguarde 15 minutos antes de tentar novamente.'); end if;
 begin
  if not exists(select 1 from public.dispositivos_autorizados d where d.device_id=v_device and d.ativo and coalesce(to_jsonb(d)->>'status','aprovado')='aprovado' and lower(btrim(coalesce(d.nome_usuario,'')))=lower(btrim(coalesce(p_usuario,'')))) then raise exception 'Aparelho ou usuario nao autorizado.'; end if;
  if not exists(select 1 from public.usuarios u where u.ativo and lower(btrim(coalesce(u.perfil,'')))='admin' and (lower(btrim(coalesce(u.nome,'')))=lower(btrim(coalesce(p_usuario,''))) or lower(btrim(coalesce(u.usuario_id,'')))=lower(btrim(coalesce(p_usuario,''))))) then raise exception 'Administrador necessario.'; end if;
  if public.validar_pin_mestre(p_pin) is not true then raise exception 'PIN mestre invalido.'; end if;
 exception when others then
  update operacional_sync.autorizacao_limites set tentativas=case when tentativas>=4 then 0 else tentativas+1 end,bloqueado_ate=case when tentativas>=4 then now()+interval '15 minutes' else null end where device_id=v_device;
  return jsonb_build_object('erro','Autorização recusada. Use um administrador e o PIN mestre existente.');
 end;
 update operacional_sync.sessoes set aprovado=true where segredo_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 update operacional_sync.autorizacao_limites set tentativas=0,bloqueado_ate=null where device_id=v_device;
 return jsonb_build_object('aprovado',true);
end $$;

create or replace function operacional_sync.autorizar(p_token text,p_usuario text,p_pin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_device text; limite operacional_sync.autorizacao_limites%rowtype; v_hash text;
begin
 v_device:=operacional_sync.sessao(p_token,false);
 insert into operacional_sync.autorizacao_limites(device_id) values(v_device) on conflict do nothing;
 select * into limite from operacional_sync.autorizacao_limites where device_id=v_device for update;
 if limite.bloqueado_ate>now() then return jsonb_build_object('erro','Aguarde 15 minutos antes de tentar novamente.'); end if;
 begin
  if not exists(select 1 from public.dispositivos_autorizados d where d.device_id=v_device and d.ativo and coalesce(to_jsonb(d)->>'status','aprovado')='aprovado' and lower(btrim(coalesce(d.nome_usuario,'')))=lower(btrim(coalesce(p_usuario,'')))) then raise exception 'Aparelho ou usuario nao autorizado.'; end if;
  if not exists(select 1 from public.usuarios u where u.ativo and lower(btrim(coalesce(u.perfil,'')))='admin' and (lower(btrim(coalesce(u.nome,'')))=lower(btrim(coalesce(p_usuario,''))) or lower(btrim(coalesce(u.usuario_id,'')))=lower(btrim(coalesce(p_usuario,''))))) then raise exception 'Administrador necessario.'; end if;
  select valor_hash into v_hash from public.configuracoes_seguranca where chave='pin_mestre' and algoritmo='bcrypt' limit 1;
  if v_hash is null or p_pin is null or v_hash <> extensions.crypt(btrim(p_pin),v_hash) then raise exception 'PIN mestre invalido.'; end if;
 exception when others then
  update operacional_sync.autorizacao_limites set tentativas=case when tentativas>=4 then 0 else tentativas+1 end,bloqueado_ate=case when tentativas>=4 then now()+interval '15 minutes' else null end where device_id=v_device;
  return jsonb_build_object('erro','Autorização recusada. Use um administrador e o PIN mestre existente.');
 end;
 update operacional_sync.sessoes set aprovado=true where segredo_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 update operacional_sync.autorizacao_limites set tentativas=0,bloqueado_ate=null where device_id=v_device;
 return jsonb_build_object('aprovado',true);
end $$;
