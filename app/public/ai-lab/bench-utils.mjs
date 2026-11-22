/** SketchyAR Day 32.1 — pure, deterministic benchmark calculations; no image data. */
export const BENCH_SCHEMA = 'sketchyar-iphone-ai-bench-v1';
export const IMAGE_SIZES = Object.freeze([128, 192, 256, 384, 512]);
export const MODEL_ID = 'animegan-js-original-v1-tfjs';
export const MODEL_CACHE = 'indexeddb://sketchyar-iphone-animegan-original-v1';
export const RUNTIME_CACHE = 'sketchyar-ai-lab-runtime-v1';
export const TFJS_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
// Pinned source is the author's public TF.js graph model, originally ~15.7 MB.
// No photo is ever sent to this URL. License: non-commercial research only.
export const MODEL_URL = 'https://raw.githubusercontent.com/TonyLianLong/AnimeGAN.js/0be777fb0fc00279ee4bd28d72cfa255c4dda639/public/model_full/model.json';

export function validSize(value) {
  const size = Number(value);
  if (!Number.isInteger(size) || !IMAGE_SIZES.includes(size)) throw new RangeError('Неподдържан размер за тест');
  return size;
}
export function fitToMaxSide(width, height, side) {
  validSize(side);
  if (![width, height].every(x => Number.isFinite(x) && x > 0)) throw new RangeError('Невалидни размери');
  const scale = side / Math.max(width, height);
  const w = Math.max(16, Math.round(width * scale / 8) * 8);
  const h = Math.max(16, Math.round(height * scale / 8) * 8);
  return { width: Math.min(side, w), height: Math.min(side, h) };
}
export function medianMs(values) {
  if (!Array.isArray(values) || !values.length || values.some(x => !Number.isFinite(x) || x < 0)) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return Number((sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
}
/** Only aggregated technical values are exportable; never image bytes or file names. */
export function summarizeRuns(runs) {
  const result = {};
  for (const size of IMAGE_SIZES) {
    const group = runs.filter(r => r.longSide === size && r.status === 'ok');
    if (!group.length) continue;
    result[String(size)] = {
      count: group.length,
      medianInferenceMs: medianMs(group.map(x => x.inferenceMs)),
      medianTotalMs: medianMs(group.map(x => x.totalMs)),
      maxTfBytesAfterRun: Math.max(...group.map(x => Number.isFinite(x.tfBytesAfterRun) ? x.tfBytesAfterRun : 0)),
    };
  }
  return result;
}
