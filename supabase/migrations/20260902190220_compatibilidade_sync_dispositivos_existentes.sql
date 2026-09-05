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
