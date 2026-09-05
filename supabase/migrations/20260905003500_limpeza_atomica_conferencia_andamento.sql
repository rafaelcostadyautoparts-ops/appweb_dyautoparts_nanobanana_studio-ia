-- Migration: Limpeza atomica de rascunhos de conferencia em andamento na RPC finalizar_conferencia
DO $migration$
DECLARE
    v_oid regprocedure;
    v_sql text;
    v_cleanup text := E'\n    -- Limpeza atomica de rascunhos temporarios de conferencia em andamento\n    DELETE FROM public.conferencia_itens\n     WHERE separacao_id = p_session_id\n       AND conferencia_id = (''CONF-DRAFT-'' || p_session_id);\n\n    DELETE FROM public.conferencia\n     WHERE separacao_id = p_session_id\n       AND status = ''em_conferencia''\n       AND conferencia_id IN (''CONF-DRAFT-'' || p_session_id, ''CONF-'' || p_session_id);\n';
BEGIN
    v_oid := to_regprocedure('public.finalizar_conferencia(text,text,jsonb,text)');
    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'Funcao public.finalizar_conferencia(text,text,jsonb,text) nao encontrada.';
    END IF;

    SELECT replace(pg_get_functiondef(v_oid), chr(13), '') INTO v_sql;

    IF position('Limpeza atomica de rascunhos temporarios de conferencia em andamento' IN v_sql) = 0 THEN
        -- 1. Injeta no fluxo de idempotencia se a conferencia ja tiver sido processada
        IF position(E'IF v_existing_conferencia_id IS NOT NULL THEN\n' IN v_sql) > 0 THEN
            v_sql := replace(
                v_sql,
                E'IF v_existing_conferencia_id IS NOT NULL THEN\n',
                E'IF v_existing_conferencia_id IS NOT NULL THEN\n' || v_cleanup
            );
        END IF;

        -- 2. Injeta no fluxo principal logo apos atualizar a separacao
        IF position(E'WHERE separacao_id = p_session_id;\n    END IF;\n' IN v_sql) > 0 THEN
            v_sql := replace(
                v_sql,
                E'WHERE separacao_id = p_session_id;\n    END IF;\n',
                E'WHERE separacao_id = p_session_id;\n    END IF;\n' || v_cleanup
            );
        ELSE
            RAISE EXCEPTION 'Trecho de finalizacao da separacao nao encontrado para injetar limpeza atomica.';
        END IF;

        EXECUTE v_sql;
    END IF;
END
$migration$;

COMMENT ON FUNCTION public.finalizar_conferencia(text,text,jsonb,text)
IS 'Finaliza a conferencia com bloqueio transacional, validacao de operador e limpeza atomica de rascunhos em andamento.';
