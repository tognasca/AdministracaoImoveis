import {app, escape, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, getSession} from './admin-ui.js';

export async function staff(isCurrent) {
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
      (['admin',getSession().username].includes(user.username)?'':'<button class="alt" data-user="'+escape(user.id)+'" data-active="'+
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
