-- Permite finalizar conferencia divergente sem solicitar motivo e sem gravar
-- em conferencia_ajustes. A divergencia continua registrada em conferencia,
-- resumo_divergencia e conferencia_itens.
DO $migration$
DECLARE
    v_oid oid;
    v_sql text;
    v_old text;
BEGIN
    IF to_regprocedure('public.finalizar_conferencia_com_estoque(text,text,jsonb,text)') IS NOT NULL THEN
        v_oid := 'public.finalizar_conferencia_com_estoque(text,text,jsonb,text)'::regprocedure;
    ELSE
        v_oid := 'public.finalizar_conferencia(text,text,jsonb,text)'::regprocedure;
    END IF;

    SELECT replace(pg_get_functiondef(v_oid), chr(13), '') INTO v_sql;

    v_old := E'\n    IF v_divergencia_autorizada AND v_motivo_divergencia IS NULL THEN\n        RAISE EXCEPTION ''Informe o motivo para autorizar a divergencia.'';\n    END IF;\n';
    IF position(v_old IN v_sql) > 0 THEN
        v_sql := replace(v_sql, v_old, E'\n');
    END IF;

    v_old := E'\n    IF v_divergencia_autorizada THEN\n        INSERT INTO public.conferencia_ajustes (\n            conferencia_id, separacao_id, id_interno, ean, descricao,\n            qtd_separada, qtd_conferida, diferenca, motivo, autorizado_por, autorizado_em\n        )\n        SELECT v_conferencia_id, p_session_id, id_interno, ean, descricao,\n               qtd_separada, qtd_conferida, qtd_conferida - qtd_separada,\n               v_motivo_divergencia, p_usuario, v_now\n          FROM _finalizar_conferencia_rows\n         WHERE qtd_separada <> qtd_conferida;\n    END IF;';
    IF position(v_old IN v_sql) > 0 THEN
        v_sql := replace(v_sql, v_old, '');
    END IF;

    EXECUTE v_sql;
END
$migration$;

COMMENT ON COLUMN public.conferencia.motivo_divergencia IS
'Campo temporariamente opcional; a finalizacao divergente nao solicita motivo.';
