/** Day 13: diagnostic-only project image -> grayscale -> Pyodide -> alpha PNG.
 * Does not touch Drawing UI and never logs original image pixels.
 */
import { getProjectImage, listProjectThumbnails } from './storage/project-store';
import { saveProcessedPng, type ProcessedProvenance } from './storage/day13-processed';
import { runPythonImage } from './python-client';
import { log } from './diagnostics';

const PARAMS = { sigma: 1, low: .04, high: .10, input: 'grayscale-u8' as const, maxSide: 1024 as const };

export async function decodeReducedGray(blob: Blob): Promise<{ gray: Uint8Array; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  const canvas = document.createElement('canvas');
  try {
    img.src = url;
    // HTML image decode follows browser orientation handling. Verify HEIC/EXIF on iPhone.
    await img.decode();
    const sw = img.naturalWidth, sh = img.naturalHeight;
    if (!sw || !sh) throw new Error('Изображението не може да се декодира');
    const scale = Math.min(1, 1024 / Math.max(sw, sh));
    const width = Math.max(3, Math.round(sw * scale));
    const height = Math.max(3, Math.round(sh * scale));
    if (width > 1024 || height > 1024) throw new Error('Невалиден размер');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D не е наличен');
    // White backing for transparency: grayscale input is unambiguous.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);
    for (let i = 0, k = 0; k < gray.length; i += 4, k++) {
      gray[k] = Math.max(0, Math.min(255, Math.round(
        pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722)));
    }
    return { gray, width, height };
  } finally {
    img.removeAttribute('src');
    URL.revokeObjectURL(url);
    canvas.width = 0; canvas.height = 0;
  }
}

export async function encodeTransparentPng(mask: Uint8Array, width: number, height: number): Promise<Blob> {
  if (mask.length !== width * height) throw new Error('Невалиден резултат от Python');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PNG Canvas 2D не е наличен');
    const image = ctx.createImageData(width, height);
    // Every detected edge becomes opaque black; background fully transparent.
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] > 1) throw new Error('Python mask must contain only 0/1');
      image.data[i * 4 + 3] = mask[i] ? 255 : 0;
    }
    ctx.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.type !== 'image/png') throw new Error('PNG export е неуспешен');
    return blob;
  } finally {
    canvas.width = 0; canvas.height = 0;
  }
}

export function initDay13ImageBridge(): void {
  const select = document.getElementById('day13-project') as HTMLSelectElement;
  const refresh = document.getElementById('btn-day13-refresh') as HTMLButtonElement;
  const run = document.getElementById('btn-day13-process') as HTMLButtonElement;
  const download = document.getElementById('btn-day13-export') as HTMLButtonElement;
  const output = document.getElementById('day13-result') as HTMLElement;
  const preview = document.getElementById('day13-preview') as HTMLImageElement;
  if (!select || !refresh || !run || !download || !output || !preview) return;

  let revision = 0;
  let inProgress = false;
  let previewUrl: string | null = null;
  let last: { blob: Blob; name: string } | null = null;
  function clearResult(): void {
    revision++;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null; last = null; preview.hidden = true; preview.removeAttribute('src');
    download.disabled = true;
    output.textContent = 'Избери запазен проект и стартирай обработката.';
  }
  async function refreshProjects(): Promise<void> {
    clearResult();
    const selected = select.value;
    select.replaceChildren();
    const cards = await listProjectThumbnails();
    for (const card of cards) {
      const option = new Option(card.project.title, card.project.id);
      select.add(option);
    }
    if (cards.some(card => card.project.id === selected)) select.value = selected;
    run.disabled = inProgress || cards.length === 0;
    output.textContent = cards.length ? `Налични проекти: ${cards.length}. Няма промени по оригиналите.` : 'Няма записани проекти.';
  }
  refresh.addEventListener('click', () => { void refreshProjects().catch(error => { output.textContent = String(error); }); });
  select.addEventListener('change', clearResult);
  run.addEventListener('click', () => {
    if (inProgress || !select.value) return;
    const projectId = select.value;
    clearResult();
    const current = revision;
    inProgress = true; run.disabled = true; refresh.disabled = true;
    output.textContent = 'Декодиране на избраната снимка и обработка в Pyodide…';
    void (async () => {
      const { source } = await getProjectImage(projectId);
      if (current !== revision || select.value !== projectId) return;
      const decoded = await decodeReducedGray(source.blob);
      if (current !== revision || select.value !== projectId) return;
      const result = await runPythonImage({ ...decoded, ...PARAMS });
      if (current !== revision || select.value !== projectId) return;
      const png = await encodeTransparentPng(result.mask, result.width, result.height);
      if (current !== revision || select.value !== projectId) return;
      const provenance: ProcessedProvenance = {
        sourceAssetId: source.id, pipelineVersion: result.pipelineVersion,
        params: { ...PARAMS }, modelId: 'none', backend: 'numpy-pyodide',
      };
      const saved = await saveProcessedPng(projectId, provenance, png, result.width, result.height);
      // If another project was selected during the IDB write, do not display the old result.
      if (current !== revision || select.value !== projectId) return;
      previewUrl = URL.createObjectURL(png);
      preview.src = previewUrl;
      preview.hidden = false;
      last = { blob: png, name: `SketchyAR-${saved.id}.png` };
      download.disabled = false;
      const report = {
        status: 'PASS', projectId, sourceAssetId: source.id, processedAssetId: saved.id,
        sourceBytes: source.byteSize, width: result.width, height: result.height,
        inkPixels: result.inkPixels, pngBytes: png.size, alpha: true,
        inputBytes: decoded.gray.byteLength, requestId: result.requestId,
        pipelineVersion: result.pipelineVersion, bridgeVersion: result.bridgeVersion,
        processingMs: result.processingMs, workerRequestMs: result.workerRequestMs,
      };
      output.textContent = JSON.stringify(report, null, 2);
      log('info', 'day13.real_image', 'Processed PNG saved', report);
    })().catch((error: unknown) => {
      if (current !== revision) return;
      const message = error instanceof Error ? error.message : String(error);
      output.textContent = JSON.stringify({ status: 'FAIL', error: message }, null, 2);
      log('error', 'day13.real_image', message, { projectId });
    }).finally(() => {
      inProgress = false;
      refresh.disabled = false;
      run.disabled = select.options.length === 0;
    });
  });
  download.addEventListener('click', () => {
    if (!last) return;
    const file = new File([last.blob], last.name, { type: 'image/png' });
    // On iPhone Home Screen, the native share sheet is the most dependable export.
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      void navigator.share({ files: [file], title: 'SketchyAR контурна скица' }).catch(error => {
        // A cancelled share is not proof that a backup/export was saved.
        log('info', 'day13.png_export', 'Share dialog closed', { reason: String(error) });
      });
      return;
    }
    const url = URL.createObjectURL(last.blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = last.name;
    document.body.appendChild(anchor);
    anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
  void refreshProjects().catch(error => { output.textContent = String(error); });
}
