/** Day 20.3: spacing only. Preserve user SVG paths, hit areas, and the one-screen layout. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const app = fileURLToPath(new URL('..', import.meta.url));
const get = path => readFileSync(resolve(app, path), 'utf8');
const css = get('src/styles.css');
const art = get('public/ui/generator/figma-controls-lettering.svg');
const baseHash = '833f06f4586ca3d69a74070e4dfbae515d8595593d97bacaa17c44451f3fd893';

test('Day20.3: exact Figma vector lettering is unchanged except section translations', () => {
  assert.match(art, /id="Group 53" transform="translate\(0 -6\)"/);
  assert.match(art, /id="Group 58" transform="translate\(0 4\)"/);
  const unshifted = art.replace(' transform="translate(0 -6)"', '').replace(' transform="translate(0 4)"', '');
  assert.equal(createHash('sha256').update(unshifted).digest('hex'), baseHash);
});

test('Day20.3: visual SVG labels and corresponding touch targets move together', () => {
  const final = css.slice(css.indexOf('/* Day 20.3: approved iPhone micro-spacing.'));
  assert.match(final, /\.day20-figma-screen \.day20-figma-controls \{ transform:translateY\(-10px\); \}/);
  assert.match(final, /\.day20-figma-screen \.day19-style-list\.day20-figma-styles \{ transform:translateY\(-6px\); \}/);
  assert.match(final, /\.day20-figma-screen \.day20-figma-lines \{ transform:translateY\(4px\); \}/);
  assert.match(final, /\.day20-figma-screen \.day20-figma-draw \{ transform:translateY\(5px\); \}/);
});

test('Day20.3: camera, gallery, zoom and persistence are untouched by spacing patch', () => {
  assert.match(css, /\.day20-figma-screen \.day19-preview-zoom\s*\{\s*top:10%; right:11\.8%/s);
  assert.match(css, /--sketchy-home-image/);
  assert.match(css, /\.day20-figma-slider-fill/);
  assert.match(JSON.parse(get('package.json')).version, /^0\.(20\.[3-9]|2[1-9]\.\d+)$/, 'Day 20.3 or later must preserve approved spacing');
});
