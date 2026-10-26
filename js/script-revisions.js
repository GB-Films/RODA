(function(root){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  const sceneKey=s=>normalize(s.chapter)+'|'+normalize(s.number).replace(/^0+(?=\d)/,'');
  const heading=s=>normalize(s.chapter)+'|'+normalize(s.slugline);
  const body=s=>normalize(s.body??s.summary);
  function similarity(a,b,cache){
    const grams=s=>{if(cache.has(s))return cache.get(s);const words=body(s).replace(/[^\p{L}\p{N} ]/gu,' ').split(/\s+/).filter(Boolean),result=new Set(words.slice(2).map((_,i)=>words.slice(i,i+3).join(' ')));cache.set(s,result);return result;};
    const x=grams(a),y=grams(b);if(Math.min(x.size,y.size)<6)return 0;
    let shared=0;for(const token of x)if(y.has(token))shared++;return shared/(x.size+y.size-shared);
  }
  // Scene numbers alone cannot identify a scene after an insertion or renumbering.
  function matchScenes(previous,incoming){
    const matches=incoming.map(()=>null),used=new Set(),similarities=new Map();
    function unique(key){
      const old=new Map(),fresh=new Map();
      previous.forEach((s,i)=>{if(used.has(i))return;const k=key(s);if(k)(old.get(k)||old.set(k,[]).get(k)).push(i);});
      incoming.forEach((s,i)=>{if(matches[i]!==null)return;const k=key(s);if(k)(fresh.get(k)||fresh.set(k,[]).get(k)).push(i);});
      for(const [k,indices]of fresh){const candidates=old.get(k);if(indices.length===1&&candidates?.length===1){matches[indices[0]]=candidates[0];used.add(candidates[0]);}}
    }
    unique(s=>body(s)?heading(s)+'|'+body(s):'');
    unique(s=>body(s).length>=24?normalize(s.chapter)+'|'+body(s):'');
    // Compare distinctive action before falling back to headings: locations repeat
    // and script revisions often insert dialogue or change scene numbers.
    incoming.forEach((s,i)=>{
      if(matches[i]!==null)return;
      const ranked=previous.map((p,index)=>({index,score:!used.has(index)&&normalize(p.chapter)===normalize(s.chapter)?similarity(p,s,similarities):0})).sort((a,b)=>b.score-a.score);
      const best=ranked[0];if(!best||best.score<.55||best.score-(ranked[1]?.score||0)<.15)return;
      const competing=incoming.some((other,j)=>j!==i&&matches[j]===null&&similarity(previous[best.index],other,similarities)>=best.score-.15);
      if(!competing){matches[i]=best.index;used.add(best.index);}
    });
    unique(heading);
    // Repeated locations with edited action can be paired in order only when their counts agree.
    const groups=new Map();
    incoming.forEach((s,i)=>{if(matches[i]===null)(groups.get(heading(s))||groups.set(heading(s),[]).get(heading(s))).push(i);});
    for(const [key,indices]of groups){const old=previous.map((s,i)=>({s,i})).filter(({s,i})=>!used.has(i)&&heading(s)===key);if(old.length===indices.length)indices.forEach((idx,n)=>{matches[idx]=old[n].i;used.add(old[n].i);});}
    const stableNumbers=previous.length===incoming.length&&matches.every((old,i)=>old===null||sceneKey(previous[old])===sceneKey(incoming[i]));
    if(stableNumbers)unique(sceneKey);
    return matches;
  }
  function applyProduction(state,version,{createId,breakdown,headingMetadata,normalizeTOD=value=>value,previousScenes}={}){
    const before=structuredClone(state.scenes),daysBefore=structuredClone(state.shootDays||[]);
    const previous=previousScenes??state.script.versions.find(v=>v.id===state.script.activeVersionId)?.scenes??[];
    const old=previous.length?previous:state.scenes;
    const matches=matchScenes(old,version.scenes||[]),byId=new Map(state.scenes.map(s=>[s.id,s])),used=new Set();
    const byKey=new Map();for(const s of state.scenes){const key=sceneKey(s);(byKey.get(key)||byKey.set(key,[]).get(key)).push(s);}
    let added=0,updated=0;
    for(const [i,sc]of (version.scenes||[]).entries()){
      const prior=matches[i]===null?null:old[matches[i]];
      let existing=byId.get(sc.productionSceneId)||byId.get(prior?.productionSceneId)||byId.get(prior?.id);
      if(!existing&&prior){const candidates=byKey.get(sceneKey(prior));if(candidates?.length===1)existing=candidates[0];}
      if(existing&&used.has(existing.id))existing=null;
      const slugline=String(sc.slugline||existing?.slugline||'').trim(),meta=headingMetadata(slugline),detected=breakdown(sc);
      const values={number:String(sc.number||'').replace(/^0+(?=\d)/,'').toUpperCase(),chapter:sc.chapter??'',slugline,intExt:sc.intExt||meta.intExt||existing?.intExt||'',location:sc.location||meta.location||existing?.location||'',timeOfDay:normalizeTOD(sc.timeOfDay||meta.timeOfDay||existing?.timeOfDay||''),summary:String(sc.body??sc.summary??existing?.summary??'').trim(),scriptVersionId:version.id};
      if(existing){
        Object.assign(existing,values);existing.elements??={};
        for(const [cat,items]of Object.entries(detected))existing.elements[cat]=[...new Set([...(existing.elements[cat]||[]),...items])];
        updated++;
      }else{
        existing={id:createId(),...values,pages:0,notes:'',elements:detected,shots:[]};
        state.scenes.push(existing);added++;
      }
      used.add(existing.id);sc.productionSceneId=existing.id;
    }
    // Only the selected screenplay belongs in the active scene bank. Older imports
    // can have different IDs for the same scene: transfer their work before retiring them.
    const aliases=new Map();
    for(const oldScene of state.scenes.filter(s=>!used.has(s.id))){
      const [match]=matchScenes(version.scenes,[oldScene]);
      const destination=match===null?null:byId.get(version.scenes[match].productionSceneId)||state.scenes.find(s=>s.id===version.scenes[match].productionSceneId);
      if(destination){
        aliases.set(oldScene.id,destination.id);
        if(oldScene.notes&&!destination.notes?.includes(oldScene.notes))destination.notes=[destination.notes,oldScene.notes].filter(Boolean).join('\n\n');
        destination.shots=[...(destination.shots||[]),...(oldScene.shots||[]).filter(s=>!destination.shots?.some(t=>t.id===s.id))];
        destination.shootingLocationId||=oldScene.shootingLocationId||'';
        for(const [category,items]of Object.entries(oldScene.elements||{}))destination.elements[category]=[...new Set([...(destination.elements[category]||[]),...items])];
      }
    }
    const retired=before.filter(s=>!used.has(s.id));
    if(retired.length){
      state.productionArchive??={};
      for(const scene of retired)state.productionArchive[scene.id]={scene,versionId:version.id,mergedInto:aliases.get(scene.id)||null,days:daysBefore.filter(d=>d.sceneIds?.includes(scene.id)).map(d=>({id:d.id,date:d.date,callTime:d.callTime,sceneIndex:d.sceneIds.indexOf(scene.id),time:d.times?.[scene.id],duration:d.durations?.[scene.id],color:d.sceneColors?.[scene.id],shotsDone:d.shotsDone||{}}))};
    }
    state.scenes=state.scenes.filter(s=>used.has(s.id));
    for(const day of state.shootDays||[]){
      const ids=day.sceneIds||[];
      for(const key of ['times','durations','sceneColors'])if(day[key]){
        const previous=day[key],next={};
        // Existing current-scene settings win over an older duplicate's settings.
        for(const id of ids.filter(id=>used.has(id)))if(previous[id]!==undefined)next[id]=previous[id];
        for(const id of ids){const to=aliases.get(id);if(to&&next[to]===undefined&&previous[id]!==undefined)next[to]=previous[id];}
        day[key]=next;
      }
      day.sceneIds=[...new Set(ids.map(id=>aliases.get(id)||id).filter(id=>used.has(id)))];
    }
    state.script.activeVersionId=version.id;version.appliedAt=new Date().toISOString();version.productionSyncVersion=2;
    return {added,updated,retained:0,archived:retired.length,merged:aliases.size};
  }
  function storeVersion(script,version,{mode='new',targetId}={}){
    if(!['new','replace'].includes(mode))throw Error('Elegí cómo guardar la actualización.');
    if(mode==='replace'){
      const index=script.versions.findIndex(v=>v.id===targetId&&!v.draft);
      if(index<0)throw Error('La versión a reemplazar ya no está disponible. Volvé a cargar el guion.');
      const old=script.versions[index];version={...version,id:old.id,name:old.name,createdAt:old.createdAt};
      script.versions[index]=version;
    }else script.versions.push(version);
    return version;
  }
  const api={matchScenes,applyProduction,storeVersion};root.RodaScriptRevisions=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
