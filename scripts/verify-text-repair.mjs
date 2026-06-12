import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync('public/app.js', 'utf8');
const start = appSource.indexOf('const CP1252_BYTE_BY_CHAR =');
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
    ['SÃƒO (PICK)', 'SÃO (PICK)'],
    ['INÃƒO', 'INÃO'],
    ['TRANSFERÃƒÆ’Ã…Â NCIA', 'TRANSFERÊNCIA'],
    ['HISTÃƒÆ’Ã¢â‚¬Å“RICO MOVIMENTO', 'HISTÓRICO MOVIMENTO'],
    ['SEPARAÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ES', 'SEPARAÇÕES'],
    ['REPOSIÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢O', 'REPOSIÇÃO'],
    ['COMISSÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ES', 'COMISSÕES'],
    ['ORÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡AMENTO CLIENTE', 'ORÇAMENTO CLIENTE'],
    ['INVENTÃƒÆ’Ã‚ÂRIO', 'INVENTÁRIO'],
    ['SEPARAÇÃO (PICK)', 'SEPARAÇÃO (PICK)']
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
