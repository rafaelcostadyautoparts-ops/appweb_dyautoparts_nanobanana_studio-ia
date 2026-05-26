import fs from 'fs';

const path = 'public/app.js';
let content = fs.readFileSync(path, 'latin1'); // ISO-8859-1 / Latin-1

// 1. RegExp to match subItems in renderInventarioSubMenu
const subItemsRegex = /const subItems = \[\s*\{\s*id:\s*'inv_inicial'[\s\S]*?\}\s*\];/;
const subItemsReplacement = `const subItems = [
        { id: 'inv_inicial', label: 'INVENT\\u00c1RIO INICIAL', icon: 'inventario_inicial', onclick: 'startInventarioInicial()' },
        { id: 'inv_geral', label: 'INVENT\\u00c1RIO GERAL', icon: 'inventario_geral', onclick: 'startInventarioGeral()' },
        { id: 'inv_parcial', label: 'INVENT\\u00c1RIO PARCIAL', icon: 'inventario_parcial', onclick: "renderInventorySetup('parcial')" },
        { id: 'historico_inv', label: 'HIST\\u00d3RICO', icon: 'historico', onclick: 'renderInventarioHistory()' }
    ];`;

if (subItemsRegex.test(content)) {
    content = content.replace(subItemsRegex, subItemsReplacement);
}

// 2. RegExp to match vertical sidebar module label mapping (around line 1838)
const sidebarLabelRegex = /inventario:\s*\{\s*label:\s*'INVENT[^\']+',\s*icon:\s*'fact_check'/;
const sidebarLabelReplacement = "inventario:    { label: 'INVENT\\u00c1RIO',    icon: 'fact_check'";

if (sidebarLabelRegex.test(content)) {
    content = content.replace(sidebarLabelRegex, sidebarLabelReplacement);
}

// 3. RegExp to match main menu module config array (around line 2642)
const menuModuleRegex = /\{\s*id:\s*'inventario',\s*label:\s*'INVENT[^\']+',\s*icon:\s*'inventario'/;
const menuModuleReplacement = "{ id: 'inventario', label: 'INVENT\\u00c1RIO', icon: 'inventario'";

if (menuModuleRegex.test(content)) {
    content = content.replace(menuModuleRegex, menuModuleReplacement);
}

fs.writeFileSync(path, content, 'latin1');
console.log('App.js all instances corrected successfully using RegExp!');
