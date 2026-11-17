const encoder = new TextEncoder();
const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').slice(0,32767)
  .replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const letter = index => { let name=''; for(index++;index;index=Math.floor((index-1)/26)) name=String.fromCharCode(65+(index-1)%26)+name; return name; };
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const metadata = ['ID da revisão','Incluir','Página','Texto original','Origem dos códigos'];

// Store strings as text cells, preserving codes, accents and literal formula-like text.
function sheet(rows, widths = [], hiddenFirst = false, validations = []) {
  const count = rows.reduce((count,row)=>Math.max(count,row.length),1);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="'+ns+'">'+
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
    '<cols>'+Array.from({length:count},(_,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+(widths[i]??22)+'" customWidth="1"'+(hiddenFirst && !i ? ' hidden="1"' : '')+'/>').join('')+'</cols>'+
    '<sheetData>'+rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>'<c r="'+letter(j)+(i+1)+'" t="inlineStr" s="'+(i?0:1)+'"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData>'+
    '<autoFilter ref="A1:'+letter(count-1)+rows.length+'"/>'+
    (validations.length ? '<dataValidations count="'+validations.length+'">'+validations.map(([column,choices])=>
      '<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="'+letter(column)+'2:'+letter(column)+'1001"><formula1>'+xml('"'+choices.join(',')+'"')+'</formula1></dataValidation>').join('')+'</dataValidations>' : '')+'</worksheet>';
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for(let bit=0;bit<8;bit++) crc = (crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^0xffffffff)>>>0;
}
function zip(files) {
  const local = [], central = [];
  let offset = 0, directorySize = 0;
  for (const [path,content] of Object.entries(files)) {
    const name=encoder.encode(path), bytes=encoder.encode(content), crc=crc32(bytes);
    const header=new Uint8Array(30+name.length), view=new DataView(header.buffer);
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(12,33,true);
    view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,name.length,true);header.set(name,30);
    const entry=new Uint8Array(46+name.length), dir=new DataView(entry.buffer);
    dir.setUint32(0,0x02014b50,true);dir.setUint16(4,20,true);dir.setUint16(6,20,true);dir.setUint16(14,33,true);
    dir.setUint32(16,crc,true);dir.setUint32(20,bytes.length,true);dir.setUint32(24,bytes.length,true);dir.setUint16(28,name.length,true);dir.setUint32(42,offset,true);entry.set(name,46);
    local.push(header,bytes);central.push(entry);offset+=header.length+bytes.length;directorySize+=entry.length;
  }
  const end=new Uint8Array(22), view=new DataView(end.buffer);
  view.setUint32(0,0x06054b50,true);view.setUint16(8,central.length,true);view.setUint16(10,central.length,true);
  view.setUint32(12,directorySize,true);view.setUint32(16,offset,true);
  const result=new Uint8Array(offset+directorySize+22);let position=0;
  for(const bytes of [...local,...central,end]){result.set(bytes,position);position+=bytes.length;}
  return result;
}

export function pdfWorkbook(rows, information, columns, source) {
  const headers = [...metadata,...columns.map(([,label])=>label)];
  const data = [headers,...rows.map(row=>[row.exchangeId,row.selected?'Sim':'Não',row.page??'',row.text??'',source,...columns.map(([key])=>row.data[key]??'')])];
  const zoneIndex = columns.findIndex(([key])=>key==='zone');
  const validations = [[1,['Sim','Não']]];
  if (zoneIndex>=0) validations.push([metadata.length+zoneIndex,['Centro','Zona Norte','Zona Sul','Zona Leste','Zona Oeste']]);
  const sheets = [
    ['Imóveis',sheet(data,[24,10,10,45,25,...columns.map(([key])=>key==='notes'?60:24)],true,validations)],
    ['Informações',sheet([['Página','Texto informativo'],...information.map(item=>[item.page,item.text])],[10,100])],
    ['Instruções',sheet([['Como corrigir'],['Edite a primeira aba: Imóveis. Mantenha os nomes das colunas.'],
      ['Altere os campos e use Incluir = Não para deixar uma linha fora da importação. Pode excluir linhas e reordená-las.'],
      ['Zona: Centro, Zona Norte, Zona Sul, Zona Leste ou Zona Oeste.'],
      ['Mantenha os códigos para atualizar os mesmos imóveis. Códigos vazios serão gerados novamente.'],
      ['A coluna oculta ID da revisão e as colunas Página / Texto original preservam a referência ao PDF.'],
      ['A aba Informações é apenas para consulta; não é importada como imóveis.'],
      ['Salve como .xlsx e use Carregar Excel corrigido em Tratar PDF. A planilha substitui a grade atual.'],
      ['A conferência continua obrigatória antes de gravar. Novos imóveis ficam em rascunho.'],
      ['Na mesma revisão, o histórico mantém o PDF original. Ao retomar só com o Excel, o histórico guarda a planilha.']], [115])]
  ];
  const files = {
    '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>',
    '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map(([name],i)=>'<sheet name="'+name+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':'<?xml version="1.0"?><styleSheet xmlns="'+ns+'"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf fontId="1" applyFont="1" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
  };
  sheets.forEach(([,content],i)=>{files['xl/worksheets/sheet'+(i+1)+'.xml']=content;});
  return zip(files);
}

export function pdfCorrections(cells, prior, columns) {
  if (!cells.length) throw Error('A planilha está vazia.');
  const headers = cells[0].map(normalize);
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw Error('Há cabeçalhos repetidos na planilha.');
  const required = columns.map(([,label])=>label);
  const absent = required.filter(label=>!headers.includes(normalize(label)));
  if (absent.length) throw Error('Mantenha as colunas da exportação: '+absent.join(', '));
  const read = (row,label) => String(row[headers.indexOf(normalize(label))]??'');
  const byId = new Map(prior.filter(row=>row.exchangeId).map(row=>[row.exchangeId,row]));
  const ids = new Set(), sources = new Set();
  const rows = [];
  for(const cellsRow of cells.slice(1)) {
    const data = Object.fromEntries(columns.map(([key,label])=>[key,read(cellsRow,label)]));
    if (!Object.values(data).some(value=>value.trim())) continue;
    const id = read(cellsRow,metadata[0]);
    if(id && ids.has(id)) throw Error('ID da revisão repetido. Para incluir uma nova linha, deixe o ID vazio.');
    if(id) ids.add(id);
    const include = normalize(read(cellsRow,'Incluir'));
    if(!['','sim','s','true','1','nao','n','false','0'].includes(include)) throw Error('Use Sim ou Não na coluna Incluir.');
    const original = byId.get(id);
    const page = Number(read(cellsRow,'Página'));
    const source = read(cellsRow,'Origem dos códigos').trim();
    if(source) sources.add(source);
    rows.push({exchangeId:id || undefined,selected:!['nao','n','false','0'].includes(include),data,
      page:original?.page ?? (Number.isInteger(page) && page>0 && page<=100 ? page : undefined),
      text:original?.text ?? read(cellsRow,'Texto original')});
  }
  if(!rows.length || rows.length>1000) throw Error('A planilha deve conter de 1 a 1.000 imóveis.');
  if(sources.size>1) throw Error('Use a mesma origem dos códigos em toda a planilha.');
  return {rows,source:[...sources][0]??''};
}
