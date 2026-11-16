import {app, escape, notice, report} from './ui.js';
import {storefrontTheme} from './storefront-theme.js';
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
      '<label class="theme-color">Cor da vitrine<input name="siteColor" type="color" value="' + escape(settings.color || '#6B5140') + '"></label>' +
      '<label class="theme-opacity"><span>Opacidade da cor <output id="opacity-value"></output></span>' +
      '<input name="colorOpacity" type="range" min="0" max="100" step="1" value="' + escape(settings.colorOpacity ?? 100) + '"></label>' +
      '<label class="theme-color">Texto sobre a cor da vitrine<select name="textColor">' +
      [['auto','Automática'],['black','Preto'],['white','Branco']].map(([value,label]) =>
        '<option value="' + value + '"' + (value === settings.textColor ? ' selected' : '') + '>' + label + '</option>').join('') +
      '</select></label><small>Se a combinação escolhida tiver pouco contraste, a vitrine usa a cor de texto mais legível.</small>' +
      '<div class="theme-preview" id="theme-preview">Prévia da cor e do texto</div>' +
      '<div class="grid storefront-contact-settings"><label>E-mail de contato<input name="email" type="email" maxlength="254" value="' +
      escape(settings.email) + '"></label><label>WhatsApp com código do país e DDD<input name="whatsapp" type="tel" inputmode="numeric" ' +
      'pattern="[0-9]{10,15}" maxlength="15" placeholder="5511999999999" value="' + escape(settings.whatsapp) + '"></label></div>' +
      '<div class="row"><button>Salvar identidade</button></div></form></section>' +
      images.map(asset => imageForm(asset, settings[asset.key])).join('') :
      '<p>Acesso restrito a administradores.</p>');
  bindLogout();
  if (!allowed) return;

  async function change(action, message) {
    const controls = [...app.querySelectorAll('#brand-form :is(button,input,select), #logo-form :is(button,input,select), #banner-form :is(button,input,select)')];
    controls.forEach(control => { control.disabled = true; });
    try {
      await action();
      if (isCurrent()) { await showSettings(isCurrent); if (isCurrent()) report(message); }
    } catch (error) { if (isCurrent()) report(error.message); }
    finally { controls.forEach(control => { control.disabled = false; }); }
  }

  const brand = app.querySelector('#brand-form');
  const opacityValue = app.querySelector('#opacity-value');
  const preview = app.querySelector('#theme-preview');
  function updatePreview() {
    const colorOpacity = brand.elements.colorOpacity.valueAsNumber;
    const theme = storefrontTheme({color:brand.elements.siteColor.value, colorOpacity, textColor:brand.elements.textColor.value});
    opacityValue.textContent = colorOpacity + '%';
    preview.style.backgroundColor = theme.background;
    preview.style.color = theme.foreground;
  }
  brand.addEventListener('input', updatePreview);
  brand.addEventListener('change', updatePreview);
  updatePreview();
  brand.onsubmit = event => {
    event.preventDefault();
    const name = brand.elements.siteName.value.trim();
    const color = brand.elements.siteColor.value;
    const email = brand.elements.email.value.trim();
    const whatsapp = brand.elements.whatsapp.value.trim();
    const textColor = brand.elements.textColor.value;
    const colorOpacity = brand.elements.colorOpacity.valueAsNumber;
    change(() => request(endpoint + 'identidade','PUT',{name,color,colorOpacity,textColor,email,whatsapp}), 'Identidade da vitrine salva.');
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
