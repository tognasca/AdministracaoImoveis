import {app, escape, link, money} from './ui.js';
import {request} from './api.js';
import {kindSelect} from './property-kinds.js';
import {propertyDetail} from './property-detail.js';

const filters = [
  ['q', 'Localização ou imóvel', 'type="search" maxlength="120" placeholder="Cidade, bairro ou código"'],
  ['kind', 'Tipo de imóvel'],
  ['maxPrice', 'Preço máximo (R$)', 'type="number" min="0" step="0.01" placeholder="Sem limite"'],
  ['bedrooms', 'Mínimo de dormitórios', 'type="number" min="0" max="1000" placeholder="Qualquer"']
];

const photoUrl = (id, photo) => '/media/' + encodeURIComponent(id) + '/' + encodeURIComponent(photo);
const locationLabel = data => [data.district, data.city].filter(Boolean).map(escape).join(' · ');
const facts = data => [
  data.bedrooms > 0 ? data.bedrooms + (data.bedrooms === 1 ? ' dormitório' : ' dormitórios') : '',
  data.size > 0 ? Number(data.size).toLocaleString('pt-BR') + ' m²' : ''
].filter(Boolean);
function listingCard(home) {
  const d = home.data;
  const href = '/#imovel/' + encodeURIComponent(home.id);
  const features = facts(d);
  const place = locationLabel(d);
  const photo = home.photos[0];
  const cover = photo ? '<img class="listing-image" src="' + escape(photoUrl(home.id, photo)) +
    '" alt="" loading="lazy" decoding="async">' : '<span class="listing-placeholder">Sem foto cadastrada</span>';
  return '<article class="listing-card"><a class="listing-link" href="' + href + '">' +
    '<div class="listing-cover' + (photo ? '' : ' listing-cover-empty') + '">' + cover +
    '<div class="listing-caption">' +
    (d.kind ? '<p class="listing-kind">' + escape(d.kind) + '</p>' : '') +
    '<h3>' + escape(d.title) + '</h3>' +
    (place ? '<p class="listing-location">' + place + '</p>' : '') + '</div></div>' +
    '<div class="listing-body"><div class="listing-property-data"><strong>' + money(d.price) + '</strong>' +
    (features.length ? '<ul class="listing-facts">' + features.map(value => '<li>' + value + '</li>').join('') + '</ul>' : '') +
    '</div><span class="listing-card-action">Ver imóvel <span aria-hidden="true">↗</span></span></div></a></article>';
}

function showBrand(settings) {
  const color = /^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : '#6B5140';
  const channels = color.slice(1).match(/../g).map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  const luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  const blackContrast = (luminance + .05) / .05;
  const whiteContrast = 1.05 / (luminance + .05);
  let darkText = blackContrast >= whiteContrast;
  if (settings.textColor === 'black' && blackContrast >= 4.5) darkText = true;
  if (settings.textColor === 'white' && whiteContrast >= 4.5) darkText = false;
  document.body.style.setProperty('--estate-accent', color);
  document.body.style.setProperty('--estate-on-accent', darkText ? '#000' : '#fff');
  document.body.style.setProperty('--estate-accent-shade', darkText ? '#fff' : '#000');
  const name = settings.name || 'Imóveis Cotia';
  document.title = name;
  const brandMarkup = (settings.logo ? '<img class="site-logo" src="' + escape(settings.logo) + '" alt="">' : '') +
    '<span>' + escape(name) + '</span>';
  document.querySelector('header .brand').innerHTML = brandMarkup;
  document.querySelector('.footer-brand').innerHTML = brandMarkup;
}

function showMenu(settings, category, gallery) {
  const items = settings.menu ?? [];
  const menuMarkup = items.map(item => {
    if (item.kind === 'category')
      return '<a href="/#vitrine?category=' + encodeURIComponent(item.id) + '"' +
        (item.id === category ? ' aria-current="page"' : '') + '>' + escape(item.name) + '</a>';
    if (item.kind === 'gallery')
      return '<a href="/#vitrine?gallery=true"' + (gallery ? ' aria-current="page"' : '') + '>' + escape(item.name) + '</a>';
    if (item.kind === 'contact' && settings.whatsapp)
      return '<a href="https://wa.me/' + escape(settings.whatsapp) + '" target="_blank" rel="noopener noreferrer">' +
        escape(item.name) + '</a>';
    return '';
  }).join('');
  document.querySelector('#public-menu').innerHTML = menuMarkup;
  document.querySelector('#footer-menu').innerHTML = menuMarkup;
}

