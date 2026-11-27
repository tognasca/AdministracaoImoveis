import {listingPrice} from './rental.js';
import {app, root, escape, link, picture, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, getSession} from './admin-ui.js';

const heading = (title, actions) => '<div class="admin-page-heading"><h1>'+title+
  '</h1><div class="row">'+actions+'</div></div>';
const newProperty = () => link('Novo imóvel','editar');

export async function adminOverview(isCurrent) {
  const summary = await request('/api/admin/painel/resumo');
  if (!isCurrent()) return;
  const {today,agenda,activities,staff} = summary;
  const metrics = [
    ['Visitas solicitadas para hoje',today.visits,'crm?fila=todos','◎'],
    ['Propostas em aberto',today.proposals,'crm?fila=todos','▤'],
    ['Falhas de importação · 7 dias',today.importFailures,'/admin/importacoes','⇧'],
    ['Cobranças a conferir',today.overdueCharges,'locacoes','▦']
  ].filter(([,value]) => value !== null);
  const tasks = [
    ['Responder propostas',today.proposals,'crm?fila=todos','Abrir CRM'],
    ['Conferir falhas de importação',today.importFailures,'/admin/importacoes','Ver importações'],
    ['Conferir cobranças vencidas ou de hoje',today.overdueCharges,'locacoes','Ver locações']
  ].filter(([,count]) => count > 0);
  app.innerHTML = adminNav()+heading('Hoje na imobiliária',newProperty())+notice+
    '<section class="admin-metrics" aria-label="Resumo de hoje">'+metrics.map(([label,value,route,icon],index) =>
      '<a href="'+(route.startsWith('/') ? route : '/#'+route)+'" class="admin-metric"><span class="admin-metric-icon tone-'+index+'" aria-hidden="true">'+icon+
      '</span><span>'+label+'<strong>'+value.toLocaleString('pt-BR')+'</strong></span></a>').join('')+'</section>'+
    '<div class="admin-overview-grid"><section class="box admin-panel"><h2>Próximas ações</h2>'+
    (tasks.length ? '<ul class="admin-task-list">'+tasks.map(([label,count,route,action]) =>
      '<li><div><strong>'+label+'</strong><small>'+count+' pendente(s)</small></div>'+link(action,route,true)+'</li>').join('')+'</ul>' :
      '<p>Nenhuma pendência nessas categorias.</p>')+'</section>'+
    '<section class="box admin-panel"><h2>Agenda de hoje</h2>'+
    (agenda.length ? '<ul class="admin-task-list">'+agenda.map(visit => '<li><div><strong>'+escape(visit.title)+
      '</strong><small>'+escape(visit.name)+' · Visita solicitada</small></div>'+link('Abrir CRM','crm?fila=todos',true)+'</li>').join('')+'</ul>' :
      '<p>Nenhuma visita solicitada para hoje.</p>')+'</section></div>'+
    '<div class="admin-overview-grid dashboard-activity"><section class="box admin-panel"><h2>Atividade recente</h2>'+
    (activities.length ? '<ul>'+activities.map(item => '<li><a href="/#'+(item.kind === 'imovel' ? 'editar/'+encodeURIComponent(item.id) : 'crm')+
      '">'+escape(item.label)+'</a><small>'+escape(new Date(item.at).toLocaleString('pt-BR'))+'</small></li>').join('')+'</ul>' :
      '<p>Nenhuma atividade registrada.</p>')+'</section><section class="box admin-panel"><h2>Atendimento por corretor</h2>'+
    (staff.length ? '<ul>'+staff.map(user => '<li><strong>'+escape(user.username)+'</strong><small>'+
      user.assigned+' contato(s) · '+user.won+' fechado(s)</small></li>').join('')+'</ul>' : '<p>Nenhum contato atribuído.</p>')+
    '</section></div>';
  bindLogout();
}

