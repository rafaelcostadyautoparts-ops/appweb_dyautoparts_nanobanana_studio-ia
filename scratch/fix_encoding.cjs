const fs = require('fs');

const regexReplacements = [
  // Words missing in previous script
  { regex: /histﾃｳrico/g, replace: 'histórico' },
  { regex: /Histﾃｳrico/g, replace: 'Histórico' },
  { regex: /HISTﾃ迭ICO/g, replace: 'HISTÓRICO' },
  
  // Specific problem words with the replacement character 
  { regex: /INICIALIZAﾃグ/g, replace: 'INICIALIZAÇÃO' },
  { regex: /LﾃPADAS/g, replace: 'LÂMPADAS' },
  { regex: /LﾃPADA/g, replace: 'LÂMPADA' },
  { regex: /INVENTﾃヽIO/g, replace: 'INVENTÁRIO' },
  { regex: /SEPARAﾃグ/g, replace: 'SEPARAÇÃO' },
  { regex: /ATENﾃグ/g, replace: 'ATENÇÃO' },
  { regex: /INSTANTﾃEA/g, replace: 'INSTANTÂNEA' },
  { regex: /CONFIGURAﾃグ/g, replace: 'CONFIGURAÇÃO' },
  { regex: /FILTROS RﾃIDOS/g, replace: 'FILTROS RÁPIDOS' },
  { regex: /RﾃIDOS/g, replace: 'RÁPIDOS' },
  { regex: /RﾃIDO/g, replace: 'RÁPIDO' },
  
  // Uppercase ones
  { regex: /Mﾃ泥ULOS/g, replace: 'MÓDULOS' },
  { regex: /TRANSFERﾃ劾CIA/g, replace: 'TRANSFERÊNCIA' },
  { regex: /SAﾃ好A/g, replace: 'SAÍDA' },
  { regex: /USUﾃヽIOS/g, replace: 'USUÁRIOS' },
  { regex: /CONCLUﾃ好O/g, replace: 'CONCLUÍDO' },
  { regex: /INﾃ垢IO/g, replace: 'INÍCIO' },
  { regex: /ﾃ哢ICO/g, replace: 'ÚNICO' },
  { regex: /ﾃ哢ICA/g, replace: 'ÚNICA' },
  { regex: /ﾃ嗟tima/g, replace: 'Última' },
  
  // Lowercase/Mixed
  { regex: /prﾃｳxima/g, replace: 'próxima' },
  { regex: /prﾃｳximo/g, replace: 'próximo' },
  { regex: /pﾃｴde/g, replace: 'pôde' },
  { regex: /obrigatﾃｳria/g, replace: 'obrigatória' },
  { regex: /obrigatﾃｳrio/g, replace: 'obrigatório' },
  { regex: /mﾃｳdulos/g, replace: 'módulos' },
  { regex: /mﾃｳdulo/g, replace: 'módulo' },
  { regex: /prﾃｳprio/g, replace: 'próprio' },
  { regex: /prﾃｳprios/g, replace: 'próprios' },
  { regex: /apﾃｳs/g, replace: 'após' },
  { regex: /memﾃｳria/g, replace: 'memória' },
  { regex: /tﾃｩcnica/g, replace: 'técnica' },
  { regex: /tﾃｩcnico/g, replace: 'técnico' },
  { regex: /dﾃｭgitos/g, replace: 'dígitos' },
  { regex: /nﾃｺmeros/g, replace: 'números' },
  { regex: /indisponﾃｭvel/g, replace: 'indisponível' },
  { regex: /Classificaﾃｧﾃ｣o/g, replace: 'Classificação' },
  { regex: /Invﾃ｡lido/g, replace: 'Inválido' },
  { regex: /nﾃ｣o/g, replace: 'não' },
  { regex: /botﾃ｣o/g, replace: 'botão' },
  { regex: /Alfanumﾃｩrico/g, replace: 'Alfanumérico' },
  { regex: /cﾃ｢mera/g, replace: 'câmera' },
  { regex: /usuﾃ｡rio/g, replace: 'usuário' },
  { regex: /usuﾃ｡rios/g, replace: 'usuários' },
  { regex: /cﾃｳdigo/g, replace: 'código' },
  { regex: /lﾃｳgica/g, replace: 'lógica' },
  { regex: /aﾃｧﾃ｣o/g, replace: 'ação' },
  { regex: /Aﾃｧﾃ｣o/g, replace: 'Ação' },
  { regex: /atualizaﾃｧﾃ｣o/g, replace: 'atualização' },
  { regex: /Atualizaﾃｧﾃ｣o/g, replace: 'Atualização' },
  { regex: /versﾃ｣o/g, replace: 'versão' },
  { regex: /transferﾃｪncia/g, replace: 'transferência' },
  { regex: /Transferﾃｪncia/g, replace: 'Transferência' },
  { regex: /requisiﾃｧﾃ｣o/g, replace: 'requisição' },
  { regex: /Requisiﾃｧﾃ｣o/g, replace: 'Requisição' },
  { regex: /conexﾃ｣o/g, replace: 'conexão' },
  { regex: /Conexﾃ｣o/g, replace: 'Conexão' },
  { regex: /normalizaﾃｧﾃ｣o/g, replace: 'normalização' },
  { regex: /Normalizaﾃｧﾃ｣o/g, replace: 'Normalização' },
  { regex: /correﾃｧﾃ｣o/g, replace: 'correção' },
  { regex: /Correﾃｧﾃ｣o/g, replace: 'Correção' },
  { regex: /concluﾃｭdo/g, replace: 'concluído' },
  { regex: /pﾃｺblica/g, replace: 'pública' },
  { regex: /Pﾃｺblica/g, replace: 'Pública' },
  { regex: /lﾃ｢mpada/g, replace: 'lâmpada' },
  { regex: /potﾃｪncia/g, replace: 'potência' },
  { regex: /Potﾃｪncia/g, replace: 'Potência' },
  { regex: /carcaﾃｧa/g, replace: 'carcaça' },
  { regex: /Carcaﾃｧa/g, replace: 'Carcaça' },
  { regex: /veﾃｭculo/g, replace: 'veículo' },
  { regex: /Veﾃｭculo/g, replace: 'Veículo' },
  { regex: /aplicaﾃｧﾃ｣o/g, replace: 'aplicação' },
  { regex: /Aplicaﾃｧﾃ｣o/g, replace: 'Aplicação' },
  { regex: /ﾃ€/g, replace: 'À' },
  { regex: /diagnﾃｳstico/g, replace: 'diagnóstico' },
  { regex: /Diagnﾃｳstico/g, replace: 'Diagnóstico' },
  { regex: /conferﾃｪncia/g, replace: 'conferência' },
  { regex: /Conferﾃｪncia/g, replace: 'Conferência' },
  { regex: /instantﾃ｢nea/g, replace: 'instantânea' },
  { regex: /Instantﾃ｢nea/g, replace: 'Instantânea' },
  
  // Try to catch any remaining 'ﾃ' mapping
  { regex: /ﾃｩ/g, replace: 'é' },
  { regex: /ﾃ｡/g, replace: 'á' },
  { regex: /ﾃ｣/g, replace: 'ã' },
  { regex: /ﾃｵ/g, replace: 'õ' },
  { regex: /ﾃｧ/g, replace: 'ç' },
  { regex: /ﾃｭ/g, replace: 'í' },
  { regex: /ﾃｺ/g, replace: 'ú' },
  { regex: /ﾃ｢/g, replace: 'â' },
  { regex: /ﾃｪ/g, replace: 'ê' },
  { regex: /ﾃｰ/g, replace: 'ð' },
  { regex: /ﾃｳ/g, replace: 'ó' },
  { regex: /ﾃｴ/g, replace: 'ô' }
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
  
  regexReplacements.forEach(r => {
    content = content.replace(r.regex, r.replace);
  });
  
  // Specific fallbacks for unicode replacement character U+FFFD which might be represented literally
  content = content.replace(/INICIALIZAﾃグ/g, 'INICIALIZAÇÃO');
  content = content.replace(/INICIALIZAﾃグ/g, 'INICIALIZAÇÃO');
  content = content.replace(/INICIALIZAﾃ\uFFFDグ/g, 'INICIALIZAÇÃO');
  content = content.replace(/LﾃPADAS/g, 'LÂMPADAS');
  content = content.replace(/LﾃPADAS/g, 'LÂMPADAS');
  content = content.replace(/Lﾃ\uFFFDPADAS/g, 'LÂMPADAS');
  content = content.replace(/LﾃPADA/g, 'LÂMPADA');
  content = content.replace(/LﾃPADA/g, 'LÂMPADA');
  content = content.replace(/Lﾃ\uFFFDPADA/g, 'LÂMPADA');
  content = content.replace(/INVENTﾃヽIO/g, 'INVENTÁRIO');
  content = content.replace(/INVENTﾃIO/g, 'INVENTÁRIO');
  content = content.replace(/SEPARAﾃグ/g, 'SEPARAÇÃO');
  content = content.replace(/SEPARAﾃグ/g, 'SEPARAÇÃO');
  content = content.replace(/ATENﾃグ/g, 'ATENÇÃO');
  content = content.replace(/ATENﾃグ/g, 'ATENÇÃO');
  content = content.replace(/INSTANTﾃEA/g, 'INSTANTÂNEA');
  content = content.replace(/INSTANTﾃEA/g, 'INSTANTÂNEA');
  content = content.replace(/CONFIGURAﾃグ/g, 'CONFIGURAÇÃO');
  content = content.replace(/CONFIGURAﾃグ/g, 'CONFIGURAÇÃO');
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed ' + file);
  } else {
    console.log('No changes needed for ' + file);
  }
});
