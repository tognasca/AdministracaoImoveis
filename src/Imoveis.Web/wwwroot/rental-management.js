import {app, escape, money, notice, report} from './ui.js';
import {request} from './api.js';
import {adminNav, bindLogout, sectionNav, bindSections, closePropertyOffer} from './admin-ui.js';

const endpoint = '/api/admin/locacoes';
const date = value => escape(value?.slice(0,10).split('-').reverse().join('/'));
const currency = value => escape(money(value));

function chargeTable(charges, staff = false) {
  if (!charges.length) return '<p>Nenhuma cobrança registrada.</p>';
  return '<div class="table"><table><thead><tr><th>Competência</th><th>Vencimento</th><th>Aluguel</th><th>Taxa da imobiliária</th>' +
    '<th>Repasse previsto</th><th>Pagamento</th><th>Repasse</th>'+(staff ? '<th>Ações</th>' : '')+'</tr></thead><tbody>'+
    charges.map(row => {
      const action = row.transferred_at ? '' : row.paid_at ? 'repasse' : 'pagamento';
      return '<tr><td>'+date(row.month).slice(3)+'</td><td>'+date(row.due_on)+'</td><td>'+currency(row.rent)+'</td><td>'+
        currency(row.fee)+'</td><td>'+currency(row.rent-row.fee)+'</td><td>'+
        (row.paid_at ? date(row.paid_at) : 'Pendente')+(staff && row.payment_ref ? '<br>'+escape(row.payment_ref) : '')+
        '</td><td>'+(row.transferred_at ? date(row.transferred_at) : 'Pendente')+
        (staff && row.transfer_ref ? '<br>'+escape(row.transfer_ref) : '')+'</td>'+
        (staff ? '<td>'+(action ? '<form data-operation="cobrancas/'+escape(row.month)+'/'+action+'"><label>Referência do comprovante'+
          '<input name="reference" required maxlength="160"></label><button>Registrar '+action+'</button></form>' : '')+'</td>' : '')+'</tr>';
    }).join('')+'</tbody></table></div>';
}

const amountFields = (rent, fee) => '<label>Aluguel mensal (R$)<input name="rent" type="number" min="0.01" step="0.01" required value="'+
  escape(rent)+'"></label><label>Taxa mensal da imobiliária (R$)<input name="fee" type="number" min="0" step="0.01" required value="'+
  escape(fee)+'"></label>';

function asObject(form) {
  const input = Object.fromEntries(new FormData(form));
  for (const field of ['rent','fee','dueDay']) if (field in input) input[field] = Number(input[field]);
  if (input.month) input.month += '-01';
  return input;
}

