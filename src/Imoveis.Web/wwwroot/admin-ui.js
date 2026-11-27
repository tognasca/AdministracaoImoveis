import {app, notice, report} from './ui.js';
import {request} from './api.js';

let session = null;
export function setSession(value) { session = value; }
export function getSession() { return session; }
export function adminNav() {
  const [route] = location.hash.slice(1).split('?')[0].split('/');
  const path = location.pathname.replace(/\/$/, '');
  const current = route === 'editar' ? 'admin' :
    route === 'importar' || route === 'pdf' || (!route && path === '/admin/importacoes') ? '/admin/importacoes' :
    route || 'painel';
  const item = ([label, target, icon]) => {
    const href = target.startsWith('/') ? target : '/#' + target;
    return '<a class="workspace-link" href="' + href + '"' + (current === target ? ' aria-current="page"' : '') +
      '><span class="workspace-icon" aria-hidden="true">' + icon + '</span><span>' + label + '</span></a>';
  };
  const operations = [
    ['Visão geral','painel','⌂'], ['Imóveis','admin','▦'], ['CRM','crm','◎'],
    ['Importações','/admin/importacoes','⇧']
  ];
  const management = [
    ['Gestão de locações','locacoes','▦'], ['Usuários','usuarios','♙'], ['Configurações','configuracoes','⚙'], ['Menu da vitrine','menu','≡']
  ];
  return '<aside class="workspace-sidebar"><div class="workspace-top"><a href="/#painel" class="workspace-brand"><span aria-hidden="true">A</span><strong>AdministraçãoImóveis</strong></a>' +
    '<button class="alt" id="workspace-toggle" type="button" aria-controls="workspace-navigation" aria-expanded="false"><span aria-hidden="true">☰</span></button></div>' +
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
    const label = compact.matches ? (expanded ? 'Fechar menu' : 'Menu') :
      (expanded ? 'Recolher menu lateral' : 'Expandir menu lateral');
    toggle.setAttribute('aria-label',label);
    toggle.title = label;
    toggle.firstElementChild.textContent = compact.matches ? (expanded ? '×' : '☰') : (expanded ? '‹' : '›');
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
  const logout = document.querySelector('#logout');
  logout.onclick = async () => {
    logout.disabled = true;
    try {
      await request('/api/admin/logout','POST');
      setSession(null);
      location.replace('/admin');
    } catch (error) {
      report(error.message);
      logout.disabled = false;
    }
  };
}
export function login(render) {
  setSession(null);
  app.innerHTML = '<div class="admin-signin"><div class="admin-signin-art" aria-hidden="true"><i></i><i></i><i></i></div>' +
    '<section class="admin-signin-panel" aria-labelledby="signin-title">' +
    '<a class="admin-signin-back" href="/#vitrine">← Voltar à vitrine</a>' +
    '<p class="admin-signin-brand">AdministraçãoImóveis</p><h1 id="signin-title">Acesso administrativo</h1>' + notice +
    '<form id="login"><label>Usuário<input name="username" required autocomplete="username" value="admin"></label>' +
    '<label>Senha<span class="admin-password"><input name="password" type="password" autocomplete="current-password" required>' +
    '<button type="button" class="alt" aria-pressed="false">Mostrar</button></span></label>' +
    '<button type="submit">Entrar</button></form></section></div>';
  const form = app.querySelector('#login');
  const password = form.elements.password;
  const reveal = form.querySelector('button[type=button]');
  reveal.onclick = () => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    reveal.setAttribute('aria-pressed',String(visible));
    reveal.textContent = visible ? 'Ocultar' : 'Mostrar';
  };
  const submit = form.querySelector('button[type=submit]');
  form.onsubmit = async event => {
    event.preventDefault();
    submit.disabled = true;
    try { await request('/api/admin/login','POST',Object.fromEntries(new FormData(form))); render(); }
    catch (error) { report(error.status === 401 ? 'Usuário ou senha incorretos.' : error.message); }
    finally { submit.disabled = false; }
  };
}

export function sectionNav(items) {
  return '<nav class="workspace-sections" aria-label="Seções">'+items.map(([key,label]) =>
    '<button class="alt" type="button" data-section="'+key+'" aria-controls="'+key+'">'+label+'</button>').join('')+'</nav>';
}

export function bindSections(nav, initial, container = app) {
  const buttons = [...nav.querySelectorAll('[data-section]')];
  const panels = buttons.map(button => container.querySelector('#'+button.dataset.section));
  const select = key => {
    if (!buttons.some(button => button.dataset.section === key)) key = buttons[0].dataset.section;
    buttons.forEach((button,index) => {
      const active = button.dataset.section === key;
      button.setAttribute('aria-pressed',String(active));
      panels[index].hidden = !active;
    });
    return key;
  };
  for (const button of buttons) button.onclick = () => select(button.dataset.section);
  select(initial);
  return select;
}

export async function closePropertyOffer(propertyId, operation) {
  const path = '/api/admin/imoveis/'+encodeURIComponent(propertyId)+'/disponibilidade';
  const state = await request(path);
  await request(path+'/'+operation,'PUT',{availability:'closed',version:state.version});
}
