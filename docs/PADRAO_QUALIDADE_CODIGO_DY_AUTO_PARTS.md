# PADRAO DE QUALIDADE DE CODIGO E UI - DY AUTO PARTS WMS

Este documento e a referencia obrigatoria para qualquer IA, desenvolvedor ou ferramenta que trabalhe no app **DY Auto Parts WMS**.

Objetivo: manter o sistema rapido, limpo, previsivel, bonito, responsivo e seguro para operacao real de estoque, sem acumulo de codigo morto, CSS conflitante ou alteracoes indevidas em regras de negocio.

> Regra de ouro: toda alteracao deve deixar o app mais simples de manter do que estava antes.

---

## 1. Como a IA deve trabalhar neste projeto

Antes de editar qualquer arquivo, a IA deve:

1. Entender o pedido e separar o que e visual do que e regra de negocio.
2. Localizar o render/HTML da tela com `rg`.
3. Localizar as funcoes JavaScript relacionadas.
4. Localizar o CSS desktop e mobile da tela.
5. Identificar regras duplicadas, antigas ou conflitantes.
6. Identificar se existe codigo morto, wrapper sem funcao, classe `v2/v3/final/fix`.
7. Confirmar quais arquivos serao tocados.
8. Fazer a menor mudanca segura.
9. Validar build/check.
10. Informar exatamente o que mudou.

Se o pedido for visual, nao alterar Supabase, backend, migrations, calculos, fluxo offline, leitor, scanner ou regras funcionais.

Se o pedido for regra de negocio, nao alterar layout alem do necessario para expor/usar a regra.

---

## 2. Estrutura real do app hoje

Arquivos principais:

- `public/app.js`: renderizacao das telas, regras de interface, fluxos operacionais e funcoes principais.
- `public/src/index.css`: estilos globais, desktop, mobile, temas e correcoes visuais.
- `public/dataClient.js`: integracao Supabase, cache, sincronizacao e operacoes persistentes.
- `public/supabaseClient.js`: cliente Supabase.
- `public/sw.js`: service worker/PWA.
- `server.ts`: servidor local/dev.
- `supabase/migrations/*`: migrations do banco.
- `docs/*`: documentacao tecnica e regras do projeto.

Como o app ainda possui arquivos grandes, a IA deve ser ainda mais cuidadosa:

- nunca duplicar funcao se ja existe uma parecida;
- nunca criar outra camada de CSS sem procurar a camada anterior;
- preferir refatoracao pequena e segura;
- quando encontrar excesso de codigo, limpar somente o escopo afetado.

---

## 3. Arquivos e areas protegidas

Nao alterar sem pedido explicito:

- `supabase/migrations/*`
- RPCs Supabase
- RLS/policies
- service worker `public/sw.js`
- schema/tabelas
- dados historicos
- calculos de estoque
- fluxo offline/IndexedDB
- scanner/camera/leitor
- regras de separacao, conferencia, inventario e movimentos

Quando for necessario criar migration:

- criar uma migration nova;
- nunca editar migration antiga;
- nao alterar dados historicos sem autorizacao;
- nao alterar RLS/policies sem autorizacao;
- explicar o nome da migration criada.

---

## 4. Regras de negocio que nao podem ser quebradas

### 4.1 Identificacao de produto

O identificador principal do produto e `id_interno`.

EAN e SKU ajudam na busca/bipagem, mas nao substituem `id_interno`.

Multiplos produtos podem compartilhar EAN. Portanto, nunca assumir que EAN e chave unica.

### 4.2 Movimentos de estoque

Todos os novos movimentos devem usar `tipo` e `origem` em maiusculo.

Tipos permitidos:

- `ENTRADA`
- `SAIDA`
- `AJUSTE_POSITIVO`
- `AJUSTE_NEGATIVO`
- `TRANSFERENCIA`

Origens permitidas:

- `APP_INVENTARIO`
- `APP_SEPARACAO`
- `APP_CONFERENCIA`
- `APP_COMPRAS`
- `IMPORTACAO`
- `MANUAL`

Quantidade em movimento deve ser sempre positiva. A direcao vem de `tipo`.

Errado:

