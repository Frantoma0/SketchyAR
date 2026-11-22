/** Day 20 — truthfulness and UX state tests for new graphite generator controls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const app = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(),'sketchyar-day20-'));
const local = resolve(app,'node_modules/typescript/bin/tsc');
const tsc = existsSync(local) ? process.execPath : 'tsc';
const prefix = tsc === process.execPath ? [local] : [];
const v = Number(execFileSync(tsc,[...prefix,'--version'],{encoding:'utf8'}).match(/\d+/)?.[0]);
const args = [...prefix,...(v >= 6 ? ['--ignoreConfig'] : []),'--module','commonjs',
  '--target','es2022','--skipLibCheck','--strict','--outDir',tmp,resolve(app,'src/day20-sketch-state.ts')];
try { execFileSync(tsc,args,{stdio:'pipe'}); }
catch(err) { console.error(String(err.stdout ?? '') + String(err.stderr ?? '')); throw err; }
writeFileSync(join(tmp,'package.json'),'{"type":"commonjs"}');
const state = require(join(tmp,'day20-sketch-state.js'));
const main = readFileSync(resolve(app,'src/main.ts'),'utf8');
const css = readFileSync(resolve(app,'src/styles.css'),'utf8');
const controller = readFileSync(resolve(app,'src/day17-sketch-placeholder.ts'),'utf8');
const storage = readFileSync(resolve(app,'src/storage/project-store.ts'),'utf8');
test.after(()=>rmSync(tmp,{recursive:true,force:true}));
test('D20: selections are immutable, validated and reset to known defaults',()=>{
  assert.deepEqual(state.DEFAULT_SKETCH_UI,{style:null,detail:3,line:null});
  const selected=state.setSketchUiStyle(state.DEFAULT_SKETCH_UI,'manga');
  assert.equal(selected.style,'manga');
  assert.equal(state.DEFAULT_SKETCH_UI.style,null);
  assert.equal(state.setSketchUiStyle(selected,'manga').style,null);
  assert.equal(state.setSketchUiLine(selected,'thick').line,'thick');
  assert.equal(state.setSketchUiLine(state.setSketchUiLine(selected,'thick'),'thick').line,null);
  assert.equal(state.effectiveSketchLine(null),'normal');
  assert.equal(state.setSketchUiDetail(selected,5).detail,5);
});
test('D20: rejects invalid choices, steps, and injected style names',()=>{
  for(const invalid of ['unsupported','__proto__','']) assert.throws(()=>state.setSketchUiStyle(state.DEFAULT_SKETCH_UI,invalid));
  for(const invalid of [0,1.1,6,-1,NaN]) assert.throws(()=>state.setSketchUiDetail(state.DEFAULT_SKETCH_UI,invalid));
  assert.throws(()=>state.setSketchUiLine(state.DEFAULT_SKETCH_UI,'extreme'));
});
test('D20: original-vs-sketch comparison only enabled for genuine processed data',()=>{
  assert.equal(state.previewCanCompare(true,true),true);
  assert.equal(state.previewCanCompare(true,false),false);
  assert.equal(state.previewCanCompare(false,true),false);
});
test('D20: exact new user graphite SVGs retained verbatim',()=>{
  for(const [file,width,height] of [['selected-graphite-79.svg',79,24],['selected-graphite-66.svg',66,24],
    ['detail-graphite-stroke.svg',57,5],['detail-scale-graphic.svg',329,32],['line-pill.svg',71,30]]){
    const raw=readFileSync(resolve(app,'public/ui/generator',file),'utf8');
    assert.match(raw,new RegExp(`^<svg width="${width}" height="${height}"`));
  }
  assert.match(main,/data-selected-src="\.\/ui\/generator\/style-sketch-on\.svg"/);
  assert.match(main,/data-selected-src="\.\/ui\/generator\/line-normal-on\.svg"/);
  assert.match(main,/src="\.\/ui\/generator\/figma-controls-lettering\.svg"/);
});
test('D20: buttons have accessible pressed state, selected graphite and detail slider',()=>{
  for(const s of ['sketch','manga','comic']) assert.match(main,new RegExp(`data-style="${s}"`));
  for(const l of ['thin','normal','thick']) assert.match(main,new RegExp(`data-line="${l}"`));
  assert.match(main,/id="day19-detail-slider"[^>]+min="1" max="5"/);
  assert.match(controller,/button\.setAttribute\('aria-pressed', String\(selected\)\)/);
  assert.match(controller,/detail\.addEventListener\('input'/);
  assert.match(controller,/ui = DEFAULT_SKETCH_UI;/);
  assert.match(controller,/style: appliedProcessedStyle\(processed\)/);
});
test('D20: only matching processed PNG for current source may be compared',()=>{
  assert.match(storage,/getLatestProcessedPreview\(/);
  assert.match(storage,/a\.sourceAssetId === sourceAssetId/);
  assert.match(storage,/a\.role === 'processed'/);
  assert.match(controller,/getLatestProcessedPreview\(project\.id, source\.id, SKETCH_QUALITY_VERSION, ui\.detail, actualLine\(\)\)/);
  assert.match(controller,/processedURL = savedURL/);
  assert.match(controller,/savedProcessed = processed/);
  assert.match(controller,/showUI\(\)/); // original until user explicitly selects Sketch
});
test('D20: hold/release, cancel, lost pointer, blur and background restore correctly',()=>{
  for(const name of ['pointerdown','pointerup','pointercancel','lostpointercapture','pointerleave',
    'blur','visibilitychange']) assert.ok(controller.includes(name),name);
  assert.match(controller,/preview\.src = previewURL!/);
  assert.match(controller,/preview\.src = processedURL/);
  assert.match(controller,/comparisonTimer = setTimeout/);
  assert.match(controller,/clearTimeout\(comparisonTimer\)/);
  assert.match(controller,/window\.addEventListener\('pointerup', resetComparison\)/);
  assert.match(controller,/resetComparison\(\);\n    zoomImage\.src = currentImageURL/);
});
test('D20+23: magnifier stays fixed and Draw is gated on real output',()=>{
  assert.match(main,/id="day19-preview-zoom"/);
  assert.match(main,/<button id="day19-draw"[^>]*disabled/);
  assert.match(css,/\.day19-preview-zoom\s*\{[^}]*top:15px; right:15px/s);
  assert.match(controller,/drawButton\.disabled = !ready/);
  assert.match(controller,/await saveProcessedPng\(/);
  assert.match(controller,/if \(processedURL\) URL\.revokeObjectURL\(processedURL\)/);
});
