import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

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

// Credenciais exclusivamente server-side / local (sem prefixo VITE_)
const SQL_SERVER_HOST = process.env.SQL_SERVER_HOST || envLocal.SQLSERVER_HOST || '192.168.15.20';
const SQL_SERVER_PORT = process.env.SQL_SERVER_PORT || envLocal.SQLSERVER_PORT || '1433';
const SQL_SERVER_DATABASE = process.env.SQL_SERVER_DATABASE || 'dyautoparts_homologacao';
const SQL_SERVER_USER = process.env.SQL_SERVER_USER || envLocal.SQLSERVER_USER || 'dyautoparts_user';
const SQL_SERVER_PASSWORD = process.env.SQL_SERVER_PASSWORD || envLocal.SQLSERVER_PASSWORD || 'dyautoparts_user';

const SUPABASE_URL = process.env.SUPABASE_URL || envLocal.VITE_SUPABASE_URL || 'https://doklsgduslimidfbyngj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || envLocal.VITE_SUPABASE_ANON_KEY;

const BATCH_SIZE = parseInt(process.env.SYNC_BATCH_SIZE || '250', 10);

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
        // Fallback para caracteres de escape de contrabarra problemáticos
        const sanitizedFallback = jsonStr.replace(/\\([^"\\/bfnrtu])/g, '/$1');
        return JSON.parse(sanitizedFallback);
    }
}

// Helper para REST API no Supabase
async function supabaseFetch(endpoint, options = {}) {
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
    console.log('1. SEGURANÇA E AMBIENTES');
    console.log('==================================================');

    // Validar SQL Server
    const dbCheck = querySql('SELECT DB_NAME() AS banco_atual FOR JSON PATH');
    const bancoAtual = dbCheck && dbCheck[0] ? dbCheck[0].banco_atual : null;
    console.log(`[SQL Server] Banco confirmado: "${bancoAtual}"`);
    if (bancoAtual !== 'dyautoparts_homologacao') {
        console.error(`[FATAL] Banco SQL Server "${bancoAtual}" não permitido! ABORTANDO.`);
        process.exit(1);
    }

    // Validar Supabase Ref
    console.log(`[Supabase] URL alvo: "${SUPABASE_URL}"`);
    if (!SUPABASE_URL.includes('doklsgduslimidfbyngj')) {
        console.error(`[FATAL] Projeto Supabase diferente de Homologação (doklsgduslimidfbyngj)! ABORTANDO.`);
        process.exit(1);
    }

    console.log('Ambientes de Homologação validados com SUCESSO!\n');
}

// 2. Sincronizar Contas (dbo.Accounts ➔ mercadolivre_accounts)
async function sincronizarContas() {
    console.log('==================================================');
    console.log('2. SINCRONIZAÇÃO DE CONTAS (dbo.Accounts ➔ mercadolivre_accounts)');
    console.log('==================================================');

    const accountsSql = querySql('SELECT id, name, user_id, platform, status FROM dbo.Accounts FOR JSON PATH');
    console.log(`[SQL Server] Contas encontradas em dbo.Accounts: ${accountsSql.length}`);

    const existingSupabaseAccounts = await supabaseFetch('mercadolivre_accounts?select=*');
    console.log(`[Supabase] Contas existentes antes da sync: ${existingSupabaseAccounts.length}`);

    const payload = accountsSql.map(acc => {
        const isNumericUser = acc.user_id && /^\d+$/.test(String(acc.user_id).trim());
        return {
            platform: String(acc.platform || 'mercadolibre').trim(),
            source_account_id: String(acc.id).trim(),
            seller_externo_id: acc.user_id ? String(acc.user_id).trim() : String(acc.id).trim(),
            nome_operacional: acc.name ? String(acc.name).trim() : `Conta ${acc.id}`,
            nickname: acc.name ? String(acc.name).trim() : `Conta ${acc.id}`,
            meli_user_id: isNumericUser ? String(acc.user_id).trim() : null,
            updated_at: new Date().toISOString()
        };
    });

    await supabaseFetch('mercadolivre_accounts?on_conflict=platform,source_account_id', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(payload)
    });

    const updatedSupabaseAccounts = await supabaseFetch('mercadolivre_accounts?select=*');
    console.log(`[Supabase] Contas em mercadolivre_accounts após sync: ${updatedSupabaseAccounts.length}`);

    const accountMap = new Map();
    let legadasIntocadas = 0;
    let criadasAtualizadas = 0;

    for (const acc of updatedSupabaseAccounts) {
        if (acc.platform && acc.source_account_id) {
            accountMap.set(`${acc.platform}:${acc.source_account_id}`, acc.id);
            criadasAtualizadas++;
        } else {
            legadasIntocadas++;
        }
    }

    console.log(`[Resumo Contas] Sincronizadas: ${criadasAtualizadas} | Preservadas Legadas: ${legadasIntocadas}\n`);
    return { accountMap, totalSql: accountsSql.length, totalSupabase: updatedSupabaseAccounts.length, legadasIntocadas, criadasAtualizadas };
}

