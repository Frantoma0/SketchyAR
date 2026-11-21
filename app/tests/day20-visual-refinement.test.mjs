/** Day 20.2: original user SVGs, Home wallpaper, progress-only graphite and safe layout. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = fileURLToPath(new URL('..', import.meta.url));
const raw = name => readFileSync(resolve(app,name));
const text = name => raw(name).toString('utf8');
const main = text('src/main.ts');
const css = text('src/styles.css');
const editor = text('src/day17-sketch-placeholder.ts');
const dir = 'public/ui/generator/';
const hash = file => createHash('sha256').update(raw(dir + file)).digest('hex');

test('D20.2: unchanged user button SVGs for selected/unselected states',()=>{
  for (const [name,sha] of Object.entries({
    'style-sketch-on.svg':'28921cb52d38ca0f9b15a7f7283828a95a39ebbf2399ce723271e6c858268b85',
    'style-sketch-off.svg':'9b21c3d71dded9bf8520327be934367ccf25ab9c3a2d5781c7b4c0825539ec5a',
    'style-manga-off.svg':'6c56c76b2417bab812cf74b359c1f05dcbb2e666f2729c97eb5f2e37d4c9c100',
    'style-comic-on.svg':'db2ba3e6ec849af72d9a5156a00b694e9e3df6d05fd216d768a1eccc76f3c2d8',
    'style-comic-off.svg':'12bf6f997e912137d24f94f1aec91bdcb5ff0e29de961693fcc813c934addb42',
    'line-normal-on.svg':'379d9444114bd9acea64becc2ae67f85153f127785c26675f346c6af2b1bbe80',
    'line-normal-off.svg':'2452b996569d626c7b88cf4af8b39d8088ea0394929624cc78b201d0cac23fad',
    'line-thick-on.svg':'b1181804b7d6b7b3d15d61ed4b2a811f56f7f306a6446492c3aa8040a86c6737',
    'line-thick-off.svg':'caddcf9e74a53522ef89e7ae1122406a41f020257ef830e9f42684a6ec5eda01',
    'line-thin-off.svg':null,
    'detail-graphite-fill-exact.svg':null,
  })){
    assert.match(text(dir + name),/^<svg width=/);
    if(sha) assert.equal(hash(name),sha,name);
  }
});

test('D20.2: selected SVG backgrounds are swapped, not painted over vector text',()=>{
  const foreground=text(dir+'figma-controls-lettering.svg');
  assert.match(foreground,/Group 59/);
  assert.doesNotMatch(foreground,/id="Buton_\d+/);
  assert.doesNotMatch(foreground,/id="AR_Drawing_Slider_Fill_Dense_Only/);
  assert.match(foreground,/slider_track_outline 2/);
  for (const key of ['style-sketch','style-manga','style-comic','line-thin','line-normal','line-thick']) {
    assert.ok(main.includes(`${key}-on.svg`),`${key} selected`);
    assert.ok(main.includes(`${key}-off.svg`),`${key} default`);
  }
  assert.match(editor,/art\?\.dataset\.selectedSrc/);
  assert.match(editor,/art\?\.dataset\.defaultSrc/);
  assert.match(css,/\.day20-figma-screen \.day20-figma-controls-art\s*\{\s*z-index:3/);
});

test('D20.2: exact Home background, inset magnifier, safe Draw and no scrolled UI',()=>{
  assert.match(css,/background-image:var\(--sketchy-home-image, url\('\.\/ui\/home-background\.png'\)\)/);
  assert.match(css,/\.day20-figma-screen \.day19-preview-zoom\s*\{[^}]*top:10%; right:11\.8%/s);
  assert.match(css,/\.day20-figma-screen \.day20-figma-draw \{transform:translateY\(2px\)/);
  assert.match(css,/\.day20-figma-screen\s*\{[^}]*overflow:hidden/s);
  assert.match(main,/id="day19-preview-zoom"/);
  assert.match(main,/<button id="day19-draw"[^>]*disabled/);
});

test('D20.2: camera-style progress from the LEFT, and thumb above fill',()=>{
  assert.match(main,/class="day20-figma-slider-fill" src="\.\/ui\/generator\/detail-graphite-fill-exact\.svg"/);
  assert.match(css,/\.day20-figma-screen \.day20-figma-slider-fill\s*\{[^}]*clip-path:inset\(0 calc\(100% - var\(--day20-detail-progress,50%\)\)/s);
  assert.match(css,/\.day20-figma-screen \.day20-figma-slider-thumb\s*\{[^}]*z-index:5/);
  assert.match(editor,/detail\.parentElement\?\.style\.setProperty\('--day20-detail-progress'/);
  assert.match(main,/id="day19-detail-slider"[^>]*min="1" max="5"/);
});
