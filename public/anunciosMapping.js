(function () {
    window.__anunciosMappingLoaded = true;

    // Catálogo de produtos internos (integrado com tabela public.produtos via UUID)
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

    // Estado do Módulo de Anúncios (Conectado ao Catálogo Real do Supabase)
    const AnunciosState = {
        filter: 'todos', // 'todos' | 'nao_mapeados' | 'mapeados' | 'revisar'
        search: '',
        accountFilter: 'todas',
        marketplaceFilter: 'todos', // 'todos' | 'mercadolibre' | 'shopee'
        statusFilter: 'todos', // 'todos' | 'active' | 'paused' | 'under_review'
        page: 1,
        pageSize: 50,
        totalCount: 0,
        totalPages: 1,
        loading: false,
        error: null,
        contasCache: [],
        searchDebounceTimer: null,
        summaryCounts: {
            total: 0,
            unmapped: 0,
            mapped: 0,
            review: 0
        },
        activeAnuncioId: null,
        activeVariationId: null,
        modalMode: 'equivalents', // 'equivalents' | 'kit'
        modalSearch: '',
        modalAcceptedProducts: [], // array de produtos equivalentes
        modalKitComponents: [],    // array de { product, qty }
        anuncios: []
    };

    // Helpers de Normalização e Sanitização (Declaração Hoisted para Evitar TDZ ReferenceError)
    function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function normText(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
    function hasValue(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }
    function accountKey(an) { return hasValue(an?.account_id) ? `id:${an.account_id}` : hasValue(an?.account_externo_id) ? `external:${an.account_externo_id}` : hasValue(an?.seller_externo_id) ? `seller:${an.seller_externo_id}` : ''; }
    function sellerLabel(an) { return an?.seller_nome || an?.account_externo_id || an?.seller_externo_id || ''; }
    function validPrice(v) { return hasValue(v) && Number.isFinite(Number(v)); }
    function money(v, moeda) { try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(Number(v)); } catch (_) { return Number(v).toFixed(2); } }
    function priceHTML(an) {
        if (!an) return '';
        const promo = validPrice(an.preco_promocional), value = promo ? an.preco_promocional : an.preco_venda;
        if (validPrice(value)) {
            return `<div style="margin-top:6px"><strong style="font-size:18px">${escapeHtml(money(value, an.moeda))}</strong>${promo && validPrice(an.preco_original) ? ` <small style="text-decoration:line-through;color:#64748b">${escapeHtml(money(an.preco_original, an.moeda))}</small>` : ''}</div>`;
        }
        if (validPrice(an.ultimo_preco_venda)) {
            return `<div style="margin-top:6px;font-size:13px;color:#64748b;"><span>Último preço vendido: </span><strong style="color:#0f172a;font-size:15px;">${escapeHtml(money(an.ultimo_preco_venda, an.moeda))}</strong></div>`;
        }
        return '';
    }

    function accountOptions() {
        let contas = AnunciosState.contasCache || [];
        if (AnunciosState.marketplaceFilter && AnunciosState.marketplaceFilter !== 'todos') {
            contas = contas.filter(c => c.platform === AnunciosState.marketplaceFilter);
        }
        return contas.map(c => {
            const key = `id:${c.id}`;
            const label = c.nome_operacional || c.nickname || `Conta ${c.id}`;
            return `<option value="${escapeHtml(key)}" ${AnunciosState.accountFilter === key ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
    }

    // Carregamento das Contas Sincronizadas do Supabase
    async function carregarContasCatalogo() {
        if (AnunciosState.contasCache && AnunciosState.contasCache.length > 0) {
            return AnunciosState.contasCache;
        }
        const client = window.supabaseClient;
        if (!client) return [];
        try {
            const { data, error } = await client
                .from('mercadolivre_accounts')
                .select('id, platform, source_account_id, nickname, nome_operacional')
                .not('platform', 'is', null)
                .not('source_account_id', 'is', null)
                .order('nome_operacional', { ascending: true });
            if (!error && Array.isArray(data)) {
                AnunciosState.contasCache = data;
                return data;
            }
        } catch (err) {
            console.warn('[ANUNCIOS_MAPPING] Falha ao carregar contas do catálogo:', err);
        }
        return [];
    }

    // Contadores Globais dos Cards de Resumo (Lightweight Head Requests)
    async function carregarContadoresResumoGlobais() {
        const client = window.supabaseClient;
        if (!client) return;
        try {
            const { count: totalCat } = await client
                .from('marketplace_anuncios_catalogo')
                .select('*', { count: 'exact', head: true })
                .eq('ausente_na_origem', false);

            const { count: totalMap } = await client
                .from('mercadolivre_item_mappings')
                .select('*', { count: 'exact', head: true })
                .eq('ativo', true);

            const total = typeof totalCat === 'number' ? totalCat : 20000;
            const mapped = typeof totalMap === 'number' ? totalMap : 0;
            const unmapped = Math.max(0, total - mapped);
            const review = 0;

            AnunciosState.summaryCounts = {
                total,
                unmapped,
                mapped,
                review
            };

            atualizarContadoresResumo();
        } catch (err) {
            console.warn('[ANUNCIOS_MAPPING] Erro ao carregar contadores globais:', err);
        }
    }

    // Carregamento Paginado e Filtrado do Catálogo Real no Supabase
    async function carregarCatalogoAnuncios(page = 1) {
        const client = window.supabaseClient;
        if (!client) {
            AnunciosState.error = 'Cliente Supabase não inicializado.';
            renderAnunciosCardsUI();
            return;
        }

        AnunciosState.page = Math.max(1, page);
        AnunciosState.loading = true;
        AnunciosState.error = null;
        renderAnunciosCardsUI();

        try {
            await carregarContasCatalogo();
            const contasMap = new Map();
            (AnunciosState.contasCache || []).forEach(c => {
                contasMap.set(Number(c.id), c);
                if (c.source_account_id) contasMap.set(String(c.source_account_id).trim(), c);
            });

            let query = client
                .from('marketplace_anuncios_catalogo')
                .select('id, marketplace, source_account_id, account_id, item_id, title, price, available_quantity, status, seller_sku, thumbnail, permalink, has_variations, variations_data, last_updated_sql', { count: 'exact' })
                .eq('ausente_na_origem', false);

            // Filtro por Marketplace
            if (AnunciosState.marketplaceFilter && AnunciosState.marketplaceFilter !== 'todos') {
                query = query.eq('marketplace', AnunciosState.marketplaceFilter);
            }

            // Filtro por Conta
            if (AnunciosState.accountFilter && AnunciosState.accountFilter !== 'todas') {
                if (AnunciosState.accountFilter.startsWith('id:')) {
                    const accId = Number(AnunciosState.accountFilter.replace('id:', ''));
                    if (accId) query = query.eq('account_id', accId);
                } else if (AnunciosState.accountFilter.startsWith('source:') || AnunciosState.accountFilter.startsWith('external:') || AnunciosState.accountFilter.startsWith('seller:')) {
                    const srcId = AnunciosState.accountFilter.split(':')[1];
                    if (srcId) query = query.eq('source_account_id', srcId);
                }
            }

            // Filtro por Status
            if (AnunciosState.statusFilter && AnunciosState.statusFilter !== 'todos') {
                query = query.eq('status', AnunciosState.statusFilter);
            }

            // Busca Textual Server-Side
            const q = String(AnunciosState.search || '').trim();
            if (q) {
                const term = q.replace(/[%_,]/g, ' ');
                query = query.or(`title.ilike.%${term}%,item_id.ilike.%${term}%,seller_sku.ilike.%${term}%`);
            }

            // Ordenação Determinística Estável
            query = query
                .order('marketplace', { ascending: true })
                .order('source_account_id', { ascending: true })
                .order('item_id', { ascending: true });

            // Paginação Server-Side (PAGE_SIZE: 50)
            const offset = (AnunciosState.page - 1) * AnunciosState.pageSize;
            query = query.range(offset, offset + AnunciosState.pageSize - 1);

            const { data: rows, count, error } = await query;
            if (error) throw error;

            AnunciosState.totalCount = typeof count === 'number' ? count : (rows?.length || 0);
            AnunciosState.totalPages = Math.max(1, Math.ceil(AnunciosState.totalCount / AnunciosState.pageSize));

            const pageRows = Array.isArray(rows) ? rows : [];

            // Normalização dos registros para o formato da UI
            const normalizedAnuncios = pageRows.map(row => {
                const conta = contasMap.get(Number(row.account_id)) || contasMap.get(String(row.source_account_id).trim());
                const sellerNome = conta ? (conta.nome_operacional || conta.nickname) : row.source_account_id;
                const mpUpper = row.marketplace === 'mercadolibre' ? 'MERCADO_LIVRE' : (row.marketplace === 'shopee' ? 'SHOPEE' : String(row.marketplace).toUpperCase());
                const rawVars = Array.isArray(row.variations_data) ? row.variations_data : [];

                return {
                    id: String(row.item_id),
                    catalog_id: row.id,
                    marketplace: mpUpper,
                    account_id: Number(row.account_id),
                    source_account_id: String(row.source_account_id),
                    account_externo_id: String(row.source_account_id),
                    seller_nome: sellerNome,
                    seller_externo_id: String(row.source_account_id),
                    external_item_id: String(row.item_id),
                    variation_id: null,
                    variation_key: null,
                    seller_sku: row.seller_sku || null,
                    titulo: row.title || 'Sem título',
                    thumbnail_url: row.thumbnail || '/assets/images/placeholder.webp',
                    permalink: row.permalink || null,
                    marketplace_status: String(row.status || 'ACTIVE').toUpperCase(),
                    preco_venda: row.price !== null && row.price !== undefined ? Number(row.price) : null,
                    preco_original: null,
                    preco_promocional: null,
                    ultimo_preco_venda: null,
                    moeda: 'BRL',
                    situacao_mapeamento: 'NAO_MAPEADO',
                    mapping_id: null,
                    mapping_versao: null,
                    tipo_mapeamento: null,
                    mapping_resumo: null,
                    ultima_sincronizacao: row.last_updated_sql ? new Date(row.last_updated_sql).toLocaleDateString('pt-BR') : '',
                    payload_original: null,
                    has_variations: Boolean(row.has_variations),
                    variations: rawVars.map(v => ({
                        variation_id: v.variation_id ? String(v.variation_id) : null,
                        variation_key: v.variation_key || (v.variation_id ? `id:${v.variation_id}` : null),
                        attribute: v.attribute || 'Variação',
                        seller_sku: v.seller_sku || null,
                        price: v.price !== null && v.price !== undefined ? Number(v.price) : null,
                        available_quantity: v.available_quantity || 0,
                        situacao_mapeamento: 'NAO_MAPEADO',
                        mapping: null
                    })),
                    mapping: null
                };
            });

            // Carregamento de Mappings em Lote da Página (Zero N+1)
            if (normalizedAnuncios.length > 0) {
                const pageItemIds = normalizedAnuncios.map(a => a.external_item_id);
                try {
                    const { data: mappingsData, error: mapErr } = await client
                        .from('mercadolivre_item_mappings')
                        .select(`
                            *,
                            mercadolivre_item_mapping_versions!mercadolivre_item_mappings_current_version_fkey(
                                *,
                                mercadolivre_item_mapping_componentes(
                                    *,
                                    produtos:produto_id(*),
                                    grupos_equivalencia:grupo_equivalencia_id(*, grupo_equivalencia_skus(*, produtos(*))),
                                    produto_referencia:produto_referencia_id(*)
                                )
                            )
                        `)
                        .in('item_id', pageItemIds)
                        .eq('ativo', true);

                    if (!mapErr && Array.isArray(mappingsData) && mappingsData.length > 0) {
                        for (const mapRecord of mappingsData) {
                            if (!mapRecord.ativo || !mapRecord.current_version_id) continue;
                            const versao = mapRecord.mercadolivre_item_mapping_versions;
                            if (!versao) continue;
                            const componentes = versao.mercadolivre_item_mapping_componentes || [];
                            if (!componentes.length) continue;

                            const targetAnuncio = normalizedAnuncios.find(a =>
                                Number(a.account_id) === Number(mapRecord.mercadolivre_account_id) &&
                                String(a.external_item_id) === String(mapRecord.item_id)
                            );
                            if (!targetAnuncio) continue;

                            const mappedProducts = componentes.map(c => {
                                const p = c.produtos || c.produto_referencia || {};
                                return {
                                    id: p.id || c.produto_id,
                                    id_interno: p.id_interno || 'DY-???',
                                    nome: p.descricao_completa || p.nome || p.id_interno || 'Produto',
                                    marca: p.marca || '-',
                                    ean: p.ean || '-',
                                    sku_fornecedor: p.sku_fornecedor || '-'
                                };
                            });

                            const uiMapping = {
                                type: versao.tipo_identificacao === 'kit' ? 'kit' : (mappedProducts.length > 1 ? 'equivalents' : 'single'),
                                products: mappedProducts,
                                components: componentes.map(c => ({
                                    product: mappedProducts.find(mp => mp.id === c.produto_id) || mappedProducts[0],
                                    qty: c.quantidade_por_unidade || 1
                                }))
                            };

                            const targetVarKey = mapRecord.variation_key || '__SEM_VARIACAO__';

                            if (targetAnuncio.has_variations && Array.isArray(targetAnuncio.variations)) {
                                const targetVar = targetAnuncio.variations.find(v =>
                                    (hasValue(v.variation_id) && String(v.variation_id) === String(mapRecord.variation_id)) ||
                                    (hasValue(v.variation_key) && String(v.variation_key) === targetVarKey)
                                );
                                if (targetVar) {
                                    targetVar.mapping = uiMapping;
                                    targetVar.situacao_mapeamento = 'MAPEADO';
                                }
                                const allMapped = targetAnuncio.variations.every(v => v.situacao_mapeamento === 'MAPEADO');
                                targetAnuncio.situacao_mapeamento = allMapped ? 'MAPEADO' : 'PARCIAL';
                            } else {
                                if (targetVarKey === '__SEM_VARIACAO__' || !targetAnuncio.variation_key || targetAnuncio.variation_key === targetVarKey) {
                                    targetAnuncio.mapping = uiMapping;
                                    targetAnuncio.situacao_mapeamento = 'MAPEADO';
                                    targetAnuncio.mapping_id = mapRecord.id;
                                    targetAnuncio.mapping_versao = versao.versao;
                                }
                            }
                        }
                    }
                } catch (mapLoadErr) {
                    console.warn('[ANUNCIOS_MAPPING] Falha ao hidratar mappings da página:', mapLoadErr);
                }
            }

            AnunciosState.anuncios = normalizedAnuncios;
            AnunciosState.loading = false;
            AnunciosState.error = null;

        } catch (err) {
            console.error('[ANUNCIOS_MAPPING] Erro ao carregar catálogo de anúncios:', err);
            AnunciosState.loading = false;
            AnunciosState.error = err.message || 'Erro ao consultar catálogo do Supabase.';
            AnunciosState.anuncios = [];
        }

        renderAnunciosCardsUI();
    }

    // Estado do Mapeamento em Massa (Fase 1 - Seleção Explícita)
    window.AnunciosMassSelectionState = {
        selectedKeys: new Set(),
        selectedItems: new Map(),
        batchAccountId: null
    };

    function getMassSelectionKey(accountId, itemId, variationKey) {
        const acc = Number(accountId);
        const item = String(itemId || '').trim();
        const varKey = (variationKey && String(variationKey).trim()) ? String(variationKey).trim() : '__SEM_VARIACAO__';
        return `${acc}:${item}:${varKey}`;
    }

    function createMassSelectionItemPayload(anuncio, variation = null) {
        const accId = Number(anuncio.account_id);
        const itemId = String(anuncio.external_item_id || anuncio.id).trim();
        const varId = variation?.variation_id ? String(variation.variation_id).trim() : (anuncio.variation_id ? String(anuncio.variation_id).trim() : null);
        const varKey = variation?.variation_key ? String(variation.variation_key).trim() : (anuncio.variation_key ? String(anuncio.variation_key).trim() : '__SEM_VARIACAO__');

        return {
            accountId: accId,
            sourceAccountId: anuncio.source_account_id,
            marketplace: anuncio.marketplace || 'MERCADO_LIVRE',
            itemId: itemId,
            variationId: varId,
            variationKey: varKey,
            sellerSku: variation?.seller_sku || anuncio.seller_sku || null,
            titulo: anuncio.titulo,
            thumbnailUrl: anuncio.thumbnail_url,
            mapping: variation ? variation.mapping : anuncio.mapping,
            situacao_mapeamento: variation ? variation.situacao_mapeamento : anuncio.situacao_mapeamento,
            anuncioRef: anuncio,
            variationRef: variation
        };
    }

    function getAnuncioItemKey(anuncio, variation = null) {
        const payload = createMassSelectionItemPayload(anuncio, variation);
        return getMassSelectionKey(payload.accountId, payload.itemId, payload.variationKey);
    }

    window.anToggleItemSelection = function (itemPayload, forceChecked = null, skipUIUpdate = false) {
        const state = window.AnunciosMassSelectionState;
        const key = getMassSelectionKey(itemPayload.accountId, itemPayload.itemId, itemPayload.variationKey);
        const isSelected = state.selectedKeys.has(key);
        const shouldSelect = forceChecked !== null ? Boolean(forceChecked) : !isSelected;

        if (shouldSelect) {
            if (itemPayload.marketplace === 'SHOPEE' || itemPayload.situacao_mapeamento === 'MAPPING_NAO_HABILITADO') {
                if (!skipUIUpdate && typeof showToast === 'function') {
                    showToast('O mapeamento em massa está disponível somente para Mercado Livre nesta etapa.', 'warning');
                }
                return false;
            }

            const accIdNum = Number(itemPayload.accountId);
            if (!Number.isInteger(accIdNum) || accIdNum <= 0) {
                if (!skipUIUpdate && typeof showToast === 'function') {
                    showToast('Conta operacional ainda não vinculada a este anúncio.', 'warning');
                }
                return false;
            }

            if (state.batchAccountId !== null && Number(state.batchAccountId) !== accIdNum) {
                if (!skipUIUpdate && typeof showToast === 'function') {
                    showToast('Para segurança, o mapeamento em massa desta etapa deve conter anúncios da mesma conta.', 'warning');
                }
                return false;
            }

            if (!isSelected && state.selectedItems.size >= 50) {
                if (!skipUIUpdate && typeof showToast === 'function') {
                    showToast('Esta versão inicial aceita no máximo 50 unidades por operação em massa.', 'warning');
                }
                return false;
            }

            state.selectedKeys.add(key);
            state.selectedItems.set(key, itemPayload);
            state.batchAccountId = accIdNum;
        } else {
            state.selectedKeys.delete(key);
            state.selectedItems.delete(key);
            if (state.selectedKeys.size === 0) {
                state.batchAccountId = null;
            }
        }

        if (!skipUIUpdate) {
            anUpdateMassSelectionUI();
        }
        return true;
    };

    window.anToggleCardSelection = function (event, anuncioId) {
        const anuncio = AnunciosState.anuncios.find(a => a.id === anuncioId);
        if (!anuncio) return;

        const isChecked = event?.target ? event.target.checked : true;

        if (anuncio.has_variations && Array.isArray(anuncio.variations) && anuncio.variations.length > 0) {
            for (const v of anuncio.variations) {
                const payload = createMassSelectionItemPayload(anuncio, v);
                const ok = window.anToggleItemSelection(payload, isChecked, true);
                if (!ok && isChecked) break;
            }
        } else {
            const payload = createMassSelectionItemPayload(anuncio, null);
            window.anToggleItemSelection(payload, isChecked, true);
        }

        anUpdateMassSelectionUI();
    };

    window.anToggleVariationSelection = function (anuncioId, variationRefStr, checked) {
        const anuncio = AnunciosState.anuncios.find(a => a.id === anuncioId);
        if (!anuncio) return;
        const v = findVariationByRef(anuncio, variationRefStr);
        if (!v) return;

        const payload = createMassSelectionItemPayload(anuncio, v);
        window.anToggleItemSelection(payload, checked, false);
    };

    window.anSelectVisibleItems = function () {
        const visible = getFilteredAnuncios();
        let targetAccountId = window.AnunciosMassSelectionState.batchAccountId;

        if (!targetAccountId) {
            const firstMeli = visible.find(a => a.marketplace === 'MERCADO_LIVRE' && hasValue(a.account_id));
            if (firstMeli) {
                targetAccountId = Number(firstMeli.account_id);
            }
        }

        if (!targetAccountId) {
            if (typeof showToast === 'function') {
                showToast('Nenhum anúncio Mercado Livre elegível na página para seleção.', 'warning');
            }
            return;
        }

        let added = 0;
        for (const an of visible) {
            if (an.marketplace !== 'MERCADO_LIVRE') continue;
            if (Number(an.account_id) !== targetAccountId) continue;

            if (an.has_variations && Array.isArray(an.variations) && an.variations.length > 0) {
                for (const v of an.variations) {
                    const p = createMassSelectionItemPayload(an, v);
                    const ok = window.anToggleItemSelection(p, true, true);
                    if (ok) added++;
                }
            } else {
                const p = createMassSelectionItemPayload(an, null);
                const ok = window.anToggleItemSelection(p, true, true);
                if (ok) added++;
            }
        }

        anUpdateMassSelectionUI();
        if (typeof showToast === 'function') {
            showToast(`${window.AnunciosMassSelectionState.selectedKeys.size} itens selecionados para mapeamento.`, 'info');
        }
    };

    window.anClearMassSelection = function () {
        window.AnunciosMassSelectionState.selectedKeys.clear();
        window.AnunciosMassSelectionState.selectedItems.clear();
        window.AnunciosMassSelectionState.batchAccountId = null;
        anUpdateMassSelectionUI();
    };

    function renderMassActionBarHTML() {
        const state = window.AnunciosMassSelectionState;
        const count = state.selectedKeys.size;
        if (count === 0) return '';

        return `
            <div class="an-mass-action-bar fade-in">
                <div class="an-mass-action-info">
                    <span class="material-symbols-rounded">checklist</span>
                    <strong>${count} ${count === 1 ? 'item selecionado' : 'itens selecionados'}</strong>
                    <small>Conta ID: ${escapeHtml(state.batchAccountId)} (Mercado Livre)</small>
                </div>
                <div class="an-mass-action-buttons">
                    <button type="button" class="an-btn-mass-outline" onclick="anSelectVisibleItems()">
                        Selecionar página
                    </button>
                    <button type="button" class="an-btn-mass-text" onclick="anClearMassSelection()">
                        Limpar seleção
                    </button>
                    <button type="button" class="an-btn-mass-primary" onclick="anStartMassMappingFlow()">
                        <span class="material-symbols-rounded">alt_route</span>
                        Mapear Selecionados (${count})
                    </button>
                </div>
            </div>
        `;
    }

    function anUpdateMassSelectionUI() {
        const container = document.getElementById('an-mass-action-bar-container');
        if (container) {
            container.innerHTML = renderMassActionBarHTML();
        }

        const massState = window.AnunciosMassSelectionState;
        const cards = document.querySelectorAll('.an-card');

        cards.forEach(card => {
            const anId = card.getAttribute('data-anuncio-id');
            const an = AnunciosState.anuncios.find(a => a.id === anId);
            if (!an) return;

            const chk = card.querySelector('.an-card-checkbox');
            if (chk) {
                if (an.has_variations && Array.isArray(an.variations) && an.variations.length > 0) {
                    let selCount = 0;
                    for (const v of an.variations) {
                        const k = getAnuncioItemKey(an, v);
                        if (massState.selectedKeys.has(k)) selCount++;
                    }
                    chk.checked = selCount === an.variations.length && selCount > 0;
                    chk.indeterminate = selCount > 0 && selCount < an.variations.length;
                } else {
                    const k = getAnuncioItemKey(an, null);
                    chk.checked = massState.selectedKeys.has(k);
                    chk.indeterminate = false;
                }
            }
        });
    }

    window.anStartMassMappingFlow = function () {
        const state = window.AnunciosMassSelectionState;
        if (state.selectedItems.size === 0) return;

        const items = Array.from(state.selectedItems.values());
        const firstItem = items[0];

        window.openSharedItemMappingModal({
            marketplace: 'MERCADO_LIVRE',
            accountId: state.batchAccountId,
            sourceAccountId: firstItem.sourceAccountId,
            itemId: firstItem.itemId,
            variationId: null,
            sellerSku: null,
            titulo: `Mapeamento em Lote (${items.length} itens da conta ${state.batchAccountId})`,
            thumbnailUrl: firstItem.thumbnailUrl,
            initialMapping: null,
            isBatchMode: true,
            batchItems: items,
            onSaved: async ({ tipoIdentificacao, componentesPayload, chosenUiMapping }) => {
                await anExecuteBatchMappingPersistence({
                    items,
                    accountId: state.batchAccountId,
                    tipoIdentificacao,
                    componentesPayload,
                    chosenUiMapping
                });
            }
        });
    };

    // Filtros de Listagem da Página
    function getFilteredAnuncios() {
        if (AnunciosState.filter === 'todos') return AnunciosState.anuncios;
        return AnunciosState.anuncios.filter(an => {
            if (AnunciosState.filter === 'nao_mapeados') {
                return an.situacao_mapeamento !== 'MAPEADO';
            } else if (AnunciosState.filter === 'mapeados') {
                return an.situacao_mapeamento === 'MAPEADO';
            } else if (AnunciosState.filter === 'revisar') {
                return an.situacao_mapeamento === 'REVISAR';
            }
            return true;
        });
    }

    // Renderização do Bloco de Mapeamento no Card do Anúncio
    function renderMappingSummary(anuncio) {
        if (anuncio.has_variations) {
            const mappedCount = anuncio.variations.filter(v => v.situacao_mapeamento === 'MAPEADO').length;
            const totalCount = anuncio.variations.length;
            const isFull = mappedCount === totalCount;

            return `
                <div class="an-mapping-badge ${isFull ? 'mapped' : 'unmapped'}">
                    <div class="an-mapping-info">
                        <div class="an-mapping-info-header">
                            <strong>${isFull ? 'Variações Mapeadas' : 'Variações Parcialmente Mapeadas'}</strong>
                            <span class="an-variations-badge">${mappedCount} de ${totalCount} mapeadas</span>
                        </div>
                    </div>
                </div>
            `;
        }

        if (anuncio.situacao_mapeamento === 'NAO_MAPEADO' || !anuncio.mapping) {
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

        if (anuncio.situacao_mapeamento === 'REVISAR') {
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
            const compCount = Number(anuncio.mapping_resumo?.quantidade_componentes) || anuncio.mapping.components?.length || 0;
            return `
                <div class="an-mapping-badge kit">
                    <span class="material-symbols-rounded">view_in_ar</span>
                    <div class="an-mapping-info">
                        <div class="an-mapping-info-header">
                            <strong>KIT</strong>
                            <span class="an-equivalents-tag">${compCount} componentes</span>
                        </div>
                    </div>
                </div>
            `;
        }

        if (anuncio.mapping.type === 'equivalents' || anuncio.tipo_mapeamento === 'EQUIVALENCIA') {
            const groupName = anuncio.mapping_resumo?.grupo_equivalencia?.nome || 'Grupo de equivalência';
            const optionCount = anuncio.mapping_resumo?.quantidade_opcoes_equivalentes ?? anuncio.mapping_resumo?.quantidade_produtos_permitidos ?? anuncio.mapping.products?.length ?? 0;
            return `<div class="an-mapping-badge mapped"><span class="material-symbols-rounded">alt_route</span><div class="an-mapping-info"><div class="an-mapping-info-header"><strong>EQUIVALÊNCIA</strong><span class="an-equivalents-tag">${escapeHtml(optionCount)} opções equivalentes</span></div><small>${escapeHtml(groupName)}</small></div></div>`;
        }

        // Produto único
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

    const ACCOUNT_COLOR_THEMES = [
        { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', icon: '#2563eb' }, // Blue
        { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', icon: '#16a34a' }, // Emerald
        { bg: '#faf5ff', border: '#e9d5ff', text: '#6b21a8', icon: '#9333ea' }, // Purple
        { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412', icon: '#ea580c' }, // Amber
        { bg: '#fdf2f8', border: '#fbcfe8', text: '#9d174d', icon: '#db2777' }, // Rose
        { bg: '#f0fdfa', border: '#99f6e4', text: '#115e59', icon: '#0d9488' }  // Teal
    ];

    function getAccountColorTheme(anuncio) {
        const rawId = anuncio?.account_id || anuncio?.source_account_id || anuncio?.seller_externo_id || '1';
        let strKey = String(rawId).trim();
        let hash = 0;
        for (let i = 0; i < strKey.length; i++) {
            hash = (hash << 5) - hash + strKey.charCodeAt(i);
            hash |= 0;
        }
        const index = Math.abs(hash) % ACCOUNT_COLOR_THEMES.length;
        return ACCOUNT_COLOR_THEMES[index];
    }

    function renderSellerBadge(anuncio) {
        const label = sellerLabel(anuncio);
        if (!label) return '';
        const theme = getAccountColorTheme(anuncio);
        return `
            <div class="an-card-seller-badge" style="background:${theme.bg}; border-color:${theme.border}; color:${theme.text};" title="Conta / Seller">
                <span>${escapeHtml(label)}</span>
            </div>
        `;
    }

    // Barra de Paginação Server-Side
    function renderPaginationHTML() {
        if (AnunciosState.totalCount <= 0) return '';
        const startItem = (AnunciosState.page - 1) * AnunciosState.pageSize + 1;
        const endItem = Math.min(AnunciosState.totalCount, AnunciosState.page * AnunciosState.pageSize);
        const hasPrev = AnunciosState.page > 1;
        const hasNext = AnunciosState.page < AnunciosState.totalPages;

        return `
            <div class="an-pagination">
                <div class="an-pagination-info">
                    Exibindo <strong>${startItem}</strong> a <strong>${endItem}</strong> de <strong>${AnunciosState.totalCount.toLocaleString('pt-BR')}</strong> anúncios
                </div>
                <div class="an-pagination-controls">
                    <button type="button" class="an-pagination-btn" ${!hasPrev || AnunciosState.loading ? 'disabled' : ''} onclick="anGoToPage(${AnunciosState.page - 1})">
                        <span class="material-symbols-rounded">chevron_left</span>
                        Anterior
                    </button>
                    <span class="an-pagination-page-indicator">
                        Página ${AnunciosState.page} de ${AnunciosState.totalPages}
                    </span>
                    <button type="button" class="an-pagination-btn" ${!hasNext || AnunciosState.loading ? 'disabled' : ''} onclick="anGoToPage(${AnunciosState.page + 1})">
                        Próxima
                        <span class="material-symbols-rounded">chevron_right</span>
                    </button>
                </div>
            </div>
        `;
    }

    // Renderização dos Cards de Anúncio
    function renderAnunciosCards() {
        if (AnunciosState.loading) {
            return `
                <div class="an-loading-state">
                    <div class="an-loading-spinner"></div>
                    <strong style="color:#0f172a;font-size:16px;">Carregando anúncios...</strong>
                    <span style="color:#64748b;font-size:13px;margin-top:4px;">Consultando catálogo real em Homologação</span>
                </div>
            `;
        }

        if (AnunciosState.error) {
            return `
                <div class="an-error-state">
                    <span class="material-symbols-rounded" style="font-size:44px;color:#ef4444;margin-bottom:12px;">error</span>
                    <h3 style="margin:0 0 6px;color:#0f172a;font-size:18px;">Erro ao carregar anúncios</h3>
                    <p style="margin:0 0 16px;font-size:13px;color:#64748b;">${escapeHtml(AnunciosState.error)}</p>
                    <button type="button" class="an-btn an-btn-primary" onclick="carregarCatalogoAnuncios(${AnunciosState.page})">Tentar novamente</button>
                </div>
            `;
        }

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
            const isMapped = an.situacao_mapeamento === 'MAPEADO';
            const actionLabel = isMapped ? 'Ver / Editar mapeamento' : (an.has_variations ? 'Mapear variações' : 'Mapear produto');
            const actionClass = isMapped ? 'an-btn-edit' : 'an-btn-primary';

            const externalStatus = String(an.marketplace_status || '').trim().toUpperCase();

            const massState = window.AnunciosMassSelectionState;
            let isChecked = false;

            if (an.has_variations && Array.isArray(an.variations) && an.variations.length > 0) {
                let selCount = 0;
                for (const v of an.variations) {
                    const k = getAnuncioItemKey(an, v);
                    if (massState.selectedKeys.has(k)) selCount++;
                }
                isChecked = selCount === an.variations.length && selCount > 0;
            } else {
                const k = getAnuncioItemKey(an, null);
                isChecked = massState.selectedKeys.has(k);
            }

            const hasPermalink = hasValue(an.permalink);

            return `
                <article class="an-card" data-anuncio-id="${escapeHtml(an.id)}">
                    <!-- Selection Checkbox (Coluna 1) -->
                    <div class="an-card-select">
                        <input type="checkbox" class="an-checkbox an-card-checkbox" ${isChecked ? 'checked' : ''} onchange="anToggleCardSelection(event, '${escapeHtml(an.id)}')">
                    </div>

                    <!-- Thumbnail e Link do Anúncio na Imagem (Coluna 2) -->
                    <div class="an-card-thumb-col">
                        ${hasPermalink ? `
                            <a href="${escapeHtml(an.permalink)}" target="_blank" rel="noopener noreferrer" class="an-card-image" title="Abrir anúncio em nova aba">
                                <img src="${escapeHtml(an.thumbnail_url)}" alt="${escapeHtml(an.titulo)}" onerror="this.src='/assets/images/placeholder.webp';">
                            </a>
                        ` : `
                            <div class="an-card-image no-link" title="${escapeHtml(an.titulo)}">
                                <img src="${escapeHtml(an.thumbnail_url)}" alt="${escapeHtml(an.titulo)}" onerror="this.src='/assets/images/placeholder.webp';">
                            </div>
                        `}
                    </div>

                    <!-- Metadados e Título (Coluna 3) -->
                    <div class="an-card-details">
                        <div class="an-card-meta">
                            ${hasValue(an.marketplace) ? `<span class="an-badge-mlb">${escapeHtml(an.marketplace.replaceAll('_', ' '))}</span>` : ''}
                            ${hasValue(an.external_item_id) ? `<span class="an-badge-mlb">${escapeHtml(an.external_item_id)}</span>` : ''}
                            ${hasValue(an.variation_id || an.variation_key) ? `<span class="an-badge-sku">Variação: ${escapeHtml(an.variation_id || an.variation_key)}</span>` : ''}
                            ${an.seller_sku ? `<span class="an-badge-sku">SKU: ${escapeHtml(an.seller_sku)}</span>` : ''}
                        </div>
                        <h3>${escapeHtml(an.titulo)}</h3>
                        ${priceHTML(an)}
                        <div class="an-card-submeta">
                            <span class="an-status-dot ${externalStatus === 'ACTIVE' ? 'active' : 'paused'}">
                                ${externalStatus === 'ACTIVE' ? 'Anúncio Ativo' : (externalStatus === 'UNDER_REVIEW' ? 'Sob Revisão' : 'Anúncio Pausado')}
                            </span>
                            ${hasValue(an.ultima_sincronizacao) ? `<span>•</span><span>Sincronizado: ${escapeHtml(an.ultima_sincronizacao)}</span>` : ''}
                        </div>
                    </div>

                    <!-- Bloco de Mapeamento Interno (Coluna 4) -->
                    <div class="an-card-mapping">
                        ${renderMappingSummary(an)}
                    </div>

                    <!-- Seller e Botão de Ação (Coluna 5) -->
                    <div class="an-card-actions">
                        ${renderSellerBadge(an)}
                        <button type="button" class="an-btn ${actionClass}" onclick="anOpenMappingModal('${escapeHtml(an.id)}')">
                            ${actionLabel}
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderAnunciosCardsUI() {
        const listContainer = document.getElementById('an-list-container');
        if (listContainer) {
            listContainer.innerHTML = renderAnunciosCards();
        }
        const pagContainer = document.getElementById('an-pagination-container');
        if (pagContainer) {
            pagContainer.innerHTML = renderPaginationHTML();
        }
        anUpdateMassSelectionUI();
    }

    // Tela Principal de Anúncios
    window.renderAnunciosScreen = function (push = true) {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return renderLogin();

        currentScreen = 'anuncios';
        if (push && typeof pushNav === 'function') pushNav('anuncios');

        const totalCount = AnunciosState.summaryCounts.total || 0;
        const unmappedCount = AnunciosState.summaryCounts.unmapped || 0;
        const mappedCount = AnunciosState.summaryCounts.mapped || 0;
        const reviewCount = AnunciosState.summaryCounts.review || 0;

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
                            <strong>${totalCount.toLocaleString('pt-BR')}</strong>
                            <small>Todos os anúncios</small>
                        </button>
                        <button type="button" class="tab-nao-mapeados ${AnunciosState.filter === 'nao_mapeados' ? 'active' : ''}" onclick="anSetFilter('nao_mapeados')">
                            <span class="material-symbols-rounded">link_off</span>
                            <strong>${unmappedCount.toLocaleString('pt-BR')}</strong>
                            <small>Não mapeados</small>
                        </button>
                        <button type="button" class="tab-mapeados ${AnunciosState.filter === 'mapeados' ? 'active' : ''}" onclick="anSetFilter('mapeados')">
                            <span class="material-symbols-rounded">check_circle</span>
                            <strong>${mappedCount.toLocaleString('pt-BR')}</strong>
                            <small>Mapeados</small>
                        </button>
                        <button type="button" class="tab-revisar ${AnunciosState.filter === 'revisar' ? 'active' : ''}" onclick="anSetFilter('revisar')">
                            <span class="material-symbols-rounded">warning</span>
                            <strong>${reviewCount.toLocaleString('pt-BR')}</strong>
                            <small>Para revisar</small>
                        </button>
                    </section>

                    <!-- Painel de Anúncios -->
                    <section class="an-panel">
                        <header class="an-panel-header">
                            <div class="an-panel-title">
                                <h2>Gestão de Mapeamento de Anúncios</h2>
                                <small>Vincule anúncios Mercado Livre e Shopee aos produtos internos e suas marcas equivalentes aceitas na separação.</small>
                            </div>
                            <div class="an-controls">
                                <label class="an-search" aria-label="Buscar anúncios">
                                    <span class="material-symbols-rounded">search</span>
                                    <input type="text" id="an-search-input" value="${escapeHtml(AnunciosState.search)}" oninput="anOnSearchInput(this.value)" placeholder="Buscar MLB, SKU, título, conta ou ID...">
                                </label>
                                <select class="an-marketplace-select" onchange="anOnMarketplaceChange(this.value)" aria-label="Filtrar por marketplace">
                                    <option value="todos" ${AnunciosState.marketplaceFilter === 'todos' ? 'selected' : ''}>Todos os Canais</option>
                                    <option value="mercadolibre" ${AnunciosState.marketplaceFilter === 'mercadolibre' ? 'selected' : ''}>Mercado Livre</option>
                                    <option value="shopee" ${AnunciosState.marketplaceFilter === 'shopee' ? 'selected' : ''}>Shopee</option>
                                </select>
                                <select class="an-account-select" id="an-account-select-el" onchange="anOnAccountChange(this.value)" aria-label="Filtrar por conta">
                                    <option value="todas" ${AnunciosState.accountFilter === 'todas' ? 'selected' : ''}>Todas as Contas</option>
                                    ${accountOptions()}
                                </select>
                                <select class="an-status-select" onchange="anOnStatusChange(this.value)" aria-label="Filtrar por status">
                                    <option value="todos" ${AnunciosState.statusFilter === 'todos' ? 'selected' : ''}>Todos os Status</option>
                                    <option value="active" ${AnunciosState.statusFilter === 'active' ? 'selected' : ''}>Ativos</option>
                                    <option value="paused" ${AnunciosState.statusFilter === 'paused' ? 'selected' : ''}>Pausados</option>
                                    <option value="under_review" ${AnunciosState.statusFilter === 'under_review' ? 'selected' : ''}>Sob Revisão</option>
                                </select>
                            </div>
                        </header>

                        <div id="an-mass-action-bar-container">
                            ${renderMassActionBarHTML()}
                        </div>

                        <div id="an-list-container" class="an-list">
                            ${renderAnunciosCards()}
                        </div>

                        <div id="an-pagination-container">
                            ${renderPaginationHTML()}
                        </div>
                    </section>
                </main>
            </div>
        `;

        // Carregamento assíncrono inicial dos dados do catálogo real e contadores
        carregarContadoresResumoGlobais();
        carregarCatalogoAnuncios(AnunciosState.page);
    };

    function atualizarContadoresResumo() {
        const totalCount = AnunciosState.summaryCounts.total || 0;
        const unmappedCount = AnunciosState.summaryCounts.unmapped || 0;
        const mappedCount = AnunciosState.summaryCounts.mapped || 0;
        const reviewCount = AnunciosState.summaryCounts.review || 0;

        const tabTodos = document.querySelector('.an-summary .tab-todos strong');
        if (tabTodos) tabTodos.textContent = totalCount.toLocaleString('pt-BR');
        const tabNaoMap = document.querySelector('.an-summary .tab-nao-mapeados strong');
        if (tabNaoMap) tabNaoMap.textContent = unmappedCount.toLocaleString('pt-BR');
        const tabMap = document.querySelector('.an-summary .tab-mapeados strong');
        if (tabMap) tabMap.textContent = mappedCount.toLocaleString('pt-BR');
        const tabRev = document.querySelector('.an-summary .tab-revisar strong');
        if (tabRev) tabRev.textContent = reviewCount.toLocaleString('pt-BR');
    }

    // Event Handlers de Filtros, Busca e Paginação
    window.anSetFilter = function (filterKey) {
        AnunciosState.filter = filterKey;
        const listContainer = document.getElementById('an-list-container');
        if (listContainer) {
            listContainer.innerHTML = renderAnunciosCards();
            anUpdateMassSelectionUI();
        }
        document.querySelectorAll('.an-summary button').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.an-summary .tab-${filterKey.replace('_', '-')}`);
        if (activeBtn) activeBtn.classList.add('active');
    };

    window.anOnSearchInput = function (term) {
        AnunciosState.search = term;
        if (AnunciosState.searchDebounceTimer) {
            clearTimeout(AnunciosState.searchDebounceTimer);
        }
        AnunciosState.searchDebounceTimer = setTimeout(() => {
            carregarCatalogoAnuncios(1);
        }, 400);
    };

    window.anOnMarketplaceChange = function (mp) {
        AnunciosState.marketplaceFilter = mp;
        AnunciosState.accountFilter = 'todas';
        const accSelect = document.getElementById('an-account-select-el');
        if (accSelect) {
            accSelect.innerHTML = `<option value="todas">Todas as Contas</option>${accountOptions()}`;
        }
        carregarCatalogoAnuncios(1);
    };

    window.anOnAccountChange = function (acc) {
        AnunciosState.accountFilter = acc;
        carregarCatalogoAnuncios(1);
    };

    window.anOnStatusChange = function (st) {
        AnunciosState.statusFilter = st;
        carregarCatalogoAnuncios(1);
    };

    window.anGoToPage = function (page) {
        if (page < 1 || page > AnunciosState.totalPages || page === AnunciosState.page) return;
        carregarCatalogoAnuncios(page);
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
    // MODAL DE MAPEAMENTO COMPARTILHADO (PRODUTOS EQUIVALENTES & KITS)
    // =========================================================================

    window.SharedMappingState = {
        context: null,
        modalMode: 'equivalents',
        modalSearch: '',
        modalAcceptedProducts: [],
        modalKitComponents: []
    };

    const getVariationRef = v => hasValue(v?.variation_id) ? `id:${v.variation_id}` : hasValue(v?.variation_key) ? `key:${v.variation_key}` : '';
    const findVariationByRef = (anuncio, ref) => (anuncio.variations || []).find(v => getVariationRef(v) === ref);

    // Função Compartilhada de Abertura do Modal de Mapeamento
    window.openSharedItemMappingModal = function (context) {
        if (!context) return false;

        const marketplace = context.marketplace || 'MERCADO_LIVRE';

        // Regra 4: Shopee não habilitado nesta fase
        if (marketplace === 'SHOPEE') {
            if (typeof showToast === 'function') {
                showToast('A identificação de itens Shopee está bloqueada nesta fase.', 'warning');
            }
            return false;
        }

        // Regra 5: Conta não resolvida para Mercado Livre (Identificação só abre se houver account_id local resolvido > 0)
        if (marketplace === 'MERCADO_LIVRE') {
            const accIdNum = Number(context.accountId);
            if (!Number.isInteger(accIdNum) || accIdNum <= 0) {
                if (typeof showToast === 'function') {
                    showToast('Conta operacional ainda não vinculada. A identificação ficará disponível após a conta ser reconciliada.', 'warning');
                } else {
                    alert('Conta operacional ainda não vinculada. A identificação ficará disponível após a conta ser reconciliada.');
                }
                return false;
            }
        }

        // Regra 10: Trata variação
        const varIdClean = (context.variationId && String(context.variationId).trim()) ? String(context.variationId).trim() : null;

        window.SharedMappingState = {
            context: {
                ...context,
                marketplace,
                variationId: varIdClean
            },
            modalMode: 'equivalents',
            modalSearch: '',
            modalAcceptedProducts: [],
            modalKitComponents: []
        };

        const initialMapping = context.initialMapping;
        if (initialMapping?.type === 'kit') {
            window.SharedMappingState.modalMode = 'kit';
            window.SharedMappingState.modalKitComponents = (initialMapping.components || []).map(c => ({ product: { ...c.product }, qty: c.qty || 1 }));
        } else {
            window.SharedMappingState.modalMode = 'equivalents';
            window.SharedMappingState.modalAcceptedProducts = (initialMapping?.products || []).map(p => ({ ...p }));
        }

        anRenderMappingModalDOM();

        carregarProdutosCatalogo().then(() => {
            const resultsEl = document.querySelector('#an-mapping-modal-overlay .an-catalog-results');
            if (resultsEl) resultsEl.innerHTML = anRenderCatalogResults();
        });

        return true;
    };

    // Wrapper para o Módulo de Anúncios
    window.anOpenMappingModal = function (anuncioId, variationRef = null) {
        const anuncio = AnunciosState.anuncios.find(a => a.id === anuncioId);
        if (!anuncio) return;

        AnunciosState.activeAnuncioId = anuncioId;
        const selectedVariation = variationRef ? findVariationByRef(anuncio, variationRef) : null;
        AnunciosState.activeVariationId = selectedVariation?.variation_id || null;

        // Se for anúncio com variações e nenhuma foi selecionada ainda, abre seleção
        if (anuncio.has_variations && !variationRef) {
            anOpenVariationPickerModal(anuncio);
            return;
        }

        let targetMapping = anuncio.mapping;
        if (variationRef && anuncio.has_variations) {
            targetMapping = selectedVariation?.mapping;
        }

        const varIdClean = selectedVariation?.variation_id ? String(selectedVariation.variation_id).trim() : null;

        window.openSharedItemMappingModal({
            marketplace: anuncio.marketplace || 'MERCADO_LIVRE',
            accountId: anuncio.account_id,
            sourceAccountId: anuncio.source_account_id,
            itemId: anuncio.external_item_id || anuncio.id,
            variationId: varIdClean,
            sellerSku: selectedVariation?.seller_sku || anuncio.seller_sku || null,
            titulo: anuncio.titulo,
            thumbnailUrl: anuncio.thumbnail_url,
            initialMapping: targetMapping,
            onSaved: async ({ uiMapping }) => {
                if (AnunciosState.activeVariationId && anuncio.has_variations) {
                    const v = anuncio.variations.find(x => x.variation_id === AnunciosState.activeVariationId);
                    if (v) {
                        v.mapping = uiMapping;
                        v.situacao_mapeamento = 'MAPEADO';
                    }
                    const allMapped = anuncio.variations.every(x => x.situacao_mapeamento === 'MAPEADO');
                    anuncio.situacao_mapeamento = allMapped ? 'MAPEADO' : 'PARCIAL';
                } else {
                    anuncio.mapping = uiMapping;
                    anuncio.situacao_mapeamento = 'MAPEADO';
                }

                renderAnunciosScreen(false);
                if (typeof showToast === 'function') {
                    showToast('Mapeamento de anúncio atualizado e salvo no banco com sucesso!', 'success');
                }
            }
        });
    };

    function anOpenVariationPickerModal(anuncio) {
        const overlay = document.createElement('div');
        overlay.className = 'an-modal-overlay fade-in';
        overlay.id = 'an-variation-picker-overlay';

        const massState = window.AnunciosMassSelectionState;

        overlay.innerHTML = `
            <div class="an-modal" style="max-width:640px;" onclick="event.stopPropagation()">
                <header class="an-modal-header">
                    <div>
                        <small><span class="material-symbols-rounded" style="font-size:15px;">tune</span> Selecionar Variação</small>
                        <h2>${escapeHtml(anuncio.titulo)}</h2>
                        <p>external_item_id: ${escapeHtml(anuncio.external_item_id)} • Conta: ${escapeHtml(anuncio.seller_nome)}</p>
                    </div>
                    <button type="button" class="an-modal-close" onclick="document.getElementById('an-variation-picker-overlay').remove()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </header>
                <div class="an-modal-body" style="padding:18px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;color:#64748b;">Marque as variações que deseja incluir na seleção em massa ou clique em "Mapear" para alterar individualmente:</p>
                    <div style="display:grid;gap:10px;">
                        ${anuncio.variations.map(v => {
                            const isVMap = v.situacao_mapeamento === 'MAPEADO';
                            const prod = v.mapping?.products?.[0];
                            const massKey = getAnuncioItemKey(anuncio, v);
                            const isVarChecked = massState.selectedKeys.has(massKey);

                            return `
                                <div style="display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:12px 14px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;">
                                    <input type="checkbox" class="an-checkbox" ${isVarChecked ? 'checked' : ''} onchange="anToggleVariationSelection('${escapeHtml(anuncio.id)}', '${escapeHtml(getVariationRef(v))}', this.checked)" title="Selecionar para lote">
                                    <div style="cursor:pointer;" onclick="document.getElementById('an-variation-picker-overlay').remove(); anOpenMappingModal('${escapeHtml(anuncio.id)}', '${escapeHtml(getVariationRef(v))}')">
                                        <strong style="display:block;color:#0f172a;font-size:13px;">${escapeHtml(v.attribute)}</strong>
                                        <small style="color:#64748b;font-size:11px;">${hasValue(v.seller_sku) ? `SKU: ${escapeHtml(v.seller_sku)} • ` : ''}${escapeHtml(v.variation_id || v.variation_key || 'Identificador não informado')}</small>
                                        <div style="margin-top:4px;">
                                            ${isVMap ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:5px;background:#f0fdf4;color:#166534;font-size:11px;font-weight:700;"><span class="material-symbols-rounded" style="font-size:14px;">check_circle</span> Mapeado: ${escapeHtml(prod?.id_interno)} — ${escapeHtml(prod?.nome)}</span>` : `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:5px;background:#fff7ed;color:#9a3412;font-size:11px;font-weight:700;"><span class="material-symbols-rounded" style="font-size:14px;">link_off</span> Não mapeado</span>`}
                                        </div>
                                    </div>
                                    <button type="button" class="an-btn-outline" onclick="document.getElementById('an-variation-picker-overlay').remove(); anOpenMappingModal('${escapeHtml(anuncio.id)}', '${escapeHtml(getVariationRef(v))}')" style="padding:6px 10px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:4px;border-radius:6px;">
                                        Mapear <span class="material-symbols-rounded" style="font-size:16px;">arrow_forward</span>
                                    </button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function anGetFooterInfoHtml() {
        const state = window.SharedMappingState;
        if (!state) return '<small>Regra Operacional de Separação:</small><strong>Nenhum produto vinculado ainda.</strong>';

        if (state.modalMode === 'kit') {
            const count = state.modalKitComponents ? state.modalKitComponents.length : 0;
            return `
                <small>Regra Operacional de Separação:</small>
                <strong>${count > 0 ? `Kit Composto · ${count} componente(s) exigido(s) por unidade vendida.` : 'Nenhum componente adicionado ao kit.'}</strong>
            `;
        }

        const accepted = state.modalAcceptedProducts || [];
        if (accepted.length === 0) {
            return `
                <small>Regra Operacional de Separação:</small>
                <strong>Nenhum produto vinculado ainda.</strong>
            `;
        }

        const firstItem = accepted[0];
        const infoEq = firstItem?._infoEquivalencia;
        const isGrupo = Boolean((infoEq && infoEq.possui_grupo && infoEq.grupo) || firstItem?.pertence_grupo);

        if (isGrupo) {
            const gNome = infoEq?.grupo?.nome || infoEq?.grupo?.codigo_grupo || firstItem?.grupo_equivalencia_nome || 'Grupo de Equivalência';
            return `
                <small>Regra Operacional de Separação:</small>
                <strong>Mapeamento: Grupo de Equivalência · ${escapeHtml(gNome)} · ${accepted.length} produtos aceitos</strong>
            `;
        }

        return `
            <small>Regra Operacional de Separação:</small>
            <strong>Mapeamento: Produto individual · ${escapeHtml(firstItem.id_interno || 'SKU')}</strong>
        `;
    }

    function anUpdateModalFooterInfo() {
        const el = document.querySelector('#an-mapping-modal-overlay .an-modal-footer-info') || document.getElementById('an-modal-footer-info');
        if (el) {
            el.innerHTML = anGetFooterInfoHtml();
        }
    }

    function anRenderMappingModalDOM() {
        const existing = document.getElementById('an-mapping-modal-overlay');
        if (existing) existing.remove();

        const state = window.SharedMappingState;
        const context = state.context || {};
        const title = context.title || 'Mapeamento de Item';
        const subtitle = context.subtitle || '';

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'an-mapping-modal-overlay';
        modalOverlay.className = 'an-modal-overlay';

        modalOverlay.innerHTML = `
            <div class="an-modal-content">
                <!-- Header -->
                <header class="an-modal-header">
                    <div>
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <span class="material-symbols-rounded" style="color:#ea580c;font-size:22px;">schema</span>
                            <h3 style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">${escapeHtml(title)}</h3>
                            <span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:12px;background:#fff7ed;color:#ea580c;border:1px solid #ffedd5;text-transform:uppercase;">
                                ${context.source === 'pedidos' ? 'Pedidos' : 'Anúncios'}
                            </span>
                        </div>
                        <small style="color:#64748b;font-size:12px;">${escapeHtml(subtitle)}</small>
                    </div>
                    <button type="button" class="an-modal-close-btn" onclick="document.getElementById('an-mapping-modal-overlay').remove()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </header>

                <!-- Tabs de Modo de Mapeamento -->
                <div class="an-modal-tabs">
                    <button type="button" class="an-modal-tab-btn ${state.modalMode === 'equivalents' ? 'active' : ''}" onclick="anSetModalMode('equivalents')">
                        <span class="material-symbols-rounded">inventory_2</span>
                        <div>
                            <strong>Produto Único ou Grupo de Equivalentes</strong>
                            <small>Um ou mais produtos de marcas diferentes que podem atender a este anúncio na separação (lógica OU).</small>
                        </div>
                    </button>
                    <button type="button" class="an-modal-tab-btn ${state.modalMode === 'kit' ? 'active' : ''}" onclick="anSetModalMode('kit')">
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
                    <div id="an-modal-footer-info" class="an-modal-footer-info">
                        ${anGetFooterInfoHtml()}
                    </div>
                    <div style="display:flex;gap:10px;">
                        <button type="button" class="an-btn an-btn-outline" onclick="document.getElementById('an-mapping-modal-overlay').remove()">Cancelar</button>
                        <button type="button" class="an-btn an-btn-primary" onclick="confirmSharedModalMapping()">
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
        const state = window.SharedMappingState;
        if (state.modalMode === 'kit') {
            return anRenderKitModalContent();
        }
        return anRenderEquivalentsModalContent();
    }

    // Renderiza seção de Produto e Equivalentes
    function anRenderEquivalentsModalContent() {
        const state = window.SharedMappingState;
        const accepted = state.modalAcceptedProducts || [];

        const firstItem = accepted[0];
        const infoEq = firstItem?._infoEquivalencia;
        const isGrupo = Boolean((infoEq && infoEq.possui_grupo && infoEq.grupo) || firstItem?.pertence_grupo);
        const grupoNome = isGrupo ? (infoEq?.grupo?.nome || infoEq?.grupo?.codigo_grupo || firstItem?.grupo_equivalencia_nome || '') : '';

        let headerBadgeText = 'Nenhum produto aceito';
        if (accepted.length > 0) {
            if (isGrupo) {
                headerBadgeText = `Grupo de Equivalência · ${accepted.length} produtos`;
            } else {
                headerBadgeText = `Produto individual`;
            }
        }

        return `
            <!-- Árvore de Produtos Equivalentes Aceitos -->
            <section class="an-equivalents-section">
                <header class="an-equivalents-section-header">
                    <div>
                        <h4>${isGrupo ? `Grupo de Equivalência${grupoNome ? ` — ${escapeHtml(grupoNome)}` : ''}` : 'Produtos Aceitos para este Anúncio / Item'}</h4>
                        <small>${isGrupo ? 'Todos os SKUs deste grupo são equivalentes no estoque e qualquer um atende o anúncio.' : 'Qualquer um destes produtos internos poderá ser separado e bipado na conferência (relação de equivalência).'}</small>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:12px;font-weight:800;color:#ea580c;">
                            ${headerBadgeText}
                        </span>
                        ${accepted.length > 0 ? `
                            <button type="button" class="an-btn-outline" style="padding:4px 10px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;border-radius:6px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#334155;" onclick="anOpenEquivalenciaManagerModal()">
                                <span class="material-symbols-rounded" style="font-size:15px;color:#ea580c;">settings_suggest</span>
                                ${isGrupo ? 'Gerenciar grupo' : 'Gerenciar equivalência'}
                            </button>
                        ` : ''}
                    </div>
                </header>

                <div class="an-equiv-tree-list">
                    ${accepted.length === 0 ? `
                        <div style="padding:28px;text-align:center;color:#64748b;">
                            <span class="material-symbols-rounded" style="font-size:36px;color:#cbd5e1;margin-bottom:6px;">inventory_2</span>
                            <p style="margin:0;font-size:13px;">Nenhum produto interno vinculado. Pesquise abaixo para adicionar o primeiro produto ou seus equivalentes.</p>
                        </div>
                    ` : accepted.map((p, index) => `
                        <div class="an-equiv-tree-item">
                            <span class="material-symbols-rounded">inventory_2</span>
                            <div class="an-equiv-tree-info">
                                <strong>${escapeHtml(p.id_interno)} — ${escapeHtml(p.nome)}</strong>
                                <span>EAN: ${escapeHtml(p.ean || '-')} • SKU Fornecedor: ${escapeHtml(p.sku_fornecedor || '-')}</span>
                            </div>
                            <span class="an-equiv-tree-badge-brand">${escapeHtml(p.marca || 'Marca')}</span>
                            <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;white-space:nowrap;">Produto aceito</span>
                            <button type="button" class="an-equiv-remove-btn" onclick="anRemoveAcceptedProduct(${index})" title="${isGrupo ? 'Desfazer seleção do grupo' : 'Remover este produto aceito'}">
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
                    <input type="text" id="an-catalog-input" value="${escapeHtml(state.modalSearch)}" oninput="anOnModalSearchInput(this.value)" placeholder="Pesquisar por ID interno (ex: DY-001.xxx), Nome, Marca (Osram, Philips...), EAN ou SKU...">
                </div>

                <div class="an-catalog-results">
                    ${anRenderCatalogResults()}
                </div>
            </section>
        `;
    }

    // Renderiza seção de Kit
    function anRenderKitModalContent() {
        const state = window.SharedMappingState;
        const components = state.modalKitComponents;

        return `
            <section class="an-equivalents-section">
                <header class="an-equivalents-section-header">
                    <div>
                        <h4>Componentes do Kit Composto</h4>
                        <small>Defina quais produtos e as quantidades necessárias para compor 1 unidade deste anúncio / item.</small>
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
                    ` : components.map((c, index) => {
                        const isCompGrupo = Boolean((c.product._infoEquivalencia && c.product._infoEquivalencia.possui_grupo && c.product._infoEquivalencia.grupo) || c.product.pertence_grupo || c.product.grupo_equivalencia_id);
                        const compGrupoNome = isCompGrupo ? (c.product._infoEquivalencia?.grupo?.nome || c.product._infoEquivalencia?.grupo?.codigo_grupo || c.product.grupo_equivalencia_nome || 'Grupo de Equivalência') : '';
                        const compSkus = isCompGrupo ? (c.product._infoEquivalencia?.skus || []) : [];
                        const compSkusCount = isCompGrupo ? (compSkus.length || 1) : 1;
                        const showAceitos = Boolean(c._showAceitos);

                        return `
                            <div class="an-equiv-tree-item" style="display:flex;flex-direction:column;gap:8px;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;">
                                <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:12px;">
                                    <div style="display:flex;align-items:center;gap:10px;flex:1;">
                                        <span class="material-symbols-rounded" style="color:#6b21a8;font-size:22px;">${isCompGrupo ? 'schema' : 'inventory_2'}</span>
                                        <div class="an-equiv-tree-info">
                                            <strong>${isCompGrupo ? escapeHtml(compGrupoNome) : `${escapeHtml(c.product.id_interno)} — ${escapeHtml(c.product.nome)}`}</strong>
                                            <span style="font-size:11px;color:#64748b;">${isCompGrupo ? `Grupo de Equivalência · ${compSkusCount} produtos aceitos (${escapeHtml(c.product.id_interno)})` : `Produto individual • Marca: ${escapeHtml(c.product.marca || '-')} • EAN: ${escapeHtml(c.product.ean || '-')}`}</span>
                                        </div>
                                    </div>

                                    <div style="display:flex;align-items:center;gap:8px;">
                                        <button type="button" class="an-btn-outline" style="padding:4px 8px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;border-radius:6px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#475569;" onclick="anOpenEquivalenciaManagerModal('${escapeHtml(c.product.id_interno)}')">
                                            <span class="material-symbols-rounded" style="font-size:14px;color:#ea580c;">settings_suggest</span>
                                            ${isCompGrupo ? 'Gerenciar grupo' : 'Gerenciar equivalência'}
                                        </button>

                                        ${isCompGrupo ? `
                                            <button type="button" class="an-btn-outline" style="padding:4px 8px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;border-radius:6px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#0369a1;" onclick="anToggleKitComponentAceitos(${index})">
                                                <span class="material-symbols-rounded" style="font-size:14px;color:#0284c7;">${showAceitos ? 'expand_less' : 'visibility'}</span>
                                                ${showAceitos ? 'Ocultar aceitos' : 'Ver produtos aceitos'}
                                            </button>
                                        ` : ''}

                                        <div style="display:flex;align-items:center;gap:6px;background:#f8fafc;padding:3px 8px;border-radius:6px;border:1px solid #cbd5e1;">
                                            <span style="font-size:11px;font-weight:800;color:#475569;white-space:nowrap;">Quantidade por kit:</span>
                                            <button type="button" onclick="anChangeKitQty(${index}, -1)" style="width:24px;height:24px;border:1px solid #cbd5e1;border-radius:4px;background:#ffffff;color:#0f172a;cursor:pointer;font-weight:800;font-size:14px;display:inline-flex;align-items:center;justify-content:center;">&minus;</button>
                                            <strong style="min-width:20px;text-align:center;font-size:13px;color:#0f172a;">${c.qty}</strong>
                                            <button type="button" onclick="anChangeKitQty(${index}, 1)" style="width:24px;height:24px;border:1px solid #cbd5e1;border-radius:4px;background:#ffffff;color:#0f172a;cursor:pointer;font-weight:800;font-size:14px;display:inline-flex;align-items:center;justify-content:center;">+</button>
                                        </div>

                                        <button type="button" class="an-equiv-remove-btn" onclick="anRemoveKitComponent(${index})" title="Remover componente" style="background:none;border:none;color:#ef4444;cursor:pointer;padding:4px;display:flex;align-items:center;">
                                            <span class="material-symbols-rounded" style="font-size:20px;">delete</span>
                                        </button>
                                    </div>
                                </div>

                                ${showAceitos ? `
                                    <div style="margin-top:4px;padding:10px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;width:100%;">
                                        <div style="font-size:11px;font-weight:800;color:#166534;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                                            <span class="material-symbols-rounded" style="font-size:16px;">check_circle</span>
                                            Produtos Aceitos na Conferência (${compSkus.length}) — ${escapeHtml(compGrupoNome)}:
                                        </div>
                                        <div style="display:flex;flex-direction:column;gap:4px;">
                                            ${compSkus.length === 0 ? `
                                                <div style="font-size:11px;color:#166534;">Nenhum detalhe adicional no momento.</div>
                                            ` : compSkus.map(s => `
                                                <div style="font-size:11px;color:#0f172a;display:flex;align-items:center;justify-content:space-between;background:#fff;padding:4px 10px;border-radius:4px;border:1px solid #dcfce7;">
                                                    <span><strong>${escapeHtml(s.id_interno || s.sku || 'SKU')}</strong> — ${escapeHtml(s.nome || '')}</span>
                                                    <span style="font-size:10px;color:#475569;font-weight:700;">Marca: <b>${escapeHtml(s.marca || '-')}</b></span>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </section>

            <section class="an-catalog-section">
                <label style="font-size:12px;font-weight:800;color:#334155;">Pesquisar Componente para o Kit:</label>
                <div class="an-catalog-search-bar">
                    <span class="material-symbols-rounded" style="color:#94a3b8;">search</span>
                    <input type="text" id="an-catalog-input" value="${escapeHtml(state.modalSearch)}" oninput="anOnModalSearchInput(this.value)" placeholder="Pesquisar produto interno por ID, nome, marca, EAN...">
                </div>

                <div class="an-catalog-results">
                    ${anRenderCatalogResults()}
                </div>
            </section>
        `;
    }

    window.anToggleKitComponentAceitos = async function (index) {
        const state = window.SharedMappingState;
        if (!state.modalKitComponents || !state.modalKitComponents[index]) return;
        const c = state.modalKitComponents[index];

        if (!c._showAceitos) {
            if (!c.product._infoEquivalencia?.skus || !c.product._infoEquivalencia.skus.length) {
                try {
                    if (window.DataClient?.getEquivalenciaResolvidaByProdutoId && c.product.id) {
                        c.product._infoEquivalencia = await window.DataClient.getEquivalenciaResolvidaByProdutoId(c.product.id);
                    }
                } catch (err) {
                    console.warn('[KIT] Erro ao buscar equivalência do componente:', err);
                }
            }
        }

        c._showAceitos = !c._showAceitos;
        const container = document.getElementById('an-modal-body-container');
        if (container) {
            container.innerHTML = anRenderModalBodyContent();
        }
    };

    // Auxiliar para verificar se um produto (ou grupo de equivalência) já está presente no Kit
    function anFindMatchingKitComponent(prod, infoEquivalencia, kitComponents) {
        if (!prod || !Array.isArray(kitComponents) || kitComponents.length === 0) return null;

        const prodId = prod.id || null;
        const prodIdInterno = prod.id_interno || null;
        const prodGroupId = infoEquivalencia?.grupo?.id || prod.grupo_equivalencia_id || null;

        for (const c of kitComponents) {
            const cProd = c.product || {};
            const cInfoEq = cProd._infoEquivalencia || null;
            const cGroupId = cInfoEq?.grupo?.id || cProd.grupo_equivalencia_id || null;

            // 1. Match direto por ID de produto
            if ((prodId && cProd.id === prodId) || (prodIdInterno && cProd.id_interno === prodIdInterno)) {
                return c;
            }

            // 2. Match por ID de grupo de equivalencia
            if (prodGroupId && cGroupId && prodGroupId === cGroupId) {
                return c;
            }

            // 3. Match de membro (se o componente existente é um grupo, verifica se o produto candidato é SKU membro)
            if (cInfoEq && Array.isArray(cInfoEq.skus)) {
                const isMember = cInfoEq.skus.some(s =>
                    (prodId && (s.id === prodId || s.id_interno === prodId)) ||
                    (prodIdInterno && (s.id_interno === prodIdInterno || s.id === prodIdInterno))
                );
                if (isMember) return c;
            }

            // 4. Match reverso de membro (se o candidato possui infoEquivalencia resolvido com SKUs)
            if (infoEquivalencia && Array.isArray(infoEquivalencia.skus)) {
                const cIsMember = infoEquivalencia.skus.some(s =>
                    (cProd.id && (s.id === cProd.id || s.id_interno === cProd.id)) ||
                    (cProd.id_interno && (s.id_interno === cProd.id_interno || s.id === cProd.id_interno))
                );
                if (cIsMember) return c;
            }
        }

        return null;
    }
    window.anFindMatchingKitComponent = anFindMatchingKitComponent;

    // Renderiza resultados de produtos internos na busca inteligente do modal
    function anRenderCatalogResults() {
        const state = window.SharedMappingState;
        const rawSearch = String(state.modalSearch || '').trim();
        const catalog = getCatalogoAtual();

        if (!catalog.length) {
            return `
                <div style="padding:24px;text-align:center;color:#64748b;font-size:13px;">
                    <span class="material-symbols-rounded" style="font-size:24px;color:#f97316;animation:spin 1s linear infinite;display:block;margin:0 auto 8px;">sync</span>
                    Carregando catálogo de produtos do sistema...
                </div>
            `;
        }

        // Regra 3 & 9: Busca vazia ou com menos de 2 caracteres não exibe a lista completa
        if (rawSearch.length < 2) {
            return `
                <div style="padding:24px;text-align:center;color:#64748b;font-size:13px;">
                    <span class="material-symbols-rounded" style="font-size:28px;color:#94a3b8;display:block;margin:0 auto 6px;">search</span>
                    Digite pelo menos 2 caracteres para pesquisar.
                </div>
            `;
        }

        const normQuery = normText(rawSearch);
        const tokens = normQuery.split(/\s+/).filter(Boolean);

        // Regra 4 & 5: Filtro Multitermo Determinístico (AND lógico entre todos os tokens)
        const matched = [];
        for (const p of catalog) {
            const corpusFields = [p.id_interno, p.nome, p.marca, p.ean, p.sku_fornecedor, p.palavras_chave].filter(Boolean);
            const corpusNorm = normText(corpusFields.join(' '));

            const isMatch = tokens.every(token => corpusNorm.includes(token));
            if (!isMatch) continue;

            // Regra 7: Pontuação de Relevância Determinística
            const normId = normText(p.id_interno);
            const normEan = normText(p.ean);
            const normSku = normText(p.sku_fornecedor);
            const normNome = normText(p.nome);

            let score = 0;
            if (normId === normQuery) score += 1000;
            else if (normEan === normQuery) score += 900;
            else if (normSku === normQuery) score += 800;
            else if (normNome === normQuery) score += 700;
            else if (normNome.startsWith(normQuery)) score += 500;
            else if (normId.startsWith(normQuery)) score += 400;
            else if (tokens.every(t => normNome.includes(t))) score += 300;
            else if (tokens.every(t => normId.includes(t))) score += 200;
            else score += 100;

            matched.push({ product: p, score });
        }

        // Regra 13: Comportamento Sem Resultados
        if (!matched.length) {
            return `
                <div style="padding:20px;text-align:center;color:#64748b;font-size:12px;">
                    <span class="material-symbols-rounded" style="font-size:28px;color:#cbd5e1;display:block;margin:0 auto 6px;">search_off</span>
                    Nenhum produto encontrado. Tente outros termos, ID, marca, EAN ou SKU.
                </div>
            `;
        }

        // Regra 7: Ordenação por relevância (score decrescente, id_interno ascendente)
        matched.sort((a, b) => b.score - a.score || String(a.product.id_interno).localeCompare(String(b.product.id_interno)));

        // Regra 8 & 12: Limite de Resultados (máximo 15)
        const totalMatched = matched.length;
        const displayList = matched.slice(0, 15).map(m => m.product);

        let countNoticeHtml = '';
        if (totalMatched > 15) {
            countNoticeHtml = `
                <div style="padding:6px 12px;margin-bottom:8px;font-size:11px;font-weight:700;color:#9a3412;background:#fff7ed;border:1px solid #ffedd5;border-radius:6px;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-rounded" style="font-size:15px;">info</span>
                    Mostrando os 15 primeiros resultados. Refine sua busca.
                </div>
            `;
        } else if (totalMatched === 1) {
            countNoticeHtml = `
                <div style="padding:6px 12px;margin-bottom:8px;font-size:11px;font-weight:700;color:#166534;background:#f0fdf4;border:1px solid #dcfce7;border-radius:6px;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-rounded" style="font-size:15px;">check_circle</span>
                    1 resultado encontrado.
                </div>
            `;
        } else {
            countNoticeHtml = `
                <div style="padding:6px 12px;margin-bottom:8px;font-size:11px;font-weight:700;color:#166534;background:#f0fdf4;border:1px solid #dcfce7;border-radius:6px;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-rounded" style="font-size:15px;">check_circle</span>
                    ${totalMatched} resultados encontrados.
                </div>
            `;
        }

        const itemsHtml = displayList.map(p => {
            let isAlreadyAccepted = false;
            let buttonLabel = '+ Adicionar';

            if (state.modalMode === 'equivalents') {
                isAlreadyAccepted = state.modalAcceptedProducts.some(x => x.id_interno === p.id_interno || x.id === p.id);
                buttonLabel = isAlreadyAccepted ? 'Já adicionado' : '+ Adicionar';
            } else {
                isAlreadyAccepted = Boolean(anFindMatchingKitComponent(p, null, state.modalKitComponents));
                buttonLabel = isAlreadyAccepted ? 'Já no Kit' : '+ Adicionar ao Kit';
            }

            return `
                <div class="an-catalog-item" onclick="anSelectCatalogProduct('${escapeHtml(p.id_interno)}')">
                    <span class="material-symbols-rounded">inventory_2</span>
                    <div>
                        <strong>${escapeHtml(p.id_interno)} — ${escapeHtml(p.nome)}</strong>
                        <small>Marca: <b>${escapeHtml(p.marca)}</b> | EAN: ${escapeHtml(p.ean || '-')} | SKU: ${escapeHtml(p.sku_fornecedor || '-')}</small>
                    </div>
                    <button type="button" ${isAlreadyAccepted ? 'disabled style="background:#cbd5e1;cursor:default;"' : ''}>
                        ${escapeHtml(buttonLabel)}
                    </button>
                </div>
            `;
        }).join('');

        return countNoticeHtml + itemsHtml;
    }

    // Ações do Modal Compartilhado
    window.anSetModalMode = function (mode) {
        window.SharedMappingState.modalMode = mode;
        const container = document.getElementById('an-modal-body-container');
        if (container) {
            container.innerHTML = anRenderModalBodyContent();
        }
        anUpdateModalFooterInfo();
        document.querySelectorAll('.an-modal-tab-btn').forEach(b => {
            b.classList.toggle('active', (mode === 'equivalents' && b.innerText.includes('Grupo')) || (mode === 'kit' && b.innerText.includes('Kit')));
        });
    };

    window.anOnModalSearchInput = function (term) {
        window.SharedMappingState.modalSearch = term;
        const resultsEl = document.querySelector('#an-mapping-modal-overlay .an-catalog-results');
        if (resultsEl) {
            resultsEl.innerHTML = anRenderCatalogResults();
        }
    };

    window.anSelectCatalogProduct = async function (idInterno) {
        const state = window.SharedMappingState;
        const prod = findProduto(idInterno);
        if (!prod) return;

        // Resolve se o produto pertence a algum grupo de equivalencia ativo
        let infoEquivalencia = { possui_grupo: false, grupo: null, skus: [prod] };
        try {
            if (window.DataClient?.getEquivalenciaResolvidaByProdutoId && prod.id) {
                infoEquivalencia = await window.DataClient.getEquivalenciaResolvidaByProdutoId(prod.id);
            }
        } catch (err) {
            console.warn('[SHARED_MAPPING] Erro ao resolver equivalencia do produto:', err);
        }

        if (state.modalMode === 'equivalents') {
            if (infoEquivalencia && infoEquivalencia.possui_grupo && Array.isArray(infoEquivalencia.skus) && infoEquivalencia.skus.length > 0) {
                state.modalAcceptedProducts = infoEquivalencia.skus.map(s => {
                    const full = findProduto(s.id_interno || s.id) || {};
                    return {
                        ...full,
                        ...s,
                        id: s.id || full.id,
                        id_interno: s.id_interno || full.id_interno,
                        nome: s.nome || full.nome,
                        marca: s.marca || full.marca,
                        grupo_equivalencia_id: infoEquivalencia.grupo?.id || null,
                        grupo_equivalencia_nome: infoEquivalencia.grupo?.nome || infoEquivalencia.grupo?.codigo_grupo || null,
                        pertence_grupo: true,
                        _infoEquivalencia: infoEquivalencia
                    };
                });
            } else {
                const prodComGrupo = {
                    ...prod,
                    grupo_equivalencia_id: null,
                    grupo_equivalencia_nome: null,
                    pertence_grupo: false,
                    _infoEquivalencia: infoEquivalencia
                };
                state.modalAcceptedProducts = [prodComGrupo];
            }
        } else {
            const existingComp = anFindMatchingKitComponent(prod, infoEquivalencia, state.modalKitComponents);
            if (existingComp) {
                const isGrupo = Boolean(infoEquivalencia?.possui_grupo || existingComp.product?._infoEquivalencia?.possui_grupo);
                if (isGrupo) {
                    alert('Este grupo já está adicionado ao Kit. Ajuste a quantidade no componente existente.');
                } else {
                    alert('Este produto já está adicionado ao Kit. Ajuste a quantidade no componente existente.');
                }
                return;
            }

            const prodComGrupo = {
                ...prod,
                _infoEquivalencia: infoEquivalencia
            };
            state.modalKitComponents.push({ product: prodComGrupo, qty: 1 });
        }

        const container = document.getElementById('an-modal-body-container');
        if (container) {
            container.innerHTML = anRenderModalBodyContent();
        }
        anUpdateModalFooterInfo();
    };

    window.anRemoveAcceptedProduct = function (index) {
        const state = window.SharedMappingState;
        const target = state.modalAcceptedProducts[index];
        if (target?._infoEquivalencia?.possui_grupo || target?.pertence_grupo) {
            state.modalAcceptedProducts = [];
        } else {
            state.modalAcceptedProducts.splice(index, 1);
        }
        const container = document.getElementById('an-modal-body-container');
        if (container) {
            container.innerHTML = anRenderModalBodyContent();
        }
        anUpdateModalFooterInfo();
    };

    window.anChangeKitQty = function (index, delta) {
        const c = window.SharedMappingState.modalKitComponents[index];
        if (!c) return;
        c.qty = Math.max(1, c.qty + delta);
        const container = document.getElementById('an-modal-body-container');
        if (container) {
            container.innerHTML = anRenderModalBodyContent();
        }
        anUpdateModalFooterInfo();
    };

    window.anRemoveKitComponent = function (index) {
        window.SharedMappingState.modalKitComponents.splice(index, 1);
        const container = document.getElementById('an-modal-body-container');
        if (container) {
            container.innerHTML = anRenderModalBodyContent();
        }
        anUpdateModalFooterInfo();
    };

    // =========================================================================
    // GERENCIADOR OPERACIONAL DE GRUPOS DE EQUIVALÊNCIA
    // =========================================================================
    function anGerarCodigoGrupoFromNome(nome) {
        if (!nome) return 'EQ_GRUPO';
        let slug = normText(String(nome))
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        if (!slug) slug = 'GRUPO';
        return `EQ_${slug}`;
    }

    function anGerarSugestaoGrupo(targetProd) {
        if (!targetProd) return { nome: '', codigo: '' };
        let nomeOriginal = String(targetProd.nome || '').trim();
        let marca = String(targetProd.marca || '').trim();
        let nomeSugerido = nomeOriginal;

        if (marca && marca.length >= 2) {
            nomeSugerido = nomeSugerido.replace(new RegExp(marca.replace(/[^a-zA-Z0-9]/g, '\\$&'), 'gi'), '').trim();
        }

        nomeSugerido = nomeSugerido.replace(/^(Par|Kit|Jogo|Conjunto)\s+de\s+/i, '');
        nomeSugerido = nomeSugerido.replace(/^(Par|Kit|Jogo|Conjunto)\s+/i, '');
        nomeSugerido = nomeSugerido.replace(/[\s\-_]+/g, ' ').trim();

        if (!nomeSugerido || nomeSugerido.length < 3) {
            nomeSugerido = nomeOriginal || targetProd.id_interno || 'Grupo de Equivalência';
        }

        const codigoSugerido = anGerarCodigoGrupoFromNome(nomeSugerido);
        return { nome: nomeSugerido, codigo: codigoSugerido };
    }

    window.anOnEqManagerNomeInput = function (val) {
        const state = window.SharedMappingState;
        if (!state._eqManager) return;
        const mgr = state._eqManager;
        mgr.nome = val;
        if (!mgr.isGrupoExistente && !mgr.isCodigoManualmenteEditado) {
            mgr.codigo = anGerarCodigoGrupoFromNome(val);
            const codInput = document.getElementById('an-eq-codigo-input');
            if (codInput) codInput.value = mgr.codigo;
        }
    };

    window.anOnEqManagerCodigoInput = function (val) {
        const state = window.SharedMappingState;
        if (!state._eqManager) return;
        const mgr = state._eqManager;
        mgr.codigo = val;
        mgr.isCodigoManualmenteEditado = true;
    };

    window.anOpenEquivalenciaManagerModal = async function (targetIdInterno = null) {
        const state = window.SharedMappingState;
        let targetProd = null;

        if (targetIdInterno) {
            targetProd = findProduto(targetIdInterno);
        }
        if (!targetProd && state.modalAcceptedProducts && state.modalAcceptedProducts.length > 0) {
            targetProd = state.modalAcceptedProducts[0];
        }

        if (!targetProd) {
            if (typeof showToast === 'function') {
                showToast('Selecione ou adicione um produto primeiro para gerenciar a equivalência.', 'warning');
            }
            return;
        }

        const fullProd = findProduto(targetProd.id_interno || targetProd.id) || {};
        targetProd = { ...fullProd, ...targetProd };

        let infoEq = targetProd._infoEquivalencia;
        try {
            if (window.DataClient?.getEquivalenciaResolvidaByProdutoId && targetProd.id) {
                infoEq = await window.DataClient.getEquivalenciaResolvidaByProdutoId(targetProd.id);
            }
        } catch (err) {
            console.warn('[EQ_MANAGER] Erro ao buscar equivalência do produto:', err);
        }

        const isGrupo = Boolean(infoEq && infoEq.possui_grupo && infoEq.grupo);
        let membrosIniciais = [];
        if (isGrupo && Array.isArray(infoEq.skus) && infoEq.skus.length > 0) {
            membrosIniciais = infoEq.skus.map(s => {
                const full = findProduto(s.id_interno || s.id) || {};
                return { ...full, ...s };
            });
        } else {
            membrosIniciais = [{ ...targetProd }];
        }

        const sugestao = anGerarSugestaoGrupo(targetProd);
        const nomeInicial = isGrupo ? (infoEq.grupo.nome || '') : sugestao.nome;
        const codigoInicial = isGrupo ? (infoEq.grupo.codigo_grupo || '') : sugestao.codigo;

        state._eqManager = {
            isOpen: true,
            targetProduct: targetProd,
            isGrupoExistente: isGrupo,
            grupoId: isGrupo ? infoEq.grupo.id : null,
            nome: nomeInicial,
            codigo: codigoInicial,
            isCodigoManualmenteEditado: false,
            membros: membrosIniciais,
            search: '',
            errorMsg: '',
            saving: false
        };

        anRenderEquivalenciaManagerDOM();
    };

    function anRenderEquivalenciaManagerDOM() {
        const state = window.SharedMappingState;
        const mgr = state._eqManager;
        if (!mgr || !mgr.isOpen) return;

        let existing = document.getElementById('an-eq-manager-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'an-eq-manager-overlay';
        overlay.className = 'an-modal-overlay';
        overlay.style.zIndex = '100005';
        overlay.style.background = 'rgba(15, 23, 42, 0.7)';
        overlay.style.backdropFilter = 'blur(4px)';

        overlay.innerHTML = `
            <div class="an-modal-content" style="max-width:680px;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.4);background:#fff;display:flex;flex-direction:column;max-height:85vh;">
                <header class="an-modal-header" style="border-bottom:1px solid #e2e8f0;padding:16px 20px;">
                    <div>
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <span class="material-symbols-rounded" style="color:#ea580c;font-size:22px;">settings_suggest</span>
                            <h3 style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">
                                ${mgr.isGrupoExistente ? 'Gerenciar Grupo de Equivalência' : 'Criar Grupo de Equivalência'}
                            </h3>
                        </div>
                        <small style="color:#64748b;font-size:12px;">
                            ${mgr.isGrupoExistente ? 'Edite o nome ou adicione/remova produtos deste grupo de equivalência.' : 'Transforme este produto em um grupo para aceitar marcas alternativas na separação.'}
                        </small>
                    </div>
                    <button type="button" class="an-modal-close-btn" onclick="anCloseEquivalenciaManagerModal()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </header>

                <div class="an-modal-body" style="padding:20px;overflow-y:auto;flex:1;">
                    ${mgr.errorMsg ? `
                        <div style="padding:10px 14px;margin-bottom:14px;font-size:12px;font-weight:700;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;display:flex;align-items:center;gap:8px;">
                            <span class="material-symbols-rounded" style="font-size:18px;">warning</span>
                            <div>${escapeHtml(mgr.errorMsg)}</div>
                        </div>
                    ` : ''}

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                        <div>
                            <label style="font-size:11px;font-weight:800;color:#475569;display:block;margin-bottom:4px;">Nome do Grupo *</label>
                            <input type="text" id="an-eq-nome-input" value="${escapeHtml(mgr.nome)}" oninput="anOnEqManagerNomeInput(this.value)" placeholder="Ex: Lâmpada LED H1 C6" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;outline:none;color:#0f172a;font-weight:600;">
                        </div>
                        <div>
                            <label style="font-size:11px;font-weight:800;color:#475569;display:block;margin-bottom:4px;">Código do Grupo *</label>
                            <input type="text" id="an-eq-codigo-input" value="${escapeHtml(mgr.codigo)}" ${mgr.isGrupoExistente ? 'disabled style="background:#f1f5f9;color:#64748b;cursor:not-allowed;width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;outline:none;font-weight:700;"' : 'oninput="anOnEqManagerCodigoInput(this.value)" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;outline:none;color:#0f172a;font-weight:700;"'}>
                        </div>
                    </div>

                    <div style="margin-bottom:20px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                            <label style="font-size:12px;font-weight:800;color:#1e293b;">Membros do Grupo (${mgr.membros.length})</label>
                            <span style="font-size:11px;color:#64748b;">Todos estes produtos serão equivalentes.</span>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px;background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #e2e8f0;max-height:160px;overflow-y:auto;">
                            ${mgr.membros.length === 0 ? `
                                <span style="font-size:12px;color:#94a3b8;text-align:center;padding:12px;">Nenhum membro no grupo ainda.</span>
                            ` : mgr.membros.map((m, idx) => `
                                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;">
                                    <div>
                                        <strong style="color:#0f172a;">${escapeHtml(m.id_interno || m.sku || 'SKU')} — ${escapeHtml(m.nome || '')}</strong>
                                        <span style="font-size:11px;color:#64748b;margin-left:8px;">Marca: <b>${escapeHtml(m.marca || '-')}</b></span>
                                    </div>
                                    <button type="button" onclick="anRemoveMemberFromEqManager(${idx})" style="background:none;border:none;color:#ef4444;cursor:pointer;padding:4px;display:flex;align-items:center;" title="Remover membro do grupo">
                                        <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div>
                        <label style="font-size:12px;font-weight:800;color:#1e293b;display:block;margin-bottom:6px;">Pesquisar Produtos Internos para Adicionar:</label>
                        <div class="an-catalog-search-bar" style="margin-bottom:10px;background:#ffffff;border:1px solid #cbd5e1;border-radius:10px;padding:0 14px;display:flex;align-items:center;gap:10px;">
                            <span class="material-symbols-rounded" style="color:#64748b;font-size:20px;">search</span>
                            <input type="text" value="${escapeHtml(mgr.search)}" oninput="anOnEqManagerSearchInput(this.value)" placeholder="Pesquisar por ID interno, Nome, Marca (Osram, Philips...), EAN ou SKU..." style="width:100%;border:none;outline:none;font-size:13px;background:transparent;color:#0f172a;padding:10px 0;font-weight:600;">
                        </div>
                        <div id="an-eq-manager-search-results" style="max-height:200px;overflow-y:auto;">
                            ${anRenderEqManagerSearchResults()}
                        </div>
                    </div>
                </div>

                <footer class="an-modal-footer" style="border-top:1px solid #e2e8f0;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;">
                    <small style="color:#64748b;font-size:11px;">Cada SKU física pertence a no máximo 1 grupo de equivalência ativo.</small>
                    <div style="display:flex;gap:10px;">
                        <button type="button" class="an-btn an-btn-outline" onclick="anCloseEquivalenciaManagerModal()">Cancelar</button>
                        <button type="button" class="an-btn an-btn-primary" ${mgr.saving ? 'disabled' : ''} onclick="anSaveEqManager()">
                            <span class="material-symbols-rounded">save</span>
                            ${mgr.saving ? 'Salvando...' : (mgr.isGrupoExistente ? 'Salvar Alterações' : 'Criar e Vincular Grupo')}
                        </button>
                    </div>
                </footer>
            </div>
        `;

        document.body.appendChild(overlay);
    }

    window.anCloseEquivalenciaManagerModal = function () {
        const state = window.SharedMappingState;
        if (state._eqManager) {
            state._eqManager.isOpen = false;
        }
        const el = document.getElementById('an-eq-manager-overlay');
        if (el) el.remove();
    };

    window.anOnEqManagerSearchInput = function (term) {
        const state = window.SharedMappingState;
        if (!state._eqManager) return;
        state._eqManager.search = term;
        const resEl = document.getElementById('an-eq-manager-search-results');
        if (resEl) resEl.innerHTML = anRenderEqManagerSearchResults();
    };

    function anRenderEqManagerSearchResults() {
        const state = window.SharedMappingState;
        const mgr = state._eqManager;
        if (!mgr) return '';

        const rawSearch = String(mgr.search || '').trim();
        const catalog = getCatalogoAtual();

        if (!catalog.length) {
            return '<div style="padding:16px;text-align:center;color:#64748b;font-size:12px;">Carregando catálogo...</div>';
        }

        if (rawSearch.length < 2) {
            return '<div style="padding:16px;text-align:center;color:#64748b;font-size:12px;">Digite pelo menos 2 caracteres para pesquisar equivalentes.</div>';
        }

        const normQuery = normText(rawSearch);
        const tokens = normQuery.split(/\s+/).filter(Boolean);

        const matched = [];
        for (const p of catalog) {
            const corpusFields = [p.id_interno, p.nome, p.marca, p.ean, p.sku_fornecedor, p.palavras_chave].filter(Boolean);
            const corpusNorm = normText(corpusFields.join(' '));

            const isMatch = tokens.every(token => corpusNorm.includes(token));
            if (!isMatch) continue;

            const normId = normText(p.id_interno);
            const normEan = normText(p.ean);
            const normSku = normText(p.sku_fornecedor);
            const normNome = normText(p.nome);

            let score = 0;
            if (normId === normQuery) score += 1000;
            else if (normEan === normQuery) score += 900;
            else if (normSku === normQuery) score += 800;
            else if (normNome === normQuery) score += 700;
            else if (normNome.startsWith(normQuery)) score += 500;
            else if (normId.startsWith(normQuery)) score += 400;
            else if (tokens.every(t => normNome.includes(t))) score += 300;
            else if (tokens.every(t => normId.includes(t))) score += 200;
            else score += 100;

            matched.push({ product: p, score });
        }

        if (!matched.length) {
            return '<div style="padding:16px;text-align:center;color:#64748b;font-size:12px;">Nenhum produto encontrado com os termos pesquisados.</div>';
        }

        matched.sort((a, b) => b.score - a.score || String(a.product.id_interno).localeCompare(String(b.product.id_interno)));
        const displayList = matched.slice(0, 15).map(m => m.product);

        return displayList.map(p => {
            const isMember = mgr.membros.some(m => String(m.id_interno) === String(p.id_interno) || String(m.id || m.produto_id) === String(p.id));

            return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;">
                    <div>
                        <strong style="color:#0f172a;">${escapeHtml(p.id_interno)} — ${escapeHtml(p.nome)}</strong>
                        <div style="font-size:11px;color:#64748b;">Marca: <b>${escapeHtml(p.marca)}</b> | EAN: ${escapeHtml(p.ean || '-')}</div>
                    </div>
                    <button type="button" ${isMember ? 'disabled style="background:#e2e8f0;color:#94a3b8;cursor:default;border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;"' : 'style="background:#f97316;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;"'} onclick="anAddMemberToEqManager('${escapeHtml(p.id_interno)}')">
                        ${isMember ? 'Já no grupo' : '+ Adicionar ao Grupo'}
                    </button>
                </div>
            `;
        }).join('');
    }

    window.anAddMemberToEqManager = async function (idInterno) {
        const state = window.SharedMappingState;
        const mgr = state._eqManager;
        if (!mgr) return;

        const prod = findProduto(idInterno);
        if (!prod) return;

        mgr.errorMsg = '';

        // Proteção de Grupo Duplo: verifica se o produto já pertence a outro grupo ativo no banco
        try {
            if (window.DataClient?.getEquivalenciaResolvidaByProdutoId && prod.id) {
                const checkEq = await window.DataClient.getEquivalenciaResolvidaByProdutoId(prod.id);
                if (checkEq && checkEq.possui_grupo && checkEq.grupo) {
                    if (String(checkEq.grupo.id) !== String(mgr.grupoId)) {
                        mgr.errorMsg = `Este produto (${prod.id_interno} — ${prod.nome}) já pertence ao grupo "${checkEq.grupo.nome || checkEq.grupo.codigo_grupo}". Cada SKU pode pertencer a no máximo UM grupo ativo.`;
                        anRenderEquivalenciaManagerDOM();
                        return;
                    }
                }
            }
        } catch (err) {
            console.warn('[EQ_MANAGER] Erro ao validar pertencimento do produto:', err);
        }

        if (!mgr.membros.some(m => String(m.id_interno) === String(prod.id_interno) || String(m.id || m.produto_id) === String(prod.id))) {
            mgr.membros.push(prod);
        }

        anRenderEquivalenciaManagerDOM();
    };

    window.anRemoveMemberFromEqManager = function (index) {
        const state = window.SharedMappingState;
        const mgr = state._eqManager;
        if (!mgr) return;

        mgr.errorMsg = '';
        mgr.membros.splice(index, 1);
        anRenderEquivalenciaManagerDOM();
    };

    window.anSaveEqManager = async function () {
        const state = window.SharedMappingState;
        const mgr = state._eqManager;
        if (!mgr) return;

        mgr.errorMsg = '';

        const nome = String(mgr.nome || '').trim();
        const codigo = String(mgr.codigo || '').trim();

        if (!nome) {
            mgr.errorMsg = 'Por favor, informe o Nome do Grupo.';
            anRenderEquivalenciaManagerDOM();
            return;
        }

        if (!codigo) {
            mgr.errorMsg = 'Por favor, informe o Código do Grupo.';
            anRenderEquivalenciaManagerDOM();
            return;
        }

        if (!mgr.membros.length) {
            mgr.errorMsg = 'O grupo precisa conter pelo menos 1 produto membro.';
            anRenderEquivalenciaManagerDOM();
            return;
        }

        mgr.saving = true;
        anRenderEquivalenciaManagerDOM();

        try {
            let targetGrupoId = mgr.grupoId;

            if (!mgr.isGrupoExistente) {
                // Validação de unicidade do código
                try {
                    if (window.DataClient?.listGruposEquivalencia) {
                        const todosGrupos = await window.DataClient.listGruposEquivalencia(false);
                        const codigoUpper = codigo.toUpperCase();
                        const existe = todosGrupos.some(g => String(g.codigo_grupo || '').trim().toUpperCase() === codigoUpper);
                        if (existe) {
                            mgr.saving = false;
                            mgr.errorMsg = `Já existe um grupo de equivalência cadastrado com este código ("${codigo}"). Por favor, defina um código único.`;
                            anRenderEquivalenciaManagerDOM();
                            return;
                        }
                    }
                } catch (errCodeCheck) {
                    console.warn('[EQ_MANAGER] Erro ao validar unicidade de código:', errCodeCheck);
                }

                // Criação de novo grupo via DataClient
                const novoGrupo = await window.DataClient.createGrupoEquivalencia({
                    codigo_grupo: codigo,
                    nome: nome,
                    descricao: `Criado operacionalmente via modal de mapping para ${mgr.targetProduct.id_interno}`
                });
                targetGrupoId = novoGrupo.id;

                // Associa membros ao novo grupo
                for (const m of mgr.membros) {
                    const prodId = m.id || m.produto_id;
                    if (prodId) {
                        await window.DataClient.addSkuAoGrupoEquivalencia(targetGrupoId, prodId);
                    }
                }
            } else {
                // Atualização do nome do grupo existente
                await window.DataClient.updateGrupoEquivalencia(targetGrupoId, { nome });

                // Sincronização de membros no banco
                const dbSkus = await window.DataClient.getSkusGrupoEquivalencia(targetGrupoId);
                const dbProdIds = dbSkus.map(x => String(x.produto_id));
                const targetProdIds = mgr.membros.map(x => String(x.id || x.produto_id)).filter(Boolean);

                // Adiciona novos membros
                for (const m of mgr.membros) {
                    const pId = String(m.id || m.produto_id);
                    if (pId && !dbProdIds.includes(pId)) {
                        await window.DataClient.addSkuAoGrupoEquivalencia(targetGrupoId, pId);
                    }
                }

                // Remove membros retirados do grupo
                for (const itemDb of dbSkus) {
                    const pIdDb = String(itemDb.produto_id);
                    if (!targetProdIds.includes(pIdDb)) {
                        await window.DataClient.removeSkuDoGrupoEquivalencia(targetGrupoId, pIdDb);
                    }
                }
            }

            // Reconsultar o estado atualizado do produto alvo
            const freshInfo = await window.DataClient.getEquivalenciaResolvidaByProdutoId(mgr.targetProduct.id);

            if (state.modalMode === 'equivalents') {
                if (freshInfo && freshInfo.possui_grupo && Array.isArray(freshInfo.skus) && freshInfo.skus.length > 0) {
                    state.modalAcceptedProducts = freshInfo.skus.map(s => {
                        const full = findProduto(s.id_interno || s.id) || {};
                        return {
                            ...full,
                            ...s,
                            id: s.id || full.id,
                            id_interno: s.id_interno || full.id_interno,
                            nome: s.nome || full.nome,
                            marca: s.marca || full.marca,
                            grupo_equivalencia_id: freshInfo.grupo?.id || null,
                            grupo_equivalencia_nome: freshInfo.grupo?.nome || freshInfo.grupo?.codigo_grupo || null,
                            pertence_grupo: true,
                            _infoEquivalencia: freshInfo
                        };
                    });
                }
            } else if (state.modalMode === 'kit') {
                // Atualiza componente correspondente no Kit
                const compIndex = state.modalKitComponents.findIndex(c => c.product.id === mgr.targetProduct.id || c.product.id_interno === mgr.targetProduct.id_interno);
                if (compIndex >= 0) {
                    state.modalKitComponents[compIndex].product._infoEquivalencia = freshInfo;
                }
            }

            anCloseEquivalenciaManagerModal();

            const container = document.getElementById('an-modal-body-container');
            if (container) {
                container.innerHTML = anRenderModalBodyContent();
            }
            anUpdateModalFooterInfo();

            if (typeof showToast === 'function') {
                showToast('Grupo de equivalência salvo com sucesso!', 'success');
            }
        } catch (err) {
            console.error('[EQ_MANAGER] Erro ao salvar grupo de equivalência:', err);
            mgr.saving = false;
            mgr.errorMsg = err.message || 'Erro ao salvar grupo de equivalência. Tente novamente.';
            anRenderEquivalenciaManagerDOM();
        }
    };

    // Confirmação e Salvamento do Mapeamento Compartilhado
    window.confirmSharedModalMapping = async function () {
        const state = window.SharedMappingState;
        if (!state || !state.context) return;
        const context = state.context;

        const btnSave = document.querySelector('#an-mapping-modal-overlay .an-btn-primary');
        if (btnSave && btnSave.disabled) return;

        // Regra 14: Validação estrita do accountId (Sem fallback)
        const accIdNum = Number(context.accountId);
        if (!Number.isInteger(accIdNum) || accIdNum <= 0) {
            if (typeof showToast === 'function') {
                showToast('Conta operacional ainda não vinculada. A identificação ficará disponível após a conta ser reconciliada.', 'warning');
            }
            return;
        }

        try {
            if (btnSave) {
                btnSave.disabled = true;
                btnSave.textContent = 'Salvando...';
            }

            let tipoIdentificacao = 'produto';
            let componentesPayload = [];
            const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            if (state.modalMode === 'equivalents') {
                if (!state.modalAcceptedProducts.length) {
                    if (typeof showToast === 'function') showToast('Adicione pelo menos um produto ao mapeamento.', 'warning');
                    return;
                }
                const p = state.modalAcceptedProducts[0];
                if (!p || !p.id || !UUID_REGEX.test(p.id)) {
                    throw new Error(`Produto ${p?.id_interno || ''} não possui UUID válido da tabela public.produtos.`);
                }
                tipoIdentificacao = 'produto';
                const infoEq = p._infoEquivalencia;

                if (infoEq && infoEq.possui_grupo && infoEq.grupo) {
                    componentesPayload.push({
                        grupo_equivalencia_id: infoEq.grupo.id,
                        produto_id: null,
                        produto_referencia_id: p.id,
                        quantidade_por_unidade: 1
                    });
                } else {
                    componentesPayload.push({
                        produto_id: p.id,
                        grupo_equivalencia_id: null,
                        produto_referencia_id: p.id,
                        quantidade_por_unidade: 1
                    });
                }
            } else {
                if (!state.modalKitComponents.length) {
                    if (typeof showToast === 'function') showToast('Adicione pelo menos um componente ao kit.', 'warning');
                    return;
                }
                tipoIdentificacao = componentesPayload.length >= 2 ? 'kit' : 'produto';
                componentesPayload = state.modalKitComponents.map(c => {
                    const infoEq = c.product._infoEquivalencia;
                    if (infoEq && infoEq.possui_grupo && infoEq.grupo) {
                        return {
                            grupo_equivalencia_id: infoEq.grupo.id,
                            produto_id: null,
                            produto_referencia_id: c.product.id,
                            quantidade_por_unidade: c.qty
                        };
                    } else {
                        return {
                            produto_id: c.product.id,
                            grupo_equivalencia_id: null,
                            produto_referencia_id: c.product.id,
                            quantidade_por_unidade: c.qty
                        };
                    }
                });
            }

            const uiMapping = {
                type: tipoIdentificacao === 'kit' ? 'kit' : (state.modalAcceptedProducts.length > 1 ? 'equivalents' : 'single'),
                products: state.modalAcceptedProducts.map(p => ({ ...p })),
                components: state.modalKitComponents.map(c => ({ product: { ...c.product }, qty: c.qty }))
            };

            // Se for operação em lote (batch), aciona a pré-validação antes de gravar no banco
            if (context.isBatch && typeof context.onSavedBatch === 'function') {
                document.getElementById('an-mapping-modal-overlay')?.remove();
                await context.onSavedBatch({ tipoIdentificacao, componentesPayload, chosenUiMapping: uiMapping });
                return;
            }

            // Regra 10: Trata variação
            const varIdClean = (context.variationId && String(context.variationId).trim()) ? String(context.variationId).trim() : null;

            // Salva transacionalmente no Supabase com accountId explícito
            if (window.DataClient?.saveMercadoLivreItemMappingTransacional && context.itemId && accIdNum > 0) {
                const currentUser = localStorage.getItem('currentUser') || 'usuario';
                const savedMapping = await window.DataClient.saveMercadoLivreItemMappingTransacional({
                    accountId: accIdNum,
                    itemId: String(context.itemId).trim(),
                    variationId: varIdClean,
                    tipoIdentificacao: tipoIdentificacao,
                    observacao: `Mapeado via painel compartilhado em ${new Date().toLocaleString()}`,
                    componentes: componentesPayload,
                    criadoPor: currentUser
                });
                console.log('[SHARED_MAPPING] Mapeamento salvo no Supabase:', savedMapping);
            }

            document.getElementById('an-mapping-modal-overlay')?.remove();

            if (typeof context.onSaved === 'function') {
                await context.onSaved({ uiMapping, tipoIdentificacao, componentesPayload });
            }
        } catch (error) {
            console.error('[SHARED_MAPPING] Erro ao salvar mapeamento:', error);
            if (typeof showToast === 'function') {
                showToast(error.message || 'Erro ao salvar mapeamento do item.', 'error');
            }
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.textContent = 'Salvar Mapeamento';
            }
        }
    };

    // =========================================================================
    // LÓGICA DE PRÉ-VALIDAÇÃO, COMPARAÇÃO CANÔNICA E EXECUÇÃO EM MASSA
    // =========================================================================

    function getCanonicalComponentsSignatureFromPayload(payload) {
        const list = (payload || []).map(c => {
            const key = c.grupo_equivalencia_id ? `g:${c.grupo_equivalencia_id}` : `p:${c.produto_id || c.produto_referencia_id}`;
            const qty = Number(c.quantidade_por_unidade || c.quantidade || 1);
            return `${key}:${qty}`;
        });
        list.sort();
        return list.join('|');
    }

    function getCanonicalComponentsSignatureFromMapping(mapping) {
        if (!mapping) return '';

        if (mapping.components && Array.isArray(mapping.components) && mapping.components.length > 0) {
            const list = mapping.components.map(c => {
                const p = c.product || {};
                const infoEq = p._infoEquivalencia;
                const gId = infoEq?.grupo?.id || p.grupo_equivalencia_id || null;
                const key = gId ? `g:${gId}` : `p:${p.id}`;
                const qty = Number(c.qty || 1);
                return `${key}:${qty}`;
            });
            list.sort();
            return list.join('|');
        }

        if (mapping.products && Array.isArray(mapping.products) && mapping.products.length > 0) {
            const list = mapping.products.map(p => {
                const infoEq = p._infoEquivalencia;
                const gId = infoEq?.grupo?.id || p.grupo_equivalencia_id || null;
                const key = gId ? `g:${gId}` : `p:${p.id}`;
                return `${key}:1`;
            });
            list.sort();
            return list.join('|');
        }

        return '';
    }

    function classifyBatchItem(item, chosenPayload) {
        const isMapped = item.situacao_mapeamento === 'MAPEADO' && item.mapping;
        if (!isMapped) return 'NAO_MAPEADO';

        const chosenSig = getCanonicalComponentsSignatureFromPayload(chosenPayload);
        const currentSig = getCanonicalComponentsSignatureFromMapping(item.mapping);

        if (chosenSig && currentSig && chosenSig === currentSig) {
            return 'JA_CORRETO';
        }
        return 'CONFLITO';
    }

    async function anOpenMassMappingPreValidationModal({ batchItems, tipoIdentificacao, componentesPayload, chosenUiMapping }) {
        const naoMapeados = [];
        const jaCorretos = [];
        const conflitos = [];

        for (const item of batchItems) {
            const status = classifyBatchItem(item, componentesPayload);
            if (status === 'NAO_MAPEADO') naoMapeados.push(item);
            else if (status === 'JA_CORRETO') jaCorretos.push(item);
            else conflitos.push(item);
        }

        const overlay = document.createElement('div');
        overlay.className = 'an-modal-overlay fade-in';
        overlay.id = 'an-batch-confirm-overlay';

        const firstProd = chosenUiMapping.products?.[0] || chosenUiMapping.components?.[0]?.product;
        const chosenLabel = tipoIdentificacao === 'kit'
            ? `Kit Composto (${chosenUiMapping.components?.length || 0} componentes)`
            : (firstProd?._infoEquivalencia?.possui_grupo ? `Grupo: ${firstProd._infoEquivalencia.grupo.nome || firstProd._infoEquivalencia.grupo.codigo_grupo}` : `Produto: ${firstProd?.id_interno || 'SKU'} — ${firstProd?.nome || ''}`);

        overlay.innerHTML = `
            <div class="an-modal" style="max-width:680px;" onclick="event.stopPropagation()">
                <header class="an-modal-header">
                    <div>
                        <small style="color:#ea580c;font-weight:800;text-transform:uppercase;"><span class="material-symbols-rounded" style="font-size:16px;">fact_check</span> Mapeamento em Massa — Confirmação</small>
                        <h2 style="margin:4px 0 0;">Resumo da Operação</h2>
                    </div>
                    <button type="button" class="an-modal-close" onclick="document.getElementById('an-batch-confirm-overlay').remove()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </header>
                <div class="an-modal-body" style="padding:20px 24px;">
                    <div style="padding:12px 16px;background:#fff7ed;border:1px solid #ffedd5;border-radius:10px;margin-bottom:16px;">
                        <small style="font-size:11px;font-weight:800;color:#c2410c;text-transform:uppercase;display:block;margin-bottom:2px;">Identificação Escolhida para o Lote:</small>
                        <strong style="color:#0f172a;font-size:14px;">${escapeHtml(chosenLabel)}</strong>
                    </div>

                    <div class="an-batch-summary-grid">
                        <div class="an-batch-summary-card total">
                            <strong>${batchItems.length}</strong>
                            <small>Selecionados</small>
                        </div>
                        <div class="an-batch-summary-card new">
                            <strong>${naoMapeados.length}</strong>
                            <small>Serão Gravados</small>
                        </div>
                        <div class="an-batch-summary-card correct">
                            <strong>${jaCorretos.length}</strong>
                            <small>Já Corretos</small>
                        </div>
                        <div class="an-batch-summary-card conflict">
                            <strong>${conflitos.length}</strong>
                            <small>Conflitos</small>
                        </div>
                    </div>

                    <div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:12px;color:#475569;margin-bottom:16px;">
                        <div style="display:flex;align-items:center;gap:6px;font-weight:700;color:#0f172a;margin-bottom:4px;">
                            <span class="material-symbols-rounded" style="color:#0284c7;font-size:18px;">shield</span>
                            Regra de Segurança desta Etapa:
                        </div>
                        <ul style="margin:0;padding-left:18px;line-height:1.5;">
                            <li>Itens <b>não mapeados</b> (${naoMapeados.length}) receberão a identificação acima no Supabase.</li>
                            <li>Itens <b>já corretos</b> (${jaCorretos.length}) serão ignorados sem alterações desnecessárias.</li>
                            <li>Itens com <b>conflito de mapeamento diferente</b> (${conflitos.length}) <u>não serão sobrescritos</u> nesta fase inicial.</li>
                        </ul>
                    </div>
                </div>
                <footer class="an-modal-footer" style="padding:16px 24px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                    <button type="button" class="an-btn an-btn-outline" onclick="document.getElementById('an-batch-confirm-overlay').remove()">Cancelar</button>
                    <button type="button" id="an-btn-confirm-batch-save" class="an-btn an-btn-primary" ${naoMapeados.length === 0 ? 'disabled style="background:#cbd5e1;cursor:default;"' : ''}>
                        <span class="material-symbols-rounded">save</span>
                        ${naoMapeados.length > 0 ? `Confirmar ${naoMapeados.length} Mapeamento(s)` : 'Nenhum item novo a gravar'}
                    </button>
                </footer>
            </div>
        `;

        document.body.appendChild(overlay);

        const btnConfirm = document.getElementById('an-btn-confirm-batch-save');
        if (btnConfirm && naoMapeados.length > 0) {
            btnConfirm.onclick = () => {
                anExecuteMassMappingProcess({
                    naoMapeados,
                    jaCorretos,
                    conflitos,
                    tipoIdentificacao,
                    componentesPayload,
                    chosenUiMapping
                });
            };
        }
    }

    async function anExecuteMassMappingProcess({ naoMapeados, jaCorretos, conflitos, tipoIdentificacao, componentesPayload, chosenUiMapping }) {
        const confirmOverlay = document.getElementById('an-batch-confirm-overlay');
        const btnConfirm = document.getElementById('an-btn-confirm-batch-save');

        if (btnConfirm) {
            btnConfirm.disabled = true;
            btnConfirm.innerHTML = `<span class="material-symbols-rounded" style="animation:spin 1s linear infinite;">sync</span> Gravando...`;
        }

        const currentUser = localStorage.getItem('currentUser') || 'usuario';
        const results = {
            SUCESSO: [],
            JA_CORRETO: [...jaCorretos],
            CONFLITO: [...conflitos],
            ERRO: []
        };

        const totalToSave = naoMapeados.length;
        const progressEl = confirmOverlay?.querySelector('.an-modal-body');

        for (let i = 0; i < totalToSave; i++) {
            const item = naoMapeados[i];

            if (progressEl) {
                progressEl.innerHTML = `
                    <div style="padding:32px 16px;text-align:center;">
                        <span class="material-symbols-rounded" style="font-size:36px;color:#ea580c;animation:spin 1s linear infinite;margin-bottom:12px;display:block;">sync</span>
                        <h3 style="margin:0 0 6px;font-size:16px;color:#0f172a;">Mapeando em Massa no Supabase...</h3>
                        <p style="margin:0;font-size:13px;color:#64748b;">Mapeando ${i + 1} de ${totalToSave} — <b>${escapeHtml(item.titulo)}</b></p>
                        <div style="margin-top:16px;width:100%;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
                            <div style="width:${Math.round(((i + 1) / totalToSave) * 100)}%;height:100%;background:#ea580c;transition:width 0.2s ease;"></div>
                        </div>
                    </div>
                `;
            }

            try {
                const accIdNum = Number(item.accountId);
                const itemIdStr = String(item.itemId).trim();
                const varIdStr = item.variationId ? String(item.variationId).trim() : null;

                if (window.DataClient?.saveMercadoLivreItemMappingTransacional) {
                    await window.DataClient.saveMercadoLivreItemMappingTransacional({
                        accountId: accIdNum,
                        itemId: itemIdStr,
                        variationId: varIdStr,
                        tipoIdentificacao: tipoIdentificacao,
                        observacao: `Mapeado em massa via painel de anúncios em ${new Date().toLocaleString()}`,
                        componentes: componentesPayload,
                        criadoPor: currentUser
                    });
                }

                if (item.variationRef && item.anuncioRef?.has_variations) {
                    item.variationRef.mapping = chosenUiMapping;
                    item.variationRef.situacao_mapeamento = 'MAPEADO';
                    const allMapped = item.anuncioRef.variations.every(v => v.situacao_mapeamento === 'MAPEADO');
                    item.anuncioRef.situacao_mapeamento = allMapped ? 'MAPEADO' : 'PARCIAL';
                } else if (item.anuncioRef) {
                    item.anuncioRef.mapping = chosenUiMapping;
                    item.anuncioRef.situacao_mapeamento = 'MAPEADO';
                }

                results.SUCESSO.push(item);
            } catch (err) {
                console.error('[MASS_MAPPING_SAVE_ERROR]', item, err);
                results.ERRO.push({ item, errorMsg: err.message || 'Erro ao salvar no banco.' });
            }
        }

        confirmOverlay?.remove();

        const massState = window.AnunciosMassSelectionState;
        for (const item of results.SUCESSO) {
            massState.selectedKeys.delete(item.key);
            massState.selectedItems.delete(item.key);
        }
        if (massState.selectedItems.size === 0) {
            massState.batchAccountId = null;
        }

        renderAnunciosScreen(false);
        atualizarContadoresResumo();

        anShowMassMappingResultModal(results);
    }

    function anShowMassMappingResultModal(results) {
        const overlay = document.createElement('div');
        overlay.className = 'an-modal-overlay fade-in';
        overlay.id = 'an-batch-result-overlay';

        const hasErrors = results.ERRO.length > 0;

        overlay.innerHTML = `
            <div class="an-modal" style="max-width:620px;" onclick="event.stopPropagation()">
                <header class="an-modal-header">
                    <div>
                        <small style="color:${hasErrors ? '#d97706' : '#166534'};font-weight:800;text-transform:uppercase;"><span class="material-symbols-rounded" style="font-size:16px;">task_alt</span> Mapeamento Concluído</small>
                        <h2 style="margin:4px 0 0;">Resultado da Operação em Massa</h2>
                    </div>
                    <button type="button" class="an-modal-close" onclick="document.getElementById('an-batch-result-overlay').remove()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </header>
                <div class="an-modal-body" style="padding:20px 24px;">
                    <div class="an-batch-summary-grid">
                        <div class="an-batch-summary-card new">
                            <strong>${results.SUCESSO.length}</strong>
                            <small>Sucesso</small>
                        </div>
                        <div class="an-batch-summary-card correct">
                            <strong>${results.JA_CORRETO.length}</strong>
                            <small>Já Corretos</small>
                        </div>
                        <div class="an-batch-summary-card conflict">
                            <strong>${results.CONFLITO.length}</strong>
                            <small>Conflitos</small>
                        </div>
                        <div class="an-batch-summary-card error">
                            <strong>${results.ERRO.length}</strong>
                            <small>Erros</small>
                        </div>
                    </div>

                    ${hasErrors ? `
                        <div style="margin-top:16px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
                            <strong style="color:#991b1b;font-size:13px;display:block;margin-bottom:6px;">Falhas de Salvamento (${results.ERRO.length}):</strong>
                            <div style="max-height:140px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
                                ${results.ERRO.map(e => `
                                    <div style="font-size:11px;color:#991b1b;background:#fff;padding:6px 10px;border-radius:6px;border:1px solid #fee2e2;">
                                        <strong>${escapeHtml(e.item.titulo)}</strong> (${escapeHtml(e.item.itemId)})<br>
                                        <span>Motivo: ${escapeHtml(e.errorMsg)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : `
                        <div style="margin-top:12px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;color:#166534;font-size:13px;text-align:center;">
                            <span class="material-symbols-rounded" style="font-size:24px;vertical-align:middle;margin-right:6px;">check_circle</span>
                            Todos os mapeamentos válidos foram gravados e aplicados com sucesso!
                        </div>
                    `}
                </div>
                <footer class="an-modal-footer" style="padding:16px 24px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;">
                    <button type="button" class="an-btn an-btn-primary" onclick="document.getElementById('an-batch-result-overlay').remove()">Concluir</button>
                </footer>
            </div>
        `;

        document.body.appendChild(overlay);
    }

})();
