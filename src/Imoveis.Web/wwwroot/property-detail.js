import {app, escape, money} from './ui.js';

function photoUrl(id, photo) {
  return '/media/' + encodeURIComponent(id) + '/' + encodeURIComponent(photo);
}

function gallery(home) {
  const total = home.photos.length;
  if (!total) return '<div class="property-photo-empty">Este imóvel ainda não tem fotos.</div>';
  const thumbs = home.photos.map((photo, index) => '<button type="button" data-index="' + index +
    '" aria-label="Exibir foto ' + (index + 1) + '" aria-pressed="' + (index === 0) +
    '"><img src="' + escape(photoUrl(home.id, photo)) + '" alt="" loading="lazy"></button>').join('');
  return '<div class="property-photo-stage"><img id="property-cover" src="' +
    escape(photoUrl(home.id, home.photos[0])) + '" alt="' + escape(home.data.title) + '">' +
    '<button type="button" class="property-expand" id="property-expand">Ampliar foto <span aria-hidden="true">⤢</span></button>' +
    '<span class="property-photo-count" id="property-count" aria-live="polite">1 / ' + total + '</span></div>' +
    (total > 1 ? '<div class="property-thumbnails" id="property-thumbnails" aria-label="Selecionar foto">' + thumbs + '</div>' : '') +
    '<dialog class="property-lightbox" id="property-lightbox" aria-label="Fotos do imóvel">' +
    '<div class="property-viewer-bar"><span id="property-viewer-count" aria-live="polite"></span>' +
    '<button type="button" id="property-close" autofocus>Fechar <span aria-hidden="true">×</span></button></div>' +
    '<img id="property-full-photo" alt="">' +
    (total > 1 ? '<div class="property-viewer-nav"><button type="button" id="property-prev">← Anterior</button>' +
      '<button type="button" id="property-next">Próxima →</button></div>' : '') + '</dialog>';
}

function bindGallery(home) {
  const total = home.photos.length;
  if (!total) return;
  let active = 0;
  const cover = app.querySelector('#property-cover');
  const count = app.querySelector('#property-count');
  const dialog = app.querySelector('#property-lightbox');
  const enlarged = app.querySelector('#property-full-photo');
  const viewerCount = app.querySelector('#property-viewer-count');
  const thumbs = [...app.querySelectorAll('#property-thumbnails button')];
  const select = index => {
    active = (index + total) % total;
    const src = photoUrl(home.id, home.photos[active]);
    const label = (active + 1) + ' / ' + total;
    const alt = home.data.title + ' — foto ' + (active + 1);
    cover.src = src;
    cover.alt = alt;
    count.textContent = label;
    thumbs.forEach((thumb, i) => { thumb.setAttribute('aria-pressed', String(i === active)); });
    if (dialog.open) {
      enlarged.src = src;
      enlarged.alt = alt;
      viewerCount.textContent = label;
    }
  };
  thumbs.forEach((thumb, index) => { thumb.onclick = () => select(index); });
  app.querySelector('#property-expand').onclick = () => { dialog.showModal(); select(active); };
  app.querySelector('#property-close').onclick = () => dialog.close();
  if (total > 1) {
    app.querySelector('#property-prev').onclick = () => select(active - 1);
    app.querySelector('#property-next').onclick = () => select(active + 1);
    dialog.onkeydown = event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      select(active + (event.key === 'ArrowLeft' ? -1 : 1));
    };
  }
}

export function propertyDetail(home, settings, location) {
  const d = home.data;
  const facts = [
    ['Tipo de imóvel', d.kind],
    ['Dormitórios', d.bedrooms > 0 ? d.bedrooms : ''],
    ['Área informada', d.size > 0 ? Number(d.size).toLocaleString('pt-BR') + ' m²' : ''],
    ['Localização', [d.district, d.city].filter(Boolean).join(' · ')]
  ].filter(([, value]) => value);
  const contact = settings.whatsapp ? '<a class="btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/' +
    escape(settings.whatsapp) + '?text=' + encodeURIComponent('Olá, gostaria de informações sobre ' + d.title + ' (' + d.code + ').') +
    '">Falar no WhatsApp <span aria-hidden="true">↗</span></a>' : '';
  const album = d.album && /^https?:\/\//i.test(d.album) ? '<a class="btn alt" target="_blank" rel="noopener noreferrer" href="' +
    escape(d.album) + '">Ver álbum externo <span aria-hidden="true">↗</span></a>' : '';
  app.innerHTML = '<div class="property-page"><a class="estate-back" href="/#vitrine">← Voltar aos imóveis</a>' +
    '<header class="property-heading"><div>' +
    (d.kind ? '<p class="estate-kicker">' + escape(d.kind) + '</p>' : '') + '<h1>' + escape(d.title) + '</h1>' +
    (location ? '<p class="property-location">' + location + '</p>' : '') + '</div>' +
    '<span class="property-reference">Ref. ' + escape(d.code) + '</span></header>' +
    '<div class="property-layout"><div><section class="property-gallery" aria-label="Fotos do imóvel">' + gallery(home) + '</section>' +
    (facts.length ? '<section class="property-characteristics"><h2>Características</h2><dl>' + facts.map(([label, value]) =>
      '<div><dt>' + label + '</dt><dd>' + escape(value) + '</dd></div>').join('') + '</dl></section>' : '') +
    '</div><aside class="property-inquiry" aria-label="Preço e contato"><div class="property-price"><p>Valor do imóvel</p>' +
    '<strong>' + money(d.price) + '</strong></div>' +
    (contact || album ? '<div class="estate-contact">' + contact + album + '</div>' : '') + '</aside></div></div>';
  bindGallery(home);
}
