(function initPurchasePlanning(global) {
    'use strict';

    const STATUS = Object.freeze({
        OK: 'OK',
        BUY: 'COMPRAR',
        CRITICAL: 'CRITICO'
    });

    const FILTER = Object.freeze({
        ALL: 'todos',
        BUY: 'comprar',
        CRITICAL: 'criticos'
    });

    const STATUS_ORDER = Object.freeze({
        [STATUS.CRITICAL]: 0,
        [STATUS.BUY]: 1,
        [STATUS.OK]: 2
    });

    function asNumber(value, fallback = 0) {
        const parsed = Number(String(value ?? '').replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatQuantity(value, maximumFractionDigits = 2) {
        return asNumber(value, 0).toLocaleString('pt-BR', {
            minimumFractionDigits: 0,
            maximumFractionDigits
        });
    }

    function formatMoney(value) {
        return asNumber(value, 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    }

    function formatDate(value) {
        if (!value) return '-';
        const [year, month, day] = String(value).slice(0, 10).split('-');
        return year && month && day ? `${day}/${month}/${year}` : String(value);
    }

    function todayISO() {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
    }

    class PurchasePlanningItem {
        constructor(row = {}) {
            this.code = String(row.id_interno || '').trim();
            this.description = String(row.descricao || 'Produto sem descricao').trim();
            this.brand = String(row.marca || '').trim();
            this.sku = String(row.sku_fornecedor || '').trim();
            this.mainLocation = String(row.local_principal || '-');
            this.currentStock = asNumber(row.estoque_disponivel);
            this.historyDays = Math.max(1, Math.trunc(asNumber(row.dias_historico, 1)));
            this.outputs = asNumber(row.saidas_periodo);
            this.dailyAverage = asNumber(row.media_diaria);
            this.dailyDeviation = asNumber(row.desvio_diario);
            this.abcValue = String(row.abc_valor || 'C');
            this.abcOutput = String(row.abc_saida || 'C');
            this.abcCombined = String(row.abc_combinado || 'CC');
            this.zFactor = asNumber(row.fator_z, 1.65);
            this.leadTimeDays = Math.max(1, Math.trunc(asNumber(row.lead_time_dias, 7)));
            this.leadTimeSamples = Math.max(0, Math.trunc(asNumber(row.amostras_lead_time)));
            this.safetyStock = asNumber(row.estoque_seguranca);
            this.minimumStock = asNumber(row.estoque_minimo_calculado);
            this.idealStock = asNumber(row.estoque_ideal_calculado);
            this.pendingQuantity = asNumber(row.quantidade_em_pedido);
            this.suggestedQuantity = asNumber(row.quantidade_sugerida);
            this.estimatedCost = asNumber(row.custo_estimado);
            this.status = String(row.status_planejamento || STATUS.OK).toUpperCase();
            this.calculationMode = String(row.modo_calculo || 'MANUAL').toUpperCase();
            this.purchasePackage = Math.max(1, asNumber(row.embalagem_compra, 1));
            this.coverageDays = this.dailyAverage > 0
                ? this.currentStock / this.dailyAverage
                : null;
            this.searchIndex = normalizeText(
                `${this.code} ${this.description} ${this.brand} ${this.sku} ${this.abcCombined} ${this.status}`
            );
        }
    }

    class PurchasePlanningRepository {
        async getClient() {
            if (!global.supabaseClient && global.supabaseClientReady) {
                await global.supabaseClientReady;
            }
            if (!global.supabaseClient) {
                throw new Error('Conexao com o Supabase nao disponivel.');
            }
            return global.supabaseClient;
        }

        async load() {
            const client = await this.getClient();
            const [planResult, ordersResult, suppliersResult, productsResult] = await Promise.all([
                client.rpc('calcular_planejamento_compras', {
                    p_janela_maxima_dias: 90,
                    p_cobertura_dias: 30
                }),
                client
                    .from('pedidos_compra_itens')
                    .select('*')
                    .order('data_pedido', { ascending: false })
                    .limit(150),
                client
                    .from('fornecedores')
                    .select('id, cnpj, razao_social, nome_fantasia, status')
                    .order('razao_social', { ascending: true }),
                client
                    .from('produtos')
                    .select('id_interno, marca, sku_fornecedor')
            ]);

            if (planResult.error) {
                console.error('[PURCHASE_PLANNING] RPC indisponivel:', planResult.error);
                throw new Error(
                    'O calculo automatico ainda nao foi instalado no Supabase. Execute a migracao de planejamento de compras.'
                );
            }
            if (ordersResult.error) throw ordersResult.error;
            if (suppliersResult.error) throw suppliersResult.error;
            if (productsResult.error) throw productsResult.error;

            const productsByCode = new Map(
                (productsResult.data || []).map(product => [String(product.id_interno), product])
            );
            const plan = (planResult.data || []).map(row => ({
                ...row,
                ...(productsByCode.get(String(row.id_interno)) || {})
            }));


            return {
                plan,
                orders: Array.isArray(ordersResult.data) ? ordersResult.data : [],
                suppliers: Array.isArray(suppliersResult.data) ? suppliersResult.data : []
            };
        }

        async createOrder(payload) {
            const client = await this.getClient();
            const { data, error } = await client
                .from('pedidos_compra_itens')
                .insert([payload])
                .select()
                .single();
            if (error) throw error;
            return data;
        }

        async receiveOrder(order, { date, quantity }) {
            const client = await this.getClient();
            const ordered = asNumber(order.quantidade_pedida);
            const alreadyReceived = asNumber(order.quantidade_recebida);
            const nextReceived = Math.min(ordered, alreadyReceived + asNumber(quantity));
            const status = nextReceived >= ordered ? 'RECEBIDO' : 'PARCIAL';
            const payload = {
                quantidade_recebida: nextReceived,
                data_recebimento: status === 'RECEBIDO' ? date : null,
                status,
                atualizado_em: new Date().toISOString()
            };
            const { data, error } = await client
                .from('pedidos_compra_itens')
                .update(payload)
                .eq('id', order.id)
                .select()
                .single();
            if (error) throw error;
            return data;
        }

        async cancelOrder(id) {
            const client = await this.getClient();
            const { error } = await client
                .from('pedidos_compra_itens')
                .update({
                    status: 'CANCELADO',
                    atualizado_em: new Date().toISOString()
                })
                .eq('id', id);
            if (error) throw error;
        }
    }

    class PurchasePlanningService {
        createPlan(rows = []) {
            return rows
                .map(row => new PurchasePlanningItem(row))
                .filter(item => item.code)
                .sort((a, b) =>
                    (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
                    || b.suggestedQuantity - a.suggestedQuantity
                    || a.description.localeCompare(b.description, 'pt-BR', { sensitivity: 'base' })
                );
        }

        summarize(items = [], orders = []) {
            const summary = items.reduce((result, item) => {
                if (item.status === STATUS.CRITICAL) result.critical += 1;
                else if (item.status === STATUS.BUY) result.buy += 1;
                else result.ok += 1;
                result.estimatedCost += item.estimatedCost;
                result.historyDays = Math.max(result.historyDays, item.historyDays);
                return result;
            }, {
                ok: 0,
                buy: 0,
                critical: 0,
                estimatedCost: 0,
                historyDays: 0,
                openOrders: 0
            });
            summary.openOrders = orders.filter(order =>
                ['PENDENTE', 'PARCIAL'].includes(String(order.status || '').toUpperCase())
            ).length;
            return summary;
        }

        filter(items = [], { filter = FILTER.BUY, query = '' } = {}) {
            const term = normalizeText(query);
            return items.filter(item => {
                const matchesFilter =
                    filter === FILTER.ALL
                    || (filter === FILTER.BUY && item.status !== STATUS.OK)
                    || (filter === FILTER.CRITICAL && item.status === STATUS.CRITICAL);
                return matchesFilter && (!term || item.searchIndex.includes(term));
            });
        }
    }

    const PurchasePlanningWidgets = {
        summary(summary) {
            return `
                <section class="purchase-planning-summary" aria-label="Resumo do planejamento">
                    <article class="purchase-summary-card is-ok">
                        <span>Produtos OK</span>
                        <strong>${summary.ok}</strong>
                        <small>Acima do ponto de reposicao</small>
                    </article>
                    <article class="purchase-summary-card is-buy">
                        <span>Produtos para comprar</span>
                        <strong>${summary.buy}</strong>
                        <small>No ponto de reposicao</small>
                    </article>
                    <article class="purchase-summary-card is-critical">
                        <span>Produtos criticos</span>
                        <strong>${summary.critical}</strong>
                        <small>Sem estoque vendavel</small>
                    </article>
                    <article class="purchase-summary-card is-cost">
                        <span>Compra estimada</span>
                        <strong>${formatMoney(summary.estimatedCost)}</strong>
                        <small>${summary.openOrders} pedido(s) em aberto</small>
                    </article>
                </section>
            `;
        },

        filters(activeFilter, query) {
            return `
                <section class="purchase-planning-toolbar">
                    <label class="purchase-planning-search">
                        <span class="material-symbols-rounded">search</span>
                        <input
                            type="search"
                            value="${escapeHtml(query)}"
                            placeholder="Buscar por codigo, descricao ou curva ABC"
                            aria-label="Buscar produto no planejamento"
                            oninput="filterPurchasePlanningSearch(this.value)">
                    </label>
                    <div class="purchase-planning-filters" role="group" aria-label="Filtrar planejamento">
                        ${[
                            [FILTER.ALL, 'Todos'],
                            [FILTER.BUY, 'Comprar'],
                            [FILTER.CRITICAL, 'Criticos']
                        ].map(([value, label]) => `
                            <button
                                type="button"
                                class="${activeFilter === value ? 'is-active' : ''}"
                                aria-pressed="${activeFilter === value}"
                                onclick="setPurchasePlanningFilter('${value}')">
                                ${label}
                            </button>
                        `).join('')}
                    </div>
                </section>
            `;
        },

        orders(orders, suppliersById, itemsByCode) {
            const openOrders = orders.filter(order =>
                ['PENDENTE', 'PARCIAL'].includes(String(order.status || '').toUpperCase())
            );
            if (!openOrders.length) return '';

            return `
                <section class="purchase-open-orders">
                    <div class="purchase-open-orders-head">
                        <div>
                            <h2>Pedidos em acompanhamento</h2>
                            <p>A entrega concluida alimenta o lead time real do produto.</p>
                        </div>
                        <strong>${openOrders.length} aberto(s)</strong>
                    </div>
                    <div class="purchase-open-orders-list">
                        ${openOrders.map(order => {
                            const item = itemsByCode.get(String(order.id_interno));
                            const supplier = suppliersById.get(String(order.fornecedor_id || ''));
                            const remaining = Math.max(
                                asNumber(order.quantidade_pedida) - asNumber(order.quantidade_recebida),
                                0
                            );
                            return `
                                <article class="purchase-open-order">
                                    <div>
                                        <span>${escapeHtml(order.id_interno)}</span>
                                        <strong>${escapeHtml(item?.description || order.id_interno)}</strong>
                                        <small>${escapeHtml(
                                            supplier?.razao_social
                                            || supplier?.nome_fantasia
                                            || 'Fornecedor nao informado'
                                        )}</small>
                                    </div>
                                    <dl>
                                        <div><dt>Pedido</dt><dd>${formatDate(order.data_pedido)}</dd></div>
                                        <div><dt>Restante</dt><dd>${formatQuantity(remaining)}</dd></div>
                                        <div><dt>Previsao</dt><dd>${formatDate(order.data_prevista)}</dd></div>
                                    </dl>
                                    <div class="purchase-open-order-actions">
                                        <button type="button" onclick="openPurchaseReceiptModal('${order.id}')">Receber</button>
                                        <button type="button" class="is-danger" onclick="cancelPurchaseOrder('${order.id}')">Cancelar</button>
                                    </div>
                                </article>
                            `;
                        }).join('')}
                    </div>
                </section>
            `;
        },

        item(item) {
            const statusClass = item.status === STATUS.CRITICAL
                ? 'is-critical'
                : item.status === STATUS.BUY ? 'is-buy' : 'is-ok';
            const leadLabel = item.leadTimeSamples > 0
                ? `${item.leadTimeDays} d (${item.leadTimeSamples} entrega${item.leadTimeSamples === 1 ? '' : 's'})`
                : `${item.leadTimeDays} d (provisorio)`;
            const coverage = item.coverageDays === null
                ? '-'
                : `${formatQuantity(item.coverageDays, 1)} d`;

            return `
                <article class="purchase-planning-item ${statusClass}">
                    <div class="purchase-item-product">
                        <span class="purchase-item-code">${escapeHtml(item.code)}</span>
                        <strong>${escapeHtml(item.description)}</strong>
                        <small>Local principal: ${escapeHtml(item.mainLocation)}</small>
                        <div class="purchase-item-identification">
                            <span><b>Marca:</b> ${escapeHtml(item.brand || '-')}</span>
                            <span><b>SKU:</b> ${escapeHtml(item.sku || '-')}</span>
                        </div>
                        <div class="purchase-item-tags">
                            <span>ABC ${escapeHtml(item.abcCombined)}</span>
                            <span>${item.historyDays} dias analisados</span>
                            <span>${escapeHtml(item.calculationMode)}</span>
                        </div>
                    </div>
                    <dl class="purchase-item-metrics">
                        <div><dt>Estoque atual</dt><dd>${formatQuantity(item.currentStock)}</dd></div>
                        <div><dt>Saidas</dt><dd>${formatQuantity(item.outputs)}</dd></div>
                        <div><dt>Media / dia</dt><dd>${formatQuantity(item.dailyAverage, 3)}</dd></div>
                        <div><dt>Cobertura atual</dt><dd>${coverage}</dd></div>
                        <div><dt>Lead time</dt><dd>${leadLabel}</dd></div>
                        <div><dt>Estoque seguranca</dt><dd>${formatQuantity(item.safetyStock)}</dd></div>
                        <div><dt>Estoque minimo</dt><dd>${formatQuantity(item.minimumStock)}</dd></div>
                        <div><dt>Estoque ideal</dt><dd>${formatQuantity(item.idealStock)}</dd></div>
                        <div><dt>Ja em pedido</dt><dd>${formatQuantity(item.pendingQuantity)}</dd></div>
                        <div class="is-suggested"><dt>Qtd. sugerida</dt><dd>${formatQuantity(item.suggestedQuantity)}</dd></div>
                    </dl>
                    <div class="purchase-item-decision">
                        <span class="purchase-status-badge ${statusClass}">${escapeHtml(item.status)}</span>
                        <strong>${formatMoney(item.estimatedCost)}</strong>
                        <small>Embalagem: ${formatQuantity(item.purchasePackage)}</small>
                        <button type="button" onclick="openPurchaseOrderModal('${escapeHtml(item.code)}')">
                            Registrar pedido
                        </button>
                    </div>
                </article>
            `;
        },

        list(items) {
            if (!items.length) {
                return `
                    <div class="purchase-planning-empty">
                        <span class="material-symbols-rounded">inventory_2</span>
                        <strong>Nenhum produto encontrado</strong>
                        <p>Ajuste os filtros ou a pesquisa para consultar outros produtos.</p>
                    </div>
                `;
            }
            return items.map(item => this.item(item)).join('');
        }
    };

    class PurchasePlanningScreen {
        constructor(repository, service) {
            this.repository = repository;
            this.service = service;
            this.items = [];
            this.orders = [];
            this.suppliers = [];
            this.filter = FILTER.BUY;
            this.query = '';
        }

        getAppElement() {
            return document.getElementById('app');
        }

        getItemsByCode() {
            return new Map(this.items.map(item => [item.code, item]));
        }

        getSuppliersById() {
            return new Map(this.suppliers.map(supplier => [String(supplier.id), supplier]));
        }

        renderShell(content) {
            const app = this.getAppElement();
            if (!app) return;
            const currentUser = localStorage.getItem('currentUser');
            const topBar = typeof global.getTopBarHTML === 'function'
                ? global.getTopBarHTML(currentUser, 'renderMovimentacoesSubMenu()')
                : '';
            const sidebar = typeof global.getModuleSidebarHTML === 'function'
                ? global.getModuleSidebarHTML('movimentos')
                : '';

            app.innerHTML = `
                <div class="dashboard-screen fade-in internal movimentos-screen module-screen purchase-planning-screen">
                    ${topBar}
                    ${sidebar}
                    <main class="container purchase-planning-workspace">
                        <header class="purchase-planning-header">
                            <div>
                                <p>ESTOQUE</p>
                                <h1>Planejamento de Compras</h1>
                                <span>Demanda movel de ate 90 dias, com cobertura de 30 dias.</span>
                            </div>
                            <button type="button" class="purchase-planning-refresh" onclick="refreshPurchasePlanning()">
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                    <path d="M20 11a8 8 0 1 0-2.3 5.7"></path>
                                    <path d="M20 5v6h-6"></path>
                                </svg>
                                Atualizar
                            </button>
                        </header>
                        ${content}
                    </main>
                </div>
            `;
        }

        renderLoading() {
            this.renderShell(`
                <div class="purchase-planning-loading">
                    <span class="material-symbols-rounded">progress_activity</span>
                    <strong>Analisando demanda e estoque</strong>
                    <p>Calculando curva ABC, lead time e sugestoes no Supabase.</p>
                </div>
            `);
        }

        renderError(error) {
            this.renderShell(`
                <div class="purchase-planning-error">
                    <span class="material-symbols-rounded">error</span>
                    <strong>Nao foi possivel gerar o planejamento</strong>
                    <p>${escapeHtml(error?.message || 'Erro inesperado ao carregar os dados.')}</p>
                    <button type="button" onclick="refreshPurchasePlanning()">Tentar novamente</button>
                </div>
            `);
        }

        getFilteredItems() {
            return this.service.filter(this.items, {
                filter: this.filter,
                query: this.query
            });
        }

        getResultsHTML() {
            const filteredItems = this.getFilteredItems();
            return `
                <section class="purchase-planning-results">
                    <div class="purchase-planning-results-head">
                        <div>
                            <h2>Sugestao de compra</h2>
                            <p>Reposicao acionada no estoque minimo e arredondada pela embalagem de compra.</p>
                        </div>
                        <strong>${filteredItems.length} produto(s)</strong>
                    </div>
                    <div class="purchase-planning-list">
                        ${PurchasePlanningWidgets.list(filteredItems)}
                    </div>
                </section>
            `;
        }

        updateResults() {
            const results = document.querySelector('.purchase-planning-results');
            if (results) results.outerHTML = this.getResultsHTML();
            document.querySelectorAll('.purchase-planning-filters button').forEach(button => {
                const isActive = button.getAttribute('onclick')?.includes(`'${this.filter}'`);
                button.classList.toggle('is-active', Boolean(isActive));
                button.setAttribute('aria-pressed', String(Boolean(isActive)));
            });
        }

        render() {
            const summary = this.service.summarize(this.items, this.orders);
            this.renderShell(`
                <section class="purchase-planning-context">
                    <span class="material-symbols-rounded">monitoring</span>
                    <div>
                        <strong>${summary.historyDays} dias de historico considerados</strong>
                        <small>A janela cresce automaticamente ate atingir os ultimos 90 dias.</small>
                    </div>
                </section>
                ${PurchasePlanningWidgets.summary(summary)}
                ${PurchasePlanningWidgets.orders(
                    this.orders,
                    this.getSuppliersById(),
                    this.getItemsByCode()
                )}
                ${PurchasePlanningWidgets.filters(this.filter, this.query)}
                ${this.getResultsHTML()}
            `);
        }

        async open() {
            this.filter = FILTER.BUY;
            this.query = '';
            await this.refresh();
        }

        async refresh() {
            this.closeModal();
            this.renderLoading();
            try {
                const source = await this.repository.load();
                this.items = this.service.createPlan(source.plan);
                this.orders = source.orders;
                this.suppliers = source.suppliers.filter(supplier =>
                    normalizeText(supplier.status || 'ativo') !== 'inativo'
                );
                this.render();
            } catch (error) {
                console.error('[PURCHASE_PLANNING] Erro ao carregar planejamento:', error);
                this.renderError(error);
            }
        }

        setFilter(filter) {
            if (!Object.values(FILTER).includes(filter)) return;
            this.filter = filter;
            this.updateResults();
        }

        setQuery(query) {
            this.query = String(query || '');
            this.updateResults();
        }

        closeModal() {
            document.getElementById('purchase-planning-modal')?.remove();
        }

        openOrderModal(code) {
            const item = this.items.find(candidate => candidate.code === String(code));
            if (!item) return;
            this.closeModal();

            const supplierOptions = this.suppliers.map(supplier => `
                <option value="${escapeHtml(supplier.id)}">
                    ${escapeHtml(supplier.razao_social || supplier.nome_fantasia || supplier.cnpj)}
                </option>
            `).join('');

            document.body.insertAdjacentHTML('beforeend', `
                <div id="purchase-planning-modal" class="purchase-planning-modal" role="dialog" aria-modal="true">
                    <form class="purchase-planning-modal-card" onsubmit="savePurchaseOrder(event)">
                        <header>
                            <div>
                                <span>Novo pedido</span>
                                <strong>${escapeHtml(item.code)} - ${escapeHtml(item.description)}</strong>
                            </div>
                            <button type="button" onclick="closePurchasePlanningModal()" aria-label="Fechar">×</button>
                        </header>
                        <input type="hidden" name="id_interno" value="${escapeHtml(item.code)}">
                        <div class="purchase-planning-form-grid">
                            <label>
                                <span>Quantidade pedida</span>
                                <input name="quantidade_pedida" type="number" min="0.001" step="0.001"
                                    value="${item.suggestedQuantity || item.purchasePackage}" required>
                            </label>
                            <label>
                                <span>Data do pedido</span>
                                <input name="data_pedido" type="date" value="${todayISO()}" required>
                            </label>
                            <label>
                                <span>Previsao de entrega</span>
                                <input name="data_prevista" type="date">
                            </label>
                            <label>
                                <span>Fornecedor</span>
                                <select name="fornecedor_id">
                                    <option value="">Nao informado</option>
                                    ${supplierOptions}
                                </select>
                            </label>
                            <label>
                                <span>Referencia do pedido</span>
                                <input name="pedido_referencia" type="text" maxlength="120" placeholder="Numero ou identificacao">
                            </label>
                            <label class="is-wide">
                                <span>Observacoes</span>
                                <textarea name="observacoes" rows="3"></textarea>
                            </label>
                        </div>
                        <footer>
                            <button type="button" class="secondary" onclick="closePurchasePlanningModal()">Cancelar</button>
                            <button type="submit">Salvar pedido</button>
                        </footer>
                    </form>
                </div>
            `);
        }

        openReceiptModal(id) {
            const order = this.orders.find(candidate => String(candidate.id) === String(id));
            if (!order) return;
            const item = this.items.find(candidate => candidate.code === String(order.id_interno));
            const remaining = Math.max(
                asNumber(order.quantidade_pedida) - asNumber(order.quantidade_recebida),
                0
            );
            this.closeModal();

            document.body.insertAdjacentHTML('beforeend', `
                <div id="purchase-planning-modal" class="purchase-planning-modal" role="dialog" aria-modal="true">
                    <form class="purchase-planning-modal-card is-compact" onsubmit="savePurchaseReceipt(event)">
                        <header>
                            <div>
                                <span>Receber pedido</span>
                                <strong>${escapeHtml(order.id_interno)} - ${escapeHtml(item?.description || '')}</strong>
                            </div>
                            <button type="button" onclick="closePurchasePlanningModal()" aria-label="Fechar">×</button>
                        </header>
                        <input type="hidden" name="order_id" value="${escapeHtml(order.id)}">
                        <div class="purchase-planning-form-grid">
                            <label>
                                <span>Quantidade recebida</span>
                                <input name="quantidade_recebida" type="number" min="0.001"
                                    max="${remaining}" step="0.001" value="${remaining}" required>
                            </label>
                            <label>
                                <span>Data do recebimento</span>
                                <input name="data_recebimento" type="date" min="${escapeHtml(order.data_pedido)}"
                                    value="${todayISO()}" required>
                            </label>
                        </div>
                        <p class="purchase-lead-preview">
                            Pedido feito em ${formatDate(order.data_pedido)}. Ao concluir, este prazo entra no lead time real.
                        </p>
                        <footer>
                            <button type="button" class="secondary" onclick="closePurchasePlanningModal()">Cancelar</button>
                            <button type="submit">Confirmar recebimento</button>
                        </footer>
                    </form>
                </div>
            `);
        }

        async saveOrder(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
            try {
                const values = Object.fromEntries(new FormData(form).entries());
                await this.repository.createOrder({
                    id_interno: String(values.id_interno || '').trim(),
                    fornecedor_id: values.fornecedor_id || null,
                    pedido_referencia: String(values.pedido_referencia || '').trim() || null,
                    data_pedido: values.data_pedido,
                    data_prevista: values.data_prevista || null,
                    quantidade_pedida: asNumber(values.quantidade_pedida),
                    quantidade_recebida: 0,
                    status: 'PENDENTE',
                    usuario: localStorage.getItem('currentUser') || null,
                    observacoes: String(values.observacoes || '').trim() || null
                });
                global.showToast?.('Pedido registrado. A quantidade ja foi descontada da sugestao.', 'success');
                await this.refresh();
            } catch (error) {
                console.error('[PURCHASE_PLANNING] erro ao registrar pedido:', error);
                global.showToast?.(error?.message || 'Nao foi possivel registrar o pedido.', 'error');
                submit.disabled = false;
            }
        }

        async saveReceipt(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
            try {
                const values = Object.fromEntries(new FormData(form).entries());
                const order = this.orders.find(candidate => String(candidate.id) === String(values.order_id));
                if (!order) throw new Error('Pedido nao encontrado.');
                await this.repository.receiveOrder(order, {
                    date: values.data_recebimento,
                    quantity: asNumber(values.quantidade_recebida)
                });
                global.showToast?.('Recebimento registrado e lead time recalculado.', 'success');
                await this.refresh();
            } catch (error) {
                console.error('[PURCHASE_PLANNING] erro ao receber pedido:', error);
                global.showToast?.(error?.message || 'Nao foi possivel registrar o recebimento.', 'error');
                submit.disabled = false;
            }
        }

        async cancelOrder(id) {
            const confirmed = global.showAppConfirm
                ? await global.showAppConfirm({
                    title: 'Cancelar pedido?',
                    message: 'A quantidade deixara de ser considerada como compra em andamento.',
                    confirmLabel: 'Cancelar pedido',
                    cancelLabel: 'Voltar',
                    danger: true
                })
                : global.confirm('Cancelar este pedido?');
            if (!confirmed) return;
            try {
                await this.repository.cancelOrder(id);
                global.showToast?.('Pedido cancelado.', 'success');
                await this.refresh();
            } catch (error) {
                global.showToast?.(error?.message || 'Nao foi possivel cancelar o pedido.', 'error');
            }
        }
    }

    const repository = new PurchasePlanningRepository();
    const service = new PurchasePlanningService();
    const screen = new PurchasePlanningScreen(repository, service);

    global.PurchasePlanning = Object.freeze({
        STATUS,
        FILTER,
        PurchasePlanningItem,
        PurchasePlanningRepository,
        PurchasePlanningService,
        widgets: PurchasePlanningWidgets,
        screen
    });
    global.renderPlanejamentoCompras = () => screen.open();
    global.refreshPurchasePlanning = () => screen.refresh();
    global.setPurchasePlanningFilter = filter => screen.setFilter(filter);
    global.filterPurchasePlanningSearch = query => screen.setQuery(query);
    global.openPurchaseOrderModal = code => screen.openOrderModal(code);
    global.openPurchaseReceiptModal = id => screen.openReceiptModal(id);
    global.closePurchasePlanningModal = () => screen.closeModal();
    global.savePurchaseOrder = event => screen.saveOrder(event);
    global.savePurchaseReceipt = event => screen.saveReceipt(event);
    global.cancelPurchaseOrder = id => screen.cancelOrder(id);
})(window);
