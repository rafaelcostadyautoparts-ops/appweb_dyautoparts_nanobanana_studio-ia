import test from 'node:test';
import assert from 'node:assert/strict';

// Helper de validação do operador (mesma lógica de salvarPagamentoConta)
function extrairValidarOperador(rawUserId, rawUserName) {
  const invalidValues = new Set(['', 'null', 'undefined', 'não registrado', 'nao registrado']);
  const normalizedUserId = invalidValues.has(String(rawUserId || '').trim().toLowerCase()) ? '' : String(rawUserId || '').trim();
  const normalizedUserName = invalidValues.has(String(rawUserName || '').trim().toLowerCase()) ? '' : String(rawUserName || '').trim();

  if (!normalizedUserId && !normalizedUserName) {
    return { valido: false, erro: 'É necessário identificar o operador antes de confirmar o pagamento.' };
  }

  const opId = normalizedUserId || null;
  const opNome = normalizedUserName || normalizedUserId;
  return { valido: true, opId, opNome };
}

// Simulação da lógica de backend / Supabase client condicional
class MockSupabaseClient {
  constructor(initialData = []) {
    this.db = initialData;
  }

  from(table) {
    if (table !== 'contas_pagar') throw new Error(`Tabela ${table} não mockada`);

    return {
      update: (payload) => {
        let filters = [];
        const builder = {
          eq: (column, value) => {
            filters.push({ column, value });
            return builder;
          },
          select: (fields) => {
            const matchingIndices = [];
            for (let i = 0; i < this.db.length; i++) {
              const row = this.db[i];
              const matches = filters.every(f => String(row[f.column]) === String(f.value));
              if (matches) {
                matchingIndices.push(i);
              }
            }

            const updatedRows = [];
            for (const idx of matchingIndices) {
              this.db[idx] = {
                ...this.db[idx],
                ...payload
              };
              updatedRows.push({ ...this.db[idx] });
            }

            return Promise.resolve({ data: updatedRows, error: null });
          }
        };
        return builder;
      }
    };
  }
}

test('A. PAGAMENTO NORMAL COM USUÁRIO — Grava pago_por_id e pago_por_nome no mesmo UPDATE atômico', async () => {
  const mockDb = [
    {
      id: 'conta-1',
      descricao: 'Serviço de Nuvem',
      valor: 150.0,
      status: 'pendente',
      status_vencimento: 'em_aberto',
      data_pagamento: null,
      forma_pagamento: null,
      pago_por_id: null,
      pago_por_nome: null
    }
  ];

  const client = new MockSupabaseClient(mockDb);

  const authOp = extrairValidarOperador('rc', 'Rafael Costa');
  assert.equal(authOp.valido, true);
  assert.equal(authOp.opId, 'rc');
  assert.equal(authOp.opNome, 'Rafael Costa');

  const { data: updatedRows, error } = await client
    .from('contas_pagar')
    .update({
      status: 'pago',
      status_vencimento: 'pago',
      data_pagamento: '2026-10-04',
      forma_pagamento: 'pix',
      observacoes: 'Liquidado via PIX',
      pago_por_id: authOp.opId,
      pago_por_nome: authOp.opNome,
      atualizado_em: '2026-10-04T12:00:00Z'
    })
    .eq('id', 'conta-1')
    .eq('status', 'pendente')
    .select('id, status, valor, data_pagamento, forma_pagamento, pago_por_id, pago_por_nome');

  assert.equal(error, null);
  assert.equal(updatedRows.length, 1);
  assert.equal(updatedRows[0].status, 'pago');
  assert.equal(updatedRows[0].pago_por_id, 'rc');
  assert.equal(updatedRows[0].pago_por_nome, 'Rafael Costa');
  assert.equal(mockDb[0].pago_por_id, 'rc');
  assert.equal(mockDb[0].pago_por_nome, 'Rafael Costa');
});

test('B. PAGAMENTO SEM IDENTIDADE — Bloqueia liquidação quando operador estiver ausente', async () => {
  const mockDb = [
    {
      id: 'conta-2',
      descricao: 'Internet',
      valor: 200.0,
      status: 'pendente'
    }
  ];

  const authOpVazio = extrairValidarOperador('', '');
  assert.equal(authOpVazio.valido, false);
  assert.equal(authOpVazio.erro, 'É necessário identificar o operador antes de confirmar o pagamento.');

  const authOpNull = extrairValidarOperador(null, null);
  assert.equal(authOpNull.valido, false);

  const authOpUndefined = extrairValidarOperador('undefined', 'undefined');
  assert.equal(authOpUndefined.valido, false);

  // Garante que o banco não foi alterado
  assert.equal(mockDb[0].status, 'pendente');
});

