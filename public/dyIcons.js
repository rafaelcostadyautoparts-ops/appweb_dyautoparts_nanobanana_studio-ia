/**
 * dyIcons.js - Catálogo Central Oficial de Ícones do DY Auto Parts
 * 
 * Sistema autônomo, offline e leve de SVGs vetorizados inline.
 * Suporta variantes: 'module' (64x64 com/sem fundo), 'action' (24x24), 'status' (20x20) e 'navigation' (24x24).
 */

(function (window) {
  'use strict';

  // SVG Base dos Ícones de Módulos (64x64) - Mantendo a identidade visual idêntica ao Menu Principal
  const MODULE_ICONS = {
    produtos: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#DB2777"/><path d="M18 24 32 17l14 7-14 7-14-7Z" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M18 24v16l14 7 14-7V24M32 31v16" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="m39 19 5 2.5" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
    anuncios: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><path d="M20 25 h24 v22 H20 Z" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M26 17 L38 17 L44 25 L20 25 Z" fill="#fff" opacity="0.95"/><path d="M26 33 h12 M26 39 h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="41" cy="39" r="2.5" fill="#fff"/></svg>',
    kit_lampada: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><path d="M32 18 C26 18 22 23 22 28 C22 33 25 36 28 38 L28 44 L36 44 L36 38 C39 36 42 33 42 28 C42 23 38 18 32 18 Z" stroke="#fff" stroke-width="2.5" fill="none"/><line x1="28" y1="44" x2="36" y2="44" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><line x1="29" y1="47" x2="35" y2="47" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    pedidos: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0EA5E9"/><path d="M21 19h22v28H21z" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M27 17h10v5H27z" fill="#0EA5E9" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="m26 31 3 3 6-7M26 41h12" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pick: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#2563EB"/><path d="M18 23 30 17l12 6-12 6-12-6Z" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M18 23v14l12 6 7-3.5M30 29v14" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><circle cx="43" cy="41" r="9" fill="#2563EB" stroke="#fff" stroke-width="2.5"/><path d="m39 41 2.7 2.7 5-5.4" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pack: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0F766E"/><rect x="18" y="22" width="28" height="24" rx="3" stroke="#fff" stroke-width="2.5" fill="none"/><path d="M18 28 H46" stroke="#fff" stroke-width="2.5"/><path d="M26 36 L31 42 L40 30" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    movimentacoes: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#7C3AED"/><path d="M20 32 H44" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M36 24 L44 32 L36 40" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M28 40 L20 32 L28 24" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"/></svg>',
    inventario: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F97316"/><path d="M16 22h32M16 41h32M20 22v24M44 22v24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><rect x="22" y="26" width="9" height="11" rx="1.5" fill="none" stroke="#fff" stroke-width="2.2"/><rect x="33" y="26" width="9" height="11" rx="1.5" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M25 30h3M36 30h3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    dashboard: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#8B5CF6"/><rect x="16" y="16" width="13" height="13" rx="2" fill="#fff" opacity="0.9"/><rect x="35" y="16" width="13" height="13" rx="2" fill="#fff" opacity="0.9"/><rect x="16" y="35" width="13" height="13" rx="2" fill="#fff" opacity="0.9"/><rect x="35" y="35" width="13" height="13" rx="2" fill="#fff" opacity="0.9"/></svg>',
    configuracoes: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#4B5563"/><path d="M32 16v4M32 44v4M16 32h4M44 32h4M20.7 20.7l2.8 2.8M40.5 40.5l2.8 2.8M20.7 43.3l2.8-2.8M40.5 23.5l2.8-2.8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="32" r="6" stroke="#fff" stroke-width="2.5" fill="none"/></svg>',
    nf: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#8B5CF6"/><path d="M20 15h17l7 7v27H20V15Z" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M37 15v8h7M25 29h14M25 35h8" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/><path d="M36 38v8m0 0-4-4m4 4 4-4" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    compras: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#EA580C"/><path d="M20 22 L22 18 H42 L44 22 V40 H20 Z" stroke="#fff" stroke-width="2.5" fill="none" stroke-linejoin="round"/><path d="M26 22 V18 M38 22 V18" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><path d="M26 31 L31 36 L38 28" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    financeiro: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#10B981"/><path d="M18 19 h28 v26 H18 Z" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M27 29 C27 25 37 25 37 31 C37 37 27 37 27 41 C27 45 37 45 37 41" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/><line x1="32" y1="22" x2="32" y2="44" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
    contas_a_pagar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#8B5CF6"/><path d="M20 18 H38 L44 24 V44 H20 Z" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M38 18 V24 H44" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" fill="none"/><path d="M26 30 H36 M26 36 H32" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="38" cy="38" r="6" fill="#8B5CF6" stroke="#fff" stroke-width="2"/><path d="M38 35 V38 L40 40" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    pagamentos: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#06B6D4"/><path d="M18 24 C18 21.8 19.8 20 22 20 H42 C44.2 20 46 21.8 46 24 V40 C46 42.2 44.2 44 42 44 H22 C19.8 44 18 42.2 18 40 Z" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M18 28 H46" stroke="#fff" stroke-width="2.5"/><circle cx="38" cy="36" r="3.5" fill="#fff"/><path d="M24 35 L27 38 L32 32" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    financeiro_avencer: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><path d="M22 18 H42 C44 18 46 20 46 22 V46 H18 V22 C18 20 20 18 22 18 Z" fill="#fff" opacity="0.95"/><path d="M24 28 H40 M24 34 H36" stroke="#F59E0B" stroke-width="3" stroke-linecap="round"/><path d="M34 40 L38 44 L46 36" stroke="#F59E0B" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    financeiro_vencidas: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#EF4444"/><path d="M32 16 L50 48 H14 Z" fill="#fff" opacity="0.95"/><path d="M32 27 V36" stroke="#EF4444" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="42" r="2.6" fill="#EF4444"/></svg>',
    financeiro_pendentes: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#3B82F6"/><path d="M20 20 H44 V46 H20 Z" fill="#fff" opacity="0.95"/><path d="M26 28 H38 M26 34 H38 M26 40 H34" stroke="#3B82F6" stroke-width="3" stroke-linecap="round"/></svg>',
    financeiro_pagas_mes: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#10B981"/><path d="M19 32 L28 41 L46 23" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="32" r="20" stroke="#fff" stroke-width="3" fill="none" opacity="0.35"/></svg>',
    busca: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#3B82F6"/><circle cx="28" cy="28" r="8" stroke="#fff" stroke-width="3" fill="none"/><line x1="34" y1="34" x2="42" y2="42" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>',
    cadastrar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#10B981"/><path d="M18 25 32 18l14 7-14 7-14-7Z" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/><path d="M18 25v16l14 7 8-4M32 32v16" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/><path d="m39 38 8-8 3 3-8 8-4 1 1-4Z" fill="#10B981" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>',
    transferencia: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#8B5CF6"/><path d="M22 28 L30 20 L38 28 M30 20 V44" stroke="#fff" stroke-width="3" fill="none"/><path d="M42 36 L34 44 L26 36" stroke="#fff" stroke-width="3" fill="none" opacity="0.6"/></svg>',
    ajuste: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><path d="M22 22 L42 42 M22 42 L42 22" stroke="#fff" stroke-width="3"/></svg>',
    historico: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>',
    devolucoes: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0F766E"/><path d="M43 24H24a8 8 0 0 0 0 16h18" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M25 16 17 24l8 8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 46h20" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.75"/></svg>',
    fornecedores: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#DC2626"/><rect x="20" y="20" width="24" height="24" rx="2" stroke="#fff" stroke-width="3" fill="none"/><path d="M26 26 H38 M26 32 H38 M26 38 H32" stroke="#fff" stroke-width="2" opacity="0.8"/></svg>',
    pedido_compra: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><path d="M20 24 H44 L40 40 H24 Z" stroke="#fff" stroke-width="3" fill="none"/><circle cx="26" cy="46" r="2.5" fill="#fff"/><circle cx="38" cy="46" r="2.5" fill="#fff"/></svg>',
    transporte: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#3B82F6"/><rect x="18" y="26" width="20" height="14" rx="1" fill="#fff" opacity="0.9"/><rect x="38" y="30" width="8" height="10" rx="1" fill="#fff" opacity="0.7"/></svg>',
    abertas: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F59E0B"/><circle cx="32" cy="32" r="10" stroke="#fff" stroke-width="3" fill="none" opacity="0.5"/><path d="M32 26 V32 L36 36" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
    garantia: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#EF4444"/><path d="M32 20 L32 36" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><circle cx="32" cy="43" r="2.5" fill="#fff"/></svg>',
    xml: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/></svg>',
    nf_recebimento: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 12 17 16 17 18 14 20 14"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M4 14V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5"/><path d="M12 3v9"/><path d="m9 9 3 3 3-3"/></svg>',
    nf_pendencias: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    compras_necessidade: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3.5 7.2 4.15v8.7L12 20.5l-7.2-4.15v-8.7L12 3.5z"/><path d="m4.8 7.65 7.2 4.15 7.2-4.15"/><path d="M12 11.8v8.7"/></svg>',
    compras_pedido: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    cotacao: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>',
    compras_fornecedores: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>',
    compras_transporte: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-5.6a1 1 0 0 0-.29-.71l-3.4-3.4A1 1 0 0 0 17.6 7H14v11h1"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    compras_historico: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>',
    fin_contas_a_pagar: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 12h8"/><path d="M8 17h4"/></svg>',
    fin_pagamentos: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="7" cy="15" r="1"/></svg>',
    emissao_nova: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/></svg>',
    emissao_emitidas: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>',
    emissao_inutilizacao: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9.5" y1="12.5" x2="14.5" y2="17.5"/><line x1="14.5" y1="12.5" x2="9.5" y2="17.5"/></svg>',
    emissao_historico: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>',
    manual: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#10B981"/><path d="M22 22 L42 42 M42 22 L22 42" stroke="#fff" stroke-width="3"/></svg>',
    inventario_inicial: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>',
    inventario_geral: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    inventario_localizacao: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    inventario_parcial: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/><circle cx="5" cy="6" r="2"/><circle cx="5" cy="12" r="2"/><path d="m3 17 2 2 4-4"/></svg>',
    prod_buscar: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    prod_cadastrar: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    prod_gestao: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>'
  };

  // SVGs de Ações (24x24) - Linguagem visual limpa, vetor puro sem fundo
  const ACTION_ICONS = {
    add: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    back: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    arrow_back: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    view: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    visibility: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    edit: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    delete: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
    search: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    search_off: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="4" y1="4" x2="20" y2="20"/></svg>',
    filter: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    tune: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    xml: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    text_snippet: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    print: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    sync: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    more: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/></svg>',
    more_horiz: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/></svg>',
    previous: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    next: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    history: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/><polyline points="12 7 12 12 15 15"/></svg>'
  };

  // SVGs de Status e Indicadores (20x20 ou 24x24)
  const STATUS_ICONS = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    check_circle: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    pending: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    stock: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
    inventory_2: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
    financial: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="16" cy="15" r="1.5"/></svg>',
    payments: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="16" cy="15" r="1.5"/></svg>',
    account_balance_wallet: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="16" cy="15" r="1.5"/></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  // SVGs de Navegação (24x24)
  const NAVIGATION_ICONS = {
    previous: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    chevron_left: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    next: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    chevron_right: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    up: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
    down: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
  };

  const CATALOG = {
    module: MODULE_ICONS,
    action: ACTION_ICONS,
    status: STATUS_ICONS,
    navigation: NAVIGATION_ICONS
  };

  function normalizeKey(key) {
    return String(key || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  /**
   * Helper principal de ícones do DY Auto Parts.
   * 
   * @param {string} name Nome/Chave do ícone (ex: 'view', 'success', 'nf', 'search')
   * @param {string} [variant='action'] Variante: 'module', 'action', 'status', 'navigation'
   * @param {object} [options={}] Opções adicionais (class, style, etc)
   * @returns {string} String do SVG inline ou '' se não encontrado (NUNCA renderiza + como fallback)
   */
  function dyIcon(name, variant = 'action', options = {}) {
    const key = normalizeKey(name);
    if (!key) return '';

    const category = CATALOG[variant] || CATALOG.action;
    let svg = category[key];

    // Fallbacks inter-categorias se não encontrado na variante específica
    if (!svg && variant !== 'module') {
      svg = ACTION_ICONS[key] || STATUS_ICONS[key] || NAVIGATION_ICONS[key];
    }
    if (!svg && variant === 'module') {
      svg = MODULE_ICONS[key];
    }

    // REGRA ABSOLUTA: Se a chave não existir, NUNCA renderizar '+' ou fallback falso! Devolver string vazia.
    if (!svg) {
      const isDev = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      if (isDev) {
        console.warn(`[dyIcon] Ícone não encontrado no catálogo: "${name}" (variante: "${variant}")`);
      }
      return '';
    }

    // Aplicar classes globais da variante e opções do usuário
    const variantClass = `dy-icon dy-icon-${variant}`;
    const userClass = options.class ? ` ${options.class}` : '';
    const finalClass = `${variantClass}${userClass}`.trim();

    try {
      let parser = new DOMParser();
      let doc = parser.parseFromString(svg, 'image/svg+xml');
      let svgEl = doc.querySelector('svg');
      if (svgEl) {
        const existingClass = svgEl.getAttribute('class') || '';
        const combinedClass = existingClass ? `${existingClass} ${finalClass}` : finalClass;
        svgEl.setAttribute('class', combinedClass);

        if (options.style) {
          const existingStyle = svgEl.getAttribute('style') || '';
          svgEl.setAttribute('style', existingStyle ? `${existingStyle}; ${options.style}` : options.style);
        }
        return svgEl.outerHTML;
      }
    } catch (e) {
      console.warn('[dyIcon] Erro ao formatar SVG:', e);
    }

    return svg;
  }

  // Exportar globalmente para a janela
  window.dyIcon = dyIcon;
  window.dyIcons = CATALOG;

})(typeof window !== 'undefined' ? window : this);