// Parseador enxuto de variações em raw_data
function parseVariationsFromRawData(rawDataStr, platform) {
    if (!rawDataStr) return [];
    try {
        const raw = typeof rawDataStr === 'string' ? JSON.parse(rawDataStr) : rawDataStr;
        if (Array.isArray(raw.variations) && raw.variations.length > 0) {
            return raw.variations.map(v => {
                let attrStr = '';
                if (Array.isArray(v.attribute_combinations)) {
                    attrStr = v.attribute_combinations.map(a => `${a.name || a.id}: ${a.value_name || a.value_id}`).join(', ');
                }
                const varId = String(v.id || '').trim();
                const sellerSku = v.seller_custom_field || v.seller_sku || null;
                const varKey = attrStr ? attrStr.replace(/[^a-zA-Z0-9=_.-]/g, '_') : (varId || '__SEM_VARIACAO__');

                return {
                    variation_id: varId || null,
                    variation_key: varKey,
                    attribute: attrStr || null,
                    seller_sku: sellerSku ? String(sellerSku).trim() : null,
                    price: v.price ? Number(v.price) : null,
                    available_quantity: v.available_quantity ? Number(v.available_quantity) : 0
                };
            });
        }
    } catch (e) {
        console.warn(`[AVISO] Erro de transformação no raw_data de variação: ${e.message}`);
    }
    return [];
}

