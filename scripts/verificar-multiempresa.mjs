import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {writeFile} from 'node:fs/promises';

const base = process.env.IMOVEIS_URL ?? 'http://127.0.0.1:5100';
const password = process.env.IMOVEIS_ADMIN_PASSWORD;
assert(password, 'Configure IMOVEIS_ADMIN_PASSWORD.');

const company = host => ({host, cookie:undefined});
const platformKey = process.env.IMOVEIS_PLATFORM_KEY;
assert(platformKey, 'Configure IMOVEIS_PLATFORM_KEY.');
const first = company('imoveis-ci.test');
const second = company('outra-ci.test');

async function call(tenant, path, status, method = 'GET', body, contentType = 'application/json') {
  const data = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const headers = {Host:tenant.host, 'X-Imoveis-Action':'1'};
  if (tenant.origin) headers.Origin = tenant.origin;
  if (tenant.platformKey) headers['X-Saas-Platform-Key'] = tenant.platformKey;
  if (tenant.token) headers.Authorization = 'Bearer '+tenant.token;
  if (tenant.cookie) headers.Cookie = tenant.cookie;
  if (data) {
    headers['Content-Type'] = contentType;
    headers['Content-Length'] = data.length;
  }
  const response = await new Promise((resolve,reject) => {
    const req = request(new URL(path,base), {method,headers}, async res => {
      try {
        const chunks = [];
        for await (const chunk of res) chunks.push(chunk);
        resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)});
      } catch (error) { reject(error); }
    });
    req.on('error',reject);
    req.end(data);
  });
  const message = tenant.host+' '+method+' '+path+' '+response.body.toString();
  if (Array.isArray(status)) assert(status.includes(response.status),message);
  else assert.equal(response.status,status,message);
  if (response.status === 429) return response;
  if (tenant.origin) {
    assert.equal(response.headers['access-control-allow-origin'], path.startsWith('/api/catalogo/') ? '*' : undefined);
    assert.equal(response.headers['access-control-allow-credentials'], undefined);
  }
  if (response.headers['set-cookie']) tenant.cookie = response.headers['set-cookie'][0].split(';')[0];
  return response.headers['content-type']?.includes('application/json')
    ? JSON.parse(response.body) : response.body;
}

const admin = '/api/admin';
const property = admin+'/imoveis';
const importPath = admin+'/importacoes';
const storefront = '/api/vitrine/configuracao';
const staff = admin+'/usuarios';
const crm = admin+'/crm/leads';
await call(company('nao-verificado-ci.test'),'/health',421);
await call(company('desconhecido-ci.test'),'/health',421);
await call(first,admin+'/login',204,'POST',{username:'admin',password});
await call({...second,cookie:first.cookie},admin+'/session',401);
await call(second,admin+'/login',204,'POST',{username:'admin',password});

const input = {code:'REPETIDO',source:'Integração multiempresa',title:'Casa comercial',kind:'Casa',
  district:'Centro',city:'Cotia',price:350000,bedrooms:2,size:90,status:'Publicado',version:0};