```js
tipo = 'saida'
origem = 'separacao'
quantidade = -3
```

Correto:

```js
tipo = 'SAIDA'
origem = 'APP_SEPARACAO'
quantidade = 3
```

Antes de inserir movimento, normalizar defensivamente:

```js
tipo = String(tipo || '').trim().toUpperCase()
origem = String(origem || '').trim().toUpperCase()
```

### 4.3 Separacao rapida x separacao normal

Existem dois fluxos:

**Separacao rapida**

- Nao passa por conferencia.
- A baixa do estoque acontece ao finalizar a separacao.
- Movimento correto:

```text
tipo = SAIDA
origem = APP_SEPARACAO
```

**Separacao normal**

- Apenas prepara o pedido.
- Nao deve gerar movimento de saida na separacao.
- A baixa acontece somente ao finalizar a conferencia.
- Movimento correto:

```text
tipo = SAIDA
origem = APP_CONFERENCIA
```

Regra principal: gravar `SAIDA` somente no momento real da baixa. Nunca duplicar saida na separacao normal e depois na conferencia.

### 4.4 Conferencia

Se a conferencia usa RPC `finalizar_conferencia`, nao alterar a RPC sem autorizacao.

Quando autorizado, padronizar apenas o que foi pedido. Exemplo ja definido:

```text
tipo = SAIDA
origem = APP_CONFERENCIA
```

Nao alterar calculo, status, itens ou baixa de estoque sem pedido claro.

### 4.5 Inventario

Ao finalizar inventario, a contagem fisica e a fonte de verdade do saldo fisico.

Para cada item de `inventarios_itens`:

1. Normalizar `local` para o padrao de `estoque_atual`.
2. Procurar `estoque_atual` por `id_interno + local`.
3. Se existir, atualizar:
   - `saldo_disponivel = saldo_fisico`
   - `saldo_total = saldo_fisico`
   - `atualizado_em = now`
4. Se nao existir, criar:
   - `id_interno`
   - `local`
   - `saldo_disponivel = saldo_fisico`
   - `saldo_reservado = 0`
   - `saldo_em_transito = 0`
   - `saldo_total = saldo_fisico`
5. Nao depender de movimento anterior para criar `estoque_atual`.
6. Nao preencher manualmente `chave_estoque` se o Supabase ja possui trigger.

Movimentos de ajuste de inventario:

- Sobra: `AJUSTE_POSITIVO` + `APP_INVENTARIO`
- Falta: `AJUSTE_NEGATIVO` + `APP_INVENTARIO`

### 4.6 Entrada, devolucao e ajuste manual

Entradas futuras:

```text
tipo = ENTRADA
origem = APP_COMPRAS ou MANUAL
```

Ajustes manuais:

```text
tipo = AJUSTE_POSITIVO ou AJUSTE_NEGATIVO
origem = MANUAL
```

Devolucoes devem ser tratadas como processo rastreavel. Antes de implementar devolucao, definir:

- motivo da devolucao;
- origem da venda/separacao;
- local de entrada;
- condicao do produto;
- se volta para disponivel, mostruario, garantia, defeito ou quarentena;
- movimento gerado;
- observacao/referencia.

Nao criar fluxo de devolucao improvisado dentro de movimentacoes sem mapear esses campos.

---

## 5. Padrao visual do app

O app deve parecer um WMS premium, operacional e rapido.

Paleta base:

- Vermelho DY: `#d50000`
- Fundo escuro principal: `#070b12`
- Card escuro: `#151922`
- Preto/ink: `#0f172a`
- Branco: `#ffffff`
- Texto claro: `#f8fafc`
- Texto escuro: `#111827`
- Texto secundario escuro: `#64748b`
- Texto secundario claro: `rgba(248,250,252,.68)`
- Borda clara: `rgba(15,23,42,.10)`
- Borda escura: `rgba(255,255,255,.08)` a `rgba(255,255,255,.14)`

Cores semanticas permitidas:

- Verde estoque/sucesso: `#16a34a`, `#22c55e`
- Amarelo/alerta/id: `#facc15`, `#f59e0b`
- Azul informativo: `#3b82f6`, `#38bdf8`
- Roxo movimentos/transferencia: `#8b5cf6`
- Laranja inventario/atencao: `#f97316`
- Ciano conferencia: `#14b8a6`

