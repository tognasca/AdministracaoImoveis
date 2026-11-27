import {app, root, escape, link, picture, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, sectionNav, bindSections} from './admin-ui.js';
import {menuEndpoint} from './menu.js';
import {kindSelect, standardKinds} from './property-kinds.js';
import {zoneSelect} from './property-zones.js';
import {rentalFees, listingPrice} from './rental.js';
import {mountGallery} from './gallery.js';

const fields = [
  ['code','Código',80],['source','Origem',100],['title','Título',160],['kind','Tipo de imóvel',80],
  ['district','Bairro',100],['city','Cidade',100],['zone','Zona',40],['price','Preço de venda (R$)',0],['bedrooms','Dormitórios',0],
  ['size','Área (m²)',0],['album','Link externo do álbum',2048]
];
const statuses = ['Rascunho','Publicado','Vendido','Retirado'];
export async function editor(id, isCurrent) {
  const [home, menu, kinds, availability] = await Promise.all([
    id ? request(root + '/' + encodeURIComponent(id)) : null,
    request(menuEndpoint),
    request(root + '/tipos'),
    id ? request(root+'/'+encodeURIComponent(id)+'/disponibilidade') : null
  ]);
  if (!isCurrent()) return;
  const d = home?.data ?? {status:'Rascunho', source:'Cadastro manual'};
  const visibility = status => status === 'Publicado'
    ? 'Publicado na vitrine. ' + link('Ver anúncio', 'imovel/' + id, true)
    : 'Este imóvel está fora da vitrine. Para publicar, preencha cidade, tipo e preço.';
  const sections = [
    ['Identificação e localização', ['code','source','title','kind','district','city','zone']],
    ['Características e preço', ['price','bedrooms','size']],
    ['Publicação', ['album']]
  ];
  const statusField = '<label>Status<select name="status">' + statuses.map(status =>
    '<option' + (status === d.status ? ' selected' : '') + '>' + status + '</option>').join('') + '</select></label>';
  const categoryField = '<label>Categoria da vitrine<select name="categoryId"><option value="">Sem categoria</option>' +
    menu.filter(item => item.kind === 'category').map(item => '<option value="' + escape(item.id) + '"' +
      (item.id === d.categoryId ? ' selected' : '') + '>' + escape(item.name) + (item.visible ? '' : ' (oculta no menu)') +
      '</option>').join('') + '</select></label>';
  const field = ([key,label,length]) => key === 'zone' ? '<label>'+label+zoneSelect(d.zone)+'</label>' : key === 'kind'
    ? '<label>' + label + kindSelect([...standardKinds, ...kinds], d.kind, 'Selecione o tipo') + '</label>' :
    '<label>' + label + '<input name="' + key + '" value="' + escape(d[key]) + '" ' +
    (length ? 'maxlength="' + length + '" type="' + (key === 'album' ? 'url' : 'text') + '"' :
      'type="number" min="0" step="' + (key === 'bedrooms' ? '1' : '0.01') + '"') +
    (['code','source','title'].includes(key) ? ' required' : '') + '></label>';
  const rentalFields = [['monthlyRent','Aluguel mensal'],...rentalFees];
  const rentalSection = '<section class="box"><h3>Locação</h3>' +
    '<label><input type="checkbox" name="offerRent"'+(d.rental ? ' checked' : '')+'> Disponível para locação</label>' +
    '<fieldset id="rental-fields"'+(d.rental ? '' : ' hidden disabled')+'><div class="grid">'+
    rentalFields.map(([key,label]) => '<label>'+label+' (R$)<input type="number" min="'+(key === 'monthlyRent' ? '0.01' : '0')+
      '" step="0.01" name="'+key+'" value="'+escape(d.rental?.[key])+'"'+(key === 'monthlyRent' ? ' required' : '')+'></label>').join('')+
    '</div><p>Deixe em branco despesas variáveis ou ainda sem valor informado. Para oferecer somente aluguel, deixe o preço de venda em branco.</p></fieldset></section>';
  const formSection = ([title,keys]) => '<section class="box"><h3>'+title+'</h3><div class="grid">'+
    fields.filter(([key]) => keys.includes(key)).map(field).join('')+
    (title === 'Publicação' ? statusField+categoryField : '')+'</div>'+
    (title === 'Publicação' ? '<p id="visibility">'+visibility(d.status)+'</p>' : '')+'</section>';
  const sectionsNav = [['property-data','Dados'],['property-photos','Fotos'],['property-offer','Venda e locação'],['property-history','Histórico']];
  if (home) sectionsNav.splice(3,0,['property-availability','Disponibilidade']);
  app.innerHTML = adminNav()+'<p><a href="/#admin">← Meus imóveis</a></p><div class="box property-editor-summary">'+
    (home ? picture(home,home.photos[0]) : '')+'<div><h1 id="editor-title">' + escape(home ? d.title : 'Novo imóvel') + '</h1>'+
    (home ? '<p id="editor-location">'+escape([d.code,d.district,d.city].filter(Boolean).join(' · '))+'</p><strong id="editor-price">'+
      listingPrice(d)+'</strong> <span class="admin-chip" id="editor-status">'+escape(d.status)+'</span>' : '')+
    '</div></div>'+notice+sectionNav(sectionsNav)+
    '<form id="editor"><div id="property-data">'+formSection(sections[0])+
    '<section class="box"><h3>Observações internas</h3><label for="property-notes">Observações</label>'+
    '<textarea id="property-notes" name="notes" rows="4" maxlength="2000">'+escape(d.notes)+'</textarea></section></div>'+
    '<div id="property-offer">'+formSection(sections[1])+rentalSection+formSection(sections[2])+'</div></form>'+
    '<div id="property-photos">'+(home ? '<section class="box" id="gallery"></section>' : '<p>Salve o cadastro para adicionar as fotos.</p>')+'</div>'+
    '<div id="property-history">'+(home ? '<details class="box" id="price-history"><summary>Histórico de preços</summary><div aria-live="polite"></div></details>' :
      '<p>O histórico fica disponível após o primeiro cadastro.</p>')+'</div>'+
    (home ? '<div id="property-availability"></div>' : '')+
    '<div class="workspace-action-bar"><button form="editor">Salvar imóvel</button><button form="editor" type="submit" value="publish" id="publish"'+
    (d.status === 'Publicado' ? ' hidden' : '')+'>Salvar e publicar</button></div>';
  bindLogout();
  const selectSection = bindSections(app.querySelector('.workspace-sections'),'property-data');
  const availabilityPath = id ? root+'/'+encodeURIComponent(id)+'/disponibilidade' : '';
  const labels = {available:'Disponível',negotiating:'Em negociação',reserved:'Reservado',closed:'Encerrado'};
  const operationLabel = {sale:'Venda',rent:'Locação'};
  const labelFor = (key,value) => value === 'closed' ? (key === 'sale' ? 'Vendido' : 'Locado') : labels[value];
  const localDate = value => {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  };
  function renderAvailability(state) {
    const panel = app.querySelector('#property-availability');
    panel.innerHTML = [['sale',d.price>0],['rent',Boolean(d.rental)]].map(([key,enabled]) => {
      const offer = state[key];
      const value = offer.availability === 'reserved' && new Date(offer.reservedUntil)<=new Date() ? 'available' : offer.availability;
      return '<section class="box"><h3>'+operationLabel[key]+'</h3>'+
        (enabled ? '<form data-operation="'+key+'"><label>Disponibilidade<select name="availability">'+
          Object.keys(labels).map(option => '<option value="'+option+'"'+(value===option?' selected':'')+'>'+
          labelFor(key,option)+'</option>').join('')+'</select></label>'+
          '<div'+(value==='reserved'?'':' hidden')+'><label>Reserva até<input type="datetime-local" name="until" required'+
          (value==='reserved'?'':' disabled')+' value="'+escape(localDate(offer.reservedUntil))+'"></label></div>'+
          '<button>Salvar disponibilidade</button></form>' : '<p>Cadastre o preço desta oferta para controlar a disponibilidade.</p>')+'</section>';
    }).join('')+'<section class="box"><h3>Histórico de disponibilidade</h3>'+
      (state.history.length ? '<ul>'+state.history.map(event=>'<li>'+escape(operationLabel[event.operation])+' · '+
        escape(labelFor(event.operation,event.availability))+' · '+escape(event.username)+' · '+
        escape(new Date(event.changed_at).toLocaleString('pt-BR'))+
        (event.reserved_until ? ' · Reserva até '+escape(new Date(event.reserved_until).toLocaleString('pt-BR')) : '')+'</li>').join('')+'</ul>' :
        '<p>Nenhuma alteração registrada.</p>')+'</section>';
    for (const form of panel.querySelectorAll('form')) {
      const {availability:status,until} = form.elements;
      status.onchange = () => { until.disabled = until.closest('div').hidden = status.value !== 'reserved'; };
      form.onsubmit = async event => {
        event.preventDefault();
        const button = form.querySelector('button');
        button.disabled = true;
        try {
          await request(availabilityPath+'/'+form.dataset.operation,'PUT',{availability:status.value,
            reservedUntil:until.disabled ? null : new Date(until.value).toISOString(),version:d.version});
          const fresh = await request(availabilityPath);
          if (!isCurrent()) return;
          d.version = fresh.version;
          renderAvailability(fresh);
          report('Disponibilidade atualizada.');
        } catch (error) { if (isCurrent()) report(error.message); }
        finally { button.disabled = false; }
      };
    }
  }
  if (availability) renderAvailability(availability);
  const history = app.querySelector('#price-history');
  const loadHistory = async () => {
    const content = history.querySelector('div');
    content.textContent = 'Carregando histórico…';
    try {
      const rows = await request(root + '/' + encodeURIComponent(id) + '/historico-precos');
      const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
      content.innerHTML = rows.length ?
        '<div class="table"><table><thead><tr><th>Data</th><th>Preço anterior</th><th>Novo preço</th><th>Importação</th></tr></thead><tbody>' +
        rows.map(row => '<tr><td>'+escape(new Date(row.changedAt).toLocaleString('pt-BR'))+'</td><td>'+
          money.format(row.previousPrice)+'</td><td>'+money.format(row.newPrice)+'</td><td>'+
          escape(row.filename ?? 'Alteração no cadastro')+'</td></tr>').join('')+'</tbody></table></div>' :
        '<p>Nenhuma alteração de preço registrada.</p>';
    } catch (error) { content.textContent = error.message; }
  };
  if (history) history.ontoggle = () => { if (history.open) loadHistory(); };
  const editorForm = app.querySelector('#editor');
  const rentalFieldset = editorForm.querySelector('#rental-fields');
  editorForm.elements.offerRent.onchange = event => {
    rentalFieldset.hidden = rentalFieldset.disabled = !event.target.checked;
  };
  editorForm.addEventListener('invalid',event => {
    const panel = event.target.closest('#property-data,#property-offer');
    if (panel?.hidden) selectSection(panel.id);
  },true);
  editorForm.onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const publish = app.querySelector('#publish');
    const buttons = app.querySelectorAll('button[form=editor]');
    const data = Object.fromEntries(new FormData(event.target));
    if (event.submitter === publish) data.status = 'Publicado';
    for (const key of ['price','bedrooms','size']) data[key] = Number(data[key]);
    data.rental = form.elements.offerRent.checked ? Object.fromEntries(rentalFields.map(([key]) =>
      [key, data[key] === '' ? null : Number(data[key])])) : null;
    for (const [key] of rentalFields) delete data[key];
    delete data.offerRent;
    data.categoryId = data.categoryId || null;
    data.version = d.version ?? 0;
    buttons.forEach(button => { button.disabled = true; });
    try {
      const created = await request(id ? root + '/' + id : root, id ? 'PUT' : 'POST', data);
      if (!isCurrent()) return;
      if (created) location.hash = 'editar/' + created.id;
      else {
        d.version++;
        d.price = data.price;
        d.rental = data.rental;
        const fresh = await request(availabilityPath);
        if (!isCurrent()) return;
        d.version = fresh.version;
        renderAvailability(fresh);
        if (history?.open) loadHistory();
        form.elements.status.value = data.status;
        app.querySelector('#editor-title').textContent = data.title;
        app.querySelector('#editor-location').textContent = [data.code,data.district,data.city].filter(Boolean).join(' · ');
        app.querySelector('#editor-price').textContent = listingPrice(data);
        app.querySelector('#editor-status').textContent = data.status;
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
