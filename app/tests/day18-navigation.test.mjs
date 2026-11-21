/** Day18 route-state behavior: runs without IndexedDB, camera or image uploads. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planSketchRoute, SketchRouteMachine, choosePreviewRole } from '../src/day18-navigation.ts';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');
const ID = '00000000-0000-4000-8000-000000000101';
const image = () => new File([Uint8Array.from([1,2,3])], 'portrait.png',{type:'image/png'});

test('Day18: five typed navigation intents distinguish camera, picker, and generator', () => {
  assert.deepEqual(planSketchRoute('new-drawing'),{
    intent:'new-drawing', destination:'native-picker',requiresGeneratorGate:true,
  });
  assert.deepEqual(planSketchRoute('resume-project',ID),{
    intent:'resume-project', projectId:ID,destination:'camera',requiresGeneratorGate:false,
  });
  assert.deepEqual(planSketchRoute('edit-sketch',ID),{
    intent:'edit-sketch',projectId:ID,destination:'generator',requiresGeneratorGate:false,
  });
  assert.equal(planSketchRoute('edit-from-camera',ID).requiresGeneratorGate,true);
  assert.equal(planSketchRoute('change-source',ID).destination,'native-picker');
});
test('Day18: no accidental project association and no invalid ID routing', () => {
  assert.throws(()=>planSketchRoute('new-drawing',ID),/must not reuse/);
  assert.throws(()=>planSketchRoute('edit-sketch'),/Invalid project ID/);
  assert.throws(()=>planSketchRoute('resume-project','not a uuid'),/Invalid project ID/);
});
test('Day18: aborted picker returns to idle without creating a draft', () => {
  const nav = new SketchRouteMachine();
  const token = nav.beginNewPicker();
  assert.equal(typeof token,'number');
  assert.equal(nav.beginNewPicker(),null,'double tap cannot open a second picker');
  assert.equal(nav.acceptPickedFile(token,null),false);
  assert.equal(nav.current.kind,'idle');
});
test('Day18: a picked image is a memory-only draft, cancellation drops it', () => {
  const nav=new SketchRouteMachine();
  const token=nav.beginNewPicker();
  assert.equal(nav.acceptPickedFile(token,image()),true);
  assert.equal(nav.current.kind,'draft');
  assert.equal(nav.isActive(token),true);
  assert.equal(nav.cancel(),true);
  assert.equal(nav.current.kind,'idle');
  assert.equal(nav.isActive(token),false);
  assert.equal(nav.beginDraftCommit(token),null);
});
test('Day18: stale picker completion cannot override a newer choice',()=>{
  const nav=new SketchRouteMachine();
  const earlier=nav.beginNewPicker();
  nav.cancel();
  const later=nav.beginNewPicker();
  assert.notEqual(earlier,later);
  assert.equal(nav.acceptPickedFile(earlier,image()),false);
  assert.equal(nav.acceptPickedFile(later,image()),true);
});
test('Day18: reject a nonimage and empty draft',()=>{
  const nav=new SketchRouteMachine();
  const token=nav.beginNewPicker();
  assert.throws(()=>nav.acceptPickedFile(token,new File(['x'],'notes.txt',{type:'text/plain'})),/non-empty image/);
  assert.throws(()=>nav.acceptPickedFile(token,new File([],'empty.png',{type:'image/png'})),/non-empty image/);
  assert.equal(nav.current.kind,'picker');
  nav.cancel();
  assert.equal(nav.current.kind,'idle');
});
test('Day18: draft commit is single-flight and retryable on failure',()=>{
  const nav=new SketchRouteMachine();
  const token=nav.beginNewPicker();
  const file=image();
  nav.acceptPickedFile(token,file);
  assert.equal(nav.beginDraftCommit(token),file);
  assert.equal(nav.beginDraftCommit(token),null);
  assert.equal(nav.cancel(),false,'mid-commit cannot silently discard the file');
  assert.equal(nav.finishDraftCommit(token,false),true);
  assert.equal(nav.current.kind,'draft');
  assert.equal(nav.beginDraftCommit(token),file);
  assert.equal(nav.finishDraftCommit(token,true),true);
  assert.equal(nav.current.kind,'idle');
});
test('Day18: edit route refuses duplicate opens and drops stale result after Back',()=>{
  const nav=new SketchRouteMachine();
  const token=nav.openExisting('edit-sketch',ID);
  assert.equal(nav.current.kind,'edit');
  assert.equal(nav.openExisting('edit-sketch',ID),null);
  assert.equal(nav.isActive(token),true);
  nav.cancel();
  assert.equal(nav.isActive(token),false);
  assert.equal(nav.current.kind,'idle');
});
test('Day18: legacy project with no selected processed variant previews original',()=>{
  assert.equal(choosePreviewRole(false),'source');
  assert.equal(choosePreviewRole(true),'processed');
});
test('Day18: editor is readonly, uses original Blob and revokes preview URL',()=>{
  const editor=read('src/day17-sketch-placeholder.ts');
  const main=read('src/main.ts');
  const home=read('src/home.ts');
  assert.match(editor,/await getProjectImage\(project\.id\)/);
  assert.match(editor,/URL\.createObjectURL\(source\.blob\)/);
  assert.match(editor,/URL\.revokeObjectURL\(previewURL\)/);
  assert.match(editor,/route\.isActive\(token\)/);
  assert.doesNotMatch(editor,/\b(createImageProject|replaceProjectSource|saveProjectOverlay|openDrawing)\s*\(/);
  assert.match(main,/id="day18-original-preview"/);
  assert.match(main,/id="day18-preview-note"/);
  assert.match(home,/pencil\.addEventListener\('click', \(\) => sketchEditor\.open\(project, pencil\)\)/);
});
test('Day18: new image and saved drawing remain functional until generator gate',()=>{
  const drawing=read('src/day4.ts');
  const main=read('src/main.ts');
  assert.match(drawing,/export function requestNewDrawing\(\)/);
  assert.match(drawing,/input\.click\(\)/);
  assert.match(drawing,/export async function openSavedDrawing\(projectId: string\)/);
  assert.match(drawing,/await createImageProject\(file/);
  assert.match(main,/requestNewDrawing\(\)/);
  assert.match(main,/await openSavedDrawing\(id\)/);
});
test('Day18: preserve old graphite Home geometry, Day16 backup and Day17 click split',()=>{
  const css=read('src/styles.css'); const home=read('src/home.ts');
  assert.match(css,/right:calc\(4% \+ 46px\)/);
  assert.match(css,/left:5\.5px/);
  assert.match(css,/left:-5\.5px/);
  assert.match(home,/const GAP = 20/);
  assert.match(home,/initDay16BackupUI/);
  assert.match(home,/showProjectDialog\(project, caption, 'rename'\)/);
  assert.match(home,/showProjectDialog\(project, trash, 'delete'\)/);
});
