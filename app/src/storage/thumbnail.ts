/** Create only a tiny gallery preview. The full input Blob stays untouched in IndexedDB. */
export async function makeThumbnail(image: HTMLImageElement): Promise<{ blob: Blob; width: number; height: number }> {
  const width = 320;
  const height = 320;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D не е наличен за миниатюра');
  ctx.fillStyle = '#faf9f7';
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawW = Math.max(1, Math.round(image.naturalWidth * scale));
  const drawH = Math.max(1, Math.round(image.naturalHeight * scale));
  ctx.drawImage(image, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
  const toBlob = (type: string, quality: number) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  try {
    const blob = (await toBlob('image/webp', .78)) ?? (await toBlob('image/jpeg', .84));
    if (!blob) throw new Error('Неуспешна миниатюра');
    return { blob, width, height };
  } finally {
    canvas.width = 0; canvas.height = 0;
  }
}
