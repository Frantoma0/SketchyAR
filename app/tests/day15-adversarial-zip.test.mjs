/** Day 15: malicious/invalid ZIP probes. No decompression or disk writes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, makeStoredZip, parseStoredZip, ZIP_LIMITS } from '../src/storage/day14-zip.ts';
const bytes = s => new TextEncoder().encode(s);
const ID='00000000-0000-4000-8000-000000000001';
function make() {
  const items=[['manifest.json',bytes('{"schemaVersion":1}')],
    [`assets/${ID}.png`,bytes('fake content for unsafe-archive probes')]];
  return makeStoredZip(items.map(([name,data])=>({name,blob:new Blob([data]),crc:crc32(data)})));
}
async function raw(){return new Uint8Array(await make().arrayBuffer());}
const v = data=>new DataView(data.buffer,data.byteOffset,data.byteLength);
test('Day15: truncated archive and trailing garbage rejected',async()=>{
  const original=await raw();
  assert.throws(()=>parseStoredZip(original.slice(0,-1)),/EOCD|archive length/);
  const extended=new Uint8Array(original.length+1);extended.set(original);
  assert.throws(()=>parseStoredZip(extended),/EOCD/);
});
test('Day15: path traversal rejected even with matching local and central names',async()=>{
  const bad=await raw();
  // Replacement has the same byte width as manifest.json (13 bytes).
  const evil=bytes('../attack.dat');
  assert.equal(evil.length,13);
  bad.set(evil,30); // first local entry name
  const dirOffset=v(bad).getUint32(bad.length-22+16,true);
  bad.set(evil,dirOffset+46); // first central entry name
  assert.throws(()=>parseStoredZip(bad),/unrecognized path|unsafe/);
});
test('Day15: aliased/overlapping payload is rejected without writes',async()=>{
  const bad=await raw(), view=v(bad);
  const dirOffset=view.getUint32(bad.length-22+16,true);
  const firstNameLength=view.getUint16(dirOffset+28,true);
  const second=dirOffset+46+firstNameLength;
  view.setUint32(second+42,0,true); // point second central entry to first local payload
  assert.throws(()=>parseStoredZip(bad),/local\/central|mismatch/);
});
test('Day15: forbidden data descriptor / encryption bits rejected',async()=>{
  const original=await raw();
  for(const flags of [0x0001,0x0008]){
    const bad=original.slice();
    const view=v(bad),dir=view.getUint32(bad.length-22+16,true);
    view.setUint16(6,flags,true);view.setUint16(dir+8,flags,true);
    assert.throws(()=>parseStoredZip(bad),/unsafe|unsupported/);
  }
});
test('Day15: declared ZIP bomb / ZIP64 length rejected before any inflate',async()=>{
  const bad=await raw(),view=v(bad),dir=view.getUint32(bad.length-22+16,true);
  view.setUint32(dir+24,0xffffffff,true);
  assert.throws(()=>parseStoredZip(bad),/unsupported|unsafe/);
  const deflate=await raw(),dv=v(deflate),d=dv.getUint32(deflate.length-22+16,true);
  dv.setUint16(8,8,true);dv.setUint16(d+10,8,true);
  assert.throws(()=>parseStoredZip(deflate),/unsupported|unsafe/);
});
test('Day15: raw byte corruption with unchanged CRC rejected',async()=>{
  const bad=await raw();
  bad[30+'manifest.json'.length+3]^=1;
  assert.throws(()=>parseStoredZip(bad),/CRC/);
});
test('Day15: oversized manifest refused at ZIP creation',()=>{
  assert.throws(()=>makeStoredZip([{name:'manifest.json',
    blob:new Blob([new Uint8Array(ZIP_LIMITS.maxManifestBytes+1)]),crc:0}]),/size limit/);
});
