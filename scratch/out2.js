const DataClient = (function() {
  const cache = {};
  const CACHE_TTL = 5 * 60 * 1e3;
  const MODULE_TABLES = {
    login: {
      tables: ["usuarios"],
      cacheKey: "login"
    },
    produtos: {
      tables: ["produtos", "estoque_atual"],
      cacheKey: "produtos"
    },
    separacao: {
      tables: ["canais_envio", "separacao", "separacao_itens"],
      cacheKey: "separacao"
    },
    conferencia: {
      tables: ["separacao", "separacao_itens", "conferencia_itens", "conferencia"],
      cacheKey: "conferencia"
    },
    movimentos: {
      tables: ["movimentos", "estoque_atual"],
      cacheKey: "movimentos"
    },
    inventarios: {
      tables: ["inventarios", "inventarios_itens"],
      cacheKey: "inventarios"
    },
    kit_lampada: {
      tables: ["kit_lampada"],
      cacheKey: "kit_lampada"
    },
    channels: {
      tables: ["canais_envio"],
      cacheKey: "channels"
    },
    usuarios: {
      tables: ["usuarios"],
      cacheKey: "usuarios"
    },
    nf: {
      tables: ["entradas_nf", "entradas_nf_itens"],
      cacheKey: "nf"
    },
    garantia: {
      tables: ["garantias"],
      cacheKey: "garantia"
    }
  };
  function isCacheValid(key) {
    if (!cache[key]) return false;
    return Date.now() - cache[key].timestamp < CACHE_TTL;
  }
  function setCache(key, data) {
    cache[key] = {
      data,
      timestamp: Date.now()
    };
  }
  function getCache(key) {
    if (isCacheValid(key)) {
      return cache[key].data;
    }
    return null;
  }
  function invalidateCache(key) {
    delete cache[key];
  }
  async function fetchProdutosSupabase() {
    const client = window.supabaseClient;
    if (!client) {
      console.error("[FATAL] Supabase client n\xE3o inicializado!");
      console.error("[FATAL] Verifique supabaseClient.js - URL e ANON_KEY podem estar incompletas");
      throw new Error("Supabase n\xE3o configurado. Configure URL e ANON_KEY em supabaseClient.js");
    }
    console.log("[Supabase] Iniciando consulta na tabela produtos...");
    const { data, error } = await client.from("produtos").select("*");
    if (error) {
      console.error("[Supabase] ERRO ao buscar produtos:", error.message);
      console.error("[Supabase] C\xF3digo do erro:", error.code);
      throw new Error("Erro ao carregar produtos do Supabase: " + error.message);
    }
    if (!data || data.length === 0) {
      console.warn("[Supabase] ATEN\xC7\xC3O: Nenhum produto encontrado na tabela!");
      console.warn('[Supabase] Verifique se a tabela "produtos" possui registros');
      throw new Error("Nenhum produto encontrado no Supabase. A tabela est\xE1 vazia ou n\xE3o existe.");
    }
    console.log(`[Supabase] Sukesso! ${data.length} produtos carregados do Supabase`);
    console.log(`[Supabase] IDs retornados:`, data.slice(0, 5).map((p) => p.id_interno || p.id));
    return data;
  }
  async function findProdutoByCodeSupabase(code) {
    const client = window.supabaseClient;
    if (!client) throw new Error("Supabase client nao encontrado");
    const cleanCode = String(code || "").trim().replace(/\s+/g, "");
    if (!cleanCode) return null;
    console.log("[SEP] buscando supabase", cleanCode);
    const fields = ["ean", "id_interno", "sku_fornecedor"];
    for (const field of fields) {
      const { data, error } = await client.from("produtos").select("*").eq(field, cleanCode).limit(1);
      if (error) {
        console.error("[SEP] refresh supabase erro", {
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
        console.log("[SEP] produto encontrado supabase", {
          field,
          id_interno: data[0].id_interno,
          ean: data[0].ean,
          sku_fornecedor: data[0].sku_fornecedor
        });
        return data[0];
      }
    }
    console.log("[SEP] produto nao encontrado", cleanCode);
    return null;
  }
  async function fetchUsuariosSupabase() {
    const client = window.supabaseClient;
    if (!client) {
      console.error("[Supabase] client n\xE3o encontrado");
      return [];
    }
    const { data, error } = await client.from("usuarios").select("*").eq("ativo", true);
    if (error) {
      console.error("[Supabase] erro ao buscar usu\xE1rios:", error);
      return [];
    }
    console.log(`[BOOT] usuarios -> Supabase (${data.length} registros)`);
    return data || [];
  }
  async function fetchCanaisEnvioSupabase() {
    const client = window.supabaseClient;
    console.log("[CANAIS DEBUG] supabase client existe?", !!client);
    if (!client) {
      console.error("[CANAIS DEBUG] Supabase client NAO encontrado!");
      return [];
    }
    console.log("[CANAIS DEBUG] buscando tabela canais_envio...");
    const { data, error } = await client.from("canais_envio").select("*").eq("ativo", true).order("nome", { ascending: true });
    if (error) {
      console.error("[CANAIS DEBUG] erro supabase ao ler canais_envio:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      return [];
    }
    if (!data || data.length === 0) {
      console.warn("[CANAIS DEBUG] canais_envio retornou vazio. Verifique se existem canais ativos e se as policies SELECT foram aplicadas.");
    }
    console.log(`[CANAIS DEBUG] quantidade retornada: ${(data || []).length}`);
    console.log("[CANAIS DEBUG] canais retornados:", data);
    return data || [];
  }
  async function fetchKitLampadaSupabase() {
    const client = window.supabaseClient;
    if (!client) {
      console.error("[Supabase] client n\xE3o encontrado");
      return [];
    }
    let allRows = [];
    let from = 0;
    const pageSize = 1e3;
    try {
      while (true) {
        const { data, error } = await client.from("kit_lampada").select("*").order("kit_lampada_id", { ascending: true }).range(from, from + pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allRows.push(...data);
        }
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      const safeText = (val) => String(val ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      console.log("[KIT LAMPADA] rows:", allRows);
      console.log("[KIT LAMPADA] total:", allRows.length);
      console.log("[KIT LAMPADA] civic raw:", allRows.filter((r) => String(r.modelo || "").toLowerCase().includes("civic")));
      console.log("[KIT LAMPADA] primeiro item:", allRows[0]);
      if (allRows.length === 0) {
        console.warn('[KIT LAMPADA] Aten\xE7\xE3o: Nenhum registro retornado. Verifique as RLS/Policies da tabela "kit_lampada" no Supabase.');
      }
      return allRows;
    } catch (err) {
      console.error("[Supabase] erro ao buscar kit_lampada:", err);
      return [];
    }
  }
  function normalizeLocal(local) {
    if (!local) return "";
    let norm = local.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, "_").replace("1\xBA_ANDAR", "PRIMEIRO_ANDAR").replace("1\xB0_ANDAR", "PRIMEIRO_ANDAR").replace("1_ANDAR", "PRIMEIRO_ANDAR");
    if (norm === "FULL_ML" || norm === "FULLML" || norm === "FULL_M_L") return "FULL_ML";
    return norm;
  }
  async function saveMovimentoSupabase(movData) {
    const client = window.supabaseClient;
    if (!client) {
      console.error("[Supabase] Client n\xE3o encontrado");
      return null;
    }
    console.log(`[MOV] insert movimentos - payload:`, JSON.stringify(movData, null, 2));
    const { data, error } = await client.from("movimentos").insert([{
      movimento_id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
      data_hora: (/* @__PURE__ */ new Date()).toISOString(),
      tipo: movData.tipo,
      id_interno: movData.id_interno,
      local_origem: normalizeLocal(movData.local_origem),
      local_destino: normalizeLocal(movData.local_destino),
      quantidade: movData.quantidade,
      usuario: movData.usuario,
      origem: movData.origem,
      observacao: movData.observacao
    }]).select();
    if (error) {
      console.error("[MOV] insert movimentos ERRO:", error);
      return null;
    }
    console.log("[MOV] insert movimentos SUCESSO:", data);
    return data ? data[0] : null;
  }
  async function updateEstoqueSupabase(id_interno, localRaw, operacao, quantidade) {
    const client = window.supabaseClient;
    const local = normalizeLocal(localRaw);
    if (!client || !local) {
      console.error("[MOV] update estoque ERRO: client ou local inv\xE1lido");
      return false;
    }
    console.log(`[MOV] update estoque - id_interno=${id_interno} local=${local} operacao=${operacao} quantidade=${quantidade}`);
    try {
      console.log("[INV-DIAG] update estoque: buscando saldo atual para", id_interno, "em", local);
      const { data: current, error: fetchError } = await client.from("estoque_atual").select("*").eq("id_interno", id_interno).eq("local", local).maybeSingle();
      if (fetchError) {
        console.error("[INV-DIAG] erro estoque Supabase (SELECT):", fetchError);
        throw fetchError;
      }
      console.log("[INV-DIAG] saldo atual encontrado:", current);
      const saldoRes = current ? parseFloat(current.saldo_reservado || 0) : 0;
      const saldoTrans = current ? parseFloat(current.saldo_em_transito || 0) : 0;
      let novoSaldoDisp = 0;
      if (operacao === "soma") {
        novoSaldoDisp = (current ? parseFloat(current.saldo_disponivel || 0) : 0) + quantidade;
      } else if (operacao === "subtrai") {
        novoSaldoDisp = (current ? parseFloat(current.saldo_disponivel || 0) : 0) - quantidade;
      } else if (operacao === "ajuste") {
        novoSaldoDisp = quantidade;
      }
      const novoSaldoTotal = novoSaldoDisp + saldoRes + saldoTrans;
      const payload = {
        id_interno,
        local,
        saldo_disponivel: novoSaldoDisp,
        saldo_reservado: saldoRes,
        saldo_em_transito: saldoTrans,
        saldo_total: novoSaldoTotal,
        atualizado_em: (/* @__PURE__ */ new Date()).toISOString()
      };
      console.log("[INV-DIAG] estoque payload:", payload);
      let result;
      if (current) {
        console.log("[INV-DIAG] executando UPDATE em estoque_atual...");
        result = await client.from("estoque_atual").update(payload).eq("id_interno", id_interno).eq("local", local);
      } else {
        console.log("[INV-DIAG] executando INSERT em estoque_atual...");
        result = await client.from("estoque_atual").insert([payload]);
      }
      if (result.error) {
        console.error("[INV-DIAG] erro estoque Supabase (OP):", result.error);
        throw result.error;
      }
      console.log("[INV-DIAG] estoque result: SUCESSO");
      return true;
    } catch (err) {
      console.error("[INV-DIAG] update estoque ERRO fatal:", err.message || err);
      return false;
    }
  }
  async function fetchEstoqueProdutoSupabase(id_interno) {
    const client = window.supabaseClient;
    if (!client) return [];
    const { data, error } = await client.from("estoque_atual").select("*").eq("id_interno", id_interno);
    if (error) {
      console.warn("[Supabase] Erro ao buscar estoque do produto (n\xE3o cr\xEDtico):", error);
      return [];
    }
    return data || [];
  }
  async function fetchEstoqueItemLocalSupabase(id_interno, localRaw) {
    const client = window.supabaseClient;
    const local = normalizeLocal(localRaw);
    if (!client || !local) return null;
    const { data, error } = await client.from("estoque_atual").select("saldo_disponivel, saldo_reservado, saldo_em_transito, saldo_total").eq("id_interno", id_interno).eq("local", local).maybeSingle();
    if (error) {
      console.warn("[INV] fetchEstoqueItemLocal AVISO (n\xE3o cr\xEDtico):", error);
      return null;
    }
    return data;
  }
  async function fetchInventariosSupabase() {
    const client = window.supabaseClient;
    if (!client) return [];
    const { data, error } = await client.from("inventarios").select("*").order("data_inicio", { ascending: false });
    if (error) {
      console.error("[INV] fetch inventarios ERRO:", error);
      return [];
    }
    console.log(`[INV] inventarios -> Supabase (${data.length} registros)`);
    return data || [];
  }
  async function fetchInventariosItensSupabase() {
    const client = window.supabaseClient;
    if (!client) return [];
    const { data, error } = await client.from("inventarios_itens").select("*");
    if (error) {
      console.error("[INV] fetch inventarios_itens ERRO:", error);
      return [];
    }
    console.log(`[INV] inventarios_itens -> Supabase (${data.length} registros)`);
    return data || [];
  }
  async function fetchEstoqueAtualSupabase() {
    const client = window.supabaseClient;
    if (!client) return [];
    try {
      const { data, error } = await client.from("estoque_atual").select("*");
      if (error) {
        console.warn("[Supabase] Erro ao buscar estoque_atual:", error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn("[Supabase] Erro fatal estoque_atual:", e);
      return [];
    }
  }
  async function fetchTable(tableName) {
    try {
      if (tableName === "produtos") {
        console.log(`[DATA] produtos -> Supabase`);
        return await fetchProdutosSupabase();
      }
      if (tableName === "usuarios") {
        console.log(`[DATA] usuarios -> Supabase`);
        console.log(`[DATA] Google Sheets ignorado para 'usuarios'`);
        return await fetchUsuariosSupabase();
      }
      if (tableName === "canais_envio") {
        console.log(`[DATA] canais_envio -> Supabase`);
        return await fetchCanaisEnvioSupabase();
      }
      if (tableName === "inventarios") {
        console.log(`[DATA] inventarios -> Supabase`);
        return await fetchInventariosSupabase();
      }
      if (tableName === "inventarios_itens") {
        console.log(`[DATA] inventarios_itens -> Supabase`);
        return await fetchInventariosItensSupabase();
      }
      if (tableName === "estoque_atual") {
        console.log(`[DATA] estoque_atual -> Supabase`);
        return await fetchEstoqueAtualSupabase();
      }
      if (tableName === "movimentos") {
        console.log(`[DATA] movimentos -> Supabase`);
        return await fetchMovimentosSupabase();
      }
      if (tableName === "kit_lampada") {
        console.log(`[DATA] kit_lampada -> Supabase`);
        return await fetchKitLampadaSupabase();
      }
      if (tableName === "separacao") {
        console.log(`[DATA] separacao -> Supabase`);
        return await fetchSeparacaoSupabase();
      }
      if (tableName === "separacao_itens") {
        console.log(`[DATA] separacao_itens -> Supabase`);
        return await fetchSeparacaoItensSupabase();
      }
      if (tableName === "conferencia") {
        console.log(`[DATA] conferencia -> Supabase`);
        return await fetchConferenciaSupabase();
      }
      if (tableName === "conferencia_itens") {
        console.log(`[DATA] conferencia_itens -> Supabase`);
        return await fetchConferenciaItensSupabase();
      }
      console.log(`[DATA] Google Sheets -> ${tableName}`);
      const data = await fetchSheetData(tableName);
      return data || [];
    } catch (error) {
      console.error(`[DataClient] Erro ao carregar ${tableName}:`, error);
      if (tableName !== "estoque_atual") {
        showToast(`Erro ao carregar dados de ${tableName}`, "error");
      }
      return [];
    }
  }
  async function loadModule(moduleName, forceRefresh = false) {
    const config = MODULE_TABLES[moduleName];
    if (!config) {
      console.warn(`[DataClient] M\xF3dulo desconhecido: ${moduleName}`);
      return null;
    }
    if (!forceRefresh && isCacheValid(config.cacheKey)) {
      console.log(`[DataClient] Usando cache para m\xF3dulo: ${moduleName}`);
      return getCache(config.cacheKey);
    }
    console.log(`[DataClient] Carregando m\xF3dulo: ${moduleName}`);
    try {
      const results = await Promise.all(
        config.tables.map((table) => fetchTable(table))
      );
      const moduleData = {};
      config.tables.forEach((table, index) => {
        const keyMap = {
          "produtos": "products",
          "canais_envio": "channels",
          "conferencia_itens": "conferencia",
          "estoque_atual": "estoque",
          "movimentos": "movimentacoes",
          "inventarios": "inventario",
          "inventarios_itens": "inventarios_itens",
          "separacao": "separacao",
          "separacao_itens": "separacao_itens"
        };
        const key = keyMap[table] || table;
        moduleData[key] = results[index] || [];
      });
      setCache(config.cacheKey, moduleData);
      console.log(`[DataClient] M\xF3dulo ${moduleName} carregado com sucesso`);
      return moduleData;
    } catch (error) {
      console.error(`[DataClient] Erro ao carregar m\xF3dulo ${moduleName}:`, error);
      showToast(`Erro ao carregar ${moduleName}`, "error");
      return null;
    }
  }
  async function loadModules(moduleNames) {
    console.log(`[DataClient] Carregando m\xFAltiplos m\xF3dulos:`, moduleNames);
    const results = {};
    await Promise.all(
      moduleNames.map(async (moduleName) => {
        results[moduleName] = await loadModule(moduleName);
      })
    );
    return results;
  }
  async function query(tableName, filters = {}) {
    console.log(`[DataClient] SEARCH START -> Table: ${tableName}`, filters);
    try {
      const ssotTables = ["produtos", "usuarios", "canais_envio"];
      if (ssotTables.includes(tableName)) {
        console.log(`[DataClient] Redirecionando busca de ${tableName} para SSOT Supabase`);
        const fullData = await fetchTable(tableName);
        if (filters.field && filters.value) {
          const normalizedValue = String(filters.value).toLowerCase();
          return fullData.filter(
            (item) => String(item[filters.field] || "").toLowerCase() === normalizedValue
          );
        }
        return fullData;
      }
      if (filters.field && filters.value) {
        const params = {
          action: "find",
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
  async function save(action, sheetName, data) {
    console.log(`[DataClient] Salvando ${action} na aba ${sheetName}`);
    const result = await safePost({
      action,
      sheet: sheetName,
      data
    });
    if (result) {
      Object.keys(MODULE_TABLES).forEach((moduleName) => {
        const config = MODULE_TABLES[moduleName];
        if (config.tables.includes(sheetName)) {
          console.log(`[DataClient] Invalidando cache de ${moduleName} ap\xF3s salvamento`);
          invalidateCache(config.cacheKey);
        }
      });
    }
    return result;
  }
  async function saveBatch(sheetName, dataArray) {
    console.log(`[DataClient] Salvando batch em ${sheetName}`);
    const result = await safePost({
      action: "batch_append",
      sheet: sheetName,
      data: dataArray
    });
    if (result) {
      invalidateCache(sheetName);
    }
    return result;
  }
  function getCachedData(moduleName) {
    const config = MODULE_TABLES[moduleName];
    if (!config) return null;
    return getCache(config.cacheKey);
  }
  function isModuleLoaded(moduleName) {
    const config = MODULE_TABLES[moduleName];
    if (!config) return false;
    return isCacheValid(config.cacheKey);
  }
  function clearAllCache() {
    Object.keys(cache).forEach((key) => delete cache[key]);
    console.log("[DataClient] Todo cache limpo");
  }
  async function fetchMovimentosSupabase() {
    const client = window.supabaseClient;
    if (!client) {
      console.error("[MOVIMENTOS DEBUG] erro ao listar movimentos: Supabase client n\xE3o encontrado");
      throw new Error("Supabase client n\xE3o encontrado");
    }
    const { data, error } = await client.from("movimentos").select("*").order("data_hora", { ascending: false });
    if (error) {
      console.error("[MOVIMENTOS DEBUG] erro ao listar movimentos:", error);
      throw error;
    }
    return data || [];
  }
  async function fetchSeparacaoSupabase() {
    const client = window.supabaseClient;
    if (!client) throw new Error("Supabase client nao encontrado");
    const { data, error } = await client.from("separacao").select("*").order("criado_em", { ascending: false });
    if (error) {
      console.error("[SEPARACAO] erro ao listar separacao:", error);
      throw error;
    }
    return data || [];
  }
  async function fetchSeparacaoItensSupabase() {
    const client = window.supabaseClient;
    if (!client) throw new Error("Supabase client nao encontrado");
    const { data, error } = await client.from("separacao_itens").select("*").order("atualizado_em", { ascending: false });
    if (error) {
      console.error("[SEPARACAO] erro ao listar separacao_itens:", error);
      throw error;
    }
    return data || [];
  }
  async function fetchConferenciaSupabase() {
    const client = window.supabaseClient;
    if (!client) throw new Error("Supabase client nao encontrado");
    const { data, error } = await client.from("conferencia").select("*").order("conferido_em", { ascending: false });
    if (error) {
      console.error("[CONFERENCIA] erro ao listar conferencia:", error);
      throw error;
    }
    return data || [];
  }
  async function fetchConferenciaItensSupabase() {
    const client = window.supabaseClient;
    if (!client) throw new Error("Supabase client nao encontrado");
    const { data, error } = await client.from("conferencia_itens").select("*");
    if (error) {
      console.error("[CONFERENCIA] erro ao listar conferencia_itens:", error);
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
  async function savePickingDraftSupabase(payload) {
    const client = window.supabaseClient;
    if (!client) throw new Error("Supabase client nao encontrado");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const session = payload.session || {};
    const item = payload.item || null;
    if (!session.separacao_id) throw new Error("separacao_id nao informado");
    const separacaoRow = {
      separacao_id: session.separacao_id,
      pedido_referencia: session.pedido_referencia || null,
      canal_id: session.canal_id || "",
      canal_nome: session.canal_nome || "",
      status: session.status || "em_separacao",
      criado_por: session.criado_por || localStorage.getItem("currentUser") || "N/A",
      criado_em: session.criado_em || now,
      atualizado_em: now,
      finalizado_em: session.finalizado_em || null,
      observacao: session.observacao || null
    };
    console.log("[SEP] criando separacao payload", separacaoRow);
    const { data: sepData, error: sepError } = await client.from("separacao").upsert([separacaoRow], { onConflict: "separacao_id" }).select().single();
    if (sepError) {
      logSepSupabaseError("erro ao criar separacao", sepError, separacaoRow);
      throw sepError;
    }
    console.log("[SEP] separacao criada", sepData);
    let itemData = null;
    if (item && item.id_interno) {
      const itemRow = {
        separacao_id: session.separacao_id,
        id_interno: item.id_interno,
        ean: item.ean || null,
        descricao: item.descricao || "",
        qtd_solicitada: Number(item.qtd_solicitada || item.qtd_separada || 1),
        qtd_separada: Number(item.qtd_separada || item.qtd_solicitada || 1),
        atualizado_em: now
      };
      console.log("[SEP] salvando item payload", itemRow);
      const { data: existing, error: existingError } = await client.from("separacao_itens").select("id").eq("separacao_id", session.separacao_id).eq("id_interno", itemRow.id_interno).limit(1);
      if (existingError) {
        logSepSupabaseError("erro ao salvar item", existingError, itemRow);
        throw existingError;
      }
      if (existing && existing.length > 0) {
        const { data, error } = await client.from("separacao_itens").update(itemRow).eq("separacao_id", session.separacao_id).eq("id_interno", itemRow.id_interno).select();
        if (error) {
          logSepSupabaseError("erro ao salvar item", error, itemRow);
          throw error;
        }
        itemData = data;
      } else {
        const { data, error } = await client.from("separacao_itens").insert([itemRow]).select();
        if (error) {
          logSepSupabaseError("erro ao salvar item", error, itemRow);
          throw error;
        }
        itemData = data;
      }
      console.log("[SEP] item salvo", itemData);
    }
    invalidateCache("separacao");
    invalidateCache("conferencia");
    return { separacao: sepData, item: itemData };
  }
  async function finalizePickingDraftSupabase(payload) {
    const client = window.supabaseClient;
    if (!client) throw new Error("Supabase client nao encontrado");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const sessionId = payload.sessionId;
    if (!sessionId) throw new Error("separacao_id nao informado");
    const updatePayload = {
      status: payload.status || "aberta",
      atualizado_em: now,
      finalizado_em: now
    };
    console.log("[SEP] finalizando separacao", { sessionId, payload: updatePayload });
    const { data, error } = await client.from("separacao").update(updatePayload).eq("separacao_id", sessionId).select().single();
    if (error) {
      logSepSupabaseError("erro ao finalizar separacao", error, { sessionId, ...updatePayload });
      throw error;
    }
    invalidateCache("separacao");
    invalidateCache("conferencia");
    return data;
  }
  async function createEntradaNFManual(payload) {
    const client = window.supabaseClient;
    if (!client) {
      console.error("[ENTRADA NF DEBUG] erro supabase: client n\xE3o encontrado");
      return null;
    }
    console.log("[ENTRADA NF DEBUG] salvando NF manual", payload);
    const { data, error } = await client.from("entradas_nf").insert([{
      numero_nf: payload.numero_nf,
      serie: payload.serie,
      data_emissao: payload.data_emissao,
      data_recebimento: payload.data_recebimento,
      cnpj_fornecedor: payload.cnpj_fornecedor,
      fornecedor_nome: payload.fornecedor_nome,
      valor_total: payload.valor_total,
      origem: "manual",
      status: "rascunho",
      observacoes: payload.observacoes,
      // Novos campos financeiros
      valor_real_compra: payload.financeiro_info?.valor_real_compra,
      valor_especial: payload.financeiro_info?.valor_especial,
      pagamento_forma: payload.financeiro_info?.pagamento_forma,
      pagamento_condicao: payload.financeiro_info?.pagamento_condicao,
      pagamento_parcelas: payload.financeiro_info?.pagamento_parcelas,
      pagamento_vencimento: payload.financeiro_info?.pagamento_vencimento,
      observacoes_financeiras: payload.financeiro_info?.observacoes_financeiras
    }]).select();
    if (error) {
      console.error("[ENTRADA NF DEBUG] erro supabase:", error);
      return null;
    }
    console.log("[ENTRADA NF DEBUG] NF salva", data);
    invalidateCache("nf");
    return data ? data[0] : null;
  }
  async function listEntradasNFAbertas() {
    const client = window.supabaseClient;
    if (!client) return [];
    console.log("[ENTRADA NF DEBUG] listando notas abertas");
    const { data, error } = await client.from("entradas_nf").select("*").not("status", "in", '("entrada_confirmada", "cancelada")').order("created_at", { ascending: false });
    if (error) {
      console.error("[ENTRADA NF DEBUG] erro supabase:", error);
      return [];
    }
    return data || [];
  }
  async function getEntradaNFById(id) {
    const client = window.supabaseClient;
    if (!client) return null;
    const { data, error } = await client.from("entradas_nf").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error("[ENTRADA NF DEBUG] erro supabase:", error);
      return null;
    }
    return data;
  }
  async function saveGarantiaSupabase(garantiaData) {
    const client = window.supabaseClient;
    if (!client) {
      console.error("[GARANTIA DEBUG] erro supabase: client n\xE3o encontrado");
      return null;
    }
    console.log("[GARANTIA DEBUG] salvando garantia", garantiaData);
    const { data, error } = await client.from("garantias").insert([{
      garantia_id: `GAR-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
      data_envio: (/* @__PURE__ */ new Date()).toISOString(),
      id_interno: garantiaData.id_interno,
      descricao_produto: garantiaData.descricao_produto,
      fornecedor: garantiaData.fornecedor,
      tipo_operacao: garantiaData.tipo_operacao,
      motivo: garantiaData.motivo,
      observacao: garantiaData.observacao,
      origem_estoque: normalizeLocal(garantiaData.origem_estoque),
      quantidade: garantiaData.quantidade,
      custo_unitario: garantiaData.custo_unitario,
      custo_total: garantiaData.custo_total,
      status: "ENVIADO",
      usuario: localStorage.getItem("currentUser")
    }]).select();
    if (error) {
      console.error("[GARANTIA DEBUG] erro supabase:", error);
      return null;
    }
    console.log("[GARANTIA DEBUG] Garantia salva", data);
    invalidateCache("garantia");
    return data ? data[0] : null;
  }
  async function finalizarConferenciaSupabase(payload) {
    const client = window.supabaseClient;
    if (!client) {
      throw new Error("Supabase client nao encontrado");
    }
    const rpcPayload = {
      p_session_id: payload.sessionId,
      p_usuario: payload.user,
      p_rows: payload.rows,
      p_execution_id: payload.executionId || `exec_${Date.now()}`
    };
    console.log("[CONFERENCIA RPC] finalizar_conferencia payload:", rpcPayload);
    const { data, error } = await client.rpc("finalizar_conferencia", rpcPayload);
    if (error) {
      console.error("[CONFERENCIA RPC] erro:", error);
      const rpcError = new Error(error.message || "Erro ao finalizar conferencia no Supabase");
      rpcError.code = error.code;
      rpcError.details = error.details;
      rpcError.hint = error.hint;
      rpcError.supabaseError = error;
      throw rpcError;
    }
    invalidateCache("produtos");
    invalidateCache("movimentos");
    invalidateCache("conferencia");
    invalidateCache("separacao");
    return data;
  }
  return {
    loadModule,
    loadModules,
    query,
    save,
    saveBatch,
    savePickingDraftSupabase,
    finalizePickingDraftSupabase,
    getCachedData,
    isModuleLoaded,
    invalidateCache,
    clearAllCache,
    saveMovimentoSupabase,
    updateEstoqueSupabase,
    fetchEstoqueProdutoSupabase,
    fetchEstoqueItemLocalSupabase,
    fetchUsuariosSupabase,
    fetchCanaisEnvioSupabase,
    findProdutoByCodeSupabase,
    // ENTRADA NF
    createEntradaNFManual,
    listEntradasNFAbertas,
    getEntradaNFById,
    // GARANTIA
    saveGarantiaSupabase,
    // CONFERENCIA
    finalizarConferenciaSupabase,
    // Constantes para uso interno
    MODULES: Object.keys(MODULE_TABLES)
  };
})();
window.DataClient = DataClient;
async function testeSupabase() {
  try {
    const client = window.supabaseClient;
    if (!client) {
      console.error("Supabase client n\xE3o encontrado em window.supabaseClient");
      return;
    }
    const { data, error } = await client.from("produtos").select("*").limit(1);
    if (error) {
      console.error("Erro Supabase:", error);
    } else {
      console.log("Dados Supabase:", data);
    }
  } catch (err) {
    console.error("Erro ao conectar com Supabase:", err);
  }
}
window.testeSupabase = testeSupabase;
