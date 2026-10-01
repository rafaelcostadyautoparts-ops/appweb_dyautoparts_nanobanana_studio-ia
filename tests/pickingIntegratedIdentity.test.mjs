import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('public/app.js', 'utf8');
const ast = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true);

function getFunctionSource(name) {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node, `Funcao ${name} nao encontrada no AST`);
  return node.getText(ast);
}

function getVariableDeclarationSource(name) {
  const statement = ast.statements.find(n =>
    ts.isVariableStatement(n) &&
    n.declarationList.declarations.some(d => d.name?.text === name)
  );
  assert.ok(statement, `Variavel ${name} nao encontrada no AST`);
  return statement.getText(ast);
}

function createTestEnv(overrides = {}) {
  const queuedOps = [];
  const progressCalls = [];
  const savedDrafts = [];

  const context = {
    console: { warn() {}, log() {}, error() {}, info() {} },
    navigator: { onLine: true },
    localStorage: { getItem: () => 'Operador Teste' },
    PICK_STATUS_DRAFT: 'em_separacao',
    currentPickingContext: null,
    currentSessionItems: [],
    getPickingProductId: (item) => item?.id_interno || '',
    normalizePickPackageAssignments: (item) => {
      const qty = Math.max(0, Math.floor(Number(item.qty ?? item.qtd_separada ?? 1)));
      return Array.isArray(item.pick_package_assignments)
        ? item.pick_package_assignments.slice(0, qty)
        : Array(qty).fill('PKG-001');
    },
    buildPickingSessionPayload: (sessionId, channelId, channelLabel, status, createdAt) => ({
      sessionId, channelId, channelLabel, status, createdAt
    }),
    buildPickingItemPayload: (item) => ({
      id_interno: item.id_interno || '',
      ean: item.ean || '',
      qtd_solicitada: item.qtd_solicitada ?? item.qtd ?? 0,
      qtd_separada: item.qtd_separada ?? item.qty ?? 0
    }),
    createProgressOperationId: (flow, sessionId, idInterno) => `op:${flow}:${sessionId}:${idInterno}`,
    getProgressDeviceId: () => 'DEV-TEST-01',
    saveDraftPickSession: (s) => { savedDrafts.push(s); },
    queueOperation: async (name, payload, meta) => { queuedOps.push({ name, payload, meta }); },
    withTimeout: async (p) => p,
    DataClient: {
      savePickingDraftSupabase: async (payload) => { savedDrafts.push(payload); return { ok: true }; }
    },
    sendOrQueueProgressOperation: async (payload) => {
      progressCalls.push(payload);
      if (typeof context.DataClient?.aplicarOperacaoProgressoSupabase === 'function') {
        return context.DataClient.aplicarOperacaoProgressoSupabase(payload);
      }
      return { ok: true, synced: true };
    },
    countDifferentPickProducts: (items) => (items || []).length,
    window: { PEDIDOS_PREVIEW_AMOSTRA: [] },
    isRetryableConferenceSyncError: (err) => true,
    _testRecords: { queuedOps, progressCalls, savedDrafts },
    ...overrides
  };
  vm.createContext(context);
  return context;
}

test('buildPickPackagesSyncPayload enriquece itens com id_interno_canonico e separacao_item_id', () => {
  const env = createTestEnv();
  const fnCode = getFunctionSource('buildPickPackagesSyncPayload');
  vm.runInContext(fnCode, env);

  const items = [
    {
      id: '2227e126-2747-4ce4-b42c-e3dc84482e32',
      separacao_item_id: '2227e126-2747-4ce4-b42c-e3dc84482e32',
      id_interno_canonico: 'PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7',
      id_interno: 'DY-000.468',
      ean: '7896498550317',
      qtd_solicitada: 4,
      qtd_separada: 4,
      qty: 4,
      pick_package_assignments: ['PKG-001', 'PKG-001', 'PKG-001', 'PKG-001']
    }
  ];

  const packages = env.buildPickPackagesSyncPayload(items);
  assert.equal(packages.length, 1);
  assert.equal(packages[0].pacote_id, 'PKG-001');
  assert.equal(packages[0].tipo, 'AGRUPADO');
  assert.equal(packages[0].itens.length, 1);
  assert.equal(packages[0].itens[0].id_interno, 'DY-000.468');
  assert.equal(packages[0].itens[0].id_interno_canonico, 'PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7');
  assert.equal(packages[0].itens[0].separacao_item_id, '2227e126-2747-4ce4-b42c-e3dc84482e32');
  assert.equal(packages[0].itens[0].ean, '7896498550317');
  assert.equal(packages[0].itens[0].quantidade, 4);
});

