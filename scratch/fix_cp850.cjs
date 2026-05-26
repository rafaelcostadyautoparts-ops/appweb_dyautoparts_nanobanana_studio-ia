const fs = require('fs');

const replacements = [
  // C3 block (Latin-1 Supplement)
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
  { search: '├ì', replace: 'Í' },
  { search: '├Ü', replace: 'Ú' },
  { search: '├╡', replace: 'Õ' },
  { search: '├ú', replace: 'ã' },
  { search: '├¡', replace: 'í' },
  // C2 block
  { search: '┬║', replace: 'º' },
  { search: '┬¬', replace: 'ª' },
  
  // Specific common combinations explicitly (just to be safe)
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
  
  // What if uppercase ÃO? Ã is C3 83 (├â), O is O.
  { search: '├â', replace: 'Ã' },
  { search: '├Ç', replace: 'À' },
  { search: '├á', replace: 'à' }
];

const files = [
  'public/app.js',
  'public/index.html',
  'public/src/index.css'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  replacements.forEach(r => {
    content = content.split(r.search).join(r.replace);
  });
  
  if (content !== original) {
    // Write back as true UTF-8
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed ' + file);
  } else {
    console.log('No changes needed for ' + file);
  }
});
