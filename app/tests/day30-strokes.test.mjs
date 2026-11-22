/** G30 — exact 5x3 real V4 PNG variants with safe Draft→Draw behavior. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appliedDetail } from '../src/day29-detail-variants.ts';
import { appliedStroke, strokeVariantKey, matchesStrokeVariant, isSketchStroke } from '../src/day30-stroke-variants.ts';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const VERSION = 'day30-v4-stroke-v1';
const createAsset = (detail, line, sourceAssetId = 'original', pipelineVersion = VERSION) => ({
  sourceAssetId, pipelineVersion, role: 'processed', params: { detail, line },
});

test('G30: only the exact three named line widths are accepted', () => {
  for (const line of ['thin','normal','thick']) assert.equal(isSketchStroke(line),true);
  for (const line of [null,undefined,'','medium','bold','THICK',123,false])
    assert.equal(isSketchStroke(line),false);
});

test('G30: 5 detail tiers x 3 stroke widths yield 15 independent variant keys', () => {
  const keys = new Set();
  for (let level=1;level<=5;level++) for (const line of ['thin','normal','thick']) {
    const key = strokeVariantKey(level,line);
    assert.equal(key,`${level}:${line}`);
    keys.add(key);
    assert.equal(matchesStrokeVariant(createAsset(level,line),'original',level,line,VERSION),true);
  }
  assert.equal(keys.size,15);
});

test('G30: variant selection requires role, source, pipeline version, detail AND line', () => {
  const asset = createAsset(3,'thick');
  assert.equal(matchesStrokeVariant(asset,'original',3,'thick',VERSION),true);
  for (const wrong of [
    [createAsset(3,'normal'),'original',3,'thick',VERSION],
    [asset,'other',3,'thick',VERSION],
    [asset,'original',5,'thick',VERSION],
    [asset,'original',3,'thick','day29-v4-detail-v1'],
    [{ ...asset,role:'source' },'original',3,'thick',VERSION],
    [null,'original',3,'thick',VERSION],
  ]) assert.equal(matchesStrokeVariant(...wrong),false);
});

test('G30: legacy applied PNG retains D3/Normal defaults without rewriting assets', () => {
  assert.equal(appliedDetail(null),3);
  assert.equal(appliedStroke(null),'normal');
  assert.equal(appliedStroke({params:{detail:5}}),'normal');
  assert.equal(appliedStroke({params:{detail:2,line:'thin'}}),'thin');
  assert.equal(appliedStroke({params:{line:'thick'}}),'thick');
  assert.equal(appliedStroke({params:{line:'bold'}}),'normal');
  assert.equal(appliedDetail({params:{detail:4,line:'thick'}}),4);
});

test('G30: the Worker runs Day30 on the shared V4/Day29 stages, no extra legacy engine', () => {
  const worker = read('src/python-worker.ts');
  const py = read('../python_engine/ar_drawing/day30_stroke.py');
  const client = read('src/python-client.ts');
  assert.match(worker,/import day30Source from '\.\.\/\.\.\/python_engine\/ar_drawing\/day30_stroke\.py\?raw'/);
  assert.match(worker,/_sketchyar_day30\.process_gray8_stroke\(/);
  assert.match(worker,/detail=\$\{detail\}, line="\$\{line\}"/);
  assert.match(client,/detail, line \}, \[input\.buffer\]/);
  assert.match(py,/get_cached_flow_score\(/);
  assert.match(py,/select_detail_contours\(/);
  assert.match(py,/widen_contours\(selected, line\)/);
  assert.doesNotMatch(py,/^\s*(?:from|import) (?:cv2|scipy|tensorflow|torch)\b/m);
  assert.equal(JSON.parse(read('package.json')).version,'0.30.0');
  assert.equal(JSON.parse(read('package-lock.json')).version,'0.30.0');
});

test('G30: editor reacts to stroke taps with invalidation, source guard and a brief debounce', () => {
  const editor = read('src/day17-sketch-placeholder.ts');
  assert.match(editor,/if \(button\.dataset\.line\)/);
  assert.match(editor,/const next = setSketchUiLine\(ui, button\.dataset\.line\)/);
  assert.match(editor,/if \(next\.line !== ui\.line\)/);
  assert.match(editor,/invalidateVariantPreview\(\)/);
  assert.match(editor,/sketchGate\.cancel\(\)/);
  assert.match(editor,/strokeVariants\.get\(strokeVariantKey\(ui\.detail, ui\.line\)\)/);
  assert.match(editor,/detailDebounce = setTimeout\(\(\) => \{ detailDebounce = null; requestSketch\(\); \}, 170\)/);
  assert.match(editor,/ui\.detail === requestedDetail && ui\.line === requestedLine/);
  assert.match(editor,/sketchGate\.isCurrent\(ticket, projectId, sourceId\)/);
  assert.match(editor,/fresh\.source\.id !== sourceId/);
});

test('G30: the editor restores only applied stroke, never auto-applies a cached preview', () => {
  const editor=read('src/day17-sketch-placeholder.ts');
  const store=read('src/storage/project-store.ts');
  assert.match(editor,/ui = setSketchUiLine\(ui, appliedStroke\(processed\)\)/);
  assert.match(editor,/getLatestProcessedPreview\(project\.id, source\.id, SKETCH_QUALITY_VERSION, ui\.detail, ui\.line\)/);
  assert.match(editor,/getLatestProcessedPreview\(projectId, sourceId,[\s\S]*?requestedDetail, requestedLine\)/);
  assert.match(editor,/params: \{ \.\.\.SKETCH_V4_SETTINGS, detail: requestedDetail, line: requestedLine,/);
  assert.match(editor,/params: \{ \.\.\.SKETCH_V4_SETTINGS, detail: ui\.detail, line: ui\.line,/);
  assert.match(editor,/result\.png, result\.width, result\.height, false\)/);
  assert.match(editor,/await selectProcessedAsset\(projectId, sourceId, savedProcessed\.id\)/);
  assert.match(editor,/await selectOriginalForDrawing\(projectId, sourceId\)/);
  assert.match(store,/\(line === undefined \|\| a\.params\?\.line === line\)/);
  assert.match(store,/asset\.id === project\.selectedProcessedAssetId/);
});

test('G30: UI remains accessible and assets/schemas retain their original design',()=>{
  const main=read('src/main.ts');
  const editor=read('src/day17-sketch-placeholder.ts');
  const draft=read('src/day22-sketch-mode.ts');
  const schema=read('src/storage/project-store.ts');
  for(const val of ['thin','normal','thick']) assert.match(main,new RegExp(`data-line="${val}"`));
  assert.match(editor,/button\.setAttribute\('aria-pressed', String\(selected\)\)/);
  assert.match(editor,/fitImageInAperture\(/);
  assert.match(draft,/grayCache = new WeakMap/);
  assert.match(draft,/runPythonImage\(\{ \.\.\.gray, \.\.\.SKETCH_V4_SETTINGS, detail, line \}\)/);
  assert.match(schema,/PROJECT_DB_VERSION = 1/);
  assert.match(main,/src="\.\/ui\/generator\/figma-polaroid\.svg"/);
});
