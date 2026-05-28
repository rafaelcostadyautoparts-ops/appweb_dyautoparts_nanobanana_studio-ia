create or replace function public.data_hora_brasil()
returns timestamp without time zone
language sql
stable
as $$
    select timezone('America/Sao_Paulo', now())::timestamp without time zone;
$$;

create or replace function public.touch_movimentos_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    new.data_hora := public.data_hora_brasil();
    return new;
end;
$$;

drop trigger if exists trg_movimentos_data_hora_brasil on public.movimentos;
create trigger trg_movimentos_data_hora_brasil
before insert on public.movimentos
for each row execute function public.touch_movimentos_data_hora_brasil();

create or replace function public.touch_estoque_atual_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    new.atualizado_em := public.data_hora_brasil();
    return new;
end;
$$;

drop trigger if exists trg_estoque_atual_data_hora_brasil on public.estoque_atual;
create trigger trg_estoque_atual_data_hora_brasil
before insert or update on public.estoque_atual
for each row execute function public.touch_estoque_atual_data_hora_brasil();

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
        new.finalizado_em := coalesce(new.finalizado_em, public.data_hora_brasil());
    end if;

    return new;
end;
$$;

drop trigger if exists trg_separacao_data_hora_brasil on public.separacao;
create trigger trg_separacao_data_hora_brasil
before insert or update on public.separacao
for each row execute function public.touch_separacao_data_hora_brasil();

create or replace function public.touch_separacao_itens_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    new.atualizado_em := public.data_hora_brasil();
    return new;
end;
$$;

drop trigger if exists trg_separacao_itens_data_hora_brasil on public.separacao_itens;
create trigger trg_separacao_itens_data_hora_brasil
before insert or update on public.separacao_itens
for each row execute function public.touch_separacao_itens_data_hora_brasil();

create or replace function public.touch_conferencia_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    new.conferido_em := coalesce(new.conferido_em, public.data_hora_brasil());
    new.atualizado_em := public.data_hora_brasil();
    return new;
end;
$$;

drop trigger if exists trg_conferencia_data_hora_brasil on public.conferencia;
create trigger trg_conferencia_data_hora_brasil
before insert or update on public.conferencia
for each row execute function public.touch_conferencia_data_hora_brasil();

create or replace function public.touch_inventarios_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        new.criado_em := public.data_hora_brasil();
        new.data_inicio := coalesce(new.data_inicio, public.data_hora_brasil());
    end if;

    new.atualizado_em := public.data_hora_brasil();

    if new.data_fim is not null or upper(coalesce(new.status, '')) in ('FECHADO', 'FINALIZADO', 'FINALIZADA', 'ANULADO') then
        new.data_fim := coalesce(new.data_fim, public.data_hora_brasil());
    end if;

    return new;
end;
$$;

drop trigger if exists trg_inventarios_data_hora_brasil on public.inventarios;
create trigger trg_inventarios_data_hora_brasil
before insert or update on public.inventarios
for each row execute function public.touch_inventarios_data_hora_brasil();

create or replace function public.touch_inventarios_itens_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    new.auditado_em := coalesce(new.auditado_em, public.data_hora_brasil());
    new.atualizado_em := public.data_hora_brasil();
    return new;
end;
$$;

drop trigger if exists trg_inventarios_itens_data_hora_brasil on public.inventarios_itens;
create trigger trg_inventarios_itens_data_hora_brasil
before insert or update on public.inventarios_itens
for each row execute function public.touch_inventarios_itens_data_hora_brasil();

create or replace function public.touch_etiquetas_lotes_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        new.criado_em := public.data_hora_brasil();
    end if;

    new.atualizado_em := public.data_hora_brasil();

    if new.status = 'impresso' and new.impresso_em is null then
        new.impresso_em := public.data_hora_brasil();
    end if;

    return new;
end;
$$;

drop trigger if exists trg_etiquetas_lotes_data_hora_brasil on public.etiquetas_lotes;
create trigger trg_etiquetas_lotes_data_hora_brasil
before insert or update on public.etiquetas_lotes
for each row execute function public.touch_etiquetas_lotes_data_hora_brasil();

create or replace function public.touch_entradas_nf_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        new.created_at := public.data_hora_brasil();
    end if;

    new.updated_at := public.data_hora_brasil();
    new.atualizado_em := public.data_hora_brasil();
    return new;
end;
$$;

drop trigger if exists trg_entradas_nf_data_hora_brasil on public.entradas_nf;
create trigger trg_entradas_nf_data_hora_brasil
before insert or update on public.entradas_nf
for each row execute function public.touch_entradas_nf_data_hora_brasil();

create or replace function public.touch_entradas_nf_itens_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        new.created_at := public.data_hora_brasil();
        new.criado_em := public.data_hora_brasil();
    end if;

    new.updated_at := public.data_hora_brasil();
    new.atualizado_em := public.data_hora_brasil();
    return new;
end;
$$;

drop trigger if exists trg_entradas_nf_itens_data_hora_brasil on public.entradas_nf_itens;
create trigger trg_entradas_nf_itens_data_hora_brasil
before insert or update on public.entradas_nf_itens
for each row execute function public.touch_entradas_nf_itens_data_hora_brasil();

create or replace function public.touch_contas_pagar_data_hora_brasil()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' then
        new.criado_em := public.data_hora_brasil();
    end if;

    new.atualizado_em := public.data_hora_brasil();
    return new;
end;
$$;

drop trigger if exists trg_contas_pagar_data_hora_brasil on public.contas_pagar;
create trigger trg_contas_pagar_data_hora_brasil
before insert or update on public.contas_pagar
for each row execute function public.touch_contas_pagar_data_hora_brasil();
