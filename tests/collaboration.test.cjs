const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../js/collaboration.js');
const { clone, mergeProject, merge, reconcile, swapDayScenes, createSession } = globalThis.Collaboration;

function fixture(){
  return {
    meta:{ title:'Prueba', updatedAt:'2026-10-16T12:00:00Z', version:14 },
    scenes:[{id:'s1',notes:'',slugline:'INT. CASA',shots:[]},{id:'s2',notes:'',slugline:'EXT. CALLE',shots:[]}],
    shootDays:[
      {id:'thu',date:'2026-10-15',sceneIds:[],times:{},durations:{},sceneColors:{}},
      {id:'fri',date:'2026-10-16',sceneIds:['s1'],times:{s1:15},durations:{s1:45},sceneColors:{s1:'red'},shotsDone:{shot1:true},callTime:'08:00',blocks:[{id:'lunch'}]},
      {id:'sat',date:'2026-10-17',sceneIds:['s2'],times:{s2:90},durations:{s2:30},sceneColors:{s2:'blue'},callTime:'09:00',blocks:[]},
      {id:'sun',date:'2026-10-18',sceneIds:[],times:{},durations:{},sceneColors:{}}
    ],
    crew:[{id:'c1',name:'Ana',phone:'123'}],project:{rtsOffsetMin:60},script:{versions:[],activeVersionId:null}
  };
}

test('swap Friday/Saturday preserves chronology, dates, calls and day blocks',()=>{
  const state=fixture(), before=clone(state);
  assert.equal(swapDayScenes(state.shootDays[1],state.shootDays[2]),true);
  assert.deepEqual(state.shootDays.map(d=>[d.id,d.date]),before.shootDays.map(d=>[d.id,d.date]));
  for(const key of ['sceneIds','times','durations','sceneColors']){
    assert.deepEqual(state.shootDays[1][key],before.shootDays[2][key]);
    assert.deepEqual(state.shootDays[2][key],before.shootDays[1][key]);
  }
  assert.deepEqual(state.shootDays[2].shotsDone,{shot1:true});
  assert.equal(state.shootDays[1].callTime,'08:00');
  assert.deepEqual(state.shootDays[1].blocks,[{id:'lunch'}]);
  assert.deepEqual(state.shootDays[0],before.shootDays[0]);
  assert.deepEqual(state.shootDays[3],before.shootDays[3]);
  assert.equal(swapDayScenes(state.shootDays[0],state.shootDays[0]),false);
});

test('swap with empty day and swap back retains all scene data',()=>{
  const state=fixture(), before=clone(state);
  swapDayScenes(state.shootDays[1],state.shootDays[0]);
  assert.deepEqual(state.shootDays[1].sceneIds,[]);
  assert.deepEqual(state.shootDays[0].times,{s1:15});
  swapDayScenes(state.shootDays[1],state.shootDays[0]);
  assert.deepEqual(state.shootDays[1],before.shootDays[1]);
});

test('concurrent edits to different fields of the same scene, days and crew survive',()=>{
  const base=fixture(), a=clone(base), b=clone(base);
  a.scenes[0].notes='Notas A';
  a.shootDays[1].times.s1=60;
  b.scenes[0].slugline='INT. COCINA';
  b.crew[0].phone='456';
  b.shootDays[2].durations.s2=90;
  const result=mergeProject(base,a,b);
  assert.equal(result.scenes[0].notes,'Notas A');
  assert.equal(result.scenes[0].slugline,'INT. COCINA');
  assert.equal(result.crew[0].phone,'456');
  assert.equal(result.shootDays[1].times.s1,60);
  assert.equal(result.shootDays[2].durations.s2,90);
});

test('concurrent additions and deletion of list items merge without resurrection',()=>{
  assert.deepEqual(merge(['a'],['a','b'],['a','c']),['a','b','c']);
  assert.deepEqual(merge(['a','b'],['a'],['a','b','c']),['a','c']);
  assert.deepEqual(merge([{id:'a',note:''}],[],[{id:'a',note:'new'}]),[]);
  assert.deepEqual(merge(['a','b','c'],['c','a','b'],['a','b','c','d']),['c','d','a','b']);
});

