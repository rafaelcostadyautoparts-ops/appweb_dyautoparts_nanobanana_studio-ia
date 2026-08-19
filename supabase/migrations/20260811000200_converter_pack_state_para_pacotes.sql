-- Converte a composicao legada PACK_STATE para as tabelas compartilhadas de pacotes.
BEGIN;

WITH decoded AS (
    SELECT s.separacao_id, s.criado_por,
           convert_from(decode(substring(s.observacao from 'PACK_STATE:([A-Za-z0-9+/=]+)'), 'base64'), 'UTF8')::jsonb AS state
      FROM public.separacao s
     WHERE s.observacao LIKE '%PACK_STATE:%'
       AND NOT EXISTS (SELECT 1 FROM public.separacao_pacotes sp WHERE sp.separacao_id = s.separacao_id)
), units AS (
    SELECT d.separacao_id, d.criado_por, row->>'id' AS id_interno, a.ord,
           CASE WHEN a.value = 'null'::jsonb
                THEN 'AVL-' || (row->>'id') || '-' || lpad(a.ord::text, 4, '0')
                ELSE a.value #>> '{}'
           END AS pacote_id,
           CASE WHEN a.value = 'null'::jsonb THEN 'AVULSO' ELSE 'AGRUPADO' END AS tipo
      FROM decoded d
      CROSS JOIN LATERAL jsonb_array_elements(d.state) row
      CROSS JOIN LATERAL jsonb_array_elements(row->'assignments') WITH ORDINALITY a(value, ord)
), package_rows AS (
    SELECT separacao_id, pacote_id, min(tipo) AS tipo, min(criado_por) AS criado_por
      FROM units GROUP BY separacao_id, pacote_id
)
INSERT INTO public.separacao_pacotes (
    pacote_id, separacao_id, tipo, status, criado_por, criado_em, atualizado_em
)
SELECT pacote_id, separacao_id, tipo, 'ATIVO', coalesce(nullif(criado_por, ''), 'MIGRACAO_PACK_STATE'), now(), now()
  FROM package_rows
ON CONFLICT (separacao_id, pacote_id) DO NOTHING;

WITH decoded AS (
    SELECT s.separacao_id,
           convert_from(decode(substring(s.observacao from 'PACK_STATE:([A-Za-z0-9+/=]+)'), 'base64'), 'UTF8')::jsonb AS state
      FROM public.separacao s
     WHERE s.observacao LIKE '%PACK_STATE:%'
), units AS (
    SELECT d.separacao_id, row->>'id' AS id_interno,
           CASE WHEN a.value = 'null'::jsonb
                THEN 'AVL-' || (row->>'id') || '-' || lpad(a.ord::text, 4, '0')
                ELSE a.value #>> '{}'
           END AS pacote_id
      FROM decoded d
      CROSS JOIN LATERAL jsonb_array_elements(d.state) row
      CROSS JOIN LATERAL jsonb_array_elements(row->'assignments') WITH ORDINALITY a(value, ord)
), item_rows AS (
    SELECT separacao_id, pacote_id, id_interno, count(*)::integer AS quantidade
      FROM units GROUP BY separacao_id, pacote_id, id_interno
)
INSERT INTO public.separacao_pacote_itens (separacao_id, pacote_id, id_interno, quantidade, criado_em)
SELECT i.separacao_id, i.pacote_id, i.id_interno, i.quantidade, now()
  FROM item_rows i
  JOIN public.separacao_pacotes p ON p.separacao_id = i.separacao_id AND p.pacote_id = i.pacote_id
ON CONFLICT (separacao_id, pacote_id, id_interno) DO NOTHING;

COMMIT;