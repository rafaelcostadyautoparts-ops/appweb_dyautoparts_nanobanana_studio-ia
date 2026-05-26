const fs = require('fs');
const path = require('path');

const replacements = [
  // CP850 (DOS Latin 1) to UTF-8
  { search: '├ì', replace: 'Í' },
  { search: '├º', replace: 'ç' },
  { search: '├Á', replace: 'õ' },
  { search: '├ó', replace: 'â' },
  { search: '├í', replace: 'á' },
  { search: '├¬', replace: 'ê' },
  { search: '├ú', replace: 'ã' },
  { search: '├⌐', replace: 'é' },
  { search: '├¡', replace: 'í' },
  { search: '├│', replace: 'ó' },
  { search: '├║', replace: 'ú' },
  { search: '├ü', replace: 'Á' },
  { search: '├ë', replace: 'É' },
  { search: '├ô', replace: 'Ó' },
  { search: '├ç', replace: 'Ç' },
  { search: '├é', replace: 'Â' },
  { search: '├è', replace: 'Ê' },
  { search: '├Ü', replace: 'Ú' },
  { search: '├╡', replace: 'Õ' },
  
  // Latin-1/Windows-1252 to UTF-8
  { search: 'Ã¡', replace: 'á' },
  { search: 'Ã¢', replace: 'â' },
  { search: 'Ã£', replace: 'ã' },
  { search: 'Ã§', replace: 'ç' },
  { search: 'Ã©', replace: 'é' },
  { search: 'Ãª', replace: 'ê' },
  { search: 'Ã­', replace: 'í' }, // Ã\xad
  { search: 'Ã³', replace: 'ó' },
  { search: 'Ã´', replace: 'ô' },
  { search: 'Ãµ', replace: 'õ' },
  { search: 'Ãº', replace: 'ú' },
  { search: 'Ã\x81', replace: 'Á' },
  { search: 'Ã\x89', replace: 'É' },
  { search: 'Ã\x8d', replace: 'Í' },
  { search: 'Ã\x93', replace: 'Ó' },
  { search: 'Ã\x9a', replace: 'Ú' },
  { search: 'Ã\x87', replace: 'Ç' },
  
  // Specific broken words mapped directly
  { search: 'CR├ìTICO', replace: 'CRÍTICO' },
  { search: 'separa├º├Áes', replace: 'separações' },
  { search: 'separa├º├úo', replace: 'separação' },
  { search: 'Separa├º├úo', replace: 'Separação' },
  { search: 'SEPARA├ç├âO', replace: 'SEPARAÇÃO' },
  { search: 'em tr├ónsito', replace: 'em trânsito' },
  { search: 'invent├írio', replace: 'inventário' },
  { search: 'Invent├írio', replace: 'Inventário' },
  { search: 'confer├¬ncia', replace: 'conferência' },
  { search: 'Confer├¬ncia', replace: 'Conferência' },
  { search: 'INVENT├üRIO', replace: 'INVENTÁRIO' },
  { search: 'PR├ë', replace: 'PRÉ' }
];

function cleanInvisibleChars(str) {
  // Remove zero width space, zero width non-joiner, etc., but keep normal whitespace and newlines
  return str.replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function processFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const ext = path.extname(filePath).toLowerCase();
  if (!['.js', '.css', '.html', '.ts', '.sql', '.json', '.gs', '.md'].includes(ext)) return;
  if (filePath.includes('node_modules') || filePath.includes('.git') || filePath.includes('dist')) return;

  try {
    // Read raw buffer to check for BOM
    const buf = fs.readFileSync(filePath);
    let hasBOM = false;
    let contentStr = '';

    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      hasBOM = true;
      contentStr = buf.toString('utf8', 3);
    } else {
      contentStr = buf.toString('utf8');
    }

    let modified = contentStr;

    // Apply replacements
    replacements.forEach(r => {
      modified = modified.split(r.search).join(r.replace);
    });

    // Normalize Unicode (NFC)
    modified = modified.normalize('NFC');

    // Clean invisible characters
    modified = cleanInvisibleChars(modified);

    // If changes occurred or BOM was present, rewrite without BOM
    if (modified !== contentStr || hasBOM) {
      fs.writeFileSync(filePath, modified, 'utf8');
      console.log(`Normalized and fixed encoding: ${filePath}`);
    }
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!['node_modules', '.git', 'dist'].includes(file)) {
        walkDir(fullPath);
      }
    } else {
      processFile(fullPath);
    }
  }
}

walkDir('.');
console.log('Encoding normalization complete.');
