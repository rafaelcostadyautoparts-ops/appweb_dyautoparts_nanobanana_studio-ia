# AGENTS.md

## Idioma

- Responda sempre em português.
- Use linguagem clara, objetiva e curta.
- Ao concluir, informe somente: o que foi alterado, arquivos afetados, testes executados, riscos e próximos passos.

## Ambientes e diretórios

### Homologação

- Diretório padrão de desenvolvimento:
  `E:\meus-repositorios\dyautoparts-homologacao`
- Este é o ambiente padrão para análise, desenvolvimento, correções e testes.
- Antes de qualquer alteração, confirme que o diretório atual é o de homologação.

### Produção

- Diretório de produção:
  `E:\meus-repositorios\dyautoparts-producao`
- Não editar arquivos diretamente nesse diretório durante desenvolvimento normal.
- Não executar testes destrutivos nesse diretório.
- Não criar funcionalidades diretamente em produção.
- Não alterar, atualizar, restaurar, sincronizar ou preparar produção sem autorização explícita do usuário.
- Se o agente estiver aberto na pasta de produção sem uma solicitação explícita de produção, pare e informe o usuário.

## Escopo

- Trabalhe sempre no menor escopo possível.
- Não refatore código fora da tarefa solicitada.
- Não altere arquivos sem necessidade.
- Antes de modificar algo, identifique primeiro os arquivos, tabelas, funções ou serviços diretamente relacionados.
- Preserve alterações existentes que não façam parte da tarefa.
- Não sobrescreva trabalho existente para simplificar uma implementação.
- Não crie estruturas duplicadas quando já existir implementação equivalente.

## Economia de contexto e execução

- Evite varrer o repositório inteiro quando uma busca direcionada for suficiente.
- Evite ler arquivos grandes completos se apenas um trecho relevante for necessário.
- Não execute testes abrangentes quando testes direcionados forem suficientes.
- Não repita validações já concluídas sem necessidade.
- Não execute build, lint, testes completos, deploy ou consultas externas apenas por precaução.
- Use ferramentas externas somente quando forem necessárias para concluir a tarefa.

## Fluxo de trabalho

- Em tarefas grandes, prefira dividir o trabalho em:
  1. análise;
  2. implementação;
  3. validação;
  4. publicação.
- Não faça todas as etapas automaticamente se o usuário solicitou apenas uma delas.
- Se o pedido for apenas análise, não altere arquivos, banco de dados, branches ou deploys.
- Se o pedido for implementação, não publique automaticamente.
- Antes de uma ação destrutiva, ampla ou difícil de reverter, pare e informe.
- Não interpretar pedido de análise como autorização para implementação.
- Não interpretar pedido de implementação como autorização para publicação.

## Banco de dados e Supabase

- Antes de criar tabela, coluna, índice, trigger, função, RPC ou política nova, verifique se já existe estrutura que possa ser reutilizada.
- Prefira consultas direcionadas ao invés de inspecionar todo o banco.
- Homologação é o ambiente padrão para mudanças e testes.
- Produção deve permanecer fora de escopo até autorização explícita.
- Não aplicar migrations em produção sem autorização explícita.
- Não alterar dados de produção apenas para testar.
- Não apagar dados existentes para fazer testes passarem.
- Não desabilitar RLS, triggers, policies, validações ou proteções para facilitar testes.
- Antes de alterar estrutura de banco, revisar dependências, migrations existentes, RLS, triggers, funções e RPCs relacionadas.
- Não expor chaves, tokens, secrets ou valores sensíveis em respostas, commits ou logs.

## Vercel e deploy

- Não fazer deploy automaticamente.
- Quando publicação for solicitada sem indicação de produção, usar homologação ou preview.
- Não usar produção, promover alias ou publicar com modo de produção sem autorização explícita.
- Antes de publicar, confirmar que apenas os arquivos previstos fazem parte do pacote.
- Não incluir alterações não relacionadas na publicação.
- Não assumir que autorização para testar significa autorização para publicar.
- Não executar `vercel --prod` sem autorização explícita.

