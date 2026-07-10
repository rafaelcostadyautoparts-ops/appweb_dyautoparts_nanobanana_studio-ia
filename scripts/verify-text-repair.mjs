import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync('public/app.js', 'utf8');
const start = appSource.indexOf('const MOJIBAKE_REPLACEMENTS =');
const end = appSource.indexOf('function restoreScanFieldFocus');

if (start === -1 || end === -1 || end <= start) {
    throw new Error('Nao foi possivel localizar o reparador de encoding em public/app.js.');
}

const repairSource = `${appSource.slice(start, end)}\nglobalThis.__repairMojibakeText = repairMojibakeText;`;
const context = { TextDecoder };
vm.createContext(context);
vm.runInContext(repairSource, context);

const repair = context.__repairMojibakeText;
const cases = [
    ['VocÃƒÆ’Ã‚Âª pode importar outra nota agora ou ir para Notas em aberto.', 'Você pode importar outra nota agora ou ir para Notas em aberto.'],
    ['Ela ficarÃƒÆ’Ã‚Â¡ em Notas em aberto atÃƒÆ’Ã‚Â© concluir os vÃƒÆ’Ã‚Â­nculos.', 'Ela ficará em Notas em aberto até concluir os vínculos.'],
    ['Este tipo de lanÃƒÆ’Ã‚Â§amento nÃƒÆ’Ã‚Â£o altera estoque.', 'Este tipo de lançamento não altera estoque.'],
    ['NF recebida com sucesso. O estoque foi atualizado no TÃƒÆ’Ã¢â‚¬Â°RREO.', 'NF recebida com sucesso. O estoque foi atualizado no TÉRREO.'],
    ['Deseja lanÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ar as quantidades no estoque do TÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â°RREO? Esta aÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o registra movimentos e camadas de custo.', 'Deseja lan\u00e7ar as quantidades no estoque do T\u00c9RREO? Esta a\u00e7\u00e3o registra movimentos e camadas de custo.'],
    ['SÃƒÆ’O (PICK)', 'S\u00c3O (PICK)'],
    ['INÃƒÆ’O', 'N\u00c3O'],
    ['TRANSFERÃƒÆ’Ã†â€™Ãƒâ€¦Ã‚Â NCIA', 'TRANSFER\u00caNCIA'],
    ['HISTÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œRICO MOVIMENTO', 'HIST\u00d3RICO MOVIMENTO'],
    ['SEPARAÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ES', 'SEPARA\u00c7\u00d5ES'],
    ['REPOSIÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢O', 'REPOSI\u00c7\u00c3O'],
    ['COMISSÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ES', 'COMISS\u00d5ES'],
    ['ORÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡AMENTO CLIENTE', 'OR\u00c7AMENTO CLIENTE'],
    ['INVENTÃƒÆ’Ã†â€™Ãƒâ€šÃ‚ÂRIO', 'INVENT\u00c1RIO'],
    ['SEPARAÃ‡ÃƒO (PICK)', 'SEPARA\u00c7\u00c3O (PICK)']
];

const failures = cases
    .map(([input, expected]) => ({ input, expected, actual: repair(input) }))
    .filter(({ actual, expected }) => actual !== expected);

if (failures.length) {
    console.error('Falha na verificacao de encoding:');
    failures.forEach(({ input, expected, actual }) => {
        console.error(`- ${input} => ${actual} (esperado: ${expected})`);
    });
    process.exit(1);
}

console.log(`Encoding guard OK (${cases.length} casos).`);
