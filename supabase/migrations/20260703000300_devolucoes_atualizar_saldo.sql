create or replace function public.atualizar_acompanhamento_devolucao(
    p_id uuid,
    p_marketplace_acionado boolean,
    p_observacao text,
    p_saldo_marketplace numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.devolucoes
       set marketplace_acionado = coalesce(p_marketplace_acionado, false),
           observacao_acompanhamento = nullif(btrim(coalesce(p_observacao, '')), ''),
           saldo_marketplace = coalesce(p_saldo_marketplace, 0),
           status = case
               when coalesce(p_marketplace_acionado, false)
                    and status not in ('resolvida', 'cancelada') then 'em_analise'
               else status
           end,
           atualizado_em = now()
     where id = p_id;
end;
$$;

grant execute on function public.atualizar_acompanhamento_devolucao(uuid, boolean, text, numeric)
    to anon, authenticated, service_role;