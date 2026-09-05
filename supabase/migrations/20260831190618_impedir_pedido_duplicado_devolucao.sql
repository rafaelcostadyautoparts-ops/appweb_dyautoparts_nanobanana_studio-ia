create unique index if not exists uq_devolucoes_pedido_normalizado
on public.devolucoes (
  (lower(regexp_replace(btrim(pedido), '\s+', '', 'g')))
)
where nullif(regexp_replace(btrim(pedido), '\s+', '', 'g'), '') is not null;