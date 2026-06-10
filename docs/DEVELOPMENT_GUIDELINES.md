# DEVELOPMENT_GUIDELINES.md

Diretrizes atuais de desenvolvimento estao consolidadas em:

- `docs/PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md`
- `docs/README.md`
- `PROJECT_CONTEXT.md`

## Resumo pratico

- Antes de editar, localizar render, funcoes e CSS existentes.
- Reutilizar componentes ja existentes.
- Nao criar `v2`, `v3`, `final`, `novo` como solucao final.
- Separar ajuste visual de regra de negocio.
- Supabase e a base principal.
- Validar com `node --check public/app.js`, `npm run build` e `npm run lint`.