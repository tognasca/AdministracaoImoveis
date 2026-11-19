const fieldsByLabel = {
  codigo:'code', cod:'code', referencia:'code', ref:'code', codigoimovel:'code',
  titulo:'title', imovel:'title', descricao:'title', tipo:'kind', tipoimovel:'kind', ctipo:'kind',
  bairro:'district', zona:'zone', regiao:'zone', zonacidade:'zone', cidade:'city', municipio:'city', local:'location', localizacao:'location',
  preco:'price', valor:'price', vlvenda:'price', precovenda:'price', valorvenda:'price',
  quartos:'bedrooms', dormitorios:'bedrooms', area:'size', aream2:'size', metragem:'size',
  obs:'notes', observacoes:'notes', observacao:'notes',
  empreendimento:'title', nome:'title', dorm:'bedrooms', dorms:'bedrooms',
  valorimovel:'price', valorr:'price', precor:'price', apartirde:'price',
  areautil:'size', areautilm2:'size', areaprivativa:'size', areaprivativam2:'size',
  metragemm2:'size', end:'address', endereco:'address', entrega:'delivery', vagas:'parking'
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
      const detected = readTableHeader(raw);
      if (detected) {
        flush();
        header = detected;
        information.push({page:index + 1,text:line,data:{}});
        continue;
      }
      if (header && !/^[-+|;=\s]+$/.test(line)) {
        const cells = tableCells(raw,header);
        const data = {};
        header.columns.forEach((column,i) => {
          if (column.key && cells[i]) data[column.key] = cells[i];
        });
        const numericPrice = /^(?:R\$\s*)?\d[\d.,\s]*$/.test(data.price ?? '');
        const codedRow = /^[\w.-]+$/.test(data.code ?? '') && (data.title || data.kind);
        if ((numericPrice && (data.title || data.kind || data.code || data.size)) ||
            (!data.price && codedRow)) {
          flush();
          for (const key of ['price','size']) {
            if (data[key]) {
              const value = data[key].replace(/R\$|m[²2]|\s/g, '');
              data[key] = catalogNumber(value) || data[key];
            }
          }
          const extras = header.columns.flatMap((column,i) =>
            cells[i] && (!column.key || ['address','delivery','parking'].includes(column.key)) ?
              [column.label + ': ' + cells[i]] : []);
          for (const key of ['address','delivery','parking']) delete data[key];
          if (extras.length) data.notes = [data.notes,...extras].filter(Boolean).join('\n');
          properties.push({page:index + 1,text:line,data});
          continue;
        }
        // A text block ends the table; never reuse its column positions for prose.
        if (!/^[-+|;=\s]+$/.test(line)) header = null;
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

// pdftotext -layout preserves column positions, including empty cells.
function readTableHeader(raw) {
  const delimiter = raw.includes('|') ? '|' : raw.includes(';') ? ';' : null;
  let columns;
  if (delimiter) {
    columns = raw.trim().split(delimiter).map(label => ({label:label.trim(),key:field(label.trim())}));
  } else {
    columns = [...raw.matchAll(/\S(?:.*?\S)?(?=\s{2,}|$)/g)]
      .map(match => ({label:match[0],key:field(match[0]),start:match.index}));
  }
  const keys = columns.map(column => column.key).filter(Boolean);
  if (keys.length < 2 || new Set(keys).size !== keys.length ||
      !(keys.includes('price') || keys.includes('code')) || !keys.some(key => ['code','title','kind','size'].includes(key))) return null;
  return {delimiter,columns};
}

function tableCells(raw,header) {
  if (header.delimiter) {
    const cells = raw.trim().split(header.delimiter).map(cell => cell.trim());
    return cells.length === header.columns.length ? cells : [];
  }
  // Boundaries follow the header, so a missing cell never shifts later values.
  return header.columns.map((column,i) => raw.slice(i ? column.start : 0,
    header.columns[i+1]?.start).trim());
}

export function pdfRowCells(data, mapping) {
  return mapping.map(key => {
    const value = String(data[key] ?? '');
    return key === 'size' ? value.replace(/\s*m(?:²|2)\s*$/i, '') : value;
  });
}

// Recognize catalog variants without assuming one supplier's fixed column layout.
const normalizedCatalogLabel = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const catalogHeader = line => {
  const value = normalizedCatalogLabel(line);
  return /metragem|area/.test(value) && /dorm|quarto|suite/.test(value) && /vaga/.test(value);
};
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
  let project = null, zone = '';
  pages.forEach((page, index) => {
    let pendingMetadata = null;
    let pendingName = '';
    for (const raw of page.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const region = line.match(/^ZONA\s+(NORTE|SUL|LESTE|OESTE)$|^(CENTRO)$/i);
      if (region) {
        zone = region[2] ? 'Centro' : 'Zona '+region[1][0].toUpperCase()+region[1].slice(1).toLowerCase();
        // Centro may be the district below the current project, rather than a new section.
        if (!region[2]) {
          project = null;
          pendingMetadata = null;
          pendingName = '';
        }
        information.push({page:index+1,text:line,data:{}});
        continue;
      }
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
      if (catalogHeader(line) && pendingMetadata) {
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
        ...(zone ? {zone} : {}),
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
          'Confirmar cidade e dados antes de publicar.'
        ].join('\n')
      };
      properties.push({page:index+1,text:project.name+'\nEntrega: '+project.delivery+'\n'+project.address+'\n'+line,data});
    }
  });
  return {properties,information};
}

// A stable identity allows importing the same option again after its price changes.
export async function ensurePdfCodes(rows) {
  const used = new Set(rows.map(row => String(row.data.code ?? '').trim().toLowerCase()).filter(Boolean));
  for (const row of rows) {
    if (String(row.data.code ?? '').trim()) continue;
    const data = row.data;
    const address = (data.notes ?? '').match(/(?:Endereço informado|Endereço):\s*([^\n]+)/i)?.[1] ?? '';
    const identity = [data.title,data.kind,data.district,data.city,data.location,data.size,data.bedrooms,address]
      .map(value => String(value ?? '').trim().toLowerCase().normalize('NFC'));
    if (!identity.some(Boolean)) identity.push(row.text ?? crypto.randomUUID());
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identity)));
    const base = 'PDF-'+Array.from(new Uint8Array(digest).slice(0,10),v => v.toString(16).padStart(2,'0')).join('').toUpperCase();
    let code = base, suffix = 2;
    while (used.has(code.toLowerCase())) code = base+'-'+suffix++;
    data.code = code;
    row.generatedCode = true;
    used.add(code.toLowerCase());
  }
}

export function applyPdfCityDefault(data) {
  if (String(data.city ?? '').trim()) return;
  const location = String(data.location ?? '').match(/^(.+?)\s+-\s+([^/]+)(?:\/\s*[A-Z]{2})?$/i);
  data.city = location?.[2]?.trim() || 'São Paulo';
}
