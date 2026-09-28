import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const IS_DRY_RUN = process.argv.includes('--dry-run');

// Helper para ler .env.local
function loadEnvLocal() {
    const envPath = path.join(projectRoot, '.env.local');
    const envVars = {};
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const idx = trimmed.indexOf('=');
                const k = trimmed.substring(0, idx).trim();
                let v = trimmed.substring(idx + 1).trim();
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                    v = v.slice(1, -1);
                }
                envVars[k] = v;
            }
        }
    }
    return envVars;
}

const envLocal = loadEnvLocal();

// Credenciais exclusivamente server-side / local
const SQL_SERVER_HOST = process.env.SQL_SERVER_HOST || envLocal.SQLSERVER_HOST || '192.168.15.20';
const SQL_SERVER_PORT = process.env.SQL_SERVER_PORT || envLocal.SQLSERVER_PORT || '1433';
const SQL_SERVER_DATABASE = process.env.SQL_SERVER_DATABASE || envLocal.SQLSERVER_DATABASE || 'dyautoparts_homologacao';
const SQL_SERVER_USER = process.env.SQL_SERVER_USER || envLocal.SQLSERVER_USER || 'dyautoparts_user';
const SQL_SERVER_PASSWORD = process.env.SQL_SERVER_PASSWORD || envLocal.SQLSERVER_PASSWORD || 'dyautoparts_user';

