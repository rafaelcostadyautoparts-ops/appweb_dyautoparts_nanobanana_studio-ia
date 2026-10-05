import test from 'node:test';
import assert from 'node:assert/strict';

// Simulação da função SQL criada na migration 20261004140000
function podeAcessarStorageFinanceiro(authUid, acao, usuariosDb) {
  if (!authUid) return false;
  const user = usuariosDb.find(u => u.auth_user_id === authUid && u.ativo === true);
  if (!user) return false;

  const perfil = String(user.perfil || '').toLowerCase();
  const acoesPermitidas = new Set(['select', 'insert', 'update', 'delete']);
  if (!acoesPermitidas.has(String(acao || '').toLowerCase())) return false;

  return perfil === 'admin' || perfil === 'operador';
}

// Mock de Supabase Client com RLS de Storage estrita baseada em Auth e public.usuarios
class MockSupabaseClientComAuthStorage {
  constructor(usuariosDb = [], storageObjects = new Set()) {
    this.usuariosDb = usuariosDb;
    this.storageObjects = storageObjects; // Set of paths
    this.currentSession = null; // null => anon role
    this.uploadHistory = [];
    this.removeHistory = [];
    this.signedUrlCalls = [];
  }

  // Define a sessão ativa (simulando supabase.auth.signInWithPassword)
  setAuthSession(user) {
    if (!user) {
      this.currentSession = null;
      return;
    }
    this.currentSession = {
      user: {
        id: user.auth_user_id,
        email: user.email || `${user.usuario_id}@empresa.com`,
        role: 'authenticated'
      },
      access_token: 'mock_jwt_token_' + user.auth_user_id
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
        if (bucket !== 'financeiro-comprovantes') {
          throw new Error('Bucket desconhecido');
        }

        return {
          list: async (prefix = '', options = {}) => {
            // Policy: SELECT TO authenticated USING (podeAcessarStorageFinanceiro(auth.uid(), 'SELECT'))
            if (isAnon || !podeAcessarStorageFinanceiro(authUid, 'SELECT', this.usuariosDb)) {
              return { data: null, error: new Error('new row violates row-level security policy for table "objects"') };
            }
            const matching = Array.from(this.storageObjects).filter(p => p.startsWith(prefix));
            return { data: matching.map(name => ({ name })), error: null };
          },

          upload: async (path, file, options = {}) => {
            // Policy: INSERT TO authenticated WITH CHECK (podeAcessarStorageFinanceiro(auth.uid(), 'INSERT'))
            if (isAnon || !podeAcessarStorageFinanceiro(authUid, 'INSERT', this.usuariosDb)) {
              return { data: null, error: new Error('new row violates row-level security policy for table "objects"') };
            }
            this.uploadHistory.push({ path, size: file?.size });
            this.storageObjects.add(path);
            return { data: { path }, error: null };
          },

          createSignedUrl: async (path, expiresIn) => {
            // Policy: SELECT TO authenticated USING (podeAcessarStorageFinanceiro(auth.uid(), 'SELECT'))
            if (isAnon || !podeAcessarStorageFinanceiro(authUid, 'SELECT', this.usuariosDb)) {
              return { data: null, error: new Error('new row violates row-level security policy for table "objects"') };
            }
            if (!this.storageObjects.has(path)) {
              return { data: null, error: new Error('Object not found') };
            }
            this.signedUrlCalls.push({ path, expiresIn });
            const signedUrl = `https://doklsgduslimidfbyngj.supabase.co/storage/v1/object/sign/financeiro-comprovantes/${path}?token=signed_token&expires=${expiresIn}`;
            return { data: { signedUrl }, error: null };
          },

          update: async (path, file) => {
            // Policy: UPDATE TO authenticated USING (podeAcessarStorageFinanceiro(auth.uid(), 'UPDATE'))
            if (isAnon || !podeAcessarStorageFinanceiro(authUid, 'UPDATE', this.usuariosDb)) {
              return { data: null, error: new Error('new row violates row-level security policy for table "objects"') };
            }
            if (!this.storageObjects.has(path)) {
              return { data: null, error: new Error('Object not found') };
            }
            return { data: { path }, error: null };
          },

          remove: async (paths = []) => {
            // Policy: DELETE TO authenticated USING (podeAcessarStorageFinanceiro(auth.uid(), 'DELETE'))
            if (isAnon || !podeAcessarStorageFinanceiro(authUid, 'DELETE', this.usuariosDb)) {
              return { data: null, error: new Error('new row violates row-level security policy for table "objects"') };
            }
            for (const p of paths) {
              this.removeHistory.push(p);
              this.storageObjects.delete(p);
            }
            return { data: paths.map(p => ({ name: p })), error: null };
          },

          getPublicUrl: (path) => {
            throw new Error('PROIBIDO: getPublicUrl() chamado em bucket privado!');
          }
        };
      }
    };
  }
}

