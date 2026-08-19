const PRODUCTION_SUPABASE_URL = 'https://ccpxhbvmmabrttqsmqaj.supabase.co';
const PRODUCTION_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjcHhoYnZtbWFicnR0cXNtcWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NjU5ODIsImV4cCI6MjA5MjA0MTk4Mn0.0cAmazh1Yv_Nj5ISxBPHrdDq7Gk2R29BJIGI8PXji7A';
const HOMOLOGATION_PROJECT_REF = 'doklsgduslimidfbyngj';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function getConfiguredValue(value) {
    const normalized = String(value || '').trim();
    return normalized && !normalized.includes('%VITE_') ? normalized : '';
}

const runtimeConfig = window.__DY_APP_CONFIG__ || {};
const isLocalEnvironment = LOCAL_HOSTNAMES.has(window.location.hostname);
const configuredEnvironment = getConfiguredValue(runtimeConfig.appEnvironment).toLowerCase();
const configuredSupabaseUrl = getConfiguredValue(runtimeConfig.supabaseUrl).replace(/\/rest\/v1\/?$/, '');
const configuredSupabaseAnonKey = getConfiguredValue(runtimeConfig.supabaseAnonKey);
const SUPABASE_URL = configuredSupabaseUrl || PRODUCTION_SUPABASE_URL;
const SUPABASE_ANON_KEY = configuredSupabaseAnonKey || PRODUCTION_SUPABASE_ANON_KEY;
const isHomologation = configuredEnvironment === 'homologation' || configuredEnvironment === 'homologacao';
const localConfigurationIsSafe = !isLocalEnvironment || (
    isHomologation
    && SUPABASE_URL.includes(`${HOMOLOGATION_PROJECT_REF}.supabase.co`)
    && Boolean(configuredSupabaseAnonKey)
);

function showEnvironmentIdentity() {
    if (!isLocalEnvironment) return;
    document.documentElement.classList.add('app-environment-homologation');
    document.title = `[HML] ${document.title}`;
    const banner = document.getElementById('app-environment-banner');
    if (banner) {
        banner.textContent = 'HOMOLOGAÇÃO • DADOS DE TESTE • LOCALHOST';
        banner.hidden = false;
    }
}

function showUnsafeEnvironmentBlock() {
    document.documentElement.classList.add('app-environment-blocked');
    document.title = '[BLOQUEADO] Configuração de ambiente';
    const app = document.getElementById('app');
    if (app) {
        app.innerHTML = `
            <main class="environment-block-screen">
                <section class="environment-block-card">
                    <span class="material-symbols-rounded">security</span>
                    <h1>Acesso local bloqueado</h1>
                    <p>O localhost não está configurado com o banco de homologação. Nenhum dado foi acessado.</p>
                    <small>Confira o arquivo .env.local antes de continuar.</small>
                </section>
            </main>`;
    }
}

showEnvironmentIdentity();
window.supabaseClientReady = new Promise((resolve, reject) => {
    if (!localConfigurationIsSafe) {
        const error = new Error('Localhost sem configuração segura de homologação');
        showUnsafeEnvironmentBlock();
        reject(error);
        return;
    }
    const startedAt = Date.now();
    const timeoutMs = 6000;

    function tryCreateClient() {
        if (window.supabaseClient) {
            resolve(window.supabaseClient);
            return;
        }

        if (window.supabase?.createClient) {
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('[Supabase] Client inicializado com URL:', SUPABASE_URL);
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
