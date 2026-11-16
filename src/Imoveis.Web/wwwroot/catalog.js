import {app, root, escape, link, money, picture, notice} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout} from './admin-ui.js';

export async function listing(admin, params, isCurrent) {
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const route = admin ? 'admin' : 'vitrine';
  const filters = Object.fromEntries(['kind','maxPrice','bedrooms'].map(key => [key,params.get(key) ?? '']));
  const query = next => new URLSearchParams({...filters,q,page:next});
  for (const [key,value] of Object.entries(filters)) if (!value) delete filters[key];
  const [data, settings] = await Promise.all([
    request((admin ? root : '/api/imoveis') + '?' + query(page)),
    admin ? null : request('/api/vitrine/configuracao')
  ]);
  if (!isCurrent()) return;
  app.innerHTML = (admin ? adminNav() + '<h2>Gestão de imóveis</h2>' :
    '<section class="hero">'+(settings?.banner ? '<img class="hero-image" src="'+escape(settings.banner)+'" alt="" fetchpriority="high">' : '')+
    '<div class="hero-content"><h1>Encontre seu próximo imóvel</h1><p>Consulte os imóveis disponíveis para venda.</p></div></section>') +
    (admin ? '<section class="box"><h3>Importar imóveis</h3><p>Envie um arquivo Excel, CSV ou TXT e confira os dados antes de gravar.</p>' + link('Importar arquivo', '/admin/importacoes') + '</section>' : '') +
    notice + '<form class="box filter-bar" id="search"><label>Cidade, bairro, título ou código<input name="q" maxlength="120" value="' +
    escape(q) + '"></label>' + (admin ? '' :
      '<label>Tipo<input name="kind" maxlength="80" value="'+escape(filters.kind)+'" placeholder="Ex.: Casa"></label>'+
      '<label>Preço máximo (R$)<input name="maxPrice" type="number" min="0" step="0.01" value="'+escape(filters.maxPrice)+'"></label>'+
      '<label>Mínimo de dormitórios<input name="bedrooms" type="number" min="0" max="1000" value="'+escape(filters.bedrooms)+'"></label>') +
    '<button>Buscar</button></form><div class="property-grid">' +
    (data.map(home => '<article class="property-card">' + picture(home, home.photos[0]) + '<p class="muted">' +
      escape(home.data.district) + ' · ' + escape(home.data.city) + '</p><h3>' + escape(home.data.title) +
      '</h3><p class="price">' + money(home.data.price) + '</p>' +
      (admin ? '<p>' + escape(home.data.code) + ' · ' + escape(home.data.status) + ' · ' + home.photos.length + '/5 fotos</p>' : '') +
      link(admin ? 'Editar cadastro' : 'Ver imóvel', (admin ? 'editar/' : 'imovel/') + home.id) + '</article>').join('') ||
      '<p>' + (q ? 'Nenhum imóvel corresponde à busca.' : 'Nenhum imóvel cadastrado para exibir.') + '</p>') +
    '</div><div class="row">' + (page > 1 ? link('Página anterior', route + '?' + query(page-1), true) : '') +
    (data.length === 30 ? link('Próxima página', route + '?' + query(page+1), true) : '') + '</div>';
  document.querySelector('#search').onsubmit = event => {
    event.preventDefault();
    location.hash = route + '?' + new URLSearchParams([...new FormData(event.target)].filter(([,value]) => value));
  };
  if (admin) bindLogout();
}
export async function details(id, isCurrent) {
  const [home,settings] = await Promise.all([
    request('/api/imoveis/' + encodeURIComponent(id)),
    request('/api/vitrine/configuracao')
  ]);
  if (!isCurrent()) return;
  const d = home.data;
  app.innerHTML = link('Voltar à vitrine','vitrine',true) + '<h2 class="detail-title">' + escape(d.title) +
    '</h2><p>' + escape(d.district) + ' · ' + escape(d.city) + '</p><div class="property-detail"><section>' +
    picture(home,home.photos[0]) + '<div class="detail-thumbs">' + home.photos.slice(1).map(p => picture(home,p)).join('') +
    '</div></section><article><p class="price">' + money(d.price) + '</p><p>' + escape(d.kind) +
    '</p><p>' + d.bedrooms + ' dormitórios · ' + d.size + ' m²</p>' +
    (d.album && /^https?:\/\//i.test(d.album) ? '<a class="btn alt" target="_blank" rel="noopener noreferrer" href="' +
      escape(d.album) + '">Ver álbum externo</a>' : '') +
    (settings.whatsapp ? '<p></p><a class="btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/'+
      escape(settings.whatsapp)+'?text='+encodeURIComponent('Olá, gostaria de informações sobre '+d.title+' ('+d.code+').')+
      '">Falar no WhatsApp</a>' : '') + '</article></div>';
}
