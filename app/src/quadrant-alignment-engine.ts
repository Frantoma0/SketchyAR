/** Day 33.3 — adaptive partial-sketch quadrant registration engine.
 * 4x4 coarse localisation, 6x6 validation/refinement, adjacent-cell consensus
 * and temporal frame fusion. No network, external model or native dependency.
 */
import {
  downscale, features, fitTwo, error,
  type Feature, type Match,
  type AlignOptions, type GrayImage, type SimilarityTransform,
} from './day33-contour-align.ts';

/** A quadrant-driven match: the 4x4 pass finds the coarse placement, then the
 * 6x6 pass adds local support around that single global transform. Individual
 * cells never receive their own scale/position. */
export interface QuadrantAlignOptions extends AlignOptions {
  coarseGridSize?: number;
  fineGridSize?: number;
  minAdjacentQuadrants?: number;
  overlap?: number;
}
export interface QuadrantAlignment extends SimilarityTransform {
  coarseGridSize: number;
  fineGridSize: number;
  coarseQuadrants: number;
  fineQuadrants: number;
  adjacencyLinks: number;
  coarseMatches: number;
  fineMatches: number;
}
type QuadrantMatch = Match & { cell: number; row: number; col: number; grid: number; sourceKey: string };
type GridSupport = { activeCells: number[]; adjacencyLinks: number; counts: Map<number, number> };

export interface QuadrantAttemptDiagnostics {
  reason: 'success' | 'small-image' | 'aspect-ratio' | 'few-features' | 'few-matches' |
    'no-adjacent-consensus' | 'few-final-inliers' | 'low-confidence';
  referenceFeatures: number;
  cameraFeatures: number;
  coarseMatches: number;
  coarseInliers: number;
  coarseQuadrants: number;
  adjacencyLinks: number;
  fineMatches: number;
  finalInliers: number;
  confidence: number;
}
export interface QuadrantAlignmentAttempt {
  alignment: QuadrantAlignment | null;
  diagnostics: QuadrantAttemptDiagnostics;
}

function spatiallyBalancedFeatures(items: Feature[], width: number, height: number, limit: number): Feature[] {
  const grid = 8;
  const buckets: Feature[][] = Array.from({ length: grid * grid }, () => []);
  for (const feature of items) {
    const col = Math.min(grid - 1, Math.max(0, Math.floor(feature.x / width * grid)));
    const row = Math.min(grid - 1, Math.max(0, Math.floor(feature.y / height * grid)));
    buckets[row * grid + col].push(feature);
  }
  // `features()` already orders by corner strength. Round-robin across spatial
  // buckets prevents a textured face/background from consuming the full budget.
  const selected: Feature[] = [];
  for (let depth = 0; selected.length < limit; depth++) {
    let added = false;
    for (const bucket of buckets) {
      if (depth < bucket.length) {
        selected.push(bucket[depth]);
        added = true;
        if (selected.length >= limit) break;
      }
    }
    if (!added) break;
  }
  return selected;
}

function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    let value = a[i] ^ b[i];
    value = value - ((value >>> 1) & 0x55);
    value = (value & 0x33) + ((value >>> 2) & 0x33);
    distance += (value + (value >>> 4)) & 0x0f;
  }
  return distance;
}

/**
 * Partial-sketch descriptor matching is deliberately more tolerant than the
 * full-image matcher. A pencil trace does not reproduce the reference's local
 * texture, so strict Lowe-ratio + one-to-one matching discards useful contour
 * points. Keep up to two plausible hypotheses per reference point, then let
 * the spatial RANSAC + neighbouring-cell consensus reject false matches.
 */
