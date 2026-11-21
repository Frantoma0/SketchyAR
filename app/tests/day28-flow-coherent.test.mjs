import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('G28: production Worker loads only V4 algorithm, not V1/V2/V3',()=>{
  const worker=read('src/python-worker.ts');
  assert.match(worker,/import day28Source from '\.\.\/\.\.\/python_engine\/ar_drawing\/day28_flow_coherent\.py\?raw'/);
  assert.match(worker,/sys\.modules\["ar_drawing\.day28_flow_coherent"\]/);
  assert.match(worker,/_sketchyar_day13_result = _sketchyar_day28\.process_gray8_flow\(/);
  for(const name of ['day25Source','day26Source','day27Source','_sketchyar_day27.process_gray8_importance'])
    assert.doesNotMatch(worker,new RegExp(name.replaceAll('.','\\.')));
  assert.match(worker,/\[processed\.mask\.buffer\]/);
});

test('G28: older engines still exist, and V4 has independent version and provenance',()=>{
  for(const filename of ['day13_bridge.py','day25_quality.py','day26_multiscale.py','day27_importance.py','day28_flow_coherent.py'])
    assert.ok(existsSync(new URL(`../../python_engine/ar_drawing/${filename}`,import.meta.url)));
  const bridge=read('src/day22-sketch-mode.ts');
  const v4=read('../python_engine/ar_drawing/day28_flow_coherent.py');
  const editor=read('src/day17-sketch-placeholder.ts');
  assert.match(bridge,/SKETCH_QUALITY_VERSION = 'day28-flow-coherent-v4'/);
  assert.match(v4,/SKETCH_QUALITY_VERSION = 'day28-flow-coherent-v4'/);
  assert.match(bridge,/runPythonImage\(\{ \.\.\.gray, \.\.\.SKETCH_V4_SETTINGS \}\)/);
  assert.match(editor,/params: \{ \.\.\.SKETCH_V4_SETTINGS, input: 'grayscale-u8', maxSide: 1024 \}/);
  assert.match(editor,/getLatestProcessedPreview\(project\.id, source\.id, SKETCH_QUALITY_VERSION\)/);
  assert.doesNotMatch(editor,/SKETCH_V3_SETTINGS/);
});

test('G28: no external runtime wheels, process remains NumPy and stage flags are testable',()=>{
  const v4=read('../python_engine/ar_drawing/day28_flow_coherent.py');
  assert.match(v4,/def guided_preprocess\(/);
  assert.match(v4,/def _flow_support\(/);
  assert.match(v4,/def flow_importance\(/);
  assert.match(v4,/def select_flow_contours\(/);
  assert.match(v4,/def clear_flow_cache\(/);
  assert.match(v4,/sha256\(view\)\.digest\(\)/);
  assert.match(v4,/stage: str = 'fusion'/);
  assert.doesNotMatch(v4,/^\s*(?:import|from) (?:cv2|torch|scipy|PIL|tensorflow|keras)\b/m);
  assert.match(v4,/ETF-lite/);
  assert.match(v4,/not exact FDoG/);
});

test('G28: active project only changes after Draw, original remains untouched',()=>{
  const editor=read('src/day17-sketch-placeholder.ts');
  const store=read('src/storage/project-store.ts');
  const home=read('src/home.ts');
  assert.match(editor,/saveProcessedPng\(projectId, provenance,\s*result\.png, result\.width, result\.height, false\)/);
  assert.match(editor,/await selectProcessedAsset\(projectId, sourceId, savedProcessed\.id\)/);
  assert.match(editor,/await selectOriginalForDrawing\(projectId, sourceId\)/);
  assert.match(store,/asset\.id === project\.selectedProcessedAssetId/);
  assert.match(home,/listProjectThumbnails/);
  assert.match(editor,/sketchGate\.isCurrent\(ticket, projectId, sourceId\)/);
  assert.match(editor,/fresh\.source\.id !== sourceId/);
});

test('G28: ui SVG source unchanged and version set to 0.28.1',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'0.28.1');
  assert.equal(JSON.parse(read('package-lock.json')).version,'0.28.1');
  assert.match(read('src/day13-image-bridge.ts'),/encodeTransparentPng/);
  assert.match(read('src/day17-sketch-placeholder.ts'),/generator\.detail\.visual-only/);
});