test('buildPickPackagesSyncPayload preserva fluxo manual sem referencias canonicas', () => {
  const env = createTestEnv();
  const fnCode = getFunctionSource('buildPickPackagesSyncPayload');
  vm.runInContext(fnCode, env);

  const items = [
    {
      id_interno: 'DY-000.123',
      ean: '7891234567890',
      qty: 2,
      pick_package_assignments: ['PKG-001', 'PKG-001']
    }
  ];

  const packages = env.buildPickPackagesSyncPayload(items);
  assert.equal(packages.length, 1);
  assert.equal(packages[0].itens[0].id_interno, 'DY-000.123');
  assert.equal(packages[0].itens[0].id_interno_canonico, null);
  assert.equal(packages[0].itens[0].separacao_item_id, null);
  assert.equal(packages[0].itens[0].quantidade, 2);
});

test('buildPickPackagesSyncPayload protege contra quantidade excedente de pacotes', () => {
  const env = createTestEnv();
  const fnCode = getFunctionSource('buildPickPackagesSyncPayload');
  vm.runInContext(fnCode, env);

  const items = [
    {
      id: 'item-1',
      separacao_item_id: 'item-1',
      id_interno_canonico: 'PROD-1',
      id_interno: 'DY-000.468',
      qtd_separada: 2,
      qty: 2,
      pick_package_assignments: ['PKG-001', 'PKG-001', 'PKG-001', 'PKG-001']
    }
  ];

  const packages = env.buildPickPackagesSyncPayload(items);
  assert.equal(packages.length, 1);
  assert.equal(packages[0].itens[0].quantidade, 2);
});

test('persistPickingDraftItem envia progresso incremental usando id_interno_canonico e registra sku_fisico', async () => {
  const env = createTestEnv();
  const fnCode = getFunctionSource('persistPickingDraftItem');
  vm.runInContext(fnCode, env);

  const draft = { sessionId: 'SEP-PED-90', channelId: 'ML', channelLabel: 'Mercado Livre', createdAt: '2026-09-30' };
  const item = {
    id: '2227e126-2747-4ce4-b42c-e3dc84482e32',
    separacao_item_id: '2227e126-2747-4ce4-b42c-e3dc84482e32',
    id_interno_canonico: 'PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7',
    id_interno: 'DY-000.468',
    ean: '7896498550317',
    qtd_solicitada: 4,
    qtd_separada: 1,
    _sync_qtd_separada: 0
  };

  const res = await env.persistPickingDraftItem(draft, item);
  assert.equal(res.ok, true);
  assert.equal(env._testRecords.progressCalls.length, 1);

  const call = env._testRecords.progressCalls[0];
  assert.equal(call.flow, 'separacao');
  assert.equal(call.sessionId, 'SEP-PED-90');
  assert.equal(call.idInterno, 'PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7');
  assert.equal(call.delta, 1);
  assert.equal(call.item.id_interno, 'PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7');
  assert.equal(call.item.sku_fisico, 'DY-000.468');
  assert.equal(call.operationId, 'op:separacao:SEP-PED-90:PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7');
  assert.equal(item._sync_qtd_separada, 1);
});

test('persistPickingDraftItem preserva retry e enfileiramento offline com chave idempotente do canonico', async () => {
  const env = createTestEnv({ navigator: { onLine: false } });
  const fnCode = getFunctionSource('persistPickingDraftItem');
  vm.runInContext(fnCode, env);

  const draft = { sessionId: 'SEP-PED-90', channelId: 'ML', channelLabel: 'Mercado Livre' };
  const item = {
    id_interno_canonico: 'PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7',
    id_interno: 'DY-000.468',
    qtd_separada: 1,
    _sync_qtd_separada: 0
  };

  const res = await env.persistPickingDraftItem(draft, item);
  assert.equal(res.queued, true);
  assert.equal(env._testRecords.queuedOps.length, 2);

  const progOp = env._testRecords.queuedOps.find(o => o.name === 'supabase_progress');
  assert.ok(progOp);
  assert.equal(progOp.meta.itemId, 'PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7');
  assert.equal(progOp.meta.queueKey, 'supabase_progress:op:separacao:SEP-PED-90:PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7');
});

