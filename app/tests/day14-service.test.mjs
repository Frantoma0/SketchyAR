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
const { restoreVerifiedToDB, mergeVerifiedToDB }=require(join(dir,'storage/day14-backup-service.js'));
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


// Day 15 regression tests use the REAL restore service with a deterministic,
// transactional IDB mock. Never touch an actual browser or user's projects.
test('Day15: collision on assets/presets/settings refuses the entire import', async () => {
  const verified = await verifyBackup(archive(fixture()));
  for (const [name, row] of [
    ['assets', verified.assets[1]],
    ['overlay_presets', verified.manifest.presets[0]],
    ['app_settings', verified.manifest.settings[0]],
  ]) {
    const existing = { [name]: [structuredClone(row)] };
    const db = new MockIDB(existing);
    const before = ['projects','assets','overlay_presets','app_settings'].map(store=>db.count(store));
    await assert.rejects(() => restoreVerifiedToDB(db, verified), /ID конфликт/);
    assert.deepEqual(['projects','assets','overlay_presets','app_settings'].map(store=>db.count(store)), before, name);
  }
});
test('Day15: repeated full restore rejects duplicates and leaves the first import intact', async () => {
  const verified = await verifyBackup(archive(fixture()));
  const db = new MockIDB();
  await restoreVerifiedToDB(db, verified);
  const before = ['projects','assets','overlay_presets','app_settings'].map(store=>db.count(store));
  await assert.rejects(() => restoreVerifiedToDB(db, verified), /ID конфликт/);
  assert.deepEqual(['projects','assets','overlay_presets','app_settings'].map(store=>db.count(store)),before);
});
test('Day15: every simulated storage quota failure aborts all four stores', async () => {
  const verified = await verifyBackup(archive(fixture()));
  const totalWrites = verified.manifest.projects.length + verified.assets.length +
    verified.manifest.presets.length + verified.manifest.settings.length;
  for (let failAt = 1; failAt <= totalWrites; failAt++) {
    const db = new MockIDB({}, failAt);
    await assert.rejects(() => restoreVerifiedToDB(db, verified), /quota/);
    assert.deepEqual(['projects','assets','overlay_presets','app_settings'].map(store=>db.count(store)),
      [0,0,0,0],`quota failed write ${failAt}`);
  }
});
test('Day15: duplicate metadata IDs are rejected before database transaction', async () => {
  const m = fixture();
  m.projects.push(structuredClone(m.projects[0]));
  await assert.rejects(() => verifyBackup(archive(m)), /Duplicate projects/);
});

// Day16.1 safe additive merge: same ZIP can be selected repeatedly without
// deleting any real project. No mocking of the planner: call production writer.
test('Day16.1: merge inserts missing project with full dependency group',async()=>{
  const verified=await verifyBackup(archive(fixture()));
  const other={...verified.manifest.projects[0],id:'00000000-0000-4000-8000-000000000099'};
  const db=new MockIDB({projects:[other]});
  const result=await mergeVerifiedToDB(db,verified);
  assert.deepEqual(result.projectIds,[ID]);
  assert.equal(result.assetIds.length,3); assert.equal(result.presetIds.length,1);
  assert.deepEqual(['projects','assets','overlay_presets','app_settings'].map(x=>db.count(x)),[2,3,1,1]);
  assert.deepEqual(db.data.get('projects').get(other.id),other);
});
test('Day16.1: repeated merge is a no-op, does not overwrite edited project or preset',async()=>{
  const verified=await verifyBackup(archive(fixture()));
  const db=new MockIDB();
  await mergeVerifiedToDB(db,verified);
  db.data.get('projects').get(ID).title='Локално редактирано заглавие';
  db.data.get('overlay_presets').get(PRESET).opacityPercent=93;
  const result=await mergeVerifiedToDB(db,verified);
  assert.equal(result.canRestore,false); assert.equal(result.alreadyPresentProjects,1);
  assert.equal(db.data.get('projects').get(ID).title,'Локално редактирано заглавие');
  assert.equal(db.data.get('overlay_presets').get(PRESET).opacityPercent,93);
  assert.deepEqual(['projects','assets','overlay_presets','app_settings'].map(x=>db.count(x)),[1,3,1,1]);
});
test('Day16.1: existing project prevents orphaned partial asset/preset restoration',async()=>{
  const verified=await verifyBackup(archive(fixture()));
  const db=new MockIDB({projects:[verified.manifest.projects[0]]});
  const result=await mergeVerifiedToDB(db,verified);
  assert.equal(result.canRestore,false);
  assert.deepEqual(['projects','assets','overlay_presets','app_settings'].map(x=>db.count(x)),[1,0,0,0]);
});
test('Day16.1: asset and preset collisions block new project as whole, without mutation',async()=>{
  const verified=await verifyBackup(archive(fixture()));
  for(const [name,row] of [['assets',verified.assets[0]],['overlay_presets',verified.manifest.presets[0]],
    ['app_settings',verified.manifest.settings[0]]]){
    const db=new MockIDB({[name]:[row]});
    const result=await mergeVerifiedToDB(db,verified);
    assert.equal(result.blockedNewProjects,1,name);
    assert.equal(result.canRestore,false);
    assert.equal(db.count('projects'),0,name);
    assert.equal(db.count(name),1,name);
  }
});
test('Day16.1: previously present global setting stays unchanged on merge',async()=>{
  const verified=await verifyBackup(archive(fixture()));
  const old={key:'sketchyar:ui-preference',value:'mine',updatedAt:date};
  verified.manifest.settings.push({...old,value:'older-archive'});
  const db=new MockIDB({app_settings:[old]});
  const result=await mergeVerifiedToDB(db,verified);
  assert.equal(result.projectIds.length,1);
  assert.equal(db.data.get('app_settings').get(old.key).value,'mine');
  assert.equal(db.count('app_settings'),2); // global existing + source hash baseline
});
test('Day16.1: quota failure rolls back all selected merge rows',async()=>{
  const verified=await verifyBackup(archive(fixture()));
  const existing={id:'00000000-0000-4000-8000-000000000099',title:'Keep'};
  const db=new MockIDB({projects:[existing]},3);
  await assert.rejects(()=>mergeVerifiedToDB(db,verified),/quota/);
  assert.deepEqual(['projects','assets','overlay_presets','app_settings'].map(x=>db.count(x)),[1,0,0,0]);
  assert.equal(db.data.get('projects').get(existing.id).title,'Keep');
});

