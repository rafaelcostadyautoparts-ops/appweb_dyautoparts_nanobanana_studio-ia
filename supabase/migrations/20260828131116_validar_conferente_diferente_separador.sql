DO $migration$
DECLARE
    v_signature text;
    v_oid regprocedure;
    v_sql text;
    v_guard text := E'    IF EXISTS (\n        SELECT 1\n          FROM public.separacao s\n         WHERE s.separacao_id = p_session_id\n           AND nullif(btrim(coalesce(s.criado_por, '''')), '''') IS NOT NULL\n           AND lower(regexp_replace(btrim(s.criado_por), ''\\s+'', '' '', ''g''))\n               = lower(regexp_replace(btrim(coalesce(p_usuario, '''')), ''\\s+'', '' '', ''g''))\n    ) THEN\n        RAISE EXCEPTION ''A conferencia deve ser realizada por outro usuario. Quem separou nao pode conferir.'';\n    END IF;\n\n';
BEGIN
    FOREACH v_signature IN ARRAY ARRAY[
        'public.finalizar_conferencia(text,text,jsonb,text)',
        'public.finalizar_conferencia_com_estoque(text,text,jsonb,text)'
    ]
    LOOP
        v_oid := to_regprocedure(v_signature);
        IF v_oid IS NULL THEN
            IF v_signature = 'public.finalizar_conferencia(text,text,jsonb,text)' THEN
                RAISE EXCEPTION 'Funcao principal % nao encontrada.', v_signature;
            END IF;
            CONTINUE;
        END IF;
        SELECT replace(pg_get_functiondef(v_oid), chr(13), '') INTO v_sql;
        IF position('Quem separou nao pode conferir.' IN v_sql) = 0 THEN
            IF position(E'BEGIN\n' IN v_sql) = 0 THEN RAISE EXCEPTION 'Inicio da funcao % nao encontrado.', v_signature; END IF;
            v_sql := replace(v_sql, E'BEGIN\n', E'BEGIN\n' || v_guard);
            EXECUTE v_sql;
        END IF;
    END LOOP;
END
$migration$;

COMMENT ON FUNCTION public.finalizar_conferencia(text,text,jsonb,text)
IS 'Finaliza a conferencia com bloqueio transacional para impedir que o separador confira a propria separacao.';
