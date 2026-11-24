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
  const item = ([label, target, icon]) => {
    const href = target.startsWith('/') ? target : '/#' + target;
    return '<a class="workspace-link" href="' + href + '"' + (current === target ? ' aria-current="page"' : '') +
      '><span class="workspace-icon" aria-hidden="true">' + icon + '</span><span>' + label + '</span></a>';
  };
  const operations = [
    ['Meus imóveis','admin','⌂'], ['CRM','crm','◎'], ['Novo imóvel','editar','+'],
    ['Importações','/admin/importacoes','⇧'], ['Tratar PDF','pdf','▤']
  ];
  const management = [
    ['Usuários','usuarios','♙'], ['Configurações','configuracoes','⚙'], ['Menu da vitrine','menu','≡']
  ];
  return '<aside class="workspace-sidebar"><div class="workspace-top"><a href="/#admin" class="workspace-brand"><span aria-hidden="true">A</span> AdministraçãoImóveis</a>' +
    '<button class="alt" id="workspace-toggle" type="button" aria-controls="workspace-navigation" aria-expanded="false">Menu</button></div>' +
    '<nav id="workspace-navigation" aria-label="Painel administrativo"><p>Operação</p>' + operations.map(item).join('') +
    (session?.administrator ? '<p>Administração</p>' + management.map(item).join('') : '') +
    '<div class="workspace-utilities"><a class="workspace-link" href="/#vitrine">Abrir vitrine ↗</a>' +
    '<button type="button" class="alt" id="workspace-theme" aria-pressed="false">Tema escuro</button>' +
    '<button type="button" class="alt" id="logout">Sair</button></div></nav></aside>' +
    '<nav class="workspace-dock" aria-label="Atalhos do painel">' + operations.slice(0,4).map(item).join('') + '</nav>';
}

export function bindLogout() {
  const toggle = document.querySelector('#workspace-toggle');
  const nav = document.querySelector('#workspace-navigation');
  const compact = matchMedia('(max-width: 1050px)');
  const preference = (key, value) => {
    try {
      if (value !== undefined) localStorage.setItem(key,value);
      return localStorage.getItem(key);
    } catch { return null; }
  };
  const setExpanded = expanded => {
    toggle.setAttribute('aria-expanded',String(expanded));
    document.body.classList.toggle('workspace-menu-open',compact.matches && expanded);
    document.body.classList.toggle('workspace-sidebar-collapsed',!compact.matches && !expanded);
    nav.inert = !expanded;
    toggle.textContent = expanded ? 'Fechar menu' : 'Menu';
  };
  setExpanded(!compact.matches && preference('workspace-sidebar') !== 'closed');
  toggle.onclick = () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    if (!compact.matches) preference('workspace-sidebar',expanded ? 'open' : 'closed');
    setExpanded(expanded);
  };
  toggle.closest('aside').onkeydown = event => {
    if (event.key === 'Escape' && compact.matches) { setExpanded(false); toggle.focus(); }
  };
  const theme = document.querySelector('#workspace-theme');
  const setTheme = dark => {
    document.body.classList.toggle('workspace-dark',dark);
    theme.setAttribute('aria-pressed',String(dark));
    theme.textContent = dark ? 'Tema claro' : 'Tema escuro';
  };
  setTheme(preference('workspace-theme') === 'dark');
  theme.onclick = () => {
    const dark = theme.getAttribute('aria-pressed') !== 'true';
    preference('workspace-theme',dark ? 'dark' : 'light');
    setTheme(dark);
  };
  const resize = () => {
    if (!toggle.isConnected) { window.removeEventListener('resize',resize); return; }
    if (compact.matches !== wasCompact) {
      wasCompact = compact.matches;
      setExpanded(!wasCompact && preference('workspace-sidebar') !== 'closed');
    }
  };
  let wasCompact = compact.matches;
  window.addEventListener('resize',resize);
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
