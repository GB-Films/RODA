const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
require('../js/collaboration.js');
const {clone,merge}=globalThis.Collaboration;
const corePath='production_projects/demo/data/core';
const scriptPath='production_projects/demo/data/script';

function backend(){
  const docs=new Map([
    [corePath,{payload:{meta:{title:'Demo'},crew:[{id:'c1',name:'Ana'}]},revision:0}],
    [scriptPath,{payload:{scenes:[{id:'s1',notes:''}]},revision:0}],
    ['production_projects/demo',{name:'Demo',editPassword:'keep',theme:'pink'}]
  ]);
  let version=0,retries=0;
  const listeners=new Set();
  const snap=(id,data)=>({id,exists:()=>data!==undefined,data:()=>clone(data)});
  function emit(metadata={fromCache:false,hasPendingWrites:false}){
    const snapshot={metadata,docs:['core','script'].map(id=>snap(id,docs.get(`production_projects/demo/data/${id}`)))};
    for(const listener of listeners)listener(snapshot);
  }
  const sdk={
    doc:(_db,...parts)=>parts.join('/'),collection:(_db,...parts)=>parts.join('/'),serverTimestamp:()=>'<server-time>',
    async runTransaction(_db,build){
      for(let attempt=0;attempt<5;attempt++){
        const seen=version,copy=new Map([...docs].map(([key,value])=>[key,clone(value)])),writes=[];
        const result=await build({
          async get(ref){return snap(ref.split('/').at(-1),copy.get(ref));},
          set(ref,data,options){writes.push({ref,data:clone(data),merge:options?.merge});}
        });
        if(writes.length && seen!==version){retries++;continue;}
        if(writes.length){
          for(const write of writes)docs.set(write.ref,write.merge?{...docs.get(write.ref),...write.data}:write.data);
          version++;emit();
        }
        return result;
      }
      throw Error('transaction retry limit');
    },
    onSnapshot(_query,_options,onNext,onError){
      listeners.add(onNext);
      queueMicrotask(()=>{if(listeners.has(onNext))emit();});
      return ()=>listeners.delete(onNext);
    }
  };
  return {storeMod:sdk,db:{},docs,emit,retries:()=>retries};
}
function storage(fb){
  const items=new Map();
  const window={TEST_BACKEND:fb};
  const context=vm.createContext({window,console,localStorage:{getItem:key=>items.get(key)||null,setItem:(key,value)=>items.set(key,value)}});
  // Inject the SDK in this isolated test context; production initialization and
  // credentials are never used and the adapter functions remain unchanged.
  const source=fs.readFileSync(require.resolve('../js/storage.js'),'utf8').replace('let fb = null;','let fb = window.TEST_BACKEND; firebaseReady = true;');
  vm.runInContext(source,context);
  return window.StorageLayer;
}

test('storage retries a colliding transaction and atomically preserves both editors changes',async()=>{
  const fb=backend(),a=storage(fb),b=storage(fb);
  const baseA=await a.readProject('demo'),baseB=await b.readProject('demo');
  const draftA=clone(baseA),draftB=clone(baseB);
  draftA.core.crew[0].name='Bea'; draftB.pack.scenes[0].notes='Nueva nota';
  const results=await Promise.all([
    a.commitProject('demo',current=>({core:merge(baseA.core,draftA.core,current.core),pack:merge(baseA.pack,draftA.pack,current.pack)})),
    b.commitProject('demo',current=>({core:merge(baseB.core,draftB.core,current.core),pack:merge(baseB.pack,draftB.pack,current.pack)}))
  ]);
  assert.ok(fb.retries()>0,'the test must exercise a genuine retry');
  assert.equal(fb.docs.get(corePath).payload.crew[0].name,'Bea');
  assert.equal(fb.docs.get(scriptPath).payload.scenes[0].notes,'Nueva nota');
  assert.equal(fb.docs.get(corePath).revision,2);
  assert.equal(fb.docs.get(scriptPath).revision,2);
  assert.deepEqual(results.map(r=>r.revision).sort(),[1,2]);
  assert.equal(fb.docs.get('production_projects/demo').editPassword,'keep');
  assert.equal(fb.docs.get('production_projects/demo').theme,'pink');
});

test('watcher delivers consistent core/script snapshots and ignores unconfirmed cache',async()=>{
  const fb=backend(),a=storage(fb),received=[];
  const unsubscribe=a.watchProject('demo',record=>received.push(record),error=>{throw error;});
  await Promise.resolve(); received.length=0;
  fb.emit({fromCache:true,hasPendingWrites:false});
  fb.emit({fromCache:false,hasPendingWrites:true});
  assert.equal(received.length,0);
  await a.commitProject('demo',current=>({core:current.core,pack:current.pack}));
  assert.equal(received.length,1);
  assert.equal(received[0].revision,1);
  assert.equal(received[0].core.crew[0].name,'Ana');
  assert.equal(received[0].pack.scenes[0].id,'s1');
  unsubscribe();fb.emit();assert.equal(received.length,1);
});

test('failed reconciliation cannot partially update either document',async()=>{
  const fb=backend(),a=storage(fb),before=clone([...fb.docs]);
  await assert.rejects(a.commitProject('demo',()=>{throw Error('invalid remote');}),/invalid remote/);
  assert.deepEqual([...fb.docs],before);
});

test('local acknowledged baseline is isolated per project',()=>{
  const a=storage(backend());
  a.saveSyncBaseline('a',{note:'A'});a.saveSyncBaseline('b',{note:'B'});
  assert.equal(a.loadSyncBaseline('a').note,'A');
  assert.equal(a.loadSyncBaseline('b').note,'B');
  assert.equal(a.loadSyncBaseline('missing'),null);
});
