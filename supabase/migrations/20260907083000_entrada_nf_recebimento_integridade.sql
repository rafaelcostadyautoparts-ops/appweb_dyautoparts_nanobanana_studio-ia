-- Migration: BLOCO 1 - Trava de Integridade, Atomicidade e RPC Transacional de Recebimento Fisico
-- Data: 2026-09-07

-- 1. Constraint de local_destino valido
ALTER TABLE public.entrada_nf_item_recebimentos
    DROP CONSTRAINT IF EXISTS chk_local_destino_valido;

ALTER TABLE public.entrada_nf_item_recebimentos
    ADD CONSTRAINT chk_local_destino_valido
    CHECK (local_destino IN ('TERREO', '1ANDAR', 'MOSTRUARIO'));

-- 2. Funcao de Trigger para Integridade e Imutabilidade pos-finalizacao
CREATE OR REPLACE FUNCTION public.trg_fn_validar_entrada_nf_item_recebimento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entrada public.entradas_nf%ROWTYPE;
    v_item public.entradas_nf_itens%ROWTYPE;
    v_prod_id_interno text;
BEGIN
    -- Determina entrada_nf_id para operacao
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO v_entrada FROM public.entradas_nf WHERE id = OLD.entrada_nf_id;
        IF FOUND AND (v_entrada.estoque_finalizado OR lower(coalesce(v_entrada.status,'')) = 'finalizada') THEN
            RAISE EXCEPTION 'Recebimento fisico imutavel apos finalizacao da NF (Entrada %).', OLD.entrada_nf_id;
        END IF;
        RETURN OLD;
    END IF;

    -- Validacao para INSERT e UPDATE
    SELECT * INTO v_entrada FROM public.entradas_nf WHERE id = NEW.entrada_nf_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Entrada NF % nao encontrada.', NEW.entrada_nf_id;
    END IF;

    IF v_entrada.estoque_finalizado OR lower(coalesce(v_entrada.status,'')) = 'finalizada' THEN
        RAISE EXCEPTION 'Recebimento fisico imutavel apos finalizacao da NF (Entrada %).', NEW.entrada_nf_id;
    END IF;

    -- Validacao de pertencimento entre entrada_nf_id e entrada_nf_item_id
    SELECT * INTO v_item FROM public.entradas_nf_itens WHERE id = NEW.entrada_nf_item_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item fiscal % nao encontrado.', NEW.entrada_nf_item_id;
    END IF;

    IF v_item.entrada_nf_id <> NEW.entrada_nf_id AND v_item.nf_id <> NEW.entrada_nf_id THEN
        RAISE EXCEPTION 'Item fiscal % nao pertence a Entrada NF %.', NEW.entrada_nf_item_id, NEW.entrada_nf_id;
    END IF;

    -- Resolucao e integridade produto_id x id_interno
    IF NEW.produto_id IS NOT NULL THEN
        SELECT id_interno INTO v_prod_id_interno FROM public.produtos WHERE id = NEW.produto_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto UUID % nao encontrado no catalogo.', NEW.produto_id;
        END IF;

        IF NEW.id_interno IS NULL OR btrim(NEW.id_interno) = '' THEN
            NEW.id_interno := v_prod_id_interno;
        ELSIF btrim(NEW.id_interno) <> v_prod_id_interno THEN
            RAISE EXCEPTION 'Inconsistencia: produto_id % (id_interno: %) difere do id_interno % informado.', NEW.produto_id, v_prod_id_interno, NEW.id_interno;
        END IF;
    ELSIF NEW.id_interno IS NOT NULL AND btrim(NEW.id_interno) <> '' THEN
        SELECT id INTO NEW.produto_id FROM public.produtos WHERE id_interno = btrim(NEW.id_interno);
    ELSE
        RAISE EXCEPTION 'id_interno do produto nao pode ser vazio.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_entrada_nf_item_recebimento ON public.entrada_nf_item_recebimentos;
CREATE TRIGGER trg_validar_entrada_nf_item_recebimento
BEFORE INSERT OR UPDATE OR DELETE ON public.entrada_nf_item_recebimentos
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_validar_entrada_nf_item_recebimento();

