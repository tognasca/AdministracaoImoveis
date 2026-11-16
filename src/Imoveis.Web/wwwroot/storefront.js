import {app, escape, link, money} from './ui.js';
import {request} from './api.js';

const filters = [
  ['q', 'Localização ou imóvel', 'type="search" maxlength="120" placeholder="Cidade, bairro ou código"'],
  ['kind', 'Tipo de imóvel', 'maxlength="80" placeholder="Ex.: Casa"'],
  ['maxPrice', 'Preço máximo (R$)', 'type="number" min="0" step="0.01" placeholder="Sem limite"'],
  ['bedrooms', 'Mínimo de dormitórios', 'type="number" min="0" max="1000" placeholder="Qualquer"']
];

const photoUrl = (id, photo) => '/media/' + encodeURIComponent(id) + '/' + encodeURIComponent(photo);
const locationLabel = data => [data.district, data.city].filter(Boolean).map(escape).join(' · ');
const facts = data => [
  data.bedrooms > 0 ? data.bedrooms + (data.bedrooms === 1 ? ' dormitório' : ' dormitórios') : '',
  data.size > 0 ? Number(data.size).toLocaleString('pt-BR') + ' m²' : ''
].filter(Boolean);
const media = (home, photo, className, eager = false) => photo
  ? '<img class="' + className + '" src="' + escape(photoUrl(home.id, photo)) +
    '" alt="' + escape(home.data.title) + '" loading="' + (eager ? 'eager' : 'lazy') + '">'
  : '<div class="' + className + ' listing-placeholder">Sem foto cadastrada</div>';

function listingCard(home) {
  const d = home.data;
  const href = '/#imovel/' + encodeURIComponent(home.id);
  const features = facts(d);
  return '<article class="listing-card"><a class="listing-cover" href="' + href + '" aria-label="Ver imóvel: ' +
    escape(d.title) + '">' + media(home, home.photos[0], 'listing-image') +
    '</a><div class="listing-body"><p class="listing-location">' + locationLabel(d) + '</p>' +
    '<h3><a href="' + href + '">' + escape(d.title) + '</a></h3>' +
    (d.kind || features.length ? '<p class="listing-facts">' + [escape(d.kind), ...features].filter(Boolean).join(' · ') + '</p>' : '') +
    '<div class="listing-bottom"><strong>' + money(d.price) + '</strong><a href="' + href +
    '" class="listing-action">Ver imóvel <span aria-hidden="true">↗</span></a></div></div></article>';
}

function showBrand(settings) {
  const name = settings.name || 'Imóveis Cotia';
  const brand = document.querySelector('header .brand');
  document.title = name;
  brand.innerHTML = (settings.logo ? '<img class="site-logo" src="' + escape(settings.logo) + '" alt="">' : '') +
    '<span>' + escape(name) + '</span>';
  document.querySelector('footer span').textContent = name;
}

