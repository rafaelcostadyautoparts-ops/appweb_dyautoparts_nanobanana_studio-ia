# PROJECT_CONTEXT.md

## 1. Visao Geral do Projeto

O projeto DY Auto Parts e um app/PWA ERP para autopecas, usado na operacao interna da loja.

Ele concentra rotinas de consulta, cadastro, estoque, separacao, conferencia, inventario, movimentacoes, entrada de nota fiscal e futuras rotinas financeiras.

O app deve continuar com foco operacional: rapido, direto, responsivo e facil de usar em desktop e celular.

## 2. Objetivo Principal

O objetivo principal e centralizar a operacao diaria da DY Auto Parts:

- Controle de produtos.
- Controle de estoque por local.
- Busca rapida por produto.
- Separacao de pedidos.
- Conferencia por leitura de codigo de barras.
- Inventario inicial, parcial e geral.
- Movimentacoes de entrada, saida, ajuste e transferencia.
- Entrada de nota fiscal.
- Futuramente, controle financeiro.

## 3. Tecnologias Utilizadas

- Frontend PWA.
- Vite.
- JavaScript, CSS e HTML.
- Supabase como banco principal.
- Google Sheets como base secundaria, backup ou legado.
- Service Worker para cache/offline.

## 4. Estrutura Geral do Projeto

Arquivos e pastas principais:

- `index.html`: ponto de entrada do app, carrega CSS, scripts, manifest e arquivos publicos.
- `public/app.js`: arquivo principal do app, com telas, fluxos, navegacao e logica de interface.
- `public/dataClient.js`: camada de acesso a dados, com rotas para Supabase e fallback legado.
- `public/supabaseClient.js`: inicializacao do cliente Supabase e helpers de storage.
- `public/sw.js`: service worker manual do PWA para cache e atualizacao.
- `public/src/index.css`: estilos principais do app, incluindo login, menu, telas internas e responsividade.
- `dist/`: saida gerada pelo build. Nao editar manualmente.
- `package.json`: scripts e dependencias do projeto.

## 5. Regra Principal de Dados

Supabase e a fonte principal de dados do projeto.

Regras importantes:

- Google Sheets nao deve sobrescrever dados do Supabase.
- Google Sheets deve ser tratado como legado, apoio ou backup.
- `localStorage` e caches locais devem ser usados apenas como fallback emergencial ou estado temporario.
- Quando Supabase estiver disponivel, evitar usar dados antigos em cache.
- Toda alteracao relevante de dados deve respeitar o Supabase como fonte principal.

## 6. Fonte de Verdade e Cache

Supabase e o SSOT, ou seja, a fonte unica principal de verdade do app.

Regras:

- `localStorage`, cache do navegador e service worker nunca devem prevalecer sobre Supabase quando Supabase responder corretamente.
- Cache local deve ser tratado como otimizacao, fallback emergencial ou estado temporario.
- Se alterar `public/app.js`, `public/dataClient.js` ou `public/sw.js`, verificar risco de dado antigo em cache.
- Sempre considerar versionamento do service worker quando alterar arquivos publicos criticos.
- Evitar que dados legados do Google Sheets sobrescrevam registros atuais vindos do Supabase.

## 7. Modulos do App

### Login / Selecao de Usuario

Tela inicial com cards de usuarios.

Regras da tela:

- Deve ser responsiva.
- Deve evitar scroll desnecessario.
- No mobile, os usuarios devem aparecer em 2 colunas.
- Os cards devem permanecer centralizados e bem encaixados na viewport.

### Menu Principal

Menu com cards grandes, icones 3D e labels em maiusculo.

Regras:

- Layout responsivo para desktop e mobile.
- Cards devem manter o padrao visual existente.
- O menu deve favorecer acesso rapido aos modulos principais.

### Produtos

Modulo de busca e gestao de produtos.

A busca deve considerar:

- Nome.
- Descricao.
- EAN.
- ID interno.
- SKU.
- Marca.
- Categoria.
- Subcategoria.
- Atributos.

Regras da busca:

- Deve ser rapida.
- Deve usar dados locais apos o carregamento inicial.
- Deve usar debounce para evitar processamento excessivo.

### Detalhes do Produto

Tela de detalhe do produto.

Deve exibir:

- Imagem.
- Descricao.
- Marca.
- ID interno.
- EAN.
- Precos.
- Estoque por local.
- Manual PDF, quando existir URL valida.
- Produtos equivalentes, quando houver.

### Estoque

Locais de estoque:

- `terreo`
- `mostruario`
- `primeiro_andar`
- `defeito`
- `em_garantia`
- `em_transporte`

Disponivel para venda:

- `terreo`
- `mostruario`
- `primeiro_andar`

Nao vendavel:

- `defeito`
- `em_garantia`
- `em_transporte`

Regra operacional:

- `terreo` e `mostruario` podem vender direto.
- `primeiro_andar` conta como disponivel, mas exige transferencia antes da venda.
- Se o produto tiver estoque apenas em `primeiro_andar`, avisar que precisa transferir para vender.
- `defeito`, `em_garantia` e `em_transporte` nao contam como disponivel para venda.
- `em_transporte` representa compra ou pedido que ainda nao chegou fisicamente.

