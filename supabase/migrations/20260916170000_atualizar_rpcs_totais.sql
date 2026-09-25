-- Migration de atualização das RPCs de orçamentos para suporte robusto a totais e idempotência
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
    v_subtotal numeric;
    v_desconto_valor numeric;
    v_frete_cobrado numeric;
    v_total numeric;
BEGIN
    v_subtotal := coalesce((p_condicoes->>'subtotal')::numeric, (p_condicoes->'totais'->>'subtotal')::numeric, 0);
    v_desconto_valor := coalesce((p_condicoes->>'desconto_valor')::numeric, (p_condicoes->'totais'->>'descontoValor')::numeric, (p_condicoes->'totais'->>'desconto_valor')::numeric, 0);
    v_frete_cobrado := coalesce((p_condicoes->>'frete_cobrado')::numeric, (p_condicoes->'totais'->>'freteCobrado')::numeric, (p_condicoes->'totais'->>'frete_cobrado')::numeric, 0);
    v_total := coalesce((p_condicoes->>'total')::numeric, (p_condicoes->'totais'->>'total')::numeric, 0);

    IF v_id IS NOT NULL THEN
        SELECT * INTO v_rec FROM public.orcamentos WHERE id = v_id FOR UPDATE;
    END IF;

    IF v_rec.id IS NOT NULL THEN
        -- Atualizar rascunho existente sem alterar numero nem versão
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
    ELSE
        -- Criar novo rascunho sem numero oficial
        INSERT INTO public.orcamentos (
            status, versao_atual, emissao, validade,
            cliente_empresa, cliente_documento, cliente_responsavel, cliente_email, cliente_telefone, cliente_endereco,
            forma_pagamento, desconto_opcao, desconto_percentual, frete_responsavel, frete_valor, condicao_negociada, observacoes,
            subtotal, desconto_valor, frete_cobrado, total, itens, criado_por, atualizado_por, criado_em, atualizado_em
        ) VALUES (
            'rascunho', 0, v_emissao, v_validade,
            p_cliente->>'empresa', p_cliente->>'documento', p_cliente->>'responsavel', p_cliente->>'email', p_cliente->>'telefone', p_cliente->>'endereco',
            p_condicoes->>'forma_pagamento', p_condicoes->>'desconto_opcao', coalesce((p_condicoes->>'desconto_percentual')::numeric, (p_condicoes->>'desconto')::numeric, 0), coalesce(p_condicoes->>'frete_responsavel', 'cliente'), coalesce((p_condicoes->>'frete_valor')::numeric, 0), p_condicoes->>'condicao_negociada', p_condicoes->>'observacoes',
            v_subtotal, v_desconto_valor, v_frete_cobrado, v_total, coalesce(p_itens, '[]'::jsonb), v_usuario, v_usuario, v_now, v_now
        ) RETURNING * INTO v_rec;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'id', v_rec.id,
        'numero_orcamento', v_rec.numero_orcamento,
        'status', v_rec.status,
        'versao_atual', v_rec.versao_atual,
        'total', v_rec.total
    );
END;
$$;

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
    IF p_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('orcamento:' || p_id::text));
        SELECT * INTO v_rec FROM public.orcamentos WHERE id = p_id FOR UPDATE;
    END IF;

    v_subtotal := coalesce((p_condicoes->>'subtotal')::numeric, (p_condicoes->'totais'->>'subtotal')::numeric, coalesce(v_rec.subtotal, 0));
    v_desconto_valor := coalesce((p_condicoes->>'desconto_valor')::numeric, (p_condicoes->'totais'->>'descontoValor')::numeric, (p_condicoes->'totais'->>'desconto_valor')::numeric, coalesce(v_rec.desconto_valor, 0));
    v_frete_cobrado := coalesce((p_condicoes->>'frete_cobrado')::numeric, (p_condicoes->'totais'->>'freteCobrado')::numeric, (p_condicoes->'totais'->>'frete_cobrado')::numeric, coalesce(v_rec.frete_cobrado, 0));
    v_total := coalesce((p_condicoes->>'total')::numeric, (p_condicoes->'totais'->>'total')::numeric, coalesce(v_rec.total, 0));

    IF v_rec.id IS NULL THEN
        INSERT INTO public.orcamentos (
            status, versao_atual, emissao, validade,
            cliente_empresa, cliente_documento, cliente_responsavel, cliente_email, cliente_telefone, cliente_endereco,
            forma_pagamento, desconto_opcao, desconto_percentual, frete_responsavel, frete_valor, condicao_negociada, observacoes,
            subtotal, desconto_valor, frete_cobrado, total, itens, criado_por, atualizado_por, criado_em, atualizado_em
        ) VALUES (
            'rascunho', 0, v_emissao, v_validade,
            p_cliente->>'empresa', p_cliente->>'documento', p_cliente->>'responsavel', p_cliente->>'email', p_cliente->>'telefone', p_cliente->>'endereco',
            p_condicoes->>'forma_pagamento', p_condicoes->>'desconto_opcao', coalesce((p_condicoes->>'desconto_percentual')::numeric, (p_condicoes->>'desconto')::numeric, 0), coalesce(p_condicoes->>'frete_responsavel', 'cliente'), coalesce((p_condicoes->>'frete_valor')::numeric, 0), p_condicoes->>'condicao_negociada', p_condicoes->>'observacoes',
            v_subtotal, v_desconto_valor, v_frete_cobrado, v_total, coalesce(p_itens, '[]'::jsonb), v_usuario, v_usuario, v_now, v_now
        ) RETURNING * INTO v_rec;
    END IF;

    IF v_rec.numero_orcamento IS NOT NULL THEN
        v_numero := v_rec.numero_orcamento;
        v_proxima_versao := coalesce(v_rec.versao_atual, 0) + 1;
    ELSE
        PERFORM pg_advisory_xact_lock(hashtext('orcamento_seq:' || v_today_str));

        INSERT INTO public.orcamento_sequencia (data_str, sequencia)
        VALUES (v_today_str, 1)
        ON CONFLICT (data_str) DO UPDATE
        SET sequencia = public.orcamento_sequencia.sequencia + 1
        RETURNING sequencia INTO v_next_seq;

        v_numero := 'ORC-' || v_today_str || '-' || lpad(v_next_seq::text, 4, '0');
        v_proxima_versao := 1;
    END IF;

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

    INSERT INTO public.orcamento_versoes (
        orcamento_id, numero_orcamento, versao, snapshot, criado_em, criado_por
    ) VALUES (
        v_rec.id, v_numero, v_proxima_versao, v_snapshot, v_now, v_usuario
    );

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
