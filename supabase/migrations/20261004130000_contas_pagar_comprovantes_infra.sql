-- Migration: Infraestrutura de Comprovantes Financeiros
-- Adiciona colunas de metadados em public.contas_pagar e cria o bucket privado financeiro-comprovantes
-- Ambiente: Somente Homologação (doklsgduslimidfbyngj)
-- Data: 2026-10-04

-- 1. Colunas de metadados em contas_pagar
ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS comprovante_path text NULL,
  ADD COLUMN IF NOT EXISTS comprovante_nome text NULL,
  ADD COLUMN IF NOT EXISTS comprovante_tipo text NULL,
  ADD COLUMN IF NOT EXISTS comprovante_tamanho integer NULL,
  ADD COLUMN IF NOT EXISTS comprovante_anexado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS comprovante_anexado_por_id text NULL,
  ADD COLUMN IF NOT EXISTS comprovante_anexado_por_nome text NULL;

COMMENT ON COLUMN public.contas_pagar.comprovante_path IS 'Caminho do arquivo no bucket privado financeiro-comprovantes';
COMMENT ON COLUMN public.contas_pagar.comprovante_nome IS 'Nome original do arquivo enviado pelo operador';
COMMENT ON COLUMN public.contas_pagar.comprovante_tipo IS 'MIME type validado (application/pdf, image/jpeg, image/png)';
COMMENT ON COLUMN public.contas_pagar.comprovante_tamanho IS 'Tamanho do arquivo em bytes (máximo 5MB)';
COMMENT ON COLUMN public.contas_pagar.comprovante_anexado_em IS 'Data e hora da anexação do comprovante';
COMMENT ON COLUMN public.contas_pagar.comprovante_anexado_por_id IS 'ID do operador que anexou o comprovante';
COMMENT ON COLUMN public.contas_pagar.comprovante_anexado_por_nome IS 'Snapshot do nome do operador que anexou o comprovante';

-- 2. Criação do bucket privado financeiro-comprovantes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'financeiro-comprovantes',
  'financeiro-comprovantes',
  false,
  5242880,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[];

-- 3. Políticas de segurança para storage.objects no bucket financeiro-comprovantes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Permitir upload comprovantes financeiros'
  ) THEN
    CREATE POLICY "Permitir upload comprovantes financeiros"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'financeiro-comprovantes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Permitir leitura comprovantes financeiros'
  ) THEN
    CREATE POLICY "Permitir leitura comprovantes financeiros"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'financeiro-comprovantes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Permitir update comprovantes financeiros'
  ) THEN
    CREATE POLICY "Permitir update comprovantes financeiros"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'financeiro-comprovantes')
    WITH CHECK (bucket_id = 'financeiro-comprovantes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Permitir remocao comprovantes financeiros'
  ) THEN
    CREATE POLICY "Permitir remocao comprovantes financeiros"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'financeiro-comprovantes');
  END IF;
END $$;
