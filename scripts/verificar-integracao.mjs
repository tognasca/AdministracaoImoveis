import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';

const base = process.env.IMOVEIS_URL ?? 'http://localhost:5086';
const password = process.env.IMOVEIS_ADMIN_PASSWORD;
if (!password) throw Error('Configure IMOVEIS_ADMIN_PASSWORD para executar o teste.');
let cookie;
const login = '/api/admin/login';
const session = '/api/admin/session';
async function call(path, method = 'GET', body, expected = 200) {
  const headers = {'X-Imoveis-Action':'1'};
  if (cookie) headers.Cookie = cookie;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(base + path, {method,body,headers});
  if (response.status !== expected) assert.fail(path+' → esperado '+expected+', recebido '+response.status+': '+await response.text());
  const candidate = response.headers.get('set-cookie');
  if (candidate) cookie = candidate.split(';')[0];
  return response.headers.get('content-type')?.includes('application/json') ? await response.json() : response;
}
const admin = '/api/admin/imoveis';
await call('/health');
assert.match(await (await call('/')).text(), /id="app"/);
const assets = '/api/vitrine/recursos';
assert.match(await (await call("/")).text(), /"\/api\/vitrine\/recursos\/js\/crm\.js": "\/api\/vitrine\/recursos\/js\/crm"/);
assert.match(await (await call(assets + "/js/crm")).text(), /export async function crm/);
for (const name of ['styles', 'storefront', 'property-detail']) {
  const response = await call(assets + '/css/' + name);
  assert.match(response.headers.get('content-type'), /^text\/css/);
}
assert.match(await (await call(assets + '/js/app')).text(), /mountPdfImport/);
await call(assets + '/js/inexistente', 'GET', undefined, 404);
await call('/api/rota-inexistente', 'GET', undefined, 404);
assert.match(await (await call('/admin/importacoes')).text(), /src="\/api\/vitrine\/recursos\/js\/app"/);
await call(admin,'GET',undefined,401);
await call(login,'POST',{username:'admin',password},204);
if (process.env.IMOVEIS_EXPECT_LEGACY_FIXTURE === '1') {
  const legacy = await call('/api/imoveis/00000000-0000-4000-8000-000000000071');
  assert.equal(legacy.data.code,'LEG-1');
  assert.equal(legacy.data.categoryId,'00000000-0000-4000-8000-000000000001');
  assert.equal((await call('/api/vitrine/configuracao')).name,'Imobiliária anterior');
  assert.equal((await call('/api/admin/importacoes/modelos/'+'c'.repeat(64)))[0].source,'Cadastro anterior');
  const entry = (await call('/api/admin/importacoes/historico')).find(item=>item.filename==='anterior.csv');
  assert.equal(await (await call('/api/admin/importacoes/historico/'+entry.id+'/arquivo')).text(),'ABC');
}
const code = 'VALIDACAO-'+Date.now();
const adminCookie = cookie;
const users = '/api/admin/usuarios';
const operator = { username: 'operador-' + code, password, role: 'Operador' };
await call(users, 'POST', operator, 204);
const staff = await call(users);
const operatorId = staff.find(user => user.username === operator.username).id;
cookie = undefined;
await call(login, 'POST', operator, 204);
const operatorCookie = cookie;
assert.equal((await call(session)).administrator, false);
await call(users, 'GET', undefined, 403);
cookie = adminCookie;
await call(users + '/' + operatorId, 'PUT', { active: false }, 204);
cookie = operatorCookie;
await call(session, 'GET', undefined, 401);
cookie = adminCookie;
await call(users + '/' + operatorId, 'PUT', { active: true }, 204);
const data = {code,source:'Teste de integração',title:'Imóvel de teste '+code,kind:'Casa',district:'Centro',city:'Cotia',zone:'Zona Oeste',
  price:550000,bedrooms:2,size:95,status:'Rascunho',album:'https://example.com/album',version:0,notes:'Confirmar disponibilidade antes da visita.'};
