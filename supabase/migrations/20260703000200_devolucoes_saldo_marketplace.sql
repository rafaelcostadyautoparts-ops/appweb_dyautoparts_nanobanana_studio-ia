alter table public.devolucoes
    add column if not exists saldo_marketplace numeric(14,2) not null default 0;

create or replace function public.salvar_devolucao_marketplace(p_devolucao jsonb, p_itens jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
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
        tipo, canal, pedido, remetente, cidade, uf, data_devolucao, motivo,
        impactou_reputacao, marketplace_acionado, observacao_acompanhamento,
        saldo_marketplace, status, observacoes, responsavel
    ) values (
        'marketplace', coalesce(nullif(btrim(p_devolucao->>'canal'), ''), 'MAGALU'),
        btrim(p_devolucao->>'pedido'), nullif(btrim(p_devolucao->>'remetente'), ''),
        nullif(btrim(p_devolucao->>'cidade'), ''), nullif(upper(btrim(p_devolucao->>'uf')), ''),
        coalesce(nullif(p_devolucao->>'data_devolucao', '')::date, current_date),
        coalesce(nullif(btrim(p_devolucao->>'motivo'), ''), 'Devolucao'),
        coalesce((p_devolucao->>'impactou_reputacao')::boolean, false),
        coalesce((p_devolucao->>'marketplace_acionado')::boolean, false),
        nullif(btrim(p_devolucao->>'observacao_acompanhamento'), ''),
        coalesce((p_devolucao->>'saldo_marketplace')::numeric, 0),
        case when coalesce((p_devolucao->>'marketplace_acionado')::boolean, false)
            then 'em_analise' else 'recebida' end,
        nullif(btrim(p_devolucao->>'observacoes'), ''),
        nullif(btrim(p_devolucao->>'responsavel'), '')
    ) returning id into v_devolucao_id;

    insert into public.devolucao_itens (
        devolucao_id, produto_id, id_interno, ean, sku, descricao, categoria,
        quantidade, valor_unitario, fornecedor, devolveu_correto, observacoes, destino
    )
    select v_devolucao_id, nullif(item->>'produto_id', '')::uuid,
        nullif(btrim(item->>'id_interno'), ''), nullif(btrim(item->>'ean'), ''),
        nullif(btrim(item->>'sku'), ''), coalesce(nullif(btrim(item->>'descricao'), ''), 'Produto sem descricao'),
        nullif(btrim(item->>'categoria'), ''), greatest(coalesce((item->>'quantidade')::numeric, 1), 0.001),
        greatest(coalesce((item->>'valor_unitario')::numeric, 0), 0), nullif(btrim(item->>'fornecedor'), ''),
        coalesce((item->>'devolveu_correto')::boolean, true), nullif(btrim(item->>'observacoes'), ''),
        case when coalesce((item->>'devolveu_correto')::boolean, true)
            then 'aguardando_analise' else 'divergencia' end
    from jsonb_array_elements(p_itens) item;

    return v_devolucao_id;
end;
$$;

grant execute on function public.salvar_devolucao_marketplace(jsonb, jsonb)
    to anon, authenticated, service_role;