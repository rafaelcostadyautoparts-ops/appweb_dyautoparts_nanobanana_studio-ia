# Separação e conferência entre aparelhos

Implementação concluída localmente em 02/09/2026. Pacote 2.2.29 (2026.09.02.04) preparado em tmp/pick-pack-sync-release-20260902, ainda não publicado. Base: produção 2.2.28. Não houve mudança de banco ou de dados reais nesta etapa.

## Comportamento
- Leituras e alterações de pacotes entram na fila durável antes do envio. A conferência não depende de um timer para começar a preservação das leituras.
- Operações do mesmo item e consumidores da fila são serializados. A ordem da fila distingue registros criados no mesmo instante; cada operação mantém seu identificador ao repetir o envio.
- Envio pendente de separação/conferência é repetido ao retornar à janela ou a cada 30 segundos enquanto um desses módulos ou o menu está aberto.
- Antes de retomar, o aplicativo aguarda as gravações locais, envia a fila e busca o estado atual. Pendências da mesma sessão impedem que a cópia local seja sobrescrita durante a retomada.
- Na conferência, as quantidades remotas são a referência após o envio, inclusive zero. Não se compara relógio dos aparelhos nem se reenvia uma quantidade antiga só por abrir a tela.
- Sem internet, o progresso local e sua referência de envio são preservados. Os demais aparelhos só verão essas alterações depois do envio.
- Separações encerradas não voltam a aparecer como rascunho apenas por existir cópia antiga no aparelho. Nenhuma cópia é apagada por essa filtragem.
- Exclusão de rascunho fica registrada na fila antes da limpeza local, inclusive offline. O servidor continua aplicando as validações de exclusão já existentes.
- O botão de pendências anterior sincroniza separação/conferência; NF e romaneios continuam no ícone próprio.

## Limites preservados
As regras de estoque, finalização, auditoria, agrupamento e de conferente diferente do separador permanecem. A tela de edição não é redesenhada automaticamente enquanto o operador trabalha: a atualização remota ocorre ao abrir ou retomar a operação. Não foi implementado bloqueio exclusivo de edição da mesma operação por vários aparelhos.

## Arquivos e validação
- public/app.js: integração com a fila e retomada.
- tests/pickPackSync.test.mjs: 14 testes aprovados sobre o app.js do pacote isolado, cobrindo concorrência, envio durável, isolamento dos módulos, falhas, relógio local adiantado, zero remoto, retomada offline, separação encerrada, ordem e origem dos pacotes, e exclusão offline.
- Sintaxe JavaScript aprovada. Somente app.js, index.html, sw.js e version.json diferem da base publicada.
- Falta validação visual em dois aparelhos e autorização para publicação desta nova etapa, conforme AGENTS.md.
