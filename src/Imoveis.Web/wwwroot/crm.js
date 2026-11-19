import {app,escape,notice,report} from './ui.js';
import {adminNav,bindLogout} from './admin-ui.js';
import {request} from './api.js';

const stages = [['new','Novo'],['contacted','Em contato'],['visit','Visita'],['proposal','Proposta'],['won','Fechado'],['lost','Perdido']];
const stageOptions = selected => stages.map(([value,label]) =>
  '<option value="'+value+'"'+(selected===value?' selected':'')+'>'+label+'</option>').join('');

export async function crm(isCurrent) {
  const leads = await request('/api/admin/crm/leads');
  if (!isCurrent()) return;
  app.innerHTML = adminNav() + '<h2>CRM · Contatos interessados</h2>' + notice +
    '<p class="muted">Organize contatos, visitas e propostas sem sair do painel.</p>' +
    '<section class="box"><h3>Novo contato</h3><form id="lead-new">' +
    '<div class="grid"><label>Nome<input name="name" required maxlength="160"></label>' +
    '<label>E-mail<input name="email" type="email" maxlength="254"></label>' +
    '<label>Telefone<input name="phone" type="tel" maxlength="40"></label>' +
    '<label>Etapa<select name="status">'+stageOptions('new')+'</select></label></div>' +
    '<label>Observações<textarea name="notes" maxlength="4000"></textarea></label>' +
    '<button>Adicionar contato</button></form></section>' +
    '<section class="box"><h3>Contatos ('+leads.length+')</h3>' +
    (leads.length ? '<div class="crm-list">'+leads.map(lead =>
      '<form class="crm-lead" data-id="'+escape(lead.id)+'"><div><strong>'+escape(lead.name)+'</strong>' +
      (lead.email?'<p>'+escape(lead.email)+'</p>':'') +
      (lead.phone?'<p>'+escape(lead.phone)+'</p>':'') +
      '</div><label>Etapa<select name="status">'+stageOptions(lead.status)+'</select></label>' +
      '<label>Observações<textarea name="notes" maxlength="4000" rows="2">'+escape(lead.notes)+'</textarea></label>' +
      '<button class="alt">Salvar</button></form>').join('')+'</div>' :
      '<p>Nenhum contato cadastrado.</p>')+'</section>';
  bindLogout();
  const create = app.querySelector('#lead-new');
  create.onsubmit = async event => {
    event.preventDefault();
    const button=create.querySelector('button');
    button.disabled=true;
    try {
      await request('/api/admin/crm/leads','POST',{
        ...Object.fromEntries(new FormData(create)),propertyId:null,assignedTo:null
      });
      if (isCurrent()) await crm(isCurrent);
    } catch(error) { if(isCurrent()) report(error.message); }
    finally { button.disabled=false; }
  };
  for (const form of app.querySelectorAll('.crm-lead')) {
    form.onsubmit = async event => {
      event.preventDefault();
      const lead=leads.find(item=>item.id===form.dataset.id);
      if(!lead) return;
      const button=form.querySelector('button');
      button.disabled=true;
      try {
        await request('/api/admin/crm/leads/'+encodeURIComponent(lead.id),'PUT',{
          propertyId:lead.propertyId,name:lead.name,email:lead.email,phone:lead.phone,
          assignedTo:lead.assignedTo,...Object.fromEntries(new FormData(form))
        });
        if(isCurrent()) report('Contato atualizado.');
      } catch(error) { if(isCurrent()) report(error.message); }
      finally { button.disabled=false; }
    };
  }
}
