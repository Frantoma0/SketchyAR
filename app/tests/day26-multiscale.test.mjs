import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('G26 regression: V2 stays available as a baseline while V4 is active',()=>{
  const worker=read('src/python-worker.ts');
  const draft=read('src/day22-sketch-mode.ts');
  const editor=read('src/day17-sketch-placeholder.ts');
  assert.match(worker,/import day28Source from '\.\.\/\.\.\/python_engine\/ar_drawing\/day28_flow_coherent\.py\?raw'/);
  assert.match(worker,/sys\.modules\["ar_drawing\.day28_flow_coherent"\]/);
  assert.match(worker,/_sketchyar_day13_result = _sketchyar_day30\.process_gray8_stroke\(/);
  assert.doesNotMatch(worker,/_sketchyar_day13_result = _sketchyar_day25\.process_gray8_quality\(/);
  assert.match(draft,/export const SKETCH_QUALITY_VERSION = 'day30-v4-stroke-v2'/);
  assert.match(draft,/runPythonImage\(\{ \.\.\.gray, \.\.\.SKETCH_V4_SETTINGS, detail, line \}\)/);
  assert.match(editor,/if \(isProductiveStyle\(ui\.style\)\)/);
  assert.match(editor,/!matchesStyledVariant\(savedProcessed, sourceForSketch\?\.sourceId \?\? '', ui\.style,/);
});

test('G26: V1, Day25 and V2 remain intact for baseline but are inactive in the editor',()=>{
  const legacy=read('../python_engine/ar_drawing/day25_quality.py');
  const old=read('../python_engine/ar_drawing/day13_bridge.py');
  const active=read('../python_engine/ar_drawing/day26_multiscale.py');
  assert.match(legacy,/def process_gray8_quality\(/);
  assert.match(old,/def process_gray8\(/);
  assert.match(active,/def process_gray8_multiscale\(/);
  assert.match(active,/SCALE_FACTORS = \(0\.75, 1\.55, 3\.05\)/);
  assert.match(active,/non_maximum_suppression\(mag, angle\)/);
  assert.match(active,/hysteresis_threshold\(/);
  assert.doesNotMatch(active,/(?:import|from) (?:cv2|scipy|PIL|tensorflow|keras)/);
  assert.match(read('src/day22-sketch-mode.ts'),/SKETCH_V1_SETTINGS = Object\.freeze/);
});

test('G26: actual generated PNG remains a draft until Draw; Home only displays applied asset',()=>{
  const editor=read('src/day17-sketch-placeholder.ts');
  const store=read('src/storage/project-store.ts');
  assert.match(editor,/result\.width, result\.height, false\)/);
  assert.match(editor,/await selectProcessedAsset\(projectId, sourceId, savedProcessed\.id, ui\.line\)/);
  assert.match(editor,/await selectOriginalForDrawing\(projectId, sourceId\)/);
  assert.match(store,/asset\.id === project\.selectedProcessedAssetId/);
  assert.match(editor,/getLatestProcessedPreview\(project\.id, source\.id, SKETCH_QUALITY_VERSION, ui\.detail, actualLine\(\)\)/);
  assert.match(editor,/sketchGate\.isCurrent\(ticket, projectId, sourceId\)/);
  assert.match(editor,/fresh\.source\.id !== sourceId/);
});

test('G26: version is bumped and all existing visual assets remain untouched',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'0.33.0');
  assert.match(read('src/day13-image-bridge.ts'),/encodeTransparentPng/);
  assert.match(read('src/day17-sketch-placeholder.ts'),/generator\.detail\.requested/);
});
