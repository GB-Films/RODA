(function(root){
  'use strict';
  const fields=['date','label','location','callTime','night','notes','times','durations','sceneColors','shotsDone'];
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const equal=(a,b)=>{
    if(a===b)return true;
    if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
    if(object(a)&&object(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));}
    return false;
  };
  function snapshot(days){return Object.fromEntries(days.map(day=>[day.id,{fields:Object.fromEntries(fields.filter(k=>Object.hasOwn(day,k)).map(k=>[k,clone(day[k])])),scenes:Object.fromEntries((day.sceneIds||[]).map(id=>[id,true])),blocks:Object.fromEntries((day.blocks||[]).map(block=>[block.id,clone(block)]))}]));}
  function diff(before,after,path=[],out=[]){
    if(equal(before,after))return out;
    if(object(before)&&object(after)){for(const key of new Set([...Object.keys(before),...Object.keys(after)]))diff(before[key],after[key],[...path,key],out);}
    else out.push({path,beforeExists:before!==undefined,before:clone(before),afterExists:after!==undefined,after:clone(after)});
    return out;
  }
  function read(value,path){for(const key of path){if(!object(value)||!Object.hasOwn(value,key))return {exists:false};value=value[key];}return {exists:true,value};}
  function write(value,path,exists,next){let node=value;for(const key of path.slice(0,-1)){if(!object(node[key]))node[key]={};node=node[key];}if(exists)node[path.at(-1)]=clone(next);else delete node[path.at(-1)];}
  function order(current,allowed,preferred){const ids=current.filter(id=>Object.hasOwn(allowed,id));for(const id of preferred){if(!Object.hasOwn(allowed,id)||ids.includes(id))continue;const at=preferred.indexOf(id),previous=preferred.slice(0,at).reverse().find(key=>ids.includes(key)),next=preferred.slice(at+1).find(key=>ids.includes(key));ids.splice(previous!==undefined?ids.indexOf(previous)+1:next!==undefined?ids.indexOf(next):ids.length,0,id);}for(const id of Object.keys(allowed))if(!ids.includes(id))ids.push(id);return ids;}
  const orders=days=>Object.fromEntries(days.map(d=>[d.id,{scenes:[...(d.sceneIds||[])],blocks:(d.blocks||[]).map(b=>b.id)}]));
  const sameDays=(a,b)=>equal(Object.keys(a).sort(),Object.keys(b).sort());
  const safeEntry=entry=>entry&&Array.isArray(entry.patches)&&entry.patches.length>0&&entry.patches.every(p=>Array.isArray(p.path)&&p.path.length>=2&&p.path.every(k=>typeof k==='string'&&!['__proto__','prototype','constructor'].includes(k))&&['fields','scenes','blocks'].includes(p.path[1]));
  function create({days=[],limit=50,storage=null,key='',onChange=()=>{}}={}){
    let baseline=snapshot(days),baselineOrder=orders(days),undo=[],redo=[];
    try{const saved=JSON.parse(storage?.getItem(key)||'null');if(saved?.version===1){undo=(saved.undo||[]).filter(safeEntry).slice(-limit);redo=(saved.redo||[]).filter(safeEntry).slice(-limit);}}catch(_e){}
    const save=()=>{try{storage?.setItem(key,JSON.stringify({version:1,undo,redo}));}catch(_e){}onChange();};
    function rebase(current){const next=snapshot(current);if(!sameDays(baseline,next)){undo=[];redo=[];}baseline=next;baselineOrder=orders(current);save();}
    function record(current){
      const next=snapshot(current);if(!sameDays(baseline,next)){rebase(current);return false;}
      const patches=diff(baseline,next);if(!patches.length)return false;
      const entry={patches,beforeOrder:baselineOrder,afterOrder:orders(current)};
      entry.label=patches.some(p=>p.path[1]==='scenes')?'Cambio de escenas':patches.some(p=>p.path.includes('durations')||p.path.at(-1)==='durMin')?'Cambio de duración':patches.some(p=>p.path.includes('times')||p.path.at(-1)==='startMin'||p.path.includes('callTime'))?'Cambio de horarios':patches.some(p=>p.path.includes('sceneColors')||p.path.at(-1)==='color')?'Cambio de colores':'Cambio de bloques';
      undo.push(entry);undo=undo.slice(-limit);redo=[];baseline=next;baselineOrder=entry.afterOrder;save();return true;
    }
    function apply(current,direction,validSceneIds){
      const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo,entry=from.at(-1);if(!entry)return {ok:false,reason:'empty'};
      const now=snapshot(current),expected=direction==='undo'?'after':'before',target=direction==='undo'?'before':'after';
      if(!sameDays(baseline,now)||entry.patches.some(p=>{const actual=read(now,p.path);return actual.exists!==p[expected+'Exists']||actual.exists&&!equal(actual.value,p[expected]);})){
        undo=[];redo=[];baseline=now;baselineOrder=orders(current);save();return {ok:false,reason:'conflict'};
      }
      const next=clone(now);for(const p of entry.patches)write(next,p.path,p[target+'Exists'],p[target]);
      const valid=validSceneIds?new Set(validSceneIds):null,assigned=new Set();
      let conflict=false;for(const day of Object.values(next))for(const id of Object.keys(day.scenes)){if(assigned.has(id)||valid&&!valid.has(id))conflict=true;assigned.add(id);}
      // An unrelated colleague may have filled the old slot. Undo must not overlap it.
      const affected=new Map();for(const p of entry.patches){let id;if(p.path[1]==='fields'&&['night','callTime'].includes(p.path[2]))id='*';if(p.path[1]==='scenes')id='scene:'+p.path[2];if(p.path[1]==='fields'&&['times','durations'].includes(p.path[2]))id='scene:'+p.path[3];if(p.path[1]==='blocks'&&(p.path.length===3||['startMin','durMin'].includes(p.path[3])))id='block:'+p.path[2];if(id){if(!affected.has(p.path[0]))affected.set(p.path[0],new Set());affected.get(p.path[0]).add(id);}}
      for(const [dayId,changed] of affected){const day=next[dayId],items=[...Object.keys(day.scenes).map(id=>({key:'scene:'+id,start:day.fields.times?.[id]??0,dur:day.fields.durations?.[id]??60})),...Object.values(day.blocks).map(b=>({key:'block:'+b.id,start:b.startMin,dur:b.durMin}))];const clock=String(day.fields.callTime||'08:00').split(':').map(Number),call=clock[0]*60+clock[1],end=day.fields.night?1800:1440;if(items.some(it=>(changed.has('*')||changed.has(it.key))&&(!Number.isFinite(it.start)||!Number.isFinite(it.dur)||it.dur<=0||call+it.start<0||call+it.start+it.dur>end)))conflict=true;for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];if((changed.has('*')||changed.has(a.key)||changed.has(b.key))&&a.start<b.start+b.dur&&b.start<a.start+a.dur)conflict=true;}}
      if(conflict){undo=[];redo=[];baseline=now;baselineOrder=orders(current);save();return {ok:false,reason:'conflict'};}
      for(const day of current){const value=next[day.id];for(const field of fields){if(Object.hasOwn(value.fields,field))day[field]=clone(value.fields[field]);else delete day[field];}day.sceneIds=order(day.sceneIds||[],value.scenes,entry[target+'Order']?.[day.id]?.scenes||[]);day.blocks=order((day.blocks||[]).map(b=>b.id),value.blocks,entry[target+'Order']?.[day.id]?.blocks||[]).map(id=>clone(value.blocks[id]));}
      from.pop();to.push(entry);baseline=snapshot(current);baselineOrder=orders(current);save();return {ok:true,label:entry.label};
    }
    return {record,rebase,undo:(current,valid)=>apply(current,'undo',valid),redo:(current,valid)=>apply(current,'redo',valid),status:()=>({undo:undo.length,redo:redo.length,undoLabel:undo.at(-1)?.label||'',redoLabel:redo.at(-1)?.label||''})};
  }
  const api={create};root.RodaPlanningHistory=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
