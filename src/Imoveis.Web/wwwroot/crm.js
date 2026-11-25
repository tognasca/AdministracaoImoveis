import {app,escape,notice,report} from './ui.js';
import {adminNav,bindLogout} from './admin-ui.js';
import {request} from './api.js';

const crmPath = '/api/admin/crm/leads';
const stages = [['new','Novo'],['contacted','Em contato'],['visit','Visita'],['proposal','Proposta'],['won','Fechado'],['lost','Perdido']];
const stageOptions = selected => stages.map(([value,label]) =>
  '<option value="'+value+'"'+(selected===value?' selected':'')+'>'+label+'</option>').join('');

const pageSize = 30;
let renderVersion = 0;

function waitingSince(createdAt) {
  const minutes = Math.max(0,Math.floor((Date.now()-Date.parse(createdAt))/60000));
  if (minutes < 1) return 'Chegou agora';
  if (minutes < 60) return 'Aguardando há '+minutes+' min';
  if (minutes < 1440) return 'Aguardando há '+Math.floor(minutes/60)+' h';
  const days = Math.floor(minutes/1440);
  return 'Aguardando há '+days+(days === 1 ? ' dia' : ' dias');
}

function whatsappLink(phone, reference) {
  let digits = (phone ?? '').replace(/[^0-9]/g,'');
  if (digits.length === 10 || digits.length === 11) digits = '55'+digits;
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) return '';
  const message = reference ? 'Olá! Estou entrando em contato sobre o imóvel '+reference+'.' : 'Olá! Como posso ajudar?';
  return '<a class="alt btn" href="https://wa.me/'+digits+'?text='+encodeURIComponent(message)+
    '" target="_blank" rel="noopener noreferrer">WhatsApp</a>';
}