test('same-field conflict uses the committing editor value, preserves unrelated fields',()=>{
  const base=fixture(), local=clone(base), remote=clone(base);
  local.scenes[0].notes='último'; remote.scenes[0].notes='primero'; remote.scenes[1].notes='otra escena';
  const result=mergeProject(base,local,remote);
  assert.equal(result.scenes[0].notes,'último');
  assert.equal(result.scenes[1].notes,'otra escena');
});

test('conflicting moves cannot leave a scene assigned to two days',()=>{
  const base=fixture(), a=clone(base), b=clone(base);
  a.shootDays[1].sceneIds=[]; a.shootDays[0].sceneIds=['s1']; a.shootDays[0].times.s1=30;
  b.shootDays[1].sceneIds=[]; b.shootDays[3].sceneIds=['s1']; b.shootDays[3].times.s1=60;
  const result=mergeProject(base,a,b);
  assert.deepEqual(result.shootDays.filter(d=>d.sceneIds.includes('s1')).map(d=>d.id),['thu']);
  assert.equal(result.shootDays[3].times.s1,undefined);
});

test('scene deletion removes stale assignments while independent edits survive',()=>{
  const base=fixture(), a=clone(base), b=clone(base);
  a.scenes.splice(0,1); b.scenes[0].notes='stale'; b.crew[0].name='Bea';
  const result=mergeProject(base,a,b);
  assert.deepEqual(result.scenes.map(s=>s.id),['s2']);
  assert.deepEqual(result.shootDays[1].sceneIds,[]);
  assert.equal(result.crew[0].name,'Bea');
});

test('incoming values preserve objects captured by focused input handlers',()=>{
  const state=fixture(), next=clone(state), scene=state.scenes[0], days=state.shootDays;
  next.scenes[0].notes='remoto'; next.scenes.reverse();
  reconcile(state,next);
  assert.equal(state.scenes[1],scene);
  assert.equal(state.shootDays,days);
  scene.slugline='edición posterior';
  assert.equal(state.scenes[1].slugline,'edición posterior');
});

function server(initial){
  let record={state:clone(initial),revision:0}, online=true;
  const listeners=new Set();
  let afterWrite=null;
  return {
    read:async()=>{if(!online)throw Error('offline'); return clone(record);},
    watch(receive){listeners.add(receive); return ()=>listeners.delete(receive);},
    async commit(build){
      if(!online) throw Error('offline');
      // Each build runs against the latest committed snapshot, like a retried transaction.
      record={state:clone(build(clone(record.state))),revision:record.revision+1};
      const result=clone(record);
      for(const receive of listeners) receive(clone(result));
      if(afterWrite){const hook=afterWrite; afterWrite=null; await hook();}
      return result;
    },
    online(value){online=value;},
    afterWrite(hook){afterWrite=hook;},
    record:()=>clone(record),
    emit:record=>{for(const receive of listeners)receive(clone(record));}
  };
}
function editor(remote, initial=fixture(), baseline=null, options={}){
  const state=clone(initial), statuses=[], errors=[];
  let savedBaseline=null;
  const session=createSession({
    getState:()=>state, baseline, allowCreate:false,
    applyState:value=>reconcile(state,value), saveBaseline:value=>{savedBaseline=clone(value);},
    read:()=>remote.read(),watch:(receive,error)=>remote.watch(receive,error),commit:build=>remote.commit(build),
    onStatus:value=>statuses.push(value),onError:error=>errors.push(error),...options
  });
  return {state,session,statuses,errors,baseline:()=>savedBaseline};
}

test('two sessions combine changes saved simultaneously and receive updates without refresh',async t=>{
  const remote=server(fixture()), a=editor(remote), b=editor(remote);
  t.after(()=>{a.session.stop();b.session.stop();});
  await Promise.all([a.session.start(),b.session.start()]);
  a.state.scenes[0].notes='A'; b.state.crew[0].phone='B';
  await Promise.all([a.session.flush(),b.session.flush()]);
  assert.equal(remote.record().state.scenes[0].notes,'A');
  assert.equal(remote.record().state.crew[0].phone,'B');
  assert.deepEqual(a.state,b.state);
  assert.equal(a.statuses.at(-1),'En vivo');
  assert.equal(b.statuses.at(-1),'En vivo');
});

