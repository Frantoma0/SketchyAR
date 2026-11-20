/** Run via npm run test:day14. Isolated CJS transpilation allows verifying the real service
 * without bundling Vite, IndexedDB, or private user data into the test environment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, webcrypto } from 'node:crypto';
const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL('..',import.meta.url)));
const dir = mkdtempSync(join(tmpdir(),'sketchyar-day14-'));
const tsc = join(root,'node_modules','typescript','bin','tsc');
const tscBin = existsSync(tsc) ? process.execPath : 'tsc';
const tscPrefix = tscBin === process.execPath ? [tsc] : [];
const version = execFileSync(tscBin,[...tscPrefix,'--version'],{encoding:'utf8'});
const tsMajor = Number(version.match(/\b(\d+)\.\d+/)?.[1]);
if (!Number.isInteger(tsMajor) || tsMajor < 5) {
  throw new Error(`Unsupported TypeScript compiler: ${version.trim()}`);
}
// TypeScript 6+ requires --ignoreConfig with explicit input files; TypeScript 7
// also removes moduleResolution=node. Bundler + CommonJS is supported since TS6.
const args = [...tscPrefix, ...(tsMajor >= 6 ? ['--ignoreConfig'] : []), '--module','commonjs',
  '--moduleResolution',tsMajor >= 6 ? 'bundler' : 'node',
  '--target','es2022','--lib','es2022,dom,dom.iterable',
  '--skipLibCheck','--strict','--outDir',dir,
  join(root,'src/storage/day14-backup-service.ts'),join(root,'src/vite-env.d.ts')];
try { execFileSync(tscBin,args,{stdio:'pipe'}); }
catch (e) { console.error(String(e.stdout??'')+String(e.stderr??'')); throw e; }
writeFileSync(join(dir,'package.json'),'{"type":"commonjs"}');
const { verifyBackup, normalizeBackupManifestOptionals }=require(join(dir,'storage/day14-backup-service.js'));
const { crc32,makeStoredZip }=require(join(dir,'storage/day14-zip.js'));
const ID = '00000000-0000-4000-8000-000000000001';
const SRC = '00000000-0000-4000-8000-000000000002';
const THUMB = '00000000-0000-4000-8000-000000000003';
const PROCESSED = '00000000-0000-4000-8000-000000000004';
const PRESET = '00000000-0000-4000-8000-000000000005';
const date='2026-11-20T00:00:00.000Z';
const enc = new TextEncoder();
const bytes = { [SRC]:enc.encode('source image bytes'), [THUMB]:enc.encode('thumbnail jpeg bytes'),
  [PROCESSED]:enc.encode('generated transparent png bytes') };
function metadata(id,role,mime,sourceAssetId) {
  const v=bytes[id];
  return {id,projectId:ID,role,mimeType:mime,width:10,height:10,byteSize:v.length,
    createdAt:date,path:`assets/${id}.${mime==='image/jpeg'?'jpg':'png'}`,
    sha256:createHash('sha256').update(v).digest('hex'),
    ...(sourceAssetId ? {sourceAssetId} : {}),
    ...(role==='processed'?{params:{sigma:1,low:0.04,high:0.1},pipelineVersion:'day12',modelId:'none',backend:'numpy-pyodide'}:{})};
}
function fixture() {
  return {format:'sketchyar-backup',schemaVersion:1,appVersion:'0.14.0',createdAt:date,
    projects:[{id:ID,title:'Test project',createdAt:date,updatedAt:date,activeAssetId:SRC}],
    assets:[metadata(SRC,'source','image/png'),metadata(THUMB,'thumbnail','image/jpeg',SRC),
      metadata(PROCESSED,'processed','image/png',SRC)],
    presets:[{id:PRESET,projectId:ID,assetId:SRC,name:'test',updatedAt:date,x:0,y:0,scale:1,
      rotationDeg:0,opacityPercent:50,mirroredOverlay:false,locked:false,gridEnabled:false,gridCount:3}],
    settings:[{key:`day5-source-sha256:${SRC}`,value:createHash('sha256').update(bytes[SRC]).digest('hex'),updatedAt:date}],
    integrity:{algorithm:'SHA-256'}};
}
function archive(m, data=bytes) {
  const entries = [['manifest.json',enc.encode(JSON.stringify(m))],
    ...m.assets.filter(a=>data[a.id]).map(a=>[a.path,data[a.id]])];
  return makeStoredZip(entries.map(([name,bytes])=>({name,blob:new Blob([bytes]),crc:crc32(bytes)})));
}
test('Day 14: undefined optional fields from IndexedDB are JSON-safe without changing source records',async()=>{
  const m=fixture();
  m.projects[0].guide=undefined; // replaceProjectSource legacy behavior
  m.projects[0].lastOpenedAt=undefined;
  m.assets[0].params=undefined;
  m.assets[0].modelId=undefined;
  m.presets[0].sceneHeight=undefined;
  const original=m.projects[0];
  const normalized=normalizeBackupManifestOptionals(m);
  assert.equal(Object.hasOwn(original,'guide'),true,'source object is not mutated');
  assert.equal(Object.hasOwn(normalized.projects[0],'guide'),false);
  assert.equal(Object.hasOwn(normalized.projects[0],'lastOpenedAt'),false);
  assert.equal(Object.hasOwn(normalized.assets[0],'params'),false);
  assert.equal(Object.hasOwn(normalized.assets[0],'modelId'),false);
  assert.equal(Object.hasOwn(normalized.presets[0],'sceneHeight'),false);
  assert.equal(normalized.projects[0].activeAssetId,SRC);
  assert.equal(normalized.assets[0].id,SRC);
  assert.equal(normalized.presets[0].opacityPercent,50);
  const verified=await verifyBackup(archive(normalized));
  assert.equal(verified.assets.length,3);
});

test('independent verify: real manifest, 3 assets, settings and provenance', async()=>{
  globalThis.crypto ??= webcrypto;
  const ok=await verifyBackup(archive(fixture()));
  assert.equal(ok.assets.length,3);
  assert.equal(ok.manifest.presets.length,1);
  assert.equal(ok.assets.find(a=>a.id===PROCESSED).params.sigma,1);
  assert.equal(ok.assets.find(a=>a.id===SRC).hashSha256,ok.manifest.assets[0].sha256);
});
test('valid CRC but wrong SHA-256 is rejected', async()=>{
  const m=fixture(); m.assets[0].sha256='0'.repeat(64);
  await assert.rejects(()=>verifyBackup(archive(m)),/SHA-256 mismatch/);
});
test('missing member, broken ownership and wrong path rejected', async()=>{
  const m=fixture(); const missing={...bytes}; delete missing[THUMB];
  await assert.rejects(()=>verifyBackup(archive(m,missing)),/missing|липсващи|липсващ/i);
  const owner=fixture(); owner.assets[1].projectId=SRC;
  await assert.rejects(()=>verifyBackup(archive(owner)),/Invalid asset provenance/i);
  const path=fixture(); path.assets[0].path=`assets/${SRC}.webp`;
  await assert.rejects(()=>verifyBackup(archive(path)),/manifest record/i);
});
test('invalid stored SHA baseline is rejected',async()=>{
  const m=fixture(); m.settings[0].value='0'.repeat(64);
  await assert.rejects(()=>verifyBackup(archive(m)),/baseline SHA-256/);
});
process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));

// An asynchronous, transactional IndexedDB stand-in for exercising the writer's
// collision and rollback logic. The real WebKit implementation still needs G2.
const { restoreVerifiedToDB }=require(join(dir,'storage/day14-backup-service.js'));
class MockIDB {
  constructor(existing={},failAt=Infinity) {
    this.data=new Map(['projects','assets','overlay_presets','app_settings'].map(name =>
      [name,new Map((existing[name]??[]).map(row=>[name==='app_settings'?row.key:row.id,row]))]));
    this.failAt=failAt;
  }
  transaction(names) {
    const db=this;
    const draft=new Map(names.map(name=>[name,new Map(db.data.get(name))]));
    let pending=0, aborted=false, finished=false, writes=0, finishTimer=null;
    const tx={oncomplete:null,onabort:null,error:null,
      abort(){ if (aborted||finished)return; aborted=true;
        if(finishTimer)clearTimeout(finishTimer);
        setTimeout(()=>tx.onabort?.(),0); },
      objectStore(name){
        return {
          getAllKeys(){ return request(()=>Array.from(draft.get(name).keys())); },
          add(row){ return request(()=>{
            const key=name==='app_settings'?row.key:row.id;
            if(draft.get(name).has(key))throw Error('duplicate');
            if(++writes===db.failAt)throw Error('quota');
            draft.get(name).set(key,structuredClone(row));
            return key;
          }); },
        };
      },
    };
    function maybeFinish(){
      if (pending===0&&!aborted&&!finished){
        finishTimer=setTimeout(()=>{
          if(pending || aborted || finished)return;
          finished=true; for(const [name,values] of draft)db.data.set(name,values);
          tx.oncomplete?.();
        },0);
      }
    }
    function request(op){
      pending++;
      const req={result:undefined,error:null,onsuccess:null,onerror:null};
      setTimeout(()=>{
        if(aborted)return;
        try {req.result=op(); req.onsuccess?.();}
        catch(e){req.error=e; tx.error=e; req.onerror?.(); tx.abort();}
        pending--; maybeFinish();
      },0);
      return req;
    }
    return tx;
  }
  count(name){return this.data.get(name).size;}
}
test('restore writer inserts all four stores atomically',async()=>{
  const verified=await verifyBackup(archive(fixture()));
  const db=new MockIDB();
  await restoreVerifiedToDB(db,verified);
  assert.deepEqual(['projects','assets','overlay_presets','app_settings'].map(x=>db.count(x)),[1,3,1,1]);
});
test('restore writer refuses ID collisions with zero mutations',async()=>{
  const verified=await verifyBackup(archive(fixture()));
  const db=new MockIDB({projects:[verified.manifest.projects[0]]});
  await assert.rejects(()=>restoreVerifiedToDB(db,verified),/ID конфликт/);
  assert.deepEqual(['projects','assets','overlay_presets','app_settings'].map(x=>db.count(x)),[1,0,0,0]);
});
test('transaction abort rolls back all staged writes on quota error',async()=>{
  const verified=await verifyBackup(archive(fixture()));
  const db=new MockIDB({},3);
  await assert.rejects(()=>restoreVerifiedToDB(db,verified),/quota/);
  assert.deepEqual(['projects','assets','overlay_presets','app_settings'].map(x=>db.count(x)),[0,0,0,0]);
});
