import {app, escape, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, getSession} from './admin-ui.js';
import {optimizeImage} from './image.js';

const endpoint = '/api/admin/vitrine/';
const images = [
  {key:'logo', title:'Logo do site', label:'Logo', size:512},
  {key:'banner', title:'Imagem do banner principal', label:'Banner', size:1920}
];

function imageForm({key,title,label}, url) {
  return '<section class="box"><h3>' + title + '</h3>' +
    (url ? '<img class="' + key + '-preview" src="' + escape(url) + '?preview=' + Date.now() + '" alt="' + label + ' atual">' : '') +
    '<form id="' + key + '-form"><label>Selecionar imagem<input name="image" type="file" required accept="image/jpeg,image/png,image/webp"></label>' +
    '<div class="row"><button>Salvar ' + label.toLowerCase() + '</button>' +
    (url ? '<button type="button" class="alt" data-remove>Remover ' + label.toLowerCase() + '</button>' : '') +
    '</div></form></section>';
}

export async function showSettings(isCurrent) {
  const allowed = getSession()?.administrator;
  const settings = allowed ? await request('/api/vitrine/configuracao') : null;
  if (!isCurrent()) return;

  app.innerHTML = adminNav() + '<h2>Configurações da vitrine</h2>' + notice +
    (allowed ? '<section class="box"><h3>Identidade do site</h3><form id="brand-form">' +
      '<label>Nome do site<input name="siteName" required maxlength="80" value="' + escape(settings.name) + '"></label>' +
      '<div class="row"><button>Salvar nome</button></div></form></section>' +
      images.map(asset => imageForm(asset, settings[asset.key])).join('') :
      '<p>Acesso restrito a administradores.</p>');
  bindLogout();
  if (!allowed) return;

  async function change(action, message) {
    const controls = [...app.querySelectorAll('#brand-form :is(button,input), #logo-form :is(button,input), #banner-form :is(button,input)')];
    controls.forEach(control => { control.disabled = true; });
    try {
      await action();
      if (isCurrent()) { await showSettings(isCurrent); if (isCurrent()) report(message); }
    } catch (error) { if (isCurrent()) report(error.message); }
    finally { controls.forEach(control => { control.disabled = false; }); }
  }

  const brand = app.querySelector('#brand-form');
  brand.onsubmit = event => {
    event.preventDefault();
    const name = brand.elements.siteName.value.trim();
    change(() => request(endpoint + 'identidade','PUT',{name}), 'Nome do site salvo.');
  };

  for (const {key,label,size} of images) {
    const form = app.querySelector('#' + key + '-form');
    form.onsubmit = event => {
      event.preventDefault();
      const file = form.elements.image.files[0];
      if (!file) return;
      change(async () => {
        const body = new FormData();
        body.append('photo', await optimizeImage(file, size), key + '.webp');
        await request(endpoint + key, 'PUT', body);
      }, label + ' salvo.');
    };
    const remove = form.querySelector('[data-remove]');
    if (remove) remove.onclick = () => change(() => request(endpoint + key,'DELETE'), label + ' removido.');
  }
}
