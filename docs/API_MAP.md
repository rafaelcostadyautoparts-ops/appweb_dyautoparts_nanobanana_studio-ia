# API_MAP.md

Documento substituido pelo padrao atual do projeto.

Para integraes e rotas reais, consulte o codigo atual:

- `public/dataClient.js`
- `public/supabaseClient.js`
- `supabase/migrations/*`
- `docs/ARCHITECTURE_BOUNDARIES.md`
- `docs/PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md`

## Regra atual

A base principal e o Supabase.

Novas rotinas devem usar `DataClient`, cliente Supabase ou RPCs autorizadas. Nao criar novas rotinas baseadas em planilhas externas sem pedido explicito.