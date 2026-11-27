import {listingPrice} from './rental.js';
import {app, escape} from './ui.js';
import {storefrontTheme} from './storefront-theme.js';
import {catalogRequest, catalogMedia, catalogPhoto, storefrontHref, storefrontLink} from './public-catalog.js';
import {kindSelect} from './property-kinds.js';
import {propertyDetail} from './property-detail.js';

const filters = [
  ['q', 'Localização ou imóvel', 'type="search" maxlength="120" placeholder="Cidade, bairro ou código"'],
  ['kind', 'Tipo de imóvel'],
  ['maxPrice', 'Preço máximo (R$)', 'type="number" min="0" step="0.01" placeholder="Sem limite"'],
  ['bedrooms', 'Mínimo de dormitórios', 'type="number" min="0" max="1000" placeholder="Qualquer"']
];

const locationLabel = data => [data.district, data.city].filter(Boolean).map(escape).join(' · ');
const facts = data => [
  data.bedrooms > 0 ? data.bedrooms + (data.bedrooms === 1 ? ' dormitório' : ' dormitórios') : '',
  data.size > 0 ? Number(data.size).toLocaleString('pt-BR') + ' m²' : ''
].filter(Boolean);
function listingCard(home) {
  const d = home.data;
  const href = storefrontHref('imovel/' + encodeURIComponent(home.id));
  const features = facts(d);
  const place = locationLabel(d);
  const photo = home.photos[0];
  const cover = photo ? '<img class="listing-image" src="' + escape(catalogPhoto(home.id, photo)) +
    '" alt="" loading="lazy" decoding="async">' : '<span class="listing-placeholder">Sem foto cadastrada</span>';
  return '<article class="listing-card"><a class="listing-link" href="' + href + '">' +
    '<div class="listing-cover' + (photo ? '' : ' listing-cover-empty') + '">' + cover +
    '</div><div class="listing-body"><div class="listing-property-data">' +
    (d.kind ? '<p class="listing-kind">' + escape(d.kind) + '</p>' : '') +
    '<h3>' + escape(d.title) + '</h3>' +
    (place ? '<p class="listing-location">' + place + '</p>' : '') +
    '<strong>' + listingPrice(d) + '</strong>' +
    (features.length ? '<ul class="listing-facts">' + features.map(value => '<li>' + value + '</li>').join('') + '</ul>' : '') +
    '</div><span class="listing-card-action">Ver imóvel <span aria-hidden="true">↗</span></span></div></a></article>';
}

let previewTheme;
let currentSettings;
let previewBanner;
function showPreviewBanner() {
  const hero = app.querySelector('.estate-hero');
  if (!hero || !previewBanner) return;
  const image = hero.querySelector('.estate-banner img');
  if (image?.getAttribute('src') === previewBanner) return;
  hero.querySelector('.estate-banner')?.remove();
  const banner = document.createElement('div');
  banner.className = 'estate-banner';
  const replacement = new Image();
  replacement.alt = '';
  replacement.onload = () => hero.classList.remove('estate-hero-plain');
  replacement.onerror = () => {
    banner.remove();
    const fallback = hero.dataset.fallbackImage;
    if (fallback) {
      replacement.onerror = () => { banner.remove(); hero.classList.add('estate-hero-plain'); };
      replacement.src = fallback;
      hero.prepend(banner);
    } else hero.classList.add('estate-hero-plain');
  };
  banner.append(replacement);
  hero.prepend(banner);
  replacement.src = previewBanner;
}
window.addEventListener('message', event => {
  if (window.parent === window || event.source !== window.parent || event.origin !== location.origin ||
      new URLSearchParams(location.search).get('preview') !== 'theme' || event.data?.type !== 'storefront-theme') return;
  previewTheme = event.data.theme;
  applyTheme(previewTheme);
  if (currentSettings) applyBrandColors(currentSettings);
  if (typeof event.data.banner === 'string' && /^\/api\/admin\/vitrine\/hero\/(premium|minimal|modern|commercial|boutique)\/imagem(\?v=\d+)?$/.test(event.data.banner)) {
    previewBanner = event.data.banner;
    showPreviewBanner();
  }
});

function applyTheme(theme) {
  theme = previewTheme ?? theme;
  const selected = ['modern','premium','commercial','minimal','boutique'].includes(theme?.template) ? theme.template : 'modern';
  document.body.dataset.estateTemplate = selected;
  document.body.dataset.estateAccent = /^#[0-9a-fA-F]{6}$/.test(theme?.accentColor ?? '') ? theme.accentColor : '';
  if (document.body.dataset.estateAccent)
    document.body.style.setProperty('--estate-accent',document.body.dataset.estateAccent);
}
function applyBrandColors(settings) {
  const accent = document.body.dataset.estateAccent;
  const theme = storefrontTheme({...settings,color:accent || settings.color});
  document.body.style.setProperty('--estate-accent',theme.background);
  document.body.style.setProperty('--estate-on-accent', theme.foreground);
  document.body.style.setProperty('--estate-accent-shade', theme.shade);
}
function showBrand(settings) {
  currentSettings = settings;
  applyBrandColors(settings);
  const name = settings.name || 'Imóveis Cotia';
  document.title = name;
  const brandMarkup = (settings.logo ? '<img class="site-logo" src="' + escape(catalogMedia(settings.logo)) + '" alt="">' : '') +
    '<span>' + escape(name) + '</span>';
  document.querySelector('header .brand').innerHTML = brandMarkup;
  document.querySelector('.footer-brand').innerHTML = brandMarkup;
}