const dashboard = admin+'/painel/resumo';
const firstOverview = await call(first,dashboard,200);
const secondOverview = await call(second,dashboard,200);
const {id: firstId} = await call(first,property,201,'POST',input);
const {id: secondId} = await call(second,property,201,'POST',input);
assert.equal((await call(first,dashboard,200)).total,firstOverview.total+1);
assert.equal((await call(second,dashboard,200)).total,secondOverview.total+1);
const own = await call(first,property+'/'+firstId,200);
await call(second,property+'/'+firstId,404);
await call(second,'/api/imoveis/'+firstId,404);
await call(second,property+'/'+firstId,409,'PUT',own.data);
const exports = await call(second,admin+'/exportacoes/imoveis',200);
assert(exports.properties.some(item => item.id === secondId));
assert(!exports.properties.some(item => item.id === firstId));
assert(!(await call(second,'/api/imoveis',200)).some(item => item.id === firstId));

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGMUi6hgYGBgYmBgYGBgAAAKkADqFPYWGgAAAABJRU5ErkJggg==', 'base64');
const upload = Buffer.concat([
  Buffer.from('--photo-boundary\r\nContent-Disposition: form-data; name="photo"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n'),
  png, Buffer.from('\r\n--photo-boundary--\r\n')
]);
const multipart = 'multipart/form-data; boundary=photo-boundary';
await call(first,property+'/'+firstId+'/fotos',201,'POST',upload,multipart);
await call(second,property+'/'+firstId+'/fotos',404,'POST',upload,multipart);
const {photos:[photo]} = await call(first, property+'/'+firstId,200);
await call(first,'/media/'+firstId+'/'+photo,200);
await call(second,'/media/'+firstId+'/'+photo,404);
await call(second,property+'/'+firstId+'/fotos/'+photo,404,'DELETE');
await call(second,property+'/'+firstId+'/fotos/'+photo+'/capa',404,'PUT');

await call(first,property+'/'+firstId+'/fotos',201,'POST',upload,multipart);
const {photos: order} = await call(first,property+'/'+firstId,200);
await call(second,property+'/'+firstId+'/fotos/ordem',404,'PUT',order);
await call(first,property+'/'+firstId+'/fotos/ordem',409,'PUT',[order[0],secondId]);
await call(first,property+'/'+firstId+'/fotos/ordem',204,'PUT',[...order].reverse());
assert.deepEqual((await call(first,property+'/'+firstId,200)).photos,[...order].reverse());

const keyPath = admin+'/integracoes/catalogo/chave';
const catalogApi = '/api/v1/catalogo/imoveis';
const {token: firstToken} = await call(first,keyPath,200,'POST');
const {token: secondToken} = await call(second,keyPath,200,'POST');
const firstReader = {...company(first.host),token:firstToken};
const secondReader = {...company(second.host),token:secondToken};
await call(first,catalogApi,401);
await call({...secondReader,token:firstToken},catalogApi,401);
const catalogPage = await call(firstReader,catalogApi+'?q=Casa&kind=Casa&page=1',200);
assert.equal(catalogPage.page,1);
assert.equal(catalogPage.pageSize,30);
assert(catalogPage.properties.some(item => item.id === firstId));
assert(!catalogPage.properties.some(item => item.id === secondId));
const item = await call(firstReader,catalogApi+'/'+firstId,200);
assert(!Object.hasOwn(item,'notes'));
assert.deepEqual(await call(firstReader,item.photos[0],200),png);
await call(secondReader,item.photos[0],404);
await call(secondReader,catalogApi+'/'+firstId,404);
const {id: catalogDraftId} = await call(first,property,201,'POST',{...input,code:'RASCUNHO-API',status:'Rascunho'});
await call(firstReader,catalogApi+'/'+catalogDraftId,404);
const spec = await call(first,'/docs/catalogo/catalogo-v1.json',200);
assert(spec.paths[catalogApi]);
assert.equal(spec.components.securitySchemes.CatalogBearer.scheme,'bearer');
assert(!spec.paths[keyPath]);
await call(first,keyPath,204,'DELETE');
await call(firstReader,catalogApi,401);
const {token: renewed} = await call(first,keyPath,200,'POST');
let limited;
for (let batch = 0; batch < 13 && !limited; batch++) {
  const responses = await Promise.all(Array.from({length:20}, () =>
    call({...firstReader,token:renewed},catalogApi+'?q=sem-resultado', [200,429])));
  limited = responses.find(response => response.status === 429);
}
assert(Number(limited?.headers['retry-after']) > 0);
await call(secondReader,catalogApi,200);
await call(first,keyPath,204,'DELETE');
console.log('API autenticada: Swagger, chave por imobiliária, revogação, filtros e proteção de rascunhos e fotos.');

