(function(root){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const base=day=>{const [h,m]=String(day.callTime||'08:00').split(':').map(Number);return h*60+m;};
  function rows(state,day,shots=false){
    if(shots||day.shotTimeline)return root.RodaShotPlanning.rows(state,day).map(r=>({...r}));
    return [...(day.sceneIds||[]).map(id=>({kind:'scene',key:'scene:'+id,id,sceneId:id,start:Number(day.times?.[id]??0),dur:Number(day.durations?.[id]??60)})),...(day.blocks||[]).map(b=>({kind:'block',key:'block:'+b.id,id:b.id,start:Number(b.startMin??0),dur:Number(b.durMin??30)}))].sort((a,b)=>a.start-b.start);
  }
  function validate(day,list){
    const sorted=[...list].sort((a,b)=>a.start-b.start),call=base(day),limit=day.night?1800:1440;
    if(new Set(list.map(r=>r.key)).size!==list.length)throw Error('Hay actividades duplicadas en esta jornada.');
    if(!Number.isFinite(call)||sorted.some(r=>!Number.isFinite(r.start)||!Number.isFinite(r.dur)||r.dur<=0||call+r.start<0||call+r.start+r.dur>limit))throw Error('El movimiento supera el horario disponible. Ajustá la hora o habilitá el horario nocturno.');
    if(sorted.some((r,i)=>i&&sorted[i-1].start+sorted[i-1].dur>r.start))throw Error('Hay actividades superpuestas. Revisá los horarios antes de moverlas.');
  }
  function keysFor(list,keys){return new Set(list.filter(r=>keys.includes(r.key)||keys.includes('scene:'+r.sceneId)).map(r=>r.key));}
  function write(state,day,list,allBlocks,shotMode){
    day.blocks=list.filter(r=>r.kind==='block').map(r=>({...clone(allBlocks.get(r.id)),startMin:r.start,durMin:r.dur}));
    if(shotMode){root.RodaShotPlanning.storeRows(state,day,list);return;}
    const ids=list.filter(r=>r.kind==='scene').map(r=>r.sceneId);
    day.sceneIds=[...(day.sceneIds||[]).filter(id=>ids.includes(id)),...ids.filter(id=>!(day.sceneIds||[]).includes(id))];day.times={};day.durations={};
    for(const r of list)if(r.kind==='scene'){day.times[r.sceneId]=r.start;day.durations[r.sceneId]=r.dur;}
  }
  function move(state,source,keys,target=source,options={}){
    if(!source||!target)return false;
    const same=source.id===target.id,shotMode=!!(options.shots||source.shotTimeline||target.shotTimeline);
    let a=rows(state,source,shotMode),b=same?a:rows(state,target,shotMode);
    validate(source,a);if(!same)validate(target,b);
    const selected=keysFor(a,keys),moving=a.filter(r=>selected.has(r.key));if(!moving.length)return false;
    const originalA=JSON.stringify(a),originalB=JSON.stringify(b);
    const targetKeys=keysFor(b,options.targetKeys||[options.targetKey].filter(Boolean));
    const hit=b.filter(r=>targetKeys.has(r.key));
    if((options.targetKey||options.targetKeys?.length)&&!hit.length)throw Error('El destino cambió. Volvé a elegir dónde ubicar las actividades.');
    if(same&&hit.some(r=>selected.has(r.key)))return false;
    if(!same&&moving.some(r=>b.some(t=>t.key===r.key)))throw Error('Una de las actividades ya está en la jornada de destino.');
    if(options.swap){
      if(!hit.length)throw Error('Elegí otra actividad para intercambiar.');
      if(same){
        // Exchange contiguous groups while preserving the rest of this interval,
        // its deliberate gaps, and its exact finishing time.
        const ix=moving.map(r=>a.indexOf(r)),iy=hit.map(r=>a.indexOf(r));
        if(ix.at(-1)-ix[0]+1!==ix.length||iy.at(-1)-iy[0]+1!==iy.length)throw Error('Para intercambiar, seleccioná actividades consecutivas.');
        const left=ix[0]<iy[0]?ix:iy,right=ix[0]<iy[0]?iy:ix,lo=left[0],hi=right.at(-1);
        const region=a.slice(lo,hi+1),gaps=region.slice(1).map((r,i)=>r.start-region[i].start-region[i].dur);
        const reordered=[...a.slice(right[0],hi+1),...a.slice(left.at(-1)+1,right[0]),...a.slice(lo,left.at(-1)+1)];
        let cursor=region[0].start;reordered.forEach((r,i)=>{r.start=cursor;cursor+=r.dur+(gaps[i]||0);});a.splice(lo,region.length,...reordered);b=a;
      }else{
        const exchange=(list,out,incoming)=>{const first=out[0].start,last=out.at(-1).start+out.at(-1).dur;
          if(list.filter(r=>r.start>=first&&r.start<last).length!==out.length)throw Error('Para intercambiar, seleccioná actividades consecutivas.');
          const width=out.reduce((n,r)=>n+r.dur,0),newWidth=incoming.reduce((n,r)=>n+r.dur,0),ids=new Set(out.map(r=>r.key));
          const result=list.filter(r=>!ids.has(r.key));for(const r of result)if(r.start>=last)r.start+=newWidth-width;
          let cursor=first;for(const row of incoming){result.push({...row,start:cursor});cursor+=row.dur;}return result.sort((x,y)=>x.start-y.start);};
        const ma=moving.map(r=>({...r})),mb=hit.map(r=>({...r}));a=exchange(a,moving,mb);b=exchange(b,hit,ma);
      }
    }else if(Number.isFinite(options.delta)){
      if(!same)return false;
      for(const r of moving)r.start+=options.delta;
      // Group translation keeps internal spacing; only collisions below it ripple.
      const fixed=a.filter(r=>!selected.has(r.key)).sort((x,y)=>x.start-y.start);
      const placed=[...moving].sort((x,y)=>x.start-y.start);
      for(const r of fixed){let end;do{end=placed.filter(p=>r.start<p.start+p.dur&&r.start+r.dur>p.start).reduce((n,p)=>Math.max(n,p.start+p.dur),r.start);if(end!==r.start)r.start=end;else break;}while(true);placed.push(r);}
      a=placed.sort((x,y)=>x.start-y.start);b=a;
    }else{
      // Remove exactly the selected durations; deliberate idle gaps remain.
      const originals=moving.map(r=>({...r}));
      const remaining=a.filter(r=>!selected.has(r.key));for(const r of remaining)r.start-=originals.filter(s=>s.start+s.dur<=r.start).reduce((n,s)=>n+s.dur,0);
      a=remaining;if(same)b=a;
      let at,start;
      if(hit.length){const boundary=options.position==='after'?hit.at(-1):hit[0],i=b.findIndex(r=>r.key===boundary.key);at=i+(options.position==='after'?1:0);start=options.position==='after'?b[i].start+b[i].dur:b[i].start;}
      else if(Number.isFinite(options.start)){start=options.start;at=b.findIndex(r=>r.start>=start);if(at<0)at=b.length;}
      else {at=b.length;start=b.length?b.at(-1).start+b.at(-1).dur:0;}
      const total=originals.reduce((n,r)=>n+r.dur,0);for(let i=at;i<b.length;i++)b[i].start+=total;
      let cursor=start;const inserted=originals.map(r=>{const row={...r,start:cursor};cursor+=r.dur;return row;});b.splice(at,0,...inserted);
      if(same)a=b;
    }
    a.sort((x,y)=>x.start-y.start);b.sort((x,y)=>x.start-y.start);validate(source,a);if(!same)validate(target,b);
    if(originalA===JSON.stringify(a)&&originalB===JSON.stringify(b))return false;
    const nextA=clone(source),nextB=same?nextA:clone(target),blocks=new Map([...(source.blocks||[]),...(target.blocks||[])].map(r=>[r.id,r]));
    write(state,nextA,a,blocks,shotMode);if(!same)write(state,nextB,b,blocks,shotMode);
    if(!same){
      // Metadata follows transferred scenes; partial shot days keep their own settings.
      const transfer=(from,to,fromNext,toNext,fromRows,toRows)=>{
        const remaining=new Set(fromRows.map(r=>r.key)),arrived=new Set(toRows.map(r=>r.key));
        const moved=rows(state,from,shotMode).filter(r=>!remaining.has(r.key)&&arrived.has(r.key));
        for(const id of new Set(moved.map(r=>r.sceneId).filter(Boolean)))for(const field of ['sceneColors','shotPlanning','castSceneExclusions','callHiddenScenes','shotsDone']){
          if(from[field]?.[id]===undefined)continue;
          toNext[field]??={};if(toNext[field][id]===undefined||!(to.sceneIds||[]).includes(id))toNext[field][id]=clone(from[field][id]);
          if(!fromNext.sceneIds.includes(id))delete fromNext[field][id];
        }
        for(const row of moved)if(row.kind==='shot'&&from.shotsDone?.[row.key]!==undefined){toNext.shotsDone??={};toNext.shotsDone[row.key]=clone(from.shotsDone[row.key]);delete fromNext.shotsDone[row.key];}
      };
      transfer(source,target,nextA,nextB,a,b);transfer(target,source,nextB,nextA,b,a);
    }
    Object.assign(source,nextA);if(!same)Object.assign(target,nextB);return true;
  }
  const api={rows,move,validate};root.RodaPlanningMovement=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
