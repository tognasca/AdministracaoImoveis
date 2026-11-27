import {app,escape,notice,report,money} from './ui.js';
import {adminNav,bindLogout,closePropertyOffer} from './admin-ui.js';
import {request} from './api.js';

const crmPath = '/api/admin/crm/leads';
const stages = [['new','Novo'],['contacted','Em contato'],['visit','Visita'],['proposal','Proposta'],['won','Fechado'],['lost','Perdido']];
const negotiationLabels = {counteroffer:'Contraproposta',accepted:'Proposta aceita',declined:'Proposta recusada','visit-confirmed':'Visita confirmada'};
const negotiationOptions = kind => (kind === 'visit' ? ['visit-confirmed'] : ['counteroffer','accepted','declined'])
  .map(action => '<option value="'+action+'">'+negotiationLabels[action]+'</option>').join('');
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

export async function crm(isActive, params = {queue:true, q:'', assignee:'', page:0,today:false}) {
  const version = ++renderVersion;
  const isCurrent = () => isActive() && app.contains(pipeline);
  const query = new URLSearchParams({q:params.q,assignee:params.assignee,queue:params.queue,
    today:!!params.today,offset:params.page*pageSize,limit:pageSize+1});
  const [result, staff, session] = await Promise.all([request(crmPath+'?'+query), request(crmPath+'/responsaveis'),request('/api/admin/session')]);
  if (!isActive() || version !== renderVersion) return;
  if (!result.length && params.page > 0) return crm(isActive,{...params,page:params.page-1});
  const leads = result.slice(0,pageSize);
  const columns = params.queue ? stages.slice(0,1) : stages;
  const currentStaff = staff.find(user => user.username === session.username)?.id;
  const visitLabels = {scheduled:'Agendada',confirmed:'Confirmada',cancelled:'Cancelada'};
  function actions(lead) {
    const claim = lead.status === 'new' && !lead.assignedTo ?
      '<button type="button" data-lead-action="assumir">Assumir atendimento</button>' : '';
    const contact = lead.assignedTo === currentStaff && lead.status === 'new' ?
      '<button type="button" class="alt" data-lead-action="primeiro-contato">Registrar primeiro contato</button>' : '';
    const canVisit = lead.assignedTo === currentStaff && lead.propertyId && !['won','lost'].includes(lead.status);
    const activeVisit = ['scheduled','confirmed'].includes(lead.visitState);
    const visit = canVisit ? '<details><summary>'+ (activeVisit?'Gerenciar visita':'Marcar visita') +'</summary>'+
      '<label>Data e hora da visita<input type="datetime-local" data-visit-at></label>'+
      '<div class="row"><button type="button" data-lead-action="scheduled">'+(activeVisit?'Remarcar':'Agendar')+'</button>'+
      (lead.visitState === 'scheduled' ? '<button type="button" class="alt" data-lead-action="confirmed">Confirmar</button>' : '')+
      (activeVisit ? '<button type="button" class="alt" data-lead-action="cancelled">Cancelar visita</button>' : '')+
      '</div></details>' : '';
    return (lead.firstContactAt ? '<p>Primeiro contato: '+escape(new Date(lead.firstContactAt).toLocaleString('pt-BR'))+'</p>' : '')+
      (lead.visitAt ? '<p>Visita '+visitLabels[lead.visitState]?.toLowerCase()+' · '+escape(new Date(lead.visitAt).toLocaleString('pt-BR'))+'</p>' : '')+
      '<div class="row">'+claim+contact+'</div>'+visit;
  }
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
  app.innerHTML = adminNav() + '<h1>CRM</h1>' + notice +
    '<p class="muted">Organize contatos, visitas e propostas sem sair do painel.</p>' +
    '<details class="box"><summary>Novo contato</summary><form id="lead-new">' +
    '<div class="grid"><label>Nome<input name="name" required maxlength="160"></label>' +
    '<label>E-mail<input name="email" type="email" maxlength="254"></label>' +
    '<label>Telefone<input name="phone" type="tel" maxlength="40"></label>' +
    '<label>Etapa<select name="status">'+stageOptions('new')+'</select></label></div>' +
    links()+'<label>Observações<textarea name="notes" maxlength="4000"></textarea></label>' +
    '<button>Adicionar contato</button></form></details>' +
    '<section class="crm-pipeline"><h3>Fila de atendimento</h3>' +
    '<form id="crm-filters" class="box"><div class="grid"><label>Exibir<select name="queue">'+
    '<option value="true"'+(params.queue?' selected':'')+'>Novos sem responsável</option>'+
    '<option value="false"'+(!params.queue&&!params.today?' selected':'')+'>Todos os contatos</option>'+
    '<option value="today"'+(params.today?' selected':'')+'>Visitas de hoje</option></select></label>'+
    '<label>Buscar contatos<input name="q" type="search" maxlength="120" value="'+escape(params.q)+'" placeholder="Nome, telefone ou imóvel"></label>'+
    '<label>Filtrar por corretor<select name="assignee"'+(params.queue?' disabled':'')+'><option value="">Todos</option>'+
    '<option value="unassigned">Sem responsável</option>'+staff.map(user =>
      '<option value="'+escape(user.id)+'">'+escape(user.username)+'</option>').join('')+'</select></label></div>'+
    '<div class="row"><button type="submit">Aplicar filtros</button></div></form>'+
    '<div class="crm-split"><aside class="box crm-inbox" aria-label="Lista de contatos">'+
      (leads.length ? leads.map(lead => '<button type="button" class="alt crm-inbox-item" data-lead="'+escape(lead.id)+
        '" aria-pressed="'+(lead===selected)+'"><strong>'+escape(lead.name)+'</strong><small>'+
        escape(lead.propertyTitle || 'Sem imóvel vinculado')+'</small><small>'+
        escape(stages.find(([value])=>value===lead.status)?.[1])+'</small></button>').join('') :
        '<p>Nenhum contato corresponde aos filtros.</p>')+'</aside><div class="crm-detail">'+
      leads.map(lead =>
      '<form class="box crm-lead"'+(lead===selected ? '' : ' hidden')+' data-assignee="'+escape(lead.assignedTo)+'" data-id="'+escape(lead.id)+'"><div><strong>'+escape(lead.name)+'</strong>' +
      '<p class="muted">Última atualização: '+escape(new Date(lead.updatedAt).toLocaleString('pt-BR'))+'</p>'+
      (lead.email?'<p>'+escape(lead.email)+'</p>':'') +
      (lead.phone?'<p>'+escape(lead.phone)+'</p>':'') +
      (lead.status === 'new' && !lead.assignedTo ? '<p class="chips crm-wait">'+waitingSince(lead.createdAt)+'</p>' : '') +
      (lead.propertyCode ? '<p><a href="/#editar/'+escape(lead.propertyId)+'">'+
        escape(lead.propertyCode+' · '+lead.propertyTitle)+'</a></p>' : '') +
      whatsappLink(lead.phone,lead.propertyCode) + actions(lead) +
      '</div><label>Etapa<select name="status">'+stageOptions(lead.status)+'</select></label>' +
      links(lead)+'<label>Observações<textarea name="notes" maxlength="4000" rows="2">'+escape(lead.notes)+'</textarea></label>' +
      '<div><button type="submit" class="alt">Salvar</button>' +
      (lead.requestKind ? '<div class="row"><label>Registrar negociação<select name="negotiationAction">'+
        negotiationOptions(lead.requestKind)+'</select></label><label'+(lead.requestKind === 'visit' ? ' hidden' : '')+
        '>Valor da contraproposta (R$)<input name="counterofferPrice" type="number" min="0.01" step="0.01"'+
        (lead.requestKind === 'visit' ? ' disabled' : '')+'></label><button type="button" class="alt" data-negotiation>'+
        (lead.requestKind === 'visit' ? 'Confirmar visita' : 'Registrar contraproposta')+'</button></div>' : '') +
      '<details class="lead-history"><summary>Histórico de atendimento</summary><ol></ol></details></div></form>').join('')+'</div></div></section>';
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
    navigate({queue,today:filters.elements.queue.value === 'today',q:filters.elements.q.value.trim(),assignee:queue?'':filters.elements.assignee.value,page:0});
  };
  for (const button of pipeline.querySelectorAll('[data-crm-page]'))
    button.onclick = () => navigate({...params,page:params.page+(button.dataset.crmPage==='next'?1:-1)});
  const contactButtons = [...pipeline.querySelectorAll('[data-lead]')];
  const contactForms = [...pipeline.querySelectorAll('.crm-lead')];
  for (const button of contactButtons) button.onclick = () => {
    const id = button.dataset.lead;
    for (const item of contactButtons) item.setAttribute('aria-pressed',String(item === button));
    for (const form of contactForms) form.hidden = form.dataset.id !== id;
    if (matchMedia('(max-width:820px)').matches)
      contactForms.find(form => form.dataset.id===id)?.scrollIntoView({block:'nearest'});
  };
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
    for (const control of form.querySelectorAll('[data-lead-action]')) {
      control.onclick = async () => {
        const action = control.dataset.leadAction;
        const path = crmPath+'/'+encodeURIComponent(form.dataset.id);
        control.disabled = true;
        try {
          if (action === 'assumir' || action === 'primeiro-contato') await request(path+'/'+action,'POST');
          else {
            const value = form.querySelector('[data-visit-at]').value;
            if (action === 'scheduled' && (!value || new Date(value) <= new Date()))
              throw Error('Selecione uma data e hora futuras.');
            if (action === 'cancelled' && !confirm('Cancelar esta visita?')) return;
            await request(path+'/visita','PUT',{state:action,at:action==='scheduled'?new Date(value).toISOString():null});
          }
          if (isCurrent()) await crm(isActive,action==='assumir'?{queue:false,assignee:currentStaff ?? '',q:'',page:0}:params);
          if (isActive()) report('Atendimento atualizado.');
        } catch (error) { if (isCurrent()) report(error.message); }
        finally { control.disabled = false; }
      };
    }
    const history = form.querySelector('.lead-history');
    const events = history.querySelector('ol');
    const loadHistory = async () => {
      if (!history.open) return;
      events.innerHTML = '<li>Carregando…</li>';
      try {
        const items = await request(crmPath+'/'+encodeURIComponent(form.dataset.id)+'/historico');
        events.innerHTML = items.length ? items.map(item =>
          '<li>'+escape(negotiationLabels[item.action] ?? stages.find(([value]) => value === item.status)?.[1])+
          (item.counterofferPrice == null ? '' : ' · '+money(item.counterofferPrice))+
          ' · '+escape(item.changedBy)+' · '+escape(new Date(item.createdAt).toLocaleString('pt-BR'))+'</li>'
        ).join('') : '<li>Nenhuma mudança registrada.</li>';
      } catch (error) { events.innerHTML = '<li>'+escape(error.message)+'</li>'; }
    };
    const closeOffer = form.querySelector('[data-close-offer]');
    if (closeOffer) closeOffer.onclick = async () => {
      const lead = leads.find(item=>item.id===form.dataset.id);
      if (!window.confirm('Encerrar a divulgação desta operação na vitrine?')) return;
      closeOffer.disabled = true;
      try {
        await closePropertyOffer(lead.propertyId,lead.proposalOperation);
        if (isCurrent()) report('Oferta encerrada.');
      } catch (error) { if (isCurrent()) { report(error.message); closeOffer.disabled = false; } }
    };
    const negotiation = form.querySelector('[data-negotiation]');
    if (negotiation) {
      const actionField = form.elements.negotiationAction;
      const priceField = form.elements.counterofferPrice;
      actionField.onchange = () => {
        priceField.disabled = priceField.closest('label').hidden = actionField.value !== 'counteroffer';
        negotiation.textContent = {counteroffer:'Registrar contraproposta',accepted:'Registrar aceite',declined:'Registrar recusa'}[actionField.value] ?? 'Confirmar visita';
      };
      negotiation.onclick = async () => {
        const action = actionField.value;
        if (action === 'counteroffer' && (!priceField.value || !priceField.reportValidity())) {
          report('Informe um valor válido para a contraproposta.');
          return;
        }
        negotiation.disabled = true;
        try {
          await request(crmPath+'/'+encodeURIComponent(form.dataset.id)+'/negociacao','POST',{
            action,price:action === 'counteroffer' ? Number(priceField.value) : null
          });
          if (!isCurrent()) return;
          priceField.value = '';
          if (history.open) await loadHistory();
          else history.open = true;
          report('Ação registrada no histórico.');
        } catch (error) { if (isCurrent()) report(error.message); }
        finally { negotiation.disabled = false; }
      };
    }
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
          await crm(isActive,{...params,selected:lead.id});
          if (isActive()) report('Contato atualizado.');
        }
      } catch(error) { if(isCurrent()) report(error.message); }
      finally { button.disabled=false; }
    };
  }
}
