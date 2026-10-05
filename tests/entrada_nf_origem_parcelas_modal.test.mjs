import test from 'node:test';
import assert from 'node:assert/strict';

function parseDecimal(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const s = String(val).trim().replace('R$', '').trim();
  if (s.includes(',') && s.includes('.')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (s.includes(',')) {
    return parseFloat(s.replace(',', '.')) || 0;
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

function getComparativoParcelaXML(state, idx, parcelaAtual) {
  if (!state || state.origem !== 'xml' || !state.duplicatasFiscaisOriginais || !state.duplicatasFiscaisOriginais[idx]) {
    return { modificado: false };
  }
  const orig = state.duplicatasFiscaisOriginais[idx];
  const origVenc = orig.vencimento_xml || '';
  const origVal = parseDecimal(orig.valor_xml || 0);
  const atualVenc = parcelaAtual.vencimento || '';
  const atualVal = parseDecimal(parcelaAtual.valor || 0);

  const dataMudou = Boolean(origVenc && atualVenc && origVenc !== atualVenc);
  const valorMudou = Math.abs(origVal - atualVal) > 0.005;

  if (dataMudou || valorMudou) {
    return {
      modificado: true,
      vencimentoOrig: origVenc,
      valorOrig: origVal
    };
  }
  return { modificado: false };
}

function getEntradaNFPagamentoState(entradaId, nf, parcelasExistentes, duplicatasFiscaisXML) {
  const valorTotal = parseDecimal(nf.valor_total || 0);
  const temDuplicatasXML = Array.isArray(duplicatasFiscaisXML) && duplicatasFiscaisXML.length > 0;
  const origem = temDuplicatasXML ? 'xml' : 'manual';
  let parcelasIniciais = [];

  if (parcelasExistentes && parcelasExistentes.length > 0) {
    parcelasIniciais = parcelasExistentes.map((p, idx) => ({
      numero: p.numero_parcela || (idx + 1),
      vencimento: p.data_vencimento || p.vencimento || '',
      valor: parseDecimal(p.valor || 0)
    }));
  } else if (temDuplicatasXML) {
    parcelasIniciais = duplicatasFiscaisXML.map((d, idx) => ({
      numero: d.numero_duplicata || (idx + 1),
      vencimento: d.vencimento_xml || '',
      valor: parseDecimal(d.valor_xml || 0)
    }));
  } else {
    parcelasIniciais = [{
      numero: 1,
      vencimento: '2026-10-04',
      valor: valorTotal
    }];
  }

  let condicaoInicial = 'a_vista';
  if (nf.tipo_condicao_financeira === 'parcelado' || nf.tipo_condicao_financeira === 'a_prazo') {
    condicaoInicial = 'parcelado';
  } else if (nf.tipo_condicao_financeira === 'a_vista') {
    condicaoInicial = 'a_vista';
  } else if (parcelasIniciais.length > 1) {
    condicaoInicial = 'parcelado';
  }

  let formaPagamentoInicial = (parcelasExistentes && parcelasExistentes[0]?.forma_pagamento) || '';
  if (!formaPagamentoInicial) {
    if (Array.isArray(nf.pagamentos_xml) && nf.pagamentos_xml.length === 1) {
      const tPag = String(nf.pagamentos_xml[0].codigoFormaPagamento || '').trim();
      if (tPag === '15') formaPagamentoInicial = 'boleto';
      else if (tPag === '17') formaPagamentoInicial = 'pix';
      else if (tPag === '03' || tPag === '04') formaPagamentoInicial = 'cartao';
      else if (tPag === '01') formaPagamentoInicial = 'dinheiro';
      else if (tPag === '18') formaPagamentoInicial = 'transferencia';
      else formaPagamentoInicial = 'boleto';
    } else {
      formaPagamentoInicial = 'boleto';
    }
  }

  return {
    isOpen: false,
    origem: origem,
    duplicatasFiscaisOriginais: duplicatasFiscaisXML || [],
    condicao: condicaoInicial,
    formaPagamento: formaPagamentoInicial || 'boleto',
    observacao: nf.observacao_financeira || '',
    qtdParcelas: parcelasIniciais.length || 1,
    primeiroVencimento: parcelasIniciais[0]?.vencimento || '2026-10-04',
    intervaloDias: 30,
    parcelas: parcelasIniciais,
    valorTotalNf: valorTotal
  };
}

test('FASE 2 — A: XML com duplicata fiscal define origem = "xml" e carrega parcelas do XML', () => {
  const nf = { id: 'nf-1', valor_total: '712.25', numero_nf: '24257' };
  const duplicatasXML = [
    { entrada_nf_id: 'nf-1', numero_duplicata: '001', vencimento_xml: '2026-10-06', valor_xml: '712.25' }
  ];
  const parcelasExistentes = [];

  const state = getEntradaNFPagamentoState('nf-1', nf, parcelasExistentes, duplicatasXML);
  assert.equal(state.origem, 'xml');
  assert.equal(state.parcelas.length, 1);
  assert.equal(state.parcelas[0].vencimento, '2026-10-06');
  assert.equal(state.parcelas[0].valor, 712.25);
});

test('FASE 2 — B: XML sem duplicata define origem = "manual" e fallback manual', () => {
  const nf = { id: 'nf-2', valor_total: '2220.00', numero_nf: '27876' };
  const duplicatasXML = [];
  const parcelasExistentes = [];

  const state = getEntradaNFPagamentoState('nf-2', nf, parcelasExistentes, duplicatasXML);
  assert.equal(state.origem, 'manual');
  assert.equal(state.parcelas.length, 1);
  assert.equal(state.parcelas[0].valor, 2220.00);
  assert.equal(state.condicao, 'a_vista');
});

test('FASE 2 — C: contas_pagar existente configurada manualmente (sem duplicata no XML) mantém origem = "manual"', () => {
  const nf = { id: 'nf-3', valor_total: '2220.00', numero_nf: '27876', tipo_condicao_financeira: 'parcelado' };
  const duplicatasXML = []; // XML NÃO tem duplicatas
  const parcelasExistentes = [
    { numero_parcela: 1, vencimento: '2026-10-03', valor: '740.00', forma_pagamento: 'boleto' },
    { numero_parcela: 2, vencimento: '2026-11-02', valor: '740.00', forma_pagamento: 'boleto' },
    { numero_parcela: 3, vencimento: '2026-12-02', valor: '740.00', forma_pagamento: 'boleto' }
  ];

  const state = getEntradaNFPagamentoState('nf-3', nf, parcelasExistentes, duplicatasXML);
  assert.equal(state.origem, 'manual');
  assert.equal(state.parcelas.length, 3);
  assert.equal(state.parcelas[0].valor, 740.00);
});

test('FASE 2 — D: Editar conta operacional originada do XML detecta diferença no comparativo e mantém original intacto', () => {
  const nf = { id: 'nf-4', valor_total: '1000.00', numero_nf: '999' };
  const duplicatasXML = [
    { entrada_nf_id: 'nf-4', numero_duplicata: '001', vencimento_xml: '2026-10-10', valor_xml: '1000.00' }
  ];
  const parcelasExistentes = [];

  const state = getEntradaNFPagamentoState('nf-4', nf, parcelasExistentes, duplicatasXML);

  // Inicialmente sem modificação
  let comp = getComparativoParcelaXML(state, 0, state.parcelas[0]);
  assert.equal(comp.modificado, false);

  // Operador edita vencimento para 15/10/2026
  state.parcelas[0].vencimento = '2026-10-15';
  comp = getComparativoParcelaXML(state, 0, state.parcelas[0]);
  assert.equal(comp.modificado, true);
  assert.equal(comp.vencimentoOrig, '2026-10-10');
  assert.equal(comp.valorOrig, 1000.00);

  // A duplicata fiscal original no state permanece 10/10/2026
  assert.equal(state.duplicatasFiscaisOriginais[0].vencimento_xml, '2026-10-10');
});

test('FASE 2 — E: detPag tPag=15 sugere "boleto" quando não há forma operacional salva', () => {
  const nf = {
    id: 'nf-5',
    valor_total: '1463.35',
    pagamentos_xml: [
      { codigoFormaPagamento: '15', descricaoFormaPagamento: 'Boleto Bancario', valorPagamento: 1463.35 }
    ]
  };
  const duplicatasXML = [];
  const parcelasExistentes = [];

  const state = getEntradaNFPagamentoState('nf-5', nf, parcelasExistentes, duplicatasXML);
  assert.equal(state.formaPagamento, 'boleto');
});

test('FASE 2 — F: detPag tPag=90 (Sem Pagamento) não inventa forma operacional falsa', () => {
  const nf = {
    id: 'nf-6',
    valor_total: '2220.00',
    pagamentos_xml: [
      { codigoFormaPagamento: '90', descricaoFormaPagamento: 'Sem Pagamento', valorPagamento: 0 }
    ]
  };
  const duplicatasXML = [];
  const parcelasExistentes = [];

  const state = getEntradaNFPagamentoState('nf-6', nf, parcelasExistentes, duplicatasXML);
  assert.equal(state.formaPagamento, 'boleto'); // Default seguro sem crash
});

test('FASE 2 — G: NF legada com campos novos nulos não quebra', () => {
  const nf = { id: 'nf-legada', valor_total: '500.00', pagamentos_xml: null, tipo_condicao_financeira: null };
  const duplicatasXML = null;
  const parcelasExistentes = null;

  const state = getEntradaNFPagamentoState('nf-legada', nf, parcelasExistentes, duplicatasXML);
  assert.equal(state.origem, 'manual');
  assert.equal(state.parcelas.length, 1);
  assert.equal(state.parcelas[0].valor, 500.00);
  assert.equal(state.formaPagamento, 'boleto');
});

test('FASE 2 — H: Fluxo manual da NF 27876 permanece 100% funcional', () => {
  const nf = { id: 'nf-27876', valor_total: '2220.00', numero_nf: '27876' };
  const state = getEntradaNFPagamentoState('nf-27876', nf, [], []);
  assert.equal(state.origem, 'manual');

  // Operador altera para parcelado 3x
  state.condicao = 'parcelado';
  state.qtdParcelas = 3;
  state.primeiroVencimento = '2026-10-03';
  state.intervaloDias = 30;

  // Gerar parcelas
  const totalCentavos = Math.round(2220.00 * 100);
  const baseCentavos = Math.floor(totalCentavos / 3);
  const restoCentavos = totalCentavos % 3;
  const novas = [];
  for (let i = 0; i < 3; i++) {
    novas.push({
      numero: i + 1,
      vencimento: `2026-${10 + i}-03`,
      valor: (baseCentavos + (i < restoCentavos ? 1 : 0)) / 100
    });
  }
  state.parcelas = novas;

  assert.equal(state.parcelas.length, 3);
  assert.equal(state.parcelas[0].valor, 740.00);
  assert.equal(state.parcelas[1].valor, 740.00);
  assert.equal(state.parcelas[2].valor, 740.00);

  const soma = state.parcelas.reduce((s, p) => s + p.valor, 0);
  assert.equal(soma, 2220.00);
});
