/** Day23 — exercise the ACTUAL saveProcessedPng writer in a transactional IndexedDB stand-in.
 * Browser/Safari persistence remains an independent acceptance gate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('..',import.meta.url));
const tmp=mkdtempSync(join(tmpdir(),'sketchyar-day23-save-'));
const local=resolve(root,'node_modules/typescript/bin/tsc');
const bin=existsSync(local)?process.execPath:'tsc';
const prefix=bin===process.execPath?[local]:[];
const major=Number(execFileSync(bin,[...prefix,'--version'],{encoding:'utf8'}).match(/\d+/)?.[0]);
const args=[...prefix,...(major>=6?['--ignoreConfig']:[]),'--module','commonjs',
  '--moduleResolution',major>=6?'bundler':'node','--target','es2022',
  '--lib','es2022,dom,dom.iterable','--strict','--skipLibCheck','--outDir',tmp,
  resolve(root,'src/storage/day13-processed.ts')];
try { execFileSync(bin,args,{stdio:'pipe'}); }
catch(e){console.error(String(e.stdout??'')+String(e.stderr??''));throw e;}
writeFileSync(join(tmp,'package.json'),'{"type":"commonjs"}');
const storePath=join(tmp,'storage/project-store.js');
const projectId='00000000-0000-4000-8000-000000000011';
const sourceId='00000000-0000-4000-8000-000000000012';
const date='2026-11-21T00:00:00.000Z';
class MockDB {
  constructor(failWrite=Infinity){
    this.rows={
      projects:new Map([[projectId,{id:projectId,title:'Sketch',createdAt:date,updatedAt:date,activeAssetId:sourceId}]]),
      assets:new Map([[sourceId,{id:sourceId,projectId,role:'source',mimeType:'image/png',blob:new Blob(['abc']),byteSize:3,width:40,height:40,createdAt:date}]]),
    };
    this.failWrite=failWrite;
  }
  transaction(names){
    const draft=Object.fromEntries(names.map(name=>[name,new Map(this.rows[name])]));
    let pending=0,aborted=false,finished=false,writes=0;
    let timer=null;
    const tx={oncomplete:null,onabort:null,error:null,
      abort(){if(aborted||finished)return;aborted=true; if(timer)clearTimeout(timer);setTimeout(()=>tx.onabort?.(),0);},
      objectStore(name){return {
        get(key){return request(()=>structuredClone(draft[name].get(key)));},
        add(row){return request(()=>{
          if(draft[name].has(row.id))throw new Error('Duplicate ID');
          if(++writes===thisDB.failWrite)throw new Error('QuotaExceededError');
          draft[name].set(row.id,structuredClone(row));return row.id;
        });},
        put(row){return request(()=>{
          if(++writes===thisDB.failWrite)throw new Error('QuotaExceededError');
          draft[name].set(row.id,structuredClone(row));return row.id;
        });},
      };},
    };
    const thisDB=this;
    function finishSoon(){
      if(pending!==0||aborted||finished)return;
      timer=setTimeout(()=>{
        if(pending||aborted||finished)return;
        finished=true;
        for(const name of names)thisDB.rows[name]=draft[name];
        tx.oncomplete?.();
      },0);
    }
    function request(work){
      ++pending;
      const q={result:undefined,error:null,onsuccess:null,onerror:null};
      setTimeout(()=>{
        if(aborted)return;
        try {q.result=work();q.onsuccess?.();}
        catch(e){q.error=e;tx.error=e;q.onerror?.();tx.abort();}
        --pending;finishSoon();
      },0);
      return q;
    }
    return tx;
  }
}
let currentDB=new MockDB();
require.cache[storePath]={id:storePath,filename:storePath,loaded:true,exports:{openProjectDB:async()=>currentDB}};
const {saveProcessedPng}=require(join(tmp,'storage/day13-processed.js'));
const prov={sourceAssetId:sourceId,pipelineVersion:'sketch-v1',params:{sigma:1,low:0.04,high:0.10,input:'grayscale-u8',maxSide:1024},modelId:'none',backend:'numpy-pyodide'};
const blob=new Blob(['generated ink PNG'],{type:'image/png'});
test.after(()=>rmSync(tmp,{recursive:true,force:true}));

test('G23: saved processed asset and selected pointer commit atomically; original intact',async()=>{
  currentDB=new MockDB();
  const before=structuredClone(currentDB.rows.assets.get(sourceId));
  const asset=await saveProcessedPng(projectId,prov,blob,128,128,true);
  const project=currentDB.rows.projects.get(projectId);
  assert.equal(project.activeAssetId,sourceId);
  assert.equal(project.selectedProcessedAssetId,asset.id);
  assert.equal(asset.role,'processed');
  assert.equal(currentDB.rows.assets.get(asset.id).sourceAssetId,sourceId);
  assert.deepEqual(currentDB.rows.assets.get(sourceId),before);
});
test('G23: legacy diagnostic PNG saving does not automatically change selected variant',async()=>{
  currentDB=new MockDB();
  const asset=await saveProcessedPng(projectId,prov,blob,128,128);
  assert.equal(currentDB.rows.assets.has(asset.id),true);
  assert.equal(currentDB.rows.projects.get(projectId).selectedProcessedAssetId,undefined);
});
test('G23: changed source aborts before writing a processed row or pointer',async()=>{
  currentDB=new MockDB();
  currentDB.rows.projects.get(projectId).activeAssetId='00000000-0000-4000-8000-000000000099';
  const beforeSize=currentDB.rows.assets.size;
  await assert.rejects(()=>saveProcessedPng(projectId,prov,blob,128,128,true),/сменени/);
  assert.equal(currentDB.rows.assets.size,beforeSize);
  assert.equal(currentDB.rows.projects.get(projectId).selectedProcessedAssetId,undefined);
});
test('G23: quota failure during project update rolls back inserted PNG',async()=>{
  currentDB=new MockDB(2); // asset add succeeds in draft; project.put fails
  await assert.rejects(()=>saveProcessedPng(projectId,prov,blob,128,128,true));
  assert.equal(currentDB.rows.assets.size,1);
  assert.equal(currentDB.rows.projects.get(projectId).activeAssetId,sourceId);
  assert.equal(currentDB.rows.projects.get(projectId).selectedProcessedAssetId,undefined);
});