// --- SUÍTE DE TESTES DA FASE AUTH 1 ---

const USUARIOS_PILOTO_DB = [
  {
    id: 'fe723107-6bbc-4b27-a079-db96caca5b2d',
    usuario_id: 'homolog_admin',
    nome: 'Administrador Homologação',
    perfil: 'admin',
    ativo: true,
    auth_user_id: '00000000-0000-0000-0000-000000000001'
  },
  {
    id: 'f3fe489b-48c1-48a1-8cb9-8e9214f6d9f3',
    usuario_id: 'homolog_operador_1',
    nome: 'Operador Teste 1',
    perfil: 'operador',
    ativo: true,
    auth_user_id: '00000000-0000-0000-0000-000000000002'
  },
  {
    id: '99999999-9999-9999-9999-999999999999',
    usuario_id: 'operador_demitido',
    nome: 'Operador Inativo',
    perfil: 'operador',
    ativo: false, // INATIVO!
    auth_user_id: '00000000-0000-0000-0000-000000000003'
  }
];

test('1. CLIENTE ANON (SEM SESSÃO) — Todas as operações são bloqueadas por RLS', async () => {
  const existingFiles = new Set(['contas-pagar/c1/recibo.pdf']);
  const client = new MockSupabaseClientComAuthStorage(USUARIOS_PILOTO_DB, existingFiles);

  // Sem sessão (role: anon)
  const session = (await client.auth.getSession()).data.session;
  assert.equal(session, null);

  // 1.1 LIST -> BLOQUEADO
  const listRes = await client.storage.from('financeiro-comprovantes').list('contas-pagar/c1/');
  assert.equal(listRes.data, null);
  assert.match(listRes.error.message, /violates row-level security policy/);

  // 1.2 SIGNED URL -> BLOQUEADO
  const signRes = await client.storage.from('financeiro-comprovantes').createSignedUrl('contas-pagar/c1/recibo.pdf', 300);
  assert.equal(signRes.data, null);
  assert.match(signRes.error.message, /violates row-level security policy/);

  // 1.3 INSERT (UPLOAD) -> BLOQUEADO
  const uploadRes = await client.storage.from('financeiro-comprovantes').upload('contas-pagar/c1/novo.pdf', { size: 100 });
  assert.equal(uploadRes.data, null);
  assert.match(uploadRes.error.message, /violates row-level security policy/);

  // 1.4 UPDATE -> BLOQUEADO
  const updateRes = await client.storage.from('financeiro-comprovantes').update('contas-pagar/c1/recibo.pdf', { size: 200 });
  assert.equal(updateRes.data, null);
  assert.match(updateRes.error.message, /violates row-level security policy/);

  // 1.5 DELETE -> BLOQUEADO
  const deleteRes = await client.storage.from('financeiro-comprovantes').remove(['contas-pagar/c1/recibo.pdf']);
  assert.equal(deleteRes.data, null);
  assert.match(deleteRes.error.message, /violates row-level security policy/);
});

