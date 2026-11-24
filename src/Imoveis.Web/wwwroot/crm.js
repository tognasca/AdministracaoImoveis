import {app,escape,notice,report} from './ui.js';
import {adminNav,bindLogout} from './admin-ui.js';
import {request} from './api.js';

const crmPath = '/api/admin/crm/leads';
const stages = [['new','Novo'],['contacted','Em contato'],['visit','Visita'],['proposal','Proposta'],['won','Fechado'],['lost','Perdido']];
const stageOptions = selected => stages.map(([value,label]) =>
  '<option value="'+value+'"'+(selected===value?' selected':'')+'>'+label+'</option>').join('');

export async function crm(isCurrent) {
  const [leads, staff] = await Promise.all([request(crmPath), request(crmPath+'/responsaveis')]);
  if (!isCurrent()) return;
  const options = selected => '<option value="">Sem responsável</option>' +
    (selected && !staff.some(user => user.id === selected) ?
      '<option value="'+escape(selected)+'" selected>Responsável inativo</option>' : '') +
    staff.map(user => '<option value="'+escape(user.id)+'"'+(selected === user.id ? ' selected' : '')+
      '>'+escape(user.username)+'</option>').join('');
  const links = lead => '<div><label>Responsável<select name="assignedTo">'+options(lead?.assignedTo)+'</select></label>'+
    '<label>Buscar imóvel por código ou título<input type="search" class="crm-property-search" maxlength="120"></label>'+
    '<button type="button" class="alt crm-property-find">Buscar imóvel</button>'+
    '<label>Imóvel vinculado<select name="propertyId"><option value="">Sem imóvel</option>'+
    (lead?.propertyId ? '<option value="'+escape(lead.propertyId)+'" selected>Imóvel atual</option>' : '')+
    '</select></label></div>';
  const formData = form => {
    const values = Object.fromEntries(new FormData(form));
    return {...values, propertyId:values.propertyId || null, assignedTo:values.assignedTo || null};
  };
  app.innerHTML = adminNav() + '<h2>CRM · Contatos interessados</h2>' + notice +
    '<p class="muted">Organize contatos, visitas e propostas sem sair do painel.</p>' +
    '<section class="box"><h3>Novo contato</h3><form id="lead-new">' +
    '<div class="grid"><label>Nome<input name="name" required maxlength="160"></label>' +
    '<label>E-mail<input name="email" type="email" maxlength="254"></label>' +
    '<label>Telefone<input name="phone" type="tel" maxlength="40"></label>' +
    '<label>Etapa<select name="status">'+stageOptions('new')+'</select></label></div>' +
    links()+'<label>Observações<textarea name="notes" maxlength="4000"></textarea></label>' +
    '<button>Adicionar contato</button></form></section>' +
    '<section class="box"><h3>Contatos ('+leads.length+')</h3>' +
    (leads.length ? '<div class="crm-list">'+leads.map(lead =>
      '<form class="crm-lead" data-id="'+escape(lead.id)+'"><div><strong>'+escape(lead.name)+'</strong>' +
      (lead.email?'<p>'+escape(lead.email)+'</p>':'') +
      (lead.phone?'<p>'+escape(lead.phone)+'</p>':'') +
      '</div><label>Etapa<select name="status">'+stageOptions(lead.status)+'</select></label>' +
      links(lead)+'<label>Observações<textarea name="notes" maxlength="4000" rows="2">'+escape(lead.notes)+'</textarea></label>' +
      '<div><button class="alt">Salvar</button>' +
      '<details class="lead-history"><summary>Histórico de etapas</summary><ol></ol></details></div></form>').join('')+'</div>' :
      '<p>Nenhum contato cadastrado.</p>')+'</section>';
  bindLogout();
  for (const button of app.querySelectorAll('.crm-property-find')) {
    const form = button.form;
    const search = form.querySelector('.crm-property-search');
    const select = form.elements.propertyId;
    button.onclick = async () => {
      if (!search.value.trim()) { report('Informe um código ou título para buscar o imóvel.'); search.focus(); return; }
      button.disabled = true;
      try {
        const items = await request('/api/admin/imoveis?q='+encodeURIComponent(search.value.trim()));
        if (!isCurrent()) return;
        const current = select.value;
        const label = select.selectedOptions[0]?.textContent;
        select.replaceChildren(new Option('Sem imóvel',''));
        if (current && !items.some(item => item.id === current)) select.add(new Option(label,current));
        for (const item of items)
          select.add(new Option(item.data.code+' · '+item.data.title,item.id));
        select.value = current;
        if (items.length) select.focus();
        else report('Nenhum imóvel encontrado com esse termo.');
      } catch (error) { if (isCurrent()) report(error.message); }
      finally { button.disabled = false; }
    };
    search.onkeydown = event => {
      if (event.key === 'Enter') { event.preventDefault(); button.click(); }
    };
  }
  const create = app.querySelector('#lead-new');
  create.onsubmit = async event => {
    event.preventDefault();
    const button=create.querySelector('button');
    button.disabled=true;
    try {
      await request(crmPath,'POST',formData(create));
      if (isCurrent()) await crm(isCurrent);
    } catch(error) { if(isCurrent()) report(error.message); }
    finally { button.disabled=false; }
  };
  for (const form of app.querySelectorAll('.crm-lead')) {
    const history = form.querySelector('.lead-history');
    const events = history.querySelector('ol');
    const loadHistory = async () => {
      if (!history.open) return;
      events.innerHTML = '<li>Carregando…</li>';
      try {
        const items = await request(crmPath+'/'+encodeURIComponent(form.dataset.id)+'/historico');
        events.innerHTML = items.length ? items.map(item =>
          '<li>'+escape(stages.find(([value]) => value === item.status)?.[1])+
          ' · '+escape(item.changedBy)+' · '+escape(new Date(item.createdAt).toLocaleString('pt-BR'))+'</li>'
        ).join('') : '<li>Nenhuma mudança registrada.</li>';
      } catch (error) { events.innerHTML = '<li>'+escape(error.message)+'</li>'; }
    };
    history.ontoggle = loadHistory;
    form.onsubmit = async event => {
      event.preventDefault();
      const lead=leads.find(item=>item.id===form.dataset.id);
      if(!lead) return;
      const button=form.querySelector('button');
      button.disabled=true;
      try {
        await request(crmPath+'/'+encodeURIComponent(lead.id),'PUT',{
          name:lead.name,email:lead.email,phone:lead.phone,...formData(form)
        });
        if(isCurrent()) {
          report('Contato atualizado.');
          await loadHistory();
        }
      } catch(error) { if(isCurrent()) report(error.message); }
      finally { button.disabled=false; }
    };
  }
}
