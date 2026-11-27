import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWhitePaperRegion, estimateContourAlignment, rgbaToGray } from '../src/day33-contour-align.ts';

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


test('Day 33: rescales similarity correctly when reference and camera canvas resolutions differ', () => {
  // The downscaled reference and camera contain exactly the same line art.
  // In original coordinates, the 480 px camera corresponds to 640 px source.
  const small=image(480,480);
  const shapes=[
    [[35,35,180,35],[180,35,180,150],[180,150,35,150],[35,150,35,35]],
    [[250,30,430,115],[430,115,365,235],[365,235,250,30]],
    [[50,260,150,420],[150,420,220,265]],
    [[280,280,430,280],[430,280,400,430],[400,430,280,365],[280,365,280,280]],
    [[85,190,205,190],[205,190,205,230]],
  ];
  for(const shape of shapes) for(const [x0,y0,x1,y1] of shape) line(small,x0,y0,x1,y1,0);
  const ref=image(640,640);
  for(let y=0;y<480;y++) for(let x=0;x<480;x++) {
    ref.data[Math.round(y/.75)*640+Math.round(x/.75)]=small.data[y*480+x];
  }
  const result=estimateContourAlignment(ref,small,{maxDimension:480,maxFeatures:700,minInliers:7,minConfidence:.2});
  assert.ok(result, 'expected a transform across unequal image resolutions');
  assert.ok(Math.abs(result.scale-.75)<.02, `scale ${result.scale}`);
  assert.ok(Math.abs(result.tx)<2, `tx ${result.tx}`);
  assert.ok(Math.abs(result.ty)<2, `ty ${result.ty}`);
});

test('Day 33: detects the white sheet region and excludes its dark surroundings', () => {
  const w=240, h=180;
  const pixels=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const p=(y*w+x)*4;
    const inside=x>=35&&x<205&&y>=22&&y<158;
    const shade=inside?246:42;
    pixels[p]=shade; pixels[p+1]=inside?244:48; pixels[p+2]=inside?238:54; pixels[p+3]=255;
  }
  // A dark drawn line should not break the sheet into separate regions.
  for(let x=65;x<175;x++) {
    const y=70+Math.round((x-65)*.35), p=(y*w+x)*4;
    pixels[p]=pixels[p+1]=pixels[p+2]=42;
  }
  const region=detectWhitePaperRegion(pixels,w,h);
  assert.ok(region, 'expected a paper region');
  assert.ok(region.x>=35 && region.y>=22);
  assert.ok(region.x+region.width<=205 && region.y+region.height<=158);
  assert.ok(region.width>130 && region.height>100);
});

test('Day 33: refuses a uniformly bright frame instead of treating the whole scene as paper', () => {
  const blank=image(180,180,248);
  assert.equal(detectWhitePaperRegion(rgba(blank),blank.width,blank.height),null);
});


test('Day 33: end-to-end sheet crop excludes the dark scene and aligns line art on the page', () => {
  const reference=image(174,174);
  const shapes=[
    [[18,18,70,18],[70,18,70,58],[70,58,18,58],[18,58,18,18]],
    [[96,16,150,42],[150,42,128,80],[128,80,96,16]],
    [[18,96,58,145],[58,145,85,100]],
    [[98,100,150,100],[150,100,140,150],[140,150,98,126],[98,126,98,100]],
    [[40,75,90,75],[90,75,90,85]],
  ];
  for(const shape of shapes) for(const [x0,y0,x1,y1] of shape) line(reference,x0,y0,x1,y1,0);
  const w=240,h=240, pixels=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const inside=x>=30&&x<210&&y>=30&&y<210, shade=inside?246:40, p=(y*w+x)*4;
    pixels[p]=pixels[p+1]=pixels[p+2]=shade; pixels[p+3]=255;
  }
  // Place the complete line art inside a white sheet at the same scale.
  for(let y=0;y<174;y++) for(let x=0;x<174;x++) {
    const shade=reference.data[y*174+x], p=((y+33)*w+(x+33))*4;
    pixels[p]=pixels[p+1]=pixels[p+2]=shade;
  }
  const region=detectWhitePaperRegion(pixels,w,h);
  assert.ok(region, 'expected a separately detected sheet');
  const cropped=new Uint8Array(region.width*region.height);
  for(let y=0;y<region.height;y++) for(let x=0;x<region.width;x++) {
    const p=((region.y+y)*w+(region.x+x))*4;
    cropped[y*region.width+x]=Math.round(.299*pixels[p]+.587*pixels[p+1]+.114*pixels[p+2]);
  }
  const match=estimateContourAlignment(reference,{width:region.width,height:region.height,data:cropped},{minInliers:8,minConfidence:.25});
  assert.ok(match, 'expected line art to align after isolating the paper');
  assert.ok(Math.abs(match.scale-1)<.05);
  assert.ok(Math.abs(match.tx)<3 && Math.abs(match.ty)<3);
});
