const {test}=require('node:test');
const assert=require('node:assert/strict');
const {swapDayScenes,createDaySwapController}=require('../js/day-swap.js');

function days(){
  return ['thu','fri','sat'].map((id,i)=>({id,date:`2026-10-${15+i}`,label:id,callTime:`0${8+i}:00`,sceneIds:[id,'shared'],times:{[id]:30,shared:120},durations:{[id]:45,shared:60},sceneColors:{[id]:'red'},shotsDone:{[id]:true},crewIds:[`crew-${id}`],blocks:[{id:`meal-${id}`}],notes:id}));
}
class Element{
  constructor(){this.children=[];this.listeners={};this.attributes={};this.textContent='Jornada';const classes=new Set();this.classList={add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n)};this.ownerDocument={createElement:()=>new Element()};}
  append(child){this.children.push(child);}
  contains(child){return child===this||this.children.some(c=>c.contains(child));}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  fire(type,extra={}){const event={preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra};for(const fn of this.listeners[type]||[])fn(event);return event;}
}
function setup(){
  const state=days(),headers=state.map(()=>new Element()),columns=state.map(()=>new Element()),saved=[],busy=[];
  let editable=true;
  const controller=createDaySwapController({getDay:id=>state.find(d=>d.id===id),canEdit:()=>editable,onSwap:(...ids)=>saved.push(ids),onDragState:active=>busy.push(active)});
  state.forEach((d,i)=>{columns[i].append(headers[i]);controller.bind(headers[i],columns[i],d.id);});
  const dataTransfer={data:{},setData(key,value){this.data[key]=value;}};
  return {state,headers,columns,saved,busy,controller,dataTransfer,revoke:()=>{editable=false;}};
}

test('Thursday/Saturday exchange moves every scene field while dates, calls and other days stay put',()=>{
  const state=days(),before=structuredClone(state);
  assert.equal(swapDayScenes(state[0],state[2]),true);
  assert.deepEqual(state.map(d=>[d.id,d.date]),before.map(d=>[d.id,d.date]));
  for(const key of ['sceneIds','times','durations','sceneColors','shotsDone']){
    assert.deepEqual(state[0][key],before[2][key]);assert.deepEqual(state[2][key],before[0][key]);
  }
  for(const key of ['label','callTime','crewIds','blocks','notes']){
    assert.deepEqual(state[0][key],before[0][key]);assert.deepEqual(state[2][key],before[2][key]);
  }
  assert.deepEqual(state[1],before[1]);
  // Scenes assigned across several days remain assigned once on each of those days.
  assert.equal(state[0].sceneIds.filter(id=>id==='shared').length,1);
  swapDayScenes(state[0],state[2]);assert.deepEqual(state,before);
});
test('empty destinations receive the scenes and missing or identical days do nothing',()=>{
  const [first]=days(),empty={id:'empty',date:'2026-10-22'};
  assert.equal(swapDayScenes(first,empty),true);assert.deepEqual(first.sceneIds,[]);assert.deepEqual(first.times,{});assert.deepEqual(empty.sceneIds,['thu','shared']);
  const before=structuredClone(empty);
  assert.equal(swapDayScenes(empty,empty),false);assert.equal(swapDayScenes(empty,null),false);assert.deepEqual(empty,before);
});
test('header drag highlights destination, swaps once and clears its busy state',()=>{
  const t=setup(),before=structuredClone(t.state);
  t.headers[0].fire('dragstart',{dataTransfer:t.dataTransfer});
  assert.equal(t.dataTransfer.data['application/x-roda-day-swap'],'thu');assert.equal(t.busy.at(-1),true);
  assert.equal(t.columns[0].classList.contains('daySwapSource'),true);
  assert.equal(t.columns[2].fire('dragover',{dataTransfer:t.dataTransfer}).defaultPrevented,true);
  assert.equal(t.columns[2].classList.contains('daySwapTarget'),true);
  t.columns[2].fire('drop');t.headers[0].fire('dragend');
  assert.deepEqual(t.state[0].sceneIds,before[2].sceneIds);assert.deepEqual(t.state[2].sceneIds,before[0].sceneIds);
  assert.deepEqual(t.saved,[['thu','sat']]);assert.equal(t.busy.at(-1),false);
  for(const column of t.columns){assert.equal(column.classList.contains('daySwapSource'),false);assert.equal(column.classList.contains('daySwapTarget'),false);}
});
test('a scene or external drag cannot trigger a day swap',()=>{
  const t=setup(),before=structuredClone(t.state);
  assert.equal(t.columns[2].fire('dragover',{dataTransfer:t.dataTransfer}).defaultPrevented,undefined);
  assert.equal(t.columns[2].fire('drop').defaultPrevented,undefined);
  assert.deepEqual(t.state,before);assert.deepEqual(t.saved,[]);
});
test('same-day drops, cancelled drags and Escape do not change the plan',()=>{
  const t=setup(),before=structuredClone(t.state);
  t.headers[0].fire('dragstart',{dataTransfer:t.dataTransfer});t.columns[0].fire('drop');
  t.headers[0].fire('dragstart',{dataTransfer:t.dataTransfer});t.headers[0].fire('dragend');t.columns[2].fire('drop');
  t.headers[0].fire('keydown',{key:'Enter'});t.headers[0].fire('keydown',{key:'Escape'});t.columns[2].fire('drop');
  assert.deepEqual(t.state,before);assert.deepEqual(t.saved,[]);assert.equal(t.busy.at(-1),false);
});
test('reader permissions are checked before starting and again before dropping',()=>{
  const t=setup(),before=structuredClone(t.state);t.revoke();
  assert.equal(t.headers[0].fire('dragstart',{dataTransfer:t.dataTransfer}).defaultPrevented,true);
  t.headers[0].fire('keydown',{key:'Enter'});t.columns[2].fire('drop');assert.deepEqual(t.saved,[]);
  const u=setup();u.headers[0].fire('dragstart',{dataTransfer:u.dataTransfer});u.revoke();u.columns[2].fire('drop');
  assert.deepEqual(t.state,before);assert.deepEqual(u.state,before);assert.deepEqual(u.saved,[]);assert.equal(u.busy.at(-1),false);
});
test('keyboard users select source and destination with Enter or Space',()=>{
  const t=setup();
  assert.equal(t.headers[0].attributes.role,'button');assert.equal(t.headers[0].tabIndex,0);
  assert.match(t.headers[0].attributes['aria-label'],/Enter/);
  t.headers[0].fire('keydown',{key:'Enter'});assert.equal(t.busy.at(-1),true);
  t.headers[2].fire('keydown',{key:' '});assert.deepEqual(t.saved,[['thu','sat']]);assert.equal(t.busy.at(-1),false);
});
test('moving within a target keeps its highlight; leaving the column removes it',()=>{
  const t=setup();t.headers[0].fire('dragstart',{dataTransfer:t.dataTransfer});t.columns[2].fire('dragover',{dataTransfer:t.dataTransfer});
  t.columns[2].fire('dragleave',{relatedTarget:t.headers[2]});assert.equal(t.columns[2].classList.contains('daySwapTarget'),true);
  t.columns[2].fire('dragleave',{relatedTarget:t.columns[1]});assert.equal(t.columns[2].classList.contains('daySwapTarget'),false);
  t.controller.clear();assert.equal(t.busy.at(-1),false);
});