Regra de cor:

- Preto, branco e vermelho sao a identidade.
- Verde, amarelo, azul, roxo e laranja podem ser usados para significado operacional.
- Nao usar cor decorativa sem funcao.
- Nao transformar a tela em carnaval. Use cor para guiar decisao.

Exemplos bons:

- estoque positivo em verde;
- preco/alerta comercial em vermelho;
- ID em badge amarelo;
- separacao em azul;
- conferencia em ciano/verde;
- inventario em laranja;
- transferencia em roxo.

---

## 6. Tipografia

Fontes oficiais do app:

- Titulos e numeros fortes: `Fjalla One`
- Textos principais e botoes: `Oswald`
- Metadados, EAN, SKU, pequenos detalhes: `PT Sans Narrow`

Regras:

- nao usar fonte aleatoria;
- nao usar `letter-spacing` negativo;
- nao escalar fonte com `vw` sem limite;
- usar `clamp()` quando precisar responder a telas pequenas;
- limitar titulos em cards a 2 linhas quando necessario;
- nunca deixar texto cortar dentro de botao/campo.

---

## 7. Icones

O app usa `material-symbols-rounded` com fallback SVG em `public/app.js`.

Regras:

- preferir icones existentes no fallback antes de criar novos;
- se criar novo icone, adicionar fallback SVG em `MATERIAL_ICON_FALLBACKS`;
- icone precisa ter significado operacional;
- icone em botao mobile deve ter area de toque minima de 44px;
- nao usar icone `add` ou `+` para preco se o significado for etiqueta/preco;
- preco deve usar `sell` ou equivalente;
- estoque deve usar `inventory_2`, `package_2` ou equivalente.

---

## 8. Layout desktop

Desktop deve ser denso, limpo e facil de escanear.

Padroes:

- usar largura disponivel;
- evitar hero/landing quando a tela e ferramenta operacional;
- cards devem ser para itens repetidos, modais ou blocos funcionais;
- nao colocar card dentro de card sem necessidade real;
- divisorias verticais suaves podem separar informacoes;
- usar alinhamento consistente;
- valores financeiros e numericos devem ficar alinhados a direita quando em tabelas/listagens.

Busca/listagem desktop de produtos:

- imagem do produto a esquerda;
- ID interno em badge;
- descricao forte;
- EAN/SKU/COR em badges;
- marca destacada;
- estoque em bloco verde claro;
- preco em bloco vermelho/rosa claro;
- bolinha de status fora do bloco de preco.

---

## 9. Layout mobile

Mobile e para operacao com uma mao, bipagem e velocidade.

Testar obrigatoriamente:

- 360 x 640
- 375 x 667
- 390 x 844
- 412 x 915
- 430 x 932

Nao pode ter:

- scroll horizontal;
- texto cortado;
- campo esmagado;
- botao menor que 44px;
- card dentro de card;
- sobreposicao incoerente;
- excesso de espaco vazio;
- wrapper transparente escondendo problema;
- desktop quebrado para corrigir mobile.

### Busca mobile de produtos

Padrao:

```text
[voltar]
[campo de busca________________] [camera]
[filtro] [limpar] [caixa + numero]
```

Campo:

- altura aproximada: 54px;
- camera: 52px;
- lupa pequena;
- placeholder visivel: `Buscar produto, ID, EAN ou SKU`;
- fundo escuro no tema escuro;
- borda sutil.

Card mobile de produto:

```text
DY-000.126
FITA LED DRL RGB APP

EAN: 789...
SKU: MO-2243
MARCA: MAFREET - COR: RGB

        ESTOQUE
        25
        TERREO
```

Prioridade visual:

1. ID interno
2. Nome do produto
3. Estoque
4. Local
5. EAN/SKU/marca/cor

No mobile, filtros devem abrir modal/bottom-sheet. Nao deixar painel lateral fixo ocupando espaco.

---

## 10. Temas claro e escuro

Toda tela importante deve funcionar em tema claro e escuro.

