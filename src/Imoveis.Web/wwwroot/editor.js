import {app, root, escape, link, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout} from './admin-ui.js';
import {menuEndpoint} from './menu.js';
import {mountGallery} from './gallery.js';

const fields = [
  ['code','Código',80],['source','Origem',100],['title','Título',160],['kind','Tipo de imóvel',80],
  ['district','Bairro',100],['city','Cidade',100],['price','Preço (R$)',0],['bedrooms','Dormitórios',0],
  ['size','Área (m²)',0],['album','Link externo do álbum',2048]
];
const statuses = ['Rascunho','Publicado','Vendido','Retirado'];
export async function editor(id, isCurrent) {
  const [home, menu] = await Promise.all([
    id ? request(root + '/' + encodeURIComponent(id)) : null,
    request(menuEndpoint)
  ]);
  if (!isCurrent()) return;
  const d = home?.data ?? {status:'Rascunho', source:'Cadastro manual'};
  const visibility = status => status === 'Publicado'
    ? 'Publicado na vitrine. ' + link('Ver anúncio', 'imovel/' + id, true)
    : 'Este imóvel está fora da vitrine. Para publicar, preencha cidade, tipo e preço.';
  const sections = [
    ['Identificação e localização', ['code','source','title','kind','district','city']],
    ['Características e preço', ['price','bedrooms','size']],
    ['Publicação', ['album']]
  ];
  const statusField = '<label>Status<select name="status">' + statuses.map(status =>
    '<option' + (status === d.status ? ' selected' : '') + '>' + status + '</option>').join('') + '</select></label>';
  const categoryField = '<label>Categoria da vitrine<select name="categoryId"><option value="">Sem categoria</option>' +
    menu.filter(item => item.kind === 'category').map(item => '<option value="' + escape(item.id) + '"' +
      (item.id === d.categoryId ? ' selected' : '') + '>' + escape(item.name) + (item.visible ? '' : ' (oculta no menu)') +
      '</option>').join('') + '</select></label>';
  const field = ([key,label,length]) =>
    '<label>' + label + '<input name="' + key + '" value="' + escape(d[key]) + '" ' +
    (length ? 'maxlength="' + length + '" type="' + (key === 'album' ? 'url' : 'text') + '"' :
      'type="number" min="0" step="' + (key === 'bedrooms' ? '1' : '0.01') + '"') +
    (['code','source','title'].includes(key) ? ' required' : '') + '></label>';
  app.innerHTML = adminNav() + '<h2>' + (id ? 'Editar imóvel' : 'Novo imóvel') + '</h2>' + notice +
    '<form id="editor">' + sections.map(([title, keys]) => '<section class="box"><h3>' + title +
      '</h3><div class="grid">' + fields.filter(([key]) => keys.includes(key)).map(field).join('') +
      (title === 'Publicação' ? statusField + categoryField : '') + '</div>' +
      (title === 'Publicação' ? '<p id="visibility">' + visibility(d.status) + '</p>' : '') + '</section>').join('') +
    '<div class="row"><button>Salvar imóvel</button><button type="submit" value="publish" id="publish"' +
    (d.status === 'Publicado' ? ' hidden' : '') + '>Salvar e publicar</button></div></form><p></p>' +
    (home ? '<section class="box" id="gallery"></section>' : '<p>Salve o cadastro para adicionar as fotos.</p>');
  bindLogout();
  document.querySelector('#editor').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const publish = form.querySelector('#publish');
    const buttons = form.querySelectorAll('button');
    const data = Object.fromEntries(new FormData(event.target));
    if (event.submitter === publish) data.status = 'Publicado';
    for (const key of ['price','bedrooms','size']) data[key] = Number(data[key]);
    data.categoryId = data.categoryId || null;
    data.version = d.version ?? 0;
    buttons.forEach(button => { button.disabled = true; });
    try {
      const created = await request(id ? root + '/' + id : root, id ? 'PUT' : 'POST', data);
      if (!isCurrent()) return;
      if (created) location.hash = 'editar/' + created.id;
      else {
        d.version++;
        form.elements.status.value = data.status;
        publish.hidden = data.status === 'Publicado';
        form.querySelector('#visibility').innerHTML = visibility(data.status);
        report(data.status === 'Publicado' ? 'Imóvel publicado na vitrine.' : 'Imóvel salvo.');
      }
    }
    catch (error) { if (isCurrent()) report(error.message); }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  };
  if (home) mountGallery(home);
}
