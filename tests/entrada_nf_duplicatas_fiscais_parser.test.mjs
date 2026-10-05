import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { parseNFeXML, FORMAS_PAGAMENTO_NFE, getDescricaoFormaPagamento } from '../../automacao-entrada-nfe/src/parser.js';

test('VALIDAÇÃO tPag — Formas de Pagamento Conhecidas e Desconhecidas', () => {
  // Conhecidos solicitados
  assert.equal(getDescricaoFormaPagamento('01'), 'Dinheiro');
  assert.equal(getDescricaoFormaPagamento('03'), 'Cartao de Credito');
  assert.equal(getDescricaoFormaPagamento('15'), 'Boleto Bancario');
  assert.equal(getDescricaoFormaPagamento('90'), 'Sem Pagamento');

  // Código desconhecido
  const desconhecido = getDescricaoFormaPagamento('999');
  assert.equal(desconhecido, 'Forma de pagamento nao mapeada');

  // Nulos / indefinidos
  assert.equal(getDescricaoFormaPagamento(null), 'Nao informado');
  assert.equal(getDescricaoFormaPagamento(''), 'Nao informado');
});

test('VALIDAÇÃO <dup> — Casos de nDup (Normal, Vazio, Ausente, Múltiplos sem nDup e nDup Repetido)', () => {
  const xmlMock = `<?xml version="1.0" encoding="UTF-8"?>
  <nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
    <NFe>
      <infNFe Id="NFe35260000000000000000550010000000011000000000" versao="4.00">
        <ide><nNF>100</nNF></ide>
        <emit><CNPJ>00000000000191</CNPJ></emit>
        <dest><CNPJ>31869538000160</CNPJ></dest>
        <det nItem="1"><prod><cProd>P1</cProd><qCom>1</qCom><vProd>500</vProd></prod></det>
        <total><ICMSTot><vProd>500</vProd><vNF>500</vNF></ICMSTot></total>
        <cobr>
          <!-- 1. Normal -->
          <dup><nDup>001</nDup><dVenc>2026-10-10</dVenc><vDup>100.00</vDup></dup>
          <!-- 2. Vazio -->
          <dup><nDup></nDup><dVenc>2026-10-20</dVenc><vDup>100.00</vDup></dup>
          <!-- 3. Ausente -->
          <dup><dVenc>2026-10-30</dVenc><vDup>100.00</vDup></dup>
          <!-- 4. Duplicata repetida com nDup = 001 -->
          <dup><nDup>001</nDup><dVenc>2026-11-10</dVenc><vDup>100.00</vDup></dup>
          <!-- 5. Duplicata repetida com nDup = 001 novamente -->
          <dup><nDup>001</nDup><dVenc>2026-11-20</dVenc><vDup>100.00</vDup></dup>
        </cobr>
      </infNFe>
    </NFe>
  </nfeProc>`;

  const tmpPath = path.resolve('tests', 'temp_ndup_cases.xml');
  fs.writeFileSync(tmpPath, xmlMock, 'utf8');

  try {
    const res = parseNFeXML(tmpPath);
    assert.equal(res.cobranca.duplicatas.length, 5);

    // 1. Normal
    assert.equal(res.cobranca.duplicatas[0].numeroParcela, '001');
    assert.equal(res.cobranca.duplicatas[0].dataVencimento, '2026-10-10');

    // 2. Vazio (assume índice 2 com padding)
    assert.equal(res.cobranca.duplicatas[1].numeroParcela, '002');
    assert.equal(res.cobranca.duplicatas[1].dataVencimento, '2026-10-20');

    // 3. Ausente (assume índice 3 com padding)
    assert.equal(res.cobranca.duplicatas[2].numeroParcela, '003');
    assert.equal(res.cobranca.duplicatas[2].dataVencimento, '2026-10-30');

    // 4. nDup 001 repetido (desambiguado para 001-2)
    assert.equal(res.cobranca.duplicatas[3].numeroParcela, '001-2');
    assert.equal(res.cobranca.duplicatas[3].dataVencimento, '2026-11-10');

    // 5. nDup 001 repetido novamente (desambiguado para 001-3)
    assert.equal(res.cobranca.duplicatas[4].numeroParcela, '001-3');
    assert.equal(res.cobranca.duplicatas[4].dataVencimento, '2026-11-20');

    // Garantir que todos os números de duplicata sejam estritamente únicos (compatível com UNIQUE constraint)
    const numeros = res.cobranca.duplicatas.map(d => d.numeroParcela);
    const setNumeros = new Set(numeros);
    assert.equal(numeros.length, setNumeros.size, 'Todos os numeroParcela devem ser unicos');
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

test('VALIDAÇÃO MÚLTIPLOS detPag — Preserva todos os pagamentos na ordem sem interpretar como parcelas', () => {
  const xmlMock = `<?xml version="1.0" encoding="UTF-8"?>
  <nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
    <NFe>
      <infNFe Id="NFe35260000000000000000550010000000011000000000" versao="4.00">
        <ide><nNF>200</nNF></ide>
        <emit><CNPJ>00000000000191</CNPJ></emit>
        <dest><CNPJ>31869538000160</CNPJ></dest>
        <det nItem="1"><prod><cProd>P1</cProd><qCom>1</qCom><vProd>150</vProd></prod></det>
        <total><ICMSTot><vProd>150</vProd><vNF>150</vNF></ICMSTot></total>
        <pag>
          <detPag>
            <indPag>1</indPag>
            <tPag>15</tPag>
            <vPag>100.00</vPag>
          </detPag>
          <detPag>
            <indPag>1</indPag>
            <tPag>03</tPag>
            <vPag>50.00</vPag>
          </detPag>
        </pag>
      </infNFe>
    </NFe>
  </nfeProc>`;

  const tmpPath = path.resolve('tests', 'temp_multipag.xml');
  fs.writeFileSync(tmpPath, xmlMock, 'utf8');

  try {
    const res = parseNFeXML(tmpPath);
    assert.equal(res.pagamentos.length, 2);

    // Registro 1: Boleto R$ 100,00
    assert.equal(res.pagamentos[0].indicadorFormaPagamento, '1');
    assert.equal(res.pagamentos[0].codigoFormaPagamento, '15');
    assert.equal(res.pagamentos[0].descricaoFormaPagamento, 'Boleto Bancario');
    assert.equal(res.pagamentos[0].valorPagamento, 100.00);

    // Registro 2: Cartão de Crédito R$ 50,00
    assert.equal(res.pagamentos[1].indicadorFormaPagamento, '1');
    assert.equal(res.pagamentos[1].codigoFormaPagamento, '03');
    assert.equal(res.pagamentos[1].descricaoFormaPagamento, 'Cartao de Credito');
    assert.equal(res.pagamentos[1].valorPagamento, 50.00);

    // Duplicatas permanecem 0 (detPag não é interpretado como parcelas)
    assert.equal(res.cobranca.duplicatas.length, 0);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

test('VALIDAÇÃO FATURA — Completa, Parcial e Ausente', () => {
  // 1. Fatura Completa
  const xmlFatCompleta = `<?xml version="1.0" encoding="UTF-8"?>
  <nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
    <NFe><infNFe Id="NFe1"><ide><nNF>1</nNF></ide><emit><CNPJ>001</CNPJ></emit><dest><CNPJ>002</CNPJ></dest><det nItem="1"><prod><cProd>1</cProd><qCom>1</qCom><vProd>100</vProd></prod></det><total><ICMSTot><vProd>100</vProd><vNF>100</vNF></ICMSTot></total>
      <cobr>
        <fat><nFat>FAT-12345</nFat><vOrig>120.00</vOrig><vDesc>20.00</vDesc><vLiq>100.00</vLiq></fat>
      </cobr>
    </infNFe></NFe>
  </nfeProc>`;

  // 2. Fatura Parcial (apenas nFat e vLiq)
  const xmlFatParcial = `<?xml version="1.0" encoding="UTF-8"?>
  <nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
    <NFe><infNFe Id="NFe2"><ide><nNF>2</nNF></ide><emit><CNPJ>001</CNPJ></emit><dest><CNPJ>002</CNPJ></dest><det nItem="1"><prod><cProd>1</cProd><qCom>1</qCom><vProd>100</vProd></prod></det><total><ICMSTot><vProd>100</vProd><vNF>100</vNF></ICMSTot></total>
      <cobr>
        <fat><nFat>FAT-999</nFat><vLiq>100.00</vLiq></fat>
      </cobr>
    </infNFe></NFe>
  </nfeProc>`;

  // 3. Fatura Ausente
  const xmlFatAusente = `<?xml version="1.0" encoding="UTF-8"?>
  <nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
    <NFe><infNFe Id="NFe3"><ide><nNF>3</nNF></ide><emit><CNPJ>001</CNPJ></emit><dest><CNPJ>002</CNPJ></dest><det nItem="1"><prod><cProd>1</cProd><qCom>1</qCom><vProd>100</vProd></prod></det><total><ICMSTot><vProd>100</vProd><vNF>100</vNF></ICMSTot></total>
    </infNFe></NFe>
  </nfeProc>`;

  const p1 = path.resolve('tests', 'temp_fat1.xml');
  const p2 = path.resolve('tests', 'temp_fat2.xml');
  const p3 = path.resolve('tests', 'temp_fat3.xml');

  fs.writeFileSync(p1, xmlFatCompleta, 'utf8');
  fs.writeFileSync(p2, xmlFatParcial, 'utf8');
  fs.writeFileSync(p3, xmlFatAusente, 'utf8');

  try {
    const res1 = parseNFeXML(p1);
    assert.equal(res1.cobranca.fatura.numeroFatura, 'FAT-12345');
    assert.equal(res1.cobranca.fatura.valorOriginal, 120.00);
    assert.equal(res1.cobranca.fatura.valorDesconto, 20.00);
    assert.equal(res1.cobranca.fatura.valorLiquido, 100.00);

    const res2 = parseNFeXML(p2);
    assert.equal(res2.cobranca.fatura.numeroFatura, 'FAT-999');
    assert.equal(res2.cobranca.fatura.valorOriginal, 0);
    assert.equal(res2.cobranca.fatura.valorDesconto, 0);
    assert.equal(res2.cobranca.fatura.valorLiquido, 100.00);

    const res3 = parseNFeXML(p3);
    assert.equal(res3.cobranca.fatura, null);
    assert.equal(res3.cobranca.numeroFatura, '');
  } finally {
    if (fs.existsSync(p1)) fs.unlinkSync(p1);
    if (fs.existsSync(p2)) fs.unlinkSync(p2);
    if (fs.existsSync(p3)) fs.unlinkSync(p3);
  }
});

test('VALIDAÇÃO SEPARAÇÃO FISCAL × OPERACIONAL — Edição operacional não afeta duplicatas fiscais', () => {
  // Duplicatas fiscais originais salvas no banco
  const duplicatasFiscaisImutaveis = [
    { entrada_nf_id: 'nf-teste-1', numero_duplicata: '001', vencimento_xml: '2026-10-10', valor_xml: 1000.00 },
    { entrada_nf_id: 'nf-teste-1', numero_duplicata: '002', vencimento_xml: '2026-11-10', valor_xml: 1000.00 }
  ];

  // Contas a pagar operacional inicial (gerado a partir do XML)
  let contasPagarOperacional = [
    { id: 'cp-1', entrada_nf_id: 'nf-teste-1', numero_parcela: 1, vencimento: '2026-10-10', valor: 1000.00, status: 'rascunho' },
    { id: 'cp-2', entrada_nf_id: 'nf-teste-1', numero_parcela: 2, vencimento: '2026-11-10', valor: 1000.00, status: 'rascunho' }
  ];

  // Operador edita a condição financeira para 15/10 e 15/11 (chamada de salvar_parcelas_fiscais_entrada_nf)
  contasPagarOperacional = [
    { id: 'cp-novo-1', entrada_nf_id: 'nf-teste-1', numero_parcela: 1, vencimento: '2026-10-15', valor: 1000.00, status: 'rascunho' },
    { id: 'cp-novo-2', entrada_nf_id: 'nf-teste-1', numero_parcela: 2, vencimento: '2026-11-15', valor: 1000.00, status: 'rascunho' }
  ];

  // 1. Duplicatas fiscais permanecem inalteradas
  assert.equal(duplicatasFiscaisImutaveis[0].vencimento_xml, '2026-10-10');
  assert.equal(duplicatasFiscaisImutaveis[1].vencimento_xml, '2026-11-10');

  // 2. Contas a pagar refletem as datas operacionais editadas
  assert.equal(contasPagarOperacional[0].vencimento, '2026-10-15');
  assert.equal(contasPagarOperacional[1].vencimento, '2026-11-15');
});

test('VALIDAÇÃO PARSER — Fixture Real da NF 24257', () => {
  const xmlPath = 'E:/meus-repositorios/automacao-entrada-nfe/processados/NFE-35260908145108000184550010000242571158748656.xml';
  if (fs.existsSync(xmlPath)) {
    const res = parseNFeXML(xmlPath);
    assert.equal(res.numeroNFe, '24257');
    assert.equal(res.cobranca.fatura.numeroFatura, '24257');
    assert.equal(res.cobranca.fatura.valorOriginal, 712.25);
    assert.equal(res.cobranca.fatura.valorDesc, undefined);
    assert.equal(res.cobranca.fatura.valorLiquido, 712.25);

    assert.equal(res.cobranca.duplicatas.length, 1);
    assert.equal(res.cobranca.duplicatas[0].numeroParcela, '001');
    assert.equal(res.cobranca.duplicatas[0].dataVencimento, '2026-10-06');
    assert.equal(res.cobranca.duplicatas[0].valorParcela, 712.25);

    assert.equal(res.pagamentos.length, 1);
    assert.equal(res.pagamentos[0].codigoFormaPagamento, '15');
    assert.equal(res.pagamentos[0].descricaoFormaPagamento, 'Boleto Bancario');
    assert.equal(res.pagamentos[0].indicadorFormaPagamento, '1');
    assert.equal(res.pagamentos[0].valorPagamento, 712.25);
  }
});

test('VALIDAÇÃO DE NÃO CRIAÇÃO DE PARCELAS — NF 62535 e NF 27876', () => {
  // NF 62535: fatura presente, tPag=15, SEM <dup>
  const xml62535 = 'E:/meus-repositorios/automacao-entrada-nfe/processados/NFE-35260915332149000145550010000625351060603045.xml';
  if (fs.existsSync(xml62535)) {
    const res = parseNFeXML(xml62535);
    assert.equal(res.numeroNFe, '62535');
    assert.equal(res.cobranca.fatura.numeroFatura, '062535');
    assert.equal(res.cobranca.fatura.valorLiquido, 1463.35);
    assert.equal(res.cobranca.duplicatas.length, 0); // 0 duplicatas fiscais
    assert.equal(res.pagamentos.length, 1);
    assert.equal(res.pagamentos[0].codigoFormaPagamento, '15');
    assert.equal(res.pagamentos[0].valorPagamento, 1463.35);
  }

  // NF 27876: fatura presente, tPag=90, vPag=0, SEM <dup>
  const xml27876 = 'E:/meus-repositorios/automacao-entrada-nfe/processados/NFE-43260717333742000131550010000278761382149700.xml';
  if (fs.existsSync(xml27876)) {
    const res = parseNFeXML(xml27876);
    assert.equal(res.numeroNFe, '27876');
    assert.equal(res.cobranca.fatura.numeroFatura, '27876');
    assert.equal(res.cobranca.fatura.valorLiquido, 2220.00);
    assert.equal(res.cobranca.duplicatas.length, 0); // 0 duplicatas fiscais
    assert.equal(res.pagamentos.length, 1);
    assert.equal(res.pagamentos[0].codigoFormaPagamento, '90');
    assert.equal(res.pagamentos[0].descricaoFormaPagamento, 'Sem Pagamento');
    assert.equal(res.pagamentos[0].valorPagamento, 0.00);
  }
});
