import test from 'node:test';
import assert from 'node:assert/strict';

// Funções auxiliares simulando a lógica pura implementada em app.js / dataClient.js

function parseDecimal(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const s = String(val).trim().replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

function gerarParcelasPagamentoNF(state, valorTotal) {
  const n = Math.max(1, parseInt(state.qtdParcelas, 10) || 1);
  const totalCentavos = Math.round(parseDecimal(valorTotal) * 100);
  const baseCentavos = Math.floor(totalCentavos / n);
  const restoCentavos = totalCentavos % n;

  const dataBase = state.primeiroVencimento ? new Date(state.primeiroVencimento + 'T12:00:00') : new Date();
  const intervalo = parseInt(state.intervaloDias, 10) || 30;

  const novasParcelas = [];
  for (let i = 0; i < n; i++) {
    const centavosDestaParcela = baseCentavos + (i < restoCentavos ? 1 : 0);
    const dataVenc = new Date(dataBase);
    dataVenc.setDate(dataBase.getDate() + (i * intervalo));
    const vencStr = dataVenc.toISOString().split('T')[0];

    novasParcelas.push({
      numero: i + 1,
      vencimento: vencStr,
      valor: centavosDestaParcela / 100
    });
  }

  state.parcelas = novasParcelas;
  return state.parcelas;
}

function getEntradaNFPagamentoState(entradaId, nf, parcelasExistentes) {
  const valorTotal = parseDecimal(nf.valor_total || 0);
  let parcelasIniciais = [];

  if (parcelasExistentes && parcelasExistentes.length > 0) {
    parcelasIniciais = parcelasExistentes.map((p, idx) => ({
      numero: p.numero_parcela || (idx + 1),
      vencimento: p.data_vencimento || p.vencimento || '',
      valor: parseDecimal(p.valor || 0)
    }));
  } else {
    parcelasIniciais = [{
      numero: 1,
      vencimento: '2026-10-03',
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

  return {
    isOpen: false,
    condicao: condicaoInicial,
    formaPagamento: (parcelasExistentes && parcelasExistentes[0]?.forma_pagamento) || 'boleto',
    observacao: nf.observacao_financeira || '',
    qtdParcelas: parcelasIniciais.length || 1,
    primeiroVencimento: parcelasIniciais[0]?.vencimento || '2026-10-03',
    intervaloDias: 30,
    parcelas: parcelasIniciais,
    valorTotalNf: valorTotal
  };
}

function setCondicaoPagamentoNF(state, condicao, valorTotal) {
  state.condicao = condicao;
  if (condicao === 'a_vista') {
    state.qtdParcelas = 1;
    state.parcelas = [{
      numero: 1,
      vencimento: state.primeiroVencimento || '2026-10-03',
      valor: parseDecimal(valorTotal)
    }];
  } else {
    state.qtdParcelas = Math.max(1, parseInt(state.qtdParcelas, 10) || 1);
    gerarParcelasPagamentoNF(state, valorTotal);
  }
}

function buildSavePayload(state) {
  return {
    condicao: (state.condicao === 'parcelado' || state.condicao === 'a_prazo') ? 'parcelado' : 'a_vista',
    formaPagamento: state.formaPagamento || 'boleto',
    observacao: state.observacao || null,
    parcelas: state.parcelas
  };
}

test('CENÁRIO A: À VISTA (1 pagamento)', () => {
  const state = {
    condicao: 'a_vista',
    qtdParcelas: 1,
    primeiroVencimento: '2026-10-03',
    formaPagamento: 'pix',
    parcelas: []
  };
  setCondicaoPagamentoNF(state, 'a_vista', 712.25);
  const payload = buildSavePayload(state);

  assert.equal(payload.condicao, 'a_vista');
  assert.equal(payload.parcelas.length, 1);
  assert.equal(payload.parcelas[0].valor, 712.25);
  assert.equal(payload.formaPagamento, 'pix');
});

test('CENÁRIO B: A PRAZO 1x (1 parcela, boleto, vencimento futuro)', () => {
  const state = {
    condicao: 'parcelado',
    qtdParcelas: 1,
    primeiroVencimento: '2026-10-06',
    formaPagamento: 'boleto',
    parcelas: []
  };
  setCondicaoPagamentoNF(state, 'parcelado', 712.25);
  const payload = buildSavePayload(state);

  assert.equal(payload.condicao, 'parcelado', 'A PRAZO 1x DEVE manter condicao parcelado');
  assert.equal(payload.parcelas.length, 1, 'Deve conter exatamente 1 parcela');
  assert.equal(payload.parcelas[0].valor, 712.25);
  assert.equal(payload.parcelas[0].vencimento, '2026-10-06');
  assert.equal(payload.formaPagamento, 'boleto');
});

test('CENÁRIO C: A PRAZO 2x', () => {
  const state = {
    condicao: 'parcelado',
    qtdParcelas: 2,
    intervaloDias: 30,
    primeiroVencimento: '2026-10-06',
    formaPagamento: 'boleto',
    parcelas: []
  };
  setCondicaoPagamentoNF(state, 'parcelado', 712.25);
  const payload = buildSavePayload(state);

  assert.equal(payload.condicao, 'parcelado');
  assert.equal(payload.parcelas.length, 2);
  const total = payload.parcelas.reduce((s, p) => s + p.valor, 0);
  assert.equal(Math.round(total * 100) / 100, 712.25);
});

test('CENÁRIO D: A PRAZO 3x', () => {
  const state = {
    condicao: 'parcelado',
    qtdParcelas: 3,
    intervaloDias: 30,
    primeiroVencimento: '2026-10-06',
    formaPagamento: 'transferencia',
    parcelas: []
  };
  setCondicaoPagamentoNF(state, 'parcelado', 712.25);
  const payload = buildSavePayload(state);

  assert.equal(payload.condicao, 'parcelado');
  assert.equal(payload.parcelas.length, 3);
  assert.equal(payload.formaPagamento, 'transferencia');
  const total = payload.parcelas.reduce((s, p) => s + p.valor, 0);
  assert.equal(Math.round(total * 100) / 100, 712.25);
});

test('CENÁRIO E: Rateio exato de centavos (sem sobra de R$ 0,01)', () => {
  const state = {
    condicao: 'parcelado',
    qtdParcelas: 3,
    intervaloDias: 30,
    primeiroVencimento: '2026-10-01',
    parcelas: []
  };
  // 100.00 / 3 => 33.34 + 33.33 + 33.33 = 100.00
  gerarParcelasPagamentoNF(state, 100.00);
  assert.equal(state.parcelas[0].valor, 33.34);
  assert.equal(state.parcelas[1].valor, 33.33);
  assert.equal(state.parcelas[2].valor, 33.33);
  const total1 = state.parcelas.reduce((s, p) => s + p.valor, 0);
  assert.equal(Math.round(total1 * 100) / 100, 100.00);

  // 712.25 / 3 => 237.42 + 237.42 + 237.41 = 712.25
  gerarParcelasPagamentoNF(state, 712.25);
  assert.equal(state.parcelas[0].valor, 237.42);
  assert.equal(state.parcelas[1].valor, 237.42);
  assert.equal(state.parcelas[2].valor, 237.41);
  const total2 = state.parcelas.reduce((s, p) => s + p.valor, 0);
  assert.equal(Math.round(total2 * 100) / 100, 712.25);
});

test('CENÁRIO F: XML com 1 vencimento futuro preserva A PRAZO quando tipo_condicao_financeira = parcelado', () => {
  const nf = {
    valor_total: 712.25,
    tipo_condicao_financeira: 'parcelado',
    observacao_financeira: ''
  };
  const parcelasExistentes = [{
    numero_parcela: 1,
    vencimento: '2026-10-06',
    valor: 712.25,
    forma_pagamento: 'boleto'
  }];

  const state = getEntradaNFPagamentoState('dd0953a2-7032-4297-8374-6b950c84169e', nf, parcelasExistentes);
  assert.equal(state.condicao, 'parcelado', 'Não deve converter para a_vista');
  assert.equal(state.parcelas.length, 1);
  assert.equal(state.parcelas[0].vencimento, '2026-10-06');
});

test('CENÁRIO G: XML com múltiplos vencimentos', () => {
  const nf = {
    valor_total: 1000.00,
    tipo_condicao_financeira: 'parcelado'
  };
  const parcelasExistentes = [
    { numero_parcela: 1, vencimento: '2026-10-10', valor: 500.00, forma_pagamento: 'boleto' },
    { numero_parcela: 2, vencimento: '2026-11-10', valor: 500.00, forma_pagamento: 'boleto' }
  ];

  const state = getEntradaNFPagamentoState('dummy-id', nf, parcelasExistentes);
  assert.equal(state.condicao, 'parcelado');
  assert.equal(state.parcelas.length, 2);
  assert.equal(state.parcelas[0].vencimento, '2026-10-10');
  assert.equal(state.parcelas[1].vencimento, '2026-11-10');
});

function updatePagamentoField(state, field, value) {
  if (!state) return;
  state[field] = value;
  if (field === 'primeiroVencimento') {
    if (state.parcelas && state.parcelas.length === 1) {
      state.parcelas[0].vencimento = value;
    }
  }
}

function updateParcelaPagamentoField(state, index, field, value) {
  if (!state || !state.parcelas[index]) return;
  if (field === 'valor') {
    state.parcelas[index].valor = parseDecimal(value || 0);
  } else if (field === 'vencimento') {
    state.parcelas[index].vencimento = value;
    if (index === 0) {
      state.primeiroVencimento = value;
    }
  }
}

test('CENÁRIO H: A PRAZO 1x + alteração de data de primeiroVencimento', () => {
  const state = {
    condicao: 'parcelado',
    qtdParcelas: 1,
    primeiroVencimento: '2026-10-06',
    formaPagamento: 'boleto',
    parcelas: [{ numero: 1, vencimento: '2026-10-06', valor: 1463.35 }]
  };

  // Usuário altera a data de vencimento no campo
  updatePagamentoField(state, 'primeiroVencimento', '2026-11-15');

  assert.equal(state.condicao, 'parcelado', 'Condição DEVE continuar parcelado');
  assert.equal(state.primeiroVencimento, '2026-11-15');
  assert.equal(state.parcelas.length, 1);
  assert.equal(state.parcelas[0].vencimento, '2026-11-15', 'Parcela única deve ter a data sincronizada');
  assert.equal(state.parcelas[0].valor, 1463.35);

  const payload = buildSavePayload(state);
  assert.equal(payload.condicao, 'parcelado');
  assert.equal(payload.parcelas[0].vencimento, '2026-11-15');
});

test('CENÁRIO I: A PRAZO 2x + alteração de primeiro vencimento e regeneração', () => {
  const state = {
    condicao: 'parcelado',
    qtdParcelas: 2,
    intervaloDias: 30,
    primeiroVencimento: '2026-10-06',
    formaPagamento: 'boleto',
    parcelas: []
  };

  updatePagamentoField(state, 'primeiroVencimento', '2026-11-01');
  gerarParcelasPagamentoNF(state, 1463.35);

  assert.equal(state.condicao, 'parcelado');
  assert.equal(state.parcelas.length, 2);
  assert.equal(state.parcelas[0].vencimento, '2026-11-01');
  assert.equal(state.parcelas[1].vencimento, '2026-12-01');

  // Alteração manual da data da 2ª parcela via grade
  updateParcelaPagamentoField(state, 1, 'vencimento', '2026-12-05');
  assert.equal(state.parcelas[1].vencimento, '2026-12-05');
});

test('CENÁRIO J: À VISTA + alteração de data de vencimento', () => {
  const state = {
    condicao: 'a_vista',
    qtdParcelas: 1,
    primeiroVencimento: '2026-10-03',
    formaPagamento: 'pix',
    parcelas: [{ numero: 1, vencimento: '2026-10-03', valor: 1463.35 }]
  };

  updatePagamentoField(state, 'primeiroVencimento', '2026-10-10');

  assert.equal(state.condicao, 'a_vista');
  assert.equal(state.primeiroVencimento, '2026-10-10');
  assert.equal(state.parcelas.length, 1);
  assert.equal(state.parcelas[0].vencimento, '2026-10-10');

  const payload = buildSavePayload(state);
  assert.equal(payload.condicao, 'a_vista');
  assert.equal(payload.parcelas[0].vencimento, '2026-10-10');
});

