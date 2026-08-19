# AI_CONTEXT.md

Documento substituido pelo padrao atual do projeto.

Leia primeiro:

1. `docs/PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md`
2. `docs/README.md`
3. `PROJECT_CONTEXT.md`
4. `docs/ARCHITECTURE_BOUNDARIES.md`

## Contexto atual

DY Auto Parts WMS e um PWA operacional para estoque, produtos, separacao, conferencia, inventario, movimentos, entrada NF e financeiro.

A base principal e fonte de verdade e o Supabase.

Planilhas externas nao fazem parte da operacao atual. No futuro, podem existir apenas como rotina de backup/exportacao de seguranca, sempre derivada do Supabase e nunca como banco principal.