Regras:

- texto branco em fundo branco e erro grave;
- texto escuro em fundo escuro e erro grave;
- todo card precisa ter contraste suficiente;
- botao primario precisa parecer clicavel;
- botoes destrutivos devem usar vermelho;
- informacoes secundarias podem usar cinza, mas precisam ser legiveis;
- nao usar opacidade tao baixa que suma no mobile.

Quando uma tela especifica for operacional escura no mobile, isso deve estar documentado e escopado na classe da tela.

---

## 11. CSS limpo

Regra principal: nao resolver problema criando camada infinita.

Proibido deixar como solucao final:

- `.v2`, `.v3`, `.v4`, `.final`, `.fix`, `.override`, `.new-layout`;
- varias media queries corrigindo a mesma tela;
- wrappers transparentes para esconder card dentro de card;
- `z-index` alto para cobrir erro de layout;
- `display:none` para esconder elemento antigo que deveria ser removido do render;
- CSS global afetando telas nao relacionadas.

Permitido:

- usar `display:none` para esconder painel desktop em mobile quando o painel realmente existe so para desktop;
- criar classe de escopo da tela, como `.product-search-screen`;
- criar uma unica secao final de CSS para uma tela, desde que remova as camadas antigas conflitantes;
- usar `!important` somente quando o arquivo legado exigir, e sempre com escopo forte.

Antes de adicionar CSS:

1. procurar a classe;
2. procurar media queries existentes;
3. remover duplicidade quando seguro;
4. editar o bloco dono;
5. validar desktop e mobile.

Nome recomendado para secao:

```css
/* Product search mobile cleanup: single source for mobile search layout. */
```

Evitar:

```css
/* Product Search V7 Final */
```

---

## 12. JavaScript limpo

Funcoes devem ter responsabilidade clara.

Preferir:

- funcoes pequenas;
- nomes descritivos;
- helpers reutilizaveis;
- normalizadores centralizados;
- formatadores centralizados;
- early return;
- poucas variaveis globais novas.

Evitar:

- duplicar funcao parecida;
- colocar regra de negocio dentro de HTML string sem necessidade;
- misturar render, calculo, persistencia e side-effect na mesma funcao;
- criar `setTimeout` como gambiarra de fluxo;
- depender de texto visual para regra de negocio;
- parse manual de moeda.

Formatacao monetaria obrigatoria:

```js
function formatCurrency(value) {
  const number = Number(value || 0);

  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
```

Nunca usar para dinheiro:

- `parseInt()`;
- `replace('.', '')`;
- remocao manual de separadores;
- conversao que elimine casas decimais.

---

## 13. Supabase e DataClient

`public/dataClient.js` e area sensivel.

Supabase e a base principal e fonte de verdade operacional do projeto.

Planilhas externas nao fazem parte da operacao atual. Futuramente, podem existir apenas como rotina de backup/exportacao de seguranca, sempre derivada do Supabase e nunca como banco principal, fallback operacional ou segunda fonte de verdade.

Antes de alterar:

- procurar funcao existente;
- entender cache/invalidate;
- verificar tabelas afetadas;
- verificar offline;
- verificar se existe RPC;
- verificar migrations relacionadas.

Regras:

- nao alterar nome de tabela;
- nao alterar schema sem autorizacao;
- nao alterar RLS/policies sem autorizacao;
- nao alterar dados antigos;
- nao editar migrations antigas;
- nao duplicar insert de movimentos;
- sempre invalidar cache correto apos escrita;
- registrar observacao/referencia quando movimento vier de processo.

---

## 14. Performance

O app e usado em estoque. Prioridade: velocidade.

Evitar:

- bibliotecas pesadas;
- animacoes excessivas;
- renders gigantes sem necessidade;
- busca que trava digitação;
- consultas repetidas ao Supabase;
- loops caros em cada tecla sem debounce;
- imagens sem tamanho/limite.

Preferir:

- JavaScript simples;
- cache local;
- debounce em busca;
- carregamento sob demanda por modulo;
- DOM menor no mobile;
- imagens com `loading="lazy"` quando aplicavel;
- CSS escopado.

---

## 15. Acessibilidade operacional

