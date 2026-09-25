BEGIN;

-- 1. Tabela Principal de Orçamentos
CREATE TABLE IF NOT EXISTS public.orcamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_orcamento text UNIQUE,
    status text NOT NULL DEFAULT 'rascunho',
    versao_atual integer NOT NULL DEFAULT 0,
    emissao date NOT NULL DEFAULT (timezone('America/Sao_Paulo', now())::date),
    validade date NOT NULL,
    cliente_empresa text,
    cliente_documento text,
    cliente_responsavel text,
    cliente_email text,
    cliente_telefone text,
    cliente_endereco text,
    forma_pagamento text,
    desconto_opcao text,
    desconto_percentual numeric DEFAULT 0,
    frete_responsavel text DEFAULT 'cliente',
    frete_valor numeric DEFAULT 0,
    condicao_negociada text,
    observacoes text,
    subtotal numeric DEFAULT 0,
    desconto_valor numeric DEFAULT 0,
    frete_cobrado numeric DEFAULT 0,
    total numeric DEFAULT 0,
    itens jsonb DEFAULT '[]'::jsonb,
    criado_em timestamp with time zone NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
    criado_por text NOT NULL DEFAULT 'N/A',
    atualizado_em timestamp with time zone NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
    atualizado_por text NOT NULL DEFAULT 'N/A'
);

-- 2. Tabela de Versões Históricas (Imutáveis)
CREATE TABLE IF NOT EXISTS public.orcamento_versoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    orcamento_id uuid NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
    numero_orcamento text NOT NULL,
    versao integer NOT NULL,
    snapshot jsonb NOT NULL,
    criado_em timestamp with time zone NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
    criado_por text NOT NULL DEFAULT 'N/A',
    CONSTRAINT unq_orcamento_versao UNIQUE (orcamento_id, versao)
);

-- 3. Tabela de Sequência Diária para Números de Orçamento
CREATE TABLE IF NOT EXISTS public.orcamento_sequencia (
    data_str text PRIMARY KEY,
    sequencia integer NOT NULL DEFAULT 0
);

-- Habilitar RLS
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_sequencia ENABLE ROW LEVEL SECURITY;

-- Políticas RLS Permissivas para anon/authenticated
DROP POLICY IF EXISTS "Permitir select total em orcamentos" ON public.orcamentos;
CREATE POLICY "Permitir select total em orcamentos" ON public.orcamentos FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Permitir insert total em orcamentos" ON public.orcamentos;
CREATE POLICY "Permitir insert total em orcamentos" ON public.orcamentos FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir update total em orcamentos" ON public.orcamentos;
CREATE POLICY "Permitir update total em orcamentos" ON public.orcamentos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir delete total em orcamentos" ON public.orcamentos;
CREATE POLICY "Permitir delete total em orcamentos" ON public.orcamentos FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Permitir select total em orcamento_versoes" ON public.orcamento_versoes;
CREATE POLICY "Permitir select total em orcamento_versoes" ON public.orcamento_versoes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Permitir insert total em orcamento_versoes" ON public.orcamento_versoes;
CREATE POLICY "Permitir insert total em orcamento_versoes" ON public.orcamento_versoes FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir select total em orcamento_sequencia" ON public.orcamento_sequencia;
CREATE POLICY "Permitir select total em orcamento_sequencia" ON public.orcamento_sequencia FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Permitir all em orcamento_sequencia" ON public.orcamento_sequencia;
CREATE POLICY "Permitir all em orcamento_sequencia" ON public.orcamento_sequencia FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.orcamentos TO anon, authenticated;
GRANT ALL ON public.orcamento_versoes TO anon, authenticated;
GRANT ALL ON public.orcamento_sequencia TO anon, authenticated;

