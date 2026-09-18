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
