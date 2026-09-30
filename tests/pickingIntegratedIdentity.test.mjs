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

function createTestEnv(overrides = {}) {
  const queuedOps = [];
  const progressCalls = [];
  const savedDrafts = [];

  const context = {
    console: { warn() {}, log() {}, error() {}, info() {} },
    navigator: { onLine: true },
    localStorage: { getItem: () => 'Operador Teste' },
    PICK_STATUS_DRAFT: 'em_separacao',
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
      return { ok: true, synced: true };
    },
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

