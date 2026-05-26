window.onerror = function (msg, url, lineNo, columnNo, error) {
    console.error('Global Error:', msg, error);
    const app = document.getElementById('app');
    if (app) {
        app.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: white; background: var(--bg); min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <span class="material-symbols-rounded" style="font-size: 48px; color: var(--danger); margin-bottom: 20px;">error</span>
                        <h2 style="margin-bottom: 10px;">Ops! Algo deu errado.</h2>
                        <p style="color: var(--muted); font-size: 0.8rem; margin-bottom: 30px;">${msg}</p>
                        <button onclick="location.reload()" class="btn-action" style="background: var(--primary); padding: 12px 24px;">RECARREGAR APP</button>
                    </div>
                `;
    }
    return false;
};

const app = document.getElementById('app');
const toast = document.getElementById('toast');

// ==== AUXILIARY FUNCTIONS ====
function normalizeText(text) {
    if (!text) return "";
    return text.toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function normalizeProductSearchTerm(text) {
    if (!text) return "";
    return text.toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, ' ');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==== INTELLIGENT SCANNING & INPUT CLASSIFICATION ====
function classifyProductInput(rawValue) {
    const value = String(rawValue || '').trim();
    const clean = value.replace(/\s+/g, '');

    if (!clean) return { type: 'empty', value: '' };

    const idNorm = clean.toUpperCase();

    // ID Interno: DY-000.000 ou DY-000000
    if (/^DY[-.]?\d{3}[.]?\d{3}$/.test(idNorm) || /^DY\d{6}$/.test(idNorm)) {
        return {
            type: 'id_interno',
            value: normalizeDyId(idNorm)
        };
    }

    // EAN: 8, 12, 13, 14 dﾃｭgitos
    if (/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(clean)) {
        return {
            type: 'ean',
            value: clean
        };
    }

    // Code 128 / SKU Fornecedor (Alfanumﾃｩrico com nﾃｺmeros)
    if (/^[A-Z0-9\-_.]{4,}$/i.test(clean) && /\d/.test(clean)) {
        return {
            type: 'code128',
            value: clean.toUpperCase()
        };
    }

    // Texto Comum (Qualquer coisa com letras)
    if (/[A-Za-z\u00C0-\u00FF]/.test(value)) {
        return {
            type: 'text',
            value
        };
    }

    return { type: 'invalid', value };
}

function normalizeDyId(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 6) return String(value || '').toUpperCase();
    return `DY-${digits.slice(0, 3)}.${digits.slice(3)}`;
}

function playFeedbackSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'success') {
            osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
        } else if (type === 'warning') {
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
        } else if (type === 'error') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        }
    } catch (err) {
        console.warn('[AUDIO] feedback indisponﾃｭvel', err);
    }
}

function showScanFeedback(type, message) {
    // Remover feedbacks antigos
    document.querySelectorAll('.scan-feedback').forEach(el => el.remove());
    showPageSearchSignal(type);

    const feedback = document.createElement('div');
    feedback.className = `scan-feedback ${type}`;

    let iconName = 'check_circle';
    if (type === 'warning') iconName = 'warning';
    if (type === 'error') iconName = 'error';

    feedback.innerHTML = `
        <span class="material-symbols-rounded icon">${iconName}</span>
        <span class="msg">${message}</span>
    `;

    document.body.appendChild(feedback);

    playFeedbackSound(type);

    setTimeout(() => {
        feedback.classList.add('fade-out');
        setTimeout(() => feedback.remove(), 400);
    }, 2000);
}

function showPageSearchSignal(type) {
    const className = type === 'success' ? 'search-signal-success' : type === 'warning' ? 'search-signal-warning' : 'search-signal-error';
    document.body.classList.remove('search-signal-success', 'search-signal-warning', 'search-signal-error');
    document.body.classList.add(className);
    clearTimeout(window.searchSignalTimer);
    window.searchSignalTimer = setTimeout(() => {
        document.body.classList.remove('search-signal-success', 'search-signal-warning', 'search-signal-error');
    }, 1400);
}

async function handleProductScan(rawValue, context = 'search') {
    const classification = classifyProductInput(rawValue);
    console.log(`[SCAN] Classificaﾃｧﾃ｣o:`, classification);

    if (classification.type === 'text') {
        // Se for texto na busca, apenas performSearch normal
        if (context === 'search') {
            const input = document.getElementById('search-input');
            if (input) {
                input.value = rawValue;
                performSearch();
            }
        }
        return;
    }

    if (classification.type === 'invalid' || classification.type === 'empty') {
        showScanFeedback('error', 'Cﾃｳdigo Invﾃ｡lido');
        return;
    }

    // Buscar match exato
    await ensureProdutosLoaded();
    const val = classification.value;

    const product = appData.products.find(p => {
        const pEan = String(p.ean || '').trim();
        const pId = normalizeDyId(p.id_interno);
        const pSku = String(p.sku_fornecedor || '').toUpperCase().trim();

        if (classification.type === 'ean') return pEan === val;
        if (classification.type === 'id_interno') return pId === val;
        if (classification.type === 'code128') {
            return pEan === val || pSku === val || pId === val;
        }
        return false;
    });

    if (product) {
        showScanFeedback('success', 'Produto Encontrado');
        
        // Se estiver na busca, abre detalhes
        if (context === 'search') {
            const input = document.getElementById('search-input');
            if (input) input.value = '';
            
            // Pequeno delay para o usuﾃ｡rio ver o feedback verde antes do modal
            setTimeout(() => {
                stopScanner();
                renderProductDetails(product);
            }, 600);
        } else if (context === 'garantia') {
            const input = document.getElementById('garantia-search-input');
            if (input) input.value = '';
            
            setTimeout(() => {
                stopScanner();
                if (typeof window.selectGarantiaProduct === 'function') {
                    window.selectGarantiaProduct(product);
                }
            }, 600);
        } else if (context === 'edit') {
            const input = document.getElementById('edit-search-input');
            if (input) input.value = '';
            
            setTimeout(() => {
                stopScanner();
                renderEditProductForm(product);
            }, 600);
        }
        
        return product;
    } else {
        // Mostrar alerta apenas se a leitura for real (scanner/cﾃ｢mera).
        // Nﾃ｣o mostrar enquanto o usuﾃ｡rio estiver digitando (context === 'search')
        if (context !== 'search') {
            showScanFeedback('warning', 'Produto nﾃ｣o cadastrado');
        }
        return null;
    }
}


// Global App State
let currentScreen = 'loading';
let initialized = false;
let currentPackSession = null;
let currentPickSession = null;
let currentSessionItems = [];
let isModoRapido = false;

// ==== NAVIGATION MANAGEMENT ====
// Permite que o botﾃ｣o voltar do navegador (e do Android) funcione corretamente
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.screen) {
        console.log('[NAV] Popstate para:', event.state.screen);
        renderScreenByName(event.state.screen, false);
    } else if (initialized) {
        renderMenu(false);
    }
});

function pushNav(screen) {
    if (!screen) return;
    // Evita duplicar o mesmo estado no topo do histﾃｳrico
    if (history.state && history.state.screen === screen) return;
    console.log('[NAV] PushState:', screen);
    history.pushState({ screen }, '', '');
}

function goBack() {
    // Se tivermos um estado no histﾃｳrico, usamos a navegaﾃｧﾃ｣o do navegador
    if (history.state && history.state.screen && history.state.screen !== 'login') {
        console.log('[NAV] history.back()');
        history.back();
    } else {
        // Fallback lﾃｳgico para garantir que o usuﾃ｡rio nunca fique preso
        if (currentScreen === 'search') renderMenu();
        else if (currentScreen === 'menu') renderLogin();
        else renderMenu();
    }
}

function renderScreenByName(name, push = true) {
    switch (name) {
        case 'menu': renderMenu(push); break;
        case 'search': renderSearchScreen(push); break;
        case 'login': renderLogin(push); break;
        case 'config': renderConfigSubMenu(push); break;
        default: renderMenu(push);
    }
}

// ==== MODO TELA LIMPA (Lﾃ敵ICA OPERACIONAL) ====
window.handleUserClick = function(e) {
    if(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    console.log('CLICK USUARIO OK');
    showToast('CLICK USUARIO OK', 'success'); // Opcional, feedback no sistema do app
    
    // Aﾃｧﾃ｣o real solicitada pela interface
    if (typeof renderConfigSubMenu === 'function') {
        renderConfigSubMenu();
    } else {
        alert('CLICK USUARIO OK');
    }
};

window.addEventListener('DOMContentLoaded', () => {


    // Fullscreen controls removed: Handled by getTopBarHTML and CSS toggles

    // Footer logic simplified: CSS will handle the layout
    const footer = document.querySelector('.menu-footer');
    if (footer) {
        const menuScreen = document.querySelector('.dashboard-screen.menu-screen');
        if (menuScreen) {
            menuScreen.classList.add('menu-footer-visible'); // Default to visible for now, CSS Grid will handle scaling
        }
    }


    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.body.classList.contains('fullscreen-mode')) {
                toggleFullscreen();
            }
        }
    });

});

// goBack centralizado acima

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn(`[FULLSCREEN] Erro ao entrar: ${err.message}`);
            });
        }
        document.body.classList.add('fullscreen-mode');
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(err => {
                console.warn(`[FULLSCREEN] Erro ao sair: ${err.message}`);
            });
        }
        document.body.classList.remove('fullscreen-mode');
    }
    
    if (typeof removeLegacyLoginFullscreenControls === 'function') {
        removeLegacyLoginFullscreenControls();
        setTimeout(removeLegacyLoginFullscreenControls, 100);
    }
}

// Listener para sincronizar classe CSS se sair pelo ESC nativo
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        document.body.classList.remove('fullscreen-mode');
    } else {
        document.body.classList.add('fullscreen-mode');
    }
    if (typeof removeLegacyLoginFullscreenControls === 'function') {
        removeLegacyLoginFullscreenControls();
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const isLocalDevHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

        if (isLocalDevHost) {
            const cleanupServiceWorker = async () => {
                try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map(registration => registration.unregister()));

                    if (window.caches) {
                        const cacheNames = await caches.keys();
                        await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
                    }

                    if (navigator.serviceWorker.controller && !sessionStorage.getItem('dy_local_sw_reset_done')) {
                        sessionStorage.setItem('dy_local_sw_reset_done', '1');
                        window.location.reload();
                    }
                } catch (err) {
                    console.warn('[SW] Falha ao limpar service worker local:', err);
                }
            };

            cleanupServiceWorker();
            return;
        }

        if (localStorage.getItem('app_load_error')) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) {
                    registration.unregister();
                }
            });
            localStorage.removeItem('app_load_error');
            localStorage.removeItem('loginBackgroundImage');
            window.loginCustomBgImage = null;
        }

        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        if (confirm('Nova versﾃ｣o disponﾃｭvel. Atualizar?')) {
                            newWorker.postMessage({action: 'skipWaiting'});
                            window.location.reload();
                        }
                    }
                });
            });
        }).catch(err => {
            console.log('SW error:', err);
        });
    });
}
// ========================================================

let isFinalizing = false;
let isSyncing = false;
let isAppLoading = false;

const SYNC_TRACE_ENABLED = true;
const syncTraceLog = [];

function addSyncTrace(origin, action, details = '') {
    if (!SYNC_TRACE_ENABLED) return;
    const entry = {
        time: new Date().toISOString().substr(11, 12),
        origin,
        action,
        details,
        stack: new Error().stack.split('\n').slice(2, 5).join(' | ')
    };
    syncTraceLog.unshift(entry);
    if (syncTraceLog.length > 50) syncTraceLog.pop();
    console.log(`[SYNC TRACE] ${entry.time} | ${origin} -> ${action} | ${details}`);
}

function dumpSyncTrace() {
    console.log('=== SYNC TRACE DUMP ===');
    syncTraceLog.forEach((e, i) => console.log(`${i+1}. ${e.time} | ${e.origin} -> ${e.action} | ${e.details} | ${e.stack}`));
    console.log('=======================');
}

function generateUniqueId(prefix) {
    const now = new Date();
    const ddmm = now.getDate().toString().padStart(2, '0') + (now.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${prefix}-${ddmm}-${random}`;
}

async function copyToClipboard(text, elementId = null) {
    try {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            showToast("Copiado: " + text);
        } else {
            showToast("Copiado: " + text);
        }
        
        if (elementId) {
            const el = document.getElementById(elementId);
            if (el) {
                const originalContent = el.innerHTML;
                el.innerHTML = '<span class="material-symbols-rounded" style="font-size: 14px;">check</span>';
                el.style.color = "#4ade80";
                setTimeout(() => {
                    el.innerHTML = originalContent;
                    el.style.color = "";
                }, 2000);
            }
        }
    } catch (err) {
        console.error("Erro ao copiar:", err);
        showToast("Erro ao copiar para a ﾃ｡rea de transferﾃｪncia.");
    }
}

function toggleAllStock() {
    const grid = document.querySelector('.location-distribution-grid');
    const btn = document.getElementById('btn-toggle-stock');
    if (grid && btn) {
        const isShowingAll = grid.classList.toggle('show-all');
        btn.innerHTML = isShowingAll ? 
            '<span class="material-symbols-rounded">expand_less</span> VER MENOS' : 
            '<span class="material-symbols-rounded">expand_more</span> VER TODOS';
    }
}

// ==== API & CONNECTION UTILS ====



/**
 * Realce de texto para busca
 */
function highlightText(text, term) {
    if (!term) return text;
    const cleanTerm = normalizar(term);
    if (!cleanTerm) return text;
    
    // Regex para encontrar o termo ignorando acentos e caixa
    // Nota: Para manter o texto original mas com tags, usamos uma abordagem mais simplificada
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<b>$1</b>');
}

/**
 * Realiza uma requisiﾃｧﾃ｣o GET para a API_BASE com parﾃ｢metros
 */
async function dyGet(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            query.append(key, value);
        }
    });

    try {
        const response = await fetch(`${API_BASE}?${query.toString()}`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error("dyGet Error:", err);
        return { ok: false, error: err.message };
    }
}

// Alias for backwards compatibility or specific usage
async function safeGet(queryString) {
    let params;
    if (typeof queryString === 'string') {
        // Parse query string properly
        params = Object.fromEntries(new URLSearchParams(queryString));
    } else {
        params = queryString;
    }
    console.log("[safeGet] params:", params);
    return dyGet(params);
}

/**
 * Verifica a conexﾃ｣o com a planilha
 */
async function verificarConexao() {
    try {
        const res = await dyGet({ action: "ping" });
        if (res.ok) {
            console.log("Planilha conectada");
            return true;
        } else {
            console.error("Erro ao conectar com a planilha:", res.error);
            return false;
        }
    } catch (err) {
        console.error("Erro fatal ao verificar conexﾃ｣o:", err);
        return false;
    }
}

/**
 * Normaliza textos para busca (minﾃｺsculas, sem acentos, sem espaﾃｧos extras)
 */
function normalizar(texto) {
    return (texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

/**
 * Busca Kit Lﾃ｢mpada na API com os parﾃ｢metros informados
 */
async function buscarKitLampada(termo, ano, montadora) {
    return dyGet({
        action: "kit_lampada",
        termo: normalizar(termo),
        ano: normalizar(ano),
        montadora: normalizar(montadora)
    });
}

// Auxiliar para gerar ID de execuﾃｧﾃ｣o tﾃｩcnica (idempotﾃｪncia)
function generateExecutionId() {
    return 'exec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

/**
 * Camada de Normalizaﾃｧﾃ｣o Contextual: Garante que valores respeitem as validaﾃｧﾃｵes da ABA especﾃｭfica
 */
function normalizeSheetValue(sheet, field, value) {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    const lower = str.toLowerCase();

    // Regras por ABA e CAMPO (Explﾃｭcitas)
    
    // ABA: Produtos
    if (sheet === 'produtos' && field === 'status') {
        return (lower === 'inativo') ? 'inativo' : 'ativo';
    }

    // ABA: Usuarios / Canais
    if ((sheet === 'usuarios' || sheet === 'canais_envio') && field === 'ativo') {
        return (lower === 'sim' || lower === 's' || lower === 'true') ? 'sim' : 'nao';
    }

    // ABA: Estoque Atual (Locais)
    if (sheet === 'estoque_atual' && field === 'local') {
        if (lower.includes('terr') || lower === 'trreo') return 'terreo';
        if (lower.includes('mostru') || lower === 'mostrurio') return 'mostruario';
        if (lower.includes('1') && lower.includes('andar')) return '1andar';
        if (lower === 'defeito') return 'defeito';
        if (lower === 'full_ml' || lower === 'full ml' || lower === 'fullml') return 'full_ml';
        return lower;
    }

    // ABA: Movimentos
    if (sheet === 'movimentos') {
        if (field === 'tipo') {
            const valid = ['entrada', 'saida', 'transferencia', 'reserva', 'confirmacao_saida', 'ajuste_inventario', 'ajuste_estoque'];
            return valid.includes(lower) ? lower : 'saida'; // fallback seguro
        }
        if (field === 'local_origem' || field === 'local_destino' || field === 'local') {
            if (lower.includes('terr') || lower === 'trreo') return 'terreo';
            if (lower.includes('mostru') || lower === 'mostrurio') return 'mostruario';
            if (lower.includes('1') && lower.includes('andar')) return '1andar';
            if (lower === 'full_ml' || lower === 'full ml' || lower === 'fullml') return 'full_ml';
            return lower;
        }
    }

    // ABA: Separacao
    if (sheet === 'separacao' && field === 'status') {
        const valid = ['rascunho', 'aberta', 'em_separacao', 'separado', 'finalizada', 'cancelada'];
        if (lower === 'aberto') return 'aberta';
        return valid.includes(lower) ? lower : 'rascunho';
    }

    // ABA: Conferencia
    if (sheet === 'conferencia' && field === 'status') {
        const valid = ['rascunho', 'em_conferencia', 'conferido', 'finalizada', 'cancelada'];
        return valid.includes(lower) ? lower : 'rascunho';
    }

    // ABA: Inventarios
    if (sheet === 'inventarios') {
        if (field === 'tipo') {
            const valid = ['inicial', 'geral', 'parcial', 'ajuste'];
            return valid.includes(lower) ? lower : 'geral';
        }
        if (field === 'status') {
            return (lower === 'finalizada' || lower === 'concluido') ? 'finalizada' : 'aberta';
        }
    }

    return str;
}

function normalizePayloadForSheet(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const normalized = { ...payload };

    // Determinar o contexto da aba
    let sheetContext = payload.sheet || payload.action || '';
    if (sheetContext === 'movimento') sheetContext = 'movimentos';

    // Lista de campos que PODEM precisar de normalizaﾃｧﾃ｣o
    const fieldsToCheck = [
        'status', 'tipo', 'local', 'local_origem', 'local_destino', 
        'ativo', 'perfil'
    ];

    Object.keys(normalized).forEach(key => {
        if (fieldsToCheck.includes(key)) {
            normalized[key] = normalizeSheetValue(sheetContext, key, normalized[key]);
        }
    });

    // Normalizar tambﾃｩm campos aninhados em 'data'
    if (normalized.data && typeof normalized.data === 'object') {
        const dataNormalized = { ...normalized.data };
        Object.keys(dataNormalized).forEach(key => {
            if (fieldsToCheck.includes(key)) {
                dataNormalized[key] = normalizeSheetValue(sheetContext, key, dataNormalized[key]);
            }
        });
        normalized.data = dataNormalized;
    }

    // Tratamento especial para KIT_LAMPADA (apenas 10 campos permitidos)
    if (sheetContext === 'kit_lampada') {
        const allowed = [
            'kit_lampada_id', 'montadora', 'modelo', 'ano_inicio', 'ano_fim',
            'lampada_baixo', 'lampada_alto', 'lampada_neblina', 'url', 'observacao',
            'action', 'sheet', 'executionId'
        ];
        Object.keys(normalized).forEach(key => {
            if (!allowed.includes(key)) delete normalized[key];
        });
    }

    return normalized;
}

async function revertStockMovement(sessionId, row, operatorId) {
    try {
        showToast(`Iniciando estorno para ${row.descricao}...`);
        const now = new Date().toISOString();
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(normalizePayloadForSheet({
                action: 'movimento',
                tipo: 'saida', // Normalizado para 'saida' (estorno ﾃｩ uma saﾃｭda de correﾃｧﾃ｣o)
                id_interno: row.id_interno,
                local: '1andar', // Canonical 1andar
                quantidade: row.qtd_conferida, 
                data_hora: now,
                usuario: operatorId,
                origem: `REVERSAO-${sessionId}`,
                observacao: `Correﾃｧﾃ｣o de erro operacional da sessao ${sessionId}`
            }))
        });
        showToast(`Estorno concluﾃｭdo (sincronizado).`);
    } catch (err) {
        console.error("Estorno Falhou:", err);
        showToast("Erro ao processar estorno!");
    }
}

function criarStatusConexao() {

    const status = document.createElement("div")
    status.id = "statusConexao"

    status.style.fontSize = "13px"
    status.style.fontWeight = "600"
    status.style.marginRight = "10px"

    function atualizar() {

        if (navigator.onLine) {
            status.innerHTML = "Online"
            status.style.color = "#4ade80"
        } else {
            status.innerHTML = "Offline"
            status.style.color = "#4ade80"
        }

    }

    window.addEventListener("online", atualizar)
    window.addEventListener("offline", atualizar)

    atualizar()

    return status
}

// ==== CONFIGURAﾃ�グ APP (GLOBAL) ====
const DEFAULT_APP_CONFIG = {
    permitir_saida_estoque_zero: false,
    modo_rapido: false
};

function getAppConfig() {
    try {
        const config = localStorage.getItem('app_config');
        if (!config) {
            setAppConfig(DEFAULT_APP_CONFIG);
            return { ...DEFAULT_APP_CONFIG };
        }

        return {
            ...DEFAULT_APP_CONFIG,
            ...JSON.parse(config)
        };
    } catch (error) {
        console.warn('[CONFIG] app_config invalido. Restaurando padrao.', error);
        setAppConfig(DEFAULT_APP_CONFIG);
        return { ...DEFAULT_APP_CONFIG };
    }
}

function setAppConfig(config) {
    localStorage.setItem('app_config', JSON.stringify({
        ...DEFAULT_APP_CONFIG,
        ...(config || {})
    }));
}

function isModoRapidoAtivo() {
    return getAppConfig().modo_rapido === true;
}

function isSaidaEstoqueZeroPermitida() {
    return getAppConfig().permitir_saida_estoque_zero === true;
}

function canAllowStockExit(produto, quantidade) {
    const estoqueAtual = parseFloat(produto.estoque_atual || 0);
    if (estoqueAtual >= quantidade) return true;
    return isSaidaEstoqueZeroPermitida();
}

window.getAppConfig = getAppConfig;
window.setAppConfig = setAppConfig;
window.isModoRapidoAtivo = isModoRapidoAtivo;
window.isSaidaEstoqueZeroPermitida = isSaidaEstoqueZeroPermitida;
window.canAllowStockExit = canAllowStockExit;

// URLs das imagens locais
const LOGO_URL = '/imagens/icon-512-black.png';
const LOGO_SMALL_URL = '/imagens/icon-512-black.png';
const LOGO_BLACK = '/imagens/icon-512-black.png';
const LOGO_WHITE = '/imagens/icon-512-white.png';

// Funﾃｧﾃ｣o para selecionar o logo baseado na cor do topo/header (REALIDADE VISUAL)
// Fundo PRETO/ESCURO -> logo icon-512-black.png (contﾃｩm texto BRANCO)
// Fundo BRANCO/CLARO -> logo icon-512-white.png (contﾃｩm texto PRETO)
function getLogoForHeader(headerBgColor) {
    if (!headerBgColor) {
        return LOGO_WHITE; // Padrﾃ｣o agora ﾃｩ o white (que ﾃｩ dark) para fundo claro
    }
    
    const bg = headerBgColor.toLowerCase().trim();
    
    // Fundo escuro (preto) -> usar asset 'black' (pois ele ﾃｩ a versﾃ｣o Light/texto branco)
    if (bg === '#101018' || bg === '#000000' || bg === 'transparent' || bg.startsWith('rgba(16,')) {
        return LOGO_BLACK;
    }
    
    // Fundo claro (branco) -> usar asset 'white' (pois ele ﾃｩ a versﾃ｣o Dark/texto preto)
    if (bg === '#ffffff' || bg === '#fff' || bg.startsWith('rgba(255,')) {
        return LOGO_WHITE;
    }
    
    // Padrﾃ｣o
    return LOGO_WHITE;
}




// Funﾃｧﾃ｣o para garantir que links do Drive funcionem como imagem direta
function formatImageUrl(url) {
    if (!url) return '';
    
    // Se for um path do Supabase (nﾃ｣o ﾃｩ URL completa), gerar URL pﾃｺblica
    if (url.startsWith('produtos/') || url.startsWith('branding/')) {
        try {
            const publicUrl = getPublicUrl(url);
            if (publicUrl) return publicUrl;
        } catch (e) {
            console.log('[formatImageUrl] Erro ao gerar URL pﾃｺblica:', e);
        }
    }
    
    if (url.includes('drive.google.com')) {
        // Handle various Drive link formats (preview, file, view, id=, etc)
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                      url.match(/id=([a-zA-Z0-9_-]+)/) ||
                      url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return `https://drive.google.com/uc?id=${match[1]}`;
        }
    }
    return url;
}

const attributeNameMap = {
    voltagem: "Voltagem",
    potencia: "Potﾃｪncia",
    tipo_lampada: "Tipo da lﾃ｢mpada",
    temperatura_cor: "Temperatura de cor",
    lumens: "Lumens",
    encaixe: "Encaixe",
    codigo_equivalente: "Cﾃｳdigo equivalente",
    linha: "Linha",
    ip_rate: "IP Rate",
    chip_led: "Chip LED",
    dissipador: "Dissipador",
    cooler: "Cooler",
    driver: "Driver",
    material_lente: "Material da lente",
    textura_lente: "Textura da lente",
    material_carcaca: "Material da carcaﾃｧa",
    regulagem: "Regulagem",
    modelo_botao: "Modelo do botﾃ｣o",
    cor_botao: "Cor do botﾃ｣o",
    veiculo: "Veﾃｭculo",
    ano_aplicacao: "Ano de aplicaﾃｧﾃ｣o"
};

const attributeValueReplacements = [
    [/(\d+)v/gi, '$1V'],
    [/(\d+)w/gi, '$1W'],
    [/(\d+)k/gi, '$1K'],
    [/(\d+)lm/gi, '$1LM'],
    [/_/g, ' / '],
    [/(\d+)_(\d+)/g, '$1 a $2'],
    [/^com_/i, 'Com '],
    [/^sem_/i, 'Sem '],
    [/^a_prova_d/i, 'ﾃ prova d'],
    [/_/g, ' / ']
];

function safeParseAtributos(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function formatAttributeName(key) {
    if (!key) return '';
    const k = String(key).toLowerCase().trim();
    return attributeNameMap[k] || key.charAt(0).toUpperCase() + key.slice(1);
}

function formatAttributeValue(value) {
    if (!value) return '';
    let formatted = String(value).trim();
    attributeValueReplacements.forEach(([regex, replacement]) => {
        formatted = formatted.replace(regex, replacement);
    });
    return formatted;
}

function isValidUrl(value) {
    if (!value) return false;
    const s = String(value).trim();
    const low = s.toLowerCase();
    
    // Bloqueio de valores vazios ou placeholders comuns vindos de bancos de dados
    if (!s || low === 'null' || low === 'undefined' || low === 'n/a' || low === 'vazio') return false;
    
    try {
        // Aceita URLs absolutas HTTP/HTTPS
        const url = new URL(s);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
        // Aceita caminhos relativos internos (comeﾃｧando com /)
        return s.startsWith('/');
    }
}

function formatPrice(value, prefix = 'R$ ') {
    if (!value && value !== 0) return 'R$ 0,00';
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (isNaN(num)) return 'R$ 0,00';
    return prefix + num.toFixed(2).replace('.', ',');
}

function formatUnityWithQty(unidade, qtdEmbalagem) {
    const u = unidade || 'UN';
    const q = parseInt(qtdEmbalagem) || 1;
    return q === 1 ? u : `${u} / ${q}`;
}

function handleImageError(img, fallbackIcon = 'directions_car') {
    img.onerror = null; // Prevent infinite loops
    img.src = '/imagens/icon-512-black.png'; // Use logo as immediate fallback
    // Or if you want to replace with an icon:
    const parent = img.parentElement;
    if (parent) {
        parent.innerHTML = `<span class="material-symbols-rounded" style="color: var(--muted)">${fallbackIcon}</span>`;
    }
}

let toastTimeout;
let hasCriticalStock = false;
let cameraStream = null;

const SPREADSHEET_ID = '1NK_rmdEfZYQPnFEil5pDWF1rIt9adajd1GpkcObSkv0';
const CACHE_NAME = 'dy-autoparts-v9';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbznHLTXr_--3PrR8GAz4-TrtX4jttC5cg7CH8cPa7KzoRQPQMZrmtEPBAMWE5KqMTUXwA/exec'; // URL do Google Apps Script para salvar dados
const API_BASE = "https://script.google.com/macros/s/AKfycbznHLTXr_--3PrR8GAz4-TrtX4jttC5cg7CH8cPa7KzoRQPQMZrmtEPBAMWE5KqMTUXwA/exec";

let appData;
try {
    appData = JSON.parse(localStorage.getItem('appData')) || {
        users: [],
        products: [],
        channels: [],
        separacao: [],
        conferencia: [],
        estoque: [],
        movimentacoes: [],
        inventario: [],
        isLoading: false,
        lastSyncTime: null,
        lastSyncTimestamp: 0,
        currentInventory: null,
        kit_lampada: []
    };
} catch (e) {
    console.error("[Bootstrap] Erro ao carregar appData do localStorage:", e);
    appData = {
        users: [],
        products: [],
        channels: [],
        separacao: [],
        conferencia: [],
        estoque: [],
        movimentacoes: [],
        inventario: [],
        isLoading: false,
        lastSyncTime: null,
        lastSyncTimestamp: 0,
        currentInventory: null,
        kit_lampada: []
    };
}


// Diagnﾃｳstico inicial e Limpeza de cache de produtos legado
const emergencyProductsCache = Array.isArray(appData.products) ? [...appData.products] : [];
if (appData.products && appData.products.length > 0) {
    console.log(`[Cache] Detectados ${appData.products.length} produtos no localStorage. Limpando para garantir carga fresca do Supabase.`);
    appData.products = []; // Forﾃｧa a limpeza para evitar uso de dados legados das planilhas
}

console.log("[DIAGNOSTICO] appData inicial:", {
    productsCount: appData.products ? appData.products.length : 0,
    lastSync: appData.lastSyncTime
});

const DATA_MAX_AGE_MS = 5 * 60 * 1000; // 5 Minutos de validade para processos crﾃｭticos

function isDataFresh() {
    if (!appData.lastSyncTimestamp) return false;
    const age = Date.now() - appData.lastSyncTimestamp;
    return age < DATA_MAX_AGE_MS;
}

/**
 * Interceptor para garantir dados novos em processos crﾃｭticos
 */
async function ensureFreshData(callback) {
    if (isDataFresh()) {
        addTechnicalLog('SYNC_CHECK', 'FRESH', 'Dados dentro da janela de 5min');
        return callback();
    }

    addTechnicalLog('SYNC_CHECK', 'STALE', 'Dados antigos. Disparando sync obrigatﾃｳria...');
    
    // Mostra loader somente nos casos crﾃｭticos
    const success = await loadAllData(false); 
    
    if (success) {
        callback();
    } else {
        showToast("Falha na sincronizaﾃｧﾃ｣o. Verifique sua conexﾃ｣o.");
    }
}

/**
 * Log Tﾃｩcnico Interno (Background)
 */
function addTechnicalLog(action, status, details = "") {
    const logs = JSON.parse(localStorage.getItem('tech_logs') || '[]');
    logs.unshift({
        timestamp: new Date().toISOString(),
        action,
        status,
        details
    });
    // Manter apenas os ﾃｺltimos 100 logs
    localStorage.setItem('tech_logs', JSON.stringify(logs.slice(0, 100)));
    console.log(`[TECH-LOG] ${action}: ${status} ${details}`);
}

let operacoesPendentes = 0;

function atualizarPendentes() {
    const el = document.getElementById("pendentesSync");
    if (!el) return;
    el.innerHTML = `${operacoesPendentes}`;
}

function adicionarPendencia() {
    operacoesPendentes++;
    atualizarPendentes();
}

function atualizarStatusConexao() {
    const status = document.getElementById("statusConexao");
    if (!status) return;

    if (navigator.onLine) {
        status.innerHTML = "Online";
        status.style.color = "#4ade80";
    } else {
        status.innerHTML = "Offline";
        status.style.color = "#ef4444";
    }
}

window.addEventListener("online", atualizarStatusConexao);
window.addEventListener("offline", atualizarStatusConexao);

// ==========================================
// BOOTSTRAP RESILIENTE COM TIMEOUT E FALLBACK CONTROLADO
// ==========================================

const BOOT_CONFIG = {
    TIMEOUT_MS: 10000,        // 10s timeout por etapa
    MAX_RETRIES: 1,          // mﾃ｡ximo 1 retry
    BOOT_TIMEOUT_MS: 30000    // 30s timeout total do bootstrap
};

let bootstrapState = {
    running: false,
    completed: false,
    abortController: null,
    startTime: null
};

function hideSplash() {
    const splash = document.querySelector('.splash-preloader');
    if (splash) {
        splash.style.display = 'none';
        console.log('[BOOT] Splash ocultado');
    }
}

function showBootstrapError(message) {
    console.error('[BOOT] Erro:', message);
    hideSplash();
    if (typeof renderLogin === 'function') {
        renderLogin();
    }
}

function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`[BOOT] Timeout em ${label} (${ms}ms)`));
        }, ms);
        promise
            .then(result => {
                clearTimeout(timeout);
                resolve(result);
            })
            .catch(err => {
                clearTimeout(timeout);
                reject(err);
            });
    });
}

async function initApp() {
    applyAppFont();
    window.loginCustomBgImage = null;
    
    try {
        loadFromIndexedDB('loginBgImage', function(data) {
            if (data && typeof data === 'string' && data.startsWith('data:image')) {
                window.loginCustomBgImage = data;
            }
        });
    } catch (e) {
        console.log('[INIT] Error loading custom bg, using default');
    }
    
    // 1. GUARDA DE REENTRADA - impedir mﾃｺltiplas inicializaﾃｧﾃｵes
    if (bootstrapState.running) {
        console.log('[BOOT] Reentrada bloqueada - bootstrap jﾃ｡ em execuﾃｧﾃ｣o');
        addSyncTrace('initApp', 'BLOCK', 'reentrada');
        return;
    }
    if (bootstrapState.completed) {
        console.log('[BOOT] Reentrada bloqueada - bootstrap jﾃ｡ concluﾃｭdo');
        addSyncTrace('initApp', 'BLOCK', 'jﾃ｡ completado');
        return;
    }

    // 2. INICIAR BOOTSTRAP
    bootstrapState.running = true;
    bootstrapState.startTime = Date.now();
    bootstrapState.abortController = new AbortController();

    console.log('[BOOT] ==========================================');
    console.log('[BOOT] INﾃ垢IO DO BOOTSTRAP');
    console.log('[BOOT] ==========================================');

    // 3. TIMEOUT TOTAL DO BOOTSTRAP
    const totalTimeout = setTimeout(() => {
        if (bootstrapState.running && !bootstrapState.completed) {
            console.error('[BOOT] TIMEOUT TOTAL DE INICIALIZAﾃ�グ');
            bootstrapState.abortController.abort();
            showBootstrapError('Timeout de inicializaﾃｧﾃ｣o');
        }
    }, BOOT_CONFIG.BOOT_TIMEOUT_MS);

    try {
        // 4. ESCONDER SPLASH IMEDIATAMENTE
        hideSplash();

        // 5. VERIFICAR SUPABASE (nﾃ｣o bloqueante)
        console.log('[BOOT] Verificando Supabase...');
        try {
            if (window.supabaseClientReady) {
                await withTimeout(
                    window.supabaseClientReady,
                    BOOT_CONFIG.TIMEOUT_MS,
                    'supabaseClientReady'
                );
            }
        } catch (readyError) {
            console.warn('[BOOT] Supabase client ainda indisponivel:', readyError.message);
        }

        try {
            if (typeof testeSupabase === 'function') {
                testeSupabase();
            }
        } catch (se) {
            console.warn('[BOOT] Supabase nﾃ｣o disponﾃｭvel:', se.message);
        }

        atualizarStatusConexao();

        // 6. CARREGAR USUﾃヽIOS COM TIMEOUT E FALLBACK ﾃ哢ICO
        console.log('[BOOT] Carregando usuﾃ｡rios...');
        const usersLoaded = await loadUsersWithFallback();
        
        if (usersLoaded) {
            console.log(`[BOOT] Usuﾃ｡rios carregados: ${appData.users?.length || 0}`);
        } else {
            console.warn('[BOOT] Usuﾃ｡rios nﾃ｣o carregados, usando fallback');
        }

        // 7. CARGA INICIAL (separacao) - apenas se necessﾃ｡rio
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            console.log('[BOOT] Carregando dados mﾃｭnimos (separacao)...');
            try {
                await withTimeout(
                    loadAllData(true, 'initApp'),
                    BOOT_CONFIG.TIMEOUT_MS,
                    'loadAllData'
                );
            } catch (e) {
                console.warn('[BOOT] loadAllData falhou:', e.message);
            }
        }

        // 8. RENDERIZAR LOGIN SEMPRE
        console.log('[BOOT] Renderizando tela de login...');
        renderLogin();
        
        // 9. CONCLUIR BOOTSTRAP
        clearTimeout(totalTimeout);
        bootstrapState.completed = true;
        bootstrapState.running = false;
        
        const elapsed = Date.now() - bootstrapState.startTime;
        console.log('[BOOT] ==========================================');
        console.log(`[BOOT] BOOTSTRAP CONCLUﾃ好O (${elapsed}ms)`);
        console.log('[BOOT] ==========================================');
        addSyncTrace('initApp', 'COMPLETE', `sucesso em ${elapsed}ms`);

    } catch (err) {
        clearTimeout(totalTimeout);
        console.error('[BOOT] Erro crﾃｭtico no bootstrap:', err);
        addSyncTrace('initApp', 'ERROR', err.message);
        
        // SEMPRE renderizar login em caso de erro
        hideSplash();
        try {
            renderLogin();
        } catch (e2) {
            console.error('[BOOT] Tambﾃｩm falhou renderLogin:', e2);
        }
        
        bootstrapState.completed = true;
        bootstrapState.running = false;
    }
}

async function loadUsersWithFallback() {
    // TENTATIVA ﾃ哢ICA: Supabase (SSOT)
    console.log('[BOOT] Carregando usuﾃ｡rios do Supabase...');
    try {
        const data = await withTimeout(
            DataClient.fetchUsuariosSupabase(),
            BOOT_CONFIG.TIMEOUT_MS,
            'fetchUsuariosSupabase'
        );
        
        if (data && data.length > 0) {
            appData.users = data.map(u => ({
                ...u,
                avatar_url: (u.avatar_url && !['sim', 'nao', 'nﾃ｣o'].includes(String(u.avatar_url).toLowerCase()) && (String(u.avatar_url).startsWith('http') || String(u.avatar_url).startsWith('data:'))) ? u.avatar_url : ''
            }));
            console.log(`[DATA] usuarios -> Supabase (${appData.users.length} usuﾃ｡rios)`);
            console.log(`[DATA] Google Sheets ignorado para 'usuarios'`);
            return true;
        }
        
        console.error('[BOOT] Supabase retornou vazio para usuﾃ｡rios (SSOT FALHOU)');
    } catch (e) {
        console.error(`[BOOT] Erro crﾃｭtico ao carregar usuﾃ｡rios do Supabase: ${e.message}`);
    }

    // SEM FALLBACK PARA SHEETS (Consolidado)
    addSyncTrace('loadUsersWithFallback', 'ABORT', 'Supabase falhou e Sheets estﾃ｡ desativado como fallback');
    return false;
}



// Inicializaﾃｧﾃ｣o segura baseada no estado do documento

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    // Usar setTimeout para evitar bloqueio sﾃｭncrono
    setTimeout(initApp, 0);
}

let lastProcessSyncQueueCall = 0;
const PROCESS_SYNC_QUEUE_DEBOUNCE_MS = 3000;
const OPERATION_OUTBOX_DB = 'DYAUTO_OPERATION_OUTBOX';
const OPERATION_OUTBOX_STORE = 'operations';

function openOperationOutboxDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('IndexedDB indisponivel'));
            return;
        }

        const request = indexedDB.open(OPERATION_OUTBOX_DB, 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(OPERATION_OUTBOX_STORE)) {
                const store = db.createObjectStore(OPERATION_OUTBOX_STORE, { keyPath: 'id' });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Erro ao abrir outbox'));
    });
}

async function queueOperation(type, payload, meta = {}) {
    const operation = {
        id: payload.executionId || meta.executionId || generateExecutionId(),
        type,
        payload: {
            ...payload,
            executionId: payload.executionId || meta.executionId || generateExecutionId()
        },
        meta,
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastError: ''
    };
    operation.payload.executionId = operation.id;

    try {
        const db = await openOperationOutboxDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(OPERATION_OUTBOX_STORE, 'readwrite');
            tx.objectStore(OPERATION_OUTBOX_STORE).put(operation);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        const fallback = JSON.parse(localStorage.getItem('operation_outbox_fallback') || '[]');
        fallback.push(operation);
        localStorage.setItem('operation_outbox_fallback', JSON.stringify(fallback));
    }

    await refreshOutboxPendingCount();
    return operation;
}

async function getQueuedOperations() {
    let operations = [];
    try {
        const db = await openOperationOutboxDB();
        operations = await new Promise((resolve, reject) => {
            const tx = db.transaction(OPERATION_OUTBOX_STORE, 'readonly');
            const request = tx.objectStore(OPERATION_OUTBOX_STORE).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        operations = [];
    }

    const fallback = JSON.parse(localStorage.getItem('operation_outbox_fallback') || '[]');
    return [...operations, ...fallback]
        .filter(op => op.status === 'pending' || op.status === 'error')
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function markQueuedOperation(operation, status, error = '') {
    const updated = {
        ...operation,
        status,
        attempts: (operation.attempts || 0) + (status === 'error' ? 1 : 0),
        updatedAt: new Date().toISOString(),
        lastError: error ? String(error) : ''
    };

    try {
        const db = await openOperationOutboxDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(OPERATION_OUTBOX_STORE, 'readwrite');
            if (status === 'synced') tx.objectStore(OPERATION_OUTBOX_STORE).delete(operation.id);
            else tx.objectStore(OPERATION_OUTBOX_STORE).put(updated);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (dbError) {
        const fallback = JSON.parse(localStorage.getItem('operation_outbox_fallback') || '[]')
            .filter(op => op.id !== operation.id);
        if (status !== 'synced') fallback.push(updated);
        localStorage.setItem('operation_outbox_fallback', JSON.stringify(fallback));
    }
}

async function refreshOutboxPendingCount() {
    const outbox = await getQueuedOperations();
    operacoesPendentes = outbox.length + getOfflinePendingCount();
    atualizarPendentes();
}

async function executeQueuedOperation(operation) {
    if (operation.type === 'supabase_rpc' && operation.meta?.rpcName === 'finalizar_conferencia') {
        return DataClient.finalizarConferenciaSupabase(operation.payload);
    }

    if (operation.type === 'supabase_pick_draft') {
        return DataClient.savePickingDraftSupabase(operation.payload);
    }

    if (operation.type === 'supabase_pick_finalize') {
        return DataClient.finalizePickingDraftSupabase(operation.payload);
    }

    if (operation.type === 'google_sheets_post') {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(operation.payload)
        });
        return true;
    }

    throw new Error(`Tipo de operacao offline desconhecido: ${operation.type}`);
}

async function syncOperationOutbox(caller = 'unknown') {
    if (!navigator.onLine) return 0;
    const operations = await getQueuedOperations();
    let syncedCount = 0;

    for (const operation of operations) {
        try {
            await executeQueuedOperation(operation);
            await markQueuedOperation(operation, 'synced');
            syncedCount++;
        } catch (error) {
            await markQueuedOperation(operation, 'error', error.message || error);
            console.warn('[OUTBOX] pausa na sincronizacao:', caller, operation.type, error);
            break;
        }
    }

    await refreshOutboxPendingCount();
    return syncedCount;
}

async function processSyncQueue(caller = 'unknown') {
    const now = Date.now();
    if (now - lastProcessSyncQueueCall < PROCESS_SYNC_QUEUE_DEBOUNCE_MS) {
        console.log(`[SYNC] processSyncQueue ignorado (debounce): ${caller} | ﾃ嗟tima: ${now - lastProcessSyncQueueCall}ms`);
        addSyncTrace('processSyncQueue', 'DEBOUNCE', caller);
        return;
    }
    lastProcessSyncQueueCall = now;

    if (!navigator.onLine || isSyncing) {
        addSyncTrace('processSyncQueue', 'BLOCK', `online=${navigator.onLine} isSyncing=${isSyncing}`);
        return;
    }
    
    const outboxProcessed = await syncOperationOutbox(caller);

    addSyncTrace('processSyncQueue', 'START', caller);
    console.log(`[SYNC] processSyncQueue disparado por: ${caller}`);

    let queue = JSON.parse(localStorage.getItem('pending_sync_queue') || '[]');
    const initialQueueLength = queue.length;

    if (queue.length === 0) {
        await refreshOutboxPendingCount();
        addSyncTrace('processSyncQueue', 'EMPTY', 'fila vazia');
        if (outboxProcessed > 0) {
            showToast("Sincronizado com sucesso!");
            loadAllData(true, 'operation_outbox_success');
        }
        return;
    }

    isSyncing = true;
    console.log(`Processando fila de sincronia: ${queue.length} itens`);

    try {
        while (queue.length > 0) {
            const item = queue[0];
            operacoesPendentes = queue.length;
            atualizarPendentes();

            try {
                if (!item.payload.executionId) {
                    item.payload.executionId = item.id;
                }

                await fetch(SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item.payload)
                });

                queue.shift();
                localStorage.setItem('pending_sync_queue', JSON.stringify(queue));
            } catch (error) {
                console.warn(`Pausa na sincronia (Rede/GAS):`, error);
                break;
            }
        }
    } finally {
        const itemsProcessed = initialQueueLength - (queue.length);
        isSyncing = false;
        operacoesPendentes = queue.length;
        atualizarPendentes();

        // Sﾃｳ recarrega dados se realmente houve mudanﾃｧa (itens processados)
        if (queue.length === 0 && itemsProcessed > 0) {
            console.log(`[SYNC] Fila limpa (${itemsProcessed} itens). Atualizando dados locais...`);
            addSyncTrace('processSyncQueue', 'CALL', `loadAllData (fila processada: ${itemsProcessed} itens)`);
            showToast("Sincronizado com sucesso!");
            loadAllData(true, 'processSyncQueue_success');
        } else if (queue.length === 0) {
            console.log(`[SYNC] Fila jﾃ｡ estava vazia. Nenhuma carga adicional necessﾃ｡ria.`);
            addSyncTrace('processSyncQueue', 'SKIP', 'fila vazia');
        }
        addSyncTrace('processSyncQueue', 'COMPLETE', `processados=${itemsProcessed} restantes=${queue.length}`);
    }
}

async function safePost(payload) {
    const executionId = generateExecutionId();
    // Aplicar a Camada de Normalizaﾃｧﾃ｣o imediatamente
    const normalizedPayload = normalizePayloadForSheet({ ...payload, executionId });

    const syncItem = {
        id: executionId,
        timestamp: new Date().toISOString(),
        payload: normalizedPayload
    };

    // Log para debug - ﾃｺtil para identificar problemas de comunicaﾃｧﾃ｣o
    console.log("[safePost] Enviando para SCRIPT_URL:", SCRIPT_URL);
    console.log("[safePost] Payload:", JSON.stringify(syncItem.payload, null, 2));

    if (!navigator.onLine) {
        await queueOperation('google_sheets_post', syncItem.payload, { backupTarget: 'google_sheets' });
        showToast("Offline: Salvo para sincronizar.");
        return false;
    }

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncItem.payload)
        });
        
        // Com no-cors, nﾃ｣o podemos ver a resposta, mas se nﾃ｣o threw erro, considera-se sucesso
        console.log("[safePost] Envio concluﾃｭdo com sucesso (mode: no-cors)");
        return true;
    } catch (error) {
        console.error("[safePost] Erro na requisiﾃｧﾃ｣o:", error);
        
        // Adicionar ﾃ� fila mesmo em caso de erro
        await queueOperation('google_sheets_post', syncItem.payload, { backupTarget: 'google_sheets' });
        
        // Mostrar erro mais especﾃｭfico
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showToast("Erro de conexﾃ｣o: Salvando em fila local.");
        } else if (error.name === 'AbortError') {
            showToast("Timeout: Operaﾃｧﾃ｣o cancelada. Salvando em fila.");
        } else {
            showToast("Erro ao salvar: " + error.message);
        }
        return false;
    }
}

function sincronizarSistema() {
    if (isSyncing) return;
    processSyncQueue('manual');
    loadAllData(true, 'manual');
}

async function fetchSheetData(sheetName, timeoutMs = 20000) {
    const url = `${SCRIPT_URL}?action=list&sheet=${encodeURIComponent(sheetName)}`;

    // Controlador de timeout para evitar travamento infinito
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const result = await response.json();
        if (!result.ok) {
            console.error(`[BACKEND] Erro na aba '${sheetName}':`, result.error);
            showToast(`Erro na aba '${sheetName}': ${result.error}`, "error");
            return null;
        }

        console.log(`[BACKEND] Dados recebidos de '${sheetName}':`, {
            count: (result.data || []).length,
            firstRow: (result.data || [])[0]
        });

        const data = result.data || [];

        // Mapear dados retornados pelo GAS para o formato esperado pelo app
        // O GAS retorna objetos com as chaves sendo o nome exato dos cabeﾃｧalhos
        return data.map(record => {
            const obj = {};
            Object.entries(record).forEach(([key, value], index) => {
                const colLetter = getColumnLetter(index);
                // Normalizaﾃｧﾃ｣o consistente com o formato anterior
                const colName = key.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');

                obj[colName] = value;
                obj[`col_${colLetter}`] = value;
                obj[`col_${colLetter.toLowerCase()}`] = value;
                obj[`col_${index}`] = value;
            });
            return obj;
        }).filter(row => {
            // Manter filtro de linhas vazias (usando primeira coluna mapeada como 'col_0' ou 'col_A')
            const firstColValue = row.col_0 || row.col_a || "";
            return String(firstColValue).trim() !== "";
        });
    } catch (error) {
        console.error(`Error fetching sheet ${sheetName}:`, error);
        
        if (sheetName === 'estoque_atual') return null;

        if (error.name === 'AbortError') {
            showToast(`Timeout ao buscar dados de '${sheetName}'`, "error");
        } else if (error.message.includes('Failed to fetch')) {
            showToast(`Erro de conexﾃ｣o ao buscar '${sheetName}'`, "error");
        } else {
            showToast(`Erro ao buscar '${sheetName}': ${error.message}`, "error");
        }
        return null;
    }
}

function getColumnLetter(index) {
    let letter = '';
    while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
    }
    return letter;
}

function getOfflinePendingCount() {
    // Se houver uma fila offline real no appData, retornar o tamanho dela.
    // Por enquanto, retorna 0 conforme solicitado.
    return (window.appData && window.appData.offlineQueue) ? window.appData.offlineQueue.length : 0;
}

// Listener para atualizaﾃｧﾃ｣o de status online/offline
window.addEventListener('online', () => updateMenuStatusUI());
window.addEventListener('offline', () => updateMenuStatusUI());

function getNFBackButton(backAction) {
    const currentUser = localStorage.getItem('currentUser');
    return getTopBarHTML(currentUser, backAction);
}

function handleActionKey(event, action) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        runMenuAction(action);
    }
}

function runMenuAction(action) {
    if (!action) return;
    try {
        const fn = new Function(action);
        fn();
    } catch (error) {
        console.error('[NAV] Falha ao executar acao:', action, error);
        showToast('Nao foi possivel abrir esta tela.', 'error');
    }
}

function updateMenuStatusUI() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const pendingCount = document.querySelector('.pending-count');
    
    if (statusDot && statusText) {
        const isOnline = navigator.onLine;
        statusDot.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
        statusText.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
    }
    
    if (pendingCount) {
        pendingCount.textContent = `${getOfflinePendingCount()} pendentes`;
    }
}

function getTopBarHTML(currentUser, backAction = null, screenType = 'internal') {
    const isMenu = screenType === 'menu';
    return `
        <div class="top-action-group">
                ${!isMenu && backAction ? `
                <button class="fab-icon-btn fab-voltar" type="button" onclick="${backAction}" aria-label="Voltar" title="Voltar">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
                        <circle cx="18" cy="18" r="18" fill="#EF2B2D"/>
                        <path d="M22 18H14M18 14l-4 4 4 4" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                    </svg>
                </button>
                ` : ''}
                
                <button class="fab-icon-btn fab-config" type="button" onclick="renderConfigSubMenu()" aria-label="Configuraﾃｧﾃｵes" title="Configuraﾃｧﾃｵes">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
                        <circle cx="18" cy="18" r="18" fill="#EF2B2D"/>
                        <path d="M18 11v2M18 23v2M11 18h2M23 18h2M13.2 13.2l1.4 1.4M21.4 21.4l1.4 1.4M13.2 22.8l1.4-1.4M21.4 14.6l1.4-1.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
                        <circle cx="18" cy="18" r="3" stroke="#fff" stroke-width="1.8" fill="none"/>
                    </svg>
                </button>

                ${isMenu ? `
                <button class="fab-icon-btn fab-desligar" type="button" onclick="logout()" aria-label="Desligar" title="Encerrar sessﾃ｣o">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
                        <circle cx="18" cy="18" r="18" fill="#FFFFFF"/>
                        <path d="M18 11v10" stroke="#EF2B2D" stroke-width="2.5" stroke-linecap="round"/>
                        <path d="M12.5 14a8 8 0 1 0 11 0" stroke="#EF2B2D" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                    </svg>
                </button>
                ` : ''}
            </div>
    `;
}


function getOperationalIdentityHTML(type = 'PICKING') {
    const isPick = type === 'PICKING';
    const label = isPick ? 'SEPARAﾃ�グ (PICK)' : 'CONFERﾃ劾CIA (PACK)';
    const icon = isPick ? 'inventory_2' : 'verified';
    const mobileGradient = isPick
        ? 'linear-gradient(90deg, #EF4444 0%, #B91C1C 100%)'
        : 'linear-gradient(90deg, #22C55E 0%, #15803D 100%)';
    
    return `
        <!-- Identidade Visual Operacional (Desktop) -->
        <div class="operational-sidebar">
            <div class="sidebar-icon" style="background-color: white; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.15); margin-bottom: 32px;">
                <span class="material-symbols-rounded" style="color: #1E3A8A; font-size: 20px !important;">${icon}</span>
            </div>
            <div class="sidebar-label">${label}</div>
        </div>
        
        <!-- Identidade Visual Operacional (Mobile) -->
        <div class="operational-top-bar">
            <div class="top-bar-icon-wrap">
                <span class="material-symbols-rounded top-bar-icon">${icon}</span>
            </div>
            <span class="top-bar-label">${label}</span>
        </div>
    `;
}

// Barra lateral para mﾃｳdulos internos (Produtos, Inventﾃ｡rio, NF, etc.)
const MODULE_SIDEBAR_CONFIG = {
    produtos:      { label: 'PRODUTOS',      icon: 'inventory_2',  colorFrom: '#DC2626', colorTo: '#991B1B', shadow: '239,68,68' },
    kit_lampada:   { label: 'KIT Lﾃ�PADAS', icon: 'lightbulb',    colorFrom: '#F59E0B', colorTo: '#B45309', shadow: '245,158,11' },
    movimentos:    { label: 'MOVIMENTOS',    icon: 'sync_alt',     colorFrom: '#8B5CF6', colorTo: '#6D28D9', shadow: '139,92,246' },
    inventario:    { label: 'INVENT\u00c1RIO',    icon: 'fact_check',   colorFrom: '#F97316', colorTo: '#C2410C', shadow: '249,115,22' },
    nf:            { label: 'ENTRADA NF',    icon: 'receipt_long', colorFrom: '#1E3A8A', colorTo: '#1E40AF', shadow: '30,58,138' },
    compras:       { label: 'COMPRAS',       icon: 'shopping_bag', colorFrom: '#EF2B2D', colorTo: '#B91C1C', shadow: '239,43,45' },
    financeiro:    { label: 'FINANCEIRO',    icon: 'payments',     colorFrom: '#059669', colorTo: '#047857', shadow: '5,150,105' },
    configuracoes: { label: 'CONFIG.',       icon: 'settings',     colorFrom: '#475569', colorTo: '#1E293B', shadow: '71,85,105' },
};

function getModuleSidebarHTML(moduleKey) {
    const cfg = MODULE_SIDEBAR_CONFIG[moduleKey];
    if (!cfg) return '';
    return `
        <div class="module-sidebar mod-sidebar-${moduleKey}" style="background:linear-gradient(180deg,${cfg.colorFrom} 0%,${cfg.colorTo} 100%);box-shadow:-2px 0 15px rgba(${cfg.shadow},0.18);">
            <div class="sidebar-label">${cfg.label}</div>
        </div>
        <div class="module-top-bar mod-topbar-${moduleKey}">
            <div class="top-bar-icon-wrap">
                <span class="material-symbols-rounded top-bar-icon">${cfg.icon}</span>
            </div>
            <span class="top-bar-label">${cfg.label}</span>
        </div>
    `;
}




function startClock() {
    // Clock removed from UI
}

async function loadUsersOnly() {
    try {
        const data = await DataClient.fetchUsuariosSupabase();
        if (data && data.length > 0) {
            appData.users = data.map(u => ({
                ...u,
                avatar_url: (u.avatar_url && !['sim', 'nao', 'nﾃ｣o'].includes(String(u.avatar_url).toLowerCase()) && (String(u.avatar_url).startsWith('http') || String(u.avatar_url).startsWith('data:'))) ? u.avatar_url : ''
            }));
            console.log(`[BOOT] usuarios -> Supabase (${appData.users.length} usuﾃ｡rios carregados)`);
        } else {
            console.log('[BOOT] usuﾃ｡rios: fallback para dados em memﾃｳria ou fallback');
        }
    } catch (e) {
        console.warn('[BOOT] Erro ao carregar usuarios do Supabase, tentando fetchSheetData:', e);
        try {
            const data = await fetchSheetData('usuarios');
            if (data) {
                appData.users = data
                    .filter(u => String(u.ativo).toLowerCase() === 'sim')
                    .map(u => ({
                        ...u,
                        avatar_url: (u.avatar_url && !['sim', 'nao', 'nﾃ｣o'].includes(String(u.avatar_url).toLowerCase()) && (String(u.avatar_url).startsWith('http') || String(u.avatar_url).startsWith('data:'))) ? u.avatar_url : ''
                    }));
            }
        } catch (e2) {
            console.warn('[BOOT] Tambﾃｩm falhou fetchSheetData:', e2);
        }
    }
}

let lastLoadAllDataCall = 0;
const LOAD_ALL_DATA_DEBOUNCE_MS = 3000;

async function loadAllData(silent = false, caller = 'unknown') {
    const now = Date.now();
    if (now - lastLoadAllDataCall < LOAD_ALL_DATA_DEBOUNCE_MS) {
        console.log(`[SYNC] loadAllData ignorado (debounce): ${caller} | ﾃ嗟tima: ${now - lastLoadAllDataCall}ms`);
        addSyncTrace('loadAllData', 'DEBOUNCE', caller);
        return false;
    }
    lastLoadAllDataCall = now;

    try {
        if (isAppLoading) {
            console.log(`[SYNC] loadAllData ignorado (isAppLoading=true): ${caller}`);
            addSyncTrace('loadAllData', 'BLOCK', `isAppLoading=true caller=${caller}`);
            return false;
        }
        isAppLoading = true;

        addSyncTrace('loadAllData', 'START', `${caller} silent=${silent}`);

        if (!silent) {
            renderLoading(0, "Carregando dados essenciais...");
        }

        addTechnicalLog('SYNC', 'START', `${silent ? 'Silent' : 'UI'} | Caller: ${caller}`);
        console.log(`[SYNC] loadAllData disparado por: ${caller} (Silent: ${silent})`);

        // Carregar apenas dados mﾃｭnimos para o app funcionar (login + menu)
        // Cada mﾃｳdulo carregarﾃ｡ seus prﾃｳprios dados sob demanda via DataClient
        // ATENﾃ�グ: usuarios, canais_envio e produtos agora vem do Supabase, nﾃ｣o mais do Google Sheets
        // separacao e separacao_itens removidos: sﾃｳ devem ser carregados ao entrar na tela de separaﾃｧﾃ｣o/conferﾃｪncia
        const essentialTables = [
        ];

        let completed = 0;
        const total = essentialTables.length;

        const promises = essentialTables.map(async (table) => {
            try {
                const data = await fetchSheetData(table);
                if (data) {
                    appData[table] = data;
                }
            } catch (e) {
                console.warn(`Error loading table ${table}:`, e);
            } finally {
                completed++;
                if (!silent) {
                    updateLoadingProgress(Math.round((completed / total) * 100));
                }
            }
        });

        await Promise.allSettled(promises);

        // Nﾃ｣o salvar todo o appData no localStorage para evitar dados desatualizados
        // Cada mﾃｳdulo gerencia seu prﾃｳprio cache via DataClient
        appData.lastSyncTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        appData.lastSyncTimestamp = Date.now();
        
        addTechnicalLog('SYNC', 'SUCCESS');

        // Estoque crﾃｭtico serﾃ｡ verificado quando o mﾃｳdulo de produtos for carregado
        // via DataClient para nﾃ｣o impactar inicializaﾃｧﾃ｣o
        hasCriticalStock = false;
        addSyncTrace('loadAllData', 'SUCCESS', caller);
        return true;
    } catch (error) {
        addTechnicalLog('SYNC', 'ERROR', error.toString());
        console.error('Error loading data:', error);
        addSyncTrace('loadAllData', 'ERROR', error.toString());
        if (!silent) showToast("Erro ao sincronizar dados.");
        return false;
    } finally {
        isAppLoading = false;
        appData.isLoading = false;
        addSyncTrace('loadAllData', 'FINALLY', `caller=${caller} screen=${currentScreen}`);
        
        // Anti-Blink: Nﾃ｣o atualiza a UI se for silﾃｪncioso ou se estiver no login
        if (!silent && currentScreen === 'menu') {
            renderMenu();
        }
    }
}

/**
 * Funﾃｧﾃ｣o crﾃｭtica para garantir que os produtos foram carregados via DataClient
 * se ainda nﾃ｣o estiverem no appData.
 */
function hydrateProdutosForSearch(products) {
    return (Array.isArray(products) ? products : []).map(p => {
        const searchableTerms = [
            p.descricao_base || p.descricao || "",
            p.descricao_completa || "",
            p.marca || p.marque || "",
            p.categoria || "",
            p.subcategoria || "",
            p.ean || "",
            p.sku_fornecedor || p.sku || "",
            p.id_interno || p.id || "",
            (p.id_interno || p.id || "").toString().replace(/[-.]/g, '')
        ];

        const attrs = safeParseAtributos(p.atributos);
        attrs.forEach(a => {
            searchableTerms.push(a.nome || "");
            searchableTerms.push(a.valor || "");
        });

        return {
            ...p,
            _dBaseNorm: normalizeText(p.descricao_base || p.descricao || ""),
            _dFullNorm: normalizeText(p.descricao_completa || ""),
            _brandCatSubNorm: normalizeText(`${p.marca || ""} ${p.categoria || ""} ${p.subcategoria || ""}`),
            _searchIndex: searchableTerms.map(normalizeProductSearchTerm).join(" ")
        };
    });
}

function useEmergencyProductsFallback(reason) {
    if (!emergencyProductsCache.length) return false;
    console.warn(`[DATA] Usando fallback emergencial de produtos em cache. Motivo: ${reason}`);
    appData.products = hydrateProdutosForSearch(emergencyProductsCache);
    showToast("Supabase indisponivel. Usando catalogo local temporario.", "warning");
    return true;
}

async function ensureProdutosLoaded(force = false) {
    const previousProducts = Array.isArray(appData.products) ? appData.products : [];

    try {
        if (window.supabaseClientReady) {
            await withTimeout(window.supabaseClientReady, BOOT_CONFIG.TIMEOUT_MS, 'supabaseClientReady produtos');
        }

        const start = performance.now();
        const data = await window.DataClient.loadModule('produtos', true);

        if (data && data.products && data.products.length > 0) {
            console.log(`[PERF] Produtos carregados do SUPABASE em ${Math.round(performance.now() - start)}ms`);
            console.log('[SEP] refresh supabase ok', { total: data.products.length });

            const indexStart = performance.now();
            appData.products = hydrateProdutosForSearch(data.products);
            appData.estoque = data.estoque;

            console.log(`[PERF] Indice de busca criado para ${appData.products.length} produtos em ${Math.round(performance.now() - indexStart)}ms`);
            console.log('[SEP] total produtos carregados', appData.products.length);
            return true;
        }

        console.error('[DATA] ERRO: Catalogo retornou vazio ou invalido do Supabase');
        if (previousProducts.length > 0) {
            console.warn('[SEP] refresh supabase erro', { reason: 'retorno vazio', fallback: previousProducts.length });
            appData.products = previousProducts;
            return true;
        }
        if (useEmergencyProductsFallback('retorno vazio do Supabase')) return true;
        showToast('Catalogo vazio. Verifique o Supabase.', 'error');
        return false;
    } catch (err) {
        console.error('[DATA] ERRO FATAL ao carregar produtos:', err.message);
        console.warn('[SEP] refresh supabase erro', {
            message: err?.message,
            details: err?.details,
            hint: err?.hint,
            code: err?.code,
            fallback: previousProducts.length
        });
        if (previousProducts.length > 0) {
            appData.products = previousProducts;
            return true;
        }
        if (useEmergencyProductsFallback(err.message)) return true;
        showToast('Erro ao carregar Supabase: ' + err.message, 'error');
        return false;
    }
}
/**
 * Garante que os canais de envio foram carregados do Supabase.
 * [CANAIS DEBUG]
 */
async function ensureCanaisLoaded(force = false) {
    console.log('[CANAIS DEBUG] ensureCanaisLoaded chamado, force =', force);
    console.log('[CANAIS DEBUG] cache atual appData.channels =', appData.channels ? appData.channels.length : 'undefined');

    // Se jﾃ｡ temos canais em cache e nﾃ｣o ﾃｩ forﾃｧado, usar cache
    if (!force && appData.channels && appData.channels.length > 0) {
        console.log(`[CANAIS DEBUG] Usando ${appData.channels.length} canais do cache appData`);
        return true;
    }
    
    try {
        console.log('[CANAIS DEBUG] supabase client existe?', !!window.supabaseClient);
        console.log('[CANAIS DEBUG] buscando tabela canais_envio via DataClient...');
        
        // Sempre forﾃｧar refresh para canais (evitar cache vazio)
        const data = await window.DataClient.loadModule('channels', true);
        
        console.log('[CANAIS DEBUG] resposta DataClient.loadModule:', data);
        
        if (data && data.channels && data.channels.length > 0) {
            appData.channels = data.channels;
            console.log(`[CANAIS DEBUG] quantidade retornada: ${appData.channels.length}`);
            console.log(`[CANAIS DEBUG] canais retornados:`, appData.channels.map(c => c.nome || c.col_B));
            return true;
        }
        
        // Fallback: tentar busca direta no Supabase se DataClient falhou
        console.warn('[CANAIS DEBUG] DataClient retornou vazio, tentando busca direta...');
        if (window.supabaseClient) {
            const { data: directData, error } = await window.supabaseClient
                .from('canais_envio')
                .select('*')
                .eq('ativo', true)
                .order('nome', { ascending: true });
            
            if (error) {
                console.error('[CANAIS DEBUG] erro supabase direto:', error);
            } else if (directData && directData.length > 0) {
                appData.channels = directData;
                console.log(`[CANAIS DEBUG] busca direta OK: ${directData.length} canais`);
                console.log('[CANAIS DEBUG] canais retornados:', directData.map(c => c.nome));
                return true;
            } else {
                console.warn('[CANAIS DEBUG] busca direta retornou 0 canais');
            }
        }
        
        console.warn('[CANAIS DEBUG] Nenhum canal retornado do Supabase');
        appData.channels = appData.channels || [];
        return false;
    } catch (error) {
        console.error('[CANAIS DEBUG] Erro ao carregar canais:', error);
        appData.channels = appData.channels || [];
        return false;
    }
}




function renderSplash() {
    app.innerHTML = `
                <div style="background: var(--bg); min-height: 100vh; width: 100%;"></div>
            `;
}

function renderLoading(progress = 0, message = "Sincronizando Dados") {
    currentScreen = 'loading';
    app.innerHTML = `
                <div class="login-screen fade-in" style="justify-content: center; background: var(--bg);">
                    <div class="login-logo-container" style="min-height: auto; margin-bottom: 40px; display: flex; justify-content: center; width: 100%;">
                        <img src="${LOGO_URL}" alt="DY AutoParts" class="login-logo-img" onerror="this.onerror=null; this.src='/imagens/icon-512-black.png';">
                    </div>
                    <div style="text-align: center; width: 100%; max-width: 320px; padding: 0 20px;">
                        <p style="margin-bottom: 20px; font-weight: 700; color: var(--muted); letter-spacing: 0.2em; font-size: 0.7rem; text-transform: uppercase;">${message}</p>
                        <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 10px; overflow: hidden; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.05);">
                            <div id="loading-bar" style="width: ${progress}%; height: 100%; background: var(--primary); transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px var(--primary);"></div>
                        </section>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 0.6rem; color: var(--muted); font-weight: 600;">CARREGANDO...</span>
                            <span id="loading-percent" style="font-size: 0.8rem; font-weight: 800; color: var(--primary); font-variant-numeric: tabular-nums;">${progress}%</span>
                        </div>
                    </div>
                </div>
            `;
}

function updateLoadingProgress(progress) {
    const bar = document.getElementById('loading-bar');
    const percent = document.getElementById('loading-percent');
    if (bar) bar.style.width = `${progress}%`;
    if (percent) percent.innerText = `${progress}%`;
}

function showToast(message) {
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function playBeep(type) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'success' || type === true) {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.12);
        } else if (type === 'warning') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.2);
        } else if (type === 'error' || type === false) {
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(220, audioCtx.currentTime); 
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.3);
        }
    } catch (err) {
        console.warn('[AUDIO] feedback falhou', err);
    }
}


let isSyncingFlowActive = false;

// SYNC WATCHDOG - garante que a flag nunca fique travada permanentemente
setInterval(() => {
    if (isSyncingFlowActive) {
        console.warn('[SYNC WATCHDOG] resetando sync travado');
        isSyncingFlowActive = false;
    }
}, 3000);

function showSyncLoader() {
    // Silent mode - UI screen removed per User request
}

function hideSyncLoader() {
    // Silent mode - UI screen removed per User request
}

async function setUser(userName, userId, userProfile) {
    console.log('[LOGIN DEBUG] usuﾃ｡rio clicado');
    console.log(`[LOGIN DEBUG] isSyncingFlowActive antes: ${isSyncingFlowActive}`);

    if (isSyncingFlowActive) {
        console.log('[LOGIN DEBUG] resetando bloqueio');
        isSyncingFlowActive = false;
    }

    console.log('[LOGIN DEBUG] setUser permitido');
    isSyncingFlowActive = true;

    try {
        addSyncTrace('setUser', 'START', `user=${userName} profile=${userProfile}`);

        localStorage.setItem('currentUser', userName);
        localStorage.setItem('currentUserId', userId || '');
        localStorage.setItem('currentUserProfile', userProfile || 'Operador');

        // Entrada INSTANTﾃ�EA no menu
        renderMenu();

        // Sincronizaﾃｧﾃ｣o silenciosa em background - COORDENADA
        if (navigator.onLine) {
            addTechnicalLog('LOGIN', 'SILENT_SYNC_START', userName);
            console.log("[SYNC] setUser coordenando sincronizaﾃｧﾃ｣o inicial...");
            addSyncTrace('setUser', 'CALL', 'processSyncQueue + loadAllData');
            processSyncQueue('setUser');
            loadAllData(true, 'setUser');
        }

        addSyncTrace('setUser', 'COMPLETE', userName);
    } finally {
        isSyncingFlowActive = false;
    }
}
function logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentUserId');
    localStorage.removeItem('currentUserProfile');
    localStorage.removeItem('draft_pick_session');
    
    // Limpar estados de memﾃｳria
    currentPackSession = null;
    currentSessionItems = [];
    
    renderLogin();
}

/**
 * Alterna visibilidade do custo nos detalhes do produto
 */
function toggleCostVisibility() {
    const isVisible = localStorage.getItem('cost_visible') === 'true';
    localStorage.setItem('cost_visible', !isVisible);
    
    // Se o elemento existir na tela atual, atualiza na hora sem re-renderizar tudo
    const costField = document.getElementById('product-cost-field');
    const toggleIcon = document.getElementById('cost-toggle-icon');
    
    if (costField && toggleIcon) {
        if (!isVisible) {
            // Estava oculto, vai mostrar
            costField.classList.remove('cost-masked');
            toggleIcon.innerText = 'visibility';
            // Precisamos do dado do produto, mas como nﾃ｣o temos aqui, o fallback ﾃｩ re-render
            const activeEan = document.querySelector('[data-ean]')?.dataset.ean;
            if (activeEan) {
                const p = appData.products.find(x => x.ean === activeEan || x.id_interno === activeEan);
                if (p) {
                   costField.innerText = ((p.preco_custo || '0,00').toString().includes('R$') ? '' : 'R$ ') + (p.preco_custo || '0,00');
                }
            } else {
                console.warn("Contexto do produto perdido para exibiﾃｧﾃ｣o do custo.");
            }
        } else {
            // Estava visﾃｭvel, vai ocultar
            costField.classList.add('cost-masked');
            toggleIcon.innerText = 'visibility_off';
            costField.innerText = 'R$ ------';
        }
    }
}

// Status Handlers moved to global section early in file


window.loginSoundPaths = [
    '/assets/audio/som1.mp3',
    '/assets/audio/som2.mp3',
    '/assets/audio/som3.mp3',
    '/assets/audio/som4.mp3'
];
window.loginSounds = [];

window.playLoginSound = function(index) {
  const soundIndex = index % window.loginSoundPaths.length;
  try {
    if (!window.loginSounds[soundIndex]) {
      window.loginSounds[soundIndex] = new Audio(window.loginSoundPaths[soundIndex]);
    }
    const sound = window.loginSounds[soundIndex];
    if (!sound) return;

    sound.pause();
    sound.currentTime = 0;
    sound.volume = 0.6;

    sound.play().catch(() => {});

    setTimeout(() => {
      sound.pause();
      sound.currentTime = 0;
    }, 1000);
  } catch (e) {
    // Audio not available, silently ignore
  }
};

function removeLegacyLoginFullscreenControls() {
    if (!document.getElementById('login-screen') && currentScreen !== 'login') return;

    document
        .querySelectorAll('.top-bar-minimal, .btn-exit-minimal, .btn-exit-floating, #exit-fullscreen-float, #fullscreen-controls')
        .forEach((el) => el.remove());

    document.querySelectorAll('button, [role="button"], div').forEach((el) => {
        if (!el || el.id === 'exit-fullscreen-login' || el.id === 'btn-fullscreen-login') return;
        if (el.closest('#exit-fullscreen-login') || el.closest('#btn-fullscreen-login')) return;

        const text = (el.textContent || '').trim().toLowerCase();
        const signature = `${el.id || ''} ${el.className || ''} ${text}`;
        const looksLikeClose = text === 'close' || text === 'x' || text === 'ﾃ�';
        const looksLikeLegacyFullscreen = /(fullscreen|exit|floating|minimal)/i.test(signature);
        if (!looksLikeClose && !looksLikeLegacyFullscreen) return;

        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const isSmallFloatingControl =
            rect.width >= 30 &&
            rect.width <= 90 &&
            rect.height >= 30 &&
            rect.height <= 90 &&
            rect.top <= Math.max(180, window.innerHeight * 0.28);

        if (!isSmallFloatingControl) return;

        const style = window.getComputedStyle(el);
        const canBeOverlay = style.position === 'fixed' || style.position === 'absolute' || Number(style.zIndex) >= 1000;
        if (canBeOverlay) el.remove();
    });
}

function renderLogin(push = true) {
    currentScreen = 'login';
    document.body.classList.add('login-active');
    removeLegacyLoginFullscreenControls();
    if (push) pushNav('login');
    const fallbackUsers = [
        { id: 'f1', nome: "Alexandre Kawai", perfil: 'Operador' },
        { id: 'f2', nome: "Daniel Yanagihara", perfil: 'Operador' },
        { id: 'f3', nome: "Fabio Kanashiro", perfil: 'Operador' },
        { id: 'f4', nome: "Rafael Costa", perfil: 'Operador' }
    ];

    let usersToRender = [];

    if (appData.users && appData.users.length > 0) {
        usersToRender = appData.users
            .map(u => ({
                id: u.usuario_id || u.col_A || '',
                nome: u.nome || u.col_B || '',
                perfil: u.perfil || u.col_C || '',
                avatar_url: u.avatar_url || ''
            }))
            .filter(u => u.nome.trim() !== '');
    }

    if (usersToRender.length === 0) {
        usersToRender = fallbackUsers;
    }

    // Funﾃｧﾃ｣o para extrair iniciais (primeira letra do nome + primeira letra do ﾃｺltimo sobrenome)
    const getUserInitials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        const first = parts[0].charAt(0);
        const last = parts[parts.length - 1].charAt(0);
        return (first + last).toUpperCase();
    };

    // Stable color function (Deterministic based on ID or Name)
    const getUserColorClass = (id, name) => {
        const seed = id || name || 'default';
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = seed.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `avatar-color-${Math.abs(hash + seed.length) % 6}`;
    };

    const isMobile = window.innerWidth < 768;
    const bgImageSet = isMobile ? localStorage.getItem('loginBackgroundMobile') : localStorage.getItem('loginBackgroundDesktop');
    
    // Fallback/backup visual em degradê escuro caso as imagens não carreguem
    let defaultBg = isMobile ? '/assets/images/login-bg-mobile.png' : '/assets/images/login-bg-desktop.png';
    let backgroundStyleValue = `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.65)), url('${defaultBg}') center/cover no-repeat fixed, linear-gradient(135deg, #050505 0%, #151515 100%)`;
    if (isMobile) {
        backgroundStyleValue = `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.65)), url('${defaultBg}') center/cover no-repeat, linear-gradient(135deg, #050505 0%, #151515 100%)`;
    }
    
    if (bgImageSet && typeof bgImageSet === 'string' && bgImageSet.startsWith('data:image')) {
        backgroundStyleValue = `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.65)), url('${bgImageSet}') center/cover no-repeat`;
    }
    const backgroundStyle = `style="background: ${backgroundStyleValue};"`;
    
    const userGridHTML = usersToRender.map((u, index) => {
        const initials = getUserInitials(u.nome);
        const nameParts = (u.nome || '').trim().split(/\s+/).filter(Boolean);
        const formattedName = nameParts.length > 1
            ? `${nameParts.slice(0, -1).join(' ')}<br>${nameParts[nameParts.length - 1]}`
            : (u.nome || '');
        
        return `
                <div class="user-card login-user-card" onclick="window.playLoginSound(${index}); setUser('${u.nome}', '${u.id}', '${u.perfil}')">
                    <div class="user-avatar-box">
                        <span class="user-initials">${initials}</span>
                    </div>
                    <span class="name" style="display: block;">${formattedName}</span>
                </div>
            `;
    }).join('');

    const loginHTML = `
        <div class="login-screen fade-in" id="login-screen" ${backgroundStyle}>
            <div class="top-hover-zone">
                <button id="btn-fullscreen-login" onclick="toggleFullscreen()" class="btn-floating-app btn-tela-cheia" title="Tela Cheia">
                    <span class="material-symbols-rounded">fullscreen</span>
                </button>
                <button id="btn-fullscreen-exit-login" onclick="toggleFullscreen()" class="btn-floating-app btn-fullscreen-exit-login" title="Sair da Tela Cheia">
                    <span class="material-symbols-rounded">fullscreen_exit</span>
                </button>
            </div>
            <img src="${LOGO_SMALL_URL}" alt="DY AutoParts" class="login-logo">
            <div class="user-grid login-user-grid">
                ${userGridHTML}
            </div>
            
        </div>
    `;

    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    // Se jﾃ｡ estiver na tela de login, apenas atualiza a grid se houver mudanﾃｧas reais para evitar flicker
    const existingScreen = appContainer.querySelector('.login-screen');
    if (existingScreen) {
        existingScreen.style.background = backgroundStyleValue;
        existingScreen.style.backgroundSize = 'cover';
        existingScreen.style.backgroundPosition = 'center';
        existingScreen.style.backgroundRepeat = 'no-repeat';

        const gridContainer = existingScreen.querySelector('.user-grid');
        if (gridContainer) {
            const newContent = userGridHTML;
            if (gridContainer.innerHTML.trim().length !== newContent.trim().length) {
                gridContainer.innerHTML = newContent;
            }
            if (!existingScreen.querySelector('.login-user-hint')) {
                existingScreen.insertAdjacentHTML('beforeend', `
                    <div class="login-user-hint" aria-label="Selecione seu usuﾃ｡rio">
                        <span class="material-symbols-rounded">person</span>
                        <span>SELECIONE SEU USUARIO</span>
                    </div>
                `);
            }
            removeLegacyLoginFullscreenControls();
            setTimeout(removeLegacyLoginFullscreenControls, 0);
            return;
        }
    }

    appContainer.innerHTML = loginHTML;
    removeLegacyLoginFullscreenControls();
    setTimeout(removeLegacyLoginFullscreenControls, 0);
}

function getNextInternalId() {
    if (!appData.products || appData.products.length === 0) return "DY-000.001";

    let maxNum = 0;
    let prefix = "DY-000.";

    appData.products.forEach(p => {
        const idVal = String(p.id_interno || p.col_a || p.col_A || p.col_0 || "");
        if (idVal && idVal.trim() !== "") {
            // Extract numeric part. 
            // For "DY-000.197", we want 197.
            // We look for the last sequence of digits.
            const match = idVal.match(/(\d+)$/);
            if (match) {
                const num = parseInt(match[1]);
                if (!isNaN(num) && num > maxNum) {
                    maxNum = num;
                    // Update prefix based on what we found (everything before the number)
                    prefix = idVal.substring(0, idVal.length - match[1].length);
                }
            }
        }
    });

    const nextNum = maxNum + 1;
    // Pad with at least 3 zeros if it was padded before
    const paddedNum = nextNum.toString().padStart(3, '0');
    return `${prefix}${paddedNum}`;
}

async function renderAlerts() {
    const currentUser = localStorage.getItem('currentUser');
    
    await ensureProdutosLoaded();
    
    const criticalProducts = (appData.products || []).filter(p => {
        if (!p.estoque_minimo || parseFloat(p.estoque_minimo) <= 0) return false;
        const stock = parseFloat((p.estoque_atual || 0).toString().replace(',', '.'));
        const min = parseFloat(p.estoque_minimo.toString().replace(',', '.'));
        return stock <= min;
    });
    
    let pendingCount = 0;
    if (appData.pickSessions && appData.pickSessions.length > 0) {
        pendingCount = appData.pickSessions.filter(s => s.status === 'pending' || s.status === 'open' || !s.status).length;
    }
    
    const criticalCount = criticalProducts.length;
    const totalAlerts = criticalCount + pendingCount;
    
    app.innerHTML = `
        <div class="dashboard-screen fade-in internal">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
            <main class="container">
                <div class="sub-menu-header">
                    <h2 style="font-size: 1.2rem; font-weight: 700;">ALERTAS OPERACIONAIS</h2>
                    ${totalAlerts > 0 ? `<span style="background: #EF4444; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: 700;">${totalAlerts}</span>` : ''}
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <div class="menu-card" onclick="renderEstoqueAtual()" style="cursor: pointer;">
                        <span class="material-symbols-rounded icon" style="font-size: 32px; color: #EF4444;">inventory</span>
                        <div style="flex: 1;">
                            <span class="label" style="font-size: 16px; font-weight: 700;">Estoque Crﾃｭtico</span>
                            <span style="display: block; font-size: 0.85rem; color: var(--muted);">Produtos abaixo do estoque mﾃｭnimo</span>
                        </div>
                        ${criticalCount > 0 ? `<span style="background: #EF4444; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.9rem; font-weight: 700;">${criticalCount}</span>` : '<span class="material-symbols-rounded" style="color: #22c55e;">check_circle</span>'}
                    </div>
                    
                    <div class="menu-card" onclick="renderPickMenu()" style="cursor: pointer;">
                        <span class="material-symbols-rounded icon" style="font-size: 32px; color: #F59E0B;">conveyor_belt</span>
                        <div style="flex: 1;">
                            <span class="label" style="font-size: 16px; font-weight: 700;">Separaﾃｧﾃｵes Pendentes</span>
                            <span style="display: block; font-size: 0.85rem; color: var(--muted);">Filas de separaﾃｧﾃ｣o aguardando</span>
                        </div>
                        ${pendingCount > 0 ? `<span style="background: #F59E0B; color: black; padding: 4px 12px; border-radius: 12px; font-size: 0.9rem; font-weight: 700;">${pendingCount}</span>` : '<span class="material-symbols-rounded" style="color: #22c55e;">check_circle</span>'}
                    </div>
                    
                    <div class="menu-card" style="opacity: 0.5; cursor: default;">
                        <span class="material-symbols-rounded icon" style="font-size: 32px; color: #94A3B8;">local_shipping</span>
                        <div style="flex: 1;">
                            <span class="label" style="font-size: 16px; font-weight: 700;">Compras a Caminho</span>
                            <span style="display: block; font-size: 0.85rem; color: var(--muted);">Pedidos de compra em trﾃ｢nsito</span>
                        </div>
                        <span style="background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); padding: 4px 12px; border-radius: 12px; font-size: 0.8rem;">Em breve</span>
                    </div>
                </div>
                
                ${totalAlerts === 0 ? `
                <div style="text-align: center; padding: 40px; background: var(--surface); border-radius: 20px; color: var(--muted); margin-top: 24px;">
                    <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 16px; color: #22c55e;">check_circle</span>
                    <p style="font-size: 1rem;">Nenhum alerta operacional.</p>
                </div>
                ` : ''}
            </main>
        </div>
    `;
}

// ========================================================
// CONFIGURAﾃ�グ CENTRALIZADA DOS Mﾃ泥ULOS DO MENU
// Estrutura ﾃｺnica: tipo = "principal" | "em_breve"
// Preparado para migrar para tabela no Supabase
// ========================================================
const menuModulesConfig = [
    { id: 'produtos', label: 'PRODUTOS', icon: 'produtos', order: 1, type: 'principal' },
    { id: 'kit_lampada', label: 'KIT L\u00C2MPADAS', icon: 'kit_lampada', order: 2, type: 'principal' },
    { id: 'pick', label: 'SEPARA\u00C7\u00C3O (PICK)', icon: 'pick', order: 3, type: 'principal' },
    { id: 'pack', label: 'CONFER\u00CANCIA (PACK)', icon: 'pack', order: 4, type: 'principal' },
    { id: 'movimentacoes', label: 'MOVIMENTOS', icon: 'movimentacoes', order: 5, type: 'principal' },
    { id: 'inventario', label: 'INVENT\u00c1RIO', icon: 'inventario', order: 6, type: 'principal' },
    { id: 'dashboard', label: 'DASHBOARD', icon: 'dashboard', order: 7, type: 'principal' },
    { id: 'nf', label: 'ENTRADA NF', icon: 'nf', order: 8, type: 'principal' },
    { id: 'financeiro', label: 'FINANCEIRO', icon: 'financeiro', order: 9, type: 'principal' },
    { id: 'compras', label: 'COMPRAS', icon: 'compras', order: 10, type: 'principal' }
];

const menu3DIcons = {
    produtos: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#DC2626"/><rect x="18" y="22" width="28" height="3" rx="1.5" fill="#fff" opacity="0.95"/><rect x="18" y="28" width="22" height="2.5" rx="1.25" fill="#fff" opacity="0.8"/><rect x="18" y="33" width="25" height="2.5" rx="1.25" fill="#fff" opacity="0.7"/><rect x="18" y="38" width="18" height="2.5" rx="1.25" fill="#fff" opacity="0.55"/></svg>',
    kit_lampada: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><path d="M32 18 C26 18 22 23 22 28 C22 33 25 36 28 38 L28 44 L36 44 L36 38 C39 36 42 33 42 28 C42 23 38 18 32 18 Z" stroke="#fff" stroke-width="2.5" fill="none"/><line x1="28" y1="44" x2="36" y2="44" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><line x1="29" y1="47" x2="35" y2="47" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    pick: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#3B82F6"/><rect x="18" y="20" width="28" height="3" rx="1.5" fill="#fff" opacity="0.95"/><rect x="18" y="26" width="22" height="2.5" rx="1.25" fill="#fff" opacity="0.85"/><rect x="18" y="31" width="25" height="2.5" rx="1.25" fill="#fff" opacity="0.75"/><rect x="18" y="36" width="18" height="2.5" rx="1.25" fill="#fff" opacity="0.65"/><path d="M28 43 L33 49 L43 38" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    pack: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#10B981"/><rect x="18" y="22" width="28" height="24" rx="3" stroke="#fff" stroke-width="2.5" fill="none"/><path d="M18 28 H46" stroke="#fff" stroke-width="2.5"/><path d="M26 36 L31 42 L40 30" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    movimentacoes: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#8B5CF6"/><path d="M20 32 H44" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M36 24 L44 32 L36 40" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M28 40 L20 32 L28 24" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"/></svg>',
    inventario: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><rect x="18" y="20" width="28" height="3" rx="1.5" fill="#fff" opacity="0.95"/><rect x="18" y="26" width="22" height="2.5" rx="1.25" fill="#fff" opacity="0.85"/><rect x="18" y="31" width="25" height="2.5" rx="1.25" fill="#fff" opacity="0.75"/><rect x="18" y="36" width="18" height="2.5" rx="1.25" fill="#fff" opacity="0.65"/><rect x="18" y="41" width="14" height="2.5" rx="1.25" fill="#fff" opacity="0.5"/></svg>',
    dashboard: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#DC2626"/><rect x="16" y="16" width="13" height="13" rx="2" fill="#fff" opacity="0.9"/><rect x="35" y="16" width="13" height="13" rx="2" fill="#fff" opacity="0.9"/><rect x="16" y="35" width="13" height="13" rx="2" fill="#fff" opacity="0.9"/><rect x="35" y="35" width="13" height="13" rx="2" fill="#fff" opacity="0.9"/></svg>',
    configuracoes: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#4B5563"/><path d="M32 16v4M32 44v4M16 32h4M44 32h4M20.7 20.7l2.8 2.8M40.5 40.5l2.8 2.8M20.7 43.3l2.8-2.8M40.5 23.5l2.8-2.8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="32" r="6" stroke="#fff" stroke-width="2.5" fill="none"/></svg>',
    nf: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#475569"/><rect x="20" y="18" width="24" height="3" rx="1.5" fill="#fff" opacity="0.95"/><rect x="20" y="24" width="18" height="2.5" rx="1.25" fill="#fff" opacity="0.8"/><rect x="20" y="29" width="21" height="2.5" rx="1.25" fill="#fff" opacity="0.7"/><rect x="20" y="34" width="16" height="2.5" rx="1.25" fill="#fff" opacity="0.6"/><rect x="20" y="39" width="12" height="2.5" rx="1.25" fill="#fff" opacity="0.5"/><rect x="20" y="44" width="9" height="2.5" rx="1.25" fill="#fff" opacity="0.35"/></svg>',
    compras: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#DC2626"/><path d="M20 22 L22 18 H42 L44 22 V40 H20 Z" stroke="#fff" stroke-width="2.5" fill="none" stroke-linejoin="round"/><path d="M26 22 V18 M38 22 V18" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><path d="M26 31 L31 36 L38 28" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    financeiro: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#10B981"/><circle cx="32" cy="32" r="14" stroke="#fff" stroke-width="2.5" fill="none"/><text x="32" y="37" text-anchor="middle" fill="#fff" font-size="16" font-weight="bold" font-family="sans-serif">$</text></svg>',
    // ﾃ皇ones dos Sub-mﾃｳdulos
    busca: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#3B82F6"/><circle cx="28" cy="28" r="8" stroke="#fff" stroke-width="3" fill="none"/><line x1="34" y1="34" x2="42" y2="42" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>',
    cadastrar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#10B981"/><line x1="32" y1="20" x2="32" y2="44" stroke="#fff" stroke-width="4" stroke-linecap="round"/><line x1="20" y1="32" x2="44" y2="32" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
    transferencia: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#8B5CF6"/><path d="M22 28 L30 20 L38 28 M30 20 V44" stroke="#fff" stroke-width="3" fill="none"/><path d="M42 36 L34 44 L26 36" stroke="#fff" stroke-width="3" fill="none" opacity="0.6"/></svg>',
    ajuste: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><path d="M22 22 L42 42 M22 42 L42 22" stroke="#fff" stroke-width="3"/></svg>',
    historico: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#64748B"/><circle cx="32" cy="32" r="12" stroke="#fff" stroke-width="2.5" fill="none"/><path d="M32 24 V32 L38 36" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
    fornecedores: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#DC2626"/><rect x="20" y="20" width="24" height="24" rx="2" stroke="#fff" stroke-width="3" fill="none"/><path d="M26 26 H38 M26 32 H38 M26 38 H32" stroke="#fff" stroke-width="2" opacity="0.8"/></svg>',
    pedido_compra: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><path d="M20 24 H44 L40 40 H24 Z" stroke="#fff" stroke-width="3" fill="none"/><circle cx="26" cy="46" r="2.5" fill="#fff"/><circle cx="38" cy="46" r="2.5" fill="#fff"/></svg>',
    transporte: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#3B82F6"/><rect x="18" y="26" width="20" height="14" rx="1" fill="#fff" opacity="0.9"/><rect x="38" y="30" width="8" height="10" rx="1" fill="#fff" opacity="0.7"/></svg>',
    abertas: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><circle cx="32" cy="32" r="10" stroke="#fff" stroke-width="3" fill="none" opacity="0.5"/><path d="M32 26 V32 L36 36" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
    garantia: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#EF4444"/><path d="M32 20 L32 36" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><circle cx="32" cy="43" r="2.5" fill="#fff"/></svg>',
    xml: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#3B82F6"/><path d="M22 22 H42 V42 H22 Z" stroke="#fff" stroke-width="3" fill="none"/><path d="M26 28 L32 34 L38 28" stroke="#fff" stroke-width="3" fill="none"/></svg>',
    manual: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#10B981"/><path d="M22 22 L42 42 M42 22 L22 42" stroke="#fff" stroke-width="3"/></svg>',
    inventario_inicial: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#8B5CF6"/><rect x="20" y="18" width="24" height="3" rx="1.5" fill="#fff" opacity="0.95"/><rect x="20" y="24" width="18" height="2.5" rx="1.25" fill="#fff" opacity="0.8"/><rect x="20" y="29" width="21" height="2.5" rx="1.25" fill="#fff" opacity="0.7"/><rect x="20" y="34" width="14" height="2.5" rx="1.25" fill="#fff" opacity="0.55"/></svg>',
    inventario_geral: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><rect x="16" y="20" width="32" height="3" rx="1.5" fill="#fff" opacity="0.95"/><rect x="16" y="26" width="26" height="2.5" rx="1.25" fill="#fff" opacity="0.85"/><rect x="16" y="31" width="29" height="2.5" rx="1.25" fill="#fff" opacity="0.75"/><rect x="16" y="36" width="22" height="2.5" rx="1.25" fill="#fff" opacity="0.65"/><path d="M34 42 L40 48 L50 36" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>',
    inventario_parcial: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#06B6D4"/><rect x="18" y="20" width="28" height="3" rx="1.5" fill="#fff" opacity="0.95"/><rect x="18" y="26" width="20" height="2.5" rx="1.25" fill="#fff" opacity="0.8"/><rect x="18" y="31" width="23" height="2.5" rx="1.25" fill="#fff" opacity="0.7"/><rect x="18" y="36" width="16" height="2.5" rx="1.25" fill="#fff" opacity="0.55"/><path d="M32 42 L37 48 L46 37" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>'
};


const channel3DIcons = {
    flex: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><path d="M34 16 L22 36 H32 L30 48 L42 28 H32 Z" fill="#fff" opacity="0.95"/></svg>',
    shopee: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#EA580C"/><path d="M22 26 C22 18, 42 18, 42 26" stroke="#fff" stroke-width="3" fill="none" opacity="0.9"/><rect x="18" y="26" width="28" height="22" rx="3" fill="#fff" opacity="0.95"/><circle cx="26" cy="34" r="2.5" fill="#EA580C"/><circle cx="38" cy="34" r="2.5" fill="#EA580C"/></svg>',
    ml: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#3B82F6"/><path d="M22 30 H42 M22 38 H34" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M24 22 L18 30 V44 H46 V30 L40 22 Z" stroke="#fff" stroke-width="3" fill="none" stroke-linejoin="round"/></svg>',
    magalu: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0EA5E9"/><rect x="20" y="26" width="24" height="20" rx="2" fill="#fff" opacity="0.95"/><path d="M20 26 L32 18 L44 26" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M26 18 V26 M38 18 V26" stroke="#fff" stroke-width="3"/></svg>',
    correios: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#EAB308"/><rect x="16" y="22" width="32" height="20" rx="2" fill="#fff" opacity="0.95"/><path d="M16 22 L32 32 L48 22" stroke="#EAB308" stroke-width="3" fill="none"/></svg>',
    ultra: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#DC2626"/><path d="M26 44 L38 44 L32 20 Z" fill="#fff" opacity="0.95"/><path d="M32 20 Q44 24 38 44 Q20 24 32 20" fill="#fff" opacity="0.8"/><circle cx="32" cy="34" r="3" fill="#DC2626"/></svg>',
    full: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#16A34A"/><path d="M18 32 H46 M32 18 V46" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.4"/><path d="M34 20 L24 34 H32 L30 44 L40 30 H32 Z" fill="#fff" opacity="0.95"/></svg>',
    pdv: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#64748B"/><path d="M18 24 L22 18 H42 L46 24 V28 H18 Z" fill="#fff" opacity="0.95"/><rect x="20" y="30" width="24" height="16" fill="#fff" opacity="0.8"/><path d="M32 30 V46" stroke="#64748B" stroke-width="2"/></svg>'
};


// Funﾃｧﾃ｣o para obter os itens do menu baseados na configuraﾃｧﾃ｣o centralizada
function getMenuItemsFromConfig() {
    const modoRapidoAtivo = isModoRapidoAtivo();
    
    // Aplicar lﾃｳgica baseada na configuraﾃｧﾃ｣o (todos os mﾃｳdulos sempre visﾃｭveis)
    return menuModulesConfig
        .sort((a, b) => a.order - b.order)
        .map(module => {
            let isDisabled = false;
            let badge = null;
            
            // Lﾃｳgica especial para PACK (desativado no modo rﾃ｡pido)
            if (module.id === 'pack' && modoRapidoAtivo) {
                isDisabled = true;
                badge = 'Desativado';
            } else if (module.type === 'em_breve') {
                badge = 'EM BREVE';
            }
            
            return {
                id: module.id,
                label: module.label,
                icon: module.icon,
                primary: module.order <= 2,
                disabled: isDisabled,
                badge: badge
            };
        });
}

// Rota mapeada para cada mﾃｳdulo
const menuRoutes = {
    dashboard: 'renderAlerts()',
    produtos: 'renderProductSubMenu()',
    pick: 'renderPickMenu()',
    pack: 'renderPackMenu()',
    compras: 'renderComprasSubMenu()',
    movimentacoes: 'renderMovimentacoesSubMenu()',
    inventario: 'renderInventarioSubMenu()',
    nf: 'renderNFSubMenu()',
    financeiro: 'renderFinanceiroSubMenu()',
    configuracoes: 'renderConfigSubMenu()',
    kit_lampada: 'renderGuiaLampada()',
    ajuste: 'renderAjusteEstoqueScreen()'
};

function getQuickActionsHTML(modoRapidoAtivo) {
    return `
        <div id="quick-actions-overlay" class="quick-actions-overlay hidden" onclick="toggleQuickActions()" aria-hidden="true"></div>
        <div id="quick-actions-menu" class="quick-actions-menu hidden" role="menu" aria-label="Acoes rapidas">
            <button class="quick-action-item" type="button" role="menuitem" onclick="quickActionSearch()">
                <span class="material-symbols-rounded icon">search</span>
                <span>Buscar produto</span>
            </button>
            <button class="quick-action-item" type="button" role="menuitem" onclick="quickActionNewMov()">
                <span class="material-symbols-rounded icon">sync_alt</span>
                <span>Movimentar estoque</span>
            </button>
            <button class="quick-action-item" type="button" role="menuitem" onclick="quickActionAjuste()">
                <span class="material-symbols-rounded icon">tune</span>
                <span>Ajustar saldo</span>
            </button>
            <button class="quick-action-item" type="button" role="menuitem" onclick="quickActionNovoProduto()">
                <span class="material-symbols-rounded icon">add_box</span>
                <span>Novo produto</span>
            </button>
        </div>
        
        <div class="fab-container-group">
            <button class="fab-icon-btn fab-desligar" type="button" onclick="logout()" title="Desligar / Encerrar Sessao" aria-label="Desligar">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44">
                    <circle cx="22" cy="22" r="22" fill="#ffffff"/>
                    <path d="M22 11v11" stroke="#EF2B2D" stroke-width="3" stroke-linecap="round"/>
                    <path d="M15 15.6a10 10 0 1 0 14 0" stroke="#EF2B2D" stroke-width="3" stroke-linecap="round" fill="none"/>
                </svg>
            </button>
            <button class="fab-icon-btn fab-config" type="button" onclick="renderConfigSubMenu()" title="Configuraﾃｧﾃｵes" aria-label="Configuraﾃｧﾃｵes">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44">
                    <circle cx="22" cy="22" r="22" fill="#EF2B2D"/>
                    <path d="M22 14v2M22 28v2M14 22h2M28 22h2M16.3 16.3l1.4 1.4M26.3 26.3l1.4 1.4M16.3 27.7l1.4-1.4M26.3 17.7l1.4-1.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
                    <circle cx="22" cy="22" r="3.5" stroke="#fff" stroke-width="2.2" fill="none"/>
                </svg>
            </button>
            <button class="fab-icon-btn fab-funcoes ${modoRapidoAtivo ? 'fast-mode' : ''}" type="button" onclick="${modoRapidoAtivo ? 'showToast(&quot;Modo rapido ativo. Use Conferencia/Saida direta.&quot;, &quot;info&quot;)' : 'toggleQuickActions()'}" aria-label="Funﾃｧﾃｵes rﾃ｡pidas">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44">
                    <circle cx="22" cy="22" r="22" fill="#EF2B2D"/>
                    <line x1="22" y1="13" x2="22" y2="31" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
                    <line x1="13" y1="22" x2="31" y2="22" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    `;
}

function renderMenu(push = true) {
    stopScanner();
    currentScreen = 'menu';
    document.body.classList.remove('login-active');
    if (push) pushNav('menu');
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        document.body.classList.remove('menu-active');
        renderLogin();
        return;
    }
    document.body.classList.add('menu-active');

    const modoRapidoAtivo = isModoRapidoAtivo();
    const quickButtonIcon = modoRapidoAtivo ? 'bolt' : 'add';
    const quickButtonAction = modoRapidoAtivo ? 'showToast("Modo rﾃ｡pido ativo. Use Conferﾃｪncia/Saﾃｭda direta.", "info")' : 'toggleQuickActions()';

    // Usar configuraﾃｧﾃ｣o centralizada
    const finalMenuItems = getMenuItemsFromConfig();

    app.innerHTML = `
        <div class="dashboard-screen fade-in menu-screen">
            ${getTopBarHTML(currentUser, null, 'menu')}
            <main class="container">
                        <div class="menu-grid">
${finalMenuItems.map(item => {
    const routeAction = menuRoutes[item.id] || `handleMenuClick('${item.label}')`;
    return `
                                <button class="menu-card mobile-nav-card ${item.disabled ? 'disabled' : ''}" type="button"
                                     ${item.disabled ? 'disabled aria-disabled="true"' : `onclick="runMenuAction('${routeAction.replace(/'/g, "\\'")}')" onkeydown="handleActionKey(event, '${routeAction.replace(/'/g, "\\'")}')"`}
                                     aria-label="${item.label}">
                                    ${item.badge ? `<span class="badge">${item.badge}</span>` : ''}
                                    <span class="menu-icon-3d">${menu3DIcons[item.icon] || ''}</span>
                                    <span class="label">${item.label}</span>
                                </button>
                            `;
}).join('')}
                        </div>
                    </main>
                </div>
    `;
}

async function renderDashboard() {
    await renderAlerts();
}

async function renderEstoqueAtual() {
    await ensureProdutosLoaded();
    
    console.log("[DIAGNOSTICO] renderEstoqueAtual iniciado.");
    console.log(`[DIAGNOSTICO] Itens em appData.products: ${appData.products ? appData.products.length : 0}`);
    console.log(`[DIAGNOSTICO] Itens em appData.estoque: ${appData.estoque ? appData.estoque.length : 0}`);
    
    const currentUser = localStorage.getItem('currentUser');

    // Consolidate stock by id_interno
    const consolidated = {};

    // Use appData.estoque (mapped from ESTOQUE_ATUAL)
    (appData.estoque || []).forEach(item => {
        const id = (item.id_interno || item.col_a || '').toString();
        if (!id) return;

        if (!consolidated[id]) {
            // Find product details for SKU and description
            const product = appData.products.find(p => (p.id_interno || p.col_a || '').toString() === id);
            consolidated[id] = {
                id_interno: id,
                sku: product ? (product.sku_fornecedor || product.col_c || '-') : '-',
                descricao: product ? (product.descricao_base || product.nome || product.col_b) : (item.descricao || item.col_b || 'Sem Descriﾃｧﾃ｣o'),
                saldo_total: 0,
                saldo_disponivel: 0,
                saldo_reservado: 0,
                saldo_em_transito: 0,
                locations: []
            };
        }

        const total = parseFloat((item.saldo_total || item.col_f || 0).toString().replace(',', '.'));
        const disponivel = parseFloat((item.saldo_disponivel || item.col_c || 0).toString().replace(',', '.'));
        const reservado = parseFloat((item.saldo_reservado || item.col_d || 0).toString().replace(',', '.'));
        const transito = parseFloat((item.saldo_em_transito || item.col_e || 0).toString().replace(',', '.'));

        consolidated[id].saldo_total += isNaN(total) ? 0 : total;
        consolidated[id].saldo_disponivel += isNaN(disponivel) ? 0 : disponivel;
        consolidated[id].saldo_reservado += isNaN(reservado) ? 0 : reservado;
        consolidated[id].saldo_em_transito += isNaN(transito) ? 0 : transito;

        const localName = item.local || item.col_b;
        if (localName) {
            consolidated[id].locations.push({
                local: localName,
                total: isNaN(total) ? 0 : total,
                disponivel: isNaN(disponivel) ? 0 : disponivel
            });
        }
    });

    // Convert to array and sort
    const stockList = Object.values(consolidated).sort((a, b) => a.descricao.localeCompare(b.descricao));

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}
                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">ESTOQUE ATUAL</h2>
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                            ${stockList.length === 0 ? `
                                <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                                    <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">database</span>
                                    <p style="color: var(--muted);">Nenhum estoque registrado.</p>
                                </div>
                            ` : stockList.map(item => {
        return `
                                    <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                                            <div style="flex: 1; padding-right: 12px;">
                                                <div style="font-weight: 800; color: white; font-size: 0.9rem; margin-bottom: 4px; line-height: 1.2;">${item.descricao}</div>
                                                <div style="display: flex; gap: 8px;">
                                                    <div style="font-size: 0.65rem; color: var(--muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">SKU: ${item.sku}</div>
                                                    <div style="font-size: 0.65rem; color: var(--muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">ID: ${item.id_interno}</div>
                                                </div>
                                            </div>
                                            <div style="text-align: right;">
                                                <div style="font-size: 1.2rem; font-weight: 800; color: var(--primary);">${item.saldo_total}</div>
                                                <div style="font-size: 0.55rem; color: var(--muted); text-transform: uppercase; font-weight: 700;">Total Geral</div>
                                            </div>
                                        </div>
                                        
                                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                                            <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; text-align: center;">
                                                <div style="font-size: 0.5rem; color: var(--muted); text-transform: uppercase;">Disponﾃｭvel</div>
                                                <div style="font-size: 0.8rem; font-weight: 700; color: #22c55e;">${item.saldo_disponivel}</div>
                                            </div>
                                            <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; text-align: center;">
                                                <div style="font-size: 0.5rem; color: var(--muted); text-transform: uppercase;">Reservado</div>
                                                <div style="font-size: 0.8rem; font-weight: 700; color: #f59e0b;">${item.saldo_reservado}</div>
                                            </div>
                                            <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; text-align: center;">
                                                <div style="font-size: 0.5rem; color: var(--muted); text-transform: uppercase;">Trﾃ｢nsito</div>
                                                <div style="font-size: 0.8rem; font-weight: 700; color: #3b82f6;">${item.saldo_em_transito}</div>
                                            </div>
                                        </div>

                                        ${item.locations.length > 0 ? `
                                            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                                                <div style="font-size: 0.55rem; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Locais:</div>
                                                ${item.locations.map(loc => `
                                                    <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--muted); margin-bottom: 2px;">
                                                        <span>${loc.local}</span>
                                                        <span style="font-weight: 700; color: white;">${loc.total} <span style="font-size: 0.55rem; opacity: 0.6;">(Disp: ${loc.disponivel})</span></span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
    }).join('')}
                        </div>
                    </main>
                </div>
            `;
}

function renderModuleScreen(config) {
    const currentUser = localStorage.getItem('currentUser');
    currentScreen = 'internal';
    document.body.classList.remove('menu-active');
    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, config.backFunc)}
                    <main class="container">
                        <div class="module-content">
                            ${config.content}
                        </div>
                    </main>
                </div>
            `;
}

function getPlaceholderList(items, columns) {
    if (!items || items.length === 0) {
        return `
                    <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                        <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">inventory_2</span>
                        <p style="color: var(--muted);">Nenhum registro encontrado.</p>
                    </div>
                `;
    }
    return `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${items.map(item => `
                        <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-weight: 800; color: white; font-size: 0.9rem;">${item[columns[0]]}</div>
                                <div style="font-size: 0.65rem; color: var(--muted);">${item[columns[1]] || ''}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: 700; color: var(--primary); font-size: 0.85rem;">${item[columns[2]] || ''}</div>
                                <div style="font-size: 0.6rem; color: var(--muted);">${item[columns[3]] || ''}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
}

function getPlaceholderForm(fields) {
    return `
                <div class="form-grid" style="background: var(--surface); padding: 24px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                    ${fields.map(f => `
                        <div class="input-group ${f.fullWidth ? 'full-width' : ''}">
                            <label>${f.label}</label>
                            ${f.type === 'select' ? `
                                <select class="input-field" style="width: 100%; appearance: none;">
                                    ${f.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                                </select>
                            ` : f.type === 'textarea' ? `
                                <textarea class="input-field" style="min-height: 80px;" placeholder="${f.placeholder || ''}"></textarea>
                            ` : `
                                <input type="${f.type || 'text'}" class="input-field" placeholder="${f.placeholder || ''}">
                            `}
                        </div>
                    `).join('')}
                    <div style="grid-column: 1 / -1; display: flex; gap: 16px; margin-top: 24px;">
                        <button class="btn-action" style="flex: 1; justify-content: center;" onclick="showToast('Dados salvos com sucesso!')">
                            <span class="material-symbols-rounded">save</span>
                            Salvar Registro
                        </button>
                    </div>
                </div>
            `;
}

function renderComprasSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    const subItems = [
        { label: 'FORNECEDORES', icon: menu3DIcons.fornecedores, action: 'renderFornecedoresScreen()' },
        { label: 'PEDIDO DE COMPRA', icon: menu3DIcons.pedido_compra, action: 'renderPedidoCompraScreen()' },
        { label: 'PEDIDOS EM TRANSPORTE', icon: menu3DIcons.transporte, action: 'renderPedidosTransporteScreen()' },
        { label: 'HISTﾃ迭ICO', icon: menu3DIcons.historico, action: 'renderHistoricoComprasScreen()' }
    ];

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal compras-screen module-screen">
                    ${getTopBarHTML(currentUser, 'renderMenu()')}
                    ${getModuleSidebarHTML('compras')}

                    <main class="container">
                        <div class="menu-grid">
                            ${subItems.map(item => `
                                <div class="menu-card mobile-nav-card" onclick="${item.action}">
                                    <span class="menu-icon-3d">${item.icon}</span>
                                    <span class="label">${item.label}</span>
                                </div>
                            `).join('')}
                        </div>
                    </main>
                </div>
            `;
}


function renderComprasShell(title, subtitle, contentHTML) {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
        <div class="dashboard-screen fade-in internal compras-screen module-screen">
            ${getTopBarHTML(currentUser, 'renderComprasSubMenu()')}
            ${getModuleSidebarHTML('compras')}
            <main class="container compras-workspace compras-detail-workspace">
                <header class="compras-header compras-detail-header">
                    <div class="compras-header-icon">${menu3DIcons.compras || ''}</div>
                    <div>
                        <p class="compras-kicker">COMPRAS</p>
                        <h1>${title}</h1>
                        <span>${subtitle}</span>
                    </div>
                </header>
                ${contentHTML}
            </main>
        </div>
    `;
}

function renderFornecedoresScreen() {
    renderComprasShell('FORNECEDORES', 'Cadastro preparado para futura integraﾃｧﾃ｣o com Supabase.', `
        <section class="compras-panel fornecedores-panel">
            <div class="compras-toolbar">
                <label class="compras-search-field">
                    <span class="material-symbols-rounded">search</span>
                    <input type="search" placeholder="Buscar fornecedor..." aria-label="Buscar fornecedor">
                </label>
                <button class="compras-primary-btn" type="button" onclick="showToast('Cadastro de fornecedor serﾃ｡ integrado em uma prﾃｳxima fase.', 'info')">
                    <span class="material-symbols-rounded">add_business</span>
                    Novo Fornecedor
                </button>
            </div>
            <div class="compras-empty-state">
                <span class="material-symbols-rounded">domain_disabled</span>
                <strong>Nenhum fornecedor cadastrado</strong>
                <p>Quando a integraﾃｧﾃ｣o for criada, os fornecedores aparecerﾃ｣o nesta lista.</p>
            </div>
        </section>
    `);
}

function renderPedidoCompraScreen() {
    renderComprasShell('PEDIDO DE COMPRA', 'Rascunho visual para montar pedidos de compra.', `
        <section class="compras-panel compras-order-panel">
            <div class="compras-form-grid">
                <label class="compras-field">
                    <span>Fornecedor</span>
                    <select aria-label="Selecionar fornecedor">
                        <option>Selecionar fornecedor</option>
                    </select>
                </label>
                <label class="compras-field">
                    <span>Adicionar produtos</span>
                    <input type="text" placeholder="Buscar produto por EAN, SKU ou nome">
                </label>
                <button class="compras-secondary-btn" type="button" onclick="showToast('Itens do pedido serﾃ｣o integrados em uma prﾃｳxima fase.', 'info')">
                    <span class="material-symbols-rounded">add</span>
                    Adicionar
                </button>
            </div>
            <div class="compras-list-placeholder">
                <span class="material-symbols-rounded">inventory_2</span>
                <strong>Lista de itens vazia</strong>
                <p>Os produtos adicionados ao pedido aparecerﾃ｣o aqui.</p>
            </div>
            <div class="compras-summary-row">
                <span>Total</span>
                <strong>R$ 0,00</strong>
                <button class="compras-primary-btn" type="button" onclick="showToast('Finalizaﾃｧﾃ｣o visual preparada para fase futura.', 'info')">
                    <span class="material-symbols-rounded">check</span>
                    Finalizar
                </button>
            </div>
        </section>
    `);
}

function renderPedidosTransporteScreen() {
    renderComprasShell('PEDIDOS EM TRANSPORTE', 'Pedidos comprados que ainda nﾃ｣o chegaram.', `
        <section class="compras-panel">
            <div class="compras-status-strip">
                <div>
                    <span>Em trﾃ｢nsito</span>
                    <strong>0</strong>
                </div>
                <div>
                    <span>Atrasados</span>
                    <strong>0</strong>
                </div>
                <div>
                    <span>Recebidos hoje</span>
                    <strong>0</strong>
                </div>
                ${false ? `
                <div class="inv-initial-note">
                    <span class="material-symbols-rounded">info</span>
                    <div>
                        <strong>INVENTﾃヽIO INICIAL</strong>
                        <p>Como este ﾃｩ o primeiro inventﾃ｡rio, nﾃ｣o existe saldo anterior no sistema. Por isso, exibimos apenas o Saldo Inicial (quantidade contada).</p>
                    </div>
                </div>
                ` : ''}
            </div>
            <div class="compras-empty-state">
                <span class="material-symbols-rounded">local_shipping</span>
                <strong>Nenhum pedido em transporte</strong>
                <p>Futuramente, compras pendentes de recebimento serﾃ｣o acompanhadas aqui.</p>
            </div>
        </section>
    `);
}

function renderHistoricoComprasScreen() {
    renderComprasShell('HISTﾃ迭ICO DE COMPRAS', 'Consulta visual preparada para compras finalizadas.', `
        <section class="compras-panel">
            <div class="compras-toolbar compras-history-toolbar">
                <label class="compras-search-field">
                    <span class="material-symbols-rounded">search</span>
                    <input type="search" placeholder="Buscar compra, fornecedor ou NF..." aria-label="Buscar histﾃｳrico de compras">
                </label>
                <div class="compras-filter-row" aria-label="Filtros de histﾃｳrico">
                    <button type="button">Todos</button>
                    <button type="button">Abertos</button>
                    <button type="button">Finalizados</button>
                </div>
                ${false ? `
                <div class="inv-initial-note">
                    <span class="material-symbols-rounded">info</span>
                    <div>
                        <strong>INVENTﾃヽIO INICIAL</strong>
                        <p>Como este ﾃｩ o primeiro inventﾃ｡rio, nﾃ｣o existe saldo anterior no sistema. Por isso, exibimos apenas o Saldo Inicial (quantidade contada).</p>
                    </div>
                </div>
                ` : ''}
            </div>
            <div class="compras-list-placeholder compras-table-empty">
                <span class="material-symbols-rounded">history</span>
                <strong>Nenhum histﾃｳrico de compras</strong>
                <p>As compras registradas aparecerﾃ｣o nesta ﾃ｡rea em formato de lista/tabela.</p>
            </div>
        </section>
    `);
}

function handleModuleClick(item, backFunc) {
    let content = '';
    if (item.type === 'form') {
        content = getPlaceholderForm(item.fields);
    } else if (item.type === 'list') {
        content = getPlaceholderList(item.items, item.cols);
    } else {
        content = `<div style="text-align: center; padding: 40px; color: var(--muted);">Funcionalidade em desenvolvimento para ${item.label}</div>`;
    }

    renderModuleScreen({
        title: item.label,
        backFunc: backFunc,
        content: content
    });
}

function renderMovimentacoesSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    const subItems = [
        { id: 'transferencia', label: 'TRANSFERﾃ劾CIA', icon: 'movimentacoes', action: 'renderTransferenciaScreen()' },
        { id: 'ajuste_estoque', label: 'AJUSTE DE ESTOQUE', icon: 'ajuste', action: 'renderAjusteEstoqueScreen()' },
        { id: 'garantia', label: 'ENVIAR PARA GARANTIA', icon: 'nf', action: 'renderGarantiaEnvioForm()' },
        { id: 'historico_mov', label: 'HISTﾃ迭ICO', icon: 'historico', action: 'renderMovimentacoesHistory()' }
    ];

    app.innerHTML = `
        <div class="dashboard-screen internal fade-in movimentos-screen module-screen">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
            ${getModuleSidebarHTML('movimentos')}
            <main class="container">
                <div class="menu-grid">
                    ${subItems.map(item => `
                        <div class="menu-card mobile-nav-card" onclick="${item.action}">
                            <span class="menu-icon-3d">${menu3DIcons[item.icon] || ''}</span>
                            <span class="label">${item.label}</span>
                        </div>
                    `).join('')}
                </div>
            </main>
        </div>
    `;
}

function renderEnvioDefeitoForm() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
            <main class="container" style="display: flex; align-items: center; justify-content: center; height: calc(100vh - 80px);">
                <div style="text-align: center; color: var(--muted);">
                    <span class="material-symbols-rounded" style="font-size: 64px; margin-bottom: 20px; opacity: 0.5;">construction</span>
                    <p>Formulﾃ｡rio de Envio para Defeito em desenvolvimento.</p>
                </div>
            </main>
        </div>
    `;
}

const STOCK_LOCALS = ['Tﾃ嘘REO', 'MOSTRUﾃヽIO', '1ﾂｺ ANDAR', 'DEFEITO', 'EM GARANTIA', 'EM TRANSPORTE'];

const MOVIMENTACAO_ORIGINS = [
    { value: 'MANUAL', label: 'Manual' },
    { value: 'PEDIDO', label: 'Pedido' },
    { value: 'NOTA_FISCAL', label: 'Nota Fiscal' },
    { value: 'INVENTARIO', label: 'Inventﾃ｡rio' },
    { value: 'CONFERENCIA', label: 'Conferﾃｪncia' },
    { value: 'SEPARACAO', label: 'Separaﾃｧﾃ｣o' }
];

function renderMovimentacoes() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
        </div>
    `;
}

function renderMovimentacoesList(history) {
    if (!history || history.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: var(--muted);">
                <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 16px;">inbox</span>
                <p>Nenhum movimento encontrado</p>
            </div>
        `;
    }

    const getTipoBadge = (tipo) => {
        const colors = {
            'ENTRADA': { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
            'SAIDA': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
            'SAﾃ好A': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
            'TRANSFERENCIA': { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
            'AJUSTE': { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
            'AJUSTE+': { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
            'AJUSTE-': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
            'AJUSTE_ESTOQUE': { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' }
        };
        const c = colors[tipo] || { bg: 'rgba(255,255,255,0.1)', color: 'white' };
        return `<span style="background: ${c.bg}; color: ${c.color}; padding: 4px 8px; border-radius: 6px; font-size: 0.65rem; font-weight: 700;">${tipo}</span>`;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return `
        <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
            ${history.map(m => `
                <div class="mov-item" style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            ${getTipoBadge(m.tipo)}
                            <span style="font-size: 0.7rem; color: var(--muted);">${formatDate(m.data_hora || m.data)}</span>
                        </div>
                        <span style="font-size: 0.7rem; color: var(--primary); font-weight: 600;">${m.origem || 'MANUAL'}</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; font-size: 0.75rem;">
                        <div>
                            <span style="color: var(--muted);">Produto:</span>
                            <div style="font-weight: 600; color: white;">${m.id_interno || '-'}</div>
                        </div>
                        <div>
                            <span style="color: var(--muted);">Qtd:</span>
                            <div style="font-weight: 700; color: white;">${m.quantidade || 0}</div>
                        </div>
                        <div>
                            <span style="color: var(--muted);">De:</span>
                            <div style="font-weight: 600; color: white;">${m.local_origem || '-'}</div>
                        </div>
                        <div>
                            <span style="color: var(--muted);">Para:</span>
                            <div style="font-weight: 600; color: white;">${m.local_destino || '-'}</div>
                        </div>
                    </div>
                    ${m.observacao ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.7rem; color: var(--muted);">${m.observacao}</div>` : ''}
                    <div style="margin-top: 8px; font-size: 0.65rem; color: var(--muted);">Por: ${m.usuario || '-'}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function filterMovimentacoes() {
    const search = document.getElementById('mov-filter-search')?.value?.toLowerCase() || '';
    const tipo = document.getElementById('mov-filter-tipo')?.value || '';
    const local = document.getElementById('mov-filter-local')?.value || '';
    const origem = document.getElementById('mov-filter-origem')?.value || '';

    let filtered = appData.movimentacoes || [];

    if (search) {
        filtered = filtered.filter(m => 
            (m.id_interno || '').toLowerCase().includes(search) ||
            (m.descricao || '').toLowerCase().includes(search)
        );
    }
    if (tipo) {
        filtered = filtered.filter(m => m.tipo === tipo);
    }
    if (local) {
        filtered = filtered.filter(m => m.local_origem === local || m.local_destino === local);
    }
    if (origem) {
        filtered = filtered.filter(m => m.origem === origem);
    }

    filtered.sort((a, b) => {
        const dateA = new Date(a.data_hora || a.data || 0);
        const dateB = new Date(b.data_hora || b.data || 0);
        return dateB - dateA;
    });

    const listContainer = document.getElementById('movimentacoes-list');
    if (listContainer) {
        listContainer.innerHTML = renderMovimentacoesList(filtered);
    }
}

function openNovaMovimentacaoModal() {
    console.log('[MOV] clique em Nova movimentaﾃｧﾃ｣o');
    console.log('[MOV] abrindo modal');
    const isInitialType = false;
    
    const modalHTML = `
        <div id="nova-mov-modal" class="modal-overlay" onclick="closeNovaMovimentacaoModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="font-size: 1.1rem; font-weight: 700; margin: 0;">Nova Movimentaﾃｧﾃ｣o</h2>
                    <button onclick="closeNovaMovimentacaoModal()" style="background: none; border: none; color: var(--muted); cursor: pointer; padding: 8px;">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </div>

                <div class="input-group" style="margin-bottom: 20px;">
                    <label style="font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 8px; display: block;">Tipo de Movimentaﾃｧﾃ｣o</label>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                        ${['ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'AJUSTE'].map(tipo => `
                            <button type="button" class="tipo-mov-btn" data-tipo="${tipo}" onclick="selectTipoMovimentacao('${tipo}', this)" style="padding: 12px 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; background: rgba(255,255,255,0.02); color: white; cursor: pointer; font-size: 0.75rem; font-weight: 600; transition: all 0.2s;">
                                ${tipo === 'ENTRADA' ? 'Entrada' : tipo === 'SAIDA' ? 'Saﾃｭda' : tipo === 'TRANSFERENCIA' ? 'Transferﾃｪncia' : 'Ajuste'}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div id="mov-form-container">
                    <div style="text-align: center; padding: 40px 20px; color: var(--muted);">
                        <span class="material-symbols-rounded" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;">touch_app</span>
                        <p style="font-size: 0.85rem;">Selecione o tipo de movimentaﾃｧﾃ｣o acima</p>
                    </div>
                </div>
                ${false ? `
                <div class="inv-initial-note">
                    <span class="material-symbols-rounded">info</span>
                    <div>
                        <strong>INVENTﾃヽIO INICIAL</strong>
                        <p>Como este ﾃｩ o primeiro inventﾃ｡rio, nﾃ｣o existe saldo anterior no sistema. Por isso, exibimos apenas o Saldo Inicial (quantidade contada).</p>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('nova-mov-modal');
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.2s ease';
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
    });
}


function closeNovaMovimentacaoModal(event) {
    if (event && event.target !== event.currentTarget && !event.target.closest('.modal-content')) return;
    const modal = document.getElementById('nova-mov-modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 200);
    }
}

let selectedTipoMovimentacao = null;
let selectedProductForMov = null;

function selectTipoMovimentacao(tipo, btn) {
    console.log(`[MOV] tipo selecionado: ${tipo}`);
    document.querySelectorAll('.tipo-mov-btn').forEach(b => {
        b.style.borderColor = 'rgba(255,255,255,0.1)';
        b.style.background = 'rgba(255,255,255,0.02)';
    });
    btn.style.borderColor = 'var(--primary)';
    btn.style.background = 'rgba(227,6,19,0.15)';
    
    selectedTipoMovimentacao = tipo;
    selectedProductForMov = null;
    
    renderMovimentacaoForm(tipo);
}

function renderMovimentacaoForm(tipo) {
    const container = document.getElementById('mov-form-container');
    const locals = STOCK_LOCALS;
    const origens = MOVIMENTACAO_ORIGINS;

    const getCommonFields = () => `
        <div class="input-group full-width">
            <label>Produto (EAN ou ID)</label>
            <input type="text" id="mov-search" class="input-field" placeholder="Bipe ou digite..." oninput="searchProductForMovInModal()">
            <div id="mov-search-results" style="margin-top: 8px; max-height: 120px; overflow-y: auto;"></div>
        </div>
        <div id="mov-selected-info" class="full-width" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; margin-bottom: 16px; border: 1px solid var(--primary); display: ${selectedProductForMov ? 'block' : 'none'};">
            <div style="font-weight: 700; color: white; font-size: 0.9rem;">${selectedProductForMov ? (selectedProductForMov.descricao_base || selectedProductForMov.nome || selectedProductForMov.col_b) : ''}</div>
            <div style="font-size: 0.7rem; color: var(--muted);">ID: ${selectedProductForMov ? (selectedProductForMov.id_interno || selectedProductForMov.col_a) : ''}</div>
        </div>
    `;

    const getOrigemField = () => `
        <div class="input-group">
            <label>Origem</label>
            <select id="mov-origem" class="input-field">
                ${origens.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
            </select>
        </div>
    `;

    const getDestinoField = () => `
        <div class="input-group">
            <label>Destino</label>
            <select id="mov-destino" class="input-field">
                ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
            </select>
        </div>
    `;

    const getLocalField = () => `
        <div class="input-group">
            <label>Local</label>
            <select id="mov-local" class="input-field">
                ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
            </select>
        </div>
    `;

    const getQuantidadeField = () => `
        <div class="input-group">
            <label>Quantidade</label>
            <input type="number" id="mov-qty" class="input-field" placeholder="0" min="1">
        </div>
    `;

    const getObservacaoField = () => `
        <div class="input-group full-width">
            <label>Observaﾃｧﾃ｣o</label>
            <input type="text" id="mov-obs" class="input-field" placeholder="Opcional">
        </div>
    `;

    const getAjusteTipoField = () => `
        <div class="input-group">
            <label>Tipo de Ajuste</label>
            <select id="mov-tipo-ajuste" class="input-field">
                <option value="positivo">Positivo (Entrada)</option>
                <option value="negativo">Negativo (Baixa)</option>
            </select>
        </div>
    `;

    const getMotivoField = () => `
        <div class="input-group full-width">
            <label>Motivo</label>
            <input type="text" id="mov-motivo" class="input-field" placeholder="Ex: Contagem inventﾃ｡rio, ajuste sistema...">
        </div>
    `;

    let fieldsHTML = '';
    let submitLabel = '';
    let submitFunc = '';

    switch(tipo) {
        case 'ENTRADA':
            fieldsHTML = getCommonFields() + getDestinoField() + getOrigemField() + getQuantidadeField() + getObservacaoField();
            submitLabel = 'Registrar Entrada';
            submitFunc = "saveNovaMovimentacao('ENTRADA')";
            break;
        case 'SAIDA':
            fieldsHTML = getCommonFields() + getLocalField() + getOrigemField() + getQuantidadeField() + getObservacaoField();
            submitLabel = 'Registrar Saﾃｭda';
            submitFunc = "saveNovaMovimentacao('SAIDA')";
            break;
        case 'TRANSFERENCIA':
            fieldsHTML = getCommonFields() + getLocalField().replace('id="mov-local"', 'id="mov-origem"') + getDestinoField() + getQuantidadeField() + getObservacaoField();
            submitLabel = 'Confirmar Transferﾃｪncia';
            submitFunc = "saveNovaMovimentacao('TRANSFERENCIA')";
            break;
        case 'AJUSTE':
            fieldsHTML = getCommonFields() + getLocalField() + getAjusteTipoField() + getQuantidadeField() + getMotivoField() + getObservacaoField();
            submitLabel = 'Registrar Ajuste';
            submitFunc = "saveNovaMovimentacao('AJUSTE')";
            break;
    }

    container.innerHTML = `
        <form onsubmit="event.preventDefault(); ${submitFunc}" style="display: flex; flex-direction: column; gap: 16px;">
            ${fieldsHTML}
            <div style="display: flex; gap: 12px; margin-top: 8px;">
                <button type="button" class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="closeNovaMovimentacaoModal()">Cancelar</button>
                <button type="submit" class="btn-action" style="flex: 2; justify-content: center;">${submitLabel}</button>
            </div>
        </form>
    `;
    console.log('[MOV] modal renderizado');
}


function searchProductForMovInModal() {
    const searchInput = document.getElementById('mov-search');
    const resultsDiv = document.getElementById('mov-search-results');

    if (!searchInput || !resultsDiv) return;

    const query = searchInput.value.toLowerCase();
    if (query.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    const results = (appData.products || []).filter(p =>
        (p.descricao_base || '').toLowerCase().includes(query) ||
        (p.ean || '').toString().toLowerCase().includes(query) ||
        (p.id_interno || '').toString().toLowerCase().includes(query)
    ).slice(0, 5);


    console.log(`[MOV] busca modal: "${query}" -> ${results.length} resultados`);

    resultsDiv.innerHTML = results.map(p => `
        <div style="padding: 10px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="selectProductForMovInModal('${p.ean || p.id_interno}')">
            <div style="font-weight: 700; font-size: 0.8rem; color: white;">${p.descricao_base || p.nome}</div>
            <div style="font-size: 0.65rem; color: var(--muted);">SKU: ${p.id_interno || p.id}</div>
        </div>
    `).join('');
}


function selectProductForMovInModal(id) {
    console.log('[MOV] produto selecionado - ID:', id);
    selectedProductForMov = (appData.products || []).find(p => p.ean == id || p.id_interno == id);
    console.log('[MOV] selectedProduct atual:', selectedProductForMov);
    
    if (!selectedProductForMov) return;

    document.getElementById('mov-search').value = selectedProductForMov.descricao_base || selectedProductForMov.nome || '';
    document.getElementById('mov-search-results').innerHTML = '';

    const infoDiv = document.getElementById('mov-selected-info');
    if (infoDiv) {
        infoDiv.style.display = 'block';
        infoDiv.innerHTML = `
            <div style="font-weight: 700; color: white; font-size: 0.9rem;">${selectedProductForMov.descricao_base || selectedProductForMov.nome}</div>
            <div style="font-size: 0.7rem; color: var(--muted);">ID: ${selectedProductForMov.id_interno || selectedProductForMov.id}</div>
        `;
    }
    
    console.log('[MOV] produto vinculado ao state');
}

async function saveNovaMovimentacao(tipo) {
    console.log('[MOV] salvar clicado - tipo:', tipo);
    
    if (isFinalizing) {
        console.log('[MOV] Bloqueado: isFinalizing=true');
        return;
    }
    isFinalizing = true;

    // ==========================================
    // PASSO 1: LOCALIZAR E VALIDAR O PRODUTO
    // ==========================================
    console.log('========== VALIDACAO DETALHADA ==========');
    
    // Primeiro: verificar se produtos estﾃ｣o carregados no appData
    const produtosDisponiveis = appData.products || [];
    console.log('[MOV] produtos carregados no appData:', produtosDisponiveis.length);
    
    // Segundo: tentar encontrar o produto no state
    const searchInput = document.getElementById('mov-search');
    const inputValue = searchInput?.value?.trim() || '';
    console.log('[MOV] valor do input produto:', inputValue);
    console.log('[MOV] selectedProductForMov do state:', selectedProductForMov);
    
    // Terceiro: se nﾃ｣o tem produto no state mas tem texto, buscar
    if (!selectedProductForMov && inputValue) {
        console.log('[MOV] trying to find product by text in appData...');
        
        // Buscar em appData.products
        const produtoEncontrado = produtosDisponiveis.find(p => {
            const idInterno = p.id_interno || p.col_a || '';
            const ean = p.ean || '';
            return idInterno.toString().trim() === inputValue || 
                   idInterno.toString().includes(inputValue) ||
                   ean.toString().trim() === inputValue;
        });
        
        if (produtoEncontrado) {
            selectedProductForMov = produtoEncontrado;
            console.log('[MOV] produto encontrado em appData.products:', selectedProductForMov.id_interno || selectedProductForMov.col_a);
        } else {
            // Se nﾃ｣o achou em appData, tentar DataClient
            console.log('[MOV] nﾃ｣o achou em appData, tentando DataClient...');
            try {
                const data = await DataClient.loadModule('produtos', false);
                if (data && data.products && data.products.length > 0) {
                    appData.products = data.products;
                    const produtoDataClient = data.products.find(p => {
                        const idInterno = p.id_interno || p.col_a || '';
                        return idInterno.toString().trim() === inputValue || 
                               idInterno.toString().includes(inputValue);
                    });
                    if (produtoDataClient) {
                        selectedProductForMov = produtoDataClient;
                        console.log('[MOV] produto encontrado via DataClient:', selectedProductForMov.id_interno || selectedProductForMov.col_a);
                    }
                }
            } catch (e) {
                console.log('[MOV] erro ao carregar produtos via DataClient:', e);
            }
        }
    }
    
    // Log final do produto
    console.log('[MOV] produto final para salvar:', selectedProductForMov ? (selectedProductForMov.id_interno || selectedProductForMov.col_a) : 'NULO');
    
    // ==========================================
    // PASSO 2: VALIDAR PRODUTO
    // ==========================================
    if (!selectedProductForMov) {
        console.log('[MOV] ERRO: produto NAO encontrado');
        console.log('[MOV] razao: selectedProductForMov ﾃｩ null');
        showToast("Produto nﾃ｣o encontrado. Selecione da lista ou digite ID correto.");
        isFinalizing = false;
        console.log('=========================================');
        return;
    }
    console.log('[MOV] produto OK:', selectedProductForMov.id_interno || selectedProductForMov.col_a);

    // ==========================================
    // PASSO 3: LOCALIZAR E VALIDAR QUANTIDADE
    // ==========================================
    const qtyInput = document.getElementById('mov-qty');
    const qtyRaw = qtyInput?.value;
    console.log('[MOV] elemento quantidade encontrado:', qtyInput ? 'SIM' : 'NAO');
    console.log('[MOV] valor bruto quantidade:', qtyRaw);
    
    if (!qtyInput) {
        console.log('[MOV] ERRO: campo quantidade NAO encontrado no DOM');
        showToast("Erro: campo de quantidade nﾃ｣o encontrado.");
        isFinalizing = false;
        console.log('=========================================');
        return;
    }

    const qty = parseFloat(qtyRaw);
    console.log('[MOV] quantidade parseada:', qty, 'isNaN:', isNaN(qty));

    if (isNaN(qty) || qty <= 0) {
        console.log('[MOV] ERRO: quantidade invalida');
        console.log('[MOV] razao: qty <= 0 ou isNaN');
        showToast("Quantidade invﾃ｡lida. Digite um nﾃｺmero maior que 0.");
        isFinalizing = false;
        console.log('=========================================');
        return;
    }
    console.log('[MOV] quantidade OK:', qty);
    
    console.log('========== FIM VALIDACAO OK ==========');

    // ==========================================
    // PASSO 4: MONTAR PAYLOAD
    // ==========================================
    const obsInput = document.getElementById('mov-obs');
    const origemInput = document.getElementById('mov-origem');
    const destinoInput = document.getElementById('mov-destino');
    const localInput = document.getElementById('mov-local');
    const tipoAjusteInput = document.getElementById('mov-tipo-ajuste');
    const motivoInput = document.getElementById('mov-motivo');

    let localOrigem = '';
    let localDestino = '';
    let origem = 'MANUAL';
    let observacao = obsInput?.value?.trim() || '';

    if (tipo === 'ENTRADA') {
        localDestino = destinoInput?.value || '';
        origem = origemInput?.value || 'MANUAL';
    } else if (tipo === 'SAIDA') {
        localOrigem = localInput?.value || '';
        origem = origemInput?.value || 'MANUAL';
    } else if (tipo === 'TRANSFERENCIA') {
        localOrigem = document.getElementById('mov-origem')?.value || '';
        localDestino = destinoInput?.value || '';
    } else if (tipo === 'AJUSTE') {
        localOrigem = localInput?.value || '';
        const ajusteTipo = tipoAjusteInput?.value || 'positivo';
        const motivo = motivoInput?.value?.trim() || '';
        observacao = motivo ? `Ajuste ${ajusteTipo}: ${motivo}` : `Ajuste ${ajusteTipo}`;
        if (obsInput?.value?.trim()) {
            observacao += ' - ' + obsInput.value.trim();
        }
    }

    const movData = {
        tipo: tipo,
        id_interno: selectedProductForMov.id_interno || selectedProductForMov.col_a,
        local_origem: localOrigem,
        local_destino: localDestino,
        quantidade: qty,
        usuario: localStorage.getItem('currentUser'),
        origem: origem,
        observacao: observacao
    };

    console.log('[MOV] payload enviado:', JSON.stringify(movData, null, 2));

    showToast("Processando...");

    try {
        console.log('[MOV] Tentando insert em movimentos...');
        const savedMov = await DataClient.saveMovimentoSupabase(movData);
        
        if (!savedMov) {
            console.log('[MOV] ERRO: insert movimentos retornou null');
            showToast("Erro ao gravar movimento.");
            isFinalizing = false;
            return;
        }
        
        console.log('[MOV] insert movimentos sucesso:', savedMov);

        let stockSuccess = false;
        const idInterno = movData.id_interno;

        console.log(`[MOV] Atualizando estoque: tipo=${tipo} localOrigem=${localOrigem} localDestino=${localDestino}`);
        
        if (tipo === 'ENTRADA') {
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_destino, 'soma', movData.quantidade);
        } else if (tipo === 'SAIDA') {
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, 'subtrai', movData.quantidade);
        } else if (tipo === 'TRANSFERENCIA') {
            const outOk = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, 'subtrai', movData.quantidade);
            const inOk = await DataClient.updateEstoqueSupabase(idInterno, movData.local_destino, 'soma', movData.quantidade);
            stockSuccess = outOk && inOk;
        } else if (tipo === 'AJUSTE') {
            const ajusteTipo = tipoAjusteInput?.value || 'positivo';
            const operacao = ajusteTipo === 'positivo' ? 'soma' : 'subtrai';
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, operacao, movData.quantidade);
        }

        console.log('[MOV] update estoque resultado:', stockSuccess);

        if (stockSuccess) {
            console.log('[MOV] fluxo concluﾃｭdo com sucesso');
            console.log('[MOV] resposta de sucesso');
            showToast("Movimentaﾃｧﾃ｣o registrada com sucesso!");
            
            if (!appData.movimentacoes) appData.movimentacoes = [];
            appData.movimentacoes.unshift({
                ...savedMov,
                data: new Date(savedMov.data_hora).toLocaleString('pt-BR')
            });

            DataClient.invalidateCache('produtos');
            
            console.log('[MOV] modal fechado apﾃｳs sucesso');
            closeNovaMovimentacaoModal();
            
            // Pequeno delay para garantir que toast apareﾃｧa antes de renderizar nova tela
            setTimeout(() => {
                renderMovimentacoes();
                console.log('[MOV] mensagem exibida - tela atualizada');
            }, 300);
        } else {
            console.log('[MOV] ERRO: movimento salvo mas estoque nﾃ｣o atualizado');
            console.log('[MOV] resposta de erro');
            showToast("Erro: Movimento salvo, mas estoque nﾃ｣o atualizado.");
            console.log('[MOV] mensagem exibida');
        }
    } catch (e) {
        console.error('[MOV] ERRO fatal:', e);
        showToast("Erro fatal no processamento: " + e.message);
    } finally {
        isFinalizing = false;
    }
}

function renderTransferenciaForm() {
    const currentUser = localStorage.getItem('currentUser');
    const locals = ['TERREO', '1ﾂｺANDAR', 'MOSTRUARIO', 'DEFEITO'];

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">TRANSFERﾃ劾CIA</h2>
                        </div>
                        <div class="form-grid" style="background: var(--surface); padding: 24px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <div class="input-group full-width">
                                <label>Produto (EAN ou ID)</label>
                                <div style="display: flex; gap: 12px;">
                                    <input type="text" id="mov-search" class="input-field" style="flex: 1;" placeholder="Bipe ou digite..." oninput="searchProductForMov()">
                                </div>
                                <div id="mov-search-results" style="margin-top: 8px; max-height: 150px; overflow-y: auto;"></div>
                            </div>
                            <div id="mov-selected-info" class="hidden full-width" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; margin-bottom: 16px; border: 1px solid var(--primary);"></div>
                            
                            <div class="input-group">
                                <label>Origem</label>
                                <select id="mov-origem" class="input-field">
                                    ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
                                </select>
                            </div>
                            <div class="input-group">
                                <label>Destino</label>
                                <select id="mov-destino" class="input-field">
                                    ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
                                </select>
                            </div>
                            <div class="input-group">
                                <label>Quantidade</label>
                                <input type="number" id="mov-qty" class="input-field" placeholder="0">
                            </div>
                            <div class="input-group">
                                <label>Observaﾃｧﾃ｣o</label>
                                <input type="text" id="mov-obs" class="input-field" placeholder="Opcional">
                            </div>
                            
                            <div style="display: flex; gap: 16px; margin-top: 24px; width: 100%;">
                                <button class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="renderMovimentacoesSubMenu()">Cancelar</button>
                                <button class="btn-action" style="flex: 2; justify-content: center;" onclick="saveMovimentacao('TRANSFERﾃ劾CIA')">Confirmar</button>
                            </div>
                        </div>
                    </main>
                </div>
            `;
}

function renderDefeitoForm() {

    const currentUser = localStorage.getItem('currentUser');
    const locals = ['TERREO', '1_ANDAR', 'MOSTRUARIO', 'DEFEITO'];

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">DEFEITO / AVARIA</h2>
                        </div>
                        <div class="form-grid" style="background: var(--surface); padding: 24px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
                            <div class="input-group full-width">
                                <label>Produto (EAN ou ID)</label>
                                <div style="display: flex; gap: 12px;">
                                    <input type="text" id="mov-search" class="input-field" style="flex: 1;" placeholder="Bipe ou digite..." oninput="searchProductForMov()">
                                </div>
                                <div id="mov-search-results" style="margin-top: 8px; max-height: 150px; overflow-y: auto;"></div>
                            </div>
                            <div id="mov-selected-info" class="hidden full-width" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; margin-bottom: 16px; border: 1px solid var(--danger);"></div>
                            
                            <div class="input-group">
                                <label>Local de Origem</label>
                                <select id="mov-origem" class="input-field">
                                    ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
                                </select>
                                <input type="hidden" id="mov-destino" value="DEFEITO">
                            </div>
                            <div class="input-group">
                                <label>Quantidade</label>
                                <input type="number" id="mov-qty" class="input-field" placeholder="0">
                            </div>
                            <div class="input-group full-width">
                                <label>Motivo / Observaﾃｧﾃ｣o</label>
                                <input type="text" id="mov-obs" class="input-field" placeholder="Descreva o defeito...">
                            </div>
                            
                            <div style="display: flex; gap: 16px; margin-top: 24px; width: 100%;">
                                <button class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="renderMovimentacoesSubMenu()">Cancelar</button>
                                <button class="btn-action" style="flex: 2; justify-content: center; background: var(--danger) !important;" onclick="saveMovimentacao('ENVIO_DEFEITO')">Registrar Defeito</button>
                            </div>
                        </div>
                    </main>
                </div>
            `;
}


// Funﾃｧﾃ｣o searchProductForMov

function searchProductForMov() {
    const searchInput = document.getElementById('mov-search');
    const resultsDiv = document.getElementById('mov-search-results');

    if (!searchInput || !resultsDiv) return;

    const query = searchInput.value.trim().toLowerCase();
    if (query.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    const results = appData.products.filter(p =>
        (p.descricao_base || '').toLowerCase().includes(query) ||
        (p.ean || '').toString().includes(query) ||
        (p.id_interno || '').toString().includes(query)
    ).slice(0, 5);

    resultsDiv.innerHTML = results.map(p => `
                <div style="padding: 10px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="selectProductForMov('${p.ean || p.id_interno}')">
                    <div style="font-weight: 700; font-size: 0.8rem; color: white;">${p.descricao_base || p.nome}</div>
                    <div style="font-size: 0.65rem; color: var(--muted);">SKU: ${p.id_interno || p.id}</div>
                </div>
            `).join('');
}

function selectProductForMov(id) {
    selectedProductForMov = appData.products.find(p => p.ean == id || p.id_interno == id);
    if (!selectedProductForMov) return;

    const infoDiv = document.getElementById('mov-selected-info');
    const resultsDiv = document.getElementById('mov-search-results');
    const searchInput = document.getElementById('mov-search');

    if (infoDiv) {
        infoDiv.classList.remove('hidden');
        infoDiv.innerHTML = `
                    <div style="font-weight: 800; color: white; font-size: 0.85rem;">${selectedProductForMov.descricao_base || selectedProductForMov.nome}</div>
                    <div style="font-size: 0.65rem; color: var(--muted);">ID: ${selectedProductForMov.id_interno || selectedProductForMov.id}</div>
                `;
    }

    if (resultsDiv) resultsDiv.innerHTML = '';
    if (searchInput) searchInput.value = selectedProductForMov.descricao_base || selectedProductForMov.nome || selectedProductForMov.col_b;
}

async function saveMovimentacao(tipo) {
    if (isFinalizing) return;
    isFinalizing = true;

    const qtyInput = document.getElementById('mov-qty');
    const obsInput = document.getElementById('mov-obs');
    const origemInput = document.getElementById('mov-origem');
    const destinoInput = document.getElementById('mov-destino');

    if (!qtyInput || !origemInput) {
        showToast("Erro: Campos de movimentaﾃｧﾃ｣o nﾃ｣o encontrados.");
        return;
    }

    const qty = parseFloat(qtyInput.value);
    const obs = obsInput ? obsInput.value.trim() : "";
    const localOrigem = origemInput.value;
    const localDestino = destinoInput?.value || '';

    if (!selectedProductForMov || isNaN(qty) || qty <= 0) {
        showToast("Selecione o produto e a quantidade.");
        return;
    }

    const movData = {
        tipo: tipo === 'TRANSFERﾃ劾CIA' ? 'TRANSFERENCIA' : tipo,
        id_interno: selectedProductForMov.id_interno || selectedProductForMov.col_a,
        local_origem: localOrigem,
        local_destino: localDestino,
        quantidade: qty,
        usuario: localStorage.getItem('currentUser'),
        origem: 'APP_MOBILE',
        observacao: obs
    };

    showToast("Processando no Supabase...");

    try {
        // 1. Gravar registro de movimento
        const savedMov = await DataClient.saveMovimentoSupabase(movData);
        if (!savedMov) {
            showToast("Erro ao gravar movimento no Supabase.");
            isFinalizing = false;
            return;
        }

        console.log("[Supabase] Movimento id: " + savedMov.movimento_id + " gravado.");

        // 2. Atualizar estoque de forma atﾃｴmica conforme o tipo
        let stockSuccess = false;
        const idInterno = movData.id_interno;

        if (movData.tipo === 'ENTRADA') {
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_destino, 'soma', movData.quantidade);
        } else if (movData.tipo === 'SAﾃ好A' || movData.tipo === 'SAIDA') {
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, 'subtrai', movData.quantidade);
        } else if (movData.tipo === 'AJUSTE') {
            stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, 'ajuste', movData.quantidade);
        } else if (movData.tipo === 'TRANSFERENCIA') {
            const outOk = await DataClient.updateEstoqueSupabase(idInterno, movData.local_origem, 'subtrai', movData.quantidade);
            const inOk = await DataClient.updateEstoqueSupabase(idInterno, movData.local_destino, 'soma', movData.quantidade);
            stockSuccess = outOk && inOk;
        }

        if (stockSuccess) {
            showToast("Movimento e estoque atualizados!");
            
            // Atualizaﾃｧﾃ｣o local para o histﾃｳrico de tela
            if (!appData.movimentacoes) appData.movimentacoes = [];
            appData.movimentacoes.unshift({
                ...savedMov,
                data: new Date(savedMov.data_hora).toLocaleString('pt-BR')
            });

            // Forﾃｧar invalidaﾃｧﾃ｣o do cache de produtos/estoque para refletir na tela
            DataClient.invalidateCache('inventory'); 
            
            setTimeout(() => renderMovimentacoesSubMenu(), 1500);
        } else {
            console.error("[Supabase] Falha Crﾃｭtica: Movimento gravado, mas estoque Nﾃグ atualizado.");
            showToast("Erro: Movimento gravado, mas o saldo nﾃ｣o pﾃｴde ser atualizado.");
        }
    } catch (e) {
        console.error("[Supabase] Erro inesperado:", e);
        showToast("Erro fatal no processamento.");
    } finally {
        isFinalizing = false;
    }
}

async function renderMovimentacoesHistory() {
    const currentUser = localStorage.getItem('currentUser');
    
    // UI de Carregamento (Sem tﾃｭtulo redundante)
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in">
            ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
            <main class="container">
                <div id="movimentacoes-list-container" style="text-align: center; padding: 40px; color: var(--muted);">
                    <div class="loading-spinner" style="margin: 20px auto;"></div>
                    <p style="margin-top: 15px;">Buscando movimentos...</p>
                </div>
            </main>
        </div>
    `;

    try {
        console.log('[MOVIMENTOS DEBUG] iniciando busca de movimentos...');
        const history = await DataClient.fetchMovimentosSupabase();
        
        // Logs de diagnﾃｳstico (history ﾃｩ o 'data' retornado pelo client)
        console.log('[MOVIMENTOS DEBUG] movimentos carregados:', history?.length || 0);

        const listContainer = document.getElementById('movimentacoes-list-container');
        if (listContainer) {
            if (!history || history.length === 0) {
                console.log('[MOVIMENTOS DEBUG] Nenhuma movimentaﾃｧﾃ｣o encontrada no banco.');
                listContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--muted);">Nenhum movimento encontrado</div>`;
            } else {
                listContainer.innerHTML = renderMovimentacoesList(history);
                listContainer.style.textAlign = 'left';
                listContainer.style.padding = '0';
            }
        }
    } catch (err) {
        // Logar erro real com [MOVIMENTOS DEBUG]
        console.error('[MOVIMENTOS DEBUG] erro crﾃｭtico ao processar movimentos:', err);
        
        const listContainer = document.getElementById('movimentacoes-list-container');
        if (listContainer) {
            // Se vazio ou erro, mostrar "Nenhum movimento encontrado" e nﾃ｣o o erro tﾃｩcnico
            listContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--muted);">Nenhum movimento encontrado</div>`;
        }
    }
}

/* ===================================================
   TELA DE TRANSFERﾃ劾CIA DE ESTOQUE (MODO CIRﾃ啌GICO)
   =================================================== */

function normalizeLocal(local) {
    if (!local) return "";
    let norm = local
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, '_')
        .replace('1ﾂｺ_ANDAR', 'PRIMEIRO_ANDAR')
        .replace('1ﾂｺ_ANDAR', 'PRIMEIRO_ANDAR')
        .replace('1_ANDAR', 'PRIMEIRO_ANDAR');
    // Normalizar variaﾃｧﾃｵes de FULL ML
    if (norm === 'FULL_ML' || norm === 'FULLML' || norm === 'FULL_M_L') return 'FULL_ML';
    return norm;
}

function prettyLocal(local) {
    const norm = normalizeLocal(local);
    const map = {
        'TERREO': 'Tﾃ嘘REO',
        'MOSTRUARIO': 'MOSTRUﾃヽIO',
        'PRIMEIRO_ANDAR': '1ﾂｺ ANDAR',
        'DEFEITO': 'DEFEITO',
        'EM_GARANTIA': 'EM GARANTIA',
        'EM_TRANSPORTE': 'EM TRANSPORTE',
        'FULL_ML': 'FULL ML'
    };
    return map[norm] || norm;
}

async function renderTransferenciaScreen() {
    const currentUser = localStorage.getItem('currentUser');
    if (!appData.transferItems) appData.transferItems = [];

    // TAREFA 1 & 2: Garantir produtos carregados (Sempre aguardar para garantir)
    console.log('[INV-DIAG] Garantindo produtos carregados na Transferﾃｪncia...');
    
    const needsLoadingUI = !appData.products || appData.products.length === 0;
    
    if (needsLoadingUI) {
        app.innerHTML = `
            <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; text-align: center;">
                <div class="material-symbols-rounded" style="font-size: 3rem; margin-bottom: 20px; animation: pulse 1.5s infinite;">inventory_2</div>
                <div style="font-weight: 800; font-size: 1.2rem;">Sincronizando Produtos...</div>
                <div style="color: #777; font-size: 0.9rem; margin-top: 8px;">Aguarde um instante.</div>
            </div>
        `;
    }
    
    await ensureProdutosLoaded(true); // TAREFA 1: Garantir carregamento real

    const locals = ['Tﾃ嘘REO', 'MOSTRUﾃヽIO', '1ﾂｺ ANDAR', 'DEFEITO', 'EM GARANTIA', 'EM TRANSPORTE', 'FULL ML'];

    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
            <div class="transfer-screen" style="padding: 20px; color: white; max-width: 600px; margin: 0 auto;">
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                    <div>
                        <label style="font-size: 0.7rem; color: #777; text-transform: uppercase; display: block; margin-bottom: 4px;">Origem</label>
                        <select id="trans-origem" class="input-field" style="width: 100%; height: 50px; font-weight: 700;" onchange="validateTransferLocals()">
                            <option value="">Selecione...</option>
                            ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 0.7rem; color: #777; text-transform: uppercase; display: block; margin-bottom: 4px;">Destino</label>
                        <select id="trans-destino" class="input-field" style="width: 100%; height: 50px; font-weight: 700;" onchange="validateTransferLocals()">
                            <option value="">Selecione...</option>
                            ${locals.map(l => `<option value="${l}">${l}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <input type="text" id="trans-ean-input" placeholder="Bipar EAN ou Codigo..." style="width: 100%; padding: 20px; border-radius: 16px; border: 2px solid #333; background: #111; color: white; font-size: 1.2rem; text-align: center;" onkeypress="if(event.key === 'Enter') addTransferItem()">
                </div>
                
                <div id="transfer-items-list" style="height: calc(100vh - 420px); overflow-y: auto; padding-bottom: 100px;">
                    <!-- Preenchido via updateTransferenciaListUI -->
                </div>

                <div style="position: fixed; bottom: 0; left: 0; width: 100%; padding: 20px; background: #232323; border-top: 1px solid #333; z-index: 100;">
                    <div style="max-width: 600px; margin: 0 auto;">
                        <button id="btn-confirm-transfer" onclick="confirmTransferencia()" style="width: 100%; padding: 20px; border-radius: 16px; background: #4ade80; color: #111; font-weight: 800; font-size: 1.1rem; border: none; cursor: pointer;">CONFIRMAR TRANSFERﾃ劾CIA</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    updateTransferenciaListUI();
    setTimeout(() => document.getElementById('trans-ean-input')?.focus(), 500);
}

function validateTransferLocals() {
    const origem = document.getElementById('trans-origem')?.value;
    const destino = document.getElementById('trans-destino')?.value;
    
    if (origem && destino && origem === destino) {
        showToast("Origem e destino devem ser diferentes!", "warning");
        return false;
    }
    return true;
}

async function addTransferItem() {
    const eanInput = document.getElementById('trans-ean-input');
    const origemInput = document.getElementById('trans-origem');
    const ean = eanInput?.value?.trim();
    const origem = origemInput?.value;

    if (!origem) {
        showToast("Selecione o local de origem primeiro!");
        return;
    }

    if (!ean) return;

    // LOG: Termo digitado
    console.log('[INV-DIAG] termo digitado:', ean);

    // TAREFA 3: Se appData.products estiver vazio, tentar carregar
    if (!appData.products || appData.products.length === 0) {
        console.log('[INV-DIAG] products vazio no bip, recarregando...');
        await ensureProdutosLoaded(true);
    }

    // TAREFA A: Buscar primeiro em appData.products
    let product = appData.products.find(p => p.ean == ean || p.id_interno == ean);
    
    // TAREFA 3: Se nﾃ｣o encontrar e cache estiver suspeito, tentar carregar uma vez
    if (!product) {
        console.log('[INV-DIAG] produto nﾃ｣o no cache, tentando recarga forﾃｧada...');
        await ensureProdutosLoaded(true);
        product = appData.products.find(p => p.ean == ean || p.id_interno == ean);
    }

    // LOG: Produto encontrado
    console.log('[INV-DIAG] produto encontrado:', product);

    if (!product) {
        showToast("Produto nﾃ｣o encontrado!", "error");
        eanInput.value = '';
        return;
    }

    const idInterno = product.id_interno;
    const origemNorm = normalizeLocal(origem);

    // TAREFA B: Validar estoque_atual
    const { data: stockData, error } = await window.supabaseClient
        .from('estoque_atual')
        .select('saldo_disponivel')
        .eq('id_interno', idInterno)
        .eq('local', origemNorm)
        .maybeSingle();

    if (error) {
        showToast("Erro ao validar estoque.");
        return;
    }

    if (!stockData) {
        showToast("Produto sem estoque no local de origem", "error");
        eanInput.value = '';
        return;
    }

    const existing = appData.transferItems.find(i => i.id_interno === idInterno);

    // LOGS OBRIGATﾃ迭IOS
    console.log('[TRANSF-DIAG] produto id_interno:', idInterno);
    console.log('[TRANSF-DIAG] origem selecionada:', origem);
    console.log('[TRANSF-DIAG] origem normalizada:', origemNorm);
    console.log('[TRANSF-DIAG] estoque origem encontrado:', stockData);
    
    const available = Number(stockData.saldo_disponivel || 0);
    const requested = Number((existing ? existing.quantidade : 0) + 1);

    console.log('[TRANSF-DIAG] saldo_disponivel origem:', available);
    console.log('[TRANSF-DIAG] quantidade solicitada:', requested);

    if (available < requested) {
        showToast("Estoque insuficiente no local de origem", "error");
        eanInput.value = '';
        return;
    }

    if (existing) {
        existing.quantidade += 1;
    } else {
        appData.transferItems.unshift({
            id_interno: idInterno,
            descricao: product.descricao_base || product.nome,
            quantidade: 1
        });
    }

    eanInput.value = '';
    eanInput.focus();
    updateTransferenciaListUI();
}

function updateTransferenciaListUI() {
    const list = document.getElementById('transfer-items-list');
    if (!list) return;

    if (!appData.transferItems || appData.transferItems.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: #555; padding: 40px 20px;">
                <span class="material-symbols-rounded" style="font-size: 48px; display: block; margin-bottom: 12px; opacity: 0.2;">swap_horiz</span>
                <div style="font-weight: 700;">Nenhum item na lista</div>
                <div style="font-size: 0.8rem; margin-top: 4px;">Bipe produtos para transferir</div>
            </div>
        `;
        return;
    }

    list.innerHTML = appData.transferItems.map((item, index) => `
        <div class="transfer-item" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px;">
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 700; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.descricao}</div>
                <div style="font-size: 0.7rem; color: #777;">ID: ${item.id_interno}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; background: #111; padding: 4px; border-radius: 8px; border: 1px solid #333;">
                <button onclick="adjustTransferItemQty(${index}, -1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #222; color: white; font-weight: 800; cursor: pointer;">-</button>
                <span style="min-width: 24px; text-align: center; font-weight: 800; color: #4ade80;">${item.quantidade}</span>
                <button onclick="adjustTransferItemQty(${index}, 1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #222; color: white; font-weight: 800; cursor: pointer;">+</button>
            </div>
            <button onclick="removeTransferItem(${index})" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: none; width: 36px; height: 36px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                <span class="material-symbols-rounded" style="font-size: 18px;">delete</span>
            </button>
        </div>
    `).join('');
}

async function adjustTransferItemQty(index, delta) {
    const item = appData.transferItems[index];
    const origem = document.getElementById('trans-origem')?.value;

    if (delta > 0) {
        const origemNorm = normalizeLocal(origem);
        const { data: stockData, error } = await window.supabaseClient
            .from('estoque_atual')
            .select('saldo_disponivel')
            .eq('id_interno', item.id_interno)
            .eq('local', origemNorm)
            .maybeSingle();

        const available = Number(stockData ? stockData.saldo_disponivel : 0);
        const requested = Number(item.quantidade + delta);

        console.log('[TRANSF-DIAG] produto id_interno:', item.id_interno);
        console.log('[TRANSF-DIAG] origem selecionada:', origem);
        console.log('[TRANSF-DIAG] origem normalizada:', origemNorm);
        console.log('[TRANSF-DIAG] estoque origem encontrado:', stockData);
        console.log('[TRANSF-DIAG] saldo_disponivel origem:', available);
        console.log('[TRANSF-DIAG] quantidade solicitada:', requested);

        if (available < requested) {
            showToast("Estoque insuficiente no local de origem", "error");
            return;
        }
    }

    item.quantidade += delta;
    if (item.quantidade <= 0) {
        appData.transferItems.splice(index, 1);
    }
    updateTransferenciaListUI();
}

function removeTransferItem(index) {
    appData.transferItems.splice(index, 1);
    updateTransferenciaListUI();
}

async function confirmTransferencia() {
    const origem = document.getElementById('trans-origem')?.value;
    const destino = document.getElementById('trans-destino')?.value;
    const items = appData.transferItems;

    if (!origem || !destino || items.length === 0) {
        showToast("Verifique origem, destino e itens.", "warning");
        return;
    }
    if (origem === destino) {
        showToast("Origem e destino devem ser diferentes!", "warning");
        return;
    }

    const confirmBtn = document.getElementById('btn-confirm-transfer');
    confirmBtn.disabled = true;
    confirmBtn.innerText = "PROCESSANDO...";
    
    showToast("Iniciando transferﾃｪncia...");
    const client = window.supabaseClient;

    try {
        const origemNorm = normalizeLocal(origem);
        const destinoNorm = normalizeLocal(destino);

        for (const item of items) {
            console.log('[TRANSF-DIAG] item confirmando:', item);
            console.log('[TRANSF-DIAG] origem:', origemNorm);
            console.log('[TRANSF-DIAG] destino:', destinoNorm);
            console.log('[TRANSF-DIAG] quantidade:', item.quantidade);

            const qty = Number(item.quantidade);

            // 1. BUSCAR ESTOQUE DA ORIGEM
            const { data: estoqueOrigem, error: fetchOrigemErr } = await client
                .from('estoque_atual')
                .select('*')
                .eq('id_interno', item.id_interno)
                .eq('local', origemNorm)
                .maybeSingle();

            if (fetchOrigemErr) {
                console.error('[TRANSF-DIAG] erro busca origem:', fetchOrigemErr);
                throw new Error("Erro ao buscar origem: " + fetchOrigemErr.message);
            }
            
            const saldoOrigemAntes = Number(estoqueOrigem?.saldo_disponivel || 0);

            console.log('[TRANSF-DIAG] estoque origem encontrado:', estoqueOrigem);
            console.log('[TRANSF-DIAG] saldo_disponivel origem:', saldoOrigemAntes);
            console.log('[TRANSF-DIAG] quantidade solicitada:', qty);

            // 2. VERIFICAR SALDO SUFICIENTE
            if (!estoqueOrigem || saldoOrigemAntes < qty) {
                throw new Error(`Estoque insuficiente no local de origem para o produto ${item.id_interno}. Saldo atual: ${saldoOrigemAntes}`);
            }

            // 3. BUSCAR/VALIDAR DESTINO
            const { data: currentDestino, error: fetchDestinoErr } = await client
                .from('estoque_atual')
                .select('*')
                .eq('id_interno', item.id_interno)
                .eq('local', destinoNorm)
                .maybeSingle();

            if (fetchDestinoErr) {
                console.error('[TRANSF-DIAG] erro busca destino:', fetchDestinoErr);
                throw new Error("Erro ao validar destino: " + fetchDestinoErr.message);
            }

            // 4. MONTAR PAYLOAD DO MOVIMENTO
            const movPayload = {
                movimento_id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                tipo: 'TRANSFERENCIA',
                id_interno: item.id_interno,
                quantidade: item.quantidade,
                local_origem: origemNorm,
                local_destino: destinoNorm,
                data_hora: new Date().toISOString(),
                origem: 'APP_TRANSFERENCIA',
                observacao: 'Transferﾃｪncia manual',
                usuario: localStorage.getItem('currentUser')
            };

            console.log('[TRANSF-DIAG] validaﾃｧﾃ｣o ok:', item.id_interno);

            // 5. EXECUTAR UPDATES/INSERTS
            
            // ATUALIZA ORIGEM
            const novoSaldoOrigem = saldoOrigemAntes - qty;
            const novoSaldoTotalOrigem = novoSaldoOrigem + parseFloat(estoqueOrigem.saldo_reservado || 0) + parseFloat(estoqueOrigem.saldo_em_transito || 0);

            const payloadOrigem = { 
                saldo_disponivel: novoSaldoOrigem,
                saldo_total: novoSaldoTotalOrigem,
                atualizado_em: new Date().toISOString()
            };
            console.log('[TRANSF-DIAG] origem update payload:', payloadOrigem);

            const { data: resultOrigem, error: updateOrigemErr } = await client
                .from('estoque_atual')
                .update(payloadOrigem)
                .eq('id_interno', item.id_interno)
                .eq('local', origemNorm)
                .select();

            if (updateOrigemErr) {
                console.error('[TRANSF-DIAG] origem update error:', updateOrigemErr);
                throw new Error("Erro ao debitar origem: " + updateOrigemErr.message);
            }
            console.log('[TRANSF-DIAG] origem update result:', resultOrigem);

            // ATUALIZA DESTINO
            let resultDestino;
            if (currentDestino) {
                const novoSaldoDestino = parseFloat(currentDestino.saldo_disponivel || 0) + item.quantidade;
                const novoSaldoTotalDestino = novoSaldoDestino + parseFloat(currentDestino.saldo_reservado || 0) + parseFloat(currentDestino.saldo_em_transito || 0);

                const payloadDestino = { 
                    saldo_disponivel: novoSaldoDestino,
                    saldo_total: novoSaldoTotalDestino,
                    atualizado_em: new Date().toISOString()
                };
                console.log('[TRANSF-DIAG] destino payload (update):', payloadDestino);

                const { data, error } = await client
                    .from('estoque_atual')
                    .update(payloadDestino)
                    .eq('id_interno', item.id_interno)
                    .eq('local', destinoNorm)
                    .select();
                
                if (error) {
                    console.error('[TRANSF-DIAG] destino error (update):', error);
                    throw new Error("Erro ao creditar destino (update): " + error.message);
                }
                resultDestino = data;
            } else {
                const payloadDestino = {
                    id_interno: item.id_interno,
                    local: destinoNorm,
                    saldo_disponivel: item.quantidade,
                    saldo_reservado: 0,
                    saldo_em_transito: 0,
                    saldo_total: item.quantidade,
                    atualizado_em: new Date().toISOString()
                };
                console.log('[TRANSF-DIAG] destino payload (insert):', payloadDestino);

                const { data, error } = await client
                    .from('estoque_atual')
                    .insert([payloadDestino])
                    .select();
                
                if (error) {
                    console.error('[TRANSF-DIAG] destino error (insert):', error);
                    throw new Error("Erro ao creditar destino (insert): " + error.message);
                }
                resultDestino = data;
            }
            console.log('[TRANSF-DIAG] destino result:', resultDestino);

            // CRIA MOVIMENTO
            console.log('[TRANSF-DIAG] movimento payload:', movPayload);
            const { data: resultMov, error: movErr } = await client
                .from('movimentos')
                .insert([movPayload])
                .select();

            if (movErr) {
                console.error('[TRANSF-DIAG] movimento error:', movErr);
                throw new Error("Erro ao criar movimento: " + movErr.message);
            }
            console.log('[TRANSF-DIAG] movimento result:', resultMov);
        }

        showToast("Transferﾃｪncia realizada com sucesso!");
        appData.transferItems = [];
        renderTransferenciaScreen();

    } catch (err) {
        console.error('[TRANSF-DIAG] Erro fatal na transferﾃｪncia:', err);
        showToast("ERRO: " + (err.message || "Falha no servidor"), "error");
        
        alert("FALHA NA TRANSFERﾃ劾CIA: \n" + err.message + "\n\nSe houve uma falha parcial, o estoque pode estar inconsistente. \nPor favor, confira o estoque_atual manualmente no local de origem e destino.");
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerText = "CONFIRMAR TRANSFERﾃ劾CIA";
    }
}


/* ===================================================
   Lﾃ敵ICA DE INVENTﾃヽIO (SESSﾃグ E SCANNING)
   =================================================== */

let isStartingInventory = false;

async function startInventarioInicial() {
    renderInventorySetup('inicial');
}

async function startInventarioGeral() {
    renderInventorySetup('geral');
}

function renderInventarioParcialForm() {
    renderInventorySetup('parcial');
}

// ==== AJUSTE DE ESTOQUE (Mﾃｳdulo Movimentaﾃｧﾃｵes) ====
// Correﾃｧﾃ｣o manual de saldo por produto e local.
// Nﾃグ cria inventﾃ｡rio. Gera movimento tipo 'ajuste_estoque' e atualiza estoque_atual.
let ajusteSelectedProduct = null;

function renderAjusteEstoqueScreen() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return renderLogin();

    currentScreen = 'ajuste_estoque';
    ensureProdutosLoaded();

    ajusteSelectedProduct = null;

    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #101018; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')}
            <main class="container" style="max-width: 560px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 32px;">
                    <div style="background: rgba(59,130,246,0.12); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                        <span class="material-symbols-rounded" style="font-size: 40px; color: #3B82F6;">tune</span>
                    </div>
                    <h2 style="color: #ffffff; font-size: 1.3rem; font-weight: 800; margin-bottom: 4px;">Ajuste de Estoque</h2>
                    <p style="color: var(--muted); font-size: 0.85rem;">Correﾃｧﾃ｣o manual de saldo por produto e local</p>
                </div>

                <form id="ajuste-form" onsubmit="event.preventDefault(); saveAjusteEstoque()" style="display: flex; flex-direction: column; gap: 20px;">

                    <!-- 1. Buscar Produto -->
                    <div class="input-group full-width">
                        <label style="color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 8px; display: block;">Produto</label>
                        <input type="text" id="ajuste-search" class="op-input" placeholder="Buscar por nome, EAN ou ID..." oninput="searchProductForAjuste()" autocomplete="off">
                        <div id="ajuste-search-results" style="margin-top: 4px; max-height: 160px; overflow-y: auto; border-radius: 12px;"></div>
                        <div id="ajuste-selected-info" style="display: none; background: rgba(59,130,246,0.08); padding: 14px; border-radius: 14px; margin-top: 8px; border: 1px solid rgba(59,130,246,0.3);">
                            <div id="ajuste-selected-name" style="font-weight: 700; color: #ffffff; font-size: 0.9rem;"></div>
                            <div id="ajuste-selected-id" style="font-size: 0.7rem; color: var(--muted); margin-top: 2px;"></div>
                            <div id="ajuste-selected-stock" style="font-size: 0.7rem; color: #4ade80; margin-top: 6px; font-weight: 600;"></div>
                        </div>
                    </div>

                    <!-- 2. Local do Estoque -->
                    <div class="input-group">
                        <label style="color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 8px; display: block;">Local do Estoque</label>
                        <select id="ajuste-local" class="op-input" onchange="updateAjusteStockInfo()">
                            <option value="Tﾃ嘘REO">Tﾃ嘘REO</option>
                            <option value="MOSTRUﾃヽIO">MOSTRUﾃヽIO</option>
                            <option value="1ﾂｺ ANDAR">1ﾂｺ ANDAR</option>
                            <option value="DEFEITO">DEFEITO</option>
                            <option value="EM_GARANTIA">EM GARANTIA</option>
                            <option value="EM_TRANSPORTE">EM TRANSPORTE</option>
                        </select>
                    </div>

                    <!-- 3. Tipo de Ajuste -->
                    <div class="input-group">
                        <label style="color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 8px; display: block;">Tipo de Ajuste</label>
                        <select id="ajuste-tipo" class="op-input">
                            <option value="definir">Definir quantidade correta</option>
                            <option value="somar">Somar quantidade</option>
                            <option value="subtrair">Subtrair quantidade</option>
                        </select>
                    </div>

                    <!-- 4. Quantidade -->
                    <div class="input-group">
                        <label style="color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 8px; display: block;">Quantidade</label>
                        <input type="number" id="ajuste-qty" class="op-input" placeholder="0" min="0" step="1">
                    </div>

                    <!-- 5. Motivo -->
                    <div class="input-group">
                        <label style="color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 8px; display: block;">Motivo</label>
                        <select id="ajuste-motivo" class="op-input">
                            <option value="correcao_contagem">Correﾃｧﾃ｣o de contagem</option>
                            <option value="avaria">Avaria</option>
                            <option value="perda">Perda</option>
                            <option value="devolucao">Devoluﾃｧﾃ｣o</option>
                            <option value="garantia">Garantia</option>
                            <option value="erro_lancamento">Erro de lanﾃｧamento</option>
                            <option value="outro">Outro</option>
                        </select>
                    </div>

                    <!-- 6. Observaﾃｧﾃ｣o -->
                    <div class="input-group full-width">
                        <label style="color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 8px; display: block;">Observaﾃｧﾃ｣o</label>
                        <input type="text" id="ajuste-obs" class="op-input" placeholder="Opcional" autocomplete="off">
                    </div>

                    <!-- Botﾃｵes -->
                    <div style="display: flex; gap: 12px; margin-top: 12px;">
                        <button type="button" class="btn-action btn-secondary" style="flex: 1; justify-content: center; border-radius: 14px; padding: 16px;" onclick="renderMovimentacoesSubMenu()">Cancelar</button>
                        <button type="submit" class="btn-action" style="flex: 2; justify-content: center; border-radius: 14px; padding: 16px; background: #3B82F6; font-weight: 800;">Salvar Ajuste</button>
                    </div>
                </form>
            </main>
        </div>
    `;
}

function searchProductForAjuste() {
    const searchInput = document.getElementById('ajuste-search');
    const resultsDiv = document.getElementById('ajuste-search-results');
    if (!searchInput || !resultsDiv) return;

    const query = searchInput.value.toLowerCase().trim();
    if (query.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    const results = (appData.products || []).filter(p =>
        (p.descricao_base || '').toLowerCase().includes(query) ||
        (p.descricao_completa || '').toLowerCase().includes(query) ||
        (p.ean || '').toString().toLowerCase().includes(query) ||
        (p.id_interno || '').toString().toLowerCase().includes(query)
    ).slice(0, 6);

    resultsDiv.innerHTML = results.map(p => `
        <div style="padding: 12px 14px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.06); cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='rgba(59,130,246,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'" onclick="selectProductForAjuste('${(p.id_interno || p.ean || '').replace(/'/g, '')}')">
            <div style="font-weight: 700; font-size: 0.82rem; color: #ffffff;">${p.descricao_base || p.nome || 'Sem nome'}</div>
            <div style="font-size: 0.65rem; color: var(--muted); margin-top: 2px;">ID: ${p.id_interno || ''} | EAN: ${p.ean || 'N/A'}</div>
        </div>
    `).join('');
}

async function selectProductForAjuste(id) {
    ajusteSelectedProduct = (appData.products || []).find(p => p.id_interno == id || p.ean == id);
    if (!ajusteSelectedProduct) return;

    const searchInput = document.getElementById('ajuste-search');
    const resultsDiv = document.getElementById('ajuste-search-results');
    const infoDiv = document.getElementById('ajuste-selected-info');

    if (searchInput) searchInput.value = ajusteSelectedProduct.descricao_base || ajusteSelectedProduct.nome || '';
    if (resultsDiv) resultsDiv.innerHTML = '';

    if (infoDiv) {
        infoDiv.style.display = 'block';
        document.getElementById('ajuste-selected-name').textContent = ajusteSelectedProduct.descricao_base || ajusteSelectedProduct.nome || '';
        document.getElementById('ajuste-selected-id').textContent = `ID: ${ajusteSelectedProduct.id_interno || ''} | EAN: ${ajusteSelectedProduct.ean || 'N/A'}`;
    }

    await updateAjusteStockInfo();
}

async function updateAjusteStockInfo() {
    if (!ajusteSelectedProduct) return;

    const localRaw = document.getElementById('ajuste-local')?.value || 'Tﾃ嘘REO';
    const stockDiv = document.getElementById('ajuste-selected-stock');
    if (!stockDiv) return;

    try {
        const stockData = await DataClient.fetchEstoqueItemLocalSupabase(ajusteSelectedProduct.id_interno, localRaw);
        const saldo = stockData ? Number(stockData.saldo_disponivel || 0) : 0;
        stockDiv.textContent = `Saldo atual neste local: ${saldo}`;
        stockDiv.style.color = saldo > 0 ? '#4ade80' : '#fbbf24';
    } catch (e) {
        stockDiv.textContent = 'Erro ao buscar saldo';
        stockDiv.style.color = '#ef4444';
    }
}

async function saveAjusteEstoque() {
    if (isFinalizing) return;
    isFinalizing = true;

    try {
        // Validar produto
        if (!ajusteSelectedProduct) {
            showToast('Selecione um produto.', 'error');
            isFinalizing = false;
            return;
        }

        const localRaw = document.getElementById('ajuste-local')?.value || 'Tﾃ嘘REO';
        const tipoAjuste = document.getElementById('ajuste-tipo')?.value || 'definir';
        const qtyRaw = document.getElementById('ajuste-qty')?.value;
        const motivo = document.getElementById('ajuste-motivo')?.value || 'outro';
        const obs = document.getElementById('ajuste-obs')?.value?.trim() || '';

        const qty = parseFloat(qtyRaw);
        if (isNaN(qty) || qty < 0) {
            showToast('Quantidade invﾃ｡lida. Digite um nﾃｺmero >= 0.', 'error');
            isFinalizing = false;
            return;
        }

        const idInterno = ajusteSelectedProduct.id_interno;
        const currentUser = localStorage.getItem('currentUser');

        // Buscar saldo atual neste local
        const stockData = await DataClient.fetchEstoqueItemLocalSupabase(idInterno, localRaw);
        const saldoAtual = stockData ? Number(stockData.saldo_disponivel || 0) : 0;

        // Calcular novo saldo
        let novoSaldo = 0;
        let diferenca = 0;

        if (tipoAjuste === 'definir') {
            novoSaldo = qty;
            diferenca = qty - saldoAtual;
        } else if (tipoAjuste === 'somar') {
            novoSaldo = saldoAtual + qty;
            diferenca = qty;
        } else if (tipoAjuste === 'subtrair') {
            novoSaldo = saldoAtual - qty;
            diferenca = -qty;
        }

        // Verificar estoque negativo
        if (novoSaldo < 0) {
            const config = typeof getAppConfig === 'function' ? getAppConfig() : {};
            if (!config.permitir_saida_estoque_zero) {
                showToast('Estoque ficaria negativo. Habilite "Permitir saﾃｭda com estoque zerado" nas Configuraﾃｧﾃｵes.', 'error');
                isFinalizing = false;
                return;
            }
        }

        // Montar descriﾃｧﾃ｣o do motivo
        const motivoLabels = {
            'correcao_contagem': 'Correﾃｧﾃ｣o de contagem',
            'avaria': 'Avaria',
            'perda': 'Perda',
            'devolucao': 'Devoluﾃｧﾃ｣o',
            'garantia': 'Garantia',
            'erro_lancamento': 'Erro de lanﾃｧamento',
            'outro': 'Outro'
        };
        const motivoLabel = motivoLabels[motivo] || motivo;
        const tipoLabels = { 'definir': 'Definir para', 'somar': 'Somar', 'subtrair': 'Subtrair' };
        let observacao = `${tipoLabels[tipoAjuste] || tipoAjuste} ${qty} | Motivo: ${motivoLabel}`;
        if (obs) observacao += ` | Obs: ${obs}`;
        observacao += ` | Saldo anterior: ${saldoAtual} -> Novo: ${novoSaldo}`;

        showToast('Processando ajuste...');

        console.log('[AJUSTE] Salvando movimento tipo ajuste_estoque...');
        console.log('[AJUSTE] idInterno:', idInterno, 'local:', localRaw, 'tipo:', tipoAjuste, 'qty:', qty, 'novoSaldo:', novoSaldo);

        // 1. Salvar movimento
        const movData = {
            tipo: 'ajuste_estoque',
            id_interno: idInterno,
            local_origem: localRaw,
            local_destino: '',
            quantidade: Math.abs(diferenca),
            usuario: currentUser,
            origem: 'MANUAL',
            observacao: observacao
        };

        const savedMov = await DataClient.saveMovimentoSupabase(movData);
        if (!savedMov) {
            showToast('Erro ao gravar movimento.', 'error');
            isFinalizing = false;
            return;
        }

        console.log('[AJUSTE] Movimento salvo:', savedMov);

        // 2. Atualizar estoque_atual (definir = ajuste absoluto, somar/subtrair = relativo)
        let operacao;
        let qtyParaEstoque;
        if (tipoAjuste === 'definir') {
            operacao = 'ajuste';
            qtyParaEstoque = novoSaldo;
        } else if (tipoAjuste === 'somar') {
            operacao = 'soma';
            qtyParaEstoque = qty;
        } else {
            operacao = 'subtrai';
            qtyParaEstoque = qty;
        }

        const stockSuccess = await DataClient.updateEstoqueSupabase(idInterno, localRaw, operacao, qtyParaEstoque);

        if (stockSuccess) {
            console.log('[AJUSTE] Estoque atualizado com sucesso');
            showToast('Ajuste de estoque salvo com sucesso!', 'success');

            // Atualizar cache local
            if (!appData.movimentacoes) appData.movimentacoes = [];
            appData.movimentacoes.unshift({
                ...savedMov,
                data: new Date(savedMov.data_hora).toLocaleString('pt-BR')
            });
            DataClient.invalidateCache('produtos');
            DataClient.invalidateCache('movimentos');

            setTimeout(() => renderMovimentacoesSubMenu(), 1200);
        } else {
            showToast('Movimento salvo, mas estoque Nﾃグ foi atualizado.', 'error');
        }
    } catch (e) {
        console.error('[AJUSTE] Erro fatal:', e);
        showToast('Erro fatal no ajuste: ' + e.message, 'error');
    } finally {
        isFinalizing = false;
    }
}

async function renderInventorySetup(type) {
    const currentUser = localStorage.getItem('currentUser');
    
    // UI de Carregamento inicial
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderInventarioSubMenu()')}
            <div id="inventory-setup-content" style="padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: calc(100vh - 80px);">
                <div class="loading-spinner"></div>
                <p style="color: #aaa; margin-top: 15px;">Validando sessﾃｵes no servidor...</p>
            </div>
        </div>
    `;

    try {
        // TAREFA 1 - Logs de diagnﾃｳstico
        console.log('[INV-DIAG] Entrando em setup para:', type);
        console.log('[INV-DIAG] Produtos em cache:', appData.products?.length || 0);
        console.log('[INV-DIAG] Inventﾃ｡rios no histﾃｳrico local:', appData.inventario?.length || 0);

        // 1. Validar/Limpar sessﾃｵes fantasmas locais
        checkGhostInventorySession();

        // 2. Carregar inventﾃ｡rios frescos do servidor
        const data = await DataClient.loadModule('inventarios', true);
        if (data && data.inventario) {
            appData.inventario = data.inventario;
            console.log('[INV-DIAG] Inventﾃ｡rios carregados do Supabase:', appData.inventario.length);
        }

        // 3. Verificar se existe inventﾃ｡rio ABERTO real para este tipo
        const aberto = (appData.inventario || []).find(inv => {
            const status = (inv.status || inv.col_h || inv.col_H || inv.col_7 || '').toString().toUpperCase();
            const invType = (inv.tipo || inv.col_d || inv.col_D || inv.col_4 || '').toString().toUpperCase();
            return (status === 'ABERTO' || status === 'ABERTA') && invType === type.toUpperCase();
        });

        console.log('[INV-DIAG] Sessao aberta encontrada?', aberto ? `SIM (${aberto.inventario_id})` : 'Nﾃグ');

        const content = document.getElementById('inventory-setup-content');
        if (!content) return;

        if (aberto) {
            const id = aberto.inventario_id || aberto.col_a || aberto.col_A || aberto.col_0;
            const localRaw = aberto.local || aberto.col_c || aberto.col_C || aberto.col_2 || 'N/A';
            const local = prettyLocal(localRaw);
            const dataInicio = aberto.data_inicio || aberto.col_b || aberto.col_B || aberto.col_1;
            content.innerHTML = renderInventoryOpenDetectedCard(aberto, type);
            return;
            
            content.innerHTML = `
                <div style="text-align: center; max-width: 400px; width: 100%;">
                    <span class="material-symbols-rounded" style="font-size: 64px; color: #fbbf24; margin-bottom: 20px;">warning</span>
                    <h2 style="color: white; margin-bottom: 10px;">Inventﾃ｡rio Aberto Detectado</h2>
                    <p style="color: #aaa; margin-bottom: 30px;">Jﾃ｡ existe uma sessﾃ｣o de inventﾃ｡rio <b>${type.toUpperCase()}</b> aberta no local <b>${local}</b>.</p>
                    
                    <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 16px; margin-bottom: 30px; text-align: left; border: 1px solid rgba(255,255,255,0.1);">
                        <div style="font-size: 0.7rem; color: #888; text-transform: uppercase; font-weight: 700;">ID da Sessao</div>
                        <div style="color: #4ade80; font-weight: 800; margin-bottom: 12px; font-size: 1.1rem;">${id}</div>
                        <div style="font-size: 0.7rem; color: #888; text-transform: uppercase; font-weight: 700;">Iniciado por</div>
                        <div style="color: white; margin-bottom: 12px;">${aberto.usuario || aberto.col_d || 'Desconhecido'}</div>
                        <div style="font-size: 0.7rem; color: #888; text-transform: uppercase; font-weight: 700;">Data de Inﾃｭcio</div>
                        <div style="color: white;">${dataInicio ? new Date(dataInicio).toLocaleString('pt-BR') : 'N/A'}</div>
                    </div>

                    <button onclick="resumeInventorySession('${id}', '${type}')" style="width: 100%; padding: 18px; border-radius: 14px; border: none; background: #4ade80; color: #111; font-weight: 800; margin-bottom: 15px; cursor: pointer; font-size: 1rem;">
                        CONTINUAR INVENTﾃヽIO
                    </button>
                    
                    <button onclick="confirmCancelInventory('${id}')" style="width: 100%; padding: 18px; border-radius: 14px; border: 2px solid #ef4444; background: transparent; color: #ef4444; font-weight: 800; cursor: pointer; font-size: 1rem;">
                        CANCELAR E LIMPAR SESSﾃグ
                    </button>
                </div>
            `;
        } else {
            content.innerHTML = renderInventoryStartCard(type);
        }
    } catch (e) {
        console.error(e);
        showToast("Erro de conexﾃ｣o", 'error');
        renderInventarioSubMenu();
    }
}

function checkGhostInventorySession() {
    if (appData.currentInventory && (!appData.currentInventory.items || appData.currentInventory.items.length === 0)) {
        appData.currentInventory = null;
    }
}

function getInventoryTypeLabel(type) {
    const normalized = String(type || '').toUpperCase();
    if (normalized === 'INICIAL') return 'INICIAL';
    if (normalized === 'GERAL') return 'GERAL';
    if (normalized === 'PARCIAL') return 'PARCIAL';
    return normalized || 'INICIAL';
}

function formatInventoryDateTime(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function renderInventoryOpenDetectedCard(aberto, type) {
    const id = aberto.inventario_id || aberto.col_a || aberto.col_A || aberto.col_0 || '-';
    const typeLabel = getInventoryTypeLabel(aberto.tipo || aberto.col_d || aberto.col_D || type);
    const localRaw = aberto.local || aberto.col_c || aberto.col_C || aberto.col_2 || 'N/A';
    const local = prettyLocal(localRaw);
    const startedBy = aberto.usuario_responsavel || aberto.criado_por || aberto.usuario || aberto.col_e || aberto.col_E || 'Desconhecido';
    const startedAt = aberto.data_inicio || aberto.criado_em || aberto.col_b || aberto.col_B || aberto.col_1;
    const formattedStart = formatInventoryDateTime(startedAt);

    return `
        <section class="inv-open-card" aria-label="Inventario aberto detectado">
            <span class="material-symbols-rounded inv-open-alert-icon">warning</span>
            <h1>INVENTARIO ${typeLabel} EM ANDAMENTO</h1>
            <p class="inv-open-description">
                Ja existe uma sessao de inventario ${typeLabel} aberta para este local.
                <span>Voce pode continuar de onde parou ou cancelar a sessao atual para iniciar uma nova.</span>
            </p>

            <div class="inv-open-location-badge">
                <span class="material-symbols-rounded">location_on</span>
                <div>
                    <small>LOCAL DO INVENTARIO</small>
                    <strong>${local}</strong>
                </div>
            </div>

            <div class="inv-open-details">
                <div class="inv-open-section-title">DETALHES DA SESSAO</div>
                <div class="inv-open-row">
                    <span class="material-symbols-rounded">badge</span>
                    <span>ID da sessao</span>
                    <strong class="is-green">${id}</strong>
                </div>
                <div class="inv-open-row">
                    <span class="material-symbols-rounded">assignment</span>
                    <span>Tipo de inventario</span>
                    <strong>${typeLabel}</strong>
                </div>
                <div class="inv-open-row">
                    <span class="material-symbols-rounded">location_on</span>
                    <span>Local</span>
                    <strong>${local}</strong>
                </div>
                <div class="inv-open-row">
                    <span class="material-symbols-rounded">person</span>
                    <span>Iniciado por</span>
                    <strong>${startedBy}</strong>
                </div>
                <div class="inv-open-row">
                    <span class="material-symbols-rounded">calendar_month</span>
                    <span>Data de inicio</span>
                    <strong>${formattedStart}</strong>
                </div>
            </div>

            <button type="button" class="inv-open-btn inv-open-btn-primary" onclick="resumeInventorySession('${id}', '${type}')">
                <span class="material-symbols-rounded">arrow_forward</span>
                <span>
                    <strong>CONTINUAR INVENTARIO</strong>
                    <small>Retomar contagem de onde parou</small>
                </span>
            </button>

            <button type="button" class="inv-open-btn inv-open-btn-danger" onclick="confirmCancelInventory('${id}')">
                <span class="material-symbols-rounded">delete</span>
                <span>
                    <strong>CANCELAR E LIMPAR SESSAO</strong>
                    <small>Descartar esta sessao e iniciar uma nova</small>
                </span>
            </button>

            <div class="inv-open-safety">
                <span class="material-symbols-rounded">shield</span>
                <span>Use esta opcao somente se deseja descartar a sessao aberta.</span>
            </div>
        </section>
    `;
}

function getInventorySetupCopy(type) {
    const normalized = String(type || '').toUpperCase();
    if (normalized === 'GERAL') {
        return {
            subtitle: 'Use para conferir todo o estoque de um local.',
            detail: 'O inventario geral verifica todos os produtos do local selecionado, comparando o estoque esperado com o estoque contado.'
        };
    }
    if (normalized === 'PARCIAL') {
        return {
            subtitle: 'Use para conferir produtos especificos ou uma area do estoque.',
            detail: 'O inventario parcial permite conferir somente produtos ou areas selecionadas, mantendo a comparacao com o saldo esperado.'
        };
    }
    return {
        subtitle: 'Use para cadastrar o primeiro saldo real do estoque.',
        detail: 'O inventario inicial registra o primeiro saldo real do estoque e mostra apenas a quantidade informada na contagem.'
    };
}

function selectInventorySetupLocal(local) {
    const select = document.getElementById('setup-local');
    if (select) select.value = local;
    document.querySelectorAll('.inv-setup-location-btn').forEach(btn => {
        btn.classList.toggle('is-selected', btn.dataset.local === local);
    });
}

function renderInventoryStartCard(type) {
    const typeLabel = getInventoryTypeLabel(type);
    const copy = getInventorySetupCopy(typeLabel);
    const locais = [
        { value: 'TﾉRREO', label: 'TERREO', icon: 'apartment' },
        { value: 'MOSTRUﾁRIO', label: 'MOSTRUARIO', icon: 'storefront' },
        { value: '1ｺ ANDAR', label: '1ｺ ANDAR', icon: 'layers' },
        { value: 'FULL_ML', label: 'FULL ML', icon: 'warehouse' },
        { value: 'EM_TRANSPORTE', label: 'EM TRANSPORTE', icon: 'local_shipping' }
    ];

    return `
        <section class="inv-setup-card" aria-label="Iniciar inventario ${typeLabel}">
            <div class="inv-setup-icon">
                <span class="material-symbols-rounded">inventory</span>
            </div>
            <h1>INICIAR INVENTARIO <span>${typeLabel}</span></h1>
            <p class="inv-setup-subtitle">${copy.subtitle}</p>

            <div class="inv-setup-info">
                <span class="material-symbols-rounded">info</span>
                <div>
                    <strong>TIPO DE INVENTARIO</strong>
                    <p>${copy.detail}</p>
                </div>
            </div>

            <div class="inv-setup-locations">
                <label>SELECIONE O LOCAL DO INVENTARIO</label>
                <select id="setup-local" class="inv-setup-select" aria-label="Local do inventario">
                    ${locais.map(local => `<option value="${local.value}">${local.label}</option>`).join('')}
                </select>
                <div class="inv-setup-location-grid">
                    ${locais.map((local, index) => `
                        <button type="button" class="inv-setup-location-btn ${index === 0 ? 'is-selected' : ''}" data-local="${local.value}" onclick="selectInventorySetupLocal('${local.value}')">
                            <span class="material-symbols-rounded">${local.icon}</span>
                            <strong>${local.label}</strong>
                        </button>
                    `).join('')}
                </div>
            </div>

            <button type="button" class="inv-setup-start-btn" onclick="createNewInventorySession('${type}')">
                <span class="material-symbols-rounded">arrow_forward</span>
                <strong>INICIAR INVENTARIO</strong>
            </button>

            <div class="inv-setup-safe-note">
                <span class="material-symbols-rounded">shield</span>
                <span>Voce podera confirmar os dados antes de iniciar a contagem.</span>
            </div>
        </section>
    `;
}
async function createNewInventorySession(type) {
    if (isStartingInventory) return;
    const localRaw = document.getElementById('setup-local')?.value || 'Tﾃ嘘REO';
    const local = normalizeLocal(localRaw);
    isStartingInventory = true;
    try {
        const date = new Date();
        const dateStr = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
        const prefix = type === 'inicial' ? 'INI' : (type === 'geral' ? 'GER' : 'PAR');
        
        // TAREFA 4 - Numeraﾃｧﾃ｣o inteligente baseada no maior ID do dia
        const sameDayPrefix = `INV-${prefix}-${dateStr}-`;
        const sameDayInventories = (appData.inventario || []).filter(inv => {
            const id = (inv.inventario_id || inv.col_a || '').toString();
            return id.startsWith(sameDayPrefix);
        });

        let nextSeq = 1;
        if (sameDayInventories.length > 0) {
            const lastSeqs = sameDayInventories.map(inv => {
                const id = (inv.inventario_id || inv.col_a || '').toString();
                const parts = id.split('-');
                return parseInt(parts[parts.length - 1]) || 0;
            });
            nextSeq = Math.max(...lastSeqs) + 1;
        }
        
        const seq = String(nextSeq).padStart(3, '0');
        const sessionId = `INV-${prefix}-${dateStr}-${seq}`;
        
        console.log('[INV-DIAG] Criando nova sessﾃ｣o:', sessionId);
        console.log('[INV-DIAG] Maior seq encontrado hoje:', nextSeq - 1);

        appData.currentInventory = {
            id: sessionId,
            user: localStorage.getItem('currentUser'),
            date: date.toISOString(),
            items: [],
            local: local,
            type: type,
            filter: 'TOTAL',
            status: 'ABERTO'
        };

        const client = window.supabaseClient;
        if (!client) {
            alert('Erro: Supabase nﾃ｣o conectado');
            return;
        }

        appData.currentInventory.isNewSession = true;
        console.log('[INVENTARIO DEBUG] tela aberta sem salvar');

        await renderInventarioInicialScreen(sessionId);
    } catch (e) {
        console.error("Erro no catch createNewInventorySession:", e);
        showToast("Erro ao iniciar sessﾃ｣o", 'error');
    } finally {
        isStartingInventory = false;
    }
}

async function resumeInventorySession(sessionId, type) {
    try {
        console.log('[INV-DIAG] resumeInventorySession id:', sessionId);
        showToast("Carregando itens...");
        const client = window.supabaseClient;
        if (!client) { showToast("Supabase nao disponivel", 'error'); return; }

        // TAREFA 3 - Buscar cabeﾃｧalho (Header)
        const { data: invData, error: headerErr } = await client
            .from('inventarios')
            .select('*')
            .eq('inventario_id', sessionId)
            .maybeSingle();

        if (headerErr) {
            console.error('[INV-DIAG] erro header:', headerErr);
            showToast('Erro ao carregar cabeﾃｧalho');
            return;
        }

        if (!invData) {
            console.error('[INV-DIAG] inventﾃ｡rio nﾃ｣o encontrado no banco:', sessionId);
            showToast('Sessao nﾃ｣o encontrada no servidor');
            return;
        }

        // TAREFA 3 - Buscar Itens
        console.log('[INV-DIAG] buscando itens para inventario:', sessionId);
        const { data: itens, error: itensErr } = await client
            .from('inventarios_itens')
            .select('*')
            .eq('inventario_id', sessionId);

        console.log('[INV-DIAG] itens retornados:', itens);

        if (itensErr) {
            console.error('[INV-DIAG] Erro ao buscar itens:', itensErr);
            showToast('Erro ao carregar itens do servidor');
            return;
        }

        appData.currentInventory = {
            id: sessionId,
            user: invData.usuario_responsavel || invData.criado_por || localStorage.getItem('currentUser'),
            date: invData.data_inicio || new Date().toISOString(),
            local: invData.local || 'Tﾃ嘘REO',
            type: invData.tipo || type,
            status: 'ABERTO',
            items: []
        };

        await ensureProdutosLoaded(true);

        appData.currentInventory.items = (itens || []).map(i => {
            const product = appData.products?.find(p => p.id_interno == i.id_interno);
            return {
                id_interno: i.id_interno,
                qty: Number(i.saldo_fisico || 0),
                saldo_sistema: Number(i.saldo_sistema || 0),
                diferenca: Number(i.diferenca || 0),
                ean: product?.ean || i.id_interno,
                name: product?.descricao_completa || product?.nome || `PRODUTO ID: ${i.id_interno} (Nﾃグ CARREGADO)`,
                brand: product?.marca || ''
            };
        });

        console.log('[INV-DIAG] currentInventory.items apﾃｳs map:', appData.currentInventory.items.length);

        await renderInventarioInicialScreen(sessionId);
    } catch (e) {
        console.error('[INV-DIAG] Erro crﾃｭtico ao retomar:', e);
        showToast("Erro tﾃｩcnico ao retomar", 'error');
    }
}
async function confirmCancelInventory(sessionId) {
    if (confirm("ATENﾃ�グ: Deseja realmente CANCELAR este inventﾃ｡rio?")) {
        try {
            const client = window.supabaseClient;
            if (client) {
                await client.from('inventarios').update({
                    status: 'CANCELADO',
                    data_fim: new Date().toISOString(),
                    atualizado_em: new Date().toISOString()
                }).eq('inventario_id', sessionId);
            }
            appData.currentInventory = null;
            renderInventarioSubMenu();
        } catch (e) {
            showToast("Erro ao cancelar", 'error');
        }
    }
}

async function renderInventarioInicialScreen(sessionId, mode = 'edit') {
    const currentUser = localStorage.getItem('currentUser');
    const inv = appData.currentInventory;
    if (!inv || inv.id !== sessionId) { renderInventorySetup('inicial'); return; }

    const isView = mode === 'view';
    const invTypeLabel = getInventoryTypeLabel(inv.tipo || inv.type);
    const isInitialType = isInitialInventoryType(inv.tipo || inv.type);

    // TAREFA 3 - Corrigir loading "Sincronizando Produtos"
    // Sﾃｳ mostrar tela de sincronizaﾃｧﾃ｣o se appData.products estiver realmente vazio
    if (!appData.products || appData.products.length === 0) {
        console.log('[INV-DIAG] Cache de produtos vazio, carregando antes de renderizar...');
        app.innerHTML = `
            <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 20px; animation: pulse 1.5s infinite;">...</div>
                <div style="font-weight: 800; font-size: 1.2rem;">Sincronizando Produtos...</div>
                <div style="color: #777; font-size: 0.9rem; margin-top: 8px;">Isso levarﾃ｡ apenas alguns segundos.</div>
            </div>
        `;
        await ensureProdutosLoaded(true);
    } else {
        // Se jﾃ｡ existem produtos, garante carregamento em background se for necessﾃ｡rio, sem bloquear ou piscar tela
        ensureProdutosLoaded(); 
    }

    app.innerHTML = `
        <div class="dashboard-screen internal fade-in inventory-screen-shell" style="background: #232323; height: 100vh; display: flex; flex-direction: column; overflow: hidden;">
            ${getTopBarHTML(currentUser, 'renderInventarioSubMenu()')}
            <div class="inventory-scanning-screen" style="flex: 1; min-height: 0; width: min(94vw, 880px); max-width: 880px; margin: 0 auto; display: flex; flex-direction: column;">
                <div style="padding: 20px 10px 0 10px; flex-shrink: 0;">
                    <div class="inv-screen-title">
                        <h1>INVENTARIO ${invTypeLabel}</h1>
                        <span><i></i> Contagem em andamento</span>
                    </div>
                    <div class="inv-session-summary" style="background: rgba(255,255,255,0.03); padding: 16px 24px; border-radius: 16px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.06); display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 16px; align-items: center;">
                        <div>
                            <div style="font-size: 0.65rem; color: #666; text-transform: uppercase; margin-bottom: 2px; font-weight: 700; letter-spacing: 0.5px;">Sessao</div>
                            <div style="font-weight: 800; color: #4ade80; font-size: 1rem;">${inv.id}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 0.65rem; color: #666; text-transform: uppercase; margin-bottom: 2px; font-weight: 700; letter-spacing: 0.5px;">Local</div>
                            <div style="font-weight: 800; font-size: 1rem; color: #fff;">${inv.local}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 0.65rem; color: #666; text-transform: uppercase; margin-bottom: 2px; font-weight: 700; letter-spacing: 0.5px;">Tipo</div>
                            <div style="font-weight: 800; color: #eab308; font-size: 1rem;">${invTypeLabel}</div>
                        </div>
                    </div>
                    <div class="inv-search-wrapper" style="position: relative; margin-bottom: 10px;">
                        <span class="material-symbols-rounded" style="position: absolute; left: 20px; top: 50%; transform: translateY(-50%); color: #555; font-size: 24px;">barcode_scanner</span>
                        <input type="text" id="inv-ean-input" ${isView ? 'disabled' : ''} placeholder="${isView ? 'MODO VISUALIZACAO' : 'Bipar EAN ou Codigo...'}" style="width: 100%; padding: 18px 60px; border-radius: 14px; border: 2px solid #333; background: #111; color: white; font-size: 1.1rem; text-align: left; transition: all 0.2s;" onkeypress="if(event.key === 'Enter') addInventoryItem()">
                        <button class="inv-cam-btn" onclick="document.getElementById('inv-cam-input').click()" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;">
                            <span class="material-symbols-rounded">photo_camera</span>
                        </button>
                        <input type="file" id="inv-cam-input" accept="image/*" capture="environment" style="display: none;" onchange="handleInventoryCamera(this)">
                    </div>
                    <div class="inv-list-head">
                        <span>Produto</span>
                        <span>${isInitialType ? 'Saldo inicial' : 'Contagem'}</span>
                        <span>Acoes</span>
                    </div>
                </div>
                <div id="inventory-items-list" style="flex: 1; overflow-y: auto; padding: 10px 10px 120px 10px; box-sizing: border-box; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;"></div>
                <div class="inv-footer-bar">
                    <div class="inv-footer-inner">
                        ${isView ? 
                            `
                            <div style="width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px;">
                                <span class="inv-total-label">Total de itens: <span id="inv-total-count" class="inv-total-num">0</span></span>
                                ${inv.status === 'FECHADO' ? `
                                    <button onclick="cancelClosedInventory('${inv.id}')" class="inv-btn-cancel">ANULAR</button>
                                ` : `
                                    <button disabled class="inv-btn-status">SESSﾃグ ${inv.status}</button>
                                `}
                            </div>
                            ` :
                            `
                            <span class="inv-total-label">Total de itens: <span id="inv-total-count" class="inv-total-num">0</span></span>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <button onclick="showToast('Rascunho salvo automaticamente.', 'success')" class="inv-btn-draft" title="Salvar rascunho">
                                    <span class="material-symbols-rounded">library_books</span>
                                    Salvar Rascunho
                                </button>
                                <button onclick="gerarPdfPreInventario()" class="inv-btn-pdf" title="Gerar PDF de Conferencia">
                                    <span class="material-symbols-rounded">picture_as_pdf</span>
                                </button>
                                <button id="btn-finish-inv" onclick="finishInventorySession()" class="inv-btn-finish">&#10003; Finalizar Inventario</button>
                            </div>
                            `
                        }
                    </div>
                </div>
            </div>
            ${isInitialType ? `
            <div class="inv-initial-note">
                <span class="material-symbols-rounded">info</span>
                <div>
                    <strong>INVENTARIO INICIAL</strong>
                    <p>Como este e o primeiro inventario, nao existe saldo anterior no sistema. Por isso, exibimos apenas o Saldo Inicial (quantidade contada).</p>
                </div>
            </div>
            ` : ''}
        </div>
    `;
    await updateInventoryItemsList();
    if (!isView) setTimeout(() => document.getElementById('inv-ean-input')?.focus(), 500);
}

async function gerarPdfPreInventario() {
    const inv = appData.currentInventory;
    if (!inv || !inv.items || inv.items.length === 0) {
        showToast("Nenhum item bipado para gerar o relatﾃｳrio.", "warning");
        return;
    }

    try {
        showToast("Gerando PDF...", "info");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const now = new Date();
        const timestamp = now.toLocaleString('pt-BR');
        const fileNameDate = now.toISOString().split('T')[0] + '_' + now.getHours().toString().padStart(2, '0') + '-' + now.getMinutes().toString().padStart(2, '0');
        const currentUser = localStorage.getItem('currentUser') || 'Nﾃ｣o identificado';

        // Tﾃｭtulo e Cabeﾃｧalho
        doc.setFontSize(16);
        doc.text("RELATﾃ迭IO PRﾃ�-FINALIZAﾃ�グ DO INVENTﾃヽIO", 105, 15, { align: 'center' });
        
        doc.setFontSize(10);
        doc.text(`ID Inventﾃ｡rio: ${inv.id}`, 14, 25);
        doc.text(`Local: ${inv.local}`, 14, 30);
        doc.text(`Tipo: ${(inv.tipo || inv.type || '').toUpperCase()}`, 14, 35);
        doc.text(`Gerado em: ${timestamp}`, 14, 40);
        doc.text(`Responsﾃ｡vel: ${currentUser}`, 14, 45);

        // Totais
        const totalUnidades = inv.items.reduce((acc, item) => acc + (item.qty || 0), 0);
        doc.setFont("helvetica", "bold");
        doc.text(`Total de produtos diferentes: ${inv.items.length}`, 14, 55);
        doc.text(`Total geral de unidades bipadas: ${totalUnidades}`, 14, 60);
        doc.setFont("helvetica", "normal");

        // Tabela de Itens
        const tableData = inv.items.map(item => {
            const product = (appData.products || []).find(p => String(p.id_interno) === String(item.id_interno));
            return [
                item.id_interno || '-',
                product?.sku_fornecedor || '-',
                product?.ean || '-',
                product?.descricao_completa || product?.descricao_base || item.name || '-',
                product?.marca || '-',
                item.qty || 0
            ];
        });

        doc.autoTable({
            startY: 70,
            head: [['ID Interno', 'SKU', 'EAN', 'Descriﾃｧﾃ｣o', 'Marca', 'Qtd Bipada']],
            body: tableData,
            headStyles: { fillColor: [227, 6, 19] }, // Cor primﾃ｡ria do app #E30613
            theme: 'grid',
            styles: { fontSize: 7 }, // Reduzi um pouco a fonte para caber a nova coluna
            margin: { top: 70 }
        });

        doc.save(`inventario_pre_conferencia_${fileNameDate}.pdf`);
        showToast("PDF gerado com sucesso!", "success");
    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        showToast("Falha ao gerar o PDF.", "error");
    }
}

async function updateInventoryItemsList() {
    const list = document.getElementById('inventory-items-list');
    if (!list) return;

    const items = appData.currentInventory?.items || [];

    // Ordenar SEMPRE por id_interno crescente (ordem numﾃｩrica)
    const sortedItems = [...items].sort((a, b) => {
        const numA = parseInt(String(a.id_interno || '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.id_interno || '').replace(/\D/g, ''), 10) || 0;
        return numA - numB;
    });

    // Atualizar contador de itens bipados no rodapﾃｩ
    const totalCountEl = document.getElementById('inv-total-count');
    if (totalCountEl) totalCountEl.textContent = items.length;

    if (sortedItems.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: #555; padding: 60px 20px;">
                <span class="material-symbols-rounded" style="font-size: 56px; display: block; margin-bottom: 16px; opacity: 0.2;">inventory_2</span>
                <div style="font-weight: 700; color: #666;">Nenhum item encontrado</div>
                <div style="font-size: 0.8rem; margin-top: 5px;">Inicie a contagem bipando um produto.</div>
            </div>
        `;
        return;
    }

    const isView = appData.currentInventory?.mode === 'view' || appData.currentInventory?.status === 'FECHADO' || appData.currentInventory?.status === 'ANULADO';

    list.innerHTML = sortedItems.map((item, displayIndex) => {
        // Enriquecer com dados do produto (SKU, EAN, cor) pelo id_interno original
        const product = (appData.products || []).find(p => String(p.id_interno) === String(item.id_interno));
        const sku   = product?.sku_fornecedor || item.sku || '-';
        const ean   = product?.ean || item.ean || '-';
        const cor   = product?.cor || item.cor || '';
        const nome  = product?.descricao_completa || product?.descricao_base || item.name || 'Produto';
        // ﾃ肱dice real no array ORIGINAL (sem ordenaﾃｧﾃ｣o) para ajuste e remoﾃｧﾃ｣o
        const expectedQty = parseStockQty(item.saldo_sistema ?? getStockQtyByLocal(getProductStockEntriesFromCache(item.id_interno), appData.currentInventory?.local));
        const realIndex = items.findIndex(i => String(i.id_interno) === String(item.id_interno));
        const productImg = product?.image_path || product?.url_imagem ? formatImageUrl(product.image_path || product.url_imagem) : '';
        const qtyLabel = isInitialInventoryType(appData.currentInventory?.type) ? 'SALDO INICIAL' : 'CONTADO';

        return `
        <div class="inventory-item">
            <div class="inv-item-index">${String(displayIndex + 1).padStart(2, '0')}</div>
            <div class="inv-item-thumb">
                ${productImg ? `<img src="${productImg}" alt="">` : `<span class="material-symbols-rounded">inventory_2</span>`}
            </div>
            <!-- ESQUERDA: Informaﾃｧﾃｵes -->
            <div class="inv-col-info">
                <div class="inv-info-row"><span class="inv-info-icon material-symbols-rounded">tag</span><span class="inv-info-label">ID</span><span class="inv-info-val">${item.id_interno}</span></div>
                <div class="inv-info-row"><span class="inv-info-icon material-symbols-rounded">inventory_2</span><span class="inv-info-label">SKU</span><span class="inv-info-val">${sku}</span></div>
                <div class="inv-info-row"><span class="inv-info-icon material-symbols-rounded">barcode</span><span class="inv-info-label">EAN</span><span class="inv-info-val">${ean}</span></div>
                ${cor ? `<div class="inv-info-row"><span class="inv-info-icon material-symbols-rounded">palette</span><span class="inv-info-label">COR</span><span class="inv-info-val">${cor}</span></div>` : ''}
            </div>
            <!-- CENTRO: Produto -->
            <div class="inv-col-product">
                <span class="inv-product-code">${item.id_interno}</span>
                <span class="inv-product-name">${nome}</span>
                <span class="inv-product-meta"><strong>SKU</strong> ${sku} <strong>EAN</strong> ${ean}</span>
                ${renderInventoryQuantitySummary(product, item, expectedQty)}
            </div>
            <!-- DIREITA: Quantidade + Remover -->
            <div class="inv-col-qty" style="flex-direction: row; justify-content: flex-end; width: 100%;">
                <div class="inv-qty-label">${qtyLabel}</div>
                <div class="inv-qty-control" style="opacity: ${isView ? '0.5' : '1'}">
                    <button class="inv-qty-btn" onclick="${isView ? '' : `adjustInventoryQty(${realIndex}, -1)`}" ${isView ? 'disabled' : ''}>-</button>
                    <span class="inv-qty-num">${item.qty}</span>
                    <button class="inv-qty-btn" onclick="${isView ? '' : `adjustInventoryQty(${realIndex}, 1)`}" ${isView ? 'disabled' : ''}>+</button>
                </div>
                <div class="inv-qty-unit">UNIDADES</div>
                ${isView ? '' : `<button class="inv-btn-remove" onclick="removeInventoryItem(${realIndex})" style="margin-top: 0;"><span class="material-symbols-rounded" style="font-size: 18px;">delete</span></button>`}
            </div>
        </div>`;
    }).join('');
}

async function handleInventoryCamera(input) {
    if (!input.files || !input.files[0]) return;
    showToast("Captura de cﾃ｢mera detectada. Processando...", "info");
    
    // Simulaﾃｧﾃ｣o de processamento de imagem/barcode
    // No futuro, aqui integraria com uma lib de OCR ou Barcode reader
    setTimeout(() => {
        showToast("Leitura via cﾃ｢mera em fase de implementaﾃｧﾃ｣o tﾃｩcnica.", "warning");
        input.value = ""; // Limpa input de arquivo
    }, 1500);
}

async function addInventoryItem(scannedEan = null) {
    const eanInput = document.getElementById('inv-ean-input');
    const ean = (scannedEan || eanInput?.value?.trim() || '').toString();
    if (!ean) return;
    
    if (eanInput) eanInput.value = ""; // Limpa campo imediatamente para novo bip

    console.log('[INV-DIAG] currentInventory.id:', appData.currentInventory?.id);
    console.log('[INV-DIAG] bipado ean:', ean);

    // Fallback: Se por algum motivo appData estiver vazio, carregar agora
    if (!appData.products || appData.products.length === 0) {
        showToast("Carregando banco de produtos...", "info");
        await ensureProdutosLoaded(true);
    }

    let product = appData.products.find(p => (p.ean?.toString() === ean) || (p.id_interno?.toString() === ean) || (p.sku_fornecedor?.toString() === ean));

    console.log('[INV-DIAG] produto encontrado:', product ? `${product.id_interno} - ${product.descricao_completa}` : 'Nﾃグ');

    if (!product) {
        console.log(`[INV-DIAG] Produto ${ean} nﾃ｣o encontrado no cache. Tentando recarregar banco...`);
        await ensureProdutosLoaded(true);
        product = appData.products.find(p => (p.ean?.toString() === ean) || (p.id_interno?.toString() === ean) || (p.sku_fornecedor?.toString() === ean));
    }

    if (!product) { 
        console.warn('[INV-DIAG] Produto nﾃ｣o encontrado em definitivo:', ean);
        playBeep(false); 
        showToast("PRODUTO Nﾃグ ENCONTRADO!", "error"); 
        if(eanInput) eanInput.value = ''; 
        return; 
    }

    const existing = appData.currentInventory.items.find(i => i.id_interno === product.id_interno);
    let itemToSave = null;
    if (existing) { existing.qty += 1; itemToSave = existing; }
    else {
        itemToSave = { ean: product.ean || product.id_interno, name: product.descricao_completa || product.nome || 'Produto', brand: product.marca || '', qty: 1, id_interno: product.id_interno };
        appData.currentInventory.items.unshift(itemToSave);
    }
    
    if(eanInput) eanInput.value = ''; 
    if(eanInput) eanInput.focus(); 
    playBeep(true); 
    updateInventoryItemsList(); 
    
    console.log('[INV-DIAG] inventario atual:', appData.currentInventory.id);
    console.log('[INV-DIAG] salvando item:', {
      inventario_id: appData.currentInventory.id,
      id_interno: product.id_interno
    });

    await saveInventoryItemToServer(itemToSave);
}

async function saveInventoryItemToServer(item) {
    const client = window.supabaseClient;
    if (!client) { console.error('[INV-DIAG] Supabase client nﾃ｣o encontrado'); return; }
    const inv = appData.currentInventory;
    if (!inv || !inv.id) { console.error('[INV-DIAG] Sessao de inventﾃ｡rio invﾃ｡lida'); return; }

    if (inv.isNewSession) {
        console.log('[INVENTARIO DEBUG] primeiro item bipado, criando inventﾃ｡rio');
        const payload = {
            inventario_id: inv.id,
            tipo: inv.type,
            status: 'ABERTO',
            criado_por: inv.user,
            usuario_responsavel: inv.user,
            data_inicio: inv.date,
            local: inv.local
        };
        const { error } = await client.from('inventarios').insert([payload]);
        if (error) {
            console.error('[INVENTARIO DEBUG] Erro ao criar inventﾃ｡rio no Supabase:', error);
            showToast('Erro ao criar sessﾃ｣o de inventﾃ｡rio.', 'error');
            return;
        }
        inv.isNewSession = false;
        
        if (!appData.inventario) appData.inventario = [];
        appData.inventario.unshift(payload);
    }

    // Buscar saldo_sistema REAL do Supabase (id_interno + local)
    const estoqueReal = await DataClient.fetchEstoqueItemLocalSupabase(item.id_interno, inv.local);
    const saldo_sistema = estoqueReal ? parseFloat(estoqueReal.saldo_disponivel || 0) : 0;
    const saldo_fisico = Number(item.qty || 0);
    const diferenca = saldo_fisico - saldo_sistema;
    item.saldo_sistema = saldo_sistema;

    const product = appData.products.find(p => p.id_interno == item.id_interno);
    const valor_unitario = product ? parseFloat((product.preco_custo || product.custo || 0).toString().replace(',', '.')) : 0;

    const payload = {
        inventario_id: inv.id,
        id_interno: item.id_interno,
        local: inv.local,
        saldo_sistema: saldo_sistema,
        saldo_fisico: saldo_fisico,
        diferenca: diferenca,
        valor_unitario: valor_unitario,
        valor_diferenca: diferenca * valor_unitario,
        auditado_em: new Date().toISOString()
    };

    console.log('[INV-DIAG] payload inventarios_itens:', payload);

    try {
        // TAREFA 3 e 4 - Lﾃｳgica segura (SELECT -> UPDATE ou INSERT)
        // Nﾃ｣o dependemos de constraint UNIQUE para funcionar
        const { data: existing, error: selectErr } = await client
            .from('inventarios_itens')
            .select('id_interno')
            .eq('inventario_id', inv.id)
            .eq('id_interno', item.id_interno)
            .maybeSingle();

        if (selectErr) console.error('[INV-DIAG] erro ao verificar existﾃｪncia:', selectErr);

        let result;
        if (existing) {
            console.log('[INV-DIAG] item jﾃ｡ existe, executando UPDATE...');
            result = await client
                .from('inventarios_itens')
                .update(payload)
                .eq('inventario_id', inv.id)
                .eq('id_interno', item.id_interno);
        } else {
            console.log('[INV-DIAG] item novo, executando INSERT...');
            result = await client
                .from('inventarios_itens')
                .insert([payload]);
        }

        if (result.error) {
            console.error('[INV-DIAG] Erro ao persistir no banco:', result.error.message);
            showToast("Erro ao salvar: " + result.error.message, "error");
        } else {
            console.log('[INV-DIAG] Persistﾃｪncia OK. Iniciando confirmaﾃｧﾃ｣o imediata...');
            
            // TAREFA 1 e 2 - Query de confirmaﾃｧﾃ｣o imediata
            const { data: check, error: checkError } = await client
                .from('inventarios_itens')
                .select('*')
                .eq('inventario_id', inv.id)
                .eq('id_interno', item.id_interno);

            console.log('[INV-DIAG] confirmaﾃｧﾃ｣o inventarios_itens:', check, checkError);

            if (!check || check.length === 0) {
                console.error('[INV-DIAG] FALHA CRﾃ控ICA: Item nﾃ｣o encontrado apﾃｳs salvamento!');
                showToast("Item Nﾃグ foi salvo no banco!", "error");
                // TAREFA 5 - Bloqueio se nﾃ｣o salvar
                throw new Error("Persistﾃｪncia falhou");
            } else {
                console.log('[INV-DIAG] Confirmaﾃｧﾃ｣o FINALIZADA COM SUCESSO.');
            }
        }
    } catch (e) {
        console.error('[INV-DIAG] Erro inesperado ao salvar item:', e);
    }
}



window.finishInventorySession = async function () {
    if (isFinalizing) return;
    if (!appData.currentInventory?.items?.length) { showToast("Nﾃ｣o ﾃｩ possﾃｭvel fechar um inventﾃ｡rio vazio!", "error"); return; }
    isFinalizing = true;

    const client = window.supabaseClient;
    if (!client) { showToast("Supabase nﾃ｣o disponﾃｭvel", 'error'); isFinalizing = false; return; }

    const btn = document.getElementById('btn-finish-inv');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.innerHTML = 'PROCESSANDO...'; }

    try {
        const sessionId = appData.currentInventory.id;
        const local = appData.currentInventory.local;
        const user = localStorage.getItem('currentUser');
        
        // TAREFA 2 - Buscar itens reais do banco antes de processar
        console.log('[INV-DIAG] buscando itens reais para finalizar:', sessionId);
        const { data: dbItems, error: fetchErr } = await client
            .from('inventarios_itens')
            .select('*')
            .eq('inventario_id', sessionId);

        if (fetchErr || !dbItems || dbItems.length === 0) {
            console.error('[INV-DIAG] erro ou nenhum item encontrado:', fetchErr);
            showToast("Nenhum item salvo no banco para este inventﾃ｡rio!", "error");
            isFinalizing = false;
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = 'FINALIZAR INVENTﾃヽIO'; }
            return;
        }

        console.log('[INV-DIAG] itens para finalizar:', dbItems.length);

        let total_skus = dbItems.length;
        let total_itens = 0;
        let total_itens_contados = 0;
        let total_divergencias = 0;
        let valor_ajuste_positivo = 0;
        let valor_ajuste_negativo = 0;

        let step = 0;
        for (const item of dbItems) {
            step++;
            if (btn) btn.innerHTML = `PROCESSANDO ${step}/${total_skus}...`;
            
            const saldo_sistema = parseFloat(item.saldo_sistema || 0);
            const saldo_fisico = parseFloat(item.saldo_fisico || 0);
            const diferenca = saldo_fisico - saldo_sistema;
            const valor_unitario = parseFloat(item.valor_unitario || 0);

            total_itens += saldo_sistema;
            total_itens_contados += saldo_fisico;
            if (diferenca !== 0) {
                total_divergencias++;
                if (diferenca > 0) valor_ajuste_positivo += (diferenca * valor_unitario);
                else valor_ajuste_negativo += (Math.abs(diferenca) * valor_unitario);
            }

            // 1. Atualizar estoque_atual (Trava: se falhar, interrompe)
            console.log('[INV-DIAG] estoque payload:', { id_interno: item.id_interno, local, quantidade: saldo_fisico });
            const stockResult = await DataClient.updateEstoqueSupabase(item.id_interno, local, 'ajuste', saldo_fisico);
            console.log('[INV-DIAG] estoque result:', stockResult);
            if (!stockResult) throw new Error(`Falha ao atualizar estoque do item ${item.id_interno}`);

            // 2. Gerar movimento (Trava: se falhar, interrompe)
            if (diferenca !== 0) {
                // Mapeamento de tipo de movimento de inventﾃ｡rio
                const invType = (appData.currentInventory.type || '').toLowerCase();
                let movTipo = '';
                if (invType === 'inicial') movTipo = 'INVENTARIO_INICIAL';
                else if (invType === 'parcial') movTipo = 'INVENTARIO_PARCIAL';
                else if (invType === 'geral') movTipo = 'INVENTARIO_GERAL';
                else movTipo = diferenca > 0 ? 'AJUSTE+' : 'AJUSTE-'; // Fallback seguro

                const movPayload = {
                    tipo: movTipo,
                    id_interno: item.id_interno,
                    local_origem: null,
                    local_destino: null,
                    quantidade: Math.abs(diferenca),
                    usuario: user,
                    origem: 'APP_INVENTARIO',
                    observacao: sessionId
                };
                console.log('[INV-DIAG] movimento payload:', movPayload);
                const movResult = await DataClient.saveMovimentoSupabase(movPayload);
                console.log('[INV-DIAG] movimento result:', movResult);
                if (!movResult) throw new Error(`Falha ao gerar movimento do item ${item.id_interno}`);
            }
        }

        // 3. Sﾃｳ agora marcamos como FECHADO
        console.log('[INV-DIAG] executando fechamento final...');
        const { error: finalErr } = await client.from('inventarios').update({
            status: 'FECHADO',
            data_fim: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
            total_skus: total_skus,
            total_itens: total_itens,
            total_itens_contados: total_itens_contados,
            total_divergencias: total_divergencias,
            valor_ajuste_positivo: valor_ajuste_positivo,
            valor_ajuste_negativo: valor_ajuste_negativo
        }).eq('inventario_id', sessionId);
        
        console.log('[INV-DIAG] fechamento result:', finalErr ? 'ERRO' : 'OK');

        if (finalErr) throw finalErr;

        showToast("Inventﾃ｡rio finalizado com sucesso!");
        appData.currentInventory = null;
        renderInventorySuccessScreen();

    } catch (err) {
        console.error('[INV-DIAG] ERRO CRﾃ控ICO na finalizaﾃｧﾃ｣o:', err);
        showToast('Erro ao finalizar: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '&#10003; Finalizar Inventario'; }
    } finally {
        isFinalizing = false;
    }
}

async function adjustInventoryQty(index, delta) {
    const item = appData.currentInventory.items[index];
    item.qty = Math.max(1, item.qty + delta);
    updateInventoryItemsList();
    saveInventoryItemToServer(item);
}

async function removeInventoryItem(index) {
    if (confirm("Remover este item?")) {
        appData.currentInventory.items.splice(index, 1);
        updateInventoryItemsList();
    }
}

function renderInventorySuccessScreen() {
    const currentUser = localStorage.getItem('currentUser');
    appData.currentInventory = null; // Limpa o inventﾃ｡rio atual

    app.innerHTML = `
                <div class="dashboard-screen fade-in" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; text-align: center; padding: 20px;">
                    <div style="background: var(--surface); padding: 40px; border-radius: 24px; border: 1px solid var(--primary); box-shadow: 0 20px 40px rgba(0,0,0,0.4); max-width: 400px; width: 100%;">
                        <span class="material-symbols-rounded" style="font-size: 80px; color: #22c55e; margin-bottom: 20px;">check_circle</span>
                        <h2 style="font-size: 1.8rem; margin-bottom: 10px; color: white;">INVENTﾃヽIO SALVO!</h2>
                        <p style="color: var(--muted); margin-bottom: 30px;">Dados processados e salvos com sucesso no Supabase.</p>
                        
                        <div style="background: rgba(34, 197, 94, 0.1); padding: 16px; border-radius: 16px; margin-bottom: 30px; text-align: left; border: 1px solid rgba(34, 197, 94, 0.2);">
                            <div style="display: flex; align-items: center; gap: 10px; color: #4ade80; font-size: 0.8rem; font-weight: 700; margin-bottom: 8px;">
                                <span class="material-symbols-rounded" style="font-size: 18px;">check_circle</span>
                                FLUXO CONCLUﾃ好O
                            </div>
                            <p style="font-size: 0.75rem; color: var(--muted); line-height: 1.4;">
                                O estoque foi atualizado e os movimentos de ajuste foram registrados no servidor.
                            </p>
                        </div>

                        <button class="btn-action" style="width: 100%; justify-content: center; padding: 16px; background: var(--primary) !important;" onclick="renderInventarioSubMenu()">
                            <span class="material-symbols-rounded">inventory_2</span>
                            VOLTAR AO INVENTﾃヽIO
                        </button>
                    </div>
                </div>
            `;

    playBeep(true);
}

function renderInventarioSubMenu() {
    stopScanner();
    
    if (appData.currentInventory && appData.currentInventory.isNewSession) {
        console.log('[INVENTARIO DEBUG] usuﾃ｡rio saiu sem itens, nada salvo');
        appData.currentInventory = null;
    }
    
    const currentUser = localStorage.getItem('currentUser');
    const subItems = [
        { id: 'inv_inicial', label: 'INVENT\u00c1RIO INICIAL', icon: 'inventario_inicial', onclick: 'startInventarioInicial()' },
        { id: 'inv_geral', label: 'INVENT\u00c1RIO GERAL', icon: 'inventario_geral', onclick: 'startInventarioGeral()' },
        { id: 'inv_parcial', label: 'INVENT\u00c1RIO PARCIAL', icon: 'inventario_parcial', onclick: "renderInventorySetup('parcial')" },
        { id: 'historico_inv', label: 'HIST\u00d3RICO', icon: 'historico', onclick: 'renderInventarioHistory()' }
    ];

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal inventory-screen module-screen">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
            ${getModuleSidebarHTML('inventario')}

            <main class="container">
                <div class="menu-grid">
                    ${subItems.map(item => `
                        <div class="menu-card mobile-nav-card" onclick="${item.onclick}">
                            <span class="menu-icon-3d">${menu3DIcons[item.icon] || ''}</span>
                            <span class="label">${item.label}</span>
                        </div>
                    `).join('')}
                </div>
            </main>
        </div>
    `;
}

async function renderInventarioHistory() {
    const currentUser = localStorage.getItem('currentUser');
    
    // UI de Carregamento
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderInventarioSubMenu()')}
            <div style="padding: 20px; width: min(92vw, 860px); max-width: 860px; margin: 0 auto; text-align: center; color: #777;">
                <div class="loading-spinner" style="margin: 20px auto;"></div>
                Carregando histﾃｳrico...
            </div>
        </div>
    `;

    try {
        const client = window.supabaseClient;
        if (!client) return;

        const { data, error } = await client
            .from('inventarios')
            .select('*')
            .order('data_inicio', { ascending: false });

        if (error) throw error;

        appData.inventario = data || [];
        console.log('[INV-DIAG] histﾃｳrico inventarios encontrados:', appData.inventario.length);

        const history = appData.inventario;

        app.innerHTML = `
            <div class="dashboard-screen internal fade-in" style="background: #232323; min-height: 100vh;">
                ${getTopBarHTML(currentUser, 'renderInventarioSubMenu()')}
                <div style="padding: 20px; width: min(92vw, 860px); max-width: 860px; margin: 0 auto;">
                    <div style="display: flex; flex-direction: column; gap: 16px; margin-top: 10px;">
                        ${history.length === 0 ? '<p style="color: #555; text-align: center; padding: 40px;">Nenhum registro encontrado.</p>' : 
                            history.map(inv => `
                                <div onclick="${(inv.status === 'FECHADO' || inv.status === 'ANULADO') ? `viewClosedInventory('${inv.inventario_id}')` : ''}" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 24px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s; ${(inv.status === 'FECHADO' || inv.status === 'ANULADO') ? 'cursor: pointer;' : ''}" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                                    <div>
                                        <div style="color: #4ade80; font-weight: 800; font-size: 1.1rem; margin-bottom: 4px;">${inv.inventario_id}</div>
                                        <div style="color: #777; font-size: 0.85rem; margin-bottom: 2px;">${(inv.tipo || '').toUpperCase()} | ${inv.local}</div>
                                        <div style="color: #555; font-size: 0.8rem;">${new Date(inv.data_inicio).toLocaleDateString('pt-BR')} ${new Date(inv.data_inicio).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="color: ${inv.status === 'FECHADO' ? '#4ade80' : (inv.status === 'ANULADO' ? '#ef4444' : '#fbbf24')}; font-size: 0.85rem; font-weight: 800; letter-spacing: 0.5px;">${inv.status}</div>
                                        <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 12px;">
                                            ${(inv.status === 'ABERTO' || inv.status === 'ABERTA') ? `<button onclick="event.stopPropagation(); resumeInventorySession('${inv.inventario_id}', '${inv.tipo}')" style="background: #4ade80; border: none; padding: 8px 16px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; cursor: pointer; color: #111; transition: transform 0.1s;" onmousedown="this.style.transform='scale(0.96)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'">CONTINUAR</button>` : ''}
                                        </div>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('[INV-DIAG] Erro ao carregar histﾃｳrico:', e);
        showToast("Erro ao carregar histﾃｳrico", "error");
    }
}

async function deleteTestInventory(sessionId) {
    if (!confirm(`EXCLUIR TESTE: Deseja apagar permanentemente todos os dados do inventﾃ｡rio ${sessionId}?\nIsso apagarﾃ｡ itens, movimentos e o registro da sessﾃ｣o.`)) return;
    
    try {
        const client = window.supabaseClient;
        if (!client) return;
        showToast("Excluindo dados de teste...");

        // 1. Deletar itens
        await client.from('inventarios_itens').delete().eq('inventario_id', sessionId);
        
        // 2. Deletar movimentos relacionados
        await client.from('movimentos').delete().or(`observacao.ilike.%${sessionId}%,observacao.ilike.%Inventﾃ｡rio ${sessionId}%`);

        // 3. Deletar cabeﾃｧalho
        await client.from('inventarios').delete().eq('inventario_id', sessionId);

        showToast("Dados de teste excluﾃｭdos!", "success");
        renderInventarioHistory(); // Recarregar
    } catch (e) {
        console.error('[INV-DIAG] Erro ao excluir teste:', e);
        showToast("Erro ao excluir dados", "error");
    }
}

async function viewClosedInventory(sessionId) {
    try {
        console.log('[INV-DIAG] viewClosedInventory id:', sessionId);
        showToast("Carregando inventﾃ｡rio fechado...");
        
        const client = window.supabaseClient;
        if (!client) {
            console.error('[INV-DIAG] Supabase Client nﾃ｣o disponﾃｭvel');
            return;
        }

        await ensureProdutosLoaded();

        const { data: invData, error: headerErr } = await client
            .from('inventarios')
            .select('*')
            .eq('inventario_id', sessionId)
            .maybeSingle();

        console.log('[INV-DIAG] header encontrado:', invData ? 'SIM' : 'Nﾃグ');
        if (headerErr) console.error('[INV-DIAG] erro header:', headerErr);

        const { data: itensData, error: itensErr } = await client
            .from('inventarios_itens')
            .select('*')
            .eq('inventario_id', sessionId);

        const serverItems = itensData || [];
        console.log('[INV-DIAG] itens encontrados:', serverItems.length);
        if (itensErr) console.error('[INV-DIAG] erro itens:', itensErr);

        appData.currentInventory = {
            id: sessionId,
            user: invData?.usuario_responsavel || invData?.criado_por || 'N/A',
            date: invData?.data_inicio || invData?.criado_em,
            local: invData?.local || invData?.filtro_aplicado || 'Tﾃ嘘REO',
            type: invData?.tipo || 'geral',
            status: invData?.status || 'FECHADO',
            items: serverItems.map(i => {
                const product = appData.products?.find(p => p.id_interno == i.id_interno);
                return {
                    ean: product?.ean || i.id_interno,
                    name: product?.descricao_completa || product?.nome || i.id_interno,
                    brand: product?.marca || '',
                    qty: Number(i.saldo_fisico || 0),
                    id_interno: i.id_interno,
                    saldo_sistema: Number(i.saldo_sistema || 0),
                    diferenca: Number(i.diferenca || 0)
                };
            })
        };

        console.log('[INV-DIAG] currentInventory.items apﾃｳs map (view):', appData.currentInventory.items.length);

        await renderInventarioInicialScreen(sessionId, 'view');
    } catch (e) {
        console.error('[INV-DIAG] Erro crﾃｭtico ao visualizar:', e);
        showToast("Falha tﾃｩcnica ao abrir visualizaﾃｧﾃ｣o", 'error');
    }
}

async function startInventoryReview(baseInventoryId) {
    const original = appData.currentInventory;
    if (!original || !original.items || original.items.length === 0) {
        alert("Nﾃ｣o ﾃｩ possﾃｭvel revisar um inventﾃ｡rio sem itens contados!");
        return;
    }

    if (!confirm("Deseja iniciar uma REVISﾃグ deste inventﾃ｡rio?\nSerﾃ｡ gerada uma nova sessﾃ｣o com os mesmos itens.")) return;
    
    try {
        showToast("Iniciando revisﾃ｣o...");
        const client = window.supabaseClient;
        if (!client) return;

        const currentUser = localStorage.getItem('currentUser');
        
        // Gerar novo ID
        const date = new Date();
        const dateStr = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
        
        // TAREFA 4 - Numeraﾃｧﾃ｣o inteligente para REVISﾃグ
        const sameDayPrefix = `REV-${dateStr}-`;
        const sameDayInventories = (appData.inventario || []).filter(inv => {
            const id = (inv.inventario_id || '').toString();
            return id.startsWith(sameDayPrefix);
        });

        let nextSeq = 1;
        if (sameDayInventories.length > 0) {
            const lastSeqs = sameDayInventories.map(inv => {
                const id = inv.inventario_id.toString();
                const parts = id.split('-');
                return parseInt(parts[parts.length - 1]) || 0;
            });
            nextSeq = Math.max(...lastSeqs) + 1;
        }

        const seq = String(nextSeq).padStart(3, '0');
        const newSessionId = `REV-${dateStr}-${seq}`;

        // 1. Criar cabeﾃｧalho da revisﾃ｣o
        const { error: invErr } = await client.from('inventarios').insert([{
            inventario_id: newSessionId,
            tipo: 'revisao',
            status: 'ABERTO',
            criado_por: currentUser,
            usuario_responsavel: currentUser,
            data_inicio: date.toISOString(),
            local: original.local,
            filtro_aplicado: `REVISﾃグ DO ${baseInventoryId}`
        }]);

        if (invErr) throw invErr;

        // 2. Clonar itens
        for (const item of original.items) {
            await client.from('inventarios_itens').insert([{
                inventario_id: newSessionId,
                id_interno: item.id_interno,
                local: original.local,
                saldo_sistema: item.saldo_sistema,
                saldo_fisico: item.qty,
                diferenca: item.qty - item.saldo_sistema,
                auditado_em: date.toISOString()
            }]);
        }

        // 3. Carregar nova sessﾃ｣o como atual
        appData.currentInventory = {
            ...original,
            id: newSessionId,
            status: 'ABERTO',
            user: currentUser,
            date: date.toISOString()
        };

        await renderInventarioInicialScreen(newSessionId, 'edit');
        showToast("Revisﾃ｣o iniciada!", "success");
    } catch (e) {
        console.error('[INV] Erro ao criar revisﾃ｣o:', e);
        showToast("Erro ao criar revisﾃ｣o", 'error');
    }
}

async function cancelClosedInventory(sessionId) {
    if (!confirm('Tem certeza que deseja ANULAR este inventﾃ｡rio?\n\nEssa aﾃｧﾃ｣o Nﾃグ apaga dados, apenas marca como ANULADO.')) return;

    try {
        showToast("Anulando inventﾃ｡rio...");
        const client = window.supabaseClient;
        if (!client) return;

        const { error } = await client
            .from('inventarios')
            .update({
                status: 'ANULADO',
                atualizado_em: new Date().toISOString()
            })
            .eq('inventario_id', sessionId);

        if (error) throw error;

        showToast("Inventﾃ｡rio anulado com sucesso!", "success");
        appData.currentInventory = null;
        
        // Atualizar cache local do histﾃｳrico se existir
        if (appData.inventario) {
            const idx = appData.inventario.findIndex(inv => inv.inventario_id === sessionId);
            if (idx !== -1) appData.inventario[idx].status = 'ANULADO';
        }

        renderInventarioHistory();
    } catch (e) {
        console.error('[INV] Erro ao anular inventﾃ｡rio:', e);
        showToast("Erro ao anular inventﾃ｡rio", "error");
    }
}

async function renderStockCritical() {
    await ensureProdutosLoaded();
    const currentUser = localStorage.getItem('currentUser');
    const criticalProducts = appData.products.filter(p => {
        const stock = parseFloat((p.estoque_atual || p.estoque_minimo || 0).toString().replace(',', '.'));
        const min = parseFloat((p.estoque_minimo || 0).toString().replace(',', '.'));
        return stock <= min && min > 0;
    });

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">ESTOQUE CRﾃ控ICO</h2>
                        </div>

                        <div id="critical-results">
                            ${criticalProducts.length === 0 ? `
                                <div style="text-align: center; padding: 40px; background: var(--surface); border-radius: 20px; color: var(--muted);">
                                    <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 16px; color: #22c55e;">check_circle</span>
                                    <p>Nenhum produto com estoque crﾃｭtico.</p>
                                </div>
                            ` : `
                                <div style="display: flex; flex-direction: column; gap: 16px;">
                                    <p style="font-size: 0.8rem; font-weight: 700; color: var(--muted); text-transform: uppercase;">Produtos abaixo do mﾃｭnimo (${criticalProducts.length})</p>
                                    ${criticalProducts.map(p => `
                                        <div class="menu-card" style="flex-direction: row; justify-content: flex-start; padding: 16px; gap: 20px; min-height: auto; text-align: left; border-left: 4px solid var(--danger);" onclick="showProductDetails('${p.ean}')">
                                            <div style="width: 60px; height: 60px; background: rgba(255,255,255,0.05); border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                                                ${(p.url_imagem || p.image_path) ? `<img src="${formatImageUrl(p.image_path || p.url_imagem)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span class=\\'material-symbols-rounded\\' style=\\'color: var(--muted)\\'>image</span>'">` : `<span class="material-symbols-rounded" style="color: var(--muted)">image</span>`}
                                            </div>
                                            <div style="flex: 1;">
                                                <div style="font-weight: 700; color: white; font-size: 0.9rem; margin-bottom: 4px;">${p.descricao_base || 'Sem Descriﾃｧﾃ｣o'}</div>
                                                <div style="font-size: 0.75rem; color: var(--muted);">SKU: ${p.sku_fornecedor || '-'} | EAN: ${p.ean || '-'}</div>
                                                
                                            </div>
                                            <span class="material-symbols-rounded" style="color: var(--muted)">chevron_right</span>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                        </div>
                    </main>
                </div>
            `;
}

function renderSearchProduct() {
    return renderSearchScreen();
}

const PRODUCT_STOCK_LOCATION_FILTERS = [
    { key: 'TODOS', label: 'Todos', locals: [] },
    { key: 'DISPONIVEL', label: 'Disponﾃｭvel', locals: ['TERREO', 'MOSTRUARIO', 'PRIMEIRO_ANDAR'] },
    { key: 'TERREO', label: 'Tﾃｩrreo', locals: ['TERREO'] },
    { key: 'MOSTRUARIO', label: 'Mostruﾃ｡rio', locals: ['MOSTRUARIO'] },
    { key: 'PRIMEIRO_ANDAR', label: '1ﾂｺ Andar', locals: ['PRIMEIRO_ANDAR'] },
    { key: 'FULL_ML', label: 'Full ML', locals: ['FULL_ML'] },
    { key: 'DEFEITO', label: 'Defeito', locals: ['DEFEITO'] },
    { key: 'EM_GARANTIA', label: 'Garantia', locals: ['EM_GARANTIA'] },
    { key: 'EM_TRANSITO', label: 'Em Transporte', locals: ['EM_TRANSITO', 'EM_TRANSPORTE'] }
];

let currentProductStockFilter = 'TODOS';

function getProductStockFilter(key = currentProductStockFilter) {
    return PRODUCT_STOCK_LOCATION_FILTERS.find(filter => filter.key === key) || PRODUCT_STOCK_LOCATION_FILTERS[0];
}

function getStockLocationQty(productId, filterKey = currentProductStockFilter) {
    const filter = getProductStockFilter(filterKey);
    if (!filter.locals.length || !productId || !Array.isArray(appData.estoque)) return 0;

    return appData.estoque.reduce((total, item) => {
        const itemId = String(item.id_interno || item.id || '').trim();
        if (itemId !== String(productId).trim()) return total;

        const normalizedLocal = normalizeLocal(item.local);
        if (!filter.locals.includes(normalizedLocal)) return total;

        const saldoTotal = item.saldo_total ?? item.saldo;
        const qty = saldoTotal !== undefined && saldoTotal !== null
            ? parseFloat(String(saldoTotal).replace(',', '.'))
            : (
                parseFloat(String(item.saldo_disponivel || 0).replace(',', '.')) +
                parseFloat(String(item.saldo_reservado || 0).replace(',', '.')) +
                parseFloat(String(item.saldo_em_transito || 0).replace(',', '.'))
            );

        return total + (isNaN(qty) ? 0 : qty);
    }, 0);
}

function applyProductStockLocationFilter(products) {
    const filter = getProductStockFilter();
    if (!filter.locals.length) return products;
    return products.filter(product => getStockLocationQty(product.id_interno || product.col_A, filter.key) > 0);
}

function getProductStockFilterCount(filterKey) {
    const productsSource = Array.isArray(appData.products) ? appData.products : [];
    const filter = getProductStockFilter(filterKey);
    if (!filter.locals.length) return productsSource.length;

    return productsSource.reduce((total, product) => {
        const qty = getStockLocationQty(product.id_interno || product.col_A, filter.key);
        return qty > 0 ? total + 1 : total;
    }, 0);
}

function renderProductStockFilterChips() {
    return `
        <div class="product-stock-filter-chips" role="tablist" aria-label="Filtro de estoque por local">
            ${PRODUCT_STOCK_LOCATION_FILTERS.map((filter, index) => {
                const count = getProductStockFilterCount(filter.key);
                const shouldShowCount = filter.key === 'TODOS' || count > 0;
                const group = ['TODOS', 'DISPONIVEL', 'TERREO', 'MOSTRUARIO', 'PRIMEIRO_ANDAR'].includes(filter.key) ? 'primary' : filter.key === 'FULL_ML' ? 'external' : 'secondary';
                return `
                <button
                    type="button"
                    class="product-stock-filter-chip ${currentProductStockFilter === filter.key ? 'active' : ''}"
                    data-filter-group="${group}"
                    role="tab"
                    aria-selected="${currentProductStockFilter === filter.key}"
                    onclick="setProductStockFilter('${filter.key}')"
                >
                    <span class="product-stock-filter-label">${filter.label}</span>
                    ${shouldShowCount ? `<span class="product-stock-filter-count">${count}</span>` : ''}
                </button>
                ${index === 3 ? '<span class="product-stock-filter-break" aria-hidden="true"></span>' : ''}
            `;
            }).join('')}
        </div>
    `;
}

function getProductSearchStatusText(queryRaw = '') {
    const filter = getProductStockFilter();
    const query = String(queryRaw || '').trim();
    if (query && filter.key !== 'TODOS') return `Busca: ${query} ﾂｷ Local: ${filter.label}`;
    if (query) return `Busca: ${query} ﾂｷ Local: Todos`;
    return `Mostrando: ${filter.label}`;
}

function updateProductSearchStatus(queryRaw = '') {
    const status = document.getElementById('product-search-status');
    if (status) status.textContent = getProductSearchStatusText(queryRaw);
}

function setProductStockFilter(filterKey) {
    currentProductStockFilter = getProductStockFilter(filterKey).key;

    document.querySelectorAll('.product-stock-filter-chip').forEach(chip => {
        const isActive = chip.getAttribute('onclick')?.includes(`'${currentProductStockFilter}'`);
        chip.classList.toggle('active', Boolean(isActive));
        chip.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const input = document.getElementById('search-input');
    updateProductSearchStatus(input?.value || '');
    performSearch();
}

window.setProductStockFilter = setProductStockFilter;

async function renderSearchScreen(push = true) {
    if (currentScreen === 'search' && document.getElementById('search-input')) {
        console.log('[BUSCA MOBILE DEBUG] re-render ignorado (jﾃ｡ ativo)');
        await ensureProdutosLoaded();
        updateProductSearchStatus(document.getElementById('search-input')?.value || '');
        return;
    }
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return renderLogin();
    
    await ensureProdutosLoaded();

    currentScreen = 'search';
    if (push) pushNav('search');
    
    app.innerHTML = `
        <div class="dashboard-screen fade-in internal product-search-screen">
            ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderMenu()')}
            
            <main class="container product-search-center">
                <header class="search-header">
                    <p class="search-kicker">CONSULTA OPERACIONAL</p>
                    <h1 class="search-title">PRODUTOS</h1>
                </header>

                <div class="search-bar-wrapper">
                    <div class="product-search-bar">
                        <span class="material-symbols-rounded search-icon">search</span>
                        <input
                            type="search"
                            id="search-input"
                            class="product-search-input"
                            placeholder="Buscar por nome, EAN, ID interno ou bipar produto..."
                            autocomplete="off"
                            autocorrect="off"
                            autocapitalize="none"
                            spellcheck="false"
                            inputmode="search"
                            oninput="debouncedSearch()"
                            onkeypress="if(event.key === 'Enter') handleSearchEnter(event)"
                            onkeydown="handleSearchKeyDown(event)"
                        />

                        <div class="search-actions">
                            <button class="product-search-camera-btn" type="button" aria-label="Escanear" onclick="startScanner()">
                                <span class="material-symbols-rounded">qr_code_scanner</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="search-filters-section">
                    <div class="section-header">
                        <h2 class="section-subtitle">FILTROS Rﾃ￣IDOS</h2>
                        <div id="product-search-status" class="product-search-status-badge">
                            ${getProductSearchStatusText('')}
                        </div>
                    </div>
                    ${renderProductStockFilterChips()}
                </div>
                
                <div id="scanner-container" class="hidden">
                    <div id="reader"></div>
                    <button class="scanner-close-btn" onclick="stopScanner()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </div>
                
                <div id="search-results" class="product-search-results">
                    <div id="search-initial-state" class="search-empty-state">
                        <div class="empty-state-visual">
                            <div class="empty-state-icon-glow"></div>
                            <span class="material-symbols-rounded">manage_search</span>
                        </div>
                        <div class="empty-state-content">
                            <h3>Busca Inteligente</h3>
                            <p>Localize produtos instantaneamente por descriﾃｧﾃ｣o, EAN, SKU ou ID.</p>
                        </div>
                        <div class="search-quick-stats">
                            <div class="stat-item">
                                <span class="stat-value">${appData.products?.length || 0}</span>
                                <span class="stat-label">Produtos</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${getProductStockFilterCount('DISPONIVEL')}</span>
                                <span class="stat-label">Em Estoque</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;
    
    setTimeout(() => {
        const input = document.getElementById('search-input');
        if (input) {
            input.focus();
        }
    }, 100);
}



let html5QrCode = null;
let lastScanTime = 0;
let isScannerStarting = false;

async function startScanner(isPicking = false, isConference = false, isInventory = false, isGarantia = false, isEdit = false) {
    if (isScannerStarting) return;
    isScannerStarting = true;

    // Use specific IDs based on context to avoid conflicts
    let containerId = 'scanner-container';
    let readerId = 'reader';
    let inputId = 'search-input';

    if (isInventory) {
        containerId = 'scanner-container-inv';
        readerId = 'reader-inv';
        inputId = 'inv-ean-input';
    } else if (isPicking) {
        containerId = 'scanner-container-pick';
        readerId = 'reader-pick';
        inputId = 'pick-ean-input';
    } else if (isConference) {
        containerId = 'scanner-container-pack';
        readerId = 'reader-pack';
        inputId = 'pack-ean-input';
    } else if (isGarantia) {
        containerId = 'scanner-container-garantia';
        readerId = 'reader-garantia';
        inputId = 'garantia-search-input';
    } else if (isEdit) {
        containerId = 'scanner-container-edit';
        readerId = 'reader-edit';
        inputId = 'edit-search-input';
    }

    const scannerContainer = document.getElementById(containerId);
    const inputField = document.getElementById(inputId);

    if (!scannerContainer) {
        isScannerStarting = false;
        return;
    }

    // Prevent keyboard from opening during scanning
    if (inputField) {
        inputField.setAttribute('inputmode', 'none');
        inputField.blur();
    }

    // Ensure any previous scanner is fully stopped
    try {
        await stopScanner();
        await stopManualNFScanner();
        // Small delay to allow hardware to release
        await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
        console.warn("Error during pre-scan cleanup:", e);
    }

    scannerContainer.classList.remove('hidden');
    scannerContainer.style.borderColor = 'var(--primary)';

    html5QrCode = new Html5Qrcode(readerId);

    // Optimized config for mobile barcode reading
    const config = {
        fps: 30,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.9);
            return { width: size, height: size * 0.6 };
        },
        aspectRatio: 1.0,
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
        },
        // Forﾃｧar formatos especﾃｭficos para maior velocidade
        formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE
        ]
    };


    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            async (decodedText) => {
                const now = Date.now();
                if (now - lastScanTime < 1500) return;
                lastScanTime = now;

                console.log(`[SCANNER] Decoded: ${decodedText}`);

                let context = 'search';
                if (isInventory) context = 'inventory';
                else if (isPicking) context = 'picking';
                else if (isConference) context = 'conference';
                else if (isGarantia) context = 'garantia';
                else if (isEdit) context = 'edit';

                const product = await handleProductScan(decodedText, context);

                // Se nﾃ｣o for busca, precisa tratar as funﾃｧﾃｵes especﾃｭficas
                if (product) {
                    if (isInventory) addInventoryItem(decodedText);
                    else if (isPicking) addPickItem(decodedText);
                    else if (isConference) addPackScan(decodedText);
                }
            },

            (errorMessage) => {
                // parse error, ignore it.
            }
        );
    } catch (err) {
        console.error("Scanner error:", err);
        showToast("Cﾃ｢mera em uso ou nﾃ｣o disponﾃｭvel. Tente novamente.");
        scannerContainer.classList.add('hidden');
    } finally {
        isScannerStarting = false;
    }
}

async function showScannerFeedback(type, containerId = 'scanner-container') {
    const container = document.getElementById(containerId);
    const feedback = document.getElementById('scanner-feedback');
    const icon = document.getElementById('scanner-feedback-icon');

    if (!container || !feedback || !icon) return;

    if (type === 'success') {
        container.style.borderColor = '#22c55e'; // Green
        feedback.style.background = 'rgba(254, 240, 138, 0.3)'; // Light yellow background
        icon.innerText = 'check_circle';
        icon.style.color = '#854d0e'; // Darker yellow icon

        // Show "PRODUTO OK" text if picking or conference
        const feedbackText = document.createElement('div');
        feedbackText.innerText = 'PRODUTO OK';
        feedbackText.style.position = 'absolute';
        feedbackText.style.top = '15%'; // Positioned at the top
        feedbackText.style.background = '#fef08a'; // Light yellow background
        feedbackText.style.color = '#854d0e'; // Darker yellow text
        feedbackText.style.padding = '8px 24px';
        feedbackText.style.borderRadius = '99px';
        feedbackText.style.fontWeight = '900';
        feedbackText.style.fontSize = '1.2rem';
        feedbackText.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
        feedback.appendChild(feedbackText);

        setTimeout(() => feedbackText.remove(), 1200);
    } else {
        container.style.borderColor = '#eab308'; // Yellow
        feedback.style.background = 'rgba(234, 179, 8, 0.4)';
        icon.innerText = 'warning';
    }

    feedback.style.display = 'flex';

    // Wait for feedback to be visible
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Reset feedback
    feedback.style.display = 'none';
    container.style.borderColor = 'var(--primary)';
}

async function stopScanner() {
    if (html5QrCode) {
        try {
            if (html5QrCode.isScanning) {
                await html5QrCode.stop();
            }
        } catch (err) {
            console.error("Error stopping scanner:", err);
        } finally {
            html5QrCode = null;
        }
    }

    // Restore inputmode
    const inputs = ['search-input', 'pick-ean-input', 'pack-ean-input', 'garantia-search-input', 'edit-search-input'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.removeAttribute('inputmode');
    });

    // Hide all potential scanner containers
    const containers = [
        'scanner-container',
        'scanner-container-pick',
        'scanner-container-pack',
        'scanner-container-garantia',
        'scanner-container-edit'
    ];

    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.classList.add('hidden');
            container.style.borderColor = 'var(--primary)';
        }
    });
}

function showProductDetailsByCode(code) {
    if (!code) return;
    const searchCode = code.toString().trim().toLowerCase();

    const product = appData.products.find(p =>
        (p.ean && p.ean.toString().toLowerCase() === searchCode) ||
        (p.sku_fornecedor && p.sku_fornecedor.toString().toLowerCase() === searchCode) ||
        (p.id_interno && p.id_interno.toString().toLowerCase() === searchCode) ||
        (p.col_B && p.col_B.toString().toLowerCase() === searchCode)
    );

    if (product) {
        renderProductDetails(product);
    } else {
        playBeep('error');
        showToast(`PRODUTO Nﾃグ CADASTRADO: ${code}`);
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.value = '';
            performSearch();
            searchInput.focus();
        }
    }
}

const doPerformSearch = async () => {
    console.log('[BUSCA MOBILE DEBUG] executando busca...');
    const start = performance.now();
    const input = document.getElementById('search-input');
    if (!input) return;
    
    const queryRaw = input.value.trim();
    console.log('[BUSCA MOBILE DEBUG] termo digitado:', queryRaw);
    const activeStockFilter = getProductStockFilter();
    const hasLocationFilter = activeStockFilter.key !== 'TODOS';
    updateProductSearchStatus(queryRaw);
    if ((!queryRaw || queryRaw.length < 2) && !hasLocationFilter) {
        const resultsContainer = document.getElementById('search-results');
        if (resultsContainer) resultsContainer.innerHTML = '';
        return;
    }

    // 1. Classificaﾃｧﾃ｣o Inteligente e Auto-open (Somente se nﾃ｣o for texto genﾃｩrico e tiver tamanho mﾃｭnimo)
    const classification = classifyProductInput(queryRaw);
    if (queryRaw && classification.type !== 'text' && classification.type !== 'empty' && queryRaw.length >= 4) {
        const matchedProduct = await handleProductScan(queryRaw, 'search');
        if (matchedProduct) {
            input.value = '';
            const resultsContainer = document.getElementById('search-results');
            if (resultsContainer) resultsContainer.innerHTML = '';
            console.log('[BUSCA MOBILE DEBUG] match exato encontrado, abrindo detalhes');
            return;
        }
    }

    const query = normalizeProductSearchTerm(queryRaw);
    console.log('[BUSCA DEBUG] termo original:', queryRaw);
    console.log('[BUSCA DEBUG] termo normalizado:', query);

    // 2. Busca Local no ﾃ肱dice
    const productsSource = Array.isArray(appData.products) ? appData.products : [];
    const textResults = query.length >= 2
        ? productsSource.filter(p => p._searchIndex.includes(query))
        : productsSource.slice();
    const results = applyProductStockLocationFilter(textResults);

    // 3. Score de Relevﾃ｢ncia e Ordenaﾃｧﾃ｣o
    const finalResults = results
        .sort((a, b) => {
            // Prioridade 1: Ativos primeiro (opcional, mas recomendado para ERP)
            const statusA = String(a.status || "ativo").toLowerCase();
            const statusB = String(b.status || "ativo").toLowerCase();
            const isAtivoA = statusA === 'ativo' || statusA === 'sim' || statusA === '1';
            const isAtivoB = statusB === 'ativo' || statusB === 'sim' || statusB === '1';
            
            if (isAtivoA && !isAtivoB) return -1;
            if (!isAtivoA && isAtivoB) return 1;

            if (query.length >= 2) {
                // Prioridade 2: Score de termo (StartsWith > Includes)
                const getScore = (p) => {
                    if (p._dBaseNorm.startsWith(query)) return 0;
                    if (p._dFullNorm.startsWith(query)) return 1;
                    if (p._dBaseNorm.includes(query)) return 2;
                    if (p._dFullNorm.includes(query)) return 3;
                    if (p._brandCatSubNorm.includes(query)) return 4;
                    return 5; // Outros campos (EAN, SKU, Atributos)
                };

                const scoreA = getScore(a);
                const scoreB = getScore(b);

                if (scoreA !== scoreB) return scoreA - scoreB;
            }

            if (hasLocationFilter) {
                const qtyA = getStockLocationQty(a.id_interno || a.col_A, activeStockFilter.key);
                const qtyB = getStockLocationQty(b.id_interno || b.col_A, activeStockFilter.key);
                if (qtyA !== qtyB) return qtyB - qtyA;
            }

            // Prioridade 3: Alfabﾃｩtica
            return a._dBaseNorm.localeCompare(b._dBaseNorm);
        })
        .slice(0, 50);

    const end = performance.now();
    console.log(`[BUSCA DEBUG] Local: "${queryRaw}" | Filtro estoque: ${activeStockFilter.key} | Encontrados: ${results.length} | Exibindo: ${finalResults.length} | Tempo: ${Math.round(end - start)}ms`);
    
    renderSearchResults(finalResults);
    
    if (finalResults.length > 0) {
        showPageSearchSignal('success');
    }

    // Mostrar alerta apﾃｳs falha na busca, diferenciando cﾃｳdigo bipado/digitado de texto comum
    if (finalResults.length === 0 && queryRaw.length >= 3) {
        console.log('[BUSCA DEBUG] nenhum resultado real encontrado na busca');
        const isPotentialCode = queryRaw.length >= 6 && !queryRaw.includes(' ');
        showScanFeedback('warning', isPotentialCode ? 'PRODUTO Nﾃグ CADASTRADO' : 'PRODUTO Nﾃグ EXISTE');
    }
};

window.performSearch = debounce(doPerformSearch, 300);

// Criar versﾃ｣o debounced da busca para evitar processamento excessivo ao digitar
let lastSearchQuery = '';
const debouncedSearch = debounce(async () => {
    const input = document.getElementById('search-input');
    if (!input) return;
    const query = input.value.trim();
    if (query === lastSearchQuery) return;
    lastSearchQuery = query;
    await performSearch();
}, 300);

function handleSearchEnter(event) {
    if (event.key === 'Enter') {
        const rawValue = event.target.value.trim();
        if (!rawValue) return;
        handleProductScan(rawValue, 'search');
    }
}


function renderSearchResults(results) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;

    const query = document.getElementById('search-input')?.value?.trim().toLowerCase() || '';

    if (results.length === 0) {
        if (query.length < 2) {
            renderSearchScreen(false);
            return;
        }
        resultsContainer.innerHTML = `
            <div class="search-no-results">
                <span class="material-symbols-rounded">search_off</span>
                <h3>Nenhum produto encontrado</h3>
                <p>Verifique a ortografia ou tente termos mais genﾃｩricos.</p>
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = results.map((p, index) => {
        const idInterno = p.id_interno || p.col_A || '-';
        const ean = p.ean || p.col_B || '-';
        const desc = p.descricao_completa || p.col_C || 'Produto sem descriﾃｧﾃ｣o';
        const marca = p.marca || p.col_E || '-';
        const imgUrl = p.imagem_url || p.col_F || '';
        const precoVarejo = p.preco_varejo || p.col_G || 0;
        const status = (p.ativo || p.col_H || 'SIM').toString().toUpperCase();
        const isAtivo = status === 'SIM' || status === 'TRUE';

        // Obter estoque principal (Disponﾃｭvel)
        const estoque = getAvailableStockCache(idInterno);
        const localPrincipal = 'Tﾃ嘘REO'; 

        return `
            <div class="search-result-card ${!isAtivo ? 'inactive' : ''}" 
                 onclick="showProductDetails('${idInterno}')" 
                 role="option" 
                 data-index="${index}"
                 tabindex="0"
                 onkeydown="handleSearchKeyDown(event)">
                <div class="card-image-wrapper">
                    ${imgUrl ? `<img src="${imgUrl}" alt="${desc}" loading="lazy">` : `<span class="material-symbols-rounded">image</span>`}
                </div>
                
                <div class="card-main-info">
                    <div class="card-header-row">
                        <span class="card-brand">${marca}</span>
                        <span class="card-id">ID: ${idInterno}</span>
                    </div>
                    <h3 class="card-title">${highlightMatch(desc, query)}</h3>
                    <div class="card-meta-row">
                        <span class="card-ean"><span class="material-symbols-rounded">barcode</span>${ean}</span>
                    </div>
                </div>

                <div class="card-operational-info">
                    <div class="card-stock-block">
                        <span class="stock-label">ESTOQUE</span>
                        <span class="stock-value ${estoque <= 0 ? 'out' : ''}">${estoque} <small>un</small></span>
                        <span class="stock-location">${localPrincipal}</span>
                    </div>
                    <div class="card-price-block">
                        <span class="price-label">PREﾃ⑯ VAREJO</span>
                        <span class="price-value">R$ ${Number(precoVarejo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>

                <div class="card-status-indicator ${isAtivo ? 'active' : 'inactive'}"></div>
            </div>
        `;
    }).join('');

    updateProductSearchStatus(query);
}

function highlightMatch(text, query) {
    if (!query || query.length < 2) return text;
    try {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
        return parts.map(part => 
            part.toLowerCase() === query.toLowerCase() 
                ? `<span class="search-highlight">${part}</span>` 
                : part
        ).join('');
    } catch (e) {
        return text;
    }
}

function handleSearchKeyDown(e) {
    const results = document.querySelectorAll('.search-result-card');
    if (results.length === 0) return;

    let currentIndex = Array.from(results).findIndex(el => el === document.activeElement);

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % results.length;
        results[nextIndex].focus();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + results.length) % results.length;
        results[prevIndex].focus();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentIndex !== -1) {
            results[currentIndex].click();
        } else {
            results[0].click();
        }
    } else if (e.key === 'Escape') {
        const input = document.getElementById('search-input');
        if (input) {
            input.value = '';
            debouncedSearch();
            input.focus();
        }
    }
}



function showProductDetails(id) {
    const product = appData.products.find(p => p.ean == id || p.id_interno == id);
    if (!product) return;
    renderProductDetails(product);
}

function openImageModal(url) {
    if (!url) return;
    const modal = document.createElement('div');
    modal.id = 'image-modal';
    modal.className = 'image-modal';
    
    // Closer on background click
    modal.onclick = (e) => {
        if (e.target.id === 'image-modal' || e.target.className === 'image-modal-content') {
            closeImageModal();
        }
    };

    modal.innerHTML = `
                <div class="image-modal-content">
                    <button class="image-modal-close" onclick="closeImageModal()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                    <img src="${url}" alt="Zoom" id="modal-image-zoom">
                </div>
            `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Premium Interaction: Click to Zoom
    const img = modal.querySelector('img');
    let isZoomed = false;
    img.onclick = (e) => {
        e.stopPropagation();
        isZoomed = !isZoomed;
        if (isZoomed) {
            img.style.transform = 'scale(1.5)';
            img.style.cursor = 'zoom-out';
modal.style.overflow = 'auto';
            img.style.maxHeight = 'none';
        } else {
            img.style.transform = 'scale(1)';
            img.style.cursor = 'zoom-in';
            modal.style.overflow = 'hidden';
            img.style.maxHeight = '90vh';
        }
    };
    img.style.cursor = 'zoom-in';
    img.style.transition = 'transform 0.4s cubic-bezier(0.19, 1, 0.22, 1)';
}

function closeImageModal() {
    const modal = document.getElementById('image-modal');
    if (modal) {
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 0.2s ease';
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 200);
    }
}

// ==== Lﾃ敵ICA DE ESTOQUE E LOCAIS ====
const LOCAIS_DISPONIVEIS = ['TERREO', 'MOSTRUARIO', 'PRIMEIRO_ANDAR'];
const LOCAIS_SAIDA = ['TERREO', 'MOSTRUARIO'];
const LOCAIS_NAO_VENDAVEIS = ['DEFEITO', 'EM_GARANTIA', 'EM_TRANSPORTE'];
const LOCAIS_EXTERNOS = ['FULL_ML'];

function normalizarLocal(local) {
  return normalizeLocal(local);
}

function calcularEstoqueDisponivel(estoques) {
  if (!estoques || !Array.isArray(estoques)) return 0;
  return estoques
    .filter(item => LOCAIS_DISPONIVEIS.includes(normalizarLocal(item.local)))
    .reduce((total, item) => {
        const qtd = parseFloat(String(item.saldo_total || item.saldo || 0).replace(',', '.'));
        return total + (isNaN(qtd) ? 0 : qtd);
    }, 0);
}

function calcularEstoqueNaoVendavel(estoques) {
  if (!estoques || !Array.isArray(estoques)) return 0;
  return estoques
    .filter(item => LOCAIS_NAO_VENDAVEIS.includes(normalizarLocal(item.local)))
    .reduce((total, item) => {
        const qtd = parseFloat(String(item.saldo_total || item.saldo || 0).replace(',', '.'));
        return total + (isNaN(qtd) ? 0 : qtd);
    }, 0);
}

function parseStockQty(value) {
    const qty = parseFloat(String(value ?? 0).replace(',', '.'));
    return isNaN(qty) ? 0 : qty;
}

function getStockQtyByLocal(estoques, local) {
    if (!Array.isArray(estoques)) return 0;
    const wanted = normalizeLocal(local);
    return estoques
        .filter(item => normalizeLocal(item.local) === wanted)
        .reduce((total, item) => total + parseStockQty(item.saldo_total ?? item.saldo), 0);
}

function calcularEstoqueOperacional(estoques) {
    return getStockQtyByLocal(estoques, 'TERREO') + getStockQtyByLocal(estoques, 'PRIMEIRO_ANDAR');
}

function normalizeQtdPorCaixa(value) {
    const qty = parseFloat(String(value ?? 1).replace(',', '.'));
    return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function readQtdPorCaixaInput(inputId) {
    const input = document.getElementById(inputId);
    const raw = String(input?.value ?? '').trim();
    const qty = parseFloat(raw.replace(',', '.'));
    if (!raw || !Number.isFinite(qty) || qty <= 0) {
        showToast('Quantidade por caixa deve ser maior que zero.', 'error');
        input?.focus();
        return null;
    }
    return qty;
}

function formatStockNumber(value) {
    const num = parseFloat(String(value ?? 0).replace(',', '.'));
    if (!Number.isFinite(num)) return '0';
    return Number.isInteger(num) ? String(num) : num.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function getPackagingBreakdown(product, estoqueDisponivel) {
    const qtdPorCaixa = normalizeQtdPorCaixa(product?.qtd_por_caixa);
    const estoque = parseStockQty(estoqueDisponivel);
    return {
        qtdPorCaixa,
        caixasFechadas: Math.floor(estoque / qtdPorCaixa),
        unidadesAvulsas: estoque % qtdPorCaixa
    };
}

function renderVolumeSummary(product, estoqueDisponivel) {
    const { qtdPorCaixa, caixasFechadas, unidadesAvulsas } = getPackagingBreakdown(product, estoqueDisponivel);
    if (qtdPorCaixa <= 1) return 'Venda avulsa / 1 UN';
    return `${formatStockNumber(caixasFechadas)} CX + ${formatStockNumber(unidadesAvulsas)} UN`;
}

function isInitialInventoryType(type) {
    return String(type || '').trim().toLowerCase() === 'inicial';
}

function renderInventoryQuantitySummary(product, item, expectedQty) {
    const countedQty = Number(item?.qty || 0);
    if (isInitialInventoryType(appData.currentInventory?.type)) {
        return `
            <span class="inv-expected-stock">
                <strong>Saldo Inicial:</strong> ${formatStockNumber(countedQty)} UN
                ${normalizeQtdPorCaixa(product?.qtd_por_caixa) > 1 ? `<small>${renderVolumeSummary(product, countedQty)}</small>` : ''}
            </span>
        `;
    }

    const diffQty = countedQty - expectedQty;
    return `
        <span class="inv-expected-stock inv-count-comparison">
            <span><strong>Esperado:</strong> ${formatStockNumber(expectedQty)} UN</span>
            <span><strong>Contado:</strong> ${formatStockNumber(countedQty)} UN</span>
            <span class="${diffQty === 0 ? 'is-ok' : diffQty > 0 ? 'is-positive' : 'is-negative'}"><strong>Diferenﾃｧa:</strong> ${diffQty > 0 ? '+' : ''}${formatStockNumber(diffQty)} UN</span>
            ${normalizeQtdPorCaixa(product?.qtd_por_caixa) > 1 ? `<small>${renderVolumeSummary(product, expectedQty)}</small>` : ''}
        </span>
    `;
}

function getProductStockEntriesFromCache(idInterno) {
    if (!appData.estoque) return [];
    const id = String(idInterno || '');
    return appData.estoque.filter(s => String(s.id_interno || s.id || '') === id);
}

function getProductOperationalStockCache(idInterno) {
    return calcularEstoqueOperacional(getProductStockEntriesFromCache(idInterno));
}

function getProductShowroomStockCache(idInterno) {
    return getStockQtyByLocal(getProductStockEntriesFromCache(idInterno), 'MOSTRUARIO');
}

function getStockStatusClass(disponivel, minimo) {
    if (disponivel <= 0) return 'is-zero';
    if (minimo > 0 && disponivel <= minimo) return 'is-low';
    return 'is-good';
}

function isFilledValue(value) {
    const v = String(value ?? '').trim();
    if (!v) return false;
    return !['null', 'undefined', 'empty', 's/n', 'sn', '-', '--'].includes(v.toLowerCase());
}

function renderInfoRows(rows) {
    const validRows = rows.filter(row => isFilledValue(row.value));
    if (!validRows.length) return '';
    return validRows.map(row => `
        <div class="product-info-row">
            <span class="product-info-label">${row.label}</span>
            <span class="product-info-value">${row.value}</span>
        </div>
    `).join('');
}

function renderInfoBlock(title, rows) {
    const body = renderInfoRows(rows);
    if (!body) return '';
    return `
        <section class="product-info-block">
            <div class="product-info-block-title">${title}</div>
            <div class="product-info-block-body">${body}</div>
        </section>
    `;
}

function getProductAttrMap(product) {
    const map = {};
    safeParseAtributos(product?.atributos).forEach(attr => {
        const key = normalizeText(attr.nome || '').replace(/\s+/g, '_');
        if (key && isFilledValue(attr.valor)) map[key] = normalizeText(attr.valor);
    });
    return map;
}

function getComparableAttr(attrMap, names) {
    for (const name of names) {
        const key = normalizeText(name).replace(/\s+/g, '_');
        if (isFilledValue(attrMap[key])) return attrMap[key];
    }
    return '';
}

function getEquivalentProducts(p) {
    if (!appData.products || !p) return [];
    
    const attrs = safeParseAtributos(p.atributos);
    const norm = (val) => String(val || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Prioridade 1: Cﾃｳdigo Equivalente (Regra Principal)
    const codEquivalenteAttr = attrs.find(a => norm(a.nome).includes('equivalente'));
    const codEquivalente = (codEquivalenteAttr && norm(codEquivalenteAttr.valor)) ? norm(codEquivalenteAttr.valor) : null;
    
    if (codEquivalente && codEquivalente !== 'null' && codEquivalente !== 'undefined') {
        return appData.products.filter(other => {
            if (other.id_interno === p.id_interno) return false;
            const otherAttrs = safeParseAtributos(other.atributos);
            const otherCod = otherAttrs.find(a => norm(a.nome).includes('equivalente'));
            return otherCod && norm(otherCod.valor) === codEquivalente;
        }).slice(0, 5);
    }
    
    // 2. Prioridade 2: Fallback Seguro (Combinaﾃｧﾃ｣o Obrigatﾃｳria)
    const ATRIBUTOS_OBRIGATORIOS = ['tipo', 'modelo', 'encaixe', 'tensao', 'potencia', 'polos', 'pinos', 'aplicacao'];
    const ATRIBUTOS_CONDICIONAIS = ['cor', 'lado', 'acabamento'];
    const ATRIBUTOS_CHAVE = [...ATRIBUTOS_OBRIGATORIOS, ...ATRIBUTOS_CONDICIONAIS];
    
    const pTechAttrs = {};
    attrs.forEach(a => {
        const nome = norm(a.nome);
        if (ATRIBUTOS_CHAVE.includes(nome)) {
            pTechAttrs[nome] = norm(a.valor);
        }
    });

    // Seguranﾃｧa: Se nﾃ｣o houver atributos tﾃｩcnicos suficientes para garantir equivalﾃｪncia, Nﾃグ agrupar.
    // Exigimos pelo menos 1 atributo tﾃｩcnico chave para o fallback.
    if (Object.keys(pTechAttrs).length === 0) return [];

    const pDesc = norm(p.descricao_base);
    const pCat = norm(p.categoria);
    const pSub = norm(p.subcategoria);
    
    // Regra 3: Nﾃグ permitir agrupamento usando apenas descricao_base (sem categoria/sub ou atributos)
    if (!pDesc || !pCat) return [];

    return appData.products.filter(other => {
        if (other.id_interno === p.id_interno) return false;
        
        // Deve ser de marca diferente (equivalﾃｪncia inter-marcas)
        if (norm(other.marca) === norm(p.marca)) return false;

        // Validaﾃｧﾃ｣o de Descriﾃｧﾃ｣o, Categoria e Subcategoria
        if (norm(other.descricao_base) !== pDesc) return false;
        if (norm(other.categoria) !== pCat) return false;
        if (norm(other.subcategoria) !== pSub) return false;
        
        // Validaﾃｧﾃ｣o de Atributos Tﾃｩcnicos
        const otherAttrs = safeParseAtributos(other.atributos);
        const otherTechAttrs = {};
        otherAttrs.forEach(a => {
            const nome = norm(a.nome);
            if (ATRIBUTOS_CHAVE.includes(nome)) {
                otherTechAttrs[nome] = norm(a.valor);
            }
        });
        
        // 1. Validar Atributos Obrigatﾃｳrios (Devem ser idﾃｪnticos, inclusive se um estiver vazio e o outro nﾃ｣o)
        for (const key of ATRIBUTOS_OBRIGATORIOS) {
            if (pTechAttrs[key] !== otherTechAttrs[key]) return false;
        }
        
        // 2. Validar Atributos Condicionais (Se P tem valor, OTHER deve ter o mesmo valor. Se P estﾃ｡ vazio, ignora)
        for (const key of ATRIBUTOS_CONDICIONAIS) {
            if (pTechAttrs[key] && pTechAttrs[key] !== otherTechAttrs[key]) return false;
        }

        return true;
    }).slice(0, 5);
}

function getAvailableStockCache(idInterno) {
    return getProductOperationalStockCache(idInterno);
}

function sortEquivalentProductsForDetail(a, b) {
    const stockDiff = getProductOperationalStockCache(b.id_interno) - getProductOperationalStockCache(a.id_interno);
    if (stockDiff !== 0) return stockDiff;

    const activeA = (a.status === 'inativo' || a.status === 'nao' || a.status === '0') ? 0 : 1;
    const activeB = (b.status === 'inativo' || b.status === 'nao' || b.status === '0') ? 0 : 1;
    if (activeA !== activeB) return activeB - activeA;

    const brandCompare = String(a.marca || '').localeCompare(String(b.marca || ''), 'pt-BR');
    if (brandCompare !== 0) return brandCompare;

    const priceA = parseFloat(String(a.preco_varejo || 0).replace(',', '.')) || 0;
    const priceB = parseFloat(String(b.preco_varejo || 0).replace(',', '.')) || 0;
    return priceA - priceB;
}

function getEquivalentProductsForDetail(p) {
    if (!appData.products || !p) return [];

    const norm = (val) => String(val || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isSameProduct = (other) => String(other.id_interno || '') === String(p.id_interno || '') || String(other.ean || '') === String(p.ean || '');
    const attrs = safeParseAtributos(p.atributos);
    const codEquivalenteAttr = attrs.find(a => {
        const nome = norm(a.nome).replace(/\s+/g, '_');
        return nome === 'codigo_equivalente' || nome.includes('codigo_equivalente');
    });
    const codEquivalente = codEquivalenteAttr && isFilledValue(codEquivalenteAttr.valor) ? norm(codEquivalenteAttr.valor) : null;

    if (codEquivalente) {
        return appData.products.filter(other => {
            if (isSameProduct(other)) return false;
            const otherAttrs = safeParseAtributos(other.atributos);
            const otherCod = otherAttrs.find(a => {
                const nome = norm(a.nome).replace(/\s+/g, '_');
                return nome === 'codigo_equivalente' || nome.includes('codigo_equivalente');
            });
            return otherCod && norm(otherCod.valor) === codEquivalente;
        }).sort(sortEquivalentProductsForDetail).slice(0, 8);
    }

    const pDesc = norm(p.descricao_base);
    const pCat = norm(p.categoria);
    const pSub = norm(p.subcategoria);
    if (!pDesc || !pCat || !pSub) return [];

    const pMap = getProductAttrMap(p);
    const requiredGroups = [
        ['modelo'],
        ['tipo_lampada', 'tipo'],
        ['voltagem', 'tensao'],
        ['potencia']
    ];
    const optionalGroups = [['encaixe']];
    const conditionalGroups = [['cor'], ['acabamento'], ['lado'], ['linha'], ['aplicacao']];
    const pRequired = requiredGroups.map(group => getComparableAttr(pMap, group));
    if (pRequired.some(value => !isFilledValue(value))) return [];
    const pOptional = optionalGroups.map(group => getComparableAttr(pMap, group));
    const pConditional = conditionalGroups.map(group => getComparableAttr(pMap, group));

    return appData.products.filter(other => {
        if (isSameProduct(other)) return false;
        if (norm(other.descricao_base) !== pDesc) return false;
        if (norm(other.categoria) !== pCat) return false;
        if (norm(other.subcategoria) !== pSub) return false;

        const otherMap = getProductAttrMap(other);
        for (let i = 0; i < requiredGroups.length; i++) {
            if (pRequired[i] !== getComparableAttr(otherMap, requiredGroups[i])) return false;
        }
        for (let i = 0; i < optionalGroups.length; i++) {
            if (isFilledValue(pOptional[i]) && pOptional[i] !== getComparableAttr(otherMap, optionalGroups[i])) return false;
        }
        for (let i = 0; i < conditionalGroups.length; i++) {
            if (isFilledValue(pConditional[i]) && pConditional[i] !== getComparableAttr(otherMap, conditionalGroups[i])) return false;
        }

        return true;
    }).sort(sortEquivalentProductsForDetail).slice(0, 8);
}

window.toggleMoreInfo = function() {
    const content = document.getElementById('more-info-content');
    const label = document.getElementById('more-info-label');
    const mobileSecondary = document.querySelectorAll('.collapsible-mobile');
    
    if (content && label) {
        const isHidden = content.classList.toggle('hidden');
        const isOpen = !isHidden;
        
        // Toggle mobile-specific secondary info
        mobileSecondary.forEach(el => {
            if (isHidden) el.classList.remove('open');
            else el.classList.add('open');
        });

        label.innerText = 'Info';
        label.closest('.product-more-info-btn')?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
};


async function renderProductDetails(p) {
    const currentUser = localStorage.getItem('currentUser');
    const idInterno = (p.id_interno || p.col_A || '').toString();
    window.currentProductDetailForEdit = p;

    let productStockEntries = [];
    try {
        productStockEntries = await DataClient.fetchEstoqueProdutoSupabase(idInterno);
    } catch (e) {
        console.log('[DETALHE] Estoque via cache local');
    }

    if (productStockEntries.length === 0) {
        productStockEntries = (appData.estoque || []).filter(s => {
            const hasId = s.id_interno && s.id_interno.toString() === idInterno;
            if (!hasId) return false;
            const total = parseFloat((s.saldo_total || s.saldo || '0').toString().replace(',', '.'));
            return total > 0;
        });
    }

    const terreoQty = getStockQtyByLocal(productStockEntries, 'TERREO');
    const primeiroAndarQty = getStockQtyByLocal(productStockEntries, 'PRIMEIRO_ANDAR');
    const mostruarioQty = getStockQtyByLocal(productStockEntries, 'MOSTRUARIO');
    const defeitoQty = getStockQtyByLocal(productStockEntries, 'DEFEITO');
    const garantiaQty = getStockQtyByLocal(productStockEntries, 'EM_GARANTIA');
    const transporteQty = getStockQtyByLocal(productStockEntries, 'EM_TRANSPORTE');
    const fullMlQty = getStockQtyByLocal(productStockEntries, 'FULL_ML');
    const disponivel = calcularEstoqueOperacional(productStockEntries);
    const naoVendavel = calcularEstoqueNaoVendavel(productStockEntries);
    const totalStock = disponivel + naoVendavel;

    const equivalentes = getEquivalentProductsForDetail(p);

    const attrs = safeParseAtributos(p.atributos).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const rawPdf = p.url_pdf_manual || p.url_pdf;
    const pdfUrl = isValidUrl(rawPdf) ? rawPdf : null;

    const isInactiveProduct = (p.status === 'inativo' || p.status === 'nao' || p.status === '0');
    const statusColor = isInactiveProduct ? '#ef4444' : '#22c55e';
    const statusText = isInactiveProduct ? 'Inativo' : 'Ativo';
    const estoqueMinimo = parseStockQty(p.estoque_minimo);
    const stockStatusClass = getStockStatusClass(disponivel, estoqueMinimo);
    const unitLabel = p.unidade || 'UN';
    const packaging = getPackagingBreakdown(p, disponivel);
    const packagingHTML = `
        <div class="product-packaging-card">
            <div class="product-packaging-header">
                <span class="material-symbols-rounded">inventory</span>
                <span>Embalagem / Volume</span>
            </div>
            <div class="product-packaging-grid">
                <div class="product-packaging-item">
                    <span class="product-packaging-label">Embalagem</span>
                    <strong>${packaging.qtdPorCaixa > 1 ? `Caixa com ${formatStockNumber(packaging.qtdPorCaixa)} UN` : 'Venda avulsa / 1 UN'}</strong>
                </div>
                ${packaging.qtdPorCaixa > 1 ? `
                <div class="product-packaging-item">
                    <span class="product-packaging-label">Volume</span>
                    <strong>${formatStockNumber(packaging.caixasFechadas)} caixas fechadas + ${formatStockNumber(packaging.unidadesAvulsas)} unidades avulsas</strong>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    const stockAlerts = [
        (terreoQty === 0 && primeiroAndarQty > 0) ? {
            type: 'warning',
            icon: 'sync_alt',
            title: 'Disponﾃｭvel no 1ﾂｺ andar. Transferir para venda.',
            detail: `${primeiroAndarQty} ${unitLabel} no 1ﾂｺ andar`
        } : null,
        (terreoQty === 0 && primeiroAndarQty === 0 && mostruarioQty > 0) ? {
            type: 'showroom',
            icon: 'visibility',
            title: 'Somente mostruﾃ｡rio disponﾃｭvel. Verificar estado do produto antes da venda.',
            detail: `${mostruarioQty} ${unitLabel} no mostruﾃ｡rio`
        } : null,
        defeitoQty > 0 ? {
            type: 'subtle',
            icon: 'build_circle',
            title: `${defeitoQty} unidades em defeito.`,
            detail: ''
        } : null,
        transporteQty > 0 ? {
            type: 'subtle',
            icon: 'local_shipping',
            title: `${transporteQty} unidades em transporte.`,
            detail: ''
        } : null,
    fullMlQty > 0 ? {
        type: 'subtle',
        icon: 'warehouse',
        title: `${fullMlQty} unidades no FULL ML (estoque externo).`,
        detail: 'Depﾃｳsito Mercado Livre'
    } : null
    ].filter(Boolean);

    const stockAlertsHTML = stockAlerts.length ? `
        <div class="product-stock-alerts">
            ${stockAlerts.map(alert => `
                <div class="product-stock-alert ${alert.type}">
                    <span class="material-symbols-rounded">${alert.icon}</span>
                    <div>
                        <strong>${alert.title}</strong>
                        ${alert.detail ? `<small>${alert.detail}</small>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    ` : '';

    const renderProductMetaItem = (icon, label, value) => `
        <div class="product-detail-meta-item">
            <span class="material-symbols-rounded">${icon}</span>
            <strong>${label}:</strong>
            <span>${value || '-'}</span>
        </div>
    `;

    const stockIconByGroup = {
        operational: 'inventory_2',
        secondary: 'storefront',
        blocked: 'error',
        warranty: 'shield',
        transit: 'local_shipping',
        external: 'warehouse'
    };
    const renderStockLocationCard = (key, label, qty, group) => `
        <div class="product-stock-location ${qty === 0 ? 'is-empty' : ''}" data-stock-group="${group}" data-stock-key="${key}">
            <span class="product-stock-location-icon material-symbols-rounded">${stockIconByGroup[group] || 'inventory_2'}</span>
            <span class="product-stock-location-name">${label}</span>
            <span class="product-stock-location-value">
                <span class="product-stock-location-qty">${qty}</span>
                <span class="product-stock-location-unit">${unitLabel}</span>
            </span>
        </div>
    `;

    const stockLocationsHTML = `
        <div class="product-stock-locations">
            <div class="product-stock-title">ESTOQUE POR LOCAL</div>
            <div class="product-stock-group">
                <div class="product-stock-group-title">Disponﾃｭvel operacional</div>
                <div class="product-stock-grid">
                    ${renderStockLocationCard('TERREO', 'Tﾃｩrreo', terreoQty, 'operational')}
                    ${renderStockLocationCard('PRIMEIRO_ANDAR', '1ﾂｺ Andar', primeiroAndarQty, 'operational')}
                </div>
            </div>
            <div class="product-stock-group">
                <div class="product-stock-group-title">Estoque secundﾃ｡rio / nﾃ｣o disponﾃｭvel</div>
                <p class="product-stock-group-note">Mostruﾃ｡rio: venda opcional - verificar estado do produto.</p>
                <div class="product-stock-grid product-stock-grid-secondary">
                    ${renderStockLocationCard('MOSTRUARIO', 'Mostruﾃ｡rio', mostruarioQty, 'secondary')}
                    ${renderStockLocationCard('DEFEITO', 'Defeito', defeitoQty, 'blocked')}
                    ${renderStockLocationCard('EM_GARANTIA', 'Em Garantia', garantiaQty, 'warranty')}
                    ${renderStockLocationCard('EM_TRANSPORTE', 'Em Transporte', transporteQty, 'transit')}
                </div>
            </div>
            <div class="product-stock-group product-stock-group-external">
                <div class="product-stock-group-title" style="display: flex; align-items: center; gap: 6px;">
                    <span class="material-symbols-rounded" style="font-size: 16px; color: #f59e0b;">warehouse</span>
                    Estoque externo
                </div>
                <p class="product-stock-group-note">Depﾃｳsito Mercado Livre 窶� nﾃ｣o disponﾃｭvel para venda direta.</p>
                <div class="product-stock-grid">
                    ${renderStockLocationCard('FULL_ML', 'FULL ML', fullMlQty, 'external')}
                </div>
            </div>
        </div>
    `;

    const commercialInfoHTML = renderInfoBlock('Comercial', [
        { label: 'Marca', value: p.marca },
        { label: 'EAN', value: p.ean },
        { label: 'SKU', value: p.sku_fornecedor || p.sku },
        { label: 'Categoria', value: p.categoria },
        { label: 'Subcategoria', value: p.subcategoria }
    ]);
    const technicalInfoHTML = attrs.length ? renderInfoBlock('Tﾃｩcnico', attrs.map(attr => ({
        label: formatAttributeName(attr.nome),
        value: formatAttributeValue(attr.valor)
    }))) : '';
    const operationalInfoHTML = renderInfoBlock('Operacional', [
        { label: 'Estoque mﾃｭnimo', value: p.estoque_minimo },
        { label: 'Unidade', value: p.unidade },
        { label: 'Qtd. embalagem', value: p.quantidade_embalagem },
        { label: 'Mﾃｭnimo atacado', value: p.quantidade_minima_atacado },
        { label: 'Status', value: p.status }
    ]);
    const adminInfoHTML = renderInfoBlock('Administrativo', [
        { label: 'ID interno', value: idInterno },
        { label: 'Descriﾃｧﾃ｣o completa', value: p.descricao_completa },
        { label: 'Manual PDF', value: pdfUrl },
        { label: 'Observaﾃｧﾃｵes', value: p.observacoes }
    ]);

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal no-top-bar">
            ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderSearchScreen()')}
            
            <main class="container product-detail-screen">
                <div class="product-detail-card">
                    <div class="product-detail-top-actions">
                        ${pdfUrl ? `
                        <a href="${pdfUrl}" target="_blank" class="product-manual-icon-btn" title="Abrir manual do produto">
                            <span class="material-symbols-rounded">picture_as_pdf</span>
                        </a>
                        ` : ''}
                        
                        <!-- Botﾃ｣o Editar Produto -->
                        <button type="button" onclick="event.stopPropagation(); renderEditProductFormByEan('${(p.ean || idInterno).toString().replace(/'/g, "\\'")}')" class="product-edit-btn" title="Editar Produto">
                            <span class="material-symbols-rounded">edit</span>
                            <span>Editar</span>
                        </button>

                        <div class="product-status-chip" title="Status: ${statusText}">
                            <span class="status-indicator-dot" style="background-color: ${statusColor};"></span>
                        </div>
                    </div>
                    <!-- CABEﾃ②LHO PRINCIPAL -->
                    <div class="product-detail-header">
                        <div class="product-detail-img">
                            ${(p.url_imagem || p.image_path) ? `<img src="${formatImageUrl(p.image_path || p.url_imagem)}" onclick="openImageModal('${formatImageUrl(p.image_path || p.url_imagem)}')" style="cursor:zoom-in">` : `<span class="material-symbols-rounded" style="font-size: 48px; color: #d1d5db;">inventory_2</span>`}
                        </div>
                        <div class="product-detail-title-block">
                            <h1 class="product-detail-title">${p.descricao_completa || p.descricao_base || 'Sem descriﾃｧﾃ｣o'}</h1>
                            <div class="product-detail-meta-row">
                                ${renderProductMetaItem('barcode', 'SKU', p.sku_fornecedor || p.sku || idInterno)}
                                ${renderProductMetaItem('sell', 'Marca', p.marca)}
                                ${renderProductMetaItem('qr_code_2', 'EAN', p.ean)}
                            </div>
                        </div>
                    </div>

                    <!-- CARDS DE PREﾃ⑯ E ESTOQUE TOTAL -->
                    <div class="product-detail-prices">
                        <div class="product-price-card product-price-card-varejo">
                            <span class="product-price-icon material-symbols-rounded">sell</span>
                            <span class="product-price-ghost material-symbols-rounded">sell</span>
                            <div class="product-price-label">PREﾃ⑯ DE VENDA (VAREJO)</div>
                            <div class="product-price-value product-price-main">${formatPrice(p.preco_varejo)}</div>
                        </div>
                        <div class="product-price-card product-stock-main-card ${stockStatusClass}" title="Tﾃｩrreo + 1ﾂｺ Andar">
                            <span class="product-price-icon material-symbols-rounded">inventory_2</span>
                            <span class="product-price-ghost material-symbols-rounded">inventory_2</span>
                            <div class="product-price-label">ESTOQUE DISPONﾃ昂EL</div>
                            <div class="product-price-value product-stock-value ${stockStatusClass}">${disponivel} <span class="product-stock-unit">${unitLabel}</span></div>
                        </div>
                        <div class="product-price-card product-price-card-atacado collapsible-mobile">
                            <span class="product-price-icon material-symbols-rounded">shopping_cart</span>
                            <span class="product-price-ghost material-symbols-rounded">shopping_cart</span>
                            <div class="product-price-label">PREﾃ⑯ ATACADO</div>
                            <div class="product-price-value product-price-atacado">${formatPrice(p.preco_atacado)}</div>
                        </div>
                    </div>

                    <!-- ALERTA DE TRANSFERﾃ劾CIA (1ﾂｺ ANDAR) -->
                    ${packagingHTML}
                    ${stockAlertsHTML}
                    ${stockLocationsHTML}
                    ${false ? (() => {
                        const t = parseFloat(productStockEntries.find(e => normalizeLocal(e.local) === 'TERREO')?.saldo_total || 0);
                        const m = parseFloat(productStockEntries.find(e => normalizeLocal(e.local) === 'MOSTRUARIO')?.saldo_total || 0);
                        const p1 = parseFloat(productStockEntries.find(e => normalizeLocal(e.local) === 'PRIMEIRO_ANDAR')?.saldo_total || 0);
                        
                        if (false && t === 0 && m === 0 && p1 > 0) {
                            return `
                            <div style="margin-top: 20px; padding: 14px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 14px; display: flex; align-items: center; gap: 12px;">
                                <div style="width: 40px; height: 40px; background: rgba(251, 191, 36, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <span class="material-symbols-rounded" style="color: #fbbf24; font-size: 24px;">local_shipping</span>
                                </div>
                                <div>
                                    <div style="color: #fbbf24; font-weight: 800; font-size: 0.85rem;">SEM ESTOQUE NO Tﾃ嘘REO/MOSTRUﾃヽIO</div>
                                    <div style="color: rgba(255,255,255,0.7); font-size: 0.75rem;">Disponﾃｭvel no 1ﾂｺ andar: <b>${p1}</b></div>
                                    <div style="color: #fbbf24; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; margin-top: 2px;">Transferir para venda</div>
                                </div>
                            </div>
                            `;
                        }
                        return '';
                    })() : ''}

                    <!-- ESTOQUE POR LOCAL (DETALHADO) -->
                    <div class="product-stock-locations legacy-product-stock-locations" style="margin-top: 24px;">
                        <div class="product-stock-title" style="font-size: 0.9rem; margin-bottom: 12px; color: var(--muted); font-weight: 700;">ESTOQUE POR LOCAL</div>
                        <div class="product-stock-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            ${(() => {
                                const localMap = {
                                    'TERREO': 'Tﾃｩrreo',
                                    'MOSTRUARIO': 'Mostruﾃ｡rio',
                                    'PRIMEIRO_ANDAR': '1ﾂｺ Andar',
                                    'DEFEITO': 'Defeito',
                                    'EM_GARANTIA': 'Em Garantia',
                                    'EM_TRANSPORTE': 'Em Transporte',
                                    'FULL_ML': 'FULL ML'
                                };
                                return Object.keys(localMap).map(key => {
                                    const entry = productStockEntries.find(e => normalizeLocal(e.local) === key);
                                    const saldo = entry ? parseFloat(entry.saldo_total || entry.saldo || 0) : 0;
                                    const label = localMap[key];
                                    return `
                                        <div class="product-stock-location" style="${saldo === 0 ? 'opacity: 0.4;' : ''} background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 12px; border-radius: 12px;">
                                            <span class="product-stock-location-name" style="font-size: 0.75rem; color: var(--muted);">${label}</span>
                                            <span class="product-stock-location-qty" style="font-size: 1.1rem; font-weight: 800; display: block; margin-top: 4px;">${saldo}</span>
                                        </div>
                                    `;
                                }).join('');
                            })()}
                        </div>
                    </div>

                    <!-- PRODUTOS EQUIVALENTES (Collapsible on mobile) -->
                    <div class="collapsible-mobile">
                        ${equivalentes.length > 0 ? `
                        <div class="product-related-section" style="margin-top: 32px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 24px;">
                            <div class="product-related-title" style="font-size: 0.9rem; font-weight: 800; color: var(--muted); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; text-transform: uppercase;">
                                <span class="material-symbols-rounded" style="color: var(--primary); font-size: 20px;">compare_arrows</span>
                                Produtos Equivalentes / Por Marca
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                ${equivalentes.map(eq => {
                                    const eqStock = getAvailableStockCache(eq.id_interno);
                                    const eqMostruario = getProductShowroomStockCache(eq.id_interno);
                                    return `
                                        <div class="related-product-card" onclick="renderProductDetails(${JSON.stringify(eq).replace(/"/g, '&quot;')})" style="background: rgba(255,255,255,0.03); padding: 14px; border-radius: 16px; display: flex; align-items: center; gap: 14px; cursor: pointer; border: 1px solid rgba(255,255,255,0.05); transition: all 0.2s ease;">
                                            <div style="width: 44px; height: 44px; background: rgba(255,255,255,0.05); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.1);">
                                                ${(eq.image_path || eq.url_imagem) ? `<img src="${formatImageUrl(eq.image_path || eq.url_imagem)}" style="width: 100%; height: 100%; object-fit: contain;">` : '<span class="material-symbols-rounded" style="font-size: 20px; color: var(--muted);">inventory_2</span>'}
                                            </div>
                                            <div style="flex: 1; min-width: 0;">
                                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                                    <span style="font-size: 0.7rem; color: var(--primary); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">${eq.marca || 'S/M'}</span>
                                                    <span style="font-size: 0.65rem; color: var(--muted);">ID: ${eq.id_interno}</span>
                                                </div>
                                                <div style="font-size: 0.85rem; font-weight: 600; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 2px 0;">${eq.descricao_completa || eq.descricao_base}</div>
                                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                                    <span style="font-size: 0.8rem; color: #4ade80; font-weight: 700;">${formatPrice(eq.preco_varejo)} ﾂｷ ${eqStock} disp.${eqMostruario > 0 ? ` ﾂｷ ${eqMostruario} most.` : ''}</span>
                                                    <span class="related-product-action">VER PRODUTO</span>
                                                    <span class="material-symbols-rounded" style="font-size: 18px; color: var(--muted);">chevron_right</span>
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <!-- BLOCO + INFORMAﾃ�髭S (RECOLHﾃ昂EL) -->
                    <div class="product-more-info-section">
                        <button type="button" onclick="toggleMoreInfo()" class="product-more-info-btn" aria-expanded="false" aria-controls="more-info-content">
                            <span class="material-symbols-rounded">info</span>
                            <span id="more-info-label">Info</span>
                        </button>
                        
                        <div id="more-info-content" class="hidden" style="padding: 20px 10px 0;">
                            <div class="product-info-blocks">
                                ${commercialInfoHTML}
                                ${technicalInfoHTML}
                                ${operationalInfoHTML}
                                ${adminInfoHTML}
                            </div>
                            <!-- CUSTO -->
                            <div style="margin-bottom: 24px; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 14px; border: 1px dashed rgba(255,255,255,0.1);">
                                <div id="custo-locked" style="display: flex; align-items: center; justify-content: space-between;">
                                    <div>
                                        <span style="font-size: 0.75rem; color: var(--muted); display: block; margin-bottom: 4px;">PREﾃ⑯ DE CUSTO</span>
                                        <span style="font-size: 1.1rem; color: white; font-weight: 700; letter-spacing: 2px;">------</span>
                                    </div>
                                    <button onclick="toggleCusto()" class="btn-action" style="padding: 8px 16px; font-size: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                                        MOSTRAR
                                    </button>
                                </div>
                                <div id="custo-display" class="hidden" style="display: flex; align-items: center; justify-content: space-between;">
                                    <div>
                                        <span style="font-size: 0.75rem; color: var(--muted); display: block; margin-bottom: 4px;">PREﾃ⑯ DE CUSTO</span>
                                        <span class="product-custo-amount" style="font-size: 1.2rem; color: #fbbf24; font-weight: 800;">${formatPrice(p.preco_custo)}</span>
                                    </div>
                                    <button onclick="toggleCusto()" class="btn-action" style="padding: 8px 16px; font-size: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                                        OCULTAR
                                    </button>
                                </div>
                            </div>

                            <!-- DADOS ADICIONAIS -->
                            <div class="product-detail-id-section" style="background: transparent; padding: 0; border: none; margin-bottom: 24px;">
                                ${p.sku_fornecedor ? `
                                <div class="product-id-item">
                                    <span class="product-id-label">SKU Fornecedor</span>
                                    <span class="product-id-value">${p.sku_fornecedor}</span>
                                </div>
                                ` : ''}
                                ${p.quantidade_minima_atacado ? `
                                <div class="product-id-item">
                                    <span class="product-id-label">Mﾃｭnimo Atacado</span>
                                    <span class="product-id-value">${p.quantidade_minima_atacado} ${p.unidade || 'UN'}</span>
                                </div>
                                ` : ''}
                                ${p.estoque_minimo ? `
                                <div class="product-id-item">
                                    <span class="product-id-label">Estoque Mﾃｭnimo</span>
                                    <span class="product-id-value">${p.estoque_minimo}</span>
                                </div>
                                ` : ''}
                            </div>

                            <!-- ATRIBUTOS Tﾃ韻NICOS -->
                            ${attrs.length > 0 ? `
                            <div class="product-attrs-section" style="margin-bottom: 24px;">
                                <div class="product-attrs-title" style="font-size: 0.8rem; color: var(--muted); text-transform: uppercase; margin-bottom: 12px; font-weight: 800;">Atributos Tﾃｩcnicos</div>
                                <div class="product-attrs-grid">
                                    ${attrs.map(attr => `
                                        <div class="product-attr-chip">
                                            <span class="product-attr-name">${formatAttributeName(attr.nome)}:</span>
                                            <span class="product-attr-value">${formatAttributeValue(attr.valor)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            ` : ''}

                            <!-- OBSERVAﾃ�髭S -->
                            ${p.observacoes ? `
                            <div class="product-obs-section" style="margin-bottom: 24px;">
                                <div class="product-obs-title" style="font-size: 0.8rem; color: var(--muted); text-transform: uppercase; margin-bottom: 8px; font-weight: 800;">Observaﾃｧﾃｵes Internas</div>
                                <div class="product-obs-text" style="font-size: 0.85rem; line-height: 1.5; color: rgba(255,255,255,0.7);">${p.observacoes}</div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;
    window.scrollTo(0, 0);
}

window.toggleCusto = function() {
    const locked = document.getElementById('custo-locked');
    const display = document.getElementById('custo-display');
    if (locked && display) {
        locked.classList.toggle('hidden');
        display.classList.toggle('hidden');
    }
};

function getRelatedProducts(p) {
    if (!appData.products) return [];
    return appData.products.filter(other => {
        // Don't include itself
        if (other.ean === p.ean && other.id_interno === p.id_interno) return false;

        // Match rule: description, color, category
        const matchDesc = (other.descricao_base || '').toLowerCase() === (p.descricao_base || '').toLowerCase();
        const matchColor = (other.cor || '').toLowerCase() === (p.cor || '').toLowerCase();
        const matchCategory = (other.categoria || '').toLowerCase() === (p.categoria || '').toLowerCase();

        return matchDesc && matchColor && matchCategory;
    }).slice(0, 5); // Limit to 5 related products
}

function renderAddProduct(initialEan = '') {
    const currentUser = localStorage.getItem('currentUser');
    const nextId = getNextInternalId();

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal">
            ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderProductSubMenu()')}

            <main class="container product-form-screen">
                <div class="sub-menu-header">
                    <h2 style="font-size: 1.2rem; font-weight: 700;">CADASTRAR PRODUTO</h2>
                </div>

                <div class="form-grid">
                    <div class="form-section-title">Identificaﾃｧﾃ｣o</div>
                    <div class="input-group">
                        <label>ID Interno (Automﾃ｡tico)</label>
                        <input type="text" class="input-field" value="${nextId}" readonly disabled style="background: rgba(255,255,255,0.02); color: var(--primary); font-weight: 800; opacity: 1; cursor: not-allowed;">
                    </div>
                    <div class="input-group">
                        <label>EAN / Cﾃｳdigo de Barras</label>
                        <input type="text" id="add-ean" class="input-field" placeholder="EAN13" value="${initialEan}">
                    </div>
                    <div class="input-group">
                        <label>SKU Fornecedor</label>
                        <input type="text" id="add-sku" class="input-field" placeholder="Cﾃｳdigo do Fornecedor">
                    </div>
                    <div class="input-group full-width">
                        <label>Descriﾃｧﾃ｣o Base</label>
                        <input type="text" id="add-desc" class="input-field" placeholder="Nome principal do produto">
                    </div>

                    <div class="form-section-title">Caracterﾃｭsticas</div>
                    <div class="input-group">
                        <label>Marca</label>
                        <input type="text" id="add-marca" class="input-field" placeholder="Ex: Cofap">
                    </div>
                    <div class="input-group">
                        <label>Cor</label>
                        <input type="text" id="add-cor" class="input-field" placeholder="Ex: Preto">
                    </div>
                    <div class="input-group">
                        <label>Categoria</label>
                        <input type="text" id="add-cat" class="input-field" placeholder="Ex: Suspensﾃ｣o">
                    </div>
                    <div class="input-group">
                        <label>Subcategoria</label>
                        <input type="text" id="add-subcat" class="input-field" placeholder="Ex: Amortecedores">
                    </div>
                    <div class="input-group">
                        <label>Unidade</label>
                        <select id="add-uni" class="input-field">
                            <option value="UN">UN - Unidade</option>
                            <option value="PC">PC - Peﾃｧa</option>
                            <option value="KG">KG - Quilograma</option>
                            <option value="LT">LT - Litro</option>
                            <option value="MT">MT - Metro</option>
                            <option value="JG">JG - Jogo</option>
                            <option value="KIT">KIT - Kit</option>
                            <option value="PAR">PAR - Par</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Qtd por Embalagem</label>
                        <input type="number" id="add-qtd-emb" class="input-field" value="1" min="1">
                    </div>
                    <div class="input-group">
                        <label>Quantidade por caixa</label>
                        <input type="number" id="add-qtd-caixa" class="input-field" value="1" min="1" step="1" placeholder="Ex: 50">
                    </div>

                    <div class="form-section-title">Atributos Tﾃｩcnicos (JSON)</div>
                    <div class="input-group full-width">
                        <label>Atributos (JSON Array)</label>
                        <textarea id="add-atributos" class="input-field" style="min-height: 100px; font-family: monospace; font-size: 0.85rem;" placeholder='[{"nome":"voltagem","valor":"12v","ordem":1}]'></textarea>
                    </div>

                    <div class="form-section-title">Preﾃｧos e Estoque</div>
                    <div class="input-group">
                        <label>Preﾃｧo de Custo (R$)</label>
                        <input type="number" id="add-custo" step="0.01" class="input-field" placeholder="0,00">
                    </div>
                    <div class="input-group">
                        <label>Preﾃｧo Varejo (R$)</label>
                        <input type="number" id="add-varejo" step="0.01" class="input-field" placeholder="0,00">
                    </div>
                    <div class="input-group">
                        <label>Preﾃｧo Atacado (R$)</label>
                        <input type="number" id="add-atacado" step="0.01" class="input-field" placeholder="0,00">
                    </div>
                    <div class="input-group">
                        <label>Estoque Mﾃｭnimo</label>
                        <input type="number" id="add-min" class="input-field" placeholder="0">
                    </div>
                    <div class="input-group">
                        <label>Qtd Mﾃｭnima Atacado</label>
                        <input type="number" id="add-min-at" class="input-field" value="1">
                    </div>

                    <div class="form-section-title">Status e Observaﾃｧﾃｵes</div>
                    <div class="input-group">
                        <label>Status</label>
                        <select id="add-status" class="input-field" style="width: 100%; appearance: none;">
                            <option value="ativo">Ativo</option>
                            <option value="inativo">Inativo</option>
                        </select>
                    </div>
                    <div class="input-group full-width">
                        <label>Observaﾃｧﾃｵes</label>
                        <textarea id="add-obs" class="input-field" style="min-height: 80px; resize: vertical;" placeholder="Detalhes adicionais..."></textarea>
                    </div>

                    <div class="form-section-title">Mﾃｭdia e Documentaﾃｧﾃ｣o</div>
                    <div class="input-group full-width">
                        <label>Imagem do Produto</label>
                        <input type="file" id="add-img-file" class="input-field" accept="image/*">
                    </div>
                    <div class="input-group full-width">
                        <label>Manual / PDF</label>
                        <input type="file" id="add-pdf-file" class="input-field" accept="application/pdf">
                    </div>
                </div>

                <div style="display: flex; gap: 16px; margin-top: 20px; padding-bottom: 40px;">
                    <button class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="renderProductSubMenu()">
                        Cancelar
                    </button>
                    <button class="btn-action" style="flex: 2; justify-content: center;" onclick="saveNewProduct()">
                        <span class="material-symbols-rounded">save</span>
                        Salvar Produto
                    </button>
                </div>
            </main>
        </div>
    `;
}

async function saveNewProduct() {
    const nextId = getNextInternalId();
    
    let image_path = null;
    let manual_path = null;
    let url_imagem = null;
    let url_pdf = null;
    
    const imgFile = document.getElementById('add-img-file').files[0];
    const pdfFile = document.getElementById('add-pdf-file').files[0];
    
    try {
        if (imgFile) {
            console.log('[PRODUTO] Arquivo imagem selecionado:', imgFile.name);
            image_path = await uploadFile(imgFile, 'produto');
            url_imagem = getPublicUrl(image_path);
            console.log('[PRODUTO] Imagem salva. path:', image_path, 'URL:', url_imagem);
        }
        
        if (pdfFile) {
            console.log('[PRODUTO] Arquivo PDF selecionado:', pdfFile.name);
            manual_path = await uploadFile(pdfFile, 'manual');
            url_pdf = getPublicUrl(manual_path);
            console.log('[PRODUTO] PDF salvo. path:', manual_path, 'URL:', url_pdf);
        }
    } catch (err) {
        console.error('[PRODUTO] Erro ao fazer upload:', err);
        showToast('Erro ao enviar arquivo: ' + err.message);
        return;
    }

    const attrsInput = document.getElementById('add-atributos').value.trim();
    let attrsArray = [];
    if (attrsInput) {
        try {
            attrsArray = JSON.parse(attrsInput);
            if (!Array.isArray(attrsArray)) {
                showToast('Atributos deve ser um array JSON');
                return;
            }
        } catch (e) {
            showToast('JSON de atributos invﾃ｡lido');
            return;
        }
    }
    
    const qtdPorCaixa = readQtdPorCaixaInput('add-qtd-caixa');
    if (qtdPorCaixa === null) return;

    const product = {
        id_interno: nextId,
        ean: document.getElementById('add-ean').value.trim(),
        sku_fornecedor: document.getElementById('add-sku').value.trim(),
        descricao_base: document.getElementById('add-desc').value.trim(),
        descricao_completa: document.getElementById('add-desc').value.trim(),
        marca: document.getElementById('add-marca').value.trim(),
        cor: document.getElementById('add-cor').value.trim(),
        categoria: document.getElementById('add-cat').value.trim(),
        subcategoria: document.getElementById('add-subcat').value.trim(),
        unidade: document.getElementById('add-uni').value.trim(),
        quantidade_embalagem: parseInt(document.getElementById('add-qtd-emb').value) || 1,
        qtd_por_caixa: qtdPorCaixa,
        preco_custo: parseFloat(document.getElementById('add-custo').value) || 0,
        preco_varejo: parseFloat(document.getElementById('add-varejo').value) || 0,
        preco_atacado: parseFloat(document.getElementById('add-atacado').value) || 0,
        estoque_minimo: parseInt(document.getElementById('add-min').value) || 0,
        qtd_minima_atacado: parseInt(document.getElementById('add-min-at').value) || 1,
        status: document.getElementById('add-status').value,
        observacoes: document.getElementById('add-obs').value.trim(),
        url_imagem: url_imagem || '',
        url_pdf_manual: url_pdf || '',
        atributos: attrsArray
    };

    if (!product.descricao_base) {
        showToast("A descriﾃｧﾃ｣o base ﾃｩ obrigatﾃｳria.");
        return;
    }

    console.log('[PRODUTO] Salvando produto:', product);
    showToast("Salvando produto...");

    try {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        const { data, error } = await client
            .from('produtos')
            .insert([product])
            .select('*')
            .single();
        if (error) throw error;
        appData.products.push(data || product);
        DataClient.invalidateCache?.('produtos');
        showToast("Produto salvo no Supabase!");
    } catch (e) {
        console.error("Error saving product on Supabase:", e);
        showToast("Erro ao salvar produto: " + (e.message || e), "error");
        return;
    }

    if (SCRIPT_URL) {
        try {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'append',
                    sheet: 'produtos',
                    data: product
                })
            });
        } catch (e) {
            console.error("Error saving product:", e);
        }
    }

    playBeep('success');
    setTimeout(() => renderProductSubMenu(), 1500);
}

let removeImageFlag = false;
let removePDFFlag = false;

function markRemoveImage() {
    removeImageFlag = true;
    const preview = document.getElementById('edit-img-preview');
    if (preview) {
        preview.innerHTML = '<span style="color: #E30613; font-size: 0.8rem;">Imagem serﾃ｡ removida ao salvar</span>';
    }
    console.log('[REMOVE] Imagem marcada para remoﾃｧﾃ｣o');
}

function markRemovePDF() {
    removePDFFlag = true;
    const preview = document.getElementById('edit-pdf-preview');
    if (preview) {
        preview.innerHTML = '<span style="color: #E30613; font-size: 0.8rem;">PDF serﾃ｡ removido ao salvar</span>';
    }
    console.log('[REMOVE] PDF marcado para remoﾃｧﾃ｣o');
}

async function saveEditProduct(originalId) {
    const existingProduct = appData.products.find(p => (p.id_interno || p.col_A) == originalId);
    
    let newImagePath = existingProduct?.image_path || null;
    let newManualPath = existingProduct?.manual_path || null;
    let url_imagem = existingProduct?.url_imagem || null;
    let url_pdf = existingProduct?.url_pdf_manual || null;
    
    const oldImagePath = existingProduct?.image_path || null;
    const oldManualPath = existingProduct?.manual_path || null;
    
    const newImgFile = document.getElementById('edit-img-file')?.files[0];
    const newPdfFile = document.getElementById('edit-pdf-file')?.files[0];
    
    try {
        if (newImgFile) {
            newImagePath = await uploadFile(newImgFile, 'produto');
            url_imagem = getPublicUrl(newImagePath);
            removeImageFlag = false;
            
            if (oldImagePath && oldImagePath !== newImagePath) {
                await deleteFile(oldImagePath);
            }
        } else if (removeImageFlag && oldImagePath) {
            await deleteFile(oldImagePath);
            newImagePath = null;
            url_imagem = null;
        }
        
        if (newPdfFile) {
            newManualPath = await uploadFile(newPdfFile, 'manual');
            url_pdf = getPublicUrl(newManualPath);
            removePDFFlag = false;
            
            if (oldManualPath && oldManualPath !== newManualPath) {
                await deleteFile(oldManualPath);
            }
        } else if (removePDFFlag && oldManualPath) {
            await deleteFile(oldManualPath);
            newManualPath = null;
            url_pdf = null;
        }
    } catch (err) {
        console.error('[EDIT] Erro ao processar arquivos:', err);
        showToast('Erro ao processar arquivos: ' + err.message);
        return;
    }

    const attrsInput = document.getElementById('edit-atributos').value.trim();
    let attrsArray = [];
    if (attrsInput) {
        try {
            attrsArray = JSON.parse(attrsInput);
            if (!Array.isArray(attrsArray)) {
                showToast('Atributos deve ser um array JSON');
                return;
            }
        } catch (e) {
            showToast('JSON de atributos invﾃ｡lido');
            return;
        }
    }

    const qtdPorCaixa = readQtdPorCaixaInput('edit-qtd-caixa');
    if (qtdPorCaixa === null) return;
    
    const product = {
        id_interno: document.getElementById('edit-id').value.trim(),
        ean: document.getElementById('edit-ean').value.trim(),
        sku_fornecedor: document.getElementById('edit-sku').value.trim(),
        descricao_base: document.getElementById('edit-desc').value.trim(),
        descricao_completa: document.getElementById('edit-desc').value.trim(),
        marca: document.getElementById('edit-marca').value.trim(),
        cor: document.getElementById('edit-cor').value.trim(),
        categoria: document.getElementById('edit-cat').value.trim(),
        subcategoria: document.getElementById('edit-subcat').value.trim(),
        unidade: document.getElementById('edit-uni').value.trim(),
        quantidade_embalagem: parseInt(document.getElementById('edit-qtd-emb').value) || 1,
        qtd_por_caixa: qtdPorCaixa,
        preco_custo: parseFloat(document.getElementById('edit-custo').value) || 0,
        preco_varejo: parseFloat(document.getElementById('edit-varejo').value) || 0,
        preco_atacado: parseFloat(document.getElementById('edit-atacado').value) || 0,
        estoque_minimo: parseInt(document.getElementById('edit-min').value) || 0,
        qtd_minima_atacado: parseInt(document.getElementById('edit-min-at').value) || 1,
        status: document.getElementById('edit-status').value,
        observacoes: document.getElementById('edit-obs').value.trim(),
        url_imagem: url_imagem || '',
        url_pdf_manual: url_pdf || '',
        atributos: attrsArray
    };

    showToast("Atualizando produto...");

    try {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        const { data, error } = await client
            .from('produtos')
            .update(product)
            .eq('id_interno', originalId)
            .select('*')
            .single();
        if (error) throw error;

        const index = appData.products.findIndex(p => (p.id_interno || p.col_A) == originalId);
        if (index !== -1) {
            appData.products[index] = { ...appData.products[index], ...(data || product) };
        }
        if (window.currentProductDetailForEdit && String(window.currentProductDetailForEdit.id_interno || '') === String(originalId)) {
            window.currentProductDetailForEdit = { ...window.currentProductDetailForEdit, ...(data || product) };
        }
        DataClient.invalidateCache?.('produtos');
    } catch (e) {
        console.error("Error updating product on Supabase:", e);
        showToast("Erro ao atualizar produto: " + (e.message || e), "error");
        return;
    }

    playBeep('success');
    setTimeout(() => renderEditProductSearch(), 1500);
}
function renderEditProductSearch() {
    const currentUser = localStorage.getItem('currentUser');
    currentScreen = 'internal';

    // Garantir produtos carregados
    ensureProdutosLoaded();

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal product-search-screen">
            ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}
            
            <main class="container product-search-center">
                <div class="screen-mini-title">
                    <div class="mini-icon">
                        ${menu3DIcons.editar}
                    </div>
                    <span>EDITAR</span>
                </div>

                <div class="product-search-bar">
                    <span class="material-symbols-rounded" style="color: var(--muted); font-size: 24px; margin-right: 12px;">search</span>
                    <input
                        type="search"
                        id="edit-search-input"
                        class="product-search-input"
                        placeholder="Buscar produto para editar..."
                        autocomplete="off"
                        inputmode="search"
                        oninput="debouncedEditSearch()"
                    />
                    <button class="product-search-camera-btn" type="button" onclick="startScanner(false, false, false, false, true)" style="margin-left: 10px;">
                        <span class="material-symbols-rounded" style="font-size: 24px; color: var(--primary);">qr_code_scanner</span>
                    </button>
                </div>

                <div id="scanner-container-edit" class="hidden" style="margin-top: 24px; overflow: hidden; border-radius: 20px; border: 2px solid var(--primary); background: #000; position: relative; width: 100%; max-width: 600px;">
                    <div id="reader-edit" style="width: 100%;"></div>
                    <div style="position: absolute; top: 15px; right: 15px; z-index: 10;">
                        <button class="btn-action" style="padding: 10px; min-width: auto; border-radius: 50%; background: rgba(0,0,0,0.6);" onclick="stopScanner()">
                            <span class="material-symbols-rounded">close</span>
                        </button>
                    </div>
                </div>
                
                <div id="edit-search-results" class="product-search-results">
                    <!-- Resultados -->
                </div>
            </main>
        </div>
    `;
    setTimeout(() => document.getElementById('edit-search-input')?.focus(), 100);
}

// Lﾃｳgica de Busca para Ediﾃｧﾃ｣o
let lastEditSearchQuery = '';
window.debouncedEditSearch = debounce(async () => {
    const input = document.getElementById('edit-search-input');
    if (!input) return;
    const query = input.value.trim();
    if (query === lastEditSearchQuery) return;
    lastEditSearchQuery = query;

    if (query.length < 2) {
        document.getElementById('edit-search-results').innerHTML = '';
        return;
    }

    const normQuery = normalizeProductSearchTerm(query);
    const results = appData.products.filter(p => p._searchIndex.includes(normQuery)).slice(0, 30);
    renderEditSearchResults(results);
}, 300);

function renderEditSearchResults(results) {
    const container = document.getElementById('edit-search-results');
    if (!container) return;

    if (results.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--muted);">Nenhum produto encontrado</div>`;
        return;
    }

    container.innerHTML = `
        <div class="product-result-list">
            ${results.map(p => `
                <div class="product-result-item" onclick="renderEditProductFormByEan('${p.ean || p.id_interno}')">
                    <div class="product-result-img">
                        <span class="material-symbols-rounded" style="color: #d1d5db; font-size: 24px;">inventory_2</span>
                    </div>
                    <div class="product-result-info">
                        <div class="product-result-title" style="color: #101018; font-weight: 700;">${p.descricao_completa || p.descricao_base || p.id_interno}</div>
                        <div style="font-size: 0.75rem; color: #666;">ID: ${p.id_interno} | EAN: ${p.ean || '-'}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderEditProductFormByEan(code) {
    const lookup = String(code || '').trim();
    const p = (appData.products || []).find(prod =>
        String(prod.ean || '').trim() === lookup ||
        String(prod.id_interno || prod.col_A || '').trim() === lookup ||
        String(prod.sku_fornecedor || prod.sku || '').trim() === lookup
    ) || (
        window.currentProductDetailForEdit &&
        (
            String(window.currentProductDetailForEdit.ean || '').trim() === lookup ||
            String(window.currentProductDetailForEdit.id_interno || window.currentProductDetailForEdit.col_A || '').trim() === lookup ||
            String(window.currentProductDetailForEdit.sku_fornecedor || window.currentProductDetailForEdit.sku || '').trim() === lookup
        )
            ? window.currentProductDetailForEdit
            : null
    );
    if (p) {
        renderEditProductForm(p);
    } else {
        console.warn('[EDIT] Produto nﾃ｣o encontrado para ediﾃｧﾃ｣o:', code);
        showToast('Nﾃ｣o foi possﾃｭvel abrir a ediﾃｧﾃ｣o deste produto.', 'warning');
    }
}

function openProductCreate() {
    currentScreen = 'internal';
    renderAddProduct();
    return;
    const currentUser = localStorage.getItem('currentUser');
    currentScreen = 'internal';

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal">
            ${getTopBarHTML(currentUser, 'renderProductSubMenu()')}
            
            <main class="container" style="display: flex; flex-direction: column; align-items: center; padding-top: 60px;">
                <div class="screen-mini-title">
                    <div class="mini-icon">
                        ${menu3DIcons.cadastrar}
                    </div>
                    <span>CADASTRAR</span>
                </div>
                
                <div style="margin-top: 40px; text-align: center; color: var(--muted);">
                    <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 16px;">construction</span>
                    <p style="font-size: 1.1rem; font-weight: 600;">Mﾃｳdulo em desenvolvimento</p>
                    <p style="font-size: 0.85rem; margin-top: 8px;">Aguarde as prﾃｳximas atualizaﾃｧﾃｵes.</p>
                </div>
            </main>
        </div>
    `;
}


function renderEditProductForm(p) {
    const currentUser = localStorage.getItem('currentUser');
    const existingAttrs = safeParseAtributos(p.atributos);
    const attrsString = existingAttrs.length > 0 ? JSON.stringify(existingAttrs, null, 2) : '';

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal">
            ${getTopBarHTML(localStorage.getItem('currentUser'), `showProductDetails('${p.id_interno}')`)}

            <main class="container product-form-screen">
                <div class="sub-menu-header">
                    <h2 style="font-size: 1.2rem; font-weight: 700;">EDITAR: ${p.descricao_base || p.id_interno}</h2>
                </div>

                <div class="form-grid">
                    <div class="form-section-title">Identificaﾃｧﾃ｣o</div>
                    <div class="input-group">
                        <label>ID Interno</label>
                        <input type="text" id="edit-id" class="input-field" value="${p.id_interno || p.col_A || ''}">
                    </div>
                    <div class="input-group">
                        <label>EAN / Cﾃｳdigo de Barras</label>
                        <input type="text" id="edit-ean" class="input-field" value="${p.ean || ''}">
                    </div>
                    <div class="input-group">
                        <label>SKU Fornecedor</label>
                        <input type="text" id="edit-sku" class="input-field" value="${p.sku_fornecedor || ''}">
                    </div>
                    <div class="input-group full-width">
                        <label>Descriﾃｧﾃ｣o Base</label>
                        <input type="text" id="edit-desc" class="input-field" value="${p.descricao_base || ''}">
                    </div>

                    <div class="form-section-title">Caracterﾃｭsticas</div>
                    <div class="input-group">
                        <label>Marca</label>
                        <input type="text" id="edit-marca" class="input-field" value="${p.marca || ''}">
                    </div>
                    <div class="input-group">
                        <label>Cor</label>
                        <input type="text" id="edit-cor" class="input-field" value="${p.cor || ''}">
                    </div>
                    <div class="input-group">
                        <label>Categoria</label>
                        <input type="text" id="edit-cat" class="input-field" value="${p.categoria || ''}">
                    </div>
                    <div class="input-group">
                        <label>Subcategoria</label>
                        <input type="text" id="edit-subcat" class="input-field" value="${p.subcategoria || ''}">
                    </div>
                    <div class="input-group">
                        <label>Unidade</label>
                        <select id="edit-uni" class="input-field">
                            <option value="UN" ${p.unidade === 'UN' ? 'selected' : ''}>UN - Unidade</option>
                            <option value="PC" ${p.unidade === 'PC' ? 'selected' : ''}>PC - Peﾃｧa</option>
                            <option value="KG" ${p.unidade === 'KG' ? 'selected' : ''}>KG - Quilograma</option>
                            <option value="LT" ${p.unidade === 'LT' ? 'selected' : ''}>LT - Litro</option>
                            <option value="MT" ${p.unidade === 'MT' ? 'selected' : ''}>MT - Metro</option>
                            <option value="JG" ${p.unidade === 'JG' ? 'selected' : ''}>JG - Jogo</option>
                            <option value="KIT" ${p.unidade === 'KIT' ? 'selected' : ''}>KIT - Kit</option>
                            <option value="PAR" ${p.unidade === 'PAR' ? 'selected' : ''}>PAR - Par</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Qtd por Embalagem</label>
                        <input type="number" id="edit-qtd-emb" class="input-field" value="${p.quantidade_embalagem || 1}" min="1">
                    </div>
                    <div class="input-group">
                        <label>Quantidade por caixa</label>
                        <input type="number" id="edit-qtd-caixa" class="input-field" value="${normalizeQtdPorCaixa(p.qtd_por_caixa)}" min="1" step="1" placeholder="Ex: 50">
                    </div>

                    <div class="form-section-title">Atributos Tﾃｩcnicos (JSON)</div>
                    <div class="input-group full-width">
                        <label>Atributos (JSON Array)</label>
                        <textarea id="edit-atributos" class="input-field" style="min-height: 100px; font-family: monospace; font-size: 0.85rem;">${attrsString}</textarea>
                    </div>

                    <div class="form-section-title">Preﾃｧos e Estoque</div>
                    <div class="input-group">
                        <label>Preﾃｧo de Custo (R$)</label>
                        <input type="number" id="edit-custo" step="0.01" class="input-field" value="${p.preco_custo || ''}">
                    </div>
                    <div class="input-group">
                        <label>Preﾃｧo Varejo (R$)</label>
                        <input type="number" id="edit-varejo" step="0.01" class="input-field" value="${p.preco_varejo || ''}">
                    </div>
                    <div class="input-group">
                        <label>Preﾃｧo Atacado (R$)</label>
                        <input type="number" id="edit-atacado" step="0.01" class="input-field" value="${p.preco_atacado || ''}">
                    </div>
                    <div class="input-group">
                        <label>Estoque Mﾃｭnimo</label>
                        <input type="number" id="edit-min" class="input-field" value="${p.estoque_minimo || ''}">
                    </div>
                    <div class="input-group">
                        <label>Qtd Mﾃｭnima Atacado</label>
                        <input type="number" id="edit-min-at" class="input-field" value="${p.qtd_minima_atacado || 1}">
                    </div>

                    <div class="form-section-title">Status e Observaﾃｧﾃｵes</div>
                    <div class="input-group">
                        <label>Status</label>
                        <select id="edit-status" class="input-field" style="width: 100%; appearance: none;">
                            <option value="ativo" ${p.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                            <option value="inativo" ${p.status === 'inativo' ? 'selected' : ''}>Inativo</option>
                        </select>
                    </div>
                    <div class="input-group full-width">
                        <label>Observaﾃｧﾃｵes</label>
                        <textarea id="edit-obs" class="input-field" style="min-height: 80px; resize: vertical;">${p.observacoes || ''}</textarea>
                    </div>

                    <div class="form-section-title">Mﾃｭdia e Documentaﾃｧﾃ｣o</div>
                    <div class="input-group full-width">
                        <label>URL da Imagem</label>
                        <input type="text" id="edit-img-url" class="input-field" value="${p.url_imagem || ''}" placeholder="https://...">
                    </div>
                    <div class="input-group full-width">
                        <label>Fazer upload de nova imagem</label>
                        <input type="file" id="edit-img-file" class="input-field" accept="image/*" style="margin-top: 8px;">
                    </div>

                    <div class="form-section-title">Manual / PDF</div>
                    <div class="input-group full-width">
                        <label>URL do PDF</label>
                        <input type="text" id="edit-pdf-url" class="input-field" value="${p.url_pdf_manual || p.url_pdf || ''}" placeholder="https://...">
                    </div>
                    <div class="input-group full-width">
                        <label>Fazer upload de novo PDF</label>
                        <input type="file" id="edit-pdf-file" class="input-field" accept="application/pdf" style="margin-top: 8px;">
                    </div>
                </div>

                <div style="display: flex; gap: 16px; margin-top: 20px; padding-bottom: 40px;">
                    <button class="btn-action btn-secondary" style="flex: 1; justify-content: center;" onclick="renderEditProductSearch()">
                        Voltar
                    </button>
                    <button class="btn-action" style="flex: 2; justify-content: center;" onclick="saveEditProduct('${p.id_interno || p.col_A}')">
                        <span class="material-symbols-rounded">save</span>
                        Salvar Alteraﾃｧﾃｵes
                    </button>
                </div>
            </main>
        </div>
    `;
}

function handleBackgroundImageUpload(event, deviceType) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Por favor, selecione uma imagem vﾃ｡lida.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        const storageKey = deviceType === 'mobile' ? 'loginBackgroundMobile' : 'loginBackgroundDesktop';
        localStorage.setItem(storageKey, base64);
        showToast(`Imagem de fundo ${deviceType} salva! Ir para login para ver.`);
        renderConfigSubMenu();
    };
    reader.onerror = function() {
        showToast('Erro ao ler a imagem.');
    };
    reader.readAsDataURL(file);
}

function handleFontUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const validExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(ext)) {
        showToast('Por favor, selecione um arquivo de fonte vﾃ｡lido (TTF, OTF, WOFF, WOFF2).');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const fontData = e.target.result;
        const fontName = 'CustomFont_' + Date.now();
        
        const fontFace = new FontFace(fontName, `url(${fontData})`);
        fontFace.load().then(function(loadedFace) {
            document.fonts.add(loadedFace);
            localStorage.setItem('appFontFamily', fontName);
            localStorage.setItem('appFontData', fontData);
            applyAppFont();
            showToast('Fonte aplicada com sucesso!');
            renderConfigSubMenu();
        }).catch(function(err) {
            showToast('Erro ao carregar fonte: ' + err.message);
        });
    };
    reader.onerror = function() {
        showToast('Erro ao ler a fonte.');
    };
    reader.readAsDataURL(file);
}

function applyAppFont() {
    const fontName = localStorage.getItem('appFontFamily');
    if (fontName) {
        document.documentElement.style.setProperty('--app-font-family', fontName);
    }
}

function updateLoginColor(type, value) {
    localStorage.setItem('login' + type.charAt(0).toUpperCase() + type.slice(1) + 'Color', value);
    showToast('Cor atualizada!');
}

function handleLoginBgImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxWidth = 1920;
            const maxHeight = 1080;
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            saveToIndexedDB('loginBgImage', dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function saveToIndexedDB(key, data) {
    const dbName = 'DYAUTO_DB';
    const storeName = 'files';
    
    const request = indexedDB.open(dbName, 1);
    
    request.onerror = function() {
        try {
            localStorage.setItem(key, data);
            showToast('Imagem salva!');
        } catch (e) {
            showToast('Erro ao salvar imagem.');
        }
        renderConfigSubMenu();
    };
    
    request.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
        }
    };
    
    request.onsuccess = function(e) {
        const db = e.target.result;
        try {
            if (!db.objectStoreNames.contains(storeName)) {
                localStorage.setItem(key, data);
                showToast('Imagem salva!');
                renderConfigSubMenu();
                return;
            }
            
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.put(data, key);
            tx.oncomplete = function() {
                showToast('Imagem salva!');
                renderConfigSubMenu();
            };
            tx.onerror = function() {
                try {
                    localStorage.setItem(key, data);
                    showToast('Imagem salva!');
                } catch (e) {
                    showToast('Erro ao salvar imagem.');
                }
                renderConfigSubMenu();
            };
        } catch (err) {
            try {
                localStorage.setItem(key, data);
                showToast('Imagem salva!');
            } catch (e) {
                showToast('Erro ao salvar imagem.');
            }
            renderConfigSubMenu();
        }
    };
}

function loadFromIndexedDB(key, callback) {
    const dbName = 'DYAUTO_DB';
    const storeName = 'files';
    
    const defaultData = null;
    const fallbackData = localStorage.getItem(key);
    
    const request = indexedDB.open(dbName);
    
    request.onerror = function() {
        callback(fallbackData);
    };
    
    request.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
        }
    };
    
    request.onsuccess = function(e) {
        try {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                callback(fallbackData);
                return;
            }
            
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const getRequest = store.get(key);
            
            getRequest.onsuccess = function() {
                const data = getRequest.result;
                callback(data || fallbackData);
            };
            getRequest.onerror = function() {
                callback(fallbackData);
            };
        } catch (err) {
            callback(fallbackData);
        }
    };
}

function removeLoginBgImage() {
    localStorage.removeItem('loginBackgroundDesktop');
    localStorage.removeItem('loginBackgroundMobile');
    showToast('Imagem de fundo removida!');
    renderConfigSubMenu();
}

function resetLoginVisual() {
    localStorage.removeItem('loginBgColor');
    localStorage.removeItem('loginTextColor');
    localStorage.removeItem('loginCardColor');
    localStorage.removeItem('loginBackgroundDesktop');
    localStorage.removeItem('loginBackgroundMobile');
    window.loginCustomBgImage = null;
    
    const request = indexedDB.deleteDatabase('DYAUTO_DB');
    request.onsuccess = function() {
        showToast('Visual resetado para padrﾃ｣o!');
        renderConfigSubMenu();
    };
    request.onerror = function() {
        showToast('Visual resetado para padrﾃ｣o!');
        renderConfigSubMenu();
    };
}

function applyLoginStyles() {
    const bgColor = localStorage.getItem('loginBgColor');
    const textColor = localStorage.getItem('loginTextColor');
    const cardColor = localStorage.getItem('loginCardColor');
    
    if (bgColor) document.documentElement.style.setProperty('--login-bg-color', bgColor);
    if (textColor) document.documentElement.style.setProperty('--login-text-color', textColor);
    if (cardColor) document.documentElement.style.setProperty('--login-card-color', cardColor);
}

function adjustColor(color, amount) {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function renderFinanceiroSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in financeiro-screen module-screen" style="background: var(--bg); min-height: 100vh;">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
            ${getModuleSidebarHTML('financeiro')}
            <main class="container" style="padding-top:80px;text-align:center;">
                <p style="color:var(--muted);margin-top:40px;">Mﾃｳdulo em desenvolvimento.</p>
            </main>
        </div>
    `;
}


function getChannelConfig(label) {
    const l = String(label).toUpperCase();
    if (l.includes('FLEX')) return { icon: 'bolt', color: 'flex', svgIcon: channel3DIcons.flex };
    if (l.includes('SHOPEE')) return { icon: 'shopping_bag', color: 'shopee', svgIcon: channel3DIcons.shopee };
    if (l.includes('MERCADO') || l.includes('ML')) return { icon: 'local_shipping', color: 'ml', svgIcon: channel3DIcons.ml };
    if (l.includes('MAGALU')) return { icon: 'inventory_2', color: 'magalu', svgIcon: channel3DIcons.magalu };
    if (l.includes('AMAZON')) return { icon: 'shopping_cart', color: 'amazon', svgIcon: channel3DIcons.amazon || channel3DIcons.pdv };
    if (l.includes('CORREIOS')) return { icon: 'mail', color: 'correios', svgIcon: channel3DIcons.correios };
    if (l.includes('ULTRA')) return { icon: 'speed', color: 'ultra', svgIcon: channel3DIcons.ultra };
    if (l.includes('FULL')) return { icon: 'flash_on', color: 'full', svgIcon: channel3DIcons.full };
    if (l.includes('PDV') || l.includes('BALCﾃグ')) return { icon: 'store', color: 'pdv', svgIcon: channel3DIcons.pdv };
    return { icon: 'storefront', color: 'pdv', svgIcon: channel3DIcons.pdv };
}

async function renderPickMenu() {
    if (isModoRapidoAtivo()) {
        showToast("Modo rﾃ｡pido ativo. Use Conferﾃｪncia/Saﾃｭda direta.", "info");
        // Opcional: Impedir abertura ou abrir com aviso
    }
    const currentUser = localStorage.getItem('currentUser');
    document.body.classList.remove('menu-active');
    
    // Garantir carregamento real do Supabase
    await ensureCanaisLoaded();
    
    console.log(`[CANAIS DEBUG] renderizando canais: ${(appData.channels || []).length} registros`);

    let channels = (appData.channels || []).map(c => {
        const label = c.nome || c.col_B || '';
        const id = c.canal_id || c.id || c.col_A || '';
        const type = c.tipo || c.col_C || '';
        const config = getChannelConfig(label);
        return {
            ...config,
            id: id,
            label: label,
            type: type
        };
    });


    // FULL ﾃｩ depﾃｳsito externo, Nﾃグ canal operacional de separaﾃｧﾃ｣o
    channels = channels.filter(c => !String(c.label).toUpperCase().includes('FULL'));

    if (channels.length === 0) {
        app.innerHTML = `
            <div class="dashboard-screen fade-in internal picking-screen">
                ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderMenu()')}
                ${getOperationalIdentityHTML('PICKING')}

                <main class="container" style="display: flex; align-items: center; justify-content: center; height: 60vh;">
                    <div style="text-align: center; color: var(--muted);">
                        <span class="material-symbols-rounded" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;">block</span>
                        <p>Nenhum canal cadastrado</p>
                    </div>
                </main>
            </div>
        `;
        return;
    }

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal picking-screen">
                    ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderMenu()')}
                    ${getOperationalIdentityHTML('PICKING')}

                    <main class="container">
                        <div class="menu-grid">
                            ${channels.map(item => `
                                <div class="menu-card channel-card mobile-nav-card ${item.color}" onclick="startPickingSession('${item.id}', '${item.label}', '${item.color}')">
                                    <span class="menu-icon-3d">${item.svgIcon || `<span class="material-symbols-rounded">${item.icon}</span>`}</span>
                                    <span class="label">${item.label}</span>
                                </div>
                            `).join('')}
                        </div>
                    </main>
                </div>
            `;
}

function renderPickHistory() {
    const currentUser = localStorage.getItem('currentUser');
    const history = (appData.separacao || []).sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal picking-screen">
                    ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderPickMenu()')}
                    ${getOperationalIdentityHTML('PICKING')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">HISTﾃ迭ICO DE SEPARAﾃ�グ</h2>
                        </div>

                        ${history.length === 0 ? `
                            <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">history</span>
                                <p style="color: var(--muted);">Nenhuma separaﾃｧﾃ｣o encontrada.</p>
                            </div>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                                ${history.map(item => `
                                    <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                            <div>
                                                <div style="font-weight: 800; color: white; font-size: 0.9rem;">${item.rom_id || '-'}</div>
                                                <div style="font-size: 0.65rem; color: var(--muted);">${new Date(item.criado_em).toLocaleString('pt-BR')}</div>
                                            </div>
                                            <div style="background: ${item.status === 'CONCLUﾃ好O' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)'}; color: ${item.status === 'CONCLUﾃ好O' ? '#22c55e' : '#eab308'}; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 800;">
                                                ${item.status || 'PENDENTE'}
                                            </div>
                                        </div>
                                        <div style="font-size: 0.8rem; color: white; font-weight: 600;">Canal: ${item.canal_nome || '-'}</div>
                                        <div style="font-size: 0.65rem; color: var(--muted); margin-top: 4px;">Por: ${item.criado_por || '-'}</div>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </main>
                </div>
            `;
}

// Variﾃ｡vel global para armazenar o contexto da sessﾃ｣o antes de ser persistida
let currentPickingContext = null;
const PICK_STATUS_DRAFT = 'em_separacao';
const PICK_STATUS_READY_FOR_PACK = 'aberta';

function getDraftPickSession() {
    try {
        const draft = JSON.parse(localStorage.getItem('draft_pick_session') || 'null');
        return draft && typeof draft === 'object' ? draft : null;
    } catch (error) {
        console.warn('[PICKING] draft_pick_session invalido. Limpando rascunho local.', error);
        localStorage.removeItem('draft_pick_session');
        return null;
    }
}

function generatePickSessionId(channelLabel) {
    const now = new Date();
    const ddmm = now.getDate().toString().padStart(2, '0') + (now.getMonth() + 1).toString().padStart(2, '0');
    const todayStr = now.toLocaleDateString('pt-BR');
    const cleanChannel = channelLabel.split(' ')[0].toUpperCase();

    let countInSheet = 0;
    if (appData.separacao && Array.isArray(appData.separacao)) {
        countInSheet = appData.separacao.filter(row => {
            const rowDate = row.data_separacao || row.col_d || row.col_D;
            const rowChannel = row.canal_nome || row.col_c || row.col_C;
            return rowDate === todayStr && rowChannel === channelLabel;
        }).length;
    }

    const seq = countInSheet + 1;
    return `SEP-${cleanChannel}-${ddmm}-${seq.toString().padStart(2, '0')}`;
}

function buildPickingSessionPayload(sessionId, channelId, channelLabel, status = PICK_STATUS_DRAFT, createdAt = null) {
    const now = new Date().toISOString();
    const currentUser = localStorage.getItem('currentUser') || 'N/A';
    return {
        separacao_id: sessionId,
        pedido_referencia: '',
        canal_id: channelId || '',
        canal_nome: channelLabel || '',
        status,
        criado_por: currentUser,
        criado_em: createdAt || now,
        atualizado_em: now,
        observacao: 'SEPARACAO MANUAL'
    };
}

function buildPickingItemPayload(item) {
    const qty = Number(item?.qty || item?.qtd_separada || 1);
    return {
        id_interno: item?.id_interno || item?.col_a || item?.col_A || '',
        ean: item?.ean || item?.sku_fornecedor || '',
        descricao: item?.descricao_base || item?.descricao_completa || item?.col_aa || item?.descricao || '',
        qtd_solicitada: qty,
        qtd_separada: qty
    };
}

function getPickItemTitle(item) {
    return item?.descricao_completa || item?.descricao_base || item?.descricao || item?.col_aa || 'PRODUTO';
}

function getPickItemMetaHTML(item) {
    const id = item?.id_interno || item?.col_a || item?.col_A || '-';
    const ean = item?.ean || '-';
    const sku = item?.sku_fornecedor || item?.sku || '-';
    return `
        <div>ID interno: ${id}</div>
        <div>EAN: ${ean}</div>
        <div>SKU: ${sku}</div>
    `;
}

async function persistPickingDraftItem(draft, item) {
    const sessionPayload = buildPickingSessionPayload(
        draft.sessionId,
        draft.channelId,
        draft.channelLabel,
        PICK_STATUS_DRAFT,
        draft.createdAt
    );
    const itemPayload = buildPickingItemPayload(item);
    const payload = {
        session: sessionPayload,
        item: itemPayload,
        executionId: draft.executionId || draft.sessionId
    };

    console.log('[SEP] produto bipado', {
        separacao_id: draft.sessionId,
        id_interno: itemPayload.id_interno,
        ean: itemPayload.ean,
        qtd_separada: itemPayload.qtd_separada
    });

    if (!navigator.onLine) {
        await queueOperation('supabase_pick_draft', payload, {
            module: 'separacao',
            sessionId: draft.sessionId,
            itemId: itemPayload.id_interno
        });
        return { queued: true };
    }

    try {
        return await DataClient.savePickingDraftSupabase(payload);
    } catch (error) {
        if (isRetryableConferenceSyncError(error)) {
            await queueOperation('supabase_pick_draft', payload, {
                module: 'separacao',
                sessionId: draft.sessionId,
                itemId: itemPayload.id_interno,
                lastOnlineError: error.message || String(error)
            });
            return { queued: true, error };
        }
        throw error;
    }
}

async function persistPickingFinal(sessionId) {
    const payload = {
        sessionId,
        status: PICK_STATUS_READY_FOR_PACK,
        executionId: generateExecutionId()
    };

    if (!navigator.onLine) {
        await queueOperation('supabase_pick_finalize', payload, {
            module: 'separacao',
            sessionId
        });
        return { queued: true };
    }

    try {
        return await DataClient.finalizePickingDraftSupabase(payload);
    } catch (error) {
        if (isRetryableConferenceSyncError(error)) {
            await queueOperation('supabase_pick_finalize', payload, {
                module: 'separacao',
                sessionId,
                lastOnlineError: error.message || String(error)
            });
            return { queued: true, error };
        }
        throw error;
    }
}

function startPickingSession(channelId, channelLabel, channelColor) {
    const currentUser = localStorage.getItem('currentUser');
    const draft = getDraftPickSession();
    
    console.log('[SEP] canal selecionado', { channelId, channelLabel, channelColor });

    if (draft) {
        const hasItems = draft.items && draft.items.length > 0;
        
        if (hasItems) {
            console.log(`[PICKING DEBUG] rascunho com itens detectado: ${draft.channelLabel}`);
            // Se o rascunho for de OUTRO canal, oferece Retomar ou Limpar
            if (draft.channelId !== channelId) {
                const msg = `Sessao ativa detectada em ${draft.channelLabel}.\n\nPara iniciar em ${channelLabel}, vocﾃｪ deve descartar o rascunho anterior.\n\nDeseja LIMPAR o rascunho de ${draft.channelLabel} e comeﾃｧar ${channelLabel}?`;
                if (confirm(msg)) {
                    localStorage.removeItem('draft_pick_session');
                    console.log(`[PICKING DEBUG] rascunho de ${draft.channelLabel} descartado`);
                } else {
                    if (confirm(`Deseja RETOMAR a sessﾃ｣o de ${draft.channelLabel} agora?`)) {
                        currentSessionItems = draft.items || [];
                        renderPickingScreen(draft.sessionId, draft.channelId, draft.channelLabel, draft.channelColor);
                        updatePickItemsList();
                    }
                    return;
                }
            } else {
                // Mesmo canal, retoma direto
                currentSessionItems = draft.items || [];
                renderPickingScreen(draft.sessionId, draft.channelId, draft.channelLabel, draft.channelColor);
                updatePickItemsList();
                return;
            }
        } else {
            console.log(`[PICKING DEBUG] rascunho vazio ignorado`);
            localStorage.removeItem('draft_pick_session');
        }
    }

    console.log(`[PICKING DEBUG] abriu bipagem sem criar rascunho`);
    
    // Define contexto para criaﾃｧﾃ｣o futura no primeiro item
    currentPickingContext = {
        channelId, 
        channelLabel, 
        channelColor,
        sessionId: generatePickSessionId(channelLabel),
        executionId: generateExecutionId(),
        createdAt: new Date().toISOString()
    };
    
    currentSessionItems = [];
    renderPickingScreen(currentPickingContext.sessionId, channelId, channelLabel, channelColor);
}

function renderPickingScreen(sessionId, channelId, channelLabel, channelColor) {
    const currentUser = localStorage.getItem('currentUser');
    currentPickingContext = {
        sessionId,
        channelId,
        channelLabel,
        channelColor,
        executionId: currentPickingContext?.executionId || generateExecutionId(),
        createdAt: currentPickingContext?.createdAt || new Date().toISOString()
    };
    
    app.innerHTML = `
        <div class="dashboard-screen fade-in internal no-top-bar picking-screen">
            ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderPickMenu()')}
            ${getOperationalIdentityHTML('PICKING')}

            <main class="container">
                <div class="product-search-container">
                    <!-- CABEﾃ②LHO VISUAL -->
                    <div class="screen-mini-title" style="margin-top: 36px; margin-bottom: 28px;">
                        <div class="mini-icon">
                            ${menu3DIcons?.[channelId] || getChannelConfig(channelLabel).svgIcon || ""}
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <span>${(channelLabel || 'SEPARAﾃ�グ').toUpperCase()}</span>
                        </div>
                    </div>

                    <!-- CAMPO DE BUSCA PADRﾃグ -->
                    <div class="product-search-bar">
                        <span class="material-symbols-rounded">search</span>
                        <input type="text" id="pick-ean-input" class="product-search-input" 
                               placeholder="" 
                               onkeypress="if(event.key === 'Enter') addPickItem()" autofocus>
                        
                        <button class="product-scanner-btn" onclick="startScanner(true)" title="Abrir Scanner">
                            <span class="material-symbols-rounded">qr_code_scanner</span>
                        </button>
                    </div>
                </div>

                        <!-- Scanner Area -->
                        <div id="scanner-container-pick" class="hidden" style="width: 100%; max-width: 900px; margin-bottom: 24px; overflow: hidden; border-radius: 16px; border: 2px solid rgba(255,255,255,0.2); background: #000; position: relative;">
                            <div id="reader-pick" style="width: 100%;"></div>
                            <div id="scanner-feedback" style="position: absolute; inset: 0; z-index: 5; display: none; align-items: center; justify-content: center; pointer-events: none;">
                                <div id="scanner-feedback-icon" class="material-symbols-rounded" style="font-size: 80px; color: white; text-shadow: 0 0 20px rgba(0,0,0,0.5);"></div>
                            </div>
                            <div style="position: absolute; top: 10px; right: 10px; z-index: 10;">
                                <button class="btn-action btn-secondary" style="padding: 6px; min-width: auto; border-radius: 50%;" onclick="stopScanner()">
                                    <span class="material-symbols-rounded" style="font-size: 20px;">close</span>
                                </button>
                            </div>
                        </div>

                        <div id="pick-items-list" style="width: 100%; display: flex; flex-direction: column; align-items: center;">
                            <!-- Itens bipados aqui -->
                        </div>
                    </main>

                    <footer class="picking-footer" id="picking-footer-action" style="display: none;">
                        <button class="btn-action" onclick="finishPickingSession('${sessionId}', '${channelId}', '${channelLabel}', '${channelColor}')" 
                                style="background: #22C55E; color: white; width: 100%; max-width: 600px; height: 56px; border-radius: 999px; font-weight: 900; font-size: 1.1rem; box-shadow: 0 10px 25px rgba(34, 197, 94, 0.3);">
                            <span class="material-symbols-rounded" style="margin-right: 8px;">check_circle</span>
                            FINALIZAR SEPARAﾃ�グ
                        </button>
                    </footer>
                </div>
            `;

    document.getElementById('pick-ean-input').focus();
}

function showInputFeedback(inputId, type) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const color = type === 'success' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    const borderColor = type === 'success' ? '#22C55E' : '#EF4444';
    
    // Remove inline styles previously set if any
    input.style.transition = 'none';
    input.style.boxShadow = `0 0 0 4px ${color}`;
    input.style.borderColor = borderColor;
    
    // Force reflow
    void input.offsetWidth;
    
    input.style.transition = 'all 0.3s ease';
    input.style.boxShadow = '';
    input.style.borderColor = '';

    setTimeout(() => {
        if (input) {
            input.focus();
            console.log(`[BIP CONTINUO DEBUG] input limpo e foco restaurado no ${inputId}`);
        }
    }, 300);
}

function normalizePickCode(rawValue) {
    return String(rawValue || '').trim().replace(/\s+/g, '');
}

function findProductInLocalCacheByCode(cleanCode) {
    console.log('[SEP] buscando cache', cleanCode);
    const code = normalizePickCode(cleanCode);
    const product = (appData.products || []).find(p =>
        normalizePickCode(p.ean) === code ||
        normalizePickCode(p.id_interno || p.col_a || p.col_A) === code ||
        normalizePickCode(p.sku_fornecedor || p.sku) === code
    );

    if (product) {
        console.log('[SEP] produto encontrado cache', {
            id_interno: product.id_interno || product.col_a || product.col_A || '',
            ean: product.ean || '',
            sku_fornecedor: product.sku_fornecedor || product.sku || ''
        });
    }

    return product || null;
}

function upsertProductIntoLocalCache(product) {
    if (!product) return null;
    const indexed = hydrateProdutosForSearch([product])[0];
    if (!indexed) return null;

    if (!Array.isArray(appData.products)) appData.products = [];
    const idx = appData.products.findIndex(p =>
        normalizePickCode(p.ean) === normalizePickCode(indexed.ean) ||
        normalizePickCode(p.id_interno || p.col_a || p.col_A) === normalizePickCode(indexed.id_interno || indexed.col_a || indexed.col_A)
    );

    if (idx >= 0) appData.products[idx] = { ...appData.products[idx], ...indexed };
    else appData.products.unshift(indexed);

    console.log('[SEP] total produtos carregados', appData.products.length);
    return indexed;
}

async function findProductForPicking(cleanCode) {
    let product = findProductInLocalCacheByCode(cleanCode);
    if (product) return product;

    try {
        const supabaseProduct = await DataClient.findProdutoByCodeSupabase(cleanCode);
        if (supabaseProduct) return upsertProductIntoLocalCache(supabaseProduct);
    } catch (error) {
        console.warn('[SEP] refresh supabase erro', {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code,
            value: cleanCode
        });
    }

    console.log('[SEP] produto nao encontrado', cleanCode);
    return null;
}

async function addPickItem(scannedEan = null) {
    const input = document.getElementById('pick-ean-input');
    const rawCode = (scannedEan ?? input?.value ?? '').toString();
    const ean = normalizePickCode(rawCode);
    console.log('[SEP] codigo bruto', rawCode);
    console.log('[SEP] codigo normalizado', ean);
    if (!ean) return;

    const product = await findProductForPicking(ean);

    if (product) {
        const allowNegative = isSaidaEstoqueZeroPermitida();
        const stockEntries = (appData.estoque || []).filter(e => String(e.id_interno || e.col_a || e.id || '') === String(product.id_interno || product.col_a || ''));
        const stock = calcularEstoqueDisponivel(stockEntries);
        const existingItemForQty = currentSessionItems.find(item => item.ean == product.ean || item.id_interno == product.id_interno);
        const currentDraftQty = existingItemForQty ? existingItemForQty.qty : 0;

        if (stock < (currentDraftQty + 1)) {
            if (!allowNegative) {
                playBeep('error');
                showToast(`ESTOQUE INSUFICIENTE para ${product.descricao_base || 'este item'}`);
                input.value = '';
                showInputFeedback('pick-ean-input', 'error');
                return;
            } else {
                if (!window.pickNegativeStockWarnings) window.pickNegativeStockWarnings = new Set();
                const warningKey = `${currentPickSession?.id || currentPickSession?.channelId || 'pick'}:${product.id_interno || product.ean || ean}`;
                if (!window.pickNegativeStockWarnings.has(warningKey)) {
                    window.pickNegativeStockWarnings.add(warningKey);
                    showToast(`AVISO: Estoque negativo para ${product.descricao_base || 'este item'}`);
                }
            }
        }

        playBeep('success');
        console.log('[SEP] produto bipado', {
            ean,
            id_interno: product.id_interno || product.col_a || product.col_A || '',
            descricao: getPickItemTitle(product)
        });

        const existingItem = currentSessionItems.find(item => item.ean == product.ean || item.id_interno == product.id_interno);
        if (existingItem) {
            existingItem.qty = (existingItem.qty || 1) + 1;
            existingItem.scanTime = new Date().toLocaleTimeString();
        } else {
            currentSessionItems.unshift({
                ...product,
                qty: 1,
                scanTime: new Date().toLocaleTimeString()
            });
        }

        const draftStr = localStorage.getItem('draft_pick_session');
        let draft;
        
        if (!draftStr) {
            console.log(`[PICKING DEBUG] primeiro item bipado, criando rascunho`);
            const now = new Date();
            draft = {
                sessionId: currentPickingContext ? currentPickingContext.sessionId : `SEP-TEMP-${now.getTime()}`,
                channelId: currentPickingContext ? currentPickingContext.channelId : '',
                channelLabel: currentPickingContext ? currentPickingContext.channelLabel : 'OUTROS',
                channelColor: currentPickingContext ? currentPickingContext.channelColor : 'pdv',
                items: [],
                operatorId: localStorage.getItem('currentUser'),
                status: PICK_STATUS_DRAFT,
                timestamp: now.toISOString(),
                createdAt: currentPickingContext?.createdAt || now.toISOString(),
                executionId: currentPickingContext?.executionId || generateExecutionId()
            };
        } else {
            draft = getDraftPickSession() || {};
        }

        draft.items = currentSessionItems;
        draft.status = PICK_STATUS_DRAFT;
        draft.timestamp = new Date().toISOString();
        draft.createdAt = draft.createdAt || new Date().toISOString();
        draft.executionId = draft.executionId || currentPickingContext?.executionId || generateExecutionId();
        localStorage.setItem('draft_pick_session', JSON.stringify(draft));

        try {
            const itemToPersist = currentSessionItems.find(item => item.ean == product.ean || item.id_interno == product.id_interno) || product;
            const persistResult = await persistPickingDraftItem(draft, itemToPersist);
            if (persistResult?.queued) {
                showToast("Item salvo localmente para sincronizar.");
            }
        } catch (error) {
            console.error('[SEP] erro ao salvar item', {
                message: error?.message,
                details: error?.details,
                hint: error?.hint,
                code: error?.code
            });
            showToast(`Erro ao salvar item: ${error?.message || error}`, "error");
        }

        showToast(`Item adicionado: ${getPickItemTitle(product)}`);
        if (currentPackSession) {
            currentPackSession.items = currentSessionItems;
            localStorage.setItem('draft_pack_session', JSON.stringify(currentPackSession));
        }
    } else {
        playBeep('error');
        showToast(`PRODUTO Nﾃグ CADASTRADO: ${ean}`);
    }

    input.value = '';
    updatePickItemsList();
    showInputFeedback('pick-ean-input', product ? 'success' : 'error');
}

function updatePickItemsList() {
    const container = document.getElementById('pick-items-list');
    const footer = document.getElementById('picking-footer-action');
    
    if (currentSessionItems.length === 0) {
        if (footer) footer.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    if (footer) footer.style.display = 'flex';
    container.innerHTML = currentSessionItems.map((item, index) => `
        <div class="pick-item-card fade-in">
            <div style="flex: 1; min-width: 0;">
                <div class="pick-item-title">${getPickItemTitle(item)}</div>
                <div class="pick-item-meta">${getPickItemMetaHTML(item)}</div>
            </div>
            <div class="pick-item-qty">${item.qty}</div>
            <button onclick="removePickItem(${index})" style="background: #fef2f2; border: 1px solid #fee2e2; color: #ef4444; width: 44px; height: 44px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.2s;">
                <span class="material-symbols-rounded" style="font-size: 20px;">delete</span>
            </button>
        </div>
    `).join('');
}

function removePickItem(index) {
    const item = currentSessionItems[index];
    if (item && item.qty > 1) {
        item.qty--;
    } else {
        currentSessionItems.splice(index, 1);
    }
    updatePickItemsList();
    if (currentSessionItems.length === 0) {
        localStorage.removeItem('draft_pick_session');
    } else {
        const draft = getDraftPickSession() || {};
        draft.items = currentSessionItems;
        draft.timestamp = new Date().toISOString();
        localStorage.setItem('draft_pick_session', JSON.stringify(draft));
    }
}


async function finishPickingSession(sessionId, channelId, channelLabel, channelColor) {
    if (isFinalizing) return;
    isFinalizing = true;

    const submitBtn = document.querySelector(`button[onclick^="finishPickingSession"]`);
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = 'Salvando...'; }

    try {
        if (currentSessionItems.length === 0) {
            showToast("Adicione pelo menos um item para finalizar.");
            return;
        }

        const currentUser = localStorage.getItem('currentUser');
        const now = new Date().toISOString();
        const modoRapidoAtivo = isModoRapidoAtivo();

        const pickingData = {
            separacao_id: sessionId,
            canal_id: channelId,
            canal_nome: channelLabel,
            data_separacao: new Date().toLocaleDateString('pt-BR'),
            status: 'em_separacao',
            criado_por: currentUser,
            criado_em: now,
            finalizado_em: now,
            data_hora: now,
            origem_operacional: 'manual_nf',
            pedido_origem_id: '',
            marketplace_order_id: '',
            observacao: modoRapidoAtivo ? 'SAIDA_RAPIDA AUTOMATICA' : 'SEPARACAO MANUAL POR NF'
        };

        const groupedItems = currentSessionItems.reduce((acc, item) => {
            const key = item.ean || item.id_interno || item.sku_fornecedor || 'unknown';
            if (!acc[key]) acc[key] = { ...item, qty: 0 };
            acc[key].qty += (item.qty || 1);
            return acc;
        }, {});

        const conferenceRows = Object.values(groupedItems).map(item => ({
            separacao_id: sessionId,
            id_interno: item.id_interno || '',
            ean: item.ean,
            descricao: item.descricao_base,
            qtd_separada: item.qty,
            qtd_conferida: modoRapidoAtivo ? item.qty : 0,
            divergencia: modoRapidoAtivo ? 'OK' : 'FALTA',
            conferido_por: modoRapidoAtivo ? currentUser : '',
            conferido_em: modoRapidoAtivo ? now : '',
            processed: false
        }));

        const session = {
            id: sessionId,
            channel: channelLabel,
            channelColor: channelColor,
            items: currentSessionItems,
            user: currentUser,
            time: now,
            pickingData,
            conferenceRows
        };

        // [NOVO FLUXO]: Bloqueio de Divergﾃｪncia se houver lista carregada
        currentPickSession = session;
        renderPickResult(sessionId, channelId, channelLabel, channelColor);


    } catch (error) {
        console.error("Error preparing picking result:", error);
        showToast("Erro ao processar separaﾃｧﾃ｣o!");
    } finally {
        isFinalizing = false;
        const submitBtn = document.querySelector(`button[onclick^="finishPickingSession"]`);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<span class="material-symbols-rounded">check_circle</span> Finalizar Separaﾃｧﾃ｣o'; }
    }
}

function renderPickResult(sessionId, channelId, channelLabel, channelColor) {
    const currentUser = localStorage.getItem('currentUser');
    const hasDivergence = currentPickSession && currentPickSession.divergence;
    const channelTitle = (channelLabel || 'SEPARACAO').toUpperCase();

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal picking-active-minimal">
            ${getTopBarHTML(localStorage.getItem('currentUser'), `renderPickingScreen('${sessionId}', '${channelId}', '${channelLabel}', '${channelColor}')`)}

            <main class="container sep-review-container">
                <div class="sep-review-header">
                    <div>
                        <div class="sep-review-kicker">REVISAO DA SEPARACAO</div>
                        <h2>${channelTitle}</h2>
                    </div>
                    <div class="sep-review-session">${sessionId}</div>
                </div>

                <div class="sep-review-list">
                    ${currentPickSession.items.map((item, index) => `
                        <div class="op-card sep-review-card fade-in">
                            <div class="sep-review-card-main">
                                <div class="sep-review-title">${getPickItemTitle(item)}</div>
                                <div class="sep-review-meta">${getPickItemMetaHTML(item)}</div>
                            </div>

                            <div class="sep-review-qty-row">
                                <div class="sep-review-qty-label">QUANTIDADE</div>
                                <div class="sep-review-stepper">
                                    <button class="sep-review-stepper-btn" onclick="adjustPickRow(${index}, -1, '${sessionId}', '${channelId}', '${channelLabel}', '${channelColor}')">
                                        <span class="material-symbols-rounded">remove</span>
                                    </button>
                                    <div class="sep-review-qty-value">${item.qty}</div>
                                    <button class="sep-review-stepper-btn" onclick="adjustPickRow(${index}, 1, '${sessionId}', '${channelId}', '${channelLabel}', '${channelColor}')">
                                        <span class="material-symbols-rounded">add</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('')}

                    <button class="btn-action sep-review-manual-btn" onclick="openManualAddProductToSession('${sessionId}', 'PICK')">
                        <span class="material-symbols-rounded">add_circle</span>
                        ADICIONAR MANUAL
                    </button>
                </div>

                <div class="sep-review-actions">
                    ${!hasDivergence ? `
                    <button class="btn-action sep-review-finish-btn" onclick="savePickResultFinal('${sessionId}', '${channelId}', '${channelLabel}', '${channelColor}')">
                        <span class="material-symbols-rounded">check_circle</span>
                        FINALIZAR SEPARACAO
                    </button>
                    ` : `
                    <div class="sep-review-blocked">
                        <div>OPERACAO BLOQUEADA</div>
                        <p>Divergencia detectada.</p>
                    </div>
                    `}
                </div>
            </main>
        </div>
    `;
}

function adjustPickRow(index, delta, sessionId, channelId, channelLabel, channelColor) {
    const item = currentPickSession.items[index];
    item.qty = Math.max(0, item.qty + delta);
    if (item.qty === 0) {
        currentPickSession.items.splice(index, 1);
    }
    currentSessionItems = currentPickSession.items;
    localStorage.setItem('draft_pick_session', JSON.stringify({
        sessionId, channelId, channelLabel, channelColor, items: currentSessionItems,
        timestamp: new Date().toISOString()
    }));
    renderPickResult(sessionId, channelId, channelLabel, channelColor);
}

async function savePickResultFinal(sessionId, channelId, channelLabel, channelColor) {
    if (isFinalizing) return;
    isFinalizing = true;
    showToast("Finalizando separaﾃｧﾃ｣o...");

    try {
        if (!currentPickSession?.items || currentPickSession.items.length === 0) {
            showToast("Adicione pelo menos um item para finalizar.");
            return;
        }

        const now = new Date().toISOString();
        const draft = getDraftPickSession() || {
            sessionId,
            channelId,
            channelLabel,
            channelColor,
            createdAt: currentPickSession?.pickingData?.criado_em || now,
            executionId: generateExecutionId()
        };
        const pickingData = {
            ...buildPickingSessionPayload(
                sessionId,
                channelId,
                channelLabel,
                PICK_STATUS_READY_FOR_PACK,
                draft.createdAt || currentPickSession?.pickingData?.criado_em || now
            ),
            finalizado_em: now
        };

        console.log("[savePickResultFinal] currentPickSession.items:", currentPickSession.items);

        for (const item of currentPickSession.items) {
            await persistPickingDraftItem({
                ...draft,
                sessionId,
                channelId,
                channelLabel,
                channelColor
            }, item);
        }

        const finalResult = await persistPickingFinal(sessionId);

        if (!appData.separacao) appData.separacao = [];
        const localSession = {
            ...pickingData,
            separacao_id: sessionId,
            canal_nome: channelLabel,
            status: PICK_STATUS_READY_FOR_PACK
        };
        const existingIndex = appData.separacao.findIndex(s => (s.separacao_id || s.col_a) === sessionId);
        if (existingIndex >= 0) appData.separacao[existingIndex] = { ...appData.separacao[existingIndex], ...localSession };
        else appData.separacao.unshift(localSession);

        const activeSessions = getActivePickSessions().filter(s => s.id !== sessionId);
        activeSessions.unshift({
            ...currentPickSession,
            id: sessionId,
            pickingData: localSession,
            status: PICK_STATUS_READY_FOR_PACK
        });
        setActivePickSessions(activeSessions);

        localStorage.removeItem('draft_pick_session');
        showToast(finalResult?.queued
            ? `Separacao ${sessionId} salva localmente para sincronizar.`
            : `Separacao ${sessionId} enviada para conferencia!`);
        renderMenu();
    } catch (e) {
        console.error('[SEP] erro ao finalizar separacao', {
            message: e?.message,
            details: e?.details,
            hint: e?.hint,
            code: e?.code,
            sessionId,
            channelId,
            channelLabel
        });
        showToast(`Erro ao salvar finalizacao: ${e?.message || e}`);
    } finally {
        isFinalizing = false;
    }
}

async function renderPackMenu() {
    const currentUser = localStorage.getItem('currentUser');
    const modoRapidoAtivo = isModoRapidoAtivo();

    if (modoRapidoAtivo) {
        showToast("Acesso negado: Conferﾃｪncia desativada no Modo Rﾃ｡pido.");
        renderMenu();
        return;
    }

    // Filtrar sessﾃｵes pendentes (status 'aberta' ou 'em_conferencia') vindas da planilha ou otimismo
    try {
        const data = await DataClient.loadModule('conferencia', true);
        if (data) {
            appData.separacao = data.separacao || appData.separacao || [];
            appData.separacao_itens = data.separacao_itens || appData.separacao_itens || [];
            appData.conferencia = data.conferencia || appData.conferencia || [];
        }
    } catch (error) {
        console.warn('[PACK] Falha ao atualizar separacoes do Supabase:', error);
    }

    const activeSessions = (appData.separacao || []).filter(s => {
        const st = String(s.status || '').toLowerCase();
        return st === 'aberta' || st === 'aguardando_conferencia' || st === 'pronta_para_conferencia' || st === 'em_conferencia' || st === 'aberto';
    });

    // Group sessions by channel
    const channelsWithSessions = [];
    const channelMap = {};

    activeSessions.forEach(s => {
        const channelName = s.canal_nome || s.col_c || s.canal || 'Outros';
        const channelId = s.separacao_id || s.col_a;
        if (!channelMap[channelName]) {
            channelMap[channelName] = {
                name: channelName,
                color: getChannelConfig(channelName).color,
                icon: getChannelConfig(channelName).icon,
                count: 0,
                firstSessionId: channelId
            };
            channelsWithSessions.push(channelMap[channelName]);
        }
        channelMap[channelName].count++;
        if (!channelMap[channelName].firstSessionId) channelMap[channelName].firstSessionId = channelId;
    });

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal pack-screen picking-screen">
                    ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderMenu()')}
                    ${getOperationalIdentityHTML('PACK')}

                    <main class="container">
                        ${channelsWithSessions.length === 0 ? `
                            <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">fact_check</span>
                                <p style="color: var(--muted);">Nenhuma separacao aberta para conferencia.</p>
                            </div>
                        ` : `
                            <div class="menu-grid">
                                ${channelsWithSessions.map(chan => {
                                    const config = getChannelConfig(chan.name);
                                    return `
                                        <div class="menu-card channel-card mobile-nav-card ${chan.color}" 
                                             onclick="${chan.count === 1 && chan.firstSessionId ? `renderPackSessionDetails('${chan.firstSessionId}')` : `renderPackSessionsList('${chan.name}')`}" 
                                             style="cursor: pointer;">
                                            <span class="menu-icon-3d">${config.svgIcon || `<span class="material-symbols-rounded">${chan.icon}</span>`}</span>
                                            <span class="label">${chan.name}</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        `}
                    </main>
                </div>
            `;
}

function renderPackHistory() {
    const currentUser = localStorage.getItem('currentUser');
    const history = (appData.conferencia || []).sort((a, b) => new Date(b.conferido_em) - new Date(a.conferido_em));

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal pack-screen">
                    ${getTopBarHTML(currentUser, 'renderPackMenu()')}
                    ${getOperationalIdentityHTML('PACK')}

                    <main class="container">
                        <div class="sub-menu-header">
                            <h2 style="font-size: 1.2rem; font-weight: 700;">HISTﾃ迭ICO de CONFERﾃ劾CIA</h2>
                        </section>

                        ${history.length === 0 ? `
                            <div style="text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">history</span>
                                <p style="color: var(--muted);">Nenhuma conferﾃｪncia encontrada.</p>
                            </div>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                                ${history.map(item => `
                                    <div style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                            <div>
                                                <div style="font-weight: 800; color: white; font-size: 0.9rem;">${item.rom_id || '-'}</div>
                                                <div style="font-size: 0.65rem; color: var(--muted);">${new Date(item.conferido_em).toLocaleString('pt-BR')}</div>
                                            </div>
                                            <div style="background: ${item.divergencia === 'OK' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color: ${item.divergencia === 'OK' ? '#22c55e' : '#ef4444'}; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 800;">
                                                ${item.divergencia || 'OK'}
                                            </div>
                                        </div>
                                        <div style="font-size: 0.8rem; color: white; font-weight: 600;">${item.descricao || '-'}</div>
                                        <div style="font-size: 0.65rem; color: var(--muted); margin-top: 4px;">Qtd: ${item.qtd_conferida || 0} | Por: ${item.conferido_por || '-'}</div>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </main>
                </div>
            `;
}

function renderPackSessionsList(channelName) {
    const currentUser = localStorage.getItem('currentUser');
    const activeSessions = (appData.separacao || []).filter(s => {
        const chan = s.canal_nome || s.col_c || s.canal || 'Outros';
        const st = String(s.status || '').toLowerCase();
        return chan === channelName && (st === 'aberta' || st === 'aguardando_conferencia' || st === 'pronta_para_conferencia' || st === 'em_conferencia' || st === 'aberto');
    });
    const channelConfig = getChannelConfig(channelName);
    const channelIcon = channelConfig.svgIcon || menu3DIcons?.pack || '<span class="material-symbols-rounded">fact_check</span>';
    const getSessionItemCount = (session) => {
        const sid = session.separacao_id || session.col_a;
        const direct = session.total_itens || session.itens_count || session.qtd_itens || session.quantidade_itens;
        if (direct !== undefined && direct !== null && direct !== '') return direct;
        const items = (appData.separacao_itens || []).filter(item =>
            String(item.separacao_id || item.rom_id || item.col_a || '') === String(sid)
        );
        return items.length || '-';
    };
    const getSessionStatusClass = (status) => {
        const st = String(status || '').toLowerCase();
        if (st.includes('diverg')) return 'danger';
        if (st.includes('conferencia') || st.includes('pronta')) return 'active';
        return 'ready';
    };

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal pack-sessions-screen pack-screen">
                    ${getTopBarHTML(currentUser, 'renderPackMenu()')}
                    ${getOperationalIdentityHTML('PACK')}

                    <main class="container pack-sessions-workspace">
                        <section class="pack-sessions-hero">
                            <div class="pack-sessions-title">
                                <div class="pack-sessions-icon">${channelIcon}</div>
                                <div>
                                    <span>Conferﾃｪncia / Pack</span>
                                    <h1>${channelName}</h1>
                                </div>
                            </div>
                            <div class="pack-sessions-summary">
                                <div>
                                    <span>Abertas</span>
                                    <strong>${activeSessions.length}</strong>
                                </div>
                                <div>
                                    <span>Canal</span>
                                    <strong>${channelName}</strong>
                                </div>
                            </div>
                        </div>

                        ${activeSessions.length === 0 ? `
                            <div class="pack-sessions-empty">
                                <span class="material-symbols-rounded">fact_check</span>
                                <strong>Nenhuma sessﾃ｣o aberta</strong>
                                <p>Quando uma separaﾃｧﾃ｣o for finalizada para conferﾃｪncia, ela aparecerﾃ｡ aqui.</p>
                            </div>
                        ` : `
                        <div class="pack-sessions-list">
                            ${activeSessions.map(session => {
                                const sid = session.separacao_id || session.col_a;
                                const user = session.criado_por || session.col_e || 'N/A';
                                const status = session.status || 'aberta';
                                const statusClass = getSessionStatusClass(status);
                                const itemCount = getSessionItemCount(session);
                                return `
                                <article class="pack-session-card" onclick="renderPackSessionDetails('${sid}')">
                                    <div class="pack-session-card-main">
                                        <div class="pack-session-card-icon">
                                            <span class="material-symbols-rounded">assignment_turned_in</span>
                                        </div>
                                        <div class="pack-session-card-text">
                                            <span class="pack-session-card-kicker">Separaﾃｧﾃ｣o</span>
                                            <strong>${sid || '-'}</strong>
                                            <small>Separado por: ${user}</small>
                                        </div>
                                    </div>
                                    <div class="pack-session-card-meta">
                                        <div class="pack-session-pill ${statusClass}">${String(status).toUpperCase()}</div>
                                        <div class="pack-session-count">
                                            <span>Itens</span>
                                            <strong>${itemCount}</strong>
                                        </div>
                                    </div>
                                    <button class="pack-session-action" onclick="event.stopPropagation(); renderPackSessionDetails('${sid}')" title="Conferir">
                                        <span class="material-symbols-rounded">fact_check</span>
                                        <span>Conferir</span>
                                    </button>
                                </article>
                                `;
                            }).join('')}
                        </div>
                        `}
                    </main>
                </div>
            `;
}

function deletePickingSession(sessionId, channelName) {
    if (!confirm(`Tem certeza que deseja excluir a separaﾃｧﾃ｣o ${sessionId}?\nEsta aﾃｧﾃ｣o nﾃ｣o pode ser desfeita.`)) {
        return;
    }

    let activeSessions = getActivePickSessions();
    activeSessions = activeSessions.filter(s => s.id !== sessionId);
    setActivePickSessions(activeSessions);

    showToast(`Separaﾃｧﾃ｣o ${sessionId} excluﾃｭda.`);

    // Re-render the list or the menu
    if (channelName) {
        renderPackSessionsList(channelName);
    } else {
        renderPackMenu();
    }
}

function getActivePickSessions() {
    try {
        const sessions = JSON.parse(localStorage.getItem('active_pick_sessions') || '[]');
        return Array.isArray(sessions) ? sessions : [];
    } catch (error) {
        console.warn('[PACK] active_pick_sessions invalido. Limpando cache local.', error);
        localStorage.removeItem('active_pick_sessions');
        return [];
    }
}

function setActivePickSessions(sessions) {
    localStorage.setItem('active_pick_sessions', JSON.stringify(Array.isArray(sessions) ? sessions : []));
}

// Global Session State moved to top for hoisting safety
async function renderPackSessionDetails(sessionId) {
    const currentUser = localStorage.getItem('currentUser');
    const activeSessions = getActivePickSessions();
    const session = activeSessions.find(s => s.id === sessionId);
    
    // Verificar se o mesmo usuﾃ｡rio que fez a Separaﾃｧﾃ｣o estﾃ｡ tentando fazer a Conferﾃｪncia
    const separacaoSession = (appData.separacao || []).find(s => 
        (s.separacao_id || s.col_a) === sessionId
    );
    
    if (separacaoSession) {
        const criadoPor = (separacaoSession.criado_por || separacaoSession.col_e || '').trim().toLowerCase();
        const usuarioAtual = (currentUser || '').trim().toLowerCase();
        
        if (criadoPor && criadoPor === usuarioAtual) {
            showToast("Esta conferﾃｪncia deve ser realizada por outro usuﾃ｡rio. O mesmo usuﾃ｡rio que fez a separaﾃｧﾃ｣o nﾃ｣o pode conferir esta sessﾃ｣o.", "error");
            playBeep('error');
            return;
        }
    }
    
    // Extrair o canal para manter a cor na conferﾃｪncia
    const channelName = separacaoSession ? (separacaoSession.canal_nome || separacaoSession.col_d || '') : '';
    const channelConfig = getChannelConfig(channelName);
    const channelColorClass = channelConfig.color || '';

    // INICIALIZAR SESSﾃグ IMEDIATAMENTE para permitir bipagem sem depender de sync
    currentPackSession = session || {
        id: sessionId,
        items: [],
        pickingData: { separacao_id: sessionId, canal_nome: channelName },
        conferenceRows: []
    };
    
    // 0. Renderizar a Moldura Imediatamente com sessﾃ｣o inicializada
    renderPackSessionFrame(sessionId, currentUser, channelColorClass, channelName);

    // 1. Buscar itens da planilha em BACKGROUND (nﾃ｣o bloqueante)
    try {
        let expectedItems = (appData.separacao_itens || []).filter(item => item.separacao_id === sessionId);
        if (expectedItems.length === 0) {
            const freshData = await DataClient.loadModule('conferencia', true);
            if (freshData) {
                appData.separacao = freshData.separacao || appData.separacao || [];
                appData.separacao_itens = freshData.separacao_itens || appData.separacao_itens || [];
                appData.conferencia = freshData.conferencia || appData.conferencia || [];
                expectedItems = (appData.separacao_itens || []).filter(item => item.separacao_id === sessionId);
            }
        }
        if (expectedItems.length === 0) {
            const itemsRes = await safeGet(`action=find&sheet=separacao_itens&field=separacao_id&value=${sessionId}`);
            expectedItems = itemsRes.data || [];
        }
        if (expectedItems.length === 0 && session && Array.isArray(session.items) && session.items.length > 0) {
            expectedItems = session.items;
        }
        
        // Reconstruir conferenceRows baseando-se no que estﾃ｡ na planilha
        const groupedExpected = expectedItems.reduce((acc, item) => {
            const key = item.ean || item.id_interno;
            if (!key) return acc;
            if (!acc[key]) {
                acc[key] = {
                    ...item,
                    descricao: item.descricao || item.descri_ao || item.descricao_base || item.nome || key,
                    qtd_separada: 0,
                    qtd_conferida: 0,
                    divergencia: 'FALTA'
                };
            }
            acc[key].qtd_separada += parseFloat(item.quantidade ?? item.qty ?? item.qtd_separada ?? 0);
            return acc;
        }, {});

        // Se jﾃ｡ existia cache local com conferﾃｪncia em andamento, mesclar quantidades
        if (session && session.conferenceRows) {
            session.conferenceRows.forEach(row => {
                const key = row.ean || row.id_interno;
                if (groupedExpected[key]) {
                    groupedExpected[key].qtd_conferida = row.qtd_conferida;
                }
            });
        }

        const conferenceRows = Object.keys(groupedExpected).length > 0
            ? Object.values(groupedExpected)
            : (session && Array.isArray(session.conferenceRows) ? session.conferenceRows : []);

        currentPackSession = {
            id: sessionId,
            items: expectedItems,
            pickingData: {
                separacao_id: sessionId,
                canal_nome: expectedItems.length > 0 ? (expectedItems[0].canal_nome || sessionId.split('-')[1] || '') : ''
            },
            conferenceRows
        };

        // Salvar no local para persistﾃｪncia de sessﾃ｣o ativa
        if (!session) {
            activeSessions.push(currentPackSession);
        } else {
            const idx = activeSessions.findIndex(s => s.id === sessionId);
            if (idx >= 0) activeSessions[idx] = currentPackSession;
        }
        setActivePickSessions(activeSessions);

        // Atualizar lista apﾃｳs carregar dados
        const packList = document.getElementById('pack-items-list');
        if (packList) packList.innerHTML = renderPackItemsListHTML();
        
    } catch (err) {
        console.error("Erro ao carregar sessﾃ｣o:", err);
        showToast("Erro ao carregar dados da planilha.", "error");
    }
}

/**
 * Renderiza apenas a moldura da tela de conferﾃｪncia para resposta imediata
 */
function renderPackSessionFrame(sessionId, currentUser, channelColorClass = '', channelName = '') {
    const icon = getChannelConfig(channelName).svgIcon || menu3DIcons?.conferencia || '<span class="material-symbols-rounded">inventory_2</span>';
    const title = channelName ? channelName.toUpperCase() : 'CONFERﾃ劾CIA';

    app.innerHTML = `
        <div class="dashboard-screen fade-in internal no-top-bar pack-screen ${channelColorClass}">
            ${getTopBarHTML(currentUser, "renderPackMenu()")}
            ${getOperationalIdentityHTML('PACK')}

            <main class="container pack-workspace">
                <div class="pack-main-panel">
                    <div class="pack-session-header" id="pack-session-header">
                        <div class="pack-session-title-block">
                            <div class="pack-session-icon">${icon}</div>
                            <div>
                                <div class="pack-session-kicker">Conferﾃｪncia / Pack</div>
                                <h2>${title}</h2>
                                <span>Separaﾃｧﾃ｣o: ${sessionId}</span>
                            </div>
                        </div>
                        <div class="pack-session-stats" id="pack-session-stats">
                            <div class="pack-stat"><span>Total</span><strong>0</strong></div>
                            <div class="pack-stat"><span>Conferidos</span><strong>0</strong></div>
                            <div class="pack-stat"><span>Pendentes</span><strong>0</strong></div>
                            <div class="pack-status-badge pending">Carregando</div>
                        </div>
                    </div>

                    <div class="pack-scan-wrapper">
                        <span class="material-symbols-rounded">barcode_scanner</span>
                        <input type="text" id="pack-ean-input" class="product-search-input" 
                               placeholder="Bipar EAN ou Codigo..." 
                               onkeypress="if(event.key === 'Enter') addPackScan()" autofocus>
                        <button class="product-scanner-btn" onclick="startScanner(false, true)" title="Abrir Scanner">
                            <span class="material-symbols-rounded">photo_camera</span>
                        </button>
                    </div>

                    <div id="pack-divergence-alert" class="pack-divergence-alert hidden"></div>
                    <div id="pack-items-list" class="pack-items-list"></div>
                </div>

                <div class="pack-footer-bar">
                    <div class="pack-footer-inner">
                        <div class="pack-footer-summary">
                            <span>Total: <strong id="pack-total-count">0</strong></span>
                            <span>Bipes: <strong id="pack-checked-count">0</strong></span>
                            <span>Modo: <strong id="pack-pending-count">cego</strong></span>
                        </div>
                        <button class="btn-action pack-btn-finish" id="btn-finish-pack" disabled>
                            <span class="material-symbols-rounded">check_circle</span>
                            Finalizar Conferﾃｪncia
                        </button>
                    </div>
                </div>
            </main>
        </div>
    `;
    
    const eanInput = document.getElementById('pack-ean-input');
    if (eanInput) eanInput.focus();
}

function getProductForConferenceRow(row) {
    return (appData.products || []).find(p =>
        (row.ean && String(p.ean || '') === String(row.ean)) ||
        (row.id_interno && String(p.id_interno || p.col_A || p.col_a || '') === String(row.id_interno))
    ) || {};
}

function getConferenceRowState(row) {
    const expected = parseFloat(row.qtd_separada || 0);
    const checked = parseFloat(row.qtd_conferida || 0);
    if (row.divergencia === 'SOBRA' || checked > expected) return { key: 'divergent', label: expected === 0 ? 'Extra' : 'Divergente', tone: 'danger' };
    if (checked <= 0) return { key: 'pending', label: 'Pendente', tone: 'muted' };
    if (checked === expected) return { key: 'ok', label: 'Conferido', tone: 'success' };
    return { key: 'partial', label: 'Parcial', tone: 'warning' };
}

function getPackStats() {
    const rows = currentPackSession?.conferenceRows || [];
    const total = rows.length;
    const checkedItems = rows.filter(r => parseFloat(r.qtd_conferida || 0) > 0).length;
    const pending = rows.filter(r => parseFloat(r.qtd_conferida || 0) <= 0).length;
    const divergences = rows.filter(r => {
        const expected = parseFloat(r.qtd_separada || 0);
        const checked = parseFloat(r.qtd_conferida || 0);
        return checked > 0 && (checked !== expected || r.divergencia === 'SOBRA');
    }).length;
    const expectedQty = rows.reduce((sum, r) => sum + parseFloat(r.qtd_separada || 0), 0);
    const checkedQty = rows.reduce((sum, r) => sum + parseFloat(r.qtd_conferida || 0), 0);
    return { total, checkedItems, pending, divergences, expectedQty, checkedQty };
}

function updatePackChrome() {
    const stats = getPackStats();
    const statusKey = stats.checkedQty > 0 ? 'active' : 'ready';
    const statusLabel = stats.checkedQty > 0 ? 'Em conferﾃｪncia' : 'Aberta';
    const statsEl = document.getElementById('pack-session-stats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="pack-stat"><span>Produtos</span><strong>${stats.checkedItems}</strong></div>
            <div class="pack-stat"><span>Bipes</span><strong>${stats.checkedQty}</strong></div>
            <div class="pack-status-badge ${statusKey}">${statusLabel}</div>
        `;
    }

    const alertEl = document.getElementById('pack-divergence-alert');
    if (alertEl) {
        alertEl.classList.add('hidden');
        alertEl.innerHTML = '';
    }

    const totalEl = document.getElementById('pack-total-count');
    const checkedEl = document.getElementById('pack-checked-count');
    const pendingEl = document.getElementById('pack-pending-count');
    if (totalEl) totalEl.textContent = stats.checkedItems;
    if (checkedEl) checkedEl.textContent = stats.checkedQty;
    if (pendingEl) pendingEl.textContent = 'cego';
}

function renderPackItemsListHTML() {
    if (!currentPackSession || !currentPackSession.conferenceRows) return '';
    
    // Atualizar estado do botﾃ｣o de finalizar se jﾃ｡ carregou
    const btnFinish = document.getElementById('btn-finish-pack');
    if (btnFinish) {
        btnFinish.disabled = false;
        btnFinish.setAttribute('onclick', 'finishConferenceSession()');
    }

    updatePackChrome();

    const rowsToShow = currentPackSession.conferenceRows.filter(row => parseFloat(row.qtd_conferida || 0) > 0);

    if (rowsToShow.length === 0) {
        if (btnFinish) btnFinish.disabled = true;
        return `<div class="pack-empty-state">Clique no campo acima e bipe um produto para iniciar a conferﾃｪncia cega.</div>`;
    }

    if (btnFinish) btnFinish.disabled = !rowsToShow.some(row => parseFloat(row.qtd_conferida || 0) > 0);

    return rowsToShow.map(row => {
        const index = currentPackSession.conferenceRows.indexOf(row);
        const product = getProductForConferenceRow(row);
        const sku = product.sku_fornecedor || product.sku || row.sku || '-';
        const marca = product.marca || row.marca || '';
        const checked = parseFloat(row.qtd_conferida || 0);
        return `
            <div class="fade-in conference-item pack-item-card success">
                <div class="pack-item-info">
                    <div class="pack-info-row"><span class="material-symbols-rounded">tag</span><strong>ID</strong><em>${row.id_interno || '-'}</em></div>
                    <div class="pack-info-row"><span class="material-symbols-rounded">inventory_2</span><strong>SKU</strong><em>${sku}</em></div>
                    <div class="pack-info-row"><span class="material-symbols-rounded">barcode</span><strong>EAN</strong><em>${row.ean || '-'}</em></div>
                    ${marca ? `<div class="pack-info-row"><span class="material-symbols-rounded">sell</span><strong>Marca</strong><em>${marca}</em></div>` : ''}
                </div>
                <div class="pack-item-product">
                    <span>${row.descricao || product.descricao_completa || product.descricao_base || 'Produto sem descriﾃｧﾃ｣o'}</span>
                    <div class="pack-item-badge success">Bipado</div>
                </div>
                <div class="pack-item-qty">
                    <div class="pack-qty-blind">
                        <span>Qtd. bipada</span>
                        <strong>${checked}</strong>
                    </div>
                    <div class="pack-qty-control">
                        <button onclick="adjustConferenceRowDirect(${index}, -1)">
                            <span class="material-symbols-rounded" style="font-size: 14px;">remove</span>
                        </button>
                        <strong>${checked}</strong>
                        <button onclick="adjustConferenceRowDirect(${index}, 1)">
                            <span class="material-symbols-rounded" style="font-size: 14px;">add</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function adjustConferenceRowDirect(index, delta) {
    const row = currentPackSession.conferenceRows[index];
    row.qtd_conferida = Math.max(0, row.qtd_conferida + delta);
    
    if (row.qtd_conferida === row.qtd_separada) {
        row.divergencia = 'OK';
    } else if (row.qtd_conferida > row.qtd_separada) {
        row.divergencia = 'SOBRA';
    } else {
        row.divergencia = 'FALTA';
    }
    
    document.getElementById('pack-items-list').innerHTML = renderPackItemsListHTML();
}

/**
 * Fun?o Compartilhada para Busca Manual de Produto
 */
function openManualAddProduct(callback) {
    const term = prompt("Digite o EAN ou C?digo do produto para adicionar:");
    if (!term) return;

    const product = appData.products.find(p =>
        (p.ean && p.ean.toString() === term) ||
        (p.id_interno && p.id_interno.toString() === term) ||
        (p.sku_fornecedor && p.sku_fornecedor.toString() === term)
    );

    if (!product) {
        playBeep('error');
        showToast("Produto n?o encontrado!");
        return;
    }

    playBeep('success');
    callback(product);
}

function openManualAddProductToSession(sessionId, type = 'PACK') {
    openManualAddProduct((product) => {
        if (type === 'PACK') {
            manualAddItemToConference(product);
        } else {
            // L?gica para Separa?o
            const existing = currentSessionItems.find(item => item.ean == product.ean || item.id_interno == product.id_interno);
            if (existing) {
                existing.qty = (existing.qty || 0) + 1;
            } else {
                currentSessionItems.unshift({
                    ...product,
                    qty: 1,
                    scanTime: new Date().toLocaleTimeString()
                });
            }
            updatePickItemsList();
            showToast(`Item adicionado: ${product.descricao_base}`);
            
            if (currentPickSession && currentPickSession.id === sessionId) {
                currentPickSession.items = currentSessionItems;
                renderPickResult(sessionId, currentPickSession.channelId, currentPickSession.channelLabel, currentPickSession.channelColor);
            }
        }
    });
}

function manualAddItemToConference(product) {
    let row = currentPackSession.conferenceRows.find(r => r.ean === product.ean || r.id_interno === product.id_interno);
    if (row) {
        row.qtd_conferida++;
    } else {
        row = {
            separacao_id: currentPackSession.pickingData.separacao_id,
            rom_id: currentPackSession.id,
            id_interno: product.id_interno || '',
            ean: product.ean || '',
            descricao: product.descricao_base || 'Produto Adicionado',
            qtd_separada: 0,
            qtd_conferida: 1,
            divergencia: 'SOBRA'
        };
        currentPackSession.conferenceRows.push(row);
    }
    // Atualizar lista de conferidos
    const packList = document.getElementById('pack-items-list');
    if (packList) packList.innerHTML = renderPackItemsListHTML();
    
    // Atualizar botﾃ｣o de finalizar
    const btnFinish = document.getElementById('btn-finish-pack');
    if (btnFinish) {
        btnFinish.style.opacity = '1';
        btnFinish.style.cursor = 'pointer';
        btnFinish.setAttribute('onclick', 'finishConferenceSession()');
    }
}




function addPackScan(scannedEan = null) {
    const input = document.getElementById('pack-ean-input');
    const ean = (scannedEan || input.value.trim()).toString();
    if (!ean) return;

    let row = currentPackSession.conferenceRows.find(r =>
        (r.ean && r.ean.toString() === ean) ||
        (r.id_interno && r.id_interno.toString() === ean)
    );

    if (row) {
        playBeep('success');
        console.log(`[BIP CONTINUO DEBUG] produto adicionado (conferﾃｪncia): ${row.id_interno || ean}`);
        row.qtd_conferida++;

        // Update divergence
        if (row.qtd_conferida === row.qtd_separada) {
            row.divergencia = 'OK';
        } else if (row.qtd_conferida > row.qtd_separada) {
            row.divergencia = 'SOBRA';
        } else {
            row.divergencia = 'FALTA';
        }
        showToast(`Conferido: ${row.descricao}`);
    } else {
        // Item scanned but not in picking session (SOBRA)
        playBeep('error');
        showToast("Item nﾃ｣o encontrado nesta separaﾃｧﾃ｣o! Registrado como SOBRA.");

        // Try to find product info in appData.products
        const product = appData.products.find(p =>
            (p.ean && p.ean.toString() === ean) ||
            (p.sku_fornecedor && p.sku_fornecedor.toString() === ean) ||
            (p.id_interno && p.id_interno.toString() === ean) ||
            (p.col_a && p.col_a.toString() === ean) ||
            (p.col_A && p.col_A.toString() === ean)
        );

        row = {
            rom_id: currentPackSession.id,
            id_interno: product ? (product.id_interno || product.col_a || product.col_A || '') : '',
            ean: ean,
            descricao: product ? (product.descricao_base || product.col_aa || 'PRODUTO Nﾃグ IDENTIFICADO') : 'PRODUTO Nﾃグ IDENTIFICADO',
            qtd_separada: 0,
            qtd_conferida: 1,
            divergencia: 'SOBRA',
            conferido_por: '',
            conferido_em: ''
        };
        currentPackSession.conferenceRows.push(row);
    }

    input.value = '';
    document.getElementById('pack-items-list').innerHTML = renderPackItemsListHTML();
    showInputFeedback('pack-ean-input', row && row.divergencia !== 'SOBRA' ? 'success' : 'error');
}

/**
 * TELA DE CORREﾃ�グ DE DIVERGﾃ劾CIA (Obrigatﾃｳria se houver erro)
 */
function renderConferenceCorrection() {
    const currentUser = localStorage.getItem('currentUser');
    const hasDivergence = currentPackSession.conferenceRows.some(r => r.divergencia !== 'OK');
    const isStarted = currentPackSession.conferenceRows.some(r => r.qtd_conferida > 0);
    
    // [BLOQUEIO DE DIVERG?NCIA] - Somente permitimos finalizar se hasDivergence for false
    
    let conferenceStatus = 'EM CONFERﾃ劾CIA';
    if (hasDivergence && isStarted) conferenceStatus = 'COM DIVERG?NCIA';
    if (!hasDivergence) conferenceStatus = 'CONFERIDO';


    // Rolar para o primeiro erro se houver divergﾃｪncia
    if (hasDivergence) {
        setTimeout(() => {
            const firstError = document.querySelector('.conference-item-error');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstError.style.boxShadow = '0 0 20px rgba(227, 6, 19, 0.3)';
                setTimeout(() => firstError.style.boxShadow = '', 2000);
            }
        }, 300);
    }

    app.innerHTML = `
                <div class="dashboard-screen fade-in internal">
                    ${getTopBarHTML(currentUser, "renderPackSessionDetails('" + currentPackSession.id + "')")}

                    <main class="container">
                        <div class="sub-menu-header" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                            <div style="font-size: 0.7rem; color: var(--primary); font-weight: 800; letter-spacing: 0.1em;">RESULTADO DA CONFERﾃ劾CIA</div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <h2 style="font-size: 1.2rem; font-weight: 700;">${currentPackSession.id}</h2>
                                <span class="status-pill" style="background: ${hasDivergence ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'}; color: ${hasDivergence ? '#ef4444' : '#22c55e'}; font-size: 0.6rem; padding: 2px 8px; border-radius: 4px; font-weight: 800; border: 1px solid ${hasDivergence ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'};">
                                    ${conferenceStatus}
                                </span>
                            </div>
                        </div>

                        <div style="margin-bottom: 24px; padding: 20px; border-radius: 20px; background: ${hasDivergence ? 'rgba(239, 68, 68, 0.05)' : 'rgba(34, 197, 94, 0.1)'}; border: 1px solid ${hasDivergence ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}; text-align: center;">
                            <span class="material-symbols-rounded" style="font-size: 48px; color: ${hasDivergence ? '#ef4444' : '#22c55e'}; margin-bottom: 12px;">
                                ${hasDivergence ? 'report' : 'task_alt'}
                            </span>
                            <h3 style="font-size: 1.1rem; font-weight: 700; color: white;">
                                ${hasDivergence ? 'Atenﾃｧﾃ｣o: Divergﾃｪncia Detectada' : 'Fluxo Validado com Sucesso'}
                            </h3>
                            <p style="font-size: 0.8rem; color: var(--muted); margin-top: 4px;">
                                ${hasDivergence ? 'Hﾃ｡ uma diferenﾃｧa entre o separado e o conferido. Ajuste obrigatﾃｳrio para liberar.' : 'Tudo em ordem. O status final serﾃ｡ gravado como CONFERIDO.'}
                            </p>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px;">
                            ${currentPackSession.conferenceRows.map((row, index) => {
        if (row.divergencia === 'OK' && !hasDivergence) return ''; // Hide OK rows if everything is OK to keep it clean

        let statusColor = '#ef4444'; // FALTA
        if (row.divergencia === 'OK') statusColor = '#22c55e';
        if (row.divergencia === 'SOBRA') statusColor = '#f59e0b';

        return `
                                    <div class="fade-in ${row.divergencia !== 'OK' ? 'conference-item-error' : ''}" 
                                         id="conf-res-item-${index}"
                                         style="background: var(--surface); padding: 16px; border-radius: 16px; border: 1px solid ${row.divergencia !== 'OK' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.05)'}; transition: all 0.3s ease;">
                                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                                            <div style="width: 32px; height: 32px; background: ${row.divergencia === 'SOBRA' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.05)'}; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 1px solid ${row.divergencia === 'SOBRA' ? 'rgba(245, 158, 11, 0.2)' : 'transparent'};">
                                                <span class="material-symbols-rounded" style="font-size: 18px; color: ${statusColor}">${row.divergencia === 'OK' ? 'check_circle' : (row.divergencia === 'SOBRA' ? 'priority_high' : 'error')}</span>
                                            </div>
                                            <div style="flex: 1;">
                                                <div style="font-weight: 700; font-size: 0.85rem; color: white;">${row.descricao}</div>
                                                <div style="font-size: 0.65rem; color: var(--muted);">EAN: ${row.ean}</div>
                                            </div>
                                            <div style="text-align: right; font-size: 0.7rem; font-weight: 900; color: ${statusColor}; background: ${statusColor}1A; padding: 2px 8px; border-radius: 4px;">
                                                ${row.divergencia}
                                            </div>
                                        </div>
                                        
                                        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px;">
                                            <div style="font-size: 0.7rem; color: var(--muted);">
                                                Esperado: <span style="color: white; font-weight: 700;">${row.qtd_separada}</span>
                                            </div>
                                            
                                            <div style="display: flex; align-items: center; gap: 15px;">
                                                <button onclick="adjustConferenceRow(${index}, -1)" style="width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: white; display: flex; align-items: center; justify-content: center;">
                                                    <span class="material-symbols-rounded" style="font-size: 18px;">remove</span>
                                                </button>
                                                <div style="font-weight: 800; font-size: 1rem; color: var(--primary); min-width: 20px; text-align: center;">
                                                    ${row.qtd_conferida}
                                                </div>
                                                <button onclick="adjustConferenceRow(${index}, 1)" style="width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: white; display: flex; align-items: center; justify-content: center;">
                                                    <span class="material-symbols-rounded" style="font-size: 18px;">add</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                `;
    }).join('')}
                        
                        ${hasDivergence ? `
                        <div style="margin: 20px 0; padding: 16px; background: rgba(234, 179, 8, 0.1); border-radius: 12px; border: 1px solid rgba(234, 179, 8, 0.3); text-align: center;">
                            <p style="color: #facc15; font-weight: 600; margin-bottom: 16px;">Deseja corrigir as divergﾃｪncias?</p>
                            <button onclick="confirm('Clique OK para confirmar a correﾃｧﾃ｣o e prosseguir') && renderConferenceCorrection()" class="btn-action" style="width: 100%; background: #f59e0b;">
                                <span class="material-symbols-rounded">edit</span>
                                CORRIGIR E CONTINUAR
                            </button>
                        </div>
                        ` : ''}
                        
                        <!-- Botﾃ｣o Adicionar Produto Extra -->
                        <button onclick="openManualAddProductToSession('${currentPackSession.id}', 'PACK')" class="btn-action" style="width: 100%; border: 1px dashed var(--primary); background: transparent; margin-bottom: 20px;">
                            <span class="material-symbols-rounded">add_circle</span>
                            Adicionar Produto
                        </button>

                        <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px;">
                            <button class="btn-action" style="width: 100%; justify-content: center; background: var(--surface);" onclick="renderPackSessionDetails('${currentPackSession.id}')">
                                <span class="material-symbols-rounded">barcode_scanner</span>
                                VOLTAR PARA BIPAGEM
                            </button>
                            
                            <button class="btn-action" id="btn-finish-atomic"
                                    style="width: 100%; justify-content: center; background: #22c55e; ${hasDivergence ? 'opacity: 0.5; cursor: not-allowed;' : ''}" 
                                    ${hasDivergence ? 'disabled onclick="showToast(\'Corrija as divergﾃｪncias para finalizar\', \'warning\')"' : 'onclick="confirmFinishConference()"'}>
                                <span class="material-symbols-rounded">check_circle</span>
                                FINALIZAR E DAR BAIXA
                            </button>

                            ${hasDivergence ? `
                            <div style="text-align: center; color: #ef4444; font-size: 0.75rem; font-weight: 800; padding: 18px; background: rgba(239, 68, 68, 0.1); border-radius: 12px; border: 2px solid rgba(239, 68, 68, 0.3);">
                                <span class="material-symbols-rounded" style="vertical-align: middle; font-size: 24px; margin-bottom: 8px; display: block;">lock_clock</span>
                                <span style="display: block; font-size: 1rem; letter-spacing: 0.1em;">CORREﾃ�グ PENDENTE</span>
                                <p style="font-weight: 500; margin-top: 4px; opacity: 0.8;">Ajuste as quantidades para baterem com o esperado.</p>
                            </div>
                            ` : ''}
                        </div>
                    </main>
                </div>
            `;
}

function adjustConferenceRow(index, delta) {
    const row = currentPackSession.conferenceRows[index];
    const prevDivergence = row.divergencia;
    row.qtd_conferida = Math.max(0, row.qtd_conferida + delta);

    // Update divergence
    if (row.qtd_conferida === row.qtd_separada) {
        row.divergencia = 'OK';
    } else if (row.qtd_conferida > row.qtd_separada) {
        row.divergencia = 'SOBRA';
    } else {
        row.divergencia = 'FALTA';
    }

    // Registrar log interno caso tenha corrigido uma divergﾃｪncia
    if (prevDivergence !== 'OK' && row.divergencia === 'OK') {
        const logEntry = {
            timestamp: new Date().toISOString(),
            session: currentPackSession.id,
            item: row.ean,
            description: row.descricao,
            action: 'RECONCILIAﾃ�グ',
            from: prevDivergence,
            original_qtd: row.qtd_separada,
            final_qtd: row.qtd_conferida,
            user: localStorage.getItem('currentUser')
        };
        const logs = JSON.parse(localStorage.getItem('conference_correction_logs') || '[]');
        logs.push(logEntry);
        localStorage.setItem('conference_correction_logs', JSON.stringify(logs));
        console.log('Divergﾃｪncia corrigida logada:', logEntry);
    }

    // Persistﾃｪncia imediata no localStorage para evitar perda em F5
    let activeSessions = getActivePickSessions();
    const sIndex = activeSessions.findIndex(s => s.id === currentPackSession.id);
    if (sIndex !== -1) {
        activeSessions[sIndex] = currentPackSession;
        setActivePickSessions(activeSessions);
    }

    renderConferenceCorrection();
}

async function finishConferenceSession() {
    // 1. Validar se hﾃ｡ divergﾃｪncia (Comparaﾃｧﾃ｣o de Ouro)
    const hasDivergence = currentPackSession.conferenceRows.some(row => 
        parseFloat(row.qtd_conferida || 0) !== parseFloat(row.qtd_separada || 0)
    );

    if (hasDivergence) {
        showToast("Divergﾃｪncia detectada! Abrindo tela de correﾃｧﾃ｣o.", "warning");
        playBeep('error');
        renderConferenceCorrection();
    } else {
        // Se bater 100%, jﾃ｡ oferece finalizar
        if (confirm("Conferﾃｪncia perfeita! Deseja finalizar e dar baixa no estoque agora?")) {
            await confirmFinishConference();
        } else {
            renderConferenceCorrection(); // Mostra o resumo mesmo assim
        }
    }
}

function startFastPackSession(channelLabel, channelColor) {
    const currentUser = localStorage.getItem('currentUser');
    const now = new Date();
    const ddmm = now.getDate().toString().padStart(2, '0') + (now.getMonth() + 1).toString().padStart(2, '0');
    const todayStr = now.toLocaleDateString('pt-BR');
    const cleanChannel = channelLabel.split(' ')[0].toUpperCase();

    let countInSheet = 0;
    if (appData.conferencia && Array.isArray(appData.conferencia)) {
        // Approximate by looking at unique rom_ids in conferencia today
        const todayConf = appData.conferencia.filter(row => row.rom_id && row.rom_id.includes(`SEP-${cleanChannel}-${ddmm}`));
        const uniques = new Set(todayConf.map(r => r.rom_id));
        countInSheet = uniques.size;
    }
    const seq = countInSheet + 1;
    const sessionId = `SEP-${cleanChannel}-${ddmm}-${seq.toString().padStart(2, '0')}`;

    currentPackSession = {
        id: sessionId,
        channel: channelLabel,
        channelColor: channelColor || 'var(--primary)',
        items: [],
        pickingData: {
            separacao_id: sessionId,
            canal_id: channelColor || '',
            canal_nome: channelLabel,
            data_separacao: todayStr,
            status: 'rascunho',
            criado_por: currentUser,
            criado_em: now.toISOString(),
            finalizado_em: now.toISOString(), data_hora: now.toISOString(),
            observacao: 'MODO CONFERﾃ劾CIA DIRETA'
        },
        conferenceRows: [],
        isFastMode: true
    };

    renderPackSessionDetails(sessionId);
}

async function submitConferenceFinalization(payload) {
    if (!navigator.onLine) {
        await queueOperation('supabase_rpc', payload, {
            rpcName: 'finalizar_conferencia',
            module: 'conferencia'
        });
        return { queued: true };
    }

    try {
        await DataClient.finalizarConferenciaSupabase(payload);
        return { synced: true };
    } catch (error) {
        if (isRetryableConferenceSyncError(error)) {
            console.error('[CONFERENCIA] Falha de rede, mantendo operacao na outbox:', error);
            await queueOperation('supabase_rpc', payload, {
                rpcName: 'finalizar_conferencia',
                module: 'conferencia',
                lastOnlineError: error.message || String(error)
            });
            return { queued: true, error };
        }

        console.error('[CONFERENCIA] RPC rejeitada pelo Supabase:', error);
        throw error;
    }
}

function isRetryableConferenceSyncError(error) {
    if (!navigator.onLine) return true;
    const message = String(error?.message || error || '').toLowerCase();
    const retryableMessages = [
        'failed to fetch',
        'networkerror',
        'network request failed',
        'load failed',
        'timeout',
        'abort'
    ];
    return error?.name === 'TypeError'
        || error?.name === 'AbortError'
        || retryableMessages.some(text => message.includes(text));
}

function formatConferenceFinalizationError(error) {
    const message = String(error?.message || error || '').trim();

    if (error?.code === 'PGRST202' || error?.code === '42883' || message.toLowerCase().includes('finalizar_conferencia')) {
        return 'RPC finalizar_conferencia ainda nao foi aplicada no Supabase remoto.';
    }

    return message || 'Erro desconhecido ao finalizar conferencia.';
}

async function confirmFinishConference() {
    if (isFinalizing) return;
    isFinalizing = true;

    const btn = document.getElementById('btn-finish-atomic');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-rounded spin">sync</span> BAIXANDO...';
    }

    try {
        const currentUser = localStorage.getItem('currentUser');
        const sessionId = currentPackSession.id;
        const executionId = generateExecutionId();

        // Formatar linhas para o backend processar movimentos atomicos
        const rows = currentPackSession.conferenceRows.map(row => ({
            id_interno: row.id_interno,
            ean: row.ean,
            descricao: row.descricao,
            qtd_separada: row.qtd_separada,
            qtd_conferida: row.qtd_conferida,
            separacao_id: sessionId
        }));

        const finalizationResult = await submitConferenceFinalization({
            action: 'finalizar_conferencia',
            sessionId: sessionId,
            user: currentUser,
            rows: rows,
            executionId
        });

        showToast(finalizationResult.queued ? "Conferencia salva localmente para sincronizar." : "Conferencia finalizada e estoque baixado!");
        playBeep('success');

        // Limpar sessﾃｵes locais e cache
        localStorage.removeItem('draft_pack_session');
        let activeSessions = getActivePickSessions();
        activeSessions = activeSessions.filter(s => s.id !== sessionId);
        setActivePickSessions(activeSessions);

        // Atualizar appData local com status final para nﾃ｣o aparecer mais como pendente
        const sIdx = (appData.separacao || []).findIndex(s => (s.separacao_id || s.col_a) === sessionId);
        if (sIdx !== -1) {
            appData.separacao[sIdx].status = finalizationResult.queued ? 'pendente_sync' : 'finalizada';
        }

        renderMenu();
    } catch (err) {
        console.error("Erro na finalizacao:", err);
        showToast("Erro: " + formatConferenceFinalizationError(err));
    } finally {
        isFinalizing = false;
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    }
}



async function backFromConference() {
    renderPackMenu();
}

function handleMenuClick(label) {
    console.log('Menu clicked:', label);
}

function toggleQuickActions() {
    const menu = document.getElementById('quick-actions-menu');
    const overlay = document.getElementById('quick-actions-overlay');
    const icon = document.getElementById('quick-action-icon');
    
    if (menu) {
        const isHidden = menu.classList.contains('hidden');
        
        if (isHidden) {
            menu.classList.remove('hidden');
            if (overlay) overlay.classList.remove('hidden');
            if (icon) icon.textContent = 'close';
        } else {
            menu.classList.add('hidden');
            if (overlay) overlay.classList.add('hidden');
            if (icon) icon.textContent = 'add';
        }
    }
}

function startFastMode() {
    console.log('[FastMode] Iniciando modo rﾃ｡pido...');
    const config = getAppConfig();
    setAppConfig({ ...config, modo_rapido: true });
    ensureFreshData(() => renderPickMenu());
}

function stopFastMode() {
    console.log('[FastMode] Desativando modo rﾃ｡pido...');
    const config = getAppConfig();
    setAppConfig({ ...config, modo_rapido: false });
    renderMenu();
}

function quickActionNewMov() {
    toggleQuickActions();
    renderMovimentacoesSubMenu();
}

function quickActionSearch() {
    toggleQuickActions();
    renderSearchScreen();
}

function quickActionEntrada() {
    toggleQuickActions();
    ensureFreshData(() => renderPickMenu());
}

function quickActionSaida() {
    toggleQuickActions();
    ensureFreshData(() => renderPickMenu());
}

function quickActionAjuste() {
    toggleQuickActions();
    renderAjusteEstoqueScreen();
}

function quickActionNovoProduto() {
    toggleQuickActions();
    renderProductSubMenu();
}

// renderSearchScreen (versﾃ｣o operacional unificada no topo do arquivo)





/**
 * KIT Lﾃ�PADA - Mﾃｳdulo de consulta de veﾃｭculos (Supabase)
 */

function safeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}


async function ensureKitLampadaLoaded(force = false) {
    if (!force && Array.isArray(window.kitLampadaCache) && window.kitLampadaCache.length > 0) {
        console.log('[KIT] cache jﾃ｡ existe:', window.kitLampadaCache.length);
        return window.kitLampadaCache;
    }

    console.log('[KIT] abrindo tela kit_lampada');
    console.log('[KIT] supabaseClient existe?', !!window.supabaseClient);

    const client = window.supabaseClient;
    if (!client) {
        console.error('[KIT] Supabase client nﾃ｣o inicializado');
        return [];
    }
    
    try {
        const { data, error } = await client
            .from('kit_lampada')
            .select('*')
            .order('kit_lampada_id', { ascending: true });

        console.log('[KIT] data:', data);
        console.log('[KIT] error:', error);
        console.log('[KIT] total recebido:', data?.length || 0);

        if (error) {
            console.error('[KIT] erro ao buscar:', error);
            throw error;
        }

        const rows = data || [];
        if (rows.length === 0) {
            console.warn('[KIT] Nenhum dado retornado. Verifique RLS/policy da tabela kit_lampada.');
        }
        
        const normalizedRows = rows.map(item => ({
            ...item,
            _search: safeText([
                item.kit_lampada_id,
                item.montadora,
                item.modelo,
                item.observacao,
                item.status,
                item.lampada_baixo,
                item.lampada_alto,
                item.lampada_neblina,
                item.ano_inicio,
                item.ano_fim
            ].join(' '))
        }));

        window.kitLampadaCache = normalizedRows;
        appData.kit_lampada = normalizedRows;
        
        console.log('[KIT] cache criado:', window.kitLampadaCache.length);
        console.log('[KIT] exemplos:', window.kitLampadaCache.slice(0, 5));
        console.log('[KIT] teste civic:', window.kitLampadaCache.filter(x => x._search.includes('civic')));

        return normalizedRows;
    } catch (err) {
        console.error('[KIT] erro ao carregar:', err);
        throw err;
    }
}

function getKitLampadaSource() {
    return Array.isArray(window.kitLampadaCache) ? window.kitLampadaCache : [];
}

function searchKitLampada(term) {
    const query = safeText(term);
    if (!query) return [];

    const source = getKitLampadaSource();
    if (!source.length) {
        console.warn('[KIT] busca bloqueada: cache vazio');
        return [];
    }

    // Extrair potencial ano do termo de busca
    let searchYear = null;
    const yearMatch = term.match(/\b(20|19)\d{2}\b/);
    if (yearMatch) {
        searchYear = parseInt(yearMatch[0]);
    }

    return source
        .filter(item => {
            // Regra de Ano
            if (searchYear) {
                const anoInicio = item.ano_inicio ? Number(item.ano_inicio) : null;
                const anoFim = item.ano_fim ? Number(item.ano_fim) : null;
                
                let yearOk = false;
                if (!anoInicio && !anoFim) yearOk = true;
                else if (anoInicio && !anoFim) yearOk = searchYear >= anoInicio;
                else if (!anoInicio && anoFim) yearOk = searchYear <= anoFim;
                else if (anoInicio && anoFim) yearOk = searchYear >= anoInicio && searchYear <= anoFim;
                
                if (!yearOk) return false;
            }

            // Busca por texto (palavras-chave)
            const words = query.split(/\s+/).filter(w => w.length > 0);
            return words.every(word => {
                if (word === searchYear?.toString()) return true;
                return safeText(item._search).includes(word);
            });
        })
        .sort((a, b) => {
            const aModelo = safeText(a.modelo);
            const bModelo = safeText(b.modelo);
            const aMontadora = safeText(a.montadora);
            const bMontadora = safeText(b.montadora);

            const score = (item, modelo, montadora) => {
                let s = 0;
                if (modelo.startsWith(query)) s += 100;
                if (modelo.includes(query)) s += 80;
                if (montadora.includes(query)) s += 40;
                if (safeText(item._search).includes(query)) s += 10;
                return s;
            };

            const scoreA = score(a, aModelo, aMontadora);
            const scoreB = score(b, bModelo, bMontadora);

            if (scoreA !== scoreB) return scoreB - scoreA;
            return aModelo.localeCompare(bModelo);
        });
}


async function renderGuiaLampada(push = true) {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return renderLogin();
    
    currentScreen = 'kit_lampada';
    if (push) pushNav('kit_lampada');
    
    // 1. Mostrar estado de carregamento inicial
    app.innerHTML = `
        <div class="dashboard-screen fade-in internal product-search-screen kit-lampada-screen module-screen">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
            ${getModuleSidebarHTML('kit_lampada')}
            <main class="container product-search-center">
                <div id="kit-content-area">
                    <div style="text-align: center; padding: 100px 40px; color: var(--muted);">
                        <span class="material-symbols-rounded spin" style="font-size: 48px; color: var(--primary); margin-bottom: 24px;">sync</span>
                        <h2 style="color: white; margin-bottom: 8px;">Carregando dados...</h2>
                        <p style="font-size: 0.9rem; opacity: 0.7;">Sincronizando guia de lﾃ｢mpadas com o Supabase</p>
                    </div>
                </div>
            </main>
        </div>
    `;

    try {
        // 2. Garantir carregamento dos dados
        const data = await ensureKitLampadaLoaded();
        
        // 3. Renderizar interface de busca
        const contentArea = document.getElementById('kit-content-area');
        if (!contentArea) return;

        if (!data || data.length === 0) {
            contentArea.innerHTML = `
                <div style="text-align: center; padding: 80px 40px;">
                    <span class="material-symbols-rounded" style="font-size: 64px; color: #f59e0b; margin-bottom: 24px;">database_off</span>
                    <h2 style="color: white; margin-bottom: 12px;">Sem dados disponﾃｭveis</h2>
                    <p style="color: var(--muted); margin-bottom: 24px; max-width: 400px; margin-left: auto; margin-right: auto;">
                        Nenhum dado foi retornado pelo Supabase. Verifique RLS/policy da tabela "kit_lampada".
                    </p>
                    <button class="primary-btn" onclick="renderGuiaLampada(false)" style="margin: 0 auto; display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-rounded">refresh</span>
                        Tentar Novamente
                    </button>
                </div>
            `;
            return;
        }

        contentArea.innerHTML = `
            <div class="product-search-bar">
                <span class="material-symbols-rounded" style="color: var(--muted); font-size: 24px; margin-right: 12px;">search</span>
                <input
                    type="search"
                    id="kit-search-input"
                    class="product-search-input"
                    placeholder=""
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="none"
                    spellcheck="false"
                    inputmode="search"
                />
                <button class="product-search-camera-btn" type="button" aria-label="Escanear" onclick="startScanner()" style="margin-left: 10px;">
                    <span class="material-symbols-rounded" style="font-size: 24px; color: var(--primary);">qr_code_scanner</span>
                </button>
            </div>

            <div id="scanner-container" class="hidden" style="margin-top: 24px; overflow: hidden; border-radius: 20px; border: 2px solid var(--primary); background: #000; position: relative; width: 100%; max-width: 600px; margin-left: auto; margin-right: auto;">
                <div id="reader" style="width: 100%;"></div>
                <div style="position: absolute; top: 15px; right: 15px; z-index: 10;">
                    <button class="btn-action" style="padding: 10px; min-width: auto; border-radius: 50%; background: rgba(0,0,0,0.6);" onclick="stopScanner()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </div>
            </div>
            
            <div id="kit-results" class="product-search-results">
                <!-- Resultados limpos -->
            </div>
        `;
        
        const kitSearchInput = document.getElementById('kit-search-input');
        if (kitSearchInput) {
            kitSearchInput.addEventListener('input', (e) => {
                handleKitLampadaSearch(e.target.value);
            });
            setTimeout(() => kitSearchInput.focus(), 100);
        }

    } catch (err) {
        const contentArea = document.getElementById('kit-content-area');
        if (!contentArea) return;
        
        contentArea.innerHTML = `
            <div style="text-align: center; padding: 80px 40px;">
                <span class="material-symbols-rounded" style="font-size: 64px; color: #ef4444; margin-bottom: 24px;">error</span>
                <h2 style="color: white; margin-bottom: 12px;">Erro ao carregar Kit Lﾃ｢mpada</h2>
                <p style="color: var(--muted); margin-bottom: 24px; max-width: 400px; margin-left: auto; margin-right: auto;">
                    Nﾃ｣o foi possﾃｭvel conectar ao banco de dados. Verifique permissﾃｵes/RLS do Supabase.
                </p>
                <button class="primary-btn" onclick="renderGuiaLampada(false)" style="margin: 0 auto; display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-rounded">refresh</span>
                    Tentar Novamente
                </button>
            </div>
        `;
    }
}

window.debouncedKitSearch = debounce(() => {
    const term = document.getElementById('kit-search-input')?.value;
    handleKitLampadaSearch(term);
}, 250);

function handleKitLampadaSearch(term) {
    const resultsContainer = document.getElementById('kit-results');
    if (!resultsContainer) return;
    
    if (!term || term.trim().length < 2) {
        resultsContainer.innerHTML = '';
        document.body.classList.remove('search-signal-success', 'search-signal-warning', 'search-signal-error');
        return;
    }

    const filtered = searchKitLampada(term);
    if (filtered.length > 0) {
        showPageSearchSignal('success');
    } else if (term.trim().length >= 3) {
        showScanFeedback('warning', 'ITEM Nﾃグ ENCONTRADO');
    }
    renderKitLampadaResults(filtered, term);
}

function renderKitLampadaResults(results, term) {
    const resultsContainer = document.getElementById('kit-results');
    if (!resultsContainer) return;

    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--muted);">
                <span class="material-symbols-rounded" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;">search_off</span>
                <p>Nenhum veﾃｭculo encontrado para "${term}"</p>
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; width: 100%;">
            ${results.map(item => {
                const status = (item.status || 'verificar').toLowerCase();
                const statusColors = {
                    'postado': '#22c55e',
                    'revisar': '#f59e0b',
                    'verificar': '#ef4444'
                };
                const statusColor = statusColors[status] || statusColors.verificar;
                
                const anoStr = item.ano_inicio ? `${item.ano_inicio} - ${item.ano_fim || 'Presente'}` : 'Todos os anos';

                // Usamos escape para o JSON do item
                const itemData = JSON.stringify(item).replace(/'/g, "&#39;").replace(/"/g, '&quot;');

                return `
                    <div class="kit-lamp-card" onclick='renderKitDetailsCard(${itemData})'>
                        <div class="product-img-container" style="width: 70px; height: 70px; border-radius: 12px; background: rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.05);">
                            ${item.url ? 
                                `<img src="${item.url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;" onerror="this.outerHTML='<span class=&quot;material-symbols-rounded&quot; style=&quot;color: #555&quot;>directions_car</span>'">` : 
                                `<span class="material-symbols-rounded" style="color: #555">directions_car</span>`
                            }
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                                <span class="marca">${item.montadora}</span>
                                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 6px ${statusColor};" title="${status}"></div>
                            </div>
                            <div class="card-title">${highlightText(item.modelo, term)}</div>
                            <div class="card-subtitle">${anoStr}</div>
                            ${item.observacao ? `<div style="font-size: 0.65rem; color: #777; font-style: italic; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.observacao}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

}

window.openKitImageViewer = function(url) {
    if (!url) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay fade-in';
    overlay.style.zIndex = '2000';
    overlay.onclick = () => overlay.remove();
    
    overlay.innerHTML = `
        <div style="width: 90vw; height: 90vh; display: flex; align-items: center; justify-content: center; position: relative;">
            <button style="position: absolute; top: -10px; right: -10px; background: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10;">
                <span class="material-symbols-rounded" style="color: #111;">close</span>
            </button>
            <img src="${url}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
        </div>
    `;
    
    document.body.appendChild(overlay);
};

window.renderKitDetailsCard = function(item) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay fade-in';
    
    const anoStr = item.ano_inicio ? `${item.ano_inicio} - ${item.ano_fim || 'Presente'}` : 'Todos os anos';
    
    modal.innerHTML = `
        <div class="kit-detail-modal" id="kit-modal-content">
            <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">
                <span class="material-symbols-rounded">close</span>
            </button>

            <div class="kit-modal-image-area" style="width: 100%; height: 200px; background: #000; display: flex; align-items: center; justify-content: center; cursor: zoom-in;" onclick="openKitImageViewer('${item.url || ''}')">
                ${item.url ? 
                    `<img src="${item.url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.outerHTML='<span class=&quot;material-symbols-rounded&quot; style=&quot;font-size: 64px; color: var(--muted)&quot;>directions_car</span>'">` : 
                    `<span class="material-symbols-rounded" style="font-size: 64px; color: var(--muted)">directions_car</span>`
                }
            </div>

            <div style="padding: 24px;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <span class="marca">${item.montadora}</span>
                    <h2 class="modelo">${item.modelo}</h2>
                    <span class="ano">${anoStr}</span>
                </div>

                <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
                    <div class="kit-modal-item">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(227, 6, 19, 0.1); display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-rounded" style="color: var(--primary); font-size: 24px;">light_mode</span>
                        </div>
                        <div style="flex: 1;">
                            <span class="label">Farol Baixo</span>
                            <span class="valor">${item.lampada_baixo || 'N/A'}</span>
                        </div>
                    </div>

                    <div class="kit-modal-item">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-rounded" style="color: #3b82f6; font-size: 24px;">flashlight_on</span>
                        </div>
                        <div style="flex: 1;">
                            <span class="label">Farol Alto</span>
                            <span class="valor">${item.lampada_alto || 'N/A'}</span>
                        </div>
                    </div>

                    <div class="kit-modal-item">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(245, 158, 11, 0.1); display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-rounded" style="color: #f59e0b; font-size: 24px;">foggy</span>
                        </div>
                        <div style="flex: 1;">
                            <span class="label">Farol Neblina</span>
                            <span class="valor">${item.lampada_neblina || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                ${item.observacao ? `
                    <div style="margin-top: 16px; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.04); color: var(--muted); font-size: 0.78rem; line-height: 1.45;">
                        ${item.observacao}
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Pequeno delay para disparar a transiﾃｧﾃ｣o CSS
    setTimeout(() => {
        const innerModal = modal.querySelector('.kit-detail-modal');
        if (innerModal) innerModal.classList.add('open');
    }, 10);
};

function renderProductSubMenu() {
  const container = document.getElementById("app");

  if (!container) {
    console.error("Container principal nﾃ｣o encontrado para renderProductSubMenu");
    return;
  }

  container.innerHTML = `
    <div class="dashboard-screen internal fade-in product-submenu-screen module-screen">
      ${getTopBarHTML(localStorage.getItem('currentUser'), 'renderMenu()')}
      ${getModuleSidebarHTML('produtos')}

      <main class="container">
          <div class="menu-grid">
            <button class="menu-card mobile-nav-card" type="button" onclick="renderSearchScreen()">
              <span class="menu-icon-3d">${menu3DIcons.busca}</span>
              <span class="label">BUSCAR</span>
            </button>

            <button class="menu-card mobile-nav-card" type="button" onclick="typeof openProductCreate === 'function' ? openProductCreate() : renderEmptyModule('Cadastrar Produto')">
              <span class="menu-icon-3d">${menu3DIcons.cadastrar}</span>
              <span class="label">CADASTRAR</span>
            </button>

            <div class="channel-card mobile-nav-card" style="display: none;"></div>
          </div>
      </main>
    </div>
  `;
}

function renderConfigSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    const config = getAppConfig();
    currentScreen = 'internal';

    app.innerHTML = `
        <div class="dashboard-screen internal fade-in config-screen module-screen">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
            ${getModuleSidebarHTML('configuracoes')}
            
            <main class="container" style="padding-top: 100px;">
                <div style="padding: 0 20px;">

                    
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <!-- OPﾃ�グ 1 -->
                        <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 20px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.1);">
                            <div style="flex: 1;">
                                <div style="color: white; font-weight: 700; font-size: 1rem;">SAﾃ好A COM ESTOQUE ZERO</div>
                                <div style="color: var(--muted); font-size: 0.8rem; margin-top: 4px;">Permitir finalizar saﾃｭdas mesmo sem saldo em estoque.</div>
                            </div>
                            <div class="toggle-switch">
                                <input type="checkbox" id="toggle-estoque-zero" ${config.permitir_saida_estoque_zero ? 'checked' : ''} onchange="toggleConfig('permitir_saida_estoque_zero', this.checked)">
                                <label for="toggle-estoque-zero"></label>
                            </div>
                        </div>

                        <!-- OPﾃ�グ 2 -->
                        <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 20px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.1);">
                            <div style="flex: 1;">
                                <div style="color: white; font-weight: 700; font-size: 1rem;">MODO Rﾃ￣IDO</div>
                                <div style="color: var(--muted); font-size: 0.8rem; margin-top: 4px;">Simplifica fluxos e desabilita Separaﾃｧﾃ｣o manual.</div>
                            </div>
                            <div class="toggle-switch">
                                <input type="checkbox" id="toggle-modo-rapido" ${config.modo_rapido ? 'checked' : ''} onchange="toggleConfig('modo_rapido', this.checked)">
                                <label for="toggle-modo-rapido"></label>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 40px; text-align: center; color: var(--muted); font-size: 0.75rem;">
                        <p>DY AUTO PARTS - v2.0.0</p>
                    </div>
                </div>
            </main>
        </div>
    `;
}

function toggleConfig(key, value) {
    const config = getAppConfig();
    config[key] = value;
    setAppConfig(config);
    showToast(`Configuraﾃｧﾃ｣o atualizada`, 'success');
    
    // Se for modo rﾃ｡pido, recarregar menu se necessﾃ｡rio para feedback imediato
    if (key === 'modo_rapido') {
        renderMenu(false);
    }
}

async function renderGarantiaEnvioForm() {
    const currentUser = localStorage.getItem('currentUser');
    currentScreen = 'internal';

    // Garantir que produtos e estoque estejam carregados
    if (!appData.products || !appData.estoque) {
        showToast('Carregando dados...', 'info');
        await DataClient.loadModule('produtos', true);
    }

    let selectedProduct = null;
    let selectedSource = 'DEFEITO';

    function updateProductCard() {
        const cardContainer = document.getElementById('garantia-product-card-container');
        if (!selectedProduct) {
            cardContainer.innerHTML = '';
            return;
        }

        // Buscar estoque do produto por local
        const productEstoque = appData.estoque.filter(e => e.id_interno === selectedProduct.id_interno);
        const sourceStock = productEstoque.find(e => e.local === selectedSource)?.saldo_disponivel || 0;
        const garantiaStock = productEstoque.find(e => e.local === 'EM_GARANTIA')?.saldo_disponivel || 0;

        // Preencher campos automﾃ｡ticos
        const fornecedorInput = document.getElementById('garantia-fornecedor');
        if (fornecedorInput) fornecedorInput.value = selectedProduct.marca || selectedProduct.fornecedor || '';

        const custoInput = document.getElementById('garantia-custo-unitario');
        if (custoInput) custoInput.value = selectedProduct.preco_custo || 0;

        updateTotalCost();

        cardContainer.innerHTML = `
            <div class="product-mini-card fade-in" style="background: #f8f9fa; border-radius: 16px; padding: 16px; display: flex; gap: 16px; border: 1px solid #eee; margin-bottom: 20px;">
                <div style="width: 80px; height: 80px; background: white; border-radius: 12px; overflow: hidden; display: flex; align-items: center; justify-content: center; border: 1px solid #eee; flex-shrink: 0;">
                    <img src="${selectedProduct.url_imagem || '/imagens/placeholder-item.png'}" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.src='/imagens/placeholder-item.png'">
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 0.65rem; font-weight: 800; color: var(--primary); text-transform: uppercase; margin-bottom: 4px;">${selectedProduct.id_interno} | ${selectedProduct.ean || 'SEM EAN'}</div>
                    <div style="font-weight: 700; color: #101018; font-size: 0.9rem; line-height: 1.2; margin-bottom: 8px;">${selectedProduct.descricao}</div>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <div style="font-size: 0.7rem; color: #666;"><b>MARCA:</b> ${selectedProduct.marca || 'N/A'}</div>
                        <div style="font-size: 0.7rem; color: #666;"><b>ESTOQUE (${selectedSource}):</b> <span style="color: ${sourceStock > 0 ? '#22c55e' : '#ef4444'}; font-weight: 800;">${sourceStock}</span></div>
                        <div style="font-size: 0.7rem; color: #666;"><b>EM GARANTIA:</b> <span style="color: #3b82f6; font-weight: 800;">${garantiaStock}</span></div>
                    </div>
                </div>
            </div>
        `;
    }

    function updateTotalCost() {
        const qty = parseFloat(document.getElementById('garantia-quantidade')?.value || 0);
        const unit = parseFloat(document.getElementById('garantia-custo-unitario')?.value || 0);
        const totalInput = document.getElementById('garantia-custo-total');
        if (totalInput) totalInput.value = (qty * unit).toFixed(2);
    }

    app.innerHTML = `
        <div class="dashboard-screen internal fade-in garantia-screen">
            ${getNFBackButton('renderMovimentacoesSubMenu()')}
            
            <main class="container" style="padding-top: 60px;">
                <div style="padding: 0 20px 40px 20px;">
                    <h2 style="color: white; font-family: 'Fjalla One', sans-serif; margin-bottom: 20px;">ENVIAR PARA GARANTIA / DEVOLUﾃ�グ</h2>
                    
                    <div class="form-grid" style="background: white; padding: 24px; border-radius: 24px; gap: 16px;">
                        <div class="input-group full-width" style="position: relative;">
                            <label style="color: #666; margin-bottom: 8px; display: block; font-size: 0.75rem; font-weight: 700;">BUSCAR PRODUTO (NOME, EAN, ID, SKU)</label>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="product-search-bar" style="margin: 0; flex: 1; height: 50px; background: #f5f5f5; border: 1px solid #ddd;">
                                    <span class="material-symbols-rounded" style="color: #999; font-size: 20px; margin-right: 8px;">search</span>
                                    <input type="text" id="garantia-search-input" class="product-search-input" placeholder="Digite ou Bipe o EAN..." style="font-size: 0.9rem;" autocomplete="off">
                                </div>
                                <button class="product-search-camera-btn" type="button" onclick="console.log('[GARANTIA BUSCA DEBUG] scanner/camera input'); startScanner(false, false, false, true)" style="width: 50px; height: 50px; border-radius: 12px; background: #000; color: #fff; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                                    <span class="material-symbols-rounded">photo_camera</span>
                                </button>
                            </div>
                            <div id="garantia-search-dropdown" style="display: none; position: absolute; top: 85px; left: 0; right: 0; background: white; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); z-index: 100; max-height: 300px; overflow-y: auto; border: 1px solid #eee;"></div>
                        </div>

                        <!-- Scanner Container for Warranty -->
                        <div id="scanner-container-garantia" class="hidden" style="grid-column: 1 / -1; background: #000; border-radius: 16px; overflow: hidden; margin-bottom: 16px; border: 2px solid var(--primary); position: relative;">
                            <div id="reader-garantia" style="width: 100%;"></div>
                            <button onclick="stopScanner()" style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.2); border: none; color: white; padding: 8px; border-radius: 50%; display: flex; cursor: pointer; z-index: 10;">
                                <span class="material-symbols-rounded">close</span>
                            </button>
                        </div>


                        <div id="garantia-product-card-container" class="full-width"></div>
                        
                        <div class="input-group">
                            <label style="color: #666;">TIPO DA OPERAﾃ�グ</label>
                            <select id="garantia-tipo-operacao" class="input-field" style="background: #f5f5f5; appearance: none;">
                                <option value="GARANTIA_TECNICA">Garantia Tﾃｩcnica</option>
                                <option value="TROCA_COMERCIAL">Troca Comercial</option>
                                <option value="DEVOLUCAO_FORNECEDOR">Devoluﾃｧﾃ｣o Fornecedor</option>
                                <option value="RETORNO_CLIENTE">Retorno Cliente</option>
                                <option value="ERRO_OPERACIONAL">Erro Operacional</option>
                            </select>
                        </div>

                        <div class="input-group">
                            <label style="color: #666;">ORIGEM DO ESTOQUE</label>
                            <select id="garantia-origem-estoque" class="input-field" style="background: #f5f5f5; appearance: none;">
                                <option value="TERREO">TERREO</option>
                                <option value="MOSTRUARIO">MOSTRUARIO</option>
                                <option value="PRIMEIRO_ANDAR">PRIMEIRO ANDAR</option>
                                <option value="DEFEITO" selected>DEFEITO</option>
                                <option value="EM_GARANTIA">EM GARANTIA</option>
                            </select>
                        </div>

                        <div class="input-group full-width">
                            <label style="color: #666;">FORNECEDOR / DESTINO</label>
                            <input type="text" id="garantia-fornecedor" class="input-field" placeholder="Nome do Fornecedor" style="background: #f5f5f5;">
                        </div>

                        <div class="input-group">
                            <label style="color: #666;">QUANTIDADE</label>
                            <input type="number" id="garantia-quantidade" class="input-field" value="1" min="1" style="background: #f5f5f5;">
                        </div>

                        <div class="input-group">
                            <label style="color: #666;">CUSTO UNITﾃヽIO</label>
                            <input type="number" id="garantia-custo-unitario" class="input-field" value="0" readonly style="background: #eee; cursor: not-allowed;">
                        </div>

                        <div class="input-group full-width">
                            <label style="color: #666;">CUSTO TOTAL</label>
                            <input type="number" id="garantia-custo-total" class="input-field" value="0" readonly style="background: #eee; cursor: not-allowed;">
                        </div>

                        <div class="input-group full-width">
                            <label style="color: #666;">MOTIVO</label>
                            <select id="garantia-motivo" class="input-field" style="background: #f5f5f5; appearance: none;">
                                <option>Defeito de fﾃ｡brica</option>
                                <option>Queimado</option>
                                <option>Avaria</option>
                                <option>Troca autorizada</option>
                                <option>Produto incorreto</option>
                                <option>Cliente devolveu</option>
                                <option>Outros</option>
                            </select>
                        </div>

                        <div class="input-group full-width">
                            <label style="color: #666;">OBSERVAﾃ�グ Tﾃ韻NICA</label>
                            <textarea id="garantia-observacao" class="input-field" style="background: #f5f5f5; min-height: 80px;" placeholder="Detalhes tﾃｩcnicos..."></textarea>
                        </div>

                        <div style="grid-column: 1 / -1; margin-top: 10px;">
                            <button id="btn-save-garantia" class="btn-action" style="width: 100%; justify-content: center; padding: 18px; font-size: 1.1rem; background: #000 !important;">
                                <span class="material-symbols-rounded">send</span>
                                SALVAR ENVIO PARA GARANTIA
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;

    const searchInput = document.getElementById('garantia-search-input');
    const dropdown = document.getElementById('garantia-search-dropdown');
    const qtyInput = document.getElementById('garantia-quantidade');
    const sourceSelect = document.getElementById('garantia-origem-estoque');
    const btnSave = document.getElementById('btn-save-garantia');

    // Lﾃｳgica de Seleﾃｧﾃ｣o Global (acessﾃｭvel pelo handleProductScan)
    window.selectGarantiaProduct = function(product) {
        console.log(`[GARANTIA BUSCA DEBUG] produto selecionado:`, product);
        selectedProduct = product;
        searchInput.value = selectedProduct.descricao;
        updateProductCard();
    };

    // Lﾃｳgica de Busca Inteligente
    searchInput.addEventListener('input', async (e) => {
        const rawValue = e.target.value;
        console.log(`[GARANTIA BUSCA DEBUG] termo digitado: "${rawValue}"`);

        const term = normalizeProductSearchTerm(rawValue);
        
        if (term.length < 2) {
            dropdown.style.display = 'none';
            return;
        }

        await ensureProdutosLoaded();
        console.log(`[GARANTIA BUSCA DEBUG] produtos carregados: ${appData.products?.length || 0}`);

        // 1. Classificar Input (ID Interno, EAN, SKU)
        const classification = classifyProductInput(rawValue);
        console.log(`[GARANTIA BUSCA DEBUG] classificaﾃｧﾃ｣o:`, classification);

        let matches = [];

        if (classification.type !== 'text' && classification.type !== 'empty' && classification.type !== 'invalid') {
            // Busca por Match Exato (ID, EAN, SKU)
            const val = classification.value;
            matches = appData.products.filter(p => {
                const pEan = String(p.ean || '').trim();
                const pId = normalizeDyId(p.id_interno);
                const pIdClean = String(p.id_interno || '').replace(/\D/g, '');
                const valClean = String(val || '').replace(/\D/g, '');
                const pSku = String(p.sku_fornecedor || '').toUpperCase().trim();

                if (classification.type === 'ean') return pEan === val;
                if (classification.type === 'id_interno') {
                    return pId === val || pIdClean === valClean;
                }
                if (classification.type === 'code128') {
                    return pEan === val || pSku === val || pId === val || pIdClean === valClean;
                }
                return false;
            });
        }

        // 2. Se nﾃ｣o houver matches exatos ou for texto, busca por campos de texto
        if (matches.length === 0) {
            matches = appData.products.filter(p => {
                const searchFields = [
                    p.descricao,
                    p.id_interno,
                    p.id_interno ? p.id_interno.replace(/\D/g, '') : '',
                    p.ean,
                    p.sku_fornecedor,
                    p.marca,
                    p.categoria,
                    p.subcategoria,
                    p.atributos
                ];

                return searchFields.some(f => normalizeProductSearchTerm(f).includes(term));
            }).slice(0, 15);
        }

        console.log(`[GARANTIA BUSCA DEBUG] resultados encontrados: ${matches.length}`);

        if (matches.length > 0) {
            dropdown.innerHTML = matches.map(p => `
                <div class="search-item" data-id="${p.id_interno}" style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: background 0.2s;">
                    <img src="${p.url_imagem || '/imagens/placeholder-item.png'}" style="width: 40px; height: 40px; object-fit: contain; border-radius: 4px; background: #eee;" onerror="this.src='/imagens/placeholder-item.png'">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 700; font-size: 0.85rem; color: #101018; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.descricao}</div>
                        <div style="font-size: 0.7rem; color: #999;">${p.id_interno} | ${p.marca || 'S/M'} | Stock: ${appData.estoque?.filter(e => e.id_interno === p.id_interno).reduce((acc, curr) => acc + (curr.saldo_disponivel || 0), 0)}</div>
                    </div>
                </div>
            `).join('');
            dropdown.style.display = 'block';

            dropdown.querySelectorAll('.search-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = item.dataset.id;
                    const product = appData.products.find(p => p.id_interno === id);
                    if (product) window.selectGarantiaProduct(product);
                    dropdown.style.display = 'none';
                });
            });
        } else {
            dropdown.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #999; font-size: 0.85rem;">
                    <span class="material-symbols-rounded" style="display: block; font-size: 24px; margin-bottom: 8px;">search_off</span>
                    Nenhum produto encontrado
                </div>
            `;
            dropdown.style.display = 'block';
        }
    });

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    qtyInput.addEventListener('input', updateTotalCost);
    sourceSelect.addEventListener('change', (e) => {
        selectedSource = e.target.value;
        updateProductCard();
    });

    // Lﾃｳgica de Salvar
    btnSave.addEventListener('click', async () => {
        if (!selectedProduct) {
            showToast('Selecione um produto primeiro', 'warning');
            return;
        }

        const qty = parseFloat(qtyInput.value);
        if (qty <= 0) {
            showToast('Quantidade invﾃ｡lida', 'warning');
            return;
        }

        // Validar estoque na origem
        const productEstoque = appData.estoque.filter(e => e.id_interno === selectedProduct.id_interno);
        const sourceStock = productEstoque.find(e => e.local === selectedSource)?.saldo_disponivel || 0;

        if (qty > sourceStock) {
            showToast(`Estoque insuficiente em ${selectedSource} (Disponﾃｭvel: ${sourceStock})`, 'warning');
            return;
        }

        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="material-symbols-rounded spin">sync</span> PROCESSANDO...';

        try {
            const garantiaData = {
                id_interno: selectedProduct.id_interno,
                descricao_produto: selectedProduct.descricao,
                fornecedor: document.getElementById('garantia-fornecedor').value,
                tipo_operacao: document.getElementById('garantia-tipo-operacao').value,
                motivo: document.getElementById('garantia-motivo').value,
                observacao: document.getElementById('garantia-observacao').value,
                origem_estoque: selectedSource,
                quantidade: qty,
                custo_unitario: parseFloat(document.getElementById('garantia-custo-unitario').value),
                custo_total: parseFloat(document.getElementById('garantia-custo-total').value)
            };

            // 1. Salvar na tabela garantias
            const result = await DataClient.saveGarantiaSupabase(garantiaData);
            if (!result) throw new Error('Erro ao salvar registro de garantia');

            // 2. Registrar movimento de saﾃｭda da origem
            await DataClient.saveMovimentoSupabase({
                tipo: 'transferencia',
                id_interno: selectedProduct.id_interno,
                local_origem: selectedSource,
                local_destino: 'EM_GARANTIA',
                quantidade: qty,
                usuario: currentUser,
                origem: 'MODULO_GARANTIA',
                observacao: `${garantiaData.tipo_operacao}: Enviado de ${selectedSource} para EM_GARANTIA. Motivo: ${garantiaData.motivo}`
            });

            // 3. Atualizar estoque (Subtrair origem, Somar destino)
            const subOk = await DataClient.updateEstoqueSupabase(selectedProduct.id_interno, selectedSource, 'subtrai', qty);
            const addOk = await DataClient.updateEstoqueSupabase(selectedProduct.id_interno, 'EM_GARANTIA', 'soma', qty);

            if (subOk && addOk) {
                showToast('Garantia registrada e estoque movido!', 'success');
                // Recarregar dados do mﾃｳdulo para atualizar UI global
                await DataClient.loadModule('produtos', true);
                renderMovimentacoesSubMenu();
            } else {
                throw new Error('Erro ao atualizar saldos de estoque');
            }

        } catch (err) {
            console.error('Erro no fluxo de garantia:', err);
            showToast('Falha no processo: ' + err.message, 'error');
            btnSave.disabled = false;
            btnSave.innerHTML = '<span class="material-symbols-rounded">send</span> SALVAR ENVIO PARA GARANTIA';
        }
    });
}


function renderNFSubMenu() {
    const currentUser = localStorage.getItem('currentUser');
    currentScreen = 'internal';
    document.body.classList.remove('menu-active');
    
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in nf-submenu-screen entrada-nf-screen module-screen">
            ${getTopBarHTML(currentUser, 'renderMenu()')}
            ${getModuleSidebarHTML('nf')}

            <main class="container">
                <div class="menu-grid">
                    <div class="menu-card mobile-nav-card" onclick="renderNFPlaceholder('RECEBER POR XML')">
                        <span class="menu-icon-3d">${menu3DIcons.xml}</span>
                        <span class="label">RECEBER POR XML</span>
                    </div>

                    <div class="menu-card mobile-nav-card" onclick="renderNFManualForm()">
                        <span class="menu-icon-3d">${menu3DIcons.manual}</span>
                        <span class="label">RECEBIMENTO MANUAL</span>
                    </div>

                    <div class="menu-card mobile-nav-card" onclick="renderNFAbertasList()">
                        <span class="menu-icon-3d">${menu3DIcons.abertas}</span>
                        <span class="label">NOTAS EM ABERTO</span>
                    </div>

                    <div class="menu-card mobile-nav-card" onclick="renderNFPlaceholder('HISTﾃ迭ICO DE ENTRADAS')">
                        <span class="menu-icon-3d">${menu3DIcons.historico}</span>
                        <span class="label">HISTﾃ迭ICO DE ENTRADAS</span>
                    </div>
                </div>
            </main>
        </div>
    `;
}

function renderNFManualForm() {
    const currentUser = localStorage.getItem('currentUser');
    currentScreen = 'internal';
    
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in nf-form-screen entrada-nf-screen no-top-bar">
            ${getTopBarHTML(currentUser, 'renderNFSubMenu()')}
            
            <main class="container">
                <!-- CABEﾃ②LHO VISUAL -->
                <div class="screen-mini-title">
                    <div class="mini-icon">
                        ${menu3DIcons.nf}
                    </div>
                    <span>ENTRADA DE NOTA</span>
                </div>

                <div class="form-grid" style="padding: 0 20px 60px 20px; gap: 24px;">
                    
                    <!-- BLOCO 1: DADOS DA NF -->
                    <div class="form-section-block">
                        <div class="form-section-title" style="margin-top: 0;">BLOCO 1 - DADOS DA NF</div>
                        <div class="form-grid-inner" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                            <div class="input-group">
                                <label>Nﾂｺ NF</label>
                                <input type="text" id="nf_numero" class="input-field" placeholder="000000">
                            </div>
                            <div class="input-group">
                                <label>Sﾃｩrie</label>
                                <input type="text" id="nf_serie" class="input-field" placeholder="1">
                            </div>
                            <div class="input-group">
                                <label>Emissﾃ｣o</label>
                                <input type="date" id="nf_data_emissao" class="input-field">
                            </div>
                            <div class="input-group">
                                <label>Recebimento</label>
                                <input type="date" id="nf_data_recebimento" class="input-field" value="${new Date().toISOString().split('T')[0]}">
                            </div>
                            <div class="input-group full-width" style="grid-column: span 2;">
                                <label>Fornecedor</label>
                                <input type="text" id="nf_fornecedor" class="input-field" placeholder="Nome Fantasia / Razﾃ｣o Social">
                            </div>
                            <div class="input-group" style="grid-column: span 2;">
                                <label>CNPJ Fornecedor</label>
                                <input type="text" id="nf_cnpj" class="input-field" placeholder="00.000.000/0000-00">
                            </div>
                            <div class="input-group" style="grid-column: span 2;">
                                <label>Valor da NF (Fiscais)</label>
                                <input type="number" id="nf_valor" class="input-field" step="0.01" placeholder="0,00" oninput="updateNfValoresCalculo()">
                            </div>
                        </div>
                    </div>

                    <!-- BLOCO 2: VALORES DA COMPRA -->
                    <div class="form-section-block">
                        <div class="form-section-title">BLOCO 2 - VALORES DA COMPRA</div>
                        <div class="form-grid-inner" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                            <div class="input-group full-width" style="grid-column: span 2;">
                                <label style="color: var(--primary);">Valor Total da Compra (Real)</label>
                                <input type="number" id="compra_valor_total" class="input-field" step="0.01" placeholder="0,00" style="border-color: rgba(239, 43, 45, 0.3); font-weight: 800; font-size: 1.1rem;" oninput="updateNfValoresCalculo()">
                            </div>
                            <div class="input-group">
                                <label>Valor com NF</label>
                                <input type="number" id="compra_valor_nf_v2" class="input-field" step="0.01" placeholder="0,00" readonly disabled style="background: rgba(255,255,255,0.03); opacity: 0.7;">
                            </div>
                            <div class="input-group">
                                <label>Especial / Sem NF</label>
                                <input type="number" id="compra_valor_especial" class="input-field" step="0.01" placeholder="0,00" style="color: #fbbf24; font-weight: 700;">
                            </div>
                        </div>
                    </div>

                    <!-- BLOCO 3: PAGAMENTO -->
                    <div class="form-section-block">
                        <div class="form-section-title">BLOCO 3 - PAGAMENTO</div>
                        <div class="form-grid-inner" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                            <div class="input-group full-width" style="grid-column: span 2;">
                                <label>Forma de Pagamento</label>
                                <select id="compra_pagamento_forma" class="input-field">
                                    <option value="boleto">Boleto Bancﾃ｡rio</option>
                                    <option value="pix">PIX</option>
                                    <option value="dinheiro">Dinheiro (Espﾃｩcie)</option>
                                    <option value="cartao">Cartﾃ｣o de Crﾃｩdito/Dﾃｩbito</option>
                                    <option value="transferencia">Transferﾃｪncia Bancﾃ｡ria</option>
                                    <option value="outro">Outro</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <label>Condiﾃｧﾃ｣o</label>
                                <select id="compra_pagamento_condicao" class="input-field" onchange="toggleParcelasNf(this.value)">
                                    <option value="a_vista">ﾃ Vista</option>
                                    <option value="parcelado">Parcelado</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <label>Qtd Parcelas</label>
                                <input type="number" id="compra_pagamento_parcelas" class="input-field" value="1" min="1" disabled style="opacity: 0.5;">
                            </div>
                            <div class="input-group full-width" style="grid-column: span 2;">
                                <label>1ﾂｺ Vencimento</label>
                                <input type="date" id="compra_pagamento_vencimento" class="input-field" value="${new Date().toISOString().split('T')[0]}">
                            </div>
                            <div class="input-group full-width" style="grid-column: span 2;">
                                <label>Observaﾃｧﾃｵes Financeiras</label>
                                <textarea id="compra_observacoes" class="input-field" style="min-height: 80px;" placeholder="Ex: Pago parte em dinheiro no ato..."></textarea>
                            </div>
                        </div>
                    </div>

                    <div style="grid-column: 1 / -1; margin-top: 20px;">
                        <button class="btn-action" onclick="saveNFManual()" style="width: 100%; justify-content: center; padding: 20px; font-size: 1.1rem; background: #22c55e !important; border-radius: 16px; font-weight: 800;">
                            <span class="material-symbols-rounded">check_circle</span>
                            CONFIRMAR E INICIAR ENTRADA
                        </button>
                    </div>
                </div>
            </main>
        </div>
    `;
}

// Lﾃｳgica de cﾃ｡lculo automﾃ｡tico para Valores da Compra
window.updateNfValoresCalculo = function() {
    const total = parseFloat(document.getElementById('compra_valor_total')?.value || 0);
    const nf = parseFloat(document.getElementById('nf_valor')?.value || 0);
    
    // Sincronizar Valor com NF do Bloco 2 com Valor da NF do Bloco 1
    const nfV2 = document.getElementById('compra_valor_nf_v2');
    if (nfV2) nfV2.value = nf.toFixed(2);

    const especial = document.getElementById('compra_valor_especial');
    if (especial && total > 0) {
        const diff = total - nf;
        especial.value = diff > 0 ? diff.toFixed(2) : '0.00';
    }
};

window.toggleParcelasNf = function(val) {
    const field = document.getElementById('compra_pagamento_parcelas');
    if (field) {
        const isParcelado = val === 'parcelado';
        field.disabled = !isParcelado;
        field.style.opacity = isParcelado ? '1' : '0.5';
        
        if (!isParcelado) {
            field.value = 1;
        } else {
            field.focus();
            if (field.value === '1') field.value = ''; // Limpa para facilitar digitaﾃｧﾃ｣o
        }
    }
};


async function saveNFManual() {
    const payload = {
        numero_nf: document.getElementById('nf_numero').value,
        serie: document.getElementById('nf_serie').value,
        data_emissao: document.getElementById('nf_data_emissao').value,
        data_recebimento: document.getElementById('nf_data_recebimento').value,
        cnpj_fornecedor: document.getElementById('nf_cnpj').value,
        fornecedor_nome: document.getElementById('nf_fornecedor').value,
        valor_total: parseFloat(document.getElementById('nf_valor').value || 0), // Mantido como valor da NF para compatibilidade
        
        // Novos campos financeiros (preparaﾃｧﾃ｣o futura)
        financeiro_info: {
            valor_real_compra: parseFloat(document.getElementById('compra_valor_total').value || 0),
            valor_especial: parseFloat(document.getElementById('compra_valor_especial').value || 0),
            pagamento_forma: document.getElementById('compra_pagamento_forma').value,
            pagamento_condicao: document.getElementById('compra_pagamento_condicao').value,
            pagamento_parcelas: parseInt(document.getElementById('compra_pagamento_parcelas').value || 1),
            pagamento_vencimento: document.getElementById('compra_pagamento_vencimento').value,
            observacoes_financeiras: document.getElementById('compra_observacoes').value
        }
    };

    if (!payload.numero_nf || !payload.fornecedor_nome) {
        showToast('Nﾂｺ NF e Fornecedor sﾃ｣o obrigatﾃｳrios', 'warning');
        return;
    }

    const btn = event.currentTarget;
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'SALVANDO...';

    const result = await DataClient.createEntradaNFManual(payload);

    if (result) {
        showToast('NF salva com rascunho', 'success');
        renderNFDetail(result.id);
    } else {
        showToast('Erro ao salvar NF', 'error');
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

async function renderNFAbertasList() {
    const currentUser = localStorage.getItem('currentUser');
    currentScreen = 'internal';
    
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in nf-list-screen entrada-nf-screen">
            ${getTopBarHTML(currentUser, 'renderNFSubMenu()')}
            
            <main class="container">
                <div id="nf-list-container" style="padding: 12px 20px 40px 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="color: white; font-family: 'Fjalla One', sans-serif; font-size: 1.4rem;">NOTAS EM ABERTO</h2>
                        <button class="btn-action" onclick="renderNFManualForm()" style="padding: 8px 16px; font-size: 0.8rem; background: var(--primary) !important;">
                            <span class="material-symbols-rounded">add</span> NOVA
                        </button>
                    </div>
                    <div id="nf-list-items">
                        <div style="text-align: center; padding: 40px; color: var(--muted);">Carregando notas...</div>
                    </div>
                </div>
            </main>
        </div>
    `;

    const notas = await DataClient.listEntradasNFAbertas();
    const container = document.getElementById('nf-list-items');

    if (notas.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; background: rgba(255,255,255,0.03); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted); margin-bottom: 16px;">description</span>
                <p style="color: var(--muted);">Nenhuma nota em aberto encontrada.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
            ${notas.map(nf => `
                <div class="nf-card" onclick="renderNFDetail('${nf.id}')" style="background: white; padding: 16px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: transform 0.2s;">
                    <div style="flex: 1;">
                        <div style="font-weight: 800; color: #101018; font-size: 1rem;">NF ${nf.numero_nf}</div>
                        <div style="font-size: 0.75rem; color: #666; text-transform: uppercase;">${nf.fornecedor_nome}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; color: var(--primary); font-size: 0.9rem;">R$ ${parseFloat(nf.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <div style="display: flex; align-items: center; gap: 4px; justify-content: flex-end; margin-top: 4px;">
                            <span class="status-dot" style="width: 6px; height: 6px; background: ${nf.status === 'rascunho' ? '#f59e0b' : '#3b82f6'}; border-radius: 50%;"></span>
                            <span style="font-size: 0.65rem; font-weight: 700; color: #999; text-transform: uppercase;">${nf.status}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function renderNFDetail(id) {
    const currentUser = localStorage.getItem('currentUser');
    const nf = await DataClient.getEntradaNFById(id);
    
    if (!nf) {
        showToast('Nota nﾃ｣o encontrada', 'error');
        renderNFAbertasList();
        return;
    }

    app.innerHTML = `
        <div class="dashboard-screen internal fade-in nf-detail-screen entrada-nf-screen">
            ${getTopBarHTML(currentUser, 'renderNFAbertasList()')}
            
            <main class="container">
                <div style="padding: 12px 20px 40px 20px;">
                    <div style="background: white; border-radius: 24px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px;">
                            <div>
                                <div style="font-size: 0.6rem; color: #999; text-transform: uppercase; font-weight: 700;">Nﾃｺmero / Sﾃｩrie</div>
                                <div style="font-size: 1.2rem; font-weight: 900; color: #101018;">${nf.numero_nf} / ${nf.serie || '1'}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.1); color: #f59e0b; padding: 4px 12px; border-radius: 99px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">
                                    ${nf.status}
                                </div>
                            </div>
                        </div>
                        <div class="form-grid" style="gap: 12px;">
                            <div class="input-group">
                                <label style="color: #999; font-size: 0.6rem;">FORNECEDOR</label>
                                <div style="font-weight: 700; color: #101018; font-size: 0.85rem;">${nf.fornecedor_nome}</div>
                            </div>
                            <div class="input-group">
                                <label style="color: #999; font-size: 0.6rem;">VALOR TOTAL (NF)</label>
                                <div style="font-weight: 800; color: var(--primary); font-size: 1rem;">R$ ${parseFloat(nf.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            </div>
                        </div>

                        <!-- SEﾃ�グ FINANCEIRA -->
                        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #eee;">
                            <div style="font-size: 0.75rem; font-weight: 800; color: #101018; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                                <span class="material-symbols-rounded" style="font-size: 16px; color: var(--primary);">payments</span>
                                DADOS FINANCEIROS
                            </div>
                            <div class="form-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
                                <div class="input-group">
                                    <label style="color: #999; font-size: 0.6rem;">VALOR REAL COMPRA</label>
                                    <div style="font-weight: 700; color: #101018;">R$ ${parseFloat(nf.valor_real_compra || nf.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                </div>
                                <div class="input-group">
                                    <label style="color: #999; font-size: 0.6rem;">VALOR ESPECIAL (SEM NF)</label>
                                    <div style="font-weight: 700; color: #f59e0b;">R$ ${parseFloat(nf.valor_especial || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                </div>
                                <div class="input-group">
                                    <label style="color: #999; font-size: 0.6rem;">FORMA / CONDIﾃ�グ</label>
                                    <div style="font-weight: 600; color: #444; font-size: 0.8rem; text-transform: uppercase;">
                                        ${nf.pagamento_forma || '-'} / ${nf.pagamento_condicao === 'a_vista' ? 'ﾃ VISTA' : (nf.pagamento_parcelas + 'x PARCELADO')}
                                    </div>
                                </div>
                                <div class="input-group">
                                    <label style="color: #999; font-size: 0.6rem;">1ﾂｺ VENCIMENTO</label>
                                    <div style="font-weight: 600; color: #444; font-size: 0.8rem;">
                                        ${nf.pagamento_vencimento ? new Date(nf.pagamento_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                                    </div>
                                </div>
                            </div>
                            ${nf.observacoes_financeiras ? `
                                <div style="margin-top: 12px; padding: 10px; background: #f8f9fa; border-radius: 8px; border-left: 3px solid #ddd;">
                                    <label style="color: #999; font-size: 0.6rem; display: block; margin-bottom: 4px;">OBSERVAﾃ�髭S FINANCEIRAS</label>
                                    <div style="font-size: 0.75rem; color: #666; line-height: 1.4;">${nf.observacoes_financeiras}</div>
                                </div>
                            ` : ''}
                        </div>

                        <!-- SEﾃ�グ DE ITENS (PREPARAﾃ�グ FASE 2) -->
                        <div style="margin-top: 30px; border-top: 2px solid #f0f0f0; padding-top: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                <h3 style="color: #101018; font-family: 'Fjalla One', sans-serif; font-size: 1.1rem;">ITENS DA NOTA</h3>
                                <button class="btn-action" onclick="showToast('Adiﾃｧﾃ｣o de itens em desenvolvimento (Fase 2)', 'info')" style="padding: 8px 16px; font-size: 0.75rem; background: #000 !important;">
                                    <span class="material-symbols-rounded">add_box</span> ADICIONAR ITEM
                                </button>
                            </div>

                            <div id="nf-items-container" style="text-align: center; padding: 30px; background: #f9f9f9; border-radius: 16px; border: 1px dashed #ddd;">
                                <span class="material-symbols-rounded" style="font-size: 32px; color: #ccc; margin-bottom: 10px;">inventory_2</span>
                                <p style="color: #999; font-size: 0.85rem; font-weight: 500;">NENHUM ITEM ADICIONADO</p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;
}
function renderNFPlaceholder(title) {
    const currentUser = localStorage.getItem('currentUser');
    app.innerHTML = `
        <div class="dashboard-screen internal fade-in nf-placeholder-screen entrada-nf-screen">
            ${getTopBarHTML(currentUser, 'renderNFSubMenu()')}
            
            <main class="container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh;">
                <div style="text-align: center; padding: 40px; background: rgba(255,255,255,0.03); border-radius: 32px; border: 1px dashed rgba(255,255,255,0.1); max-width: 400px; width: 90%;">
                    <h2 style="color: white; font-family: 'Fjalla One', sans-serif; margin-bottom: 16px; text-transform: uppercase;">${title}</h2>
                    <span class="material-symbols-rounded" style="font-size: 64px; color: var(--primary); margin-bottom: 20px;">construction</span>
                    <p style="color: var(--muted); font-size: 1.1rem; font-weight: 500;">Em desenvolvimento</p>
                    <p style="color: rgba(255,255,255,0.3); font-size: 0.8rem; margin-top: 10px;">Esta funcionalidade estarﾃ｡ disponﾃｭvel em breve.</p>
                </div>
            </main>
        </div>
    `;
}

/* ===================================================
   MODERN INTERACTION LOGIC (BEHANCE STYLE)
   =================================================== */
(function() {
    function updateCardTransform(e) {
        const card = e.target.closest('.menu-card, .channel-card');
        if (!card) return;
        
        const rect = card.getBoundingClientRect();
        
        // Posiﾃｧﾃ｣o relativa do mouse/toque
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        // Injetar variﾃ｡veis CSS para o Spotlight
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
        
        // Cﾃ｡lculo para o Tilt 3D (Desktop apenas para evitar enjoo no mobile)
        if (window.innerWidth > 768) {
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -6; // Max 6 graus
            const rotateY = ((x - centerX) / centerX) * 6;  // Max 6 graus
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        } else {
            // No mobile apenas um leve feedback de escala ao tocar
            card.style.transform = `scale3d(0.97, 0.97, 0.97)`;
        }
    }

    function resetCardTransform(e) {
        const card = e.target.closest('.menu-card, .channel-card');
        if (!card) return;
        
        // Se for um mouseout, verificar se realmente saiu do card (nﾃ｣o para um filho)
        if (e.type === 'mouseout' || e.type === 'mouseleave') {
            if (e.relatedTarget && card.contains(e.relatedTarget)) return;
        }

        card.style.transform = '';
    }

    // Delegaﾃｧﾃ｣o de eventos para suportar cards criados dinamicamente
    document.addEventListener('mousemove', updateCardTransform, { passive: true });
    document.addEventListener('mouseout', resetCardTransform, { passive: true });

    // Mobile events
    document.addEventListener('touchstart', updateCardTransform, { passive: true });
    document.addEventListener('touchend', resetCardTransform, { passive: true });
    document.addEventListener('touchcancel', resetCardTransform, { passive: true });
})();

