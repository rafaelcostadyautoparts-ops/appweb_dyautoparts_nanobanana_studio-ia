-- DY Auto Parts - estoque transacional, inventario atomico e auditoria
-- Aplicar pelo SQL Editor do Supabase antes de publicar o frontend correspondente.

ALTER TABLE public.movimentos
    ADD COLUMN IF NOT EXISTS execution_id text,
    ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE OR REPLACE FUNCTION public.preencher_movimento_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $
BEGIN
    NEW.auth_user_id := coalesce(NEW.auth_user_id, auth.uid());
    RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS movimentos_preencher_auth_user ON public.movimentos;
CREATE TRIGGER movimentos_preencher_auth_user
BEFORE INSERT ON public.movimentos
FOR EACH ROW EXECUTE FUNCTION public.preencher_movimento_auth_user();

CREATE UNIQUE INDEX IF NOT EXISTS movimentos_execution_id_uidx
    ON public.movimentos (execution_id)
    WHERE execution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS movimentos_produto_data_idx
    ON public.movimentos (id_interno, data_hora DESC);

CREATE OR REPLACE FUNCTION public.registrar_movimento_estoque(
    p_tipo text,
    p_id_interno text,
    p_local_origem text,
    p_local_destino text,
    p_quantidade numeric,
    p_usuario text,
    p_origem text DEFAULT 'MANUAL',
    p_observacao text DEFAULT '',
    p_permitir_negativo boolean DEFAULT false,
    p_execution_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tipo text := upper(btrim(coalesce(p_tipo, '')));
    v_id text := btrim(coalesce(p_id_interno, ''));
    v_origem_local text := upper(btrim(coalesce(p_local_origem, '')));
    v_destino_local text := upper(btrim(coalesce(p_local_destino, '')));
    v_quantidade integer := round(coalesce(p_quantidade, 0))::integer;
    v_execution_id text := coalesce(nullif(btrim(p_execution_id), ''), gen_random_uuid()::text);
    v_now timestamp without time zone := now();
    v_movimento_id text;
    v_existente public.movimentos%ROWTYPE;
    v_stock public.estoque_atual%ROWTYPE;
    v_origem_novo integer;
    v_destino_novo integer;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessao autenticada obrigatoria.'; END IF;
    IF v_tipo NOT IN ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO') THEN
        RAISE EXCEPTION 'Tipo de movimento invalido: %.', v_tipo;
    END IF;
    IF v_id = '' THEN RAISE EXCEPTION 'Produto nao informado.'; END IF;
    IF v_quantidade <= 0 THEN RAISE EXCEPTION 'Quantidade deve ser maior que zero.'; END IF;
    IF nullif(btrim(coalesce(p_usuario, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Usuario nao informado.';
    END IF;
    IF v_tipo IN ('SAIDA', 'TRANSFERENCIA', 'AJUSTE_NEGATIVO') AND v_origem_local = '' THEN
        RAISE EXCEPTION 'Local de origem obrigatorio.';
    END IF;
    IF v_tipo IN ('ENTRADA', 'TRANSFERENCIA', 'AJUSTE_POSITIVO') AND v_destino_local = '' THEN
        RAISE EXCEPTION 'Local de destino obrigatorio.';
    END IF;
    IF v_tipo = 'TRANSFERENCIA' AND v_origem_local = v_destino_local THEN
        RAISE EXCEPTION 'Origem e destino devem ser diferentes.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(
        'movimento_estoque:' || v_id || ':' ||
        least(v_origem_local, v_destino_local) || ':' ||
        greatest(v_origem_local, v_destino_local)
    ));

    SELECT * INTO v_existente
      FROM public.movimentos
     WHERE execution_id = v_execution_id
     LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'ok', true, 'idempotente', true,
            'movimento_id', v_existente.movimento_id,
            'data_hora', v_existente.data_hora,
            'tipo', v_existente.tipo,
            'id_interno', v_existente.id_interno,
            'quantidade', v_existente.quantidade
        );
    END IF;

    IF v_tipo IN ('SAIDA', 'TRANSFERENCIA', 'AJUSTE_NEGATIVO') THEN
        SELECT * INTO v_stock
          FROM public.estoque_atual
         WHERE id_interno = v_id AND upper(btrim(local)) = v_origem_local
         ORDER BY id LIMIT 1 FOR UPDATE;
        v_origem_novo := coalesce(v_stock.saldo_disponivel, 0) - v_quantidade;
        IF v_origem_novo < 0 AND coalesce(p_permitir_negativo, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'Estoque insuficiente para % em %. Disponivel: %, solicitado: %.',
                v_id, v_origem_local, coalesce(v_stock.saldo_disponivel, 0), v_quantidade;
        END IF;
        IF FOUND THEN
            UPDATE public.estoque_atual
               SET local = v_origem_local,
                   saldo_disponivel = v_origem_novo,
                   saldo_reservado = coalesce(saldo_reservado, 0),
                   saldo_em_transito = coalesce(saldo_em_transito, 0),
                   saldo_total = v_origem_novo + coalesce(saldo_reservado, 0) + coalesce(saldo_em_transito, 0),
                   atualizado_em = v_now,
                   chave_estoque = coalesce(chave_estoque, v_id || '|' || v_origem_local)
             WHERE id = v_stock.id;
        ELSE
            INSERT INTO public.estoque_atual (
                id_interno, local, saldo_disponivel, saldo_reservado,
                saldo_em_transito, saldo_total, atualizado_em, chave_estoque
            ) VALUES (
                v_id, v_origem_local, v_origem_novo, 0, 0,
                v_origem_novo, v_now, v_id || '|' || v_origem_local
            );
        END IF;
    END IF;

    IF v_tipo IN ('ENTRADA', 'TRANSFERENCIA', 'AJUSTE_POSITIVO') THEN
        SELECT * INTO v_stock
          FROM public.estoque_atual
         WHERE id_interno = v_id AND upper(btrim(local)) = v_destino_local
         ORDER BY id LIMIT 1 FOR UPDATE;
        v_destino_novo := coalesce(v_stock.saldo_disponivel, 0) + v_quantidade;
        IF FOUND THEN
            UPDATE public.estoque_atual
               SET local = v_destino_local,
                   saldo_disponivel = v_destino_novo,
                   saldo_reservado = coalesce(saldo_reservado, 0),
                   saldo_em_transito = coalesce(saldo_em_transito, 0),
                   saldo_total = v_destino_novo + coalesce(saldo_reservado, 0) + coalesce(saldo_em_transito, 0),
                   atualizado_em = v_now,
                   chave_estoque = coalesce(chave_estoque, v_id || '|' || v_destino_local)
             WHERE id = v_stock.id;
        ELSE
            INSERT INTO public.estoque_atual (
                id_interno, local, saldo_disponivel, saldo_reservado,
                saldo_em_transito, saldo_total, atualizado_em, chave_estoque
            ) VALUES (
                v_id, v_destino_local, v_destino_novo, 0, 0,
                v_destino_novo, v_now, v_id || '|' || v_destino_local
            );
        END IF;
    END IF;

    v_movimento_id := 'MOV-ATOMIC-' || v_execution_id;
    INSERT INTO public.movimentos (
        movimento_id, data_hora, tipo, id_interno, local_origem,
        local_destino, quantidade, usuario, origem, observacao, execution_id, auth_user_id
    ) VALUES (
        v_movimento_id, v_now, v_tipo, v_id, v_origem_local,
        v_destino_local, v_quantidade, btrim(p_usuario),
        upper(btrim(coalesce(p_origem, 'MANUAL'))), coalesce(p_observacao, ''), v_execution_id, auth.uid()
    );

    RETURN jsonb_build_object(
        'ok', true, 'idempotente', false, 'movimento_id', v_movimento_id,
        'data_hora', v_now, 'tipo', v_tipo, 'id_interno', v_id,
        'local_origem', v_origem_local, 'local_destino', v_destino_local,
        'quantidade', v_quantidade, 'saldo_origem', v_origem_novo,
        'saldo_destino', v_destino_novo, 'execution_id', v_execution_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalizar_inventario_estoque(
    p_inventario_id text,
    p_usuario text,
    p_execution_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inventario public.inventarios%ROWTYPE;
    v_item public.inventarios_itens%ROWTYPE;
    v_stock public.estoque_atual%ROWTYPE;
    v_local text;
    v_fisico integer;
    v_anterior integer;
    v_reservado integer;
    v_transito integer;
    v_diferenca integer;
    v_now timestamp without time zone := now();
    v_execution_id text := coalesce(nullif(btrim(p_execution_id), ''), 'inventario:' || btrim(p_inventario_id));
    v_total_skus integer := 0;
    v_total_itens integer := 0;
    v_total_contados integer := 0;
    v_total_divergencias integer := 0;
    v_valor_positivo numeric := 0;
    v_valor_negativo numeric := 0;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessao autenticada obrigatoria.'; END IF;
    IF nullif(btrim(coalesce(p_inventario_id, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Inventario nao informado.';
    END IF;
    IF nullif(btrim(coalesce(p_usuario, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Usuario nao informado.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('finalizar_inventario:' || btrim(p_inventario_id)));
    SELECT * INTO v_inventario
      FROM public.inventarios
     WHERE inventario_id = btrim(p_inventario_id)
     LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventario % nao encontrado.', p_inventario_id; END IF;
    IF upper(coalesce(v_inventario.status, '')) = 'FECHADO' THEN
        RETURN jsonb_build_object('ok', true, 'idempotente', true, 'inventario_id', v_inventario.inventario_id);
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.inventarios_itens
         WHERE inventario_id = v_inventario.inventario_id
         GROUP BY id_interno, upper(btrim(local))
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Inventario possui produto/local duplicado. Consolide os itens antes de finalizar.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inventarios_itens WHERE inventario_id = v_inventario.inventario_id) THEN
        RAISE EXCEPTION 'Inventario sem itens.';
    END IF;

    FOR v_item IN
        SELECT * FROM public.inventarios_itens
         WHERE inventario_id = v_inventario.inventario_id
         ORDER BY id_interno, local
    LOOP
        v_local := upper(btrim(coalesce(nullif(v_item.local, ''), v_inventario.local)));
        v_fisico := coalesce(v_item.saldo_fisico, 0);
        IF v_local = '' THEN RAISE EXCEPTION 'Local ausente no produto %.', v_item.id_interno; END IF;
        IF v_fisico < 0 THEN RAISE EXCEPTION 'Contagem fisica negativa no produto %.', v_item.id_interno; END IF;

        PERFORM pg_advisory_xact_lock(hashtext('estoque:' || v_item.id_interno || ':' || v_local));
        SELECT * INTO v_stock
          FROM public.estoque_atual
         WHERE id_interno = v_item.id_interno AND upper(btrim(local)) = v_local
         ORDER BY id LIMIT 1 FOR UPDATE;
        v_anterior := coalesce(v_stock.saldo_disponivel, 0);
        v_reservado := coalesce(v_stock.saldo_reservado, 0);
        v_transito := coalesce(v_stock.saldo_em_transito, 0);
        v_diferenca := v_fisico - v_anterior;

        IF FOUND THEN
            UPDATE public.estoque_atual
               SET local = v_local, saldo_disponivel = v_fisico,
                   saldo_reservado = v_reservado, saldo_em_transito = v_transito,
                   saldo_total = v_fisico + v_reservado + v_transito,
                   atualizado_em = v_now,
                   chave_estoque = coalesce(chave_estoque, v_item.id_interno || '|' || v_local)
             WHERE id = v_stock.id;
        ELSE
            INSERT INTO public.estoque_atual (
                id_interno, local, saldo_disponivel, saldo_reservado,
                saldo_em_transito, saldo_total, atualizado_em, chave_estoque
            ) VALUES (
                v_item.id_interno, v_local, v_fisico, 0, 0,
                v_fisico, v_now, v_item.id_interno || '|' || v_local
            );
        END IF;

        UPDATE public.inventarios_itens
           SET saldo_sistema = v_anterior, diferenca = v_diferenca,
               valor_diferenca = v_diferenca * coalesce(valor_unitario, 0),
               auditado_por = coalesce(nullif(auditado_por, ''), btrim(p_usuario)),
               auditado_em = coalesce(auditado_em, v_now), atualizado_em = v_now
         WHERE id = v_item.id;

        IF v_diferenca <> 0 THEN
            INSERT INTO public.movimentos (
                movimento_id, data_hora, tipo, id_interno, local_origem,
                local_destino, quantidade, usuario, origem, observacao, execution_id, auth_user_id
            ) VALUES (
                'MOV-INV-' || v_execution_id || '-' || v_item.id::text,
                v_now,
                CASE WHEN v_diferenca > 0 THEN 'AJUSTE_POSITIVO' ELSE 'AJUSTE_NEGATIVO' END,
                v_item.id_interno,
                CASE WHEN v_diferenca < 0 THEN v_local ELSE '' END,
                CASE WHEN v_diferenca > 0 THEN v_local ELSE '' END,
                abs(v_diferenca), btrim(p_usuario), 'APP_INVENTARIO',
                'Inventario ' || v_inventario.inventario_id ||
                    ' | saldo ' || v_anterior || ' -> ' || v_fisico,
                v_execution_id || ':' || v_item.id::text, auth.uid()
            );
            v_total_divergencias := v_total_divergencias + 1;
            IF v_diferenca > 0 THEN
                v_valor_positivo := v_valor_positivo + v_diferenca * coalesce(v_item.valor_unitario, 0);
            ELSE
                v_valor_negativo := v_valor_negativo + abs(v_diferenca) * coalesce(v_item.valor_unitario, 0);
            END IF;
        END IF;
        v_total_skus := v_total_skus + 1;
        v_total_itens := v_total_itens + v_anterior;
        v_total_contados := v_total_contados + v_fisico;
    END LOOP;

    UPDATE public.inventarios
       SET status = 'FECHADO', data_fim = v_now, atualizado_em = v_now,
           total_skus = v_total_skus, total_itens = v_total_itens,
           total_itens_contados = v_total_contados,
           total_divergencias = v_total_divergencias,
           valor_ajuste_positivo = v_valor_positivo,
           valor_ajuste_negativo = v_valor_negativo
     WHERE id = v_inventario.id;

    RETURN jsonb_build_object(
        'ok', true, 'idempotente', false, 'inventario_id', v_inventario.inventario_id,
        'total_skus', v_total_skus, 'total_itens', v_total_itens,
        'total_itens_contados', v_total_contados,
        'total_divergencias', v_total_divergencias,
        'valor_ajuste_positivo', v_valor_positivo,
        'valor_ajuste_negativo', v_valor_negativo
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.auditar_integridade_estoque()
RETURNS TABLE (
    problema text,
    id_interno text,
    local text,
    detalhe text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT 'SALDO_TOTAL_INCORRETO', e.id_interno, e.local,
           format('total=%s; esperado=%s', coalesce(e.saldo_total, 0),
               coalesce(e.saldo_disponivel, 0) + coalesce(e.saldo_reservado, 0) + coalesce(e.saldo_em_transito, 0))
      FROM public.estoque_atual e
     WHERE coalesce(e.saldo_total, 0) <>
           coalesce(e.saldo_disponivel, 0) + coalesce(e.saldo_reservado, 0) + coalesce(e.saldo_em_transito, 0)
    UNION ALL
    SELECT 'ESTOQUE_DUPLICADO', e.id_interno, upper(btrim(e.local)),
           format('%s linhas para o mesmo produto/local', count(*))
      FROM public.estoque_atual e
     GROUP BY e.id_interno, upper(btrim(e.local))
    HAVING count(*) > 1
    UNION ALL
    SELECT 'MOVIMENTO_INVALIDO', m.id_interno,
           coalesce(nullif(m.local_destino, ''), m.local_origem),
           format('movimento=%s; tipo=%s; quantidade=%s', m.movimento_id, m.tipo, m.quantidade)
      FROM public.movimentos m
     WHERE coalesce(m.quantidade, 0) <= 0
        OR upper(coalesce(m.tipo, '')) <> coalesce(m.tipo, '')
        OR upper(coalesce(m.origem, '')) <> coalesce(m.origem, '')
    UNION ALL
    SELECT 'INVENTARIO_FECHADO_INCONSISTENTE', ii.id_interno, ii.local,
           format('inventario=%s; diferenca_gravada=%s; diferenca_calculada=%s',
               ii.inventario_id, coalesce(ii.diferenca, 0),
               coalesce(ii.saldo_fisico, 0) - coalesce(ii.saldo_sistema, 0))
      FROM public.inventarios_itens ii
      JOIN public.inventarios i ON i.inventario_id = ii.inventario_id
     WHERE upper(i.status) = 'FECHADO'
       AND coalesce(ii.diferenca, 0) <>
           coalesce(ii.saldo_fisico, 0) - coalesce(ii.saldo_sistema, 0);
$$;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.estoque_atual FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.movimentos FROM anon, authenticated;

DO $permissions$
BEGIN
    IF to_regprocedure('public.registrar_ajuste_estoque(text,text,text,numeric,text,text,boolean,text)') IS NOT NULL THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.registrar_ajuste_estoque(text, text, text, numeric, text, text, boolean, text) FROM anon';
    END IF;
    IF to_regprocedure('public.transferir_estoque(text,text,text,jsonb,text)') IS NOT NULL THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.transferir_estoque(text, text, text, jsonb, text) FROM anon';
    END IF;
    IF to_regprocedure('public.enviar_garantia(text,text,text,text,text,text,text,numeric,numeric,numeric,text,text)') IS NOT NULL THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.enviar_garantia(text, text, text, text, text, text, text, numeric, numeric, numeric, text, text) FROM anon';
    END IF;
END;
$permissions$;

REVOKE ALL ON FUNCTION public.registrar_movimento_estoque(text, text, text, text, numeric, text, text, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_inventario_estoque(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auditar_integridade_estoque() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.registrar_movimento_estoque(text, text, text, text, numeric, text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_inventario_estoque(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auditar_integridade_estoque() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auditar_integridade_estoque() TO service_role;

COMMENT ON FUNCTION public.registrar_movimento_estoque(text, text, text, text, numeric, text, text, text, boolean, text)
IS 'Atualiza estoque e registra um movimento na mesma transacao, com bloqueio e idempotencia.';
COMMENT ON FUNCTION public.finalizar_inventario_estoque(text, text, text)
IS 'Aplica toda a contagem fisica, cria apenas movimentos de divergencia e fecha o inventario atomicamente.';
COMMENT ON FUNCTION public.auditar_integridade_estoque()
IS 'Lista inconsistencias estruturais sem alterar dados.';
