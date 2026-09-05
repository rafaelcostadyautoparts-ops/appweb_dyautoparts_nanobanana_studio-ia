# Correção dos sensores Mafreet — 02/09/2026

Aplicado em homologação e, após autorização explícita, em produção em 02/09/2026. UUID do novo Branco Pérola em produção: 375e50fd-9fb6-47fb-9c14-56af18a97d83.

- DY-000.658 atualizado no UUID existente, mantendo criado_em. Corrigidos SKU, cor, descrições e seis atributos. Atualizado o horário da alteração. Demais campos preservados.
- DY-000.713 criado com novo UUID, preços 42/84/63, cor Branco Pérola e estrutura solicitada. SKU vazio e localização nula: não foram encontradas referências seguras nos produtos, vínculos de fornecedores ou itens de notas consultados.
- Fator de conversão 1.000000 e lote mínimo 1.000 representam 1, conforme os produtos de referência; não foram gravados um milhão ou mil.
- Imagens apontam para os caminhos solicitados, mas ambos retornaram HTTP 400 na verificação. Arquivos de imagem precisam ser conferidos/enviados.
- Nenhuma tabela de estoque, movimentação ou histórico recebeu escrita. A transação verificou a identidade e criação do Azul e a preservação integral dos três produtos de referência.

| ID | Cor | SKU | Localização | Custo em homologação |
|---|---|---|---|---|
| DY-000.600 | Grafite | MH-826 | 2.2.B | 39,97 |
| DY-000.601 | Prata | MH-82616.5MMPRATA | 2.2.B | 42,00 |
| DY-000.625 | Preto | não preenchido | 2.2.A | 42,00 |
| DY-000.658 | Azul | MH-82616.5MMAZUL | 2.2.A | 42,00 |
| DY-000.713 | Branco Pérola | pendente | pendente | 42,00 |

Além de ID/UUID, cor, descrição completa, imagem, SKU e localização, os registros têm datas próprias e o Grafite mantém custo diferente. Na produção, o Preto estava com custo 44,18, também preservado. Varejo 84 e atacado 63 são comuns.

A interface sugere o próximo ID a partir do maior número cadastrado. O ID 713 estava livre e foi usado conforme solicitação expressa. Não há trigger de geração de SKU, imagem ou localização em produtos. Nenhuma regra automática foi alterada.

Validação: consulta posterior confirmou os cinco registros, seis atributos por produto e os parâmetros comuns. Roteiro SQL exato em tmp/correcao-sensores-mafreet.sql; contém transação e verificações contra sobrescrita/repetição. Estado revalidado e transação aplicada em produção; consulta posterior confirmou os dois cadastros.
