import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const main = readFileSync(resolve(root,'src/main.ts'),'utf8');
const css = readFileSync(resolve(root,'src/styles.css'),'utf8');
const editor = readFileSync(resolve(root,'src/day17-sketch-placeholder.ts'),'utf8');
const home = readFileSync(resolve(root,'src/home.ts'),'utf8');
const segment = main.split('<!-- Day 19: truthful graphite Generator UI shell.')[1]?.split('<!-- Day 16: Native file picker')[0];

test('Day19: new Generator UI shell preserves edit and source preview IDs', () => {
 assert.ok(segment); for (const id of [
  'day17-edit-screen','day17-edit-heading','day17-edit-back','day17-edit-return',
  'day17-edit-project-name','day18-original-preview','day18-preview-note','day18-preview-empty',
  'day19-generator-shell','day19-detail-slider','day19-draw']) {
    assert.match(segment,new RegExp(`id="${id}"`),id);
  }
  assert.match(editor,/getProjectImage\(project\.id\)/);
  assert.match(editor,/URL\.revokeObjectURL/);
});

test('Day19→20: draft controls active but output cannot be saved', () => {
 assert.match(segment,/<fieldset[^>]+class="day19-controls day20-controls/);
 assert.match(segment,/<button id="day19-draw"[^>]+disabled/);
 assert.match(segment,/Избраните настройки са визуални/);
 assert.match(segment,/day20-visually-hidden/);
 assert.doesNotMatch(segment,/id="day19-(?:save|generate-now|apply)"/);
 assert.match(segment,/id="day19-detail-slider"[^>]+type="range"[^>]+min="1" max="5"/);
 assert.match(segment,/data-line="thin"/);
});

test('Day19: supplied SVG assets copied verbatim and referenced by the screen', () => {
 for (const [name,w,h] of [['square-control.svg',79,69],['pill-control.svg',264,71],['mini-control.svg',27,27]]) {
  const path = resolve(root,'public/ui/generator',name);
  assert.equal(existsSync(path),true,name);
  const text = readFileSync(path,'utf8');
  assert.match(text,new RegExp(`<svg width="${w}" height="${h}"`));
  assert.ok(readFileSync(path,'utf8').includes('<svg')); // original assets retained for later controls
 }
});

test('Day19: CSS scoped to editor, responsive, and Home geometry unchanged', () => {
 assert.match(css,/\.day19-header/);
 assert.match(css,/@media \(max-width:380px\)/);
 assert.match(css,/\.day17-edit-screen\[hidden\]/);
 assert.match(css,/\.day20-controls \.day19-chip/);
 assert.match(home,/initDay17EditPlaceholder/);
 assert.match(home,/sketchEditor\.open/);
 assert.match(main,/class="home-project-grid"/);
});

test('Day19+23: editor retains navigation; only Draw may save PNG', () => {
 assert.match(editor,/route\.cancel\(\)/);
 assert.match(editor,/if \(event\.key === 'Escape'\)/);
 assert.match(editor,/if \(focus\?\.isConnected\) focus\.focus\(\)/);
 assert.match(editor,/drawButton\.addEventListener\('click'/);
 assert.match(editor,/await saveProcessedPng\(/);
 assert.match(editor,/if \(screen\.hidden \|\| drawBusy\) return;/);
});
