import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('..', import.meta.url));
const main=readFileSync(resolve(dir,'src/main.ts'),'utf8');
const css=readFileSync(resolve(dir,'src/styles.css'),'utf8');
const editor=readFileSync(resolve(dir,'src/day17-sketch-placeholder.ts'),'utf8');
const section=main.split('<!-- Day 19: truthful graphite Generator UI shell.')[1]?.split('<!-- Day 16: Native file picker')[0];
const read=(s)=>readFileSync(resolve(dir,'public/ui/generator',s),'utf8');
test('Day20.1: Figma vector typography, controls and 264x71 Draw source are exact geometry',()=>{
 assert.ok(section);
 for(const [f,w,h] of [['figma-header-exact.svg','353','51'],['figma-controls-clean.svg','344','205.16'],
 ['figma-polaroid.svg','346','368'],['figma-draw.svg','264','71']]) {
  assert.match(read(f),new RegExp(`<svg[^>]*width="${w}" height="${h}"`));
  assert.ok(section.includes(`./ui/generator/${f}`));
 }
 assert.match(read('figma-controls-clean.svg'),/Group 59/);
 assert.match(read('figma-header-exact.svg'),/Group 49/);
});
test('Day20.1: single screen and full photo contain; no visible project labels / return CTA',()=>{
 assert.match(css,/\.day20-figma-screen \{[^}]*overflow:hidden/s);
 assert.match(css,/\.day20-figma-screen \.day20-figma-content \.day20-figma-polaroid/s);
 assert.match(css,/aspect-ratio:346 \/ 368/);
 assert.match(css,/\.day20-figma-screen \.day19-content #day18-original-preview[^{]*\{[^}]*object-fit:contain/s);
 assert.match(section,/id="day17-edit-project-name"[^>]*hidden/);
 assert.match(section,/id="day17-edit-return"[^>]*hidden/);
 assert.match(section,/id="day18-preview-note"[^>]*day20-visually-hidden/);
 assert.match(section,/id="day17-edit-info"[^>]*day20-visually-hidden/);
});
test('Day20.1: label-free exact Figma selection still has accessible interactive controls',()=>{
 for(const x of ['sketch','manga','comic']) assert.match(section,new RegExp(`data-style="${x}"[^>]+aria-pressed=`));
 for(const x of ['thin','normal','thick']) assert.match(section,new RegExp(`data-line="${x}"[^>]+aria-pressed=`));
 assert.match(section,/id="day19-detail-slider"[^>]*type="range"[^>]*min="1" max="5"/);
 assert.match(section,/id="day19-preview-zoom"/);
 assert.match(section,/id="day19-draw"[^>]*disabled/);
 assert.match(section,/figma-draw\.svg" alt="Рисувай"/);
 assert.doesNotMatch(section,/<span>\+ Рисувай<\/span>/);
 assert.match(editor,/detail\.parentElement\?\.style\.setProperty/);
 assert.match(editor,/resetComparison/);
});
