(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const key=(owner,shot)=>owner.id+'|'+shot.id;
  function shots(state,day,sceneId){
    const ids=new Set(state.scenes.map(s=>s.id)),result=[];
    for(const owner of state.scenes)for(const [i,shot] of (owner.shots||[]).entries()){
      if((ids.has(shot.shootingSceneId)?shot.shootingSceneId:owner.id)===sceneId)result.push({key:key(owner,shot),owner,shot,number:i+1});
    }
    result.sort((a,b)=>(a.shot.shootingOrder??100000)-(b.shot.shootingOrder??100000));
    const order=day.shotPlanning?.[sceneId]?.order||[];
    return result.sort((a,b)=>{const i=order.indexOf(a.key),j=order.indexOf(b.key);return (i<0?1e9:i)-(j<0?1e9:j);});
  }
  // Apportion whole minutes inside the existing scene slot. Merely viewing the
  // plan never changes a shot, a scene or a shooting-day time.
  function allocate(weights,total){
    if(!weights.length)return [];
    if(total<weights.length)return null;
    const remaining=total-weights.length,sum=weights.reduce((a,b)=>a+b,0),exact=weights.map(w=>remaining*w/sum),out=exact.map(v=>1+Math.floor(v));
    let left=total-out.reduce((a,b)=>a+b,0);
    const ranked=exact.map((v,i)=>({i,f:v-Math.floor(v)})).sort((a,b)=>b.f-a.f||a.i-b.i);
    for(const {i} of ranked){if(!left--)break;out[i]++;}
    return out;
  }
  function sceneRows(state,day,sceneId){
    const scene=state.scenes.find(s=>s.id===sceneId);if(!scene)return [];
    const list=shots(state,day,sceneId),start=Number(day.times?.[sceneId]??0),total=Number(day.durations?.[sceneId]??60);
    const fallback={kind:'scene',key:'scene:'+sceneId,sceneId,start,dur:total,number:scene.number,title:scene.slugline,desc:'Sin planos cargados. Agregalos en Shotlist.'};
    if(!list.length)return [fallback];
    const stored=day.shotPlanning?.[sceneId]?.durations||{};
    const weights=list.map(r=>Math.max(1,Number(stored[r.key]??r.shot.durMin)||15));
    const durations=weights.reduce((a,b)=>a+b,0)===total?weights:allocate(weights,Math.round(total));
    if(!durations)return [{...fallback,desc:'Hay más planos que minutos disponibles. Ampliá la duración de esta escena en la vista Escenas.'}];
    let cursor=start;
    return list.map((row,i)=>{const item={kind:'shot',key:row.key,sceneId,ownerId:row.owner.id,shotId:row.shot.id,number:row.owner.number,shotNumber:row.number,title:row.shot.type||'Plano',desc:row.shot.desc||'Sin descripción',start:cursor,dur:durations[i]};cursor+=item.dur;return item;});
  }
  function rows(state,day){return [...(day.sceneIds||[]).flatMap(id=>sceneRows(state,day,id)),...(day.blocks||[]).map(b=>({kind:'block',key:'block:'+b.id,id:b.id,title:b.title||'Bloque',desc:b.detail||'',start:Number(b.startMin)||0,dur:Number(b.durMin)||0,color:b.color||'#f97316'}))].sort((a,b)=>a.start-b.start);}
  function remember(state,day,sceneId){const list=sceneRows(state,day,sceneId);if(!list.length||list.some(r=>r.kind!=='shot'))throw Error('Cargá los planos de esta escena en Shotlist.');day.shotPlanning??={};return day.shotPlanning[sceneId]={order:list.map(r=>r.key),durations:Object.fromEntries(list.map(r=>[r.key,r.dur]))};}
  function reorder(state,day,sceneId,from,to){
    const list=sceneRows(state,day,sceneId),a=list.findIndex(r=>r.key===from),b=list.findIndex(r=>r.key===to);
    if(a<0||b<0||a===b)return false;
    const plan=remember(state,day,sceneId),[id]=plan.order.splice(a,1);plan.order.splice(b,0,id);return true;
  }
  function duration(state,day,sceneId,id,value){
    value=Number(value);if(!Number.isInteger(value)||value<1||value>720)throw Error('Ingresá una duración de 1 a 720 minutos.');
    const next=clone(day),plan=remember(state,next,sceneId);if(!Object.hasOwn(plan.durations,id))throw Error('Este plano ya no pertenece a esta tanda.');
    const delta=value-plan.durations[id];if(!delta)return false;
    const start=Number(next.times?.[sceneId]??0),oldDuration=Number(next.durations?.[sceneId]??60),end=start+oldDuration;
    // Reject pre-existing overlaps rather than silently moving an unrelated item.
    const other=[...(next.sceneIds||[]).filter(s=>s!==sceneId).map(s=>({kind:'scene',id:s,start:Number(next.times?.[s]??0),dur:Number(next.durations?.[s]??60)})),...(next.blocks||[]).map(b=>({kind:'block',id:b.id,start:b.startMin,dur:b.durMin}))];
    if(other.some(r=>r.start<end&&r.start+r.dur>start))throw Error('Esta escena se superpone con otra actividad. Revisá los horarios antes de ajustar sus planos.');
    plan.durations[id]=value;next.durations??={};next.times??={};next.durations[sceneId]=oldDuration+delta;
    for(const item of other)if(item.start>=end){if(item.kind==='scene')next.times[item.id]=item.start+delta;else next.blocks.find(b=>b.id===item.id).startMin=item.start+delta;}
    const [h,m]=String(day.callTime||'08:00').split(':').map(Number),base=h*60+m,limit=day.night?1800:1440;
    if(rows(state,next).some(r=>base+r.start<0||base+r.start+r.dur>limit))throw Error('La nueva duración supera el final del día. Reducila o activá el horario nocturno.');
    Object.assign(day,next);return true;
  }
  const api={shots,allocate,sceneRows,rows,reorder,duration};root.RodaShotPlanning=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