test('persistPickingDraftItem em fluxo manual usa id_interno como chave canonica padrao', async () => {
  const env = createTestEnv();
  const fnCode = getFunctionSource('persistPickingDraftItem');
  vm.runInContext(fnCode, env);

  const draft = { sessionId: 'SEP-MANUAL-01' };
  const item = {
    id_interno: 'DY-000.123',
    qtd_separada: 1,
    _sync_qtd_separada: 0
  };

  await env.persistPickingDraftItem(draft, item);
  assert.equal(env._testRecords.progressCalls.length, 1);
  const call = env._testRecords.progressCalls[0];
  assert.equal(call.idInterno, 'DY-000.123');
  assert.equal(call.item.id_interno, 'DY-000.123');
  assert.equal(call.item.sku_fisico, 'DY-000.123');
});

test('persistPickingDraftItem suporta sequencia incremental de bips (0 -> 1 -> 2 -> 3 -> 4) com avanco de delta e baseline', async () => {
  const env = createTestEnv();
  const fnCode = getFunctionSource('persistPickingDraftItem');
  vm.runInContext(fnCode, env);

  const draft = { sessionId: 'SEP-PED-90' };
  const item = {
    id: '2227e126-2747-4ce4-b42c-e3dc84482e32',
    separacao_item_id: '2227e126-2747-4ce4-b42c-e3dc84482e32',
    id_interno_canonico: 'PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7',
    id_interno: 'DY-000.468',
    ean: '7896498550317',
    qtd_solicitada: 4,
    qtd_separada: 0,
    _sync_qtd_separada: 0
  };

  // 1º bip: 0 -> 1
  item.qtd_separada = 1;
  const res1 = await env.persistPickingDraftItem(draft, item);
  assert.equal(res1.ok, true);
  assert.equal(env._testRecords.progressCalls.length, 1);
  assert.equal(env._testRecords.progressCalls[0].delta, 1);
  assert.equal(item._sync_qtd_separada, 1);

  // 2º bip: 1 -> 2
  item.qtd_separada = 2;
  const res2 = await env.persistPickingDraftItem(draft, item);
  assert.equal(res2.ok, true);
  assert.equal(env._testRecords.progressCalls.length, 2);
  assert.equal(env._testRecords.progressCalls[1].delta, 1);
  assert.equal(item._sync_qtd_separada, 2);

  // 3º bip: 2 -> 3
  item.qtd_separada = 3;
  const res3 = await env.persistPickingDraftItem(draft, item);
  assert.equal(res3.ok, true);
  assert.equal(env._testRecords.progressCalls.length, 3);
  assert.equal(env._testRecords.progressCalls[2].delta, 1);
  assert.equal(item._sync_qtd_separada, 3);

  // 4º bip: 3 -> 4
  item.qtd_separada = 4;
  const res4 = await env.persistPickingDraftItem(draft, item);
  assert.equal(res4.ok, true);
  assert.equal(env._testRecords.progressCalls.length, 4);
  assert.equal(env._testRecords.progressCalls[3].delta, 1);
  assert.equal(item._sync_qtd_separada, 4);
});

test('persistPickingDraftItem nao avanca baseline se ocorrer erro online nao-recuperavel', async () => {
  const env = createTestEnv({
    isRetryableConferenceSyncError: () => false,
    sendOrQueueProgressOperation: async () => {
      throw new Error('Falha fatal de permissao no banco');
    }
  });
  const fnCode = getFunctionSource('persistPickingDraftItem');
  vm.runInContext(fnCode, env);

  const draft = { sessionId: 'SEP-PED-90' };
  const item = {
    id_interno_canonico: 'PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7',
    id_interno: 'DY-000.468',
    qtd_separada: 1,
    _sync_qtd_separada: 0
  };

  await assert.rejects(
    async () => { await env.persistPickingDraftItem(draft, item); },
    /Falha fatal de permissao no banco/
  );

  assert.equal(item._sync_qtd_separada, 0, 'Baseline nao pode ser atualizado em erro fatal');
});

