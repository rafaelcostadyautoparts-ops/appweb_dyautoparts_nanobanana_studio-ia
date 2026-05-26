DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'inventarios_itens'
           AND policyname = 'allow_delete'
    ) THEN
        CREATE POLICY allow_delete
            ON public.inventarios_itens
            FOR DELETE
            USING (true);
    END IF;
END $$;