-- 4. RPC para Salvar/Atualizar Rascunho
CREATE OR REPLACE FUNCTION public.salvar_rascunho_orcamento(
    p_id uuid,
    p_cliente jsonb,
    p_itens jsonb,
    p_condicoes jsonb,
    p_usuario text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_id uuid := p_id;
    v_usuario text := coalesce(nullif(btrim(coalesce(p_usuario, '')), ''), 'N/A');
    v_now timestamp with time zone := timezone('America/Sao_Paulo', now());
    v_emissao date := coalesce((p_condicoes->>'emissao')::date, v_now::date);
    v_validade date := coalesce((p_condicoes->>'validade')::date, v_emissao + integer '7');
    v_rec public.orcamentos%ROWTYPE;
BEGIN
    IF v_id IS NOT NULL THEN
        SELECT * INTO v_rec FROM public.orcamentos WHERE id = v_id FOR UPDATE;
    END IF;

    IF v_rec.id IS NOT NULL THEN
        -- Atualizar rascunho ou edição existente sem alterar número oficial nem versão
        UPDATE public.orcamentos SET
            emissao = v_emissao,
            validade = v_validade,
            cliente_empresa = coalesce(p_cliente->>'empresa', cliente_empresa),
            cliente_documento = coalesce(p_cliente->>'documento', cliente_documento),
            cliente_responsavel = coalesce(p_cliente->>'responsavel', cliente_responsavel),
            cliente_email = coalesce(p_cliente->>'email', cliente_email),
            cliente_telefone = coalesce(p_cliente->>'telefone', cliente_telefone),
            cliente_endereco = coalesce(p_cliente->>'endereco', cliente_endereco),
            forma_pagamento = coalesce(p_condicoes->>'forma_pagamento', forma_pagamento),
            desconto_opcao = coalesce(p_condicoes->>'desconto_opcao', desconto_opcao),
            desconto_percentual = coalesce((p_condicoes->>'desconto_percentual')::numeric, desconto_percentual),
            frete_responsavel = coalesce(p_condicoes->>'frete_responsavel', frete_responsavel),
            frete_valor = coalesce((p_condicoes->>'frete_valor')::numeric, frete_valor),
            condicao_negociada = coalesce(p_condicoes->>'condicao_negociada', condicao_negociada),
            observacoes = coalesce(p_condicoes->>'observacoes', observacoes),
            subtotal = coalesce((p_condicoes->>'subtotal')::numeric, (p_condicoes->'totais'->>'subtotal')::numeric, subtotal),
            desconto_valor = coalesce((p_condicoes->>'desconto_valor')::numeric, (p_condicoes->'totais'->>'descontoValor')::numeric, (p_condicoes->'totais'->>'desconto_valor')::numeric, desconto_valor),
            frete_cobrado = coalesce((p_condicoes->>'frete_cobrado')::numeric, (p_condicoes->'totais'->>'freteCobrado')::numeric, (p_condicoes->'totais'->>'frete_cobrado')::numeric, frete_cobrado),
            total = coalesce((p_condicoes->>'total')::numeric, (p_condicoes->'totais'->>'total')::numeric, total),
            itens = coalesce(p_itens, itens),
            atualizado_em = v_now,
            atualizado_por = v_usuario
        WHERE id = v_rec.id
        RETURNING * INTO v_rec;
    ELSE
        -- Criar novo rascunho sem número oficial
        INSERT INTO public.orcamentos (
            status, versao_atual, emissao, validade,
            cliente_empresa, cliente_documento, cliente_responsavel, cliente_email, cliente_telefone, cliente_endereco,
            forma_pagamento, desconto_opcao, desconto_percentual, frete_responsavel, frete_valor, condicao_negociada, observacoes,
            subtotal, desconto_valor, frete_cobrado, total, itens, criado_por, atualizado_por, criado_em, atualizado_em
        ) VALUES (
            'rascunho', 0, v_emissao, v_validade,
            p_cliente->>'empresa', p_cliente->>'documento', p_cliente->>'responsavel', p_cliente->>'email', p_cliente->>'telefone', p_cliente->>'endereco',
            p_condicoes->>'forma_pagamento', p_condicoes->>'desconto_opcao', coalesce((p_condicoes->>'desconto_percentual')::numeric, (p_condicoes->>'desconto')::numeric, 0), coalesce(p_condicoes->>'frete_responsavel', 'cliente'), coalesce((p_condicoes->>'frete_valor')::numeric, 0), p_condicoes->>'condicao_negociada', p_condicoes->>'observacoes',
            coalesce((p_condicoes->>'subtotal')::numeric, (p_condicoes->'totais'->>'subtotal')::numeric, 0), coalesce((p_condicoes->>'desconto_valor')::numeric, (p_condicoes->'totais'->>'descontoValor')::numeric, (p_condicoes->'totais'->>'desconto_valor')::numeric, 0), coalesce((p_condicoes->>'frete_cobrado')::numeric, (p_condicoes->'totais'->>'freteCobrado')::numeric, (p_condicoes->'totais'->>'frete_cobrado')::numeric, 0), coalesce((p_condicoes->>'total')::numeric, (p_condicoes->'totais'->>'total')::numeric, 0), coalesce(p_itens, '[]'::jsonb), v_usuario, v_usuario, v_now, v_now
        ) RETURNING * INTO v_rec;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'id', v_rec.id,
        'numero_orcamento', v_rec.numero_orcamento,
        'status', v_rec.status,
        'versao_atual', v_rec.versao_atual
    );
