import {root, escape, picture, report} from './ui.js';
import {request} from './api.js';

export function mountGallery(home) {
  const section = document.querySelector('#gallery');
  const path = root + '/' + home.id;
  section.innerHTML = '<h3>Fotos do imóvel <span class="chips">' + home.photos.length + ' de 5</span></h3><div class="grid">' +
    home.photos.map((photo,i) => '<article>' + picture(home,photo) + '<div class="row">' +
      (i === 0 ? '<span>Capa</span>' : '<button class="alt" data-cover="' + escape(photo) + '">Usar como capa</button>') +
      '<button class="alt" data-remove="' + escape(photo) + '">Remover</button></div></article>').join('') +
    '</div>' + (home.photos.length < 5 ? '<div class="row"><label>Enviar fotos<input type="file" multiple accept="image/jpeg,image/png,image/webp"></label>' +
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
  section.onclick = event => {
    const {cover,remove} = event.target.dataset;
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
        body.append('photo', await optimize(file), 'foto.webp');
        await request(path + '/fotos', 'POST', body);
      }
    });
  };
}
async function optimize(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw Error('Não foi possível abrir a imagem. Selecione um arquivo JPEG, PNG ou WebP.'); }
  try {
    const scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(bitmap.width*scale));
    canvas.height = Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const output = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',.84));
    if (!output) throw Error('Não foi possível preparar a foto para envio.');
    return output;
  } finally { bitmap.close(); }
}
