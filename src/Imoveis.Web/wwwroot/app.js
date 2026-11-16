import {mountImport} from './imports.js';
const app = document.querySelector('#app');
const root = '/api/admin/imoveis';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);
const link = (label, hash, alternate = false) =>
  '<a class="btn' + (alternate ? ' alt' : '') + '" href="#' + escape(hash) + '">' + escape(label) + '</a>';
const money = value => Number(value).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const picture = (home, photo) => photo
  ? '<img class="photo" loading="lazy" src="/media/' + escape(home.id) + '/' + escape(photo) + '" alt="Foto do imóvel">'
  : '<div class="notice">Sem foto cadastrada</div>';
const notice = '<div class="notice" role="status" id="feedback"></div>';
const report = message => { const target = document.querySelector('#feedback'); if (target) target.textContent = message; };
const problems = {403:'Acesso restrito a administradores.',401:'Entre com a senha administrativa.', 404:'Registro não encontrado.', 409:'Conflito ao gravar.', 413:'Imagem grande demais. O limite é 8 MB.', 415:'Envie uma imagem JPEG, PNG ou WebP.', 429:'Aguarde dois minutos para tentar novamente.'};
async function request(path, method = 'GET', body) {
  const headers = {'X-Imoveis-Action':'1'};
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(path, {method, body, headers});
  if (!response.ok) {
    let message = problems[response.status] || 'Não foi possível concluir a operação.';
    if ([400,409].includes(response.status)) {
      const detail = await response.json().catch(() => null);
      if (typeof detail === 'string') message = detail;
    }
    throw Object.assign(new Error(message), {status:response.status});
  }
  return response.headers.get('Content-Type')?.includes('application/json') ? response.json() : undefined;
}
let session = null;
function adminNav() {
  return '<div class="row">' + link('Meus imóveis', 'admin', true) + link('Novo imóvel', 'editar') + link('Importações', 'importar', true) + (session?.administrator ? link('Usuários', 'usuarios', true) : '') +
    '<button class="alt" id="logout">Sair</button></div>';
}
function bindLogout() {
  document.querySelector('#logout').onclick = async () => {
    try { await request('/api/admin/logout', 'POST'); location.hash = 'vitrine'; }
    catch (error) { report(error.message); }
  };
}
function login() {
  app.innerHTML = '<div class="box"><h2>Painel administrativo</h2>' + notice +
    '<form id="login"><label>Usuário<input name="username" required autocomplete="username" value="admin"></label><p></p><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><p></p><button>Entrar</button></form></div>';
  document.querySelector('#login').onsubmit = async event => {
    event.preventDefault();
    try { await request('/api/admin/login', 'POST', Object.fromEntries(new FormData(event.target))); render(); }
    catch (error) { report(error.status === 401 ? 'Usuário ou senha incorretos.' : error.message); }
  };
}
async function listing(admin, params, isCurrent) {
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const route = admin ? 'admin' : 'vitrine';
  const filters = Object.fromEntries(['kind','maxPrice','bedrooms'].map(key => [key,params.get(key) ?? '']));
  const query = next => new URLSearchParams({...filters,q,page:next});
  for (const [key,value] of Object.entries(filters)) if (!value) delete filters[key];
  const data = await request((admin ? root : '/api/imoveis') + '?' + query(page));
  if (!isCurrent()) return;
  app.innerHTML = (admin ? adminNav() + '<h2>Gestão de imóveis</h2>' :
    '<section class="hero"><h1>Encontre seu próximo imóvel</h1><p>Consulte os imóveis disponíveis para venda.</p></section>') +
    notice + '<form class="row" id="search"><label>Cidade, bairro, título ou código<input name="q" maxlength="120" value="' +
    escape(q) + '"></label>' + (admin ? '' :
      '<label>Tipo<input name="kind" maxlength="80" value="'+escape(filters.kind)+'" placeholder="Ex.: Casa"></label>'+
      '<label>Preço máximo (R$)<input name="maxPrice" type="number" min="0" step="0.01" value="'+escape(filters.maxPrice)+'"></label>'+
      '<label>Mínimo de dormitórios<input name="bedrooms" type="number" min="0" max="1000" value="'+escape(filters.bedrooms)+'"></label>') +
    '<button>Buscar</button></form><div class="grid">' +
    (data.map(home => '<article>' + picture(home, home.photos[0]) + '<p class="muted">' +
      escape(home.data.district) + ' · ' + escape(home.data.city) + '</p><h3>' + escape(home.data.title) +
      '</h3><p class="price">' + money(home.data.price) + '</p>' +
      (admin ? '<p>' + escape(home.data.code) + ' · ' + escape(home.data.status) + ' · ' + home.photos.length + '/5 fotos</p>' : '') +
      link(admin ? 'Editar cadastro' : 'Ver imóvel', (admin ? 'editar/' : 'imovel/') + home.id) + '</article>').join('') ||
      '<p>' + (q ? 'Nenhum imóvel corresponde à busca.' : 'Nenhum imóvel cadastrado para exibir.') + '</p>') +
    '</div><div class="row">' + (page > 1 ? link('Página anterior', route + '?' + query(page-1), true) : '') +
    (data.length === 30 ? link('Próxima página', route + '?' + query(page+1), true) : '') + '</div>';
  document.querySelector('#search').onsubmit = event => {
    event.preventDefault();
    location.hash = route + '?' + new URLSearchParams([...new FormData(event.target)].filter(([,value]) => value));
  };
  if (admin) bindLogout();
}
async function details(id, isCurrent) {
  const [home,settings] = await Promise.all([
    request('/api/imoveis/' + encodeURIComponent(id)),
    request('/api/vitrine/configuracao')
  ]);
  if (!isCurrent()) return;
  const d = home.data;
  app.innerHTML = link('Voltar à vitrine','vitrine',true) + '<p></p><h2>' + escape(d.title) +
    '</h2><p>' + escape(d.district) + ' · ' + escape(d.city) + '</p><div class="grid"><section>' +
    picture(home,home.photos[0]) + '<div class="grid">' + home.photos.slice(1).map(p => picture(home,p)).join('') +
    '</div></section><article><p class="price">' + money(d.price) + '</p><p>' + escape(d.kind) +
    '</p><p>' + d.bedrooms + ' dormitórios · ' + d.size + ' m²</p>' +
    (d.album && /^https?:\/\//i.test(d.album) ? '<a class="btn alt" target="_blank" rel="noopener noreferrer" href="' +
      escape(d.album) + '">Ver álbum externo</a>' : '') +
    (settings.whatsapp ? '<p></p><a class="btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/'+
      escape(settings.whatsapp)+'?text='+encodeURIComponent('Olá, gostaria de informações sobre '+d.title+' ('+d.code+').')+
      '">Falar no WhatsApp</a>' : '') + '</article></div>';
}
const fields = [
  ['code','Código',80],['source','Origem',100],['title','Título',160],['kind','Tipo de imóvel',80],
  ['district','Bairro',100],['city','Cidade',100],['price','Preço (R$)',0],['bedrooms','Dormitórios',0],
  ['size','Área (m²)',0],['album','Link externo do álbum',2048]
];
const statuses = ['Rascunho','Publicado','Vendido','Retirado'];
async function editor(id, isCurrent) {
  const home = id ? await request(root + '/' + encodeURIComponent(id)) : null;
  if (!isCurrent()) return;
  const d = home?.data ?? {status:'Rascunho', source:'Cadastro manual'};
  app.innerHTML = adminNav() + '<h2>' + (id ? 'Editar imóvel' : 'Novo imóvel') + '</h2>' + notice +
    '<form id="editor"><div class="box grid">' + fields.map(([key,label,length]) =>
      '<label>' + label + '<input name="' + key + '" value="' + escape(d[key]) + '" ' +
      (length ? 'maxlength="' + length + '" type="' + (key === 'album' ? 'url' : 'text') + '"' :
        'type="number" min="0" step="' + (key === 'bedrooms' ? '1' : '0.01') + '"') +
      (['code','source','title'].includes(key) ? ' required' : '') + '></label>').join('') +
    '<label>Status<select name="status">' + statuses.map(status =>
      '<option' + (status === d.status ? ' selected' : '') + '>' + status + '</option>').join('') +
    '</select></label></div><button>Salvar imóvel</button></form><p></p>' +
    (home ? '<section class="box" id="gallery"></section>' : '<p>Salve o cadastro para adicionar as fotos.</p>');
  bindLogout();
  document.querySelector('#editor').onsubmit = async event => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    const data = Object.fromEntries(new FormData(event.target));
    for (const key of ['price','bedrooms','size']) data[key] = Number(data[key]);
    data.version = d.version ?? 0;
    button.disabled = true;
    try {
      const created = await request(id ? root + '/' + id : root, id ? 'PUT' : 'POST', data);
      if (created) location.hash = 'editar/' + created.id;
      else { d.version++; report('Imóvel salvo.'); }
    }
    catch (error) { report(error.message); }
    finally { button.disabled = false; }
  };
  if (home) mountGallery(home);
}
function mountGallery(home) {
  const section = document.querySelector('#gallery');
  const path = root + '/' + home.id;
  section.innerHTML = '<h3>Fotos do imóvel <span class="chips">' + home.photos.length + ' de 5</span></h3><div class="grid">' +
    home.photos.map((photo,i) => '<article>' + picture(home,photo) + '<div class="row">' +
      (i === 0 ? '<span>Capa</span>' : '<button class="alt" data-cover="' + escape(photo) + '">Usar como capa</button>') +
      '<button class="alt" data-remove="' + escape(photo) + '">Remover</button></div></article>').join('') +
    '</div>' + (home.photos.length < 5 ? '<div class="row"><label>Enviar fotos<input type="file" multiple accept="image/jpeg,image/png,image/webp"></label>' +
      '<label>Tirar foto<input type="file" accept="image/*" capture="environment"></label></div>' : '');
  let busy = false;
  const update = async action => {
    if (busy) return;
    busy = true;
    section.querySelectorAll('input,button').forEach(item => item.disabled = true);
    try { await action(); report('Galeria atualizada.'); }
    catch (error) { report(error.message); }
    finally {
      try {
        home.photos = (await request(path)).photos;
        if (document.querySelector('#gallery') === section) mountGallery(home);
      } catch (error) {
        report(error.message);
        section.querySelectorAll('input,button').forEach(item => item.disabled = false);
        busy = false;
      }
    }
  };
  section.onclick = event => {
    const {cover,remove} = event.target.dataset;
    if (cover) update(() => request(path + '/fotos/' + cover + '/capa', 'PUT'));
    if (remove && confirm('Remover esta foto da galeria?')) update(() => request(path + '/fotos/' + remove, 'DELETE'));
  };
  section.onchange = event => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 5-home.photos.length) { report('Selecione até ' + (5-home.photos.length) + ' fotos.'); event.target.value=''; return; }
    if (!files.length) return;
    update(async () => {
      for (const file of files) {
        const body = new FormData();
        body.append('photo', await optimize(file), 'foto.webp');
        await request(path + '/fotos', 'POST', body);
      }
    });
  };
}
async function optimize(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw Error('Não foi possível abrir a imagem. Selecione um arquivo JPEG, PNG ou WebP.'); }
  try {
    const scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(bitmap.width*scale));
    canvas.height = Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const output = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',.84));
    if (!output) throw Error('Não foi possível preparar a foto para envio.');
    return output;
  } finally { bitmap.close(); }
}
async function staff(isCurrent) {
  const users = await request('/api/admin/usuarios');
  if (!isCurrent()) return;
  app.innerHTML = adminNav()+'<h2>Usuários do painel</h2>'+notice+
    '<section class="box"><h3>Novo usuário</h3><form id="new-user" class="grid">'+
    '<label>Usuário<input name="username" required maxlength="80"></label>'+
    '<label>Senha<input name="password" type="password" autocomplete="new-password" required minlength="16" maxlength="256"></label>'+
    '<label>Perfil<select name="role"><option>Operador</option><option>Administrador</option></select></label><button>Cadastrar</button></form></section>'+
    '<section class="box table"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th></th></tr></thead><tbody>'+
    users.map(user => '<tr><td>'+escape(user.username)+'</td><td>'+escape(user.role)+'</td><td>'+
      (user.active?'Ativo':'Inativo')+'</td><td>'+
      (['admin',session.username].includes(user.username)?'':'<button class="alt" data-user="'+escape(user.id)+'" data-active="'+
        !user.active+'">'+(user.active?'Desativar':'Ativar')+'</button>')+'</td></tr>').join('')+
    '</tbody></table></section>';
  bindLogout();
  async function perform(path, method, body, button) {
    button.disabled = true;
    try { await request(path,method,body); await staff(isCurrent); }
    catch (error) { if (isCurrent()) report(error.message); }
    finally { button.disabled = false; }
  }
  app.querySelector('#new-user').onsubmit = event => {
    event.preventDefault();
    perform('/api/admin/usuarios','POST',Object.fromEntries(new FormData(event.target)),event.target.querySelector('button'));
  };
  app.querySelectorAll('[data-user]').forEach(button => button.onclick = () =>
    perform('/api/admin/usuarios/'+button.dataset.user,'PUT',{active:button.dataset.active==='true'},button));
}
let navigation = 0;
async function render() {
  const current = ++navigation;
  const isCurrent = () => current === navigation;
  const [path,query] = location.hash.slice(1).split('?');
  const [route,id] = path.split('/');
  app.innerHTML = '<p>Carregando…</p>';
  try {
    if (['admin','editar','importar','usuarios'].includes(route)) {
      const currentSession = await request('/api/admin/session');
      if (!isCurrent()) return;
      session = currentSession;
    }
    if (route === 'usuarios') {
      await staff(isCurrent);
    } else if (route === 'importar') {
      if (isCurrent()) mountImport({app,request,escape,notice,report,adminNav,bindLogout,isCurrent});
    } else if (route === 'editar') {
      if (isCurrent()) await editor(id,isCurrent);
    } else if (route === 'admin') {
      await listing(true,new URLSearchParams(query),isCurrent);
    } else if (route === 'imovel' && id) {
      await details(id,isCurrent);
    } else {
      await listing(false,new URLSearchParams(query),isCurrent);
    }
  } catch (error) {
    if (!isCurrent()) return;
    if (error.status === 401) login();
    else app.innerHTML = '<p role="alert">' + escape(error.message) + '</p>' + link('Voltar à vitrine','vitrine',true);
  }
}
window.addEventListener('hashchange', render);
render();