### Separacao

Fluxo de separacao por canal, pedido e produto.

O modulo deve apoiar a operacao de coleta de itens antes da conferencia.

### Conferencia

Fluxo de conferencia com leitura de codigo de barras.

Deve validar itens separados, quantidades e divergencias antes da conclusao.

### Inventario

Modulo de contagem de estoque.

Tipos esperados:

- Inventario inicial.
- Inventario parcial.
- Inventario geral.

### Movimentacoes

Modulo para:

- Entradas.
- Saidas.
- Ajustes.
- Transferencias.
- Historico.

Toda movimentacao deve preservar rastreabilidade operacional.

### Entrada de Nota Fiscal

Modulo futuro ou parcialmente implementado para:

- Recebimento por XML.
- Entrada manual de nota.
- Entrada de produtos.
- Atualizacao de estoque.

Regra futura:

- Ao registrar entrada de NF, itens podem sair de `em_transporte` e entrar no `terreo` por padrao.
- Transferencias posteriores podem mover estoque para `primeiro_andar` ou outros locais.

### Financeiro

Modulo futuro ou placeholder para:

- Contas a pagar.
- Contas a receber.
- Visao financeira operacional.

### Configuracoes

Modulo para configuracoes visuais e operacionais.

Inclui:

- Modo rapido.
- Parametros operacionais.
- Configuracoes de visual.

### Modo Rapido

Modo rapido e uma configuracao operacional.

Regras:

- Quando ativo, o fluxo pode pular separacao e ir direto para conferencia.
- O app deve indicar visualmente quando o modo rapido estiver ativo.
- Nao remover separacao; apenas respeitar a configuracao ativa.
- Fluxos normais devem continuar disponiveis quando o modo rapido estiver desligado.

## 8. Regras de Busca de Produtos

Regras:

- Busca exata por EAN ou `id_interno` deve abrir direto o detalhe do produto.
- Busca textual deve priorizar:
  1. Comeco da `descricao_base` ou `descricao_completa`.
  2. Correspondencia parcial na descricao.
  3. Marca, categoria e subcategoria.
  4. SKU, EAN, ID e atributos.
- Usar normalizacao sem acentos, lowercase e trim.
- Manter debounce aproximado de 250ms a 300ms.
- Evitar busca direta no Supabase a cada tecla quando os produtos ja estiverem carregados.

## 9. Regras de UX/UI

Regras gerais:

- Desktop e mobile devem funcionar bem.
- Telas internas preferem visual fullscreen.
- Mobile deve evitar rolagem desnecessaria.
- Cards devem manter o padrao visual existente.
- Texto dentro dos cards deve ser preto quando o fundo for claro.
- Icones devem manter o padrao 3D.
- Header e footer nao devem quebrar telas internas.
- Botao voltar deve aparecer nas telas internas.
- Botao sair deve aparecer corretamente no topo/login conforme o padrao existente.
- Evitar mudancas amplas de design quando a tarefa for funcional ou cirurgica.

## 10. Padrao de Telas Internas

Regras:

- Telas internas devem manter header/footer quando aplicavel.
- Telas fullscreen devem ter botao voltar flutuante no canto superior esquerdo.
- Evitar botao X duplicado quando ja existir botao voltar ou sair.
- Desktop e mobile devem seguir o mesmo padrao visual, apenas adaptando medidas.
- Header/footer nao devem criar scroll, sobreposicao ou perda de area util.

## 11. Regras de Produto

Campos e convencoes:

- `descricao_base`: lowercase, sem acentos, sem marca, usando underline para simbolos.
- `descricao_completa`: com acentos, marca e descricao comercial.
- `atributos`: JSONB, lowercase, sem acentos, com `nome`, `valor` e `ordem`.
- `id_interno`: obrigatorio.
- `url_pdf_manual`: so deve aparecer se for URL valida.

## 12. Regras de Produtos Equivalentes

Prioridade maxima:

- Atributo `codigo_equivalente`.

Regras:

- Se existir `codigo_equivalente`, agrupar por ele.
- Se nao existir, comparar `descricao_base`, categoria, subcategoria e atributos tecnicos.
- Nao agrupar apenas por `descricao_base` se faltarem atributos tecnicos.
- Evitar equivalencias fracas que possam misturar produtos diferentes.

## 13. Regras de Performance

Regras importantes:

- Evitar buscas diretas repetidas no Supabase a cada tecla.
- Carregar produtos uma vez.
- Indexar em memoria.
- Buscar localmente apos o carregamento.
- Usar debounce.
- Cuidar de performance em mobile e consumo de bateria.
- Evitar renderizacoes pesadas em loops longos.

## 14. Fluxo de Alteracao Seguro

Antes de alterar codigo:

- Identificar exatamente quais arquivos serao afetados.
- Preferir mudancas pequenas e isoladas.
- Nao fazer refatoracao ampla junto com correcao visual.
- Nao misturar correcao de layout com alteracao de dados.
- Preservar nomes de funcoes existentes quando possivel.
- Evitar alterar fluxos que nao fazem parte do pedido.
- Separar limpeza estrutural, correcao visual e mudanca funcional em etapas diferentes.

