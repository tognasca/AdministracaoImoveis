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

export function classifyPdfPages(pages) {
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
