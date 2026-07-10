-- DY Auto Parts - controle de reputacao revertida nas devolucoes marketplace

alter table public.devolucoes
    add column if not exists reputacao_revertida boolean not null default false;

comment on column public.devolucoes.reputacao_revertida
    is 'Indica se uma reclamacao que afetou reputacao foi revertida apos acompanhamento.';

create or replace function public.atualizar_acompanhamento_devolucao(
    p_id uuid,
    p_marketplace_acionado boolean,
    p_observacao text,
    p_saldo_marketplace numeric,
    p_tarifa_devolucao_reembolsada numeric,
    p_reputacao_revertida boolean
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
           tarifa_devolucao_reembolsada = coalesce(p_tarifa_devolucao_reembolsada, 0),
           reputacao_revertida = coalesce(p_reputacao_revertida, false),
           status = case
               when coalesce(p_marketplace_acionado, false)
                    and status not in ('resolvida', 'cancelada') then 'em_analise'
               else status
           end,
           atualizado_em = now()
     where id = p_id;
end;
$$;

grant execute on function public.atualizar_acompanhamento_devolucao(uuid, boolean, text, numeric, numeric, boolean)
    to anon, authenticated, service_role;

notify pgrst, 'reload schema';