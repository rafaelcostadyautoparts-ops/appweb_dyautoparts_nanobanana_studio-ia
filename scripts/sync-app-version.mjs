import fs from 'node:fs';

const versionPath = new URL('../public/version.json', import.meta.url);
const indexPath = new URL('../index.html', import.meta.url);
const versionInfo = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
let html = fs.readFileSync(indexPath, 'utf8');

const replacements = [
  ['dy-app-version', String(versionInfo.version || '')],
  ['dy-app-build', String(versionInfo.build || '')],
  ['dy-app-commit', String(versionInfo.commit || '')],
  ['dy-app-deploy-date', String(versionInfo.deployDate || '')]
];

for (const [name, value] of replacements) {
  const pattern = new RegExp(`(<meta name="${name}" content=")[^"]*(">)`);
  if (!pattern.test(html)) throw new Error(`Meta ${name} nao encontrada em index.html`);
  html = html.replace(pattern, `$1${value}$2`);
}

const assetVersion = [versionInfo.version, versionInfo.build].filter(Boolean).join('-').replace(/[^a-z0-9.-]+/gi, '-');
html = html.replace(/(<script src="\/app\.js\?v=)[^"]+(">)/, '$1' + assetVersion + '$2');
html = html.replace(/(<script src="\/dataClient\.js\?v=)[^"]+(">)/, '$1' + assetVersion + '$2');

fs.writeFileSync(indexPath, html, 'utf8');
console.log(`Versao sincronizada: v${versionInfo.version} (${versionInfo.build})`);