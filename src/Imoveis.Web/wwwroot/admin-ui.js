import {app, link, notice, report} from './ui.js';
import {request} from './api.js';

let session = null;
export function setSession(value) { session = value; }
export function getSession() { return session; }
export function adminNav() {
  const [route,id] = location.hash.slice(1).split('?')[0].split('/');
  const path = location.pathname.replace(/\/$/, '');
  const current = route === 'editar' && id ? 'admin' :
    route === 'importar' || (!route && path === '/admin/importacoes') ? '/admin/importacoes' :
    route || 'admin';
  const item = (label, target) => {
    const selected = current === target;
    const anchor = link(label, target, !selected);
    return selected ? anchor.replace('<a ', '<a aria-current="page" ') : anchor;
  };
  return '<nav class="admin-nav" aria-label="Painel administrativo">' + item('Meus imóveis', 'admin') + item('Novo imóvel', 'editar') + item('Importações', '/admin/importacoes') + (session?.administrator ? item('Usuários', 'usuarios') + item('Configurações', 'configuracoes') + item('Menu da vitrine', 'menu') : '') +
    '<button class="alt" id="logout">Sair</button></nav>';
}
export function bindLogout() {
  document.querySelector('#logout').onclick = async () => {
    try { await request('/api/admin/logout', 'POST'); location.href = '/#vitrine'; }
    catch (error) { report(error.message); }
  };
}
export function login(render) {
  app.innerHTML = '<div class="box"><h2>Painel administrativo</h2>' + notice +
    '<form id="login"><label>Usuário<input name="username" required autocomplete="username" value="admin"></label><p></p><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><p></p><button>Entrar</button></form></div>';
  document.querySelector('#login').onsubmit = async event => {
    event.preventDefault();
    try { await request('/api/admin/login', 'POST', Object.fromEntries(new FormData(event.target))); render(); }
    catch (error) { report(error.status === 401 ? 'Usuário ou senha incorretos.' : error.message); }
  };
}
