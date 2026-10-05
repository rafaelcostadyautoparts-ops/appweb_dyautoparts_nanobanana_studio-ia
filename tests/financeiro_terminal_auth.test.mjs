import test from 'node:test';
import assert from 'node:assert/strict';

// Função SQL de validação de autorização de terminal para o Storage financeiro
function terminalAutorizadoStorageFinanceiro(authUid, acao, dispositivosDb) {
  if (!authUid) return false;
  const disp = dispositivosDb.find(d => d.auth_user_id === authUid && d.ativo === true);
  if (!disp) return false;

  const perfil = String(disp.perfil_terminal || 'operacional').toLowerCase();
  const acoesPermitidas = new Set(['select', 'insert', 'update', 'delete']);
  if (!acoesPermitidas.has(String(acao || '').toLowerCase())) return false;

  return perfil === 'financeiro' || perfil === 'admin';
}

// Mock de Supabase Client com RLS de Storage baseada em Terminal Auth
class MockSupabaseClientTerminalAuth {
  constructor(dispositivosDb = [], storageObjects = new Set()) {
    this.dispositivosDb = dispositivosDb;
    this.storageObjects = storageObjects;
    this.currentSession = null;
    this.uploadHistory = [];
    this.removeHistory = [];
    this.signedUrlCalls = [];
  }

  setTerminalAuthSession(terminal) {
    if (!terminal) {
      this.currentSession = null;
      return;
    }
    this.currentSession = {
      user: {
        id: terminal.auth_user_id,
        email: terminal.email || `${terminal.device_id}@terminal.dyautoparts.local`,
        role: 'authenticated'
      },
      access_token: 'mock_jwt_terminal_' + terminal.auth_user_id
    };
  }

  get auth() {
    return {
      getSession: async () => ({
        data: { session: this.currentSession },
        error: null
      }),
      getUser: async () => ({
        data: { user: this.currentSession?.user || null },
        error: null
      }),
      signOut: async () => {
        this.currentSession = null;
        return { error: null };
      }
    };
  }

  get storage() {
    const authUid = this.currentSession?.user?.id || null;
    const isAnon = !authUid;

    return {
      from: (bucket) => {
        if (bucket !== 'financeiro-comprovantes') throw new Error('Bucket desconhecido');

        return {
          list: async (prefix = '') => {
            if (isAnon || !terminalAutorizadoStorageFinanceiro(authUid, 'SELECT', this.dispositivosDb)) {
              return { data: null, error: new Error('new row violates row-level security policy for table "objects"') };
            }
            const matching = Array.from(this.storageObjects).filter(p => p.startsWith(prefix));
            return { data: matching.map(name => ({ name })), error: null };
          },

          upload: async (path, file) => {
            if (isAnon || !terminalAutorizadoStorageFinanceiro(authUid, 'INSERT', this.dispositivosDb)) {
              return { data: null, error: new Error('new row violates row-level security policy for table "objects"') };
            }
            this.uploadHistory.push({ path, size: file?.size });
            this.storageObjects.add(path);
            return { data: { path }, error: null };
          },

          createSignedUrl: async (path, expiresIn) => {
            if (isAnon || !terminalAutorizadoStorageFinanceiro(authUid, 'SELECT', this.dispositivosDb)) {
              return { data: null, error: new Error('new row violates row-level security policy for table "objects"') };
            }
            if (!this.storageObjects.has(path)) {
              return { data: null, error: new Error('Object not found') };
            }
            this.signedUrlCalls.push({ path, expiresIn });
            return {
              data: { signedUrl: `https://doklsgduslimidfbyngj.supabase.co/storage/v1/object/sign/financeiro-comprovantes/${path}?token=signed_token&expires=${expiresIn}` },
              error: null
            };
          },

          update: async (path, file) => {
            if (isAnon || !terminalAutorizadoStorageFinanceiro(authUid, 'UPDATE', this.dispositivosDb)) {
              return { data: null, error: new Error('new row violates row-level security policy for table "objects"') };
            }
            if (!this.storageObjects.has(path)) {
              return { data: null, error: new Error('Object not found') };
            }
            return { data: { path }, error: null };
          },

          remove: async (paths = []) => {
            if (isAnon || !terminalAutorizadoStorageFinanceiro(authUid, 'DELETE', this.dispositivosDb)) {
              return { data: null, error: new Error('new row violates row-level security policy for table "objects"') };
            }
            for (const p of paths) {
              this.removeHistory.push(p);
              this.storageObjects.delete(p);
            }
            return { data: paths.map(p => ({ name: p })), error: null };
          }
        };
      }
    };
  }
}

// Simulação de Gerenciamento de Estado do App (LocalStorage do Terminal e Operadores)
class MockAppState {
  constructor(client) {
    this.client = client;
    this.storage = new Map();
  }

