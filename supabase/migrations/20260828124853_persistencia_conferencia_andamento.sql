ALTER TABLE public.conferencia ADD COLUMN IF NOT EXISTS estado_andamento jsonb;

CREATE OR REPLACE FUNCTION public.salvar_conferencia_andamento(p_separacao_id text, p_usuario text, p_estado jsonb, p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_sep text := btrim(coalesce(p_separacao_id,'')); v_conf text; v_now timestamp := now();
BEGIN
 IF v_sep = '' THEN RAISE EXCEPTION 'Separacao nao informada.'; END IF;
 IF jsonb_typeof(coalesce(p_itens,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Itens invalidos.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('conferencia-andamento:'||v_sep));
 IF EXISTS (SELECT 1 FROM public.conferencia WHERE separacao_id=v_sep AND lower(coalesce(status,'')) IN ('conferido','finalizada','finalizado','concluida','concluido')) THEN RAISE EXCEPTION 'Conferencia finalizada nao pode receber progresso.'; END IF;
 v_conf := 'CONF-DRAFT-'||v_sep;
 INSERT INTO public.conferencia(conferencia_id,separacao_id,status,conferido_por,conferido_em,atualizado_em,estado_andamento)
 VALUES(v_conf,v_sep,'em_conferencia',coalesce(nullif(btrim(p_usuario),''),'N/A'),null,v_now,coalesce(p_estado,'{}'::jsonb))
 ON CONFLICT(conferencia_id) DO UPDATE SET status='em_conferencia',conferido_por=excluded.conferido_por,conferido_em=null,atualizado_em=excluded.atualizado_em,estado_andamento=excluded.estado_andamento;
 DELETE FROM public.conferencia_itens WHERE conferencia_id=v_conf;
 INSERT INTO public.conferencia_itens(conferencia_id,separacao_id,id_interno,ean,descricao,qtd_separada,qtd_conferida,divergencia)
 SELECT v_conf,v_sep,btrim(i->>'id_interno'),coalesce(i->>'ean',''),coalesce(i->>'descricao',''),coalesce((i->>'qtd_separada')::integer,0),coalesce((i->>'qtd_conferida')::integer,0),nullif(i->>'divergencia','')
 FROM jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) i WHERE nullif(btrim(i->>'id_interno'),'') IS NOT NULL;
 RETURN jsonb_build_object('ok',true,'conferencia_id',v_conf,'separacao_id',v_sep,'itens',jsonb_array_length(coalesce(p_itens,'[]'::jsonb)),'atualizado_em',v_now);
END $$;

CREATE OR REPLACE FUNCTION public.remover_conferencia_andamento(p_separacao_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_sep text:=btrim(coalesce(p_separacao_id,'')); v_conf text;
BEGIN
 IF v_sep='' THEN RAISE EXCEPTION 'Separacao nao informada.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('conferencia-andamento:'||v_sep)); v_conf:='CONF-DRAFT-'||v_sep;
 DELETE FROM public.conferencia_itens WHERE conferencia_id=v_conf;
 DELETE FROM public.conferencia WHERE conferencia_id=v_conf AND status='em_conferencia';
 RETURN jsonb_build_object('ok',true,'separacao_id',v_sep);
END $$;
REVOKE ALL ON FUNCTION public.salvar_conferencia_andamento(text,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remover_conferencia_andamento(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salvar_conferencia_andamento(text,text,jsonb,jsonb) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.remover_conferencia_andamento(text) TO anon,authenticated,service_role;
COMMENT ON COLUMN public.conferencia.estado_andamento IS 'Snapshot para retomada online de conferencia nao finalizada.';
NOTIFY pgrst, 'reload schema';
