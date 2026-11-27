import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('Day 33: former mirror button invokes local contour registration and has accessible Bulgarian label', () => {
  const main=read('../src/main.ts'), camera=read('../src/day4.ts'), engine=read('../src/quadrant-alignment-engine.ts');
  assert.match(main,/id="sketch-camera-mirror"[^>]*aria-label="Намести по очертанията на рисунката"/);
  assert.match(main,/ui\/camera\/align-contours\.svg/);
  assert.match(camera,/estimateQuadrantAlignmentDetailed\(/);
  assert.match(engine,/coarseGridSize/);
  assert.match(engine,/fineGridSize/);
  assert.match(engine,/adjacencyLinks/);
  assert.match(engine,/matchPartialSketchFeatures/);
  assert.match(engine,/spatiallyBalancedFeatures/);
  assert.match(camera,/detectWhitePaperRegion\(/);
  assert.match(camera,/autoAlignToPaperContours\(\)/);
  assert.match(camera,/addEventListener\('click', \(\) => \{\s*D\.log\([^;]+;\s*void autoAlignToPaperContours\(\);/);
  assert.doesNotMatch(camera,/artwork\.mirror/);
});

test('Day 33: alignment is local, bounded, and refuses locked/insufficient-confidence state', () => {
  const camera=read('../src/day4.ts');
  assert.match(camera,/if \(artworkLocked\).*Отключи заключването/s);
  assert.match(camera,/maxSide = 640/);
  assert.match(camera,/coarseGridSize: 4, fineGridSize: 6/);
  assert.match(camera,/captureStablePaperSequence\(/);
  assert.match(camera,/temporalMedianGray/);
  assert.match(camera,/minInliers: 6, minConfidence: \.035/);
  assert.match(camera,/quadrant-align.rejected-with-diagnostics/);
  assert.match(camera,/Опорни точки|съвп\./);
  assert.match(camera,/schedulePresetSave\(\);\s*await flushPresetSave\(\);/);
});

test('Day 33: no CSS mirror transform remains and saved legacy field is forced neutral', () => {
  const css=read('../src/styles.css'), camera=read('../src/day4.ts');
  assert.doesNotMatch(css,/scaleX\(var\(--artwork-mirror/);
  assert.match(camera,/setProperty\('--artwork-mirror', '1'\)/);
});


test('Day 33: align control stays tappable and reports missing prerequisites instead of silently disabling', () => {
  const camera=read('../src/day4.ts'), css=read('../src/styles.css');
  assert.match(camera,/alignButton\.disabled = contourAlignBusy/);
  assert.doesNotMatch(camera,/alignButton\.disabled = contourAlignBusy \|\| !userImageUrl/);
  assert.match(camera,/Първо избери изображение от бутона горе вдясно/);
  assert.match(camera,/Камерата още не е готова/);
  assert.match(camera,/contour-align\.button-tap/);
  assert.match(css,/\.drawing-video-stage[^\n]*background: #fff/);
  assert.match(css,/#drawing-camera[^\n]*background: #fff/);
});