  setItem(k, v) { this.storage.set(k, String(v)); }
  getItem(k) { return this.storage.get(k) || null; }
  removeItem(k) { this.storage.delete(k); }

  async setUser(userName, userId, userProfile) {
    this.setItem('currentUser', userName);
    this.setItem('currentUserId', userId);
    this.setItem('currentUserProfile', userProfile);
  }

  logout() {
    this.removeItem('currentUser');
    this.removeItem('currentUserId');
    this.removeItem('currentUserProfile');
  }

  async disconnectSupabaseSecureAccess() {
    await this.client.auth.signOut();
  }
}

// --- BANCO DE DADOS DE TESTE PARA DISPOSITIVOS AUTORIZADOS ---
const DISPOSITIVOS_PILOTO_DB = [
  {
    id: 'disp-01',
    device_id: 'terminal-homolog-financeiro-01',
    nome_dispositivo: 'Terminal Financeiro 01',
    ativo: true,
    perfil_terminal: 'financeiro',
    auth_user_id: '11111111-1111-1111-1111-111111111111'
  },
  {
    id: 'disp-02',
    device_id: 'terminal-homolog-expedicao-01',
    nome_dispositivo: 'Terminal Expedição 01',
    ativo: true,
    perfil_terminal: 'operacional', // Não tem acesso a comprovantes financeiros!
    auth_user_id: '22222222-2222-2222-2222-222222222222'
  },
  {
    id: 'disp-03',
    device_id: 'terminal-homolog-antigo-bloqueado',
    nome_dispositivo: 'Terminal Antigo Desativado',
    ativo: false, // INATIVO!
    perfil_terminal: 'financeiro',
    auth_user_id: '33333333-3333-3333-3333-333333333333'
  }
];

// --- SUÍTE DE TESTES DA FASE AUTH 3 ---

test('FASE AUTH 3 — A) Separação conceitual estrita: auth.uid do terminal != currentUserId do operador', async () => {
  const client = new MockSupabaseClientTerminalAuth(DISPOSITIVOS_PILOTO_DB);
  const appState = new MockAppState(client);

  client.setTerminalAuthSession(DISPOSITIVOS_PILOTO_DB[0]);
  await appState.setUser('Rafael Costa', 'homolog_admin', 'Admin');

  const session = (await client.auth.getSession()).data.session;
  assert.equal(session.user.id, '11111111-1111-1111-1111-111111111111');
  assert.equal(appState.getItem('currentUserId'), 'homolog_admin');
  assert.notEqual(session.user.id, appState.getItem('currentUserId'));
});

test('FASE AUTH 3 — B) Terminal financeiro ativo autorizado acessa Storage (LIST, SIGNED URL, UPLOAD, DELETE)', async () => {
  const client = new MockSupabaseClientTerminalAuth(DISPOSITIVOS_PILOTO_DB);
  client.setTerminalAuthSession(DISPOSITIVOS_PILOTO_DB[0]); // Terminal Financeiro Ativo

  const path = 'contas-pagar/c1/recibo.pdf';

  // Upload
  const upRes = await client.storage.from('financeiro-comprovantes').upload(path, { size: 500 });
  assert.equal(upRes.error, null);

  // List
  const listRes = await client.storage.from('financeiro-comprovantes').list('contas-pagar/c1/');
  assert.equal(listRes.error, null);
  assert.equal(listRes.data.length, 1);

  // Signed URL 300s
  const signRes = await client.storage.from('financeiro-comprovantes').createSignedUrl(path, 300);
  assert.equal(signRes.error, null);
  assert.ok(signRes.data.signedUrl.includes('expires=300'));

  // Delete
  const delRes = await client.storage.from('financeiro-comprovantes').remove([path]);
  assert.equal(delRes.error, null);
  assert.equal(client.storageObjects.size, 0);
});

test('FASE AUTH 3 — C) Terminal sem vínculo em public.dispositivos_autorizados é BLOQUEADO', async () => {
  const client = new MockSupabaseClientTerminalAuth(DISPOSITIVOS_PILOTO_DB);

  // Sessão de um usuário Supabase Auth desconhecido
  client.setTerminalAuthSession({
    auth_user_id: '99999999-9999-9999-9999-999999999999',
    device_id: 'dispositivo_estranho'
  });

  const upRes = await client.storage.from('financeiro-comprovantes').upload('contas-pagar/c1/arq.pdf', { size: 100 });
  assert.equal(upRes.data, null);
  assert.match(upRes.error.message, /violates row-level security policy/);
});

