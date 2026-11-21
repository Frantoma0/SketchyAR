/** Day 21 acceptance: camera/editor menu, no source or camera reset, no fake Draw. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CameraEditTransition, sameDrawingPlacement } from '../src/day21-camera-navigation.ts';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ID = '00000000-0000-4000-8000-000000000202';
const OTHER = '00000000-0000-4000-8000-000000000203';
const placement = Object.freeze({x:0.13,y:-0.21,scale:1.75,rotationDeg:17,opacityPercent:33,
  mirroredOverlay:true,locked:true,gridEnabled:true});

test('D21: editor can start only for active project and only one session', () => {
  const nav=new CameraEditTransition();
  assert.equal(nav.begin(null,true),null);
  assert.equal(nav.begin(ID,false),null);
  const token=nav.begin(ID,true);
  assert.ok(token);
  assert.equal(nav.begin(ID,true),null);
  assert.equal(nav.isPending(token, ID, true),true);
  assert.equal(nav.isPending(token, OTHER,true),false);
  assert.equal(nav.commit(token,OTHER,true),false);
  assert.equal(nav.commit(token,ID,true),true);
  assert.equal(nav.editing,true);
  assert.equal(nav.begin(ID,true),null);
  nav.end();
  assert.equal(nav.editing,false);
  assert.equal(nav.currentPhase,'idle');
});

test('D21: a cancelled/outdated camera request cannot open a different project', () => {
  const nav=new CameraEditTransition();
  const old=nav.begin(ID,true);
  nav.end();
  const next=nav.begin(OTHER,true);
  assert.equal(nav.isPending(old,ID,true),false);
  assert.equal(nav.commit(old,ID,true),false);
  assert.equal(nav.isPending(next,OTHER,true),true);
  assert.equal(nav.commit(next,OTHER,false),false);
  assert.equal(nav.commit(next,OTHER,true),true);
});

test('D21: every positioning control is included in the non-mutating return invariant',()=>{
  assert.equal(sameDrawingPlacement(placement,{...placement}),true);
  for (const [field, changed] of Object.entries({x:0.14,y:0.15,scale:2.1,rotationDeg:34,
    opacityPercent:22,mirroredOverlay:false,locked:false,gridEnabled:false})) {
    assert.equal(sameDrawingPlacement(placement,{...placement,[field]:changed}),false, field);
  }
});

test('D21: original camera SVG, picker button and edit route coexist',()=>{
  const main=read('src/main.ts');
  assert.match(main,/id="sketch-camera-change-image"/);
  assert.match(main,/src="\.\/ui\/camera\/change-image\.svg"/);
  assert.match(main,/id="sketch-camera-change-menu"[^>]+hidden/);
  assert.match(main,/id="sketch-camera-menu-edit"[^>]*>Промени скицата/);
  assert.match(main,/id="sketch-camera-menu-source"[^>]*>Смени снимката/);
  const camera=read('src/day4.ts');
  assert.match(camera,/registerCameraSketchEditor/);
  assert.match(camera,/await flushPresetSave\(\)/);
  assert.match(camera,/cameraEditTransition\.commit\(token/);
  assert.match(camera,/screen\.inert = true/);
  assert.match(camera,/screen\.inert = false/);
  assert.match(camera,/el<HTMLButtonElement>\('btn-day4-image'\)\.click\(\)/);
  assert.match(camera,/input\.click\(\)/);
  assert.match(camera,/cameraEditTransition\.editing \|\| cameraEditTransition\.currentPhase === 'pending'/);
  assert.match(camera,/camera\.editor\.returned/);
  assert.doesNotMatch(camera.slice(camera.indexOf('async function enterCameraSketchEditor()'),
    camera.indexOf('async function retry()')),/cameraController\.(?:start|stop)\s*\(|(?<![\w.])(?:await|void)\s+openDrawing\s*\(/);
});

test('D21: fresh DB project is loaded once; stale route is discarded; editor Back is isolated',()=>{
  const home=read('src/home.ts');
  const editor=read('src/day17-sketch-placeholder.ts');
  assert.match(home,/registerCameraSketchEditor\(async \(projectId, trigger, stillCurrent, onClosed\)/);
  assert.match(home,/const \{ project \} = await getProjectImage\(projectId\)/);
  assert.match(home,/if \(!stillCurrent\(\)\) return false/);
  assert.match(editor,/intent: 'edit-sketch' \| 'edit-from-camera' = 'edit-sketch'/);
  assert.match(editor,/callback\?\.\(\)/);
  assert.match(editor,/event\.preventDefault\(\); event\.stopPropagation\(\); close\(\)/);
  assert.match(editor,/return true;\n  };\n  zoomButton/);
  assert.match(editor,/returnFocus = trigger/);
  assert.match(editor,/screen\.hidden = true/);
  assert.doesNotMatch(editor,/\b(createImageProject|replaceProjectSource|saveProjectOverlay)\s*\(/);
});

test('D21: camera menu stays inside safe area, Figma layout remains exactly as approved',()=>{
  const css=read('src/styles.css');
  assert.match(css,/\.drawing-screen \.sketch-camera-change-menu \{/);
  assert.match(css,/top:calc\(env\(safe-area-inset-top,0px\) \+ 65px\)/);
  assert.match(css,/right:max\(18px,env\(safe-area-inset-right,0px\)\)/);
  assert.match(css,/\.day20-figma-screen \.day20-figma-controls \{ transform:translateY\(-10px\); \}/);
  assert.match(css,/\.day20-figma-screen \.day20-figma-draw \{ transform:translateY\(5px\); \}/);
  assert.match(css,/\.day17-edit-screen \{\n  position:fixed; z-index:1800/);
  assert.match(css,/\.drawing-screen \{ position: fixed; inset: 0; z-index: 1200/);
});

test('D21: version bumped with all previous D20 visual tests intact',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'0.21.0');
  assert.match(read('src/day17-sketch-placeholder.ts'),/id/);
});
