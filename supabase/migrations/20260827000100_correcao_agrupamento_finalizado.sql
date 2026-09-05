BEGIN;

CREATE TABLE IF NOT EXISTS public.separacao_agrupamento_correcoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    separacao_id text NOT NULL REFERENCES public.separacao(separacao_id),
    token_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'AUTORIZADA' CHECK (status IN ('AUTORIZADA', 'CONCLUIDA', 'EXPIRADA')),
    operador text NOT NULL,
    device_id text,
    autorizado_em timestamp without time zone NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
    expira_em timestamp without time zone NOT NULL,
    concluido_em timestamp without time zone,
    composicao_anterior jsonb NOT NULL,
    composicao_nova jsonb,
    pos_finalizacao boolean NOT NULL DEFAULT true,
    execution_id text UNIQUE
);

CREATE INDEX IF NOT EXISTS separacao_agrupamento_correcoes_sep_idx
    ON public.separacao_agrupamento_correcoes(separacao_id, autorizado_em DESC);

CREATE TABLE IF NOT EXISTS public.separacao_agrupamento_tentativas_pin (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    separacao_id text NOT NULL,
    device_id text NOT NULL,
    sucesso boolean NOT NULL,
    tentado_em timestamp without time zone NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

CREATE INDEX IF NOT EXISTS separacao_agrupamento_tentativas_pin_idx
    ON public.separacao_agrupamento_tentativas_pin(device_id, tentado_em DESC);

ALTER TABLE public.separacao_agrupamento_correcoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.separacao_agrupamento_tentativas_pin ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.separacao_agrupamento_correcoes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.separacao_agrupamento_tentativas_pin FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.autorizar_correcao_agrupamento_finalizado(
    p_separacao_id text,
    p_pin text,
    p_operador text,
    p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_sep public.separacao%ROWTYPE;
    v_hash text;
    v_token uuid := gen_random_uuid();
    v_now timestamp without time zone := timezone('America/Sao_Paulo', now());
    v_device text := btrim(coalesce(p_device_id, ''));
    v_operador text := coalesce(nullif(btrim(coalesce(p_operador, '')), ''), 'N/A');
    v_composicao jsonb;
    v_tentativas integer;
BEGIN
    IF nullif(btrim(coalesce(p_separacao_id, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Separacao nao informada.';
    END IF;
    IF v_device = '' THEN RAISE EXCEPTION 'Dispositivo nao informado.'; END IF;
    IF p_pin IS NULL OR p_pin !~ '^\d{4}$' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'PIN_INVALIDO');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('correcao_agrupamento:' || btrim(p_separacao_id)));
    SELECT * INTO v_sep FROM public.separacao
     WHERE separacao_id = btrim(p_separacao_id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Separacao nao encontrada.'; END IF;
    IF lower(coalesce(v_sep.status, '')) NOT IN ('finalizada','finalizado','concluida','concluido','faturada','faturado') THEN
        RAISE EXCEPTION 'Somente separacao finalizada aceita correcao de agrupamento.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.separacao_item_cancelamentos c WHERE c.separacao_id = v_sep.separacao_id) THEN
        RAISE EXCEPTION 'Separacao com item cancelado nao aceita correcao de agrupamento nesta versao.';
    END IF;

    SELECT count(*) INTO v_tentativas
      FROM public.separacao_agrupamento_tentativas_pin
     WHERE device_id = v_device AND sucesso IS FALSE
       AND tentado_em >= v_now - interval '15 minutes';
    IF v_tentativas >= 5 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'TENTATIVAS_EXCEDIDAS');
    END IF;

    SELECT valor_hash INTO v_hash FROM public.configuracoes_seguranca
     WHERE chave = 'pin_mestre' AND algoritmo = 'bcrypt' LIMIT 1;
    IF v_hash IS NULL OR v_hash <> crypt(p_pin, v_hash) THEN
        INSERT INTO public.separacao_agrupamento_tentativas_pin(separacao_id, device_id, sucesso)
        VALUES(v_sep.separacao_id, v_device, false);
        RETURN jsonb_build_object('ok', false, 'motivo', 'PIN_INVALIDO');
    END IF;

    INSERT INTO public.separacao_agrupamento_tentativas_pin(separacao_id, device_id, sucesso)
    VALUES(v_sep.separacao_id, v_device, true);

    UPDATE public.separacao_agrupamento_correcoes
       SET status = 'EXPIRADA'
     WHERE separacao_id = v_sep.separacao_id AND status = 'AUTORIZADA';

    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'pacote_id', p.pacote_id,
            'tipo', p.tipo,
            'itens', coalesce((
                SELECT jsonb_agg(jsonb_build_object('id_interno', pi.id_interno, 'quantidade', pi.quantidade) ORDER BY pi.id_interno)
                  FROM public.separacao_pacote_itens pi
                 WHERE pi.separacao_id = p.separacao_id AND pi.pacote_id = p.pacote_id
            ), '[]'::jsonb)
        ) ORDER BY p.criado_em, p.pacote_id
    ), '[]'::jsonb) INTO v_composicao
      FROM public.separacao_pacotes p
     WHERE p.separacao_id = v_sep.separacao_id AND p.status = 'ATIVO';

    INSERT INTO public.separacao_agrupamento_correcoes(
        separacao_id, token_hash, operador, device_id, expira_em, composicao_anterior
    ) VALUES (
        v_sep.separacao_id, encode(digest(v_token::text, 'sha256'), 'hex'),
        v_operador, v_device, v_now + interval '10 minutes', v_composicao
    );

    RETURN jsonb_build_object('ok', true, 'token', v_token, 'expira_em', v_now + interval '10 minutes');
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_correcao_agrupamento_finalizado(
    p_separacao_id text,
    p_token uuid,
    p_pacotes jsonb,
    p_operador text,
    p_device_id text,
    p_execution_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_sep public.separacao%ROWTYPE;
    v_auth public.separacao_agrupamento_correcoes%ROWTYPE;
    v_package jsonb;
    v_item jsonb;
    v_package_id text;
    v_type text;
    v_total integer := 0;
    v_now timestamp without time zone := timezone('America/Sao_Paulo', now());
    v_execution text := btrim(coalesce(p_execution_id, ''));
BEGIN
    IF p_token IS NULL THEN RAISE EXCEPTION 'Autorizacao nao informada.'; END IF;
    IF jsonb_typeof(coalesce(p_pacotes, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_pacotes, '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'Composicao de pacotes invalida.';
    END IF;
    IF v_execution = '' THEN RAISE EXCEPTION 'Identificador da operacao nao informado.'; END IF;

    PERFORM pg_advisory_xact_lock(hashtext('correcao_agrupamento:' || btrim(p_separacao_id)));
    SELECT * INTO v_sep FROM public.separacao WHERE separacao_id = btrim(p_separacao_id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Separacao nao encontrada.'; END IF;
    IF lower(coalesce(v_sep.status, '')) NOT IN ('finalizada','finalizado','concluida','concluido','faturada','faturado') THEN
        RAISE EXCEPTION 'A separacao deixou de estar finalizada.';
    END IF;

    SELECT * INTO v_auth FROM public.separacao_agrupamento_correcoes
     WHERE separacao_id = v_sep.separacao_id
       AND token_hash = encode(digest(p_token::text, 'sha256'), 'hex')
     FOR UPDATE;
    IF NOT FOUND OR v_auth.status <> 'AUTORIZADA' OR v_auth.expira_em < v_now THEN
        RAISE EXCEPTION 'Autorizacao invalida ou expirada.';
    END IF;
    IF coalesce(v_auth.device_id, '') <> btrim(coalesce(p_device_id, '')) THEN
        RAISE EXCEPTION 'Autorizacao pertence a outro dispositivo.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.separacao_item_cancelamentos c WHERE c.separacao_id = v_sep.separacao_id) THEN
        RAISE EXCEPTION 'Separacao com item cancelado nao aceita correcao de agrupamento nesta versao.';
    END IF;

    CREATE TEMP TABLE _novos_pacotes (
        pacote_id text NOT NULL,
        tipo text NOT NULL,
        id_interno text NOT NULL,
        quantidade integer NOT NULL
    ) ON COMMIT DROP;

    FOR v_package IN SELECT value FROM jsonb_array_elements(p_pacotes) LOOP
        v_package_id := btrim(coalesce(v_package->>'pacote_id', ''));
        v_type := upper(btrim(coalesce(v_package->>'tipo', '')));
        IF v_package_id = '' OR v_type NOT IN ('AVULSO', 'AGRUPADO') THEN RAISE EXCEPTION 'Pacote invalido.'; END IF;
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_package->'itens', '[]'::jsonb))) THEN
            RAISE EXCEPTION 'Pacote sem itens.';
        END IF;
        FOR v_item IN SELECT value FROM jsonb_array_elements(v_package->'itens') LOOP
            INSERT INTO _novos_pacotes VALUES (
                v_package_id,
                v_type,
                btrim(coalesce(v_item->>'id_interno', '')),
                coalesce((v_item->>'quantidade')::integer, 0)
            );
        END LOOP;
    END LOOP;

    IF EXISTS (SELECT 1 FROM _novos_pacotes WHERE id_interno = '' OR quantidade <= 0) THEN
        RAISE EXCEPTION 'Produto ou quantidade invalida na composicao.';
    END IF;
    IF EXISTS (SELECT 1 FROM _novos_pacotes GROUP BY pacote_id HAVING count(DISTINCT tipo) <> 1) THEN
        RAISE EXCEPTION 'Pacote informado com tipos diferentes.';
    END IF;
    IF EXISTS (SELECT 1 FROM _novos_pacotes WHERE tipo = 'AVULSO' GROUP BY pacote_id HAVING sum(quantidade) <> 1) THEN
        RAISE EXCEPTION 'Pacote avulso deve conter exatamente uma unidade.';
    END IF;
    IF EXISTS (
        WITH esperado AS (
            SELECT id_interno, sum(greatest(coalesce(qtd_separada, qtd_solicitada, 0), 0))::integer quantidade
              FROM public.separacao_itens WHERE separacao_id = v_sep.separacao_id GROUP BY id_interno
        ), recebido AS (
            SELECT id_interno, sum(quantidade)::integer quantidade FROM _novos_pacotes GROUP BY id_interno
        )
        SELECT 1 FROM esperado e FULL JOIN recebido r USING (id_interno)
         WHERE coalesce(e.quantidade, 0) <> coalesce(r.quantidade, 0)
    ) THEN
        RAISE EXCEPTION 'A composicao corrigida altera produto ou quantidade da separacao.';
    END IF;

    PERFORM set_config('app.correcao_agrupamento_autorizada', v_sep.separacao_id, true);

    DELETE FROM public.separacao_pacote_itens WHERE separacao_id = v_sep.separacao_id;
    DELETE FROM public.separacao_pacotes WHERE separacao_id = v_sep.separacao_id;

    INSERT INTO public.separacao_pacotes(pacote_id, separacao_id, tipo, status, criado_por, criado_em, atualizado_em)
    SELECT pacote_id, v_sep.separacao_id, min(tipo), 'ATIVO',
           coalesce(nullif(btrim(coalesce(p_operador, '')), ''), v_auth.operador), v_now, v_now
      FROM _novos_pacotes GROUP BY pacote_id;

    INSERT INTO public.separacao_pacote_itens(separacao_id, pacote_id, id_interno, quantidade, criado_em)
    SELECT v_sep.separacao_id, pacote_id, id_interno, sum(quantidade), v_now
      FROM _novos_pacotes GROUP BY pacote_id, id_interno;

    SELECT count(DISTINCT pacote_id) INTO v_total FROM _novos_pacotes;
    PERFORM set_config('app.preservar_finalizado_em', v_sep.separacao_id, true);
    UPDATE public.separacao SET total_pacotes_montados = v_total WHERE id = v_sep.id;

    UPDATE public.separacao_agrupamento_correcoes
       SET status = 'CONCLUIDA', concluido_em = v_now,
           operador = coalesce(nullif(btrim(coalesce(p_operador, '')), ''), operador),
           composicao_nova = p_pacotes, execution_id = v_execution
     WHERE id = v_auth.id;

    RETURN jsonb_build_object('ok', true, 'separacao_id', v_sep.separacao_id,
        'total_pacotes_montados', v_total, 'correcao_id', v_auth.id);
END;
$$;

-- A sincronizacao comum nunca pode alterar a composicao de uma separacao encerrada.
CREATE OR REPLACE FUNCTION public.proteger_pacotes_separacao_finalizada()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
    v_status text;
    v_separacao_id text;
BEGIN
    v_separacao_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.separacao_id ELSE NEW.separacao_id END;
    IF current_setting('app.correcao_agrupamento_autorizada', true) = v_separacao_id THEN
        RETURN coalesce(NEW, OLD);
    END IF;
    SELECT lower(coalesce(status, '')) INTO v_status FROM public.separacao
     WHERE separacao_id = v_separacao_id;
    IF v_status IN ('finalizada','finalizado','concluida','concluido','faturada','faturado','cancelada','cancelado') THEN
        RAISE EXCEPTION 'Separacao finalizada nao aceita alteracao direta de pacotes.';
    END IF;
    RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_pacotes_separacao_finalizada ON public.separacao_pacotes;
CREATE TRIGGER trg_proteger_pacotes_separacao_finalizada
BEFORE INSERT OR UPDATE OR DELETE ON public.separacao_pacotes
FOR EACH ROW EXECUTE FUNCTION public.proteger_pacotes_separacao_finalizada();

DROP TRIGGER IF EXISTS trg_proteger_pacote_itens_separacao_finalizada ON public.separacao_pacote_itens;
CREATE TRIGGER trg_proteger_pacote_itens_separacao_finalizada
BEFORE INSERT OR UPDATE OR DELETE ON public.separacao_pacote_itens
FOR EACH ROW EXECUTE FUNCTION public.proteger_pacotes_separacao_finalizada();

CREATE OR REPLACE FUNCTION public.touch_separacao_data_hora_brasil()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF tg_op = 'INSERT' THEN
        NEW.criado_em := public.data_hora_brasil();
    ELSE
        NEW.criado_em := OLD.criado_em;
    END IF;

    NEW.atualizado_em := public.data_hora_brasil();

    IF current_setting('app.preservar_finalizado_em', true) = OLD.separacao_id THEN
        NEW.finalizado_em := OLD.finalizado_em;
    ELSIF NEW.finalizado_em IS NOT NULL
       OR lower(coalesce(NEW.status, '')) IN ('finalizada', 'finalizado', 'conferido') THEN
        NEW.finalizado_em := public.data_hora_brasil();
    END IF;

    RETURN NEW;
END;
$$;

-- A RPC comum falha antes de apagar pacotes, pois o trigger acima protege a separacao finalizada.
REVOKE EXECUTE ON FUNCTION public.set_pin_mestre(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_pin_mestre(text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.validar_pin_mestre(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_pin_mestre(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.autorizar_correcao_agrupamento_finalizado(text,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.salvar_correcao_agrupamento_finalizado(text,uuid,jsonb,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.autorizar_correcao_agrupamento_finalizado(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_correcao_agrupamento_finalizado(text,uuid,jsonb,text,text,text) TO anon, authenticated;

COMMENT ON TABLE public.separacao_agrupamento_correcoes IS
'Auditoria imutavel da correcao pos-finalizacao limitada exclusivamente a composicao dos pacotes.';

NOTIFY pgrst, 'reload schema';
COMMIT;
