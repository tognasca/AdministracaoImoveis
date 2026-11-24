import {app, escape, money} from './ui.js';

import {catalogPhoto, catalogRequest, storefrontHref} from './public-catalog.js';

function gallery(home) {
  const total = home.photos.length;
  if (!total) return '<div class="property-photo-empty">Este imóvel ainda não tem fotos.</div>';
  const thumbs = home.photos.map((photo, index) => '<button type="button" data-index="' + index +
    '" aria-label="Exibir foto ' + (index + 1) + '" aria-pressed="' + (index === 0) +
    '"><img src="' + escape(catalogPhoto(home.id, photo)) + '" alt="" loading="lazy"></button>').join('');
  return '<div class="property-photo-stage"><img id="property-cover" src="' +
    escape(catalogPhoto(home.id, home.photos[0])) + '" alt="' + escape(home.data.title) + '">' +
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
    const src = catalogPhoto(home.id, home.photos[active]);
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

export function propertyDetail(home, settings, locationText) {
  const d = home.data;
  const facts = [
    ['Tipo de imóvel', d.kind],
    ['Zona', d.zone],
    ['Dormitórios', d.bedrooms > 0 ? d.bedrooms : ''],
    ['Área informada', d.size > 0 ? Number(d.size).toLocaleString('pt-BR') + ' m²' : ''],
    ['Localização', [d.district, d.city].filter(Boolean).join(' · ')]
  ].filter(([, value]) => value);
  const whatsapp = /^[0-9]{10,15}$/.test(settings.whatsapp) ? settings.whatsapp : '';
  const email = settings.email || '';
  const contact = '<form class="property-contact-form" id="property-contact-form">' +
    '<h2>Tenho interesse</h2><label>Seu nome<input name="contactName" autocomplete="name" maxlength="100" required></label>' +
    '<label>Telefone ou WhatsApp<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>' +
    '<label>E-mail<input name="email" type="email" autocomplete="email" maxlength="254"></label>' +
    '<p class="property-contact-hint">Informe pelo menos um canal de retorno. A imobiliária usará seus dados para responder sobre este imóvel.</p>' +
    '<label>Sua mensagem (opcional)<textarea name="message" rows="3" maxlength="800" placeholder="Quero saber mais sobre este imóvel."></textarea></label>' +
    '<button type="submit" class="btn">Enviar interesse</button>' +
    '<p class="property-contact-hint" id="property-contact-status" role="status"></p>' +
    (whatsapp || email ? '<div class="estate-contact">' +
      (whatsapp ? '<button type="button" value="whatsapp" class="btn alt" data-contact-channel>Continuar no WhatsApp</button>' : '') +
      (email ? '<button type="button" value="email" class="btn alt" data-contact-channel>Abrir e-mail</button>' : '') +
      '</div>' : '')+'</form>';
  const album = d.album && /^https?:\/\//i.test(d.album) ? '<a class="btn alt" target="_blank" rel="noopener noreferrer" href="' +
    escape(d.album) + '">Ver álbum externo <span aria-hidden="true">↗</span></a>' : '';
  app.innerHTML = '<div class="property-page"><a class="estate-back" href="' + storefrontHref('vitrine') + '">← Voltar aos imóveis</a>' +
    '<header class="property-heading"><div>' +
    (d.kind ? '<p class="estate-kicker">' + escape(d.kind) + '</p>' : '') + '<h1>' + escape(d.title) + '</h1>' +
    (locationText ? '<p class="property-location">' + locationText + '</p>' : '') + '</div>' +
    '<div><span class="property-reference">Ref. ' + escape(d.code) + '</span><div class="row property-tools">' +
    '<button type="button" class="alt" id="property-favorite" aria-pressed="false">Favoritar</button>'+
    '<button type="button" class="alt" id="property-share">Compartilhar</button></div>'+
    '<small role="status" id="property-action-status"></small></div></header>' +
    '<div class="property-layout"><section class="property-gallery" aria-label="Fotos do imóvel">' + gallery(home) + '</section>' +
    '<aside class="property-inquiry" aria-label="Preço e contato"><div class="property-price"><p>Valor do imóvel</p>' +
    '<strong>' + money(d.price) + '</strong></div>' +
    contact + (album ? '<div class="estate-contact">' + album + '</div>' : '') + '</aside>' +
    (facts.length ? '<section class="property-characteristics"><h2>Características</h2><dl>' + facts.map(([label, value]) =>
      '<div><dt>' + label + '</dt><dd>' + escape(value) + '</dd></div>').join('') + '</dl></section>' : '') +
    '</div></div><div class="property-mobile-contact"><strong>'+money(d.price)+'</strong>'+
    '<a class="btn" href="#property-contact-form" id="property-contact-shortcut">Tenho interesse</a></div>';
  bindGallery(home);
  const favorite = app.querySelector('#property-favorite');
  const key = 'estate-favorite:'+home.id;
  const status = app.querySelector('#property-action-status');
  const setFavorite = active => {
    favorite.setAttribute('aria-pressed',String(active));
    favorite.textContent = active ? 'Favoritado' : 'Favoritar';
  };
  try { setFavorite(localStorage.getItem(key) === '1'); } catch { favorite.disabled = true; }
  favorite.onclick = () => {
    const active = favorite.getAttribute('aria-pressed') !== 'true';
    try {
      if (active) localStorage.setItem(key,'1');
      else localStorage.removeItem(key);
      setFavorite(active);
    } catch { status.textContent = 'Não foi possível salvar o favorito neste dispositivo.'; }
  };
  app.querySelector('#property-share').onclick = async () => {
    try {
      if (navigator.share) await navigator.share({title:d.title,url:location.href});
      else { await navigator.clipboard.writeText(location.href); status.textContent = 'Link copiado.'; }
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'Copie o endereço da página para compartilhar.';
    }
  };
  const form = app.querySelector('#property-contact-form');
  app.querySelector('#property-contact-shortcut').onclick = event => {
    event.preventDefault();
    form.scrollIntoView({block:'center'});
    form.elements.contactName.focus({preventScroll:true});
  };
  form.oninput = event => event.target.setCustomValidity('');
  const contactStatus = form.querySelector('#property-contact-status');
  const submit = form.querySelector('button[type=submit]');
  let submissionId;
  form.onsubmit = async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const {contactName,phone,email:contactEmail,message} = form.elements;
    if (!phone.value.trim() && !contactEmail.value.trim()) {
      phone.setCustomValidity('Informe seu telefone ou e-mail.');
      phone.reportValidity();
      return;
    }
    submit.disabled = true;
    contactStatus.textContent = 'Enviando…';
    try {
      submissionId ??= crypto.randomUUID();
      await catalogRequest('/api/imoveis/'+encodeURIComponent(home.id)+'/interesse','POST',{
        submissionId,name:contactName.value,email:contactEmail.value,phone:phone.value,message:message.value
      });
      form.reset();
      submit.textContent = 'Interesse enviado';
      contactStatus.textContent = 'A imobiliária recebeu seu contato.';
    } catch (error) {
      contactStatus.textContent = error.message;
      submit.disabled = false;
    }
  };
  form.addEventListener('input', () => form.elements.phone.setCustomValidity(''));
  for (const button of form.querySelectorAll('[data-contact-channel]')) {
    button.onclick = () => {
      const {contactName,message} = form.elements;
      const subject = 'Contato sobre ' + d.title + ' (ref. ' + d.code + ')';
      const text = 'Imóvel: ' + d.title + ' (ref. ' + d.code + ')' +
        (contactName.value.trim() ? '\nNome: ' + contactName.value.trim() : '') +
        '\n\n' + (message.value.trim() || 'Olá, gostaria de mais informações sobre este imóvel.');
      if (button.value === 'email') {
        const recipient = encodeURIComponent(email).replace('%40', '@');
        location.href = 'mailto:' + recipient + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
      } else location.href = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(text);
    };
  }
}
