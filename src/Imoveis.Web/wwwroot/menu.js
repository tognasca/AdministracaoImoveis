import {app, escape, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, getSession} from './admin-ui.js';

export const menuEndpoint = '/api/admin/vitrine/menu';

const labels = {category:'Categoria de imóveis', gallery:'Galeria de fotos', contact:'Contato por WhatsApp'};

function itemForm(item) {
  return '<form class="box menu-item-form" data-id="' + escape(item.id) + '">' +
    '<h3>' + (item.id ? labels[item.kind] : 'Nova categoria') + '</h3><div class="grid">' +
    '<label>Nome no menu<input name="name" value="' + escape(item.name) + '" maxlength="48" required></label>' +
    '<label>Posição no menu<input name="position" type="number" min="0" max="999" required value="' + item.position + '"></label>' +
    '</div><div class="row"><label class="menu-visible"><input type="checkbox" name="visible"' +
    (item.visible ? ' checked' : '') + '> Mostrar no menu público</label>' +
    '<button>' + (item.id ? 'Salvar item' : 'Criar categoria') + '</button></div></form>';
}

export async function manageMenu(isCurrent) {
  const allowed = getSession()?.administrator;
  const items = allowed ? await request(menuEndpoint) : [];
  if (!isCurrent()) return;
  const nextPosition = Math.min(999, Math.max(0, ...items.map(item => item.position)) + 10);
  app.innerHTML = adminNav() + '<h2>Menu da vitrine</h2>' + notice + (allowed ?
    '<p>Os itens visíveis aparecem da menor para a maior posição. Atribua a categoria ao editar o imóvel.</p>' +
    itemForm({position:nextPosition, visible:true}) + items.map(itemForm).join('') :
    '<p>Acesso restrito a administradores.</p>');
  bindLogout();

  const forms = [...app.querySelectorAll('.menu-item-form')];
  for (const form of forms) {
    form.onsubmit = async event => {
      event.preventDefault();
      const {name, position, visible} = form.elements;
      const data = {name:name.value.trim(), position:Number(position.value), visible:visible.checked};
      const controls = forms.flatMap(current => [...current.elements]);
      controls.forEach(control => { control.disabled = true; });
      try {
        const id = form.dataset.id;
        await request(id ? menuEndpoint + '/' + id : menuEndpoint, id ? 'PUT' : 'POST', data);
        if (isCurrent()) await manageMenu(isCurrent);
        if (isCurrent()) report(id ? 'Menu atualizado.' : 'Categoria criada.');
      } catch (error) { if (isCurrent()) report(error.message); }
      finally { controls.forEach(control => { control.disabled = false; }); }
    };
  }
}