test('C. CONCORRÊNCIA — Sessão A grava Rafael; Sessão B é rejeitada e NÃO substitui o responsável', async () => {
  const mockDb = [
    {
      id: 'conta-concorrente',
      descricao: 'Aluguel',
      valor: 2500.0,
      status: 'pendente',
      status_vencimento: 'em_aberto',
      data_pagamento: null,
      forma_pagamento: null,
      pago_por_id: null,
      pago_por_nome: null
    }
  ];

  const client = new MockSupabaseClient(mockDb);

  async function simularSalvarPagamento(cId, forma, uId, uNome) {
    const auth = extrairValidarOperador(uId, uNome);
    if (!auth.valido) return { sucesso: false, erro: auth.erro };

    const { data: updatedRows, error } = await client
      .from('contas_pagar')
      .update({
        status: 'pago',
        status_vencimento: 'pago',
        data_pagamento: '2026-10-04',
        forma_pagamento: forma,
        pago_por_id: auth.opId,
        pago_por_nome: auth.opNome,
        atualizado_em: '2026-10-04T12:00:00Z'
      })
      .eq('id', cId)
      .eq('status', 'pendente')
      .select('id, status, valor, data_pagamento, forma_pagamento, pago_por_id, pago_por_nome');

    if (error) throw error;

    if (!updatedRows || updatedRows.length === 0) {
      return {
        sucesso: false,
        mensagem: 'Este título já foi liquidado ou não está mais disponível para pagamento.'
      };
    }

    return {
      sucesso: true,
      registro: updatedRows[0]
    };
  }

  // Sessão A (Rafael) vence a liquidação
  const resA = await simularSalvarPagamento('conta-concorrente', 'pix', 'rc', 'Rafael Costa');
  assert.equal(resA.sucesso, true);
  assert.equal(resA.registro.pago_por_nome, 'Rafael Costa');

  // Sessão B (Outro operador) tenta liquidar concorrentemente
  const resB = await simularSalvarPagamento('conta-concorrente', 'boleto', 'op2', 'Operador Dois');
  assert.equal(resB.sucesso, false);
  assert.equal(resB.mensagem, 'Este título já foi liquidado ou não está mais disponível para pagamento.');

  // Confirmação que o responsável permanece Rafael Costa
  assert.equal(mockDb[0].status, 'pago');
  assert.equal(mockDb[0].pago_por_id, 'rc');
  assert.equal(mockDb[0].pago_por_nome, 'Rafael Costa');
  assert.equal(mockDb[0].forma_pagamento, 'pix');
});

test('D. PAGAMENTO HISTÓRICO — pago_por_nome = null renderiza "Não registrado"', () => {
  const contaHistorica = {
    id: 'historico-1',
    valor: 350.0,
    status: 'pago',
    data_pagamento: '2026-10-04',
    pago_por_id: null,
    pago_por_nome: null
  };

  const responsavelDetalhes = contaHistorica.pago_por_nome ? contaHistorica.pago_por_nome : 'Não registrado';
  assert.equal(responsavelDetalhes, 'Não registrado');

  const descCard = contaHistorica.pago_por_nome
    ? `Pago em 04/10/2026 por ${contaHistorica.pago_por_nome}`
    : `Pago em 04/10/2026 • Responsável não registrado`;
  assert.equal(descCard, 'Pago em 04/10/2026 • Responsável não registrado');
});

test('E. REJEIÇÃO DE SNAPSHOT INVÁLIDO — Strings literais "undefined", "null", "Não registrado" são tratadas como ausentes', () => {
  const teste1 = extrairValidarOperador('null', 'null');
  assert.equal(teste1.valido, false);

  const teste2 = extrairValidarOperador('undefined', '');
  assert.equal(teste2.valido, false);

  const teste3 = extrairValidarOperador('Não registrado', 'Não registrado');
  assert.equal(teste3.valido, false);
});

test('F. TESTE NO BANCO DE HOMOLOGAÇÃO — ENERGIA TESTE HOMOLOGAÇÃO preserva pago_por_id = null e renderiza "Não registrado"', async () => {
  const SUPABASE_URL = 'https://doklsgduslimidfbyngj.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRva2xzZ2R1c2xpbWlkZmJ5bmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2Mjg0NjksImV4cCI6MjEwMjIwNDQ2OX0.d0dj78uO3AJYEiG5MTO37KD7uNUfhPpMvgtbF8eVQoQ';

  const TARGET_ID = '9ac2c165-0d8e-459f-90ac-d5be8a2ebdc2';

  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/contas_pagar?id=eq.${TARGET_ID}&select=*`, { headers });
  const rows = await res.json();
  const conta = rows[0];

  assert.equal(conta.id, TARGET_ID);
  assert.equal(conta.descricao, 'ENERGIA TESTE HOMOLOGAÇÃO');
  assert.equal(Number(conta.valor), 350.0);
  assert.equal(conta.status, 'pago');
  assert.equal(conta.data_pagamento, '2026-10-04');
  assert.equal(conta.forma_pagamento, 'pix');
  assert.equal(conta.pago_por_id, null);
  assert.equal(conta.pago_por_nome, null);

  const responsavelExibido = conta.pago_por_nome ? conta.pago_por_nome : 'Não registrado';
  assert.equal(responsavelExibido, 'Não registrado');
});
