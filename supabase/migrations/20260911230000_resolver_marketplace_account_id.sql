-- Migration: Criar RPC segura para resolução de conta operacional Mercado Livre
-- Retorna apenas a identidade da conta (account_id, meli_user_id, nickname) sem expor tokens

CREATE OR REPLACE FUNCTION public.resolver_marketplace_account_id(p_source_account_id text)
RETURNS TABLE (
    account_id integer,
    meli_user_id text,
    nickname text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_source_account_id IS NULL OR trim(p_source_account_id) = '' OR trim(p_source_account_id) !~ '^[0-9]+$' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        a.id::integer AS account_id,
        a.meli_user_id::text AS meli_user_id,
        COALESCE(a.nickname, 'Conta ML')::text AS nickname
    FROM public.mercadolivre_accounts a
    WHERE a.meli_user_id = trim(p_source_account_id)::bigint
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_marketplace_account_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_marketplace_account_id(text) TO anon, authenticated;