const SUPABASE_URL = (process.env.SUPABASE_URL || envLocal.VITE_SUPABASE_URL || 'https://ccpxhbvmmabrttqsmqaj.supabase.co').replace(/\/rest\/v1\/?$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || envLocal.VITE_SUPABASE_ANON_KEY;

const BATCH_SIZE = parseInt(process.env.SYNC_BATCH_SIZE || '250', 10);

let supabaseWritesCount = 0;

// Helper robusto para consulta SQL Server via sqlcmd com JSON PATH
function querySql(sqlQuery) {
    const fullQuery = `SET NOCOUNT ON; ${sqlQuery};`;
    const args = [
        '-S', `${SQL_SERVER_HOST},${SQL_SERVER_PORT}`,
        '-U', SQL_SERVER_USER,
        '-P', SQL_SERVER_PASSWORD,
        '-d', SQL_SERVER_DATABASE,
        '-C',
        '-f', '65001',
        '-y', '0',
        '-Q', fullQuery
    ];

    const raw = execFileSync('sqlcmd', args, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
    const lines = raw.split(/\r?\n/);
    let joined = lines.map(l => l.trimRight()).join('');

    const firstIdx = Math.min(
        joined.indexOf('[') !== -1 ? joined.indexOf('[') : Infinity,
        joined.indexOf('{') !== -1 ? joined.indexOf('{') : Infinity
    );
    if (firstIdx === Infinity) return [];

    const lastIdx = Math.max(joined.lastIndexOf(']'), joined.lastIndexOf('}'));
    if (lastIdx === -1 || lastIdx < firstIdx) return [];

    let jsonStr = joined.substring(firstIdx, lastIdx + 1);

    // Sanitização de caracteres de controle invisíveis mantendo integridade JSON
    jsonStr = jsonStr.replace(/[\x00-\x1F]/g, c => {
        if (c === '\n' || c === '\r' || c === '\t') return ' ';
        return '';
    });

    try {
        return JSON.parse(jsonStr);
    } catch (err) {
        const sanitizedFallback = jsonStr.replace(/\\([^"\\/bfnrtu])/g, '/$1');
        return JSON.parse(sanitizedFallback);
    }
}

// Helper para REST API no Supabase
async function supabaseFetch(endpoint, options = {}) {
    if (IS_DRY_RUN && options.method && options.method !== 'GET') {
        supabaseWritesCount++;
        return { dry_run: true };
    }

    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Erro Supabase (${res.status} ${res.statusText}) em ${endpoint}: ${text}`);
    }

    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return await res.json();
    }
    return null;
}

// 1. Validação Obrigatória de Segurança
async function validarSeguranca() {
    console.log('==================================================');
    console.log(`1. SEGURANÇA E AMBIENTES ${IS_DRY_RUN ? '[MODO DRY-RUN / ZERO ESCRITAS]' : ''}`);
    console.log('==================================================');

    // Validar SQL Server
    const dbCheck = querySql('SELECT DB_NAME() AS banco_atual FOR JSON PATH');
    const bancoAtual = dbCheck && dbCheck[0] ? dbCheck[0].banco_atual : null;
    console.log(`[SQL Server] Banco conectado: "${bancoAtual}"`);

    // Validar Supabase
    console.log(`[Supabase] URL alvo: "${SUPABASE_URL}"`);
    console.log(`[Modo de Execução] DRY-RUN ATIVO: ${IS_DRY_RUN ? 'SIM (Escritas BLOQUEADAS)' : 'NÃO (Modo Real)'}\n`);
}

// 2. Sincronizar Contas (dbo.Accounts -> mercadolivre_accounts)
async function sincronizarContas() {
    console.log('==================================================');
    console.log('2. SINCRONIZAÇÃO DE CONTAS (dbo.Accounts -> mercadolivre_accounts)');
    console.log('==================================================');

    const accountsSql = querySql('SELECT id, name, user_id, platform, status FROM dbo.Accounts FOR JSON PATH');
    console.log(`[SQL Server] Contas encontradas em dbo.Accounts: ${accountsSql.length}`);

    let existingSupabaseAccounts = [];
    if (!IS_DRY_RUN) {
        try {
            existingSupabaseAccounts = await supabaseFetch('mercadolivre_accounts?select=*') || [];
        } catch (_) {
            existingSupabaseAccounts = [];
        }
    }
    console.log(`[Supabase] Contas existentes antes da sync: ${existingSupabaseAccounts.length}`);

    // Payload rigorosamente compatível com o schema de Produção
    // REMOVIDOS: meli_user_id, updated_at
    // INCLUÍDOS: platform, source_account_id, seller_externo_id, nome_operacional, nickname, marketplace, ativo
    const payload = accountsSql.map(acc => {
        const platformClean = String(acc.platform || 'mercadolibre').trim().toLowerCase();
        const marketplaceVal = platformClean === 'shopee' ? 'SHOPEE' : (platformClean === 'magalu' ? 'MAGALU' : 'MERCADO_LIVRE');
        return {
            platform: platformClean,
            source_account_id: String(acc.id).trim(),
            seller_externo_id: acc.user_id ? String(acc.user_id).trim() : String(acc.id).trim(),
            nome_operacional: acc.name ? String(acc.name).trim() : `Conta ${acc.id}`,
            nickname: acc.name ? String(acc.name).trim() : `Conta ${acc.id}`,
            marketplace: marketplaceVal,
            ativo: acc.status ? acc.status.toLowerCase() === 'active' : true
        };
    });

    console.log(`[Payload Validação] Contas a enviar: ${payload.length}`);
    if (payload.length > 0) {
        console.log(`[Payload Sample Keys]:`, Object.keys(payload[0]));
    }

    if (!IS_DRY_RUN) {
        await supabaseFetch('mercadolivre_accounts?on_conflict=platform,source_account_id', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(payload)
        });
    }

    const accountMap = new Map();
    if (IS_DRY_RUN) {
        payload.forEach((acc, idx) => {
            accountMap.set(`${acc.platform}:${acc.source_account_id}`, idx + 1);
        });
    } else {
        const updatedSupabaseAccounts = await supabaseFetch('mercadolivre_accounts?select=*') || [];
        for (const acc of updatedSupabaseAccounts) {
            if (acc.platform && acc.source_account_id) {
                accountMap.set(`${acc.platform}:${acc.source_account_id}`, acc.id);
            }
        }
    }

    console.log(`[Mapeamento de Contas] Mapeadas para FK de Catálogo: ${accountMap.size}\n`);
    return { accountsSql, accountMap };
}

// 3. Sincronizar Anúncios e Variações (dbo.Items -> marketplace_anuncios_catalogo)
async function sincronizarAnuncios(accountMap) {
    console.log('==================================================');
    console.log('3. SINCRONIZAÇÃO DE CATÁLOGO (dbo.Items -> marketplace_anuncios_catalogo)');
    console.log('==================================================');

    const totalRes = querySql('SELECT COUNT(*) AS total FROM dbo.Items FOR JSON PATH');
    const totalItems = totalRes && totalRes[0] ? totalRes[0].total : 0;
    console.log(`[SQL Server] Total de Anúncios no dbo.Items: ${totalItems}`);

    const variationsSql = querySql(`
        SELECT
            parent_id,
            variation_id,
            variation_sku,
            attributes_json,
            price,
            available_quantity
        FROM dbo.ItemVariations
        FOR JSON PATH
    `);
    console.log(`[SQL Server] Variações carregadas em memória: ${variationsSql.length}`);

    // Agrupamento de variações por parent_id
    const variationsByParent = new Map();
    for (const v of variationsSql) {
        const parentId = String(v.parent_id).trim();
        if (!variationsByParent.has(parentId)) {
            variationsByParent.set(parentId, []);
        }
        variationsByParent.get(parentId).push(v);
    }

    let offset = 0;
    let totalProcessados = 0;
    let anunciosSemConta = 0;
    let errosTransformacao = 0;

    while (offset < totalItems) {
        const itemsSql = querySql(`
            SELECT
                id AS item_id,
                account_id,
                title,
                price,
                available_quantity,
                status,
                seller_sku,
                permalink,
                thumbnail,
                has_variations,
                last_updated
            FROM dbo.Items
            ORDER BY id
            OFFSET ${offset} ROWS
            FETCH NEXT ${BATCH_SIZE} ROWS ONLY
            FOR JSON PATH
        `);

        if (!itemsSql || itemsSql.length === 0) break;

        const payloadBatch = [];

        for (const item of itemsSql) {
            const platformDetected = item.item_id.startsWith('MLB') ? 'mercadolibre' : 'shopee';
            const accountLookupKey = `${platformDetected}:${String(item.account_id).trim()}`;
            const accSupabaseId = accountMap.get(accountLookupKey);

            if (!accSupabaseId) {
                anunciosSemConta++;
                continue;
            }

            let variationsJson = [];
            if (item.has_variations) {
                const vars = variationsByParent.get(String(item.item_id).trim()) || [];
                variationsJson = vars.map(v => {
                    let parsedAttrs = null;
                    if (v.attributes_json) {
                        try {
                            parsedAttrs = typeof v.attributes_json === 'string' ? JSON.parse(v.attributes_json) : v.attributes_json;
                        } catch (_) {
                            parsedAttrs = v.attributes_json;
                        }
                    }
                    return {
                        variation_id: String(v.variation_id).trim(),
                        seller_sku: v.variation_sku ? String(v.variation_sku).trim() : null,
                        price: v.price ? Number(v.price) : null,
                        available_quantity: Number.isInteger(v.available_quantity) ? v.available_quantity : 0,
                        attributes: parsedAttrs
                    };
                });
            }

            payloadBatch.push({
                marketplace: platformDetected,
                source_account_id: String(item.account_id).trim(),
                account_id: accSupabaseId,
                item_id: String(item.item_id).trim(),
                title: String(item.title).trim(),
                price: item.price ? Number(item.price) : null,
                available_quantity: Number.isInteger(item.available_quantity) ? item.available_quantity : 0,
                status: item.status ? String(item.status).trim() : null,
                seller_sku: item.seller_sku && String(item.seller_sku).trim() !== '' ? String(item.seller_sku).trim() : null,
                thumbnail: item.thumbnail ? String(item.thumbnail).trim() : null,
                permalink: item.permalink ? String(item.permalink).trim() : null,
                has_variations: Boolean(item.has_variations),
                variations_data: variationsJson,
                last_updated_sql: item.last_updated ? new Date(item.last_updated).toISOString() : null,
                ausente_na_origem: false,
                sincronizado_em: new Date().toISOString()
            });
        }

        if (!IS_DRY_RUN && payloadBatch.length > 0) {
            await supabaseFetch('marketplace_anuncios_catalogo?on_conflict=marketplace,source_account_id,item_id', {
                method: 'POST',
                headers: { 'Prefer': 'resolution=merge-duplicates' },
                body: JSON.stringify(payloadBatch)
            });
        }

        totalProcessados += payloadBatch.length;
        offset += BATCH_SIZE;
        if (totalProcessados % 5000 === 0 || totalProcessados === totalItems) {
            console.log(`[Progresso Sync] Processados ${totalProcessados} de ${totalItems} anúncios...`);
        }
    }

    console.log(`[Resumo Anúncios] Processados com Sucesso: ${totalProcessados} | Sem Conta: ${anunciosSemConta} | Erros Variação: ${errosTransformacao}\n`);
    return { totalProcessados, anunciosSemConta, errosTransformacao, totalVariacoesSql: variationsSql.length };
}

// 4. Execução
async function run() {
    console.log('\n==================================================');
    console.log(`INICIANDO SINCRONIZADOR SQL ➔ SUPABASE ${IS_DRY_RUN ? '[DRY-RUN]' : '[EXECUÇÃO REAL]'}`);
    console.log('==================================================\n');

    await validarSeguranca();
    const contasRes = await sincronizarContas();
    const anunciosRes = await sincronizarAnuncios(contasRes.accountMap);

    console.log('==================================================');
    console.log('RELATÓRIO DE EXECUÇÃO');
    console.log('==================================================');
    console.log(`Contas Identificadas: ${contasRes.accountsSql.length}`);
    console.log(`Anúncios Processados: ${anunciosRes.totalProcessados}`);
    console.log(`Escritas no Supabase: ${IS_DRY_RUN ? 0 : supabaseWritesCount}`);
    console.log(`Modo: ${IS_DRY_RUN ? 'DRY-RUN (NENHUM dado gravado)' : 'REAL'}`);
    console.log('==================================================\n');
}

run().catch(err => {
    console.error('\n[ERRO CRÍTICO NA EXECUÇÃO]:', err);
    process.exit(1);
});
