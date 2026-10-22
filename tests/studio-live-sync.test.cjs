const test=require('node:test'),assert=require('node:assert/strict');
require('../js/studio-live-sync.js');
const {createStudioLiveSync}=globalThis;
test('an edit that starts and finishes during a read cannot be overwritten',async()=>{
  let generation=0,applied=0,resolve;const read=new Promise(r=>resolve=r);
  const sync=createStudioLiveSync({read:()=>read,canApply:()=>true,generation:()=>generation,apply:()=>applied++});
  const request=sync.refresh();generation++;resolve({});await request;assert.equal(applied,0);
});
test('dirty editors do not pull; overlapping pulls and stopped responses never apply',async()=>{
  let busy=true,reads=0,applied=0,resolve;
  const sync=createStudioLiveSync({read:()=>{reads++;return new Promise(r=>resolve=r);},canApply:()=>!busy,generation:()=>0,apply:()=>applied++});
  await sync.refresh();assert.equal(reads,0);busy=false;const request=sync.refresh();await sync.refresh();assert.equal(reads,1);
  sync.stop();resolve({});await request;assert.equal(applied,0);
});
test('idle editors receive new shared data and recover after a connection error',async()=>{
  let fail=true,errors=0,applied=0;const sync=createStudioLiveSync({read:async()=>{if(fail)throw Error('offline');return {day:'new'};},canApply:()=>true,generation:()=>0,apply:data=>{assert.equal(data.day,'new');applied++;},onError:()=>errors++});
  await sync.refresh();fail=false;await sync.refresh();assert.equal(errors,1);assert.equal(applied,1);
});
