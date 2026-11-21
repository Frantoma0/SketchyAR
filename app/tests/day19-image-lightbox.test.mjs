/** Day 19.2 — user-supplied zoom icon, full-image preview and safe lifecycle. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
const editor = readFileSync(resolve(root, 'src/day17-sketch-placeholder.ts'), 'utf8');
const supplied = readFileSync(resolve(root, 'public/ui/generator/zoom-control.svg'));

const generator = main.split('<!-- Day 19: truthful graphite Generator UI shell.')[1]?.split('<!-- Day 16: Native file picker')[0];

test('Day19.2: supplied magnifier SVG kept intact, with a single accessible trigger', () => {
  assert.ok(generator);
  assert.match(supplied.toString('utf8'), /^<svg width="88" height="89"/);
  assert.match(generator, /id="day19-preview-zoom"[^>]+aria-label="Отвори цялото изображение"/);
  assert.match(generator, /aria-controls="day19-image-lightbox"/);
  assert.match(generator, /src="\.\/ui\/generator\/zoom-control\.svg"/);
  assert.match(generator, /id="day19-preview-zoom"[^>]+disabled/);
  assert.match(css, /\.day19-preview-frame\s*\{\s*position\s*:\s*relative/);
  assert.match(css, /\.day19-preview-zoom\s*\{[^}]*position\s*:\s*absolute/);
});

test('Day19.2: dark full-viewport modal has close control and contain-only image', () => {
  assert.match(generator, /id="day19-image-lightbox"[^>]+role="presentation" hidden/);
  assert.match(generator, /class="day19-lightbox-panel" role="dialog" aria-modal="true"/);
  assert.match(generator, /id="day19-lightbox-close"[^>]*class="day19-lightbox-close"/);
  assert.match(generator, /id="day19-lightbox-image"/);
  assert.match(css, /\.day19-image-lightbox\s*\{[^}]*position\s*:\s*fixed; inset:0; z-index:2300/);
  assert.match(css, /\.day19-image-lightbox\s*\{[^}]*rgba\(12,11,12,\.93\)/);
  assert.match(css, /#day19-lightbox-image\s*\{[^}]*max-width\s*:\s*100%/);
  assert.match(css, /#day19-lightbox-image\s*\{[^}]*max-height\s*:\s*100%/);
  assert.match(css, /#day19-lightbox-image\s*\{[^}]*object-fit\s*:\s*contain/);
});

test('Day19.2: opens only after source load, uses same Blob URL and never writes', () => {
  assert.match(editor, /if \(!previewURL \|\| preview\.hidden \|\| screen\.hidden/);
  assert.match(editor, /zoomImage\.src = previewURL/);
  assert.match(editor, /zoomButton\.disabled = true/);
  assert.match(editor, /zoomButton\.disabled = false/);
  assert.match(editor, /screen\.inert = true/);
  assert.match(editor, /screen\.inert = false/);
  assert.doesNotMatch(editor, /(saveProcessedPng|putProject|updateProject|deleteImageProject)\s*\(/);
});

test('Day19.2: close X, backdrop, Escape and editor lifecycle all release zoom state', () => {
  assert.match(editor, /zoomClose\.addEventListener\('click', \(\) => closeZoom\(\)\)/);
  assert.match(editor, /zoomOverlay\.addEventListener\('click',/);
  assert.match(editor, /event\.key === 'Escape'/);
  assert.match(editor, /zoomOverlay\.addEventListener\('keydown'/);
  assert.match(editor, /closeZoom\(false\); \/\/ the Blob URL must not be revoked while the zoom is visible/);
  assert.match(editor, /zoomImage\.removeAttribute\('src'\)/);
  assert.match(editor, /URL\.revokeObjectURL\(previewURL\)/);
  assert.match(editor, /zoomButton\.focus\(\)/);
});
