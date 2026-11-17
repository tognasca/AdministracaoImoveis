const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);
export const standardZones = ['Centro','Zona Norte','Zona Sul','Zona Leste','Zona Oeste'];
export function normalizeZone(value) {
  const text = String(value ?? '').trim();
  const key = text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.\s_-]/g,'');
  return ({centro:'Centro',central:'Centro',zonacentral:'Centro',norte:'Zona Norte',zonanorte:'Zona Norte',zn:'Zona Norte',
    sul:'Zona Sul',zonasul:'Zona Sul',zs:'Zona Sul',leste:'Zona Leste',zonaleste:'Zona Leste',zl:'Zona Leste',
    oeste:'Zona Oeste',zonaoeste:'Zona Oeste',zo:'Zona Oeste'})[key] ?? text;
}
export function zoneSelect(current, attributes = 'name="zone"') {
  const value = normalizeZone(current);
  const zones = standardZones.includes(value) || !value ? standardZones : [value,...standardZones];
  return '<select '+attributes+'><option value="">Não informada</option>'+zones.map(zone =>
    '<option value="'+escape(zone)+'"'+(zone === value ? ' selected' : '')+'>'+escape(zone)+
    (standardZones.includes(zone) ? '' : ' (revisar)')+'</option>').join('')+'</select>';
}