function matchPartialSketchFeatures(reference: Feature[], camera: Feature[]): Match[] {
  if (reference.length < 2 || camera.length < 2) return [];
  const cameraTop = camera.map(() => ({ indices: [-1, -1, -1], distances: [257, 257, 257] }));
  const referenceTop = reference.map(() => ({ indices: [-1, -1] as number[], distances: [257, 257] as number[] }));

  for (let ri = 0; ri < reference.length; ri++) {
    const candidates: Array<{ index: number; distance: number }> = [];
    for (let ci = 0; ci < camera.length; ci++) {
      const distance = hammingDistance(reference[ri].descriptor, camera[ci].descriptor);
      const reverse = cameraTop[ci];
      if (distance < reverse.distances[0]) {
        reverse.distances[2] = reverse.distances[1]; reverse.indices[2] = reverse.indices[1];
        reverse.distances[1] = reverse.distances[0]; reverse.indices[1] = reverse.indices[0];
        reverse.distances[0] = distance; reverse.indices[0] = ri;
      } else if (distance < reverse.distances[1]) {
        reverse.distances[2] = reverse.distances[1]; reverse.indices[2] = reverse.indices[1];
        reverse.distances[1] = distance; reverse.indices[1] = ri;
      } else if (distance < reverse.distances[2]) {
        reverse.distances[2] = distance; reverse.indices[2] = ri;
      }
      if (distance <= 150) {
        candidates.push({ index: ci, distance });
        if (candidates.length > 4) {
          candidates.sort((a, b) => a.distance - b.distance);
          candidates.length = 3;
        }
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const selected = candidates.slice(0, 2);
    for (let k = 0; k < selected.length; k++) {
      referenceTop[ri].indices[k] = selected[k].index;
      referenceTop[ri].distances[k] = selected[k].distance;
    }
  }

  const matches: Match[] = [];
  for (let ri = 0; ri < reference.length; ri++) {
    const top = referenceTop[ri];
    for (let k = 0; k < 2; k++) {
      const ci = top.indices[k], distance = top.distances[k];
      if (ci < 0 || distance > 150) continue;
      const reverse = cameraTop[ci];
      const reverseConsistent = reverse.indices.includes(ri);
      const strongSingleMatch = distance <= 76;
      if (!reverseConsistent && !strongSingleMatch) continue;
      matches.push({ a: reference[ri], b: camera[ci], distance });
    }
  }
  return matches;
}

function collectQuadrantMatches(
  referenceFeatures: Feature[], cameraFeatures: Feature[], width: number, height: number, grid: number, overlap: number,
): QuadrantMatch[] {
  const output = new Map<string, QuadrantMatch>();
  const cellWidth = width / grid, cellHeight = height / grid;
  for (let row = 0; row < grid; row++) for (let col = 0; col < grid; col++) {
    // The tile has a small shared margin. Feature descriptors were computed on
    // the full image, so their BRIEF context also crosses cell boundaries.
    const left = Math.max(0, col * cellWidth - cellWidth * overlap);
    const right = Math.min(width, (col + 1) * cellWidth + cellWidth * overlap);
    const top = Math.max(0, row * cellHeight - cellHeight * overlap);
    const bottom = Math.min(height, (row + 1) * cellHeight + cellHeight * overlap);
    const localFeatures = referenceFeatures.filter(feature =>
      feature.x >= left && feature.x < right && feature.y >= top && feature.y < bottom).slice(0, 120);
    if (localFeatures.length < 3 || cameraFeatures.length < 6) continue;
    const localMatches = matchPartialSketchFeatures(localFeatures, cameraFeatures)
      .sort((a, b) => a.distance - b.distance).slice(0, 36);
    for (const match of localMatches) {
      const matchCol = Math.min(grid - 1, Math.max(0, Math.floor(match.a.x / cellWidth)));
      const matchRow = Math.min(grid - 1, Math.max(0, Math.floor(match.a.y / cellHeight)));
      const sourceKey = `${Math.round(match.a.x)}:${Math.round(match.a.y)}`;
      const key = `${sourceKey}>${Math.round(match.b.x)}:${Math.round(match.b.y)}`;
      const candidate = { ...match, sourceKey, cell: matchRow * grid + matchCol, row: matchRow, col: matchCol, grid };
      const previous = output.get(key);
      if (!previous || candidate.distance < previous.distance) output.set(key, candidate);
    }
  }
  return [...output.values()];
}

function quadrantSupport(matches: QuadrantMatch[], transform: SimilarityTransform, threshold: number): GridSupport {
  const sourcesByCell = new Map<number, Set<string>>();
  for (const match of matches) if (error(transform, match) <= threshold) {
    const sources = sourcesByCell.get(match.cell) ?? new Set<string>();
    sources.add(match.sourceKey ?? `${Math.round(match.a.x)}:${Math.round(match.a.y)}`);
    sourcesByCell.set(match.cell, sources);
  }
  const counts = new Map<number, number>([...sourcesByCell.entries()].map(([cell, sources]) => [cell, sources.size]));
  const activeCells = [...counts.entries()].filter(([, count]) => count >= 2).map(([cell]) => cell);
  let adjacencyLinks = 0;
  const active = new Set(activeCells);
  for (const cell of activeCells) {
    const row = Math.floor(cell / (matches[0]?.grid ?? 1));
    const col = cell % (matches[0]?.grid ?? 1);
    if (col + 1 < (matches[0]?.grid ?? 1) && active.has(cell + 1)) adjacencyLinks++;
    if (row + 1 < (matches[0]?.grid ?? 1) && active.has(cell + (matches[0]?.grid ?? 1))) adjacencyLinks++;
  }
  return { activeCells, adjacencyLinks, counts };
}

function refitSimilarity(matches: Match[], seed: SimilarityTransform, threshold = 10.5): SimilarityTransform {
  const inliers = matches.filter(match => error(seed, match) <= threshold);
  if (inliers.length < 2) return seed;
  const source = inliers.reduce((sum, match) => ({ x: sum.x + match.a.x, y: sum.y + match.a.y }), { x: 0, y: 0 });
  const target = inliers.reduce((sum, match) => ({ x: sum.x + match.b.x, y: sum.y + match.b.y }), { x: 0, y: 0 });
  source.x /= inliers.length; source.y /= inliers.length;
  target.x /= inliers.length; target.y /= inliers.length;
  let denominator = 0, real = 0, imaginary = 0;
  for (const match of inliers) {
    const x = match.a.x - source.x, y = match.a.y - source.y;
    const u = match.b.x - target.x, v = match.b.y - target.y;
    denominator += x * x + y * y;
    real += x * u + y * v;
    imaginary += x * v - y * u;
  }
  if (denominator < 1e-6) return seed;
  real /= denominator; imaginary /= denominator;
  return {
    ...seed,
    scale: Math.hypot(real, imaginary),
    rotationDeg: Math.atan2(imaginary, real) * 180 / Math.PI,
    tx: target.x - real * source.x + imaginary * source.y,
    ty: target.y - imaginary * source.x - real * source.y,
  };
}

/**
 * Match a partially completed drawing with a quadrant consensus rather than
 * relying on one global feature cloud. 4x4 cells establish a candidate, while
 * 6x6 cells validate/refine it. At least two adjacent cells must support one
 * shared similarity transform. This is intentionally conservative: weak or
 * disconnected evidence returns null and cannot move the artwork.
 */
export function estimateQuadrantAlignmentDetailed(
  reference: GrayImage, camera: GrayImage, options: QuadrantAlignOptions = {},
): QuadrantAlignmentAttempt {
  const diagnostics: QuadrantAttemptDiagnostics = {
    reason: 'few-features', referenceFeatures: 0, cameraFeatures: 0, coarseMatches: 0,
    coarseInliers: 0, coarseQuadrants: 0, adjacencyLinks: 0, fineMatches: 0,
    finalInliers: 0, confidence: 0,
  };
  const fail = (reason: QuadrantAttemptDiagnostics['reason']): QuadrantAlignmentAttempt => {
    diagnostics.reason = reason;
    return { alignment: null, diagnostics };
  };
  const maxDimension = options.maxDimension ?? 480;
  const coarseGrid = Math.max(2, Math.min(8, Math.round(options.coarseGridSize ?? 4)));
  const fineGrid = Math.max(coarseGrid, Math.min(10, Math.round(options.fineGridSize ?? 6)));
  const overlap = Math.max(0, Math.min(.25, options.overlap ?? .12));
  const minInliers = options.minInliers ?? 6;
  const minAdjacent = options.minAdjacentQuadrants ?? 1;
  const ref = downscale(reference, maxDimension), cam = downscale(camera, maxDimension);
  if (ref.width < 64 || ref.height < 64 || cam.width < 64 || cam.height < 64) return fail('small-image');
  const refScaleX = reference.width / ref.width, refScaleY = reference.height / ref.height;
  const camScaleX = camera.width / cam.width, camScaleY = camera.height / cam.height;
  if (Math.abs(refScaleX / refScaleY - 1) > .02 || Math.abs(camScaleX / camScaleY - 1) > .02) return fail('aspect-ratio');

  // Slightly more candidates than the previous release, still bounded for iPhone.
  const featureLimit = Math.min(1000, Math.max(720, options.maxFeatures ?? 900));
  const extractionLimit = Math.min(1900, featureLimit * 2);
  const refFeatures = spatiallyBalancedFeatures(features(ref, extractionLimit), ref.width, ref.height, featureLimit);
  const camFeatures = spatiallyBalancedFeatures(features(cam, extractionLimit), cam.width, cam.height, featureLimit);
  diagnostics.referenceFeatures = refFeatures.length;
  diagnostics.cameraFeatures = camFeatures.length;
  if (refFeatures.length < minInliers || camFeatures.length < minInliers) return fail('few-features');

  const coarseMatches = collectQuadrantMatches(refFeatures, camFeatures, ref.width, ref.height, coarseGrid, overlap);
  diagnostics.coarseMatches = coarseMatches.length;
  if (coarseMatches.length < minInliers) return fail('few-matches');

  let best: SimilarityTransform | null = null;
  let bestSupport: GridSupport | null = null;
  let bestScore = -Infinity;
  const trials = Math.min(1600, Math.max(700, coarseMatches.length * 5));
  // Deterministic pseudo-random pair sampling; avoids the old index-stride
  // pattern which repeatedly visited a narrow subset for certain match counts.
  let seed = (coarseMatches.length * 2654435761) >>> 0;
  const nextIndex = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % coarseMatches.length;
  };
  for (let i = 0; i < trials; i++) {
    const firstIndex = nextIndex(), secondIndex = nextIndex();
    if (firstIndex === secondIndex) continue;
    const first = coarseMatches[firstIndex], second = coarseMatches[secondIndex];
    if (first.sourceKey === second.sourceKey) continue;
    const candidate = fitTwo(first, second);
    if (!candidate) continue;
    const inliers = coarseMatches.filter(match => error(candidate, match) <= 9.5);
    if (inliers.length < minInliers) continue;
    const support = quadrantSupport(coarseMatches, candidate, 9.5);
    if (support.activeCells.length < 2 || support.adjacencyLinks < minAdjacent) continue;
    const totalError = inliers.reduce((sum, match) => sum + error(candidate, match), 0);
    const score = inliers.length + support.activeCells.length * 2.2 + support.adjacencyLinks * 3.5 - totalError * .035;
    if (score > bestScore) {
      bestScore = score;
      best = { ...candidate, inliers: inliers.length, matches: coarseMatches.length, confidence: inliers.length / Math.max(1, coarseMatches.length) };
      bestSupport = support;
    }
  }
  if (!best || !bestSupport) {
    diagnostics.reason = 'no-adjacent-consensus';
    // Useful evidence for field diagnosis even when no transform is accepted.
    let looseBest = 0;
    let looseSupport: GridSupport | null = null;
    for (let i = 0; i < Math.min(240, trials); i++) {
      const a = coarseMatches[nextIndex()], b = coarseMatches[nextIndex()];
      if (a === b || a.sourceKey === b.sourceKey) continue;
      const candidate = fitTwo(a, b);
      if (!candidate) continue;
      const count = coarseMatches.filter(match => error(candidate, match) <= 12).length;
      if (count > looseBest) {
        looseBest = count;
        looseSupport = quadrantSupport(coarseMatches, candidate, 12);
      }
    }
    diagnostics.coarseInliers = looseBest;
    diagnostics.coarseQuadrants = looseSupport?.activeCells.length ?? 0;
    diagnostics.adjacencyLinks = looseSupport?.adjacencyLinks ?? 0;
    return { alignment: null, diagnostics };
  }

  const fineMatches = fineGrid === coarseGrid ? [] : collectQuadrantMatches(
    refFeatures, camFeatures, ref.width, ref.height, fineGrid, overlap,
  );
  diagnostics.fineMatches = fineMatches.length;
  const fineInliers = fineMatches.filter(match => error(best!, match) <= 10.5);
  const coarseInliers = coarseMatches.filter(match => error(best!, match) <= 9.5);
  diagnostics.coarseInliers = coarseInliers.length;
  diagnostics.coarseQuadrants = bestSupport.activeCells.length;
  diagnostics.adjacencyLinks = bestSupport.adjacencyLinks;

  const combined: Match[] = [...coarseInliers];
  const seen = new Set(coarseInliers.map(match => `${Math.round(match.a.x)}:${Math.round(match.a.y)}>${Math.round(match.b.x)}:${Math.round(match.b.y)}`));
  for (const match of fineInliers) {
    const key = `${Math.round(match.a.x)}:${Math.round(match.a.y)}>${Math.round(match.b.x)}:${Math.round(match.b.y)}`;
    if (!seen.has(key)) { seen.add(key); combined.push(match); }
  }
  const refined = refitSimilarity(combined, best, 10.5);
  const finalCoarseSupport = quadrantSupport(coarseMatches, refined, 10.5);
  if (finalCoarseSupport.activeCells.length < 2 || finalCoarseSupport.adjacencyLinks < minAdjacent) {
    diagnostics.reason = 'no-adjacent-consensus';
    return { alignment: null, diagnostics };
  }
  const finalFineSupport = quadrantSupport(fineInliers, refined, 11.5);
  const finalMatches: Match[] = [...coarseMatches, ...fineMatches];
  const uniqueFinalMatches = new Map<string, Match>();
  for (const match of finalMatches) {
    const key = `${Math.round(match.a.x)}:${Math.round(match.a.y)}>${Math.round(match.b.x)}:${Math.round(match.b.y)}`;
    if (!uniqueFinalMatches.has(key)) uniqueFinalMatches.set(key, match);
  }
  const candidateMatches = [...uniqueFinalMatches.values()];
  const finalInliers = candidateMatches.filter(match => error(refined, match) <= 11.5);
  diagnostics.finalInliers = finalInliers.length;
  if (finalInliers.length < minInliers) return fail('few-final-inliers');

  const confidence = Math.max(0, Math.min(1,
    (finalInliers.length / Math.max(1, candidateMatches.length)) *
    (0.68 + 0.08 * Math.min(3, finalCoarseSupport.activeCells.length - 1) +
      (finalFineSupport.activeCells.length >= 2 ? .10 : 0) +
      (finalFineSupport.adjacencyLinks >= 1 ? .06 : 0)),
  ));
  diagnostics.confidence = confidence;
  if (confidence < (options.minConfidence ?? .045)) return fail('low-confidence');

  refined.scale *= camScaleX / refScaleX;
  refined.tx *= camScaleX;
  refined.ty *= camScaleY;
  diagnostics.reason = 'success';
  const alignment: QuadrantAlignment = {
    ...refined,
    inliers: finalInliers.length,
    matches: candidateMatches.length,
    confidence,
    coarseGridSize: coarseGrid,
    fineGridSize: fineGrid,
    coarseQuadrants: finalCoarseSupport.activeCells.length,
    fineQuadrants: finalFineSupport.activeCells.length,
    adjacencyLinks: finalCoarseSupport.adjacencyLinks,
    coarseMatches: coarseMatches.length,
    fineMatches: fineMatches.length,
  };
  return { alignment, diagnostics };
}

export function estimateQuadrantAlignment(
  reference: GrayImage, camera: GrayImage, options: QuadrantAlignOptions = {},
): QuadrantAlignment | null {
  return estimateQuadrantAlignmentDetailed(reference, camera, options).alignment;
}

/** Pixel-wise temporal median. Persistent pencil/ink stays visible while brief
 * reflections, sensor noise and accidental one-frame edges are suppressed. */
export function temporalMedianGray(frames: GrayImage[]): GrayImage {
  if (!frames.length) throw new Error('Не са подадени кадри за времеви анализ');
  const { width, height } = frames[0];
  if (!width || !height || frames.some(frame => frame.width !== width || frame.height !== height || frame.data.length !== width * height)) {
    throw new Error('Кадрите за времеви анализ трябва да са с еднакъв размер');
  }
  if (frames.length === 1) return { width, height, data: frames[0].data.slice() };
  const output = new Uint8Array(width * height);
  const values = new Uint8Array(frames.length);
  const middle = Math.floor(frames.length / 2);
  for (let pixel = 0; pixel < output.length; pixel++) {
    for (let frame = 0; frame < frames.length; frame++) values[frame] = frames[frame].data[pixel];
    values.sort();
    output[pixel] = values[middle];
  }
  return { width, height, data: output };
}
