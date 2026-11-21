/** G28.1: true contain-fit of ORIGINAL and generated PNG in Figma aperture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fitImageInAperture } from '../src/day28-1-polaroid-fit.ts';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const cases = [
  { label: 'horizontal 4:3', source: [4032,3024], aperture: [290,260] },
  { label: 'panorama 5:1', source: [5000,1000], aperture: [290,260] },
  { label: 'portrait 3:4', source: [3024,4032], aperture: [290,260] },
  { label: 'portrait 1:5', source: [800,4000], aperture: [290,260] },
  { label: 'square', source: [2400,2400], aperture: [290,260] },
  { label: 'small horizontal', source: [100,50], aperture: [290,260] },
  { label: 'small vertical', source: [50,100], aperture: [290,260] },
];
for (const { label, source, aperture } of cases) {
  test(`G28.1: ${label} fits inside both Polaroid axes`, () => {
    const f = fitImageInAperture(...source, ...aperture);
    assert.ok(f && f.scale > 0);
    assert.ok(f.width <= aperture[0] - 12 + 1e-7);
    assert.ok(f.height <= aperture[1] - 12 + 1e-7);
    assert.ok(Math.abs(f.width / f.height - source[0] / source[1]) < 1e-10);
    assert.ok(Math.abs(Math.max(f.width / (aperture[0]-12),f.height/(aperture[1]-12))-1)<1e-10);
  });
}
test('G28.1: invalid/hidden/zero apertures cannot produce overflow dimensions',()=>{
  assert.equal(fitImageInAperture(100,200,0,300),null);
  assert.equal(fitImageInAperture(100,200,50,10),null);
  assert.equal(fitImageInAperture(NaN,200,290,260),null);
  assert.equal(fitImageInAperture(0,200,290,260),null);
  assert.equal(fitImageInAperture(10,20,290,260,-1),null);
});
test('G28.1: runtime measures the decoded source and recalculates for PNG switch and resize',()=>{
  const s = read('src/day17-sketch-placeholder.ts');
  assert.match(s,/preview\.naturalWidth, preview\.naturalHeight/);
  assert.match(s,/previewWindow\.clientWidth, previewWindow\.clientHeight/);
  assert.match(s,/preview\.addEventListener\('load', fitPolaroidPreview\)/);
  assert.match(s,/new ResizeObserver\(fitPolaroidPreview\)\.observe\(previewWindow\)/);
  assert.match(s,/preview\.style\.transform = 'translate\(-50%, -50%\)'/);
  assert.match(s,/preview\.style\.removeProperty\('width'\)/);
  assert.match(s,/window\.addEventListener\('resize', fitPolaroidPreview\)/);
});
test('G28.1: photograph is clipped to inner Figma aperture, not to outer frame',()=>{
  const css = read('src/styles.css');
  assert.match(css,/\.day20-figma-screen \.day19-content \.day17-edit-preview-placeholder\s*\{[^}]*overflow:hidden/);
  assert.match(css,/\.day20-figma-screen \.day19-content #day18-original-preview\s*\{[^}]*object-fit:contain/);
  const main = read('src/main.ts');
  assert.match(main,/id="day18-original-preview"/);
  assert.match(main,/class="day20-figma-polaroid-art"/);
  assert.match(css,/\.home-project-saved \.home-project-preview\s*\{[^}]*object-fit: cover/);
});
