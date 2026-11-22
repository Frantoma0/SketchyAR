import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('G27 regression: V3 remains available, while only V4 runs in production Worker',()=>{
  const worker=read('src/python-worker.ts');
  assert.doesNotMatch(worker,/import day27Source/);
  assert.match(worker,/import day28Source from '\.\.\/\.\.\/python_engine\/ar_drawing\/day28_flow_coherent\.py\?raw'/);
  assert.doesNotMatch(worker,/sys\.modules\["ar_drawing\.day27_importance"\]/);
  assert.match(worker,/_sketchyar_day13_result = _sketchyar_day30\.process_gray8_stroke\(/);
  assert.doesNotMatch(worker,/import day26Source/);
  assert.doesNotMatch(worker,/_sketchyar_day26\.process_gray8_multiscale\(/);
  assert.doesNotMatch(worker,/import day25Source/);
  assert.doesNotMatch(worker,/_sketchyar_day25\.process_gray8_quality\(/);
});

test('G27: V1, Day25 and V2 remain in Python QA tree but NOT as worker imports',()=>{
  const worker=read('src/python-worker.ts');
  for (const file of ['day13_bridge.py','day25_quality.py','day26_multiscale.py'])
    assert.ok(existsSync(new URL(`../../python_engine/ar_drawing/${file}`,import.meta.url)),file);
  assert.doesNotMatch(worker,/import day26Source/);
  assert.match(read('src/day22-sketch-mode.ts'),/SKETCH_V2_SETTINGS = Object\.freeze/);
  const v3=read('../python_engine/ar_drawing/day27_importance.py');
  assert.match(v3,/def contour_importance\(/);
  assert.match(v3,/def importance_contours\(/);
  assert.match(v3,/def process_gray8_importance\(/);
  assert.match(v3,/gaussian_blur\(active_fine, 7\.0\)/);
  assert.doesNotMatch(v3,/^(?:from|import)\s+(?:cv2|scipy|tensorflow|keras|PIL)\b/m);
});

test('G27 regression: V3 baseline remains versioned, while editor and Worker are V4',()=>{
  const ui=read('src/day17-sketch-placeholder.ts');
  const draft=read('src/day22-sketch-mode.ts');
  const v3=read('../python_engine/ar_drawing/day27_importance.py');
  assert.match(draft,/export const SKETCH_QUALITY_VERSION = 'day30-v4-stroke-v2'/);
  assert.match(v3,/SKETCH_QUALITY_VERSION = 'day27-importance-v3'/);
  assert.match(draft,/runPythonImage\(\{ \.\.\.gray, \.\.\.SKETCH_V4_SETTINGS, detail, line \}\)/);
  assert.match(ui,/params: \{ \.\.\.SKETCH_V4_SETTINGS, style: (?:selectedStyle|requestedStyle), detail: (?:ui\.detail|requestedDetail),[\s\S]*?input: 'grayscale-u8', maxSide: 1024 \}/);
  assert.match(ui,/getLatestProcessedPreview\(project\.id, source\.id, SKETCH_QUALITY_VERSION, ui\.detail, actualLine\(\)\)/);
  assert.match(ui,/!matchesStyledVariant\(savedProcessed, sourceForSketch\?\.sourceId \?\? '', ui\.style,/);
  assert.doesNotMatch(ui,/SKETCH_V2_SETTINGS/);
  assert.doesNotMatch(ui,/SKETCH_V3_SETTINGS/);
});

test('G27: only Draw commits applied style, PNG and Home; preview stays a draft',()=>{
  const ui=read('src/day17-sketch-placeholder.ts');
  const home=read('src/home.ts');
  const store=read('src/storage/project-store.ts');
  assert.match(ui,/saveProcessedPng\(projectId, provenance,\s*result\.png, result\.width, result\.height, false\)/);
  assert.match(ui,/await selectProcessedAsset\(projectId, sourceId, savedProcessed\.id, ui\.line\)/);
  assert.match(ui,/await selectOriginalForDrawing\(projectId, sourceId\)/);
  assert.match(store,/asset\.id === project\.selectedProcessedAssetId/);
  assert.match(home,/listProjectThumbnails/); // Home uses the persisted, applied state
});

test('G27: upgraded version and Figma UI untouched',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'0.32.1');
  assert.match(read('src/day13-image-bridge.ts'),/encodeTransparentPng/);
  assert.match(read('src/day17-sketch-placeholder.ts'),/generator\.detail\.requested/);
});
