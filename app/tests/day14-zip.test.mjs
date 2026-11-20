/** Run with: node --experimental-strip-types --test app/tests/day14-zip.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, makeStoredZip, parseStoredZip, ZIP_LIMITS } from '../src/storage/day14-zip.ts';
const encode = (text) => new TextEncoder().encode(text);
const ID = '00000000-0000-4000-8000-000000000001';
function zip(entries) { return makeStoredZip(entries.map(([name, string]) => {
  const bytes = encode(string);
  return {name, blob:new Blob([bytes]), crc:crc32(bytes)};
})); }
const files = [['manifest.json','{"hello":true}'],[`assets/${ID}.png`,'PNG SMOKE']];
test('CRC-32 known vector', () => assert.equal(crc32(encode('123456789')), 0xcbf43926));
test('ZIP roundtrip with independent CRC checks', async () => {
  const map = parseStoredZip(new Uint8Array(await zip(files).arrayBuffer()));
  assert.equal(new TextDecoder().decode(map.get('manifest.json').data),'{"hello":true}');
  assert.equal(map.size,2);
});
test('reject unsafe entry paths and duplicates at export', () => {
  for (const name of ['../../bad.txt','/etc/passwd','assets/../manifest.json','manifest.json/'])
    assert.throws(()=>zip([['manifest.json','ok'],[name,'bad']]),/unsafe/);
  assert.throws(()=>zip([['manifest.json','a'],['manifest.json','b']]),/duplicate/);
});
test('reject changes and forged size before extraction', async () => {
  const bytes = new Uint8Array(await zip(files).arrayBuffer());
  const corrupted = Uint8Array.from(bytes);
  corrupted[45] ^= 1;
  assert.throws(()=>parseStoredZip(corrupted),/CRC/);
  const inflated = Uint8Array.from(bytes);
  const view = new DataView(inflated.buffer);
  view.setUint32(22,0xffffffff,true); // forged local entry raw length
  assert.throws(()=>parseStoredZip(inflated),/header mismatch/);
});
test('reject ZIP comments, ZIP64 and unsupported compression', async () => {
  const bytes = new Uint8Array(await zip(files).arrayBuffer());
  const eocd = Uint8Array.from(bytes);
  new DataView(eocd.buffer).setUint16(eocd.length-2,1,true);
  assert.throws(()=>parseStoredZip(eocd),/EOCD/);
  const unsupported = Uint8Array.from(bytes);
  new DataView(unsupported.buffer).setUint16(8,8,true);
  assert.throws(()=>parseStoredZip(unsupported),/local\/central|mismatch/);
  assert.throws(()=>makeStoredZip([{name:'manifest.json',blob:new Blob([new Uint8Array(ZIP_LIMITS.maxManifestBytes+1)]),crc:0}]),/limit/);
});
