-- DY Auto Parts - devolucoes sem cidade e UF
-- Recria o salvamento usando somente os campos presentes no formulario atual.

alter table public.devolucao_itens
    add column if not exists apto_venda boolean not null default false,
    add column if not exists estoque_movimentado boolean not null default false,
    add column if not exists estoque_local text,
    add column if not exists estoque_movimento_id text;

alter table public.devolucao_itens
    alter column estoque_movimento_id type text using estoque_movimento_id::text;

comment on column public.devolucao_itens.apto_venda
    is 'Define se o item devolvido retorna ao estoque de venda.';
comment on column public.devolucao_itens.estoque_movimentado
    is 'Impede que a mesma devolucao movimente o estoque mais de uma vez.';
comment on column public.devolucao_itens.estoque_local
    is 'Local de entrada do item devolvido: TERREO ou DEFEITO.';
comment on column public.devolucao_itens.estoque_movimento_id
    is 'Movimento de estoque vinculado ao item da devolucao.';
create or replace function public.salvar_devolucao_marketplace(
    p_devolucao jsonb,
    p_itens jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_devolucao_id uuid;
begin
    if coalesce(nullif(btrim(p_devolucao->>'pedido'), ''), '') = '' then
        raise exception 'O numero do pedido e obrigatorio';
    end if;

    if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
        raise exception 'Adicione ao menos um produto a devolucao';
    end if;

    insert into public.devolucoes (
        tipo, canal, pedido, remetente, data_devolucao, motivo,
        impactou_reputacao, marketplace_acionado, observacao_acompanhamento,
        saldo_marketplace, tarifa_devolucao_reembolsada, status,
        observacoes, responsavel
    ) values (
        'marketplace',
        coalesce(nullif(btrim(p_devolucao->>'canal'), ''), 'Amazon'),
        btrim(p_devolucao->>'pedido'),
        nullif(btrim(p_devolucao->>'remetente'), ''),
        coalesce(nullif(p_devolucao->>'data_devolucao', '')::date, current_date),
        coalesce(nullif(btrim(p_devolucao->>'motivo'), ''), 'Devolucao'),
        coalesce((p_devolucao->>'impactou_reputacao')::boolean, false),
        coalesce((p_devolucao->>'marketplace_acionado')::boolean, false),
        nullif(btrim(p_devolucao->>'observacao_acompanhamento'), ''),
        coalesce((p_devolucao->>'saldo_marketplace')::numeric, 0),
        coalesce((p_devolucao->>'tarifa_devolucao_reembolsada')::numeric, 0),
        case when coalesce((p_devolucao->>'marketplace_acionado')::boolean, false)
            then 'em_analise' else 'resolvida' end,
        nullif(btrim(p_devolucao->>'observacoes'), ''),
        nullif(btrim(p_devolucao->>'responsavel'), '')
    ) returning id into v_devolucao_id;

    insert into public.devolucao_itens (
        devolucao_id, produto_id, id_interno, ean, sku, descricao, categoria,
        quantidade, valor_unitario, fornecedor, devolveu_correto, apto_venda,
        estoque_movimentado, estoque_local, estoque_movimento_id,
        observacoes, destino
    )
    select
        v_devolucao_id,
        nullif(item->>'produto_id', '')::uuid,
        nullif(btrim(item->>'id_interno'), ''),
        nullif(btrim(item->>'ean'), ''),
        nullif(btrim(item->>'sku'), ''),
        coalesce(nullif(btrim(item->>'descricao'), ''), 'Produto sem descricao'),
        nullif(btrim(item->>'categoria'), ''),
        greatest(coalesce((item->>'quantidade')::numeric, 1), 0.001),
        greatest(coalesce((item->>'valor_unitario')::numeric, 0), 0),
        nullif(btrim(item->>'fornecedor'), ''),
        coalesce((item->>'devolveu_correto')::boolean, true),
        coalesce((item->>'apto_venda')::boolean, false),
        coalesce((item->>'estoque_movimentado')::boolean, false),
        coalesce(
            nullif(btrim(item->>'estoque_local'), ''),
            case when coalesce((item->>'apto_venda')::boolean, false)
                then 'TERREO' else 'DEFEITO' end
        ),
        nullif(btrim(item->>'estoque_movimento_id'), ''),
        nullif(btrim(item->>'observacoes'), ''),
        case when coalesce((item->>'devolveu_correto')::boolean, true)
            then 'aguardando_analise' else 'divergencia' end
    from jsonb_array_elements(p_itens) item;

    return v_devolucao_id;
end;
$$;

revoke all on function public.salvar_devolucao_marketplace(jsonb, jsonb) from public;
grant execute on function public.salvar_devolucao_marketplace(jsonb, jsonb)
    to authenticated, service_role;

notify pgrst, 'reload schema';