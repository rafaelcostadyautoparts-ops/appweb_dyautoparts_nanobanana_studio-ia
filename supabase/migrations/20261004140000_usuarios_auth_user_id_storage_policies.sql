-- Migration: 20261004140000_usuarios_auth_user_id_storage_policies.sql
-- Objetivo: Vínculo seguro entre public.usuarios e auth.users, e policies restritas para o bucket financeiro-comprovantes.

-- 1. Adicionar coluna auth_user_id com FK e UNIQUE
ALTER TABLE public.usuarios 
ADD COLUMN IF NOT EXISTS auth_user_id uuid NULL UNIQUE REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_usuarios_auth_user_id ON public.usuarios(auth_user_id);

-- 2. Função de validação de autorização financeira baseada em auth.uid() e public.usuarios
CREATE OR REPLACE FUNCTION public.pode_acessar_storage_financeiro(p_user_id uuid, p_acao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.usuarios u
    WHERE u.auth_user_id = p_user_id
      AND u.ativo = true
      AND (
        (p_acao IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE') AND lower(u.perfil) = 'admin')
        OR
        (p_acao IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE') AND lower(u.perfil) = 'operador')
      )
  );
$$;

-- 3. Remover policies permissivas anteriores de homologação
DROP POLICY IF EXISTS "permitir_upload_comprovantes_financeiro" ON storage.objects;
DROP POLICY IF EXISTS "permitir_leitura_comprovantes_financeiro" ON storage.objects;
DROP POLICY IF EXISTS "permitir_update_comprovantes_financeiro" ON storage.objects;
DROP POLICY IF EXISTS "permitir_delete_comprovantes_financeiro" ON storage.objects;

-- 4. Criar novas policies estritas exigindo sessão AUTHENTICATED com vínculo ativo em public.usuarios
CREATE POLICY "financeiro_comprovantes_select_authenticated"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'financeiro-comprovantes'
  AND public.pode_acessar_storage_financeiro(auth.uid(), 'SELECT')
);

CREATE POLICY "financeiro_comprovantes_insert_authenticated"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'financeiro-comprovantes'
  AND public.pode_acessar_storage_financeiro(auth.uid(), 'INSERT')
);

CREATE POLICY "financeiro_comprovantes_update_authenticated"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'financeiro-comprovantes'
  AND public.pode_acessar_storage_financeiro(auth.uid(), 'UPDATE')
)
WITH CHECK (
  bucket_id = 'financeiro-comprovantes'
  AND public.pode_acessar_storage_financeiro(auth.uid(), 'UPDATE')
);

CREATE POLICY "financeiro_comprovantes_delete_authenticated"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'financeiro-comprovantes'
  AND public.pode_acessar_storage_financeiro(auth.uid(), 'DELETE')
);
