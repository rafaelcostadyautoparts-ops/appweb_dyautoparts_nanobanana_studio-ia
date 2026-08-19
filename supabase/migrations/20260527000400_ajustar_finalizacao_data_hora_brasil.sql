create or replace function public.touch_separacao_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        new.criado_em := public.data_hora_brasil();
    end if;

    new.atualizado_em := public.data_hora_brasil();

    if new.finalizado_em is not null or lower(coalesce(new.status, '')) in ('finalizada', 'finalizado', 'conferido') then
        new.finalizado_em := public.data_hora_brasil();
    end if;

    return new;
end;
$$;

create or replace function public.touch_conferencia_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    new.conferido_em := public.data_hora_brasil();
    new.atualizado_em := public.data_hora_brasil();
    return new;
end;
$$;

create or replace function public.touch_inventarios_itens_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    new.auditado_em := public.data_hora_brasil();
    new.atualizado_em := public.data_hora_brasil();
    return new;
end;
$$;
