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
               // Anúncios Reais (10 Mercado Livre da conta 238451947 + 10 Shopee da conta 284803847)
        anuncios: [
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
                    "seller_sku": null,
                    "titulo": "Par H1 H3 H7 H8 H11 H16 H27 Hb3/4 Super Led 6000k 7200lm C6",
                    "thumbnail_url": "http://http2.mlstatic.com/D_857856-MLB73225010878_122023-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1096816640-par-h1-h3-h7-h8-h11-h16-h27-hb34-super-led-6000k-7200lm-c6-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 78.99,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "18/08/2026 03:11",
                    "payload_original": null,
                    "has_variations": true,
                    "variations": [
                              {
                                        "variation_id": "42874954132",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H7",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H7",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "42874954237",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H9",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H9",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "42874954153",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H3",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H3",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "42874954181",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H11",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H11",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "64605684907",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H16-1 (PSX24W)",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H16-1 (PSX24W)",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "42874954172",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H8",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H8",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "64638075023",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H16-2 (PGJ19)",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H16-2 (PGJ19)",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "42874954163",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H27",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H27",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "42874954195",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=HB4",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: HB4",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "42874954144",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H1",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H1",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "42874954215",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=HB3",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: HB3",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              }
                    ],
                    "mapping": null
          },
          {
                    "id": "MLB1204939243",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "source_account_id": "238451947",
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1204939243",
                    "variation_id": "173985461425",
                    "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H16-1 PSX24W",
                    "seller_sku": null,
                    "titulo": "Par Lâmpadas H16 Super Led Full Branca 6000k 7200 Lumens C6",
                    "thumbnail_url": "http://http2.mlstatic.com/D_610416-MLB73709288187_122023-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1204939243-par-lmpadas-h16-super-led-full-branca-6000k-7200-lumens-c6-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 78.99,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "26/07/2026 22:50",
                    "payload_original": null,
                    "has_variations": true,
                    "variations": [
                              {
                                        "variation_id": "173985461425",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H16-1 PSX24W",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H16-1 PSX24W",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "173985461426",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H16-2 PGJ19",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H16-2 PGJ19",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              }
                    ],
                    "mapping": null
          },
          {
                    "id": "MLB1205646824",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "source_account_id": "238451947",
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1205646824",
                    "variation_id": "34858496132",
                    "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H7",
                    "seller_sku": null,
                    "titulo": "Par H1 H3 H7 H8 H11 H16 H27 Hb3/4 Super Led 6000k 7200 Lumens C6",
                    "thumbnail_url": "http://http2.mlstatic.com/D_896861-MLB91582569775_092025-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1205646824-par-h1-h3-h7-h8-h11-h16-h27-hb34-super-led-6000k-7200-lumens-c6-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 99.9,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "26/07/2026 22:50",
                    "payload_original": null,
                    "has_variations": true,
                    "variations": [
                              {
                                        "variation_id": "34858496132",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H7",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H7",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "34858496140",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H1",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H1",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "34858496147",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H3",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H3",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "34858496154",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H27",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H27",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "34858496161",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H8",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H8",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "34858496168",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H11",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H11",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "34858496175",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H16 - Tipo 2",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H16 - Tipo 2",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "34858496182",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=HB4",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: HB4",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              }
                    ],
                    "mapping": null
          },
          {
                    "id": "MLB1228481882",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "source_account_id": "238451947",
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1228481882",
                    "variation_id": "36814463991",
                    "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H7",
                    "seller_sku": null,
                    "titulo": "Kit 10 Pares H1 H3 H7 H8 H11 H16 H27 Hb3/4 Super Led 6000k",
                    "thumbnail_url": "http://http2.mlstatic.com/D_730672-MLB74694972532_022024-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1228481882-kit-10-pares-h1-h3-h7-h8-h11-h16-h27-hb34-super-led-6000k-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 599.9,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "26/07/2026 22:50",
                    "payload_original": null,
                    "has_variations": true,
                    "variations": [
                              {
                                        "variation_id": "36814463991",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H7",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H7",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "36814464004",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H1",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H1",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "36814464011",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H3",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H3",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "36814464018",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H27",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H27",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "36814464025",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H8",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H8",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "36814464034",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H11",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H11",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "36814464041",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=H16 - Tipo 2",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: H16 - Tipo 2",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "36814464048",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=HB4",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: HB4",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "36814464055",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco_CAR_LED_BULB_TYPE=HB3",
                                        "attribute": "Cor: Branco, Cor da luz: Branco, Tipo de conector: HB3",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              }
                    ],
                    "mapping": null
          },
          {
                    "id": "MLB1446105806",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "source_account_id": "238451947",
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1446105806",
                    "variation_id": "51170113969",
                    "variation_key": "custom=Branco",
                    "seller_sku": null,
                    "titulo": "Fita Led Luz Interna Neon Painel Carro 5m Metros Tunning",
                    "thumbnail_url": "http://http2.mlstatic.com/D_877128-MLB73373224627_122023-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1446105806-fita-led-luz-interna-neon-painel-carro-5m-metros-tunning-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 78.99,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "11/09/2026 10:22",
                    "payload_original": null,
                    "has_variations": true,
                    "variations": [
                              {
                                        "variation_id": "51170113969",
                                        "variation_key": "custom=Branco",
                                        "attribute": "Cor: Branco",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "51170113978",
                                        "variation_key": "custom=Azul Gelo",
                                        "attribute": "Cor: Azul Gelo",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "61136977879",
                                        "variation_key": "custom=Amarelo",
                                        "attribute": "Cor: Amarelo",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "51170114003",
                                        "variation_key": "custom=Roxo",
                                        "attribute": "Cor: Roxo",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "59861083726",
                                        "variation_key": "custom=Azul",
                                        "attribute": "Cor: Azul",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "51170113987",
                                        "variation_key": "custom=Vermelho Alaranjado",
                                        "attribute": "Cor: Vermelho Alaranjado",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "60808217548",
                                        "variation_key": "custom=Verde",
                                        "attribute": "Cor: Verde",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "59465369631",
                                        "variation_key": "custom=Verde Fluorescente",
                                        "attribute": "Cor: Verde Fluorescente",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "51170113995",
                                        "variation_key": "custom=Rosa",
                                        "attribute": "Cor: Rosa",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "51170197459",
                                        "variation_key": "custom=Laranja Âmbar",
                                        "attribute": "Cor: Laranja Âmbar",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              }
                    ],
                    "mapping": null
          },
          {
                    "id": "MLB1575591367",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "source_account_id": "238451947",
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1575591367",
                    "variation_id": "58919628239",
                    "variation_key": "COLOR=Preto",
                    "seller_sku": null,
                    "titulo": "Sensor Ré Estacionamento Display Sonoro Preto Branco Prata",
                    "thumbnail_url": "http://http2.mlstatic.com/D_851202-MLB73376317259_122023-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1575591367-sensor-re-estacionamento-display-sonoro-preto-branco-prata-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 150,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "16/08/2026 20:35",
                    "payload_original": null,
                    "has_variations": true,
                    "variations": [
                              {
                                        "variation_id": "58919628239",
                                        "variation_key": "COLOR=Preto",
                                        "attribute": "Cor: Preto",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "58919628241",
                                        "variation_key": "COLOR=Prateado",
                                        "attribute": "Cor: Prateado",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "58919628243",
                                        "variation_key": "COLOR=Branco",
                                        "attribute": "Cor: Branco",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              }
                    ],
                    "mapping": null
          },
          {
                    "id": "MLB1575598033",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "source_account_id": "238451947",
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1575598033",
                    "variation_id": "58919575934",
                    "variation_key": "COLOR=Preto",
                    "seller_sku": null,
                    "titulo": "Sensor Ré Estacionamento Display Sonoro Preto Branco Prata",
                    "thumbnail_url": "http://http2.mlstatic.com/D_821078-MLB112005166533_052026-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1575598033-sensor-re-estacionamento-display-sonoro-preto-branco-prata-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 129.99,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "26/07/2026 23:22",
                    "payload_original": null,
                    "has_variations": true,
                    "variations": [
                              {
                                        "variation_id": "58919575934",
                                        "variation_key": "COLOR=Preto",
                                        "attribute": "Cor: Preto",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "58919575937",
                                        "variation_key": "COLOR=Prata",
                                        "attribute": "Cor: Prata",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "58919575940",
                                        "variation_key": "COLOR=Branco",
                                        "attribute": "Cor: Branco",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              }
                    ],
                    "mapping": null
          },
          {
                    "id": "MLB1778807007",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "source_account_id": "238451947",
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1778807007",
                    "variation_id": "74199899176",
                    "variation_key": "COLOR=Cinza",
                    "seller_sku": null,
                    "titulo": "Carregador Celular 3 Entradas Usb Porta Copo 12v 24v Carro",
                    "thumbnail_url": "http://http2.mlstatic.com/D_963158-MLB92165867587_092025-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1778807007-carregador-celular-3-entradas-usb-porta-copo-12v-24v-carro-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 39.99,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "13/08/2026 21:34",
                    "payload_original": null,
                    "has_variations": true,
                    "variations": [
                              {
                                        "variation_id": "74199899176",
                                        "variation_key": "COLOR=Cinza",
                                        "attribute": "Cor: Cinza",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "74199899160",
                                        "variation_key": "COLOR=Preto",
                                        "attribute": "Cor: Preto",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              }
                    ],
                    "mapping": null
          },
          {
                    "id": "MLB1797149159",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "source_account_id": "238451947",
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1797149159",
                    "variation_id": "76259778108",
                    "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H11",
                    "seller_sku": null,
                    "titulo": "Lâmpada H1 H3 H7 H8 H11 H16 H27 Hb3/4 Super Led 6000k 3600lm",
                    "thumbnail_url": "http://http2.mlstatic.com/D_978142-MLB73328076115_122023-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1797149159-lmpada-h1-h3-h7-h8-h11-h16-h27-hb34-super-led-6000k-3600lm-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 49.99,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "26/07/2026 23:13",
                    "payload_original": null,
                    "has_variations": true,
                    "variations": [
                              {
                                        "variation_id": "76259778108",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H11",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H11",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "76259778093",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H3",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H3",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "76259778131",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H1",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H1",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "76259778179",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H8",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H8",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "76259778116",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=HB3",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: HB3",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "76259778101",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H16-2 (PGJ19)",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H16-2 (PGJ19)",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "76259778087",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H7",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H7",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "76259778168",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H9",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H9",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "76259778123",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H16-1 (PSX24W)",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H16-1 (PSX24W)",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "76259778139",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=H27",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: H27",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              },
                              {
                                        "variation_id": "76259778155",
                                        "variation_key": "COLOR=Branco_LIGHT_COLOR=Branco-frio_CAR_LED_BULB_TYPE=HB4",
                                        "attribute": "Cor: Branco, Cor da luz: Branco-frio, Tipo de conector: HB4",
                                        "seller_sku": null,
                                        "situacao_mapeamento": "NAO_MAPEADO",
                                        "mapping": null
                              }
                    ],
                    "mapping": null
          },
          {
                    "id": "MLB1862105883",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "source_account_id": "238451947",
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1862105883",
                    "variation_id": null,
                    "variation_key": "",
                    "seller_sku": null,
                    "titulo": "Par Lâmpadas H1 Farol Alto Astra 1999 Super Led Nano S14 H1 Branco Branco-frio",
                    "thumbnail_url": "http://http2.mlstatic.com/D_801588-MLB91733740249_092025-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1862105883-par-lmpadas-h1-farol-alto-astra-1999-super-led-nano-s14-h1-branco-branco-frio-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 139.9,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "11/09/2026 03:09",
                    "payload_original": null,
                    "has_variations": false,
                    "variations": [],
                    "mapping": null
          },
          {
                    "id": "ml_MLB1248464127",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1248464127",
                    "seller_sku": "MLB1248464127",
                    "titulo": "Central Multimídia Universal Mp5 Touch 2 Din 7 Usb Bluetooth",
                    "thumbnail_url": "https://http2.mlstatic.com/D_707730-MLB75381747893_032024-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1248464127-central-multimidia-universal-mp5-touch-2-din-7-usb-bluetooth-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 999.9,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "ultima_sincronizacao": "26/07/2026 23:21",
                    "has_variations": false,
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapped_product_id": null,
                    "mapped_product_sku": null,
                    "mapped_product_nome": null,
                    "mapped_variations_count": 0,
                    "total_variations_count": 0,
                    "variations": []
          },
          {
                    "id": "ml_MLB1811816952",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1811816952",
                    "seller_sku": null,
                    "titulo": "Kit Farol Milha Gol G7 2016/2018 Moldura Botão Shocklight",
                    "thumbnail_url": "https://http2.mlstatic.com/D_967359-MLB74723450790_032024-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1811816952-kit-farol-milha-gol-g7-20162018-moldura-boto-shocklight-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 449.9,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "ultima_sincronizacao": "26/07/2026 22:51",
                    "has_variations": false,
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapped_product_id": null,
                    "mapped_product_sku": null,
                    "mapped_product_nome": null,
                    "mapped_variations_count": 0,
                    "total_variations_count": 0,
                    "variations": []
          },
          {
                    "id": "ml_MLB1433567301",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1433567301",
                    "seller_sku": "MLB1433567301",
                    "titulo": "Par Espelhos Retrovisores Câmera De Ré E Frontal 4,3 Full",
                    "thumbnail_url": "https://http2.mlstatic.com/D_895378-MLB74179471827_012024-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1433567301-par-espelhos-retrovisores-cmera-de-re-e-frontal-43-full-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 479.9,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "ultima_sincronizacao": "26/07/2026 22:51",
                    "has_variations": false,
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapped_product_id": null,
                    "mapped_product_sku": null,
                    "mapped_product_nome": null,
                    "mapped_variations_count": 0,
                    "total_variations_count": 0,
                    "variations": []
          },
          {
                    "id": "ml_MLB1427731939",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1427731939",
                    "seller_sku": "MLB1427731939_50220518246",
                    "titulo": "Rádio Automotivo Bluetooth Usb Sd Som Carro Controle Mp3",
                    "thumbnail_url": "https://http2.mlstatic.com/D_827017-MLB92575240339_092025-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1427731939-radio-automotivo-bluetooth-usb-sd-som-carro-controle-mp3-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 249.9,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "ultima_sincronizacao": "10/08/2026 03:26",
                    "has_variations": false,
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapped_product_id": null,
                    "mapped_product_sku": null,
                    "mapped_product_nome": null,
                    "mapped_variations_count": 0,
                    "total_variations_count": 0,
                    "variations": []
          },
          {
                    "id": "ml_MLB1298745229",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1298745229",
                    "seller_sku": "MLKIT_MLB1298745229_42142392443",
                    "titulo": "Par Encosto Tela Lcd 7 Polegadas Independente Controle Vídeo Imagem Usb Micro Sd Fone De Ouvido Cinza Preto/prata",
                    "thumbnail_url": "https://http2.mlstatic.com/D_742632-MLB107081265147_022026-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1298745229-par-encosto-tela-lcd-7-polegadas-independente-controle-video-imagem-usb-micro-sd-fone-de-ouvido-cinza-pretoprata-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 1699.9,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "ultima_sincronizacao": "09/08/2026 03:09",
                    "has_variations": false,
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapped_product_id": null,
                    "mapped_product_sku": null,
                    "mapped_product_nome": null,
                    "mapped_variations_count": 0,
                    "total_variations_count": 0,
                    "variations": []
          },
          {
                    "id": "ml_MLB1789721097",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1789721097",
                    "seller_sku": null,
                    "titulo": "Kit 13 Fitas Led Interna Rgb 64 Cores Neon App Carro Tunning",
                    "thumbnail_url": "https://http2.mlstatic.com/D_786299-MLB74179571255_012024-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1789721097-kit-13-fitas-led-interna-rgb-64-cores-neon-app-carro-tunning-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 3250,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "ultima_sincronizacao": "11/08/2026 21:01",
                    "has_variations": false,
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapped_product_id": null,
                    "mapped_product_sku": null,
                    "mapped_product_nome": null,
                    "mapped_variations_count": 0,
                    "total_variations_count": 0,
                    "variations": []
          },
          {
                    "id": "ml_MLB1623274631",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1623274631",
                    "seller_sku": "MLKIT_MLB1623274631_61665546086",
                    "titulo": "Kit Par Hb4 + Par Hb3 +  Par H11 Ultra Led 6000k Shocklight Hb4 Branco Branco-frio",
                    "thumbnail_url": "https://http2.mlstatic.com/D_901584-MLB91918632546_092025-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1623274631-kit-par-hb4-par-hb3-par-h11-ultra-led-6000k-shocklight-hb4-branco-branco-frio-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 749.9,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "ultima_sincronizacao": "26/07/2026 22:51",
                    "has_variations": false,
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapped_product_id": null,
                    "mapped_product_sku": null,
                    "mapped_product_nome": null,
                    "mapped_variations_count": 0,
                    "total_variations_count": 0,
                    "variations": []
          },
          {
                    "id": "ml_MLB1065406191",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1065406191",
                    "seller_sku": "MLKIT_MLB1065406191",
                    "titulo": "20 Lâmpadas H1 Halogena P14.5s 24v 70w Amarelo Conv. Gerlux",
                    "thumbnail_url": "https://http2.mlstatic.com/D_922653-MLB74309669919_012024-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1065406191-20-lmpadas-h1-halogena-p145s-24v-70w-amarelo-conv-gerlux-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 159.99,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "ultima_sincronizacao": "26/07/2026 22:50",
                    "has_variations": false,
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapped_product_id": null,
                    "mapped_product_sku": null,
                    "mapped_product_nome": null,
                    "mapped_variations_count": 0,
                    "total_variations_count": 0,
                    "variations": []
          },
          {
                    "id": "ml_MLB1856969886",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1856969886",
                    "seller_sku": null,
                    "titulo": "Par Lâmpadas H4 Alto Baixo Ranger 2004 Super Led Nano S14 H4 Branco Branco-frio",
                    "thumbnail_url": "https://http2.mlstatic.com/D_988910-MLB91699173017_092025-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1856969886-par-lmpadas-h4-alto-baixo-ranger-2004-super-led-nano-s14-h4-branco-branco-frio-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 159.9,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "ultima_sincronizacao": "26/07/2026 22:53",
                    "has_variations": false,
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapped_product_id": null,
                    "mapped_product_sku": null,
                    "mapped_product_nome": null,
                    "mapped_variations_count": 0,
                    "total_variations_count": 0,
                    "variations": []
          },
          {
                    "id": "ml_MLB1631771847",
                    "marketplace": "MERCADO_LIVRE",
                    "account_id": 1,
                    "account_externo_id": "238451947",
                    "seller_nome": "DY PARTS AUTO PECAS LTDA",
                    "seller_externo_id": "238451947",
                    "external_item_id": "MLB1631771847",
                    "seller_sku": "MLB1631771847",
                    "titulo": "Kit 50 1 Polo + 50 2 Polos 12v + 50 1 Polo + 50 2 Polos 24v",
                    "thumbnail_url": "https://http2.mlstatic.com/D_986995-MLB75249005254_032024-I.jpg",
                    "permalink": "https://produto.mercadolivre.com.br/MLB-1631771847-kit-50-1-polo-50-2-polos-12v-50-1-polo-50-2-polos-24v-_JM",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 359.9,
                    "preco_original": null,
                    "preco_promocional": null,
                    "ultimo_preco_venda": null,
                    "ultima_sincronizacao": "26/07/2026 22:51",
                    "has_variations": false,
                    "situacao_mapeamento": "NAO_MAPEADO",
                    "mapped_product_id": null,
                    "mapped_product_sku": null,
                    "mapped_product_nome": null,
                    "mapped_variations_count": 0,
                    "total_variations_count": 0,
                    "variations": []
          },
          {
                    "id": "18097497298",
                    "marketplace": "SHOPEE",
                    "account_id": null,
                    "source_account_id": "284803847",
                    "account_externo_id": "284803847",
                    "seller_nome": "DJOZU AUTO PEÇAS",
                    "seller_externo_id": "284803847",
                    "external_item_id": "18097497298",
                    "variation_id": null,
                    "variation_key": "",
                    "seller_sku": "DY-COMPC6-0095",
                    "titulo": "Fita Barra Led P/ Painel RGB Jac J2 2012 2013 2014 2015 2016 5m Tunning Tomada Conector USB",
                    "thumbnail_url": "https://cf.shopee.com.br/file/br-11134201-7r98o-lnkc9rfy8jwvfd",
                    "permalink": "https://shopee.com.br/product/284803847/18097497298",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 99.9,
                    "preco_original": 99.9,
                    "preco_promocional": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "MAPPING_NAO_HABILITADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "25/08/2026 18:22",
                    "payload_original": null,
                    "has_variations": false,
                    "variations": [],
                    "mapping": null
          },
          {
                    "id": "18097497315",
                    "marketplace": "SHOPEE",
                    "account_id": null,
                    "source_account_id": "284803847",
                    "account_externo_id": "284803847",
                    "seller_nome": "DJOZU AUTO PEÇAS",
                    "seller_externo_id": "284803847",
                    "external_item_id": "18097497315",
                    "variation_id": null,
                    "variation_key": "",
                    "seller_sku": "MLB900538129",
                    "titulo": "Fita Barra Led P/ Painel RGB Ford Fiesta 2003 2004 2005 2006 5m Tunning Tomada Conector USB",
                    "thumbnail_url": "https://cf.shopee.com.br/file/br-11134201-7r98o-lnkc9rfy8jwvfd",
                    "permalink": "https://shopee.com.br/product/284803847/18097497315",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 99.9,
                    "preco_original": 99.9,
                    "preco_promocional": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "MAPPING_NAO_HABILITADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "25/08/2026 18:22",
                    "payload_original": null,
                    "has_variations": false,
                    "variations": [],
                    "mapping": null
          },
          {
                    "id": "18097497319",
                    "marketplace": "SHOPEE",
                    "account_id": null,
                    "source_account_id": "284803847",
                    "account_externo_id": "284803847",
                    "seller_nome": "DJOZU AUTO PEÇAS",
                    "seller_externo_id": "284803847",
                    "external_item_id": "18097497319",
                    "variation_id": null,
                    "variation_key": "",
                    "seller_sku": "MLKIT_MLB1088307789",
                    "titulo": "Fita Barra Led P/ Painel RGB Ford Fiesta 1997 1998 2007 2008 2009 2010 5m Tunning Tomada Conector USB",
                    "thumbnail_url": "https://cf.shopee.com.br/file/br-11134201-7r98o-lnkc9rfy8jwvfd",
                    "permalink": "https://shopee.com.br/product/284803847/18097497319",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 99.9,
                    "preco_original": 99.9,
                    "preco_promocional": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "MAPPING_NAO_HABILITADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "25/08/2026 18:22",
                    "payload_original": null,
                    "has_variations": false,
                    "variations": [],
                    "mapping": null
          },
          {
                    "id": "18097497327",
                    "marketplace": "SHOPEE",
                    "account_id": null,
                    "source_account_id": "284803847",
                    "account_externo_id": "284803847",
                    "seller_nome": "DJOZU AUTO PEÇAS",
                    "seller_externo_id": "284803847",
                    "external_item_id": "18097497327",
                    "variation_id": null,
                    "variation_key": "",
                    "seller_sku": "DY-COMPC6-0072",
                    "titulo": "Fita Barra Led P/ Painel RGB Ford Focus 2010 2011 2012 2013 2014 2015 5m Tunning Tomada Conector USB",
                    "thumbnail_url": "https://cf.shopee.com.br/file/br-11134201-7r98o-lnkc9rfy8jwvfd",
                    "permalink": "https://shopee.com.br/product/284803847/18097497327",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 99.9,
                    "preco_original": 99.9,
                    "preco_promocional": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "MAPPING_NAO_HABILITADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "25/08/2026 18:22",
                    "payload_original": null,
                    "has_variations": false,
                    "variations": [],
                    "mapping": null
          },
          {
                    "id": "18097497328",
                    "marketplace": "SHOPEE",
                    "account_id": null,
                    "source_account_id": "284803847",
                    "account_externo_id": "284803847",
                    "seller_nome": "DJOZU AUTO PEÇAS",
                    "seller_externo_id": "284803847",
                    "external_item_id": "18097497328",
                    "variation_id": null,
                    "variation_key": "",
                    "seller_sku": "DY-COMPC6-0070",
                    "titulo": "Fita Barra Led P/ Painel RGB Golf 1998 1999 2000 2001 2002 2003 5m Tunning Tomada Conector USB",
                    "thumbnail_url": "https://cf.shopee.com.br/file/br-11134201-7r98o-lnkc9rfy8jwvfd",
                    "permalink": "https://shopee.com.br/product/284803847/18097497328",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 99.9,
                    "preco_original": 99.9,
                    "preco_promocional": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "MAPPING_NAO_HABILITADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "25/08/2026 18:22",
                    "payload_original": null,
                    "has_variations": false,
                    "variations": [],
                    "mapping": null
          },
          {
                    "id": "18097497330",
                    "marketplace": "SHOPEE",
                    "account_id": null,
                    "source_account_id": "284803847",
                    "account_externo_id": "284803847",
                    "seller_nome": "DJOZU AUTO PEÇAS",
                    "seller_externo_id": "284803847",
                    "external_item_id": "18097497330",
                    "variation_id": null,
                    "variation_key": "",
                    "seller_sku": "MLB1623344237_61669212722",
                    "titulo": "Fita Barra Led P/ Painel RGB Ford Focus 2000 2001 2002 2003 5m Tunning Tomada Conector USB",
                    "thumbnail_url": "https://cf.shopee.com.br/file/br-11134201-7r98o-lnkc9rfy8jwvfd",
                    "permalink": "https://shopee.com.br/product/284803847/18097497330",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 99.9,
                    "preco_original": 99.9,
                    "preco_promocional": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "MAPPING_NAO_HABILITADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "25/08/2026 18:22",
                    "payload_original": null,
                    "has_variations": false,
                    "variations": [],
                    "mapping": null
          },
          {
                    "id": "18097497332",
                    "marketplace": "SHOPEE",
                    "account_id": null,
                    "source_account_id": "284803847",
                    "account_externo_id": "284803847",
                    "seller_nome": "DJOZU AUTO PEÇAS",
                    "seller_externo_id": "284803847",
                    "external_item_id": "18097497332",
                    "variation_id": null,
                    "variation_key": "",
                    "seller_sku": "MLKIT_MLB1061704958",
                    "titulo": "Fita Barra Led P/ Painel RGB Ford Focus 2004 2005 2006 2007 2008 2009 5m Tunning Tomada Conector USB",
                    "thumbnail_url": "https://cf.shopee.com.br/file/br-11134201-7r98o-lnkc9rfy8jwvfd",
                    "permalink": "https://shopee.com.br/product/284803847/18097497332",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 99.9,
                    "preco_original": 99.9,
                    "preco_promocional": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "MAPPING_NAO_HABILITADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "25/08/2026 18:22",
                    "payload_original": null,
                    "has_variations": false,
                    "variations": [],
                    "mapping": null
          },
          {
                    "id": "18097497333",
                    "marketplace": "SHOPEE",
                    "account_id": null,
                    "source_account_id": "284803847",
                    "account_externo_id": "284803847",
                    "seller_nome": "DJOZU AUTO PEÇAS",
                    "seller_externo_id": "284803847",
                    "external_item_id": "18097497333",
                    "variation_id": null,
                    "variation_key": "",
                    "seller_sku": "MLB1155941936_33931016785",
                    "titulo": "Fita Barra Led P/ Painel RGB Golf 2002 2003 2004 2005 2006 2007 5m Tunning Tomada Conector USB",
                    "thumbnail_url": "https://cf.shopee.com.br/file/br-11134201-7r98o-lnkc9rfy8jwvfd",
                    "permalink": "https://shopee.com.br/product/284803847/18097497333",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 99.9,
                    "preco_original": 99.9,
                    "preco_promocional": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "MAPPING_NAO_HABILITADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "25/08/2026 18:22",
                    "payload_original": null,
                    "has_variations": false,
                    "variations": [],
                    "mapping": null
          },
          {
                    "id": "18097497348",
                    "marketplace": "SHOPEE",
                    "account_id": null,
                    "source_account_id": "284803847",
                    "account_externo_id": "284803847",
                    "seller_nome": "DJOZU AUTO PEÇAS",
                    "seller_externo_id": "284803847",
                    "external_item_id": "18097497348",
                    "variation_id": null,
                    "variation_key": "",
                    "seller_sku": "MLB1155941936_33931016785",
                    "titulo": "Fita Barra Led P/ Painel RGB Mitsubishi ASX 2011 2012 2013 5m Tunning Tomada Conector USB",
                    "thumbnail_url": "https://cf.shopee.com.br/file/br-11134201-7r98o-lnkc9rfy8jwvfd",
                    "permalink": "https://shopee.com.br/product/284803847/18097497348",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 99.9,
                    "preco_original": 99.9,
                    "preco_promocional": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "MAPPING_NAO_HABILITADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "25/08/2026 18:22",
                    "payload_original": null,
                    "has_variations": false,
                    "variations": [],
                    "mapping": null
          },
          {
                    "id": "18099073609",
                    "marketplace": "SHOPEE",
                    "account_id": null,
                    "source_account_id": "284803847",
                    "account_externo_id": "284803847",
                    "seller_nome": "DJOZU AUTO PEÇAS",
                    "seller_externo_id": "284803847",
                    "external_item_id": "18099073609",
                    "variation_id": null,
                    "variation_key": "",
                    "seller_sku": "MLB1209647498_35166842137",
                    "titulo": "Fita Barra Led P/ Painel RGB Renault Logan 2011 2012 2013 5m Tunning Tomada Conector USB",
                    "thumbnail_url": "https://cf.shopee.com.br/file/br-11134201-7r98o-lnkc9rfy8jwvfd",
                    "permalink": "https://shopee.com.br/product/284803847/18099073609",
                    "marketplace_status": "ACTIVE",
                    "preco_venda": 99.9,
                    "preco_original": 99.9,
                    "preco_promocional": null,
                    "moeda": "BRL",
                    "situacao_mapeamento": "MAPPING_NAO_HABILITADO",
                    "mapping_id": null,
                    "mapping_versao": null,
                    "tipo_mapeamento": null,
                    "mapping_resumo": null,
                    "ultima_sincronizacao": "25/08/2026 18:22",
                    "payload_original": null,
                    "has_variations": false,
                    "variations": [],
                    "mapping": null
          }
        ]
    };

    // Helpers de Normalização e Sanitização
    const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const normText = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const hasValue = v => v !== null && v !== undefined && String(v).trim() !== '';
    const accountKey = an => hasValue(an.account_id) ? `id:${an.account_id}` : hasValue(an.account_externo_id) ? `external:${an.account_externo_id}` : hasValue(an.seller_externo_id) ? `seller:${an.seller_externo_id}` : '';
    const sellerLabel = an => an.seller_nome || an.account_externo_id || an.seller_externo_id || '';
    const validPrice = v => hasValue(v) && Number.isFinite(Number(v));
    const money = (v, moeda) => { try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(Number(v)); } catch (_) { return Number(v).toFixed(2); } };
    const priceHTML = an => {
        const promo = validPrice(an.preco_promocional), value = promo ? an.preco_promocional : an.preco_venda;
        if (validPrice(value)) {
            return `<div style="margin-top:6px"><strong style="font-size:18px">${escapeHtml(money(value, an.moeda))}</strong>${promo && validPrice(an.preco_original) ? ` <small style="text-decoration:line-through;color:#64748b">${escapeHtml(money(an.preco_original, an.moeda))}</small>` : ''}</div>`;
        }
        if (validPrice(an.ultimo_preco_venda)) {
            return `<div style="margin-top:6px;font-size:13px;color:#64748b;"><span>Último preço vendido: </span><strong style="color:#0f172a;font-size:15px;">${escapeHtml(money(an.ultimo_preco_venda, an.moeda))}</strong></div>`;
        }
        return '';
    };
    const accountOptions = () => { const found = new Map(); AnunciosState.anuncios.forEach(an => { const key = accountKey(an); if (key && !found.has(key)) found.set(key, sellerLabel(an) || key); }); return [...found].map(([key, label]) => `<option value="${escapeHtml(key)}" ${AnunciosState.accountFilter === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join(''); };

    // Filtros de Listagem
    function getFilteredAnuncios() {
        const q = normText(AnunciosState.search);
        const acc = AnunciosState.accountFilter;

        return AnunciosState.anuncios.filter(an => {
            // Filtro por tab/status
            if (AnunciosState.filter === 'nao_mapeados') {
                if (an.situacao_mapeamento !== 'NAO_MAPEADO' && an.situacao_mapeamento !== 'PARCIAL') return false;
            } else if (AnunciosState.filter === 'mapeados') {
                if (an.situacao_mapeamento !== 'MAPEADO') return false;
            } else if (AnunciosState.filter === 'revisar') {
                if (an.situacao_mapeamento !== 'REVISAR') return false;
            }

            // Filtro por conta
            if (acc !== 'todas' && accountKey(an) !== acc) return false;

            // Filtro por texto
            if (q) {
                const searchCorpus = [
                    an.external_item_id,
                    an.titulo,
                    an.seller_sku,
                    an.seller_nome,
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
            const mappedCount = anuncio.variations.filter(v => v.situacao_mapeamento === 'MAPEADO').length;
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
            const isMapped = an.situacao_mapeamento === 'MAPEADO';
            const actionLabel = isMapped ? 'Ver / Editar mapeamento' : (an.has_variations ? 'Mapear variações' : 'Mapear produto');
            const actionClass = isMapped ? 'an-btn-edit' : 'an-btn-primary';
            const iconName = isMapped ? 'edit_square' : 'add_link';

            const externalStatus = String(an.marketplace_status || '').trim().toUpperCase();
            return `
                <article class="an-card" data-anuncio-id="${escapeHtml(an.id)}">
                    <!-- Thumbnail com Zoom -->
                    <button type="button" class="an-card-image" onclick="anOpenImage('${escapeHtml(an.thumbnail_url)}', '${escapeHtml(an.titulo)}')" title="Ampliar imagem do anúncio">
                        <img src="${escapeHtml(an.thumbnail_url)}" alt="${escapeHtml(an.titulo)}" onerror="this.src='/assets/images/placeholder.webp';">
                    </button>

                    <!-- Metadados do Mercado Livre -->
                    <div class="an-card-details">
                        <div class="an-card-meta">
                            ${hasValue(an.marketplace) ? `<span class="an-badge-mlb">${escapeHtml(an.marketplace.replaceAll('_', ' '))}</span>` : ''}
                            ${hasValue(an.external_item_id) ? `<span class="an-badge-mlb">${escapeHtml(an.external_item_id)}</span>` : ''}
                            ${hasValue(an.variation_id || an.variation_key) ? `<span class="an-badge-sku">Variação: ${escapeHtml(an.variation_id || an.variation_key)}</span>` : ''}
                            ${an.seller_sku ? `<span class="an-badge-sku">SKU: ${escapeHtml(an.seller_sku)}</span>` : ''}
                            ${sellerLabel(an) ? `<span class="an-badge-account"><span class="material-symbols-rounded" style="font-size:14px;">store</span>${escapeHtml(sellerLabel(an))}</span>` : ''}
                        </div>
                        <h3>${escapeHtml(an.titulo)}</h3>
                        ${priceHTML(an)}
                        <div class="an-card-submeta">
                            <span class="an-status-dot ${externalStatus === 'ACTIVE' ? 'active' : 'paused'}">
                                ${externalStatus === 'ACTIVE' ? 'Anúncio Ativo' : 'Anúncio Pausado'}
                            </span>
                            <span>•</span>
                            ${hasValue(an.ultima_sincronizacao) ? `<span>Sincronizado: ${escapeHtml(an.ultima_sincronizacao)}</span>` : ''}
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
        const unmappedCount = AnunciosState.anuncios.filter(a => a.situacao_mapeamento === 'NAO_MAPEADO' || a.situacao_mapeamento === 'PARCIAL').length;
        const mappedCount = AnunciosState.anuncios.filter(a => a.situacao_mapeamento === 'MAPEADO').length;
        const reviewCount = AnunciosState.anuncios.filter(a => a.situacao_mapeamento === 'REVISAR').length;

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
                                    ${accountOptions()}
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

        // Hidratar mappings salvos no Supabase ao carregar a tela
        hidratarMappingsPersistidos();
    };

    function atualizarContadoresResumo() {
        const totalCount = AnunciosState.anuncios.length;
        const unmappedCount = AnunciosState.anuncios.filter(a => a.situacao_mapeamento === 'NAO_MAPEADO' || a.situacao_mapeamento === 'PARCIAL').length;
        const mappedCount = AnunciosState.anuncios.filter(a => a.situacao_mapeamento === 'MAPEADO').length;
        const reviewCount = AnunciosState.anuncios.filter(a => a.situacao_mapeamento === 'REVISAR').length;

        const tabTodos = document.querySelector('.an-summary .tab-todos strong');
        if (tabTodos) tabTodos.textContent = totalCount;
        const tabNaoMap = document.querySelector('.an-summary .tab-nao-mapeados strong');
        if (tabNaoMap) tabNaoMap.textContent = unmappedCount;
        const tabMap = document.querySelector('.an-summary .tab-mapeados strong');
        if (tabMap) tabMap.textContent = mappedCount;
        const tabRev = document.querySelector('.an-summary .tab-revisar strong');
        if (tabRev) tabRev.textContent = reviewCount;
    }

    async function hidratarMappingsPersistidos() {
        if (!window.DataClient?.listMercadoLivreItemMappings) return;

        // Contas Mercado Livre na amostra atual com account_id válido (ex: 1)
        const accountIds = [...new Set(
            AnunciosState.anuncios
                .filter(a => a.marketplace === 'MERCADO_LIVRE' && hasValue(a.account_id))
                .map(a => Number(a.account_id))
        )].filter(id => Number.isInteger(id) && id > 0);

        let houveMudanca = false;

        for (const accId of accountIds) {
            try {
                const mappings = await window.DataClient.listMercadoLivreItemMappings(accId);
                if (!Array.isArray(mappings) || !mappings.length) continue;

                for (const mapRecord of mappings) {
                    if (!mapRecord.ativo || !mapRecord.current_version_id) continue;
                    const versao = mapRecord.mercadolivre_item_mapping_versions;
                    if (!versao) continue;

                    const componentes = versao.mercadolivre_item_mapping_componentes || [];
                    if (!componentes.length) continue;

                    // Identidade do mapping: account_id + external_item_id
                    const targetAnuncio = AnunciosState.anuncios.find(a =>
                        a.marketplace === 'MERCADO_LIVRE' &&
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
                            houveMudanca = true;
                        }
                        const allMapped = targetAnuncio.variations.every(v => v.situacao_mapeamento === 'MAPEADO');
                        targetAnuncio.situacao_mapeamento = allMapped ? 'MAPEADO' : 'PARCIAL';
                    } else {
                        if (targetVarKey === '__SEM_VARIACAO__' || !targetAnuncio.variation_key || targetAnuncio.variation_key === targetVarKey) {
                            targetAnuncio.mapping = uiMapping;
                            targetAnuncio.situacao_mapeamento = 'MAPEADO';
                            targetAnuncio.mapping_id = mapRecord.id;
                            targetAnuncio.mapping_versao = versao.versao;
                            houveMudanca = true;
                        }
                    }
                }
            } catch (err) {
                console.warn('[ANUNCIOS_MAPPING] Erro ao carregar mappings da conta ' + accId + ':', err);
            }
        }

        if (houveMudanca) {
            const listContainer = document.getElementById('an-list-container');
            if (listContainer) {
                listContainer.innerHTML = renderAnunciosCards();
            }
            atualizarContadoresResumo();
        }
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

        overlay.innerHTML = `
            <div class="an-modal" style="max-width:620px;" onclick="event.stopPropagation()">
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
                    <p style="margin:0 0 12px;font-size:13px;color:#64748b;">Este anúncio possui múltiplas variações. Escolha qual variação deseja mapear:</p>
                    <div style="display:grid;gap:10px;">
                        ${anuncio.variations.map(v => {
                            const isVMap = v.situacao_mapeamento === 'MAPEADO';
                            const prod = v.mapping?.products?.[0];
                            return `
                                <button type="button" onclick="document.getElementById('an-variation-picker-overlay').remove(); anOpenMappingModal('${escapeHtml(anuncio.id)}', '${escapeHtml(getVariationRef(v))}')" style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:14px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;text-align:left;cursor:pointer;">
                                    <div>
                                        <strong style="display:block;color:#0f172a;font-size:13px;">${escapeHtml(v.attribute)}</strong>
                                        <small style="color:#64748b;font-size:11px;">${hasValue(v.seller_sku) ? `SKU: ${escapeHtml(v.seller_sku)} • ` : ''}${escapeHtml(v.variation_id || v.variation_key || 'Identificador não informado')}</small>
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

            const uiMapping = {
                type: tipoIdentificacao === 'kit' ? 'kit' : (state.modalAcceptedProducts.length > 1 ? 'equivalents' : 'single'),
                products: state.modalAcceptedProducts.map(p => ({ ...p })),
                components: state.modalKitComponents.map(c => ({ product: { ...c.product }, qty: c.qty }))
            };

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

})();
