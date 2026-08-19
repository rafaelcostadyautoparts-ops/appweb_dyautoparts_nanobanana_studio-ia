# WORKFLOW_RULES.md

Documento consolidado no padrao atual do projeto.

Fluxos oficiais devem seguir:

- `docs/PADRAO_QUALIDADE_CODIGO_DY_AUTO_PARTS.md`
- `PROJECT_CONTEXT.md`
- `docs/ARCHITECTURE_BOUNDARIES.md`

## Fluxos atuais principais

### Separacao rapida

- Nao passa por conferencia.
- Baixa estoque ao finalizar separacao.
- Movimento: `tipo = SAIDA`, `origem = APP_SEPARACAO`.

### Separacao normal

- Prepara pedido.
- Nao baixa estoque na separacao.
- Baixa estoque apenas ao finalizar conferencia.
- Movimento: `tipo = SAIDA`, `origem = APP_CONFERENCIA`.

### Inventario

- Contagem fisica e fonte de verdade ao finalizar.
- Ajuste positivo: `AJUSTE_POSITIVO` + `APP_INVENTARIO`.
- Ajuste negativo: `AJUSTE_NEGATIVO` + `APP_INVENTARIO`.

### Entrada NF / compra

- Entrada futura deve usar `ENTRADA` + `APP_COMPRAS`.

### Ajustes manuais

- Usar `AJUSTE_POSITIVO` ou `AJUSTE_NEGATIVO` + `MANUAL`.