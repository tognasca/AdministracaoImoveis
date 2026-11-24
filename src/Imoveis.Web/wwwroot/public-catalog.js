import {escape} from './ui.js';
import {request} from './api.js';

let catalogUrl;

export function useExternalCatalog(url) {
  catalogUrl = new URL(url);
}

export async function catalogRequest(path, method = 'GET', body) {
  if (!catalogUrl) return request(path,method,body);
  const response = await fetch(catalogUrl.href + path.slice('/api'.length), {
    credentials:'omit',method,
    ...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})
  });
  if (!response.ok) {
    const detail = response.status === 400 ? await response.json().catch(() => null) : null;
    const message = typeof detail === 'string' ? detail :
      response.status === 404 ? 'Catálogo ou imóvel indisponível.' :
      response.status === 429 ? 'Aguarde um minuto e tente novamente.' : 'Não foi possível concluir a operação.';
    throw Object.assign(new Error(message),{status:response.status});
  }
  return response.status === 204 ? undefined : response.json();
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
