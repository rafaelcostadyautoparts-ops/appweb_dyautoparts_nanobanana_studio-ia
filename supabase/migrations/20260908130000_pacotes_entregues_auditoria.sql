BEGIN;

-- 1. Adicionar coluna total_pacotes_entregues na tabela separacao
ALTER TABLE public.separacao
ADD COLUMN IF NOT EXISTS total_pacotes_entregues integer NULL;

-- 2. Criar tabela de auditoria imutavel para alteracao manual de pacotes entregues
CREATE TABLE IF NOT EXISTS public.separacao_pacotes_entregues_auditoria (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    separacao_id text NOT NULL REFERENCES public.separacao(separacao_id),
    pacotes_montados_originais integer NOT NULL,
    pacotes_entregues_anteriores integer NULL,
    pacotes_entregues_novos integer NOT NULL,
    operador text NOT NULL,
    device_id text NOT NULL,
    motivo text NOT NULL,
    alterado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS separacao_pacotes_entregues_auditoria_sep_idx
    ON public.separacao_pacotes_entregues_auditoria(separacao_id, alterado_em DESC);

ALTER TABLE public.separacao_pacotes_entregues_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.separacao_pacotes_entregues_auditoria FROM PUBLIC, anon, authenticated;

-- 3. Trigger para impedir UPDATE direto em total_pacotes_entregues sem passar pela RPC
CREATE OR REPLACE FUNCTION public.proteger_pacotes_entregues_direct_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.total_pacotes_entregues IS DISTINCT FROM OLD.total_pacotes_entregues THEN
        IF current_setting('app.ajuste_pacotes_entregues_autorizado', true) IS DISTINCT FROM NEW.separacao_id THEN
            RAISE EXCEPTION 'Alteracao direta de total_pacotes_entregues nao permitida. Use a RPC ajustar_pacotes_entregues_finalizado.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_pacotes_entregues ON public.separacao;
CREATE TRIGGER trg_proteger_pacotes_entregues
BEFORE UPDATE ON public.separacao
FOR EACH ROW EXECUTE FUNCTION public.proteger_pacotes_entregues_direct_update();

-- 4. RPC para ajustar pacotes entregues com PIN e auditoria
CREATE OR REPLACE FUNCTION public.ajustar_pacotes_entregues_finalizado(
    p_separacao_id text,
    p_pin text,
    p_pacotes_entregues integer,
    p_motivo text,
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
    v_now timestamptz := now();
    v_device text := btrim(coalesce(p_device_id, ''));
    v_operador text := coalesce(nullif(btrim(coalesce(p_operador, '')), ''), 'N/A');
    v_motivo text := btrim(coalesce(p_motivo, ''));
    v_tentativas integer;
BEGIN
    IF nullif(btrim(coalesce(p_separacao_id, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Separacao nao informada.';
    END IF;
    IF v_device = '' THEN RAISE EXCEPTION 'Dispositivo nao informado.'; END IF;
    IF p_pacotes_entregues IS NULL OR p_pacotes_entregues < 0 THEN
        RAISE EXCEPTION 'Quantidade de pacotes entregues invalida. Deve ser um numero inteiro maior ou igual a zero.';
    END IF;
    IF char_length(v_motivo) < 3 THEN
        RAISE EXCEPTION 'Motivo obrigatorio para alteracao de pacotes entregues.';
    END IF;
    IF p_pin IS NULL OR p_pin !~ '^\d{4}$' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'PIN_INVALIDO');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('ajustar_pacotes:' || btrim(p_separacao_id)));
    SELECT * INTO v_sep FROM public.separacao
     WHERE separacao_id = btrim(p_separacao_id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Separacao nao encontrada.'; END IF;
    IF lower(coalesce(v_sep.status, '')) NOT IN ('finalizada','finalizado','concluida','concluido','faturada','faturado') THEN
        RAISE EXCEPTION 'Somente separacao finalizada aceita ajuste de pacotes entregues.';
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
    IF v_hash IS NULL OR v_hash <> extensions.crypt(p_pin, v_hash) THEN
        INSERT INTO public.separacao_agrupamento_tentativas_pin(separacao_id, device_id, sucesso)
        VALUES(v_sep.separacao_id, v_device, false);
        RETURN jsonb_build_object('ok', false, 'motivo', 'PIN_INVALIDO');
    END IF;

    INSERT INTO public.separacao_agrupamento_tentativas_pin(separacao_id, device_id, sucesso)
    VALUES(v_sep.separacao_id, v_device, true);

    PERFORM set_config('app.ajuste_pacotes_entregues_autorizado', v_sep.separacao_id, true);

    INSERT INTO public.separacao_pacotes_entregues_auditoria (
        separacao_id,
        pacotes_montados_originais,
        pacotes_entregues_anteriores,
        pacotes_entregues_novos,
        operador,
        device_id,
        motivo,
        alterado_em
    ) VALUES (
        v_sep.separacao_id,
        coalesce(v_sep.total_pacotes_montados, 0),
        v_sep.total_pacotes_entregues,
        p_pacotes_entregues,
        v_operador,
        v_device,
        v_motivo,
        v_now
    );

    UPDATE public.separacao
       SET total_pacotes_entregues = p_pacotes_entregues,
           atualizado_em = v_now
     WHERE id = v_sep.id;

    RETURN jsonb_build_object(
        'ok', true,
        'separacao_id', v_sep.separacao_id,
        'total_pacotes_montados', coalesce(v_sep.total_pacotes_montados, 0),
        'total_pacotes_entregues', p_pacotes_entregues
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ajustar_pacotes_entregues_finalizado(text,text,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ajustar_pacotes_entregues_finalizado(text,text,integer,text,text,text) TO anon, authenticated;

COMMENT ON TABLE public.separacao_pacotes_entregues_auditoria IS
'Auditoria imutavel do ajuste manual da quantidade de pacotes entregues.';

NOTIFY pgrst, 'reload schema';
COMMIT;
