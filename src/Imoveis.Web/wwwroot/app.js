import {showSettings} from './settings.js';
import {mountPdfImport} from './pdf-import.js';
import {mountImport} from './imports.js';
import {app, escape, link, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, login, setSession} from './admin-ui.js';
import {adminListing,adminOverview} from './catalog.js';
import {storefront, details} from './storefront.js';
import {editor} from './editor.js';
import {manageMenu} from './menu.js';
import {staff} from './staff.js';
import {crm} from './crm.js';
import {rentalManagement, ownerStatement} from './rental-management.js';

import {bindPublicMenu} from './public-menu.js';

const setPublicMenu = bindPublicMenu();

let navigation = 0;
async function render() {
  setPublicMenu(false);
  const current = ++navigation;
  const isCurrent = () => current === navigation;
  const [path,query] = location.hash.slice(1).split('?');
  const directRoute = {'/admin':'painel','/admin/importacoes':'importar'}[location.pathname.replace(/\/$/,'')];
  const [route,id] = (path || directRoute || '').split('/');
  const adminRoute = ['painel','admin','editar','importar','pdf','usuarios','configuracoes','menu','crm','locacoes'].includes(route);
  document.body.classList.toggle('estate-site', !adminRoute);
  document.body.classList.toggle('workspace',adminRoute);
  document.body.classList.remove('workspace-menu-open','workspace-sidebar-collapsed');
  if (adminRoute) document.title = 'Painel · AdministraçãoImóveis';
  app.innerHTML = '<div class="loading-placeholder" role="status"><span>Carregando…</span><i></i><i></i><i></i></div>';
  window.scrollTo(0, 0);
  try {
    if (adminRoute) {
      const currentSession = await request('/api/admin/session');
      if (!isCurrent()) return;
      setSession(currentSession);
    }
    if (route === 'proprietario' && id) {
      await ownerStatement(id,isCurrent);
    } else if (route === 'locacoes') {
      await rentalManagement(id,isCurrent);
    } else if (route === 'crm') {
      await crm(isCurrent,new URLSearchParams(query).get('fila') === 'todos' ? {queue:false,q:'',assignee:'',page:0} : undefined);
    } else if (route === 'menu') {
      await manageMenu(isCurrent);
    } else if (route === 'configuracoes') {
      await showSettings(isCurrent);
    } else if (route === 'usuarios') {
      await staff(isCurrent);
    } else if (route === 'pdf') {
      mountPdfImport(isCurrent);
    } else if (route === 'importar') {
      if (isCurrent()) mountImport({app,request,escape,notice,report,adminNav,bindLogout,isCurrent});
    } else if (route === 'editar') {
      if (isCurrent()) await editor(id,isCurrent);
    } else if (route === 'painel') {
      await adminOverview(isCurrent);
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