## 15. Convencoes de Codigo

Regras:

- Evitar duplicar funcoes.
- Evitar criar CSS global agressivo sem escopo.
- Preferir classes especificas por tela ou modulo.
- Nao usar estilos inline quando existir padrao global reutilizavel.
- Nao editar `dist/` manualmente; alterar fonte e gerar build.
- Manter nomes existentes quando isso reduzir risco de regressao.
- Usar comentarios apenas quando ajudarem a explicar regra de negocio ou bloco complexo.

## 16. Cuidados Antes de Alterar Codigo

Regras para Codex, IA ou desenvolvedor:

- Ler este arquivo antes de alterar o projeto.
- Fazer mudancas cirurgicas.
- Nao alterar modulos que nao foram solicitados.
- Preservar Supabase como fonte principal.
- Nao quebrar fallback legado.
- Nao alterar service worker sem necessidade.
- Nao criar pastas duplicadas.
- Nao mexer no `dist/` manualmente se o projeto usa build.
- Rodar `npm run build` apos alteracoes.
- Informar arquivos alterados e resumo do que foi feito.

## 17. Checklist Apos Alteracoes

Antes de entregar uma alteracao, verificar:

- `npm run build` passou?
- Desktop foi testado?
- Mobile foi testado?
- Login continua funcionando?
- Busca de produto continua funcionando?
- Supabase continua carregando?
- Nao apareceu dado antigo de cache?
- Nao criou scroll indevido?
- Nao quebrou header/footer?
- Nao quebrou botao voltar/sair?

Checklist extra:

- Console do navegador foi verificado?
- Nao houve erro de JavaScript?
- Mobile nao criou rolagem lateral?
- PWA nao esta servindo versao antiga?
- `npm run build` passou?

## 18. Regras de Responsividade Mobile

Mobile deve ser tratado como prioridade operacional.

Regras:

- Evitar elementos que ultrapassem a largura da viewport.
- Evitar scroll horizontal.
- Evitar alturas fixas excessivas.
- Preferir grids fluidos e layouts com flex.
- Cards devem se adaptar proporcionalmente.
- Inputs e botoes devem funcionar bem por toque.
- Evitar hover como unica forma de interacao.
- Sempre considerar area util descontando header/footer.
- Priorizar ergonomia para operacao rapida.
- Validar telas importantes em viewport mobile antes de concluir mudancas visuais.

## 19. Regras de Service Worker e Cache

Regras:

- Toda alteracao critica em arquivos publicos deve considerar atualizacao ou versionamento do service worker.
- Evitar cache eterno de `app.js`, `dataClient.js`, `index.css` e `index.html`.
- Quando necessario, limpar caches antigos automaticamente.
- Evitar situacao onde mobile carregue versao antiga do app.
- Sempre validar se a nova versao realmente foi aplicada apos build/deploy.
- Mudancas em cache devem ser feitas com cuidado para nao quebrar uso offline.

## 20. Regras de Logs e Debug

Logs devem ser claros e identificaveis.

Prefixos recomendados:

- `[BOOT]`
- `[SYNC]`
- `[SUPABASE]`
- `[CACHE]`
- `[SEARCH]`
- `[UI]`
- `[ERROR]`

Regras:

- Evitar logs excessivos em producao.
- Nao remover logs importantes de sincronizacao sem necessidade.
- Erros criticos devem ser faceis de localizar no console.
- Logs temporarios de diagnostico devem ser removidos ou reduzidos quando a correcao estiver validada.

## 21. Arquitetura e Filosofia do Projeto

O projeto prioriza:

- Estabilidade operacional.
- Velocidade de uso.
- Compatibilidade desktop/mobile.
- Mudancas cirurgicas.
- Baixo risco de regressao.
- Simplicidade operacional.
- Visual consistente.
- Performance em dispositivos moveis.

A filosofia do projeto nao e:

- Excesso de animacoes.
- Refatoracoes grandes sem necessidade.
- Troca constante de estrutura.
- Dependencia excessiva de frameworks.
- Alteracoes visuais radicais sem pedido explicito.

## 22. Regras de Build e Deploy

Regras:

- Sempre executar `npm run build` apos alteracoes.
- Nunca considerar alteracao concluida sem build valido.
- Nao editar `dist/` manualmente.
- Arquivos gerados devem vir do build.
- Validar se o PWA atualizou corretamente apos deploy.
- Verificar se o navegador/mobile nao esta usando cache antigo.
- Se o deploy estiver no Vercel, confirmar que a versao publicada corresponde ao codigo alterado.

## 23. Regras de Seguranca Operacional

Regras:

- Evitar exclusoes automaticas sem confirmacao.
- Evitar limpar cache/localStorage automaticamente sem necessidade.
- Preservar compatibilidade com dados existentes.
- Evitar mudancas destrutivas em estrutura de dados.
- Evitar renomear funcoes centrais sem necessidade.
- Evitar quebrar integracao ja funcional com Supabase.
- Evitar alterar regras de estoque, login ou sincronizacao junto com ajustes visuais simples.
