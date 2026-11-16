export async function optimizeImage(file, maxSide = 1600) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw Error('Não foi possível abrir a imagem. Selecione um arquivo JPEG, PNG ou WebP.'); }
  try {
    const scale = Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(bitmap.width*scale));
    canvas.height = Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const output = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',.84));
    if (!output) throw Error('Não foi possível preparar a foto para envio.');
    return output;
  } finally { bitmap.close(); }
}