const firstAdmin = (await call(first,staff,200)).find(user => user.username === 'admin');
assert(!(await call(second,staff,200)).some(user => user.id === firstAdmin.id));
assert((await call(first,crm+'/responsaveis',200)).some(user => user.id === firstAdmin.id));
assert(!(await call(second,crm+'/responsaveis',200)).some(user => user.id === firstAdmin.id));
await call(second,staff+'/'+firstAdmin.id,404,'PUT',{active:false});
const lead = {name:'Contato de homologação',status:'new',propertyId:firstId,assignedTo:firstAdmin.id};
const {id:leadId} = await call(first,crm,201,'POST',lead);
await call(first,crm+'/'+leadId,204,'PUT',{...lead,status:'visit'});
await call(first,crm+'/'+leadId,204,'PUT',{...lead,status:'visit'});
assert.deepEqual((await call(first,crm+'/'+leadId+'/historico',200)).map(event => event.status),['visit','new']);
await call(second,crm+'/'+leadId+'/historico',404);
await call(second,crm,400,'POST',lead);
await call(second,crm+'/'+leadId,404,'PUT',{...lead,propertyId:secondId,assignedTo:null});
assert(!(await call(second,crm,200)).some(item => item.id === leadId));

await call(first,admin+'/vitrine/identidade',204,'PUT',{name:'Imobiliária A',whatsapp:'5511999990001'});
await call(second,admin+'/vitrine/identidade',204,'PUT',{name:'Imobiliária B',whatsapp:'5511999990002'});
await call(first,admin+'/vitrine/tema',204,'PUT',{template:'premium',accentColor:'#123456'});
await call(first,admin+'/vitrine/logo',204,'PUT',upload,multipart);
await call(first,'/media/vitrine/logo',200);
await call(second,'/media/vitrine/logo',404);
assert.equal((await call(first,storefront,200)).name,'Imobiliária A');
const config = await call(second,storefront,200);
assert.equal(config.name,'Imobiliária B');
assert.equal(config.whatsapp,'5511999990002');
assert.deepEqual(config.menu,[]);
assert.equal((await call(second,'/api/vitrine/tema',200)).template,'modern');

const theme = admin+'/vitrine/tema';
await call(first,theme+'/rascunho',204,'PUT',{template:'boutique',accentColor:'#42A083'});
const themeEditor = await call(first,theme+'/editor',200);
assert.equal(themeEditor.draft.template,'boutique');
assert.equal(themeEditor.published.template,'premium');
assert.equal((await call(second,theme+'/editor',200)).draft,null);
assert.equal((await call(first,'/api/vitrine/tema',200)).template,'premium');
await call(first,theme,204,'PUT',{template:'minimal',accentColor:'#234567'});
assert.equal((await call(first,'/api/vitrine/tema',200)).template,'minimal');
await call(first,theme+'/restaurar',204,'POST');
assert.equal((await call(first,'/api/vitrine/tema',200)).template,'premium');

const heroAdmin = admin+'/vitrine/hero/';
const heroPublic = '/media/vitrine/hero';
const heroUpload = Buffer.concat([Buffer.from('--hero-boundary\r\nContent-Disposition: form-data; name="mode"\r\n\r\nupload\r\n'+
  '--hero-boundary\r\nContent-Disposition: form-data; name="image"; filename="hero.png"\r\nContent-Type: image/png\r\n\r\n'),
  png, Buffer.from('\r\n--hero-boundary--\r\n')]);
