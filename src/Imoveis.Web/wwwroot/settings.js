import {app, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, getSession} from './admin-ui.js';
import {optimizeImage} from './image.js';

export async function showSettings(isCurrent) {
  const allowed = getSession()?.administrator;
  const settings = allowed ? await request('/api/vitrine/configuracao') : null;
  if (!isCurrent()) return;
  app.innerHTML = adminNav()+'<h2>Configurações da vitrine</h2>'+notice+
    (allowed ? '<section class="box"><h3>Imagem do banner principal</h3>'+
      '<p>Escolha uma foto horizontal. A imagem será recortada para se ajustar à tela.</p>'+
      (settings.banner ? '<img class="banner-preview" src="/media/vitrine/banner?preview='+Date.now()+'" alt="Banner atual da vitrine">' :
        '<p class="muted">A vitrine está usando o fundo padrão.</p>')+
      '<form id="banner-form"><label>Selecionar imagem<input name="image" type="file" required accept="image/jpeg,image/png,image/webp"></label>'+
      '<div class="row"><button>Salvar banner</button>'+
      (settings.banner ? '<button type="button" class="alt" id="remove-banner">Remover imagem</button>' : '')+
      '</div></form></section>' : '<p>Acesso restrito a administradores.</p>');
  bindLogout();
  if (!allowed) return;
  const form = app.querySelector('#banner-form');
  const endpoint = '/api/admin/vitrine/banner';
  async function change(action, message) {
    const controls = [...form.elements];
    controls.forEach(control => { control.disabled = true; });
    try {
      await action();
      if (isCurrent()) { await showSettings(isCurrent); report(message); }
    } catch (error) { if (isCurrent()) report(error.message); }
    finally { controls.forEach(control => { control.disabled = false; }); }
  }
  form.onsubmit = event => {
    event.preventDefault();
    const file = form.elements.image.files[0];
    if (!file) return;
    change(async () => {
      const body = new FormData();
      body.append('photo',await optimizeImage(file,1920),'banner.webp');
      await request(endpoint,'PUT',body);
    },'Banner salvo.');
  };
  const remove = app.querySelector('#remove-banner');
  if (remove) remove.onclick = () => change(() => request(endpoint,'DELETE'),'Imagem removida.');
}