// 3. Sincronizar Anúncios (dbo.Items ➔ marketplace_anuncios_catalogo)
async function sincronizarAnuncios(accountMap) {
    console.log('==================================================');
    console.log(`3. SINCRONIZAÇÃO DE ANÚNCIOS (dbo.Items ➔ marketplace_anuncios_catalogo)`);
    console.log(`Tamanho do lote (BATCH_SIZE): ${BATCH_SIZE}`);
    console.log('==================================================');

    // 3.1 Consultar antecipadamente apenas os registros com variações (has_variations = 1)
    console.log('[Varições] Consultando raw_data dos anúncios com variações (has_variations = 1)...');
    const variationsSql = querySql('SELECT id, platform, raw_data FROM dbo.Items WHERE has_variations = 1 FOR JSON PATH');
    const variationsDataMap = new Map();
    let errosTransformacao = 0;

    for (const itemVar of variationsSql) {
        try {
            const parsedVars = parseVariationsFromRawData(itemVar.raw_data, itemVar.platform);
            variationsDataMap.set(String(itemVar.id).trim(), parsedVars);
        } catch (err) {
            errosTransformacao++;
            console.error(`[ERRO TRANSFORMACAO] Falha ao transformar raw_data do item "${itemVar.id}":`, err.message);
        }
    }
    console.log(`[Varições] Processadas ${variationsDataMap.size} variações com sucesso.\n`);

    const countResult = querySql('SELECT COUNT(*) as total FROM dbo.Items FOR JSON PATH');
    const totalItems = countResult[0].total;
    console.log(`[SQL Server] Total de anúncios em dbo.Items: ${totalItems}`);

    let offset = 0;
    let totalProcessados = 0;
    let anunciosSemConta = 0;

    while (offset < totalItems) {
        const sqlBatch = `
            SELECT id, account_id, platform, title, price, available_quantity, status, category_id, seller_sku, permalink, thumbnail, has_variations, last_updated
            FROM dbo.Items
            ORDER BY id
            OFFSET ${offset} ROWS FETCH NEXT ${BATCH_SIZE} ROWS ONLY
            FOR JSON PATH
        `;

        const itemsBatch = querySql(sqlBatch);
        if (!itemsBatch || itemsBatch.length === 0) break;

        const payloadBatch = [];

        for (const item of itemsBatch) {
            const platform = String(item.platform || '').trim();
            const sourceAccId = String(item.account_id || '').trim();
            const key = `${platform}:${sourceAccId}`;

            const supabaseAccId = accountMap.get(key);
            if (!supabaseAccId) {
                console.error(`[ERRO ORFANTO] Anúncio "${item.id}" não possui conta correspondente no Supabase (key: "${key}"). Ignorado.`);
                anunciosSemConta++;
                continue;
            }

            const itemIdStr = String(item.id).trim();
            let variationsJson = [];
            if (item.has_variations === true || item.has_variations === 1) {
                variationsJson = variationsDataMap.get(itemIdStr) || [];
            }

            payloadBatch.push({
                marketplace: platform,
                source_account_id: sourceAccId,
                account_id: supabaseAccId,
                item_id: itemIdStr,
                title: String(item.title || '').trim(),
                price: item.price !== undefined && item.price !== null ? Number(item.price) : null,
                available_quantity: item.available_quantity !== undefined && item.available_quantity !== null ? Number(item.available_quantity) : 0,
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

        if (payloadBatch.length > 0) {
            await supabaseFetch('marketplace_anuncios_catalogo?on_conflict=marketplace,source_account_id,item_id', {
                method: 'POST',
                headers: { 'Prefer': 'resolution=merge-duplicates' },
                body: JSON.stringify(payloadBatch)
            });
        }

        totalProcessados += payloadBatch.length;
        offset += BATCH_SIZE;
        console.log(`[Progresso Sync] Processados ${totalProcessados} de ${totalItems} anúncios...`);
    }

    console.log(`[Resumo Anúncios] Processados com Sucesso: ${totalProcessados} | Sem Conta: ${anunciosSemConta} | Erros Variação: ${errosTransformacao}\n`);
    return { totalProcessados, anunciosSemConta, errosTransformacao, totalVariacoesSql: variationsSql.length };
}

// 4. Validação Automática e Comparação SQL x Supabase
async function executarAuditoria() {
    console.log('==================================================');
    console.log('4. AUDITORIA E VALIDAÇÃO COMPARATIVA (SQL x SUPABASE)');
    console.log('==================================================');

    const fetchCount = async (query = '') => {
        const endpoint = `marketplace_anuncios_catalogo?select=count${query ? '&' + query : ''}`;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'count=exact' }
        });
        const range = res.headers.get('content-range');
        return range ? parseInt(range.split('/')[1], 10) : 0;
    };

    const totalSupabase = await fetchCount();
    const totalML = await fetchCount('marketplace=eq.mercadolibre');
    const totalShopee = await fetchCount('marketplace=eq.shopee');
    const totalActive = await fetchCount('status=eq.active');
    const totalPaused = await fetchCount('status=eq.paused');
    const totalReview = await fetchCount('status=eq.under_review');
    const totalVariacoes = await fetchCount('has_variations=eq.true');
    const totalSkuPreenchido = await fetchCount('seller_sku=not.is.null');
    const totalSkuNulo = await fetchCount('seller_sku=is.null');
    const totalThumbPreenchido = await fetchCount('thumbnail=not.is.null');
    const totalThumbNulo = await fetchCount('thumbnail=is.null');
    const totalAusentes = await fetchCount('ausente_na_origem=eq.true');

    // Totais por conta
    const accountsInSupabase = await supabaseFetch('mercadolivre_accounts?select=id,platform,source_account_id,nome_operacional');
    const accountStats = [];

    for (const acc of accountsInSupabase) {
        if (acc.platform && acc.source_account_id) {
            const count = await fetchCount(`account_id=eq.${acc.id}`);
            accountStats.push({
                account_id: acc.id,
                nome: acc.nome_operacional,
                platform: acc.platform,
                source_account_id: acc.source_account_id,
                total_anuncios: count
            });
        }
    }

    console.log('┌─────────────────────────────────────┬──────────────┬─────────────────┐');
    console.log('│ Métrica                             │ SQL Esperado │ Supabase REAL   │');
    console.log('├─────────────────────────────────────┼──────────────┼─────────────────┤');
    console.log(`│ Total Geral de Anúncios             │ 20.000       │ ${totalSupabase.toString().padEnd(15)} │`);
    console.log(`│ Mercado Livre (mercadolibre)        │ 10.000       │ ${totalML.toString().padEnd(15)} │`);
    console.log(`│ Shopee                              │ 10.000       │ ${totalShopee.toString().padEnd(15)} │`);
    console.log(`│ Status Active                       │ 18.339       │ ${totalActive.toString().padEnd(15)} │`);
    console.log(`│ Status Paused                       │ 1.560        │ ${totalPaused.toString().padEnd(15)} │`);
    console.log(`│ Status Under Review                 │ 101          │ ${totalReview.toString().padEnd(15)} │`);
    console.log(`│ Anúncios com Variações              │ 12           │ ${totalVariacoes.toString().padEnd(15)} │`);
    console.log(`│ Seller SKU Preenchido               │ 2.196        │ ${totalSkuPreenchido.toString().padEnd(15)} │`);
    console.log(`│ Seller SKU Nulo                     │ 17.804       │ ${totalSkuNulo.toString().padEnd(15)} │`);
    console.log(`│ Thumbnail Preenchido                │ 20.000       │ ${totalThumbPreenchido.toString().padEnd(15)} │`);
    console.log(`│ Thumbnail Nulo                      │ 0            │ ${totalThumbNulo.toString().padEnd(15)} │`);
    console.log(`│ Anúncios Ausentes na Origem         │ 0            │ ${totalAusentes.toString().padEnd(15)} │`);
    console.log('└─────────────────────────────────────┴──────────────┴─────────────────┘\n');

    console.log('[Totais por Conta Sincronizada em Supabase]:');
    for (const stat of accountStats) {
        console.log(`  - Conta [${stat.account_id}] ${stat.nome} (${stat.platform} / ${stat.source_account_id}): ${stat.total_anuncios} anúncios`);
    }
    console.log('');

    return { totalSupabase, totalML, totalShopee, totalActive, totalPaused, totalReview, totalVariacoes, totalSkuPreenchido, totalSkuNulo, totalThumbPreenchido, totalThumbNulo, totalAusentes, accountStats };
}

