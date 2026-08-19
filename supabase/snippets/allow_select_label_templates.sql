alter table public.label_templates enable row level security;

drop policy if exists allow_select_label_templates on public.label_templates;

create policy allow_select_label_templates
on public.label_templates
for select
using (true);
