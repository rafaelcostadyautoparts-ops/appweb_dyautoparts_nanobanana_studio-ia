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

// Simulando o estado e lógica exatamente como em public/app.js
const entradaNFComplementarUIState = {};

function getEntradaNFComplementarCleanState() {
  const today = new Date().toISOString().split('T')[0];
  return {
    isModalOpen: false,
    isMockActive: false,
    complementarId: null,
    descricao: '',
    valorTotal: 0,
    incorporarCusto: true,
    parcelas: [
      { numero: 1, vencimento: today, valor: 0 }
    ]
  };
}

function resetEntradaNFComplementarState(entradaId) {
  entradaNFComplementarUIState[entradaId] = getEntradaNFComplementarCleanState();
  return entradaNFComplementarUIState[entradaId];
}

function getEntradaNFComplementarState(entradaId) {
  if (!entradaNFComplementarUIState[entradaId]) {
    entradaNFComplementarUIState[entradaId] = getEntradaNFComplementarCleanState();
  }
  return entradaNFComplementarUIState[entradaId];
}

function openModalComplementarNF(entradaId, complementarExistente = null) {
  if (complementarExistente) {
    const today = new Date().toISOString().split('T')[0];
    const parcelas = (complementarExistente.parcelas || []).map((p, idx) => ({
      numero: Number(p.numero_parcela || p.parcela || idx + 1),
      vencimento: p.vencimento || p.data_vencimento || today,
      valor: parseDecimal(p.valor || 0)
    }));
    const valorTotal = parseDecimal(complementarExistente.valor_total || parcelas.reduce((sum, p) => sum + p.valor, 0));
    entradaNFComplementarUIState[entradaId] = {
      isModalOpen: true,
      isMockActive: false,
      complementarId: complementarExistente.complementar_id || null,
      descricao: complementarExistente.descricao || '',
      valorTotal: valorTotal,
      incorporarCusto: complementarExistente.incorporar_custo !== undefined ? !!complementarExistente.incorporar_custo : true,
      parcelas: parcelas.length > 0 ? parcelas : [
        { numero: 1, vencimento: today, valor: valorTotal }
      ]
    };
  } else {
    const state = resetEntradaNFComplementarState(entradaId);
    state.isModalOpen = true;
  }
}

function closeModalComplementarNF(entradaId) {
  resetEntradaNFComplementarState(entradaId);
}

function updateComplementarField(entradaId, field, value) {
  const state = getEntradaNFComplementarState(entradaId);
  if (field === 'valorTotal') {
    const prevTotal = state.valorTotal;
    state.valorTotal = parseDecimal(value);
    if (state.parcelas && state.parcelas.length === 1 && (state.parcelas[0].valor === 0 || state.parcelas[0].valor === prevTotal)) {
      state.parcelas[0].valor = state.valorTotal;
    }
  } else if (field === 'incorporarCusto') {
    state.incorporarCusto = !!value;
  } else {
    state[field] = value;
  }
}

function addComplementarParcela(entradaId) {
  const state = getEntradaNFComplementarState(entradaId);
  const nextNum = state.parcelas.length + 1;
  const lastVenc = state.parcelas.length > 0 ? state.parcelas[state.parcelas.length - 1].vencimento : null;
  let nextVenc = new Date().toISOString().split('T')[0];
  if (lastVenc) {
    try {
      const d = new Date(lastVenc + 'T12:00:00');
      d.setDate(d.getDate() + 30);
      nextVenc = d.toISOString().split('T')[0];
    } catch (_) {}
  }
  state.parcelas.push({ numero: nextNum, vencimento: nextVenc, valor: 0 });
}

function removeComplementarParcela(entradaId, index) {
  const state = getEntradaNFComplementarState(entradaId);
  if (state.parcelas.length <= 1) return;
  state.parcelas.splice(index, 1);
  state.parcelas.forEach((p, idx) => { p.numero = idx + 1; });
}

