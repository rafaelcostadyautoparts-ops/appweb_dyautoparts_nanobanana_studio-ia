create or replace function public.pode_registrar_operacao_progresso(p_fluxo text,p_sessao text,p_usuario text)
returns boolean language sql stable security invoker set search_path='public','pg_temp' as $$
 select case
  when p_fluxo='separacao' then exists(
   select 1 from public.separacao s where s.separacao_id=p_sessao
    and s.finalizado_em is null and lower(coalesce(s.status,'')) not in
     ('finalizada','finalizado','conferido','concluida','concluido','cancelada','cancelado'))
  when p_fluxo='conferencia' then
   exists(select 1 from public.separacao s where s.separacao_id=p_sessao
    and lower(coalesce(s.status,'')) not in
     ('finalizada','finalizado','concluida','concluido','cancelada','cancelado'))
   and not exists(select 1 from public.conferencia c where c.separacao_id=p_sessao
    and lower(coalesce(c.status,'')) in
     ('conferido','finalizada','finalizado','concluida','concluido','cancelada','cancelado'))
   and not exists(select 1 from public.separacao s where s.separacao_id=p_sessao
    and nullif(btrim(coalesce(s.criado_por,'')),'') is not null
    and lower(regexp_replace(btrim(s.criado_por),'\s+',' ','g'))
     =lower(regexp_replace(btrim(coalesce(p_usuario,'')),'\s+',' ','g')))
  else false end;
$$;
revoke all on function public.pode_registrar_operacao_progresso(text,text,text) from public;
grant execute on function public.pode_registrar_operacao_progresso(text,text,text) to anon,authenticated;
drop policy if exists operacoes_progresso_somente_andamento on public.operacoes_progresso_log;
create policy operacoes_progresso_somente_andamento
 on public.operacoes_progresso_log for insert to anon,authenticated
 with check(length(operacao_id) between 10 and 200 and length(sessao_id) between 1 and 160
  and length(id_interno) between 1 and 100 and abs(delta_quantidade)<=100000
  and public.pode_registrar_operacao_progresso(fluxo,sessao_id,usuario));