test('Day16.1: archive with 2 projects adds ONLY missing second project and its children',async()=>{
  const m=fixture();
  const replacements=new Map([[ID,'00000000-0000-4000-8000-000000000010'],
    [SRC,'00000000-0000-4000-8000-000000000011'],
    [THUMB,'00000000-0000-4000-8000-000000000012'],
    [PROCESSED,'00000000-0000-4000-8000-000000000013'],
    [PRESET,'00000000-0000-4000-8000-000000000014']]);
  const two=structuredClone(fixture());
  const replacement=(s)=>typeof s==='string'?(replacements.get(s)??s):s;
  const p=structuredClone(m.projects[0]);p.id=replacement(p.id);p.activeAssetId=replacement(p.activeAssetId);
  const moreAssets=m.assets.map(a=>({...a,id:replacement(a.id),projectId:replacement(a.projectId),
    ...(a.sourceAssetId?{sourceAssetId:replacement(a.sourceAssetId)}:{}),
    path:a.path.replace(a.id,replacement(a.id))}));
  const morePreset={...m.presets[0],id:replacement(PRESET),projectId:p.id,assetId:replacement(SRC)};
  two.projects.push(p); two.assets.push(...moreAssets);two.presets.push(morePreset);
  two.settings.push({...m.settings[0],key:`day5-source-sha256:${replacement(SRC)}`});
  const allBytes={...bytes};for(const [key,value] of Object.entries(bytes))allBytes[replacement(key)]=value;
  const verified=await verifyBackup(archive(two,allBytes));
  const firstRows={projects:[verified.manifest.projects[0]],
    assets:verified.assets.filter(a=>a.projectId===ID),
    overlay_presets:[verified.manifest.presets[0]],
    app_settings:[verified.manifest.settings[0]]};
  firstRows.projects[0]={...firstRows.projects[0],title:'New local project title'};
  const db=new MockIDB(firstRows);
  const result=await mergeVerifiedToDB(db,verified);
  assert.deepEqual(result.projectIds,[p.id]);
  assert.equal(result.alreadyPresentProjects,1);assert.equal(result.blockedNewProjects,0);
  assert.equal(result.assetIds.length,3);assert.equal(result.presetIds.length,1);
  assert.deepEqual(['projects','assets','overlay_presets','app_settings'].map(x=>db.count(x)),[2,6,2,2]);
  assert.equal(db.data.get('projects').get(ID).title,'New local project title');
});

test('Day23: selected processed pointer survives backup-v1 ZIP Verify', async () => {
  const m=fixture(); m.projects[0].selectedProcessedAssetId=PROCESSED;
  const verified=await verifyBackup(archive(m));
  assert.equal(verified.manifest.projects[0].selectedProcessedAssetId,PROCESSED);
  assert.equal(verified.assets.find(a=>a.id===PROCESSED).sourceAssetId,SRC);
});
test('Day23: backup-v1 refuses a missing or mismatched selected processed asset', async () => {
  const missing=fixture(); missing.projects[0].selectedProcessedAssetId='00000000-0000-4000-8000-000000000099';
  await assert.rejects(()=>verifyBackup(archive(missing)),/selected processed asset/);
  const wrong=fixture(); wrong.projects[0].selectedProcessedAssetId=THUMB;
  await assert.rejects(()=>verifyBackup(archive(wrong)),/selected processed asset/);
  const invalid=fixture(); invalid.projects[0].selectedProcessedAssetId='not-an-uuid';
  await assert.rejects(()=>verifyBackup(archive(invalid)),/project record/);
});

test('G23.1: editor style survives ZIP v1 verify; explicitly none is different from absent', async()=>{
  for (const editorStyle of ['sketch','manga','comic',null]) {
    const m=fixture();
    m.projects[0].editorStyle=editorStyle;
    const checked=await verifyBackup(archive(m));
    assert.equal(checked.manifest.projects[0].editorStyle,editorStyle);
    assert.equal(checked.manifest.projects[0].activeAssetId,SRC);
  }
  const legacy=await verifyBackup(archive(fixture()));
  assert.equal(legacy.manifest.projects[0].editorStyle,undefined);
});
test('G23.1: backup rejects forged editor profile without touching original data', async()=>{
  for (const editorStyle of ['other',22,{},false]) {
    const m=fixture();m.projects[0].editorStyle=editorStyle;
    await assert.rejects(()=>verifyBackup(archive(m)),/Невалиден project record/);
  }
});