export async function rentalManagement(id, isCurrent, page = 1, activeSection = "lease-contract") {
  const result = await request(id ? endpoint+'/'+encodeURIComponent(id) : endpoint+'?page='+page);
  if (!isCurrent()) return;
  app.innerHTML = adminNav() + '<h2>Gestão de locações</h2>' + notice;
  bindLogout();
  if (!id) {
    app.insertAdjacentHTML('beforeend','<section class="box"><h3>Novo contrato</h3>'+
      '<form id="contract-find"><label>Buscar imóvel por título ou código<input name="search" maxlength="120" required></label><button>Buscar</button></form>'+
      '<form id="contract-create"><label>Imóvel<select name="propertyId" required><option value="">Busque um imóvel</option></select></label>'+
      '<div class="grid"><label>Nome do proprietário<input name="ownerName" required maxlength="160"></label>'+
      '<label>Nome do locatário<input name="renterName" required maxlength="160"></label>'+
      '<label>Início<input name="startsOn" type="date" required></label><label>Término<input name="endsOn" type="date" required></label>'+
      amountFields('',0)+'<label>Dia de vencimento<input name="dueDay" type="number" min="1" max="28" required></label></div>'+
      '<button>Criar contrato</button></form></section><section class="box"><h3>Contratos</h3>'+
      (result.length ? '<ul>'+result.map(contract => '<li><a href="/#locacoes/'+encodeURIComponent(contract.id)+'">'+escape(contract.title)+
        '</a> · '+escape(contract.owner_name)+' · '+(contract.closed_at ? 'Encerrado' : contract.signed_at ? 'Assinatura registrada' : 'Pendente de assinatura')+'</li>').join('')+
        '</ul>' : '<p>Nenhum contrato nesta página.</p>')+'<div class="row"><button type="button" id="rental-prev"'+
      (page===1 ? ' disabled' : '')+'>Anterior</button><button type="button" id="rental-next"'+(result.length<30 ? ' disabled' : '')+
      '>Próxima</button></div></section>');
    const find = app.querySelector('#contract-find');
    const create = app.querySelector('#contract-create');
    find.onsubmit = event => {
      event.preventDefault();
      perform(find.querySelector('button'), async () => {
        const homes = await request('/api/admin/imoveis?q='+encodeURIComponent(find.elements.search.value.trim()));
        if (!isCurrent()) return;
        create.elements.propertyId.replaceChildren(new Option(homes.length ? 'Selecione o imóvel' : 'Nenhum imóvel encontrado',''),
          ...homes.map(item => new Option(item.data.code+' · '+item.data.title,item.id)));
      },isCurrent);
    };
    create.onsubmit = event => {
      event.preventDefault();
      perform(create.querySelector('button'), async () => {
        const {rent,fee,...payload} = asObject(create);
        const created = await request(endpoint,'POST',{...payload,monthlyRent:rent,managementFee:fee});
        if (isCurrent()) location.hash = 'locacoes/'+created.id;
      },isCurrent);
    };
    for (const [selector,delta] of [['#rental-prev',-1],['#rental-next',1]]) {
      const button = app.querySelector(selector);
      button.onclick = () => perform(button,() => rentalManagement(null,isCurrent,page+delta),isCurrent);
    }
    return;
  }

  const {contract, inspections, attachments, adjustments, charges} = result;
  const base = endpoint+'/'+encodeURIComponent(id);
  const pathFor = file => base+'/anexos/'+encodeURIComponent(file.id);
  const signedFile = attachments.find(file => file.kind === 'contrato');
  const inspectionCard = kind => {
    const inspection = inspections.find(item => item.kind === kind);
    const photos = attachments.filter(file => file.kind === kind);
    return '<section class="box"><h3>Vistoria de '+(kind === 'saida' ? 'saída' : 'entrada')+'</h3>'+
      '<form data-operation="vistorias/'+kind+'" data-method="PUT"><label>Data<input type="date" name="inspectedOn" required value="'+
      escape(inspection?.inspected_on)+'"></label><label>Observações<textarea name="notes" maxlength="8000">'+escape(inspection?.notes)+
      '</textarea></label><button>Salvar vistoria</button></form>'+
      (inspection ? uploadForm(kind,'Anexar foto', 'image/jpeg,image/png,image/webp') : '')+
      '<div class="row">'+photos.map((photo,index) => '<a href="'+pathFor(photo)+'" target="_blank" rel="noopener noreferrer">'+
        '<img loading="lazy" width="120" alt="Foto '+(index+1)+' da vistoria" src="'+pathFor(photo)+'"></a>').join('')+'</div></section>';
  };
  const latest = adjustments[0];
  const pending = charges.filter(row => !row.paid_at);
  const next = pending.at(-1);
  const payable = charges.filter(row => row.paid_at && !row.transferred_at);
  const leaseSections = [['lease-contract','Contrato'],['lease-inspections','Vistorias'],
    ['lease-finance','Financeiro'],['lease-owner','Acesso do proprietário']];
  const metrics = [['Próximo vencimento em aberto',next ? date(next.due_on) : '—'],
    ['Pagamentos pendentes',currency(pending.reduce((sum,row) => sum+row.rent,0))],
    ['Repasse pendente',currency(payable.reduce((sum,row) => sum+row.rent-row.fee,0))]];
  app.insertAdjacentHTML('beforeend','<p><a href="/#locacoes">← Todos os contratos</a></p><h1>'+escape(contract.title)+'</h1>'+
    '<section class="admin-metrics" aria-label="Resumo do contrato">'+metrics.map(([label,value]) =>
      '<div class="admin-metric"><span>'+label+'<strong>'+value+'</strong></span></div>').join('')+'</section>'+
    sectionNav(leaseSections)+'<div id="lease-contract"><section class="box"><h3>Dados do contrato</h3>'+
    '<p>Proprietário: '+escape(contract.owner_name)+' · Locatário: '+escape(contract.renter_name)+'</p>'+
    '<p>Vigência: '+date(contract.starts_on)+' a '+date(contract.ends_on)+' · Dia de vencimento: '+escape(contract.due_day)+'</p>'+
    '<p>Aluguel inicial: '+currency(contract.monthly_rent)+' · Taxa inicial: '+currency(contract.management_fee)+'</p>'+
    (contract.closed_at ? '<p>Encerrado em '+date(contract.closed_at)+'</p>' :
      '<form data-operation="encerrar"><button class="alt">Encerrar contrato</button></form>')+
    '<h4>Assinatura</h4>'+(signedFile ? '<p>Comprovante anexado em '+date(contract.signed_at)+' · <a href="'+pathFor(signedFile)+
      '">Baixar PDF assinado</a></p>' : '<p>Anexe o contrato após coletar as assinaturas.</p>'+uploadForm('contrato','Anexar PDF assinado','application/pdf'))+
    (signedFile && !contract.closed_at ? '<button type="button" class="alt" id="lease-close-offer">Marcar imóvel como locado</button>' : '')+
    '</section></div><div id="lease-inspections">'+inspectionCard('entrada')+inspectionCard('saida')+'</div><div id="lease-finance">'+
    '<section class="box"><h3>Reajustes</h3>'+
    (contract.signed_at && !contract.closed_at ? '<form data-operation="reajustes"><div class="grid"><label>Competência inicial<input name="month" type="month" required></label>'+
      amountFields(latest?.rent ?? contract.monthly_rent,latest?.fee ?? contract.management_fee)+
      '<label>Motivo<input name="reason" maxlength="500" required></label></div><button>Registrar reajuste</button></form>' : '')+
    (adjustments.length ? '<ul>'+adjustments.map(row => '<li>'+date(row.month).slice(3)+' · '+currency(row.rent)+' de aluguel · '+
      currency(row.fee)+' de taxa · '+escape(row.reason)+'</li>').join('')+'</ul>' : '<p>Nenhum reajuste registrado.</p>')+'</section>'+
    '<section class="box"><h3>Cobranças e repasses</h3>'+
    (contract.signed_at && !contract.closed_at ? '<form data-operation="cobrancas"><label>Competência<input name="month" type="month" required></label>'+
      '<p>O valor segue o aluguel mensal vigente para a competência, sem cálculo de proporcionalidade.</p><button>Gerar cobrança interna</button></form>' : '')+
    chargeTable(charges,true)+'</section></div>'+
    '<section class="box" id="lease-owner"><h3>Área do proprietário</h3><p>Link de consulta financeira válido por 30 dias. Gerar outro link revoga o anterior.</p>'+
    '<div class="row"><button type="button" id="owner-issue">Gerar link de acesso</button><button class="alt" type="button" id="owner-revoke">Revogar acesso</button></div>'+
    '<div id="owner-link-label" hidden><label>Link privado<input id="owner-link" readonly></label></div></section>');

  const nav = app.querySelector('.workspace-sections');
  bindSections(nav,activeSection);
  for (const form of app.querySelectorAll('form[data-operation]')) {
    form.onsubmit = event => {
      event.preventDefault();
      const operation = form.dataset.operation;
      if (operation === 'encerrar' && !window.confirm('Encerrar o contrato e parar a geração de novas cobranças?')) return;
      perform(form.querySelector('button'), async () => {
        await request(base+'/'+operation,form.dataset.method ?? 'POST',form.dataset.upload ? new FormData(form) : asObject(form));
        if (!isCurrent()) return;
        await rentalManagement(id,isCurrent,page,nav.querySelector('[aria-pressed="true"]').dataset.section);
        if (isCurrent()) report('Registro atualizado.');
      },isCurrent);
    };
  }
  const closeOffer = app.querySelector('#lease-close-offer');
  if (closeOffer) closeOffer.onclick = () => {
    if (!window.confirm('Encerrar a divulgação da locação deste imóvel?')) return;
    perform(closeOffer, async () => {
      await closePropertyOffer(contract.property_id,'rent');
      if (isCurrent()) report('Oferta de locação encerrada.');
    },isCurrent);
  };
  const issue = app.querySelector('#owner-issue');
  const revoke = app.querySelector('#owner-revoke');
  const label = app.querySelector('#owner-link-label');
  const input = app.querySelector('#owner-link');
  issue.onclick = () => perform(issue,async () => {
    const {token} = await request(base+'/acesso-proprietario','POST');
    if (!isCurrent()) return;
    input.value = location.origin+'/#proprietario/'+token;
    label.hidden = false;
    input.select();
  },isCurrent);
  revoke.onclick = () => perform(revoke,async () => {
    await request(base+'/acesso-proprietario','DELETE');
    if (!isCurrent()) return;
    label.hidden = true;
    input.value = '';
    report('Acesso revogado.');
  },isCurrent);
}

function uploadForm(kind,label,accept) {
  return '<form data-operation="anexos/'+kind+'" data-upload><label>'+label+
    '<input name="file" type="file" accept="'+accept+'" required></label><button>Enviar arquivo</button></form>';
}

async function perform(button, action, isCurrent) {
  button.disabled = true;
  try { await action(); }
  catch (error) { if (isCurrent()) report(error.message); }
  finally { button.disabled = false; }
}

export async function ownerStatement(token, isCurrent) {
  const result = await request('/api/proprietario/locacao','POST',{token});
  if (!isCurrent()) return;
  app.innerHTML = '<section class="box"><h1>Extrato de locação</h1><h2>'+escape(result.title)+'</h2><p>Vigência: '+
    date(result.starts_on)+' a '+date(result.ends_on)+'</p>'+chargeTable(result.charges)+'</section>';
}