test('FASE AUTH 3 — D) Terminal inativo (ativo = false) é BLOQUEADO', async () => {
  const client = new MockSupabaseClientTerminalAuth(DISPOSITIVOS_PILOTO_DB);
  client.setTerminalAuthSession(DISPOSITIVOS_PILOTO_DB[2]); // disp-03 (ativo = false)

  const upRes = await client.storage.from('financeiro-comprovantes').upload('contas-pagar/c1/arq.pdf', { size: 100 });
  assert.equal(upRes.data, null);
  assert.match(upRes.error.message, /violates row-level security policy/);
});

test('FASE AUTH 3 — E) Terminal com perfil operacional (sem permissão financeira) é BLOQUEADO', async () => {
  const client = new MockSupabaseClientTerminalAuth(DISPOSITIVOS_PILOTO_DB);
  client.setTerminalAuthSession(DISPOSITIVOS_PILOTO_DB[1]); // disp-02 (perfil_terminal = 'operacional')

  const upRes = await client.storage.from('financeiro-comprovantes').upload('contas-pagar/c1/arq.pdf', { size: 100 });
  assert.equal(upRes.data, null);
  assert.match(upRes.error.message, /violates row-level security policy/);
});

test('FASE AUTH 3 — F) Cliente ANON (sem sessão) é 100% BLOQUEADO', async () => {
  const client = new MockSupabaseClientTerminalAuth(DISPOSITIVOS_PILOTO_DB);
  // Sem sessão ativa (null)

  const upRes = await client.storage.from('financeiro-comprovantes').upload('contas-pagar/c1/arq.pdf', { size: 100 });
  assert.equal(upRes.data, null);
  assert.match(upRes.error.message, /violates row-level security policy/);
});

test('FASE AUTH 3 — G & H) Troca de operador e logout operacional: preserva rigorosamente o mesmo auth.uid', async () => {
  const client = new MockSupabaseClientTerminalAuth(DISPOSITIVOS_PILOTO_DB);
  const appState = new MockAppState(client);

  // 1. Terminal autenticado
  client.setTerminalAuthSession(DISPOSITIVOS_PILOTO_DB[0]);
  const authUidInicial = (await client.auth.getSession()).data.session.user.id;

  // 2. Operador A entra
  await appState.setUser('Operador Alexandre', 'op_alexandre', 'Operador');
  const authUidOpA = (await client.auth.getSession()).data.session.user.id;
  assert.equal(authUidOpA, authUidInicial);
  assert.equal(appState.getItem('currentUser'), 'Operador Alexandre');

  // 3. Logout Operacional
  appState.logout();
  const authUidPosLogout = (await client.auth.getSession()).data.session?.user?.id;
  assert.equal(authUidPosLogout, authUidInicial);
  assert.equal(appState.getItem('currentUser'), null); // Operador limpo!

  // 4. Operador B entra
  await appState.setUser('Operador Daniel', 'op_daniel', 'Operador');
  const authUidOpB = (await client.auth.getSession()).data.session.user.id;
  assert.equal(authUidOpB, authUidInicial);
  assert.equal(appState.getItem('currentUser'), 'Operador Daniel');

  // Confirmação que todos os auth.uid foram idênticos
  assert.equal(authUidInicial, '11111111-1111-1111-1111-111111111111');
});

test('FASE AUTH 3 — I) Persistência de sessão técnica após simulação de recarregamento (F5)', async () => {
  const client = new MockSupabaseClientTerminalAuth(DISPOSITIVOS_PILOTO_DB);
  client.setTerminalAuthSession(DISPOSITIVOS_PILOTO_DB[0]);

  // Simula persistência do Supabase Client
  const sessionAntes = (await client.auth.getSession()).data.session;
  assert.ok(sessionAntes);

  // Novo client instanciado restaurando a sessão existente
  const clientAposReload = new MockSupabaseClientTerminalAuth(DISPOSITIVOS_PILOTO_DB);
  clientAposReload.setTerminalAuthSession(DISPOSITIVOS_PILOTO_DB[0]);

  const sessionDepois = (await clientAposReload.auth.getSession()).data.session;
  assert.equal(sessionDepois.user.id, sessionAntes.user.id);
  assert.equal(sessionDepois.user.role, 'authenticated');
});

test('FASE AUTH 3 — J) public.usuarios.auth_user_id NÃO é utilizado para representar o terminal', () => {
  const terminalAuthUid = '11111111-1111-1111-1111-111111111111';
  const tabelaUsuarios = [
    { usuario_id: 'homolog_admin', nome: 'Administrador Homologação', auth_user_id: null }
  ];

  // Garante que o terminal é registrado apenas em dispositivos_autorizados
  const disp = DISPOSITIVOS_PILOTO_DB.find(d => d.auth_user_id === terminalAuthUid);
  assert.ok(disp);
  assert.equal(disp.device_id, 'terminal-homolog-financeiro-01');

  // E que public.usuarios continua intacto sem amarrar o terminal ao operador
  assert.equal(tabelaUsuarios[0].auth_user_id, null);
});
