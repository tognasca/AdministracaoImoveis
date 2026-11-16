import {app, escape, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, getSession} from './admin-ui.js';

export const menuEndpoint = '/api/admin/vitrine/menu';

const labels = {category:'Categoria de imóveis', gallery:'Galeria de fotos', contact:'Contato por WhatsApp'};

function menuRow(item) {
  const id = escape(item.id);
  const name = escape(item.name);
  return '<tr><th scope="row">' + name + '</th><td>' + labels[item.kind] + '</td><td>' + item.position +
    '</td><td><span class="menu-status' + (item.visible ? ' is-visible' : '') + '">' +
    (item.visible ? 'Visível' : 'Oculto') + '</span></td><td><div class="menu-actions">' +
    '<button type="button" class="alt" data-edit="' + id + '" aria-label="Editar ' + name + '">Editar</button>' +
    (item.kind === 'category' ? '<button type="button" class="menu-delete" data-delete="' + id +
      '" aria-label="Excluir ' + name + '">Excluir</button>' : '') + '</div></td></tr>';
}

const editor = '<dialog id="menu-dialog" aria-labelledby="menu-dialog-title"><form id="menu-form">' +
  '<h3 id="menu-dialog-title"></h3><p class="menu-error" role="alert" hidden></p>' +
  '<div class="grid"><label>Nome no menu<input name="name" maxlength="48" required autofocus></label>' +
  '<label>Posição no menu<input name="position" type="number" min="0" max="999" required></label></div>' +
  '<label class="menu-visible"><input type="checkbox" name="visible"> Mostrar no menu público</label>' +
  '<div class="menu-dialog-actions"><button type="button" class="alt" id="menu-cancel">Cancelar</button>' +
  '<button type="submit">Salvar</button></div></form></dialog>';

export async function manageMenu(isCurrent) {
  const allowed = getSession()?.administrator;
  const items = allowed ? await request(menuEndpoint) : [];
  if (!isCurrent()) return;
  app.innerHTML = adminNav() + '<div class="menu-heading"><h2>Menu da vitrine</h2>' +
    (allowed ? '<button type="button" id="menu-new">Nova categoria</button>' : '') + '</div>' + notice +
    (allowed ? '<div class="box table menu-table"><table aria-label="Itens do menu da vitrine">' +
      '<thead><tr><th scope="col">Nome</th><th scope="col">Tipo</th><th scope="col">Posição</th>' +
      '<th scope="col">Visibilidade</th><th scope="col">Ações</th></tr></thead>' +
      '<tbody>' + (items.map(menuRow).join('') || '<tr><td colspan="5">Nenhum item cadastrado.</td></tr>') +
      '</tbody></table></div>' + editor : '<p>Acesso restrito a administradores.</p>');
  bindLogout();
  if (!allowed) return;

  const newButton = app.querySelector('#menu-new');
  const table = app.querySelector('.menu-table');
  const dialog = app.querySelector('#menu-dialog');
  const form = app.querySelector('#menu-form');
  const errorBox = form.querySelector('.menu-error');
  const controls = [...table.querySelectorAll('button'), newButton, ...form.elements];
  const nextPosition = Math.min(999, Math.max(0, ...items.map(item => item.position)) + 10);
  let selected = null;
  let busy = false;

  function open(item) {
    selected = item;
    form.querySelector('h3').textContent = item ? 'Editar item do menu' : 'Nova categoria';
    form.elements.name.value = item?.name ?? '';
    form.elements.position.value = item?.position ?? nextPosition;
    form.elements.visible.checked = item?.visible ?? true;
    errorBox.hidden = true;
    dialog.showModal();
  }

  async function change(action, message) {
    if (busy) return;
    busy = true;
    controls.forEach(control => { control.disabled = true; });
    try {
      await action();
      if (!isCurrent()) return;
      dialog.close();
      await manageMenu(isCurrent);
      if (isCurrent()) {
        report(message);
        app.querySelector('#menu-new')?.focus();
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (dialog.open) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      } else report(error.message);
    } finally {
      busy = false;
      controls.forEach(control => { control.disabled = false; });
    }
  }

  newButton.onclick = () => open(null);
  form.querySelector('#menu-cancel').onclick = () => dialog.close();
  dialog.oncancel = event => { if (busy) event.preventDefault(); };
  form.onsubmit = event => {
    event.preventDefault();
    errorBox.hidden = true;
    const {name, position, visible} = form.elements;
    const data = {name:name.value.trim(), position:Number(position.value), visible:visible.checked};
    const id = selected?.id;
    return change(() => request(id ? menuEndpoint + '/' + id : menuEndpoint, id ? 'PUT' : 'POST', data),
      id ? 'Item atualizado.' : 'Categoria criada.');
  };

  table.onclick = event => {
    const button = event.target.closest('button[data-edit], button[data-delete]');
    if (!button || busy) return;
    const item = items.find(item => item.id === (button.dataset.edit ?? button.dataset.delete));
    if (!item) return;
    if (button.dataset.edit) open(item);
    else if (window.confirm('Excluir a categoria “' + item.name + '”?'))
      return change(() => request(menuEndpoint + '/' + item.id, 'DELETE'), 'Categoria excluída.');
  };
}
