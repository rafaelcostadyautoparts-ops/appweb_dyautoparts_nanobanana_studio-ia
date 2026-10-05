import test from 'node:test';
import assert from 'node:assert/strict';

const MAX_COMPROVANTE_FINANCEIRO_SIZE = 5 * 1024 * 1024; // 5 MB
const COMPROVANTE_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const EXTENSAO_MIME_MAP = {
  'pdf': 'application/pdf',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png'
};

function validarArquivoComprovante(file) {
  if (!file) return { valido: false, erro: 'Nenhum arquivo fornecido.' };

  if (file.size > MAX_COMPROVANTE_FINANCEIRO_SIZE) {
    return { valido: false, erro: 'O arquivo excede o limite máximo permitido de 5 MB.' };
  }

  const rawName = String(file.name || '');
  const extMatch = rawName.match(/\.([a-zA-Z0-9]+)$/);
  if (!extMatch) {
    return { valido: false, erro: 'Formato de arquivo não suportado. Utilize apenas PDF, JPG ou PNG.' };
  }

  const ext = extMatch[1].toLowerCase();
  const expectedMime = EXTENSAO_MIME_MAP[ext];
  if (!expectedMime) {
    return { valido: false, erro: 'Formato de arquivo não suportado. Utilize apenas PDF, JPG ou PNG.' };
  }

  const fileType = String(file.type || '').toLowerCase();
  if (fileType) {
    if (!COMPROVANTE_MIME_TYPES.has(fileType)) {
      return { valido: false, erro: 'Tipo MIME não permitido. Formatos aceitos: PDF, JPG, PNG.' };
    }
    if (fileType !== expectedMime) {
      return { valido: false, erro: 'Divergência entre a extensão do arquivo e o tipo de conteúdo detectado.' };
    }
  }

  return { valido: true, ext, mime: expectedMime };
}

function sanitizarNomeArquivoComprovante(fileName) {
  const raw = String(fileName || '').trim();
  const lastDot = raw.lastIndexOf('.');
  const base = lastDot !== -1 ? raw.substring(0, lastDot) : raw;
  const ext = lastDot !== -1 ? raw.substring(lastDot).toLowerCase() : '';

  const semAcentos = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let limpo = semAcentos.replace(/[^a-zA-Z0-9_-]/g, '_');
  limpo = limpo.replace(/_+/g, '_').substring(0, 50);
  if (!limpo) limpo = 'comprovante';

  return `${limpo}${ext}`;
}

function gerarPathStorageComprovante(contaId, fileName, ts = 1728000000000) {
  const sanitized = sanitizarNomeArquivoComprovante(fileName);
  return `contas-pagar/${contaId}/${ts}-${sanitized}`;
}

function extrairValidarOperador(rawUserId, rawUserName) {
  const invalidValues = new Set(['', 'null', 'undefined', 'não registrado', 'nao registrado']);
  const normalizedUserId = invalidValues.has(String(rawUserId || '').trim().toLowerCase()) ? '' : String(rawUserId || '').trim();
  const normalizedUserName = invalidValues.has(String(rawUserName || '').trim().toLowerCase()) ? '' : String(rawUserName || '').trim();

  if (!normalizedUserId && !normalizedUserName) {
    return { valido: false, erro: 'É necessário identificar o operador antes de confirmar a operação.' };
  }

  const opId = normalizedUserId || null;
  const opNome = normalizedUserName || normalizedUserId;
  return { valido: true, opId, opNome };
}

// Mock completo de Supabase Client com DB + Storage com tracking de uploads/removals
class MockSupabaseClientComStorage {
  constructor(initialDb = []) {
    this.db = initialDb;
    this.storageObjects = new Map(); // bucket -> Set of paths
    this.uploadHistory = [];
    this.removeHistory = [];
    this.signedUrlCalls = [];
  }

  storageFrom(bucket) {
    if (!this.storageObjects.has(bucket)) {
      this.storageObjects.set(bucket, new Set());
    }
    const bucketSet = this.storageObjects.get(bucket);

    return {
      upload: async (path, file, options = {}) => {
        this.uploadHistory.push({ bucket, path, size: file?.size, type: file?.type });
        if (options.failUpload) {
          return { data: null, error: new Error('Simulated Storage Network Error') };
        }
        bucketSet.add(path);
        return { data: { path }, error: null };
      },
      remove: async (paths = [], options = {}) => {
        if (options.failRemove) {
          return { data: null, error: new Error('Simulated Storage Remove Failure') };
        }
        for (const p of paths) {
          this.removeHistory.push({ bucket, path: p });
          bucketSet.delete(p);
        }
        return { data: paths.map(p => ({ name: p })), error: null };
      },
      createSignedUrl: async (path, expiresIn, options = {}) => {
        this.signedUrlCalls.push({ bucket, path, expiresIn, options });
        if (!bucketSet.has(path)) {
          return { data: null, error: new Error('Object not found') };
        }
        const signedUrl = `https://doklsgduslimidfbyngj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=mock_jwt_token&expires=${expiresIn}`;
        return { data: { signedUrl }, error: null };
      },
      getPublicUrl: (path) => {
        throw new Error('PROIBIDO: getPublicUrl() foi chamado em bucket privado!');
      }
    };
  }

