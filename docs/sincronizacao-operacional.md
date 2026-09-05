# Sincronização de entradas NF e romaneios

## Estado da entrega

Implementação local e três migrações aplicadas somente em homologação (`doklsgduslimidfbyngj`). Interface publicada em preview de homologação em 02/09/2026: https://appweb-dyautoparts-nanobanana-studio-f6d2a5xa9.vercel.app (2.2.27-homolog, build 2026.09.02.sync01). Falta validar visualmente o uso em dois aparelhos. O pacote isolado alterou somente app.js, sharedWorkSync.js, sharedWorkSync.css, sw.js, index.html e version.json em relação à base de homologação; geração e sintaxe aprovadas. Produção recebeu a estrutura de sincronização em 02/09/2026, após autorização explícita. Versão 2.2.27, build 2026.09.02.02; implantação dpl_6kXKHNyU4uSCyhiPavWqeCvgnFDq, com cinco arquivos entregues conferidos por SHA-256.

## Uso

1. Um administrador entra com o usuário já existente no aparelho e clica no **cadeado ao lado do indicador Online**.
2. Confirma com o **PIN mestre já existente**. Não há e-mail, senha nova ou criação manual de conta. O aparelho deve estar aprovado em Segurança.
3. Depois, qualquer usuário desse aparelho pode continuar a operação. A credencial automática é aleatória e o servidor guarda apenas seu hash.
4. Ao abrir o menu ou retornar à janela, os registros são sincronizados. Com a tela aberta, há atualização a cada 30 segundos. O ícone ao lado de Online permite sincronizar manualmente; cadeado indica autorização pendente, setas indicam sincronização e o contador mostra pendências. Havendo conflito, o clique abre a revisão.
5. Os rascunhos e romaneios antigos são recuperados no aparelho de origem. Não apague os dados dele antes de confirmar **sincronizados**.
6. Sem conexão, os registros permanecem na fila local durável. Outro aparelho só os recebe depois do envio.
7. Se dois aparelhos alterarem o mesmo registro, o segundo envio fica em conflito. **Revisar conflitos** permite baixar a cópia local e adotar a versão compartilhada; uma cópia adicional é preservada no IndexedDB.

## Limites e integridade

- Compartilha o estado completo do rascunho, sem movimentar estoque ou lançar financeiro durante o salvamento automático.
- Antes de importar uma NF, exige a sincronização do rascunho. O índice único existente na chave de acesso continua impedindo importações duplicadas.
- Descartes e importações mantêm um estado terminal no servidor para evitar que uma máquina antiga recrie a pendência.
- Fotos e assinaturas são armazenadas em tabela privada, sem URL pública, e carregadas ao abrir detalhe, imagens ou PDF. O limite por registro é 12 MB.
- A sessão automática depende da aprovação do dispositivo. Bloqueá-lo em Segurança também bloqueia acesso remoto. A cópia offline já baixada continua no aparelho.
- As tabelas não permitem leitura ou escrita direta pelos papéis da API; somente as funções com credencial válida. RLS permanece habilitado. O aviso informativo de RLS sem política é esperado nesse desenho de acesso exclusivo por funções.
- A aprovação reutiliza os administradores e o hash do PIN mestre existentes. A compatibilidade aceita a coluna ativo da produção e também verifica status aprovado quando essa coluna existe, sem alterar cadastro ou permissões de dispositivos. Cinco tentativas inválidas bloqueiam novas tentativas por 15 minutos por dispositivo, inclusive se a credencial local for recriada.
- As antigas RPCs de romaneios foram desabilitadas para os papéis de cliente em homologação, pois permitiam salvar sem revisão. A fila antiga é transferida para a nova persistência com cópias preservadas.

## Arquivos e validação

- `public/sharedWorkSync.js`: fila, persistência IndexedDB, revisão, recuperação, credencial e interface de sincronização.
- `public/app.js`: integração com entrada NF, romaneios e contadores. O histórico de homologação agora usa registros reais, incluindo Correios.
- `public/src/sharedWorkSync.css`, `index.html`, `public/sw.js`: carregamento e apresentação do módulo.
- Migrações `20260902172250`, `20260902173837` e `20260902174213`: registros, autorização e resumo de evidências.
- `node --test tests/sharedWorkSync.test.mjs`: simulação de aparelhos independentes, conflitos, retomada, perda de resposta, fila antiga e paginação.
- `tests/sharedWorkSync.sql`: verificação das RPCs em homologação com transação revertida e papel de cliente real (`anon`). Não executar em produção.

Publicação de produção autorizada explicitamente pelo usuário. Pacote isolado em tmp/shared-sync-production-20260902, baseado na versão de produção 2.2.26. Somente seis arquivos alterados; sem outras mudanças do repositório. Migração 20260902190714 instala o estado final de sincronização para a produção que ainda não possuía as tabelas. As migrações 20260902190220 e 20260902190512 validam a compatibilidade em homologação. A instalação agregada de produção é específica desse estado inicial; não executar indiscriminadamente toda a pasta de migrações.

Validação adicional em homologação: PIN inválido recusado, PIN correto aceito, aparelho bloqueado impedido e suíte SQL de continuidade/conflito aprovada, tudo com rollback. Em produção foram realizadas apenas verificações sem escrita de teste: token inválido e leitura direta bloqueados, RLS ativo. Nenhum estoque ou histórico foi movimentado. Falta a confirmação de uso real em dois aparelhos.


## Ajuste do indicador e perfis — 02/09/2026

Versão 2.2.28, build 2026.09.02.03: tarja removida e substituída pelo ícone junto de Online. Arquivos de implementação: public/sharedWorkSync.js e public/src/sharedWorkSync.css; pacote isolado inclui apenas esses arquivos e index.html, sw.js, version.json. Motor de persistência conferido sem alterações; sintaxe JS e CSS validadas. Validação visual no navegador não disponível nesta sessão.

Conforme solicitação explícita, todos os cadastros de usuários em produção possuem perfil admin. Apenas um registro precisou mudar de perfil; ficaram quatro usuários ativos e um inativo. Nenhuma conta foi reativada, nenhum PIN foi alterado. Isso concede acesso às funções administrativas aos quatro usuários ativos.
