import {app, escape, notice, report} from './ui.js';
import {storefrontTheme} from './storefront-theme.js';
import {request} from './api.js';
import {adminNav, bindLogout, getSession, sectionNav, bindSections} from './admin-ui.js';
import {optimizeImage} from './image.js';

const endpoint = '/api/admin/vitrine/';
const images = [
  {key:'logo', title:'Logo do site', label:'Logo', size:512},
  {key:'banner', title:'Imagem do banner principal', label:'Banner', size:1920}
];

function imageForm({key,title,label}, url) {
  return '<section class="box"><h3>' + title + '</h3>' +
    (url ? '<img class="' + key + '-preview" src="' + escape(url) + '?preview=' + Date.now() + '" alt="' + label + ' atual">' : '') +
    '<form id="' + key + '-form"><label>Selecionar imagem<input name="image" type="file" required accept="image/jpeg,image/png,image/webp"></label>' +
    '<div class="row"><button>Salvar ' + label.toLowerCase() + '</button>' +
    (url ? '<button type="button" class="alt" data-remove>Remover ' + label.toLowerCase() + '</button>' : '') +
    '</div></form></section>';
}

export async function showSettings(isCurrent, activeSection = "settings-identity") {
  const allowed = getSession()?.administrator;
  const settings = allowed ? await request('/api/vitrine/configuracao') : null;
  const themes = allowed ? await request(endpoint + 'tema/editor') : null;
  const selectedTheme = themes?.draft ?? themes?.published;
  const external = allowed ? await request(endpoint + 'publicacao-externa') : null;
  if (!isCurrent()) return;

  const sections = [['settings-identity','Identidade e vitrine'],['settings-team','Equipe'],['settings-channels','Canais de publicação']];
  app.innerHTML = adminNav() + '<h1>Configurações</h1>' + notice +
    (allowed ? sectionNav(sections)+'<div id="settings-identity"><section class="box"><h3>Modelo visual da imobiliária</h3><p class="muted">Pré-visualize os imóveis publicados no modelo escolhido.</p><form id="template-form"><label>Modelo<select name="template">' +
      [['premium','Luxury'],['minimal','Minimalista'],['modern','Moderno'],['commercial','Corporativo'],['boutique','Boutique']].map(([value,label]) =>
        '<option value="' + value + '"' + (value === selectedTheme.template ? ' selected' : '') + '>' + label + '</option>').join('') +
      '</select></label><label>Cor principal<input name="accentColor" type="color" value="' + escape(selectedTheme.accentColor) + '"></label><div class="row"><button>Publicar modelo</button><button type="button" class="alt" id="theme-draft">Salvar rascunho</button>' +
      (themes.canRestore ? '<button type="button" class="alt" id="theme-restore">Restaurar anterior</button>' : '') +
      '</div></form><fieldset id="hero-settings"><legend>Imagem do hero por modelo</legend>' +
      '<label>Fonte da imagem<select id="hero-source"><option value="default">Usar banner padrão</option><option value="upload">Enviar imagem própria</option><option value="property">Usar foto de um imóvel publicado</option></select></label>' +
      '<div id="hero-upload" hidden><label>Imagem própria<input id="hero-file" type="file" accept="image/jpeg,image/png,image/webp"></label></div>' +
      '<div id="hero-property" hidden><label>Buscar imóvel publicado<input id="hero-search" type="search" maxlength="120"></label><button type="button" class="alt" id="hero-find">Buscar imóveis</button>' +
      '<label>Imóvel<select id="hero-homes"></select></label><label>Foto<select id="hero-photos"></select></label><img id="hero-photo-preview" alt="Foto selecionada" hidden></div>' +
      '<div class="row"><button type="button" class="alt" id="hero-save">Salvar imagem para a prévia</button><span id="hero-status" role="status"></span></div></fieldset><label>Largura da prévia<select id="preview-width"><option value="1280">Desktop</option><option value="768">Tablet</option><option value="390">Smartphone</option></select></label>' +
      '<div class="storefront-preview-frame"><iframe id="storefront-preview" title="Prévia da vitrine" loading="lazy" src="/?preview=theme#vitrine"></iframe></div></section>' +
      '<section class="box"><h3>Identidade do site</h3><form id="brand-form">' +
      '<label>Nome do site<input name="siteName" required maxlength="80" value="' + escape(settings.name) + '"></label>' +
      '<label class="theme-color">Cor da vitrine<input name="siteColor" type="color" value="' + escape(settings.color || '#6B5140') + '"></label>' +
      '<label class="theme-opacity"><span>Opacidade da cor <output id="opacity-value"></output></span>' +
      '<input name="colorOpacity" type="range" min="0" max="100" step="1" value="' + escape(settings.colorOpacity ?? 100) + '"></label>' +
      '<label class="theme-color">Texto sobre a cor da vitrine<select name="textColor">' +
      [['auto','Automática'],['black','Preto'],['white','Branco']].map(([value,label]) =>
        '<option value="' + value + '"' + (value === settings.textColor ? ' selected' : '') + '>' + label + '</option>').join('') +
      '</select></label><small>Se a combinação escolhida tiver pouco contraste, a vitrine usa a cor de texto mais legível.</small>' +
      '<div class="theme-preview" id="theme-preview">Prévia da cor e do texto</div>' +
      '<div class="grid storefront-contact-settings"><label>E-mail de contato<input name="email" type="email" maxlength="254" value="' +
      escape(settings.email) + '"></label><label>WhatsApp com código do país e DDD<input name="whatsapp" type="tel" inputmode="numeric" ' +
      'pattern="[0-9]{10,15}" maxlength="15" placeholder="5511999999999" value="' + escape(settings.whatsapp) + '"></label></div>' +
      '<div class="row"><button>Salvar identidade</button></div></form></section>' +
      images.map(asset => imageForm(asset, asset.key === 'banner' ? settings.defaultBanner : settings[asset.key])).join('')+'</div>'+
      '<section class="box" id="settings-team"><h3>Equipe e acesso</h3>'+
      '<a class="btn alt" href="/#usuarios">Gerenciar usuários e permissões</a></section>'+
      '<div id="settings-channels"><section class="box"><h3>Catálogo para sites parceiros</h3>'+
      '<a class="btn alt" href="/docs/catalogo" target="_blank" rel="noopener noreferrer">Abrir documentação da API</a></section>'+
      (external?.enabled ? '<section class="box"><h3>Vitrine na sua hospedagem</h3>'+
        '<p>Baixe o pacote para usar o catálogo e a identidade da imobiliária no seu domínio.</p>'+
        '<a class="btn" href="/api/admin/vitrine/pacote" download>Baixar arquivos da vitrine</a></section>' : '')+'</div>' :
      '<p>Acesso restrito a administradores.</p>');
  bindLogout();
  if (!allowed) return;
  const nav = app.querySelector('.workspace-sections');
  bindSections(nav,activeSection);

  async function change(action, message) {
    const controls = [...app.querySelectorAll('#template-form :is(button,input,select), #brand-form :is(button,input,select), #logo-form :is(button,input,select), #banner-form :is(button,input,select), #hero-settings :is(button,input,select)')];
    controls.forEach(control => { control.disabled = true; });
    try {
      await action();
      if (isCurrent()) { await showSettings(isCurrent,nav.querySelector('[aria-pressed="true"]').dataset.section); if (isCurrent()) report(message); }
    } catch (error) { if (isCurrent()) report(error.message); }
    finally { controls.forEach(control => { control.disabled = false; }); }
  }

  const templateForm = app.querySelector('#template-form');
  const readTheme = () => ({
    template:templateForm.elements.template.value,
    accentColor:templateForm.elements.accentColor.value
  });
  const frame = app.querySelector('#storefront-preview');
  const size = app.querySelector('#preview-width');
  const hero = app.querySelector('#hero-settings');
  const mode = hero.querySelector('#hero-source');
  const file = hero.querySelector('#hero-file');
  const homes = hero.querySelector('#hero-homes');
  const photos = hero.querySelector('#hero-photos');
  const status = hero.querySelector('#hero-status');
  const selectedPhoto = hero.querySelector('#hero-photo-preview');
  function showPhoto() {
    selectedPhoto.hidden = !homes.value || !photos.value;
    if (!selectedPhoto.hidden) selectedPhoto.src = '/media/'+encodeURIComponent(homes.value)+'/'+encodeURIComponent(photos.value);
    else selectedPhoto.removeAttribute('src');
  }
  const readHeroPath = template => endpoint + 'hero/' + encodeURIComponent(template);
  let found = [], dirty = false, heroLoaded = false;
  let previewVersion = Date.now();
  const sendPreview = () => frame.contentWindow?.postMessage({
    type:'storefront-theme',theme:readTheme(),banner:readHeroPath(readTheme().template)+'/imagem?v='+previewVersion
  },location.origin);
  function fields() {
    hero.querySelector('#hero-upload').hidden = mode.value !== 'upload';
    hero.querySelector('#hero-property').hidden = mode.value !== 'property';
  }
  async function loadHero() {
    const template = readTheme().template;
    hero.disabled = true;
    heroLoaded = dirty = false;
    try {
      const settings = await request(readHeroPath(template));
      if (!isCurrent() || readTheme().template !== template) return;
      mode.value = settings.mode;
      file.value = '';
      found = [];
      homes.replaceChildren(new Option(settings.propertyId ? 'Imóvel selecionado' : 'Selecione um imóvel', settings.propertyId ?? ''));
      photos.replaceChildren(new Option(settings.photoId ? 'Foto selecionada' : 'Selecione uma foto', settings.photoId ?? ''));
      status.textContent = settings.draft ? 'Imagem salva como rascunho.' : '';
      showPhoto();
      heroLoaded = true;
      fields();
      sendPreview();
    } catch (error) { if (isCurrent()) status.textContent = error.message; }
    finally { if (readTheme().template === template) hero.disabled = false; }
  }
  mode.onchange = fields;
  mode.addEventListener('change', () => { dirty = true; });
  file.onchange = () => { dirty = true; };
  homes.onchange = () => {
    const home = found.find(item => item.id === homes.value);
    photos.replaceChildren(new Option('Selecione uma foto',''),
      ...(home?.photos ?? []).map((id,i) => new Option('Foto '+(i+1),id)));
    dirty = true;
    showPhoto();
  };
  photos.onchange = () => {
    dirty = true;
    showPhoto();
    if (!photos.value) return;
    status.textContent = 'Salve a imagem para atualizar a prévia.';
  };
  hero.querySelector('#hero-find').onclick = async () => {
    try {
      const q = hero.querySelector('#hero-search').value.trim();
      const template = readTheme().template;
      const matches = await request('/api/imoveis?q='+encodeURIComponent(q));
      if (!isCurrent() || template !== readTheme().template) return;
      found = matches.filter(item => item.photos.length);
      homes.replaceChildren(new Option(found.length ? 'Selecione um imóvel' : 'Nenhum imóvel com fotos',''),
        ...found.map(item => new Option(item.data.title,item.id)));
      photos.replaceChildren(new Option('Selecione uma foto',''));
      showPhoto();
    } catch (error) { status.textContent = error.message; }
  };
  async function saveHero() {
    if (!heroLoaded) throw Error('Aguarde o carregamento da imagem deste modelo.');
    if (!dirty) return;
    const data = new FormData();
    data.set('mode',mode.value);
    if (mode.value === 'upload') {
      if (!file.files[0]) throw Error('Selecione uma imagem própria.');
      data.set('image',await optimizeImage(file.files[0],1920),'hero.webp');
    }
    if (mode.value === 'property') {
      data.set('propertyId',homes.value);
      data.set('photoId',photos.value);
    }
    await request(readHeroPath(readTheme().template),'PUT',data);
    dirty = false;
    previewVersion = Date.now();
    status.textContent = 'Imagem salva como rascunho.';
    sendPreview();
  }
  hero.querySelector('#hero-save').onclick = async () => {
    hero.disabled = templateForm.elements.template.disabled = true;
    try { await saveHero(); }
    catch (error) { status.textContent = error.message; }
    finally { hero.disabled = templateForm.elements.template.disabled = false; }
  };
  templateForm.elements.template.onchange = loadHero;
  loadHero();
  frame.onload = sendPreview;
  templateForm.elements.accentColor.oninput = sendPreview;
  const stage = frame.parentElement;
  const fitPreview = () => {
    const width = Number(size.value);
    const scale = Math.min(1,stage.clientWidth / width);
    if (!scale) return;
    frame.style.width = width + 'px';
    frame.style.height = Math.round(440 / scale) + 'px';
    frame.style.transform = 'translateX(-50%) scale('+scale+')';
  };
  const previewResize = new ResizeObserver(() => {
    if (!stage.isConnected) { previewResize.disconnect(); return; }
    fitPreview();
  });
  previewResize.observe(stage);
  size.onchange = fitPreview;
  fitPreview();
  templateForm.onsubmit = event => {
    event.preventDefault();
    change(async () => { await saveHero(); await request(endpoint + 'tema','PUT',readTheme()); }, 'Modelo visual publicado.');
  };
  app.querySelector('#theme-draft').onclick = () =>
    change(async () => { await saveHero(); await request(endpoint + 'tema/rascunho','PUT',readTheme()); }, 'Rascunho do modelo salvo.');
  const restore = app.querySelector('#theme-restore');
  if (restore) restore.onclick = () => {
    if (confirm('Restaurar a versão anterior do modelo e da cor principal?'))
      change(() => request(endpoint + 'tema/restaurar','POST'), 'Modelo anterior restaurado.');
  };
  const brand = app.querySelector('#brand-form');
  const opacityValue = app.querySelector('#opacity-value');
  const preview = app.querySelector('#theme-preview');
  function updatePreview() {
    const colorOpacity = brand.elements.colorOpacity.valueAsNumber;
    const theme = storefrontTheme({color:brand.elements.siteColor.value, colorOpacity, textColor:brand.elements.textColor.value});
    opacityValue.textContent = colorOpacity + '%';
    preview.style.backgroundColor = theme.background;
    preview.style.color = theme.foreground;
  }
  brand.addEventListener('input', updatePreview);
  brand.addEventListener('change', updatePreview);
  updatePreview();
  brand.onsubmit = event => {
    event.preventDefault();
    const name = brand.elements.siteName.value.trim();
    const color = brand.elements.siteColor.value;
    const email = brand.elements.email.value.trim();
    const whatsapp = brand.elements.whatsapp.value.trim();
    const textColor = brand.elements.textColor.value;
    const colorOpacity = brand.elements.colorOpacity.valueAsNumber;
    change(() => request(endpoint + 'identidade','PUT',{name,color,colorOpacity,textColor,email,whatsapp}), 'Identidade da vitrine salva.');
  };

  for (const {key,label,size} of images) {
    const form = app.querySelector('#' + key + '-form');
    form.onsubmit = event => {
      event.preventDefault();
      const file = form.elements.image.files[0];
      if (!file) return;
      change(async () => {
        const body = new FormData();
        body.append('photo', await optimizeImage(file, size), key + '.webp');
        await request(endpoint + key, 'PUT', body);
      }, label + ' salvo.');
    };
    const remove = form.querySelector('[data-remove]');
    if (remove) remove.onclick = () => change(() => request(endpoint + key,'DELETE'), label + ' removido.');
  }
}
