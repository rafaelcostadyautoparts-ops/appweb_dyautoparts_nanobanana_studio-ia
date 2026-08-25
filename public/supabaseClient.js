const HOMOLOGATION_PROJECT_REF = 'doklsgduslimidfbyngj';
const HOMOLOGATION_SUPABASE_URL = `https://${HOMOLOGATION_PROJECT_REF}.supabase.co`;

function getConfiguredValue(value) {
    const normalized = String(value || '').trim();
    return normalized && !normalized.includes('%VITE_') ? normalized : '';
}

const runtimeConfig = window.__DY_APP_CONFIG__ || {};
const configuredEnvironment = getConfiguredValue(runtimeConfig.appEnvironment).toLowerCase();
const configuredSupabaseUrl = getConfiguredValue(runtimeConfig.supabaseUrl).replace(/\/$/, '');
const configuredSupabaseAnonKey = getConfiguredValue(runtimeConfig.supabaseAnonKey);
const isHomologation = configuredEnvironment === 'homologation' || configuredEnvironment === 'homologacao';

function getJwtPayload(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;

    try {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
}

function validateRuntimeConfiguration() {
    if (!configuredEnvironment || !configuredSupabaseUrl || !configuredSupabaseAnonKey) {
        return { valid: false, reason: 'As configuracoes obrigatorias do ambiente nao foram fornecidas.' };
    }
    if (!isHomologation) {
        return { valid: false, reason: 'Este aplicativo aceita somente o ambiente de homologacao.' };
    }
    if (configuredSupabaseUrl !== HOMOLOGATION_SUPABASE_URL) {
        return { valid: false, reason: 'A URL configurada nao pertence ao projeto de homologacao autorizado.' };
    }

    const keyPayload = getJwtPayload(configuredSupabaseAnonKey);
    if (keyPayload?.ref !== HOMOLOGATION_PROJECT_REF || keyPayload?.role !== 'anon') {
        return { valid: false, reason: 'A chave publica nao pertence ao projeto de homologacao autorizado.' };
    }
    return { valid: true, reason: '' };
}

const runtimeValidation = validateRuntimeConfiguration();

function showEnvironmentIdentity() {
    document.documentElement.classList.add('app-environment-homologation');
    document.title = `[HML] ${document.title}`;
    const banner = document.getElementById('app-environment-banner');
    if (banner) {
        banner.textContent = 'HOMOLOGAÇÃO • DADOS DE TESTE';
        banner.hidden = false;
    }
}

function showUnsafeEnvironmentBlock(reason) {
    document.documentElement.classList.add('app-environment-blocked');
    document.title = '[BLOQUEADO] Configuração de ambiente';
    const app = document.getElementById('app');
    if (app) {
        app.innerHTML = `
            <main class="environment-block-screen">
                <section class="environment-block-card">
                    <span class="material-symbols-rounded">security</span>
                    <h1>Acesso bloqueado</h1>
                    <p>${reason} Nenhum cliente Supabase foi criado.</p>
                    <small>Confira as variáveis VITE_APP_ENV, VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.</small>
                </section>
            </main>`;
    }
}

window.supabaseClientReady = new Promise((resolve, reject) => {
    if (!runtimeValidation.valid) {
        const error = new Error(runtimeValidation.reason);
        showUnsafeEnvironmentBlock(runtimeValidation.reason);
        reject(error);
        return;
    }

    showEnvironmentIdentity();
    const startedAt = Date.now();
    const timeoutMs = 6000;

    function tryCreateClient() {
        if (window.supabaseClient) {
            resolve(window.supabaseClient);
            return;
        }

        if (window.supabase?.createClient) {
            window.supabaseClient = window.supabase.createClient(configuredSupabaseUrl, configuredSupabaseAnonKey);
            console.log('[Supabase] Client de homologacao inicializado.');
            resolve(window.supabaseClient);
            return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
            const error = new Error('Biblioteca Supabase nao carregou a tempo');
            console.error('[Supabase] Falha ao inicializar client:', error.message);
            reject(error);
            return;
        }

        setTimeout(tryCreateClient, 100);
    }

    tryCreateClient();
});

function getStoragePath(file, tipo = 'imagem') {
    const name = file.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9.-]/g, '');
    
    const timestamp = Date.now();
    
    if (tipo === 'kit') {
        return `produtos/kits/${timestamp}-${name}`;
    }
    if (tipo === 'manual') {
        return `produtos/manuais/${timestamp}-${name}`;
    }
    return `produtos/imagens/${timestamp}-${name}`;
}

async function uploadFile(file, tipo = 'imagem') {
    const supabase = window.supabaseClient;
    
    if (!file) return null;
    
    const path = getStoragePath(file, tipo);
    console.log('[UPLOAD] Path:', path);
    
    const { data, error } = await supabase
        .storage
        .from('assets')
        .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type
        });
    
    if (error) {
        console.error('[UPLOAD] Erro:', error);
        throw new Error('Erro ao enviar arquivo: ' + error.message);
    }
    
    console.log('[UPLOAD] Sucesso:', data.path);
    return data.path;
}

function getPublicUrl(path) {
    if (!path) return null;
    
    const { data } = window.supabaseClient
        .storage
        .from('assets')
        .getPublicUrl(path);
    
    console.log('[URL] Publica:', data.publicUrl);
    return data.publicUrl;
}

async function deleteFile(path) {
    if (!path) return;
    
    const supabase = window.supabaseClient;
    
    console.log('[DELETE FILE] Tentando remover:', path);
    
    const { error } = await supabase
        .storage
        .from('assets')
        .remove([path]);
    
    if (error) {
        console.error('[DELETE FILE] Erro:', error);
    } else {
        console.log('[DELETE FILE] Removido com sucesso:', path);
    }
}