test('queuePickingPersist serializa bips rapidos (0 -> 1 -> 2 -> 3 -> 4) sem perda ou duplicacao', async () => {
  const env = createTestEnv();
  const queueDecl = getVariableDeclarationSource('pickingPersistQueue');
  const queueFnCode = getFunctionSource('queuePickingPersist');
  const persistFnCode = getFunctionSource('persistPickingDraftItem');

  vm.runInContext(queueDecl, env);
  vm.runInContext(persistFnCode, env);
  vm.runInContext(queueFnCode, env);

  const draft = { sessionId: 'SEP-PED-90' };
  const item = {
    id: '2227e126-2747-4ce4-b42c-e3dc84482e32',
    id_interno_canonico: 'PROD-a2789f2f-c4f6-43da-96da-e6db7411c2c7',
    id_interno: 'DY-000.468',
    qtd_solicitada: 4,
    qtd_separada: 0,
    _sync_qtd_separada: 0
  };

  // Simula 4 bips disparados muito rapidamente antes de cada chamada terminar
  item.qtd_separada = 1;
  const p1 = env.queuePickingPersist(draft, item);

  item.qtd_separada = 2;
  const p2 = env.queuePickingPersist(draft, item);

  item.qtd_separada = 3;
  const p3 = env.queuePickingPersist(draft, item);

  item.qtd_separada = 4;
  const p4 = env.queuePickingPersist(draft, item);

  await Promise.all([p1, p2, p3, p4]);

  assert.equal(env._testRecords.progressCalls.length, 4, 'Deve registrar exatamente 4 operacoes de progresso');
  assert.equal(env._testRecords.progressCalls[0].delta, 1);
  assert.equal(env._testRecords.progressCalls[1].delta, 1);
  assert.equal(env._testRecords.progressCalls[2].delta, 1);
  assert.equal(env._testRecords.progressCalls[3].delta, 1);
  assert.equal(item._sync_qtd_separada, 4, 'Baseline final deve ser 4');
});

test('isValidOfficialPickSessionId e isValidOfficialPickingSessionId reconhecem SEP-PED-N e legados, rejeitando invalidos', () => {
  const env = createTestEnv();
  const fnApp = getFunctionSource('isValidOfficialPickSessionId');
  vm.runInContext(fnApp, env);

  const dcSource = fs.readFileSync('public/dataClient.js', 'utf8');
  const match = dcSource.match(/function isValidOfficialPickingSessionId\(sessionId\)[\s\S]*?\n    \}/);
  assert.ok(match, 'isValidOfficialPickingSessionId nao encontrada no dataClient.js');
  vm.runInContext(match[0], env);

  // ACEITAR
  const validos = ['SEP-PED-90', 'SEP-PED-1', 'SEP-CORREIOS-2409-01'];
  for (const id of validos) {
    assert.equal(env.isValidOfficialPickSessionId(id), true, `app.js deveria aceitar ${id}`);
    assert.equal(env.isValidOfficialPickingSessionId(id), true, `dataClient.js deveria aceitar ${id}`);
  }

  // REJEITAR
  const invalidos = ['SEP-PED-', 'SEP-PED-ABC', 'SEP-PED-90-EXTRA', 'SEP-QUALQUER-COISA', ''];
  for (const id of invalidos) {
    assert.equal(env.isValidOfficialPickSessionId(id), false, `app.js deveria rejeitar ${id}`);
    assert.equal(env.isValidOfficialPickingSessionId(id), false, `dataClient.js deveria rejeitar ${id}`);
  }
});

test('Pedido Integrado 1 produto x 4 unidades gera 1 unico pacote PKG-001 com 4 unidades', () => {
  const env = createTestEnv();
  const fnNorm = getFunctionSource('normalizePickPackageAssignments');
  const fnPkgs = getFunctionSource('buildPickPackagesSyncPayload');
  vm.runInContext(fnNorm, env);
  vm.runInContext(fnPkgs, env);

  const items = [
    {
      id_interno: 'DY-000.468',
      qtd_separada: 4,
      isIntegratedOrder: true
    }
  ];

  const packages = env.buildPickPackagesSyncPayload(items);
  assert.equal(packages.length, 1, 'Deve gerar exatamente 1 pacote');
  assert.equal(packages[0].pacote_id, 'PKG-001');
  assert.equal(packages[0].tipo, 'AGRUPADO');
  assert.equal(packages[0].itens.length, 1);
  assert.equal(packages[0].itens[0].quantidade, 4);
});