test('2. CLIENTE AUTHENTICATED COM VÍNCULO (homolog_admin) — Todas as operações autorizadas', async () => {
  const client = new MockSupabaseClientComAuthStorage(USUARIOS_PILOTO_DB);

  // Estabelecer sessão de homolog_admin
  client.setAuthSession(USUARIOS_PILOTO_DB[0]);
  const session = (await client.auth.getSession()).data.session;
  assert.ok(session?.user?.id);
  assert.equal(session.user.id, '00000000-0000-0000-0000-000000000001');
  assert.equal(session.user.role, 'authenticated');

  // 2.1 INSERT (UPLOAD) -> PASS
  const pathTeste = 'contas-pagar/conta-piloto/comprovante_piloto.pdf';
  const uploadRes = await client.storage.from('financeiro-comprovantes').upload(pathTeste, { size: 500 });
  assert.equal(uploadRes.error, null);
  assert.equal(uploadRes.data.path, pathTeste);

  // 2.2 LIST -> PASS
  const listRes = await client.storage.from('financeiro-comprovantes').list('contas-pagar/conta-piloto/');
  assert.equal(listRes.error, null);
  assert.equal(listRes.data.length, 1);

  // 2.3 CREATE SIGNED URL 300s -> PASS
  const signRes = await client.storage.from('financeiro-comprovantes').createSignedUrl(pathTeste, 300);
  assert.equal(signRes.error, null);
  assert.ok(signRes.data.signedUrl.includes('expires=300'));

  // 2.4 UPDATE -> PASS
  const updateRes = await client.storage.from('financeiro-comprovantes').update(pathTeste, { size: 600 });
  assert.equal(updateRes.error, null);

  // 2.5 DELETE (LIMPEZA RESIDUAL) -> PASS
  const deleteRes = await client.storage.from('financeiro-comprovantes').remove([pathTeste]);
  assert.equal(deleteRes.error, null);

  // Confirma 0 resíduos
  assert.equal(client.storageObjects.size, 0);
});

test('3. CLIENTE AUTHENTICATED SEM VÍNCULO EM public.usuarios — Storage financeiro BLOQUEADO', async () => {
  const existingFiles = new Set(['contas-pagar/c1/recibo.pdf']);
  const client = new MockSupabaseClientComAuthStorage(USUARIOS_PILOTO_DB, existingFiles);

  // Sessão de um usuário Supabase Auth que NÃO existe em public.usuarios
  client.setAuthSession({
    auth_user_id: '99999999-0000-0000-0000-000000000000',
    usuario_id: 'hacker_ou_estranho'
  });

  // Upload deve ser bloqueado mesmo com role authenticated
  const uploadRes = await client.storage.from('financeiro-comprovantes').upload('contas-pagar/c1/invasao.pdf', { size: 100 });
  assert.equal(uploadRes.data, null);
  assert.match(uploadRes.error.message, /violates row-level security policy/);

  // Download/Signed URL deve ser bloqueado
  const signRes = await client.storage.from('financeiro-comprovantes').createSignedUrl('contas-pagar/c1/recibo.pdf', 300);
  assert.equal(signRes.data, null);
  assert.match(signRes.error.message, /violates row-level security policy/);
});

test('4. OPERADOR INATIVO (ativo = false) — Storage financeiro BLOQUEADO', async () => {
  const existingFiles = new Set(['contas-pagar/c1/recibo.pdf']);
  const client = new MockSupabaseClientComAuthStorage(USUARIOS_PILOTO_DB, existingFiles);

  // Sessão do operador_demitido (ativo = false)
  client.setAuthSession(USUARIOS_PILOTO_DB[2]);

  const uploadRes = await client.storage.from('financeiro-comprovantes').upload('contas-pagar/c1/tentativa.pdf', { size: 100 });
  assert.equal(uploadRes.data, null);
  assert.match(uploadRes.error.message, /violates row-level security policy/);

  const signRes = await client.storage.from('financeiro-comprovantes').createSignedUrl('contas-pagar/c1/recibo.pdf', 300);
  assert.equal(signRes.data, null);
  assert.match(signRes.error.message, /violates row-level security policy/);
});

test('5. VÍNCULO BIDIRECIONAL E INTEGRIDADE — auth.uid() == public.usuarios.auth_user_id', () => {
  const userPiloto = USUARIOS_PILOTO_DB[0];
  const authUid = '00000000-0000-0000-0000-000000000001';

  assert.equal(userPiloto.auth_user_id, authUid);
  assert.equal(podeAcessarStorageFinanceiro(authUid, 'SELECT', USUARIOS_PILOTO_DB), true);
  assert.equal(podeAcessarStorageFinanceiro(authUid, 'INSERT', USUARIOS_PILOTO_DB), true);
  assert.equal(podeAcessarStorageFinanceiro(authUid, 'DELETE', USUARIOS_PILOTO_DB), true);
});
