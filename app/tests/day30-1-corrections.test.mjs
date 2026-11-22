/** G30.1: deselectable width buttons, saved UI choice and Photo -> Edit -> Draw -> Camera. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SKETCH_UI, setSketchUiLine, effectiveSketchLine, setSketchUiStyle } from '../src/day20-sketch-state.ts';
import { isSketchStroke, appliedStroke, matchesStrokeVariant } from '../src/day30-stroke-variants.ts';
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');

for (const line of ['thin','normal','thick']) {
  test(`G30.1: ${line} toggles pressed -> unpressed, Normal remains effective when empty`, () => {
    assert.deepEqual(DEFAULT_SKETCH_UI,{style:null,detail:3,line:null});
    const selected = setSketchUiLine(DEFAULT_SKETCH_UI,line);
    assert.equal(selected.line,line);
    const unselected = setSketchUiLine(selected,line);
    assert.equal(unselected.line,null);
    assert.equal(effectiveSketchLine(unselected.line),'normal');
    assert.equal(effectiveSketchLine(selected.line),line);
    assert.equal(DEFAULT_SKETCH_UI.line,null);
    assert.equal(setSketchUiStyle(unselected,'sketch').line,null);
  });
}

test('G30.1: computed real line is distinct from nullable selected button',()=>{
  assert.equal(isSketchStroke(null),false);
  assert.equal(isSketchStroke(effectiveSketchLine(null)),true);
  assert.equal(appliedStroke({params:{detail:2}}),'normal');
  assert.equal(matchesStrokeVariant({role:'processed',sourceAssetId:'s',pipelineVersion:'day30-v4-stroke-v2',params:{detail:3,line:'normal'}},
    's',3,effectiveSketchLine(null),'day30-v4-stroke-v2'),true);
});

test('G30.1: current PNG is never applied on toggle, nullable selection is committed only with Draw',()=>{
  const editor=read('src/day17-sketch-placeholder.ts');
  assert.match(editor,/const requestedLine = actualLine\(\)/);
  assert.match(editor,/const requestedSelection = ui\.line/);
  assert.match(editor,/ui\.line === requestedSelection/);
  assert.match(editor,/const selected = button\.dataset\.style === ui\.style \|\| button\.dataset\.line === ui\.line/);
  assert.match(editor,/const next = setSketchUiLine\(ui, button\.dataset\.line\)/);
  assert.match(editor,/if \(next\.line !== ui\.line\)/);
  assert.match(editor,/line: actualLine\(\)/);
  assert.match(editor,/await selectProcessedAsset\(projectId, sourceId, savedProcessed\.id, ui\.line\)/);
  assert.match(editor,/draftResult\.png, draftResult\.width, draftResult\.height, true, ui\.line\)/);
  assert.match(editor,/storedProject\.editorLine === undefined \? appliedStroke\(processed\) : storedProject\.editorLine/);
  assert.match(editor,/if \(isProductiveStyle\(ui.style\) && !processedURL\) requestSketch\(\)/);
});

test('G30.1: create -> Edit without Camera, Draw is the camera entry',()=>{
  const day4=read('src/day4.ts');
  const home=read('src/home.ts');
  const editor=read('src/day17-sketch-placeholder.ts');
  assert.match(day4,/export function registerNewDrawingEditor\(/);
  assert.match(home,/registerNewDrawingEditor\(project => sketchEditor\.open\(project,/);
  assert.match(day4,/input\.click\(\)/);  // native picker is still sync on iPhone
  assert.match(day4,/if \(isNewDrawing && createdProject\) \{[\s\S]*newDrawingEditorOpener\?\.\(createdProject\)[\s\S]*?return;/);
  const newProject=day4.slice(day4.indexOf('if (isNewDrawing && createdProject)'),day4.indexOf('activeProjectId = savedProjectId;',day4.indexOf('if (isNewDrawing && createdProject)')));
  assert.doesNotMatch(newProject,/openDrawing\(\)|cameraController\.(?:start|stop)\(/);
  assert.match(editor,/await openSavedDrawing\(projectId\)/);
  assert.match(editor,/await selectOriginalForDrawing\(projectId, sourceId\)/);
});

test('G30.1: backup and restore allow null only in optional applied editorLine and preserve project DB version',()=>{
  const store=read('src/storage/project-store.ts');
  const saver=read('src/storage/day13-processed.ts');
  const preflight=read('src/storage/day13-backup-preflight.ts');
  const backup=read('src/storage/day14-backup-service.ts');
  assert.match(store,/editorLine\?: 'thin' \| 'normal' \| 'thick' \| null/);
  assert.match(store,/editorLine: selectedLine/);
  assert.match(store,/editorLine: null/);
  assert.match(store,/delete project\.editorLine/);
  assert.match(saver,/editorLine: selectedLine/);
  assert.match(preflight,/Invalid remembered line selection/);
  assert.match(backup,/p\.editorLine !== undefined && p\.editorLine !== null/);
  assert.match(backup,/\['lastOpenedAt', 'guide', 'selectedProcessedAssetId', 'editorStyle', 'editorLine'\]/);
  assert.match(store,/PROJECT_DB_VERSION = 1/);
});

test('G30.1: tuned thick footprint is 3x3, V4 remains unchanged, and new cache version is explicit',()=>{
  const py=read('../python_engine/ar_drawing/day30_stroke.py');
  const draft=read('src/day22-sketch-mode.ts');
  assert.match(py,/_RADII = \{'thin': 0, 'normal': 1, 'thick': 1\}/);
  assert.match(py,/line != 'thick'/);
  assert.match(py,/get_cached_flow_score\(/);
  assert.match(py,/select_detail_contours\(/);
  assert.match(draft,/day30-v4-stroke-v2/);
  assert.equal(JSON.parse(read('package.json')).version,'0.32.2');
});
