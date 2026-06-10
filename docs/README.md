# Documentacao DY Auto Parts WMS

Este diretorio contem documentos de apoio do projeto.

## Ordem oficial de leitura para IA

Qualquer IA, desenvolvedor ou ferramenta deve ler primeiro:

1. [`PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md`](./PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md)
2. [`ARCHITECTURE_BOUNDARIES.md`](./ARCHITECTURE_BOUNDARIES.md)
3. [`DATA_SCHEMA.md`](./DATA_SCHEMA.md)
4. [`MODULE_MAP.md`](./MODULE_MAP.md)
5. [`PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md), quando precisar de contexto geral

## Regra de prioridade

Em caso de conflito entre documentos, vale esta ordem:

1. Pedido atual do usuario, desde que nao viole seguranca operacional.
2. `PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md`.
3. `ARCHITECTURE_BOUNDARIES.md`.
4. `DATA_SCHEMA.md`.
5. Codigo real do app.
6. Demais documentos em `docs/`.

## Fonte atual de verdade

- Fonte principal de dados: Supabase.
- Camada de dados: `public/dataClient.js`.
- Frontend principal: `public/app.js`.
- CSS principal: `public/src/index.css`.
- Migrations: `supabase/migrations/*`.

Planilhas externas nao fazem parte da operacao atual. Futuramente, podem existir apenas como backup/exportacao de seguranca derivada do Supabase.

## Documentos legados ou de apoio

Alguns documentos foram criados em fases anteriores do projeto e podem conter termos antigos, como:

- qualquer referencia antiga a planilhas externas como base principal;
- tipos antigos de movimento fora do padrao atual `ENTRADA`, `SAIDA`, `AJUSTE_POSITIVO`, `AJUSTE_NEGATIVO` e `TRANSFERENCIA`;
- exemplos de estrutura modular futura que ainda nao refletem o estado real do app.

Esses documentos servem como historico/contexto, nao como regra final quando houver conflito.

Documentos que devem ser lidos com esse cuidado:

- `AI_CONTEXT.md`
- `API_MAP.md`
- `BUSINESS_RULES.md`
- `CODE_PATTERNS.md`
- `DEVELOPMENT_GUIDELINES.md`
- `PROJECT_RULES.md`
- `PROMPTS.md`
- `SYSTEM_ARCHITECTURE.md`
- `WORKFLOW_RULES.md`

## Regra curta para IA

Antes de alterar o app:

1. Leia `PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md`.
2. Confirme se a mudanca e visual, regra de negocio, Supabase ou fluxo operacional.
3. Se tocar em Supabase, RPC, migration, RLS, estoque, movimentos, separacao, conferencia, inventario, financeiro, fila offline ou service worker, pare e peca confirmacao.
4. Nao crie duplicidade de componentes, funcoes ou CSS.
5. Valide com `node --check public/app.js`, `npm run build` e `npm run lint`.
