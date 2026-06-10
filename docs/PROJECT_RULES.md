# PROJECT_RULES.md

Documento consolidado no padrao atual do projeto.

A regra principal do projeto esta em:

- `docs/PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md`

## Regras atuais

- Supabase e a base principal.
- `public/dataClient.js` e a camada principal de dados.
- Nao alterar estoque, movimentos, inventario, separacao, conferencia, financeiro, RPC, migration, RLS, fila offline ou service worker sem avaliar impacto e pedir confirmacao quando necessario.
- UI deve ser operacional, rapida, responsiva e limpa.
- Nao criar componentes duplicados ou CSS em camadas conflitantes.
- Planilhas externas podem existir futuramente apenas como backup/exportacao, nunca como fonte principal.