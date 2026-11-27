/** Day 32.1 iPhone-only AI inference experiment: real local model, no cloud upload. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BENCH_SCHEMA, TFJS_URL, MODEL_URL, IMAGE_SIZES, MODEL_CACHE,
  medianMs, validSize, fitToMaxSide, summarizeRuns } from '../public/ai-lab/bench-utils.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');

test('G32.1 benchmark accepts only safe bounded image sizes',()=>{
  assert.deepEqual(IMAGE_SIZES,[128,192,256,384,512]);
  for(const bad of [0,1,64,513,1024,'hello',null,{},-1]) assert.throws(()=>validSize(bad));
  assert.equal(validSize('256'),256);
  assert.deepEqual(fitToMaxSide(3200,1800,256),{width:256,height:144});
  assert.deepEqual(fitToMaxSide(800,2400,128),{width:40,height:128});
});

test('G32.1 median and summaries never fabricate missing measurements',()=>{
  assert.equal(medianMs([]),null);
  assert.equal(medianMs([7,2,4]),4);
  assert.equal(medianMs([4,2]),3);
  assert.equal(medianMs([NaN]),null);
  assert.deepEqual(summarizeRuns([]),{});
  const r=summarizeRuns([
    {status:'ok',longSide:128,inferenceMs:200,totalMs:400,tfBytesAfterRun:1000},
    {status:'ok',longSide:128,inferenceMs:300,totalMs:500,tfBytesAfterRun:2000},
    {status:'failed',longSide:256,inferenceMs:0,totalMs:0},
  ]);
  assert.deepEqual(r,{'128':{count:2,medianInferenceMs:250,medianTotalMs:450,maxTfBytesAfterRun:2000}});
});

test('G32.1 uses published author model with local persistent weight cache',()=>{
  assert.equal(BENCH_SCHEMA,'sketchyar-iphone-ai-bench-v1');
  assert.match(MODEL_CACHE,/^indexeddb:\/\//);
  assert.match(MODEL_URL,/^https:\/\/raw\.githubusercontent\.com\/TonyLianLong\/AnimeGAN\.js\/[a-f0-9]{40}\/public\/model_full\/model\.json$/);
  assert.match(TFJS_URL,/^https:\/\/cdn\.jsdelivr\.net\/npm\/@tensorflow\/tfjs@4\.22\.0/);
  const lab=read('public/ai-lab/lab.js');
  assert.match(lab,/tf\.loadGraphModel\(MODEL_CACHE\)/);
  assert.match(lab,/tf\.loadGraphModel\(MODEL_URL/);
  assert.match(lab,/model\.save\(MODEL_CACHE\)/);
  assert.match(lab,/model\.executeAsync\(\{test: input\}\)/);
  assert.match(lab,/await tf\.browser\.toPixels\(processed, output\)/);
  assert.match(lab,/navigator\.storage\?\.estimate/);
  assert.match(lab,/tf\.memory\(\)/);
  assert.match(lab,/function registerMirrorPad/);
  assert.doesNotMatch(lab,/fetch\([^)]*photo|FormData\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test('G32.1 lab is isolated and explicitly disclaims unverified iPhone results',()=>{
  const sw=read('public/ai-lab/sw.js');
  const html=read('public/ai-lab/index.html');
  const app=read('src/day17-sketch-placeholder.ts');
  assert.match(sw,/scope|location\.href/);
  assert.match(sw,/sketchyar-ai-lab-shell/);
  assert.match(html,/не се качват никъде/);
  assert.match(html,/не е променен/);
  assert.match(read('src/main.ts'),/href="\.\/ai-lab\/"/);
  assert.doesNotMatch(app,/AnimeGAN|ai-lab|MODEL_URL/);
  assert.equal(JSON.parse(read('package.json')).version,'0.33.0');
  assert.equal(JSON.parse(read('package-lock.json')).version,'0.33.0');
});
