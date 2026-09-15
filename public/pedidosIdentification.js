(function () {
    window.__pedidosIdentificationLoaded = true;

    // Amostra de Pedidos Reais para Preview Visual no Frontend (30 pedidos: 24 ML / 6 Shopee)
    window.PEDIDOS_PREVIEW_AMOSTRA = [
        {
            id: '2000003928172938',
            platform: 'MERCADOLIBRE',
            account_name: 'DY AUTO PARTS',
            source_account_id: '238451947',
            sale_date: '15/09/2026 09:14',
            status_origem: 'paid',
            total_value: 189.90,
            buyer_name: 'RODRIGO ALVES FERREIRA',
            shipping_type: 'Flex',
            itens: [
                {
                    item_id: 'MLB3829103819',
                    variation_id: null,
                    titulo: 'Jogo De Tapetes Automotivos PVC Preto Universal 4 Pecas',
                    seller_sku: 'TAP-PVC-PRT-04',
                    quantidade_comprada: 1,
                    unit_price: 189.90,
                    thumbnail_url: 'https://http2.mlstatic.com/D_682012-MLB489201928_012022-I.jpg'
                }
            ]
        },
        {
            id: '2000003928172939',
            platform: 'MERCADOLIBRE',
            account_name: 'DY AUTO PARTS',
            source_account_id: '238451947',
            sale_date: '15/09/2026 09:30',
            status_origem: 'paid',
            total_value: 349.00,
            buyer_name: 'MARCOS VINICIUS SILVA',
            shipping_type: 'Agência ML',
            itens: [
                {
                    item_id: 'MLB3918274610',
                    variation_id: '174829103',
                    titulo: 'Kit Lâmpadas Super LED H7 Headlight 6000K 12V 40W',
                    seller_sku: 'LED-H7-6000K-PAR',
                    quantidade_comprada: 2,
                    unit_price: 174.50,
                    thumbnail_url: ''
                }
            ]
        },
        {
            id: '2000003928172940',
            platform: 'MERCADOLIBRE',
            account_name: 'AUTO PARTS OFICIAL',
            source_account_id: '284803847',
            sale_date: '15/09/2026 09:45',
            status_origem: 'confirmed',
            total_value: 125.00,
            buyer_name: 'CARLOS EDUARDO GOMES',
            shipping_type: 'Coleta ML',
            itens: [
                {
                    item_id: 'MLB3192847192',
                    variation_id: null,
                    titulo: 'Capa Para Volante Automotiva Em Couro Sintético Costurada',
                    seller_sku: 'CP-VOL-COU-PRT',
                    quantidade_comprada: 1,
                    unit_price: 125.00,
                    thumbnail_url: ''
                }
            ]
        },
        {
            id: '2000003928172941',
            platform: 'MERCADOLIBRE',
            account_name: 'AUTO PARTS OFICIAL',
            source_account_id: '284803847',
            sale_date: '15/09/2026 10:02',
            status_origem: 'paid',
            total_value: 412.80,
            buyer_name: 'FERNANDA LIMA SANTOS',
            shipping_type: 'Flex',
            itens: [
                {
                    item_id: 'MLB3829103819',
                    variation_id: null,
                    titulo: 'Jogo De Tapetes Automotivos PVC Preto Universal 4 Pecas',
                    seller_sku: 'TAP-PVC-PRT-04',
                    quantidade_comprada: 2,
                    unit_price: 189.90,
                    thumbnail_url: 'https://http2.mlstatic.com/D_682012-MLB489201928_012022-I.jpg'
                },
                {
                    item_id: 'MLB3918274610',
                    variation_id: null,
                    titulo: 'Aromatizante Carro Novo Spray 60ml',
                    seller_sku: 'ARO-CN-60ML',
                    quantidade_comprada: 1,
                    unit_price: 33.00,
                    thumbnail_url: ''
                }
            ]
        },
        {
            id: '2000003928172942',
            platform: 'SHOPEE',
            account_name: 'DY LOJA SHOPEE',
            source_account_id: 'SHP_ACCOUNT_01',
            sale_date: '15/09/2026 10:15',
            status_origem: 'paid',
            total_value: 89.90,
            buyer_name: 'PATRICIA MENDES',
            shipping_type: 'Shopee Express',
            itens: [
                {
                    item_id: 'SHP-918273918',
                    variation_id: null,
                    titulo: 'Suporte Veicular Magnético Para Celular Ar Condicionado',
                    seller_sku: 'SUP-CEL-MAG',
                    quantidade_comprada: 1,
                    unit_price: 89.90,
                    thumbnail_url: ''
                }
            ]
        },
        {
            id: '2000003928172943',
            platform: 'MERCADOLIBRE',
            account_name: 'DY AUTO PARTS',
            source_account_id: '238451947',
            sale_date: '15/09/2026 10:20',
            status_origem: 'cancelled',
            total_value: 299.00,
            buyer_name: 'LUCAS TAVEIRA',
            shipping_type: 'Correios',
            itens: [
                {
                    item_id: 'MLB3829103819',
                    variation_id: null,
                    titulo: 'Jogo De Tapetes Automotivos PVC Preto Universal 4 Pecas',
                    seller_sku: 'TAP-PVC-PRT-04',
                    quantidade_comprada: 1,
                    unit_price: 189.90,
                    thumbnail_url: 'https://http2.mlstatic.com/D_682012-MLB489201928_012022-I.jpg'
                }
            ]
        },
        {
            id: '2000003928172944',
            platform: 'MERCADOLIBRE',
            account_name: 'DY AUTO PARTS',
            source_account_id: '238451947',
            sale_date: '15/09/2026 10:25',
            status_origem: 'paid',
            total_value: 159.00,
            buyer_name: 'GUSTAVO BARBOSA',
            shipping_type: 'Flex',
            itens: [
                {
                    item_id: 'MLB3918274611',
                    variation_id: null,
                    titulo: 'Kit Pano Microfibra 40x40cm 350GSM 5 Unidades',
                    seller_sku: 'KIT-MIC-5UN',
                    quantidade_comprada: 3,
                    unit_price: 53.00,
                    thumbnail_url: ''
                }
            ]
        },
        {
            id: '2000003928172945',
            platform: 'SHOPEE',
            account_name: 'DY LOJA SHOPEE',
            source_account_id: 'SHP_ACCOUNT_01',
            sale_date: '15/09/2026 10:30',
            status_origem: 'paid',
            total_value: 210.00,
            buyer_name: 'VANESSA RIBEIRO',
            shipping_type: 'Shopee Express',
            itens: [
                {
                    item_id: 'SHP-918273919',
                    variation_id: null,
                    titulo: 'Shampoo Automotivo Desengraxante Concentrado 5L',
                    seller_sku: 'SHAMP-DES-5L',
                    quantidade_comprada: 1,
                    unit_price: 210.00,
                    thumbnail_url: ''
                }
            ]
        },
        {
            id: '2000003928172946',
            platform: 'MERCADOLIBRE',
            account_name: 'AUTO PARTS OFICIAL',
            source_account_id: '284803847',
            sale_date: '15/09/2026 10:40',
            status_origem: 'paid',
            total_value: 520.00,
            buyer_name: 'THIAGO MARTINS',
            shipping_type: 'Coleta ML',
            itens: [
                {
                    item_id: 'MLB3918274612',
                    variation_id: '184920194',
                    titulo: 'Par de Faróis Milha LED Auxiliar 12V 30W Universal',
                    seller_sku: 'FAROL-MIL-LED-PAR',
                    quantidade_comprada: 1,
                    unit_price: 520.00,
                    thumbnail_url: ''
                }
            ]
        },
        {
            id: '2000003928172947',
            platform: 'MERCADOLIBRE',
            account_name: 'DY AUTO PARTS',
            source_account_id: '238451947',
            sale_date: '15/09/2026 10:50',
            status_origem: 'paid',
            total_value: 145.00,
            buyer_name: 'ADRIANO LOPES',
            shipping_type: 'Agência ML',
            itens: [
                {
                    item_id: 'MLB3918274613',
                    variation_id: null,
                    titulo: 'Pretinho Para Pneus Efeito Gel Alto Brilho 1 Litro',
                    seller_sku: 'PRET-GEL-1L',
                    quantidade_comprada: 2,
                    unit_price: 72.50,
                    thumbnail_url: ''
                }
            ]
        }
    ];

    // Adiciona itens repetidos dinamicamente para completar amostragem de 30 pedidos (24 ML / 6 Shopee)
    for (let i = 11; i <= 30; i++) {
        const base = window.PEDIDOS_PREVIEW_AMOSTRA[(i - 1) % 10];
        window.PEDIDOS_PREVIEW_AMOSTRA.push({
            ...base,
            id: `20000039281729${47 + i}`,
            sale_date: `15/09/2026 10:${String(50 + (i % 10)).padStart(2, '0')}`,
            buyer_name: `CLIENTE PREVIEW MOSTRAGEM ${i}`
        });
    }

    // Estado local de filtros para a tela de Pedidos
    window.PedidosPreviewState = window.PedidosPreviewState || {
        operacional: 'todos', // 'todos' | 'pendentes' | 'prontos'
        marketplace: 'todos', // 'todos' | 'mercadolibre' | 'shopee'
        conta: 'todas',
        busca: ''
    };

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    window.setPedidosFiltroOperacional = function (op) {
        window.PedidosPreviewState.operacional = op;
        renderPedidosScreen();
    };

    window.setPedidosFiltroMarketplace = function (mp) {
        window.PedidosPreviewState.marketplace = mp;
        renderPedidosScreen();
    };

    window.setPedidosFiltroConta = function (conta) {
        window.PedidosPreviewState.conta = conta;
        renderPedidosScreen();
    };

    window.setPedidosBusca = function (texto) {
        window.PedidosPreviewState.busca = texto || '';
        renderPedidosScreen();
    };

    // Hidratação segura em memória (SEM requisições de rede para evitar toast indevido de conexão)
    async function hidratarPedidosPreviewMappings(todosPreview) {
        if (!Array.isArray(todosPreview)) return;

        for (const ped of todosPreview) {
            ped.status_identificacao_preview = 'pendente_identificacao';
            ped.accountIdLocal = null;

            for (const item of (ped.itens || [])) {
                item.mapping_status = 'PENDENTE';
                item.mapping_id = null;
                item.mapping_version = null;
                item.mapping_componentes = [];
            }
        }
    }

    window.openModalIdentificarPreview = async function (pedidoId, itemIdx = 0) {
        const todosPreview = window.PEDIDOS_PREVIEW_AMOSTRA || [];
        const ped = todosPreview.find(p => p.id === pedidoId);
        if (!ped) {
            if (typeof showToast === 'function') showToast('Pedido não encontrado na prévia.', 'error');
            return;
        }

        if (ped.platform !== 'MERCADOLIBRE') {
            if (typeof showToast === 'function') {
                showToast('A identificação de itens Shopee não está habilitada nesta fase.', 'warning');
            }
            return;
        }

        if (typeof showToast === 'function') {
            showToast('Modo de visualização: a identificação deste pedido ainda não está habilitada neste ambiente.', 'info');
        } else {
            alert('Modo de visualização: a identificação deste pedido ainda não está habilitada neste ambiente.');
        }
    };

    window.piSeparateBlocked = function () {
        if (typeof showToast === 'function') {
            showToast('Modo de visualização: Envio para separação desabilitado nesta etapa.', 'warning');
        }
    };

    window.renderPedidosScreen = async function (filtroAba = 'todos', filtroConta = 'todas') {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser && typeof renderLogin === 'function') return renderLogin();

        if (typeof currentScreen !== 'undefined') currentScreen = 'pedidos';

        const todosPreview = window.PEDIDOS_PREVIEW_AMOSTRA || [];
        const state = window.PedidosPreviewState;

        await hidratarPedidosPreviewMappings(todosPreview);

        if (filtroConta && filtroConta !== 'todas') state.conta = filtroConta;

        // Contadores Operacionais Principais
        const countTodos = todosPreview.length;
        const countProntos = todosPreview.filter(p => p.status_identificacao_preview === 'pronto_separacao').length;
        const countPendentes = countTodos - countProntos;

        // Contadores por Marketplace
        const countML = todosPreview.filter(p => p.platform === 'MERCADOLIBRE').length;
        const countShopee = todosPreview.filter(p => p.platform === 'SHOPEE').length;

        // Lista de Contas da Amostra
        const contasDisponiveis = Array.from(new Set(todosPreview.map(p => p.account_name))).filter(Boolean).sort();

        // Filtro Operacional
        let listaExibicao = todosPreview;
        if (state.operacional === 'prontos') {
            listaExibicao = todosPreview.filter(p => p.status_identificacao_preview === 'pronto_separacao');
        } else if (state.operacional === 'pendentes') {
            listaExibicao = todosPreview.filter(p => p.status_identificacao_preview !== 'pronto_separacao');
        }

        // Filtro Marketplace
        if (state.marketplace === 'mercadolibre') {
            listaExibicao = listaExibicao.filter(p => p.platform === 'MERCADOLIBRE');
        } else if (state.marketplace === 'shopee') {
            listaExibicao = listaExibicao.filter(p => p.platform === 'SHOPEE');
        }

        // Filtro Conta
        if (state.conta && state.conta !== 'todas') {
            listaExibicao = listaExibicao.filter(p => p.account_name === state.conta);
        }

        // Busca Textual
        const termoBusca = String(state.busca || '').trim().toLowerCase();
        if (termoBusca) {
            listaExibicao = listaExibicao.filter(p => {
                const idMatch = String(p.id || '').toLowerCase().includes(termoBusca);
                const buyerMatch = String(p.buyer_name || '').toLowerCase().includes(termoBusca);
                const accountMatch = String(p.account_name || '').toLowerCase().includes(termoBusca);
                const itemsMatch = (p.itens || []).some(it =>
                    String(it.titulo || '').toLowerCase().includes(termoBusca) ||
                    String(it.seller_sku || '').toLowerCase().includes(termoBusca) ||
                    String(it.item_id || '').toLowerCase().includes(termoBusca)
                );
                return idMatch || buyerMatch || accountMatch || itemsMatch;
            });
        }

        const appEl = document.getElementById('app');
        if (!appEl) return;

        // Topbar HTML
        const topbarHTML = typeof getTopBarHTML === 'function' ? getTopBarHTML(currentUser, 'renderMenu()') : `
            <header class="pi-module-topbar">
                <button onclick="renderMenu()" aria-label="Voltar"><span class="material-symbols-rounded">arrow_back</span></button>
                <span class="material-symbols-rounded pi-module-icon">receipt_long</span>
                <h1>PEDIDOS DE VENDAS</h1>
            </header>
        `;

        const sidebarHTML = typeof getModuleSidebarHTML === 'function' ? getModuleSidebarHTML('pedidos') : '';

        appEl.innerHTML = `
            <div class="dashboard-screen fade-in internal module-screen pi-screen">
                ${topbarHTML}
                ${sidebarHTML}
                <main class="container pi-shell ped-shell" style="box-sizing:border-box!important;width:min(1520px,calc(100% - 48px))!important;max-width:1520px!important;margin:0 auto!important;padding:30px 0 64px!important;">

                    <!-- SUMMARY CARDS OPERACIONAIS -->
                    <section class="pi-summary pi-summary-simplified" style="margin-bottom:20px;">
                        <button type="button" class="${state.operacional === 'todos' ? 'active' : ''}" onclick="setPedidosFiltroOperacional('todos')">
                            <span class="material-symbols-rounded">list_alt</span>
                            <strong>${countTodos}</strong>
                            <small>Todos os pedidos</small>
                        </button>
                        <button type="button" class="${state.operacional === 'pendentes' ? 'active' : ''}" onclick="setPedidosFiltroOperacional('pendentes')">
                            <span class="material-symbols-rounded">pending_actions</span>
                            <strong>${countPendentes}</strong>
                            <small>Pendente de identificação</small>
                        </button>
                        <button type="button" class="${state.operacional === 'prontos' ? 'active' : ''}" onclick="setPedidosFiltroOperacional('prontos')">
                            <span class="material-symbols-rounded">inventory_2</span>
                            <strong>${countProntos}</strong>
                            <small>Pronto para separação</small>
                        </button>
                    </section>

                    <!-- PAINEL PRINCIPAL DE PEDIDOS -->
                    <section class="pi-panel pi-orders-panel">
                        <header style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;border-bottom:1px solid #eaecf0;flex-wrap:wrap;">
                            <div>
                                <h2 style="margin:0;font-size:18px;color:#172033;">Pedidos Recebidos <small style="display:inline-block;font-size:12px;color:#667085;margin-left:8px;">(Modo de Visualização Preview)</small></h2>
                                <small style="color:#667085;">Exibindo ${listaExibicao.length} de ${countTodos} pedido(s)</small>
                            </div>

                            <!-- BUSCA -->
                            <label class="pi-search" style="display:flex;align-items:center;gap:8px;min-width:320px;padding:0 12px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;">
                                <span class="material-symbols-rounded" style="color:#98a2b3;">search</span>
                                <input type="text" value="${escapeHtml(state.busca)}" oninput="setPedidosBusca(this.value)" placeholder="Buscar pedido, comprador, SKU ou produto..." style="width:100%;padding:10px 0;border:0;outline:0;background:transparent;font:inherit;">
                            </label>
                        </header>

                        <!-- BARRA DE FILTROS SECUNDÁRIOS (MARKETPLACE E CONTA) -->
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 20px;background:#f8fafc;border-bottom:1px solid #eaecf0;flex-wrap:wrap;">
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <span style="font-size:12px;font-weight:700;color:#475569;margin-right:4px;">Marketplace:</span>
                                <button type="button" class="pi-status ${state.marketplace === 'todos' ? 'pronto' : 'novo'}" onclick="setPedidosFiltroMarketplace('todos')" style="cursor:pointer;border:0;">
                                    Todos (${countTodos})
                                </button>
                                <button type="button" class="pi-status ${state.marketplace === 'mercadolibre' ? 'pronto' : 'novo'}" onclick="setPedidosFiltroMarketplace('mercadolibre')" style="cursor:pointer;border:0;">
                                    Mercado Livre (${countML})
                                </button>
                                <button type="button" class="pi-status ${state.marketplace === 'shopee' ? 'pronto' : 'novo'}" onclick="setPedidosFiltroMarketplace('shopee')" style="cursor:pointer;border:0;">
                                    Shopee (${countShopee})
                                </button>
                            </div>

                            <div style="display:flex;align-items:center;gap:8px;">
                                <span style="font-size:12px;font-weight:700;color:#475569;">Conta:</span>
                                <select onchange="setPedidosFiltroConta(this.value)" style="padding:6px 10px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;font-size:12px;color:#344054;outline:0;cursor:pointer;">
                                    <option value="todas" ${state.conta === 'todas' ? 'selected' : ''}>Todas as Contas</option>
                                    ${contasDisponiveis.map(c => `<option value="${escapeHtml(c)}" ${state.conta === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <!-- LISTA DE CARDS DE PEDIDOS REDESENHADOS -->
                        <div id="pi-list" class="pi-order-list" style="padding:16px;display:grid;gap:16px;">
                            ${listaExibicao.length ? listaExibicao.map(ped => {
            const isML = ped.platform === 'MERCADOLIBRE';
            const statusOrigemVisual = ped.status_origem === 'paid' ? 'PAGO' : (ped.status_origem === 'confirmed' ? 'CONFIRMADO' : 'CANCELADO');
            const statusOperacionalVisual = ped.status_identificacao_preview === 'pronto_separacao' ? 'PRONTO PARA SEPARAÇÃO' : 'PENDENTE DE IDENTIFICAÇÃO';

            const totalItens = (ped.itens || []).length;
            const totalUnidades = (ped.itens || []).reduce((acc, it) => acc + (it.quantidade_comprada || 1), 0);

            return `
                                    <article class="pedidos-card-redesigned" style="border:1px solid #e2e8f0;border-radius:14px;background:#fff;box-shadow:0 4px 16px rgba(15,23,42,0.04);overflow:hidden;">

                                        <!-- FAIXA SUPERIOR / CABEÇALHO DO PEDIDO -->
                                        <header style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;">
                                            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                                <strong style="font-size:15px;color:#0f172a;letter-spacing:-0.01em;">#${escapeHtml(ped.id)}</strong>

                                                <!-- BADGE MARKETPLACE -->
                                                <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:800;background:${isML ? '#fffbe6' : '#fff7ed'};color:${isML ? '#0284c7' : '#ea580c'};border:1px solid ${isML ? '#ffe58f' : '#ffedd5'};">
                                                    <span class="material-symbols-rounded" style="font-size:14px;">${isML ? 'storefront' : 'shopping_bag'}</span>
                                                    ${isML ? 'Mercado Livre' : 'Shopee'}
                                                </span>

                                                <!-- STATUS ORIGEM -->
                                                <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:6px;font-size:11px;font-weight:800;background:${ped.status_origem === 'cancelled' ? '#fef2f2' : '#f0fdf4'};color:${ped.status_origem === 'cancelled' ? '#dc2626' : '#16a34a'};border:1px solid ${ped.status_origem === 'cancelled' ? '#fecca3' : '#bbf7d0'};">
                                                    <span class="material-symbols-rounded" style="font-size:14px;">${ped.status_origem === 'cancelled' ? 'cancel' : 'check_circle'}</span>
                                                    ${statusOrigemVisual}
                                                </span>

                                                <!-- STATUS OPERACIONAL INTERNO -->
                                                <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:800;background:${ped.status_identificacao_preview === 'pronto_separacao' ? '#f0fdf4' : '#fff7ed'};color:${ped.status_identificacao_preview === 'pronto_separacao' ? '#15803d' : '#c2410c'};border:1px solid ${ped.status_identificacao_preview === 'pronto_separacao' ? '#bbf7d0' : '#fed7aa'};">
                                                    <span class="material-symbols-rounded" style="font-size:15px;">${ped.status_identificacao_preview === 'pronto_separacao' ? 'inventory_2' : 'pending_actions'}</span>
                                                    ${statusOperacionalVisual}
                                                </span>
                                            </div>

                                            <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                                                <!-- LOGÍSTICA -->
                                                <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:6px;font-size:11px;font-weight:700;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;">
                                                    <span class="material-symbols-rounded" style="font-size:14px;">local_shipping</span>
                                                    ${escapeHtml(ped.shipping_type)}
                                                </span>

                                                <!-- VALOR TOTAL -->
                                                <span style="font-size:16px;font-weight:900;color:#0f172a;white-space:nowrap;">
                                                    R$ ${Number(ped.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </header>

                                        <!-- METADADOS DO PEDIDO -->
                                        <div style="display:flex;align-items:center;gap:12px 18px;padding:10px 18px;background:#ffffff;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;flex-wrap:wrap;">
                                            <span>Comprador: <b style="color:#1e293b;font-weight:700;">${escapeHtml(ped.buyer_name)}</b></span>
                                            <span style="color:#cbd5e1;">•</span>
                                            <span>Conta: <b style="color:#1e293b;font-weight:700;">${escapeHtml(ped.account_name)}</b></span>
                                            <span style="color:#cbd5e1;">•</span>
                                            <span>Data: <b style="color:#1e293b;font-weight:700;">${escapeHtml(ped.sale_date)}</b></span>
                                            <span style="color:#cbd5e1;">•</span>
                                            <span style="color:#475569;font-weight:700;background:#f1f5f9;padding:2px 8px;border-radius:6px;">${totalItens} ${totalItens === 1 ? 'item' : 'itens'} · ${totalUnidades} ${totalUnidades === 1 ? 'unidade' : 'unidades'}</span>
                                        </div>

                                        <!-- PRODUTOS DO PEDIDO (O FOCO PRINCIPAL) -->
                                        <div class="pedidos-card-products-body" style="padding:14px 18px;display:grid;gap:12px;">
                                            ${(ped.itens || []).map((item, idx) => `
                                                <div style="display:grid;grid-template-columns:58px 1fr auto;gap:16px;align-items:center;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#fafbfc;">

                                                    <!-- FOTO / ICONE -->
                                                    <div style="width:58px;height:58px;border-radius:8px;overflow:hidden;background:#f1f5f9;border:1px solid #e2e8f0;display:grid;place-items:center;flex-shrink:0;">
                                                        ${item.thumbnail_url ? `<img src="${escapeHtml(item.thumbnail_url)}" alt="Produto" style="width:100%;height:100%;object-fit:cover;">` : `<span class="material-symbols-rounded" style="color:#94a3b8;font-size:26px;">image</span>`}
                                                    </div>

                                                    <!-- DADOS DO PRODUTO (NOME, SKU, QUANTIDADE) -->
                                                    <div style="display:grid;gap:5px;min-width:0;">
                                                        <strong style="color:#0f172a;font-size:14px;line-height:1.35;word-break:break-word;font-weight:800;">${escapeHtml(item.titulo)}</strong>
                                                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;color:#64748b;">
                                                            <span style="background:#f1f5f9;padding:3px 8px;border-radius:6px;color:#334155;">SKU: <b style="font-weight:800;color:#0f172a;">${escapeHtml(item.seller_sku || '-')}</b></span>
                                                            <span style="background:#f1f5f9;padding:3px 8px;border-radius:6px;color:#334155;">Qtd: <b style="font-weight:900;color:#0f172a;">${item.quantidade_comprada} un.</b></span>

                                                            <!-- STATUS DO ITEM -->
                                                            <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:800;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;">
                                                                <span class="material-symbols-rounded" style="font-size:15px;">link_off</span>
                                                                Não identificado
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <!-- AÇÃO DO ITEM (BOTÃO DE MAPEAR) -->
                                                    <div style="display:flex;align-items:center;justify-content:flex-end;">
                                                        <button type="button" class="pi-primary pi-action-pending" onclick="openModalIdentificarPreview('${ped.id}', ${idx})" style="white-space:nowrap;padding:9px 16px;font-size:12px;font-weight:800;border-radius:8px;box-shadow:0 2px 8px rgba(245,158,11,0.25);">
                                                            <span class="material-symbols-rounded" style="font-size:16px;">edit_square</span> Identificar / Mapear
                                                        </button>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>

                                        <!-- RODAPÉ DO CARD DO PEDIDO -->
                                        <footer style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;flex-wrap:wrap;">
                                            <span style="font-size:12px;color:#64748b;display:flex;align-items:center;gap:6px;">
                                                <span class="material-symbols-rounded" style="font-size:16px;color:#d97706;">info</span>
                                                Identifique todos os produtos para liberar este pedido para separação.
                                            </span>

                                            <button type="button" class="pi-primary" onclick="piSeparateBlocked()" style="white-space:nowrap;padding:9px 18px;font-size:12px;font-weight:800;border-radius:8px;opacity:0.5;cursor:not-allowed;background:#94a3b8;border-color:#94a3b8;" title="Envio para separação desabilitado nesta etapa">
                                                <span class="material-symbols-rounded" style="font-size:16px;">inventory</span> Seguir p/ Separação
                                            </button>
                                        </footer>

                                    </article>
                                `;
        }).join('') : `
                                <div class="pi-empty" style="padding:48px;text-align:center;color:#667085;">
                                    <span class="material-symbols-rounded" style="font-size:36px;color:#98a2b3;">search_off</span>
                                    <strong style="font-size:16px;color:#344054;display:block;margin-top:6px;">Nenhum pedido encontrado</strong>
                                    <p style="margin:4px 0 0;">Ajuste o termo de busca ou selecione outro filtro.</p>
                                </div>
                            `}
                        </div>
                    </section>
                </main>
            </div>
        `;
    };

    // Sobrescreve o placeholder legado para garantir transição fluida
    window.renderPedidosPlaceholder = function (push = true) {
        window.renderPedidosScreen('todos');
    };
})();
