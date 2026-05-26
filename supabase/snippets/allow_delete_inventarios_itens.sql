CREATE POLICY allow_delete
    ON public.inventarios_itens
    FOR DELETE
    USING (true);

