/** Day 19.1: source preview fits entirely in the NEW Generator Polaroid.
 * Regression guard: never modify the gallery or camera image sizing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');

const rule = css.match(/\.day19-content\s+#day18-original-preview\s*\{([^}]+)\}/)?.[1];
test('Day19.1: only the Generator preview has proportional full-image fit', () => {
  assert.ok(rule, 'Generator-only CSS rule must exist');
  assert.match(rule, /object-fit\s*:\s*contain\s*;/);
  assert.match(rule, /object-position\s*:\s*center\s+center\s*;/);
  assert.match(rule, /position\s*:\s*absolute\s*;/);
  assert.match(rule, /width\s*:\s*calc\(100%\s*-\s*16px\)\s*;/);
  assert.match(rule, /height\s*:\s*calc\(100%\s*-\s*16px\)\s*;/);
  assert.doesNotMatch(rule, /object-fit\s*:\s*cover/);
  assert.match(main, /class="day19-preview-frame"/);
  assert.match(main, /id="day18-original-preview"/);
});

test('Day19.1: image cannot enlarge or overflow its Polaroid container', () => {
  assert.match(css, /\.day19-content \.day17-edit-preview-placeholder\s*\{[^}]*overflow\s*:\s*hidden/);
  assert.match(rule, /max-width\s*:\s*calc\(100%\s*-\s*16px\)\s*;/);
  assert.match(rule, /max-height\s*:\s*calc\(100%\s*-\s*16px\)\s*;/);
  assert.match(rule, /top\s*:\s*8px\s*;/);
  assert.match(rule, /left\s*:\s*8px\s*;/);
});

test('Day19.1: Home and Camera keep their existing independent sizing rules', () => {
  assert.match(css, /\.home-project-tile img\s*\{[^}]*object-fit\s*:\s*fill/);
  assert.match(css, /#drawing-camera\s*\{[^}]*object-fit\s*:\s*cover/);
  assert.match(css, /\.drawing-user-image\s*\{[^}]*object-fit\s*:\s*contain/);
});