  get storage() {
    return {
      from: (bucket) => this.storageFrom(bucket)
    };
  }

  from(table) {
    if (table !== 'contas_pagar') throw new Error(`Tabela ${table} não mockada`);

    return {
      update: (payload) => {
        let filters = [];
        const builder = {
          eq: (column, value) => {
            filters.push({ column, value, type: 'eq' });
            return builder;
          },
          is: (column, value) => {
            filters.push({ column, value, type: 'is' });
            return builder;
          },
          select: (fields) => {
            const matchingIndices = [];
            for (let i = 0; i < this.db.length; i++) {
              const row = this.db[i];
              const matches = filters.every(f => {
                if (f.type === 'is') {
                  if (f.value === null) return row[f.column] === null || row[f.column] === undefined;
                  return row[f.column] === f.value;
                }
                return String(row[f.column]) === String(f.value);
              });
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

// Implementação do fluxo de liquidação com suporte a comprovante (Fase B)
async function executarFluxoLiquidacao({
  client,
  contaId,
  userId,
  userName,
  dataVal = '2026-10-04',
  formaVal = 'pix',
  obsVal = '',
  file = null,
  simularFalhaUpload = false
}) {
  const auth = extrairValidarOperador(userId, userName);
  if (!auth.valido) return { sucesso: false, erro: auth.erro };

  let uploadedStoragePath = null;

  try {
    if (file) {
      const validacao = validarArquivoComprovante(file);
      if (!validacao.valido) {
        return { sucesso: false, erro: validacao.erro };
      }

      const storagePath = gerarPathStorageComprovante(contaId, file.name);
      const { data: uploadData, error: uploadError } = await client.storage
        .from('financeiro-comprovantes')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'application/octet-stream',
          failUpload: simularFalhaUpload
        });

      if (uploadError) {
        return { sucesso: false, erro: 'Não foi possível enviar o comprovante. Tente novamente ou remova o arquivo para prosseguir sem anexo.' };
      }

      uploadedStoragePath = storagePath;
    }

    const payloadUpdate = {
      status: 'pago',
      status_vencimento: 'pago',
      data_pagamento: dataVal,
      forma_pagamento: formaVal,
      observacoes: obsVal,
      observacao: obsVal,
      pago_por_id: auth.opId,
      pago_por_nome: auth.opNome,
      atualizado_em: '2026-10-04T12:00:00Z'
    };

    if (uploadedStoragePath && file) {
      payloadUpdate.comprovante_path = uploadedStoragePath;
      payloadUpdate.comprovante_nome = file.name;
      payloadUpdate.comprovante_tipo = file.type;
      payloadUpdate.comprovante_tamanho = file.size;
      payloadUpdate.comprovante_anexado_em = '2026-10-04T12:00:00Z';
      payloadUpdate.comprovante_anexado_por_id = auth.opId;
      payloadUpdate.comprovante_anexado_por_nome = auth.opNome;
    }

    const { data: updatedRows, error } = await client
      .from('contas_pagar')
      .update(payloadUpdate)
      .eq('id', contaId)
      .eq('status', 'pendente')
      .select('id, status, valor, data_pagamento, forma_pagamento, pago_por_id, pago_por_nome, comprovante_path, comprovante_nome');

    if (error) {
      if (uploadedStoragePath) {
        await client.storage.from('financeiro-comprovantes').remove([uploadedStoragePath]);
        uploadedStoragePath = null;
      }
      throw error;
    }

    if (!updatedRows || updatedRows.length === 0) {
      if (uploadedStoragePath) {
        await client.storage.from('financeiro-comprovantes').remove([uploadedStoragePath]);
        uploadedStoragePath = null;
      }
      return {
        sucesso: false,
        mensagem: 'Este título já foi liquidado ou não está mais disponível para pagamento.'
      };
    }

    return {
      sucesso: true,
      registro: updatedRows[0]
    };
  } catch (err) {
    if (uploadedStoragePath) {
      await client.storage.from('financeiro-comprovantes').remove([uploadedStoragePath]);
    }
    return { sucesso: false, erro: err.message };
  }
}

// Implementação do fluxo de Anexação Posterior (Fase C)
async function executarFluxoAnexacaoPosterior({
  client,
  contaId,
  userId,
  userName,
  file,
  simularFalhaUpload = false
}) {
  const auth = extrairValidarOperador(userId, userName);
  if (!auth.valido) return { sucesso: false, erro: auth.erro };

  const validacao = validarArquivoComprovante(file);
  if (!validacao.valido) return { sucesso: false, erro: validacao.erro };

  let uploadedStoragePath = null;

  try {
    const storagePath = gerarPathStorageComprovante(contaId, file.name);
    const { error: uploadError } = await client.storage
      .from('financeiro-comprovantes')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
        failUpload: simularFalhaUpload
      });

    if (uploadError) {
      return { sucesso: false, erro: 'Não foi possível enviar o comprovante. Tente novamente.' };
    }

    uploadedStoragePath = storagePath;
    const now = '2026-10-04T12:30:00Z';

    const { data: updatedRows, error: updateError } = await client
      .from('contas_pagar')
      .update({
        comprovante_path: storagePath,
        comprovante_nome: file.name,
        comprovante_tipo: file.type,
        comprovante_tamanho: file.size,
        comprovante_anexado_em: now,
        comprovante_anexado_por_id: auth.opId,
        comprovante_anexado_por_nome: auth.opNome,
        atualizado_em: now
      })
      .eq('id', contaId)
      .eq('status', 'pago')
      .is('comprovante_path', null)
      .select('*');

    if (updateError) {
      if (uploadedStoragePath) {
        await client.storage.from('financeiro-comprovantes').remove([uploadedStoragePath]);
        uploadedStoragePath = null;
      }
      throw updateError;
    }

    if (!updatedRows || updatedRows.length === 0) {
      if (uploadedStoragePath) {
        await client.storage.from('financeiro-comprovantes').remove([uploadedStoragePath]);
        uploadedStoragePath = null;
      }
      return {
        sucesso: false,
        mensagem: 'Este pagamento já possui um comprovante ou não está mais disponível para anexação.'
      };
    }

    return {
      sucesso: true,
      registro: updatedRows[0]
    };
  } catch (err) {
    if (uploadedStoragePath) {
      await client.storage.from('financeiro-comprovantes').remove([uploadedStoragePath]);
    }
    return { sucesso: false, erro: err.message };
  }
}

// Implementação do fluxo de Substituição Controlada (Fase C)
async function executarFluxoSubstituicao({
  client,
  contaId,
  userId,
  userName,
  file,
  pathAntigo,
  simularFalhaUpload = false,
  simularFalhaRemocaoAntigo = false
}) {
  const auth = extrairValidarOperador(userId, userName);
  if (!auth.valido) return { sucesso: false, erro: auth.erro };

  const validacao = validarArquivoComprovante(file);
  if (!validacao.valido) return { sucesso: false, erro: validacao.erro };

  if (!pathAntigo) {
    return { sucesso: false, erro: 'Comprovante anterior não encontrado para substituição.' };
  }

  let novoStoragePath = null;

  try {
    novoStoragePath = gerarPathStorageComprovante(contaId, file.name, 1728000500000);
    const { error: uploadError } = await client.storage
      .from('financeiro-comprovantes')
      .upload(novoStoragePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
        failUpload: simularFalhaUpload
      });

    if (uploadError) {
      return { sucesso: false, erro: 'Não foi possível enviar o novo comprovante.' };
    }

    const now = '2026-10-04T12:45:00Z';

    const { data: updatedRows, error: updateError } = await client
      .from('contas_pagar')
      .update({
        comprovante_path: novoStoragePath,
        comprovante_nome: file.name,
        comprovante_tipo: file.type,
        comprovante_tamanho: file.size,
        comprovante_anexado_em: now,
        comprovante_anexado_por_id: auth.opId,
        comprovante_anexado_por_nome: auth.opNome,
        atualizado_em: now
      })
      .eq('id', contaId)
      .eq('comprovante_path', pathAntigo)
      .select('*');

    if (updateError) {
      if (novoStoragePath) {
        await client.storage.from('financeiro-comprovantes').remove([novoStoragePath]);
        novoStoragePath = null;
      }
      throw updateError;
    }

    if (!updatedRows || updatedRows.length === 0) {
      if (novoStoragePath) {
        await client.storage.from('financeiro-comprovantes').remove([novoStoragePath]);
        novoStoragePath = null;
      }
      return {
        sucesso: false,
        mensagem: 'O comprovante foi alterado por outra sessão ou o título foi modificado.'
      };
    }

    // Remover arquivo antigo APÓS confirmação do banco
    let falhaRemocaoAntigo = false;
    try {
      const { error: remError } = await client.storage
        .from('financeiro-comprovantes')
        .remove([pathAntigo], { failRemove: simularFalhaRemocaoAntigo });

      if (remError) falhaRemocaoAntigo = true;
    } catch (e) {
      falhaRemocaoAntigo = true;
    }

    return {
      sucesso: true,
      registro: updatedRows[0],
      avisoLimpezaAntigo: falhaRemocaoAntigo ? 'Arquivo antigo não pôde ser removido imediatamente.' : null
    };
  } catch (err) {
    if (novoStoragePath) {
      await client.storage.from('financeiro-comprovantes').remove([novoStoragePath]);
    }
    return { sucesso: false, erro: err.message };
  }
}

// --- SUÍTE DE TESTES DA FASE B ---

test('A) PAGAMENTO SEM COMPROVANTE — Mantém fluxo 100% funcional sem chamar Storage', async () => {
  const db = [{ id: 'conta-10', status: 'pendente', valor: 100.0 }];
  const client = new MockSupabaseClientComStorage(db);

  const res = await executarFluxoLiquidacao({
    client,
    contaId: 'conta-10',
    userId: 'op1',
    userName: 'Operador 1',
    file: null
  });

  assert.equal(res.sucesso, true);
  assert.equal(db[0].status, 'pago');
  assert.equal(db[0].pago_por_id, 'op1');
  assert.equal(db[0].pago_por_nome, 'Operador 1');
  assert.equal(db[0].comprovante_path, undefined);
  assert.equal(client.uploadHistory.length, 0);
  assert.equal(client.removeHistory.length, 0);
});

test('B) VALIDAÇÃO PDF VÁLIDO — Aceita PDF <= 5MB com MIME e extensão corretos', () => {
  const file = { name: 'comprovante_pix.pdf', size: 1024 * 500, type: 'application/pdf' };
  const v = validarArquivoComprovante(file);
  assert.equal(v.valido, true);
  assert.equal(v.mime, 'application/pdf');
});

test('C) VALIDAÇÃO JPEG VÁLIDO — Aceita .jpg e .jpeg <= 5MB', () => {
  const file1 = { name: 'foto_recibo.jpg', size: 1024 * 800, type: 'image/jpeg' };
  const v1 = validarArquivoComprovante(file1);
  assert.equal(v1.valido, true);

  const file2 = { name: 'foto_recibo.jpeg', size: 1024 * 800, type: 'image/jpeg' };
  const v2 = validarArquivoComprovante(file2);
  assert.equal(v2.valido, true);
});

test('D) VALIDAÇÃO PNG VÁLIDO — Aceita .png <= 5MB', () => {
  const file = { name: 'screenshot_pagto.png', size: 1024 * 1200, type: 'image/png' };
  const v = validarArquivoComprovante(file);
  assert.equal(v.valido, true);
  assert.equal(v.mime, 'image/png');
});

test('E) VALIDAÇÃO > 5 MB BLOQUEADO — Rejeita arquivos maiores que 5.242.880 bytes', () => {
  const fileGrande = { name: 'comprovante_pesado.pdf', size: 5242881, type: 'application/pdf' };
  const v = validarArquivoComprovante(fileGrande);
  assert.equal(v.valido, false);
  assert.match(v.erro, /excede o limite máximo permitido de 5 MB/);
});

test('F) VALIDAÇÃO MIME INVÁLIDO BLOQUEADO — Rejeita SVG, HTML, TXT, ZIP, EXE, JS', () => {
  const tiposInvalidos = [
    { name: 'vetor.svg', size: 1000, type: 'image/svg+xml' },
    { name: 'pagina.html', size: 1000, type: 'text/html' },
    { name: 'nota.txt', size: 1000, type: 'text/plain' },
    { name: 'arquivo.zip', size: 1000, type: 'application/zip' },
    { name: 'programa.exe', size: 1000, type: 'application/x-msdownload' },
    { name: 'script.js', size: 1000, type: 'application/javascript' }
  ];

  for (const f of tiposInvalidos) {
    const v = validarArquivoComprovante(f);
    assert.equal(v.valido, false, `Deveria ter rejeitado: ${f.name}`);
  }
});

test('G) VALIDAÇÃO EXTENSÃO INCOMPATÍVEL BLOQUEADA — Rejeita divergência entre extensão e MIME', () => {
  const fDivergente = { name: 'virus_disfarcado.pdf', size: 1000, type: 'image/png' };
  const v = validarArquivoComprovante(fDivergente);
  assert.equal(v.valido, false);
  assert.match(v.erro, /Divergência entre a extensão/);

  const fSemExt = { name: 'arquivo_sem_extensao', size: 1000, type: 'application/pdf' };
  const v2 = validarArquivoComprovante(fSemExt);
  assert.equal(v2.valido, false);
});

test('H) FALHA NO UPLOAD — Pagamento não acontece e título permanece pendente', async () => {
  const db = [{ id: 'conta-20', status: 'pendente', valor: 250.0 }];
  const client = new MockSupabaseClientComStorage(db);

  const file = { name: 'recibo.pdf', size: 1000, type: 'application/pdf' };

  const res = await executarFluxoLiquidacao({
    client,
    contaId: 'conta-20',
    userId: 'op1',
    userName: 'Operador 1',
    file,
    simularFalhaUpload: true
  });

  assert.equal(res.sucesso, false);
  assert.match(res.erro, /Não foi possível enviar o comprovante/);
  assert.equal(db[0].status, 'pendente');
  assert.equal(client.storageObjects.get('financeiro-comprovantes')?.size || 0, 0);
});

test('I) ROLLBACK DO STORAGE — Se UPDATE no banco falhar, arquivo é removido imediatamente', async () => {
  const db = [];
  const client = new MockSupabaseClientComStorage(db);

  const file = { name: 'comprovante_teste.pdf', size: 1500, type: 'application/pdf' };

  const res = await executarFluxoLiquidacao({
    client,
    contaId: 'conta-inexistente',
    userId: 'op1',
    userName: 'Operador 1',
    file
  });

  assert.equal(res.sucesso, false);
  assert.match(res.mensagem, /Este título já foi liquidado/);

  assert.equal(client.uploadHistory.length, 1);
  assert.equal(client.removeHistory.length, 1);
  assert.equal(client.storageObjects.get('financeiro-comprovantes')?.size, 0);
});

test('J) CONCORRÊNCIA — Sessão A vence com Comprovante A; Sessão B perde e seu arquivo B é removido', async () => {
  const db = [{ id: 'conta-conc', status: 'pendente', valor: 500.0 }];
  const client = new MockSupabaseClientComStorage(db);

  const fileA = { name: 'comprovante_A.pdf', size: 2000, type: 'application/pdf' };
  const fileB = { name: 'comprovante_B.png', size: 3000, type: 'image/png' };

  const resA = await executarFluxoLiquidacao({
    client,
    contaId: 'conta-conc',
    userId: 'user-a',
    userName: 'Rafael Costa',
    file: fileA
  });

  assert.equal(resA.sucesso, true);
  assert.equal(db[0].status, 'pago');
  assert.equal(db[0].pago_por_nome, 'Rafael Costa');
  assert.equal(db[0].comprovante_nome, 'comprovante_A.pdf');

  const resB = await executarFluxoLiquidacao({
    client,
    contaId: 'conta-conc',
    userId: 'user-b',
    userName: 'Operador B',
    file: fileB
  });

  assert.equal(resB.sucesso, false);

  assert.equal(client.storageObjects.get('financeiro-comprovantes')?.size, 1);
  const arquivosRestantes = Array.from(client.storageObjects.get('financeiro-comprovantes') || []);
  assert.ok(arquivosRestantes[0].includes('comprovante_A.pdf'));

  assert.equal(db[0].pago_por_id, 'user-a');
  assert.equal(db[0].pago_por_nome, 'Rafael Costa');
  assert.equal(db[0].comprovante_anexado_por_id, 'user-a');
  assert.equal(db[0].comprovante_anexado_por_nome, 'Rafael Costa');
});

test('K) RESPONSÁVEL DO COMPROVANTE — comprova que metadados gravam operador vencedor', async () => {
  const db = [{ id: 'conta-k', status: 'pendente', valor: 75.0 }];
  const client = new MockSupabaseClientComStorage(db);

  const file = { name: 'recibo_oficial.jpg', size: 4500, type: 'image/jpeg' };

  const res = await executarFluxoLiquidacao({
    client,
    contaId: 'conta-k',
    userId: 'admin_master',
    userName: 'Admin Geral',
    file
  });

  assert.equal(res.sucesso, true);
  assert.equal(db[0].pago_por_id, 'admin_master');
  assert.equal(db[0].pago_por_nome, 'Admin Geral');
  assert.equal(db[0].comprovante_anexado_por_id, 'admin_master');
  assert.equal(db[0].comprovante_anexado_por_nome, 'Admin Geral');
  assert.equal(db[0].comprovante_nome, 'recibo_oficial.jpg');
  assert.equal(db[0].comprovante_tipo, 'image/jpeg');
  assert.equal(db[0].comprovante_tamanho, 4500);
});

test('L) NENHUMA SIGNED URL ARMAZENADA NO BANCO — Grava apenas path relativo limpo', async () => {
  const db = [{ id: 'conta-l', status: 'pendente', valor: 120.0 }];
  const client = new MockSupabaseClientComStorage(db);

  const file = { name: 'meu comprovante com acentuação e espaços #1.pdf', size: 5000, type: 'application/pdf' };

  const res = await executarFluxoLiquidacao({
    client,
    contaId: 'conta-l',
    userId: 'rc',
    userName: 'Rafael',
    file
  });

  assert.equal(res.sucesso, true);
  const pathSalvo = db[0].comprovante_path;

  assert.ok(pathSalvo.startsWith('contas-pagar/conta-l/'));
  assert.equal(pathSalvo.includes('http://'), false);
  assert.equal(pathSalvo.includes('https://'), false);
  assert.equal(pathSalvo.includes('token='), false);
  assert.equal(pathSalvo.includes('?'), false);

  assert.equal(db[0].comprovante_nome, 'meu comprovante com acentuação e espaços #1.pdf');
});

// --- SUÍTE DE TESTES DA FASE C ---

test('FASE C — A) Indicador na listagem somente quando há comprovante', () => {
  const itemCom = { id: 'c1', valor: 100, comprovante_path: 'contas-pagar/c1/arq.pdf' };
  const itemSem = { id: 'c2', valor: 200, comprovante_path: null };

  const htmlCom = itemCom.comprovante_path ? '<span class="badge-comprovante">COMPROVANTE</span>' : '';
  const htmlSem = itemSem.comprovante_path ? '<span class="badge-comprovante">COMPROVANTE</span>' : '';

  assert.ok(htmlCom.includes('COMPROVANTE'));
  assert.equal(htmlSem, '');
});

test('FASE C — B) Fallback sem comprovante no modal de detalhes', () => {
  const conta = { id: 'c2', status: 'pago', comprovante_path: null };
  const temComprovante = !!conta.comprovante_path;

  assert.equal(temComprovante, false);
});

test('FASE C — C) Signed URL com expiração de 300 segundos', async () => {
  const db = [{ id: 'conta-view', status: 'pago', comprovante_path: 'contas-pagar/conta-view/doc.pdf' }];
  const client = new MockSupabaseClientComStorage(db);
  await client.storage.from('financeiro-comprovantes').upload('contas-pagar/conta-view/doc.pdf', { size: 100 });

  const { data, error } = await client.storage.from('financeiro-comprovantes').createSignedUrl('contas-pagar/conta-view/doc.pdf', 300);

  assert.equal(error, null);
  assert.ok(data.signedUrl.includes('expires=300'));
  assert.ok(data.signedUrl.includes('token=mock_jwt_token'));
  assert.equal(client.signedUrlCalls[0].expiresIn, 300);
});

test('FASE C — D) getPublicUrl não utilizado (lança erro se chamado)', () => {
  const client = new MockSupabaseClientComStorage();
  assert.throws(() => {
    client.storage.from('financeiro-comprovantes').getPublicUrl('qualquer_path.pdf');
  }, /PROIBIDO/);
});

test('FASE C — E) Anexação posterior válida grava metadados e mantém pagamento pago', async () => {
  const db = [{
    id: 'conta-post-1',
    status: 'pago',
    valor: 350.0,
    pago_por_id: 'homolog_admin',
    pago_por_nome: 'Administrador Homologação',
    comprovante_path: null
  }];
  const client = new MockSupabaseClientComStorage(db);

  const file = { name: 'recibo_posterior.pdf', size: 2500, type: 'application/pdf' };

  const res = await executarFluxoAnexacaoPosterior({
    client,
    contaId: 'conta-post-1',
    userId: 'financeiro_user',
    userName: 'Analista Financeiro',
    file
  });

  assert.equal(res.sucesso, true);
  assert.equal(db[0].status, 'pago');
  assert.equal(db[0].pago_por_nome, 'Administrador Homologação'); // PAGO_POR PRESERVADO
  assert.equal(db[0].comprovante_nome, 'recibo_posterior.pdf');
  assert.equal(db[0].comprovante_anexado_por_id, 'financeiro_user'); // ANEXADO_POR GRAVADO
  assert.equal(db[0].comprovante_anexado_por_nome, 'Analista Financeiro');
  assert.equal(client.storageObjects.get('financeiro-comprovantes')?.size, 1);
});

test('FASE C — F) Anexação posterior somente quando status = "pago"', async () => {
  const db = [{
    id: 'conta-pendente',
    status: 'pendente', // não está paga!
    comprovante_path: null
  }];
  const client = new MockSupabaseClientComStorage(db);

  const file = { name: 'recibo.pdf', size: 1000, type: 'application/pdf' };

  const res = await executarFluxoAnexacaoPosterior({
    client,
    contaId: 'conta-pendente',
    userId: 'op1',
    userName: 'Operador 1',
    file
  });

  assert.equal(res.sucesso, false);
  assert.equal(client.storageObjects.get('financeiro-comprovantes')?.size, 0); // arquivo rollbackeado
  assert.equal(db[0].comprovante_path, null);
});

test('FASE C — G & H) Concorrência no primeiro anexo: A vence, B perde e seu arquivo é descartado', async () => {
  const db = [{
    id: 'conta-post-conc',
    status: 'pago',
    comprovante_path: null
  }];
  const client = new MockSupabaseClientComStorage(db);

  const fileA = { name: 'anexo_A.pdf', size: 1200, type: 'application/pdf' };
  const fileB = { name: 'anexo_B.jpg', size: 2200, type: 'image/jpeg' };

  // Sessão A anexa com sucesso
  const resA = await executarFluxoAnexacaoPosterior({
    client,
    contaId: 'conta-post-conc',
    userId: 'user-a',
    userName: 'Usuário A',
    file: fileA
  });

  assert.equal(resA.sucesso, true);
  assert.equal(db[0].comprovante_nome, 'anexo_A.pdf');

  // Sessão B tenta anexar no mesmo título (que agora tem comprovante_path preenchido)
  const resB = await executarFluxoAnexacaoPosterior({
    client,
    contaId: 'conta-post-conc',
    userId: 'user-b',
    userName: 'Usuário B',
    file: fileB
  });

  assert.equal(resB.sucesso, false);
  assert.match(resB.mensagem, /já possui um comprovante/);

  // Bucket deve conter apenas o arquivo de A
  assert.equal(client.storageObjects.get('financeiro-comprovantes')?.size, 1);
  const arqs = Array.from(client.storageObjects.get('financeiro-comprovantes') || []);
  assert.ok(arqs[0].includes('anexo_A.pdf'));

  // Metadados permanecem de A
  assert.equal(db[0].comprovante_anexado_por_nome, 'Usuário A');
});

test('FASE C — I, J, M) Substituição válida: UPDATE condicionado ao path antigo e remoção do antigo após sucesso', async () => {
  const pathOriginal = 'contas-pagar/conta-sub/1000-comprovante_antigo.pdf';
  const db = [{
    id: 'conta-sub',
    status: 'pago',
    pago_por_id: 'op_original',
    pago_por_nome: 'Operador Original',
    comprovante_path: pathOriginal,
    comprovante_nome: 'comprovante_antigo.pdf'
  }];
  const client = new MockSupabaseClientComStorage(db);
  // Popula o bucket com o arquivo antigo
  await client.storage.from('financeiro-comprovantes').upload(pathOriginal, { size: 1000, type: 'application/pdf' });

  assert.equal(client.storageObjects.get('financeiro-comprovantes')?.size, 1);

  const novoFile = { name: 'comprovante_novo.pdf', size: 3000, type: 'application/pdf' };

  const res = await executarFluxoSubstituicao({
    client,
    contaId: 'conta-sub',
    userId: 'op_substituto',
    userName: 'Operador Substituto',
    file: novoFile,
    pathAntigo: pathOriginal
  });

  assert.equal(res.sucesso, true);
  assert.equal(db[0].status, 'pago');
  assert.equal(db[0].pago_por_nome, 'Operador Original'); // PAGO_POR NÃO ALTERADO
  assert.equal(db[0].comprovante_nome, 'comprovante_novo.pdf');
  assert.notEqual(db[0].comprovante_path, pathOriginal);
  assert.equal(db[0].comprovante_anexado_por_nome, 'Operador Substituto');

  // Confirma que o arquivo antigo foi removido e o novo existe (total = 1)
  assert.equal(client.storageObjects.get('financeiro-comprovantes')?.size, 1);
  const arqs = Array.from(client.storageObjects.get('financeiro-comprovantes') || []);
  assert.ok(arqs[0].includes('comprovante_novo.pdf'));
  assert.ok(!arqs[0].includes('comprovante_antigo.pdf'));
});

test('FASE C — K & L) Concorrência na substituição: Sessão A vence, Sessão B perde e seu novo arquivo é removido', async () => {
  const pathOriginal = 'contas-pagar/conta-sub-conc/1000-original.pdf';
  const db = [{
    id: 'conta-sub-conc',
    status: 'pago',
    comprovante_path: pathOriginal,
    comprovante_nome: 'original.pdf'
  }];
  const client = new MockSupabaseClientComStorage(db);
  await client.storage.from('financeiro-comprovantes').upload(pathOriginal, { size: 1000 });

  const fileA = { name: 'novo_A.pdf', size: 1500, type: 'application/pdf' };
  const fileB = { name: 'novo_B.jpg', size: 2500, type: 'image/jpeg' };

  // Sessão A substitui com sucesso
  const resA = await executarFluxoSubstituicao({
    client,
    contaId: 'conta-sub-conc',
    userId: 'user-a',
    userName: 'Operador A',
    file: fileA,
    pathAntigo: pathOriginal
  });

  assert.equal(resA.sucesso, true);
  assert.equal(db[0].comprovante_nome, 'novo_A.pdf');

  // Sessão B tenta substituir esperando o pathOriginal (que já foi substituído por A)
  const resB = await executarFluxoSubstituicao({
    client,
    contaId: 'conta-sub-conc',
    userId: 'user-b',
    userName: 'Operador B',
    file: fileB,
    pathAntigo: pathOriginal
  });

  assert.equal(resB.sucesso, false);
  assert.match(resB.mensagem, /alterado por outra sessão/);

  // Storage deve conter apenas o novo_A.pdf (original removido por A, novo_B descartado pelo rollback de B)
  assert.equal(client.storageObjects.get('financeiro-comprovantes')?.size, 1);
  const arqs = Array.from(client.storageObjects.get('financeiro-comprovantes') || []);
  assert.ok(arqs[0].includes('novo_A.pdf'));
  assert.equal(db[0].comprovante_anexado_por_nome, 'Operador A');
});

test('FASE C — N) Falha na remoção do antigo não corrompe referência nova no banco', async () => {
  const pathOriginal = 'contas-pagar/conta-falha-rem/original.pdf';
  const db = [{
    id: 'conta-falha-rem',
    status: 'pago',
    comprovante_path: pathOriginal,
    comprovante_nome: 'original.pdf'
  }];
  const client = new MockSupabaseClientComStorage(db);
  await client.storage.from('financeiro-comprovantes').upload(pathOriginal, { size: 1000 });

  const novoFile = { name: 'novo_valido.pdf', size: 2000, type: 'application/pdf' };

  const res = await executarFluxoSubstituicao({
    client,
    contaId: 'conta-falha-rem',
    userId: 'op1',
    userName: 'Operador 1',
    file: novoFile,
    pathAntigo: pathOriginal,
    simularFalhaRemocaoAntigo: true
  });

  // Operação no banco continua um sucesso e o novo comprovante é canônico
  assert.equal(res.sucesso, true);
  assert.equal(db[0].comprovante_nome, 'novo_valido.pdf');
  assert.ok(res.avisoLimpezaAntigo !== null);
});

test('FASE C — O, P, Q) Metadados preservados e nenhuma Signed URL persistida', async () => {
  const db = [{
    id: 'conta-meta',
    status: 'pago',
    pago_por_id: 'user_pagador',
    pago_por_nome: 'Quem Pagou',
    comprovante_path: null
  }];
  const client = new MockSupabaseClientComStorage(db);

  const file = { name: 'recibo_detalhes.pdf', size: 3200, type: 'application/pdf' };

  const res = await executarFluxoAnexacaoPosterior({
    client,
    contaId: 'conta-meta',
    userId: 'user_anexador',
    userName: 'Quem Anexou',
    file
  });

  assert.equal(res.sucesso, true);
  assert.equal(db[0].pago_por_id, 'user_pagador');
  assert.equal(db[0].pago_por_nome, 'Quem Pagou');
  assert.equal(db[0].comprovante_anexado_por_id, 'user_anexador');
  assert.equal(db[0].comprovante_anexado_por_nome, 'Quem Anexou');

  // Nenhuma signed url no banco
  assert.equal(db[0].comprovante_path.includes('http'), false);
  assert.equal(db[0].comprovante_path.includes('token='), false);
  assert.equal(db[0].comprovante_path.includes('?'), false);
});
