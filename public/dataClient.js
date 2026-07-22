/**
 * Data Access Layer - Camada de abstrao para acesso a dados
 * Permite futura migrao de Google Sheets para Supabase com mnimo impacto
 * 
 * Implementa:
 * - Carregamento sob demanda por mdulo
 * - Cache inteligente
 * - Logging de operaes
 */

const DataClient = (function () {
    // Cache por mdulo
    const cache = {};
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

    // Mapeamento de mdulos para abas do Google Sheets
    const MODULE_TABLES = {
        login: {
            tables: ['usuarios'],
            cacheKey: 'login'
        },
        produtos: {
            tables: ['produtos', 'estoque_atual'],
            cacheKey: 'produtos'
        },
        separacao: {
            tables: ['canais_envio', 'separacao', 'separacao_itens'],
            cacheKey: 'separacao'
        },
        conferencia: {
            tables: ['separacao', 'separacao_itens', 'conferencia_itens', 'conferencia'],
            cacheKey: 'conferencia'
        },
        movimentos: {
            tables: ['movimentos', 'estoque_atual'],
            cacheKey: 'movimentos'
        },
        inventarios: {
            tables: ['inventarios', 'inventarios_itens'],
            cacheKey: 'inventarios'
        },
        kit_lampada: {
            tables: ['kit_lampada'],
            cacheKey: 'kit_lampada'
        },
        channels: {
            tables: ['canais_envio'],
            cacheKey: 'channels'
        },
        usuarios: {
            tables: ['usuarios'],
            cacheKey: 'usuarios'
        },
        nf: {
            tables: ['entradas_nf', 'entradas_nf_itens'],
            cacheKey: 'nf'
        },
        garantia: {
            tables: ['garantias'],
            cacheKey: 'garantia'
        },
        etiquetas: {
            tables: ['etiquetas_lotes', 'etiquetas_lotes_itens'],
            cacheKey: 'etiquetas'
        }
    };

    /**
     * Verifica se cache  vlido
     */
    function isCacheValid(key) {
        if (!cache[key]) return false;
        return (Date.now() - cache[key].timestamp) < CACHE_TTL;
    }

    /**
     * Salva no cache
     */
    function setCache(key, data) {
        cache[key] = {
            data: data,
            timestamp: Date.now()
        };
    }

    /**
     * Obtm do cache
     */
    function getCache(key) {
        if (isCacheValid(key)) {
            return cache[key].data;
        }
        return null;
    }

    /**
     * Limpa cache de um mdulo
     */
    function invalidateCache(key) {
        delete cache[key];
    }

    /**
     * Carrega produtos do Supabase
     */
    async function fetchProdutosSupabase() {
        const client = window.supabaseClient

        if (!client) {
            console.error('[FATAL] Supabase client no inicializado!')
            console.error('[FATAL] Verifique supabaseClient.js - URL e ANON_KEY podem estar incompletas')
            throw new Error('Supabase no configurado. Configure URL e ANON_KEY em supabaseClient.js')
        }

        console.log('[Supabase] Iniciando consulta na tabela produtos...')

        const { data, error } = await client
            .from('produtos')
            .select('*')

        if (error) {
            console.error('[Supabase] ERRO ao buscar produtos:', error.message)
            console.error('[Supabase] Cdigo do erro:', error.code)
            throw new Error('Erro ao carregar produtos do Supabase: ' + error.message)
        }

        if (!data || data.length === 0) {
            console.warn('[Supabase] ATENO: Nenhum produto encontrado na tabela!')
            console.warn('[Supabase] Verifique se a tabela "produtos" possui registros')
            throw new Error('Nenhum produto encontrado no Supabase. A tabela est vazia ou no existe.')
        }

        console.log(`[Supabase] Sukesso! ${data.length} produtos carregados do Supabase`)
        console.log(`[Supabase] IDs retornados:`, data.slice(0, 5).map(p => p.id_interno || p.id))

        return data
    }

    async function findProdutoByCodeSupabase(code) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const cleanCode = String(code || '').trim().replace(/\s+/g, '');
        if (!cleanCode) return null;

        console.log('[SEP] buscando supabase', cleanCode);

        const fields = ['ean', 'id_interno', 'sku_fornecedor'];
        for (const field of fields) {
            const { data, error } = await client
                .from('produtos')
                .select('*')
                .eq(field, cleanCode)
                .limit(1);

            if (error) {
                console.error('[SEP] refresh supabase erro', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code,
                    field,
                    value: cleanCode
                });
                throw error;
            }

            if (data && data.length > 0) {
                console.log('[SEP] produto encontrado supabase', {
                    field,
                    id_interno: data[0].id_interno,
                    ean: data[0].ean,
                    sku_fornecedor: data[0].sku_fornecedor
                });
                return data[0];
            }
        }

        console.log('[SEP] produto nao encontrado', cleanCode);
        return null;
    }

    /**
     * Carrega usurios do Supabase
     */
    async function fetchUsuariosSupabase() {
        const client = window.supabaseClient

        if (!client) {
            console.error('[Supabase] client no encontrado')
            return []
        }

        const { data, error } = await client
            .from('usuarios')
            .select('*')
            .eq('ativo', true)


        if (error) {
            console.error('[Supabase] erro ao buscar usurios:', error)
            return []
        }

        console.log(`[BOOT] usuarios -> Supabase (${data.length} registros)`);

        return data || []
    }

    /**
     * Carrega canais de envio do Supabase
     */
    async function fetchCanaisEnvioSupabase() {
        const client = window.supabaseClient

        console.log('[CANAIS DEBUG] supabase client existe?', !!client);

        if (!client) {
            console.error('[CANAIS DEBUG] Supabase client NAO encontrado!')
            return []
        }

        console.log('[CANAIS DEBUG] buscando tabela canais_envio...');

        const { data, error } = await client
            .from('canais_envio')
            .select('*')
            .eq('ativo', true)
            .order('nome', { ascending: true })

        if (error) {
            console.error('[CANAIS DEBUG] erro supabase ao ler canais_envio:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            })
            return []
        }

        if (!data || data.length === 0) {
            console.warn('[CANAIS DEBUG] canais_envio retornou vazio. Verifique se existem canais ativos e se as policies SELECT foram aplicadas.')
        }

        console.log(`[CANAIS DEBUG] quantidade retornada: ${(data || []).length}`);
        console.log('[CANAIS DEBUG] canais retornados:', data);

        return data || []
    }

    /**
     * Carrega Kit Lmpada do Supabase (Paginado para carregar tudo)
     */
    async function fetchKitLampadaSupabase() {
        const client = window.supabaseClient

        if (!client) {
            console.error('[Supabase] client no encontrado')
            return []
        }

        let allRows = [];
        let from = 0;
        const pageSize = 1000;

        try {
            while (true) {
                const { data, error } = await client
                    .from('kit_lampada')
                    .select('*')
                    .order('kit_lampada_id', { ascending: true })
                    .range(from, from + pageSize - 1);

                if (error) throw error;

                if (data && data.length > 0) {
                    allRows.push(...data);
                }

                if (!data || data.length < pageSize) break;

                from += pageSize;
            }

            // Utilitrio interno para logs
            const safeText = (val) => String(val ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

            console.log('[KIT LAMPADA] rows:', allRows);
            console.log('[KIT LAMPADA] total:', allRows.length);
            console.log('[KIT LAMPADA] civic raw:', allRows.filter(r => String(r.modelo || '').toLowerCase().includes('civic')));
            console.log('[KIT LAMPADA] primeiro item:', allRows[0]);

            if (allRows.length === 0) {
                console.warn('[KIT LAMPADA] Ateno: Nenhum registro retornado. Verifique as RLS/Policies da tabela "kit_lampada" no Supabase.');
            }

            return allRows;
        } catch (err) {
            console.error('[Supabase] erro ao buscar kit_lampada:', err);
            return [];
        }
    }

    // Auxiliares
    function normalizeLocal(local) {
        if (!local) return "";
        let norm = local
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, '_')
            .replace('1_ANDAR', 'PRIMEIRO_ANDAR')
            .replace('1_ANDAR', 'PRIMEIRO_ANDAR')
            .replace('1_ANDAR', 'PRIMEIRO_ANDAR');
        // Normalizar variaes de FULL ML
        if (norm === 'FULL_ML' || norm === 'FULLML' || norm === 'FULL_M_L') return 'FULL_ML';
        return norm;
    }

    function normalizeMovimentoTipo(tipoRaw) {
        const tipo = String(tipoRaw || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, '_');

        const aliases = {
            ENTRADA_NF: 'ENTRADA',
            ENTRADA_XML: 'ENTRADA',
            SAIDA_RAPIDA: 'SAIDA',
            BAIXA: 'SAIDA',
            AJUSTE: 'AJUSTE_POSITIVO',
            AJUSTE_ESTOQUE: 'AJUSTE_POSITIVO',
            'AJUSTE+': 'AJUSTE_POSITIVO',
            AJUSTE_POSITIVO: 'AJUSTE_POSITIVO',
            'AJUSTE_+': 'AJUSTE_POSITIVO',
            'AJUSTE-': 'AJUSTE_NEGATIVO',
            AJUSTE_NEGATIVO: 'AJUSTE_NEGATIVO',
            'AJUSTE__': 'AJUSTE_NEGATIVO',
            SAIDA: 'SAIDA',
            ENTRADA: 'ENTRADA',
            TRANSFERENCIA: 'TRANSFERENCIA'
        };

        return aliases[tipo] || tipo || 'AJUSTE_POSITIVO';
    }

    function normalizeMovimentoOrigem(origemRaw) {
        const origem = String(origemRaw || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, '_');

        const aliases = {
            SEPARACAO: 'APP_SEPARACAO',
            APP_SEPARACAO: 'APP_SEPARACAO',
            CONFERENCIA: 'APP_CONFERENCIA',
            APP_CONFERENCIA: 'APP_CONFERENCIA',
            INVENTARIO: 'APP_INVENTARIO',
            APP_INVENTARIO: 'APP_INVENTARIO',
            ENTRADA_NF: 'APP_COMPRAS',
            ENTRADA_NF_XML: 'APP_COMPRAS',
            APP_COMPRAS: 'APP_COMPRAS',
            XML: 'IMPORTACAO',
            IMPORTACAO: 'IMPORTACAO',
            APP_MOBILE: 'MANUAL',
            MODULO_GARANTIA: 'MANUAL',
            APP_TRANSFERENCIA: 'MANUAL',
            MANUAL: 'MANUAL'
        };

        return aliases[origem] || origem || 'MANUAL';
    }

    /**
     * Registra um movimento no Supabase
     */
    async function saveMovimentoSupabase(movData) {
        const client = window.supabaseClient;
        if (!client) {
            console.error('[Supabase] Client no encontrado');
            return null;
        }

        const movimentoPayload = {
            movimento_id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            data_hora: getDataHoraBrasil(),
            tipo: normalizeMovimentoTipo(movData.tipo),
            id_interno: movData.id_interno,
            local_origem: normalizeLocal(movData.local_origem),
            local_destino: normalizeLocal(movData.local_destino),
            quantidade: Math.abs(Number(movData.quantidade || 0)),
            usuario: movData.usuario,
            origem: normalizeMovimentoOrigem(movData.origem),
            observacao: movData.observacao
        };

        console.log(`[MOV] insert movimentos - payload:`, JSON.stringify(movimentoPayload, null, 2));

        const { data, error } = await client
            .from('movimentos')
            .insert([movimentoPayload])
            .select();

        if (error) {
            console.error('[MOV] insert movimentos ERRO:', error);
            return null;
        }

        console.log('[MOV] insert movimentos SUCESSO:', data);
        return data ? data[0] : null;
    }

    /**
     * Atualiza o saldo na tabela estoque_atual de forma atmica
     */
    async function updateEstoqueSupabase(id_interno, localRaw, operacao, quantidade) {
        const client = window.supabaseClient;
        const local = normalizeLocal(localRaw);
        if (!client || !local) {
            console.error('[MOV] update estoque ERRO: client ou local invlido');
            return false;
        }

        console.log(`[MOV] update estoque - id_interno=${id_interno} local=${local} operacao=${operacao} quantidade=${quantidade}`);

        try {
            // 1. Buscar saldo atual
            console.log('[INV-DIAG] update estoque: buscando saldo atual para', id_interno, 'em', local);
            const { data: current, error: fetchError } = await client
                .from('estoque_atual')
                .select('*')
                .eq('id_interno', id_interno)
                .eq('local', local)
                .maybeSingle();

            if (fetchError) {
                console.error('[INV-DIAG] erro estoque Supabase (SELECT):', fetchError);
                throw fetchError;
            }

            console.log('[INV-DIAG] saldo atual encontrado:', current);

            const saldoRes = current ? parseFloat(current.saldo_reservado || 0) : 0;
            const saldoTrans = current ? parseFloat(current.saldo_em_transito || 0) : 0;

            let novoSaldoDisp = 0;
            if (operacao === 'soma') {
                novoSaldoDisp = (current ? parseFloat(current.saldo_disponivel || 0) : 0) + quantidade;
            } else if (operacao === 'subtrai') {
                novoSaldoDisp = (current ? parseFloat(current.saldo_disponivel || 0) : 0) - quantidade;
            } else if (operacao === 'ajuste') {
                novoSaldoDisp = quantidade;
            }

            const novoSaldoTotal = novoSaldoDisp + saldoRes + saldoTrans;
            const payload = {
                id_interno: id_interno,
                local: local,
                saldo_disponivel: novoSaldoDisp,
                saldo_reservado: saldoRes,
                saldo_em_transito: saldoTrans,
                saldo_total: novoSaldoTotal,
                atualizado_em: getDataHoraBrasil()
            };

            console.log('[INV-DIAG] estoque payload:', payload);

            let result;
            if (current) {
                console.log('[INV-DIAG] executando UPDATE em estoque_atual...');
                result = await client
                    .from('estoque_atual')
                    .update(payload)
                    .eq('id_interno', id_interno)
                    .eq('local', local);
            } else {
                console.log('[INV-DIAG] executando INSERT em estoque_atual...');
                result = await client
                    .from('estoque_atual')
                    .insert([payload]);
            }

            if (result.error) {
                console.error('[INV-DIAG] erro estoque Supabase (OP):', result.error);
                throw result.error;
            }

            console.log('[INV-DIAG] estoque result: SUCESSO');
            return true;
        } catch (err) {
            console.error('[INV-DIAG] update estoque ERRO fatal:', err.message || err);
            return false;
        }
    }

    async function registrarAjusteEstoqueSupabase(payload = {}) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const local = normalizeLocal(payload.local);
        const rpcPayload = {
            p_id_interno: String(payload.id_interno || '').trim(),
            p_local: local,
            p_tipo_ajuste: String(payload.tipo_ajuste || 'definir').trim(),
            p_quantidade: Number(payload.quantidade || 0),
            p_usuario: payload.usuario || 'N/A',
            p_observacao: payload.observacao || '',
            p_permitir_negativo: payload.permitir_negativo === true,
            p_execution_id: payload.executionId || `ajuste_${Date.now()}`
        };

        console.log('[AJUSTE RPC] registrar_ajuste_estoque payload:', rpcPayload);

        const { data, error } = await client.rpc('registrar_ajuste_estoque', rpcPayload);
        if (error) {
            console.error('[AJUSTE RPC] erro:', error);
            const missingRpc = error.code === 'PGRST202' || String(error.message || '').includes('registrar_ajuste_estoque');
            const rpcError = new Error(missingRpc
                ? 'RPC registrar_ajuste_estoque ainda nao aplicada no Supabase. O ajuste foi bloqueado para evitar saldo parcial.'
                : (error.message || 'Erro ao registrar ajuste de estoque no Supabase'));
            rpcError.code = error.code;
            rpcError.details = error.details;
            rpcError.hint = error.hint;
            rpcError.supabaseError = error;
            throw rpcError;
        }

        invalidateCache('produtos');
        invalidateCache('movimentos');
        return data;
    }
    /**
     * Reflete a contagem fisica do inventario em estoque_atual.
     * O inventario e a fonte de verdade: saldo_disponivel e saldo_total recebem saldo_fisico.
     */
    async function aplicarSaldoFisicoInventarioSupabase(id_interno, localRaw, saldoFisicoRaw) {
        const client = window.supabaseClient;
        const local = normalizeLocal(localRaw);
        const saldoFisico = Number(saldoFisicoRaw || 0);

        if (!client || !id_interno || !local || !Number.isFinite(saldoFisico)) {
            console.error('[INV-DIAG] aplicar saldo fisico ERRO: parametros invalidos', { id_interno, local, saldoFisicoRaw });
            return false;
        }

        try {
            const { data: current, error: fetchError } = await client
                .from('estoque_atual')
                .select('id')
                .eq('id_interno', id_interno)
                .eq('local', local)
                .maybeSingle();

            if (fetchError) throw fetchError;

            const now = getDataHoraBrasil();
            let result;

            if (current) {
                result = await client
                    .from('estoque_atual')
                    .update({
                        saldo_disponivel: saldoFisico,
                        saldo_total: saldoFisico,
                        atualizado_em: now
                    })
                    .eq('id_interno', id_interno)
                    .eq('local', local);
            } else {
                result = await client
                    .from('estoque_atual')
                    .insert([{
                        id_interno: id_interno,
                        local: local,
                        saldo_disponivel: saldoFisico,
                        saldo_reservado: 0,
                        saldo_em_transito: 0,
                        saldo_total: saldoFisico,
                        atualizado_em: now
                    }]);
            }

            if (result.error) throw result.error;
            return true;
        } catch (err) {
            console.error('[INV-DIAG] aplicar saldo fisico ERRO fatal:', err.message || err);
            return false;
        }
    }

    /**
     * Busca saldos de estoque por local para um produto especfico
     */
    async function fetchEstoqueProdutoSupabase(id_interno) {
        const client = window.supabaseClient;
        if (!client) return [];

        const { data, error } = await client
            .from('estoque_atual')
            .select('*')
            .eq('id_interno', id_interno);

        if (error) {
            console.warn('[Supabase] Erro ao buscar estoque do produto (no crtico):', error);
            return [];
        }

        return data || [];
    }

    /**
     * Busca saldo real de estoque para um produto em um local especfico
     */
    async function fetchEstoqueItemLocalSupabase(id_interno, localRaw) {
        const client = window.supabaseClient;
        const local = normalizeLocal(localRaw);
        if (!client || !local) return null;

        const { data, error } = await client
            .from('estoque_atual')
            .select('saldo_disponivel, saldo_reservado, saldo_em_transito, saldo_total')
            .eq('id_interno', id_interno)
            .eq('local', local)
            .maybeSingle();

        if (error) {
            console.warn('[INV] fetchEstoqueItemLocal AVISO (no crtico):', error);
            return null;
        }
        return data;
    }

    /**
     * Carrega tabela inventarios do Supabase
     */
    async function fetchInventariosSupabase() {
        const client = window.supabaseClient;
        if (!client) return [];

        const { data, error } = await client
            .from('inventarios')
            .select('*')
            .order('data_inicio', { ascending: false });

        if (error) { console.error('[INV] fetch inventarios ERRO:', error); return []; }
        console.log(`[INV] inventarios -> Supabase (${data.length} registros)`);
        return data || [];
    }

    /**
     * Carrega tabela inventarios_itens do Supabase
     */
    async function fetchInventariosItensSupabase() {
        const client = window.supabaseClient;
        if (!client) return [];

        const { data, error } = await client
            .from('inventarios_itens')
            .select('*');

        if (error) { console.error('[INV] fetch inventarios_itens ERRO:', error); return []; }
        console.log(`[INV] inventarios_itens -> Supabase (${data.length} registros)`);
        return data || [];
    }

    /**
     * Carrega tabela estoque_atual do Supabase (Runtime SSOT)
     */
    async function fetchEstoqueAtualSupabase() {
        const client = window.supabaseClient;
        if (!client) return [];

        try {
            const { data, error } = await client
                .from('estoque_atual')
                .select('*');

            if (error) {
                console.warn('[Supabase] Erro ao buscar estoque_atual:', error);
                return [];
            }
            return data || [];
        } catch (e) {
            console.warn('[Supabase] Erro fatal estoque_atual:', e);
            return [];
        }
    }

    /**
     * Carrega dados de uma tabela especfica (Roteamento Inteligente)
     */
    async function fetchTable(tableName) {
        try {
            // Tabelas Exclusivas do Supabase (Runtime SSOT)
            if (tableName === 'produtos') {
                console.log(`[DATA] produtos -> Supabase`);
                return await fetchProdutosSupabase();
            }

            if (tableName === 'usuarios') {
                console.log(`[DATA] usuarios -> Supabase`);
                console.log(`[DATA] Google Sheets ignorado para 'usuarios'`);
                return await fetchUsuariosSupabase();
            }

            if (tableName === 'canais_envio') {
                console.log(`[DATA] canais_envio -> Supabase`);
                return await fetchCanaisEnvioSupabase();
            }

            if (tableName === 'inventarios') {
                console.log(`[DATA] inventarios -> Supabase`);
                return await fetchInventariosSupabase();
            }

            if (tableName === 'inventarios_itens') {
                console.log(`[DATA] inventarios_itens -> Supabase`);
                return await fetchInventariosItensSupabase();
            }

            if (tableName === 'estoque_atual') {
                console.log(`[DATA] estoque_atual -> Supabase`);
                return await fetchEstoqueAtualSupabase();
            }

            if (tableName === 'movimentos') {
                console.log(`[DATA] movimentos -> Supabase`);
                return await fetchMovimentosSupabase();
            }

            if (tableName === 'kit_lampada') {
                console.log(`[DATA] kit_lampada -> Supabase`);
                return await fetchKitLampadaSupabase();
            }

            if (tableName === 'separacao') {
                console.log(`[DATA] separacao -> Supabase`);
                return await fetchSeparacaoSupabase();
            }

            if (tableName === 'separacao_itens') {
                console.log(`[DATA] separacao_itens -> Supabase`);
                return await fetchSeparacaoItensSupabase();
            }

            if (tableName === 'conferencia') {
                console.log(`[DATA] conferencia -> Supabase`);
                return await fetchConferenciaSupabase();
            }

            if (tableName === 'conferencia_itens') {
                console.log(`[DATA] conferencia_itens -> Supabase`);
                return await fetchConferenciaItensSupabase();
            }

            if (tableName === 'etiquetas_lotes') {
                console.log(`[DATA] etiquetas_lotes -> Supabase`);
                return await listarEtiquetaLotes();
            }

            if (tableName === 'etiquetas_lotes_itens') {
                console.log(`[DATA] etiquetas_lotes_itens -> Supabase`);
                const lotes = await listarEtiquetaLotes();
                return lotes.flatMap(lote => lote.itens || []);
            }

            // Fallback apenas para tabelas operacionais legadas ou auxiliares
            console.log(`[DATA] Google Sheets -> ${tableName}`);
            const data = await fetchSheetData(tableName);
            return data || [];
        } catch (error) {
            console.error(`[DataClient] Erro ao carregar ${tableName}:`, error);
            // Erro de estoque  tratado como no-crtico para no bloquear visualizao
            if (tableName !== 'estoque_atual') {
                showToast(`Erro ao carregar dados de ${tableName}`, 'error');
            }
            return [];
        }
    }


    /**
     * Carrega dados de um mdulo especfico (sob demanda)
     * @param {string} moduleName - Nome do mdulo (login, produtos, separacao, etc)
     * @param {boolean} forceRefresh - Se true, ignora cache e fora recarregamento
     */
    async function loadModule(moduleName, forceRefresh = false) {
        const config = MODULE_TABLES[moduleName];
        if (!config) {
            console.warn(`[DataClient] Mdulo desconhecido: ${moduleName}`);
            return null;
        }

        // Verificar cache vlido
        if (!forceRefresh && isCacheValid(config.cacheKey)) {
            console.log(`[DataClient] Usando cache para mdulo: ${moduleName}`);
            return getCache(config.cacheKey);
        }

        console.log(`[DataClient] Carregando mdulo: ${moduleName}`);

        try {
            // Carregar todas as tabelas do mdulo em paralelo
            const results = await Promise.all(
                config.tables.map(table => fetchTable(table))
            );

            // Criar objeto com dados do mdulo
            const moduleData = {};
            config.tables.forEach((table, index) => {
                const keyMap = {
                    'produtos': 'products',
                    'canais_envio': 'channels',
                    'conferencia_itens': 'conferencia',
                    'estoque_atual': 'estoque',
                    'movimentos': 'movimentacoes',
                    'inventarios': 'inventario',
                    'inventarios_itens': 'inventarios_itens',
                    'separacao': 'separacao',
                    'separacao_itens': 'separacao_itens'
                };
                const key = keyMap[table] || table;
                moduleData[key] = results[index] || [];
            });

            // Salvar no cache
            setCache(config.cacheKey, moduleData);

            console.log(`[DataClient] Mdulo ${moduleName} carregado com sucesso`);
            return moduleData;

        } catch (error) {
            console.error(`[DataClient] Erro ao carregar mdulo ${moduleName}:`, error);
            showToast(`Erro ao carregar ${moduleName}`, 'error');
            return null;
        }
    }

    /**
     * Carrega dados de mltiplos mdulos de uma vez
     * @param {string[]} moduleNames - Lista de mdulos para carregar
     */
    async function loadModules(moduleNames) {
        console.log(`[DataClient] Carregando mltiplos mdulos:`, moduleNames);

        const results = {};
        await Promise.all(
            moduleNames.map(async (moduleName) => {
                results[moduleName] = await loadModule(moduleName);
            })
        );

        return results;
    }

    /**
     * Busca dados de uma tabela especfica (sem cache de mdulo)
     * til para operaes pontuais
     */
    async function query(tableName, filters = {}) {
        console.log(`[DataClient] SEARCH START -> Table: ${tableName}`, filters);

        try {
            // Se for uma das tabelas SSOT (Supabase), no usamos dyGet (Sheets)
            const ssotTables = ['produtos', 'usuarios', 'canais_envio'];
            if (ssotTables.includes(tableName)) {
                console.log(`[DataClient] Redirecionando busca de ${tableName} para SSOT Supabase`);
                const fullData = await fetchTable(tableName);

                if (filters.field && filters.value) {
                    const normalizedValue = String(filters.value).toLowerCase();
                    return fullData.filter(item =>
                        String(item[filters.field] || "").toLowerCase() === normalizedValue
                    );
                }
                return fullData;
            }

            if (filters.field && filters.value) {
                // Busca especfica no Google Sheets (fallback legado)
                const params = {
                    action: 'find',
                    sheet: tableName,
                    field: filters.field,
                    value: filters.value
                };
                return (await dyGet(params)).data || [];
            } else {
                return await fetchTable(tableName);
            }
        } catch (error) {
            console.error(`[DataClient] Query error:`, error);
            return [];
        }
    }


    /**
     * Salva dados - wrapper para safePost
     */
    async function save(action, sheetName, data) {
        console.log(`[DataClient] Salvando ${action} na aba ${sheetName}`);

        const result = await safePost({
            action: action,
            sheet: sheetName,
            data: data
        });

        // Invalidar cache do mdulo relacionado se salvou com sucesso
        if (result) {
            Object.keys(MODULE_TABLES).forEach(moduleName => {
                const config = MODULE_TABLES[moduleName];
                if (config.tables.includes(sheetName)) {
                    console.log(`[DataClient] Invalidando cache de ${moduleName} aps salvamento`);
                    invalidateCache(config.cacheKey);
                }
            });
        }

        return result;
    }

    /**
     * Verso batch de save
     */
    async function saveBatch(sheetName, dataArray) {
        console.log(`[DataClient] Salvando batch em ${sheetName}`);

        const result = await safePost({
            action: 'batch_append',
            sheet: sheetName,
            data: dataArray
        });

        if (result) {
            invalidateCache(sheetName);
        }

        return result;
    }

    /**
     * Obtm dados de um mdulo especfico do cache (sem carregar)
     */
    function getCachedData(moduleName) {
        const config = MODULE_TABLES[moduleName];
        if (!config) return null;
        return getCache(config.cacheKey);
    }

    /**
     * Verifica se mdulo j foi carregado
     */
    function isModuleLoaded(moduleName) {
        const config = MODULE_TABLES[moduleName];
        if (!config) return false;
        return isCacheValid(config.cacheKey);
    }

    /**
     * Limpa todo o cache
     */
    function clearAllCache() {
        Object.keys(cache).forEach(key => delete cache[key]);
        console.log('[DataClient] Todo cache limpo');
    }

    // API pblica
    async function fetchMovimentosSupabase() {
        const client = window.supabaseClient;
        if (!client) {
            console.error('[MOVIMENTOS DEBUG] erro ao listar movimentos: Supabase client no encontrado');
            throw new Error('Supabase client no encontrado');
        }

        // 1. Buscar dados
        const { data, error } = await client
            .from('movimentos')
            .select('*')
            .order('data_hora', { ascending: false });

        if (error) {
            console.error('[MOVIMENTOS DEBUG] erro ao listar movimentos:', error);
            throw error;
        }

        return data || [];
    }

    async function fetchSeparacaoSupabase() {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const { data, error } = await client
            .from('separacao')
            .select('*')
            .order('criado_em', { ascending: false });

        if (error) {
            console.error('[SEPARACAO] erro ao listar separacao:', error);
            throw error;
        }

        return data || [];
    }

    async function fetchMovimentosProdutoSupabase(id_interno, limit = 120) {
        const client = window.supabaseClient;
        if (!client) {
            console.error('[MOVIMENTOS PRODUTO] erro ao listar movimentos: Supabase client no encontrado');
            throw new Error('Supabase client no encontrado');
        }

        const cleanId = String(id_interno || '').trim();
        if (!cleanId) return [];

        const safeLimit = Math.max(20, Math.min(parseInt(limit, 10) || 120, 300));
        const { data, error } = await client
            .from('movimentos')
            .select('*')
            .eq('id_interno', cleanId)
            .order('data_hora', { ascending: false })
            .limit(safeLimit);

        if (error) {
            console.error('[MOVIMENTOS PRODUTO] erro ao listar movimentos:', error);
            throw error;
        }

        return data || [];
    }

    async function fetchSeparacoesAbertasPorCanalSupabase(channelName) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        if (!channelName) return [];

        let { data, error } = await client
            .from('separacao')
            .select('*')
            .eq('canal_nome', channelName)
            .eq('status', 'aberta')
            .order('criado_em', { ascending: false });

        if (error) {
            console.error('[SEPARACAO] erro ao listar separacoes abertas por canal:', error);
            throw error;
        }

        if (!data?.length) {
            const fallback = await client
                .from('separacao')
                .select('*')
                .eq('canal_id', channelName)
                .eq('status', 'aberta')
                .order('criado_em', { ascending: false });

            if (fallback.error) {
                console.error('[SEPARACAO] erro ao listar separacoes abertas por canal_id:', fallback.error);
                throw fallback.error;
            }

            data = fallback.data || [];
        }

        return data || [];
    }

    async function fetchSeparacaoItensSupabase() {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const { data, error } = await client
            .from('separacao_itens')
            .select('*')
            .order('atualizado_em', { ascending: false });

        if (error) {
            console.error('[SEPARACAO] erro ao listar separacao_itens:', error);
            throw error;
        }

        return data || [];
    }

    async function fetchConferenciaSupabase() {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const { data, error } = await client
            .from('conferencia')
            .select('*')
            .order('conferido_em', { ascending: false });

        if (error) {
            console.error('[CONFERENCIA] erro ao listar conferencia:', error);
            throw error;
        }

        return data || [];
    }

    async function fetchConferenciaItensSupabase() {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const { data, error } = await client
            .from('conferencia_itens')
            .select('*');

        if (error) {
            console.error('[CONFERENCIA] erro ao listar conferencia_itens:', error);
            throw error;
        }

        return data || [];
    }

    function logSepSupabaseError(label, error, payload) {
        console.error(`[SEP] ${label}`, {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code,
            payload
        });
    }

    function isMissingPickingTotalsColumnError(error) {
        const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
        return error?.code === 'PGRST204'
            || (text.includes('schema cache') && (text.includes('total_itens_separados') || text.includes('total_produtos_separados') || text.includes('total_pacotes_montados')))
            || (text.includes('column') && (text.includes('total_itens_separados') || text.includes('total_produtos_separados') || text.includes('total_pacotes_montados')));
    }

    function stripPickingTotalsColumns(row) {
        const clone = { ...row };
        delete clone.total_produtos_separados;
        delete clone.total_itens_separados;
        delete clone.total_pacotes_montados;
        return clone;
    }

    function isTemporaryPickingSessionId(sessionId) {
        return /^SEP-TEMP?-/.test(String(sessionId || '').trim().toUpperCase());
    }

    function isValidPickingSessionId(sessionId) {
        return /^SEP-[A-Z0-9]+-\d{4}-\d{2,}$/.test(String(sessionId || '').trim().toUpperCase());
    }

    function validatePickingSessionBeforeSave(session = {}) {
        const sessionId = String(session.separacao_id || '').trim();
        const channelLabel = String(session.canal_nome || '').trim();
        if (!sessionId) throw new Error('separacao_id nao informado');
        if (!channelLabel) throw new Error('canal_nome nao informado para separacao');
        if (isTemporaryPickingSessionId(sessionId) || !isValidPickingSessionId(sessionId)) {
            throw new Error(`separacao_id invalido para gravacao: ${sessionId}`);
        }
    }

    async function savePickingDraftSupabase(payload) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const now = getDataHoraBrasil();
        const session = payload.session || {};
        const item = payload.item || null;

        validatePickingSessionBeforeSave(session);

        const separacaoRow = {
            separacao_id: session.separacao_id,
            pedido_referencia: session.pedido_referencia || null,
            canal_id: session.canal_id || '',
            canal_nome: session.canal_nome || '',
            status: session.status || 'em_separacao',
            criado_por: session.criado_por || localStorage.getItem('currentUser') || 'N/A',
            criado_em: session.criado_em || now,
            atualizado_em: now,
            finalizado_em: session.finalizado_em || null,
            total_produtos_separados: Number(session.total_produtos_separados || 0),
            total_itens_separados: Number(session.total_itens_separados || 0),
            total_pacotes_montados: Number(session.total_pacotes_montados || 0),
            observacao: session.observacao || null
        };

        console.log('[SEP] criando separacao payload', separacaoRow);

        let { data: sepData, error: sepError } = await client
            .from('separacao')
            .upsert([separacaoRow], { onConflict: 'separacao_id' })
            .select()
            .single();

        if (sepError && isMissingPickingTotalsColumnError(sepError)) {
            const fallbackRow = stripPickingTotalsColumns(separacaoRow);
            logSepSupabaseError('colunas de totais ausentes; salvando separacao sem totais', sepError, separacaoRow);
            const fallback = await client
                .from('separacao')
                .upsert([fallbackRow], { onConflict: 'separacao_id' })
                .select()
                .single();
            sepData = fallback.data;
            sepError = fallback.error;
        }

        if (sepError) {
            logSepSupabaseError('erro ao criar separacao', sepError, separacaoRow);
            throw sepError;
        }

        console.log('[SEP] separacao criada', sepData);

        let itemData = null;
        if (item && item.id_interno) {
            const itemRow = {
                separacao_id: session.separacao_id,
                id_interno: item.id_interno,
                ean: item.ean || null,
                descricao: item.descricao || '',
                qtd_solicitada: Number(item.qtd_solicitada || item.qtd_separada || 1),
                qtd_separada: Number(item.qtd_separada || item.qtd_solicitada || 1),
                atualizado_em: now
            };

            console.log('[SEP] salvando item payload', itemRow);

            const { data: existing, error: existingError } = await client
                .from('separacao_itens')
                .select('id')
                .eq('separacao_id', session.separacao_id)
                .eq('id_interno', itemRow.id_interno)
                .limit(1);

            if (existingError) {
                logSepSupabaseError('erro ao salvar item', existingError, itemRow);
                throw existingError;
            }

            if (existing && existing.length > 0) {
                const { data, error } = await client
                    .from('separacao_itens')
                    .update(itemRow)
                    .eq('separacao_id', session.separacao_id)
                    .eq('id_interno', itemRow.id_interno)
                    .select();

                if (error) {
                    logSepSupabaseError('erro ao salvar item', error, itemRow);
                    throw error;
                }
                itemData = data;
            } else {
                const { data, error } = await client
                    .from('separacao_itens')
                    .insert([itemRow])
                    .select();

                if (error) {
                    logSepSupabaseError('erro ao salvar item', error, itemRow);
                    throw error;
                }
                itemData = data;
            }

            console.log('[SEP] item salvo', itemData);
        }

        invalidateCache('separacao');
        invalidateCache('conferencia');

        return { separacao: sepData, item: itemData };
    }

    async function savePickingDraftItemsBatchSupabase(payload) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const now = getDataHoraBrasil();
        const session = payload.session || {};
        const items = Array.isArray(payload.items) ? payload.items : [];

        validatePickingSessionBeforeSave(session);

        const separacaoRow = {
            separacao_id: session.separacao_id,
            pedido_referencia: session.pedido_referencia || null,
            canal_id: session.canal_id || '',
            canal_nome: session.canal_nome || '',
            status: session.status || 'em_separacao',
            criado_por: session.criado_por || localStorage.getItem('currentUser') || 'N/A',
            criado_em: session.criado_em || now,
            atualizado_em: now,
            finalizado_em: session.finalizado_em || null,
            total_produtos_separados: Number(session.total_produtos_separados || 0),
            total_itens_separados: Number(session.total_itens_separados || 0),
            total_pacotes_montados: Number(session.total_pacotes_montados || 0),
            observacao: session.observacao || null
        };

        let { data: sepData, error: sepError } = await client
            .from('separacao')
            .upsert([separacaoRow], { onConflict: 'separacao_id' })
            .select()
            .single();

        if (sepError && isMissingPickingTotalsColumnError(sepError)) {
            const fallbackRow = stripPickingTotalsColumns(separacaoRow);
            logSepSupabaseError('colunas de totais ausentes; salvando separacao em lote sem totais', sepError, separacaoRow);
            const fallback = await client
                .from('separacao')
                .upsert([fallbackRow], { onConflict: 'separacao_id' })
                .select()
                .single();
            sepData = fallback.data;
            sepError = fallback.error;
        }

        if (sepError) {
            logSepSupabaseError('erro ao salvar separacao em lote', sepError, separacaoRow);
            throw sepError;
        }

        const { error: deleteError } = await client
            .from('separacao_itens')
            .delete()
            .eq('separacao_id', session.separacao_id);

        if (deleteError) {
            logSepSupabaseError('erro ao preparar itens em lote', deleteError, { separacao_id: session.separacao_id });
            throw deleteError;
        }

        const itemRows = items
            .filter(item => item && item.id_interno)
            .map(item => ({
                separacao_id: session.separacao_id,
                id_interno: item.id_interno,
                ean: item.ean || null,
                descricao: item.descricao || '',
                qtd_solicitada: Number(item.qtd_solicitada || item.qtd_separada || 1),
                qtd_separada: Number(item.qtd_separada || item.qtd_solicitada || 1),
                atualizado_em: now
            }));

        let itemData = [];
        if (itemRows.length) {
            const { data, error } = await client
                .from('separacao_itens')
                .insert(itemRows)
                .select();

            if (error) {
                logSepSupabaseError('erro ao inserir itens em lote', error, { separacao_id: session.separacao_id, total: itemRows.length });
                throw error;
            }
            itemData = data || [];
        }

        invalidateCache('separacao');
        invalidateCache('conferencia');

        return { separacao: sepData, items: itemData };
    }
    async function finalizePickingDraftSupabase(payload) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const now = getDataHoraBrasil();
        const sessionId = payload.sessionId;
        if (!sessionId) throw new Error('separacao_id nao informado');
        if (isTemporaryPickingSessionId(sessionId) || !isValidPickingSessionId(sessionId)) {
            throw new Error(`separacao_id invalido para finalizacao: ${sessionId}`);
        }

        const updatePayload = {
            status: payload.status || 'aberta',
            atualizado_em: now,
            finalizado_em: now,
            total_produtos_separados: Number(payload.total_produtos_separados || 0),
            total_itens_separados: Number(payload.total_itens_separados || 0),
            total_pacotes_montados: Number(payload.total_pacotes_montados || 0)
        };

        console.log('[SEP] finalizando separacao', { sessionId, payload: updatePayload });

        let { data, error } = await client
            .from('separacao')
            .update(updatePayload)
            .eq('separacao_id', sessionId)
            .select()
            .single();

        if (error && isMissingPickingTotalsColumnError(error)) {
            const fallbackPayload = stripPickingTotalsColumns(updatePayload);
            logSepSupabaseError('colunas de totais ausentes; finalizando separacao sem totais', error, { sessionId, ...updatePayload });
            const fallback = await client
                .from('separacao')
                .update(fallbackPayload)
                .eq('separacao_id', sessionId)
                .select()
                .single();
            data = fallback.data;
            error = fallback.error;
        }

        if (error) {
            logSepSupabaseError('erro ao finalizar separacao', error, { sessionId, ...updatePayload });
            throw error;
        }

        invalidateCache('separacao');
        invalidateCache('conferencia');

        return data;
    }

    async function deletePickingDraftSupabase(payload = {}) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const sessionId = payload.sessionId || payload.separacao_id;
        if (!sessionId) throw new Error('separacao_id nao informado');

        const { data: sessions, error: lookupError } = await client
            .from('separacao')
            .select('separacao_id,status')
            .eq('separacao_id', sessionId)
            .limit(1);

        if (lookupError) {
            logSepSupabaseError('erro ao buscar rascunho para exclusao', lookupError, { sessionId });
            throw lookupError;
        }

        const session = Array.isArray(sessions) ? sessions[0] : null;
        if (!session) return { deleted: false, missing: true };

        const status = String(session.status || '').toLowerCase();
        const blockedStatuses = new Set(['finalizada', 'finalizado', 'concluida', 'concluido', 'faturada', 'faturado']);
        if (blockedStatuses.has(status)) {
            throw new Error('Separacao finalizada/concluida/faturada nao pode ser excluida.');
        }

        const { data: conferencias, error: confLookupError } = await client
            .from('conferencia')
            .select('conferencia_id,status')
            .eq('separacao_id', sessionId);

        if (confLookupError) {
            logSepSupabaseError('erro ao buscar conferencia para exclusao', confLookupError, { sessionId });
            throw confLookupError;
        }

        const blockedConference = (conferencias || []).find(row => {
            const confStatus = String(row.status || '').toLowerCase();
            return blockedStatuses.has(confStatus) || confStatus === 'conferido';
        });
        if (blockedConference) {
            throw new Error('Separacao com conferencia finalizada/concluida/faturada nao pode ser excluida.');
        }

        const { error: confItemsError } = await client
            .from('conferencia_itens')
            .delete()
            .eq('separacao_id', sessionId);

        if (confItemsError) {
            logSepSupabaseError('erro ao excluir itens da conferencia vinculada', confItemsError, { sessionId });
            throw confItemsError;
        }

        const { error: confError } = await client
            .from('conferencia')
            .delete()
            .eq('separacao_id', sessionId);

        if (confError) {
            logSepSupabaseError('erro ao excluir conferencia vinculada', confError, { sessionId });
            throw confError;
        }
        const { error: itemsError } = await client
            .from('separacao_itens')
            .delete()
            .eq('separacao_id', sessionId);

        if (itemsError) {
            logSepSupabaseError('erro ao excluir itens do rascunho', itemsError, { sessionId });
            throw itemsError;
        }

        const { error: sessionError } = await client
            .from('separacao')
            .delete()
            .eq('separacao_id', sessionId);

        if (sessionError) {
            logSepSupabaseError('erro ao excluir rascunho', sessionError, { sessionId });
            throw sessionError;
        }

        const { data: remainingSessions, error: verifyError } = await client
            .from('separacao')
            .select('separacao_id,status')
            .eq('separacao_id', sessionId)
            .limit(1);

        if (verifyError) {
            logSepSupabaseError('erro ao verificar exclusao do rascunho', verifyError, { sessionId });
            throw verifyError;
        }

        if (Array.isArray(remainingSessions) && remainingSessions.length > 0) {
            const { data: softDeleted, error: softDeleteError } = await client
                .from('separacao')
                .update({ status: 'cancelada' })
                .eq('separacao_id', sessionId)
                .select('separacao_id,status')
                .limit(1);

            if (softDeleteError) {
                logSepSupabaseError('erro ao cancelar rascunho apos delete bloqueado', softDeleteError, { sessionId });
                throw softDeleteError;
            }

            const softDeletedRow = Array.isArray(softDeleted) ? softDeleted[0] : null;
            if (!softDeletedRow || String(softDeletedRow.status || '').toLowerCase() !== 'cancelada') {
                throw new Error('Separacao nao foi excluida nem cancelada no servidor. Verifique permissao no Supabase/RLS.');
            }

            invalidateCache('separacao');
            invalidateCache('conferencia');
            return { deleted: false, softDeleted: true, sessionId };
        }

        invalidateCache('separacao');
        invalidateCache('conferencia');

        return { deleted: true, sessionId };
    }

    function mapEtiquetaItemToDb(item = {}, index = 0, loteId = null) {
        const quantity = Math.max(1, Math.floor(Number(item.quantity ?? item.quantidade_etiquetas ?? 1) || 1));
        const idInterno = String(item.idInterno || item.id_interno || item.code || item.codigo_barra || '').trim();
        const texto = String(item.name || item.texto_etiqueta || item.descricao_completa || item.descricao_base || '').trim();
        return {
            ...(loteId ? { lote_id: loteId } : {}),
            produto_id: String(item.productId || item.produto_id || '').trim() || null,
            id_interno: idInterno || null,
            descricao_base: String(item.descricao_base || item.name || texto || '').trim() || null,
            descricao_completa: String(item.descricao_completa || item.name || texto || '').trim() || null,
            ean: String(item.ean || '').trim() || null,
            quantidade_etiquetas: quantity,
            texto_etiqueta: texto || null,
            codigo_barra: String(item.codigo_barra || idInterno || '').trim() || null,
            ordem: Math.max(1, Math.floor(Number(item.ordem || index + 1) || index + 1))
        };
    }

    function mapEtiquetaLoteToDb(payload = {}, statusFallback = 'rascunho') {
        const lote = payload.lote || payload;
        return {
            nome_lote: String(lote.nome_lote || lote.nomeLote || '').trim() || null,
            modelo_etiqueta: String(lote.modelo_etiqueta || lote.modeloEtiqueta || lote.template || '').trim() || null,
            usuario_id: String(lote.usuario_id || lote.usuarioId || localStorage.getItem('currentUserId') || '').trim() || null,
            usuario_nome: String(lote.usuario_nome || lote.usuarioNome || localStorage.getItem('currentUser') || '').trim() || null,
            status: String(lote.status || statusFallback || 'rascunho').trim() || 'rascunho',
            observacoes: String(lote.observacoes || '').trim() || null
        };
    }

    async function salvarEtiquetaLote(payload = {}) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const lotePayload = mapEtiquetaLoteToDb(payload, 'rascunho');
        const items = Array.isArray(payload.items) ? payload.items : [];
        const { data: lote, error: loteError } = await client
            .from('etiquetas_lotes')
            .insert([{
                ...lotePayload,
                atualizado_em: getDataHoraBrasil()
            }])
            .select()
            .single();

        if (loteError) {
            console.error('[ETIQUETAS] erro ao salvar lote:', loteError);
            throw loteError;
        }

        let itens = [];
        const itensPayload = items
            .map((item, index) => mapEtiquetaItemToDb(item, index, lote.id))
            .filter(item => item.texto_etiqueta || item.id_interno || item.codigo_barra);

        if (itensPayload.length) {
            const { data, error } = await client
                .from('etiquetas_lotes_itens')
                .insert(itensPayload)
                .select();

            if (error) {
                console.error('[ETIQUETAS] erro ao salvar itens do lote:', error);
                throw error;
            }
            itens = data || [];
        }

        invalidateCache('etiquetas');
        return { ...lote, itens };
    }

    async function listarEtiquetaLotes() {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');

        const { data: lotes, error } = await client
            .from('etiquetas_lotes')
            .select('*')
            .order('atualizado_em', { ascending: false });

        if (error) {
            console.error('[ETIQUETAS] erro ao listar lotes:', error);
            throw error;
        }

        const loteIds = (lotes || []).map(lote => lote.id).filter(Boolean);
        let itens = [];
        if (loteIds.length) {
            const itensResult = await client
                .from('etiquetas_lotes_itens')
                .select('*')
                .in('lote_id', loteIds)
                .order('ordem', { ascending: true });

            if (itensResult.error) {
                console.error('[ETIQUETAS] erro ao listar itens dos lotes:', itensResult.error);
                throw itensResult.error;
            }
            itens = itensResult.data || [];
        }

        const itensPorLote = itens.reduce((map, item) => {
            if (!map.has(item.lote_id)) map.set(item.lote_id, []);
            map.get(item.lote_id).push(item);
            return map;
        }, new Map());

        return (lotes || []).map(lote => {
            const loteItens = itensPorLote.get(lote.id) || [];
            return {
                ...lote,
                itens: loteItens,
                quantidade_produtos: loteItens.length,
                quantidade_total_etiquetas: loteItens.reduce((total, item) => total + Math.max(0, Number(item.quantidade_etiquetas) || 0), 0)
            };
        });
    }

    async function buscarEtiquetaLotePorId(id) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        if (!id) throw new Error('ID do lote nao informado');

        const { data: lote, error: loteError } = await client
            .from('etiquetas_lotes')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (loteError) {
            console.error('[ETIQUETAS] erro ao buscar lote:', loteError);
            throw loteError;
        }
        if (!lote) return null;

        const { data: itens, error: itensError } = await client
            .from('etiquetas_lotes_itens')
            .select('*')
            .eq('lote_id', id)
            .order('ordem', { ascending: true });

        if (itensError) {
            console.error('[ETIQUETAS] erro ao buscar itens do lote:', itensError);
            throw itensError;
        }

        return { ...lote, itens: itens || [] };
    }

    async function atualizarEtiquetaLote(id, payload = {}) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        if (!id) throw new Error('ID do lote nao informado');

        const lotePayload = mapEtiquetaLoteToDb(payload, 'rascunho');
        const { data: lote, error: loteError } = await client
            .from('etiquetas_lotes')
            .update({
                ...lotePayload,
                atualizado_em: getDataHoraBrasil()
            })
            .eq('id', id)
            .select()
            .single();

        if (loteError) {
            console.error('[ETIQUETAS] erro ao atualizar lote:', loteError);
            throw loteError;
        }

        const deleteResult = await client
            .from('etiquetas_lotes_itens')
            .delete()
            .eq('lote_id', id);

        if (deleteResult.error) {
            console.error('[ETIQUETAS] erro ao limpar itens do lote:', deleteResult.error);
            throw deleteResult.error;
        }

        let itens = [];
        const itensPayload = (Array.isArray(payload.items) ? payload.items : [])
            .map((item, index) => mapEtiquetaItemToDb(item, index, id))
            .filter(item => item.texto_etiqueta || item.id_interno || item.codigo_barra);

        if (itensPayload.length) {
            const { data, error } = await client
                .from('etiquetas_lotes_itens')
                .insert(itensPayload)
                .select();

            if (error) {
                console.error('[ETIQUETAS] erro ao atualizar itens do lote:', error);
                throw error;
            }
            itens = data || [];
        }

        invalidateCache('etiquetas');
        return { ...lote, itens };
    }

    async function duplicarEtiquetaLote(id, overrides = {}) {
        const original = await buscarEtiquetaLotePorId(id);
        if (!original) throw new Error('Lote de etiquetas nao encontrado');

        const items = (original.itens || []).map(item => ({
            productId: item.produto_id,
            idInterno: item.id_interno || item.codigo_barra,
            name: item.texto_etiqueta || item.descricao_completa || item.descricao_base,
            descricao_base: item.descricao_base,
            descricao_completa: item.descricao_completa,
            ean: item.ean,
            quantity: item.quantidade_etiquetas,
            codigo_barra: item.codigo_barra
        }));

        return await salvarEtiquetaLote({
            lote: {
                nome_lote: overrides.nome_lote || `${original.nome_lote || 'Lote'} - copia`,
                modelo_etiqueta: overrides.modelo_etiqueta || original.modelo_etiqueta,
                usuario_id: overrides.usuario_id || localStorage.getItem('currentUserId') || original.usuario_id,
                usuario_nome: overrides.usuario_nome || localStorage.getItem('currentUser') || original.usuario_nome,
                status: 'rascunho',
                observacoes: overrides.observacoes ?? original.observacoes
            },
            items
        });
    }

    async function marcarEtiquetaLoteComoImpresso(id) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        if (!id) throw new Error('ID do lote nao informado');

        const now = getDataHoraBrasil();
        const { data, error } = await client
            .from('etiquetas_lotes')
            .update({
                status: 'impresso',
                impresso_em: now,
                atualizado_em: now
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[ETIQUETAS] erro ao marcar lote como impresso:', error);
            throw error;
        }

        invalidateCache('etiquetas');
        return data;
    }

    /**
     * ENTRADA NF - Listar notas abertas
     */
    async function listEntradasNFAbertas() {
        const client = window.supabaseClient;
        if (!client) return [];

        console.log('[ENTRADA NF DEBUG] listando notas abertas');

        const { data, error } = await client
            .from('entradas_nf')
            .select('*')
            .not('status', 'in', '("finalizada", "cancelada", "entrada_confirmada", "financeiro_lancado")')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[ENTRADA NF DEBUG] erro supabase:', error);
            return [];
        }

        return data || [];
    }

    /**
     * ENTRADA NF - Buscar por ID
     */
    async function getEntradaNFById(id) {
        const client = window.supabaseClient;
        if (!client) return null;

        const { data, error } = await client
            .from('entradas_nf')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('[ENTRADA NF DEBUG] erro supabase:', error);
            return null;
        }

        return data;
    }

    /**
     * GARANTIA - Salvar envio
     */
    async function saveGarantiaSupabase(garantiaData) {
        const client = window.supabaseClient;
        if (!client) {
            console.error('[GARANTIA DEBUG] erro supabase: client no encontrado');
            return null;
        }

        const executionId = garantiaData.executionId || `gar_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const rpcPayload = {
            p_id_interno: garantiaData.id_interno,
            p_descricao_produto: garantiaData.descricao_produto,
            p_fornecedor: garantiaData.fornecedor,
            p_tipo_operacao: garantiaData.tipo_operacao,
            p_motivo: garantiaData.motivo,
            p_observacao: garantiaData.observacao,
            p_origem_estoque: normalizeLocal(garantiaData.origem_estoque),
            p_quantidade: Number(garantiaData.quantidade || 0),
            p_custo_unitario: Number(garantiaData.custo_unitario || 0),
            p_custo_total: Number(garantiaData.custo_total || 0),
            p_usuario: localStorage.getItem('currentUser') || 'N/A',
            p_execution_id: executionId
        };

        console.log('[GARANTIA RPC] enviando garantia', rpcPayload);

        const { data, error } = await client.rpc('enviar_garantia', rpcPayload);

        if (error) {
            console.error('[GARANTIA RPC] erro supabase:', error);
            const missingRpc = error.code === 'PGRST202' || String(error.message || '').includes('enviar_garantia');
            const rpcError = new Error(missingRpc
                ? 'RPC enviar_garantia ainda nao aplicada no Supabase. O envio foi bloqueado para evitar saldo parcial.'
                : (error.message || 'Erro ao enviar produto para garantia no Supabase'));
            rpcError.code = error.code;
            rpcError.details = error.details;
            rpcError.hint = error.hint;
            rpcError.supabaseError = error;
            throw rpcError;
        }

        console.log('[GARANTIA RPC] garantia enviada', data);
        invalidateCache('garantia');
        invalidateCache('produtos');
        invalidateCache('movimentos');
        return data;
    }



    // DEVOLUCOES: controle e entrada automatica no estoque.
    function isDevolucaoReembolsoSchemaError(error) {
        const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
        return error?.code === 'PGRST204'
            || error?.code === '42703'
            || text.includes('tarifa_devolucao_reembolsada')
            || text.includes('p_tarifa_devolucao_reembolsada')
            || text.includes('reputacao_revertida')
            || text.includes('p_reputacao_revertida')
            || (text.includes('schema cache') && text.includes('devolucoes'));
    }

    function stripDevolucaoReembolsoColumn(row) {
        const clone = { ...row };
        delete clone.tarifa_devolucao_reembolsada;
        delete clone.reputacao_revertida;
        return clone;
    }

    function isDevolucaoItemStockSchemaError(error) {
        const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
        return error?.code === 'PGRST204'
            || error?.code === '42703'
            || text.includes('apto_venda')
            || text.includes('estoque_movimentado')
            || text.includes('estoque_local')
            || text.includes('estoque_movimento_id')
            || (text.includes('schema cache') && text.includes('devolucao_itens'));
    }

    function stripDevolucaoItemStockColumns(item) {
        const clone = { ...item };
        delete clone.apto_venda;
        delete clone.estoque_movimentado;
        delete clone.estoque_local;
        delete clone.estoque_movimento_id;
        return clone;
    }

    function cleanDevolucaoItemForWrite(item, devolucaoId) {
        const clone = { ...item, devolucao_id: devolucaoId };
        delete clone.localId;
        delete clone.id;
        delete clone.valor_total;
        delete clone.criado_em;
        delete clone.atualizado_em;
        delete clone.estoque_movimento;
        return clone;
    }

    async function saveDevolucaoMarketplaceSupabase(payload) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        const { data, error } = await client.rpc('salvar_devolucao_marketplace', {
            p_devolucao: payload.devolucao,
            p_itens: payload.itens
        });
        if (error) {
            const missingRpc = error.code === 'PGRST202'
                || error.code === '42883'
                || String(error.message || '').includes('salvar_devolucao_marketplace');
            if (missingRpc || isDevolucaoReembolsoSchemaError(error) || isDevolucaoItemStockSchemaError(error)) {
                const headerPayload = {
                    ...payload.devolucao,
                    tipo: 'marketplace',
                    status: payload.devolucao.status || (payload.devolucao.marketplace_acionado ? 'em_analise' : 'resolvida')
                };
                let { data: header, error: headerError } = await client
                    .from('devolucoes')
                    .insert(headerPayload)
                    .select('id')
                    .single();
                if (headerError && isDevolucaoReembolsoSchemaError(headerError)) {
                    console.warn('[DEVOLUCOES] coluna de reembolso ainda nao aplicada; salvando sem tarifa reembolsada.');
                    const retry = await client
                        .from('devolucoes')
                        .insert(stripDevolucaoReembolsoColumn(headerPayload))
                        .select('id')
                        .single();
                    header = retry.data;
                    headerError = retry.error;
                }
                if (headerError) {
                    const fallbackError = new Error(
                        ['42P01', 'PGRST204', 'PGRST205'].includes(headerError.code)
                            ? 'A estrutura atualizada de devolucoes ainda nao foi aplicada no Supabase.'
                            : (headerError.message || 'Erro ao salvar a devolucao')
                    );
                    fallbackError.code = headerError.code;
                    throw fallbackError;
                }
                const itemRows = (payload.itens || []).map(item => cleanDevolucaoItemForWrite(item, header.id));
                let { error: itemsError } = await client.from('devolucao_itens').insert(itemRows);
                if (itemsError && isDevolucaoItemStockSchemaError(itemsError)) {
                    console.warn('[DEVOLUCOES] colunas de estoque dos itens ausentes; salvando itens no formato antigo e movimentando pelo payload.');
                    const retry = await client
                        .from('devolucao_itens')
                        .insert(itemRows.map(stripDevolucaoItemStockColumns));
                    itemsError = retry.error;
                }
                if (itemsError) {
                    await client.from('devolucoes').delete().eq('id', header.id);
                    throw new Error(itemsError.message || 'Erro ao salvar os produtos da devolucao');
                }
                invalidateCache('devolucoes');
                return header.id;
            }
            console.error('[DEVOLUCOES] erro ao salvar:', error);
            const missingStructure = ['PGRST202', '42P01', '42883'].includes(error.code)
                || String(error.message || '').includes('salvar_devolucao_marketplace');
            const saveError = new Error(missingStructure
                ? 'A estrutura de devolucoes ainda nao foi aplicada no Supabase.'
                : (error.message || 'Erro ao salvar a devolucao'));
            saveError.code = error.code;
            throw saveError;
        }
        const savedId = typeof data === 'string' ? data : (data?.id || data);
        if (savedId && payload.devolucao.status) {
            try {
                await client.rpc('atualizar_status_devolucao', { p_id: savedId, p_status: payload.devolucao.status });
            } catch (statusError) {
                console.warn('[DEVOLUCOES] status inicial nao atualizado apos salvar:', statusError?.message || statusError);
            }
        }
        invalidateCache('devolucoes');
        return data;
    }

    async function updateDevolucaoMarketplaceSupabase(id, payload) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        if (!id) throw new Error('Registro de devolucao nao informado');

        const headerPayload = {
            ...payload.devolucao,
            tipo: 'marketplace',
            status: payload.devolucao.status || (payload.devolucao.marketplace_acionado ? 'em_analise' : 'resolvida'),
            atualizado_em: new Date().toISOString()
        };

        let { error: headerError } = await client
            .from('devolucoes')
            .update(headerPayload)
            .eq('id', id);
        if (headerError && isDevolucaoReembolsoSchemaError(headerError)) {
            const retry = await client
                .from('devolucoes')
                .update(stripDevolucaoReembolsoColumn(headerPayload))
                .eq('id', id);
            headerError = retry.error;
        }
        if (headerError) {
            console.error('[DEVOLUCOES] erro ao atualizar devolucao:', headerError);
            throw new Error(headerError.message || 'Erro ao atualizar a devolucao');
        }

        const { error: deleteItemsError } = await client
            .from('devolucao_itens')
            .delete()
            .eq('devolucao_id', id);
        if (deleteItemsError) {
            console.error('[DEVOLUCOES] erro ao limpar itens da devolucao:', deleteItemsError);
            throw new Error(deleteItemsError.message || 'Erro ao atualizar os produtos da devolucao');
        }

        const itemRows = (payload.itens || []).map(item => cleanDevolucaoItemForWrite(item, id));
        if (itemRows.length) {
            let { error: itemsError } = await client.from('devolucao_itens').insert(itemRows);
            if (itemsError && isDevolucaoItemStockSchemaError(itemsError)) {
                console.warn('[DEVOLUCOES] colunas de estoque dos itens ausentes; recriando itens no formato antigo e movimentando pelo payload.');
                const retry = await client
                    .from('devolucao_itens')
                    .insert(itemRows.map(stripDevolucaoItemStockColumns));
                itemsError = retry.error;
            }
            if (itemsError) {
                console.error('[DEVOLUCOES] erro ao recriar itens da devolucao:', itemsError);
                throw new Error(itemsError.message || 'Erro ao salvar os produtos da devolucao');
            }
        }

        invalidateCache('devolucoes');
        return true;
    }

    async function applyDevolucaoEstoqueSupabase(devolucaoId, devolucao = {}, itens = []) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        if (!devolucaoId) throw new Error('Registro de devolucao nao informado para movimentar estoque');

        const itensParaEstoque = (itens || []).filter(item =>
            item.estoque_movimentado !== true
            && String(item.id_interno || '').trim()
            && Number(item.quantidade || 0) > 0
        );
        if (!itensParaEstoque.length) return { movimentos: 0 };

        const schemaCheck = await client
            .from('devolucao_itens')
            .select('apto_venda,estoque_movimentado,estoque_local,estoque_movimento_id')
            .eq('devolucao_id', devolucaoId)
            .limit(1);
        const canMarkDevolucaoItems = !schemaCheck.error;
        if (schemaCheck.error && !isDevolucaoItemStockSchemaError(schemaCheck.error)) {
            console.error('[DEVOLUCOES] estrutura de estoque da devolucao ausente:', schemaCheck.error);
            throw new Error('Rode o SQL de devolucoes no Supabase antes de movimentar estoque pela devolucao.');
        }
        if (schemaCheck.error) {
            console.warn('[DEVOLUCOES] colunas de controle de estoque da devolucao ausentes; movimento sera criado sem marcar o item como movimentado.');
        }

        let movimentos = 0;
        for (const item of itensParaEstoque) {
            const localDestino = item.apto_venda !== false ? 'TERREO' : 'DEFEITO';
            const quantidade = Number(item.quantidade || 0);
            const movimento = await saveMovimentoSupabase({
                tipo: 'ENTRADA',
                id_interno: item.id_interno,
                local_origem: '',
                local_destino: localDestino,
                quantidade,
                usuario: devolucao.responsavel || localStorage.getItem('currentUser') || 'N/A',
                origem: 'MANUAL',
                observacao: 'Devolucao marketplace pedido ' + (devolucao.pedido || '-') + (item.apto_venda !== false ? ' - produto apto para venda' : ' - produto nao apto enviado para defeito')
            });
            if (!movimento) throw new Error('Erro ao gerar movimento de estoque para ' + item.id_interno);

            const estoqueOk = await updateEstoqueSupabase(item.id_interno, localDestino, 'soma', quantidade);
            if (!estoqueOk) throw new Error('Movimento criado, mas o estoque nao foi atualizado para ' + item.id_interno);

            if (canMarkDevolucaoItems) {
                const { error: updateItemError } = await client
                    .from('devolucao_itens')
                    .update({
                        apto_venda: item.apto_venda !== false,
                        estoque_movimentado: true,
                        estoque_local: localDestino,
                        estoque_movimento_id: movimento.movimento_id || null,
                        atualizado_em: getDataHoraBrasil()
                    })
                    .eq('devolucao_id', devolucaoId)
                    .eq('id_interno', item.id_interno);
                if (updateItemError) {
                    console.error('[DEVOLUCOES] erro ao marcar item como movimentado:', updateItemError);
                    throw new Error(updateItemError.message || 'Estoque movimentado, mas nao foi possivel marcar o item da devolucao.');
                }
            }

            item.estoque_movimentado = true;
            item.estoque_local = localDestino;
            item.estoque_movimento_id = movimento.movimento_id || '';
            movimentos += 1;
        }

        if (movimentos) {
            invalidateCache('devolucoes');
            invalidateCache('movimentos');
            invalidateCache('produtos');
        }
        return { movimentos };
    }

    async function listDevolucoesSupabase() {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        const { data, error } = await client
            .from('devolucoes')
            .select('*, devolucao_itens(*)')
            .order('data_devolucao', { ascending: false })
            .order('criado_em', { ascending: false });
        if (error) {
            console.error('[DEVOLUCOES] erro ao listar:', error);
            const listError = new Error(error.code === '42P01'
                ? 'A estrutura de devolucoes ainda nao foi aplicada no Supabase.'
                : (error.message || 'Erro ao carregar as devolucoes'));
            listError.code = error.code;
            throw listError;
        }
        return data || [];
    }

    async function updateDevolucaoItemCostSupabase(itemId, valorUnitario) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        if (!itemId) throw new Error('Item da devolucao nao informado');
        const { error } = await client
            .from('devolucao_itens')
            .update({ valor_unitario: Number(valorUnitario || 0) })
            .eq('id', itemId);
        if (error) {
            console.error('[DEVOLUCOES] erro ao atualizar custo do item:', error);
            throw new Error(error.message || 'Erro ao atualizar custo do produto da devolucao');
        }
        invalidateCache('devolucoes');
        return true;
    }

    async function updateDevolucaoStatusSupabase(id, status) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        const { error } = await client.rpc('atualizar_status_devolucao', { p_id: id, p_status: status });
        if (error) {
            console.error('[DEVOLUCOES] erro ao atualizar status:', error);
            throw new Error(error.message || 'Erro ao atualizar o status da devolucao');
        }
        invalidateCache('devolucoes');
        return true;
    }

    async function deleteDevolucaoSupabase(id) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        const { error } = await client
            .from('devolucoes')
            .delete()
            .eq('id', id);
        if (error) {
            console.error('[DEVOLUCOES] erro ao excluir:', error);
            throw new Error(error.message || 'Erro ao excluir a devolucao');
        }
        invalidateCache('devolucoes');
        return true;
    }

    async function updateDevolucaoFollowUpSupabase(id, marketplaceAcionado, observacao, saldoMarketplace = 0, tarifaReembolso = 0, status = null, reputacaoRevertida = false) {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client nao encontrado');
        let { error } = await client.rpc('atualizar_acompanhamento_devolucao', {
            p_id: id,
            p_marketplace_acionado: Boolean(marketplaceAcionado),
            p_observacao: String(observacao || '').trim(),
            p_saldo_marketplace: Number(saldoMarketplace || 0),
            p_tarifa_devolucao_reembolsada: Number(tarifaReembolso || 0),
            p_reputacao_revertida: Boolean(reputacaoRevertida)
        });
        if (error && (error.code === 'PGRST202' || error.code === '42883' || isDevolucaoReembolsoSchemaError(error))) {
            console.warn('[DEVOLUCOES] acompanhamento sem coluna de reembolso; usando funcao antiga.');
            const legacy = await client.rpc('atualizar_acompanhamento_devolucao', {
                p_id: id,
                p_marketplace_acionado: Boolean(marketplaceAcionado),
                p_observacao: String(observacao || '').trim(),
                p_saldo_marketplace: Number(saldoMarketplace || 0)
            });
            error = legacy.error;
        }
        if (error) {
            console.error('[DEVOLUCOES] erro ao atualizar acompanhamento:', error);
            throw new Error(error.message || 'Erro ao atualizar o acompanhamento do marketplace');
        }
        if (!error) {
            const { error: reputationError } = await client
                .from('devolucoes')
                .update({ reputacao_revertida: Boolean(reputacaoRevertida) })
                .eq('id', id);
            if (reputationError && !isDevolucaoReembolsoSchemaError(reputationError)) {
                console.warn('[DEVOLUCOES] reputacao revertida nao atualizada:', reputationError.message);
            }
        }
        if (status) {
            const { error: statusError } = await client.rpc('atualizar_status_devolucao', { p_id: id, p_status: status });
            if (statusError) {
                console.warn('[DEVOLUCOES] erro ao alinhar status do acompanhamento:', statusError.message);
            }
        }
        invalidateCache('devolucoes');
        return true;
    }


    async function findFornecedorForProductSupabase(product) {
        const client = window.supabaseClient;
        if (!client || !product) return null;
        const lookups = [
            ['id_interno', product.id_interno],
            ['produto_id', product.id],
            ['ean_fornecedor', product.ean]
        ].filter(([, value]) => String(value || '').trim());
        let vinculo = null;
        for (const [field, rawValue] of lookups) {
            const { data, error } = await client
                .from('fornecedor_produtos')
                .select('fornecedor_cnpj,ultima_compra_em')
                .eq(field, String(rawValue).trim())
                .order('ultima_compra_em', { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle();
            if (error) {
                console.warn('[DEVOLUCOES] fornecedor do produto nao localizado:', error.message);
                continue;
            }
            if (data) {
                vinculo = data;
                break;
            }
        }
        if (!vinculo?.fornecedor_cnpj) return null;
        const { data: fornecedor, error: fornecedorError } = await client
            .from('fornecedores')
            .select('nome_fantasia,razao_social,cnpj')
            .eq('cnpj', vinculo.fornecedor_cnpj)
            .maybeSingle();
        if (fornecedorError) {
            console.warn('[DEVOLUCOES] cadastro do fornecedor nao localizado:', fornecedorError.message);
            return vinculo.fornecedor_cnpj;
        }
        return fornecedor?.nome_fantasia || fornecedor?.razao_social || fornecedor?.cnpj || vinculo.fornecedor_cnpj;
    }


    async function finalizarConferenciaSupabase(payload) {
        const client = window.supabaseClient;
        if (!client) {
            throw new Error('Supabase client nao encontrado');
        }

        const rpcPayload = {
            p_session_id: payload.sessionId,
            p_usuario: payload.user,
            p_rows: payload.rows,
            p_execution_id: payload.executionId || `exec_${Date.now()}`
        };

        console.log('[CONFERENCIA RPC] finalizar_conferencia payload:', rpcPayload);

        const { data, error } = await client.rpc('finalizar_conferencia', rpcPayload);
        if (error) {
            console.error('[CONFERENCIA RPC] erro:', error);
            const rpcError = new Error(error.message || 'Erro ao finalizar conferencia no Supabase');
            rpcError.code = error.code;
            rpcError.details = error.details;
            rpcError.hint = error.hint;
            rpcError.supabaseError = error;
            throw rpcError;
        }

        invalidateCache('produtos');
        invalidateCache('movimentos');
        invalidateCache('conferencia');
        invalidateCache('separacao');

        return data;
    }

    async function transferirEstoqueSupabase(payload) {
        const client = window.supabaseClient;
        if (!client) {
            throw new Error('Supabase client nao encontrado');
        }

        const rpcPayload = {
            p_origem: normalizeLocal(payload.origem),
            p_destino: normalizeLocal(payload.destino),
            p_usuario: payload.usuario || localStorage.getItem('currentUser') || 'N/A',
            p_items: (payload.items || []).map(item => ({
                id_interno: item.id_interno,
                quantidade: Number(item.quantidade || 0)
            })),
            p_execution_id: payload.executionId || `transf_${Date.now()}`
        };

        console.log('[TRANSFERENCIA RPC] transferir_estoque payload:', rpcPayload);

        const { data, error } = await client.rpc('transferir_estoque', rpcPayload);
        if (error) {
            console.error('[TRANSFERENCIA RPC] erro:', error);
            const missingRpc = error.code === 'PGRST202' || String(error.message || '').includes('transferir_estoque');
            const rpcError = new Error(missingRpc
                ? 'RPC transferir_estoque ainda nao aplicada no Supabase. A transferencia foi bloqueada para evitar saldo parcial.'
                : (error.message || 'Erro ao transferir estoque no Supabase'));
            rpcError.code = error.code;
            rpcError.details = error.details;
            rpcError.hint = error.hint;
            rpcError.supabaseError = error;
            throw rpcError;
        }

        invalidateCache('produtos');
        invalidateCache('movimentos');

        return data;
    }

    return {
        loadModule,
        loadModules,
        query,
        save,
        saveBatch,
        savePickingDraftSupabase,
        savePickingDraftItemsBatchSupabase,
        finalizePickingDraftSupabase,
        deletePickingDraftSupabase,
        getCachedData,
        isModuleLoaded,
        invalidateCache,
        clearAllCache,
        saveMovimentoSupabase,
        updateEstoqueSupabase,
        registrarAjusteEstoqueSupabase,
        aplicarSaldoFisicoInventarioSupabase,
        fetchEstoqueProdutoSupabase,
        fetchEstoqueItemLocalSupabase,
        fetchMovimentosSupabase,
        fetchMovimentosProdutoSupabase,
        fetchUsuariosSupabase,
        fetchCanaisEnvioSupabase,
        fetchSeparacoesAbertasPorCanalSupabase,
        findProdutoByCodeSupabase,

        // ETIQUETAS
        salvarEtiquetaLote,
        listarEtiquetaLotes,
        buscarEtiquetaLotePorId,
        atualizarEtiquetaLote,
        duplicarEtiquetaLote,
        marcarEtiquetaLoteComoImpresso,

        // ENTRADA NF
        listEntradasNFAbertas,
        getEntradaNFById,

        // GARANTIA
        saveGarantiaSupabase,

        // DEVOLUCOES
        saveDevolucaoMarketplaceSupabase,
        updateDevolucaoMarketplaceSupabase,
        applyDevolucaoEstoqueSupabase,
        listDevolucoesSupabase,
        updateDevolucaoStatusSupabase,
        deleteDevolucaoSupabase,
        updateDevolucaoFollowUpSupabase,
        findFornecedorForProductSupabase,

        // CONFERENCIA
        finalizarConferenciaSupabase,

        // ESTOQUE / MOVIMENTACOES
        transferirEstoqueSupabase,

        // Constantes para uso interno
        MODULES: Object.keys(MODULE_TABLES)
    };

})();

// Tornar global para uso nos componentes
window.DataClient = DataClient;

/**
 * Teste de conexo com Supabase - apenas leitura
 * NO substitui o fluxo atual do Google Sheets
 */
async function testeSupabase() {
    try {
        const client = window.supabaseClient

        if (!client) {
            console.error('Supabase client no encontrado em window.supabaseClient')
            return
        }

        const { data, error } = await client
            .from('produtos')
            .select('*')
            .limit(1)

        if (error) {
            console.error('Erro Supabase:', error)
        } else {
            console.log('Dados Supabase:', data)
        }
    } catch (err) {
        console.error('Erro ao conectar com Supabase:', err)
    }
}

// Expor globalmente
window.testeSupabase = testeSupabase;

