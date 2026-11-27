import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWhitePaperRegion, estimateContourAlignment, rgbaToGray } from '../src/day33-contour-align.ts';
import { estimateQuadrantAlignment, estimateQuadrantAlignmentDetailed, temporalMedianGray } from '../src/quadrant-alignment-engine.ts';

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


test('Day 33.2: aligns a partial drawing only when adjacent 4x4 quadrants agree', () => {
  const ref = image(360, 360, 255);
  // Four distinct neighbouring cells, each with enough local corners for BRIEF matching.
  const motifs = [
    [[96,96,164,96],[164,96,164,144],[164,144,96,144],[96,144,96,96],[96,96,145,137],[112,122,151,108],[124,98,124,145]],
    [[190,100,255,132],[255,132,215,164],[215,164,190,100],[194,143,249,110],[205,104,235,155],[190,150,258,150]],
    [[100,190,150,190],[150,190,158,236],[158,236,108,254],[108,254,100,190],[100,210,158,224],[120,192,132,248]],
    [[190,190,254,190],[254,190,254,250],[254,250,190,250],[190,250,190,190],[190,190,246,240],[202,222,244,204],[220,190,220,250]],
  ];
  for (const shape of motifs) for (const [x0,y0,x1,y1] of shape) line(ref,x0,y0,x1,y1,12);
  const scale = 1.08, tx = 24, ty = 18;
  const full = transformed(ref, 430, 430, scale, tx, ty);
  const partial = image(full.width, full.height, 255);
  // Keep the four adjacent source quadrants only; the rest of the sheet is blank.
  const sourceCells = [{x0:90,y0:90,x1:180,y1:180},{x0:180,y0:90,x1:270,y1:180},
    {x0:90,y0:180,x1:180,y1:270},{x0:180,y0:180,x1:270,y1:270}];
  for (let y=0;y<partial.height;y++) for(let x=0;x<partial.width;x++) {
    const sx=(x-tx)/scale, sy=(y-ty)/scale;
    if (sourceCells.some(cell => sx>=cell.x0 && sx<cell.x1 && sy>=cell.y0 && sy<cell.y1)) {
      partial.data[y*partial.width+x] = full.data[y*full.width+x];
    }
  }
  const result = estimateQuadrantAlignment(ref, partial, {
    maxDimension:480, maxFeatures:720, minInliers:8, minConfidence:.08,
    coarseGridSize:4, fineGridSize:6, minAdjacentQuadrants:1, overlap:.12,
  });
  assert.ok(result, 'expected neighbouring cells to agree on a single transform');
  assert.ok(result.coarseQuadrants >= 2, `coarse quadrants ${result.coarseQuadrants}`);
  assert.ok(result.fineQuadrants >= 2, `fine quadrants ${result.fineQuadrants}`);
  assert.ok(result.fineMatches > 0, '6x6 refinement should contribute local matches');
  assert.ok(result.adjacencyLinks >= 1, `adjacency links ${result.adjacencyLinks}`);
  assert.ok(Math.abs(result.scale-scale)<.10, `scale ${result.scale}`);
  assert.ok(Math.abs(result.tx-tx)<12, `tx ${result.tx}`);
  assert.ok(Math.abs(result.ty-ty)<12, `ty ${result.ty}`);
});

test('Day 33.2: rejects disconnected partial marks in distant quadrants', () => {
  const ref = image(360,360,255);
  for(const [x0,y0,x1,y1] of [[24,24,80,24],[80,24,80,80],[80,80,24,80],[24,80,24,24],
    [280,280,330,280],[330,280,330,330],[330,330,280,330],[280,330,280,280]]) line(ref,x0,y0,x1,y1,0);
  const cam = transformed(ref,380,380,1,10,10);
  // Remove everything except the two distant marked areas.
  for(let y=0;y<cam.height;y++) for(let x=0;x<cam.width;x++) {
    const sx=x-10, sy=y-10;
    const keep=(sx<100&&sy<100)||(sx>260&&sy>260);
    if(!keep) cam.data[y*cam.width+x]=255;
  }
  const result=estimateQuadrantAlignment(ref,cam,{minInliers:6,minConfidence:.05});
  assert.equal(result,null,'non-adjacent cells must not be enough to move the overlay');
});



test('Day 33.3: partial pencil marks with low contrast still produce adjacent-cell consensus', () => {
  const ref = image(360, 360, 255);
  const motifs = [
    [[96,96,164,96],[164,96,164,144],[164,144,96,144],[96,144,96,96],[96,96,145,137],[112,122,151,108],[124,98,124,145]],
    [[190,100,255,132],[255,132,215,164],[215,164,190,100],[194,143,249,110],[205,104,235,155],[190,150,258,150]],
    [[100,190,150,190],[150,190,158,236],[158,236,108,254],[108,254,100,190],[100,210,158,224],[120,192,132,248]],
    [[190,190,254,190],[254,190,254,250],[254,250,190,250],[190,250,190,190],[190,190,246,240],[202,222,244,204],[220,190,220,250]],
  ];
  for (const shape of motifs) for (const [x0,y0,x1,y1] of shape) line(ref,x0,y0,x1,y1,18);
  const scale = 1.06, tx = 22, ty = 17;
  const complete = transformed(ref, 420, 420, scale, tx, ty);
  const partial = image(420,420,248);
  const cells = [{x0:90,y0:90,x1:180,y1:180},{x0:180,y0:90,x1:270,y1:180},
    {x0:90,y0:180,x1:180,y1:270},{x0:180,y0:180,x1:270,y1:270}];
  for(let y=0;y<partial.height;y++) for(let x=0;x<partial.width;x++) {
    const sx=(x-tx)/scale, sy=(y-ty)/scale;
    if(cells.some(c=>sx>=c.x0&&sx<c.x1&&sy>=c.y0&&sy<c.y1)) {
      const source=complete.data[y*complete.width+x];
      partial.data[y*partial.width+x]=source<128?218:248;
    }
  }
  // Add small sensor/lighting fluctuations without changing the persistent strokes.
  for(let i=0;i<partial.data.length;i++) if(partial.data[i]===248) partial.data[i]=247+(i%3);
  const attempt=estimateQuadrantAlignmentDetailed(ref,partial,{minInliers:6,minConfidence:.035,maxFeatures:900});
  assert.ok(attempt.alignment, `expected low-contrast pencil consensus, got ${JSON.stringify(attempt.diagnostics)}`);
  assert.ok(attempt.alignment.coarseQuadrants>=2);
  assert.ok(Math.abs(attempt.alignment.scale-scale)<.12);
  assert.ok(Math.abs(attempt.alignment.tx-tx)<14);
  assert.ok(Math.abs(attempt.alignment.ty-ty)<14);
});

test('Day 33.3: detailed diagnostics identify blank-paper failure instead of hiding it as no-consensus', () => {
  const blank=image(180,180,248);
  const attempt=estimateQuadrantAlignmentDetailed(blank,blank);
  assert.equal(attempt.alignment,null);
  assert.equal(attempt.diagnostics.reason,'few-features');
  assert.equal(attempt.diagnostics.referenceFeatures,0);
});

test('Day 33.2: temporal median keeps persistent pencil strokes and removes one-frame noise', () => {
  const frames = Array.from({length:5},()=>image(8,8,245));
  // Persistent light graphite line in all five samples.
  for(const frame of frames) frame.data[3*8+4]=205;
  // A transient dark reflection/noise exists in only one frame.
  frames[0].data[5*8+5]=0;
  const median=temporalMedianGray(frames);
  assert.equal(median.data[3*8+4],205);
  assert.equal(median.data[5*8+5],245);
});