const heroMultipart = 'multipart/form-data; boundary=hero-boundary';
const propertyHero = (id,photo) => Buffer.from(['mode=property','propertyId='+id,'photoId='+photo].join('&'));
const formContent = 'application/x-www-form-urlencoded';
await call(first,heroAdmin+'premium',204,'PUT',heroUpload,heroMultipart);
assert.equal((await call(first,heroAdmin+'premium',200)).draft,true);
assert.deepEqual(await call(first,heroAdmin+'premium/imagem',200),png);
await call(company(first.host),heroAdmin+'premium/imagem',401);
await call(first,heroPublic,404);
await call(second,heroAdmin+'premium',400,'PUT',propertyHero(firstId,photo),formContent);
await call(first,theme,204,'PUT',{template:'premium',accentColor:'#123456'});
assert.equal((await call(first,heroAdmin+'premium',200)).draft,false);
assert.deepEqual(await call(first,heroPublic,200),png);
assert.equal((await call(first,storefront,200)).banner,heroPublic);
await call(second,heroPublic,404);
await call(first,heroAdmin+'boutique',204,'PUT',propertyHero(firstId,photo),formContent);
await call(first,theme,204,'PUT',{template:'boutique',accentColor:'#123456'});
assert.deepEqual(await call(first,heroPublic,200),png);
await call(first,heroAdmin+'boutique',204,'PUT',Buffer.from('mode=default'),formContent);
assert.deepEqual(await call(first,heroPublic,200),png);
await call(first,theme,204,'PUT',{template:'boutique',accentColor:'#123456'});
await call(first,heroPublic,404);
await call(first,theme,204,'PUT',{template:'premium',accentColor:'#123456'});
console.log('Hero por modelo: upload, foto publicada, rascunho, fallback e isolamento.');
const signature = '/modelos/'+'b'.repeat(64);
assert.deepEqual(await call(first,importPath+signature,200),[]);
assert.equal((await call(second,importPath+signature,200))[0].source,'Outro tenant');
await call(first,importPath+'/historico/94001/arquivo',404);
await call(second,importPath+'/historico/94001/arquivo',200);
const firstFailures = await call(first,importPath+'/falhas',200);
await call(second,importPath+'/confirmacao',409,'POST',{
  source:input.source,filename:'outro.csv',rows:[own]
});
assert.deepEqual(await call(first,importPath+'/falhas',200),firstFailures);
const [failure] = await call(second,importPath+'/falhas',200);
assert.equal(failure.operation,'Confirmação do lote');
assert.equal(failure.status,409);
const [matched] = await call(second,importPath+'/conferencia',200,'POST',{source:input.source,codes:[input.code]});
assert.equal(matched.id,secondId);
console.log('Isolamento de duas imobiliárias verificado por domínio, sessão, imóveis, fotos, exportação, usuários, CRM, vitrine e importação.');

const operator = {...first, platformKey};
const platform = '/api/platform/imobiliarias';
const tenantInput = {
  slug:'provisionamento-ci', name:'Imobiliária provisionada', username:'admin',
  password:'nova_senha_exclusiva_de_teste_2026'
};
await call(first,platform,404,'POST',tenantInput);
await call({...second,platformKey},platform,403,'POST',tenantInput);
const {id:tenantId} = await call(operator,platform,201,'POST',tenantInput);
await call(operator,platform,409,'POST',tenantInput);
const tenantPath = platform+'/'+tenantId;
const created = company('provisionamento-ci.test');
const {dnsRecord,dnsValue} = await call(operator,tenantPath+'/dominios',200,'POST',{hostname:created.host});
assert.equal(dnsRecord,'_imoveis-saas.'+created.host);
assert.match(dnsValue,/^imoveis-verify=[0-9a-f]{64}$/);
await call(created,'/health',421);
const verification = tenantPath+'/dominios/'+created.host+'/verificacao';
await call(operator,verification,409,'POST',{dnsValue:'imoveis-verify='+('0'.repeat(64))});
await call(created,'/health',421);
await call(operator,verification,204,'POST',{dnsValue});
await call(operator,verification,409,'POST',{dnsValue});
await call(created,admin+'/login',204,'POST',{username:tenantInput.username,password:tenantInput.password});
assert.deepEqual(await call(created,'/api/imoveis',200),[]);
await call(operator,tenantPath+'/estado',204,'PUT',{status:'suspended'});
await call(created,admin+'/session',421);
await call(operator,tenantPath+'/estado',204,'PUT',{status:'active'});
await call(created,'/health',200);
console.log('Cadastro, verificação de domínio, acesso do administrador inicial e suspensão verificados.');

