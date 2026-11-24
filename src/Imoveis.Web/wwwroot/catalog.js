import {app, root, escape, link, money, picture, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, getSession} from './admin-ui.js';

export async function adminListing(params, isCurrent) {
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query = next => new URLSearchParams({q,page:next});
  const [data, summary] = await Promise.all([
    request(root + '?' + query(page)),
    request('/api/admin/painel/resumo').catch(() => null)
  ]);
  if (!isCurrent()) return;
  const metrics = summary ? [
    ['Total de imóveis',summary.total], ['Na vitrine',summary.published], ['Vendidos',summary.sold], ['Rascunhos',summary.drafts],
    ['Leads recebidos',summary.leads], ['Etapa de visita',summary.visits], ['Propostas',summary.proposals],
    ['Conversão de leads',summary.leads ? new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(summary.won/summary.leads) : '—']
  ] : [];
  const metricGroup = (label,items) => '<section class="dashboard-metric-group"><h3>'+label+'</h3><div class="premium-stats">'+
    items.map(([title,value]) => '<div class="premium-stat"><span>'+title+'</span><strong>'+
      (typeof value === 'number' ? value.toLocaleString('pt-BR') : value)+'</strong></div>').join('')+'</div></section>';
  app.innerHTML = adminNav() + '<div class="premium-heading"><div><h2>Gestão de imóveis</h2></div><div class="premium-actions">' +
    link('Novo imóvel', 'editar') + link('Importar arquivos', '/admin/importacoes', true) +
    '</div></div>' +
    (summary ? '<div class="dashboard-overview" aria-label="Resumo da imobiliária">'+
      metricGroup('Carteira de imóveis',metrics.slice(0,4))+metricGroup('Atendimento comercial',metrics.slice(4))+'</div>' :
      '<p role="status">O resumo da imobiliária está indisponível.</p>') +
    notice + (getSession()?.administrator ? '<div class="row"><button class="alt" id="publish-drafts">Publicar rascunhos completos</button>' +
      '<span class="muted">Rascunhos com cidade, tipo e preço podem ir para a vitrine.</span></div>' : '') + '<form class="box filter-bar" id="search"><label>Cidade, bairro, título ou código<input name="q" maxlength="120" value="' +
    escape(q) + '"></label>' +
    '<button>Buscar</button></form><div class="premium-list-head"><h3>Seus imóveis</h3><span class="muted">' + data.length + ' nesta página</span></div><div class="property-grid">' +
    (data.map(home => '<article class="property-card"><div class="property-card-media">'+picture(home,home.photos[0])+
      '</div><div class="property-card-info"><p class="muted">'+
      [home.data.district,home.data.city].filter(Boolean).map(escape).join(' · ')+'</p><h3>'+escape(home.data.title)+'</h3>'+
      '<div class="property-card-meta"><span class="chips">'+escape(home.data.status)+'</span><small>'+
      escape(home.data.code)+' · '+home.photos.length+'/5 fotos</small></div></div><div class="property-card-value">'+
      '<p class="price">'+money(home.data.price)+'</p><div class="property-card-actions">'+link('Editar cadastro','editar/'+home.id,true)+
      (home.data.status === 'Publicado' ? ' '+link('Ver na vitrine','imovel/'+home.id,true) : '')+'</div></div></article>').join('') ||
      '<p>' + (q ? 'Nenhum imóvel corresponde à busca.' : 'Nenhum imóvel cadastrado.') + '</p>') +
    '</div><div class="row">' + (page > 1 ? link('Página anterior', 'admin?' + query(page-1), true) : '') +
    (data.length === 30 ? link('Próxima página', 'admin?' + query(page+1), true) : '') + '</div>' +
    (summary ? '<div class="grid dashboard-activity"><section class="box"><h3>Atividade recente</h3>' +
      (summary.activities.length ? '<ul>'+summary.activities.map(activity => '<li><a href="/#'+
        (activity.kind === 'imovel' ? 'editar/'+escape(activity.id) : 'crm')+'">'+escape(activity.label)+'</a><small>'+
        escape(new Date(activity.at).toLocaleString('pt-BR'))+'</small></li>').join('')+'</ul>' : '<p>Nenhuma atividade registrada.</p>')+
      '</section><section class="box"><h3>Atendimento por corretor</h3>'+
      (summary.staff.length ? '<ul>'+summary.staff.map(user => '<li><strong>'+escape(user.username)+'</strong><small>'+
        user.assigned+' contato(s) · '+user.won+' fechado(s)</small></li>').join('')+'</ul>' :
        '<p>Vincule um corretor aos contatos no CRM para acompanhar os atendimentos.</p>')+'</section></div>' : '');
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
