const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=fs.existsSync(path.join(__dirname,'../roda'))?'../roda':'..';
const api=require(path.join(__dirname,root,'js/shot-planning.js'));
const history=require(path.join(__dirname,root,'js/planning-history.js'));
require(path.join(__dirname,root,'js/collaboration.js'));const collab=globalThis.Collaboration;
const clone=x=>structuredClone(x);
function fixture(){return {scenes:[{id:'s1',number:1,shots:[{id:'a',durMin:10},{id:'b',durMin:20},{id:'c',durMin:30}]},{id:'s2',number:2,shots:[{id:'d',durMin:15},{id:'e',durMin:15}]},{id:'s3',number:3,shots:[]}],shootDays:[
{id:'d1',callTime:'08:00',sceneIds:['s1','s2'],times:{s1:0,s2:105},durations:{s1:60,s2:30},blocks:[{id:'lunch',startMin:60,durMin:45}],shotsDone:{'s1|b':true},castSceneExclusions:{s1:['VO']}},
{id:'d2',callTime:'10:00',sceneIds:['s3'],times:{s3:0},durations:{s3:45},blocks:[]},
{id:'d3',callTime:'07:00',sceneIds:[],times:{},durations:{},blocks:[]}]};}
let s=fixture(),[a,b,c]=s.shootDays,original=clone(s),h=history.create({days:s.shootDays});
// Interleave unlike scenes across a meal without changing any duration or day end.
assert(api.move(s,a,'s2|d',a,'s1|b'));
assert.deepEqual(api.rows(s,a).map(r=>[r.key,r.start,r.dur]),[['s1|a',0,10],['s2|d',10,15],['s1|b',25,20],['s1|c',45,30],['block:lunch',75,45],['s2|e',120,15]]);
assert.deepEqual(s.scenes,original.scenes);assert.equal(api.groups(s,a).length,5);
h.record(s.shootDays);assert(h.undo(s.shootDays,s.scenes.map(s=>s.id)).ok);assert.deepEqual(s,original);assert(h.redo(s.shootDays,s.scenes.map(s=>s.id)).ok);
// Move a shot to another day. Day-local offsets, done status and cast exclusions follow.
const interleaved=clone(s);assert(api.move(s,a,'s1|b',b,'scene:s3'));
assert.deepEqual(api.rows(s,b).map(r=>[r.key,r.start,r.dur]),[['s1|b',0,20],['scene:s3',20,45]]);
assert.equal(b.shotsDone['s1|b'],true);assert.equal(a.shotsDone['s1|b'],undefined);assert.deepEqual(b.castSceneExclusions.s1,['VO']);
assert.deepEqual(api.shots(s,b,'s1').map(r=>r.shot.id),['b']);assert.equal(api.rows(s,a).at(-1).start+api.rows(s,a).at(-1).dur,115);
h.record(s.shootDays);const moved=clone(s);assert(h.undo(s.shootDays,s.scenes.map(s=>s.id)).ok);assert.deepEqual(s,interleaved);assert(h.redo(s.shootDays,s.scenes.map(s=>s.id)).ok);assert.deepEqual(s,moved);
const reload=JSON.parse(JSON.stringify(s));assert.deepEqual(api.rows(reload,reload.shootDays[1]),api.rows(s,b));
// Cross-day return, empty destination, explicit after / end and duration edits.
assert(api.move(s,b,'s1|b',c));assert.equal(c.times.s1,0);assert.equal(c.durations.s1,20);assert(!b.sceneIds.includes('s1'));
api.duration(s,c,'s1','s1|b',25);assert.equal(api.rows(s,c)[0].dur,25);assert.equal(s.scenes[0].shots[1].durMin,20);
assert(api.move(s,c,'s1|b',a,'s2|d','after'));assert.deepEqual(api.rows(s,a).slice(0,3).map(r=>r.key),['s1|a','s2|d','s1|b']);assert.equal(api.rows(s,c).length,0);
const noOp=clone(s);assert.equal(api.move(s,a,'s1|b',a,'s1|b'),false);assert.deepEqual(s,noOp);
const late=clone(c);late.callTime='23:55';const before=clone(s);assert.throws(()=>api.move(s,a,'s1|a',late));assert.deepEqual(s,before);
// Validation is atomic on overlaps and invalid destinations.
assert.throws(()=>api.move(s,a,'s1|a',b,'missing'));assert.deepEqual(s,before);
b.blocks.push({id:'overlap',startMin:1,durMin:50});const bad=clone(s);assert.throws(()=>api.move(s,a,'s1|a',b));assert.deepEqual(s,bad);
// Concurrent moves of the same shot must yield one coherent schedule, not two copies.
const base=fixture(),local=clone(base),remote=clone(base);
api.move(local,local.shootDays[0],'s1|b',local.shootDays[1]);api.move(remote,remote.shootDays[0],'s1|b',remote.shootDays[2]);
remote.scenes[0].shots[0].desc='Colleague description';remote.shootDays[2].notes='Keep this note';
let merged=collab.mergeProject(base,local,remote);
assert.equal(merged.shootDays.flatMap(d=>api.rows(merged,d)).filter(r=>r.key==='s1|b').length,1);
assert.equal(api.rows(merged,merged.shootDays[1]).at(-1).key,'s1|b');assert.equal(merged.scenes[0].shots[0].desc,'Colleague description');assert.equal(merged.shootDays[2].notes,'Keep this note');
for(let i=0;i<3;i++)assert.deepEqual(api.rows(merged,merged.shootDays[i]).map(r=>[r.key,r.start,r.dur]),api.rows(local,local.shootDays[i]).map(r=>[r.key,r.start,r.dur]));
// Passive updates retain split memberships and last/first work windows.
merged=collab.mergeProject(local,local,merged);assert(merged.shootDays[0].sceneIds.includes('s1'));assert(merged.shootDays[1].sceneIds.includes('s1'));
// Undo rejects a collaborator filling the vacated time; never overlaps their work.
s=fixture();[a,b,c]=s.shootDays;h=history.create({days:s.shootDays});api.move(s,a,'s1|b',b);h.record(s.shootDays);a.blocks.push({id:'new',startMin:115,durMin:10});assert.equal(h.undo(s.shootDays,s.scenes.map(s=>s.id)).ok,false);
// Deleted shots are not resurrected; newly authored shots can be explicitly added.
s=fixture();[a,b,c]=s.shootDays;api.move(s,a,'s1|b',b);s.scenes[0].shots.splice(1,1);api.syncDay(s,b);assert(!b.sceneIds.includes('s1'));
s.scenes[0].shots.push({id:'new',durMin:12});assert(api.addShot(s,b,'s1','new'));assert.equal(api.rows(s,b).at(-1).dur,12);
console.log('Free shot planning: interleave, cross-day, empty days, exact durations, undo/redo, reload, atomic bounds, concurrent moves and deleted/new shots passed.');

