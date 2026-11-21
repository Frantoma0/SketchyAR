/** G23.1 — run the REAL project-store functions against a transactional IndexedDB stand-in.
 * Covers chosen mode, preview persistence, Original draw and rollback without changing real data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const app = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'sketchyar-23-1-'));
const tsc = resolve(app, 'node_modules/typescript/bin/tsc');
const cmd = existsSync(tsc) ? process.execPath : 'tsc';
const prefix = cmd === process.execPath ? [tsc] : [];
const version = Number(execFileSync(cmd, [...prefix, '--version'], {encoding:'utf8'}).match(/\d+/)?.[0]);
const args = [...prefix, ...(version>=6?['--ignoreConfig']:[]), '--module','commonjs',
  '--moduleResolution',version>=6?'bundler':'node', '--target','es2022',
  '--lib','es2022,dom,dom.iterable', '--skipLibCheck', '--strict', '--outDir',tmp,
  resolve(app,'src/storage/project-store.ts'), resolve(app,'src/storage/day13-processed.ts')];
try { execFileSync(cmd,args,{stdio:'pipe'}); }
catch(error){console.error(String(error.stdout??'')+String(error.stderr??''));throw error;}
writeFileSync(join(tmp,'package.json'),'{"type":"commonjs"}');
const ID='00000000-0000-4000-8000-000000000011';
const SRC='00000000-0000-4000-8000-000000000012';
const DER='00000000-0000-4000-8000-000000000013';
const T='2026-11-21T00:00:00.000Z';
class Database {
  constructor(failWrite=Infinity) {
    this.data = {
      projects: new Map([[ID,{id:ID,title:'Test',createdAt:T,updatedAt:T,activeAssetId:SRC}]]),
      assets: new Map([[SRC,{id:SRC,projectId:ID,role:'source',mimeType:'image/jpeg',
        blob:new Blob(['source'],{type:'image/jpeg'}),byteSize:6,width:32,height:32,createdAt:T}]]),
      overlay_presets: new Map(),app_settings:new Map(),
    };
    this.failWrite=failWrite;
  }
  transaction(storeNames) {
    const names=Array.isArray(storeNames)?storeNames:[storeNames];
    const draft=Object.fromEntries(names.map(n=>[n,new Map(this.data[n])]));
    const db=this;
    let pending=0,aborted=false,finished=false,writeCount=0,ending=null;
    const tx={oncomplete:null,onabort:null,onerror:null,error:null,
      abort(){if(aborted||finished)return;aborted=true;if(ending)clearTimeout(ending);
        setTimeout(()=>tx.onabort?.(),0);},
      objectStore(name){
        if(!draft[name])throw new Error(`Unknown store ${name}`);
        const rows=draft[name];
        const keyOf=x=>name==='app_settings'?x.key:x.id;
        return {
          get(key){return request(()=>structuredClone(rows.get(key)));},
          getAll(){return request(()=>[...rows.values()].map(x=>structuredClone(x)));},
          put(value){return request(()=>{if(++writeCount===db.failWrite)throw Error('QuotaExceededError');
            rows.set(keyOf(value),structuredClone(value));return keyOf(value);});},
          add(value){return request(()=>{if(rows.has(keyOf(value)))throw Error('Duplicate key');
            if(++writeCount===db.failWrite)throw Error('QuotaExceededError');
            rows.set(keyOf(value),structuredClone(value));return keyOf(value);});},
          index(indexName){return {getAll(key){return request(()=>[...rows.values()].filter(x=>{
            if(indexName==='assetId')return x.assetId===key;
            if(indexName==='byProjectRole')return x.projectId===key[0]&&x.role===key[1];
            return false;
          }).map(x=>structuredClone(x)));}};},
        };
      },
    };
    function doneIfIdle(){if(pending!==0||aborted||finished)return;
      ending=setTimeout(()=>{if(pending||aborted||finished)return;finished=true;
        for(const name of names)db.data[name]=draft[name];tx.oncomplete?.();},0);}
    function request(fn){pending++;
      const q={result:undefined,error:null,onsuccess:null,onerror:null};
      setTimeout(()=>{if(aborted)return;
        try{q.result=fn();q.onsuccess?.();}
        catch(error){q.error=error;tx.error=error;q.onerror?.();tx.abort();}
        pending--;doneIfIdle();},0);
      return q;
    }
    return tx;
  }
}
let db=new Database();
globalThis.window={indexedDB:{}};
globalThis.indexedDB={open(){const q={result:db,error:null,onsuccess:null,onerror:null,onupgradeneeded:null};
  setTimeout(()=>q.onsuccess?.(),0);return q;}};
globalThis.IDBKeyRange={only(x){return x;}};
const store=require(join(tmp,'storage/project-store.js'));
const {saveProcessedPng}=require(join(tmp,'storage/day13-processed.js'));
const png=new Blob(['real generated pixels'],{type:'image/png'});
const provenance={sourceAssetId:SRC,pipelineVersion:'sketch-v1',params:{sigma:1,low:0.04,
  high:0.1,input:'grayscale-u8',maxSide:1024},modelId:'none',backend:'numpy-pyodide'};
test.after(()=>rmSync(tmp,{recursive:true,force:true}));

test('G23.1: selecting Sketch persists editor choice, but never changes camera selection',async()=>{
  db.data.projects.set(ID,{...db.data.projects.get(ID),editorStyle:undefined});
  await store.saveProjectEditorStyle(ID,SRC,'sketch');
  const first=await store.getProjectImage(ID);
  assert.equal(first.project.editorStyle,'sketch');
  assert.equal(first.project.selectedProcessedAssetId,undefined);
  const stored=await saveProcessedPng(ID,provenance,png,64,64,false);
  assert.equal((await store.getProjectImage(ID)).project.activeAssetId,SRC);
  assert.equal((await store.getProjectImage(ID)).project.selectedProcessedAssetId,undefined);
  assert.equal((await store.getLatestProcessedPreview(ID,SRC)).id,stored.id);
});

test('G23.1: drawing with no selected mode clears only camera derivative, never image bytes',async()=>{
  const processed=await store.getLatestProcessedPreview(ID,SRC);
  await store.selectProcessedAsset(ID,SRC,processed.id);
  assert.equal((await store.getProjectImage(ID)).project.selectedProcessedAssetId,processed.id);
  await store.saveProjectEditorStyle(ID,SRC,null);
  assert.equal((await store.getProjectImage(ID)).project.editorStyle,null);
  await store.selectOriginalForDrawing(ID,SRC);
  const result=await store.getProjectImage(ID);
  assert.equal(result.project.editorStyle,null);
  assert.equal(result.project.selectedProcessedAssetId,undefined);
  assert.equal(result.project.activeAssetId,SRC);
  assert.equal((await store.getLatestProcessedPreview(ID,SRC)).id,processed.id);
  assert.equal(db.data.assets.get(SRC).blob.size,6);
});

test('G23.1: Mango/Comic choices are remembered, cannot mutate camera PNG',async()=>{
  for(const style of ['manga','comic']){
    await store.saveProjectEditorStyle(ID,SRC,style);
    assert.equal((await store.getProjectImage(ID)).project.editorStyle,style);
    assert.equal((await store.getProjectImage(ID)).project.selectedProcessedAssetId,undefined);
  }
  await assert.rejects(()=>store.saveProjectEditorStyle(ID,SRC,'malicious'),/Невалиден/);
});

test('G23.1: wrong current source rejects style update and Original draw with no writes',async()=>{
  const before=structuredClone(db.data.projects.get(ID));
  await assert.rejects(()=>store.saveProjectEditorStyle(ID,'different','sketch'),/сменен/);
  await assert.rejects(()=>store.selectOriginalForDrawing(ID,'different'),/сменен/);
  assert.deepEqual(db.data.projects.get(ID),before);
});

test('G23.1: simulated quota errors roll back editor mode and original restore',async()=>{
  // Update only fails when write attempt is made, not on read.
  db.failWrite=1;
  const before=structuredClone(db.data.projects.get(ID));
  await assert.rejects(()=>store.saveProjectEditorStyle(ID,SRC,'sketch'),/QuotaExceededError/);
  assert.deepEqual(db.data.projects.get(ID),before);
  await assert.rejects(()=>store.selectOriginalForDrawing(ID,SRC),/QuotaExceededError/);
  assert.deepEqual(db.data.projects.get(ID),before);
  db.failWrite=Infinity;
});

test('G23.1: actual editor restores saved style and source-owned preview',()=>{
  const editor=readFileSync(resolve(app,'src/day17-sketch-placeholder.ts'),'utf8');
  const appMain=readFileSync(resolve(app,'src/main.ts'),'utf8');
  assert.match(editor,/style: storedProject.editorStyle !== undefined/);
  assert.match(editor,/\(storedProject.selectedProcessedAssetId \? 'sketch' : null\)/);
  assert.match(editor,/if \(ui.style === 'sketch'\) preview.src = url/);
  assert.match(editor,/savedProcessed = processed/);
  assert.match(editor,/await saveProcessedPng\(projectId, provenance,[\s\S]*?false\)/);
  assert.match(editor,/await selectOriginalForDrawing\(projectId, sourceId\)/);
  assert.match(appMain,/day19-draw/);
});
