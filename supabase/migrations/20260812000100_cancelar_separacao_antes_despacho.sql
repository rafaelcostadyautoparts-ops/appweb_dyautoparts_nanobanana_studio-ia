-- Cancela uma separacao antes do despacho, cancela seus pacotes e estorna eventual baixa de estoque.
ALTER TABLE public.separacao
  ADD COLUMN IF NOT EXISTS cancelado_em timestamp without time zone,
  ADD COLUMN IF NOT EXISTS cancelado_por text,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

CREATE OR REPLACE FUNCTION public.cancelar_separacao_antes_despacho(
  p_separacao_id text,
  p_usuario text,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sep public.separacao%ROWTYPE;
  v_now timestamp without time zone := timezone('America/Sao_Paulo', now());
  v_mov public.movimentos%ROWTYPE;
  v_stock_id uuid;
  v_estornos integer := 0;
  v_pacotes integer := 0;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_usuario text := coalesce(nullif(btrim(coalesce(p_usuario, '')), ''), 'N/A');
  v_estorno_id text;
BEGIN
  IF nullif(btrim(coalesce(p_separacao_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Separacao nao informada.';
  END IF;
  IF length(v_motivo) < 5 THEN
    RAISE EXCEPTION 'Informe um motivo de cancelamento com pelo menos 5 caracteres.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cancelar_separacao:' || btrim(p_separacao_id)));
  SELECT * INTO v_sep FROM public.separacao WHERE separacao_id = btrim(p_separacao_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Separacao % nao encontrada.', p_separacao_id; END IF;

  IF lower(coalesce(v_sep.status, '')) IN ('cancelada', 'cancelado') THEN
    RETURN jsonb_build_object('ok', true, 'already_cancelled', true, 'separacao_id', v_sep.separacao_id, 'pacotes_cancelados', 0, 'estornos', 0);
  END IF;

  -- Estorna somente saidas operacionais desta separacao. O id deterministico impede estorno duplicado.
  FOR v_mov IN
    SELECT m.*
      FROM public.movimentos m
     WHERE lower(coalesce(m.tipo, '')) = 'saida'
       AND (lower(coalesce(m.origem, '')) IN ('conferencia', 'app_separacao')
            OR lower(coalesce(m.observacao, '')) LIKE '%separacao%')
       AND (coalesce(m.observacao, '') ILIKE '%' || v_sep.separacao_id || '%'
            OR coalesce(m.movimento_id, '') ILIKE '%' || v_sep.separacao_id || '%')
     ORDER BY m.data_hora, m.id
  LOOP
    v_estorno_id := 'MOV-CANCEL-' || substr(md5(v_sep.separacao_id || ':' || v_mov.movimento_id), 1, 20);
    IF EXISTS (SELECT 1 FROM public.movimentos WHERE movimento_id = v_estorno_id) THEN CONTINUE; END IF;

    SELECT id INTO v_stock_id
      FROM public.estoque_atual
     WHERE id_interno = v_mov.id_interno
       AND local = coalesce(v_mov.local_origem, 'TERREO')
     ORDER BY id
     LIMIT 1
     FOR UPDATE;

    IF v_stock_id IS NULL THEN
      INSERT INTO public.estoque_atual(id_interno, local, saldo_disponivel, saldo_reservado, saldo_em_transito, saldo_total, atualizado_em, chave_estoque)
      VALUES(v_mov.id_interno, coalesce(v_mov.local_origem, 'TERREO'), v_mov.quantidade, 0, 0, v_mov.quantidade, v_now,
             v_mov.id_interno || '|' || coalesce(v_mov.local_origem, 'TERREO'))
      RETURNING id INTO v_stock_id;
    ELSE
      UPDATE public.estoque_atual
         SET saldo_disponivel = coalesce(saldo_disponivel, 0) + v_mov.quantidade,
             saldo_total = coalesce(saldo_disponivel, 0) + v_mov.quantidade + coalesce(saldo_reservado, 0) + coalesce(saldo_em_transito, 0),
             atualizado_em = v_now
       WHERE id = v_stock_id;
    END IF;

    INSERT INTO public.movimentos(movimento_id, data_hora, tipo, id_interno, local_origem, local_destino, quantidade, usuario, origem, observacao)
    VALUES(v_estorno_id, v_now, 'entrada', v_mov.id_interno, NULL, coalesce(v_mov.local_origem, 'TERREO'), v_mov.quantidade,
           v_usuario, 'cancelamento_separacao', 'Estorno do movimento ' || v_mov.movimento_id || ' pelo cancelamento da separacao ' || v_sep.separacao_id || '. Motivo: ' || v_motivo);
    v_estornos := v_estornos + 1;
    v_stock_id := NULL;
  END LOOP;

  IF to_regclass('public.separacao_pacotes') IS NOT NULL THEN
    UPDATE public.separacao_pacotes SET status = 'CANCELADO', atualizado_em = v_now
     WHERE separacao_id = v_sep.separacao_id AND status <> 'CANCELADO';
    GET DIAGNOSTICS v_pacotes = ROW_COUNT;
  END IF;

  UPDATE public.conferencia SET status = 'cancelada', atualizado_em = v_now
   WHERE separacao_id = v_sep.separacao_id AND lower(coalesce(status, '')) NOT IN ('cancelada', 'cancelado');

  UPDATE public.separacao
     SET status = 'cancelada', total_pacotes_montados = 0, atualizado_em = v_now,
         cancelado_em = v_now, cancelado_por = v_usuario, motivo_cancelamento = v_motivo,
         observacao = concat_ws(' | ', nullif(observacao, ''), 'CANCELADA ANTES DO DESPACHO por ' || v_usuario || ': ' || v_motivo)
   WHERE separacao_id = v_sep.separacao_id;

  RETURN jsonb_build_object('ok', true, 'already_cancelled', false, 'separacao_id', v_sep.separacao_id,
                            'pacotes_cancelados', v_pacotes, 'estornos', v_estornos,
                            'estoque_estornado', v_estornos > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_separacao_antes_despacho(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_separacao_antes_despacho(text,text,text) TO anon, authenticated;
COMMENT ON FUNCTION public.cancelar_separacao_antes_despacho(text,text,text) IS 'Cancela atomicamente separacao antes do despacho, pacotes e conferencia; estorna baixas de estoque uma unica vez.';