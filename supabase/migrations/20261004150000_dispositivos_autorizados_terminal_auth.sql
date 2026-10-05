-- Migration: 20261004150000_dispositivos_autorizados_terminal_auth.sql
-- Objetivo: Modelagem de Terminal Autenticado (Supabase Auth) e autorização por terminal no bucket financeiro-comprovantes.

-- 1. Adicionar colunas de identidade técnica e permissão de terminal em public.dispositivos_autorizados
ALTER TABLE public.dispositivos_autorizados 
ADD COLUMN IF NOT EXISTS auth_user_id uuid NULL UNIQUE REFERENCES auth.users(id);

ALTER TABLE public.dispositivos_autorizados 
ADD COLUMN IF NOT EXISTS perfil_terminal text DEFAULT 'operacional';

CREATE INDEX IF NOT EXISTS idx_dispositivos_auth_user_id ON public.dispositivos_autorizados(auth_user_id);

-- 2. Função de autorização de Storage baseada na identidade técnica do terminal
CREATE OR REPLACE FUNCTION public.terminal_autorizado_storage_financeiro(p_auth_uid uuid, p_acao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.dispositivos_autorizados d
    WHERE d.auth_user_id = p_auth_uid
      AND d.ativo = true
      AND lower(coalesce(d.perfil_terminal, 'operacional')) IN ('financeiro', 'admin')
  );
$$;

-- 3. Remover policies anteriores de storage
DROP POLICY IF EXISTS "permitir_upload_comprovantes_financeiro" ON storage.objects;
DROP POLICY IF EXISTS "permitir_leitura_comprovantes_financeiro" ON storage.objects;
DROP POLICY IF EXISTS "permitir_update_comprovantes_financeiro" ON storage.objects;
DROP POLICY IF EXISTS "permitir_delete_comprovantes_financeiro" ON storage.objects;
DROP POLICY IF EXISTS "financeiro_comprovantes_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "financeiro_comprovantes_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "financeiro_comprovantes_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "financeiro_comprovantes_delete_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "financeiro_comprovantes_select_terminal_auth" ON storage.objects;
DROP POLICY IF EXISTS "financeiro_comprovantes_insert_terminal_auth" ON storage.objects;
DROP POLICY IF EXISTS "financeiro_comprovantes_update_terminal_auth" ON storage.objects;
DROP POLICY IF EXISTS "financeiro_comprovantes_delete_terminal_auth" ON storage.objects;

-- 4. Criar novas policies vinculadas ao terminal autenticado
CREATE POLICY "financeiro_comprovantes_select_terminal_auth"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'financeiro-comprovantes'
  AND public.terminal_autorizado_storage_financeiro(auth.uid(), 'SELECT')
);

CREATE POLICY "financeiro_comprovantes_insert_terminal_auth"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'financeiro-comprovantes'
  AND public.terminal_autorizado_storage_financeiro(auth.uid(), 'INSERT')
);

CREATE POLICY "financeiro_comprovantes_update_terminal_auth"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'financeiro-comprovantes'
  AND public.terminal_autorizado_storage_financeiro(auth.uid(), 'UPDATE')
)
WITH CHECK (
  bucket_id = 'financeiro-comprovantes'
  AND public.terminal_autorizado_storage_financeiro(auth.uid(), 'UPDATE')
);

CREATE POLICY "financeiro_comprovantes_delete_terminal_auth"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'financeiro-comprovantes'
  AND public.terminal_autorizado_storage_financeiro(auth.uid(), 'DELETE')
);
