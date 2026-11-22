/** Day 31: real Manga image-to-ink, independent of the unchanged Sketch V4.
 * Only the editor commits drafts; this module never modifies projects/camera.
 */
import { decodeReducedMangaGray, encodeTransparentPng } from './day13-image-bridge';
import { runPythonImage } from './python-client';
import { SKETCH_V4_SETTINGS, type SketchDraftResult } from './day22-sketch-mode';
import type { SketchUiLine } from './day20-sketch-state';

export const MANGA_QUALITY_VERSION = 'day31-manga-layers-v1';
const grayCache = new WeakMap<Blob, Promise<Awaited<ReturnType<typeof decodeReducedMangaGray>>>>();

export async function generateMangaDraft(source: Blob, detail: 1 | 2 | 3 | 4 | 5 = 3,
                                        line: SketchUiLine = 'normal'): Promise<SketchDraftResult> {
  if (!source || !source.size) throw new Error('Няма оригинална снимка за Манга.');
  let decoded = grayCache.get(source);
  if (!decoded) {
    decoded = decodeReducedMangaGray(source).catch((error: unknown) => {
      grayCache.delete(source); throw error;
    });
    grayCache.set(source, decoded);
  }
  const gray = await decoded;
  const result = await runPythonImage({ ...gray, ...SKETCH_V4_SETTINGS, detail, line, style: 'manga' });
  if (result.pipelineVersion !== MANGA_QUALITY_VERSION)
    throw new Error('Модулът Манга върна неочаквана версия на алгоритъма.');
  if (!result.inkPixels) throw new Error('Не бяха открити манга линии в изображението.');
  const png = await encodeTransparentPng(result.mask, result.width, result.height);
  if (!png.size) throw new Error('Получен е празен Манга PNG.');
  return {
    png, width: result.width, height: result.height, inkPixels: result.inkPixels,
    processingMs: result.processingMs, workerRequestMs: result.workerRequestMs,
    pipelineVersion: result.pipelineVersion, requestId: result.requestId,
  };
}
