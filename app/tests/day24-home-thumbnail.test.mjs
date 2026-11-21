/** G24 — last saved Sketch/original on Home, with no source or schema mutations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = fileURLToPath(new URL('..', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'sketchyar-day24-'));
const tsc = resolve(app, 'node_modules/typescript/bin/tsc');
const cmd = existsSync(tsc) ? process.execPath : 'tsc';
const prefix = cmd === process.execPath ? [tsc] : [];
const major = Number(execFileSync(cmd, [...prefix,'--version'], {encoding:'utf8'}).match(/\d+/)?.[0]);
const args = [...prefix, ...(major >= 6 ? ['--ignoreConfig'] : []), '--module','commonjs',
  '--moduleResolution',major >= 6 ? 'bundler' : 'node', '--target','es2022',
  '--lib','es2022,dom,dom.iterable', '--skipLibCheck','--strict','--outDir',temp,
  resolve(app, 'src/storage/project-store.ts')];
try { execFileSync(cmd, args, {stdio:'pipe'}); }
catch (err) { console.error(String(err.stdout ?? '') + String(err.stderr ?? '')); throw err; }
writeFileSync(join(temp,'package.json'),'{"type":"commonjs"}');
const require = createRequire(import.meta.url);
const store = require(join(temp,'storage/project-store.js'));
test.after(() => rmSync(temp,{recursive:true,force:true}));
const P='project-A', S='original-A';
const time='2026-11-21T00:00:00.000Z';
const sourceThumbnail = {id:'thumb1',projectId:P,sourceAssetId:S,role:'thumbnail',
  blob:new Blob(['photo'],{type:'image/jpeg'}),mimeType:'image/jpeg',byteSize:5,
  createdAt:time,width:64,height:64};
function processed(id,createdAt=time, sourceAssetId=S) {
  return {id,projectId:P,sourceAssetId,role:'processed',blob:new Blob(['PNG!'],{type:'image/png'}),
    mimeType:'image/png',byteSize:4,createdAt,width:64,height:64};
}
function project(editorStyle='sketch', selectedProcessedAssetId=undefined) {
  return {id:P,title:'Test',activeAssetId:S,createdAt:time,updatedAt:time,
    editorStyle, ...(selectedProcessedAssetId ? {selectedProcessedAssetId} : {})};
}
test('G24.1: Home displays the exact Draw-applied PNG, not a newer cached draft',()=>{
  const recent=processed('new','2026-11-21T11:00:00.000Z');
  const old=processed('old','2026-11-21T10:00:00.000Z');
  assert.equal(store.selectHomeSketchPreview(project('sketch','old'),[old,recent])?.id,'old');
  assert.equal(store.selectHomeSketchPreview(project('sketch','old'),[recent,old])?.id,'old');
  assert.equal(store.selectHomeSketchPreview(project('sketch','new'),[old,recent])?.id,'new');
});
test('G24.1: switching any editor style without Draw leaves Home on Original',()=>{
  for (const mode of [null,'sketch','manga','comic']) {
    assert.equal(store.selectHomeSketchPreview(project(mode),[processed('draft')]),undefined);
  }
});
test('G24.1: legacy selected Sketch is authoritative over old preview-only editorStyle',()=>{
  const applied={...project(null),selectedProcessedAssetId:'saved-png'};
  assert.equal(store.selectHomeSketchPreview(applied,[processed('saved-png')])?.id,'saved-png');
  for (const mode of ['sketch','manga','comic',undefined]) {
    assert.equal(store.selectHomeSketchPreview({...applied,editorStyle:mode},[processed('saved-png')])?.id,'saved-png');
  }
  assert.equal(store.selectHomeSketchPreview({...applied, selectedProcessedAssetId:undefined},[processed('saved-png')]),undefined);
});
test('G24.1: reject a mismatched or invalid processed asset even if its ID was applied',()=>{
  const good=processed('good');
  const invalid=[{...good,projectId:'other-project'},
    {...good,sourceAssetId:'replaced-source'},
    {...good,mimeType:'image/jpeg'},
    {...good,byteSize:234},
    {...good,blob:new Blob([], {type:'image/png'}),byteSize:0}];
  for(const candidate of invalid) {
    assert.equal(store.selectHomeSketchPreview(project('sketch','good'),[candidate]),undefined);
  }
  assert.equal(store.selectHomeSketchPreview(project('sketch','good'),[...invalid,good])?.id,'good');
});
test('G24.1: generation alone leaves Home on its previous applied selection',()=>{
  assert.equal(store.selectHomeSketchPreview(project('sketch'),[processed('new')]),undefined);
  assert.equal(store.selectHomeSketchPreview(project(null,'prior'),[processed('new')]),undefined);
});

class FakeDb {
  constructor(rows){
    this.data={projects:new Map(rows.projects.map(p=>[p.id,p])),
      assets:new Map(rows.assets.map(a=>[a.id,a]))};
    this.writes=0;
  }
  transaction(names){
    const db=this;
    let pending=0,completeTimer;
    const tx={oncomplete:null,onabort:null,onerror:null,error:null,
      objectStore(name){
        const rows=db.data[name];
        return {
          getAll(){return request(()=>[...rows.values()].map(v=>structuredClone(v)));},
          index(indexName){return {getAll(key){return request(()=>[...rows.values()].filter(v=>{
            if(indexName==='byProjectRole')return v.projectId===key[0]&&v.role===key[1];
            return false;
          }).map(v=>structuredClone(v)));}};},
          put(){db.writes++;throw Error('Unexpected write');},
        };
      },
    };
    const request = callback => {
      pending++;
      const r={onsuccess:null,onerror:null,result:undefined,error:null};
      setTimeout(()=>{
        r.result=callback();r.onsuccess?.();pending--;
        if(!pending)completeTimer=setTimeout(()=>tx.oncomplete?.(),0);
      },0);
      return r;
    };
    return tx;
  }
}
let db;
globalThis.window={indexedDB:{}};
globalThis.indexedDB={open(){const r={result:db,error:null,onsuccess:null,onerror:null,onupgradeneeded:null};
  setTimeout(()=>r.onsuccess?.(),0);return r;}};
globalThis.IDBKeyRange={only:x=>x};
test('G24: actual IndexedDB listing resolves Sketch vs photo, uses no writes',async()=>{
  const a=project('sketch','saved-sketch');
  const b={...a,id:'project-B',title:'Original',editorStyle:null,activeAssetId:'source-B'};
  db=new FakeDb({projects:[a,b],assets:[sourceThumbnail,processed('saved-sketch'),
    {...sourceThumbnail,id:'thumbB',projectId:b.id,sourceAssetId:b.activeAssetId}]});
  const list=await store.listProjectThumbnails();
  assert.equal(list.length,2);
  assert.equal(list[0].displayKind,'sketch');
  assert.equal(list[0].displayAsset.id,'saved-sketch');
  assert.equal(list[0].thumbnail.id,'thumb1');
  assert.equal(list[1].displayKind,'original');
  assert.equal(list[1].displayAsset,undefined);
  assert.equal(list[1].thumbnail.id,'thumbB');
  assert.equal(db.writes,0);
});
test('G24: Home uses real processed Blob and contain fit, existing source uses cover',()=>{
  const home=readFileSync(resolve(app,'src/home.ts'),'utf8');
  const css=readFileSync(resolve(app,'src/styles.css'),'utf8');
  const editor=readFileSync(resolve(app,'src/day17-sketch-placeholder.ts'),'utf8');
  assert.match(home,/const visibleAsset = displayAsset \?\? thumbnail/);
  assert.match(home,/URL\.createObjectURL\(visibleAsset\.blob\)/);
  assert.match(home,/displayKind === 'sketch'/);
  assert.match(css,/\.home-project-saved \.home-project-preview \{[\s\S]*?object-fit: cover/);
  assert.match(css,/\.home-project-preview\.home-project-preview-sketch \{\s*object-fit: contain/);
  assert.doesNotMatch(editor,/styleWrites|rememberStyle|saveProjectEditorStyle/);
  assert.match(editor,/sketchyar:projects:changed/);
  assert.doesNotMatch(home,/saveProcessedPng\(|createImageProject\(/);
});