-- 3. RPC Transacional para Salvar Recebimentos Fisicos com Lock
CREATE OR REPLACE FUNCTION public.salvar_entrada_nf_recebimentos(
    p_entrada_nf_id uuid,
    p_recebimentos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entrada public.entradas_nf%ROWTYPE;
    v_rec jsonb;
    v_item_id uuid;
    v_produto_id uuid;
    v_id_interno text;
    v_qtd_fisica numeric(15,4);
    v_qtd_aceita numeric(15,4);
    v_qtd_recusada numeric(15,4);
    v_local text;
    v_situacao text;
    v_motivo text;
    v_obs text;
    v_usuario text;
    v_inserted_count integer := 0;
BEGIN
    IF p_entrada_nf_id IS NULL THEN
        RAISE EXCEPTION 'ID da Entrada NF nao informado.';
    END IF;

    -- Lock exclusivo para evitar race condition de duplo clique
    SELECT * INTO v_entrada
      FROM public.entradas_nf
     WHERE id = p_entrada_nf_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Entrada NF % nao encontrada.', p_entrada_nf_id;
    END IF;

    IF v_entrada.estoque_finalizado OR lower(coalesce(v_entrada.status,'')) = 'finalizada' THEN
        RAISE EXCEPTION 'Recebimento fisico imutavel apos finalizacao da NF (Entrada %).', p_entrada_nf_id;
    END IF;

    -- Exclui alocoes antigas na mesma transacao
    DELETE FROM public.entrada_nf_item_recebimentos
     WHERE entrada_nf_id = p_entrada_nf_id;

    -- Insere novas alocacoes de forma atomica
    IF p_recebimentos IS NOT NULL AND jsonb_typeof(p_recebimentos) = 'array' THEN
        FOR v_rec IN SELECT * FROM jsonb_array_elements(p_recebimentos) LOOP
            v_item_id := (v_rec->>'entrada_nf_item_id')::uuid;
            v_produto_id := NULLIF(v_rec->>'produto_id', '')::uuid;
            v_id_interno := btrim(COALESCE(v_rec->>'id_interno', ''));
            v_qtd_fisica := COALESCE((v_rec->>'quantidade_fisica')::numeric, 0);
            v_qtd_aceita := COALESCE((v_rec->>'quantidade_aceita')::numeric, 0);
            v_qtd_recusada := COALESCE((v_rec->>'quantidade_recusada')::numeric, 0);
            v_local := UPPER(COALESCE(NULLIF(btrim(v_rec->>'local_destino'), ''), 'TERREO'));
            v_situacao := COALESCE(NULLIF(btrim(v_rec->>'situacao'), ''), 'CONFERE');
            v_motivo := NULLIF(btrim(COALESCE(v_rec->>'motivo_divergencia', '')), '');
            v_obs := NULLIF(btrim(COALESCE(v_rec->>'observacoes', '')), '');
            v_usuario := NULLIF(btrim(COALESCE(v_rec->>'criado_por', '')), '');

            INSERT INTO public.entrada_nf_item_recebimentos (
                entrada_nf_id,
                entrada_nf_item_id,
                produto_id,
                id_interno,
                quantidade_fisica,
                quantidade_aceita,
                quantidade_recusada,
                local_destino,
                situacao,
                motivo_divergencia,
                observacoes,
                criado_por,
                criado_em,
                atualizado_em
            ) VALUES (
                p_entrada_nf_id,
                v_item_id,
                v_produto_id,
                v_id_interno,
                v_qtd_fisica,
                v_qtd_aceita,
                v_qtd_recusada,
                v_local,
                v_situacao,
                v_motivo,
                v_obs,
                v_usuario,
                now(),
                now()
            );

            v_inserted_count := v_inserted_count + 1;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'entrada_nf_id', p_entrada_nf_id,
        'count', v_inserted_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_entrada_nf_recebimentos(uuid, jsonb) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.salvar_entrada_nf_recebimentos(uuid, jsonb)
IS 'RPC atomica e transacional para substituicao segura de recebimentos fisicos de uma Entrada NF.';

NOTIFY pgrst, 'reload schema';