await call(admin,'POST',{...data,zone:'Zona inexistente'},400);
const {id} = await call(admin,'POST',data,201);
const storefront = '/api/imoveis?q=' + encodeURIComponent(code);
try {
  const leads = '/api/admin/crm/leads';
  const lead = { propertyId: id, name: code, status: 'new', assignedTo: operatorId };
  const { id: leadId } = await call(leads, 'POST', lead, 201);
  await call(leads + '/' + leadId, 'PUT', { ...lead, status: 'visit' }, 204);
  assert((await call(leads + '?status=visit')).some(item =>
    item.id === leadId && item.propertyId === id && item.assignedTo === operatorId));
  const exports = '/api/admin/exportacoes/imoveis?format=';
  assert((await call(exports + 'json')).properties.some(item => item.id === id));
  for (const format of ['csv', 'xml']) {
    assert((await (await call(exports + format)).text()).includes(code));
  }
  assert.deepEqual(await call(storefront), []);
  await call('/api/imoveis/'+id,'GET',undefined,404);
  const upload = () => {
    const form = new FormData();
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+jfcAAAAASUVORK5CYII=', 'base64');
    form.append('photo',new Blob([pixel],{type:'image/png'}),'foto.png');
    return form;
  };
  for (let i=0; i<5; i++) await call(admin+'/'+id+'/fotos','POST',upload(),201);
  await call(admin+'/'+id+'/fotos','POST',upload(),409);
  let home = await call(admin+'/'+id);
  assert.equal(home.photos.length,5);
  assert.equal(home.data.notes,data.notes);
  assert.equal(home.data.zone,data.zone);
  await call(admin+'/'+id+'/fotos/'+home.photos[4]+'/capa','PUT',undefined,204);
  home = await call(admin+'/'+id);
  await call(admin+'/'+id,'PUT',{...home.data,status:'Publicado',rental:{monthlyRent:2500}},204);
  assert((await call(storefront)).some(item => item.id === id));
  const availability = admin+'/'+id+'/disponibilidade';
  const updateOffer = async (operation,value,expect=204,reservedUntil=null) => {
    const state = await call(availability);
    await call(availability+'/'+operation,'PUT',{availability:value,version:state.version,reservedUntil},expect);
  };
  await updateOffer('rent','reserved',400);
  await updateOffer('rent','closed');
  const saleOnly = await call('/api/imoveis/'+id);
  assert.equal(saleOnly.data.price,550000);
  assert.equal(saleOnly.data.rental,null);
  const {token:catalogToken} = await call('/api/admin/integracoes/catalogo/chave','POST');
  try {
    const catalogResponse = await fetch(base+'/api/v1/catalogo/imoveis/'+id,{headers:{Authorization:'Bearer '+catalogToken}});
    assert.equal(catalogResponse.status,200);
    assert.equal((await catalogResponse.json()).rental,null);
  } finally { await call('/api/admin/integracoes/catalogo/chave','DELETE',undefined,204); }
  await updateOffer('sale','reserved',204,new Date(Date.now()+3600000).toISOString());
  await call('/api/imoveis/'+id,'GET',undefined,404);
  await updateOffer('rent','available');
  const rentOnly = await call('/api/imoveis/'+id);
  assert.equal(rentOnly.data.price,0);
  assert.equal(rentOnly.data.rental.monthlyRent,2500);
  await updateOffer('sale','available');
  const availabilityHistory = (await call(availability)).history;
  assert(availabilityHistory.some(event=>event.operation==='rent' && event.availability==='closed' && event.username==='admin'));
  const interest = '/api/imoveis/' + id + '/interesse';
  const visitId = randomUUID();
  const proposalId = randomUUID();
  const contact = {name:'Contato '+code,email:'contato@example.test'};
  await call(interest,'POST',{...contact,submissionId:visitId,requestKind:'visit',preferredVisitDate:'2099-06-20'},204);
  await call(interest,'POST',{...contact,submissionId:proposalId,requestKind:'proposal',proposalOperation:'sale',proposedPrice:525000},204);
  const requests = await call(leads+'?queue=true&q='+encodeURIComponent(code));
  assert(requests.some(lead => lead.id === visitId && lead.preferredVisitDate === '2099-06-20'));
  assert(requests.some(lead => lead.id === proposalId && lead.proposedPrice === 525000 && lead.propertyId === id));
  await call(leads+'/'+visitId+'/negociacao','POST',{action:'visit-confirmed'},204);
  await call(leads+'/'+proposalId+'/negociacao','POST',{action:'counteroffer',price:535000},204);
  assert((await call(leads+'/'+proposalId+'/historico')).some(event =>
    event.action === 'counteroffer' && event.counterofferPrice === 535000));
  const rentals = '/api/admin/locacoes';
  const contractData = {propertyId:id,ownerName:'Proprietário de integração',renterName:'Locatário de integração',
    startsOn:'2026-01-15',endsOn:'2026-12-31',monthlyRent:2000,managementFee:200,dueDay:10};
  const {id:contractId} = await call(rentals,'POST',contractData,201);
  const lease = rentals+'/'+contractId;
  try {
    await call(rentals,'POST',contractData,409);
    await call(lease+'/cobrancas','POST',{month:'2026-01-01'},409);
    await call(lease+'/vistorias/entrada','PUT',{inspectedOn:'2026-01-15',notes:'Vistoria de teste'},204);
    const inspectionPhoto = upload();
    inspectionPhoto.set('file',inspectionPhoto.get('photo'));
    inspectionPhoto.delete('photo');
    await call(lease+'/anexos/entrada','POST',inspectionPhoto,204);
    const signedDocument = new FormData();
    signedDocument.append('file',new Blob(['%PDF-1.4\n% Arquivo de teste\n'],{type:'application/pdf'}),'contrato.pdf');
    await call(lease+'/anexos/contrato','POST',signedDocument,204);
    await call(lease+'/reajustes','POST',{month:'2026-02-01',rent:2100,fee:210,reason:'Teste de reajuste'},204);
    await call(lease+'/cobrancas','POST',{month:'2026-01-01'},204);
    await call(lease+'/cobrancas','POST',{month:'2026-02-01'},204);
    await call(lease+'/cobrancas/2026-02-01/repasse','POST',{reference:'prematuro'},409);
    await call(lease+'/cobrancas/2026-02-01/pagamento','POST',{reference:'pagamento teste'},204);
    await call(lease+'/cobrancas/2026-02-01/repasse','POST',{reference:'repasse teste'},204);
    const record = await call(lease);
    assert.equal(record.charges[0].rent,2100);
    assert.equal(record.charges[1].due_on,'2026-01-15');
    assert.equal(record.inspections[0].kind,'entrada');
    const { token } = await call(lease+'/acesso-proprietario','POST');
    const staffCookie = cookie;
    let owner;
    try {
      cookie = undefined;
      await call(lease+'/anexos/'+record.attachments.find(file => file.kind === 'entrada').id,'GET',undefined,401);
      owner = await call('/api/proprietario/locacao','POST',{token});
    } finally { cookie = staffCookie; }
    await call(lease+'/anexos/'+record.attachments.find(file => file.kind === 'entrada').id);
    assert.equal(owner.charges[0].rent,2100);
    assert.equal(owner.charges[0].payment_ref,undefined);
    assert.equal(owner.renter_name,undefined);
    await call(lease+'/acesso-proprietario','DELETE',undefined,204);
    await call('/api/proprietario/locacao','POST',{token},404);
  } finally {
    await call(lease+'/encerrar','POST',undefined,204);
  }
  const endpoint = '/api/admin/importacoes';
  const [row] = await call(endpoint+'/conferencia','POST',{source:data.source,codes:[data.code]});
  assert.equal(row.data.zone,data.zone);
  const signature = 'a'.repeat(64);
  const original = Buffer.from('Código;Preço\n'+code+';540000','utf8');
  await call(endpoint+'/modelos/'+signature,'PUT',{source:data.source,mapping:['code','price']},204);
  await call(endpoint+'/confirmacao','POST',{source:data.source,filename:'validacao.csv',originalFile:original.toString('base64'),
    rows:[{...row,data:{...row.data,price:540000,notes:undefined}}]});
  const published = await call('/api/imoveis/'+id);
  assert.equal(published.data.zone,data.zone);
  assert((await call(storefront)).some(item => item.id === id && item.data.price === 540000));
  assert.equal(published.data.price,540000);
  assert.equal(published.data.notes ?? null,null);
  assert.equal((await call(admin+'/'+id)).data.notes,data.notes);
  assert.equal(published.data.album,data.album);
  assert.deepEqual(published.photos,home.photos);
  assert.equal(published.data.status,'Publicado');
  await call(endpoint+'/confirmacao','POST',{source:data.source,filename:'validacao.csv',rows:[row]},409);
  await call('/media/'+id+'/'+published.photos[0]);
  const sessionUrl = new URL(session, base);
  const get = sessionUrl.protocol === 'https:' ? httpsGet : httpGet;
  const unknownDomainStatus = await new Promise((resolve, reject) => {
    get(sessionUrl, { headers: { Host: 'unknown.imoveis-ci.test', Cookie: cookie } }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(unknownDomainStatus, 421);
  const isolated = '/api/admin/importacoes';
  assert(!(await call(isolated + '/historico')).some(item => item.filename === 'outro-tenant.csv'));
  await call(isolated + '/historico/94001/arquivo', 'GET', undefined, 404);
  assert(!(await call(isolated + '/modelos')).some(item => item.source === 'Outro tenant'));
  assert.deepEqual(await call(isolated + '/modelos/' + 'b'.repeat(64)), []);
  await call('/api/admin/logout','POST',undefined,204);
  cookie = undefined;
  await call(endpoint+'/modelos','GET',undefined,401);
  await call(login,'POST',{username:'admin',password},204);
  const models = await call(endpoint+'/modelos');
  assert(models.some(model=>model.signature===signature && model.source===data.source && model.mappedFields===2));
  const model = (await call(endpoint+'/modelos/'+signature)).find(model=>model.source===data.source);
  assert.deepEqual(model.mapping,['code','price']);
  const entry = (await call(endpoint+'/historico')).find(item=>item.filename==='validacao.csv' && item.source===data.source);
  assert(entry?.hasOriginal);
  const saved = await call(endpoint+'/historico/'+entry.id+'/arquivo');
  assert.deepEqual(Buffer.from(await saved.arrayBuffer()),original);
} finally {
  const home = await call(admin+'/'+id);
  await call(admin+'/'+id,'PUT',{...home.data,status:'Retirado'},204);
  for (const photo of home.photos) await call(admin+'/'+id+'/fotos/'+photo,'DELETE',undefined,204);
  await call('/api/imoveis/'+id,'GET',undefined,404);
  assert.deepEqual(await call(storefront), []);
}
console.log('Integração verificada: cadastro, acesso restrito, galeria, publicação, importação e retirada.');
