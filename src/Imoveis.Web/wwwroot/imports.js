import {normalizeZone, standardZones} from './property-zones.js';
import {delimited, excel, structuredRows} from './import-files.js';

import {catalogWorkbook} from './pdf-excel.js';

const endpoint = '/api/admin/importacoes';
const labels = {code:'Código do imóvel',title:'Título',kind:'Tipo de imóvel',bedrooms:'Dormitórios',
  district:'Bairro',city:'Cidade',zone:'Zona',location:'Bairro e cidade',price:'Preço',size:'Área (m²)',notes:'Observações'};
const aliases = {code:['codigo','cod','codigoimovel','id'],title:['titulo','nome','descricao'],
  kind:['ctipo','tipoimovel','tipo'],bedrooms:['dormitorio','dormitorios','dormitoriosquanto','quartos'],
  district:['bairro'],city:['cidade','municipio'],zone:['zona','regiao','zonacidade'],location:['local','localizacao'],
  price:['valor','preco','vlvenda','precovenda'],size:['area','aream2','metragem'],notes:['observacao','observacoes','obs','notas']};
const normalize = value => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]/g,'');
const codeKey = value => String(value ?? '').trim().toLowerCase();
const emptyData = {title:'',kind:'',district:'',city:'',price:0,bedrooms:0,size:0,notes:'',status:'Rascunho',version:0};
const example = 'CODIGO;CTIPO;Dormitórios quanto;Local;VL_VENDA;Título;Observações\r\nIM-104;CASA;03;Granja Viana - Cotia/SP;875000;Casa na Granja Viana;Confirmar disponibilidade antes da visita\r\nIM-105;APTO;02;Centro - Cotia/SP;380000;Apartamento no Centro;Agendar visita com antecedência';
function download(name, content) {
  saveFile(name, new Blob(['\ufeff',content], {type:'text/csv;charset=utf-8'}));
}
function saveFile(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {href:url,download:name});
  a.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}
export function prepare(rows,mapping,existing,source) {
  const byCode = new Map(existing.map(row => [codeKey(row.data.code),row]));
  const counts = new Map();
  const codeIndex = mapping.indexOf('code');
  for (const row of rows) {
    const key = codeKey(row[codeIndex]);
    if (key) counts.set(key,(counts.get(key) ?? 0)+1);
  }
  return rows.map((cells,index) => {
    const patch = {};
    const errors = [];
    mapping.forEach((field,i) => {
      let value = String(cells[i] ?? '').trim();
      if (!field || !value) return;
      if (field === 'location') {
        const match = value.match(/^(.+?)\s+-\s+([^/]+)(?:\/\s*[A-Z]{2})?$/i);
        patch.district ??= (match?.[1] ?? value).trim();
        if (match) patch.city ??= match[2].trim();
        return;
      }
      if (field === 'zone') {
        value = normalizeZone(value);
        if (!standardZones.includes(value)) errors.push('Zona inválida');
      }
      if (field === 'kind') value = ({apto:'Apartamento',apartamento:'Apartamento',casa:'Casa',
        terreno:'Terreno',sobrado:'Sobrado'})[normalize(value)] ?? value;
      if (field === 'bedrooms') {
        if (!/^\d+(?:\s*(?:quartos?|dormitórios?))?$/i.test(value) || parseInt(value,10) > 1000)
          errors.push('Quantidade de dormitórios inválida');
        value = parseInt(value,10);
      }
      if (field === 'price' || field === 'size') {
        value = value.replace(/R\$|\s/g,'');
        if (!/^\d+(?:\.\d+)?$/.test(value) && !/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(value))
          errors.push(labels[field]+' inválido');
        if (value.includes(',')) value = value.replaceAll('.','').replace(',','.');
        value = Number(value);
        if (value >= (field === 'price' ? 1e13 : 1e10)) errors.push(labels[field]+' acima do limite');
      }
      patch[field] = value;
    });
    const key = codeKey(patch.code);
    if (!key) errors.push('Código ausente');
    if ((counts.get(key) ?? 0) > 1) errors.push('Código repetido no arquivo');
    const prior = byCode.get(key);
    const data = {...emptyData,...prior?.data,...patch,source};
    if (prior) data.code = prior.data.code;
    if (!data.title) data.title = [data.kind || 'Imóvel', data.district && 'em '+data.district,data.code].filter(Boolean).join(' ');
    for (const [field,limit] of Object.entries({code:80,title:160,kind:80,district:100,city:100,notes:2000}))
      if ((data[field]?.length ?? 0) > limit) errors.push(labels[field]+' acima de '+limit+' caracteres');
    const changes = prior ? Object.keys(patch).filter(field => field !== 'code' &&
      String(prior.data[field] ?? '') !== String(data[field] ?? '')) : [];
    return {line:index+2,id:prior?.id ?? null,previousPrice:prior?.data.price ?? null,data,
      status:errors.length ? 'Revisar' : prior ? changes.length ? 'Atualizar' : 'Sem alteração' : 'Criar',
      note:errors.join(' · ') || (prior ? changes.map(field => labels[field]+': '+(prior.data[field] ?? '')+' → '+data[field]).join(' · ') : data.title)};
  });
}
export function preparePriceUpdates(rows,mapping,existing,source) {
  const priceIndex = mapping.indexOf('price');
  const priceMapping = mapping.map(key => ['code','price'].includes(key) ? key : '');
  return prepare(rows,priceMapping,existing,source).map((row,index) => {
    if (row.status === 'Revisar') return row;
    if (!row.id) return {...row,status:'Revisar',note:'Imóvel não localizado nesta origem. Confira o código.'};
    if (!String(rows[index][priceIndex] ?? '').trim() || row.data.price <= 0 ||
        Math.abs(row.data.price - Math.round(row.data.price * 100) / 100) > 1e-9)
      return {...row,status:'Revisar',note:'Informe um preço positivo com até duas casas decimais.'};
    return row;
  });
}

