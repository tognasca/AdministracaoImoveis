import {escape} from './ui.js';
import {request} from './api.js';

let catalogUrl;

export function useExternalCatalog(url) {
  catalogUrl = new URL(url);
}

export async function catalogRequest(path) {
  if (!catalogUrl) return request(path);
  const response = await fetch(catalogUrl.href + path.slice('/api'.length), {credentials:'omit'});
  if (!response.ok) {
    const message = response.status === 404 ? 'Catálogo ou imóvel indisponível.' : 'Não foi possível carregar a vitrine.';
    throw new Error(message);
  }
  return response.json();
}

export function catalogMedia(path) {
  return catalogUrl ? new URL(path, catalogUrl.origin).href : path;
}

export function catalogPhoto(id, photo) {
  const prefix = catalogUrl?.pathname ?? '';
  return catalogMedia(prefix + '/media/' + encodeURIComponent(id) + '/' + encodeURIComponent(photo));
}

export function storefrontHref(route) {
  return escape((catalogUrl ? '#' : '/#') + route);
}

export function storefrontLink(label, route) {
  return '<a class="btn alt" href="' + storefrontHref(route) + '">' + escape(label) + '</a>';
}