test('Pedido Integrado multiproduto (A x 2, B x 3) sem divisao gera 1 unico pacote contendo 5 unidades', () => {
  const env = createTestEnv();
  const fnNorm = getFunctionSource('normalizePickPackageAssignments');
  const fnPkgs = getFunctionSource('buildPickPackagesSyncPayload');
  vm.runInContext(fnNorm, env);
  vm.runInContext(fnPkgs, env);

  const items = [
    { id_interno: 'PROD-A', qtd_separada: 2, isIntegratedOrder: true },
    { id_interno: 'PROD-B', qtd_separada: 3, isIntegratedOrder: true }
  ];

  const packages = env.buildPickPackagesSyncPayload(items);
  assert.equal(packages.length, 1, 'Deve gerar exatamente 1 pacote para todo o pedido');
  assert.equal(packages[0].pacote_id, 'PKG-001');
  assert.equal(packages[0].itens.length, 2);
  const totalUnits = packages[0].itens.reduce((s, i) => s + i.quantidade, 0);
  assert.equal(totalUnits, 5, 'Total de unidades no pacote deve ser 5');
});

test('modo manual sem activeOrder preserva geracao de avulsos quando assignments sao nulos', () => {
  const env = createTestEnv();
  const fnNorm = getFunctionSource('normalizePickPackageAssignments');
  const fnPkgs = getFunctionSource('buildPickPackagesSyncPayload');
  vm.runInContext(fnNorm, env);
  vm.runInContext(fnPkgs, env);

  const items = [
    { id_interno: 'DY-000.123', qtd_separada: 2 }
  ];

  const packages = env.buildPickPackagesSyncPayload(items);
  assert.equal(packages.length, 2, 'No modo manual sem atribuicao previa deve gerar 2 pacotes avulsos');
  assert.equal(packages[0].tipo, 'AVULSO');
  assert.equal(packages[1].tipo, 'AVULSO');
});

// ==========================================
// TESTES FASE 3.9: STATUS FINAL + REMOVER 1
// ==========================================

test('A) persistPickingFinal persiste separacao com status PICK_STATUS_FINISHED (finalizada)', async () => {
  const env = createTestEnv();
  const fnGenId = getFunctionSource('generateExecutionId');
  const fnPersist = getFunctionSource('persistPickingFinal');
  env.PICK_STATUS_FINISHED = 'finalizada';
  env.getPickingOperationalStats = () => ({ total_produtos_separados: 1, total_itens_separados: 4, total_pacotes_montados: 1 });
  env.currentPickSession = { items: [{ id_interno: 'DY-000.468', qtd_separada: 4 }] };
  let finalizedPayload = null;
  env.DataClient.finalizePickingDraftSupabase = async (payload) => {
    finalizedPayload = payload;
    return { ok: true };
  };

  vm.runInContext(fnGenId, env);
  vm.runInContext(fnPersist, env);

  await env.persistPickingFinal('SEP-PED-90');
  assert.ok(finalizedPayload, 'Deve ter chamado finalizePickingDraftSupabase');
  assert.equal(finalizedPayload.status, 'finalizada', 'Status persistido deve ser finalizada');
  assert.equal(finalizedPayload.total_itens_separados, 4);
  assert.equal(finalizedPayload.total_produtos_separados, 1);
});

