-- Migration: 20260913150000_conferencia_fifo_lotes.sql
-- FASE 3B.2: Consumo FIFO Transacional na Conferência e Estorno Rastreável no Cancelamento

BEGIN;

-- 1. Atualizar constraint de tipo em public.movimento_lotes para suportar ESTORNO_SAIDA_FIFO
ALTER TABLE public.movimento_lotes DROP CONSTRAINT IF EXISTS chk_movimento_lotes_tipo;

ALTER TABLE public.movimento_lotes ADD CONSTRAINT chk_movimento_lotes_tipo CHECK (tipo IN (
    'ENTRADA',
    'SAIDA_FIFO',
    'ESTORNO_SAIDA_FIFO',
    'AJUSTE_INVENTARIO_FALTA',
    'AJUSTE_INVENTARIO_SOBRA',
    'TRANSFERENCIA_SAIDA',
    'TRANSFERENCIA_ENTRADA',
    'BOOTSTRAP'
));

-- 2. Atualizar RPC public.finalizar_conferencia_com_estoque com baixa FIFO atômica em public.estoque_lotes
CREATE OR REPLACE FUNCTION public.finalizar_conferencia_com_estoque(
    p_session_id text,
    p_usuario text,
    p_rows jsonb,
    p_execution_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_execution_id text;
    v_conferencia_id text;
    v_existing_conferencia_id text;
    v_has_separacao boolean := false;
    v_total_itens integer := 0;
    v_total_quantidade integer := 0;
    v_total_movimentos integer := 0;
    v_mov_seq integer := 0;
    v_now timestamp without time zone := timezone('America/Sao_Paulo', clock_timestamp());
    v_bip record;
    v_stock record;
    v_lote record;
    v_has_null_local boolean := false;
    v_has_bipagens boolean := false;
    v_bip_total integer := 0;
    v_conf_total integer := 0;
    v_new_disponivel integer;
    v_new_total integer;
    v_divergencia_autorizada boolean := false;
    v_motivo_divergencia text;
    v_resumo_divergencia jsonb;
    v_has_alias_conflict boolean := false;
    v_mov_id text;
    v_qtd_necessaria numeric;
    v_qtd_lotes_disponivel numeric;
    v_qtd_consumida numeric;
    v_nova_qtd_lote numeric;
    v_custo_lote numeric;
    v_valor_mov_lote numeric;
BEGIN
    -- Validar autenticação
    IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
        RAISE EXCEPTION 'Sessao autenticada obrigatoria.';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.separacao s
         WHERE s.separacao_id = p_session_id
           AND nullif(btrim(coalesce(s.criado_por, '')), '') IS NOT NULL
           AND lower(regexp_replace(btrim(s.criado_por), '\s+', ' ', 'g'))
               = lower(regexp_replace(btrim(coalesce(p_usuario, '')), '\s+', ' ', 'g'))
    ) THEN
        RAISE EXCEPTION 'A conferencia deve ser realizada por outro usuario. Quem separou nao pode conferir.';
    END IF;

    v_divergencia_autorizada := COALESCE((p_rows->0->>'divergencia_autorizada')::boolean, false);
    v_motivo_divergencia := NULLIF(btrim(COALESCE(p_rows->0->>'motivo_divergencia', '')), '');

    IF NULLIF(btrim(p_session_id), '') IS NULL THEN RAISE EXCEPTION 'Separacao nao informada.'; END IF;
    IF NULLIF(btrim(p_usuario), '') IS NULL THEN RAISE EXCEPTION 'Usuario da conferencia nao informado.'; END IF;
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
        RAISE EXCEPTION 'Nenhum item informado para finalizar a conferencia.';
    END IF;

    v_execution_id := COALESCE(NULLIF(btrim(p_execution_id), ''), gen_random_uuid()::text);
    v_conferencia_id := 'CONF-' || v_execution_id;

    -- Trava transacional advisory por sessão
    PERFORM pg_advisory_xact_lock(hashtext('finalizar_conferencia:' || p_session_id));

    SELECT c.conferencia_id
      INTO v_existing_conferencia_id
      FROM public.conferencia c
     WHERE c.conferencia_id = v_conferencia_id
        OR (c.separacao_id = p_session_id AND c.status IN ('conferido', 'finalizada'))
     ORDER BY c.conferido_em DESC NULLS LAST, c.atualizado_em DESC NULLS LAST
     LIMIT 1;

    IF v_existing_conferencia_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'ok', true,
            'status', 'already_processed',
            'conferencia_id', v_existing_conferencia_id,
            'separacao_id', p_session_id,
            'execution_id', v_execution_id
        );
    END IF;

    PERFORM 1
       FROM public.separacao s
      WHERE s.separacao_id = p_session_id
      FOR UPDATE;
    v_has_separacao := FOUND;

    -- Tabela temporária de itens conferidos no payload
    DROP TABLE IF EXISTS pg_temp._finalizar_conferencia_rows;
    CREATE TEMP TABLE _finalizar_conferencia_rows (
        id_interno text NOT NULL,
        ean text,
        descricao text,
        qtd_separada integer NOT NULL,
        qtd_conferida integer NOT NULL,
        divergencia text
    ) ON COMMIT DROP;

    INSERT INTO _finalizar_conferencia_rows (
        id_interno, ean, descricao, qtd_separada, qtd_conferida, divergencia
    )
    SELECT
        btrim(r.id_interno),
        NULLIF(btrim(COALESCE(r.ean, '')), ''),
        NULLIF(btrim(COALESCE(r.descricao, '')), ''),
        COALESCE(r.qtd_separada, 0)::integer,
        COALESCE(r.qtd_conferida, 0)::integer,
        NULLIF(btrim(COALESCE(r.divergencia, '')), '')
      FROM jsonb_to_recordset(p_rows) AS r(
        id_interno text,
        ean text,
        descricao text,
        qtd_separada numeric,
        qtd_conferida numeric,
        divergencia text
      )
     WHERE NULLIF(btrim(COALESCE(r.id_interno, '')), '') IS NOT NULL;

    SELECT COUNT(*), COALESCE(SUM(qtd_conferida), 0)
      INTO v_total_itens, v_total_quantidade
      FROM _finalizar_conferencia_rows;

    IF v_total_itens = 0 THEN
        RAISE EXCEPTION 'Nenhum item valido informado para finalizar a conferencia.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM _finalizar_conferencia_rows WHERE qtd_separada < 0 OR qtd_conferida < 0
    ) THEN
        RAISE EXCEPTION 'A conferencia possui quantidade negativa.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM _finalizar_conferencia_rows WHERE qtd_separada <> qtd_conferida
    ) AND NOT v_divergencia_autorizada THEN
        RAISE EXCEPTION 'A conferencia possui divergencias. Corrija ou autorize o ajuste antes de finalizar.';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id_interno', id_interno, 'ean', ean, 'descricao', descricao,
        'qtd_separada', qtd_separada, 'qtd_conferida', qtd_conferida,
        'diferenca', qtd_conferida - qtd_separada
    )), '[]'::jsonb)
      INTO v_resumo_divergencia
      FROM _finalizar_conferencia_rows
     WHERE qtd_separada <> qtd_conferida;

    -- Validar existência de bipagens físicas salvas para a separação
    SELECT EXISTS (
        SELECT 1 FROM public.separacao_item_bipagens WHERE separacao_id = p_session_id
    ) INTO v_has_bipagens;

    IF NOT v_has_bipagens THEN
        RAISE EXCEPTION 'Nao existem bipagens fisicas salvas com local de origem para a separacao %. Impossivel determinar local_origem real para baixa de estoque.', p_session_id;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.separacao_item_bipagens
         WHERE separacao_id = p_session_id
           AND nullif(btrim(coalesce(local_origem, '')), '') IS NULL
    ) INTO v_has_null_local;

    IF v_has_null_local THEN
        RAISE EXCEPTION 'Existe bipagem nesta separacao sem local de origem registrado (local_origem NULL). Resolva a separacao antes de finalizar a conferencia.';
    END IF;

    -- Tabela temporária de bipagens agrupadas por SKU FÍSICO REAL e LOCAL DE ORIGEM FÍSICO REAL
    DROP TABLE IF EXISTS pg_temp._conferencia_bipagens_agrupadas;
    CREATE TEMP TABLE _conferencia_bipagens_agrupadas (
        id_interno text NOT NULL,
        local_origem text NOT NULL,
        quantidade integer NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO _conferencia_bipagens_agrupadas (id_interno, local_origem, quantidade)
    SELECT btrim(id_interno), upper(btrim(local_origem)), SUM(quantidade)::integer
      FROM public.separacao_item_bipagens
     WHERE separacao_id = p_session_id
     GROUP BY btrim(id_interno), upper(btrim(local_origem));

    SELECT COALESCE(SUM(quantidade), 0) INTO v_bip_total FROM _conferencia_bipagens_agrupadas;
    SELECT COALESCE(SUM(qtd_conferida), 0) INTO v_conf_total FROM _finalizar_conferencia_rows;

    IF v_conf_total <> v_bip_total AND NOT v_divergencia_autorizada THEN
        RAISE EXCEPTION 'A quantidade conferida (%) nao bate com o total de unidades bipadas na separacao (%).', v_conf_total, v_bip_total;
    END IF;

    -- Registrar conferência
    INSERT INTO public.conferencia (
        conferencia_id, separacao_id, status, conferido_por, conferido_em, atualizado_em,
        divergencia_autorizada, motivo_divergencia, resumo_divergencia
    ) VALUES (
        v_conferencia_id, p_session_id, 'conferido', p_usuario, v_now, v_now,
        v_divergencia_autorizada, v_motivo_divergencia, v_resumo_divergencia
    );

    INSERT INTO public.conferencia_itens (
        conferencia_id, separacao_id, id_interno, ean, descricao,
        qtd_separada, qtd_conferida, divergencia
    )
    SELECT
        v_conferencia_id, p_session_id, id_interno, ean, descricao,
        qtd_separada, qtd_conferida,
        CASE
            WHEN qtd_conferida > qtd_separada THEN 'SOBRA'
            WHEN qtd_conferida < qtd_separada THEN 'FALTA'
            ELSE NULL
        END
      FROM _finalizar_conferencia_rows;

    -- ITERAR SOBRE AS BIPAGENS FÍSICAS PARA BAIXA EM ESTOQUE_ATUAL E ESTOQUE_LOTES (FIFO)
    FOR v_bip IN
        SELECT id_interno, local_origem, quantidade
          FROM _conferencia_bipagens_agrupadas
         WHERE quantidade > 0
         ORDER BY id_interno, local_origem
    LOOP
        -- Checagem de alias 1ANDAR / PRIMEIRO_ANDAR
        IF v_bip.local_origem = 'PRIMEIRO_ANDAR' THEN
            SELECT EXISTS (
                SELECT 1 FROM public.estoque_atual
                 WHERE id_interno = v_bip.id_interno AND local = '1ANDAR'
                   AND NOT EXISTS (SELECT 1 FROM public.estoque_atual WHERE id_interno = v_bip.id_interno AND local = 'PRIMEIRO_ANDAR')
            ) INTO v_has_alias_conflict;
            IF v_has_alias_conflict THEN
                RAISE EXCEPTION 'Conflito de alias de local no produto %: bipagem registra "PRIMEIRO_ANDAR", porem estoque_atual possui saldo apenas em "1ANDAR". Corrija o cadastro de local antes de finalizar.', v_bip.id_interno;
            END IF;
        ELSIF v_bip.local_origem = '1ANDAR' THEN
            SELECT EXISTS (
                SELECT 1 FROM public.estoque_atual
                 WHERE id_interno = v_bip.id_interno AND local = 'PRIMEIRO_ANDAR'
                   AND NOT EXISTS (SELECT 1 FROM public.estoque_atual WHERE id_interno = v_bip.id_interno AND local = '1ANDAR')
            ) INTO v_has_alias_conflict;
            IF v_has_alias_conflict THEN
                RAISE EXCEPTION 'Conflito de alias de local no produto %: bipagem registra "1ANDAR", porem estoque_atual possui saldo apenas em "PRIMEIRO_ANDAR". Corrija o cadastro de local antes de finalizar.', v_bip.id_interno;
            END IF;
        END IF;

        -- 1. Trava e valida estoque_atual operacional no local exato
        SELECT * INTO v_stock
          FROM public.estoque_atual ea
         WHERE ea.id_interno = v_bip.id_interno
           AND upper(btrim(ea.local)) = v_bip.local_origem
         ORDER BY ea.id
         LIMIT 1
         FOR UPDATE;

        IF NOT FOUND OR COALESCE(v_stock.saldo_disponivel, 0) < v_bip.quantidade THEN
            RAISE EXCEPTION 'Estoque insuficiente para o produto % no local %. Disponivel: %, Necessario: %.',
                v_bip.id_interno, v_bip.local_origem, COALESCE(v_stock.saldo_disponivel, 0), v_bip.quantidade;
        END IF;

        -- 2. Validar disponibilidade atômica dos lotes FIFO no mesmo SKU e local
        SELECT COALESCE(SUM(l.quantidade_atual), 0)
          INTO v_qtd_lotes_disponivel
          FROM public.estoque_lotes l
         WHERE l.id_interno = v_bip.id_interno
           AND upper(btrim(l.local_estoque)) = v_bip.local_origem
           AND l.quantidade_atual > 0;

        IF v_qtd_lotes_disponivel < v_bip.quantidade THEN
            RAISE EXCEPTION 'INCONSISTENCIA FIFO: lotes insuficientes no local % para o produto %. Disponivel em lotes: %, Necessario: %.',
                v_bip.local_origem, v_bip.id_interno, v_qtd_lotes_disponivel, v_bip.quantidade;
        END IF;

        -- 3. Baixa atômica no estoque_atual
        v_new_disponivel := COALESCE(v_stock.saldo_disponivel, 0) - v_bip.quantidade;
        v_new_total := v_new_disponivel
            + COALESCE(v_stock.saldo_reservado, 0)
            + COALESCE(v_stock.saldo_em_transito, 0);

        UPDATE public.estoque_atual
           SET saldo_disponivel = v_new_disponivel,
               saldo_total = v_new_total,
               atualizado_em = v_now
         WHERE id = v_stock.id;

        v_mov_seq := v_mov_seq + 1;
        v_mov_id := 'MOV-' || v_execution_id || '-' || v_mov_seq::text;

        -- 4. Registrar movimento operacional de saída
        INSERT INTO public.movimentos (
            movimento_id, data_hora, tipo, id_interno,
            local_origem, local_destino, quantidade, usuario, origem, observacao
        ) VALUES (
            v_mov_id, v_now, 'SAIDA', v_bip.id_interno,
            v_bip.local_origem, NULL, v_bip.quantidade, p_usuario, 'APP_CONFERENCIA',
            'Baixa automatica da conferencia ' || p_session_id || ' [Local: ' || v_bip.local_origem || ']'
        );

        v_total_movimentos := v_total_movimentos + 1;

        -- 5. Baixa FIFO atômica em public.estoque_lotes e gravação em public.movimento_lotes
        v_qtd_necessaria := v_bip.quantidade;

        FOR v_lote IN
            SELECT *
              FROM public.estoque_lotes l
             WHERE l.id_interno = v_bip.id_interno
               AND upper(btrim(l.local_estoque)) = v_bip.local_origem
               AND l.quantidade_atual > 0
             ORDER BY l.data_entrada ASC, l.criado_em ASC, l.id ASC
             FOR UPDATE
        LOOP
            IF v_qtd_necessaria <= 0 THEN EXIT; END IF;

            v_qtd_consumida := LEAST(v_qtd_necessaria, v_lote.quantidade_atual);
            v_nova_qtd_lote := v_lote.quantidade_atual - v_qtd_consumida;
            v_custo_lote := round(v_lote.custo_unitario, 2);
            v_valor_mov_lote := v_qtd_consumida * v_custo_lote;

            -- Atualizar lote
            UPDATE public.estoque_lotes
               SET quantidade_atual = v_nova_qtd_lote,
                   custo_total = v_nova_qtd_lote * v_custo_lote,
                   status = CASE WHEN v_nova_qtd_lote = 0 THEN 'esgotado' ELSE 'ativo' END,
                   atualizado_em = v_now
             WHERE id = v_lote.id;

            -- Registrar rastreabilidade do consumo FIFO vinculado ao movimento_id real
            INSERT INTO public.movimento_lotes (
                movimento_id, lote_id, inventario_id, inventario_item_id,
                id_interno, local_estoque, tipo, quantidade,
                custo_unitario, valor_total, execution_id, criado_em
            ) VALUES (
                v_mov_id, v_lote.id, NULL, NULL,
                v_bip.id_interno, v_bip.local_origem, 'SAIDA_FIFO', v_qtd_consumida,
                v_custo_lote, v_valor_mov_lote, v_execution_id, v_now
            );

            v_qtd_necessaria := v_qtd_necessaria - v_qtd_consumida;
        END LOOP;

        IF v_qtd_necessaria > 0 THEN
            RAISE EXCEPTION 'Falha ao processar consumo FIFO total para produto % no local %.', v_bip.id_interno, v_bip.local_origem;
        END IF;
    END LOOP;

    IF v_has_separacao THEN
        UPDATE public.separacao
           SET status = 'finalizada',
               atualizado_em = v_now,
               finalizado_em = v_now
         WHERE separacao_id = p_session_id;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'status', 'finalized',
        'conferencia_id', v_conferencia_id,
        'separacao_id', p_session_id,
        'execution_id', v_execution_id,
        'separacao_atualizada', v_has_separacao,
        'itens', v_total_itens,
        'quantidade_total', v_total_quantidade,
        'movimentos', v_total_movimentos,
        'divergencia_autorizada', v_divergencia_autorizada,
        'motivo_divergencia', v_motivo_divergencia,
        'resumo_divergencia', v_resumo_divergencia
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalizar_conferencia_com_estoque(text, text, jsonb, text) TO anon, authenticated, service_role;


-- 3. Atualizar RPC public.cancelar_separacao_antes_despacho com Estorno Rastreável de Lotes FIFO
CREATE OR REPLACE FUNCTION public.cancelar_separacao_antes_despacho(
    p_separacao_id text,
    p_usuario text,
    p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sep public.separacao%ROWTYPE;
  v_conf public.conferencia%ROWTYPE;
  v_mov public.movimentos%ROWTYPE;
  v_ml record;
  v_now timestamp without time zone := timezone('America/Sao_Paulo', clock_timestamp());
  v_execution_id text := gen_random_uuid()::text;
  v_mov_seq integer := 0;
  v_estorno_mov_id text;
  v_stock record;
  v_movimentos_estornados integer := 0;
  v_unidades_estornadas integer := 0;
  v_lotes_estornados integer := 0;
  v_pacotes integer := 0;
BEGIN
  IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
      RAISE EXCEPTION 'Sessao autenticada obrigatoria.';
  END IF;

  IF nullif(btrim(coalesce(p_separacao_id, '')), '') IS NULL THEN
      RAISE EXCEPTION 'ID da separacao nao informado.';
  END IF;

  IF nullif(btrim(coalesce(p_usuario, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Usuario responsavel pelo cancelamento nao informado.';
  END IF;

  IF nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Motivo do cancelamento nao informado.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cancelar_separacao:' || btrim(p_separacao_id)));

  SELECT * INTO v_sep
    FROM public.separacao
   WHERE separacao_id = btrim(p_separacao_id)
   LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
      RAISE EXCEPTION 'Separacao % nao encontrada.', p_separacao_id;
  END IF;

  IF lower(coalesce(v_sep.status, '')) IN ('cancelada', 'cancelado') THEN
      RETURN jsonb_build_object('ok', true, 'idempotente', true, 'already_cancelled', true, 'separacao_id', v_sep.separacao_id, 'status', 'CANCELADA');
  END IF;

  IF upper(coalesce(v_sep.status, '')) IN ('DESPACHADO', 'ENTREGUE') THEN
      RAISE EXCEPTION 'Separacao % encontra-se no status % e nao pode mais ser cancelada nesta etapa.', v_sep.separacao_id, v_sep.status;
  END IF;

  SELECT * INTO v_conf
    FROM public.conferencia
   WHERE separacao_id = v_sep.separacao_id
   ORDER BY conferido_em DESC NULLS LAST, atualizado_em DESC NULLS LAST
   LIMIT 1 FOR UPDATE;

  -- Percorrer os movimentos de saída originais criados pela conferência desta separação
  FOR v_mov IN
      SELECT *
        FROM public.movimentos
       WHERE upper(tipo) = 'SAIDA'
         AND (coalesce(observacao, '') ILIKE ('%' || v_sep.separacao_id || '%')
              OR coalesce(movimento_id, '') ILIKE '%' || v_sep.separacao_id || '%')
       ORDER BY data_hora ASC, movimento_id ASC
       FOR UPDATE
  LOOP
      v_mov_seq := v_mov_seq + 1;
      v_estorno_mov_id := 'MOV-ESTORNO-' || v_execution_id || '-' || v_mov_seq::text;

      -- 1. Devolver saldo operacional em estoque_atual no local original do movimento
      SELECT * INTO v_stock
        FROM public.estoque_atual
       WHERE id_interno = v_mov.id_interno
         AND upper(btrim(local)) = upper(btrim(v_mov.local_origem))
       LIMIT 1 FOR UPDATE;

      IF FOUND THEN
          UPDATE public.estoque_atual
             SET saldo_disponivel = saldo_disponivel + v_mov.quantidade,
                 saldo_total = saldo_total + v_mov.quantidade,
                 atualizado_em = v_now
           WHERE id = v_stock.id;
      ELSE
          INSERT INTO public.estoque_atual (
              id_interno, local, saldo_disponivel, saldo_reservado, saldo_em_transito, saldo_total, chave_estoque
          ) VALUES (
              v_mov.id_interno, upper(btrim(v_mov.local_origem)), v_mov.quantidade, 0, 0, v_mov.quantidade, v_mov.id_interno || '|' || upper(btrim(v_mov.local_origem))
          );
      END IF;

      -- 2. Registrar movimento de estorno de entrada
      INSERT INTO public.movimentos (
          movimento_id, data_hora, tipo, id_interno, local_origem, local_destino,
          quantidade, usuario, origem, observacao
      ) VALUES (
          v_estorno_mov_id, v_now, 'ENTRADA', v_mov.id_interno, NULL,
          upper(btrim(v_mov.local_origem)), v_mov.quantidade, p_usuario, 'cancelamento_separacao',
          'Estorno automatico por cancelamento da separacao ' || v_sep.separacao_id || '. Motivo: ' || p_motivo
      );

      -- 3. Reverter EXATAMENTE os mesmos lotes consumidos no movimento original (preservando o lote_id original)
      FOR v_ml IN
          SELECT ml.*
            FROM public.movimento_lotes ml
           WHERE ml.movimento_id = v_mov.movimento_id
             AND ml.tipo = 'SAIDA_FIFO'
           ORDER BY ml.criado_em ASC
      LOOP
          -- Devolver a quantidade consumida para o lote original
          UPDATE public.estoque_lotes
             SET quantidade_atual = quantidade_atual + v_ml.quantidade,
                 custo_total = (quantidade_atual + v_ml.quantidade) * custo_unitario,
                 status = 'ativo',
                 atualizado_em = v_now
           WHERE id = v_ml.lote_id;

          -- Registrar rastreabilidade do estorno no lote em movimento_lotes
          INSERT INTO public.movimento_lotes (
              movimento_id, lote_id, inventario_id, inventario_item_id,
              id_interno, local_estoque, tipo, quantidade,
              custo_unitario, valor_total, execution_id, criado_em
          ) VALUES (
              v_estorno_mov_id, v_ml.lote_id, NULL, NULL,
              v_ml.id_interno, v_ml.local_estoque, 'ESTORNO_SAIDA_FIFO', v_ml.quantidade,
              v_ml.custo_unitario, v_ml.valor_total, v_execution_id, v_now
          );

          v_lotes_estornados := v_lotes_estornados + 1;
      END LOOP;

      v_movimentos_estornados := v_movimentos_estornados + 1;
      v_unidades_estornadas := v_unidades_estornadas + v_mov.quantidade;
  END LOOP;

  IF to_regclass('public.separacao_pacotes') IS NOT NULL THEN
    UPDATE public.separacao_pacotes SET status = 'CANCELADO', atualizado_em = v_now
     WHERE separacao_id = v_sep.separacao_id AND status <> 'CANCELADO';
    GET DIAGNOSTICS v_pacotes = ROW_COUNT;
  END IF;

  UPDATE public.conferencia
     SET status = 'cancelada',
         atualizado_em = v_now
   WHERE separacao_id = v_sep.separacao_id
     AND lower(coalesce(status, '')) NOT IN ('cancelada', 'cancelado');

  UPDATE public.separacao
     SET status = 'cancelada',
         total_pacotes_montados = 0,
         atualizado_em = v_now,
         cancelado_em = v_now,
         cancelado_por = p_usuario,
         motivo_cancelamento = p_motivo,
         observacao = concat_ws(' | ', nullif(observacao, ''), 'CANCELADA ANTES DO DESPACHO por ' || p_usuario || ': ' || p_motivo)
   WHERE separacao_id = v_sep.separacao_id;

  RETURN jsonb_build_object(
      'ok', true,
      'status', 'CANCELADA',
      'separacao_id', v_sep.separacao_id,
      'conferencia_id', v_conf.conferencia_id,
      'pacotes_cancelados', v_pacotes,
      'movimentos_estornados', v_movimentos_estornados,
      'unidades_estornadas', v_unidades_estornadas,
      'lotes_estornados', v_lotes_estornados,
      'execution_id', v_execution_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_separacao_antes_despacho(text, text, text) TO anon, authenticated, service_role;

COMMIT;
