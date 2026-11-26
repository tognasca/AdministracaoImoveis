import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../src/Imoveis.Web/wwwroot/pdf-rows.js',import.meta.url),'utf8');
const {classifyPdfPages,ensurePdfCodes,applyPdfCityDefault} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const parse = text => classifyPdfPages([text],'generic');
const line = values => values.map((v,i) => i === values.length-1 ? v : v.padEnd([12,28,20,18,18][i])).join('');
const header = line(['Código','Título','Bairro','Cidade','Valor']);
let result = parse(header+'\n'+line(['IM-1','Casa no Centro','','Cotia','R$ 380.000,00']));
assert.equal(result.properties.length,1);
assert.equal(result.properties[0].data.city,'Cotia');
assert.equal(result.properties[0].data.district,undefined);
assert.equal(result.properties[0].data.price,'380000.00');
result = parse('Valor | Dorms | Empreendimento | Metragem | Vagas | Entrega\nR$ 240,000.00 | 2 | Jardim | 185,82 m² | 1 | PRONTO');
assert.equal(result.properties.length,1);
assert.deepEqual(result.properties[0].data,{price:'240000.00',bedrooms:'2',title:'Jardim',size:'185.82',notes:'Vagas: 1\nEntrega: PRONTO'});
result = parse('Código;Tipo;Título\nIM-2;Casa;Casa no Centro');
assert.equal(result.properties[0].data.code,'IM-2');
result = parse('Título | Valor | Cidade\nCasa | 100000 | Cotia\nCidade | Valor | Título\nOsasco | 200000 | Apartamento');
assert.equal(result.properties.length,2);
assert.equal(result.properties[1].data.city,'Osasco');
assert.equal(result.properties[1].data.title,'Apartamento');
result = parse('Título | Valor | Cidade\nCasa | 100000 | Cotia\nAtendimento pelo WhatsApp');
assert.equal(result.properties.length,1);
assert.ok(result.information.some(row => row.text.includes('Atendimento')));
result = parse('Código: IM-3\nTipo: Casa\nValor: R$ 300.000,00');
assert.equal(result.properties.length,1);
assert.equal(result.properties[0].data.code,'IM-3');
const catalog = 'KALLAS KAZZAS\nEmpreend.  Entrega  Endereço\nJardim  PRONTO  Rua Central\nMETRAGEM  DORMS  VAGAS  A partir de\n24m²  1  0  R$ 240,000.00';
result = classifyPdfPages([catalog]);
assert.equal(result.model,'kallas');
assert.equal(result.properties[0].data.price,'240000.00');
console.log('OK: cabeçalhos, colunas vazias/reordenadas, números BR/US, observações, texto livre e modelo Kallas.');

const original = {title:'Jardim — 24m²',kind:'Apartamento',size:'24',bedrooms:'1',price:'240000'};
const rows = [{data:{...original}},{data:{...original}},{data:{code:'ORIGINAL-1',...original}}];
await ensurePdfCodes(rows);
assert.match(rows[0].data.code,/^PDF-[A-F0-9]{20}$/);
assert.equal(rows[1].data.code,rows[0].data.code+'-2');
assert.equal(rows[2].data.code,'ORIGINAL-1');
const changedPrice = [{data:{...original,price:'260000'}}];
await ensurePdfCodes(changedPrice);
assert.equal(changedPrice[0].data.code,rows[0].data.code);
const before = rows[0].data.code;
rows.splice(1,1);
await ensurePdfCodes(rows);
assert.equal(rows[0].data.code,before);
console.log('OK: códigos automáticos únicos na grade, preservados e estáveis após mudança de preço.');

for (const [input,expected] of [
  [{},'São Paulo'],[{city:'   '},'São Paulo'],[{city:'Cotia'},'Cotia'],
  [{location:'Centro - Osasco/SP'},'Osasco'],[{location:'Centro'},'São Paulo'],
  [{city:'Cotia',location:'Centro - Osasco/SP'},'Cotia']
]) {
  applyPdfCityDefault(input);
  assert.equal(input.city,expected);
}
console.log('OK: cidade padrão São Paulo, preservando cidade explícita ou informada na localização.');

const zonesSource = await readFile(new URL('../src/Imoveis.Web/wwwroot/property-zones.js',import.meta.url),'utf8');
const {normalizeZone,zoneSelect,standardZones} = await import('data:text/javascript;base64,'+Buffer.from(zonesSource).toString('base64'));
assert.equal(normalizeZone('Z.L.'),'Zona Leste');
assert.equal(normalizeZone('oeste'),'Zona Oeste');
assert.equal(normalizeZone('Zona Central'),'Centro');
assert.equal(standardZones.length,5);
assert.match(zoneSelect('leste'),/value="Zona Leste" selected/);
assert.ok(!zoneSelect('<script>').includes('<script>'));
result = parse('Código | Tipo | Zona | Valor\nIM-10 | Casa | Oeste | 500000');
assert.equal(result.properties[0].data.zone,'Oeste');
result = classifyPdfPages(['ZONA SUL\n'+catalog]);
assert.equal(result.properties[0].data.zone,'Zona Sul');
console.log('OK: opções da zona, aliases, dropdown seguro e leitura da seção Kallas.');

const {prepare} = await import('../src/Imoveis.Web/wwwroot/imports.js');
const zonePreview = prepare([['Z-1','Casa','Z.L.'],['Z-2','Casa','Inválida']],['code','title','zone'],[],'Teste');
assert.equal(zonePreview[0].data.zone,'Zona Leste');
assert.equal(zonePreview[1].status,'Revisar');
const priorZone = [{id:'teste',data:{code:'Z-1',title:'Casa',zone:'Zona Oeste'}}];
assert.equal(prepare([['Z-1','Casa']],['code','title'],priorZone,'Teste')[0].data.zone,'Zona Oeste');
const centerCatalog = catalog.replace('METRAGEM  DORMS','CENTRO\nMETRAGEM  DORMS');
assert.equal(classifyPdfPages([centerCatalog]).properties.length,1);
console.log('OK: zona válida na prévia e preservada ao atualizar sem coluna; Centro não elimina o empreendimento.');

const units = classifyPdfPages([
  'RENDA  VALOR\nEMPREENDIMENTO  BLOCO  UNIDADE DORM(S)  ÁREA  AVALIAÇÃO\nLIMITADOR  PROMOCIONAL\nResidencial Alameda  Torre A  0101  2  32,59  3.960,00  254.000,00  218.000,00',
  'Empreendimento  Torre  UND Dorms Perfil Sacada Vagas Regional  De :  Por :\nResidencial Alameda  OFERTA  Torre A  0101  2  HIS2  Não  0  1  R$  254.000,00  R$  211.000,00'
]);
assert.equal(units.model,'units');
assert.equal(units.properties.length,2);
const [appraisal, discount] = units.properties;
assert.equal(appraisal.data.price,'218000.00');
assert.equal(appraisal.data.size,'32.59');
assert.equal(discount.data.price,'211000.00');
assert.equal(discount.data.size,undefined);
assert.equal(discount.page,2);
assert.match(discount.data.notes,/OFERTA[\s\S]*Perfil: HIS2/);
assert.match(discount.data.title,/unidade 0101/);
await ensurePdfCodes(units.properties);
assert.equal(appraisal.data.code,discount.data.code);
console.log('OK: duas estruturas de tabelão por unidade, preço promocional e identidade entre páginas.');