test('B) savePickResultFinal atualiza pedido integrado para status_identificacao = separado', async () => {
  const env = createTestEnv();
  let statusAtualizado = null;
  let pedidoRefAtualizado = null;

  env.currentPickingContext = {
    sessionId: 'SEP-PED-90',
    activeOrder: {
      id: 90,
      external_order_id: '2000018356039444',
      account_name: 'Minha Conta',
      status_identificacao: 'pronto_separacao'
    }
  };
  env.currentPickSession = {
    id: 'SEP-PED-90',
    channel: 'Mercado Livre Agência',
    items: [{ id_interno: 'DY-000.468', qtd_separada: 4, qtd_solicitada: 4 }]
  };
  env.DataClient.atualizarStatusPedidoSeparadoSupabase = async (ref, status) => {
    pedidoRefAtualizado = ref;
    statusAtualizado = status;
    return [{ id: 90, status_identificacao: status }];
  };
  env.isFinalizing = false;
  env.showToast = () => {};
  env.showAppModal = async () => {};
  env.clearTimeout = () => {};
  env.ensureProdutosLoaded = async () => {};
  env.getDataHoraBrasil = () => '2026-10-01 10:00:00';
  env.getScopedDraftPickSession = () => ({ sessionId: 'SEP-PED-90' });
  env.getActivePickingFastMode = () => false;
  env.generateExecutionId = () => 'exec-1';
  env.sanitizePickSessionIdForChannel = (id) => id;
  env.assertValidPickSessionForPersist = () => {};
  env.isDraftPickSessionId = () => false;
  env.getPickingOperationalStats = () => ({ total_produtos_separados: 1, total_itens_separados: 4, total_pacotes_montados: 1 });
  env.persistPickingDraftItemsBatch = async () => ({ ok: true });
  env.flushPickingItemsBeforeFinalization = async () => ({ queued: false });
  env.runOperationalWrite = async (k, fn) => fn();
  env.getQueuedOperations = async () => [];
  env.markQueuedOperation = async () => {};
  env.performPickPackagesCloudSync = async () => ({ queued: false });
  env.buildFastPickingFinalRows = () => [];
  env.createPickingConferenceWithoutStock = async () => ({ ok: true });
  env.persistPickingFinal = async () => ({ success: true });
  env.clearFinishedPickingDraftState = async () => {};
  env.renderMenu = () => {};
  env.appData = { separacao: [] };
  env.rememberPickPackageTotal = () => {};
  env.saveOperationalCatalog = async () => {};
  env.console = { warn() {}, log() {}, error() {}, info() {} };
  env.pickPackageCloudSyncTimer = null;
  env.buildPickingSessionPayload = () => ({});
  env.currentPickSession.pickingData = { criado_em: 'agora', canal_nome: 'Mercado Livre Agência' };
  env.getActivePickSessions = () => [];
  env.setActivePickSessions = () => {};
  env.formatPickPackageAverage = () => '4.0';
  env.PICK_STATUS_FINISHED = 'finalizada';
  env.PICK_STATUS_DRAFT = 'em_separacao';
  env.PICK_MANUAL_OBSERVATION = 'SEPARACAO MANUAL';

  const fnSaveFinal = getFunctionSource('savePickResultFinal');
  vm.runInContext(fnSaveFinal, env);

  await env.savePickResultFinal('SEP-PED-90', 'canais_envio_viii', 'Mercado Livre Agência', '#3b82f6');
  assert.equal(statusAtualizado, 'separado', 'Deve chamar atualizarStatusPedidoSeparadoSupabase com separado');
  assert.equal(env.currentPickingContext.activeOrder.status_identificacao, 'separado');
});

