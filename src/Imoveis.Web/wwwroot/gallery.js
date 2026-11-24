import {optimizeImage} from './image.js';
import {root, escape, picture, report} from './ui.js';
import {request} from './api.js';

export function mountGallery(home) {
  const section = document.querySelector('#gallery');
  const path = root + '/' + home.id;
  section.innerHTML = '<h3>Galeria do imóvel <span class="chips">' + home.photos.length + ' de 5</span></h3><div class="thumb-grid">' +
    home.photos.map((photo,i) => '<article class="thumb-card" draggable="true" data-photo="'+escape(photo)+'">' + picture(home,photo) + '<div class="row">' +
      (i === 0 ? '<span>Capa</span>' : '<button class="alt" data-cover="' + escape(photo) + '">Usar como capa</button>') +
      (i > 0 ? '<button type="button" class="alt" data-move="'+i+'" data-offset="-1" aria-label="Mover foto '+(i+1)+' para trás">←</button>' : '') +
      (i + 1 < home.photos.length ? '<button type="button" class="alt" data-move="'+i+'" data-offset="1" aria-label="Mover foto '+(i+1)+' para frente">→</button>' : '') +
      '<button class="alt" data-remove="' + escape(photo) + '">Remover</button></div></article>').join('') +
    '</div><p class="muted">Arraste as fotos ou use as setas para reorganizar. A primeira imagem é a capa.</p>' + (home.photos.length < 5 ? '<div class="row"><label>Enviar fotos<input type="file" multiple accept="image/jpeg,image/png,image/webp"></label>' +
      '<label>Tirar foto<input type="file" accept="image/*" capture="environment"></label></div>' : '');
  let busy = false;
  const update = async action => {
    if (busy) return;
    busy = true;
    section.querySelectorAll('input,button').forEach(item => item.disabled = true);
    try { await action(); report('Galeria atualizada.'); }
    catch (error) { report(error.message); }
    finally {
      try {
        home.photos = (await request(path)).photos;
        if (document.querySelector('#gallery') === section) mountGallery(home);
      } catch (error) {
        report(error.message);
        section.querySelectorAll('input,button').forEach(item => item.disabled = false);
        busy = false;
      }
    }
  };
  const reorder = (from,to) => {
    if (busy || from === to || from < 0 || to < 0 || to >= home.photos.length) return;
    const order = [...home.photos];
    const [photo] = order.splice(from,1);
    order.splice(to,0,photo);
    update(() => request(path + '/fotos/ordem','PUT',order));
  };
  let dragged = -1;
  section.ondragstart = event => {
    dragged = home.photos.indexOf(event.target.closest('[data-photo]')?.dataset.photo);
    if (dragged >= 0) event.dataTransfer.setData('text/plain',home.photos[dragged]);
  };
  section.ondragend = () => { dragged = -1; };
  section.ondragover = event => { if (dragged >= 0) event.preventDefault(); };
  section.ondrop = event => {
    if (dragged < 0) return;
    event.preventDefault();
    const target = event.target.closest('[data-photo]')?.dataset.photo;
    reorder(dragged,home.photos.indexOf(target));
    dragged = -1;
  };
  section.onclick = event => {
    const {cover,remove,move,offset} = event.target.dataset;
    if (move !== undefined) reorder(Number(move),Number(move)+Number(offset));
    if (cover) update(() => request(path + '/fotos/' + cover + '/capa', 'PUT'));
    if (remove && confirm('Remover esta foto da galeria?')) update(() => request(path + '/fotos/' + remove, 'DELETE'));
  };
  section.onchange = event => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 5-home.photos.length) { report('Selecione até ' + (5-home.photos.length) + ' fotos.'); event.target.value=''; return; }
    if (!files.length) return;
    update(async () => {
      for (const file of files) {
        const body = new FormData();
        body.append('photo', await optimizeImage(file), 'foto.webp');
        await request(path + '/fotos', 'POST', body);
      }
    });
  };
}