function updateComplementarParcelaField(entradaId, index, field, value) {
  const state = getEntradaNFComplementarState(entradaId);
  const p = state.parcelas[index];
  if (!p) return;
  if (field === 'valor') {
    p.valor = parseDecimal(value);
  } else {
    p[field] = value;
  }
}

function calcularValidacaoComplementar(state) {
  const somaParcelasComp = state.parcelas.reduce((sum, p) => sum + parseDecimal(p.valor), 0);
  const diffParcelasComp = Math.round((state.valorTotal - somaParcelasComp) * 100) / 100;
  const parcelasValidasComp = Math.abs(diffParcelasComp) <= 0.01 && state.valorTotal > 0 && state.parcelas.every(p => p.valor > 0 && p.vencimento);
  return { somaParcelasComp, diffParcelasComp, parcelasValidasComp };
}

test('A) abrir NOVO complementar: estado limpo e neutro', () => {
  const nfId = 'b8735077-a40f-4690-ba7b-a1e5a5640d98';
  openModalComplementarNF(nfId);
  const state = getEntradaNFComplementarState(nfId);

  assert.equal(state.isModalOpen, true);
  assert.equal(state.complementarId, null);
  assert.equal(state.descricao, '');
  assert.equal(state.valorTotal, 0);
  assert.equal(state.incorporarCusto, true);
  assert.equal(state.parcelas.length, 1);
  assert.equal(state.parcelas[0].numero, 1);
  assert.equal(state.parcelas[0].valor, 0);
  assert.ok(state.parcelas[0].vencimento);

  const { parcelasValidasComp } = calcularValidacaoComplementar(state);
  assert.equal(parcelasValidasComp, false, 'Modal limpo com valor 0 deve estar com botão de salvar desabilitado');
});

test('B) preencher dados, CANCELAR e abrir novamente: não reutiliza dados cancelados', () => {
  const nfId = 'b8735077-a40f-4690-ba7b-a1e5a5640d98';
  openModalComplementarNF(nfId);
  
  // Preencher dados parciais
  updateComplementarField(nfId, 'descricao', 'Frete cancelado');
  updateComplementarField(nfId, 'valorTotal', 250);
  addComplementarParcela(nfId);
  updateComplementarParcelaField(nfId, 0, 'valor', 100);
  updateComplementarParcelaField(nfId, 1, 'valor', 150);

  // Usuário cancela/fecha o modal
  closeModalComplementarNF(nfId);
  assert.equal(getEntradaNFComplementarState(nfId).isModalOpen, false);

  // Reabre NOVO complementar
  openModalComplementarNF(nfId);
  const reaberto = getEntradaNFComplementarState(nfId);

  assert.equal(reaberto.descricao, '', 'Descrição deve estar vazia após reabertura');
  assert.equal(reaberto.valorTotal, 0, 'Valor total deve estar zerado após reabertura');
  assert.equal(reaberto.parcelas.length, 1, 'Deve conter apenas 1 parcela padrão');
  assert.equal(reaberto.parcelas[0].valor, 0, 'Parcela padrão deve estar zerada');
});

test('C) editar complementar existente: carrega dados corretos daquele complementar', () => {
  const nfId = 'b8735077-a40f-4690-ba7b-a1e5a5640d98';
  const complementarExistente = {
    complementar_id: 'comp-uuid-999',
    descricao: 'Frete Terceirizado Especial',
    valor_total: 450.00,
    incorporar_custo: false,
    parcelas: [
      { numero_parcela: 1, vencimento: '2026-11-10', valor: 200.00 },
      { numero_parcela: 2, vencimento: '2026-12-10', valor: 250.00 }
    ]
  };

  openModalComplementarNF(nfId, complementarExistente);
  const state = getEntradaNFComplementarState(nfId);

  assert.equal(state.isModalOpen, true);
  assert.equal(state.complementarId, 'comp-uuid-999');
  assert.equal(state.descricao, 'Frete Terceirizado Especial');
  assert.equal(state.valorTotal, 450.00);
  assert.equal(state.incorporarCusto, false);
  assert.equal(state.parcelas.length, 2);
  assert.equal(state.parcelas[0].valor, 200.00);
  assert.equal(state.parcelas[1].valor, 250.00);

  const { parcelasValidasComp, diffParcelasComp } = calcularValidacaoComplementar(state);
  assert.equal(diffParcelasComp, 0);
  assert.equal(parcelasValidasComp, true);
});