require(path.join(__dirname,root,'js/cast.js'));const calls=require(path.join(__dirname,root,'js/call-sheet.js'));
s=fixture();[a,b,c]=s.shootDays;s.scenes[0].elements={cast:['ANA']};s.crew=[{id:'actor',area:'Cast',castPerson:true,name:'Ada'},{id:'profile',area:'Cast',castProfile:true,role:'ANA',actorId:'actor'}];const people=clone(s.crew);
api.move(s,a,'s1|b',b);assert.deepEqual(calls.workWindow(s,b,'ANA'),{call:'10:15',first:'10:45',end:'11:05'});assert.deepEqual(calls.workWindow(s,a,'ANA'),{call:'08:00',first:'08:00',end:'08:40'});assert.deepEqual(s.crew,people);
assert.throws(()=>calls.editSceneTiming(b,'s1',0,30));assert(calls.removeScene(b,'s1'));api.syncDay(s,b);assert(!b.sceneIds.includes('s1'));assert.equal(s.scenes[0].shots.length,3);
console.log('Call windows and casting survive split days; scene removal only releases that day’s shots.');

s=fixture();[a,b,c]=s.shootDays;api.move(s,a,'s1|b',b);const restricted=clone(s);for(const scene of restricted.scenes)scene.shots=[];
globalThis.RodaAccess={canView:()=>false};const membership=clone(restricted.shootDays.map(d=>d.sceneIds));for(const day of restricted.shootDays)api.syncDay(restricted,day);assert.deepEqual(restricted.shootDays.map(d=>d.sceneIds),membership);assert.equal(api.groups(restricted,restricted.shootDays[1]).length,2);delete globalThis.RodaAccess;
console.log('Planning viewers without Shotlist access retain schedules and membership.');
