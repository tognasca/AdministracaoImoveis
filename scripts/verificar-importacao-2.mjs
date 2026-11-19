// Run with: node scripts/verificar-importacao-2.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../src/Imoveis.Web/wwwroot/pdf-rows.js', import.meta.url), 'utf8');
const {classifyPdfPages, detectPdfModel, ensurePdfCodes} =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const table = ['Código;Título;Tipo;Preço;Área;Quartos;Cidade',
  'A-100;Apartamento Centro;Apartamento;450000;75;2;Cotia',
  'A-101;Casa Jardim;Casa;890000;140;3;Cotia'].join('\n');
const generic = classifyPdfPages([table]);
assert.equal(generic.model,'generic');
assert.equal(generic.properties.length,2);
assert.equal(generic.properties[0].data.code,'A-100');
assert.equal(generic.properties[1].data.price,'890000');

const catalog = ['Empreend.    Entrega    Endereço',
  'Kazzas Teste    PRONTO    Rua Exemplo 12',
  'Metragem    Dorms    Vagas    Valor',
  '50 m²    2    1    R$ 450.000,00',
  'Empreend.    Entrega    Endereço',
  'Kallas Teste    PRONTO    Rua Exemplo 30',
  'Metragem    Dorms    Vagas    Valor',
  '75 m²    3    2    R$ 690.000,00'].join('\n');
assert.equal(detectPdfModel([catalog]),'catalog');
const rows = [{data:{title:'Apartamento Teste',size:'50',city:'Cotia'}},
  {data:{title:'Apartamento Teste',size:'75',city:'Cotia'}}];
await ensurePdfCodes(rows);
assert.notEqual(rows[0].data.code,rows[1].data.code);
const original = rows[0].data.code;
await ensurePdfCodes([{data:{title:'Apartamento Teste',size:'50',city:'Cotia'}}]).then(
  result => assert.equal(result,undefined));
assert.match(original,/^PDF-[A-F0-9]{20}$/);
console.log('Verificações de importação 2.0: OK');
