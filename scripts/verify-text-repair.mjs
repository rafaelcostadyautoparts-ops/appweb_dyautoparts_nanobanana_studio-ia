import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const allowedExts = new Set([
  '.css', '.csv', '.html', '.js', '.json', '.md', '.mjs', '.sql', '.svg', '.ts', '.tsx', '.txt', '.xml', '.yml', '.yaml'
]);
const rootFiles = new Set(['index.html', 'package.json', 'package-lock.json', 'vite.config.js']);
const skipDirs = new Set([
  '.git', '.agents', '.codex', 'node_modules', 'dist', 'build', 'coverage', '.vite', '.cache'
]);
const skipDirPatterns = [/^\.edge-layout-profile/i, /^\.playwright/i, /^playwright-report$/i];
const scanRoots = ['public', 'scripts', 'docs', 'supabase'];
const artifactRe = new RegExp([
  '\\u00c3\\u0192',
  '\\u00c3\\u201a',
  '\\u00c2\\u00a2',
  '\\u00c2\\u00ac',
  '\\u00e2\\u20ac',
  '\\u00e2\\u201a',
  '\\ufffd',
  '\\u00ef\\u00bf\\u00bd',
  '\\u0192',
  '\\u0081',
  '[\\u0080-\\u009f]'
].join('|'));
const asciiResidueTokens = [
  ['A', 'asi'], ['Ai', 'Ai'], ['A', 'azi'], ['AA', 'a'], ['AA', 'o'], ['AA', 'es'], ['AAA', 'es'], ['AA', "'Ai"],
  ['seguran', 'Aa'], ['sens', 'Avel'], ['or', 'Aamento'], ['repos', 'ao'], ['Repos', 'ao'], ['con', 'ao'], ['Con', 'ao'], ['or', 'Aamento'], ['Or', 'Aamento'], ['sess', 'Aes']
].map((parts) => parts.join(''));
const asciiResidueRe = new RegExp(asciiResidueTokens.join('|'), 'g');
const decoder = new TextDecoder('utf-8', { fatal: true });
const issues = [];
const checked = [];

function shouldSkipDir(name) {
  return skipDirs.has(name) || skipDirPatterns.some((re) => re.test(name));
}

function isTextCandidate(file) {
  const rel = path.relative(root, file).replaceAll(path.sep, '/');
  if (rootFiles.has(rel)) return true;
  return allowedExts.has(path.extname(file).toLowerCase());
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) walk(path.join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const file = path.join(dir, entry.name);
    if (!isTextCandidate(file)) continue;
    checked.push(file);
    checkFile(file);
  }
}

function lineFor(text, index) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function snippetFor(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const nextBreak = text.indexOf('\n', index);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  return text.slice(lineStart, lineEnd).trim().slice(0, 180);
}

function checkFile(file) {
  const bytes = fs.readFileSync(file);
  let text;
  try {
    text = decoder.decode(bytes);
  } catch (error) {
    issues.push({ file, message: 'arquivo nao esta em UTF-8 valido', detail: error.message });
    return;
  }

  const match = artifactRe.exec(text);
  if (match) {
    const pos = lineFor(text, match.index);
    issues.push({
      file,
      message: `texto com possivel caractere corrompido em ${pos.line}:${pos.column}`,
      detail: snippetFor(text, match.index)
    });
  }

  const residueMatch = asciiResidueRe.exec(text);
  if (residueMatch) {
    const pos = lineFor(text, residueMatch.index);
    issues.push({
      file,
      message: `texto com residuo de conversao corrompida em ${pos.line}:${pos.column}`,
      detail: snippetFor(text, residueMatch.index)
    });
  }
}

for (const name of scanRoots) walk(path.join(root, name));
for (const name of rootFiles) {
  const file = path.join(root, name);
  if (fs.existsSync(file)) {
    checked.push(file);
    checkFile(file);
  }
}

if (issues.length) {
  console.error('Falha na verificacao de encoding. Corrija os textos abaixo:');
  for (const issue of issues.slice(0, 80)) {
    console.error(`- ${path.relative(root, issue.file)}: ${issue.message}`);
    if (issue.detail) console.error(`  ${issue.detail}`);
  }
  if (issues.length > 80) console.error(`... mais ${issues.length - 80} ocorrencias.`);
  process.exit(1);
}

console.log(`Encoding OK: ${checked.length} arquivos verificados em UTF-8.`);