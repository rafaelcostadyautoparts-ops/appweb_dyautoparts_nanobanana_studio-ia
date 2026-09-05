-- Restringe o autocadastro sem invalidar dispositivos previamente autorizados.
alter table public.dispositivos_autorizados
  add column if not exists status text,
  add column if not exists solicitado_em timestamptz,
  add column if not exists aprovado_em timestamptz,
  add column if not exists aprovado_por text;

update public.dispositivos_autorizados
set status = case when ativo is true then 'aprovado' else 'bloqueado' end,
    aprovado_em = case when ativo is true then coalesce(aprovado_em, criado_em) else aprovado_em end,
    aprovado_por = case when ativo is true then coalesce(aprovado_por, 'migração') else aprovado_por end
where status is null or btrim(status) = '';

alter table public.dispositivos_autorizados
  alter column status set default 'pendente',
  alter column status set not null;

alter table public.dispositivos_autorizados
  drop constraint if exists dispositivos_autorizados_status_check;
alter table public.dispositivos_autorizados
  add constraint dispositivos_autorizados_status_check
  check (status in ('pendente','aprovado','bloqueado'));

create or replace function public.solicitar_ou_atualizar_dispositivo(
  p_device_id text,
  p_usuario_id text default null,
  p_nome_usuario text default null,
  p_nome_dispositivo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_device public.dispositivos_autorizados%rowtype;
  v_id text := nullif(btrim(coalesce(p_device_id, '')), '');
begin
  if v_id is null or length(v_id) > 200 then
    raise exception 'Identificador de dispositivo inválido.';
  end if;

  select * into v_device
  from public.dispositivos_autorizados
  where device_id = v_id
  for update;

  if not found then
    insert into public.dispositivos_autorizados (
      usuario_id, nome_usuario, device_id, nome_dispositivo,
      ativo, status, solicitado_em, ultimo_acesso
    ) values (
      nullif(btrim(coalesce(p_usuario_id, '')), ''),
      coalesce(nullif(btrim(coalesce(p_nome_usuario, '')), ''), 'Aguardando login'),
      v_id,
      nullif(btrim(coalesce(p_nome_dispositivo, '')), ''),
      false, 'pendente', now(), now()
    ) returning * into v_device;
  elsif v_device.status = 'aprovado' and v_device.ativo is true then
    update public.dispositivos_autorizados
    set usuario_id = coalesce(nullif(btrim(coalesce(p_usuario_id, '')), ''), usuario_id),
        nome_usuario = coalesce(nullif(btrim(coalesce(p_nome_usuario, '')), ''), nome_usuario),
        nome_dispositivo = coalesce(nullif(btrim(coalesce(p_nome_dispositivo, '')), ''), nome_dispositivo),
        ultimo_acesso = now()
    where device_id = v_id
    returning * into v_device;
  end if;

  return jsonb_build_object(
    'allowed', v_device.status = 'aprovado' and v_device.ativo is true,
    'status', v_device.status,
    'device_id', v_device.device_id,
    'nome_dispositivo', v_device.nome_dispositivo
  );
end;
$$;

create or replace function public.alterar_acesso_dispositivo(
  p_solicitante_device_id text,
  p_usuario text,
  p_device_id_alvo text,
  p_acao text,
  p_pin text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_acao text := lower(btrim(coalesce(p_acao, '')));
begin
  if v_acao not in ('aprovar','negar','bloquear') then
    raise exception 'Ação de dispositivo inválida.';
  end if;

  if not exists (
    select 1 from public.dispositivos_autorizados d
    where d.device_id = nullif(btrim(coalesce(p_solicitante_device_id, '')), '')
      and d.ativo is true and d.status = 'aprovado'
      and lower(btrim(coalesce(d.nome_usuario, ''))) = lower(btrim(coalesce(p_usuario, '')))
  ) then
    raise exception 'Dispositivo solicitante não autorizado.';
  end if;

  if not exists (
    select 1 from public.usuarios u
    where u.ativo is true and lower(btrim(coalesce(u.perfil, ''))) = 'admin'
      and (lower(btrim(coalesce(u.nome, ''))) = lower(btrim(coalesce(p_usuario, '')))
        or lower(btrim(coalesce(u.usuario_id, ''))) = lower(btrim(coalesce(p_usuario, ''))))
  ) then
    raise exception 'Apenas administradores podem alterar acessos.';
  end if;

  select valor_hash into v_hash
  from public.configuracoes_seguranca
  where chave = 'pin_mestre' and algoritmo = 'bcrypt'
  limit 1;

  if v_hash is null or p_pin is null or v_hash <> crypt(btrim(p_pin), v_hash) then
    raise exception 'PIN mestre inválido.';
  end if;

  update public.dispositivos_autorizados
  set ativo = (v_acao = 'aprovar'),
      status = case when v_acao = 'aprovar' then 'aprovado' else 'bloqueado' end,
      aprovado_em = case when v_acao = 'aprovar' then now() else aprovado_em end,
      aprovado_por = case when v_acao = 'aprovar' then p_usuario else aprovado_por end,
      bloqueado_em = case when v_acao = 'aprovar' then null else now() end,
      ultimo_acesso = now()
  where device_id = nullif(btrim(coalesce(p_device_id_alvo, '')), '');

  if not found then raise exception 'Dispositivo não encontrado.'; end if;
  return true;
end;
$$;

revoke all on function public.solicitar_ou_atualizar_dispositivo(text,text,text,text) from public;
revoke all on function public.alterar_acesso_dispositivo(text,text,text,text,text) from public;
grant execute on function public.solicitar_ou_atualizar_dispositivo(text,text,text,text) to anon, authenticated;
grant execute on function public.alterar_acesso_dispositivo(text,text,text,text,text) to anon, authenticated;

revoke insert, update, delete on public.dispositivos_autorizados from anon, authenticated;
drop policy if exists "app_dispositivos_insert" on public.dispositivos_autorizados;
drop policy if exists "app_dispositivos_update" on public.dispositivos_autorizados;