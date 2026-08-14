-- Integridade entre dispositivos: separacao rapida atomica e inventario por localizacao.

ALTER TABLE public.inventarios_itens
    ADD COLUMN IF NOT EXISTS localizacao_fisica text;

UPDATE public.inventarios_itens ii
   SET localizacao_fisica = ii.local,
       local = upper(btrim(i.local))
  FROM public.inventarios i
 WHERE i.inventario_id = ii.inventario_id
   AND lower(coalesce(i.tipo, '')) = 'localizacao'
   AND nullif(btrim(coalesce(i.local, '')), '') IS NOT NULL
   AND ii.local IS DISTINCT FROM upper(btrim(i.local));

CREATE OR REPLACE FUNCTION public.proteger_separacao_finalizada()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_status text;
BEGIN
    SELECT lower(coalesce(status, '')) INTO v_status
      FROM public.separacao
     WHERE separacao_id = coalesce(NEW.separacao_id, OLD.separacao_id);
    IF v_status IN ('finalizada','finalizado','concluida','concluido','faturada','faturado','cancelada','cancelado') THEN
        RAISE EXCEPTION 'Separacao % esta encerrada e nao pode ter itens alterados.', coalesce(NEW.separacao_id, OLD.separacao_id);
    END IF;
    RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_itens_separacao_finalizada ON public.separacao_itens;
CREATE TRIGGER trg_proteger_itens_separacao_finalizada
BEFORE INSERT OR UPDATE OR DELETE ON public.separacao_itens
FOR EACH ROW EXECUTE FUNCTION public.proteger_separacao_finalizada();

CREATE OR REPLACE FUNCTION public.impedir_reabertura_separacao_finalizada()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF lower(coalesce(OLD.status, '')) IN ('finalizada','finalizado','concluida','concluido','faturada','faturado','cancelada','cancelado')
       AND lower(coalesce(NEW.status, '')) IN ('em_separacao','rascunho','draft','aguardando_produto','aberta') THEN
        RAISE EXCEPTION 'Separacao % esta encerrada e nao pode ser reaberta.', OLD.separacao_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_impedir_reabertura_separacao_finalizada ON public.separacao;
CREATE TRIGGER trg_impedir_reabertura_separacao_finalizada
BEFORE UPDATE ON public.separacao
FOR EACH ROW EXECUTE FUNCTION public.impedir_reabertura_separacao_finalizada();

CREATE OR REPLACE FUNCTION public.finalizar_separacao_rapida_atomica(
    p_separacao_id text,
    p_usuario text,
    p_permitir_negativo boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_sep public.separacao%ROWTYPE;
    v_item record;
    v_local text;
    v_disponivel integer;
    v_retirar integer;
    v_restante integer;
    v_movimentos integer := 0;
    v_produtos integer := 0;
    v_itens integer := 0;
    v_now timestamp without time zone := timezone('America/Sao_Paulo', now());
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessao autenticada obrigatoria.'; END IF;
    IF nullif(btrim(coalesce(p_separacao_id, '')), '') IS NULL THEN RAISE EXCEPTION 'Separacao nao informada.'; END IF;
    IF nullif(btrim(coalesce(p_usuario, '')), '') IS NULL THEN RAISE EXCEPTION 'Usuario nao informado.'; END IF;

    PERFORM pg_advisory_xact_lock(hashtext('finalizar_separacao_rapida:' || btrim(p_separacao_id)));
    SELECT * INTO v_sep FROM public.separacao WHERE separacao_id = btrim(p_separacao_id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Separacao % nao encontrada.', p_separacao_id; END IF;
    IF lower(coalesce(v_sep.status, '')) IN ('finalizada','finalizado','concluida','concluido','faturada','faturado') THEN
        RETURN jsonb_build_object('ok', true, 'idempotente', true, 'separacao_id', v_sep.separacao_id);
    END IF;
    IF lower(coalesce(v_sep.status, '')) IN ('cancelada','cancelado') THEN RAISE EXCEPTION 'Separacao cancelada.'; END IF;
    IF upper(coalesce(v_sep.observacao, '')) NOT LIKE '%SAIDA_RAPIDA%' THEN
        RAISE EXCEPTION 'A separacao % nao esta marcada como modo rapido.', v_sep.separacao_id;
    END IF;

    FOR v_item IN
        SELECT id_interno, sum(greatest(coalesce(qtd_separada, 0), 0))::integer AS quantidade
          FROM public.separacao_itens
         WHERE separacao_id = v_sep.separacao_id
         GROUP BY id_interno
        HAVING sum(greatest(coalesce(qtd_separada, 0), 0)) > 0
         ORDER BY id_interno
    LOOP
        v_produtos := v_produtos + 1;
        v_itens := v_itens + v_item.quantidade;
        v_restante := v_item.quantidade;

        FOREACH v_local IN ARRAY ARRAY['TERREO','MOSTRUARIO','PRIMEIRO_ANDAR'] LOOP
            EXIT WHEN v_restante <= 0;
            SELECT coalesce(sum(greatest(coalesce(saldo_disponivel, 0), 0)), 0)::integer
              INTO v_disponivel FROM public.estoque_atual
             WHERE id_interno = v_item.id_interno AND upper(btrim(local)) = v_local;
            v_retirar := least(v_disponivel, v_restante);
            IF v_retirar > 0 THEN
                PERFORM public.registrar_movimento_estoque('SAIDA', v_item.id_interno, v_local, '', v_retirar,
                    btrim(p_usuario), 'APP_SEPARACAO', 'Baixa automatica da separacao rapida ' || v_sep.separacao_id,
                    false, 'sep-rapida:' || v_sep.separacao_id || ':' || v_item.id_interno || ':' || v_local || ':saldo');
                v_restante := v_restante - v_retirar;
                v_movimentos := v_movimentos + 1;
            END IF;
        END LOOP;

        IF v_restante > 0 THEN
            IF coalesce(p_permitir_negativo, false) IS NOT TRUE THEN
                RAISE EXCEPTION 'Estoque insuficiente para %: faltam % unidades.', v_item.id_interno, v_restante;
            END IF;
            PERFORM public.registrar_movimento_estoque('SAIDA', v_item.id_interno, 'TERREO', '', v_restante,
                btrim(p_usuario), 'APP_SEPARACAO', 'Baixa da separacao rapida ' || v_sep.separacao_id || ' com estoque negativo permitido.',
                true, 'sep-rapida:' || v_sep.separacao_id || ':' || v_item.id_interno || ':TERREO:negativo');
            v_movimentos := v_movimentos + 1;
        END IF;
    END LOOP;

    IF v_produtos = 0 THEN RAISE EXCEPTION 'Separacao sem itens validos.'; END IF;
    UPDATE public.separacao SET status = 'finalizada', atualizado_em = v_now, finalizado_em = v_now,
           total_produtos_separados = v_produtos, total_itens_separados = v_itens
     WHERE id = v_sep.id;
    RETURN jsonb_build_object('ok', true, 'idempotente', false, 'separacao_id', v_sep.separacao_id,
        'movimentos', v_movimentos, 'total_produtos_separados', v_produtos, 'total_itens_separados', v_itens);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalizar_separacao_rapida_atomica_temporario(
    p_separacao_id text, p_usuario text, p_permitir_negativo boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
    PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
    RETURN public.finalizar_separacao_rapida_atomica(p_separacao_id, p_usuario, p_permitir_negativo);
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_separacao_rapida_atomica(text,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_separacao_rapida_atomica_temporario(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_separacao_rapida_atomica(text,text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalizar_separacao_rapida_atomica_temporario(text,text,boolean) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
