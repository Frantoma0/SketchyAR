/** Day 22: REAL Sketch preview safety/contract; no DB writes until later Save/Draw gate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SketchDraftGate } from '../src/day22-sketch-gate.ts';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('D22: successive jobs invalidate old results even for the same project', () => {
  const gate = new SketchDraftGate();
  const a = gate.begin('project-1', 'source-1');
  assert.equal(gate.isCurrent(a,'project-1','source-1'),true);
  const b = gate.begin('project-1','source-1');
  assert.equal(gate.isCurrent(a,'project-1','source-1'),false);
  assert.equal(gate.isCurrent(b,'project-1','source-1'),true);
  assert.equal(gate.isCurrent(b,'project-2','source-1'),false);
  assert.equal(gate.isCurrent(b,'project-1','source-2'),false);
});

test('D22: editor close invalidates result and cannot resurrect preview', () => {
  const gate = new SketchDraftGate();
  const ticket = gate.begin('project-1','source-1');
  gate.cancel();
  assert.equal(gate.isCurrent(ticket,'project-1','source-1'),false);
  assert.equal(gate.isCurrent(ticket + 1,'project-1','source-1'),false);
});

test('D22: only the existing validated Python bridge generates the real image', () => {
  const code = read('src/day22-sketch-mode.ts');
  assert.match(code,/decodeReducedGray\(source\)/);
  assert.match(code,/runPythonImage\(\{ \.\.\.gray, \.\.\.SKETCH_V1_SETTINGS \}\)/);
  assert.match(code,/encodeTransparentPng\(result\.mask, result\.width, result\.height\)/);
  assert.match(code,/sigma: 1, low: 0\.04, high: 0\.10/);
  assert.doesNotMatch(code,/saveProcessedPng\s*\(|openSavedDrawing\s*\(|\.put\s*\(/);
  const bridge=read('src/day13-image-bridge.ts');
  assert.match(bridge,/export async function decodeReducedGray\(/);
  assert.match(bridge,/export async function encodeTransparentPng\(/);
  assert.match(bridge,/image\.data\[i \* 4 \+ 3\] = mask\[i\] \? 255 : 0/);
});

test('D22: no processed preview may be shown for Manga and Comic', () => {
  const editor=read('src/day17-sketch-placeholder.ts');
  assert.match(editor,/ui\.style !== 'sketch' \|\| !processedURL/);
  assert.match(editor,/if \(ui\.style === 'sketch'\) requestSketch\(\)/);
  assert.match(editor,/Манга и Комикс предстоят/);
  assert.match(editor,/sourceForSketch = \{ projectId: project\.id, sourceId: source\.id, blob: source\.blob \}/);
  assert.match(editor,/sketchGate\.cancel\(\)/);
  assert.match(editor,/sketchGate\.isCurrent\(ticket, projectId, sourceId\)/);
  assert.match(editor,/fresh\.source\.id !== sourceId/);
});

test('D22+23: original Figma shell, stored PNG comparison and zoom remain', () => {
  const editor=read('src/day17-sketch-placeholder.ts');
  const main=read('src/main.ts');
  const css=read('src/styles.css');
  assert.match(editor,/getLatestProcessedPreview\(project\.id, source\.id\)/);
  assert.match(editor,/savedProcessed = processed/);
  assert.match(editor,/showUI\(\)/);
  assert.match(editor,/openZoom/);
  assert.match(editor,/previewWindow\.classList\.add\('day22-processing'\)/);
  assert.match(editor,/D\.log\('info', 'day22', 'sketch\.generate\.pass'/);
  assert.match(main,/<button id="day19-draw"[^>]*disabled/);
  assert.match(main,/src="\.\/ui\/generator\/figma-polaroid\.svg"/);
  assert.match(css,/\.day20-figma-screen #day18-preview-window\.day22-processing::after/);
});

test('D22+23: Draw enables only with real Sketch; detail and line remain visual' , () => {
  const editor=read('src/day17-sketch-placeholder.ts');
  const service=read('src/day22-sketch-mode.ts');
  assert.match(editor,/persisted: false/);
  assert.match(editor,/Детайлност и линии все още не променят PNG/);
  assert.doesNotMatch(service,/saveProcessedPng/);
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'0.23.0');
  assert.match(editor,/ui\.style === 'sketch' && Boolean\(processedURL\)/);
});