test('edits during a slow save and a newer remote commit are rebased once',async t=>{
  const remote=server(fixture()), a=editor(remote), b=editor(remote);
  t.after(()=>{a.session.stop();b.session.stop();});
  await a.session.start(); await b.session.start();
  a.state.scenes[0].notes='enviada';
  remote.afterWrite(async()=>{
    a.state.scenes[1].notes='mientras guarda';
    b.state.scenes[0].notes='más reciente';
    await b.session.flush();
  });
  await a.session.flush(); await a.session.flush();
  assert.equal(a.state.scenes[0].notes,'más reciente');
  assert.equal(a.state.scenes[1].notes,'mientras guarda');
  assert.deepEqual(a.state,b.state);
  const newest=clone(remote.record());
  newest.revision=0; newest.state.scenes[0].notes='respuesta vieja';
  remote.emit(newest);
  assert.equal(a.state.scenes[0].notes,'más reciente');
});

test('offline pending changes survive reload and combine with later remote changes',async t=>{
  const remote=server(fixture()), a=editor(remote), b=editor(remote);
  t.after(()=>{a.session.stop();b.session.stop();});
  await a.session.start(); await b.session.start();
  remote.online(false); a.state.scenes[0].notes='offline';
  await a.session.flush();
  assert.equal(a.errors.length,1);
  const cached=clone(a.state), baseline=a.baseline(); a.session.stop();
  remote.online(true); b.state.crew[0].name='remoto'; await b.session.flush();
  const reopened=editor(remote,cached,baseline); t.after(()=>reopened.session.stop());
  await reopened.session.start(); await reopened.session.flush();
  assert.equal(reopened.state.scenes[0].notes,'offline');
  assert.equal(reopened.state.crew[0].name,'remoto');
  assert.deepEqual(reopened.state,remote.record().state);
});

test('legacy cache without a baseline cannot overwrite current server data',async t=>{
  const remote=server(fixture()), stale=fixture(); stale.scenes[0].notes='copia vieja';
  const a=editor(remote,stale); t.after(()=>a.session.stop());
  await a.session.start(); await a.session.flush();
  assert.equal(a.state.scenes[0].notes,'');
  assert.equal(remote.record().revision,0);
});

test('read-only viewers receive updates without uploading local normalization',async t=>{
  const remote=server(fixture()), viewer=editor(remote,fixture(),null,{canWrite:()=>false}), author=editor(remote);
  t.after(()=>{viewer.session.stop();author.session.stop();});
  await viewer.session.start();await author.session.start();
  viewer.state.project.normalized=true;
  viewer.session.notify();await viewer.session.flush();
  assert.equal(remote.record().revision,0);
  author.state.scenes[0].notes='Nueva nota';await author.session.flush();
  assert.equal(viewer.state.scenes[0].notes,'Nueva nota');
  assert.equal(remote.record().state.project.normalized,undefined);
  assert.equal(viewer.statuses.at(-1),'En vivo');
});

test('updates wait for a drag to finish and preserve its pending edits',async t=>{
  let dragging=false;
  const remote=server(fixture()), a=editor(remote,fixture(),null,{isBusy:()=>dragging}), b=editor(remote);
  t.after(()=>{a.session.stop();b.session.stop();});
  await a.session.start();await b.session.start();
  dragging=true;
  a.state.shootDays[1].times.s1=120;
  b.state.scenes[0].notes='durante arrastre';await b.session.flush();
  await a.session.flush();
  assert.equal(a.state.scenes[0].notes,'');
  dragging=false;await a.session.flush();
  assert.equal(a.state.scenes[0].notes,'durante arrastre');
  assert.equal(b.state.shootDays[1].times.s1,120);
  assert.deepEqual(a.state,b.state);
});

test('a failed realtime listener is automatically subscribed again',async t=>{
  const remote=server(fixture()), watch=remote.watch;
  let failWatch,subscriptions=0;
  remote.watch=(receive,onError)=>{subscriptions++;failWatch=onError;return watch(receive);};
  const a=editor(remote);t.after(()=>a.session.stop());
  await a.session.start();
  failWatch(Error('listener disconnected'));
  await new Promise(resolve=>setTimeout(resolve,1650));
  assert.equal(subscriptions,2);
  await remote.commit(state=>{state.scenes[0].notes='reconectado';return state;});
  assert.equal(a.state.scenes[0].notes,'reconectado');
});

