-- Planejamento de compras automatico com demanda movel, curva ABC e lead time real.
-- A janela cresce desde o inicio do historico confiavel ate 90 dias.

ALTER TABLE public.produtos
    ADD COLUMN IF NOT EXISTS lead_time_padrao_dias integer NOT NULL DEFAULT 7,
    ADD COLUMN IF NOT EXISTS lote_minimo_compra numeric(12,3) NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS qtd_por_caixa numeric(12,3) NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS fator_conversao_compra numeric(12,3) NOT NULL DEFAULT 1;

UPDATE public.produtos
   SET lead_time_padrao_dias = GREATEST(COALESCE(lead_time_padrao_dias, 7), 1),
       lote_minimo_compra = GREATEST(COALESCE(lote_minimo_compra, 1), 1),
       qtd_por_caixa = GREATEST(COALESCE(qtd_por_caixa, 1), 1),
       fator_conversao_compra = GREATEST(COALESCE(fator_conversao_compra, 1), 1);

ALTER TABLE public.produtos
    DROP CONSTRAINT IF EXISTS produtos_lead_time_padrao_dias_check,
    DROP CONSTRAINT IF EXISTS produtos_lote_minimo_compra_check;

ALTER TABLE public.produtos
    ADD CONSTRAINT produtos_lead_time_padrao_dias_check
        CHECK (lead_time_padrao_dias BETWEEN 1 AND 365),
    ADD CONSTRAINT produtos_lote_minimo_compra_check
        CHECK (lote_minimo_compra > 0);

CREATE TABLE IF NOT EXISTS public.planejamento_compras_config (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    data_inicio_historico date,
    janela_maxima_dias integer NOT NULL DEFAULT 90,
    cobertura_dias integer NOT NULL DEFAULT 30,
    atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT planejamento_compras_janela_check
        CHECK (janela_maxima_dias BETWEEN 1 AND 365),
    CONSTRAINT planejamento_compras_cobertura_check
        CHECK (cobertura_dias BETWEEN 1 AND 365)
);

INSERT INTO public.planejamento_compras_config (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pedidos_compra_itens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_interno text NOT NULL,
    fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
    pedido_referencia text,
    data_pedido date NOT NULL,
    data_prevista date,
    data_recebimento date,
    quantidade_pedida numeric(12,3) NOT NULL,
    quantidade_recebida numeric(12,3) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'PENDENTE',
    usuario text,
    observacoes text,
    criado_em timestamp with time zone NOT NULL DEFAULT now(),
    atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pedidos_compra_quantidade_check
        CHECK (quantidade_pedida > 0 AND quantidade_recebida >= 0),
    CONSTRAINT pedidos_compra_datas_check
        CHECK (
            (data_prevista IS NULL OR data_prevista >= data_pedido)
            AND (data_recebimento IS NULL OR data_recebimento >= data_pedido)
        ),
    CONSTRAINT pedidos_compra_status_check
        CHECK (status IN ('PENDENTE', 'PARCIAL', 'RECEBIDO', 'CANCELADO'))
);

CREATE INDEX IF NOT EXISTS idx_pedidos_compra_itens_produto
    ON public.pedidos_compra_itens (id_interno);

CREATE INDEX IF NOT EXISTS idx_pedidos_compra_itens_status
    ON public.pedidos_compra_itens (status, data_pedido DESC);

CREATE INDEX IF NOT EXISTS idx_movimentos_planejamento_saida
    ON public.movimentos (data_hora DESC, id_interno)
    WHERE tipo = 'SAIDA'
      AND origem IN ('APP_SEPARACAO', 'APP_CONFERENCIA');

ALTER TABLE public.planejamento_compras_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_compra_itens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'planejamento_compras_config'
           AND policyname = 'allow_all_planejamento_compras_config'
    ) THEN
        CREATE POLICY allow_all_planejamento_compras_config
            ON public.planejamento_compras_config
            FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'pedidos_compra_itens'
           AND policyname = 'allow_all_pedidos_compra_itens'
    ) THEN
        CREATE POLICY allow_all_pedidos_compra_itens
            ON public.pedidos_compra_itens
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;