Nao e app decorativo; e ferramenta de trabalho.

Obrigatorio:

- botoes com `aria-label` quando forem so icone;
- area de toque minima de 44px;
- foco visivel para teclado quando aplicavel;
- contraste bom;
- feedback visual claro de erro/sucesso;
- mensagens objetivas;
- nao depender apenas de cor para indicar estado critico.

---

## 16. PWA, offline e sincronizacao

Nao quebrar:

- service worker;
- cache;
- IndexedDB;
- fila offline;
- fallback de icones;
- fluxo de sincronizacao.

Se alterar fluxo que grava dados:

- pensar no modo offline;
- validar se a operacao pode ir para fila;
- nao finalizar processos criticos offline se ja existe bloqueio para isso;
- manter mensagens claras ao usuario.

---

## 17. Checklist antes de finalizar uma alteracao

Executar quando aplicavel:

```bash
node --check public/app.js
npm run build
npm run lint
```

Validar visualmente quando for UI:

- mobile 360px;
- mobile 375px;
- mobile 390px;
- mobile 412px;
- desktop;
- tema claro;
- tema escuro.

Conferir:

- nao houve scroll horizontal;
- nao houve texto cortado;
- nao houve card dentro de card;
- desktop nao quebrou;
- regras de negocio nao foram alteradas;
- Supabase nao foi tocado sem necessidade;
- migrations antigas nao foram editadas;
- codigo antigo conflitante foi removido quando seguro.

---

## 18. Padrao de resposta final da IA

Ao finalizar, informar:

- arquivos alterados;
- o que mudou;
- o que foi preservado;
- codigo antigo removido ou consolidado;
- validacoes executadas;
- limitacoes, se alguma validacao visual nao foi possivel.

Exemplo:

```text
Alterei somente public/src/index.css e public/app.js.
O ajuste ficou restrito ao mobile da busca de produtos.
Nao alterei Supabase, scanner, busca ou filtros.
Removi camadas antigas conflitantes e deixei um unico bloco mobile.
Build e lint passaram.
```

---

## 19. Sinais de que a solucao nao esta pronta

A solucao deve ser revista se:

- aumentou muito o CSS sem remover nada;
- criou mais uma classe `v4/final/novo`;
- precisou esconder muitos elementos antigos;
- depende de `z-index` alto;
- quebrou contraste em tema claro ou escuro;
- duplicou funcao existente;
- mudou regra de negocio sem pedido;
- criou movimento duplicado;
- gravou `saida`, `separacao` ou `conferencia` em minusculo;
- criou separacao/conferencia fora do fluxo correto;
- alterou migration antiga;
- nao rodou build/check.

---

## 20. Regra final

O padrao esperado para o DY Auto Parts WMS e:

- visual premium;
- operacao rapida;
- codigo limpo;
- regras de negocio protegidas;
- CSS com dono claro;
- mobile realmente usavel;
- desktop preservado;
- Supabase tratado com cuidado;
- historico de estoque auditavel.

Se a IA nao tiver certeza se pode alterar uma regra de negocio, migration, RPC ou dado historico, deve parar e pedir confirmacao antes de mexer.

---

## 21. Componentes reutilizaveis

O app ja possui padroes consolidados. Antes de criar qualquer componente novo, a IA deve verificar se ja existe componente semelhante no projeto.

Componentes prioritarios para reutilizacao:

- botao voltar;
- botao scanner/camera;
- modal;
- bottom sheet;
- card;
- badge;
- chip;
- campo de busca;
- card de produto;
- card de inventario;
- card de separacao;
- card de conferencia.

Regra:

- se ja existir um componente funcional, adaptar ou reutilizar;
- se precisar criar uma variacao, ela deve ter motivo claro e escopo definido;
- se a variacao substituir a antiga, remover a antiga quando for seguro;
- nao criar segunda versao so para resolver um problema visual local.

Proibido como solucao final:

```text
BackButtonV2
SearchCardFinal
ProductCardNew
ModalNovo
CardAjustadoFinal
```

Nomes aceitaveis devem descrever funcao ou contexto real:

