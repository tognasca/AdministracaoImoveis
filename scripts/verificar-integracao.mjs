import assert from 'node:assert/strict';

const base = process.env.IMOVEIS_URL ?? 'http://localhost:5086';
const password = process.env.IMOVEIS_ADMIN_PASSWORD;
if (!password) throw Error('Configure IMOVEIS_ADMIN_PASSWORD para executar o teste.');
let cookie;
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
assert.match(await (await call('/admin/importacoes')).text(), /src="\/app\.js"/);
await call(admin,'GET',undefined,401);
await call('/api/admin/login','POST',{username:'admin',password},204);
const code = 'VALIDACAO-'+Date.now();
const data = {code,source:'Teste de integração',title:'Imóvel de teste '+code,kind:'Casa',district:'Centro',city:'Cotia',
  price:550000,bedrooms:2,size:95,status:'Rascunho',album:'https://example.com/album',version:0,notes:'Confirmar disponibilidade antes da visita.'};
const {id} = await call(admin,'POST',data,201);
const storefront = '/api/imoveis?q=' + encodeURIComponent(code);
try {
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
  await call(admin+'/'+id+'/fotos/'+home.photos[4]+'/capa','PUT',undefined,204);
  home = await call(admin+'/'+id);
  await call(admin+'/'+id,'PUT',{...home.data,status:'Publicado'},204);
  assert((await call(storefront)).some(item => item.id === id));
  const endpoint = '/api/admin/importacoes';
  const [row] = await call(endpoint+'/conferencia','POST',{source:data.source,codes:[data.code]});
  const signature = 'a'.repeat(64);
  const original = Buffer.from('Código;Preço\n'+code+';540000','utf8');
  await call(endpoint+'/modelos/'+signature,'PUT',{source:data.source,mapping:['code','price']},204);
  await call(endpoint+'/confirmacao','POST',{source:data.source,filename:'validacao.csv',originalFile:original.toString('base64'),
    rows:[{...row,data:{...row.data,price:540000,notes:undefined}}]});
  const published = await call('/api/imoveis/'+id);
  assert((await call(storefront)).some(item => item.id === id && item.data.price === 540000));
  assert.equal(published.data.price,540000);
  assert.equal(published.data.notes ?? null,null);
  assert.equal((await call(admin+'/'+id)).data.notes,data.notes);
  assert.equal(published.data.album,data.album);
  assert.deepEqual(published.photos,home.photos);
  assert.equal(published.data.status,'Publicado');
  await call(endpoint+'/confirmacao','POST',{source:data.source,filename:'validacao.csv',rows:[row]},409);
  await call('/media/'+id+'/'+published.photos[0]);
  await call('/api/admin/logout','POST',undefined,204);
  cookie = undefined;
  await call(endpoint+'/modelos','GET',undefined,401);
  await call('/api/admin/login','POST',{username:'admin',password},204);
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
