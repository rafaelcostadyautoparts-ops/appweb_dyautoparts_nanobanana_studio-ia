BEGIN;

DROP FUNCTION IF EXISTS public.sincronizar_pacotes_separacao(text,jsonb,text,text);
DROP FUNCTION IF EXISTS public.sincronizar_pacotes_separacao(text,jsonb,text,text,boolean);

CREATE OR REPLACE FUNCTION public.sincronizar_pacotes_separacao(
    p_separacao_id text,
    p_pacotes jsonb,
    p_usuario text,
    p_execution_id text,
    p_validar_completo boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sep public.separacao%ROWTYPE;
    v_package jsonb;
    v_item jsonb;
    v_package_id text;
    v_type text;
    v_total integer := 0;
    v_now timestamp without time zone := now();
    v_item_code text;
    v_item_ean text;
    v_item_sep_id text;
    v_item_canonico text;
    v_matching_item_id uuid;
    v_total_esperado integer := 0;
    v_total_empacotado integer := 0;
    v_si record;
    v_qtd_empacotada_linha integer := 0;
BEGIN
    IF btrim(coalesce(p_separacao_id, '')) = '' THEN RAISE EXCEPTION 'Separacao nao informada.'; END IF;
    IF jsonb_typeof(coalesce(p_pacotes, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Lista de pacotes invalida.'; END IF;
    IF btrim(coalesce(p_usuario, '')) = '' THEN RAISE EXCEPTION 'Usuario nao informado.'; END IF;

    PERFORM pg_advisory_xact_lock(hashtext('pacotes_separacao:' || btrim(p_separacao_id)));
    SELECT * INTO v_sep FROM public.separacao
     WHERE separacao_id = btrim(p_separacao_id) LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Separacao % nao encontrada.', p_separacao_id; END IF;
    IF lower(coalesce(v_sep.status, '')) IN ('cancelada', 'cancelado') THEN RAISE EXCEPTION 'Separacao cancelada nao aceita pacotes.'; END IF;

    DELETE FROM public.separacao_pacote_itens WHERE separacao_id = v_sep.separacao_id;
    DELETE FROM public.separacao_pacotes WHERE separacao_id = v_sep.separacao_id;

    FOR v_package IN SELECT value FROM jsonb_array_elements(coalesce(p_pacotes, '[]'::jsonb)) LOOP
        v_package_id := btrim(coalesce(v_package->>'pacote_id', ''));
        v_type := upper(btrim(coalesce(v_package->>'tipo', 'AVULSO')));
        IF v_package_id = '' THEN RAISE EXCEPTION 'Pacote sem identificador.'; END IF;
        IF v_type NOT IN ('AVULSO', 'AGRUPADO') THEN RAISE EXCEPTION 'Tipo de pacote invalido: %.', v_type; END IF;
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_package->'itens', '[]'::jsonb))) THEN
            RAISE EXCEPTION 'Pacote % sem itens.', v_package_id;
        END IF;

        INSERT INTO public.separacao_pacotes (pacote_id, separacao_id, tipo, status, criado_por, criado_em, atualizado_em)
        VALUES (v_package_id, v_sep.separacao_id, v_type, 'ATIVO', btrim(p_usuario), v_now, v_now);

        FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(v_package->'itens', '[]'::jsonb)) LOOP
            v_item_code := btrim(coalesce(v_item->>'id_interno', ''));
            v_item_ean := btrim(coalesce(v_item->>'ean', ''));
            v_item_sep_id := btrim(coalesce(v_item->>'separacao_item_id', ''));
            v_item_canonico := btrim(coalesce(v_item->>'id_interno_canonico', ''));

            IF v_item_code = '' AND v_item_canonico = '' THEN
                RAISE EXCEPTION 'Item sem identificador no pacote %.', v_package_id;
            END IF;
            IF coalesce((v_item->>'quantidade')::integer, 0) <= 0 THEN
                RAISE EXCEPTION 'Quantidade invalida no pacote %.', v_package_id;
            END IF;

            -- Localizar a separacao_item correspondente de forma estrita
            SELECT si.id INTO v_matching_item_id
              FROM public.separacao_itens si
             WHERE si.separacao_id = v_sep.separacao_id
               AND (
                   (v_item_sep_id <> '' AND si.id::text = v_item_sep_id)
                   OR (v_item_canonico <> '' AND si.id_interno = v_item_canonico)
                   OR (v_item_code <> '' AND si.id_interno = v_item_code)
                   OR (v_item_code <> '' AND si.ean IS NOT NULL AND si.ean = v_item_code)
                   OR (v_item_ean <> '' AND si.ean IS NOT NULL AND si.ean = v_item_ean)
                   OR (v_item_code <> '' AND EXISTS (
                       SELECT 1
                         FROM jsonb_array_elements(case when jsonb_typeof(si.detalhes_operacionais)='array' then si.detalhes_operacionais else '[]'::jsonb end) det,
                              jsonb_array_elements(coalesce(det->'skus_aceitos', '[]'::jsonb)) sku
                        WHERE btrim(coalesce(sku->>'id_interno', '')) = v_item_code
                           OR btrim(coalesce(sku->>'ean', '')) = v_item_code
                           OR btrim(coalesce(sku->>'id', '')) = v_item_code
                   ))
               )
             LIMIT 1;

            IF v_matching_item_id IS NULL THEN
                RAISE EXCEPTION 'Produto % nao pertence a separacao.', coalesce(nullif(v_item_code, ''), v_item_canonico);
            END IF;

            INSERT INTO public.separacao_pacote_itens (separacao_id, pacote_id, id_interno, quantidade, criado_em)
            VALUES (v_sep.separacao_id, v_package_id, coalesce(nullif(v_item_code, ''), v_item_canonico), (v_item->>'quantidade')::integer, v_now);
        END LOOP;
        v_total := v_total + 1;
    END LOOP;

    -- Validacao de quantidades
    SELECT coalesce(sum(coalesce(qtd_separada, qtd_solicitada, 0)), 0) INTO v_total_esperado
      FROM public.separacao_itens WHERE separacao_id = v_sep.separacao_id;

    SELECT coalesce(sum(quantidade), 0) INTO v_total_empacotado
      FROM public.separacao_pacote_itens WHERE separacao_id = v_sep.separacao_id;

    IF coalesce(p_validar_completo, false) THEN
        IF v_total_empacotado <> v_total_esperado THEN
            RAISE EXCEPTION 'A composicao dos pacotes nao corresponde as quantidades separadas.';
        END IF;

        FOR v_si IN SELECT * FROM public.separacao_itens WHERE separacao_id = v_sep.separacao_id LOOP
            SELECT coalesce(sum(spi.quantidade), 0) INTO v_qtd_empacotada_linha
              FROM public.separacao_pacote_itens spi
             WHERE spi.separacao_id = v_sep.separacao_id
               AND (
                   spi.id_interno = v_si.id_interno
                   OR (v_si.ean IS NOT NULL AND spi.id_interno = v_si.ean)
                   OR EXISTS (
                       SELECT 1
                         FROM jsonb_array_elements(case when jsonb_typeof(v_si.detalhes_operacionais)='array' then v_si.detalhes_operacionais else '[]'::jsonb end) det,
                              jsonb_array_elements(coalesce(det->'skus_aceitos', '[]'::jsonb)) sku
                        WHERE btrim(coalesce(sku->>'id_interno', '')) = spi.id_interno
                           OR btrim(coalesce(sku->>'ean', '')) = spi.id_interno
                           OR btrim(coalesce(sku->>'id', '')) = spi.id_interno
                   )
               );

            IF v_qtd_empacotada_linha <> coalesce(v_si.qtd_separada, v_si.qtd_solicitada, 0) THEN
                RAISE EXCEPTION 'A composicao dos pacotes nao corresponde as quantidades separadas.';
            END IF;
        END LOOP;
    ELSE
        IF v_total_empacotado > v_total_esperado THEN
            RAISE EXCEPTION 'A composicao dos pacotes excede as quantidades separadas.';
        END IF;

        FOR v_si IN SELECT * FROM public.separacao_itens WHERE separacao_id = v_sep.separacao_id LOOP
            SELECT coalesce(sum(spi.quantidade), 0) INTO v_qtd_empacotada_linha
              FROM public.separacao_pacote_itens spi
             WHERE spi.separacao_id = v_sep.separacao_id
               AND (
                   spi.id_interno = v_si.id_interno
                   OR (v_si.ean IS NOT NULL AND spi.id_interno = v_si.ean)
                   OR EXISTS (
                       SELECT 1
                         FROM jsonb_array_elements(case when jsonb_typeof(v_si.detalhes_operacionais)='array' then v_si.detalhes_operacionais else '[]'::jsonb end) det,
                              jsonb_array_elements(coalesce(det->'skus_aceitos', '[]'::jsonb)) sku
                        WHERE btrim(coalesce(sku->>'id_interno', '')) = spi.id_interno
                           OR btrim(coalesce(sku->>'ean', '')) = spi.id_interno
                           OR btrim(coalesce(sku->>'id', '')) = spi.id_interno
                   )
               );

            IF v_qtd_empacotada_linha > coalesce(v_si.qtd_separada, v_si.qtd_solicitada, 0) THEN
                RAISE EXCEPTION 'A composicao dos pacotes excede as quantidades separadas.';
            END IF;
        END LOOP;
    END IF;

    UPDATE public.separacao
       SET total_pacotes_montados = v_total, atualizado_em = v_now
     WHERE id = v_sep.id;

    RETURN jsonb_build_object('ok', true, 'separacao_id', v_sep.separacao_id,
        'total_pacotes_montados', v_total, 'execution_id', nullif(btrim(coalesce(p_execution_id, '')), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_pacotes_separacao(text,jsonb,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sincronizar_pacotes_separacao(text,jsonb,text,text,boolean) TO anon, authenticated;
COMMENT ON FUNCTION public.sincronizar_pacotes_separacao(text,jsonb,text,text,boolean) IS 'Sincroniza rascunhos e pacotes completos validando identidade canonica e SKUs autorizados nos detalhes operacionais.';

COMMIT;