const reviewGroups = [['','Todos'],['Criar','Novos'],['price-change','Preços alterados'],
  ['Atualizar','Atualizações'],['Sem alteração','Sem alteração'],['Revisar','Pendências']];
const brl = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const displayPrice = value => value > 0 ? brl.format(value) : '—';
const priceChanged = row => row.status === 'Atualizar' && row.previousPrice !== row.data.price;

function inReviewGroup(row, group) {
  if (!group) return true;
  if (group === 'price-change') return priceChanged(row);
  return row.status === group && (group !== 'Atualizar' || !priceChanged(row));
}

export function importReviewTable(preview, escape, sourceLabel, sourceValue) {
  return '<div class="workspace-sections import-review-filters" aria-label="Filtrar resultados">'+
    reviewGroups.map(([group,label]) => '<button type="button" class="alt" data-review-group="'+group+
      '" aria-pressed="'+(!group)+'">'+label+' · '+preview.filter(row=>inReviewGroup(row,group)).length+'</button>').join('')+
    '</div><div class="box table"><table><thead><tr><th>'+sourceLabel+'</th><th>Código</th><th>Resultado</th>'+
    '<th>Preço anterior</th><th>Preço na prévia</th><th>Detalhes</th></tr></thead><tbody>'+
    preview.map((row,index)=>'<tr data-review-row><td>'+escape(sourceValue(row,index))+'</td><td>'+escape(row.data.code)+
      '</td><td>'+escape(row.status)+'</td><td>'+displayPrice(row.previousPrice)+'</td>'+
      '<td>'+displayPrice(row.data.price)+'</td><td>'+escape(row.note)+'</td></tr>').join('')+'</tbody></table></div>';
}

export function bindReviewFilters(container, preview) {
  const buttons = [...container.querySelectorAll('[data-review-group]')];
  const rows = [...container.querySelectorAll('[data-review-row]')];
  for (const button of buttons) button.onclick = () => {
    for (const other of buttons) other.setAttribute('aria-pressed',String(other===button));
    rows.forEach((row,index) => { row.hidden = !inReviewGroup(preview[index],button.dataset.reviewGroup); });
  };
}

