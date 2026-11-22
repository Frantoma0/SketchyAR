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

/** Day 32.2: never send an untested 384/512 texture through the full CNN.
 * Our first real iPhone sample was 168x256 = 43,008 input pixels. A tile's
 * upper bound deliberately stays at that observed input *area*. This is
 * not a guarantee about intermediate GPU allocations on other images.
 */
export const MAX_DIRECT_PIXELS = 168 * 256;
export const MAX_TILE_WIDTH = 192;
export const MAX_TILE_HEIGHT = 224;
export const TILE_OVERLAP = 32;

export function tileStarts(length, tile, overlap = TILE_OVERLAP) {
  if (![length, tile, overlap].every(Number.isInteger) || length < 16 || tile < 16 || overlap < 0 || overlap >= tile)
    throw new RangeError('Невалидни размери на AI плочките');
  if (length <= tile) return [0];
  const starts = [0];
  while (starts[starts.length - 1] + tile < length) {
    const next = Math.min(length - tile, starts[starts.length - 1] + tile - overlap);
    if (next <= starts[starts.length - 1]) throw new Error('AI tile progress stalled');
    starts.push(next);
  }
  return starts;
}

/** Covers the output without gaps; deterministic order, identical bounded inference sizes. */
export function planInference(width, height, side) {
  validSize(side);
  if (![width,height].every(x => Number.isInteger(x) && x >= 16 && x <= side && x % 8 === 0))
    throw new RangeError('Очаква се предварително оразмерено изображение, кратно на 8');
  if (side <= 256 && width * height <= MAX_DIRECT_PIXELS) return { mode: 'direct', tiles: [{ x:0, y:0, width, height }] };
  const w = Math.min(width, MAX_TILE_WIDTH);
  const h = Math.min(height, MAX_TILE_HEIGHT);
  const xs = tileStarts(width,w);
  const ys = tileStarts(height,h);
  const tiles = [];
  for(let row=0; row<ys.length;row++) for(let col=0;col<xs.length;col++) {
    const x=xs[col], y=ys[row];
    tiles.push({ x,y,width:w,height:h,
      leftOverlap:col? xs[col-1]+w-x:0,
      rightOverlap:col+1<xs.length? x+w-xs[col+1]:0,
      topOverlap:row? ys[row-1]+h-y:0,
      bottomOverlap:row+1<ys.length? y+h-ys[row+1]:0,
    });
  }
  return { mode: 'tiled', tiles };
}

/** Smooth alpha blending of separately stylized neighboring tiles. */
export function blendWeight(offset, length, before, after) {
  if (![offset,length,before,after].every(Number.isFinite) || offset < 0 || offset >= length)
    throw new RangeError('Невалидна позиция за смесване');
  let weight=1;
  if (before) weight=Math.min(weight,(offset+0.5)/before);
  if (after) weight=Math.min(weight,(length-offset-0.5)/after);
  return Math.max(1e-6,weight);
}
