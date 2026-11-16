import {app, root, escape, link, money, picture, notice} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout} from './admin-ui.js';

export async function adminListing(params, isCurrent) {
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query = next => new URLSearchParams({q,page:next});
  const data = await request(root + '?' + query(page));
  if (!isCurrent()) return;
  app.innerHTML = adminNav() + '<h2>Gestão de imóveis</h2>' +
    '<section class="box"><h3>Importar imóveis</h3><p>Envie um arquivo Excel, CSV ou TXT e confira os dados antes de gravar.</p>' +
    link('Importar arquivo', '/admin/importacoes') + '</section>' +
    notice + '<form class="box filter-bar" id="search"><label>Cidade, bairro, título ou código<input name="q" maxlength="120" value="' +
    escape(q) + '"></label>' +
    '<button>Buscar</button></form><div class="property-grid">' +
    (data.map(home => '<article class="property-card">' + picture(home, home.photos[0]) + '<p class="muted">' +
      escape(home.data.district) + ' · ' + escape(home.data.city) + '</p><h3>' + escape(home.data.title) +
      '</h3><p class="price">' + money(home.data.price) + '</p>' +
      '<p>' + escape(home.data.code) + ' · ' + escape(home.data.status) + ' · ' + home.photos.length + '/5 fotos</p>' +
      link('Editar cadastro', 'editar/' + home.id) +
      (home.data.status === 'Publicado' ? ' ' + link('Ver na vitrine', 'imovel/' + home.id, true) : '') +
      '</article>').join('') ||
      '<p>' + (q ? 'Nenhum imóvel corresponde à busca.' : 'Nenhum imóvel cadastrado.') + '</p>') +
    '</div><div class="row">' + (page > 1 ? link('Página anterior', 'admin?' + query(page-1), true) : '') +
    (data.length === 30 ? link('Próxima página', 'admin?' + query(page+1), true) : '') + '</div>';
  document.querySelector('#search').onsubmit = event => {
    event.preventDefault();
    location.hash = 'admin?' + new URLSearchParams([...new FormData(event.target)].filter(([,value]) => value));
  };
  bindLogout();
}
