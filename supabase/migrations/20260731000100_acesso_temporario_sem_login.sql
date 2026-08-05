-- ACESSO TEMPORARIO SEM LOGIN - DY AUTO PARTS
-- Reversivel: ao reativar o login, o app volta a chamar as funcoes originais.
-- Esta liberacao deve ser removida antes da publicacao definitiva.

CREATE OR REPLACE FUNCTION public.registrar_movimento_estoque_temporario(
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
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
    PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
    RETURN public.registrar_movimento_estoque(
        p_tipo, p_id_interno, p_local_origem, p_local_destino, p_quantidade,
        p_usuario, p_origem, p_observacao, p_permitir_negativo, p_execution_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalizar_inventario_estoque_temporario(
    p_inventario_id text,
    p_usuario text,
    p_execution_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
    PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
    RETURN public.finalizar_inventario_estoque(p_inventario_id, p_usuario, p_execution_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_devolucao_marketplace_temporaria(
    p_devolucao jsonb,
    p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
    PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
    RETURN public.salvar_devolucao_marketplace_atomica(p_devolucao, p_itens);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_movimento_estoque_temporario(text,text,text,text,numeric,text,text,text,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_inventario_estoque_temporario(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.salvar_devolucao_marketplace_temporaria(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_movimento_estoque_temporario(text,text,text,text,numeric,text,text,text,boolean,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalizar_inventario_estoque_temporario(text,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_devolucao_marketplace_temporaria(jsonb,jsonb) TO anon, authenticated, service_role;

-- Durante a liberacao temporaria, a finalizacao com estoque negativo pode
-- precisar persistir a conferencia fora da RPC antiga. Mantem o mesmo
-- acesso anonimo ja usado pelas tabelas de separacao.
GRANT SELECT, INSERT, UPDATE ON TABLE public.separacao TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.separacao_itens TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conferencia TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conferencia_itens TO anon, authenticated, service_role;

DO $$
BEGIN
    CREATE POLICY acesso_temporario_conferencia_sem_login
    ON public.conferencia FOR ALL
    TO anon, authenticated
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY acesso_temporario_conferencia_itens_sem_login
    ON public.conferencia_itens FOR ALL
    TO anon, authenticated
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
