/** Day 33: local, feature-based registration of a reference drawing against pencil/ink marks on white paper.
 * No network, model download, camera ownership, or project writes. Uses bounded grayscale/edge features + robust similarity fit.
 */
export interface GrayImage { width: number; height: number; data: Uint8Array }
export interface Point { x: number; y: number }
export interface SimilarityTransform { scale: number; rotationDeg: number; tx: number; ty: number; inliers: number; matches: number; confidence: number }
export interface AlignOptions { maxDimension?: number; maxFeatures?: number; minInliers?: number; minConfidence?: number }
export interface PaperRegion { x: number; y: number; width: number; height: number; confidence: number; coverage: number }
type Feature = { x: number; y: number; descriptor: Uint8Array; score: number };

function downscale(image: GrayImage, maxDimension: number): GrayImage {
  const factor = Math.min(1, maxDimension / Math.max(image.width, image.height));
  if (factor === 1) return image;
  const width = Math.max(8, Math.round(image.width * factor));
  const height = Math.max(8, Math.round(image.height * factor));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(image.width - 1, Math.round(x / factor));
    const sy = Math.min(image.height - 1, Math.round(y / factor));
    data[y * width + x] = image.data[sy * image.width + sx];
  }
  return { width, height, data };
}
function edgeMap(image: GrayImage): GrayImage {
  const { width: w, height: h, data: src } = image;
  const out = new Uint8Array(w * h);
  // Local contrast normalization suppresses slow paper illumination/shadows.
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x;
    const gx = Math.abs(src[i + 1] - src[i - 1]);
    const gy = Math.abs(src[i + w] - src[i - w]);
    const d1 = Math.abs(src[i + w + 1] - src[i - w - 1]);
    const d2 = Math.abs(src[i - w + 1] - src[i + w - 1]);
    const mag = Math.max(gx, gy, Math.round((d1 + d2) * .5));
    // Keep dark pencil/ink strokes and sharp edges; threshold adapts to local contrast.
    // Graphite has much lower contrast than marker ink. A lower gradient floor
    // is safe here because sheet isolation happens before this edge pass.
    out[i] = mag >= 8 ? 255 : 0;
  }
  return { width: w, height: h, data: out };
}
// Fixed deterministic BRIEF sampling pattern; descriptors are stable across runs/devices.
const pairs: Int8Array = (() => {
  const p = new Int8Array(256 * 4); let s = 0x51f15e;
  const rnd = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 0x100000000) * 13 - 6; };
  for (let i = 0; i < 256; i++) { p[i * 4] = Math.round(rnd()); p[i * 4 + 1] = Math.round(rnd()); p[i * 4 + 2] = Math.round(rnd()); p[i * 4 + 3] = Math.round(rnd()); }
  return p;
})();
function features(input: GrayImage, maxFeatures: number): Feature[] {
  const img = edgeMap(input), { width: w, height: h, data } = img;
  const candidates: { x: number; y: number; score: number }[] = [];
  for (let y = 8; y < h - 8; y += 2) for (let x = 8; x < w - 8; x += 2) {
    const i = y * w + x;
    // Harris-like corner response on binary edge map.
    let xx = 0, yy = 0, xy = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const j = (y + dy) * w + x + dx;
      const gx = data[j + 1] - data[j - 1], gy = data[j + w] - data[j - w];
      xx += gx * gx; yy += gy * gy; xy += gx * gy;
    }
    const score = xx * yy - xy * xy - .045 * (xx + yy) ** 2;
    if (score > 1.5e9) candidates.push({ x, y, score });
    void i;
  }
  candidates.sort((a, b) => b.score - a.score);
  const chosen: Feature[] = [];
  for (const c of candidates) {
    if (chosen.some(f => (f.x - c.x) ** 2 + (f.y - c.y) ** 2 < 64)) continue;
    const descriptor = new Uint8Array(32);
    for (let k = 0; k < 256; k++) {
      const o = k * 4;
      const a = data[(c.y + pairs[o + 1]) * w + c.x + pairs[o]];
      const b = data[(c.y + pairs[o + 3]) * w + c.x + pairs[o + 2]];
      if (a < b) descriptor[k >>> 3] |= 1 << (k & 7);
    }
    chosen.push({ ...c, descriptor });
    if (chosen.length >= maxFeatures) break;
  }
  return chosen;
}
function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) { let v = a[i] ^ b[i]; v = v - ((v >>> 1) & 0x55); v = (v & 0x33) + ((v >>> 2) & 0x33); d += (v + (v >>> 4)) & 0x0f; }
  return d;
}
type Match = { a: Feature; b: Feature; distance: number };
function matchFeatures(a: Feature[], b: Feature[]): Match[] {
  const nearest = (from: Feature[], to: Feature[]): { index: number; best: number; second: number }[] => from.map(f => {
    let index = -1, best = 257, second = 257;
    for (let i = 0; i < to.length; i++) { const d = hamming(f.descriptor, to[i].descriptor); if (d < best) { second = best; best = d; index = i; } else if (d < second) second = d; }
    return { index, best, second };
  });
  const ab = nearest(a, b), ba = nearest(b, a), out: Match[] = [];
  for (let i = 0; i < ab.length; i++) { const n = ab[i]; if (n.index >= 0 && n.best < 92 && n.best < n.second * .82 && ba[n.index]?.index === i) out.push({ a: a[i], b: b[n.index], distance: n.best }); }
  return out;
}
function fitTwo(m1: Match, m2: Match): SimilarityTransform | null {
  const ax = m2.a.x - m1.a.x, ay = m2.a.y - m1.a.y;
  const bx = m2.b.x - m1.b.x, by = m2.b.y - m1.b.y;
  const den = ax * ax + ay * ay; if (den < 100) return null;
  const real = (ax * bx + ay * by) / den, imag = (ax * by - ay * bx) / den;
  const scale = Math.hypot(real, imag); if (scale < .12 || scale > 8) return null;
  const tx = m1.b.x - (real * m1.a.x - imag * m1.a.y);
  const ty = m1.b.y - (imag * m1.a.x + real * m1.a.y);
  return { scale, rotationDeg: Math.atan2(imag, real) * 180 / Math.PI, tx, ty, inliers: 0, matches: 0, confidence: 0 };
}
function error(t: SimilarityTransform, m: Match): number {
  const r = t.rotationDeg * Math.PI / 180, c = Math.cos(r) * t.scale, s = Math.sin(r) * t.scale;
  return Math.hypot(c * m.a.x - s * m.a.y + t.tx - m.b.x, s * m.a.x + c * m.a.y + t.ty - m.b.y);
}
/**
 * Find the dominant neutral-bright sheet in a camera frame. The scan is kept
 * local and bounded (the caller limits frames to 640 px). A connected bright
 * region is preferred over simply thresholding the whole image, so a dark desk,
 * coloured mat or room background does not become part of the feature matcher.
 * Returns null when a white/off-white sheet cannot be separated confidently.
 */
