# BUSINESS_RULES.md

Documento consolidado no padrao atual do projeto.

As regras de negocio oficiais estao em:

- `docs/PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md`
- `docs/ARCHITECTURE_BOUNDARIES.md`
- `PROJECT_CONTEXT.md`

## Regras atuais essenciais

- Produto e identificado por `id_interno`.
- Supabase e a fonte principal de dados.
- Movimentos novos devem gravar `tipo` e `origem` em maiusculo.
- Quantidade em movimento deve ser positiva.
- Separacao rapida baixa estoque na separacao.
- Separacao normal baixa estoque somente na conferencia.
- Inventario finalizado reflete a contagem fisica em `estoque_atual`.
- Nao alterar RPC, migration, RLS, estoque ou dados historicos sem autorizacao.