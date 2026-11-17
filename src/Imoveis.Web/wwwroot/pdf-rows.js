const fieldsByLabel = {
  codigo:'code', cod:'code', referencia:'code', ref:'code', codigoimovel:'code',
  titulo:'title', imovel:'title', descricao:'title', tipo:'kind', tipoimovel:'kind', ctipo:'kind',
  bairro:'district', cidade:'city', municipio:'city', local:'location', localizacao:'location',
  preco:'price', valor:'price', vlvenda:'price', precovenda:'price', valorvenda:'price',
  quartos:'bedrooms', dormitorios:'bedrooms', area:'size', aream2:'size', metragem:'size',
  obs:'notes', observacoes:'notes', observacao:'notes'
};

const field = label => fieldsByLabel[label.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]/g,'')];
const propertyTitle = /^(?:apartamento|apto\.?|casa|sobrado|cobertura|terreno|chácara|sítio|galpão|studio|sala comercial)\b/i;

export function readPdfBlock(text) {
  const data = {};
  for (const line of text.split('\n')) {
    const label = line.match(/^([^:\n]{1,40}):\s*(.+)$/);
    if (label && field(label[1])) data[field(label[1])] = label[2].trim();
    else if (!data.title && propertyTitle.test(line)) data.title = line.split(/\s*R\$/i)[0].trim();
  }
  data.code ??= text.match(/\b(?:ref\.?|c[oó]d(?:igo)?\.?)\s*[:#-]?\s*([\w-]*\d[\w-]*)\b/i)?.[1];
  data.price ??= text.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i)?.[1];
  data.size ??= text.match(/(\d+(?:[,.]\d+)?)\s*m(?:²|2)/i)?.[1];
  data.bedrooms ??= text.match(/\b(\d+)\s+(?:quartos?|dormit[oó]rios?)\b/i)?.[1];
  return data;
}

export function classifyPdfPages(pages, model = 'auto') {
  const selected = model === 'auto' ? detectPdfModel(pages) : model;
  const result = selected === 'kallas' ? classifyKallasPages(pages) : classifyGenericPages(pages);
  return {...result, model:selected};
}

function classifyGenericPages(pages) {
  const properties = [], information = [];
  pages.forEach((page, index) => {
    let header = null;
    let block = [];
    const flush = () => {
      if (!block.length) return;
      const text = block.join('\n');
      const data = readPdfBlock(text);
      const entry = {page:index + 1,text,data};
      if ((data.code && (data.title || data.kind || data.price)) || (data.title && data.price))
        properties.push(entry);
      else information.push(entry);
      block = [];
    };
    for (const raw of page.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      const cells = line.split(/\s{2,}|\s*\|\s*|\s*;\s*/);
      const mapped = cells.map(field);
      const recognized = mapped.filter(Boolean);
      if (recognized.length >= 2 && recognized.includes('code') && new Set(recognized).size === recognized.length) {
        flush();
        header = mapped;
        information.push({page:index + 1,text:line,data:{}});
        continue;
      }
      if (header && cells.length === header.length && cells[header.indexOf('code')]) {
        const data = Object.fromEntries(header.flatMap((key, i) => key && cells[i] ? [[key,cells[i]]] : []));
        if (/^[\w.-]+$/.test(data.code) && (data.title || data.kind || /\d/.test(data.price ?? ''))) {
          flush();
          properties.push({page:index + 1,text:line,data});
          continue;
        }
      }
      if (block.length && (/^(?:ref\.?|c[oó]d(?:igo)?\.?)\s*[:#]/i.test(line) || propertyTitle.test(line))) {
        const prior = readPdfBlock(block.join('\n'));
        if (prior.title || prior.kind || prior.price) flush();
      }
      block.push(line);
    }
    flush();
  });
  return {properties,information};
}

export function pdfRowCells(data, mapping) {
  return mapping.map(key => {
    const value = String(data[key] ?? '');
    return key === 'size' ? value.replace(/\s*m(?:²|2)\s*$/i, '') : value;
  });
}

const projectPattern = /^(.+?)\s{2,}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2}|PRONTO)\s{2,}(.+)$/i;
const optionPattern = /^(.*?)\s{2,}(.*?)\s{2,}(.*?)\s+R\$\s*([\d.,]+)/i;

export function detectPdfModel(pages) {
  const text = pages.join('\n');
  return /\b(?:KALLAS|KAZZAS)\b/i.test(text) &&
    /Empreend\./i.test(text) && /A partir de/i.test(text) ? 'kallas' : 'generic';
}

function catalogNumber(value) {
  if (/^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(value) || /^\d+\.\d{2}$/.test(value))
    return value.replaceAll(',', '');
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value) || /^\d+,\d{1,2}$/.test(value))
    return value.replaceAll('.', '').replace(',', '.');
  return /^\d+$/.test(value) ? value : '';
}

function classifyKallasPages(pages) {
  const properties = [], information = [];
  let project = null;
  pages.forEach((page, index) => {
    let pendingMetadata = null;
    let pendingName = '';
    for (const raw of page.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (/Empreend\..*Entrega.*Endere[cç]o/i.test(line)) {
        project = null;
        pendingMetadata = null;
        pendingName = '';
        information.push({page:index+1,text:line,data:{}});
        continue;
      }
      const dateOnly = line.match(/^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2}|PRONTO)\s{2,}(.+)$/i);
      if (dateOnly) {
        pendingMetadata = {delivery:dateOnly[1],address:dateOnly[2].trim()};
        information.push({page:index+1,text:line,data:{}});
        continue;
      }
      if (/METRAGEM.*DORMS.*VAGAS/i.test(line) && pendingMetadata) {
        if (pendingName) project = {name:pendingName,...pendingMetadata};
        pendingMetadata = null;
      } else if (pendingMetadata) {
        pendingName = line;
      }
      const metadata = line.match(projectPattern);
      if (metadata) {
        project = {name:metadata[1].trim(), delivery:metadata[2], address:metadata[3].trim()};
        information.push({page:index+1,text:line,data:{}});
        continue;
      }
      const option = line.match(optionPattern);
      if (!option || !project || !/m\s*[²2]/i.test(option[1])) {
        information.push({page:index+1,text:line,data:{}});
        continue;
      }
      const [, variant, rooms, parking, price] = option;
      const area = variant.match(/^(\d[\d.,]*)\s*m\s*[²2]/i);
      const amount = catalogNumber(price);
      const kind = /loja/i.test(variant + ' ' + rooms) ? 'Loja' :
        /cobertura/i.test(variant) ? 'Cobertura' : /studio/i.test(rooms) ? 'Studio' : 'Apartamento';
      const data = {
        title:project.name + ' — ' + variant.trim(),
        kind,
        price:amount || price,
        size:area ? catalogNumber(area[1]) : '',
        bedrooms:rooms.match(/^\d+/)?.[0] ?? '',
        notes:[
          'Empreendimento: ' + project.name,
          'Entrega informada: ' + project.delivery,
          'Endereço informado: ' + project.address,
          'Opção: ' + variant.trim(),
          'Dormitórios ou suítes no PDF: ' + rooms.trim(),
          'Vagas no PDF: ' + parking.trim(),
          'Preço a partir de, sujeito à confirmação de disponibilidade.',
          'Preencher código e confirmar cidade antes de publicar.'
        ].join('\n')
      };
      properties.push({page:index+1,text:project.name+'\nEntrega: '+project.delivery+'\n'+project.address+'\n'+line,data});
    }
  });
  return {properties,information};
}
