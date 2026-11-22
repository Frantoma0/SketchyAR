import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fitToMaxSide,planInference,blendWeight,tileStarts,MAX_DIRECT_PIXELS,MAX_TILE_HEIGHT,MAX_TILE_WIDTH} from '../public/ai-lab/bench-utils.mjs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('G32.2: observed iPhone resolution stays one direct inference',()=>{
  assert.equal(MAX_DIRECT_PIXELS,43008);
  const shape=fitToMaxSide(641,960,256);
  assert.deepEqual(shape,{width:168,height:256});
  assert.deepEqual(planInference(shape.width,shape.height,256),{mode:'direct',tiles:[{x:0,y:0,width:168,height:256}]});
});

test('G32.2: 384 and 512 always use bounded overlapping tiles covering every pixel',()=>{
  for(const size of [256,384,512]) for(const [iw,ih] of [[641,960],[960,641],[1000,1000],[300,1200]]){
    const {width,height}=fitToMaxSide(iw,ih,size);
    const plan=planInference(width,height,size);
    const coverage=new Uint8Array(width*height);
    for(const tile of plan.tiles){
      assert.ok(tile.width<=MAX_TILE_WIDTH || plan.mode==='direct');
      assert.ok(tile.height<=MAX_TILE_HEIGHT || plan.mode==='direct');
      assert.ok(tile.width*tile.height<=MAX_DIRECT_PIXELS);
      assert.equal(tile.width%8,0);assert.equal(tile.height%8,0);
      for(let y=tile.y;y<tile.y+tile.height;y++)for(let x=tile.x;x<tile.x+tile.width;x++)coverage[y*width+x]++;
    }
    assert.ok(coverage.every(x=>x>=1));
    if(size>256) assert.equal(plan.mode,'tiled');
    if(plan.mode==='tiled') assert.ok(plan.tiles.length>1);
  }
});

test('G32.2: deterministic tile origins and overlap blends with finite positive weights',()=>{
  assert.deepEqual(tileStarts(344,192),[0,152]);
  assert.deepEqual(tileStarts(512,224),[0,192,288]);
  const p=planInference(344,512,512);
  assert.equal(p.tiles.length,6);
  assert.equal(p.tiles[0].rightOverlap,40);
  assert.equal(p.tiles[1].leftOverlap,40);
  assert.ok(blendWeight(0,192,40,0)<blendWeight(100,192,40,0));
  for(const tile of p.tiles){
    for(const ox of [0,tile.width-1])for(const oy of [0,tile.height-1]){
      const w=blendWeight(ox,tile.width,tile.leftOverlap,tile.rightOverlap)*blendWeight(oy,tile.height,tile.topOverlap,tile.bottomOverlap);
      assert.ok(w>0 && w<=1);
    }
  }
  assert.throws(()=>tileStarts(100,64,64));
});

test('G32.2: browser lab never runs full-size 384/512 through the neural graph',()=>{
  const js=read('public/ai-lab/lab.js');
  const html=read('public/ai-lab/index.html');
  const sw=read('public/ai-lab/sw.js');
  assert.match(js,/planInference\(/);
  assert.match(js,/model\.executeAsync\(\{test: input\}\)/);
  assert.match(js,/await tf\.browser\.toPixels\(processed, output\)/);
  assert.match(js,/async function runTiled/);
  assert.match(js,/saveCheckpoint/);
  assert.match(js,/restoreCheckpoint/);
  assert.match(js,/webglcontextlost/);
  assert.match(html,/плочки/);
  assert.match(sw,/shell-v2/);
  assert.doesNotMatch(js,/FormData\(|XMLHttpRequest|sendBeacon|WebSocket/);
});
