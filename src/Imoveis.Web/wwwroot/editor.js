import {app, root, escape, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout} from './admin-ui.js';
import {mountGallery} from './gallery.js';

const fields = [
  ['code','Código',80],['source','Origem',100],['title','Título',160],['kind','Tipo de imóvel',80],
  ['district','Bairro',100],['city','Cidade',100],['price','Preço (R$)',0],['bedrooms','Dormitórios',0],
  ['size','Área (m²)',0],['album','Link externo do álbum',2048]
];
const statuses = ['Rascunho','Publicado','Vendido','Retirado'];
export async function editor(id, isCurrent) {
  const home = id ? await request(root + '/' + encodeURIComponent(id)) : null;
  if (!isCurrent()) return;
  const d = home?.data ?? {status:'Rascunho', source:'Cadastro manual'};
  const sections = [
    ['Identificação e localização', ['code','source','title','kind','district','city']],
    ['Características e preço', ['price','bedrooms','size']],
    ['Publicação', ['album']]
  ];
  const statusField = '<label>Status<select name="status">' + statuses.map(status =>
    '<option' + (status === d.status ? ' selected' : '') + '>' + status + '</option>').join('') + '</select></label>';
  const field = ([key,label,length]) =>
    '<label>' + label + '<input name="' + key + '" value="' + escape(d[key]) + '" ' +
    (length ? 'maxlength="' + length + '" type="' + (key === 'album' ? 'url' : 'text') + '"' :
      'type="number" min="0" step="' + (key === 'bedrooms' ? '1' : '0.01') + '"') +
    (['code','source','title'].includes(key) ? ' required' : '') + '></label>';
  app.innerHTML = adminNav() + '<h2>' + (id ? 'Editar imóvel' : 'Novo imóvel') + '</h2>' + notice +
    '<form id="editor">' + sections.map(([title, keys]) => '<section class="box"><h3>' + title +
      '</h3><div class="grid">' + fields.filter(([key]) => keys.includes(key)).map(field).join('') +
      (title === 'Publicação' ? statusField : '') + '</div></section>').join('') +
    '<button>Salvar imóvel</button></form><p></p>' +
    (home ? '<section class="box" id="gallery"></section>' : '<p>Salve o cadastro para adicionar as fotos.</p>');
  bindLogout();
  document.querySelector('#editor').onsubmit = async event => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    const data = Object.fromEntries(new FormData(event.target));
    for (const key of ['price','bedrooms','size']) data[key] = Number(data[key]);
    data.version = d.version ?? 0;
    button.disabled = true;
    try {
      const created = await request(id ? root + '/' + id : root, id ? 'PUT' : 'POST', data);
      if (created) location.hash = 'editar/' + created.id;
      else { d.version++; report('Imóvel salvo.'); }
    }
    catch (error) { report(error.message); }
    finally { button.disabled = false; }
  };
  if (home) mountGallery(home);
}
