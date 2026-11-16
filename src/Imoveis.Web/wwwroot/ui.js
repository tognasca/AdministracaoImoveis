export const app = document.querySelector('#app');
export const root = '/api/admin/imoveis';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);
export const link = (label, hash, alternate = false) =>
  '<a class="btn' + (alternate ? ' alt' : '') + '" href="' + escape(hash.startsWith('/') ? hash : '/#' + hash) + '">' + escape(label) + '</a>';
export const money = value => Number(value).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
export const picture = (home, photo) => photo
  ? '<img class="photo" loading="lazy" src="/media/' + escape(home.id) + '/' + escape(photo) + '" alt="Foto do imóvel">'
  : '<div class="notice">Sem foto cadastrada</div>';
export const notice = '<div class="notice" role="status" id="feedback"></div>';
export const report = message => { const target = document.querySelector('#feedback'); if (target) target.textContent = message; };
