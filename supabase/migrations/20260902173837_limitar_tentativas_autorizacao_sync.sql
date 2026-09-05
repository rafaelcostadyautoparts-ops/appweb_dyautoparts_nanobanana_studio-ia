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
