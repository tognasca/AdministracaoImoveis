const problems = {403:'Acesso restrito a administradores.',401:'Entre com a senha administrativa.', 404:'Registro não encontrado.', 409:'Conflito ao gravar.', 413:'Imagem grande demais. O limite é 8 MB.', 415:'Envie uma imagem JPEG, PNG ou WebP.', 429:'Aguarde dois minutos para tentar novamente.'};
export async function request(path, method = 'GET', body) {
  const headers = {'X-Imoveis-Action':'1'};
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(path, {method, body, headers});
  if (!response.ok) {
    let message = problems[response.status] || 'Não foi possível concluir a operação.';
    if ([400,409].includes(response.status)) {
      const detail = await response.json().catch(() => null);
      if (typeof detail === 'string') message = detail;
    }
    throw Object.assign(new Error(message), {status:response.status});
  }
  return response.headers.get('Content-Type')?.includes('application/json') ? response.json() : undefined;
}