export function detectWhitePaperRegion(
  rgba: Uint8ClampedArray, width: number, height: number,
): PaperRegion | null {
  const total = width * height;
  if (width < 64 || height < 64 || rgba.length < total * 4) return null;

  const gray = new Uint8Array(total);
  const neutral = new Uint8Array(total);
  const histogram = new Uint32Array(256);
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    const luminance = Math.round(.299 * r + .587 * g + .114 * b);
    gray[i] = luminance;
    // Warm indoor lighting is allowed; highly saturated objects are not paper.
    if (hi - lo <= 105) {
      neutral[i] = 1;
      histogram[luminance]++;
    }
  }

  // Otsu threshold over neutral pixels, clamped to a useful white-paper range.
  let count = 0, sum = 0;
  for (let i = 0; i < 256; i++) { count += histogram[i]; sum += i * histogram[i]; }
  if (!count) return null;
  let backgroundCount = 0, backgroundSum = 0, bestVariance = -1, otsu = 170;
  for (let threshold = 0; threshold < 256; threshold++) {
    backgroundCount += histogram[threshold];
    backgroundSum += threshold * histogram[threshold];
    const foregroundCount = count - backgroundCount;
    if (!backgroundCount || !foregroundCount) continue;
    const meanBackground = backgroundSum / backgroundCount;
    const meanForeground = (sum - backgroundSum) / foregroundCount;
    const variance = backgroundCount * foregroundCount * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) { bestVariance = variance; otsu = threshold; }
  }
  const threshold = Math.max(142, Math.min(218, otsu));
  let mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (neutral[i] && gray[i] >= threshold) mask[i] = 1;
  }

  // Close thin pencil/pen gaps in the white region before labelling components.
  const dilated = new Uint8Array(total);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    if (mask[i] || mask[i - 1] || mask[i + 1] || mask[i - width] || mask[i + width] ||
        mask[i - width - 1] || mask[i - width + 1] || mask[i + width - 1] || mask[i + width + 1]) {
      dilated[i] = 1;
    }
  }
  mask = new Uint8Array(total);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    if (dilated[i] && dilated[i - 1] && dilated[i + 1] && dilated[i - width] && dilated[i + width]) {
      mask[i] = 1;
    }
  }

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let best: { minX: number; minY: number; maxX: number; maxY: number; area: number } | null = null;
  for (let start = 0; start < total; start++) {
    if (!mask[start] || visited[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let minX = width, minY = height, maxX = -1, maxY = -1, area = 0;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width, y = Math.floor(index / width);
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0) {
        const next = index - 1;
        if (!visited[next] && mask[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (x + 1 < width) {
        const next = index + 1;
        if (!visited[next] && mask[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (y > 0) {
        const next = index - width;
        if (!visited[next] && mask[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (y + 1 < height) {
        const next = index + width;
        if (!visited[next] && mask[next]) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    const boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1;
    const boxArea = boxWidth * boxHeight;
    const aspect = boxWidth / Math.max(1, boxHeight);
    const coverage = area / total;
    const fill = area / Math.max(1, boxArea);
    if (coverage < .10 || coverage > .92 || boxWidth < width * .28 || boxHeight < height * .28 ||
        aspect < .32 || aspect > 3.1 || fill < .30) continue;
    if (!best || area > best.area) best = { minX, minY, maxX, maxY, area };
  }
  if (!best) return null;

  // Exclude the paper edge and any shadow just outside it from contour matching.
  const rawWidth = best.maxX - best.minX + 1;
  const rawHeight = best.maxY - best.minY + 1;
  const insetX = Math.max(2, Math.round(rawWidth * .018));
  const insetY = Math.max(2, Math.round(rawHeight * .018));
  const x = best.minX + insetX, y = best.minY + insetY;
  const right = best.maxX + 1 - insetX, bottom = best.maxY + 1 - insetY;
  const cropWidth = right - x, cropHeight = bottom - y;
  if (cropWidth < 64 || cropHeight < 64) return null;
  const coverage = best.area / total;
  const confidence = Math.max(0, Math.min(1, .55 + Math.min(.25, coverage * .35) + Math.min(.2, (best.area / (rawWidth * rawHeight)) * .2)));
  return { x, y, width: cropWidth, height: cropHeight, confidence, coverage };
}

export function estimateContourAlignment(reference: GrayImage, camera: GrayImage, options: AlignOptions = {}): SimilarityTransform | null {
  const maxDimension = options.maxDimension ?? 480;
  const ref = downscale(reference, maxDimension), cam = downscale(camera, maxDimension);
  if (ref.width < 48 || ref.height < 48 || cam.width < 48 || cam.height < 48) return null;
  const refScaleX = reference.width / ref.width, refScaleY = reference.height / ref.height;
  const camScaleX = camera.width / cam.width, camScaleY = camera.height / cam.height;
  if (Math.abs(refScaleX / refScaleY - 1) > .02 || Math.abs(camScaleX / camScaleY - 1) > .02) return null;
  const fa = features(ref, options.maxFeatures ?? 420), fb = features(cam, options.maxFeatures ?? 420);
  if (fa.length < 8 || fb.length < 8) return null;
  const matches = matchFeatures(fa, fb);
  if (matches.length < (options.minInliers ?? 8)) return null;
  let best: SimilarityTransform | null = null;
  // Deterministic bounded RANSAC; no random source and stable test output.
  const trials = Math.min(700, matches.length * 18);
  for (let i = 0; i < trials; i++) {
    const m1 = matches[(i * 17 + 3) % matches.length], m2 = matches[(i * 37 + 11) % matches.length];
    if (m1 === m2) continue;
    const candidate = fitTwo(m1, m2); if (!candidate) continue;
    let inliers = 0, totalError = 0;
    for (const m of matches) { const e = error(candidate, m); if (e <= 5.5) { inliers++; totalError += e; } }
    if (!best || inliers > best.inliers || (inliers === best.inliers && totalError < (best as SimilarityTransform & { _err?: number })._err!)) {
      best = { ...candidate, inliers, matches: matches.length, confidence: inliers / Math.max(1, matches.length) } as SimilarityTransform;
      (best as SimilarityTransform & { _err?: number })._err = totalError;
    }
  }
  if (!best || best.inliers < (options.minInliers ?? 8) || best.confidence < (options.minConfidence ?? .28)) return null;
  // Refit from inliers using least-squares similarity transform.
  const inliers = matches.filter(m => error(best!, m) <= 5.5);
  const ma = inliers.reduce((p, m) => ({ x: p.x + m.a.x, y: p.y + m.a.y }), { x: 0, y: 0 });
  const mb = inliers.reduce((p, m) => ({ x: p.x + m.b.x, y: p.y + m.b.y }), { x: 0, y: 0 });
  ma.x /= inliers.length; ma.y /= inliers.length; mb.x /= inliers.length; mb.y /= inliers.length;
  let den = 0, real = 0, imag = 0;
  for (const m of inliers) { const x = m.a.x - ma.x, y = m.a.y - ma.y, u = m.b.x - mb.x, v = m.b.y - mb.y; den += x*x+y*y; real += x*u+y*v; imag += x*v-y*u; }
  if (den > 0) { real /= den; imag /= den; best.scale = Math.hypot(real, imag); best.rotationDeg = Math.atan2(imag, real) * 180 / Math.PI; best.tx = mb.x - real * ma.x + imag * ma.y; best.ty = mb.y - imag * ma.x - real * ma.y; }
  // Convert from reduced-image coordinates back to original reference/camera pixels.
  // Convert the reduced transform back to the original canvas coordinate
  // systems: camera pixels per reference pixel. The previous reciprocal
  // (refScale/camScale) distorted matches whenever the two canvases differed.
  best.scale *= camScaleX / refScaleX;
  best.tx *= camScaleX; best.ty *= camScaleY;
  return best;
}
export function rgbaToGray(data: Uint8ClampedArray, width: number, height: number): GrayImage {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = Math.round(.299 * data[p] + .587 * data[p + 1] + .114 * data[p + 2]);
  return { width, height, data: gray };
}
