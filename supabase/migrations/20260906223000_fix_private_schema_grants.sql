-- Migration: 20260906223000_fix_private_schema_grants.sql
-- Concede permissao no schema private e ajusta SECURITY DEFINER para triggers de validacao de mapping

BEGIN;

GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO anon, authenticated, service_role;

ALTER FUNCTION private.mapping_version_composicao_valida(bigint, bigint) SECURITY DEFINER;
ALTER FUNCTION private.validar_current_mapping_version() SECURITY DEFINER;
ALTER FUNCTION private.mapping_version_composicao_valida(bigint, bigint) SECURITY DEFINER;
ALTER FUNCTION private.validar_current_mapping_version() SECURITY DEFINER;

CREATE OR REPLACE FUNCTION private.validar_mapping_version_pedido_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_account_id bigint;
  v_mapping_account_id bigint;
  v_mapping_item_id text;
  v_mapping_variation_key text;
  v_item_variation_key text;
BEGIN
  IF new.mapping_version_id IS NULL THEN RETURN new; END IF;

  IF NOT private.mapping_version_composicao_valida(new.mapping_id, new.mapping_version_id) THEN
    RAISE EXCEPTION 'O item não pode usar versão com composição inválida ou vazia';
  END IF;

  SELECT p.mercadolivre_account_id INTO v_account_id FROM public.mercadolivre_pedidos p WHERE p.id = new.pedido_id;
  SELECT m.mercadolivre_account_id, m.item_id, m.variation_key INTO v_mapping_account_id, v_mapping_item_id, v_mapping_variation_key
  FROM public.mercadolivre_item_mappings m WHERE m.id = new.mapping_id;

  v_item_variation_key := coalesce(nullif(btrim(new.variation_id), ''), '__SEM_VARIACAO__');

  IF v_mapping_account_id IS DISTINCT FROM v_account_id
     OR v_mapping_item_id IS DISTINCT FROM new.item_id
     OR v_mapping_variation_key IS DISTINCT FROM v_item_variation_key THEN
    RAISE EXCEPTION 'O mapping não corresponde à conta, item_id ou variation_id';
  END IF;

  RETURN new;
END;
$$;

COMMIT;
