create or replace function public.touch_separacao_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        new.criado_em := public.data_hora_brasil();
    else
        -- A data operacional pertence ao dia em que a separacao foi criada.
        -- Finalizar, conferir ou editar nunca pode mover a separacao para outro dia.
        new.criado_em := old.criado_em;
    end if;

    new.atualizado_em := public.data_hora_brasil();

    if new.finalizado_em is not null
       or lower(coalesce(new.status, '')) in ('finalizada', 'finalizado', 'conferido') then
        new.finalizado_em := public.data_hora_brasil();
    end if;

    return new;
end;
$$;

comment on function public.touch_separacao_data_hora_brasil()
is 'Preserva criado_em em atualizacoes; finalizado_em registra apenas a conclusao.';