export async function storefront(params, isCurrent) {
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  const values = new URLSearchParams();
  for (const [key] of filters) {
    const value = params.get(key);
    if (value) values.set(key, value);
  }
  const rawCategory = params.get('category') ?? '';
  const category = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(rawCategory) ? rawCategory.toLowerCase() : '';
  const gallery = !category && params.get('gallery') === 'true';
  const section = new URLSearchParams(category ? {category} : gallery ? {gallery:'true'} : {});
  const query = next => new URLSearchParams([...section, ...values, ['page', String(next)]]);
  const [homes, settings, kinds] = await Promise.all([
    request('/api/imoveis?' + query(page)),
    request('/api/vitrine/configuracao').catch(() => ({})),
    request('/api/imoveis/tipos').catch(() => [])
  ]);
  if (!isCurrent()) return;
  showBrand(settings);
  showMenu(settings, category, gallery);
  const sectionTitle = settings.menu?.find(item => category ? item.id === category : gallery && item.kind === 'gallery')?.name;
  const heading = sectionTitle || (category ? 'Categoria de imóveis' : gallery ? 'Galeria' :
    values.size ? 'Resultados da busca' : 'Imóveis disponíveis');

  const banner = settings.banner;
  app.innerHTML = '<section class="estate-hero' + (banner ? '' : ' estate-hero-plain') + '">' +
    (banner ? '<div class="estate-banner"><img src="' + escape(banner) + '" alt="" fetchpriority="high"></div>' : '') +
    '<div class="estate-hero-copy"><h1>Encontre seu próximo imóvel</h1>' +
    '<form class="estate-search" id="search" aria-label="Filtrar imóveis">' +
    filters.map(([key,label,attributes]) => '<label>' + label + (key === 'kind'
      ? kindSelect(kinds, values.get(key), 'Todos os tipos')
      : '<input name="' + key + '" ' + attributes + ' value="' + escape(values.get(key)) + '">') +
      '</label>').join('') +
    '<button type="submit">Buscar imóveis</button></form></div></section>' +
    '<section id="resultados" class="estate-results" aria-labelledby="listing-title"><div class="estate-section-head">' +
    '<h2 id="listing-title" tabindex="-1">' + escape(heading) + '</h2>' +
    (values.size ? '<a class="listing-action" href="/#vitrine?' + escape(section.toString()) + '">Limpar filtros</a>' : '') + '</div>' +
    (homes.length ? '<div class="estate-grid">' + homes.map(listingCard).join('') + '</div>' :
      '<p class="estate-empty">' + (values.size || category || gallery ? 'Nenhum imóvel nesta seleção.' : 'Ainda não há imóveis publicados.') + '</p>') +
    '<div class="row estate-pages">' + (page > 1 ? link('Página anterior', 'vitrine?' + query(page-1), true) : '') +
    (homes.length === 30 ? link('Próxima página', 'vitrine?' + query(page+1), true) : '') + '</div></section>';

  const results = document.querySelector('#listing-title');
  function showResults() {
    results.focus({preventScroll:true});
    results.scrollIntoView({block:'start'});
  }
  document.querySelector('#search').onsubmit = event => {
    event.preventDefault();
    const next = 'vitrine?' + new URLSearchParams([...section, ...[...new FormData(event.currentTarget)]
      .map(([key,value]) => [key,value.trim()]).filter(([,value]) => value)]);
    if (location.hash === '#' + next) showResults();
    else location.hash = next;
  };
  if (values.size || category || gallery || page > 1) showResults();
}

export async function details(id, isCurrent) {
  const [home,settings] = await Promise.all([
    request('/api/imoveis/' + encodeURIComponent(id)),
    request('/api/vitrine/configuracao').catch(() => ({}))
  ]);
  if (!isCurrent()) return;
  showBrand(settings);
  showMenu(settings);
  propertyDetail(home, settings, locationLabel(home.data));
}