function showMenu(settings, category, gallery) {
  const items = settings.menu ?? [];
  const menuMarkup = items.map(item => {
    if (item.kind === 'category')
      return '<a href="' + storefrontHref('vitrine?category=' + encodeURIComponent(item.id)) + '"' +
        (item.id === category ? ' aria-current="page"' : '') + '>' + escape(item.name) + '</a>';
    if (item.kind === 'gallery')
      return '<a href="' + storefrontHref('vitrine?gallery=true') + '"' + (gallery ? ' aria-current="page"' : '') + '>' + escape(item.name) + '</a>';
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
  const [homes, settings, kinds, theme] = await Promise.all([
    catalogRequest('/api/imoveis?' + query(page)),
    catalogRequest('/api/vitrine/configuracao').catch(() => ({})),
    catalogRequest('/api/imoveis/tipos').catch(() => []),
    catalogRequest('/api/vitrine/tema').catch(() => ({template:'modern'}))
  ]);
  if (!isCurrent()) return;
  applyTheme(theme);
  showBrand(settings);
  showMenu(settings, category, gallery);
  const sectionTitle = settings.menu?.find(item => category ? item.id === category : gallery && item.kind === 'gallery')?.name;
  const heading = sectionTitle || (category ? 'Categoria de imóveis' : gallery ? 'Galeria' :
    values.size ? 'Resultados da busca' : 'Imóveis disponíveis');

  const featured = !values.size && !category && !gallery && page === 1 ? homes.find(home => home.photos.length) : null;
  const featuredImage = featured ? catalogPhoto(featured.id, featured.photos[0]) : '';
  const banner = settings.banner ? catalogMedia(settings.banner) : featuredImage;
  app.innerHTML = '<section class="estate-hero' + (banner ? '' : ' estate-hero-plain') + '" data-fallback-image="' + escape(featuredImage) + '">' +
    (banner ? '<div class="estate-banner"><img src="' + escape(banner) + '" alt="" fetchpriority="high"></div>' : '') +
    '<div class="estate-hero-copy"><p class="estate-hero-brand">' + escape(settings.name || 'Imóveis Cotia') + '</p>' +
    '<h1>Encontre seu próximo imóvel</h1>' +
    (featured && !settings.banner ? '<a class="estate-hero-link" href="' + storefrontHref('imovel/' + encodeURIComponent(featured.id)) +
      '">Conhecer imóvel em destaque <span aria-hidden="true">↗</span></a>' : '') +
    '</div></section><div class="estate-search-shell">' +
    '<form class="estate-search" id="search" aria-label="Filtrar imóveis">' +
    filters.map(([key,label,attributes]) => '<label>' + label + (key === 'kind'
      ? kindSelect(kinds, values.get(key), 'Todos os tipos')
      : '<input name="' + key + '" ' + attributes + ' value="' + escape(values.get(key)) + '">') +
      '</label>').join('') +
    '<button type="submit">Buscar imóveis</button></form></div>' +
    '<section id="resultados" class="estate-results" aria-labelledby="listing-title"><div class="estate-section-head">' +
    '<h2 id="listing-title" tabindex="-1">' + escape(heading) + '</h2>' +
    (values.size ? '<a class="listing-action" href="' + storefrontHref('vitrine?' + section.toString()) + '">Limpar filtros</a>' : '') + '</div>' +
    (homes.length ? '<div class="estate-grid">' + homes.map(listingCard).join('') + '</div>' :
      '<p class="estate-empty">' + (values.size || category || gallery ? 'Nenhum imóvel nesta seleção.' : 'Ainda não há imóveis publicados.') + '</p>') +
    '<div class="row estate-pages">' + (page > 1 ? storefrontLink('Página anterior', 'vitrine?' + query(page-1)) : '') +
    (homes.length === 30 ? storefrontLink('Próxima página', 'vitrine?' + query(page+1)) : '') + '</div></section>';

  const activeBanner = app.querySelector('.estate-banner img');
  if (activeBanner) activeBanner.addEventListener('error', () => {
    if (featuredImage && activeBanner.getAttribute('src') !== featuredImage) {
      activeBanner.src = featuredImage;
      return;
    }
    activeBanner.closest('.estate-banner')?.remove();
    app.querySelector('.estate-hero')?.classList.add('estate-hero-plain');
  });
  showPreviewBanner();
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
  const [home,settings,theme] = await Promise.all([
    catalogRequest('/api/imoveis/' + encodeURIComponent(id)),
    catalogRequest('/api/vitrine/configuracao').catch(() => ({})),
    catalogRequest('/api/vitrine/tema').catch(() => ({template:'modern'}))
  ]);
  if (!isCurrent()) return;
  applyTheme(theme);
  showBrand(settings);
  showMenu(settings);
  propertyDetail(home, settings, locationLabel(home.data));
  if (!home.data.kind) return;
  const similar = await catalogRequest('/api/imoveis?' + new URLSearchParams({kind:home.data.kind})).catch(() => []);
  if (!isCurrent()) return;
  const others = similar.filter(item => item.id !== home.id).slice(0,4);
  if (others.length) app.querySelector('.property-page').insertAdjacentHTML('beforeend',
    '<section class="property-similar"><h2>Imóveis semelhantes</h2><div class="estate-grid">'+others.map(listingCard).join('')+'</div></section>');
}