END;
$$;

-- 5. RPC para gerar versão oficial do orçamento (Atribui número oficial ORC-YYYYMMDD-XXXX e gera snapshot V1/V2/V3...)
CREATE OR REPLACE FUNCTION public.gerar_versao_oficial_orcamento(
    p_id uuid,
    p_cliente jsonb,
    p_itens jsonb,
    p_condicoes jsonb,
    p_usuario text,
    p_execution_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_rec public.orcamentos%ROWTYPE;
    v_today_str text := to_char(timezone('America/Sao_Paulo', now()), 'YYYYMMDD');
    v_now timestamp with time zone := timezone('America/Sao_Paulo', now());
    v_emissao date := coalesce((p_condicoes->>'emissao')::date, v_now::date);
    v_validade date := coalesce((p_condicoes->>'validade')::date, v_emissao + integer '7');
    v_usuario text := coalesce(nullif(btrim(coalesce(p_usuario, '')), ''), 'N/A');
    v_next_seq integer;
    v_numero text;
    v_proxima_versao integer;
    v_snapshot jsonb;
    v_subtotal numeric;
    v_desconto_valor numeric;
    v_frete_cobrado numeric;
    v_total numeric;
BEGIN
    -- Trava para gravação concorrente no mesmo orçamento
    IF p_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('orcamento:' || p_id::text));
        SELECT * INTO v_rec FROM public.orcamentos WHERE id = p_id FOR UPDATE;
    END IF;

    IF v_rec.id IS NULL THEN
        -- Se não existia rascunho previo, cria o registro inicial primeiro
        INSERT INTO public.orcamentos (
            status, versao_atual, emissao, validade,
            cliente_empresa, cliente_documento, cliente_responsavel, cliente_email, cliente_telefone, cliente_endereco,
            forma_pagamento, desconto_opcao, desconto_percentual, frete_responsavel, frete_valor, condicao_negociada, observacoes,
            subtotal, desconto_valor, frete_cobrado, total, itens, criado_por, atualizado_por, criado_em, atualizado_em
        ) VALUES (
            'rascunho', 0, v_emissao, v_validade,
            p_cliente->>'empresa', p_cliente->>'documento', p_cliente->>'responsavel', p_cliente->>'email', p_cliente->>'telefone', p_cliente->>'endereco',
            p_condicoes->>'forma_pagamento', p_condicoes->>'desconto_opcao', coalesce((p_condicoes->>'desconto_percentual')::numeric, (p_condicoes->>'desconto')::numeric, 0), coalesce(p_condicoes->>'frete_responsavel', 'cliente'), coalesce((p_condicoes->>'frete_valor')::numeric, 0), p_condicoes->>'condicao_negociada', p_condicoes->>'observacoes',
            coalesce((p_condicoes->>'subtotal')::numeric, (p_condicoes->'totais'->>'subtotal')::numeric, 0), coalesce((p_condicoes->>'desconto_valor')::numeric, (p_condicoes->'totais'->>'descontoValor')::numeric, (p_condicoes->'totais'->>'desconto_valor')::numeric, 0), coalesce((p_condicoes->>'frete_cobrado')::numeric, (p_condicoes->'totais'->>'freteCobrado')::numeric, (p_condicoes->'totais'->>'frete_cobrado')::numeric, 0), coalesce((p_condicoes->>'total')::numeric, (p_condicoes->'totais'->>'total')::numeric, 0), coalesce(p_itens, '[]'::jsonb), v_usuario, v_usuario, v_now, v_now
        ) RETURNING * INTO v_rec;
    END IF;

    v_subtotal := coalesce((p_condicoes->>'subtotal')::numeric, (p_condicoes->'totais'->>'subtotal')::numeric, v_rec.subtotal);
    v_desconto_valor := coalesce((p_condicoes->>'desconto_valor')::numeric, (p_condicoes->'totais'->>'descontoValor')::numeric, (p_condicoes->'totais'->>'desconto_valor')::numeric, v_rec.desconto_valor);
    v_frete_cobrado := coalesce((p_condicoes->>'frete_cobrado')::numeric, (p_condicoes->'totais'->>'freteCobrado')::numeric, (p_condicoes->'totais'->>'frete_cobrado')::numeric, v_rec.frete_cobrado);
    v_total := coalesce((p_condicoes->>'total')::numeric, (p_condicoes->'totais'->>'total')::numeric, v_rec.total);

    -- 1. Determinar número oficial e proxima versão
    IF v_rec.numero_orcamento IS NOT NULL THEN
        -- Orçamento já possui número oficial: mantem o mesmo número e incrementa a versão (V1 -> V2 -> V3)
        v_numero := v_rec.numero_orcamento;
        v_proxima_versao := coalesce(v_rec.versao_atual, 0) + 1;
    ELSE
        -- Primeira geração: alocar proximo número sequencial do dia com lock advisory
        PERFORM pg_advisory_xact_lock(hashtext('orcamento_seq:' || v_today_str));

        INSERT INTO public.orcamento_sequencia (data_str, sequencia)
        VALUES (v_today_str, 1)
        ON CONFLICT (data_str) DO UPDATE
        SET sequencia = public.orcamento_sequencia.sequencia + 1
        RETURNING sequencia INTO v_next_seq;

        v_numero := 'ORC-' || v_today_str || '-' || lpad(v_next_seq::text, 4, '0');
        v_proxima_versao := 1;
    END IF;

    -- 2. Montar snapshot completo e imutavel da versão
    v_snapshot := jsonb_build_object(
        'id', v_rec.id,
        'numero', v_numero,
        'versao', v_proxima_versao,
        'emissao', v_emissao,
        'validade', v_validade,
        'cliente', p_cliente,
        'itens', p_itens,
        'totais', jsonb_build_object(
            'subtotal', v_subtotal,
            'descontoValor', v_desconto_valor,
            'freteCobrado', v_frete_cobrado,
            'total', v_total
        ),
        'desconto', coalesce((p_condicoes->>'desconto_percentual')::numeric, (p_condicoes->>'desconto')::numeric, 0),
        'descontoOpcao', p_condicoes->>'desconto_opcao',
        'freteResponsavel', coalesce(p_condicoes->>'frete_responsavel', 'cliente'),
        'freteValor', coalesce((p_condicoes->>'frete_valor')::numeric, 0),
        'formaPagamento', p_condicoes->>'forma_pagamento',
        'condicaoNegociada', p_condicoes->>'condicao_negociada',
        'observacoes', p_condicoes->>'observacoes',
        'gerado_em', v_now,
        'gerado_por', v_usuario
    );

    -- 3. Inserir na tabela de versões imutáveis
    INSERT INTO public.orcamento_versoes (
        orcamento_id, numero_orcamento, versao, snapshot, criado_em, criado_por
    ) VALUES (
        v_rec.id, v_numero, v_proxima_versao, v_snapshot, v_now, v_usuario
    );

    -- 4. Atualizar registro mestre
    UPDATE public.orcamentos SET
        numero_orcamento = v_numero,
        status = 'gerado',
        versao_atual = v_proxima_versao,
        emissao = v_emissao,
        validade = v_validade,
        cliente_empresa = coalesce(p_cliente->>'empresa', cliente_empresa),
        cliente_documento = coalesce(p_cliente->>'documento', cliente_documento),
        cliente_responsavel = coalesce(p_cliente->>'responsavel', cliente_responsavel),
        cliente_email = coalesce(p_cliente->>'email', cliente_email),
        cliente_telefone = coalesce(p_cliente->>'telefone', cliente_telefone),
        cliente_endereco = coalesce(p_cliente->>'endereco', cliente_endereco),
        forma_pagamento = coalesce(p_condicoes->>'forma_pagamento', forma_pagamento),
        desconto_opcao = coalesce(p_condicoes->>'desconto_opcao', desconto_opcao),
        desconto_percentual = coalesce((p_condicoes->>'desconto_percentual')::numeric, (p_condicoes->>'desconto')::numeric, desconto_percentual),
        frete_responsavel = coalesce(p_condicoes->>'frete_responsavel', frete_responsavel),
        frete_valor = coalesce((p_condicoes->>'frete_valor')::numeric, frete_valor),
        condicao_negociada = coalesce(p_condicoes->>'condicao_negociada', condicao_negociada),
        observacoes = coalesce(p_condicoes->>'observacoes', observacoes),
        subtotal = v_subtotal,
        desconto_valor = v_desconto_valor,
        frete_cobrado = v_frete_cobrado,
        total = v_total,
        itens = coalesce(p_itens, itens),
        atualizado_em = v_now,
        atualizado_por = v_usuario
    WHERE id = v_rec.id
    RETURNING * INTO v_rec;

    RETURN jsonb_build_object(
        'ok', true,
        'id', v_rec.id,
        'numero_orcamento', v_numero,
        'versao', v_proxima_versao,
        'snapshot', v_snapshot
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_rascunho_orcamento(uuid, jsonb, jsonb, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_versao_oficial_orcamento(uuid, jsonb, jsonb, jsonb, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
