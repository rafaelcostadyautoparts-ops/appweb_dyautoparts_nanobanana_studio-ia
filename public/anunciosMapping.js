(function () {
    window.__anunciosMappingLoaded = true;

    // Catálogo mockado de produtos internos para pesquisa e mapeamento
    const CATALOGO_PRODUTOS = [
        { id_interno: 'DY-001.842', nome: 'Encosto de cabeca preto universal', marca: 'DY Parts', ean: '7891000018421', sku_fornecedor: 'ENC-842', preco: 45.00 },
        { id_interno: 'DY-001.771', nome: 'Jogo de tapetes PVC preto universal', marca: 'DY Parts', ean: '7891000017712', sku_fornecedor: 'TAP-771', preco: 89.90 },
        { id_interno: 'DY-001.204', nome: 'Capa para volante costurada preta com linha vermelha', marca: 'SportGrip', ean: '7891000012043', sku_fornecedor: 'CAP-204-VM', preco: 35.00 },
        { id_interno: 'DY-001.205', nome: 'Capa para volante costurada preta com linha preta', marca: 'SportGrip', ean: '7891000012050', sku_fornecedor: 'CAP-205-PT', preco: 35.00 },
        { id_interno: 'DY-001.206', nome: 'Capa para volante costurada grafite com linha cinza', marca: 'SportGrip', ean: '7891000012067', sku_fornecedor: 'CAP-206-GF', preco: 35.00 },
        { id_interno: 'DY-002.101', nome: 'Lampada H7 12V 55W Super Branca', marca: 'Osram', ean: '7891234567890', sku_fornecedor: 'OSR-H7-SB', preco: 28.50, codigo_equivalente: 'EQ-LAMP-H7-55W' },
        { id_interno: 'DY-002.102', nome: 'Lampada H7 12V 55W Super Branca', marca: 'Philips', ean: '7891234567891', sku_fornecedor: 'PHI-H7-SB', preco: 29.90, codigo_equivalente: 'EQ-LAMP-H7-55W' },
        { id_interno: 'DY-002.103', nome: 'Lampada H7 12V 55W Super Branca', marca: 'TechOne', ean: '7891234567892', sku_fornecedor: 'TCH-H7-SB', preco: 22.00, codigo_equivalente: 'EQ-LAMP-H7-55W' },
        { id_interno: 'DY-002.104', nome: 'Lampada H7 12V 55W Super Branca', marca: 'Gauss', ean: '7891234567893', sku_fornecedor: 'GAU-H7-SB', preco: 24.00, codigo_equivalente: 'EQ-LAMP-H7-55W' },
        { id_interno: 'DY-001.451', nome: 'Pano de microfibra premium 40 x 40 cm', marca: 'Detailer', ean: '7891000014515', sku_fornecedor: 'MIC-451', preco: 12.00 },
        { id_interno: 'DY-001.520', nome: 'Aplicador de espuma anatomico automotivo', marca: 'Detailer', ean: '7891000015208', sku_fornecedor: 'APL-520', preco: 6.50 },
        { id_interno: 'DY-001.648', nome: 'Shampoo automotivo neutro com cera 500ml', marca: 'AutoShine', ean: '7891000016489', sku_fornecedor: 'SHP-648', preco: 18.00 },
        { id_interno: 'DY-001.702', nome: 'Pretinho revitalizador para pneus 500ml', marca: 'AutoShine', ean: '7891000017028', sku_fornecedor: 'PRT-702', preco: 19.50 },
        { id_interno: 'DY-003.501', nome: 'Sensor de estacionamento universal 4 pontos preto com display', marca: 'TechOne', ean: '7891000035015', sku_fornecedor: 'SENS-501', preco: 65.00 },
        { id_interno: 'DY-003.502', nome: 'Sensor de estacionamento universal 4 pontos preto com display', marca: 'Positron', ean: '7891000035022', sku_fornecedor: 'SENS-502', preco: 85.00 }
    ];

    // Helper para buscar produto por id_interno
    const findProduto = id => CATALOGO_PRODUTOS.find(p => p.id_interno === id);

    // Estado do Módulo de Anúncios
    const AnunciosState = {
        filter: 'todos', // 'todos' | 'nao_mapeados' | 'mapeados' | 'revisar'
        search: '',
        accountFilter: 'todas',
        activeAnuncioId: null,
        activeVariationId: null,
        modalMode: 'equivalents', // 'equivalents' | 'kit'
        modalSearch: '',
        modalAcceptedProducts: [], // array de produtos equivalentes
        modalKitComponents: [],    // array de { product, qty }
        
        // Dados simbólicos de Anúncios Mercado Livre
        anuncios: [
            {
                id: 'MLB3829104812',
                item_id: 'MLB3829104812',
                titulo: 'Sensor de Estacionamento Universal 4 Pontos Display Led Preto',
                account: 'DY Auto Parts Oficial',
                seller_sku: 'SENS-4P-PT',
                thumbnail: 'https://http2.mlstatic.com/D_NQ_NP_2X_892837-MLB48920192837_012022-F.webp',
                permalink: 'https://produto.mercadolivre.com.br/MLB-3829104812',
                status_ml: 'active',
                last_sync: 'Hoje, 11:20',
                has_variations: false,
                mapping_status: 'unmapped', // unmapped
                mapping: null
            },
            {
                id: 'MLB2910481920',
                item_id: 'MLB2910481920',
                titulo: 'Encosto de Cabeça Preto Universal Couro Sintético Macio',
                account: 'DY Auto Parts Oficial',
                seller_sku: 'ENC-CAB-PRETO',
                thumbnail: 'https://http2.mlstatic.com/D_NQ_NP_2X_782910-MLB39102948192_052023-F.webp',
                permalink: 'https://produto.mercadolivre.com.br/MLB-2910481920',
                status_ml: 'active',
                last_sync: 'Hoje, 10:15',
                has_variations: false,
                mapping_status: 'mapped', // mapped
                mapping: {
                    type: 'single',
                    products: [findProduto('DY-001.842')]
                }
            },
            {
                id: 'MLB1948201948',
                item_id: 'MLB1948201948',
                titulo: 'Lâmpada Automotiva H7 12V 55W Super Branca Farol Principal Homologada',
                account: 'DY Auto Parts Acessórios',
                seller_sku: 'LAMP-H7-55W',
                thumbnail: 'https://http2.mlstatic.com/D_NQ_NP_2X_654321-MLB1948201948_032023-F.webp',
                permalink: 'https://produto.mercadolivre.com.br/MLB-1948201948',
                status_ml: 'active',
                last_sync: 'Hoje, 09:30',
                has_variations: false,
                mapping_status: 'mapped',
                mapping: {
                    type: 'equivalents',
                    products: [
                        findProduto('DY-002.101'),
                        findProduto('DY-002.102'),
                        findProduto('DY-002.103'),
                        findProduto('DY-002.104')
                    ]
                }
            },
            {
                id: 'MLB4910294811',
                item_id: 'MLB4910294811',
                titulo: 'Capa Para Volante Automotivo Costurada Emblema Alto Relevo Premium',
                account: 'DY Auto Parts Oficial',
                seller_sku: 'CAP-VOL-VAR',
                thumbnail: 'https://http2.mlstatic.com/D_NQ_NP_2X_918273-MLB4910294811_072023-F.webp',
                permalink: 'https://produto.mercadolivre.com.br/MLB-4910294811',
                status_ml: 'active',
                last_sync: 'Ontem, 16:45',
                has_variations: true,
                mapping_status: 'partial', // 2 de 3 mapeadas
                variations: [
                    {
                        variation_id: 'VAR-883910',
                        attribute: 'Cor: Preto com Linha Vermelha',
                        seller_sku: 'CAP-VOL-PT-VM',
                        mapping_status: 'mapped',
                        mapping: { type: 'single', products: [findProduto('DY-001.204')] }
                    },
                    {
                        variation_id: 'VAR-883911',
                        attribute: 'Cor: Preto com Linha Preta',
                        seller_sku: 'CAP-VOL-PT-PT',
                        mapping_status: 'mapped',
                        mapping: { type: 'single', products: [findProduto('DY-001.205')] }
                    },
                    {
                        variation_id: 'VAR-883912',
                        attribute: 'Cor: Grafite com Linha Cinza',
                        seller_sku: 'CAP-VOL-GF-CZ',
                        mapping_status: 'unmapped',
                        mapping: null
                    }
                ]
            },
            {
                id: 'MLB5019284712',
                item_id: 'MLB5019284712',
                titulo: 'Kit Cuidado Automotivo Completo 4 Itens Lavagem e Brilho com Shampoo e Pretinho',
                account: 'DY Auto Parts Oficial',
                seller_sku: 'KIT-CUID-4',
                thumbnail: 'https://http2.mlstatic.com/D_NQ_NP_2X_102938-MLB5019284712_082023-F.webp',
                permalink: 'https://produto.mercadolivre.com.br/MLB-5019284712',
                status_ml: 'active',
                last_sync: 'Hoje, 08:50',
                has_variations: false,
                mapping_status: 'mapped',
                mapping: {
                    type: 'kit',
                    components: [
                        { product: findProduto('DY-001.451'), qty: 2 },
                        { product: findProduto('DY-001.520'), qty: 1 },
                        { product: findProduto('DY-001.648'), qty: 1 },
                        { product: findProduto('DY-001.702'), qty: 1 }
                    ]
                }
            },
            {
                id: 'MLB6102938475',
                item_id: 'MLB6102938475',
                titulo: 'Suporte Veicular Magnético Saída de Ar Universal 360 Graus Neodímio',
                account: 'DY Auto Parts Acessórios',
                seller_sku: 'SUP-MAG-360',
                thumbnail: 'https://http2.mlstatic.com/D_NQ_NP_2X_394820-MLB6102938475_092023-F.webp',
                permalink: 'https://produto.mercadolivre.com.br/MLB-6102938475',
                status_ml: 'paused',
                last_sync: 'Hoje, 07:15',
                has_variations: false,
                mapping_status: 'review', // precisa revisar
                mapping: {
                    type: 'single',
                    products: [findProduto('DY-001.771')],
                    review_reason: 'Produto interno substituído por nova versão de fábrica.'
                }
            }
        ]
    };

    // Helpers de Normalização e Sanitização
    const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const normText = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // Filtros de Listagem
    function getFilteredAnuncios() {
        const q = normText(AnunciosState.search);
        const acc = AnunciosState.accountFilter;

        return AnunciosState.anuncios.filter(an => {
            // Filtro por tab/status
            if (AnunciosState.filter === 'nao_mapeados') {
                if (an.mapping_status !== 'unmapped' && an.mapping_status !== 'partial') return false;
            } else if (AnunciosState.filter === 'mapeados') {
                if (an.mapping_status !== 'mapped') return false;
            } else if (AnunciosState.filter === 'revisar') {
                if (an.mapping_status !== 'review') return false;
            }

            // Filtro por conta
            if (acc !== 'todas' && an.account !== acc) return false;

            // Filtro por texto
            if (q) {
                const searchCorpus = [
                    an.item_id,
                    an.titulo,
                    an.seller_sku,
                    an.account,
                    an.has_variations ? an.variations.map(v => v.attribute + ' ' + v.seller_sku).join(' ') : '',
                    an.mapping?.products ? an.mapping.products.map(p => p.id_interno + ' ' + p.nome + ' ' + p.marca + ' ' + p.ean).join(' ') : '',
                    an.mapping?.components ? an.mapping.components.map(c => c.product.id_interno + ' ' + c.product.nome).join(' ') : ''
                ].join(' ');
                if (!normText(searchCorpus).includes(q)) return false;
            }

            return true;
        });
    }

    // Renderização do Bloco de Mapeamento no Card do Anúncio
    function renderMappingSummary(anuncio) {
        if (anuncio.has_variations) {
            const mappedCount = anuncio.variations.filter(v => v.mapping_status === 'mapped').length;
            const totalCount = anuncio.variations.length;
            const isFull = mappedCount === totalCount;

            return `
                <div class="an-mapping-badge ${isFull ? 'mapped' : 'unmapped'}">
                    <span class="material-symbols-rounded">${isFull ? 'task_alt' : 'alt_route'}</span>
                    <div class="an-mapping-info">
                        <div class="an-mapping-info-header">
                            <strong>${isFull ? 'Variações Mapeadas' : 'Variações Parcialmente Mapeadas'}</strong>
                            <span class="an-variations-badge">${mappedCount} de ${totalCount} mapeadas</span>
                        </div>
                        <small>Clique em "Ver / Editar mapeamento" para gerenciar cada variação.</small>
                    </div>
                </div>
            `;
        }

        if (anuncio.mapping_status === 'unmapped' || !anuncio.mapping) {
            return `
                <div class="an-mapping-badge unmapped">
                    <span class="material-symbols-rounded">link_off</span>
                    <div class="an-mapping-info">
                        <strong>Não mapeado</strong>
                        <small>Este anúncio ainda não possui produto interno vinculado para separação.</small>
                    </div>
                </div>
            `;
        }

        if (anuncio.mapping_status === 'review') {
            const p = anuncio.mapping.products?.[0];
            return `
                <div class="an-mapping-badge review">
                    <span class="material-symbols-rounded">warning</span>
                    <div class="an-mapping-info">
                        <strong>Revisar Mapeamento</strong>
                        <small>${escapeHtml(anuncio.mapping.review_reason || 'Revisão operacional pendente.')}</small>
                        <small>Vinculado: <b>${escapeHtml(p?.id_interno)}</b> — ${escapeHtml(p?.nome)}</small>
                    </div>
                </div>
            `;
        }

        if (anuncio.mapping.type === 'kit') {
            const compCount = anuncio.mapping.components.length;
            const totalUnits = anuncio.mapping.components.reduce((acc, c) => acc + c.qty, 0);
            return `
                <div class="an-mapping-badge kit">
                    <span class="material-symbols-rounded">view_in_ar</span>
                    <div class="an-mapping-info">
                        <div class="an-mapping-info-header">
                            <strong>Mapeado como Kit Composto</strong>
                            <span class="an-equivalents-tag">${compCount} produtos (${totalUnits} un/kit)</span>
                        </div>
                        <small>${anuncio.mapping.components.map(c => `${escapeHtml(c.product.id_interno)} (${c.qty}x)`).join(' + ')}</small>
                    </div>
                </div>
            `;
        }

        // Produto único ou com Equivalentes
        const products = anuncio.mapping.products || [];
        const mainProduct = products[0];
        const equivalentsCount = products.length - 1;

        return `
            <div class="an-mapping-badge mapped">
                <span class="material-symbols-rounded">${equivalentsCount > 0 ? 'alt_route' : 'check_circle'}</span>
                <div class="an-mapping-info">
                    <div class="an-mapping-info-header">
                        <strong>${escapeHtml(mainProduct?.id_interno || 'DY-???')} — ${escapeHtml(mainProduct?.nome || 'Produto')}</strong>
                        ${equivalentsCount > 0 ? `<span class="an-equivalents-tag">+ ${equivalentsCount} equivalentes aceitos</span>` : ''}
                    </div>
                    <small>Marca: <b>${escapeHtml(mainProduct?.marca || '-')}</b> | EAN: ${escapeHtml(mainProduct?.ean || '-')}</small>
                    ${equivalentsCount > 0 ? `<small style="color:#4338ca;font-weight:700;">Árvore: ${products.map(p => `${p.marca} (${p.id_interno})`).join(' OU ')}</small>` : ''}
                </div>
            </div>
        `;
    }

    // Renderização dos Cards de Anúncio
    function renderAnunciosCards() {
        const rows = getFilteredAnuncios();
        if (!rows.length) {
            return `
                <div class="an-empty" style="text-align:center;padding:48px 20px;color:#64748b;">
                    <span class="material-symbols-rounded" style="font-size:48px;color:#94a3b8;margin-bottom:12px;">search_off</span>
                    <h3 style="margin:0 0 6px;color:#0f172a;font-size:18px;">Nenhum anúncio encontrado</h3>
                    <p style="margin:0;font-size:13px;">Tente alterar o filtro ou o termo de busca pesquisado.</p>
                </div>
            `;
        }

        return rows.map(an => {
            const isMapped = an.mapping_status === 'mapped';
            const actionLabel = isMapped ? 'Ver / Editar mapeamento' : (an.has_variations ? 'Mapear variações' : 'Mapear produto');
            const actionClass = isMapped ? 'an-btn-edit' : 'an-btn-primary';
            const iconName = isMapped ? 'edit_square' : 'add_link';

            return `
                <article class="an-card" data-anuncio-id="${escapeHtml(an.id)}">
                    <!-- Thumbnail com Zoom -->
                    <button type="button" class="an-card-image" onclick="anOpenImage('${escapeHtml(an.thumbnail)}', '${escapeHtml(an.titulo)}')" title="Ampliar imagem do anúncio">
                        <img src="${escapeHtml(an.thumbnail)}" alt="${escapeHtml(an.titulo)}" onerror="this.src='/assets/images/placeholder.webp';">
                    </button>

                    <!-- Metadados do Mercado Livre -->
                    <div class="an-card-details">
                        <div class="an-card-meta">
                            <span class="an-badge-mlb">${escapeHtml(an.item_id)}</span>
                            ${an.seller_sku ? `<span class="an-badge-sku">SKU: ${escapeHtml(an.seller_sku)}</span>` : ''}
                            <span class="an-badge-account"><span class="material-symbols-rounded" style="font-size:14px;">store</span>${escapeHtml(an.account)}</span>
                        </div>
                        <h3>${escapeHtml(an.titulo)}</h3>
                        <div class="an-card-submeta">
                            <span class="an-status-dot ${an.status_ml === 'active' ? 'active' : 'paused'}">
                                ${an.status_ml === 'active' ? 'Anúncio Ativo' : 'Anúncio Pausado'}
                            </span>
                            <span>•</span>
                            <span>Sincronizado: ${escapeHtml(an.last_sync)}</span>
                            <span>•</span>
                            <a href="${escapeHtml(an.permalink)}" target="_blank" rel="noopener noreferrer" class="an-link-ml">
                                Abrir no ML <span class="material-symbols-rounded" style="font-size:13px;">open_in_new</span>
                            </a>
                        </div>
                    </div>

                    <!-- Bloco de Mapeamento Interno -->
                    <div class="an-card-mapping">
                        ${renderMappingSummary(an)}
                    </div>

                    <!-- Botão de Ação -->
                    <div class="an-card-actions">
                        <button type="button" class="an-btn ${actionClass}" onclick="anOpenMappingModal('${escapeHtml(an.id)}')">
                            <span class="material-symbols-rounded">${iconName}</span>
                            ${actionLabel}
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }

    // Tela Principal de Anúncios
    window.renderAnunciosScreen = function (push = true) {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return renderLogin();

        currentScreen = 'anuncios';
        if (push && typeof pushNav === 'function') pushNav('anuncios');

        const totalCount = AnunciosState.anuncios.length;
        const unmappedCount = AnunciosState.anuncios.filter(a => a.mapping_status === 'unmapped' || a.mapping_status === 'partial').length;
        const mappedCount = AnunciosState.anuncios.filter(a => a.mapping_status === 'mapped').length;
        const reviewCount = AnunciosState.anuncios.filter(a => a.mapping_status === 'review').length;

        const container = document.getElementById('app');
        if (!container) return;

        container.innerHTML = `
            <div class="dashboard-screen fade-in internal module-screen an-screen app-page-shell">
                ${typeof getTopBarHTML === 'function' ? getTopBarHTML(currentUser, 'renderMenu()') : ''}
                ${typeof getModuleSidebarHTML === 'function' ? getModuleSidebarHTML('anuncios', 'ANÚNCIOS') : ''}

                <main class="container an-shell app-page-container">
                    <div class="app-breadcrumb">
                        <span class="app-breadcrumb-parent" onclick="renderMenu()">Início</span>
                        <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
                        <span class="app-breadcrumb-current">Anúncios</span>
                    </div>
                    <!-- Resumo e Filtros de Topo -->
                    <section class="an-summary" aria-label="Indicadores de mapeamento">
                        <button type="button" class="tab-todos ${AnunciosState.filter === 'todos' ? 'active' : ''}" onclick="anSetFilter('todos')">
                            <span class="material-symbols-rounded">storefront</span>
                            <strong>${totalCount}</strong>
                            <small>Todos os anúncios</small>
                        </button>
                        <button type="button" class="tab-nao-mapeados ${AnunciosState.filter === 'nao_mapeados' ? 'active' : ''}" onclick="anSetFilter('nao_mapeados')">
                            <span class="material-symbols-rounded">link_off</span>
                            <strong>${unmappedCount}</strong>
                            <small>Não mapeados</small>
                        </button>
                        <button type="button" class="tab-mapeados ${AnunciosState.filter === 'mapeados' ? 'active' : ''}" onclick="anSetFilter('mapeados')">
                            <span class="material-symbols-rounded">check_circle</span>
                            <strong>${mappedCount}</strong>
                            <small>Mapeados</small>
                        </button>
                        <button type="button" class="tab-revisar ${AnunciosState.filter === 'revisar' ? 'active' : ''}" onclick="anSetFilter('revisar')">
                            <span class="material-symbols-rounded">warning</span>
                            <strong>${reviewCount}</strong>
                            <small>Para revisar</small>
                        </button>
                    </section>

                    <!-- Painel de Anúncios -->
                    <section class="an-panel">
                        <header class="an-panel-header">
                            <div class="an-panel-title">
                                <h2>Gestão de Mapeamento de Anúncios</h2>
                                <small>Vincule anúncios Mercado Livre aos produtos internos e suas marcas equivalentes aceitas na separação.</small>
                            </div>
                            <div class="an-controls">
                                <label class="an-search" aria-label="Buscar anúncios">
                                    <span class="material-symbols-rounded">search</span>
                                    <input type="text" id="an-search-input" value="${escapeHtml(AnunciosState.search)}" oninput="anOnSearchInput(this.value)" placeholder="Buscar MLB, SKU, título, conta ou ID interno...">
                                </label>
                                <select class="an-account-select" onchange="anOnAccountChange(this.value)" aria-label="Filtrar por conta">
                                    <option value="todas" ${AnunciosState.accountFilter === 'todas' ? 'selected' : ''}>Todas as Contas</option>
                                    <option value="DY Auto Parts Oficial" ${AnunciosState.accountFilter === 'DY Auto Parts Oficial' ? 'selected' : ''}>DY Auto Parts Oficial</option>
                                    <option value="DY Auto Parts Acessórios" ${AnunciosState.accountFilter === 'DY Auto Parts Acessórios' ? 'selected' : ''}>DY Auto Parts Acessórios</option>
                                </select>
                            </div>
                        </header>

                        <div id="an-list-container" class="an-list">
                            ${renderAnunciosCards()}
                        </div>
                    </section>
                </main>
            </div>
        `;
    };

    // Event Handlers de Filtros e Busca
    window.anSetFilter = function (filterKey) {
        AnunciosState.filter = filterKey;
        renderAnunciosScreen(false);
    };

    window.anOnSearchInput = function (term) {
        AnunciosState.search = term;
        const listContainer = document.getElementById('an-list-container');
        if (listContainer) {
            listContainer.innerHTML = renderAnunciosCards();
        }
    };

    window.anOnAccountChange = function (acc) {
        AnunciosState.accountFilter = acc;
        renderAnunciosScreen(false);
    };

    // Visualizador de Imagem Ampliada
    window.anOpenImage = function (url, title) {
        if (!url) return;
        const overlay = document.createElement('div');
        overlay.className = 'an-modal-overlay an-image-overlay fade-in';
        overlay.onclick = () => overlay.remove();

        overlay.innerHTML = `
            <div class="an-image-modal" onclick="event.stopPropagation()">
                <button type="button" class="an-image-close" onclick="this.closest('.an-modal-overlay').remove()" aria-label="Fechar">
                    <span class="material-symbols-rounded">close</span>
                </button>
                <img src="${escapeHtml(url)}" alt="${escapeHtml(title || 'Anúncio')}">
            </div>
        `;
        document.body.appendChild(overlay);
    };

    // =========================================================================
    // MODAL DE MAPEAMENTO (PRODUTOS EQUIVALENTES & KITS)
    // =========================================================================

    window.anOpenMappingModal = function (anuncioId, variationId = null) {
        const anuncio = AnunciosState.anuncios.find(a => a.id === anuncioId);
        if (!anuncio) return;

        AnunciosState.activeAnuncioId = anuncioId;
        AnunciosState.activeVariationId = variationId;
        AnunciosState.modalSearch = '';

        // Se for anúncio com variações e nenhuma foi selecionada ainda, abre seleção
        if (anuncio.has_variations && !variationId) {
            anOpenVariationPickerModal(anuncio);
            return;
        }

        let targetMapping = anuncio.mapping;
        if (variationId && anuncio.has_variations) {
            const v = anuncio.variations.find(x => x.variation_id === variationId);
            targetMapping = v?.mapping;
        }

        // Inicializa estado do modal conforme o mapeamento atual
        if (targetMapping?.type === 'kit') {
            AnunciosState.modalMode = 'kit';
            AnunciosState.modalAcceptedProducts = [];
            AnunciosState.modalKitComponents = (targetMapping.components || []).map(c => ({ product: c.product, qty: c.qty }));
        } else {
            AnunciosState.modalMode = 'equivalents';
            AnunciosState.modalAcceptedProducts = (targetMapping?.products || []).map(p => ({ ...p }));
            AnunciosState.modalKitComponents = [];
        }

        anRenderMappingModalDOM(anuncio, variationId);
    };

    function anOpenVariationPickerModal(anuncio) {
        const overlay = document.createElement('div');
        overlay.className = 'an-modal-overlay fade-in';
        overlay.id = 'an-variation-picker-overlay';

        overlay.innerHTML = `
            <div class="an-modal" style="max-width:620px;" onclick="event.stopPropagation()">
                <header class="an-modal-header">
                    <div>
                        <small><span class="material-symbols-rounded" style="font-size:15px;">tune</span> Selecionar Variação</small>
                        <h2>${escapeHtml(anuncio.titulo)}</h2>
                        <p>item_id: ${escapeHtml(anuncio.item_id)} • Conta: ${escapeHtml(anuncio.account)}</p>
                    </div>
                    <button type="button" class="an-modal-close" onclick="document.getElementById('an-variation-picker-overlay').remove()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </header>
                <div class="an-modal-body" style="padding:18px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;color:#64748b;">Este anúncio possui múltiplas variações. Escolha qual variação deseja mapear:</p>
                    <div style="display:grid;gap:10px;">
                        ${anuncio.variations.map(v => {
                            const isVMap = v.mapping_status === 'mapped';
                            const prod = v.mapping?.products?.[0];
                            return `
                                <button type="button" onclick="document.getElementById('an-variation-picker-overlay').remove(); anOpenMappingModal('${escapeHtml(anuncio.id)}', '${escapeHtml(v.variation_id)}')" style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:14px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;text-align:left;cursor:pointer;">
                                    <div>
                                        <strong style="display:block;color:#0f172a;font-size:13px;">${escapeHtml(v.attribute)}</strong>
                                        <small style="color:#64748b;font-size:11px;">SKU: ${escapeHtml(v.seller_sku)} • ${escapeHtml(v.variation_id)}</small>
                                        <div style="margin-top:4px;">
                                            ${isVMap ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:5px;background:#f0fdf4;color:#166534;font-size:11px;font-weight:700;"><span class="material-symbols-rounded" style="font-size:14px;">check_circle</span> Mapeado: ${escapeHtml(prod?.id_interno)} — ${escapeHtml(prod?.nome)}</span>` : `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:5px;background:#fff7ed;color:#9a3412;font-size:11px;font-weight:700;"><span class="material-symbols-rounded" style="font-size:14px;">link_off</span> Não mapeado</span>`}
                                        </div>
                                    </div>
                                    <span class="material-symbols-rounded" style="color:#ea580c;">arrow_forward</span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function anRenderMappingModalDOM(anuncio, variationId = null) {
        document.getElementById('an-mapping-modal-overlay')?.remove();

        const variation = variationId ? anuncio.variations?.find(v => v.variation_id === variationId) : null;
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'an-modal-overlay fade-in';
        modalOverlay.id = 'an-mapping-modal-overlay';

        modalOverlay.innerHTML = `
            <div class="an-modal" onclick="event.stopPropagation()">
                <!-- Header -->
                <header class="an-modal-header">
                    <div>
                        <small>
                            <span class="material-symbols-rounded" style="font-size:15px;">link</span>
                            Mapeamento de Anúncio • Mercado Livre
                        </small>
                        <h2>${escapeHtml(anuncio.titulo)}</h2>
                        <p>
                            <span>item_id: <b>${escapeHtml(anuncio.item_id)}</b></span>
                            ${variation ? `<span>• Variação: <b>${escapeHtml(variation.attribute)}</b> (${escapeHtml(variation.variation_id)})</span>` : ''}
                            <span>• Conta: <b>${escapeHtml(anuncio.account)}</b></span>
                        </p>
                    </div>
                    <button type="button" class="an-modal-close" onclick="document.getElementById('an-mapping-modal-overlay').remove()" aria-label="Fechar">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </header>

                <!-- Tabs: Produto / Equivalentes vs Kit -->
                <div class="an-modal-tabs">
                    <button type="button" class="an-modal-tab-btn ${AnunciosState.modalMode === 'equivalents' ? 'active' : ''}" onclick="anSetModalMode('equivalents')">
                        <span class="material-symbols-rounded">alt_route</span>
                        <div>
                            <strong>Produto Único ou Grupo de Equivalentes</strong>
                            <small>Um ou mais produtos de marcas diferentes que podem atender a este anúncio na separação (lógica OU).</small>
                        </div>
                    </button>
                    <button type="button" class="an-modal-tab-btn ${AnunciosState.modalMode === 'kit' ? 'active' : ''}" onclick="anSetModalMode('kit')">
                        <span class="material-symbols-rounded">view_in_ar</span>
                        <div>
                            <strong>Kit / Composição Múltipla</strong>
                            <small>Composição com múltiplos componentes e quantidades exigidas por unidade vendida (lógica E).</small>
                        </div>
                    </button>
                </div>

                <!-- Corpo do Modal -->
                <div id="an-modal-body-container" class="an-modal-body">
                    ${anRenderModalBodyContent()}
                </div>

                <!-- Footer com Ações -->
                <footer class="an-modal-footer">
                    <div class="an-modal-footer-info">
                        <small>Regra Operacional de Separação:</small>
                        <strong>${AnunciosState.modalMode === 'equivalents'
                            ? (AnunciosState.modalAcceptedProducts.length > 1
                                ? `${AnunciosState.modalAcceptedProducts.length} produtos aceitos: qualquer um será validado na conferência.`
                                : (AnunciosState.modalAcceptedProducts.length === 1 ? '1 produto interno vinculado.' : 'Nenhum produto vinculado ainda.'))
                            : `${AnunciosState.modalKitComponents.length} componente(s) exigido(s) por unidade vendida.`
                        }</strong>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <button type="button" class="an-btn an-btn-outline" onclick="document.getElementById('an-mapping-modal-overlay').remove()">Cancelar</button>
                        <button type="button" class="an-btn an-btn-primary" onclick="anConfirmModalMapping()">
                            <span class="material-symbols-rounded">save</span>
                            Salvar Mapeamento
                        </button>
                    </div>
                </footer>
            </div>
        `;

        document.body.appendChild(modalOverlay);
    }

    function anRenderModalBodyContent() {
        if (AnunciosState.modalMode === 'kit') {
            return anRenderKitModalContent();
        }
        return anRenderEquivalentsModalContent();
    }

    // Renderiza seção de Produto e Equivalentes
    function anRenderEquivalentsModalContent() {
        const accepted = AnunciosState.modalAcceptedProducts;

        return `
            <!-- Árvore de Produtos Equivalentes Aceitos -->
            <section class="an-equivalents-section">
                <header class="an-equivalents-section-header">
                    <div>
                        <h4>Produtos Aceitos para este Anúncio</h4>
                        <small>Qualquer um destes produtos internos poderá ser separado e bipado na conferência (relação de equivalência).</small>
                    </div>
                    <span style="font-size:12px;font-weight:800;color:#ea580c;">
                        ${accepted.length === 0 ? 'Nenhum produto aceito' : `${accepted.length} produto(s) no grupo`}
                    </span>
                </header>

                <div class="an-equiv-tree-list">
                    ${accepted.length === 0 ? `
                        <div style="padding:28px;text-align:center;color:#64748b;">
                            <span class="material-symbols-rounded" style="font-size:36px;color:#cbd5e1;margin-bottom:6px;">inventory_2</span>
                            <p style="margin:0;font-size:13px;">Nenhum produto interno vinculado. Pesquise abaixo para adicionar o primeiro produto ou seus equivalentes.</p>
                        </div>
                    ` : accepted.map((p, index) => `
                        <div class="an-equiv-tree-item">
                            <span class="material-symbols-rounded">${index === 0 ? 'star' : 'alt_route'}</span>
                            <div class="an-equiv-tree-info">
                                <strong>${escapeHtml(p.id_interno)} — ${escapeHtml(p.nome)}</strong>
                                <span>EAN: ${escapeHtml(p.ean || '-')} • SKU Fornecedor: ${escapeHtml(p.sku_fornecedor || '-')}</span>
                            </div>
                            <span class="an-equiv-tree-badge-brand">${escapeHtml(p.marca || 'Marca')}</span>
                            ${index === 0 ? '<span class="an-equiv-tree-badge-mestre">Principal</span>' : '<span style="font-size:10px;color:#64748b;font-weight:700;">Equivalente</span>'}
                            <button type="button" class="an-equiv-remove-btn" onclick="anRemoveAcceptedProduct(${index})" title="Remover este produto aceito">
                                <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
                            </button>
                        </div>
                    `).join('')}
                </div>
            </section>

            <!-- Catálogo de Pesquisa de Produtos Internos -->
            <section class="an-catalog-section">
                <label style="font-size:12px;font-weight:800;color:#334155;">Adicionar Produto Interno ou Marca Equivalente:</label>
                <div class="an-catalog-search-bar">
                    <span class="material-symbols-rounded" style="color:#94a3b8;">search</span>
                    <input type="text" id="an-catalog-input" value="${escapeHtml(AnunciosState.modalSearch)}" oninput="anOnModalSearchInput(this.value)" placeholder="Pesquisar por ID interno (ex: DY-001.xxx), Nome, Marca (Osram, Philips...), EAN ou SKU...">
                </div>

                <div class="an-catalog-results">
                    ${anRenderCatalogResults()}
                </div>
            </section>
        `;
    }

    // Renderiza seção de Kit
    function anRenderKitModalContent() {
        const components = AnunciosState.modalKitComponents;

        return `
            <section class="an-equivalents-section">
                <header class="an-equivalents-section-header">
                    <div>
                        <h4>Componentes do Kit Composto</h4>
                        <small>Defina quais produtos e as quantidades necessárias para compor 1 unidade deste anúncio.</small>
                    </div>
                    <span style="font-size:12px;font-weight:800;color:#6b21a8;">
                        ${components.length} componente(s)
                    </span>
                </header>

                <div class="an-equiv-tree-list">
                    ${components.length === 0 ? `
                        <div style="padding:28px;text-align:center;color:#64748b;">
                            <span class="material-symbols-rounded" style="font-size:36px;color:#cbd5e1;margin-bottom:6px;">view_in_ar</span>
                            <p style="margin:0;font-size:13px;">Nenhum componente adicionado ao kit. Pesquise e adicione produtos abaixo.</p>
                        </div>
                    ` : components.map((c, index) => `
                        <div class="an-equiv-tree-item" style="grid-template-columns:32px 1fr auto auto 36px;">
                            <span class="material-symbols-rounded" style="color:#6b21a8;">inventory_2</span>
                            <div class="an-equiv-tree-info">
                                <strong>${escapeHtml(c.product.id_interno)} — ${escapeHtml(c.product.nome)}</strong>
                                <span>Marca: ${escapeHtml(c.product.marca)} • EAN: ${escapeHtml(c.product.ean || '-')}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <button type="button" onclick="anChangeKitQty(${index}, -1)" style="width:26px;height:26px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;font-weight:900;">-</button>
                                <strong style="min-width:24px;text-align:center;font-size:14px;color:#0f172a;">${c.qty}x</strong>
                                <button type="button" onclick="anChangeKitQty(${index}, 1)" style="width:26px;height:26px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;font-weight:900;">+</button>
                            </div>
                            <span style="font-size:11px;color:#64748b;white-space:nowrap;">por kit</span>
                            <button type="button" class="an-equiv-remove-btn" onclick="anRemoveKitComponent(${index})" title="Remover componente">
                                <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
                            </button>
                        </div>
                    `).join('')}
                </div>
            </section>

            <section class="an-catalog-section">
                <label style="font-size:12px;font-weight:800;color:#334155;">Pesquisar Componente para o Kit:</label>
                <div class="an-catalog-search-bar">
                    <span class="material-symbols-rounded" style="color:#94a3b8;">search</span>
                    <input type="text" id="an-catalog-input" value="${escapeHtml(AnunciosState.modalSearch)}" oninput="anOnModalSearchInput(this.value)" placeholder="Pesquisar produto interno por ID, nome, marca, EAN...">
                </div>

                <div class="an-catalog-results">
                    ${anRenderCatalogResults()}
                </div>
            </section>
        `;
    }

    // Renderiza resultados de produtos internos na busca do modal
    function anRenderCatalogResults() {
        const q = normText(AnunciosState.modalSearch);
        const filtered = CATALOGO_PRODUTOS.filter(p => {
            if (!q) return true;
            const corpus = [p.id_interno, p.nome, p.marca, p.ean, p.sku_fornecedor].join(' ');
            return normText(corpus).includes(q);
        });

        if (!filtered.length) {
            return `
                <div style="padding:20px;text-align:center;color:#64748b;font-size:12px;">
                    Nenhum produto interno encontrado para o termo pesquisado.
                </div>
            `;
        }

        return filtered.map(p => {
            const isAlreadyAccepted = AnunciosState.modalMode === 'equivalents'
                ? AnunciosState.modalAcceptedProducts.some(x => x.id_interno === p.id_interno)
                : false;

            return `
                <div class="an-catalog-item" onclick="anSelectCatalogProduct('${escapeHtml(p.id_interno)}')">
                    <span class="material-symbols-rounded">inventory_2</span>
                    <div>
                        <strong>${escapeHtml(p.id_interno)} — ${escapeHtml(p.nome)}</strong>
                        <small>Marca: <b>${escapeHtml(p.marca)}</b> | EAN: ${escapeHtml(p.ean || '-')} | SKU: ${escapeHtml(p.sku_fornecedor || '-')}</small>
                    </div>
                    <button type="button" ${isAlreadyAccepted ? 'disabled style="background:#cbd5e1;cursor:default;"' : ''}>
                        ${isAlreadyAccepted ? 'Já adicionado' : (AnunciosState.modalMode === 'kit' ? '+ Adicionar ao Kit' : '+ Adicionar')}
                    </button>
                </div>
            `;
        }).join('');
    }

    // Ações do Modal
    window.anSetModalMode = function (mode) {
        AnunciosState.modalMode = mode;
        const container = document.getElementById('an-modal-body-container');
        if (container) {
            container.innerHTML = anRenderModalBodyContent();
        }
        // Atualiza tabs
        document.querySelectorAll('.an-modal-tab-btn').forEach(b => {
            b.classList.toggle('active', (mode === 'equivalents' && b.innerText.includes('Grupo')) || (mode === 'kit' && b.innerText.includes('Kit')));
        });
    };

    window.anOnModalSearchInput = function (term) {
        AnunciosState.modalSearch = term;
        const resultsEl = document.querySelector('.an-catalog-results');
        if (resultsEl) {
            resultsEl.innerHTML = anRenderCatalogResults();
        }
    };

    window.anSelectCatalogProduct = function (idInterno) {
        const prod = findProduto(idInterno);
        if (!prod) return;

        if (AnunciosState.modalMode === 'equivalents') {
            if (!AnunciosState.modalAcceptedProducts.some(p => p.id_interno === idInterno)) {
                AnunciosState.modalAcceptedProducts.push({ ...prod });
            }
        } else {
            const existing = AnunciosState.modalKitComponents.find(c => c.product.id_interno === idInterno);
            if (existing) {
                existing.qty++;
            } else {
                AnunciosState.modalKitComponents.push({ product: { ...prod }, qty: 1 });
            }
        }

        const container = document.getElementById('an-modal-body-container');
        if (container) {
            container.innerHTML = anRenderModalBodyContent();
        }
    };

    window.anRemoveAcceptedProduct = function (index) {
        AnunciosState.modalAcceptedProducts.splice(index, 1);
        const container = document.getElementById('an-modal-body-container');
        if (container) {
            container.innerHTML = anRenderModalBodyContent();
        }
    };

    window.anChangeKitQty = function (index, delta) {
        const c = AnunciosState.modalKitComponents[index];
        if (!c) return;
        c.qty = Math.max(1, c.qty + delta);
        const container = document.getElementById('an-modal-body-container');
        if (container) {
            container.innerHTML = anRenderModalBodyContent();
        }
    };

    window.anRemoveKitComponent = function (index) {
        AnunciosState.modalKitComponents.splice(index, 1);
        const container = document.getElementById('an-modal-body-container');
        if (container) {
            container.innerHTML = anRenderModalBodyContent();
        }
    };

    window.anConfirmModalMapping = function () {
        const anuncio = AnunciosState.anuncios.find(a => a.id === AnunciosState.activeAnuncioId);
        if (!anuncio) return;

        if (AnunciosState.modalMode === 'equivalents') {
            if (!AnunciosState.modalAcceptedProducts.length) {
                if (typeof showToast === 'function') showToast('Adicione pelo menos um produto ao mapeamento.', 'warning');
                return;
            }

            const newMapping = {
                type: AnunciosState.modalAcceptedProducts.length > 1 ? 'equivalents' : 'single',
                products: AnunciosState.modalAcceptedProducts.map(p => ({ ...p }))
            };

            if (AnunciosState.activeVariationId && anuncio.has_variations) {
                const v = anuncio.variations.find(x => x.variation_id === AnunciosState.activeVariationId);
                if (v) {
                    v.mapping = newMapping;
                    v.mapping_status = 'mapped';
                }
                const allMapped = anuncio.variations.every(x => x.mapping_status === 'mapped');
                anuncio.mapping_status = allMapped ? 'mapped' : 'partial';
            } else {
                anuncio.mapping = newMapping;
                anuncio.mapping_status = 'mapped';
            }
        } else {
            if (!AnunciosState.modalKitComponents.length) {
                if (typeof showToast === 'function') showToast('Adicione pelo menos um componente ao kit.', 'warning');
                return;
            }

            const newMapping = {
                type: 'kit',
                components: AnunciosState.modalKitComponents.map(c => ({ product: { ...c.product }, qty: c.qty }))
            };

            if (AnunciosState.activeVariationId && anuncio.has_variations) {
                const v = anuncio.variations.find(x => x.variation_id === AnunciosState.activeVariationId);
                if (v) {
                    v.mapping = newMapping;
                    v.mapping_status = 'mapped';
                }
                const allMapped = anuncio.variations.every(x => x.mapping_status === 'mapped');
                anuncio.mapping_status = allMapped ? 'mapped' : 'partial';
            } else {
                anuncio.mapping = newMapping;
                anuncio.mapping_status = 'mapped';
            }
        }

        document.getElementById('an-mapping-modal-overlay')?.remove();
        renderAnunciosScreen(false);
        if (typeof showToast === 'function') {
            showToast('Mapeamento de anúncio atualizado com sucesso!', 'success');
        }
    };

})();