export async function adminListing(params, isCurrent) {
  const filters = Object.fromEntries(['q','operation','status','city'].map(key => [key,params.get(key) ?? '']));
  const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
  const query = next => new URLSearchParams({...filters,page:next});
  const [data,cities] = await Promise.all([request(root+'?'+query(page)),request(root+'/cidades')]);
  if (!isCurrent()) return;
  const select = (key,label,items) => '<label>'+label+'<select name="'+key+'"><option value="">Todos</option>'+
    items.map(([value,text]) => '<option value="'+escape(value)+'"'+(value===filters[key] ? ' selected' : '')+'>'+escape(text)+'</option>').join('')+'</select></label>';
  const statusTone = {Publicado:'live',Rascunho:'draft',Vendido:'sold',Retirado:'inactive'};
  const propertyRow = home => {
    const d = home.data;
    const path = encodeURIComponent(home.id);
    const operation = d.rental ? (d.price > 0 ? 'Venda e locação' : 'Locação') : 'Venda';
    return '<tr><td class="admin-property-name"><div>'+picture(home,home.photos[0])+
      '<div><a href="/#editar/'+path+'">'+escape(d.title)+'</a><small>'+
      escape([d.code,d.district,d.city].filter(Boolean).join(' · '))+'</small></div></div></td>'+
      '<td data-label="Operação"><span class="admin-chip">'+operation+'</span></td><td data-label="Valor">'+listingPrice(d)+'</td>'+
      '<td data-label="Status"><span class="admin-chip '+(statusTone[d.status] ?? '')+'">'+escape(d.status)+'</span></td>'+
      '<td data-label="Atualização">'+(home.modifiedAt ? escape(new Date(home.modifiedAt).toLocaleDateString('pt-BR')) : '—')+'</td>'+
      '<td class="admin-property-actions"><a href="/#editar/'+path+'">Editar</a>'+
      (d.status === 'Publicado' ? '<a href="/#imovel/'+path+'">Ver na vitrine</a>' : '')+'</td></tr>';
  };
  app.innerHTML = adminNav()+heading('Meus imóveis',link('Importar','/admin/importacoes',true)+newProperty())+notice+
    '<form class="box admin-catalog-filters" id="search"><label>Buscar imóveis<input type="search" name="q" maxlength="120" value="'+
    escape(filters.q)+'" placeholder="Título, bairro ou código"></label>'+
    select('operation','Operação',[['venda','Venda'],['locacao','Locação']])+
    select('status','Status',Object.keys(statusTone).map(value => [value,value]))+
    select('city','Cidade',cities.map(city => [city,city]))+'<button>Buscar</button></form>'+
    '<section class="box admin-catalog"><div class="admin-catalog-toolbar"><span>'+data.length+' nesta página</span>'+
    (getSession()?.administrator ? '<button class="alt" id="publish-drafts">Publicar rascunhos completos</button>' : '')+'</div>'+
    (data.length ? '<table class="admin-property-table"><thead><tr><th>Imóvel</th><th>Operação</th><th>Valor</th><th>Status</th>'+
      '<th>Atualização</th><th>Ações</th></tr></thead><tbody>'+data.map(propertyRow).join('')+'</tbody></table>' :
      '<p class="admin-empty">'+(Object.values(filters).some(Boolean) ? 'Nenhum imóvel corresponde aos filtros.' : 'Nenhum imóvel cadastrado.')+'</p>')+
    '</section><div class="row">'+(page > 1 ? link('Página anterior','admin?'+query(page-1),true) : '')+
    (data.length === 30 ? link('Próxima página','admin?'+query(page+1),true) : '')+'</div>';
  app.querySelector('#search').onsubmit = event => {
    event.preventDefault();
    location.hash = 'admin?' + new URLSearchParams([...new FormData(event.target)].filter(([,value]) => value));
  };
  bindLogout();
  const publish = app.querySelector('#publish-drafts');
  if (publish) publish.onclick = async () => {
    if (!window.confirm('Publicar todos os rascunhos completos do catálogo, incluindo os de outras páginas?')) return;
    publish.disabled = true;
    try {
      const {published} = await request(root+'/publicar-rascunhos','POST');
      if (!isCurrent()) return;
      await adminListing(params,isCurrent);
      if (isCurrent()) report(published ? published+' imóvel(is) publicado(s) na vitrine.' : 'Nenhum rascunho completo para publicar.');
    } catch (error) { if (isCurrent()) report(error.message); }
    finally { publish.disabled = false; }
  };
}