GRANT ALL ON TABLE public.planejamento_compras_config
    TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.pedidos_compra_itens
    TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.calcular_planejamento_compras(
    p_janela_maxima_dias integer DEFAULT NULL,
    p_cobertura_dias integer DEFAULT NULL
)
RETURNS TABLE (
    id_interno text,
    descricao text,
    local_principal text,
    estoque_disponivel numeric,
    dias_historico integer,
    saidas_periodo numeric,
    media_diaria numeric,
    desvio_diario numeric,
    abc_valor text,
    abc_saida text,
    abc_combinado text,
    fator_z numeric,
    lead_time_dias integer,
    amostras_lead_time integer,
    estoque_seguranca numeric,
    estoque_minimo_calculado numeric,
    estoque_ideal_calculado numeric,
    quantidade_em_pedido numeric,
    quantidade_sugerida numeric,
    custo_estimado numeric,
    status_planejamento text,
    modo_calculo text,
    embalagem_compra numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
WITH config AS (
    SELECT
        COALESCE(
            p_janela_maxima_dias,
            (SELECT janela_maxima_dias
               FROM public.planejamento_compras_config
              WHERE id = true),
            90
        )::integer AS janela_dias,
        COALESCE(
            p_cobertura_dias,
            (SELECT cobertura_dias
               FROM public.planejamento_compras_config
              WHERE id = true),
            30
        )::integer AS cobertura_dias,
        (SELECT data_inicio_historico
           FROM public.planejamento_compras_config
          WHERE id = true) AS inicio_configurado
),
saidas_validas AS (
    SELECT
        m.id_interno,
        m.data_hora::date AS dia,
        SUM(ABS(COALESCE(m.quantidade, 0)))::numeric AS quantidade
      FROM public.movimentos m
     WHERE m.tipo = 'SAIDA'
       AND m.origem IN ('APP_SEPARACAO', 'APP_CONFERENCIA')
       AND m.id_interno IS NOT NULL
     GROUP BY m.id_interno, m.data_hora::date
),
limites AS (
    SELECT
        GREATEST(
            COALESCE(
                c.inicio_configurado,
                (SELECT MIN(s.dia) FROM saidas_validas s),
                CURRENT_DATE
            ),
            CURRENT_DATE - (GREATEST(c.janela_dias, 1) - 1)
        )::date AS inicio,
        CURRENT_DATE::date AS fim,
        GREATEST(c.cobertura_dias, 1)::integer AS cobertura_dias
      FROM config c
),
produtos_base AS (
    SELECT
        p.id_interno,
        COALESCE(NULLIF(p.descricao_completa, ''), NULLIF(p.descricao_base, ''), p.id_interno) AS descricao,
        GREATEST(COALESCE(p.preco_custo, 0), 0)::numeric AS custo_unitario,
        GREATEST(COALESCE(p.estoque_minimo, 0), 0)::numeric AS minimo_manual,
        GREATEST(COALESCE(p.estoque_ideal, 0), 0)::numeric AS ideal_manual,
        GREATEST(COALESCE(p.lead_time_padrao_dias, 7), 1)::integer AS lead_padrao,
        GREATEST(
            COALESCE(NULLIF(p.fator_conversao_compra, 0), NULLIF(p.qtd_por_caixa, 0), NULLIF(p.quantidade_embalagem, 0), 1),
            COALESCE(NULLIF(p.lote_minimo_compra, 0), 1),
            1
        )::numeric AS embalagem,
        GREATEST(
            l.inicio,
            LEAST(CURRENT_DATE, COALESCE(p.criado_em::date, l.inicio))
        )::date AS inicio_produto,
        l.fim,
        l.cobertura_dias
      FROM public.produtos p
      CROSS JOIN limites l
     WHERE LOWER(COALESCE(p.status, 'ativo')) NOT IN ('inativo', 'excluido')
),
calendario_produtos AS (
    SELECT
        p.id_interno,
        p.descricao,
        p.custo_unitario,
        p.minimo_manual,
        p.ideal_manual,
        p.lead_padrao,
        p.embalagem,
        p.cobertura_dias,
        serie.dia::date AS dia,
        COALESCE(s.quantidade, 0)::numeric AS quantidade
      FROM produtos_base p
      CROSS JOIN LATERAL generate_series(
          p.inicio_produto,
          p.fim,
          interval '1 day'
      ) AS serie(dia)
      LEFT JOIN saidas_validas s
        ON s.id_interno = p.id_interno
       AND s.dia = serie.dia::date
),
demanda AS (
    SELECT
        c.id_interno,
        MAX(c.descricao) AS descricao,
        MAX(c.custo_unitario) AS custo_unitario,
        MAX(c.minimo_manual) AS minimo_manual,
        MAX(c.ideal_manual) AS ideal_manual,
        MAX(c.lead_padrao) AS lead_padrao,
        MAX(c.embalagem) AS embalagem,
        MAX(c.cobertura_dias) AS cobertura_dias,
        COUNT(*)::integer AS dias_historico,
        SUM(c.quantidade)::numeric AS saidas_periodo,
        AVG(c.quantidade)::numeric AS media_diaria,
        COALESCE(STDDEV_POP(c.quantidade), 0)::numeric AS desvio_diario,
        (SUM(c.quantidade) * MAX(c.custo_unitario))::numeric AS valor_consumo
      FROM calendario_produtos c
     GROUP BY c.id_interno
),
curvas_acumuladas AS (
    SELECT
        d.*,
        SUM(d.valor_consumo) OVER (
            ORDER BY d.valor_consumo DESC, d.id_interno
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) / NULLIF(SUM(d.valor_consumo) OVER (), 0) AS percentual_valor_acumulado,
        SUM(d.saidas_periodo) OVER (
            ORDER BY d.saidas_periodo DESC, d.id_interno
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) / NULLIF(SUM(d.saidas_periodo) OVER (), 0) AS percentual_saida_acumulado
      FROM demanda d
),
curvas AS (
    SELECT
        a.*,
        CASE
            WHEN a.saidas_periodo <= 0 THEN 'C'
            WHEN a.percentual_valor_acumulado <= 0.80 THEN 'A'
            WHEN a.percentual_valor_acumulado <= 0.95 THEN 'B'
            ELSE 'C'
        END AS abc_valor,
        CASE
            WHEN a.saidas_periodo <= 0 THEN 'C'
            WHEN a.percentual_saida_acumulado <= 0.80 THEN 'A'
            WHEN a.percentual_saida_acumulado <= 0.95 THEN 'B'
            ELSE 'C'
        END AS abc_saida
      FROM curvas_acumuladas a
),
curvas_z AS (
    SELECT
        c.*,
        c.abc_valor || c.abc_saida AS abc_combinado,
        CASE c.abc_valor || c.abc_saida
            WHEN 'AA' THEN 2.33
            WHEN 'AB' THEN 2.17
            WHEN 'AC' THEN 2.05
            WHEN 'BA' THEN 1.96
            WHEN 'BB' THEN 1.88
            WHEN 'BC' THEN 1.81
            WHEN 'CA' THEN 1.75
            WHEN 'CB' THEN 1.70
            ELSE 1.65
        END::numeric AS fator_z
      FROM curvas c
),
lead_amostras_ordenadas AS (
    SELECT
        pci.id_interno,
        (pci.data_recebimento - pci.data_pedido)::integer AS lead_time_dias,
        ROW_NUMBER() OVER (
            PARTITION BY pci.id_interno
            ORDER BY pci.data_recebimento DESC, pci.atualizado_em DESC
        ) AS ordem
      FROM public.pedidos_compra_itens pci
     WHERE pci.status = 'RECEBIDO'
       AND pci.data_recebimento IS NOT NULL
       AND pci.data_recebimento >= pci.data_pedido
),
lead_real AS (
    SELECT
        l.id_interno,
        ROUND(
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.lead_time_dias)
        )::integer AS lead_time_dias,
        COUNT(*)::integer AS amostras
      FROM lead_amostras_ordenadas l
     WHERE l.ordem <= 10
     GROUP BY l.id_interno
),
pedidos_abertos AS (
    SELECT
        pci.id_interno,
        SUM(
            GREATEST(pci.quantidade_pedida - pci.quantidade_recebida, 0)
        )::numeric AS quantidade
      FROM public.pedidos_compra_itens pci
     WHERE pci.status IN ('PENDENTE', 'PARCIAL')
     GROUP BY pci.id_interno
),
estoque_vendavel AS (
    SELECT
        e.id_interno,
        SUM(GREATEST(COALESCE(e.saldo_disponivel, e.saldo_total, 0), 0))::numeric AS quantidade
      FROM public.estoque_atual e
     WHERE UPPER(COALESCE(e.local, '')) NOT IN (
         'DEFEITO', 'EM_GARANTIA', 'GARANTIA', 'EM_TRANSITO', 'EM_TRANSPORTE'
     )
     GROUP BY e.id_interno
),
local_principal AS (
    SELECT DISTINCT ON (e.id_interno)
        e.id_interno,
        e.local
      FROM public.estoque_atual e
     WHERE UPPER(COALESCE(e.local, '')) NOT IN (
         'DEFEITO', 'EM_GARANTIA', 'GARANTIA', 'EM_TRANSITO', 'EM_TRANSPORTE'
     )
     ORDER BY
        e.id_interno,
        GREATEST(COALESCE(e.saldo_disponivel, e.saldo_total, 0), 0) DESC,
        e.local
),
base_calculo AS (
    SELECT
        c.*,
        COALESCE(ev.quantidade, 0)::numeric AS estoque_disponivel,
        COALESCE(lp.local, '-') AS local_principal,
        COALESCE(pa.quantidade, 0)::numeric AS quantidade_em_pedido,
        COALESCE(lr.lead_time_dias, c.lead_padrao)::integer AS lead_time_dias,
        COALESCE(lr.amostras, 0)::integer AS amostras_lead_time
      FROM curvas_z c
      LEFT JOIN estoque_vendavel ev ON ev.id_interno = c.id_interno
      LEFT JOIN local_principal lp ON lp.id_interno = c.id_interno
      LEFT JOIN pedidos_abertos pa ON pa.id_interno = c.id_interno
      LEFT JOIN lead_real lr ON lr.id_interno = c.id_interno
),
parametros AS (
    SELECT
        b.*,
        CASE
            WHEN b.saidas_periodo > 0
                THEN CEIL(b.fator_z * b.desvio_diario * SQRT(b.lead_time_dias::numeric))
            ELSE 0
        END::numeric AS estoque_seguranca
      FROM base_calculo b
),
niveis AS (
    SELECT
        p.*,
        CASE
            WHEN p.saidas_periodo > 0
                THEN CEIL(p.media_diaria * p.lead_time_dias + p.estoque_seguranca)
            ELSE p.minimo_manual
        END::numeric AS estoque_minimo_calculado,
        CASE
            WHEN p.saidas_periodo > 0
                THEN CEIL(
                    p.media_diaria * (p.lead_time_dias + p.cobertura_dias)
                    + p.estoque_seguranca
                )
            ELSE p.ideal_manual
        END::numeric AS estoque_ideal_calculado
      FROM parametros p
),
sugestoes AS (
    SELECT
        n.*,
        CASE
            WHEN n.estoque_disponivel + n.quantidade_em_pedido <= n.estoque_minimo_calculado
                THEN CEIL(
                    GREATEST(
                        n.estoque_ideal_calculado
                        - n.estoque_disponivel
                        - n.quantidade_em_pedido,
                        0
                    ) / n.embalagem
                ) * n.embalagem
            ELSE 0
        END::numeric AS quantidade_sugerida
      FROM niveis n
)
SELECT
    s.id_interno,
    s.descricao,
    s.local_principal,
    s.estoque_disponivel,
    s.dias_historico,
    s.saidas_periodo,
    ROUND(s.media_diaria, 4),
    ROUND(s.desvio_diario, 4),
    s.abc_valor,
    s.abc_saida,
    s.abc_combinado,
    s.fator_z,
    s.lead_time_dias,
    s.amostras_lead_time,
    s.estoque_seguranca,
    s.estoque_minimo_calculado,
    s.estoque_ideal_calculado,
    s.quantidade_em_pedido,
    s.quantidade_sugerida,
    ROUND(s.quantidade_sugerida * s.custo_unitario, 2),
    CASE
        WHEN s.estoque_disponivel <= 0
             AND (s.saidas_periodo > 0 OR s.estoque_minimo_calculado > 0)
            THEN 'CRITICO'
        WHEN s.quantidade_sugerida > 0
            THEN 'COMPRAR'
        ELSE 'OK'
    END,
    CASE WHEN s.saidas_periodo > 0 THEN 'AUTOMATICO' ELSE 'MANUAL' END,
    s.embalagem
  FROM sugestoes s
 ORDER BY
    CASE
        WHEN s.estoque_disponivel <= 0
             AND (s.saidas_periodo > 0 OR s.estoque_minimo_calculado > 0)
            THEN 0
        WHEN s.quantidade_sugerida > 0 THEN 1
        ELSE 2
    END,
    s.quantidade_sugerida DESC,
    s.descricao;
$function$;

GRANT EXECUTE ON FUNCTION public.calcular_planejamento_compras(integer, integer)
    TO anon, authenticated, service_role;

COMMENT ON TABLE public.pedidos_compra_itens IS
    'Itens pedidos a fornecedores. Datas de pedido e recebimento alimentam o lead time real.';
COMMENT ON FUNCTION public.calcular_planejamento_compras(integer, integer) IS
    'Calcula demanda movel, curva ABC, lead time, estoque de seguranca e sugestao de compra.';
