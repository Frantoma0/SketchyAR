/** G29 — real per-level detail state and exact processed PNG selection. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appliedDetail, isDetailLevel, matchesDetailVariant } from '../src/day29-detail-variants.ts';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const V='day29-v4-detail-v1', SOURCE='source-a';
const asset = (detail,sourceId=SOURCE,version=V)=>({role:'processed',params:{detail},sourceAssetId:sourceId,pipelineVersion:version});

test('G29: detail levels are only integers 1 through 5',()=>{
  for(let level=1;level<=5;level++) assert.equal(isDetailLevel(level),true);
  for(const level of [-1,0,6,1.5,NaN,'3',true,null,undefined]) assert.equal(isDetailLevel(level),false);
});

test('G29: legacy applied Sketch PNG maps to D3; newer applied D2/D5 restored',()=>{
  assert.equal(appliedDetail(null),3);
  assert.equal(appliedDetail({}),3);
  assert.equal(appliedDetail({params:{low:0.04}}),3);
  assert.equal(appliedDetail({params:{detail:2}}),2);
  assert.equal(appliedDetail({params:{detail:5}}),5);
  assert.equal(appliedDetail({params:{detail:'5'}}),3);
});

test('G29: cached variants must match source, engine, role AND exact detail level',()=>{
  for(let level=1;level<=5;level++) {
    assert.equal(matchesDetailVariant(asset(level),SOURCE,level,V),true);
    assert.equal(matchesDetailVariant(asset(level),'source-b',level,V),false);
    assert.equal(matchesDetailVariant(asset(level),SOURCE,level===5?4:level+1,V),false);
    assert.equal(matchesDetailVariant(asset(level,SOURCE,'day28-flow-coherent-v4'),SOURCE,level,V),false);
  }
  assert.equal(matchesDetailVariant({...asset(3),role:'source'},SOURCE,3,V),false);
  assert.equal(matchesDetailVariant(null,SOURCE,3,V),false);
});

test('G29: only day29 process_gray8_detail is active, V4 engine is the cached scoring dependency',()=>{
  const worker=read('src/python-worker.ts');
  assert.match(worker,/import day29Source from '\.\.\/\.\.\/python_engine\/ar_drawing\/day29_detail\.py\?raw'/);
  assert.match(worker,/_sketchyar_day29\.process_gray8_detail\(/);
  assert.match(worker,/detail=\$\{detail\}/);
  assert.match(worker,/_sketchyar_day28_source/);
  for(const old of ['_sketchyar_day27.process_gray8_importance(', '_sketchyar_day26.process_gray8_multiscale(', '_sketchyar_day28.process_gray8_flow('])
    assert.equal(worker.includes(old),false);
  assert.match(read('../python_engine/ar_drawing/day29_detail.py'),/get_cached_flow_score/);
});

test('G29: UI invalidates previous variant and never applies it before a new real PNG is ready',()=>{
  const editor=read('src/day17-sketch-placeholder.ts');
  assert.match(editor,/detail\.addEventListener\('input'/);
  assert.match(editor,/invalidateDetailPreview\(\)/);
  assert.match(editor,/sketchGate\.cancel\(\)/);
  assert.match(editor,/generateSketchDraft\(blob, requestedDetail\)/);
  assert.match(editor,/getLatestProcessedPreview\(projectId, sourceId,\s*SKETCH_QUALITY_VERSION, requestedDetail\)/);
  assert.match(editor,/matchesDetailVariant\(cached, sourceId, requestedDetail, SKETCH_QUALITY_VERSION\)/);
  assert.match(editor,/if \(!isCurrent\(\)\) return/);
  assert.match(editor,/detailDebounce = setTimeout\(/);
  assert.match(editor,/await selectProcessedAsset\(projectId, sourceId, savedProcessed\.id\)/);
  assert.match(editor,/await selectOriginalForDrawing\(projectId, sourceId\)/);
});

test('G29: new cached preview carries the exact level, but selection happens only on Draw',()=>{
  const editor=read('src/day17-sketch-placeholder.ts');
  assert.match(editor,/params: \{ \.\.\.SKETCH_V4_SETTINGS, detail: requestedDetail,/);
  assert.match(editor,/result\.png, result\.width, result\.height, false\)/);
  assert.match(editor,/storedProject\.selectedProcessedAssetId && !userTouchedDetail/);
  assert.match(editor,/appliedDetail\(processed\)/);
  const store=read('src/storage/project-store.ts');
  assert.match(store,/\(detail === undefined \|\| a\.params\?\.detail === detail\)/);
  assert.match(store,/asset\.id === project\.selectedProcessedAssetId/);
});

test('G29: only detail changes image processing, width remains future work, Figma graphics untouched',()=>{
  const draft=read('src/day22-sketch-mode.ts');
  assert.match(draft,/generateSketchDraft\(source: Blob, detail:/);
  assert.match(draft,/runPythonImage\(\{ \.\.\.gray, \.\.\.SKETCH_V4_SETTINGS, detail \}\)/);
  assert.match(draft,/grayCache = new WeakMap/);
  const editor=read('src/day17-sketch-placeholder.ts');
  assert.match(editor,/if \(button\.dataset\.line\) ui = setSketchUiLine/);
  assert.doesNotMatch(editor,/generator\.detail\.visual-only/);
  assert.match(editor,/fitImageInAperture/);
  assert.match(read('src/styles.css'),/day20-figma-slider-fill/);
  assert.equal(JSON.parse(read('package.json')).version,'0.29.0');
});
