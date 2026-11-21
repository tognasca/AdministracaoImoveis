import {app, root, escape, link, money, picture, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, getSession} from './admin-ui.js';

export async function adminListing(params, isCurrent) {
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query = next => new URLSearchParams({q,page:next});
  const data = await request(root + '?' + query(page));
  if (!isCurrent()) return;
  const published = data.filter(home => home.data.status === 'Publicado').length;
  const drafts = data.filter(home => home.data.status === 'Rascunho').length;
  const withoutPhotos = data.filter(home => !home.photos.length).length;
  app.innerHTML = adminNav() + '<div class="premium-heading"><div><p class="premium-eyebrow">PAINEL IMOBILIÁRIO</p><h2>Gestão de imóveis</h2><p class="muted">Acompanhe, cadastre e publique em menos etapas.</p></div><div class="premium-actions">' +
    link('Novo imóvel', 'editar') + link('Importar arquivos', '/admin/importacoes') + link('Tratar PDF', 'pdf') +
    '</div></div><section class="premium-stats" aria-label="Resumo da página atual">' +
    '<div class="premium-stat"><span>Imóveis nesta página</span><strong>' + data.length + '</strong></div>' +
    '<div class="premium-stat"><span>Publicados</span><strong>' + published + '</strong></div>' +
    '<div class="premium-stat"><span>Rascunhos</span><strong>' + drafts + '</strong></div>' +
    '<div class="premium-stat"><span>Sem fotografias</span><strong>' + withoutPhotos + '</strong></div></section>' +
    '<section class="box premium-import"><h3>Importação inteligente</h3><p>Importe planilhas e catálogos, revise os imóveis e confirme antes de salvar.</p>' +
    link('Importar arquivo', '/admin/importacoes') + '</section>' +
    notice + (getSession()?.administrator ? '<div class="row"><button class="alt" id="publish-drafts">Publicar rascunhos completos</button>' +
      '<span class="muted">Rascunhos com cidade, tipo e preço podem ir para a vitrine.</span></div>' : '') + '<form class="box filter-bar" id="search"><label>Cidade, bairro, título ou código<input name="q" maxlength="120" value="' +
    escape(q) + '"></label>' +
    '<button>Buscar</button></form><div class="premium-list-head"><h3>Seus imóveis</h3><span class="muted">' + data.length + ' nesta página</span></div><div class="property-grid">' +
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
  const publish = document.querySelector('#publish-drafts');
  if (publish) publish.onclick = async () => {
    if (!window.confirm('Publicar todos os rascunhos completos do catálogo, incluindo os de outras páginas?')) return;
    publish.disabled = true;
    try {
      const {published} = await request(root + '/publicar-rascunhos', 'POST');
      if (!isCurrent()) return;
      await adminListing(params, isCurrent);
      if (isCurrent()) report(published ? published + ' imóvel(is) publicado(s) na vitrine.' : 'Nenhum rascunho completo para publicar.');
    } catch (error) { if (isCurrent()) report(error.message); }
    finally { publish.disabled = false; }
  };
}
