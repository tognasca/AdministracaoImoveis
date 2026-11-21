import assert from 'node:assert/strict';
import {request} from 'node:http';

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
  if (tenant.platformKey) headers['X-Saas-Platform-Key'] = tenant.platformKey;
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
  assert.equal(response.status,status,tenant.host+' '+method+' '+path+' '+response.body.toString());
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
const {id: firstId} = await call(first,property,201,'POST',input);
const {id: secondId} = await call(second,property,201,'POST',input);
const own = await call(first,property+'/'+firstId,200);
await call(second,property+'/'+firstId,404);
await call(second,'/api/imoveis/'+firstId,404);
await call(second,property+'/'+firstId,409,'PUT',own.data);
const exports = await call(second,admin+'/exportacoes/imoveis',200);
assert(exports.properties.some(item => item.id === secondId));
assert(!exports.properties.some(item => item.id === firstId));
assert(!(await call(second,'/api/imoveis',200)).some(item => item.id === firstId));

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mP8/x8AAwMCAAAAC0lEQVR42mP8/x8AAwMCAO7+jfcAAAAASUVORK5CYII=', 'base64');
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

const signature = '/modelos/'+'b'.repeat(64);
assert.deepEqual(await call(first,importPath+signature,200),[]);
assert.equal((await call(second,importPath+signature,200))[0].source,'Outro tenant');
await call(first,importPath+'/historico/94001/arquivo',404);
await call(second,importPath+'/historico/94001/arquivo',200);
await call(second,importPath+'/confirmacao',409,'POST',{
  source:input.source,filename:'outro.csv',rows:[own]
});
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
