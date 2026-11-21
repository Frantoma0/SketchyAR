/** Day 23: real Sketch -> Save -> Draw + deselect-to-original behavior. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('..',import.meta.url));
const tmp=mkdtempSync(join(tmpdir(),'sketchyar-day23-'));
const local=resolve(root,'node_modules/typescript/bin/tsc');
const bin=existsSync(local)?process.execPath:'tsc';
const prefix=bin===process.execPath?[local]:[];
const major=Number(execFileSync(bin,[...prefix,'--version'],{encoding:'utf8'}).match(/\d+/)?.[0]);
const args=[...prefix,...(major>=6?['--ignoreConfig']:[]),'--module','commonjs',
  '--moduleResolution',major>=6?'bundler':'node','--target','es2022',
  '--lib','es2022,dom,dom.iterable','--strict','--skipLibCheck','--outDir',tmp,
  resolve(root,'src/day20-sketch-state.ts'),resolve(root,'src/storage/day13-processed.ts')];
try { execFileSync(bin,args,{stdio:'pipe'}); }
catch(e){console.error(String(e.stdout??'')+String(e.stderr??''));throw e;}
writeFileSync(join(tmp,'package.json'),'{"type":"commonjs"}');
const choice=require(join(tmp,'day20-sketch-state.js'));
const code=path=>readFileSync(resolve(root,path),'utf8');
const editor=code('src/day17-sketch-placeholder.ts');
const camera=code('src/day4.ts');
const store=code('src/storage/project-store.ts');
const main=code('src/main.ts');
const backup=code('src/storage/day13-backup-preflight.ts');
test.after(()=>rmSync(tmp,{recursive:true,force:true}));

test('G23: pencil opens with no selected style OR thickness; all profiles toggle off',()=>{
  assert.deepEqual(choice.DEFAULT_SKETCH_UI,{style:null,detail:3,line:null});
  for (const style of ['sketch','manga','comic']) {
    const chosen=choice.setSketchUiStyle(choice.DEFAULT_SKETCH_UI,style);
    assert.equal(chosen.style,style);
    assert.equal(choice.setSketchUiStyle(chosen,style).style,null);
    assert.deepEqual(choice.DEFAULT_SKETCH_UI,{style:null,detail:3,line:null});
  }
  const changed=choice.setSketchUiStyle(choice.setSketchUiStyle(choice.DEFAULT_SKETCH_UI,'sketch'),'manga');
  assert.equal(changed.style,'manga');
});
test('G23: initial Figma graphics are unselected, and tap produces the real graphic switching',()=>{
  for (const style of ['sketch','manga','comic'])
    assert.match(main,new RegExp(`class="day19-chip" data-style="${style}" aria-pressed="false"`));
  for (const l of ['thin','normal','thick'])
    assert.match(main,new RegExp(`class="day20-line-chip" data-line="${l}" aria-pressed="false"`));
  assert.match(main,/style-sketch-off\.svg" data-selected-src/);
  assert.match(editor,/ui = DEFAULT_SKETCH_UI; showUI\(\)/);
  assert.match(editor,/button\.setAttribute\('aria-pressed', String\(selected\)\)/);
  assert.match(editor,/selected \? art\?\.dataset\.selectedSrc : art\?\.dataset\.defaultSrc/);
});
test('G23: original preview is the fallback for NONE/Manga/Comic and for all ungenerated images',()=>{
  assert.match(editor,/ui\.style !== 'sketch' \|\| !processedURL/);
  assert.match(editor,/else if \(ui\.style === null\)/);
  assert.match(editor,/previewNote\.textContent = 'Оригинална снимка\.'/);
  assert.match(editor,/processedURL = savedURL/);
  assert.match(editor,/savedProcessed = processed/);
  assert.doesNotMatch(editor,/preview\.src = savedURL/);
});
test('G23: Draw is enabled only for a real selected Sketch and writes only in the Draw handler',()=>{
  assert.match(main,/<button id="day19-draw"[^>]*disabled/);
  assert.match(editor,/ui\.style === 'sketch' && Boolean\(processedURL\)/);
  assert.match(editor,/drawButton\.disabled = !ready/);
  const before=editor.slice(0,editor.indexOf("drawButton.addEventListener('click'"));
  assert.doesNotMatch(before,/saveProcessedPng\(/);
  assert.match(editor,/await saveProcessedPng\(projectId, provenance,[\s\S]*?true\)/);
  assert.match(editor,/await selectProcessedAsset\(projectId, sourceId, savedProcessed\.id\)/);
  assert.match(editor,/await getProjectImage\(projectId\)/);
  assert.match(editor,/if \(fresh\.source\.id !== sourceId/);
  assert.match(editor,/drawBusy = true/);
});
test('G23: original source remains active; selected derivative checked for ownership',()=>{
  assert.match(store,/selectedProcessedAssetId\?: string/);
  assert.match(store,/getSelectedProcessedAsset\(/);
  assert.match(store,/selectProcessedAsset\(/);
  assert.match(store,/project\.activeAssetId !== sourceId/);
  assert.match(store,/asset\.sourceAssetId !== source\.id/);
  assert.match(store,/delete project\.selectedProcessedAssetId/);
  const actual=code('src/storage/day13-processed.ts');
  assert.match(actual,/if \(selectForDrawing\) projects\.put\(\{ \.\.\.project, selectedProcessedAssetId: asset\.id \}\)/);
  assert.match(backup,/project\.selectedProcessedAssetId !== undefined/);
  assert.match(code('src/storage/day14-backup-service.ts'),/selectedProcessedAssetId/);
});
test('G23: camera selection resumes from saved PNG, preserves scene transform and stream',()=>{
  assert.match(camera,/getSelectedProcessedAsset\(project, source\)/);
  assert.match(camera,/preparePreview\(selectedSketch\?\.blob \?\? source\.blob\)/);
  assert.match(camera,/export async function applySketchToActiveCamera\(/);
  const codeBlock=camera.slice(camera.indexOf('export async function applySketchToActiveCamera('),
    camera.indexOf('/** Called synchronously by the Homepage tap.'));
  assert.doesNotMatch(codeBlock,/cameraController\.(?:start|stop)\(/);
  assert.doesNotMatch(codeBlock,/artworkScale =|artworkX =|artworkY =|artworkAngle =|opacity =|artworkMirrored =/);
  assert.match(editor,/await applySketchToActiveCamera\(projectId, sourceId, savedProcessed\.blob\)/);
  assert.match(editor,/await openSavedDrawing\(projectId\)/);
});
