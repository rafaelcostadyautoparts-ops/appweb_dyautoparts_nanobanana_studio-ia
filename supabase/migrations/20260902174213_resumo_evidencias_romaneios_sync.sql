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
