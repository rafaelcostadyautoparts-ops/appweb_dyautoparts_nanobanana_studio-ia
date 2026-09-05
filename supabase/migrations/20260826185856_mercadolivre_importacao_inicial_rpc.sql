begin;
create function private.importar_pedido_inicial(p_mercadolivre_account_id bigint,p_order jsonb)
returns table(pedido_id bigint,already_imported boolean,itens_importados integer,itens_identificados integer,itens_pendentes integer,status_identificacao text)
language plpgsql security invoker set search_path=''
as $$
declare o jsonb; n integer; pid bigint; mid bigint; vid bigint; iid text; variation text; ean_value text; total integer:=0; identified integer:=0; ext text; current_status text;
begin
 if p_mercadolivre_account_id is null or p_order is null or jsonb_typeof(p_order)<>'object' then raise exception 'Conta e payload válido são obrigatórios'; end if;
 ext:=nullif(btrim(p_order->>'id'),'');
 if ext is null or nullif(btrim(p_order->>'status'),'') is null or nullif(btrim(p_order->>'date_created'),'') is null or nullif(btrim(p_order->>'currency_id'),'') is null or p_order->'total_amount' is null or jsonb_typeof(p_order->'order_items')<>'array' or jsonb_array_length(p_order->'order_items')=0 then raise exception 'Pedido sem campos essenciais'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_mercadolivre_account_id::text||':'||ext,0));
 select p.id,p.status_identificacao into pid,current_status from public.mercadolivre_pedidos p where p.mercadolivre_account_id=p_mercadolivre_account_id and p.external_order_id=ext;
 if found then return query select pid,true,0,0,0,current_status; return; end if;
 insert into public.mercadolivre_pedidos(mercadolivre_account_id,external_order_id,status_mercadolivre,date_created,date_closed,shipping_id,total_amount,currency_id,importado_em,atualizado_em)
 values(p_mercadolivre_account_id,ext,p_order->>'status',(p_order->>'date_created')::timestamptz,nullif(p_order->>'date_closed','')::timestamptz,nullif(p_order#>>'{shipping,id}',''),(p_order->>'total_amount')::numeric,p_order->>'currency_id',now(),now()) returning id into pid;
 for o,n in select value,(ordinality-1)::integer from jsonb_array_elements(p_order->'order_items') with ordinality loop
  iid:=nullif(btrim(o#>>'{item,id}'),''); variation:=nullif(btrim(o#>>'{item,variation_id}'),'');
  if iid is null or nullif(btrim(o#>>'{item,title}'),'') is null or o->'quantity' is null then raise exception 'Linha % sem campos essenciais',n; end if;
  mid:=null;vid:=null;
  select m.id,m.current_version_id into mid,vid from public.mercadolivre_item_mappings m where m.mercadolivre_account_id=p_mercadolivre_account_id and m.item_id=iid and m.variation_key=coalesce(variation,'__SEM_VARIACAO__') and m.ativo and m.current_version_id is not null and private.mapping_version_composicao_valida(m.id,m.current_version_id) limit 1;
  ean_value:=coalesce(nullif(btrim(o->>'ean'),''),nullif(btrim(o#>>'{item,ean}'),''),(select nullif(btrim(a->>'value_name'),'') from jsonb_array_elements(coalesce(o#>'{item,attributes}','[]'::jsonb)) a where upper(coalesce(a->>'id','')) in('GTIN','EAN') limit 1));
  insert into public.mercadolivre_pedido_itens(pedido_id,source_line_number,item_id,variation_id,titulo,seller_sku,ean,quantidade_comprada,unit_price,full_unit_price,gross_price,currency_id,atributos,payload_original,mapping_id,mapping_version_id,importado_em,atualizado_em)
  values(pid,n,iid,variation,o#>>'{item,title}',nullif(btrim(o#>>'{item,seller_sku}'),''),ean_value,(o->>'quantity')::integer,nullif(o->>'unit_price','')::numeric,nullif(o->>'full_unit_price','')::numeric,nullif(o->>'gross_price','')::numeric,nullif(btrim(o->>'currency_id'),''),jsonb_strip_nulls(jsonb_build_object('variation_attributes',o#>'{item,variation_attributes}','item_attributes',o#>'{item,attributes}','requested_quantity',o->'requested_quantity','picked_quantity',o->'picked_quantity','seller_custom_field',o#>'{item,seller_custom_field}','category_id',o#>'{item,category_id}','condition',o#>'{item,condition}')),o,mid,vid,now(),now());
  total:=total+1;if vid is not null then identified:=identified+1;end if;
 end loop;
 update public.mercadolivre_pedidos set identificacao_iniciada_em=now(),atualizado_em=now() where id=pid;
 select p.status_identificacao into current_status from public.mercadolivre_pedidos p where p.id=pid;
 return query select pid,false,total,identified,total-identified,current_status;
end;
$$;
revoke all on function private.importar_pedido_inicial(bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.importar_pedido_inicial(bigint,jsonb) to service_role;
create function public.mercadolivre_importar_pedido_inicial(p_mercadolivre_account_id bigint,p_order jsonb)
returns table(pedido_id bigint,already_imported boolean,itens_importados integer,itens_identificados integer,itens_pendentes integer,status_identificacao text)
language sql security invoker set search_path=''
as $$select * from private.importar_pedido_inicial(p_mercadolivre_account_id,p_order);$$;
revoke all on function public.mercadolivre_importar_pedido_inicial(bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mercadolivre_importar_pedido_inicial(bigint,jsonb) to service_role;
commit;