// 5. Execução Completa da Carga Inicial + Idempotência
async function run() {
    console.log('\n==================================================');
    console.log('INICIANDO FASE 1B: CARGA INICIAL REAL SQL ➔ SUPABASE');
    console.log('==================================================\n');

    await validarSeguranca();
    const contasRes = await sincronizarContas();
    const anunciosRes = await sincronizarAnuncios(contasRes.accountMap);
    
    console.log('[Auditoria] Executando validação da PRIMEIRA carga...');
    const audit1 = await executarAuditoria();

    console.log('==================================================');
    console.log('5. TESTE DE IDEMPOTÊNCIA (SEGUNDA EXECUÇÃO EM LOTE)');
    console.log('==================================================');
    console.log('Re-executando sincronização de contas e anúncios...');
    const contasRes2 = await sincronizarContas();
    await sincronizarAnuncios(contasRes2.accountMap);

    console.log('[Auditoria] Executando validação da SEGUNDA carga (Idempotência)...');
    const audit2 = await executarAuditoria();

    if (audit1.totalSupabase === audit2.totalSupabase) {
        console.log('SUCCESS: Teste de Idempotência PASSOU 100%! O número de registros permaneceu inalterado.');
    } else {
        console.error(`ERROR: Teste de Idempotência FALHOU! 1ª carga: ${audit1.totalSupabase}, 2ª carga: ${audit2.totalSupabase}`);
    }

    console.log('\nFASE 1B CONCLUÍDA COM SUCESSO. PARANDO EXECUÇÃO.');
}

run().catch(err => {
    console.error('\n[ERRO CRÍTICO NA EXECUÇÃO]:', err);
    process.exit(1);
});
