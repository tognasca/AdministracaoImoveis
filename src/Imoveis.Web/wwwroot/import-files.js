export function delimited(raw){
 const text=raw.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/)[0];const delimiter=[';','\t',',','|'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
 let rows=[],row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else if(quoted||!field)quoted=!quoted;else field+=c}else if(!quoted&&(c===delimiter||c==='\n'||c==='\r')){row.push(field);field='';if(c!==delimiter){if(c==='\r'&&text[i+1]==='\n')i++;rows.push(row);row=[]}}else field+=c}
 if(quoted)throw Error('O arquivo tem aspas abertas.');row.push(field);rows.push(row);return rows.filter(r=>r.some(v=>v.trim()));
}
export async function excel(file){
 const bytes=await file.arrayBuffer(),d=new DataView(bytes),decoder=new TextDecoder(),entries=new Map();
 let end=bytes.byteLength-22;while(end>=Math.max(0,bytes.byteLength-65557)&&d.getUint32(end,true)!==0x06054b50)end--;if(end<0||d.getUint32(end,true)!==0x06054b50)throw Error('Excel inválido.');
 let p=d.getUint32(end+16,true);
 for(let i=0;i<d.getUint16(end+10,true);i++){const nameLen=d.getUint16(p+28,true),name=decoder.decode(new Uint8Array(bytes,p+46,nameLen));entries.set(name,{method:d.getUint16(p+10,true),length:d.getUint32(p+20,true),size:d.getUint32(p+24,true),offset:d.getUint32(p+42,true)});p+=46+nameLen+d.getUint16(p+30,true)+d.getUint16(p+32,true)}
 async function xml(path){const entry=entries.get(path);if(!entry||entry.size>12e6)throw Error('Planilha ausente ou grande demais para a demonstração.');const {offset,length,method}=entry,start=offset+30+d.getUint16(offset+26,true)+d.getUint16(offset+28,true);const blob=new Blob([bytes.slice(start,start+length)]);let data;if(method===0)data=await blob.text();else if(method===8)data=await new Response(blob.stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();else throw Error('Compactação do Excel incompatível.');return new DOMParser().parseFromString(data,'application/xml')}
 const book=await xml('xl/workbook.xml'),rels=await xml('xl/_rels/workbook.xml.rels'),sheetId=book.querySelector('sheet')?.getAttribute('r:id'),target=[...rels.getElementsByTagName('Relationship')].find(r=>r.getAttribute('Id')===sheetId)?.getAttribute('Target');if(!target)throw Error('A primeira aba não foi encontrada.');
 const shared=entries.has('xl/sharedStrings.xml')?[...(await xml('xl/sharedStrings.xml')).getElementsByTagName('si')].map(n=>[...n.getElementsByTagName('t')].map(t=>t.textContent).join('')):[];
 const sheet=await xml(new URL(target,'https://example.invalid/xl/workbook.xml').pathname.slice(1));
 return [...sheet.getElementsByTagName('row')].map(r=>{const row=[];for(const c of r.getElementsByTagName('c')){const col=(c.getAttribute('r')||'A').match(/^[A-Z]+/)[0];let i=0;for(const x of col)i=i*26+x.charCodeAt(0)-64;const v=c.getElementsByTagName('v')[0]?.textContent??'';row[i-1]=c.getAttribute('t')==='s'?shared[+v]??'':c.getAttribute('t')==='inlineStr'?[...c.getElementsByTagName('t')].map(t=>t.textContent).join(''):v}return row}).filter(r=>r.some(Boolean));
}
