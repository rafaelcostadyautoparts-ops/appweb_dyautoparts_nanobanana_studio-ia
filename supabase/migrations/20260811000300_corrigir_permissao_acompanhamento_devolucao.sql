begin;

-- O aplicativo usa autenticacao operacional propria e acessa as RPCs com o
-- papel anon do Supabase. Mantemos a autorizacao limitada a esta assinatura.
grant execute on function public.atualizar_acompanhamento_devolucao(
    uuid,
    boolean,
    text,
    numeric,
    numeric,
    boolean
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
