import {escape} from './ui.js';

export const standardKinds = [
  'Apartamento', 'Casa', 'Chácara', 'Cobertura', 'Galpão',
  'Sala comercial', 'Sobrado', 'Sítio', 'Terreno'
];

export function kindSelect(kinds, current, placeholder) {
  const options = new Map();
  const key = value => value.toLocaleLowerCase('pt-BR');
  for (const kind of kinds) {
    if (!options.has(key(kind))) options.set(key(kind), kind);
  }
  if (current) options.set(key(current), current);
  const entries = [...options.values()].sort((a,b) => a.localeCompare(b,'pt-BR'));
  return '<select name="kind"><option value="">' + escape(placeholder) + '</option>' +
    entries.map(kind => '<option value="' + escape(kind) + '"' + (kind === current ? ' selected' : '') +
      '>' + escape(kind) + '</option>').join('') + '</select>';
}