```text
product-search-card
inventory-summary-card
conference-item-card
mobile-filter-sheet
```

---

## 22. Responsividade oficial do projeto

Toda alteracao visual deve ser validada nos perfis de dispositivo usados como referencia do projeto.

Perfis obrigatorios:

- Samsung Galaxy S20 Ultra;
- Galaxy S21;
- iPhone 17 Pro Max;
- Motorola Razr+;
- Nexus 7;
- Galaxy S24 Ultra.

Tambem manter os tamanhos base:

- 360 x 640;
- 375 x 667;
- 390 x 844;
- 412 x 915;
- 430 x 932.

Criterios de aceite:

- sem scroll horizontal;
- sem texto cortado;
- sem botoes cortados;
- sem sobreposicao;
- sem card quebrado;
- sem campos esmagados;
- sem informacao principal escondida;
- sem diferenca grave entre tema claro e escuro.

Nao considerar a tarefa visual concluida sem validar esses perfis ou informar claramente que a validacao visual nao foi possivel no ambiente atual.

---

## 23. Hierarquia visual operacional

O app e uma ferramenta operacional, nao uma vitrine.

Toda tela deve obedecer esta prioridade:

1. Acao principal.
2. Informacao principal.
3. Resultado.
4. Acoes secundarias.
5. Informacoes auxiliares.

Exemplo em busca de produtos:

```text
Campo de busca
Scanner/camera
Quantidade encontrada
Lista de produtos
Filtros
```

Exemplo em separacao:

```text
Produto atual
Quantidade/bipagem
Status do item
Lista pendente/concluida
Acoes secundarias
```

Exemplo em inventario:

```text
Local/produto
Quantidade contada
Diferenca
Valor/impacto
Historico/acoes secundarias
```

Nunca inverter a prioridade visual deixando filtro, decoracao, texto explicativo ou metadado acima da acao principal.

---

## 24. Auditoria e rastreabilidade

Toda alteracao que mexer em areas sensiveis deve preservar rastreabilidade.

Areas sensiveis:

- estoque;
- inventario;
- separacao;
- conferencia;
- entrada NF;
- financeiro;
- movimentos;
- devolucao;
- ajuste manual.

Antes de alterar qualquer uma dessas areas, a IA deve responder:

- quem executou?
- quando executou?
- qual origem?
- qual referencia?
- qual observacao explica o processo?

Nunca remover sem autorizacao explicita:

- `criado_em`;
- `atualizado_em`;
- `auditado_por`;
- `usuario`;
- `origem`;
- `referencia`;
- `referencia_id`;
- `observacao`;
- `inventario_id`;
- `separacao_id`;
- `conferencia_id`;
- qualquer campo equivalente de rastreio.

Movimentos devem manter observacao/referencia do processo gerador sempre que existir.

Exemplos:

```text
Inventario: INV-INI-20260520-001
Separacao: Baixa automatica da separacao rapida
Conferencia: Finalizacao da conferencia SEP-MERCADO-0206-01
```

A IA nunca deve remover rastreabilidade existente para simplificar layout, payload ou query.

---

## 25. Regra de parada obrigatoria

Esta e uma regra de seguranca operacional.

Se a IA identificar que a alteracao pode impactar qualquer item abaixo, deve parar e pedir confirmacao antes de continuar:

- Supabase;
- RPC;
- migration;
- RLS/policies;
- estoque;
- movimentos;
- separacao;
- conferencia;
- inventario;
- financeiro;
- entrada NF;
- fila offline;
- IndexedDB;
- service worker;
- dados historicos;
- calculo de saldo;
- auditoria/rastreabilidade.

Mensagem esperada:

```text
Identifiquei que a alteracao solicitada exige modificar uma RPC do Supabase.
Deseja que eu prossiga?
```

Ou:

```text
Identifiquei que esse ajuste pode impactar a baixa de estoque.
Antes de alterar, confirma que devo modificar essa regra?
```

Proibido assumir autorizacao.

Se o usuario autorizar, a IA deve:

1. explicar o escopo;
2. alterar somente o necessario;
3. nao mexer em dados antigos sem autorizacao separada;
4. validar;
5. relatar exatamente o que foi alterado.
