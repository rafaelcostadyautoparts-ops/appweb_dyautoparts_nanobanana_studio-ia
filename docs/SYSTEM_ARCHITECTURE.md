# SYSTEM_ARCHITECTURE.md

Arquitetura atual do DY Auto Parts WMS.

## Base atual

- Frontend/PWA: `index.html`, `public/app.js`, `public/src/index.css`.
- Dados: Supabase.
- Camada de dados: `public/dataClient.js`.
- Cliente Supabase: `public/supabaseClient.js`.
- PWA/cache: `public/sw.js`.
- Migrations: `supabase/migrations/*`.
- Build/dev: Vite + `server.ts`.

## Fonte de verdade

Supabase e a fonte principal e unica de verdade operacional.

Planilhas externas nao fazem parte da operacao atual. No futuro, podem ser criadas apenas como backup/exportacao de seguranca, sempre derivadas do Supabase.

## Regras de arquitetura

- Operacoes criticas devem passar por `DataClient` e/ou RPCs autorizadas.
- Nao editar migrations antigas.
- Nao alterar RLS/policies sem autorizacao.
- Nao quebrar PWA/offline/cache.
- Nao criar fonte paralela de dados.