export function mountImport(ui) {
  const {app,request,escape,notice,report,adminNav,bindLogout,isCurrent} = ui;
  let originalFile = null, skippedListings = 0, pricesOnly = false;
  let rows = [], fileName = '', mapping = [], source = '', signature = '', models = [], lookupText = '';
  const start = stage => {
    app.innerHTML = adminNav()+'<h2>Importar imóveis</h2><p class="muted">'+stage+' de 3 · Arquivo → Mapeamento → Conferência</p>'+notice;
    bindLogout();
  };
  const choose = () => {
    originalFile = null;
    pricesOnly = false;
    start(1);
    app.insertAdjacentHTML('beforeend','<section class="box"><div class="row"><a class="btn alt" href="/#pdf">Tratar PDF</a></div><p>Envie Excel (.xlsx), CSV, TXT delimitado, JSON, XML ou VRSync. No Excel, será usada a primeira aba.</p>'+
      '<label class="import-drop">Arraste o arquivo aqui ou selecione no dispositivo<input id="import-file" type="file" accept=".xlsx,.csv,.txt,.json,.xml,.vrsync"></label>'+
      '<p></p><button class="alt" id="example">Baixar CSV de exemplo</button></section><section class="box" id="saved-models"><h3>Mapeamentos salvos</h3><p>Carregando modelos…</p></section><section class="box" id="history"><h3>Últimas importações</h3><p>Carregando histórico…</p></section>');
    const exports = '/api/admin/exportacoes/imoveis?limit=5000&format=';
    app.insertAdjacentHTML('beforeend','<section class="box"><h3>Exportar catálogo</h3>'+
      '<p>Até 5.000 imóveis por arquivo.</p><div class="row">'+
      ['json','csv','xml'].map(format => '<a download="imoveis.'+format+'" href="'+exports+format+'">'+format.toUpperCase()+'</a>').join('')+
      '<a target="_blank" rel="noopener" href="'+exports+'impressao">Imprimir ou salvar PDF</a>'+
      '<button type="button" class="alt" id="catalog-xlsx">Baixar Excel</button></div></section>');
    const excelButton = app.querySelector('#catalog-xlsx');
    excelButton.onclick = async () => {
      excelButton.disabled = true;
      try {
        const {properties} = await request(exports+'json');
        if (isCurrent()) saveFile('imoveis.xlsx', new Blob([catalogWorkbook(properties)], {
          type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }));
      } catch (error) {
        if (isCurrent()) report(error.message);
      } finally {
        excelButton.disabled = false;
      }
    };
    const savedModels = app.querySelector('#saved-models');
    request(endpoint+'/modelos').then(items => {
      savedModels.innerHTML = '<h3>Mapeamentos salvos</h3>' + (items.map(item => '<p><strong>'+escape(item.source)+
        '</strong> · '+item.mappedFields+' campos · '+escape(new Date(item.updatedAt).toLocaleString('pt-BR'))+'</p>').join('') ||
        '<p>Nenhum mapeamento salvo.</p>');
    }).catch(() => { savedModels.innerHTML = '<h3>Mapeamentos salvos</h3><p>Não foi possível consultar os modelos.</p>'; });
    const history = app.querySelector('#history');
    request(endpoint+'/historico').then(items => {
      history.innerHTML = '<h3>Últimas importações</h3>' + (items.map(item => '<p>'+escape(item.filename)+
        ' · '+escape(item.source)+' · '+item.count+' registros · '+escape(new Date(item.createdAt).toLocaleString('pt-BR'))+
        (item.hasOriginal ? ' · <a href="'+endpoint+'/historico/'+encodeURIComponent(item.id)+'/arquivo">Baixar original</a>' : '')+'</p>').join('') ||
        '<p>Nenhum arquivo importado.</p>');
    }).catch(() => { history.innerHTML = '<h3>Últimas importações</h3><p>Não foi possível consultar o histórico.</p>'; });
    app.insertAdjacentHTML('beforeend','<section class="box" id="import-failures"><h3>Falhas de processamento</h3><p>Carregando…</p></section>');
    const failures = app.querySelector('#import-failures');
    request(endpoint+'/falhas').then(items => {
      failures.innerHTML = '<h3>Falhas de processamento</h3>' + (items.map(item =>
        '<p>'+escape(item.operation)+' · HTTP '+escape(item.status)+' · '+escape(new Date(item.createdAt).toLocaleString('pt-BR'))+'</p>'
      ).join('') || '<p>Nenhuma falha registrada.</p>');
    }).catch(() => { failures.innerHTML = '<h3>Falhas de processamento</h3><p>Não foi possível consultar o histórico.</p>'; });
    app.querySelector('#example').onclick = () => download('imoveis-exemplo.csv',example);
    const input = app.querySelector('#import-file');
    const drop = input.closest('.import-drop');
    drop.ondragover = event => {
      event.preventDefault();
      if (!input.disabled) drop.classList.add('is-dragging');
    };
    drop.ondragleave = () => drop.classList.remove('is-dragging');
    drop.ondrop = event => {
      event.preventDefault();
      drop.classList.remove('is-dragging');
      loadFile(event.dataTransfer.files[0]);
    };
    input.onchange = () => loadFile(input.files[0]);
    async function loadFile(file) {
      if (!file || input.disabled) return;
      try {
        input.disabled = true;
        if (file.size > 8e6) throw Error('Selecione um arquivo de até 8 MB.');
        const extension = file.name.split('.').at(-1).toLowerCase();
        skippedListings = 0;
        if (extension === 'xlsx') rows = await excel(file);
        else {
          const text = await file.text();
          rows = ['json','xml','vrsync'].includes(extension)
            ? structuredRows(text, extension, count => { skippedListings = count; })
            : delimited(text);
        }
        if (rows.length < 2 || rows[0].length < 1) throw Error('Inclua o cabeçalho e ao menos uma linha de dados.');
        if (rows.length > 5001 || rows[0].length > 100) throw Error('Use até 5.000 registros e 100 colunas por arquivo.');
        fileName = file.name;
        originalFile = file;
        const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(Array.from(rows[0],normalize))));
        signature = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
        models = await request(endpoint+'/modelos/'+signature);
        const hasCode = rows[0].some(col => ['code','codigo','cod','codigoimovel'].includes(normalize(col)));
        mapping = Array.from(rows[0],col => hasCode && normalize(col) === 'id' ? '' : Object.keys(aliases).find(k => [k,...aliases[k]].includes(normalize(col))) ?? '');
        source = '';
        if (models.length === 1 && models[0].mapping.length === mapping.length) {
          mapping = models[0].mapping;
          source = models[0].source;
        }
        if (isCurrent()) map();
      } catch (error) {
        if (isCurrent()) report(error.message);
        input.disabled = false;
        input.value = '';
      }
    }
  };
  const map = () => {
    start(2);
    const options = Object.entries(labels);
    if (skippedListings) report(skippedListings+' anúncios fora do formato de venda em reais foram ignorados.');
    app.insertAdjacentHTML('beforeend','<form id="mapping"><div class="box"><h3>'+escape(fileName)+'</h3>'+
      '<label>Origem dos códigos<input required maxlength="100" name="source" value="'+escape(source)+'"></label>'+
      '<label><input type="checkbox" name="pricesOnly"'+(pricesOnly ? ' checked' : '')+'> Atualizar apenas os preços de imóveis existentes</label>'+
      (models.length ? '<p></p><label>Modelo salvo<select id="models"><option value="">Selecionar modelo</option>'+
        models.map((model,index) => '<option value="'+index+'">'+escape(model.source)+'</option>').join('')+'</select></label>' : '')+
      '</div><div class="box table"><table><thead><tr><th>Coluna do arquivo</th><th>Exemplo</th><th>Campo do sistema</th></tr></thead><tbody>'+
      Array.from(rows[0],(column,index) => '<tr><td>'+escape(column || 'Coluna '+(index+1))+'</td><td>'+
        escape(rows.slice(1).find(row => row[index])?.[index])+'</td><td><select name="column'+index+'" aria-label="'+escape(column || 'Coluna '+(index+1))+'">'+
        '<option value="">Ignorar</option>'+options.map(([key,name]) => '<option value="'+key+'"'+
        (mapping[index]===key?' selected':'')+'>'+name+'</option>').join('')+'</select></td></tr>').join('')+
      '</tbody></table></div><label style="display:flex;align-items:center"><input style="width:auto" type="checkbox" name="save" checked> Salvar mapeamento nesta origem</label>'+
      '<div class="row"><button type="button" class="alt" id="choose">Trocar arquivo</button><button type="button" class="alt" id="save-model">Salvar mapeamento agora</button><button id="review">Revisar importação</button></div></form>');
    app.querySelector('#choose').onclick = choose;
    const select = app.querySelector('#models');
    if (select) select.onchange = () => {
      if (!select.value) return;
      const model = models[Number(select.value)];
      if (model.mapping.length !== mapping.length) return;
      mapping = model.mapping;
      source = model.source;
      map();
    };
    const formElement = app.querySelector('#mapping');
    function readMapping() {
      const form = new FormData(formElement);
      source = form.get('source').trim();
      pricesOnly = form.has('pricesOnly');
      mapping = mapping.map((_,i) => form.get('column'+i));
      const mapped = mapping.filter(Boolean);
      if (!source || !mapped.includes('code') || new Set(mapped).size !== mapped.length)
        throw Error('Informe a origem e mapeie o código. Use cada destino uma vez.');
      return form;
    }
    async function saveMapping() {
      await request(endpoint+'/modelos/'+signature,'PUT',{source,mapping});
      const index = models.findIndex(model => model.source === source);
      const model = {source,mapping:[...mapping]};
      if (index < 0) models.push(model);
      else models[index] = model;
    }
    const saveButton = app.querySelector('#save-model');
    saveButton.onclick = async () => {
      saveButton.disabled = true;
      try { readMapping(); await saveMapping(); if (isCurrent()) report('Mapeamento salvo no banco.'); }
      catch (error) { if (isCurrent()) report(error.message); }
      finally { saveButton.disabled = false; }
    };
    formElement.onsubmit = async event => {
      event.preventDefault();
      let form;
      try {
        form = readMapping();
        if (pricesOnly && !mapping.includes('price')) throw Error('Mapeie a coluna de preço.');
      }
      catch (error) { report(error.message); return; }
      const button = app.querySelector('#review');
      button.disabled = true;
      try {
        const codeIndex = mapping.indexOf('code');
        const codes = [...new Set(rows.slice(1).map(row => String(row[codeIndex] ?? '').trim()).filter(code => code.length && code.length <= 80))];
        const existing = await request(endpoint+'/conferencia','POST',{source,codes});
        if (form.has('save')) await saveMapping();
        lookupText = 'Origem '+source+' · '+fileName;
        if (isCurrent()) review((pricesOnly ? preparePriceUpdates : prepare)(rows.slice(1),mapping,existing,source));
      } catch (error) { if (isCurrent()) report(error.message); }
      finally { button.disabled = false; }
    };
  };
  const review = preview => {
    start(3);
    const file = originalFile;
    const valid = preview.filter(row => row.status === 'Criar' || row.status === 'Atualizar');
    const rejected = preview.filter(row => row.status === 'Revisar');
    app.insertAdjacentHTML('beforeend','<p>'+escape(lookupText)+'</p>'+
      importReviewTable(preview,escape,'Registro',row=>row.line)+
      '<div class="row"><button class="alt" id="map">Voltar ao mapeamento</button>'+
      (rejected.length ? '<button class="alt" id="errors">Baixar rejeitados</button>' : '')+
      '<button id="confirm"'+(valid.length ? '' : ' disabled')+'>'+(pricesOnly ? 'Atualizar preços de ' : 'Importar ')+valid.length+' imóveis</button></div>');
    bindReviewFilters(app,preview);
    app.querySelector('#map').onclick = map;
    const errors = app.querySelector('#errors');
    if (errors) errors.onclick = () => download('imoveis-rejeitados.csv','Registro;Código;Motivo\r\n'+
      rejected.map(row => [row.line,row.data.code,row.note].map(csvCell).join(';')).join('\r\n'));
    app.querySelector('#confirm').onclick = async event => {
      const button = event.target;
      button.disabled = true;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 16384)
          binary += String.fromCharCode(...bytes.subarray(offset,offset+16384));
        const result = await request(endpoint+'/confirmacao','POST',{
          source,filename:fileName,originalFile:btoa(binary),pricesOnly,rows:valid.map(({id,data}) => ({id,data}))
        });
        if (isCurrent()) {
          const updatedPrices = pricesOnly;
          choose();
          report(updatedPrices ? result.count+' preço(s) atualizado(s).' : result.count+' imóveis gravados. Os novos cadastros ficam em rascunho. Para exibi-los na vitrine, abra Meus imóveis e use Salvar e publicar no cadastro.'); }
      }
      catch (error) { if (isCurrent()) report(error.message); button.disabled = false; }
    };
  };
  choose();
}
