CREATE TABLE IF NOT EXISTS public.inventarios_itens_duplicados_backup AS
SELECT
    i.*,
    now()::timestamp without time zone AS backup_em,
    ''::text AS backup_motivo
FROM public.inventarios_itens i
WHERE false;

WITH ranked AS (
    SELECT
        i.*,
        count(*) OVER (PARTITION BY i.inventario_id, i.id_interno) AS dup_count
    FROM public.inventarios_itens i
)
INSERT INTO public.inventarios_itens_duplicados_backup
SELECT
    ranked.id,
    ranked.inventario_id,
    ranked.id_interno,
    ranked.local,
    ranked.saldo_sistema,
    ranked.saldo_fisico,
    ranked.diferenca,
    ranked.valor_unitario,
    ranked.valor_diferenca,
    ranked.auditado_por,
    ranked.auditado_em,
    ranked.atualizado_em,
    now()::timestamp without time zone AS backup_em,
    'consolidacao_unique_inventario_id_id_interno' AS backup_motivo
FROM ranked
WHERE ranked.dup_count > 1;

WITH grouped AS (
    SELECT
        inventario_id,
        id_interno,
        (array_agg(id ORDER BY coalesce(auditado_em, atualizado_em, timestamp '1970-01-01'), id))[1] AS keep_id,
        (array_agg(local ORDER BY coalesce(auditado_em, atualizado_em, timestamp '1970-01-01'), id))[1] AS keep_local,
        max(coalesce(saldo_sistema, 0))::integer AS saldo_sistema,
        sum(coalesce(saldo_fisico, 0))::integer AS saldo_fisico,
        max(coalesce(valor_unitario, 0)) AS valor_unitario,
        (array_agg(auditado_por ORDER BY coalesce(auditado_em, atualizado_em, timestamp '1970-01-01') DESC NULLS LAST, id DESC))[1] AS auditado_por,
        max(auditado_em) AS auditado_em
    FROM public.inventarios_itens
    GROUP BY inventario_id, id_interno
    HAVING count(*) > 1
)
UPDATE public.inventarios_itens ii
SET
    local = grouped.keep_local,
    saldo_sistema = grouped.saldo_sistema,
    saldo_fisico = grouped.saldo_fisico,
    diferenca = grouped.saldo_fisico - grouped.saldo_sistema,
    valor_unitario = grouped.valor_unitario,
    valor_diferenca = (grouped.saldo_fisico - grouped.saldo_sistema) * grouped.valor_unitario,
    auditado_por = grouped.auditado_por,
    auditado_em = grouped.auditado_em,
    atualizado_em = now()
FROM grouped
WHERE ii.id = grouped.keep_id;

WITH ranked AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY inventario_id, id_interno
            ORDER BY coalesce(auditado_em, atualizado_em, timestamp '1970-01-01'), id
        ) AS rn
    FROM public.inventarios_itens
)
DELETE FROM public.inventarios_itens ii
USING ranked
WHERE ii.id = ranked.id
  AND ranked.rn > 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'inventarios_itens_inventario_id_id_interno_key'
          AND conrelid = 'public.inventarios_itens'::regclass
    ) THEN
        ALTER TABLE public.inventarios_itens
            ADD CONSTRAINT inventarios_itens_inventario_id_id_interno_key
            UNIQUE (inventario_id, id_interno);
    END IF;
END $$;
