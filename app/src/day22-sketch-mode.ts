/** Day 30: Sketch V4 with five detail tiers and three real line widths.
 * Manga / Comic remain future work.
 * The PNG is a temporary draft; no DB write or camera routing occurs in this module.
 */
import { decodeReducedGray, encodeTransparentPng } from './day13-image-bridge';
import { runPythonImage } from './python-client';
import type { SketchUiLine } from './day20-sketch-state';
export { SketchDraftGate } from './day22-sketch-gate';

/** Version is checked when reading a cached draft; old applied drawings stay valid. */
export const SKETCH_QUALITY_VERSION = 'day30-v4-stroke-v1';

// Historical V1 settings remain for reproducible Day 12/25 comparisons.
export const SKETCH_V1_SETTINGS = Object.freeze({ sigma: 1, low: 0.04, high: 0.10 });
/** Inactive historical V2 settings retained for reproducible comparisons. */
export const SKETCH_V2_SETTINGS = Object.freeze({ sigma: 1, low: 0.04, high: 0.10 });
/** The inactive historical Sketch V3 Worker pipeline. */
export const SKETCH_V3_SETTINGS = Object.freeze({ sigma: 1, low: 0.04, high: 0.10 });
/** Only production settings for the active Sketch V4 Worker pipeline. */
export const SKETCH_V4_SETTINGS = Object.freeze({ sigma: 1, low: 0.04, high: 0.10 });

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

// Decoding the same original on every slider move is unnecessary: the Worker
// already caches the V4 score, and a WeakMap retains <=1 MiB gray8 per Blob.
// Entries are GC-eligible when the editor releases its source Blob.
const grayCache = new WeakMap<Blob, Promise<Awaited<ReturnType<typeof decodeReducedGray>>>>();

/** White-composited source -> grayscale <=1024px -> real Python edges -> alpha PNG.
 * Does not alter the original or save a processed asset: explicit save follows later.
 */
export async function generateSketchDraft(source: Blob, detail: 1 | 2 | 3 | 4 | 5 = 3,
                                          line: SketchUiLine = 'normal'): Promise<SketchDraftResult> {
  if (!source || source.size === 0) throw new Error('Няма оригинална снимка за обработка.');
  let decoded = grayCache.get(source);
  if (!decoded) {
    decoded = decodeReducedGray(source).catch((error: unknown) => {
      grayCache.delete(source);
      throw error;
    });
    grayCache.set(source, decoded);
  }
  const gray = await decoded;
  const result = await runPythonImage({ ...gray, ...SKETCH_V4_SETTINGS, detail, line });
  if (result.inkPixels === 0) throw new Error('Не бяха открити контури в избраното изображение.');
  const png = await encodeTransparentPng(result.mask, result.width, result.height);
  if (!png.size) throw new Error('Получена е празна PNG скица.');
  return {
    png, width: result.width, height: result.height, inkPixels: result.inkPixels,
    processingMs: result.processingMs, workerRequestMs: result.workerRequestMs,
    pipelineVersion: result.pipelineVersion, requestId: result.requestId,
  };
}
