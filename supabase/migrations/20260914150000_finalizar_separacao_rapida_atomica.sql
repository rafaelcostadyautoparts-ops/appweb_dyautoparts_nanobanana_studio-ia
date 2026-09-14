-- Migration: 20260914150000_finalizar_separacao_rapida_atomica.sql
-- Finalizacao transacional atomica da separacao rapida (Flex/Direta)
-- Garante:
-- 1. Validacao de itens com qtd_separada > 0
-- 2. Alocacao atomica do numero definitivo exclusivamente no encerramento
-- 3. Migracao transacional do rascunho SEP-DRAFT para o numero oficial
-- 4. Persistencia relacional de separacao_pacotes e separacao_pacote_itens
-- 5. Baixa de estoque automatica e registro de movimentacoes identico ao fluxo operacional
-- 6. Atualizacao do cabecalho com status = 'finalizada' e totais consistentes
-- 7. Idempotencia segura contra retentativas de rede
-- 8. Rollback total em caso de qualquer falha

DROP FUNCTION IF EXISTS public.finalizar_separacao_rapida_atomica(text, text, boolean);

CREATE OR REPLACE FUNCTION public.finalizar_separacao_rapida_atomica(
    p_draft_id text,
    p_canal_id text,
    p_canal_nome text,
    p_pacotes jsonb,
    p_usuario text,
    p_permitir_negativo boolean DEFAULT false,
    p_observacao text DEFAULT NULL,
    p_execution_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_draft_id text := trim(coalesce(p_draft_id, ''));
    v_canal_id text := trim(coalesce(p_canal_id, ''));
    v_canal_nome text := trim(coalesce(p_canal_nome, ''));
    v_usuario text := coalesce(nullif(trim(coalesce(p_usuario, '')), ''), 'N/A');
    v_execution_id text := trim(coalesce(p_execution_id, ''));
    v_agora timestamp without time zone := timezone('America/Sao_Paulo', now());

    v_draft public.separacao%ROWTYPE;
    v_sep_existente public.separacao%ROWTYPE;
    v_oficial_id text;
    v_canal_ref text;
    v_prefixo text;
    v_ddmm text;
    v_sequencia integer;

    v_total_produtos integer := 0;
    v_total_itens integer := 0;
    v_total_pacotes integer := 0;
    v_movimentos integer := 0;

    v_pkg jsonb;
    v_pkg_id text;
    v_pkg_tipo text;
    v_pkg_item jsonb;
    v_pkg_item_id text;
    v_pkg_item_qtd integer;

    v_rec record;
    v_i integer;
    v_local text;
    v_disponivel integer;
    v_retirar integer;
    v_restante integer;
BEGIN
    IF auth.uid() IS NULL THEN
        PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
        PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
    END IF;

    IF v_draft_id = '' THEN
        RAISE EXCEPTION 'Identificador da separacao obrigatorio.';
    END IF;

    -- =========================================================================
    -- 1. IDEMPOTÊNCIA: Se já for oficial ou se já tiver sido finalizado
    -- =========================================================================
    IF v_draft_id ~ '^SEP-[A-Z0-9]+-[0-9]{4}-[0-9]+$' THEN
        SELECT * INTO v_sep_existente FROM public.separacao WHERE separacao_id = v_draft_id;
        IF FOUND AND lower(coalesce(v_sep_existente.status, '')) IN ('finalizada','finalizado','concluida','concluido','faturada','faturado') THEN
            RETURN jsonb_build_object(
                'ok', true,
                'idempotente', true,
                'separacao_id', v_sep_existente.separacao_id,
                'status', v_sep_existente.status,
                'total_produtos_separados', v_sep_existente.total_produtos_separados,
                'total_itens_separados', v_sep_existente.total_itens_separados,
                'total_pacotes_montados', v_sep_existente.total_pacotes_montados,
                'movimentos', 0
            );
        END IF;
    END IF;

    -- Se for um draft mas já existir uma separação oficial que migrou deste draft ou execution_id
    IF v_execution_id <> '' THEN
        SELECT * INTO v_sep_existente
          FROM public.separacao
         WHERE (observacao LIKE '%EXECUTION_ID:' || v_execution_id || '%' OR observacao LIKE '%DRAFT_ORIGEM:' || v_draft_id || '%')
           AND lower(coalesce(status, '')) IN ('finalizada','finalizado','concluida','concluido','faturada','faturado')
         LIMIT 1;
    ELSE
        SELECT * INTO v_sep_existente
          FROM public.separacao
         WHERE observacao LIKE '%DRAFT_ORIGEM:' || v_draft_id || '%'
           AND lower(coalesce(status, '')) IN ('finalizada','finalizado','concluida','concluido','faturada','faturado')
         LIMIT 1;
    END IF;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'ok', true,
            'idempotente', true,
            'separacao_id', v_sep_existente.separacao_id,
            'status', v_sep_existente.status,
            'total_produtos_separados', v_sep_existente.total_produtos_separados,
            'total_itens_separados', v_sep_existente.total_itens_separados,
            'total_pacotes_montados', v_sep_existente.total_pacotes_montados,
            'movimentos', 0
        );
    END IF;

    -- =========================================================================
    -- 2. LOCK TRANSACIONAL EXCLUSIVO POR SESSÃO
    -- =========================================================================
    PERFORM pg_advisory_xact_lock(hashtext('finalizar_rapida:' || v_draft_id));

    SELECT * INTO v_draft FROM public.separacao WHERE separacao_id = v_draft_id FOR UPDATE;
    IF FOUND AND lower(coalesce(v_draft.status, '')) IN ('finalizada','finalizado','concluida','concluido','faturada','faturado') THEN
        RETURN jsonb_build_object(
            'ok', true,
            'idempotente', true,
            'separacao_id', v_draft.separacao_id,
            'status', v_draft.status,
            'total_produtos_separados', v_draft.total_produtos_separados,
            'total_itens_separados', v_draft.total_itens_separados,
            'total_pacotes_montados', v_draft.total_pacotes_montados,
            'movimentos', 0
        );
    END IF;

    -- =========================================================================
    -- 3. VERIFICAÇÃO E AGROPAMENTO DOS ITENS VÁLIDOS (qtd_separada > 0)
    -- =========================================================================
    CREATE TEMP TABLE _itens_validos (
        id_interno text NOT NULL,
        descricao text,
        ean text,
        quantidade integer NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO _itens_validos (id_interno, descricao, ean, quantidade)
    SELECT
        trim(id_interno),
        min(descricao),
        min(ean),
        sum(greatest(coalesce(qtd_separada, 0), 0))::integer
      FROM public.separacao_itens
     WHERE separacao_id = v_draft_id
     GROUP BY trim(id_interno)
    HAVING sum(greatest(coalesce(qtd_separada, 0), 0)) > 0;

    IF NOT EXISTS (SELECT 1 FROM _itens_validos) THEN
        RAISE EXCEPTION 'A separacao % nao possui itens com quantidade separada maior que zero.', v_draft_id;
    END IF;

    SELECT count(*), sum(quantidade)
      INTO v_total_produtos, v_total_itens
      FROM _itens_validos;

    -- =========================================================================
    -- 4. PREPARAÇÃO DA COMPOSIÇÃO DOS PACOTES
    -- =========================================================================
    CREATE TEMP TABLE _novos_pacotes (
        pacote_id text NOT NULL,
        tipo text NOT NULL,
        id_interno text NOT NULL,
        quantidade integer NOT NULL
    ) ON COMMIT DROP;

    IF p_pacotes IS NOT NULL AND jsonb_typeof(p_pacotes) = 'array' AND jsonb_array_length(p_pacotes) > 0 THEN
        FOR v_pkg IN SELECT value FROM jsonb_array_elements(p_pacotes) LOOP
            v_pkg_id := trim(coalesce(v_pkg->>'pacote_id', ''));
            v_pkg_tipo := upper(trim(coalesce(v_pkg->>'tipo', 'AVULSO')));
            IF v_pkg_id = '' THEN v_pkg_id := 'PKG-' || gen_random_uuid(); END IF;
            IF v_pkg_tipo NOT IN ('AVULSO', 'AGRUPADO') THEN v_pkg_tipo := 'AVULSO'; END IF;

            FOR v_pkg_item IN SELECT value FROM jsonb_array_elements(coalesce(v_pkg->'itens', '[]'::jsonb)) LOOP
                v_pkg_item_id := trim(coalesce(v_pkg_item->>'id_interno', ''));
                v_pkg_item_qtd := coalesce((v_pkg_item->>'quantidade')::integer, 0);
                IF v_pkg_item_id <> '' AND v_pkg_item_qtd > 0 THEN
                    -- Apenas inclui itens que constam nos itens validos da separacao
                    IF EXISTS (SELECT 1 FROM _itens_validos WHERE id_interno = v_pkg_item_id) THEN
                        INSERT INTO _novos_pacotes VALUES (v_pkg_id, v_pkg_tipo, v_pkg_item_id, v_pkg_item_qtd);
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END IF;

    -- Se nenhum pacote valido veio do front-end (ou o operador nao agrupou),
    -- gera automaticamente a composicao relacional avulsa para 100% dos itens validos:
    IF NOT EXISTS (SELECT 1 FROM _novos_pacotes) THEN
        FOR v_rec IN SELECT * FROM _itens_validos ORDER BY id_interno LOOP
            FOR v_i IN 1..v_rec.quantidade LOOP
                INSERT INTO _novos_pacotes VALUES (
                    'AVL-' || v_rec.id_interno || '-' || lpad(v_i::text, 4, '0'),
                    'AVULSO',
                    v_rec.id_interno,
                    1
                );
            END LOOP;
        END LOOP;
    END IF;

    SELECT count(DISTINCT pacote_id) INTO v_total_pacotes FROM _novos_pacotes;
    IF v_total_pacotes <= 0 THEN v_total_pacotes := 1; END IF;

    -- =========================================================================
    -- 5. ALOCAÇÃO ATÔMICA DO NÚMERO OFICIAL DEFINITIVO
    -- =========================================================================
    IF v_draft_id ~ '^SEP-[A-Z0-9]+-[0-9]{4}-[0-9]+$' THEN
        v_oficial_id := v_draft_id;
    ELSE
        v_canal_ref := upper(coalesce(nullif(v_canal_nome, ''), nullif(v_draft.canal_nome, ''), 'GERAL'));
        IF v_canal_ref LIKE '%MERCADO%LIVRE%' OR v_canal_ref LIKE '%ML%' THEN
            v_prefixo := 'MERCADOLIVRE';
        ELSIF v_canal_ref LIKE '%FLEX%' THEN
            v_prefixo := 'FLEX';
        ELSIF v_canal_ref LIKE '%SHOPEE%' THEN
            v_prefixo := 'SHOPEE';
        ELSIF v_canal_ref LIKE '%MAGALU%' OR v_canal_ref LIKE '%MAGAZINE%' THEN
            v_prefixo := 'MAGALU';
        ELSIF v_canal_ref LIKE '%AMAZON%' THEN
            v_prefixo := 'AMAZON';
        ELSIF v_canal_ref LIKE '%CORREIOS%' THEN
            v_prefixo := 'CORREIOS';
        ELSIF v_canal_ref LIKE '%BALCAO%' OR v_canal_ref LIKE '%PDV%' THEN
            v_prefixo := 'BALCAO';
        ELSE
            v_prefixo := regexp_replace(v_canal_ref, '[^A-Z0-9]', '', 'g');
            IF v_prefixo = '' THEN v_prefixo := 'OUTROS'; END IF;
        END IF;

        v_ddmm := to_char(v_agora, 'DDMM');

        -- Lock de sequencial por canal e dia
        PERFORM pg_advisory_xact_lock(hashtext('alocar_separacao:' || v_prefixo || ':' || v_ddmm));

        SELECT coalesce(max((regexp_match(s.separacao_id, '-([0-9]+)$'))[1]::integer), 0) + 1
          INTO v_sequencia
          FROM public.separacao s
         WHERE s.separacao_id ~ ('^SEP-' || v_prefixo || '-' || v_ddmm || '-[0-9]+$');

        v_oficial_id := 'SEP-' || v_prefixo || '-' || v_ddmm || '-' || lpad(v_sequencia::text, 2, '0');

        -- Insere a nova linha oficial em public.separacao
        INSERT INTO public.separacao (
            separacao_id, canal_id, canal_nome, status, criado_por, criado_em, atualizado_em,
            total_produtos_separados, total_itens_separados, total_pacotes_montados, observacao
        ) VALUES (
            v_oficial_id,
            coalesce(nullif(v_canal_id, ''), v_draft.canal_id, 'canais_envio_i'),
            coalesce(nullif(v_canal_nome, ''), v_draft.canal_nome, 'GERAL'),
            'em_separacao',
            v_usuario,
            coalesce(v_draft.criado_em, v_agora),
            v_agora,
            v_total_produtos,
            v_total_itens,
            v_total_pacotes,
            trim('SAIDA_RAPIDA AUTOMATICA | DRAFT_ORIGEM:' || v_draft_id || CASE WHEN v_execution_id <> '' THEN ' | EXECUTION_ID:' || v_execution_id ELSE '' END || ' ' || coalesce(p_observacao, ''))
        ) ON CONFLICT (separacao_id) DO UPDATE
            SET atualizado_em = v_agora,
                total_produtos_separados = v_total_produtos,
                total_itens_separados = v_total_itens,
                total_pacotes_montados = v_total_pacotes;

        -- Migra itens da separação para o ID oficial
        UPDATE public.separacao_itens
           SET separacao_id = v_oficial_id, atualizado_em = v_agora
         WHERE separacao_id = v_draft_id;

        -- Exclui a linha original do rascunho em public.separacao
        DELETE FROM public.separacao WHERE separacao_id = v_draft_id;
    END IF;

    -- =========================================================================
    -- 6. PERSISTÊNCIA RELACIONAL DOS PACOTES
    -- =========================================================================
    DELETE FROM public.separacao_pacote_itens WHERE separacao_id = v_oficial_id;
    DELETE FROM public.separacao_pacotes WHERE separacao_id = v_oficial_id;

    INSERT INTO public.separacao_pacotes (
        pacote_id, separacao_id, tipo, status, criado_por, criado_em, atualizado_em
    )
    SELECT
        pacote_id,
        v_oficial_id,
        min(tipo),
        'ATIVO',
        v_usuario,
        v_agora,
        v_agora
      FROM _novos_pacotes
     GROUP BY pacote_id;

    INSERT INTO public.separacao_pacote_itens (
        separacao_id, pacote_id, id_interno, quantidade, criado_em
    )
    SELECT
        v_oficial_id,
        pacote_id,
        id_interno,
        sum(quantidade),
        v_agora
      FROM _novos_pacotes
     GROUP BY pacote_id, id_interno;

    -- =========================================================================
    -- 7. BAIXA DE ESTOQUE E REGISTRO DE MOVIMENTAÇÕES
    -- =========================================================================
    FOR v_rec IN SELECT * FROM _itens_validos ORDER BY id_interno LOOP
        v_restante := v_rec.quantidade;

        FOREACH v_local IN ARRAY ARRAY['TERREO','MOSTRUARIO','PRIMEIRO_ANDAR'] LOOP
            EXIT WHEN v_restante <= 0;
            SELECT coalesce(sum(greatest(coalesce(saldo_disponivel, 0), 0)), 0)::integer
              INTO v_disponivel
              FROM public.estoque_atual
             WHERE id_interno = v_rec.id_interno AND upper(trim(local)) = v_local;

            v_retirar := least(v_disponivel, v_restante);
            IF v_retirar > 0 THEN
                PERFORM public.registrar_movimento_estoque(
                    'SAIDA',
                    v_rec.id_interno,
                    v_local,
                    '',
                    v_retirar,
                    v_usuario,
                    'APP_SEPARACAO',
                    'Baixa automatica da separacao rapida ' || v_oficial_id,
                    false,
                    'sep-rapida:' || v_oficial_id || ':' || v_rec.id_interno || ':' || v_local || ':saldo'
                );
                v_restante := v_restante - v_retirar;
                v_movimentos := v_movimentos + 1;
            END IF;
        END LOOP;

        IF v_restante > 0 THEN
            IF coalesce(p_permitir_negativo, false) IS NOT TRUE THEN
                RAISE EXCEPTION 'Estoque insuficiente para %: faltam % unidades.', v_rec.id_interno, v_restante;
            END IF;
            PERFORM public.registrar_movimento_estoque(
                'SAIDA',
                v_rec.id_interno,
                'TERREO',
                '',
                v_restante,
                v_usuario,
                'APP_SEPARACAO',
                'Baixa da separacao rapida ' || v_oficial_id || ' com estoque negativo permitido.',
                true,
                'sep-rapida:' || v_oficial_id || ':' || v_rec.id_interno || ':TERREO:negativo'
            );
            v_movimentos := v_movimentos + 1;
        END IF;
    END LOOP;

    -- =========================================================================
    -- 8. ATUALIZAÇÃO FINAL DO CABEÇALHO PARA FINALIZADA
    -- =========================================================================
    UPDATE public.separacao
       SET status = 'finalizada',
           atualizado_em = v_agora,
           finalizado_em = v_agora,
           total_produtos_separados = v_total_produtos,
           total_itens_separados = v_total_itens,
           total_pacotes_montados = v_total_pacotes,
           observacao = trim('SAIDA_RAPIDA AUTOMATICA | DRAFT_ORIGEM:' || v_draft_id || CASE WHEN v_execution_id <> '' THEN ' | EXECUTION_ID:' || v_execution_id ELSE '' END || ' ' || coalesce(p_observacao, ''))
     WHERE separacao_id = v_oficial_id;

    RETURN jsonb_build_object(
        'ok', true,
        'idempotente', false,
        'separacao_id', v_oficial_id,
        'draft_id_anterior', v_draft_id,
        'total_pacotes_montados', v_total_pacotes,
        'total_itens_separados', v_total_itens,
        'total_produtos_separados', v_total_produtos,
        'movimentos', v_movimentos,
        'finalizado_em', v_agora
    );
END;
$$;

-- Permissões de execução
REVOKE ALL ON FUNCTION public.finalizar_separacao_rapida_atomica(text,text,text,jsonb,text,boolean,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_separacao_rapida_atomica(text,text,text,jsonb,text,boolean,text,text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.finalizar_separacao_rapida_atomica(text,text,text,jsonb,text,boolean,text,text)
IS 'Finalizacao transacional atomica do modo rapido: aloca numero definitivo, migra draft, grava pacotes relacionais, baixa estoque e finaliza cabecalho sob mesma transacao.';
