create or replace function public.aplicar_operacao_progresso(
 p_operacao_id text,p_fluxo text,p_sessao_id text,p_id_interno text,p_delta integer,
 p_usuario text default null,p_dispositivo_id text default null,p_item jsonb default '{}'::jsonb,p_estado jsonb default null
) returns jsonb language plpgsql security invoker set search_path='public','pg_temp' as $f$
declare o text:=btrim(coalesce(p_operacao_id,'')); f text:=lower(btrim(coalesce(p_fluxo,'')));
 s text:=btrim(coalesce(p_sessao_id,'')); i text:=btrim(coalesce(p_id_interno,''));
 c text; n timestamp:=timezone('America/Sao_Paulo',now()); q integer; e integer; inserted integer;
begin
 if o='' or s='' or i='' then raise exception 'Operacao, sessao e produto sao obrigatorios.'; end if;
 if f not in('separacao','conferencia') then raise exception 'Fluxo de progresso invalido.'; end if;
 perform pg_advisory_xact_lock(hashtext('progresso:'||f||':'||s));
 if not exists(select 1 from public.separacao where separacao_id=s) then
  raise exception 'Separacao nao encontrada.';
 end if;
 if f='separacao' and exists(select 1 from public.separacao where separacao_id=s and
   (finalizado_em is not null or lower(coalesce(status,'')) in('finalizada','finalizado','conferido','concluida','concluido','cancelada','cancelado')))
 then raise exception 'Separacao finalizada nao pode receber progresso.';
 elsif f='conferencia' and (
  exists(select 1 from public.separacao where separacao_id=s and lower(coalesce(status,'')) in('finalizada','finalizado','concluida','concluido','cancelada','cancelado'))
  or exists(select 1 from public.conferencia where separacao_id=s and
   lower(coalesce(status,'')) in('conferido','finalizada','finalizado','concluida','concluido','cancelada','cancelado'))
 ) then raise exception 'Conferencia finalizada nao pode receber progresso.'; end if;
 if f='conferencia' and exists(
  select 1 from public.separacao where separacao_id=s
   and nullif(btrim(coalesce(criado_por,'')),'') is not null
   and lower(regexp_replace(btrim(criado_por),'\s+',' ','g'))=lower(regexp_replace(btrim(coalesce(p_usuario,'')),'\s+',' ','g'))
 ) then raise exception 'A conferencia deve ser realizada por outro usuario. Quem separou nao pode conferir.'; end if;
 begin
  insert into public.operacoes_progresso_log values(o,f,s,i,coalesce(p_delta,0),nullif(btrim(p_usuario),''),
   nullif(btrim(p_dispositivo_id),''),n,n);
 exception when unique_violation then
  return jsonb_build_object('ok',true,'status','duplicada','operacao_id',o);
 end;
 if f='separacao' then
  insert into public.separacao_itens(separacao_id,id_interno,ean,descricao,qtd_solicitada,qtd_separada,
   sem_movimento_estoque,detalhes_operacionais,atualizado_em)
  values(s,i,nullif(btrim(coalesce(p_item->>'ean','')),''),coalesce(p_item->>'descricao',''),
   greatest(0,coalesce((p_item->>'qtd_solicitada')::numeric,0)),greatest(0,coalesce(p_delta,0)),
   lower(coalesce(p_item->>'sem_movimento_estoque','false'))='true',
   case when jsonb_typeof(p_item->'detalhes_operacionais')='array' then p_item->'detalhes_operacionais' else '[]'::jsonb end,n)
  on conflict(separacao_id,id_interno) where id_interno<>'DY-000.000' do update set
   ean=coalesce(excluded.ean,separacao_itens.ean),descricao=coalesce(nullif(excluded.descricao,''),separacao_itens.descricao),
   qtd_solicitada=greatest(separacao_itens.qtd_solicitada,excluded.qtd_solicitada),
   qtd_separada=greatest(0,separacao_itens.qtd_separada+p_delta),atualizado_em=n
  returning qtd_separada::integer into q;
  if q=0 then delete from public.separacao_itens where separacao_id=s and id_interno=i and qtd_separada=0; end if;
  update public.separacao x set atualizado_em=n,total_produtos_separados=t.produtos,total_itens_separados=t.itens
  from(select count(distinct id_interno)::integer produtos,coalesce(sum(qtd_separada),0) itens
       from public.separacao_itens where separacao_id=s)t where x.separacao_id=s;
 else
  c:='CONF-DRAFT-'||s;
  insert into public.conferencia(conferencia_id,separacao_id,status,conferido_por,conferido_em,atualizado_em,estado_andamento)
  values(c,s,'em_conferencia',coalesce(nullif(btrim(p_usuario),''),'N/A'),null,n,coalesce(p_estado,'{}'::jsonb))
  on conflict(conferencia_id) do update set atualizado_em=excluded.atualizado_em,
   estado_andamento=coalesce(excluded.estado_andamento,conferencia.estado_andamento);
  e:=greatest(0,coalesce((p_item->>'qtd_separada')::integer,0));
  insert into public.conferencia_itens(conferencia_id,separacao_id,id_interno,ean,descricao,qtd_separada,qtd_conferida,divergencia)
  values(c,s,i,coalesce(p_item->>'ean',''),coalesce(p_item->>'descricao',''),e,greatest(0,coalesce(p_delta,0)),
   case when greatest(0,coalesce(p_delta,0))=e then 'OK' when greatest(0,coalesce(p_delta,0))>e then 'SOBRA' else 'FALTA' end)
  on conflict(conferencia_id,id_interno) where id_interno is not null do update set
   ean=coalesce(nullif(excluded.ean,''),conferencia_itens.ean),
   descricao=coalesce(nullif(excluded.descricao,''),conferencia_itens.descricao),qtd_separada=excluded.qtd_separada,
   qtd_conferida=greatest(0,conferencia_itens.qtd_conferida+p_delta),
   divergencia=case when greatest(0,conferencia_itens.qtd_conferida+p_delta)=excluded.qtd_separada then 'OK'
    when greatest(0,conferencia_itens.qtd_conferida+p_delta)>excluded.qtd_separada then 'SOBRA' else 'FALTA' end
  returning qtd_conferida into q;
 end if;
 return jsonb_build_object('ok',true,'status','aplicada','operacao_id',o,'fluxo',f,'sessao_id',s,'id_interno',i,'quantidade',coalesce(q,0));
end;$f$;