DO $$
BEGIN
    CREATE POLICY "allow_select_separacao"
    ON public.separacao
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "allow_insert_separacao"
    ON public.separacao
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "allow_update_separacao"
    ON public.separacao
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "allow_select_separacao_itens"
    ON public.separacao_itens
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "allow_insert_separacao_itens"
    ON public.separacao_itens
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "allow_update_separacao_itens"
    ON public.separacao_itens
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
