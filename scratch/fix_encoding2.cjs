const fs = require('fs');

const replacements = [
  { search: 'CONFIGURAﾃグ', replace: 'CONFIGURAÇÃO' },
  { search: 'ATENﾃグ', replace: 'ATENÇÃO' },
  { search: 'SEPARAﾃグ', replace: 'SEPARAÇÃO' },
  { search: 'INSTANTﾃEA', replace: 'INSTANTÂNEA' },
  { search: 'CONFERﾃ劾CIA', replace: 'CONFERÊNCIA' },
  { search: 'CIRﾃ啌GICO', replace: 'CIRÚRGICO' },
  { search: 'RELATﾃ迭IO', replace: 'RELATÓRIO' },
  { search: 'PRﾃ-FINALIZAﾃグ', replace: 'PRÉ-FINALIZAÇÃO' },
  { search: 'FINALIZAﾃグ', replace: 'FINALIZAÇÃO' },
  { search: 'ﾃ肱dice', replace: 'Índice' },
  { search: 'CRﾃ控ICA', replace: 'CRÍTICA' },
  { search: 'CRﾃ控ICO', replace: 'CRÍTICO' },
  { search: 'REVISﾃグ', replace: 'REVISÃO' },
  { search: 'Rﾃ￣IDOS', replace: 'RÁPIDOS' },
  { search: 'Rﾃ￣IDO', replace: 'RÁPIDO' },
  { search: 'PREﾃ⑯', replace: 'PREÇO' },
  { search: 'DISPONﾃ昂EL', replace: 'DISPONÍVEL' },
  { search: 'RECOLHﾃ昂EL', replace: 'RECOLHÍVEL' },
  { search: 'Tﾃ韻NICOS', replace: 'TÉCNICOS' },
  { search: 'OBSERVAﾃ髭S', replace: 'OBSERVAÇÕES' },
  { search: 'INFORMAﾃ髭S', replace: 'INFORMAÇÕES' },
  { search: 'Aﾃ髭S', replace: 'AÇÕES' },
  { search: 'BALCﾃグ', replace: 'BALCÃO' },
  { search: 'CORREﾃグ', replace: 'CORREÇÃO' },
  { search: 'DIVERGﾃ劾CIA', replace: 'DIVERGÊNCIA' },
  { search: 'RECONCILIAﾃグ', replace: 'RECONCILIAÇÃO' },
  { search: 'OPﾃグ', replace: 'OPÇÃO' },
  { search: 'DEVOLUﾃグ', replace: 'DEVOLUÇÃO' },
  { search: 'OPERAﾃグ', replace: 'OPERAÇÃO' },
  { search: 'CABEﾃ②LHO', replace: 'CABEÇALHO' },
  { search: 'ﾃ', replace: '×' }
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
    // Escape for regex or just use split/join
    content = content.split(r.search).join(r.replace);
  });
  
  // Specific fallback for cases with replacement characters U+FFFD that we can catch
  content = content.replace(/CONFIGURAﾃ\uFFFDグ/g, 'CONFIGURAÇÃO');
  content = content.replace(/ATENﾃ\uFFFDグ/g, 'ATENÇÃO');
  content = content.replace(/SEPARAﾃ\uFFFDグ/g, 'SEPARAÇÃO');
  content = content.replace(/INSTANTﾃ\uFFFDEA/g, 'INSTANTÂNEA');
  content = content.replace(/FINALIZAﾃ\uFFFDグ/g, 'FINALIZAÇÃO');
  content = content.replace(/PRﾃ\uFFFD-FINALIZAÇÃO/g, 'PRÉ-FINALIZAÇÃO');
  content = content.replace(/OBSERVAﾃ\uFFFD髭S/g, 'OBSERVAÇÕES');
  content = content.replace(/INFORMAﾃ\uFFFD髭S/g, 'INFORMAÇÕES');
  content = content.replace(/CORREﾃ\uFFFDグ/g, 'CORREÇÃO');
  content = content.replace(/RECONCILIAﾃ\uFFFDグ/g, 'RECONCILIAÇÃO');
  content = content.replace(/OPﾃ\uFFFDグ/g, 'OPÇÃO');
  content = content.replace(/DEVOLUﾃ\uFFFDグ/g, 'DEVOLUÇÃO');
  content = content.replace(/OPERAﾃ\uFFFDグ/g, 'OPERAÇÃO');
  content = content.replace(/x === 'ﾃ\uFFFD'/g, "x === '×'");
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed ' + file);
  } else {
    console.log('No changes needed for ' + file);
  }
});
