const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../js/team-sync.js');
require('../js/collaboration.js');
const {mergeProject,clone}=globalThis.Collaboration;
const initial={scenes:[{id:'s1'},{id:'s2'}],shootDays:[{id:'d',sceneIds:['s1','s2'],times:{s1:0,s2:60},blocks:[]}],crew:[{id:'c',name:'Ana'}]};
function client(server,write=true){
 let state=clone(server.state),busy=false,status;
 const session=create({initial:state,revision:server.revision,getState:()=>state,merge:mergeProject,canWrite:()=>write,isBusy:()=>busy,
  read:async()=>({state:clone(server.state),revision:server.revision}),
  commit:async(base,draft)=>{await Promise.resolve();server.state=mergeProject(base,draft,server.state);server.revision++;return {state:clone(server.state),revision:server.revision};},
  apply:value=>state=value,onStatus:value=>status=value});
 return {session,get state(){return state;},set busy(v){busy=v;},get status(){return status;}};
}
test('two editors merge different changes and a viewer receives both without writing',async()=>{
 const server={state:clone(initial),revision:1},a=client(server),b=client(server),viewer=client(server,false);
 try{a.state.shootDays[0].times.s1=30;a.session.notify();b.state.crew[0].name='Bea';b.session.notify();await Promise.all([a.session.flush(),b.session.flush()]);await Promise.all([a.session.refresh(),b.session.refresh(),viewer.session.refresh()]);
 for(const c of [a,b,viewer]){assert.equal(c.state.shootDays[0].times.s1,30);assert.equal(c.state.crew[0].name,'Bea');}assert.equal(server.revision,3);viewer.session.notify();await viewer.session.flush();assert.equal(server.revision,3);
 }finally{[a,b,viewer].forEach(c=>c.session.stop());}
});
test('edits during a slow save survive the acknowledgement and are sent next',async()=>{
 let state=clone(initial),remote=clone(initial),finish,revision=1;
 const session=create({initial:state,revision,getState:()=>state,merge:mergeProject,canWrite:()=>true,apply:s=>state=s,read:async()=>({state:remote,revision}),commit:async(base,sent)=>{await new Promise(r=>finish=r);remote=mergeProject(base,sent,remote);return {state:clone(remote),revision:++revision};}});
 try{state.crew[0].name='Bea';session.notify();const first=session.flush();state.shootDays[0].times.s2=90;session.notify();finish();await first;assert.equal(session.pending,true);assert.equal(state.shootDays[0].times.s2,90);const second=session.flush();finish();await second;assert.equal(session.pending,false);assert.equal(remote.shootDays[0].times.s2,90);}finally{session.stop();}
});
test('dragging queues remote updates; unchanged polls do not repaint or write normalization',async()=>{
 const server={state:clone(initial),revision:1},a=client(server);try{
 a.busy=true;server.state.crew[0].name='Nueva';server.revision++;await a.session.refresh();assert.equal(a.state.crew[0].name,'Ana');a.busy=false;await a.session.refresh();assert.equal(a.state.crew[0].name,'Nueva');a.state.extra='UI default';await a.session.flush();assert.equal(server.state.extra,undefined);
 }finally{a.session.stop();}
});
test('offline changes remain pending and retry without losing a concurrent remote edit',async()=>{
 let state=clone(initial),remote=clone(initial),offline=true;
 const session=create({initial:state,revision:1,getState:()=>state,merge:mergeProject,apply:s=>state=s,read:async()=>({state:remote,revision:2}),commit:async(base,sent)=>{if(offline)throw Error('offline');remote=mergeProject(base,sent,remote);return {state:remote,revision:3};}});
 try{state.shootDays[0].times.s1=20;session.notify();await session.flush();assert.equal(session.pending,true);remote.crew[0].name='Remota';offline=false;await session.flush();assert.equal(state.crew[0].name,'Remota');assert.equal(state.shootDays[0].times.s1,20);assert.equal(session.pending,false);}finally{session.stop();}
});
