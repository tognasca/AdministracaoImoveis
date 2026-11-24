import {catalogUrl} from './catalog-config.js';
import {app, escape} from './ui.js';
import {useExternalCatalog, storefrontLink} from './public-catalog.js';
import {bindPublicMenu} from './public-menu.js';
import {storefront, details} from './storefront.js';

useExternalCatalog(catalogUrl);
const setPublicMenu = bindPublicMenu();
let navigation = 0;

async function render() {
  const current = ++navigation;
  const isCurrent = () => current === navigation;
  const [path, query] = location.hash.slice(1).split('?');
  const [route, id] = path.split('/');
  setPublicMenu(false);
  app.innerHTML = '<p>Carregando imóveis…</p>';
  window.scrollTo(0, 0);
  try {
    if (route === 'imovel' && id) await details(id, isCurrent);
    else await storefront(new URLSearchParams(query), isCurrent);
  } catch (error) {
    if (!isCurrent()) return;
    const message = error instanceof TypeError ? 'Não foi possível conectar ao catálogo de imóveis.' : error.message;
    app.innerHTML = '<p role="alert">' + escape(message) + '</p>' + storefrontLink('Voltar à vitrine', 'vitrine');
  }
}

window.addEventListener('hashchange', render);
render();
