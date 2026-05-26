CREATE POLICY "allow_select_canais_envio"
ON public.canais_envio
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "allow_select_usuarios"
ON public.usuarios
FOR SELECT
TO anon, authenticated
USING (true);
