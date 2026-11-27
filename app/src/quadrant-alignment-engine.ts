/** Day 33.2 — quadrant consensus registration engine.
 * 4x4 coarse localisation, 6x6 validation/refinement, adjacent-cell consensus
 * and temporal frame fusion. No network, external model or native dependency.
 */
import {
  downscale, features, matchFeatures, fitTwo, error,
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
type QuadrantMatch = Match & { cell: number; row: number; col: number; grid: number };
type GridSupport = { activeCells: number[]; adjacencyLinks: number; counts: Map<number, number> };

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
    const localMatches = matchFeatures(localFeatures, cameraFeatures)
      .sort((a, b) => a.distance - b.distance).slice(0, 24);
    for (const match of localMatches) {
      const matchCol = Math.min(grid - 1, Math.max(0, Math.floor(match.a.x / cellWidth)));
      const matchRow = Math.min(grid - 1, Math.max(0, Math.floor(match.a.y / cellHeight)));
      const key = `${Math.round(match.a.x)}:${Math.round(match.a.y)}>${Math.round(match.b.x)}:${Math.round(match.b.y)}`;
      const candidate = { ...match, cell: matchRow * grid + matchCol, row: matchRow, col: matchCol, grid };
      const previous = output.get(key);
      if (!previous || candidate.distance < previous.distance) output.set(key, candidate);
    }
  }
  return [...output.values()];
}

function quadrantSupport(matches: QuadrantMatch[], transform: SimilarityTransform, threshold: number): GridSupport {
  const counts = new Map<number, number>();
  for (const match of matches) if (error(transform, match) <= threshold) {
    counts.set(match.cell, (counts.get(match.cell) ?? 0) + 1);
  }
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

function refitSimilarity(matches: Match[], seed: SimilarityTransform): SimilarityTransform {
  const inliers = matches.filter(match => error(seed, match) <= 7.5);
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
export function estimateQuadrantAlignment(
  reference: GrayImage, camera: GrayImage, options: QuadrantAlignOptions = {},
): QuadrantAlignment | null {
  const maxDimension = options.maxDimension ?? 480;
  const coarseGrid = Math.max(2, Math.min(8, Math.round(options.coarseGridSize ?? 4)));
  const fineGrid = Math.max(coarseGrid, Math.min(10, Math.round(options.fineGridSize ?? 6)));
  const overlap = Math.max(0, Math.min(.25, options.overlap ?? .10));
  const minInliers = options.minInliers ?? 8;
  const minAdjacent = options.minAdjacentQuadrants ?? 1;
  const ref = downscale(reference, maxDimension), cam = downscale(camera, maxDimension);
  if (ref.width < 64 || ref.height < 64 || cam.width < 64 || cam.height < 64) return null;
  const refScaleX = reference.width / ref.width, refScaleY = reference.height / ref.height;
  const camScaleX = camera.width / cam.width, camScaleY = camera.height / cam.height;
  if (Math.abs(refScaleX / refScaleY - 1) > .02 || Math.abs(camScaleX / camScaleY - 1) > .02) return null;

  const refFeatures = features(ref, options.maxFeatures ?? 720);
  const camFeatures = features(cam, options.maxFeatures ?? 720);
  if (refFeatures.length < minInliers || camFeatures.length < minInliers) return null;
  const coarseMatches = collectQuadrantMatches(refFeatures, camFeatures, ref.width, ref.height, coarseGrid, overlap);
  if (coarseMatches.length < minInliers) return null;

  let best: SimilarityTransform | null = null;
  let bestSupport: GridSupport | null = null;
  let bestScore = -Infinity;
  const trials = Math.min(900, Math.max(220, coarseMatches.length * 10));
  for (let i = 0; i < trials; i++) {
    const first = coarseMatches[(i * 17 + 3) % coarseMatches.length];
    const second = coarseMatches[(i * 37 + 11) % coarseMatches.length];
    if (first === second) continue;
    const candidate = fitTwo(first, second);
    if (!candidate) continue;
    const inliers = coarseMatches.filter(match => error(candidate, match) <= 7.0);
    if (inliers.length < minInliers) continue;
    const support = quadrantSupport(coarseMatches, candidate, 7.0);
    if (support.activeCells.length < 2 || support.adjacencyLinks < minAdjacent) continue;
    const totalError = inliers.reduce((sum, match) => sum + error(candidate, match), 0);
    const score = inliers.length + support.activeCells.length * 2.2 + support.adjacencyLinks * 3.5 - totalError * .035;
    if (score > bestScore) {
      bestScore = score;
      best = { ...candidate, inliers: inliers.length, matches: coarseMatches.length, confidence: inliers.length / Math.max(1, coarseMatches.length) };
      bestSupport = support;
    }
  }
  if (!best || !bestSupport) return null;

  // Refine from the single coarse placement using the denser 6x6 grid. The
  // finer cells only contribute if their correspondences agree with the 4x4
  // consensus; they are not allowed to introduce a second independent pose.
  const fineMatches = fineGrid === coarseGrid ? [] : collectQuadrantMatches(
    refFeatures, camFeatures, ref.width, ref.height, fineGrid, overlap,
  );
  const fineInliers = fineMatches.filter(match => error(best!, match) <= 7.5);
  const coarseInliers = coarseMatches.filter(match => error(best!, match) <= 7.0);
  const combined: Match[] = [...coarseInliers];
  const seen = new Set(coarseInliers.map(match => `${Math.round(match.a.x)}:${Math.round(match.a.y)}>${Math.round(match.b.x)}:${Math.round(match.b.y)}`));
  for (const match of fineInliers) {
    const key = `${Math.round(match.a.x)}:${Math.round(match.a.y)}>${Math.round(match.b.x)}:${Math.round(match.b.y)}`;
    if (!seen.has(key)) { seen.add(key); combined.push(match); }
  }
  const refined = refitSimilarity(combined, best);
  const finalCoarseSupport = quadrantSupport(coarseMatches, refined, 7.5);
  if (finalCoarseSupport.activeCells.length < 2 || finalCoarseSupport.adjacencyLinks < minAdjacent) return null;
  const finalFineSupport = quadrantSupport(fineInliers, refined, 8.0);
  const finalMatches: Match[] = [...coarseMatches, ...fineMatches];
  const uniqueFinalMatches = new Map<string, Match>();
  for (const match of finalMatches) {
    const key = `${Math.round(match.a.x)}:${Math.round(match.a.y)}>${Math.round(match.b.x)}:${Math.round(match.b.y)}`;
    if (!uniqueFinalMatches.has(key)) uniqueFinalMatches.set(key, match);
  }
  const candidateMatches = [...uniqueFinalMatches.values()];
  const finalInliers = candidateMatches.filter(match => error(refined, match) <= 8.0);
  if (finalInliers.length < minInliers) return null;

  const confidence = Math.max(0, Math.min(1,
    (finalInliers.length / Math.max(1, candidateMatches.length)) *
    (0.62 + 0.08 * Math.min(3, finalCoarseSupport.activeCells.length - 1) +
      (finalFineSupport.activeCells.length >= 2 ? .14 : 0) +
      (finalFineSupport.adjacencyLinks >= 1 ? .08 : 0)),
  ));
  if (confidence < (options.minConfidence ?? .10)) return null;

  // Convert the shared reduced-image transform back to source image pixels.
  refined.scale *= camScaleX / refScaleX;
  refined.tx *= camScaleX;
  refined.ty *= camScaleY;
  return {
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
