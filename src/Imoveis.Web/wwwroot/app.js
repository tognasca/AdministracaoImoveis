import {showSettings} from './settings.js';
import {mountImport} from './imports.js';
import {app, escape, link, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, login, setSession} from './admin-ui.js';
import {adminListing} from './catalog.js';
import {storefront, details} from './storefront.js';
import {editor} from './editor.js';
import {manageMenu} from './menu.js';
import {staff} from './staff.js';

let navigation = 0;
async function render() {
  const current = ++navigation;
  const isCurrent = () => current === navigation;
  const [path,query] = location.hash.slice(1).split('?');
  const directRoute = {'/admin':'admin','/admin/importacoes':'importar'}[location.pathname.replace(/\/$/,'')];
  const [route,id] = (path || directRoute || '').split('/');
  const adminRoute = ['admin','editar','importar','usuarios','configuracoes','menu'].includes(route);
  document.body.classList.toggle('estate-site', !adminRoute);
  app.innerHTML = '<p>Carregando…</p>';
  window.scrollTo(0, 0);
  try {
    if (adminRoute) {
      const currentSession = await request('/api/admin/session');
      if (!isCurrent()) return;
      setSession(currentSession);
    }
    if (route === 'menu') {
      await manageMenu(isCurrent);
    } else if (route === 'configuracoes') {
      await showSettings(isCurrent);
    } else if (route === 'usuarios') {
      await staff(isCurrent);
    } else if (route === 'importar') {
      if (isCurrent()) mountImport({app,request,escape,notice,report,adminNav,bindLogout,isCurrent});
    } else if (route === 'editar') {
      if (isCurrent()) await editor(id,isCurrent);
    } else if (route === 'admin') {
      await adminListing(new URLSearchParams(query),isCurrent);
    } else if (route === 'imovel' && id) {
      await details(id,isCurrent);
    } else {
      await storefront(new URLSearchParams(query),isCurrent);
    }
  } catch (error) {
    if (!isCurrent()) return;
    if (error.status === 401) login(render);
    else app.innerHTML = '<p role="alert">' + escape(error.message) + '</p>' + link('Voltar à vitrine','vitrine',true);
  }
}
window.addEventListener('hashchange', render);
render();
