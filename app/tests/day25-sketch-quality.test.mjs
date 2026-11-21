import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('G25 regression: historical quality Python module remains installed, while V4 is active',()=>{
  const worker=get('src/python-worker.ts');
  const engine=get('../python_engine/ar_drawing/day25_quality.py');
  assert.doesNotMatch(worker,/import day25Source/);
  assert.match(worker,/ensureDay12Module\(pyodide\)/);
  assert.doesNotMatch(worker,/sys\.modules\["ar_drawing\.day25_quality"\]/);
  assert.match(worker,/_sketchyar_day29\.process_gray8_detail\(/);
  assert.doesNotMatch(worker,/_sketchyar_day13_result = _sketchyar_day25\.process_gray8_quality\(/);
  assert.match(engine,/SKETCH_QUALITY_VERSION = 'day25-sketch-quality-v1'/);
  assert.doesNotMatch(engine,/import scipy|import cv2|import PIL/);
});

test('G25: versioned previews do not silently reuse old Python output',()=>{
  const store=get('src/storage/project-store.ts');
  const editor=get('src/day17-sketch-placeholder.ts');
  const service=get('src/day22-sketch-mode.ts');
  assert.match(service,/export const SKETCH_QUALITY_VERSION = 'day29-v4-detail-v1'/);
  assert.match(store,/pipelineVersion\?: string/);
  assert.match(store,/pipelineVersion === undefined \|\| a\.pipelineVersion === pipelineVersion/);
  assert.match(editor,/getLatestProcessedPreview\(project\.id, source\.id, SKETCH_QUALITY_VERSION, ui\.detail\)/);
  assert.match(editor,/!matchesDetailVariant\(savedProcessed, sourceForSketch\?\.sourceId \?\? '', ui\.detail,/);
  assert.match(editor,/processedURL = null;\s*savedProcessed = null;/);
  assert.match(editor,/if \(ui\.style === 'sketch'\) requestSketch\(\)/);
});

test('G25: exact applied PNG stays authoritative until Draw, even after generator upgrade',()=>{
  const editor=get('src/day17-sketch-placeholder.ts');
  const store=get('src/storage/project-store.ts');
  assert.match(editor,/storedProject\.selectedProcessedAssetId\s*\? await getSelectedProcessedAsset\(storedProject, source\)/);
  assert.match(store,/asset\.id === project\.selectedProcessedAssetId/);
  assert.match(editor,/await selectProcessedAsset\(projectId, sourceId, savedProcessed\.id\)/);
  assert.match(editor,/await selectOriginalForDrawing\(projectId, sourceId\)/);
  // The generation path caches without applying it.
  assert.match(editor,/result\.width, result\.height, false\)/);
});

test('G25: no change to graphite SVGs, image size, detail/line or camera geometry',()=>{
  const editor=get('src/day17-sketch-placeholder.ts');
  const bridge=get('src/day13-image-bridge.ts');
  const engine=get('src/day22-sketch-mode.ts');
  assert.match(bridge,/Math\.min\(1, 1024 \/ Math\.max\(sw, sh\)\)/);
  assert.match(bridge,/image\.data\[i \* 4 \+ 3\] = mask\[i\] \? 255 : 0/);
  assert.match(engine,/SKETCH_V1_SETTINGS = Object\.freeze\(\{ sigma: 1, low: 0\.04, high: 0\.10 \}\)/);
  assert.match(editor,/generator\.detail\.requested/);
  assert.match(editor,/Манга и Комикс предстоят/);
  assert.equal(JSON.parse(get('package.json')).version,'0.29.0');
});
