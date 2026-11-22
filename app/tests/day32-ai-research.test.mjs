/** G32: research harness changes no application routing, no camera/cloud coupling. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('G32 release version and three explicit independent AI backends',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'0.32.1');
  assert.equal(JSON.parse(read('package-lock.json')).version,'0.32.1');
  const inf = read('../experiments/day32/infer.py');
  for(const engine of ['qwen21_turbo','qwen_edit2511','animeganv3']) assert.match(inf,new RegExp(engine));
  assert.match(inf,/--dry-run/);
  assert.match(inf,/--onnx-model/);
});

test('G32 production Manga v1 remains local until an AI model is evaluated',()=>{
  const worker=read('src/python-worker.ts');
  assert.match(worker,/_sketchyar_day31\.process_gray8_manga/);
  assert.match(worker,/_sketchyar_day30\.process_gray8_stroke/);
  const ui=read('src/day17-sketch-placeholder.ts');
  assert.match(ui,/generateMangaDraft/);
  assert.match(ui,/await openSavedDrawing\(projectId\)/);
  assert.doesNotMatch(ui,/qwen21_turbo|qwen_edit2511|animeganv3|fetch\s*\(/);
});

test('G32 experiment is transparent about privacy, model licenses and missing proof',()=>{
  const protocol=read('../docs/day32-ai-model-experiment.md');
  assert.match(protocol,/Research License/);
  assert.match(protocol,/Apache-2\.0/);
  assert.match(protocol,/non-commercial/);
  assert.match(protocol,/Още НЕ е изпълнено/);
  assert.match(read('../.gitignore'),/experiments\/day32\/private\//);
  assert.ok(existsSync(new URL('../../experiments/day32/bench.py',import.meta.url)));
});
