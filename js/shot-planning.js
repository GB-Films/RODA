(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const key=(owner,shot)=>owner.id+'|'+shot.id;
  function shots(state,day,sceneId){
    if(day.shotTimeline)return sceneRows(state,day,sceneId).filter(r=>r.kind==='shot').map(r=>{const owner=state.scenes.find(s=>s.id===r.ownerId);return {key:r.key,owner,shot:owner.shots.find(s=>s.id===r.shotId),number:r.shotNumber};});
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
    if(day.shotTimeline)return rows(state,day).filter(r=>r.sceneId===sceneId);
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
  function rows(state,day){if(day.shotTimeline)return timelineRows(state,day);return [...(day.sceneIds||[]).flatMap(id=>sceneRows(state,day,id)),...(day.blocks||[]).map(b=>({kind:'block',key:'block:'+b.id,id:b.id,title:b.title||'Bloque',desc:b.detail||'',start:Number(b.startMin)||0,dur:Number(b.durMin)||0,color:b.color||'#f97316'}))].sort((a,b)=>a.start-b.start);}
  function remember(state,day,sceneId){const list=sceneRows(state,day,sceneId);if(!list.length||list.some(r=>r.kind!=='shot'))throw Error('Cargá los planos de esta escena en Shotlist.');day.shotPlanning??={};return day.shotPlanning[sceneId]={order:list.map(r=>r.key),durations:Object.fromEntries(list.map(r=>[r.key,r.dur]))};}
  function reorder(state,day,sceneId,from,to){
    if(day.shotTimeline){const list=rows(state,day),a=list.findIndex(r=>r.key===from),b=list.findIndex(r=>r.key===to);return move(state,day,from,day,to,b>a?'after':'before');}
    const list=sceneRows(state,day,sceneId),a=list.findIndex(r=>r.key===from),b=list.findIndex(r=>r.key===to);
    if(a<0||b<0||a===b)return false;
    const plan=remember(state,day,sceneId),[id]=plan.order.splice(a,1);plan.order.splice(b,0,id);return true;
  }
  function duration(state,day,sceneId,id,value){
    value=Number(value);if(!Number.isInteger(value)||value<1||value>720)throw Error('Ingresá una duración de 1 a 720 minutos.');
    if(day.shotTimeline||id.startsWith('block:'))return changeDuration(state,day,id,value);
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

  // A free plan stores references, never copies of screenplay scenes or shots.
  // sceneIds/times/durations remain derived first/last work windows for the
  // call sheet, cast, filters and exports. A scene can span several days.
  function timelineRows(state,day){
    const result=[];
    for(const [id,slot] of Object.entries(day.shotTimeline)){
      const scene=state.scenes.find(s=>s.id===slot.sceneId);if(!scene)continue;
      if(slot.kind==='scene'){const projected=sceneRows(state,{...day,shotTimeline:undefined,times:{[slot.sceneId]:slot.start},durations:{[slot.sceneId]:slot.dur}},slot.sceneId);result.push(...projected);continue;}
      const owner=state.scenes.find(s=>s.id===slot.ownerId),index=owner?.shots?.findIndex(s=>s.id===slot.shotId)??-1;
      if(index<0){
        // Restricted collaborators receive an empty shot array, not deleted shots.
        if(root.RodaAccess&&!root.RodaAccess.canView('shotlist'))result.push({...slot,key:id,number:scene.number,shotNumber:slot.shotNumber||'—',title:'Plano',desc:''});
        continue;
      }
      const shot=owner.shots[index];
      result.push({...slot,key:id,number:owner.number,shotNumber:index+1,title:shot.type||'Plano',desc:shot.desc||'Sin descripción'});
    }
    for(const b of day.blocks||[])result.push({kind:'block',key:'block:'+b.id,id:b.id,title:b.title||'Bloque',desc:b.detail||'',start:Number(b.startMin)||0,dur:Number(b.durMin)||0,color:b.color||'#f97316'});
    return result.sort((a,b)=>a.start-b.start||a.key.localeCompare(b.key));
  }
  function syncDay(state,day){
    if(!day.shotTimeline)return;
    const list=timelineRows(state,day),ids=[...new Set(list.filter(r=>r.sceneId).map(r=>r.sceneId))];
    day.sceneIds=ids;day.times={};day.durations={};
    for(const id of ids){const group=list.filter(r=>r.sceneId===id),start=Math.min(...group.map(r=>r.start)),end=Math.max(...group.map(r=>r.start+r.dur));day.times[id]=start;day.durations[id]=end-start;}
  }
  function storeRows(state,day,list){
    day.shotTimeline={};
    for(const r of list){
      if(r.kind==='block'){const b=day.blocks.find(b=>b.id===r.id);if(b){b.startMin=r.start;b.durMin=r.dur;}continue;}
      const slot={kind:r.kind,sceneId:r.sceneId,start:r.start,dur:r.dur};
      if(r.kind==='shot'){slot.ownerId=r.ownerId;slot.shotId=r.shotId;slot.shotNumber=r.shotNumber||1;}
      day.shotTimeline[r.key]=slot;
    }
    syncDay(state,day);
  }
  function validate(day,list){
    const [h,m]=String(day.callTime||'08:00').split(':').map(Number),base=h*60+m,limit=day.night?1800:1440;
    if(list.some(r=>!Number.isFinite(r.start)||!Number.isInteger(r.dur)||r.dur<1||base+r.start<0||base+r.start+r.dur>limit))throw Error('El movimiento excede el horario disponible de la jornada. Revisá la duración o habilitá el horario nocturno.');
    const sorted=[...list].sort((a,b)=>a.start-b.start);
    if(sorted.some((r,i)=>i&&sorted[i-1].start+sorted[i-1].dur>r.start))throw Error('Hay actividades superpuestas. Corregí sus horarios antes de mover el plano.');
  }
  function move(state,source,id,target,targetKey=null,position='before'){
    if(!source||!target)throw Error('La jornada ya no existe.');
    if(source.id===target.id&&id===targetKey)return false;
    const a=rows(state,source).map(r=>({...r})),b=source.id===target.id?a:rows(state,target).map(r=>({...r}));
    const index=a.findIndex(r=>r.key===id),item=a[index];if(!item||item.kind!=='shot')return false;
    if(source.id!==target.id&&b.some(r=>r.key===id))throw Error('Ese plano ya está programado en la jornada de destino.');
    if(targetKey&&!b.some(r=>r.key===targetKey))throw Error('La posición de destino cambió. Elegí nuevamente dónde ubicarlo.');
    validate(source,a);if(source.id!==target.id)validate(target,b);
    // Keep deliberate idle gaps; close exactly the space vacated by the shot.
    a.splice(index,1);for(const row of a)if(row.start>=item.start+item.dur)row.start-=item.dur;
    const at=targetKey?b.findIndex(r=>r.key===targetKey)+(position==='after'?1:0):b.length;
    const start=at<b.length?b[at].start:b.length?b.at(-1).start+b.at(-1).dur:0;
    for(let i=at;i<b.length;i++)b[i].start+=item.dur;
    b.splice(at,0,{...item,start});
    validate(source,a);if(source.id!==target.id)validate(target,b);
    if(source.id===target.id&&JSON.stringify(a)===JSON.stringify(rows(state,source)))return false;
    const nextSource=clone(source),nextTarget=source.id===target.id?nextSource:clone(target);
    storeRows(state,nextSource,a);if(source.id!==target.id){
      storeRows(state,nextTarget,b);
      for(const field of ['sceneColors','castSceneExclusions','callHiddenScenes'])if(source[field]?.[item.sceneId]!==undefined&&nextTarget[field]?.[item.sceneId]===undefined){nextTarget[field]??={};nextTarget[field][item.sceneId]=clone(source[field][item.sceneId]);}
      if(source.shotsDone?.[id]!==undefined){nextTarget.shotsDone??={};nextTarget.shotsDone[id]=source.shotsDone[id];delete nextSource.shotsDone[id];}
    }
    Object.assign(source,nextSource);if(source.id!==target.id)Object.assign(target,nextTarget);return true;
  }
  function changeDuration(state,day,id,value){
    const list=rows(state,day).map(r=>({...r})),row=list.find(r=>r.key===id);if(!row)return false;
    validate(day,list);const delta=value-row.dur;if(!delta)return false;
    for(const other of list)if(other!==row&&other.start>=row.start+row.dur)other.start+=delta;
    row.dur=value;validate(day,list);const next=clone(day);storeRows(state,next,list);Object.assign(day,next);return true;
  }
  function addShot(state,day,ownerId,shotId){
    const owner=state.scenes.find(s=>s.id===ownerId),shot=owner?.shots.find(s=>s.id===shotId);if(!shot)return false;
    const id=key(owner,shot);
    if((state.shootDays||[]).some(d=>rows(state,d).some(r=>r.key===id)))return false;
    const list=rows(state,day).map(r=>({...r})),sceneId=state.scenes.some(s=>s.id===shot.shootingSceneId)?shot.shootingSceneId:ownerId;
    list.push({kind:'shot',key:id,ownerId,shotId,shotNumber:owner.shots.indexOf(shot)+1,sceneId,start:list.length?Math.max(...list.map(r=>r.start+r.dur)):0,dur:Math.max(1,Math.round(Number(shot.durMin)||15))});
    validate(day,list);const next=clone(day);storeRows(state,next,list);Object.assign(day,next);return true;
  }
  function removeScene(day,sceneId){
    if(!day.shotTimeline)return;
    for(const [id,slot] of Object.entries(day.shotTimeline))if(slot.sceneId===sceneId)delete day.shotTimeline[id];
  }
  // Adjacent shots can be summarized as a scene without inventing a continuous
  // slot across other scenes. This is the read-only Escenas view of a free plan.
  function groups(state,day){
    const out=[];
    for(const row of rows(state,day)){
      const last=out.at(-1);
      if(row.kind==='shot'&&last?.sceneId===row.sceneId&&last.start+last.dur===row.start){last.dur+=row.dur;last.count++;last.desc+=', P'+row.shotNumber;}
      else if(row.kind==='shot'){const scene=state.scenes.find(s=>s.id===row.sceneId);out.push({...row,kind:'scene',title:scene.slugline,number:scene.number,count:1,desc:'Planos: P'+row.shotNumber});}
      else out.push({...row});
    }
    return out;
  }
  const api={shots,allocate,sceneRows,rows,reorder,duration,move,syncDay,groups,addShot,removeScene};root.RodaShotPlanning=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
