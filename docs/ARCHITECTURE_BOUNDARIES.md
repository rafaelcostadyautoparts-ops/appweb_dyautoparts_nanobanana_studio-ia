# Fronteiras de arquitetura

Este projeto deve crescer com fronteiras claras entre tela, dados e regra critica.

## Fonte de verdade

- Supabase e a fonte principal de verdade.
- Google Sheets/App Script e legado inativo e nao deve ser usado como segundo plano para novas rotinas.
- `localStorage`, IndexedDB e service worker servem para estado temporario, fila offline ou cache, nunca para sobrescrever dados confirmados no Supabase.

## Regra para novas funcionalidades

1. Tela e interacao ficam no modulo de UI.
2. Acesso a dados passa por `DataClient`.
3. Operacoes criticas de estoque passam por RPC transacional no Supabase.
4. O frontend nao deve fazer sequencias manuais de saldo como `select -> update origem -> update destino -> insert movimento`.

## Padrao para estoque

Operacoes que alteram estoque devem ser atomicas:

- validar saldo;
- atualizar `estoque_atual`;
- registrar `movimentos`;
- retornar resumo da operacao;
- falhar sem gravacao parcial se qualquer etapa der erro.

Exemplos de operacoes que devem seguir esse padrao:

- conferencia finalizada;
- transferencia;
- ajuste;
- garantia;
- entrada de NF;
- fechamento de inventario.

## Padrao atual aplicado

- `finalizar_conferencia`: RPC transacional existente.
- `transferir_estoque`: RPC transacional para transferencia manual.

## Proximas fronteiras recomendadas

- `ajustar_estoque`
- `enviar_garantia`
- `finalizar_inventario`
- `confirmar_entrada_nf`