test('D, E, F, G, H, I) REMOVER 1: 4/4 -> 3/4 (delta -1, bloqueia finalizacao, PKG-001 preservado, novo bip -> 4/4)', async () => {
  const env = createTestEnv();
  const progressDeltas = [];

  env.currentPickingContext = {
    sessionId: 'SEP-PED-90',
    activeOrder: {
      id: 90,
      external_order_id: '2000018356039444'
    }
  };

  const activeItem = {
    id: 'item-84',
    id_interno: 'PROD-a2789f2f',
    id_interno_canonico: 'PROD-a2789f2f',
    ean: '7896498550317',
    qtd_solicitada: 4,
    qtd_separada: 4,
    _sync_qtd_separada: 4,
    pick_package_assignments: ['PKG-001', 'PKG-001', 'PKG-001', 'PKG-001'],
    isIntegratedOrder: true,
    detalhes_operacionais: [{
      bipagens_fisicas: [
        { id_interno: 'DY-000.468', delta: 1 },
        { id_interno: 'DY-000.468', delta: 1 },
        { id_interno: 'DY-000.468', delta: 1 },
        { id_interno: 'DY-000.468', delta: 1 }
      ]
    }]
  };

  env.currentSessionItems = [activeItem];
  env.document = {
    getElementById: () => ({ innerHTML: '', textContent: '' }),
    querySelector: () => ({ disabled: false, style: {} })
  };
  env.updatePickItemsList = () => {};
  env.getCurrentPickDraftForUpdate = () => ({ sessionId: 'SEP-PED-90' });
  env.showToast = () => {};
  env.queuePickingPersist = async (draft, item) => {
    return env.persistPickingDraftItem(draft, item);
  };
  env.DataClient.aplicarOperacaoProgressoSupabase = async (payload) => {
    progressDeltas.push(payload.delta);
    return { ok: true };
  };

  const fnNorm = getFunctionSource('normalizePickPackageAssignments');
  const fnPersistItem = getFunctionSource('persistPickingDraftItem');
  const fnRemover = getFunctionSource('removerUnidadePedidoIntegrado');
  const fnPkgs = getFunctionSource('buildPickPackagesSyncPayload');

  vm.runInContext(fnNorm, env);
  vm.runInContext(fnPersistItem, env);
  vm.runInContext(fnRemover, env);
  vm.runInContext(fnPkgs, env);

  // 1. Estado inicial: 4/4
  assert.equal(activeItem.qtd_separada, 4);

  // 2. Executa REMOVER 1 (4 -> 3)
  await env.removerUnidadePedidoIntegrado(0);
  assert.equal(activeItem.qtd_separada, 3, '4/4 -> REMOVER 1 deve resultar em 3/4');
  assert.equal(progressDeltas[progressDeltas.length - 1], -1, 'Persistência incremental deve enviar delta: -1');

  // 3. Verifica auditoria em detalhes_operacionais
  const bips = activeItem.detalhes_operacionais[0].bipagens_fisicas;
  assert.equal(bips.length, 5, 'Log de bipagens deve registrar o evento de remocao sem apagar os anteriores');
  assert.equal(bips[4].tipo_operacao, 'remocao_unidade');
  assert.equal(bips[4].delta, -1);
  assert.equal(bips[4].qtd_restante, 3);

  // 4. Verifica que pacote PKG-001 permanece único e válido com 3 unidades
  const pkgsAposRemover = env.buildPickPackagesSyncPayload(env.currentSessionItems);
  assert.equal(pkgsAposRemover.length, 1, 'Deve continuar gerando exatamente 1 pacote');
  assert.equal(pkgsAposRemover[0].pacote_id, 'PKG-001');
  assert.equal(pkgsAposRemover[0].itens[0].quantidade, 3, 'Pacote PKG-001 deve conter 3 unidades');

  // 5. Verifica que 3/4 é incompleto (bloqueia finalização)
  const isIncomplete = env.currentSessionItems.some(i => i.qtd_separada < i.qtd_solicitada);
  assert.ok(isIncomplete, '3/4 un. deve ser considerado incompleto e bloquear finalizacao');

  // 6. Novo bip adiciona 1 un. (3 -> 4)
  activeItem.qtd_separada = 4;
  activeItem.qty = 4;
  await env.persistPickingDraftItem({ sessionId: 'SEP-PED-90' }, activeItem);
  assert.equal(progressDeltas[progressDeltas.length - 1], 1, 'Novo bip deve enviar delta: +1');
  assert.equal(activeItem.qtd_separada, 4);

  const isCompleteNow = env.currentSessionItems.every(i => i.qtd_separada >= i.qtd_solicitada);
  assert.ok(isCompleteNow, '4/4 un. deve ser considerado completo e habilitar finalizacao');

  // 7. Teste de limite: remoção em 0/4 não permitida
  activeItem.qtd_separada = 0;
  activeItem.qty = 0;
  let toastMsg = '';
  env.showToast = (msg) => { toastMsg = msg; };
  await env.removerUnidadePedidoIntegrado(0);
  assert.equal(activeItem.qtd_separada, 0, 'Nao deve permitir valor negativo abaixo de zero');
  assert.ok(toastMsg.includes('Nenhuma unidade'), 'Deve alertar que nao ha unidade a remover');
});
