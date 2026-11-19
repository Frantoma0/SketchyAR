/** Create only a tiny gallery preview. The full input Blob stays untouched in IndexedDB. */
export async function makeThumbnail(image: HTMLImageElement): Promise<{ blob: Blob; width: number; height: number }> {
  const width = 320;
  const height = 320;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D не е наличен за миниатюра');
  // Cover the entire 320×320 polaroid window: crop the source centrally,
  // never pad it with opaque white sidebars. The original source Blob is kept
  // completely untouched in IndexedDB.
  const sourceW = image.naturalWidth;
  const sourceH = image.naturalHeight;
  if (!sourceW || !sourceH) throw new Error('Невалидно изображение за миниатюра');
  const cropSize = Math.min(sourceW, sourceH);
  const cropX = (sourceW - cropSize) / 2;
  const cropY = (sourceH - cropSize) / 2;
  ctx.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, width, height);
  const toBlob = (type: string, quality: number) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  try {
    const blob = (await toBlob('image/webp', .78)) ?? (await toBlob('image/jpeg', .84));
    if (!blob) throw new Error('Неуспешна миниатюра');
    return { blob, width, height };
  } finally {
    canvas.width = 0; canvas.height = 0;
  }
}