export async function storefront(params, isCurrent) {
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  const values = new URLSearchParams();
  for (const [key] of filters) {
    const value = params.get(key);
    if (value) values.set(key, value);
  }
  const query = next => new URLSearchParams([...values, ['page', String(next)]]);
  const [homes, settings] = await Promise.all([
    request('/api/imoveis?' + query(page)),
    request('/api/vitrine/configuracao').catch(() => ({}))
  ]);
  if (!isCurrent()) return;
  showBrand(settings);

  const featured = homes.find(home => home.photos.length);
  const banner = settings.banner || (featured ? photoUrl(featured.id, featured.photos[0]) : '');
  app.innerHTML = '<section class="estate-hero' + (banner ? '' : ' estate-hero-plain') + '">' +
    (banner ? '<div class="estate-banner"><img src="' + escape(banner) + '" alt="" fetchpriority="high"></div>' : '') +
    '<div class="estate-hero-copy"><h1>Encontre seu próximo imóvel</h1>' +
    '<form class="estate-search" id="search" aria-label="Filtrar imóveis">' +
    filters.map(([key,label,attributes]) => '<label>' + label + '<input name="' + key + '" ' +
      attributes + ' value="' + escape(values.get(key)) + '"></label>').join('') +
    '<button type="submit">Buscar imóveis</button></form></div></section>' +
    '<section id="resultados" class="estate-results" aria-labelledby="listing-title"><div class="estate-section-head">' +
    '<h2 id="listing-title" tabindex="-1">' + (values.size ? 'Resultados da busca' : 'Imóveis disponíveis') + '</h2>' +
    (values.size ? '<a class="listing-action" href="/#vitrine">Limpar filtros</a>' : '') + '</div>' +
    (homes.length ? '<div class="estate-grid">' + homes.map(listingCard).join('') + '</div>' :
      '<p class="estate-empty">' + (values.size ? 'Nenhum imóvel corresponde aos filtros.' : 'Ainda não há imóveis publicados.') + '</p>') +
    '<div class="row estate-pages">' + (page > 1 ? link('Página anterior', 'vitrine?' + query(page-1), true) : '') +
    (homes.length === 30 ? link('Próxima página', 'vitrine?' + query(page+1), true) : '') + '</div></section>';

  const results = document.querySelector('#listing-title');
  function showResults() {
    results.focus({preventScroll:true});
    results.scrollIntoView({block:'start'});
  }
  document.querySelector('#search').onsubmit = event => {
    event.preventDefault();
    const next = 'vitrine?' + new URLSearchParams([...new FormData(event.currentTarget)]
      .map(([key,value]) => [key,value.trim()]).filter(([,value]) => value));
    if (location.hash === '#' + next) showResults();
    else location.hash = next;
  };
  if (values.size || page > 1) showResults();
}

export async function details(id, isCurrent) {
  const [home,settings] = await Promise.all([
    request('/api/imoveis/' + encodeURIComponent(id)),
    request('/api/vitrine/configuracao').catch(() => ({}))
  ]);
  if (!isCurrent()) return;
  showBrand(settings);
  const d = home.data;
  const features = facts(d);
  app.innerHTML = '<a class="estate-back" href="/#vitrine">← Voltar à vitrine</a>' +
    '<div class="estate-detail-heading"><p class="estate-kicker">' + escape(d.kind) + '</p><h1>' + escape(d.title) +
    '</h1><p class="listing-location">' + locationLabel(d) + '</p></div>' +
    '<div class="estate-detail"><section aria-label="Fotos do imóvel">' +
    media(home, home.photos[0], 'estate-main-photo', true) +
    (home.photos.length > 1 ? '<div class="estate-thumbnails">' + home.photos.map((photo,index) =>
      '<button type="button" data-photo="' + escape(photo) + '" aria-label="Mostrar foto ' + (index + 1) +
      '" aria-pressed="' + (index === 0) + '">' + media(home, photo, 'estate-thumbnail') + '</button>').join('') + '</div>' : '') +
    '</section><aside class="estate-summary"><p class="estate-kicker">Valor do imóvel</p><strong>' + money(d.price) + '</strong>' +
    (features.length ? '<ul>' + features.map(feature => '<li>' + feature + '</li>').join('') + '</ul>' : '') +
    '<div class="estate-contact">' +
    (settings.whatsapp ? '<a class="btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/' +
      escape(settings.whatsapp) + '?text=' + encodeURIComponent('Olá, gostaria de informações sobre ' + d.title + ' (' + d.code + ').') +
      '">Falar no WhatsApp</a>' : '') +
    (d.album && /^https?:\/\//i.test(d.album) ? '<a class="btn alt" target="_blank" rel="noopener noreferrer" href="' +
      escape(d.album) + '">Ver álbum externo</a>' : '') + '</div></aside></div>';
  const thumbnails = document.querySelector('.estate-thumbnails');
  if (!thumbnails) return;
  thumbnails.onclick = event => {
    const selected = event.target.closest('button[data-photo]');
    if (!selected) return;
    document.querySelector('.estate-main-photo').src = photoUrl(home.id, selected.dataset.photo);
    for (const button of thumbnails.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button === selected));
  };
}
