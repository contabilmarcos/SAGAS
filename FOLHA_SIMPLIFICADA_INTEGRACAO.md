# Integração da folha simplificada v141

O cálculo continua usando salário-base, admissão e centro de custo, sem eventos variáveis.

## Fluxo

1. Calcule a competência por centro de custo.
2. Em Contabilização, associe cada componente com valor positivo a uma natureza analítica ativa da empresa. Os defaults específicos do centro prevalecem sobre os gerais **por lado**. Cada lado presente deve totalizar 100%. O salário líquido exige somente crédito; os demais componentes podem usar débito, crédito ou ambos. O diário completo deve equilibrar.
   Para reaproveitar a configuração, clique em **Usar parâmetros da competência anterior**. O sistema busca o mês imediatamente anterior, inclusive na virada do ano, para a mesma empresa e centro de custo. Preenche somente as naturezas ainda não configuradas e mantém os ajustes do mês atual. Naturezas inativas, sintéticas ou de outra empresa não são copiadas; o sistema informa os componentes ignorados. A prévia é atualizada com os valores da folha atual e os defaults atuais das naturezas. Valores, datas, alíquotas e lotes não são copiados. Folhas já contabilizadas bloqueiam essa opção.
3. Crie o lote. As partidas preservam conta, CC, filial e histórico dos defaults. A postagem exige as permissões contábeis de criação, postagem e gestão de lotes. O plano aplicado fica congelado em um registro vinculado à revisão e ao lançamento.
4. Após contabilizar, use **Gerar títulos de salário líquido**. Cada funcionário com líquido positivo recebe um título no Financeiro existente, com vencimento na data de pagamento do cálculo. A repetição não duplica títulos. A baixa usa o evento financeiro e o lote já previstos pelo SAGAS; herda o CC da origem e rejeita evento com CC divergente. Os títulos mantêm as restrições de acesso, cancelamento e ajustes dos títulos mensais existentes.
5. Use **Constituir férias, terço e 13º** para registrar o principal no livro de provisões existente. As baixas continuam no controle de provisões já disponível. Uma constituição legada para o mesmo funcionário/componente/competência bloqueia duplicação; movimentos posteriores bloqueiam constituição retroativa.

Os documentos de cada integração e seu marcador são gravados na mesma transação. Falhas não deixam títulos ou constituições parciais. Folhas contabilizadas não podem ser recalculadas. Títulos mensais legados existentes na competência bloqueiam nova geração para o funcionário.

## Compatibilidade e limites

- As naturezas ficam separadas por competência e centro de custo. Na atualização, os planos históricos contabilizados preservam as naturezas efetivamente usadas; o cadastro antigo, compartilhado entre meses, é preservado no último mês calculado de cada centro. Não se atribuem parâmetros a competências antigas sem histórico disponível. Se o mês imediatamente anterior não tiver configuração, o sistema informa isso, sem buscar outro mês ou centro.
- Migração aditiva no mesmo D1 e no mesmo Worker. As contas fixas antigas permanecem armazenadas, mas folhas ainda não contabilizadas precisam selecionar naturezas. Lotes já contabilizados não são refeitos.
- Folhas já contabilizadas podem gerar títulos e constituições pelo novo fluxo, desde que não existam documentos equivalentes. Sua postagem original não ganha retroativamente um snapshot de naturezas.
- O relatório separa estimativas mensais (principal e encargos) dos saldos constituídos/baixados do principal, incluindo os movimentos históricos do livro. Não confundir acumulado estimado com passivo conciliado.
- Encargos são contabilizados, mas esta entrega **não gera guias/títulos tributários automaticamente**: faltam regras de credor e vencimento de cada obrigação. Encargos de provisões continuam estimativas contábeis; ainda não possuem livro de baixas por encargo. Baixa operacional de provisão não substitui sua contabilização pelos fluxos existentes de férias/13º/rescisão.
- O pagamento mensal não baixa direitos de férias/13º. Não há integração eSocial.
- Limite de 180 partidas por postagem de um centro de custo. Naturezas com rateios muito extensos precisam ser revistas antes da postagem.

## Validação

Com Node 22, na raiz: `node --test tests/*.test.mjs`.
A suíte nova usa SQLite real para verificar SQL, rateios, isolamento de empresa, atomicidade, idempotência, títulos, constituições e baixa operacional; também exercita a construção das partidas da baixa financeira. A CI de folha executa a suíte nova. Testes locais não publicam nem acessam o D1 de produção.
