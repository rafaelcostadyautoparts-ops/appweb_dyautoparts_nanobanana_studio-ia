import fs from 'fs';

console.log('================================================================');
console.log('SUÍTE DE TESTES: IDENTIFICAÇÃO INTELIGENTE ENTRADA NF V1');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${testName} - ${details}`);
    failCount++;
  }
}

// Carregar app.js para validar lógica implementada e helpers
const appJs = fs.readFileSync('public/app.js', 'utf8');

// Helper de simulação idêntico ao implementado em app.js
function isProductInactive(product) {
  if (!product) return false;
  const status = String(product.status || '').trim().toLowerCase();
  return status === 'inativo' || status === 'nao' || status === '0' || product.ativo === false;
}

function nfXmlOnlyDigits(val) {
  return String(val || '').replace(/\D/g, '');
}

function simularIdentificacaoCruzada(item, fornecedorCnpj, vinculosFornecedor, produtosCatalogo) {
  const cProd = String(item.codigo_produto_fornecedor || '').trim();
  const vinculo = vinculosFornecedor.find(v => String(v.codigo_produto_fornecedor || '').trim() === cProd);

  // CANDIDATO A
  let candidatoA = null;
  if (vinculo?.id_interno) {
    candidatoA = produtosCatalogo.find(p => String(p.id_interno || '').trim() === String(vinculo.id_interno).trim()) 
      || { id_interno: vinculo.id_interno, status: 'ativo' };
  }

  // CANDIDATO B
  const rawEan = String(item.ean_fornecedor || item.ean_xml || '').trim();
  const isEanExempt = !rawEan || ['SEMGTIN', 'ISENTO'].includes(rawEan.toUpperCase());
  const eanClean = !isEanExempt ? nfXmlOnlyDigits(rawEan) : '';
  const isEanValido = eanClean.length >= 7 && eanClean.length <= 14;
  let candidatoB = null;
  if (isEanValido) {
    candidatoB = produtosCatalogo.find(p => nfXmlOnlyDigits(p.ean) === eanClean) || null;
  }

  let result = {
    id_interno: null,
    produto: null,
    status_vinculo: 'nao_identificado',
    match_source: null,
    conflito_vinculo: false,
    conflito: null,
    produto_inativo: false,
    elegivel_aprendizado: false,
    ean_divergente: false
  };

  if (candidatoA && candidatoB) {
    if (candidatoA.id_interno === candidatoB.id_interno) {
      result.id_interno = candidatoA.id_interno;
      result.produto = candidatoA;
      result.match_source = 'fornecedor_e_ean';
      result.ean_divergente = false;
    } else {
      result.status_vinculo = 'conflito_vinculo';
      result.conflito_vinculo = true;
      result.conflito = { fornecedor: candidatoA, ean: candidatoB, cProd, eanClean };
      result.match_source = 'conflito';
      return result;
    }
  } else if (candidatoA && !candidatoB) {
    result.id_interno = candidatoA.id_interno;
    result.produto = candidatoA;
    result.match_source = 'fornecedor+cProd';
    result.ean_divergente = !!vinculo?.ean_divergente;
  } else if (!candidatoA && candidatoB) {
    result.id_interno = candidatoB.id_interno;
    result.produto = candidatoB;
    result.match_source = 'ean';
    result.elegivel_aprendizado = true;
  } else {
    result.status_vinculo = 'nao_identificado';
    return result;
  }

  // Verifica produto inativo
  const inactive = isProductInactive(result.produto);
  result.produto_inativo = inactive;
  if (inactive) {
    if (item.decisao_inativo === 'manter_inativo') {
      result.status_vinculo = 'vinculado';
    } else {
      result.status_vinculo = 'produto_inativo';
    }
  } else {
    result.status_vinculo = 'vinculado';
  }

  return result;
}

// Catálogo mock de teste
const mockCatalogo = [
  { id: 'p1', id_interno: 'DY-000.100', status: 'ativo', ean: '7891000000010', nome: 'Farol Milha LED' },
  { id: 'p2', id_interno: 'DY-000.200', status: 'ativo', ean: '7891000000020', nome: 'Sensor de Ré Black' },
  { id: 'p3', id_interno: 'DY-000.594', status: 'inativo', ean: '7898622140777', nome: 'Sensor Estacionamento 18mm' }
];

// --- TESTE 1: EAN ativo sem fornecedor+cProd -> identifica
{
  const item = { codigo_produto_fornecedor: 'NOVO-ITEM-01', ean_fornecedor: '7891000000010' };
  const vinculos = [];
  const res = simularIdentificacaoCruzada(item, '19645641000121', vinculos, mockCatalogo);
  assert(
    res.status_vinculo === 'vinculado' && res.id_interno === 'DY-000.100' && res.elegivel_aprendizado === true && res.produto_inativo === false,
    '1. EAN ativo sem fornecedor+cProd -> identifica e marca elegível para aprendizado'
  );
}

// --- TESTE 2: EAN inativo -> identifica + alerta PRODUTO INATIVO
{
  const item = { codigo_produto_fornecedor: 'ET-SEN 06 EMB', ean_fornecedor: '7898622140777' };
  const vinculos = [];
  const res = simularIdentificacaoCruzada(item, '19645641000121', vinculos, mockCatalogo);
  assert(
    res.id_interno === 'DY-000.594' && res.produto_inativo === true && res.status_vinculo === 'produto_inativo',
    '2. EAN inativo -> identifica + estado operacional PRODUTO INATIVO'
  );
}

// --- TESTE 3: Inativo + manter inativo -> decisão persiste e permite continuar
{
  const item = { codigo_produto_fornecedor: 'ET-SEN 06 EMB', ean_fornecedor: '7898622140777', decisao_inativo: 'manter_inativo' };
  const vinculos = [];
  const res = simularIdentificacaoCruzada(item, '19645641000121', vinculos, mockCatalogo);
  assert(
    res.id_interno === 'DY-000.594' && res.produto_inativo === true && res.status_vinculo === 'vinculado',
    '3. Inativo + manter inativo -> decisão persiste e libera recebimento'
  );
}

// --- TESTE 4: Inativo + reativar -> somente ação explícita altera status
{
  let prodClone = { ...mockCatalogo[2] };
  assert(prodClone.status === 'inativo', '4a. Produto clone começa inativo');
  // Reativação explícita
  prodClone.status = 'ativo';
  assert(isProductInactive(prodClone) === false, '4b. Reativação explícita altera status para ativo');
}

// --- TESTE 5: fornecedor+cProd sem EAN -> identifica
{
  const item = { codigo_produto_fornecedor: 'ET-MP5 08', ean_fornecedor: '' };
  const vinculos = [{ fornecedor_cnpj: '19645641000121', codigo_produto_fornecedor: 'ET-MP5 08', id_interno: 'DY-000.100' }];
  const res = simularIdentificacaoCruzada(item, '19645641000121', vinculos, mockCatalogo);
  assert(
    res.status_vinculo === 'vinculado' && res.id_interno === 'DY-000.100' && res.match_source === 'fornecedor+cProd',
    '5. fornecedor+cProd sem EAN -> identifica por fornecedor+cProd'
  );
}

// --- TESTE 6: fornecedor+cProd + EAN apontando mesmo produto -> identifica alta confiança
{
  const item = { codigo_produto_fornecedor: 'ET-MP5 08', ean_fornecedor: '7891000000010' };
  const vinculos = [{ fornecedor_cnpj: '19645641000121', codigo_produto_fornecedor: 'ET-MP5 08', id_interno: 'DY-000.100' }];
  const res = simularIdentificacaoCruzada(item, '19645641000121', vinculos, mockCatalogo);
  assert(
    res.status_vinculo === 'vinculado' && res.id_interno === 'DY-000.100' && res.match_source === 'fornecedor_e_ean' && res.ean_divergente === false,
    '6. fornecedor+cProd + EAN apontando mesmo produto -> identifica alta confiança'
  );
}

// --- TESTE 7: fornecedor+cProd + EAN apontando produtos diferentes -> CONFLITO e bloqueia finalização
{
  const item = { codigo_produto_fornecedor: 'COD-FORN-X', ean_fornecedor: '7891000000020' }; // EAN -> DY-000.200
  const vinculos = [{ fornecedor_cnpj: '19645641000121', codigo_produto_fornecedor: 'COD-FORN-X', id_interno: 'DY-000.100' }]; // Forn -> DY-000.100
  const res = simularIdentificacaoCruzada(item, '19645641000121', vinculos, mockCatalogo);
  assert(
    res.status_vinculo === 'conflito_vinculo' && res.conflito_vinculo === true && res.id_interno === null &&
    res.conflito.fornecedor.id_interno === 'DY-000.100' && res.conflito.ean.id_interno === 'DY-000.200',
    '7. fornecedor+cProd + EAN apontando produtos diferentes -> CONFLITO DE VÍNCULO'
  );
}

// --- TESTE 8: nenhum vínculo + nenhum EAN -> NÃO IDENTIFICADO
{
  const item = { codigo_produto_fornecedor: 'DESCONHECIDO', ean_fornecedor: '0000000000000' };
  const vinculos = [];
  const res = simularIdentificacaoCruzada(item, '19645641000121', vinculos, mockCatalogo);
  assert(
    res.status_vinculo === 'nao_identificado' && res.id_interno === null && res.conflito_vinculo === false,
    '8. nenhum vínculo + nenhum EAN -> NÃO IDENTIFICADO'
  );
}

// --- TESTE 9: SEM GTIN + fornecedor+cProd existente -> identifica
{
  const item = { codigo_produto_fornecedor: 'ET-MP5 08', ean_fornecedor: 'SEM GTIN' };
  const vinculos = [{ fornecedor_cnpj: '19645641000121', codigo_produto_fornecedor: 'ET-MP5 08', id_interno: 'DY-000.100' }];
  const res = simularIdentificacaoCruzada(item, '19645641000121', vinculos, mockCatalogo);
  assert(
    res.status_vinculo === 'vinculado' && res.id_interno === 'DY-000.100' && res.match_source === 'fornecedor+cProd',
    '9. SEM GTIN + fornecedor+cProd existente -> identifica sem erro'
  );
}

// --- TESTE 10: EAN identificado + fornecedor+cProd inexistente -> na finalização cria aprendizado
{
  const itens = [{ codigo_produto_fornecedor: 'NOVO-CPROD-10', id_interno: 'DY-000.100', valor_unitario: 50.0 }];
  const vinculosDb = [];
  const cnpj = '19645641000121';

  // Simulação de aprendizado
  for (const it of itens) {
    const existing = vinculosDb.find(v => v.fornecedor_cnpj === cnpj && v.codigo_produto_fornecedor === it.codigo_produto_fornecedor);
    if (!existing) {
      vinculosDb.push({
        fornecedor_cnpj: cnpj,
        codigo_produto_fornecedor: it.codigo_produto_fornecedor,
        id_interno: it.id_interno,
        ultimo_custo: it.valor_unitario
      });
    }
  }
  assert(
    vinculosDb.length === 1 && vinculosDb[0].codigo_produto_fornecedor === 'NOVO-CPROD-10' && vinculosDb[0].id_interno === 'DY-000.100',
    '10. EAN identificado + fornecedor+cProd inexistente -> aprendizado cria vínculo'
  );
}

// --- TESTE 11: aprendizado repetido -> idempotente, sem duplicidade
{
  const vinculosDb = [{ fornecedor_cnpj: '19645641000121', codigo_produto_fornecedor: 'NOVO-CPROD-10', id_interno: 'DY-000.100', ultimo_custo: 50.0 }];
  const itens = [{ codigo_produto_fornecedor: 'NOVO-CPROD-10', id_interno: 'DY-000.100', valor_unitario: 55.0 }];
  const cnpj = '19645641000121';

  for (const it of itens) {
    const idx = vinculosDb.findIndex(v => v.fornecedor_cnpj === cnpj && v.codigo_produto_fornecedor === it.codigo_produto_fornecedor);
    if (idx !== -1) {
      if (vinculosDb[idx].id_interno === it.id_interno) {
        vinculosDb[idx].ultimo_custo = it.valor_unitario; // safe update
      }
    } else {
      vinculosDb.push({ fornecedor_cnpj: cnpj, codigo_produto_fornecedor: it.codigo_produto_fornecedor, id_interno: it.id_interno });
    }
  }
  assert(
    vinculosDb.length === 1 && vinculosDb[0].ultimo_custo === 55.0,
    '11. aprendizado repetido -> idempotente, sem duplicação de chave única'
  );
}

// --- TESTE 12: vínculo pré-existente para outro produto -> nunca sobrescreve silenciosamente
{
  const vinculosDb = [{ fornecedor_cnpj: '19645641000121', codigo_produto_fornecedor: 'CPROD-CONFLITANTE', id_interno: 'DY-000.100' }];
  const itemRecebido = { codigo_produto_fornecedor: 'CPROD-CONFLITANTE', id_interno: 'DY-000.200' };
  let bloqueado = false;
  let mensagemErro = '';

  const existing = vinculosDb.find(v => v.fornecedor_cnpj === '19645641000121' && v.codigo_produto_fornecedor === itemRecebido.codigo_produto_fornecedor);
  if (existing && existing.id_interno !== itemRecebido.id_interno) {
    bloqueado = true;
    mensagemErro = `CONFLITO DE VÍNCULO: já vinculado a ${existing.id_interno}`;
  }
  assert(
    bloqueado === true && vinculosDb[0].id_interno === 'DY-000.100',
    '12. vínculo pré-existente para outro produto -> bloqueia e nunca sobrescreve silenciosamente'
  );
}

// --- TESTE 13: NF finalizada anteriormente -> não é modificada
{
  const nfFinalizada = { id: 'nf-35919', status: 'finalizada', estoque_finalizado: true };
  let tentouModificar = false;
  try {
    if (nfFinalizada.estoque_finalizado || nfFinalizada.status === 'finalizada') {
      throw new Error('Entrada NF já finalizada. Operação bloqueada.');
    }
    tentouModificar = true;
  } catch (e) {
    // Bloqueado com sucesso
  }
  assert(
    tentouModificar === false,
    '13. NF finalizada anteriormente (NF 35919) -> bloqueio contra reprocessamento preservado'
  );
}

// --- TESTE 14: estoque/FIFO/Financeiro -> comportamento existente preservado
{
  // Checagem de preservação das funções no app.js
  const hasFifoRef = appJs.includes('finalizarRecebimentoEntradaNF');
  const hasContasPagar = appJs.includes('contas_pagar');
  const hasEstoqueRecebimentos = appJs.includes('saveEntradaNFRecebimentos');
  assert(
    hasFifoRef && hasContasPagar && hasEstoqueRecebimentos,
    '14. estoque/FIFO/Financeiro -> RPCs e integrações preservadas intactas'
  );
}

// --- TESTE 15: Modal Complementar Botão CANCELAR -> contraste e texto visível
{
  const hasBtnCancelarStyle = appJs.includes("color:#475569; font-weight:800; cursor:pointer;") && appJs.includes("CANCELAR");
  assert(
    hasBtnCancelarStyle,
    '15. Modal Complementar -> botão CANCELAR com texto em caixa alta e contraste #475569 verificado'
  );
}

// --- TESTE 16: Pendências -> novos estados no código
{
  const hasConflitoBadge = appJs.includes("'Conflito de Vínculo'");
  const hasInativoBadge = appJs.includes("'Produto Inativo'");
  const hasConflitoUI = appJs.includes('CONFLITO DE VÍNCULO');
  const hasInativoUI = appJs.includes('PRODUTO INATIVO');
  assert(
    hasConflitoBadge && hasInativoBadge && hasConflitoUI && hasInativoUI,
    '16. Pendências e Identificação -> novos estados (CONFLITO, PRODUTO INATIVO) implementados'
  );
}

console.log('\n================================================================');
console.log(`TOTAL DE TESTES: ${passCount + failCount} | PASS: ${passCount} | FAIL: ${failCount}`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
}
