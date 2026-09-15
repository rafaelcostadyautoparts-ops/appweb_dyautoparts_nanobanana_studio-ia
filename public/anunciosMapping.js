(function () {
    window.__anunciosMappingLoaded = true;

    // Catálogo de produtos internos reais (carregado via Supabase ou fallback)
    let CATALOGO_PRODUTOS_REAIS = null;
    let carregandoProdutosPromise = null;

    async function carregarProdutosCatalogo() {
        if (CATALOGO_PRODUTOS_REAIS && CATALOGO_PRODUTOS_REAIS.length > 0) return CATALOGO_PRODUTOS_REAIS;
        if (carregandoProdutosPromise) return carregandoProdutosPromise;

        carregandoProdutosPromise = (async () => {
            try {
                let prods = [];
                if (window.DataClient?.loadModule) {
                    const mod = await window.DataClient.loadModule('produtos');
                    if (mod && Array.isArray(mod.products) && mod.products.length > 0) {
                        prods = mod.products;
                    }
                }
                if (!prods.length && window.supabaseClient) {
                    const { data, error } = await window.supabaseClient
                        .from('produtos')
                        .select('id, id_interno, descricao_completa, marca, ean, sku_fornecedor, preco_varejo, preco_custo, status')
                        .eq('status', 'ativo')
                        .limit(500);
                    if (!error && Array.isArray(data)) {
                        prods = data;
                    }
                }
                if (prods.length > 0) {
                    CATALOGO_PRODUTOS_REAIS = prods.map(p => ({
                        id: p.id,
                        id_interno: p.id_interno || p.codigo,
                        nome: p.descricao_completa || p.nome || p.id_interno,
                        marca: p.marca || '-',
                        ean: p.ean || '-',
                        sku_fornecedor: p.sku_fornecedor || '-',
                        preco: Number(p.preco_varejo || p.preco_custo || 0)
                    }));
                    return CATALOGO_PRODUTOS_REAIS;
                }
            } catch (e) {
                console.warn('[ANUNCIOS_MAPPING] Erro ao carregar produtos reais do Supabase:', e);
            }
            return [];
        })();

        return carregandoProdutosPromise;
    }

    const getCatalogoAtual = () => (CATALOGO_PRODUTOS_REAIS && CATALOGO_PRODUTOS_REAIS.length > 0) ? CATALOGO_PRODUTOS_REAIS : [];
    const findProduto = id => getCatalogoAtual().find(p => p.id_interno === id || p.id === id);

    // Lista de Anúncios para Preview Operacional na Interface
    const PREVIEW_ANUNCIOS_MAPPING = [
        {
            "id": "MLB1096816640",
            "marketplace": "MERCADO_LIVRE",
            "account_id": 1,
            "source_account_id": "238451947",
            "account_externo_id": "238451947",
            "seller_nome": "DY PARTS AUTO PECAS LTDA",
            "seller_externo_id": "238451947",
            "external_item_id": "MLB1096816640",
            "variation_id": "42874954132",
            "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H7",
            "seller_sku": "SKU-LED-H7-PAIR",
            "titulo": "Par H1 H3 H7 H8 H11 H16 H27 Hb3/4 Super Led 6000k 7200lm C6",
            "thumbnail_url": "http://http2.mlstatic.com/D_857856-MLB73225010878_122023-I.jpg",
            "permalink": "https://produto.mercadolivre.com.br/MLB-1096816640-par-h1-h3-h7-h8-h11-h16-h27-hb34-super-led-6000k-7200lm-c6-_JM",
            "marketplace_status": "ACTIVE",
            "preco_venda": 78.99,
            "situacao_mapeamento": "NAO_MAPEADO",
            "has_variations": true,
            "variations": [
                {
                    "variation_id": "42874954132",
                    "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H7",
                    "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H7",
                    "seller_sku": "SKU-H7-LED",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping": null
                },
                {
                    "variation_id": "42874954237",
                    "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H9",
                    "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H9",
                    "seller_sku": "SKU-H9-LED",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping": null
                }
            ]
        },
        {
            "id": "MLB2184930291",
            "marketplace": "MERCADO_LIVRE",
            "account_id": 1,
            "source_account_id": "238451947",
            "seller_nome": "DY PARTS AUTO PECAS LTDA",
            "external_item_id": "MLB2184930291",
            "variation_id": null,
            "seller_sku": "TAP-771-PVC",
            "titulo": "Jogo De Tapete Automotivo Pvc Universal Preto Impermeavel",
            "thumbnail_url": "http://http2.mlstatic.com/D_982143-MLB48123901238_112021-I.jpg",
            "permalink": "https://produto.mercadolivre.com.br/MLB-2184930291-jogo-de-tapete-automotivo-pvc-universal-preto-impermeavel-_JM",
            "marketplace_status": "ACTIVE",
            "preco_venda": 89.90,
            "situacao_mapeamento": "MAPEADO",
            "has_variations": false,
            "variations": [],
            "mapping": {
                "tipo_identificacao": "produto",
                "versao": 1,
                "componentes": [
                    { "id_interno": "DY-001.771", "nome": "Jogo de tapetes PVC preto universal", "quantidade": 1 }
                ]
            }
        },
        {
            "id": "SHP9841239401",
            "marketplace": "SHOPEE",
            "account_id": 2,
            "source_account_id": "284803847",
            "seller_nome": "DY AUTO PARTS OFFICIAL",
            "external_item_id": "SHP9841239401",
            "variation_id": null,
            "seller_sku": "KIT-LIMPEZA-PRO",
            "titulo": "Kit Limpeza Automotiva Shampoo + pretinho + Aplicador + Microfibra",
            "thumbnail_url": "http://http2.mlstatic.com/D_671234-MLB54123984123_032022-I.jpg",
            "permalink": "https://shopee.com.br/product/284803847/9841239401",
            "marketplace_status": "ACTIVE",
            "preco_venda": 49.90,
            "situacao_mapeamento": "MAPEADO",
            "has_variations": false,
            "variations": [],
            "mapping": {
                "tipo_identificacao": "kit",
                "versao": 1,
                "componentes": [
                    { "id_interno": "DY-001.451", "nome": "Pano de microfibra premium 40 x 40 cm", "quantidade": 1 },
                    { "id_interno": "DY-001.520", "nome": "Aplicador de espuma anatomico automotivo", "quantidade": 1 },
                    { "id_interno": "DY-001.648", "nome": "Shampoo automotivo neutro com cera 500ml", "quantidade": 1 },
                    { "id_interno": "DY-001.702", "nome": "Pretinho revitalizador para pneus 500ml", "quantidade": 1 }
                ]
            }
        }
    ];

    // Estado do Módulo de Anúncios
    const AnunciosState = {
        filter: 'todos', // 'todos' | 'nao_mapeados' | 'mapeados' | 'revisar'
        search: '',
        accountFilter: 'todas',
        activeAnuncioId: null,
        activeVariationId: null,
        modalMode: 'produto', // 'produto' | 'grupo_equivalencia' | 'kit'
        modalSearch: '',
        modalAcceptedProducts: [],
        modalKitComponents: [],
        anuncios: PREVIEW_ANUNCIOS_MAPPING
    };

    // Helpers de Sanitização e Formatação
    const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const normText = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    function formatMoeda(valor) {
        const num = Number(valor || 0);
        return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function accountKey(anuncio) {
        return anuncio.account_id || anuncio.source_account_id || anuncio.seller_externo_id || 'todas';
    }

    function sellerLabel(anuncio) {
        return anuncio.seller_nome || anuncio.account_nome || `Conta #${accountKey(anuncio)}`;
    }

    function accountOptions() {
        const found = new Map();
        AnunciosState.anuncios.forEach(an => {
            const key = String(accountKey(an));
            if (key && !found.has(key)) {
                found.set(key, sellerLabel(an) || key);
            }
        });
        return [...found].map(([key, label]) => `
            <option value="${escapeHtml(key)}" ${String(AnunciosState.accountFilter) === String(key) ? 'selected' : ''}>
                ${escapeHtml(label)}
            </option>
        `).join('');
    }

    // Filtros de Listagem
    function getFilteredAnuncios() {
        const q = normText(AnunciosState.search);
        const acc = String(AnunciosState.accountFilter);

        return AnunciosState.anuncios.filter(an => {
            const sit = an.situacao_mapeamento || (an.mapping ? 'MAPEADO' : 'NAO_MAPEADO');
            if (AnunciosState.filter === 'nao_mapeados') {
                if (sit !== 'NAO_MAPEADO' && sit !== 'PARCIAL') return false;
            } else if (AnunciosState.filter === 'mapeados') {
                if (sit !== 'MAPEADO') return false;
            } else if (AnunciosState.filter === 'revisar') {
                if (sit !== 'REVISAR') return false;
            }

            if (acc !== 'todas' && String(accountKey(an)) !== acc) return false;

            if (q) {
                const searchCorpus = [
                    an.id,
                    an.external_item_id,
                    an.titulo,
                    an.seller_sku,
                    an.seller_nome,
                    an.has_variations ? an.variations.map(v => v.attribute + ' ' + v.seller_sku).join(' ') : '',
                    an.mapping?.componentes ? an.mapping.componentes.map(c => c.id_interno + ' ' + c.nome).join(' ') : ''
                ].join(' ');
                if (!normText(searchCorpus).includes(q)) return false;
            }

            return true;
        });
    }

    // Renderização do Badge e Resumo do Mapeamento no Card
    function renderMappingSummary(anuncio) {
        if (anuncio.has_variations && Array.isArray(anuncio.variations) && anuncio.variations.length > 0) {
            const mappedCount = anuncio.variations.filter(v => v.situacao_mapeamento === 'MAPEADO' || v.mapping).length;
            const totalCount = anuncio.variations.length;
            const isFull = mappedCount === totalCount && totalCount > 0;
            const isPartial = mappedCount > 0 && !isFull;

            let badgeClass = 'unmapped';
            let label = 'Sem Mapeamento';
            let icon = 'alt_route';

            if (isFull) {
                badgeClass = 'mapped';
                label = 'Todas Variações Mapeadas';
                icon = 'task_alt';
            } else if (isPartial) {
                badgeClass = 'partial';
                label = 'Parcialmente Mapeado';
                icon = 'alt_route';
            }

            return `
                <div class="an-mapping-badge ${badgeClass}">
                    <span class="material-symbols-rounded">${icon}</span>
                    <div class="an-mapping-info">
                        <div class="an-mapping-info-header">
                            <strong>${label}</strong>
                            <span class="an-variations-badge">${mappedCount} de ${totalCount} mapeadas</span>
                        </div>
                        <small>Clique em "Ver / Mapear" para gerenciar cada variação individualmente.</small>
                    </div>
                </div>
            `;
        }

        const map = anuncio.mapping;
        if (!map) {
            return `
                <div class="an-mapping-badge unmapped">
                    <span class="material-symbols-rounded">link_off</span>
                    <div class="an-mapping-info">
                        <strong>Não Mapeado</strong>
                        <small>Este anúncio ainda não possui produto mestre ou grupo associado.</small>
                    </div>
                </div>
            `;
        }

        const tipo = map.tipo_identificacao || 'produto';
        const comps = map.componentes || [];

        let tipoLabel = 'Produto Exato';
        let badgeClass = 'mapped';
        let icon = 'inventory_2';

        if (tipo === 'grupo_equivalencia') {
            tipoLabel = 'Grupo de Equivalência';
            icon = 'schema';
        } else if (tipo === 'kit') {
            tipoLabel = `KIT (${comps.length} componentes)`;
            icon = 'widgets';
        }

        const compsHtml = comps.slice(0, 3).map(c => `
            <div class="an-comp-chip">
                <span class="material-symbols-rounded" style="font-size:14px;color:#0284c7;">tag</span>
                <strong>${escapeHtml(c.id_interno || c.nome)}</strong>
                ${c.quantidade > 1 ? `<span class="an-comp-qty">x${c.quantidade}</span>` : ''}
            </div>
        `).join('');

        return `
            <div class="an-mapping-badge ${badgeClass}">
                <span class="material-symbols-rounded">${icon}</span>
                <div class="an-mapping-info">
                    <div class="an-mapping-info-header">
                        <strong>Mapeado (${tipoLabel})</strong>
                    </div>
                    <div class="an-comp-chips-wrapper">
                        ${compsHtml}
                        ${comps.length > 3 ? `<small>+ ${comps.length - 3} mais</small>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // Renderização do Card de Anúncio
    function renderAnuncioCard(anuncio) {
        const hasPermalink = Boolean(anuncio.permalink && anuncio.permalink.startsWith('http'));
        const thumbUrl = anuncio.thumbnail_url || 'https://via.placeholder.com/120?text=Sem+Foto';

        const imageHtml = hasPermalink ? `
            <a href="${escapeHtml(anuncio.permalink)}" target="_blank" rel="noopener noreferrer" class="an-card-image-link" title="Clique para abrir o anúncio oficial no marketplace">
                <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(anuncio.titulo)}" loading="lazy">
                <span class="an-image-overlay-badge">
                    <span class="material-symbols-rounded">open_in_new</span>
                </span>
            </a>
        ` : `
            <div class="an-card-image no-link">
                <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(anuncio.titulo)}">
            </div>
        `;

        const sellerName = sellerLabel(anuncio);
        const mktName = (anuncio.marketplace || 'MERCADO_LIVRE').replace('_', ' ');

        return `
            <div class="an-card" data-anuncio-id="${escapeHtml(anuncio.id)}">
                <div class="an-card-body">
                    <div class="an-card-media">
                        ${imageHtml}
                    </div>

                    <div class="an-card-details">
                        <div class="an-card-top-row">
                            <span class="an-seller-badge">
                                <span class="material-symbols-rounded">storefront</span>
                                <strong>${escapeHtml(sellerName)}</strong>
                                <small>(${escapeHtml(mktName)})</small>
                            </span>
                            <span class="an-price-tag">${formatMoeda(anuncio.preco_venda)}</span>
                        </div>

                        <h3 class="an-card-title">${escapeHtml(anuncio.titulo)}</h3>

                        <div class="an-card-meta">
                            <span><strong>MLB / Ref:</strong> ${escapeHtml(anuncio.external_item_id || anuncio.id)}</span>
                            ${anuncio.seller_sku ? `<span><strong>SKU Anúncio:</strong> ${escapeHtml(anuncio.seller_sku)}</span>` : ''}
                        </div>

                        ${renderMappingSummary(anuncio)}
                    </div>
                </div>

                <div class="an-card-footer">
                    <button type="button" class="an-btn-action-primary" onclick="window.anOpenMappingModal('${escapeHtml(anuncio.id)}')">
                        <span class="material-symbols-rounded">build_circle</span>
                        Ver / Mapear
                    </button>
                </div>
            </div>
        `;
    }

    // Atualização de Estatísticas no Topo
    function atualizarContadoresResumo() {
        const todos = AnunciosState.anuncios.length;
        let naoMapeados = 0;
        let mapeados = 0;
        let revisar = 0;

        AnunciosState.anuncios.forEach(an => {
            const sit = an.situacao_mapeamento || (an.mapping ? 'MAPEADO' : 'NAO_MAPEADO');
            if (sit === 'MAPEADO') mapeados++;
            else if (sit === 'REVISAR') revisar++;
            else naoMapeados++;
        });

        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setTxt('an-count-todos', todos);
        setTxt('an-count-nao-mapeados', naoMapeados);
        setTxt('an-count-mapeados', mapeados);
        setTxt('an-count-revisar', revisar);
    }

    // Renderização Principal da Lista
    function renderAnunciosList() {
        const container = document.getElementById('an-list-container');
        if (!container) return;

        const filtered = getFilteredAnuncios();
        atualizarContadoresResumo();

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="an-empty-state">
                    <span class="material-symbols-rounded">search_off</span>
                    <h3>Nenhum anúncio encontrado</h3>
                    <p>Tente alterar os termos da busca ou ajustar os filtros por aba e conta.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(an => renderAnuncioCard(an)).join('');
    }

    // =========================================================================
    // MODAL DE MAPEAMENTO INDIVIDUAL (PRODUTO / EQUIVALÊNCIA / KIT)
    // =========================================================================
    window.anOpenMappingModal = async function (anuncioId, variationRefStr = null) {
        const anuncio = AnunciosState.anuncios.find(a => String(a.id) === String(anuncioId));
        if (!anuncio) {
            if (typeof showToast === 'function') showToast('Anúncio não encontrado.', 'error');
            return;
        }

        await carregarProdutosCatalogo();
        const existingMap = anuncio.mapping;

        AnunciosState.activeAnuncioId = anuncioId;
        AnunciosState.activeVariationId = variationRefStr;
        AnunciosState.modalMode = existingMap?.tipo_identificacao || 'produto';
        AnunciosState.modalKitComponents = existingMap?.componentes ? JSON.parse(JSON.stringify(existingMap.componentes)) : [];

        anRenderSharedMappingModal(anuncio);
    };

    function anRenderSharedMappingModal(anuncio) {
        let modalEl = document.getElementById('an-mapping-modal-overlay');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'an-mapping-modal-overlay';
            modalEl.className = 'an-modal-overlay';
            document.body.appendChild(modalEl);
        }

        const mode = AnunciosState.modalMode;
        const comps = AnunciosState.modalKitComponents;

        modalEl.innerHTML = `
            <div class="an-modal">
                <div class="an-modal-header">
                    <div>
                        <span class="an-modal-tag">${escapeHtml(sellerLabel(anuncio))}</span>
                        <h2>Mapeamento de Anúncio</h2>
                        <small style="color:#64748b;">MLB: ${escapeHtml(anuncio.external_item_id || anuncio.id)} | ${escapeHtml(anuncio.titulo)}</small>
                    </div>
                    <button type="button" class="an-modal-close" onclick="document.getElementById('an-mapping-modal-overlay').remove()">&times;</button>
                </div>

                <div class="an-modal-body">
                    <div class="an-modal-tabs">
                        <button type="button" class="an-modal-tab ${mode === 'produto' ? 'active' : ''}" onclick="window.anSetModalMode('produto')">
                            <span class="material-symbols-rounded">inventory_2</span> Produto Exato
                        </button>
                        <button type="button" class="an-modal-tab ${mode === 'grupo_equivalencia' ? 'active' : ''}" onclick="window.anSetModalMode('grupo_equivalencia')">
                            <span class="material-symbols-rounded">schema</span> Grupo de Equivalência
                        </button>
                        <button type="button" class="an-modal-tab ${mode === 'kit' ? 'active' : ''}" onclick="window.anSetModalMode('kit')">
                            <span class="material-symbols-rounded">widgets</span> Composição de KIT
                        </button>
                    </div>

                    <div class="an-modal-content">
                        ${renderModalModeContent(mode, comps)}
                    </div>
                </div>

                <div class="an-modal-footer">
                    <button type="button" class="an-btn-secondary" onclick="window.anOpenEquivalenciaManagerModal()">
                        <span class="material-symbols-rounded">settings</span> Gerenciador de Equivalências
                    </button>
                    <div style="display:flex;gap:10px;">
                        <button type="button" class="an-btn-secondary" onclick="document.getElementById('an-mapping-modal-overlay').remove()">Cancelar</button>
                        <button type="button" class="an-btn-primary" onclick="window.anSalvarMappingModal()">
                            <span class="material-symbols-rounded">save</span> Salvar Mapeamento
                        </button>
                    </div>
                </div>
            </div>
        `;
        modalEl.style.display = 'flex';
    }

    function renderModalModeContent(mode, comps) {
        const catalogo = getCatalogoAtual();
        const optionsHtml = catalogo.map(p => `
            <option value="${escapeHtml(p.id_interno)}">${escapeHtml(p.id_interno)} - ${escapeHtml(p.nome)} (${escapeHtml(p.marca)})</option>
        `).join('');

        if (mode === 'produto' || mode === 'grupo_equivalencia') {
            const comp = comps[0] || {};
            return `
                <div class="an-form-group">
                    <label>Selecione o Produto Mestre / Código Interno:</label>
                    <select id="an-select-single-produto" class="an-select">
                        <option value="">-- Selecione o Produto Mestre --</option>
                        ${optionsHtml}
                    </select>
                    <small style="color:#64748b;margin-top:6px;display:block;">
                        ${mode === 'produto' ? 'Associa este anúncio a 1 SKU exato.' : 'Associa este anúncio ao grupo de equivalência que contém o SKU selecionado.'}
                    </small>
                </div>
            `;
        }

        // Modo KIT: Múltiplos componentes
        const compsRows = comps.map((c, idx) => `
            <div class="an-kit-row" data-index="${idx}">
                <div style="flex:2;">
                    <label style="font-size:11px;font-weight:700;color:#475569;">Componente #${idx + 1}</label>
                    <select class="an-select an-kit-select" onchange="window.anUpdateKitComponent(${idx}, 'id_interno', this.value)">
                        <option value="">-- Selecione o Produto --</option>
                        ${catalogo.map(p => `<option value="${escapeHtml(p.id_interno)}" ${p.id_interno === c.id_interno ? 'selected' : ''}>${escapeHtml(p.id_interno)} - ${escapeHtml(p.nome)}</option>`).join('')}
                    </select>
                </div>
                <div style="width:100px;">
                    <label style="font-size:11px;font-weight:700;color:#475569;">Qtd por KIT</label>
                    <input type="number" class="an-input" min="1" value="${c.quantidade || 1}" onchange="window.anUpdateKitComponent(${idx}, 'quantidade', this.value)">
                </div>
                <div style="display:flex;align-items:flex-end;">
                    <button type="button" class="an-btn-danger-icon" onclick="window.anRemoveKitComponent(${idx})" title="Remover Componente">&times;</button>
                </div>
            </div>
        `).join('');

        return `
            <div class="an-kit-wrapper">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <strong>Componentes do KIT (${comps.length})</strong>
                    <button type="button" class="an-btn-outline-sm" onclick="window.anAddKitComponent()">
                        <span class="material-symbols-rounded" style="font-size:16px;">add</span> Adicionar Item
                    </button>
                </div>
                <div class="an-kit-list">
                    ${compsRows || '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:16px;">Nenhum componente adicionado ao KIT.</p>'}
                </div>
            </div>
        `;
    }

    window.anSetModalMode = function (newMode) {
        AnunciosState.modalMode = newMode;
        const anuncio = AnunciosState.anuncios.find(a => String(a.id) === String(AnunciosState.activeAnuncioId));
        if (anuncio) anRenderSharedMappingModal(anuncio);
    };

    window.anAddKitComponent = function () {
        AnunciosState.modalKitComponents.push({ id_interno: '', quantidade: 1 });
        const anuncio = AnunciosState.anuncios.find(a => String(a.id) === String(AnunciosState.activeAnuncioId));
        if (anuncio) anRenderSharedMappingModal(anuncio);
    };

    window.anUpdateKitComponent = function (index, field, value) {
        if (!AnunciosState.modalKitComponents[index]) return;
        if (field === 'quantidade') {
            AnunciosState.modalKitComponents[index].quantidade = Math.max(1, parseInt(value, 10) || 1);
        } else {
            AnunciosState.modalKitComponents[index][field] = value;
            const p = findProduto(value);
            if (p) AnunciosState.modalKitComponents[index].nome = p.nome;
        }
    };

    window.anRemoveKitComponent = function (index) {
        AnunciosState.modalKitComponents.splice(index, 1);
        const anuncio = AnunciosState.anuncios.find(a => String(a.id) === String(AnunciosState.activeAnuncioId));
        if (anuncio) anRenderSharedMappingModal(anuncio);
    };

    window.anSalvarMappingModal = async function () {
        const anuncio = AnunciosState.anuncios.find(a => String(a.id) === String(AnunciosState.activeAnuncioId));
        if (!anuncio) return;

        const mode = AnunciosState.modalMode;
        let componentesFinal = [];

        if (mode === 'produto' || mode === 'grupo_equivalencia') {
            const selectEl = document.getElementById('an-select-single-produto');
            const idInt = selectEl ? selectEl.value : '';
            if (!idInt) {
                if (typeof showToast === 'function') showToast('Selecione um produto mestre válido.', 'warning');
                return;
            }
            const p = findProduto(idInt);
            componentesFinal = [{ id_interno: idInt, nome: p?.nome || idInt, quantidade: 1, tipo: mode }];
        } else {
            componentesFinal = AnunciosState.modalKitComponents.filter(c => c.id_interno);
            if (!componentesFinal.length) {
                if (typeof showToast === 'function') showToast('Adicione pelo menos um componente válido ao KIT.', 'warning');
                return;
            }
        }

        // Tenta salvar via DataClient no Supabase se houver conta válida e backend pronto
        let salvouReal = false;
        try {
            const accId = anuncio.account_id;
            if (window.DataClient?.saveMercadoLivreItemMappingTransacional && Number(accId) > 0) {
                const res = await window.DataClient.saveMercadoLivreItemMappingTransacional({
                    itemId: anuncio.external_item_id || anuncio.id,
                    variationId: AnunciosState.activeVariationId,
                    tipoIdentificacao: mode,
                    componentes: componentesFinal.map(c => ({ produto_id: c.id_interno, quantidade: c.quantidade })),
                    accountId: accId
                });
                if (res) salvouReal = true;
            }
        } catch (err) {
            console.warn('[ANUNCIOS_MAPPING] Gravação no banco não realizada:', err?.message || err);
        }

        if (salvouReal) {
            anuncio.situacao_mapeamento = 'MAPEADO';
            anuncio.mapping = {
                tipo_identificacao: mode,
                versao: ((anuncio.mapping?.versao || 0) + 1),
                componentes: componentesFinal
            };
            if (document.getElementById('an-mapping-modal-overlay')) {
                document.getElementById('an-mapping-modal-overlay').remove();
            }
            renderAnunciosList();
            if (typeof showToast === 'function') {
                showToast('Mapeamento salvo com sucesso no banco de dados.', 'success');
            }
        } else {
            // Em modo de preview/visualização sem infraestrutura real no Supabase:
            // NÃO altera estado de mapeamento, NÃO altera contadores, NÃO simula sucesso.
            if (typeof showToast === 'function') {
                showToast('Modo de visualização: o mapeamento ainda não está habilitado neste ambiente.', 'info');
            }
        }
    };

    // =========================================================================
    // GERENCIADOR DE GRUPOS DE EQUIVALÊNCIA
    // =========================================================================
    window.anOpenEquivalenciaManagerModal = async function () {
        let modalEl = document.getElementById('an-eq-manager-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'an-eq-manager-modal';
            modalEl.className = 'an-modal-overlay';
            document.body.appendChild(modalEl);
        }

        let grupos = [];
        try {
            if (window.DataClient?.listGruposEquivalencia) {
                grupos = await window.DataClient.listGruposEquivalencia(true);
            }
        } catch (e) {
            console.warn('[ANUNCIOS_MAPPING] Grupos de equivalência via banco não disponíveis (Modo Preview).', e);
        }

        modalEl.innerHTML = `
            <div class="an-modal" style="max-width:850px;">
                <div class="an-modal-header">
                    <div>
                        <h2>Gerenciador de Grupos de Equivalência</h2>
                        <small style="color:#64748b;">Agrupe SKUs intercambiáveis que compartilham o mesmo saldo físico de estoque.</small>
                    </div>
                    <button type="button" class="an-modal-close" onclick="document.getElementById('an-eq-manager-modal').remove()">&times;</button>
                </div>

                <div class="an-modal-body">
                    <div class="an-eq-manager-grid">
                        <div class="an-eq-list-pane">
                            <h4 style="margin:0 0 8px;font-size:14px;color:#0f172a;">Grupos Existentes (${grupos.length})</h4>
                            <div class="an-eq-groups-list">
                                ${grupos.length ? grupos.map(g => `
                                    <div class="an-eq-group-card">
                                        <strong>${escapeHtml(g.nome || g.codigo_grupo)}</strong>
                                        <small>Código: ${escapeHtml(g.codigo_grupo)}</small>
                                    </div>
                                `).join('') : '<p style="color:#94a3b8;font-size:12px;padding:12px;">Nenhum grupo de equivalência cadastrado no banco.</p>'}
                            </div>
                        </div>

                        <div class="an-eq-create-pane">
                            <h4 style="margin:0 0 8px;font-size:14px;color:#0f172a;">Criar Novo Grupo</h4>
                            <div class="an-form-group">
                                <label style="font-size:12px;">Código do Grupo:</label>
                                <input type="text" id="an-eq-new-code" class="an-input" placeholder="Ex: EQ-LAMP-H7-55W">
                            </div>
                            <div class="an-form-group" style="margin-top:8px;">
                                <label style="font-size:12px;">Nome Descritivo:</label>
                                <input type="text" id="an-eq-new-name" class="an-input" placeholder="Ex: Lâmpadas H7 12V 55W Super Branca">
                            </div>
                            <button type="button" class="an-btn-primary" style="margin-top:12px;width:100%;" onclick="window.anSalvarNovoGrupoEquivalencia()">
                                <span class="material-symbols-rounded">add_circle</span> Cadastrar Grupo
                            </button>
                        </div>
                    </div>
                </div>

                <div class="an-modal-footer">
                    <button type="button" class="an-btn-secondary" onclick="document.getElementById('an-eq-manager-modal').remove()">Fechar</button>
                </div>
            </div>
        `;
        modalEl.style.display = 'flex';
    };

    window.anSalvarNovoGrupoEquivalencia = async function () {
        const code = (document.getElementById('an-eq-new-code')?.value || '').trim();
        const name = (document.getElementById('an-eq-new-name')?.value || '').trim();

        if (!code || !name) {
            if (typeof showToast === 'function') showToast('Preencha o código e o nome do grupo.', 'warning');
            return;
        }

        let salvou = false;
        try {
            if (window.DataClient?.createGrupoEquivalencia) {
                await window.DataClient.createGrupoEquivalencia({ codigo_grupo: code, name: name });
                salvou = true;
                if (typeof showToast === 'function') showToast('Grupo de equivalência criado com sucesso!', 'success');
                window.anOpenEquivalenciaManagerModal();
            }
        } catch (err) {
            console.warn('[ANUNCIOS_MAPPING] Erro ao criar grupo de equivalência:', err?.message || err);
        }

        if (!salvou) {
            if (typeof showToast === 'function') showToast('Modo de visualização: o mapeamento ainda não está habilitado neste ambiente.', 'info');
        }
    };

    // =========================================================================
    // INICIALIZAÇÃO DA TELA DE ANÚNCIOS
    // =========================================================================
    window.renderAnunciosScreen = async function () {
        const app = document.getElementById('app');
        if (!app) return;

        await carregarProdutosCatalogo();

        app.innerHTML = `
            <div class="dashboard-screen internal module-screen an-screen">
                <div class="an-module-topbar">
                    <div>
                        <button type="button" class="back-button-standard" onclick="renderMenu()" title="Voltar ao Menu">
                            <span class="material-symbols-rounded">arrow_back</span>
                        </button>
                        <h1>Gestão e Mapeamento de Anúncios</h1>
                    </div>
                </div>

                <main class="container an-shell">
                    <div class="an-summary">
                        <button type="button" class="tab-todos active" id="tab-todos" onclick="window.anSetFilter('todos')">
                            <span class="material-symbols-rounded" style="background:#eff6ff;color:#2563eb;">storefront</span>
                            <strong id="an-count-todos">0</strong>
                            <small>Todos os Anúncios</small>
                        </button>
                        <button type="button" class="tab-nao-mapeados" id="tab-nao-mapeados" onclick="window.anSetFilter('nao_mapeados')">
                            <span class="material-symbols-rounded" style="background:#fff7ed;color:#ea580c;">link_off</span>
                            <strong id="an-count-nao-mapeados">0</strong>
                            <small>Não Mapeados</small>
                        </button>
                        <button type="button" class="tab-mapeados" id="tab-mapeados" onclick="window.anSetFilter('mapeados')">
                            <span class="material-symbols-rounded" style="background:#f0fdf4;color:#16a34a;">task_alt</span>
                            <strong id="an-count-mapeados">0</strong>
                            <small>Mapeados</small>
                        </button>
                        <button type="button" class="tab-revisar" id="tab-revisar" onclick="window.anSetFilter('revisar')">
                            <span class="material-symbols-rounded" style="background:#fef2f2;color:#dc2626;">search_hands_free</span>
                            <strong id="an-count-revisar">0</strong>
                            <small>Em Revisão</small>
                        </button>
                    </div>

                    <div class="an-panel">
                        <div class="an-panel-header">
                            <div class="an-panel-title">
                                <h2>Catálogo de Anúncios Conectados</h2>
                                <small>Filtre, pesquise e vincule seus anúncios aos produtos mestres ou grupos de equivalência.</small>
                            </div>
                            <div class="an-controls">
                                <div class="an-search">
                                    <span class="material-symbols-rounded">search</span>
                                    <input type="text" id="an-search-input" placeholder="Buscar por título, SKU, MLB, produto..." oninput="window.anOnSearchChange(this.value)">
                                </div>
                                <select id="an-account-select" class="an-account-select" onchange="window.anOnAccountChange(this.value)">
                                    <option value="todas">Todas as Contas</option>
                                    ${accountOptions()}
                                </select>
                            </div>
                        </div>

                        <div id="an-list-container" class="an-list">
                            <!-- Cards renderizados dinamicamente -->
                        </div>
                    </div>
                </main>
            </div>
        `;

        renderAnunciosList();
    };

    window.anSetFilter = function (filterType) {
        AnunciosState.filter = filterType;
        document.querySelectorAll('.an-summary button').forEach(btn => btn.classList.remove('active'));
        const btn = document.getElementById(`tab-${filterType.replace('_', '-')}`);
        if (btn) btn.classList.add('active');
        renderAnunciosList();
    };

    window.anOnSearchChange = function (val) {
        AnunciosState.search = val;
        renderAnunciosList();
    };

    window.anOnAccountChange = function (val) {
        AnunciosState.accountFilter = val;
        renderAnunciosList();
    };

})();
