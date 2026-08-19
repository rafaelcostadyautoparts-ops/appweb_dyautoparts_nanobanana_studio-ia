ALTER TABLE public.label_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_select_label_templates ON public.label_templates;

CREATE POLICY allow_select_label_templates
ON public.label_templates
FOR SELECT
USING (ativo = true);
