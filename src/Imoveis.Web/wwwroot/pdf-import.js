import {app, escape, notice, report} from './ui.js';
import {adminNav, bindLogout} from './admin-ui.js';
import {request} from './api.js';
import {prepare} from './imports.js';
import {classifyPdfPages, pdfRowCells, readPdfBlock, ensurePdfCodes, applyPdfCityDefault} from './pdf-rows.js';

import {zoneSelect} from './property-zones.js';

const endpoint = '/api/admin/importacoes';
const columns = [
  ['code','Código',80], ['title','Título',160], ['kind','Tipo',80], ['district','Bairro',100],
  ['city','Cidade',100], ['zone','Zona',40], ['location','Bairro e cidade',200], ['price','Preço',32],
  ['bedrooms','Dormitórios',24], ['size','Área (m²)',32], ['notes','Observações internas',2000]
];
const mapping = columns.map(([key]) => key);

export function mountPdfImport(isCurrent) {
  let file, rows = [], information = [], source = '', model = 'generic';
  let busy = false, scrollObserver;
  function shell(content) {
    scrollObserver?.disconnect();
    app.innerHTML = adminNav() + '<h2>Tratar PDF de imóveis</h2>' + notice + content;
    bindLogout();
  }
  function choose(message = '') {
    shell('<form id="pdf-upload" class="box"><label>Arquivo PDF<input name="file" type="file" accept=".pdf,application/pdf" required></label>' +
      '<label>Modelo de leitura<select name="model"><option value="auto">Identificar automaticamente</option>' +
      '<option value="kallas">Tabelão de empreendimentos Kallas e Kazzas</option><option value="generic">Tabelas por cabeçalho e texto corrido</option></select></label>' +
      '<p class="muted">PDF com texto selecionável, até 8 MB e 100 páginas. Nas tabelas, os cabeçalhos orientam o preenchimento: Valor → Preço, Metragem → Área, Dorms → Dormitórios. Confira os valores na grade antes de importar.</p><button>Extrair texto</button></form>');
    if (message) report(message);
    const form = app.querySelector('#pdf-upload');
    form.onsubmit = async event => {
      event.preventDefault();
      const upload = form.elements.file.files[0];
      if (!upload || busy) return;
      if (upload.size > 8_000_000) { report('Selecione um PDF de até 8 MB.'); return; }
      const button = form.querySelector('button');
      button.disabled = busy = true;
      try {
        const body = new FormData();
        body.append('file',upload);
        const {pages} = await request(endpoint+'/pdf/extrair','POST',body);
        if (!isCurrent()) return;
        const result = classifyPdfPages(pages,form.elements.model.value);
        model = result.model;
        if (result.properties.length > 1000) throw Error('O PDF tem mais de 1.000 imóveis candidatos. Divida o arquivo.');
        file = upload;
        rows = result.properties.map(row => ({...row, selected:true}));
        await ensurePdfCodes(rows);
        rows.forEach(row => applyPdfCityDefault(row.data));
        if (!isCurrent()) return;
        information = result.information;
        source = '';
        edit();
      } catch (error) { if (isCurrent()) report(error.message); }
      finally { button.disabled = busy = false; }
    };
  }

  function edit() {
    const previousGrid = app.querySelector('.pdf-grid');
    const scrollPosition = {top:previousGrid?.scrollTop ?? 0,left:previousGrid?.scrollLeft ?? 0};
    const body = rows.map((row,index) => '<tr data-row="'+index+'"><td><input type="checkbox" data-field="selected" ' +
      (row.selected ? 'checked ' : '') + 'aria-label="Incluir registro '+(index+1)+'"></td><td><button type="button" class="pdf-delete" title="Excluir linha" data-delete-row aria-label="Excluir registro '+(index+1)+'"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg></button></td><td class="pdf-row-review"></td><td>' +
      (row.page ? '<details><summary>Pág. '+row.page+'</summary><pre>'+escape(row.text)+'</pre></details>' : 'Manual') + '</td>' +
      columns.map(([key,label,limit]) => {
        const attributes = ' data-field="'+key+'" maxlength="'+limit+'" aria-label="'+label+' do registro '+(index+1)+'"';
        const value = escape(row.data[key]);
        if (key === 'zone') return '<td>'+zoneSelect(row.data.zone,attributes)+'</td>';
        return key === 'notes' ? '<td><textarea rows="2"'+attributes+'>'+value+'</textarea></td>' :
          '<td><input'+attributes+' value="'+value+'"></td>';
      }).join('') + '</tr>').join('');
    shell('<form id="pdf-review"><section class="box"><h3>'+escape(file.name)+'</h3>' +
      '<label>Origem dos códigos<input name="source" required maxlength="100" value="'+escape(source)+'"></label>' +
      (model === 'kallas' ? '<p class="notice">Modelo Kallas e Kazzas. Cada metragem e preço corresponde a uma opção de empreendimento. ' +
      'Os códigos ausentes são gerados automaticamente. Confira a cidade. Entrega, endereço e vagas estão nas observações internas. ' +
      'Áreas em intervalo precisam de conferência. Os preços são valores a partir de.</p>' : '') +
      '<p class="muted">Confirme os campos sugeridos. Use Excluir para tirar uma linha da grade ou desmarque-a para deixá-la de fora da importação.</p></section>' +
      '<h3>Imóveis candidatos</h3><p id="pdf-review-summary" role="status"></p><p class="muted">Códigos ausentes são gerados automaticamente. Quando o PDF não informa a cidade, usamos São Paulo; você pode alterar. Pendências de publicação não impedem salvar como rascunho.</p>' +
      '<div class="pdf-scrollbar" tabindex="0" role="region" aria-label="Rolar colunas da grade"><div></div></div><div class="box table pdf-grid" tabindex="0" role="region" aria-label="Grade de imóveis"><table><thead><tr><th>Incluir</th><th>Ações</th><th>Revisão</th><th>Origem no PDF</th>' +
      columns.map(([,label])=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>' +
      (body || '<tr><td colspan="15">Nenhum imóvel sugerido. Use um trecho abaixo ou adicione uma linha.</td></tr>') +
      '</tbody></table></div><div class="row"><button type="button" class="alt" id="pdf-back">Trocar PDF</button>' +
      '<button type="button" class="alt" id="pdf-add">Adicionar linha</button><button id="pdf-check">Conferir antes de importar</button></div></form>' +
      '<details class="box pdf-information"><summary>Trechos informativos ('+information.length+')</summary>' +
      (information.length ? information.map((item,index)=>'<div class="pdf-fragment"><p class="muted">Página '+item.page+'</p><pre>'+
        escape(item.text)+'</pre><button type="button" class="alt" data-promote="'+index+'">Usar na grade</button></div>').join('') :
        '<p>Nenhum trecho separado.</p>') + '</details>');
    const form = app.querySelector('#pdf-review');
    const grid = app.querySelector('.pdf-grid'), scrollbar = app.querySelector('.pdf-scrollbar');
    const resizeScroll = () => { scrollbar.firstElementChild.style.width = grid.querySelector('table').scrollWidth+'px'; };
    scrollbar.onscroll = () => { if (grid.scrollLeft !== scrollbar.scrollLeft) grid.scrollLeft = scrollbar.scrollLeft; };
    grid.onscroll = () => { if (scrollbar.scrollLeft !== grid.scrollLeft) scrollbar.scrollLeft = grid.scrollLeft; };
    scrollObserver = new ResizeObserver(resizeScroll);
    scrollObserver.observe(grid);
    resizeScroll();
    grid.scrollTop = scrollPosition.top;
    grid.scrollLeft = scrollbar.scrollLeft = scrollPosition.left;
    function updateIssues() {
      const active = rows.filter(row => row.selected);
      const previews = prepare(active.map(row => pdfRowCells(row.data,mapping)),mapping,[],source);
      let needsReview = 0;
      rows.forEach((row,index) => {
        const preview = row.selected ? previews[active.indexOf(row)] : null;
        const issues = [];
        if (preview?.status === 'Revisar') issues.push(preview.note);
        const missing = ['kind','city','price'].filter(key => !String(row.data[key] ?? '').trim() ||
          (key === 'price' && Number(String(row.data[key]).replace(/R\$|[.\s]/g,'').replace(',','.')) === 0));
        const hasLocationCity = /\s+-\s+[^/]+(?:\/\s*[A-Z]{2})?$/i.test(row.data.location ?? '');
        if (hasLocationCity && missing.includes('city')) missing.splice(missing.indexOf('city'),1);
        if (missing.length) issues.push('Para publicar: '+missing.map(key => columns.find(column => column[0] === key)[1]).join(', '));
        if (!row.data.size && /\d+\s+a\s+\d+.*m[²2]/i.test(row.text ?? '')) issues.push('Conferir área: intervalo no PDF');
        if (row.selected && issues.length) needsReview++;
        const tr = grid.querySelector('[data-row="'+index+'"]');
        tr.querySelector('.pdf-row-review').innerHTML = !row.selected ? '<span class="muted">Fora da importação</span>' :
          issues.length ? '<span class="pdf-review-badge">Revisar</span><ul>'+issues.map(issue => '<li>'+escape(issue)+'</li>').join('')+'</ul>' : '<span class="pdf-ready">Pronto para conferir</span>';
        tr.querySelectorAll('[data-field]').forEach(input => {
          const key = input.dataset.field;
          const label = columns.find(column => column[0] === key)?.[1];
          input.classList.toggle('pdf-needs-review',Boolean(row.selected && (missing.includes(key) ||
            (key === 'size' && issues.some(issue => issue.startsWith('Conferir área'))) ||
            (label && preview?.status === 'Revisar' && preview.note.toLowerCase().includes(label.toLowerCase())))));
          if (key === 'code') input.value = row.data.code ?? '';
          if (key === 'code') input.title = row.generatedCode ? 'Código gerado automaticamente; você pode editar.' : '';
        });
      });
      app.querySelector('#pdf-review-summary').textContent = active.length+' selecionado(s) · '+needsReview+' com pendências para revisar';
    }
    updateIssues();
    form.oninput = event => {
      if (event.target.name === 'source') source = event.target.value;
      const row = event.target.closest('tr[data-row]');
      if (!row) return;
      const item = rows[Number(row.dataset.row)];
      const key = event.target.dataset.field;
      if (key === 'selected') item.selected = event.target.checked;
      else if (key) { item.data[key] = event.target.value; if (key === 'code') item.generatedCode = false; }
      updateIssues();
    };
    form.onclick = event => {
      const button = event.target.closest('[data-delete-row]');
      if (!button || busy) return;
      const index = Number(button.closest('tr[data-row]').dataset.row);
      rows.splice(index, 1);
      edit();
      const nextIndex = Math.min(index, rows.length - 1);
      const next = rows.length ? app.querySelector('tr[data-row="'+nextIndex+'"] [data-delete-row]') : app.querySelector('#pdf-add');
      next?.focus();
      report('Linha removida da revisão.');
    };
    app.querySelector('#pdf-back').onclick = () => { if (!busy && window.confirm('Trocar o PDF e descartar a revisão atual?')) choose(); };
    async function insert(item) {
      if (busy) return;
      if (rows.length >= 1000) { report('O limite desta revisão é 1.000 linhas.'); return; }
      busy = true;
      try {
        rows.push({...item,selected:true});
        await ensurePdfCodes(rows);
        applyPdfCityDefault(rows[rows.length-1].data);
        if (!isCurrent()) return;
        edit();
        app.querySelector('tr[data-row="'+(rows.length-1)+'"] input[data-field="code"]').focus();
      } catch (error) { if (isCurrent()) report(error.message); }
      finally { busy = false; }
    }
    app.querySelector('#pdf-add').onclick = () => insert({data:{}});
    app.querySelector('.pdf-information').onclick = event => {
      const button = event.target.closest('[data-promote]');
      if (!button || busy) return;
      const item = information[Number(button.dataset.promote)];
      insert({...item,data:readPdfBlock(item.text)});
    };
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy) return;
      source = form.elements.source.value.trim();
      const selected = rows.filter(row => row.selected);
      if (!selected.length || !source) { report('Informe a origem e selecione os imóveis que serão conferidos.'); return; }
      const controls = [...app.querySelectorAll('#pdf-review input, #pdf-review textarea, #pdf-review select, #pdf-review button, [data-promote]')];
      busy = true;
      controls.forEach(control => { control.disabled = true; });
      try {
        await ensurePdfCodes(rows);
        if (!isCurrent()) return;
        updateIssues();
        const cells = selected.map(row => pdfRowCells(row.data,mapping));
        const codes = [...new Set(cells.map(cell => cell[0].trim()).filter(code => code.length && code.length <= 80))];
        const prior = await request(endpoint+'/conferencia','POST',{source,codes});
        if (isCurrent()) review(prepare(cells,mapping,prior,source), selected);
      } catch (error) { if (isCurrent()) report(error.message); }
      finally { busy = false; controls.forEach(control => { control.disabled = false; }); }
    };
  }

  function review(preview, selected) {
    const valid = preview.filter(row => row.status === 'Criar' || row.status === 'Atualizar');
    const hasErrors = preview.some(row => row.status === 'Revisar');
    shell('<p>'+escape(file.name)+' · '+escape(source)+'</p>' +
      '<div class="box table"><table><thead><tr><th>Página</th><th>Código</th><th>Resultado</th><th>Detalhes</th></tr></thead><tbody>' +
      preview.map((row,i)=>'<tr><td>'+ (selected[i].page ?? 'Manual') + '</td><td>'+escape(row.data.code)+'</td><td>'+
        escape(row.status)+'</td><td>'+escape(row.note)+'</td></tr>').join('')+'</tbody></table></div>' +
      (hasErrors ? '<p>Volte à grade para corrigir ou desmarcar as linhas em revisão.</p>' : '') +
      '<div class="row"><button type="button" class="alt" id="pdf-edit">Voltar à grade</button>' +
      '<button type="button" id="pdf-confirm"'+(!valid.length || hasErrors ? ' disabled' : '')+'>Importar '+valid.length+' imóvel(is)</button></div>');
    const back = app.querySelector('#pdf-edit');
    back.onclick = edit;
    app.querySelector('#pdf-confirm').onclick = async event => {
      const button = event.currentTarget;
      button.disabled = back.disabled = true;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 16384)
          binary += String.fromCharCode(...bytes.subarray(offset, offset+16384));
        const result = await request(endpoint+'/confirmacao','POST',{
          source,filename:file.name,originalFile:btoa(binary),rows:valid.map(({id,data})=>({id,data}))
        });
        if (isCurrent()) choose(result.count+' imóvel(is) gravado(s). Novos imóveis ficam em rascunho.');
      } catch (error) {
        if (isCurrent()) report(error.message);
        button.disabled = back.disabled = false;
      }
    };
  }

  choose();
}