test('D) fechar edição e abrir NOVO: não herda dados da edição', () => {
  const nfId = 'b8735077-a40f-4690-ba7b-a1e5a5640d98';
  const complementarExistente = {
    complementar_id: 'comp-uuid-999',
    descricao: 'Frete Terceirizado Especial',
    valor_total: 450.00,
    incorporar_custo: false,
    parcelas: [
      { numero_parcela: 1, vencimento: '2026-11-10', valor: 200.00 },
      { numero_parcela: 2, vencimento: '2026-12-10', valor: 250.00 }
    ]
  };

  openModalComplementarNF(nfId, complementarExistente);
  closeModalComplementarNF(nfId);

  // Abre NOVO
  openModalComplementarNF(nfId);
  const state = getEntradaNFComplementarState(nfId);

  assert.equal(state.complementarId, null);
  assert.equal(state.descricao, '');
  assert.equal(state.valorTotal, 0);
  assert.equal(state.incorporarCusto, true);
  assert.equal(state.parcelas.length, 1);
  assert.equal(state.parcelas[0].valor, 0);
});

test('E) duas NFs diferentes: estado não vaza entre elas', () => {
  const nf1 = 'nf-uuid-001';
  const nf2 = 'nf-uuid-002';

  openModalComplementarNF(nf1);
  updateComplementarField(nf1, 'descricao', 'Complementar NF 1');
  updateComplementarField(nf1, 'valorTotal', 300);

  // NF 2 abre NOVO
  openModalComplementarNF(nf2);
  const state2 = getEntradaNFComplementarState(nf2);

  assert.equal(state2.descricao, '');
  assert.equal(state2.valorTotal, 0);
  assert.equal(state2.parcelas[0].valor, 0);

  // NF 1 permanece com seu próprio estado isolado
  const state1 = getEntradaNFComplementarState(nf1);
  assert.equal(state1.descricao, 'Complementar NF 1');
  assert.equal(state1.valorTotal, 300);
});

test('F) validação: Valor total 100, parcelas 500 + 674,42 continua corretamente BLOQUEADO', () => {
  const nfId = 'b8735077-a40f-4690-ba7b-a1e5a5640d98';
  openModalComplementarNF(nfId);

  const state = getEntradaNFComplementarState(nfId);
  state.valorTotal = 100.00;
  state.parcelas = [
    { numero: 1, vencimento: '2026-10-15', valor: 500.00 },
    { numero: 2, vencimento: '2026-11-15', valor: 674.42 }
  ];

  const { somaParcelasComp, diffParcelasComp, parcelasValidasComp } = calcularValidacaoComplementar(state);
  assert.equal(somaParcelasComp, 1174.42);
  assert.equal(diffParcelasComp, -1074.42);
  assert.equal(parcelasValidasComp, false, 'Deve estar bloqueado');
});

test('G) configuração válida: Valor total 100, 1 parcela 100 fica válida', () => {
  const nfId = 'b8735077-a40f-4690-ba7b-a1e5a5640d98';
  openModalComplementarNF(nfId);

  // Usuário preenche valor total 100 na UI (com 1 parcela vazia/zero)
  updateComplementarField(nfId, 'valorTotal', 100);
  const state = getEntradaNFComplementarState(nfId);

  assert.equal(state.valorTotal, 100.00);
  assert.equal(state.parcelas.length, 1);
  assert.equal(state.parcelas[0].valor, 100.00);

  const { somaParcelasComp, diffParcelasComp, parcelasValidasComp } = calcularValidacaoComplementar(state);
  assert.equal(somaParcelasComp, 100.00);
  assert.equal(diffParcelasComp, 0);
  assert.equal(parcelasValidasComp, true, 'Deve estar válida e habilitada para salvar');
});
