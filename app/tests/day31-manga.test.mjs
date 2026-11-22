/** Day 31: style-aware provenance, preview safety and Worker integration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'sketchyar-day31-'));
const local = resolve(root, 'node_modules/typescript/bin/tsc');
const bin = existsSync(local) ? process.execPath : 'tsc';
const prefix = bin === process.execPath ? [local] : [];
const major = Number(execFileSync(bin, [...prefix, '--version'], {encoding:'utf8'}).match(/\d+/)?.[0]);
const args = [...prefix, ...(major >= 6 ? ['--ignoreConfig'] : []), '--module','commonjs',
  '--moduleResolution',major >= 6 ? 'bundler' : 'node', '--target','es2022',
  '--lib','es2022,dom,dom.iterable', '--strict','--skipLibCheck','--outDir',tmp,
  resolve(root, 'src/day31-styled-variants.ts')];
execFileSync(bin, args, {stdio:'pipe'});
writeFileSync(join(tmp,'package.json'), '{"type":"commonjs"}');
const mod = require(join(tmp, 'day31-styled-variants.js'));
test.after(() => rmSync(tmp, {recursive:true,force:true}));
const SKETCH='day30-v4-stroke-v2', MANGA='day31-manga-layers-v1';
const src='photo-source';
const asset = (style, detail=3, line='normal') => ({role:'processed',sourceAssetId:src,
  pipelineVersion:style==='manga'?MANGA:SKETCH,
  params:{style,detail,line}});

test('G31: exactly 30 distinct style/detail/line cache keys, no Sketch/Manga collisions', () => {
  const keys = new Set();
  for (const style of ['sketch','manga']) {
    assert.equal(mod.isProductiveStyle(style), true);
    for (let detail=1;detail<=5;detail++) for (const line of ['thin','normal','thick']) {
      const key=mod.styledVariantKey(style,detail,line);
      assert.equal(mod.matchesStyledVariant(asset(style,detail,line),src,style,detail,line,SKETCH,MANGA),true);
      assert.ok(!keys.has(key));keys.add(key);
    }
  }
  assert.equal(keys.size,30);
  for (const s of [null,'comic','none',{},undefined]) assert.equal(mod.isProductiveStyle(s), false);
});

test('G31: an exact Manga PNG cannot be read as Sketch and vice versa',()=>{
  assert.equal(mod.matchesStyledVariant(asset('manga'),src,'sketch',3,'normal',SKETCH,MANGA),false);
  assert.equal(mod.matchesStyledVariant(asset('sketch'),src,'manga',3,'normal',SKETCH,MANGA),false);
  assert.equal(mod.matchesStyledVariant({...asset('manga'),sourceAssetId:'another'},src,'manga',3,'normal',SKETCH,MANGA),false);
  assert.equal(mod.matchesStyledVariant({...asset('manga'),pipelineVersion:SKETCH},src,'manga',3,'normal',SKETCH,MANGA),false);
  assert.equal(mod.matchesStyledVariant({...asset('manga'),params:{style:'sketch',detail:3,line:'normal'}},src,'manga',3,'normal',SKETCH,MANGA),false);
  assert.equal(mod.matchesStyledVariant({...asset('manga'),role:'source'},src,'manga',3,'normal',SKETCH,MANGA),false);
  assert.equal(mod.matchesStyledVariant(asset('manga',2,'thin'),src,'manga',3,'thin',SKETCH,MANGA),false);
});

test('G31: old applied Sketch remains Sketch; applied Manga restored from exact asset',()=>{
  assert.equal(mod.appliedProcessedStyle({pipelineVersion:'day27-importance-v3',params:{}}),'sketch');
  assert.equal(mod.appliedProcessedStyle({pipelineVersion:SKETCH,params:{detail:3}}),'sketch');
  assert.equal(mod.appliedProcessedStyle({pipelineVersion:MANGA,params:{detail:3}}),'manga');
  assert.equal(mod.appliedProcessedStyle(asset('manga')),'manga');
});

test('G31: Manga Python is embedded lazily into the existing same-origin Worker',()=>{
  const worker=read('src/python-worker.ts');
  const client=read('src/python-client.ts');
  const mode=read('src/day31-manga-mode.ts');
  assert.match(worker,/import day31Source from '\.\.\/\.\.\/python_engine\/ar_drawing\/day31_manga\.py\?raw'/);
  assert.match(worker,/if \(style === 'manga' && !day31Ready\)/);
  assert.match(worker,/_sketchyar_day31\.process_gray8_manga\(/);
  assert.match(worker,/_sketchyar_day30\.process_gray8_stroke\(/);
  assert.match(client,/!\['sketch', 'manga'\]\.includes\(style\)/);
  assert.match(client,/detail, line, style \}, \[input\.buffer\]/);
  assert.match(mode,/style: 'manga'/);
  assert.match(mode,/encodeTransparentPng\(result\.mask, result\.width, result\.height\)/);
  assert.doesNotMatch(mode,/saveProcessedPng\s*\(/);
});

test('G31: editor invalidates stale preview on style switch and Draw commits, Back does not',()=>{
  const editor=read('src/day17-sketch-placeholder.ts');
  assert.match(editor,/const next = setSketchUiStyle\(ui, button\.dataset\.style\)/);
  assert.match(editor,/invalidateVariantPreview\(\);[\s\S]*ui = next/);
  assert.match(editor,/requestedStyle === 'manga'[\s\S]*?generateMangaDraft/);
  assert.match(editor,/ui\.style === requestedStyle && ui\.detail === requestedDetail && ui\.line === requestedSelection/);
  assert.match(editor,/if \(!isCurrent\(\)\) return/);
  assert.match(editor,/params: \{ \.\.\.SKETCH_V4_SETTINGS, style: requestedStyle/);
  assert.match(editor,/result\.png, result\.width, result\.height, false/);
  assert.match(editor,/style: appliedProcessedStyle\(processed\)/);
  assert.match(editor,/await selectProcessedAsset\(projectId, sourceId, savedProcessed\.id, ui\.line\)/);
  assert.match(editor,/await openSavedDrawing\(projectId\)/);
  assert.match(editor,/fitImageInAperture\(/);
  assert.match(editor,/!isProductiveStyle\(ui\.style\)/); // Comic still placeholder
});

test('G31: style follows asset provenance in atomic Draw paths; backup schema remains v1',()=>{
  const save=read('src/storage/day13-processed.ts');
  const store=read('src/storage/project-store.ts');
  const backup=read('src/storage/day14-backup-service.ts');
  assert.match(save,/editorStyle: provenance\.params\.style === 'manga' \? 'manga' : 'sketch'/);
  assert.match(store,/editorStyle: a\.params\?\.style === 'manga' \? 'manga' : 'sketch'/);
  assert.match(store,/PROJECT_DB_VERSION = 1/);
  assert.match(backup,/\['sketch','manga','comic'\]/);
  assert.equal(JSON.parse(read('package.json')).version,'0.32.1');
  assert.equal(JSON.parse(read('package-lock.json')).version,'0.32.1');
});

test('G31: Manga preprocessor changes tonal distribution, not the Sketch V4 input path',()=>{
  const bridge=read('src/day13-image-bridge.ts');
  const sketch=read('src/day22-sketch-mode.ts');
  assert.match(bridge,/return decodeReducedGray\(blob, true\)/);
  assert.match(bridge,/const chroma = mangaColorLift \? Math\.min\(26,/);
  assert.match(sketch,/decodeReducedGray\(source\)/);
  assert.match(sketch,/SKETCH_QUALITY_VERSION = 'day30-v4-stroke-v2'/);
});