const catalog = '/api/catalogo/';
const publicFirst = catalog + 'legacy';
const publicSecond = catalog + 'homologacao';
const visitor = {...company(first.host), origin:'https://www.imoveissp.test'};
const {id:draftId} = await call(first,property,201,'POST',{...input,code:'RASCUNHO-EXTERNO',status:'Rascunho',notes:'Anotação interna'});
await call(first,property+'/'+draftId+'/fotos',201,'POST',upload,multipart);
const {photos:[draftPhoto]} = await call(first,property+'/'+draftId,200);
const listings = await call(visitor,publicFirst+'/imoveis',200);
assert(listings.some(item => item.id === firstId));
assert(!listings.some(item => item.id === secondId || item.id === draftId));
const {data:publicData} = await call(visitor,publicFirst+'/imoveis/'+firstId,200);
assert(!('source' in publicData || 'notes' in publicData || 'version' in publicData));
await call(visitor,publicSecond+'/imoveis/'+firstId,404);
await call(visitor,publicFirst+'/imoveis/'+draftId,404);
await call({...visitor,cookie:first.cookie},publicFirst+'/media/'+draftId+'/'+draftPhoto,404);
await call(visitor,publicFirst+'/media/'+firstId+'/'+photo,200);
await call(visitor,publicSecond+'/media/'+firstId+'/'+photo,404);
const interest = {submissionId:randomUUID(),name:'Interesse pela vitrine',phone:'(11) 99999-1234',message:'Gostaria de visitar.'};
const interestPath = '/imoveis/'+firstId+'/interesse';
await call(visitor,publicFirst+interestPath,400,'POST',{...interest,phone:null});
await call(visitor,publicSecond+interestPath,404,'POST',interest);
await call(visitor,publicFirst+'/imoveis/'+draftId+'/interesse',404,'POST',interest);
await call(visitor,publicFirst+interestPath,204,'POST',interest);
await call(company(first.host),'/api'+interestPath,204,'POST',interest);
const [interested] = (await call(first,crm,200)).filter(lead => lead.id === interest.submissionId);
assert.equal(interested.propertyId,firstId);
assert.equal(interested.notes,interest.message);
assert.equal(interested.status,'new');
assert.equal((await call(first,crm,200)).filter(lead => lead.name === interest.name).length,1);
assert(!(await call(second,crm,200)).some(lead => lead.id === interest.submissionId));
assert.equal((await call(first,crm+'/'+interested.id+'/historico',200))[0].changedBy,'Vitrine');
console.log('Captação da vitrine validada: contato, imóvel publicado, repetição e isolamento.');
const externalBrand = await call(visitor,publicFirst+'/vitrine/configuracao',200);
assert.equal(externalBrand.name,'Imobiliária A');
assert.equal(externalBrand.logo,publicFirst+'/media/vitrine/logo');
await call(visitor,externalBrand.logo,200);
assert.equal((await call(visitor,publicFirst+'/vitrine/tema',200)).template,'premium');
assert.equal((await call(visitor,publicSecond+'/vitrine/configuracao',200)).name,'Imobiliária B');
await call(operator,tenantPath+'/estado',204,'PUT',{status:'suspended'});
await call(visitor,catalog+tenantInput.slug+'/imoveis',404);
await call(visitor,catalog+'inexistente/imoveis',404);
await call(visitor,admin+'/vitrine/pacote',401);
const externalZip = await call(first,admin+'/vitrine/pacote',200);
assert.equal(externalZip.subarray(0,4).toString('hex'),'504b0304');
if (process.env.IMOVEIS_EXTERNAL_ZIP) await writeFile(process.env.IMOVEIS_EXTERNAL_ZIP,externalZip);
console.log('Catálogo externo e pacote da vitrine verificados com isolamento, mídia pública e CORS.');
