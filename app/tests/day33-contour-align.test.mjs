import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateContourAlignment, rgbaToGray } from '../src/day33-contour-align.ts';

function image(w, h, fill = 255) { return { width: w, height: h, data: new Uint8Array(w*h).fill(fill) }; }
function line(img, x0, y0, x1, y1, value = 0) {
  const steps = Math.max(Math.abs(x1-x0), Math.abs(y1-y0));
  for (let i=0;i<=steps;i++) { const x=Math.round(x0+(x1-x0)*i/steps), y=Math.round(y0+(y1-y0)*i/steps); if(x>=0&&y>=0&&x<img.width&&y<img.height) img.data[y*img.width+x]=value; }
}
function rgba(img) { const data=new Uint8ClampedArray(img.width*img.height*4); for(let i=0;i<img.data.length;i++){data[i*4]=data[i*4+1]=data[i*4+2]=img.data[i];data[i*4+3]=255;} return data; }
function transformed(src, w, h, scale, tx, ty) {
  const out=image(w,h,255);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const sx=Math.round((x-tx)/scale), sy=Math.round((y-ty)/scale); if(sx>=0&&sy>=0&&sx<src.width&&sy<src.height) out.data[y*w+x]=src.data[sy*src.width+sx]; }
  return out;
}

test('Day 33: estimates local similarity transform from matching line-art features', () => {
  const ref=image(220,220);
  const shapes=[[[24,24,90,24],[90,24,90,75],[90,75,24,75],[24,75,24,24]],[[120,20,190,55],[190,55,155,100],[155,100,120,20]],[[25,120,75,180],[75,180,105,125]],[[125,125,190,125],[190,125,170,190],[170,190,125,165],[125,165,125,125]],[[45,100,100,100],[100,100,100,115]],[[130,105,180,105]]];
  for(const shape of shapes) for(const [x0,y0,x1,y1] of shape) line(ref,x0,y0,x1,y1,0);
  const cam=transformed(ref,300,300,1.15,32,28);
  const result=estimateContourAlignment(ref,cam,{maxDimension:480,maxFeatures:420,minInliers:7,minConfidence:.2});
  assert.ok(result, 'expected a transform');
  assert.ok(Math.abs(result.scale-1.15)<.12, `scale ${result.scale}`);
  assert.ok(Math.abs(result.tx-32)<12, `tx ${result.tx}`);
  assert.ok(Math.abs(result.ty-28)<12, `ty ${result.ty}`);
  assert.ok(result.inliers>=7);
});

test('Day 33: rejects blank paper with no reliable matching contours', () => {
  const blank=image(180,180,245);
  assert.equal(estimateContourAlignment(blank,blank),null);
});

test('Day 33: converts camera RGBA pixels to grayscale without mutating input', () => {
  const data=new Uint8ClampedArray([255,0,0,255,0,255,0,255]);
  const gray=rgbaToGray(data,2,1);
  assert.equal(gray.data.length,2);
  assert.ok(gray.data[1]>gray.data[0]);
  assert.deepEqual([...data],[255,0,0,255,0,255,0,255]);
});
