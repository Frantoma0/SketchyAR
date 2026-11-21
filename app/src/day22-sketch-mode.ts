/** Day 22: the first REAL Sketch contour preview, using the tested Day 13 pipeline.
 * Detail/line/style variants are intentionally NOT applied yet.
 * The PNG is a temporary draft; no DB write or camera routing occurs in this module.
 */
import { decodeReducedGray, encodeTransparentPng } from './day13-image-bridge';
import { runPythonImage } from './python-client';
export { SketchDraftGate } from './day22-sketch-gate';

/** Version is checked when reading a cached draft; old applied drawings stay valid. */
export const SKETCH_QUALITY_VERSION = 'day25-sketch-quality-v1';

export const SKETCH_V1_SETTINGS = Object.freeze({ sigma: 1, low: 0.04, high: 0.10 });

export interface SketchDraftResult {
  png: Blob;
  width: number;
  height: number;
  inkPixels: number;
  processingMs: number;
  workerRequestMs: number;
  pipelineVersion: string;
  requestId: string;
}

/** White-composited source -> grayscale <=1024px -> real Python edges -> alpha PNG.
 * Does not alter the original or save a processed asset: explicit save follows later.
 */
export async function generateSketchDraft(source: Blob): Promise<SketchDraftResult> {
  if (!source || source.size === 0) throw new Error('Няма оригинална снимка за обработка.');
  const gray = await decodeReducedGray(source);
  const result = await runPythonImage({ ...gray, ...SKETCH_V1_SETTINGS });
  if (result.inkPixels === 0) throw new Error('Не бяха открити контури в избраното изображение.');
  const png = await encodeTransparentPng(result.mask, result.width, result.height);
  if (!png.size) throw new Error('Получена е празна PNG скица.');
  return {
    png, width: result.width, height: result.height, inkPixels: result.inkPixels,
    processingMs: result.processingMs, workerRequestMs: result.workerRequestMs,
    pipelineVersion: result.pipelineVersion, requestId: result.requestId,
  };
}
