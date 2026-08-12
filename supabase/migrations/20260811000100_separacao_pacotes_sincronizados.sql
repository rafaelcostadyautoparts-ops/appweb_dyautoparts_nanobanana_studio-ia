-- Pacotes da separacao como fonte de verdade compartilhada entre dispositivos.

BEGIN;

ALTER TABLE public.separacao
    ADD COLUMN IF NOT EXISTS total_pacotes_montados integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.separacao_pacotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pacote_id text NOT NULL,
    separacao_id text NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('AVULSO', 'AGRUPADO')),
    status text NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'CANCELADO')),
    criado_por text NOT NULL,
    criado_em timestamp without time zone NOT NULL DEFAULT now(),
    atualizado_em timestamp without time zone NOT NULL DEFAULT now(),
    UNIQUE (separacao_id, pacote_id),
    FOREIGN KEY (separacao_id) REFERENCES public.separacao(separacao_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.separacao_pacote_itens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    separacao_id text NOT NULL,
    pacote_id text NOT NULL,
    id_interno text NOT NULL,
    quantidade integer NOT NULL CHECK (quantidade > 0),
    criado_em timestamp without time zone NOT NULL DEFAULT now(),
    UNIQUE (separacao_id, pacote_id, id_interno),
    FOREIGN KEY (separacao_id, pacote_id)
        REFERENCES public.separacao_pacotes(separacao_id, pacote_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS separacao_pacotes_sessao_idx
    ON public.separacao_pacotes (separacao_id, status, atualizado_em DESC);
CREATE INDEX IF NOT EXISTS separacao_pacote_itens_produto_idx
    ON public.separacao_pacote_itens (id_interno, separacao_id);

CREATE OR REPLACE FUNCTION public.sincronizar_pacotes_separacao(
    p_separacao_id text,
    p_pacotes jsonb,
    p_usuario text,
    p_execution_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sep public.separacao%ROWTYPE;
    v_package jsonb;
    v_item jsonb;
    v_package_id text;
    v_type text;
    v_total integer := 0;
    v_now timestamp without time zone := now();
BEGIN
    IF btrim(coalesce(p_separacao_id, '')) = '' THEN RAISE EXCEPTION 'Separacao nao informada.'; END IF;
    IF jsonb_typeof(coalesce(p_pacotes, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Lista de pacotes invalida.'; END IF;
    IF btrim(coalesce(p_usuario, '')) = '' THEN RAISE EXCEPTION 'Usuario nao informado.'; END IF;

    PERFORM pg_advisory_xact_lock(hashtext('pacotes_separacao:' || btrim(p_separacao_id)));
    SELECT * INTO v_sep FROM public.separacao
     WHERE separacao_id = btrim(p_separacao_id) LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Separacao % nao encontrada.', p_separacao_id; END IF;
    IF lower(coalesce(v_sep.status, '')) IN ('cancelada', 'cancelado') THEN RAISE EXCEPTION 'Separacao cancelada nao aceita pacotes.'; END IF;

    DELETE FROM public.separacao_pacote_itens WHERE separacao_id = v_sep.separacao_id;
    DELETE FROM public.separacao_pacotes WHERE separacao_id = v_sep.separacao_id;

    FOR v_package IN SELECT value FROM jsonb_array_elements(coalesce(p_pacotes, '[]'::jsonb)) LOOP
        v_package_id := btrim(coalesce(v_package->>'pacote_id', ''));
        v_type := upper(btrim(coalesce(v_package->>'tipo', 'AVULSO')));
        IF v_package_id = '' THEN RAISE EXCEPTION 'Pacote sem identificador.'; END IF;
        IF v_type NOT IN ('AVULSO', 'AGRUPADO') THEN RAISE EXCEPTION 'Tipo de pacote invalido: %.', v_type; END IF;
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_package->'itens', '[]'::jsonb))) THEN
            RAISE EXCEPTION 'Pacote % sem itens.', v_package_id;
        END IF;

        INSERT INTO public.separacao_pacotes (pacote_id, separacao_id, tipo, status, criado_por, criado_em, atualizado_em)
        VALUES (v_package_id, v_sep.separacao_id, v_type, 'ATIVO', btrim(p_usuario), v_now, v_now);

        FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(v_package->'itens', '[]'::jsonb)) LOOP
            IF btrim(coalesce(v_item->>'id_interno', '')) = '' THEN RAISE EXCEPTION 'Item sem id_interno no pacote %.', v_package_id; END IF;
            IF coalesce((v_item->>'quantidade')::integer, 0) <= 0 THEN RAISE EXCEPTION 'Quantidade invalida no pacote %.', v_package_id; END IF;
            IF NOT EXISTS (
                SELECT 1 FROM public.separacao_itens si
                 WHERE si.separacao_id = v_sep.separacao_id AND si.id_interno = btrim(v_item->>'id_interno')
            ) THEN RAISE EXCEPTION 'Produto % nao pertence a separacao.', v_item->>'id_interno'; END IF;
            INSERT INTO public.separacao_pacote_itens (separacao_id, pacote_id, id_interno, quantidade, criado_em)
            VALUES (v_sep.separacao_id, v_package_id, btrim(v_item->>'id_interno'), (v_item->>'quantidade')::integer, v_now);
        END LOOP;
        v_total := v_total + 1;
    END LOOP;

    IF EXISTS (
        WITH esperado AS (
            SELECT id_interno, sum(coalesce(qtd_separada, qtd_solicitada, 0)) quantidade
              FROM public.separacao_itens WHERE separacao_id = v_sep.separacao_id GROUP BY id_interno
        ), empacotado AS (
            SELECT id_interno, sum(quantidade) quantidade
              FROM public.separacao_pacote_itens WHERE separacao_id = v_sep.separacao_id GROUP BY id_interno
        )
        SELECT 1 FROM esperado e FULL JOIN empacotado p USING (id_interno)
         WHERE coalesce(e.quantidade, 0) <> coalesce(p.quantidade, 0)
    ) THEN RAISE EXCEPTION 'A composicao dos pacotes nao corresponde as quantidades separadas.'; END IF;

    UPDATE public.separacao
       SET total_pacotes_montados = v_total, atualizado_em = v_now
     WHERE id = v_sep.id;

    RETURN jsonb_build_object('ok', true, 'separacao_id', v_sep.separacao_id,
        'total_pacotes_montados', v_total, 'execution_id', nullif(btrim(coalesce(p_execution_id, '')), ''));
END;
$$;

ALTER TABLE public.separacao_pacotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.separacao_pacote_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS separacao_pacotes_select_all ON public.separacao_pacotes;
CREATE POLICY separacao_pacotes_select_all ON public.separacao_pacotes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS separacao_pacote_itens_select_all ON public.separacao_pacote_itens;
CREATE POLICY separacao_pacote_itens_select_all ON public.separacao_pacote_itens FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.separacao_pacotes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.separacao_pacote_itens FROM anon, authenticated;
GRANT SELECT ON public.separacao_pacotes, public.separacao_pacote_itens TO anon, authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_pacotes_separacao(text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sincronizar_pacotes_separacao(text,jsonb,text,text) TO anon, authenticated;

COMMENT ON TABLE public.separacao_pacotes IS 'Pacotes compartilhados da separacao, fonte de verdade entre dispositivos.';
COMMENT ON TABLE public.separacao_pacote_itens IS 'Composicao por produto de cada pacote da separacao.';
COMMENT ON FUNCTION public.sincronizar_pacotes_separacao(text,jsonb,text,text) IS 'Substitui atomicamente a composicao dos pacotes e atualiza o total da separacao.';

COMMIT;
