create or replace function public.set_inventario_item_valores_from_produto()
returns trigger
language plpgsql
as $$
declare
    v_preco_custo numeric;
    v_diferenca numeric;
begin
    select p.preco_custo
      into v_preco_custo
      from public.produtos p
     where p.id_interno = new.id_interno
     limit 1;

    new.valor_unitario := coalesce(v_preco_custo, 0);
    v_diferenca := coalesce(new.diferenca, coalesce(new.saldo_fisico, 0) - coalesce(new.saldo_sistema, 0));
    new.diferenca := v_diferenca;
    new.valor_diferenca := v_diferenca * coalesce(new.valor_unitario, 0);

    return new;
end;
$$;

drop trigger if exists trg_set_inventario_item_valores_from_produto on public.inventarios_itens;

create trigger trg_set_inventario_item_valores_from_produto
before insert or update of id_interno, saldo_sistema, saldo_fisico, diferenca, valor_unitario
on public.inventarios_itens
for each row
execute function public.set_inventario_item_valores_from_produto();
