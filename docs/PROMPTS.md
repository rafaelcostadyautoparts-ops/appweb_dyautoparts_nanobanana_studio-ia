# PROMPTS.md

Prompts devem ser escritos com base no padrao atual:

- `docs/PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md`

## Prompt base recomendado

Antes de alterar o DY Auto Parts WMS, leia `docs/PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md` e respeite:

- Supabase como fonte principal.
- `DataClient` como camada de dados.
- Separacao rapida e normal sem duplicar baixa de estoque.
- Movimentos em maiusculo.
- Reutilizacao de componentes.
- Responsividade oficial.
- Regra de parada obrigatoria para areas sensiveis.

Nao altere Supabase, RPC, migration, RLS, estoque, movimentos, inventario, separacao, conferencia, financeiro, offline ou service worker sem confirmacao quando houver impacto.