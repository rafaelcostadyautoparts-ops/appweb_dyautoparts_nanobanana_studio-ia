# DY AutoParts WMS

PWA operacional para estoque e expedição da DY AutoParts.

## Base Atual

- Frontend principal: `index.html`, `public/app.js`, `public/src/index.css`
- Dados principais: Supabase
- Google Sheets / Apps Script: legado inativo; nao usar como segundo plano para novas funcionalidades
- Deploy: Vercel
- PWA: `public/manifest.json` e `public/sw.js`

## Módulos Ativos

- Produtos
- Kit lâmpadas
- Separação (pick)
- Conferência (pack)
- Movimentos de estoque
- Inventário
- Dashboard de alertas
- Entrada NF
- Financeiro
- Configurações

## Desenvolvimento Local

```bash
npm install
npm run dev
```

Servidor local padrão: `http://localhost:3000`

## Validação

```bash
npm run lint
npm run build
```

## Observações

O código ainda mantém partes legadas de Google Sheets/App Script para compatibilidade histórica. Google Sheets/App Script não deve ser usado como segundo plano de novas rotinas. O Supabase é a fonte principal de verdade; operações críticas de estoque devem passar por `DataClient` e, quando houver escrita em saldo/movimentos, por RPC transacional no Supabase.