## Git

- Antes de qualquer alteração importante, confirmar:
  - diretório atual;
  - branch atual;
  - estado do working tree.
- Não criar ou trocar branch automaticamente.
- Se uma nova branch for necessária, solicitar autorização primeiro.
- Não usar force push.
- Não fazer merge automático.
- Não executar rebase automaticamente.
- Não executar pull automaticamente.
- Não executar reset destrutivo.
- Não executar clean destrutivo.
- Não descartar alterações existentes com checkout ou restore sem autorização explícita.
- Não incluir alterações não relacionadas no mesmo commit.
- Mensagens de commit devem ser em português, curtas e específicas.
- Não criar commits desnecessários durante uma etapa apenas de análise.
- Não fazer push automaticamente sem autorização explícita.

## Testes e Playwright

- Testes Playwright devem utilizar homologação ou ambiente local por padrão.
- Não apontar testes E2E para produção sem autorização explícita.
- Testes devem evitar gerar pedidos, estoque, movimentos, separações, conferências, romaneios ou registros reais.
- Quando um teste precisar gravar dados, usar somente dados identificados como teste e somente em homologação.
- Não apagar dados reais para limpar cenário de teste.
- Prefira testes de leitura e navegação antes de testes que alterem dados.
- Testes E2E devem ficar em `tests/e2e`.
- Testes existentes com `node:test` devem ser preservados.
- Não alterar testes existentes apenas para esconder uma falha real.
- Se um teste falhar, investigar a causa antes de mudar o teste.

## Mercado Livre e integrações

- Não consultar APIs externas de forma repetitiva sem necessidade.
- Quando houver webhook, evento ou dado já persistido, prefira utilizar a informação existente.
- Não alterar fluxos de pedidos, identificação, separação ou estoque fora do escopo solicitado.
- Antes de criar nova estrutura para integrações, verificar tabelas, funções, endpoints e mappings existentes.
- Não consumir tokens ou APIs externas desnecessariamente.
- Não modificar integrações de produção para realizar testes de homologação.

## Estoque, separação e conferência

- Alterações nesses fluxos devem preservar integridade de estoque e histórico.
- Não gerar movimentos de estoque durante testes, salvo quando isso fizer parte explicitamente da tarefa e apenas em homologação.
- Não modificar regras de conferência, separação, PIN, auditoria ou agrupamento fora do escopo solicitado.
- Em mudanças de custo ou estoque, analisar primeiro a estrutura atual antes de propor novas tabelas.
- Não corrigir inconsistência de estoque alterando dados históricos sem autorização explícita.
- Sempre preservar rastreabilidade de operações já finalizadas.

## Segurança

- Nunca incluir senhas, tokens, anon keys, service role keys, secrets ou credenciais em commits, PRs ou respostas.
- Não desabilitar RLS, triggers, validações ou proteções existentes para facilitar testes.
- Não executar comandos destrutivos sem necessidade e autorização.
- Sempre preferir mudanças pequenas, reversíveis e fáceis de validar.
- Não alterar permissões, ownership ou configurações globais do sistema sem necessidade comprovada.
- Se houver dúvida entre uma ação reversível e uma destrutiva, escolher a reversível.
- Em caso de dúvida sobre produção, não executar e solicitar confirmação.

## Ferramentas e agentes

- Estas regras valem para qualquer agente utilizado no projeto, incluindo Codex, Antigravity e Claude Code.
- Nenhum agente tem autorização implícita para alterar produção.
- Nenhum agente deve interpretar acesso técnico como autorização para executar mudanças.
- O ambiente padrão de trabalho é homologação.
- Ferramentas conectadas a banco, GitHub, Vercel ou APIs externas devem respeitar todas as regras deste arquivo.