export async function crm(isActive, params = {queue:true, q:'', assignee:'', page:0}) {
  const version = ++renderVersion;
  const isCurrent = () => isActive() && app.contains(pipeline);
  const query = new URLSearchParams({q:params.q,assignee:params.assignee,queue:params.queue,
    offset:params.page*pageSize,limit:pageSize+1});
  const [result, staff] = await Promise.all([request(crmPath+'?'+query), request(crmPath+'/responsaveis')]);
  if (!isActive() || version !== renderVersion) return;
  if (!result.length && params.page > 0) return crm(isActive,{...params,page:params.page-1});
  const leads = result.slice(0,pageSize);
  const columns = params.queue ? stages.slice(0,1) : stages;
  const options = selected => '<option value="">Sem responsável</option>' +
    (selected && !staff.some(user => user.id === selected) ?
      '<option value="'+escape(selected)+'" selected>Responsável inativo</option>' : '') +
    staff.map(user => '<option value="'+escape(user.id)+'"'+(selected === user.id ? ' selected' : '')+
      '>'+escape(user.username)+'</option>').join('');
  const links = lead => '<div><label>Responsável<select name="assignedTo">'+options(lead?.assignedTo)+'</select></label>'+
    '<label>Buscar imóvel por código ou título<input type="search" class="crm-property-search" maxlength="120"></label>'+
    '<button type="button" class="alt crm-property-find">Buscar imóvel</button>'+
    '<label>Imóvel vinculado<select name="propertyId"><option value="">Sem imóvel</option>'+
    (lead?.propertyId ? '<option value="'+escape(lead.propertyId)+'" selected>'+escape([lead.propertyCode,lead.propertyTitle].filter(Boolean).join(' · ') || 'Imóvel atual')+'</option>' : '')+
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
    '<section class="crm-pipeline"><h3>Fila de atendimento</h3>' +
    '<form id="crm-filters" class="box"><div class="grid"><label>Exibir<select name="queue">'+
    '<option value="true"'+(params.queue?' selected':'')+'>Novos sem responsável</option>'+
    '<option value="false"'+(!params.queue?' selected':'')+'>Todos os contatos</option></select></label>'+
    '<label>Buscar contatos<input name="q" type="search" maxlength="120" value="'+escape(params.q)+'" placeholder="Nome, telefone ou imóvel"></label>'+
    '<label>Filtrar por corretor<select name="assignee"'+(params.queue?' disabled':'')+'><option value="">Todos</option>'+
    '<option value="unassigned">Sem responsável</option>'+staff.map(user =>
      '<option value="'+escape(user.id)+'">'+escape(user.username)+'</option>').join('')+'</select></label></div>'+
    '<div class="row"><button type="submit">Aplicar filtros</button></div></form>'+
    '<div class="crm-board">'+columns.map(([stage,label]) => '<section class="box crm-stage" data-stage="'+stage+'">' +
      '<h4>'+label+' <span class="chips"></span></h4><p class="muted crm-stage-empty">Nenhum contato nesta etapa.</p>' +
      leads.filter(lead => lead.status === stage).map(lead =>
      '<form class="crm-lead" data-assignee="'+escape(lead.assignedTo)+'" data-id="'+escape(lead.id)+'"><div><strong>'+escape(lead.name)+'</strong>' +
      (lead.email?'<p>'+escape(lead.email)+'</p>':'') +
      (lead.phone?'<p>'+escape(lead.phone)+'</p>':'') +
      (lead.status === 'new' && !lead.assignedTo ? '<p class="chips crm-wait">'+waitingSince(lead.createdAt)+'</p>' : '') +
      (lead.propertyCode ? '<p><a href="/#editar/'+escape(lead.propertyId)+'">'+
        escape(lead.propertyCode+' · '+lead.propertyTitle)+'</a></p>' : '') +
      whatsappLink(lead.phone,lead.propertyCode) +
      '</div><label>Etapa<select name="status">'+stageOptions(lead.status)+'</select></label>' +
      links(lead)+'<label>Observações<textarea name="notes" maxlength="4000" rows="2">'+escape(lead.notes)+'</textarea></label>' +
      '<div><button type="submit" class="alt">Salvar</button>' +
      '<details class="lead-history"><summary>Histórico de etapas</summary><ol></ol></details></div></form>').join('')+'</section>').join('')+'</div></section>';
  const pipeline = app.querySelector('.crm-pipeline');
  pipeline.insertAdjacentHTML('beforeend','<div class="row"><span>Página '+(params.page+1)+'</span>'+
    '<button type="button" class="alt" data-crm-page="previous"'+(params.page===0?' disabled':'')+'>Anterior</button>'+
    '<button type="button" class="alt" data-crm-page="next"'+(result.length<=pageSize?' disabled':'')+'>Próxima</button></div>');
  bindLogout();
  const filters = app.querySelector('#crm-filters');
  filters.elements.assignee.value = params.assignee;
  filters.elements.queue.onchange = () => {
    filters.elements.assignee.disabled = filters.elements.queue.value === 'true';
  };
  const navigate = next => crm(isActive,next).catch(error => { if (isActive()) report(error.message); });
  filters.onsubmit = event => {
    event.preventDefault();
    const queue = filters.elements.queue.value === 'true';
    navigate({queue,q:filters.elements.q.value.trim(),assignee:queue?'':filters.elements.assignee.value,page:0});
  };
  for (const button of pipeline.querySelectorAll('[data-crm-page]'))
    button.onclick = () => navigate({...params,page:params.page+(button.dataset.crmPage==='next'?1:-1)});
  for (const column of pipeline.querySelectorAll('.crm-stage')) {
    const count = column.querySelectorAll('.crm-lead').length;
    column.querySelector('.chips').textContent = count;
    column.querySelector('.crm-stage-empty').hidden = count > 0;
  }
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
      if (isCurrent()) await crm(isActive,{queue:false,q:'',assignee:'',page:0});
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
      const button=form.querySelector('button[type=submit]');
      button.disabled=true;
      try {
        await request(crmPath+'/'+encodeURIComponent(lead.id),'PUT',{
          name:lead.name,email:lead.email,phone:lead.phone,...formData(form)
        });
        if(isCurrent()) {
          await crm(isActive,params);
          if (isActive()) report('Contato atualizado.');
        }
      } catch(error) { if(isCurrent()) report(error.message); }
      finally { button.disabled=false; }
    };
  }
}
