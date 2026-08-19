BEGIN;

CREATE TABLE IF NOT EXISTS public.separacao_item_cancelamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id text NOT NULL UNIQUE,
  separacao_id text NOT NULL REFERENCES public.separacao(separacao_id) ON DELETE CASCADE,
  id_interno text NOT NULL,
  ean text,
  pacote_id text,
  pacote_tipo text,
  quantidade integer NOT NULL DEFAULT 1 CHECK (quantidade = 1),
  motivo text NOT NULL,
  cancelado_por text NOT NULL,
  cancelado_em timestamp without time zone NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
  movimento_estorno_id text
);

CREATE INDEX IF NOT EXISTS separacao_item_cancelamentos_sep_idx
  ON public.separacao_item_cancelamentos(separacao_id, id_interno, cancelado_em);

ALTER TABLE public.separacao_item_cancelamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS separacao_item_cancelamentos_select_all ON public.separacao_item_cancelamentos;
CREATE POLICY separacao_item_cancelamentos_select_all ON public.separacao_item_cancelamentos
  FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.separacao_item_cancelamentos TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_item_separacao_finalizada(
  p_separacao_id text,
  p_codigo text,
  p_usuario text,
  p_motivo text,
  p_execution_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sep public.separacao%ROWTYPE;
  v_item public.separacao_itens%ROWTYPE;
  v_pkg public.separacao_pacotes%ROWTYPE;
  v_pkg_item public.separacao_pacote_itens%ROWTYPE;
  v_mov public.movimentos%ROWTYPE;
  v_now timestamp without time zone := timezone('America/Sao_Paulo', now());
  v_codigo text := btrim(coalesce(p_codigo, ''));
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_usuario text := coalesce(nullif(btrim(coalesce(p_usuario, '')), ''), 'N/A');
  v_execution text := btrim(coalesce(p_execution_id, ''));
  v_original integer;
  v_cancelado integer;
  v_restante integer;
  v_stock_id uuid;
  v_estorno_id text;
  v_estoque_estornado boolean := false;
  v_pacote_cancelado boolean := false;
BEGIN
  IF v_codigo = '' THEN RAISE EXCEPTION 'Bipe ou digite o produto.'; END IF;
  IF length(v_motivo) < 5 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;
  IF v_execution = '' THEN RAISE EXCEPTION 'Identificador da operacao nao informado.'; END IF;

  IF EXISTS (SELECT 1 FROM public.separacao_item_cancelamentos WHERE execution_id = v_execution) THEN
    RETURN (SELECT jsonb_build_object('ok', true, 'duplicado', true, 'id_interno', id_interno)
              FROM public.separacao_item_cancelamentos WHERE execution_id = v_execution LIMIT 1);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cancelar_item:' || btrim(p_separacao_id)));
  SELECT * INTO v_sep FROM public.separacao WHERE separacao_id = btrim(p_separacao_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Separacao nao encontrada.'; END IF;
  IF lower(coalesce(v_sep.status, '')) NOT IN ('finalizada','finalizado','concluida','concluido') THEN
    RAISE EXCEPTION 'Somente separacao finalizada aceita cancelamento de item.';
  END IF;

  SELECT * INTO v_item FROM public.separacao_itens
   WHERE separacao_id = v_sep.separacao_id
     AND (id_interno = v_codigo OR ean = v_codigo)
   ORDER BY atualizado_em DESC NULLS LAST, id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto nao pertence a esta separacao.'; END IF;

  v_original := greatest(coalesce(v_item.qtd_separada, v_item.qtd_solicitada, 0), 0);
  SELECT coalesce(sum(quantidade), 0)::integer INTO v_cancelado
    FROM public.separacao_item_cancelamentos
   WHERE separacao_id = v_sep.separacao_id AND id_interno = v_item.id_interno;
  IF v_cancelado >= v_original THEN RAISE EXCEPTION 'Todas as unidades deste produto ja foram canceladas.'; END IF;

  SELECT p.* INTO v_pkg
    FROM public.separacao_pacotes p
    JOIN public.separacao_pacote_itens pi ON pi.separacao_id=p.separacao_id AND pi.pacote_id=p.pacote_id
   WHERE p.separacao_id=v_sep.separacao_id AND p.status='ATIVO' AND pi.id_interno=v_item.id_interno AND pi.quantidade>0
   ORDER BY CASE WHEN p.tipo='AVULSO' THEN 0 ELSE 1 END, p.criado_em, p.pacote_id
   LIMIT 1 FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto nao possui pacote ativo para cancelamento.'; END IF;

  SELECT * INTO v_pkg_item FROM public.separacao_pacote_itens
   WHERE separacao_id=v_sep.separacao_id AND pacote_id=v_pkg.pacote_id AND id_interno=v_item.id_interno FOR UPDATE;
  IF v_pkg_item.quantidade > 1 THEN
    UPDATE public.separacao_pacote_itens SET quantidade=quantidade-1 WHERE id=v_pkg_item.id;
  ELSE
    DELETE FROM public.separacao_pacote_itens WHERE id=v_pkg_item.id;
  END IF;

  IF v_pkg.tipo='AVULSO' THEN
    UPDATE public.separacao_pacotes SET status='CANCELADO', atualizado_em=v_now WHERE id=v_pkg.id;
    v_pacote_cancelado := true;
  END IF;

  SELECT * INTO v_mov FROM public.movimentos
   WHERE lower(coalesce(tipo,''))='saida' AND id_interno=v_item.id_interno
     AND (coalesce(observacao,'') ILIKE '%'||v_sep.separacao_id||'%' OR coalesce(movimento_id,'') ILIKE '%'||v_sep.separacao_id||'%')
   ORDER BY data_hora, id LIMIT 1;
  IF FOUND THEN
    v_estorno_id := 'MOV-CANCEL-ITEM-' || substr(md5(v_execution),1,18);
    SELECT id INTO v_stock_id FROM public.estoque_atual
     WHERE id_interno=v_item.id_interno AND local=coalesce(v_mov.local_origem,'TERREO')
     ORDER BY id LIMIT 1 FOR UPDATE;
    IF v_stock_id IS NULL THEN
      INSERT INTO public.estoque_atual(id_interno,local,saldo_disponivel,saldo_reservado,saldo_em_transito,saldo_total,atualizado_em,chave_estoque)
      VALUES(v_item.id_interno,coalesce(v_mov.local_origem,'TERREO'),1,0,0,1,v_now,v_item.id_interno||'|'||coalesce(v_mov.local_origem,'TERREO')) RETURNING id INTO v_stock_id;
    ELSE
      UPDATE public.estoque_atual SET saldo_disponivel=coalesce(saldo_disponivel,0)+1,
        saldo_total=coalesce(saldo_disponivel,0)+1+coalesce(saldo_reservado,0)+coalesce(saldo_em_transito,0), atualizado_em=v_now WHERE id=v_stock_id;
    END IF;
    INSERT INTO public.movimentos(movimento_id,data_hora,tipo,id_interno,local_origem,local_destino,quantidade,usuario,origem,observacao)
    VALUES(v_estorno_id,v_now,'entrada',v_item.id_interno,NULL,coalesce(v_mov.local_origem,'TERREO'),1,v_usuario,'cancelamento_item_separacao',
      'Cancelamento unitario na separacao '||v_sep.separacao_id||'. Motivo: '||v_motivo);
    v_estoque_estornado := true;
  END IF;

  INSERT INTO public.separacao_item_cancelamentos(execution_id,separacao_id,id_interno,ean,pacote_id,pacote_tipo,motivo,cancelado_por,cancelado_em,movimento_estorno_id)
  VALUES(v_execution,v_sep.separacao_id,v_item.id_interno,v_item.ean,v_pkg.pacote_id,v_pkg.tipo,v_motivo,v_usuario,v_now,v_estorno_id);

  v_restante := v_original-v_cancelado-1;
  UPDATE public.separacao SET
    total_itens_separados=greatest(coalesce(total_itens_separados,0)-1,0),
    total_produtos_separados=greatest(coalesce(total_produtos_separados,0)-CASE WHEN v_restante=0 THEN 1 ELSE 0 END,0),
    total_pacotes_montados=greatest(coalesce(total_pacotes_montados,0)-CASE WHEN v_pacote_cancelado THEN 1 ELSE 0 END,0),
    atualizado_em=v_now WHERE id=v_sep.id;

  RETURN jsonb_build_object('ok',true,'id_interno',v_item.id_interno,'ean',v_item.ean,'restante',v_restante,
    'pacote_id',v_pkg.pacote_id,'pacote_tipo',v_pkg.tipo,'pacote_cancelado',v_pacote_cancelado,'estoque_estornado',v_estoque_estornado);
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_item_separacao_finalizada(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_item_separacao_finalizada(text,text,text,text,text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
