(function(root){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  const sceneKey=s=>normalize(s.chapter)+'|'+normalize(s.number).replace(/^0+(?=\d)/,'');
  const heading=s=>normalize(s.chapter)+'|'+normalize(s.slugline);
  const body=s=>normalize(s.body??s.summary);
  // Scene numbers alone cannot identify a scene after an insertion or renumbering.
  function matchScenes(previous,incoming){
    const matches=incoming.map(()=>null),used=new Set();
    function unique(key){
      const old=new Map(),fresh=new Map();
      previous.forEach((s,i)=>{if(used.has(i))return;const k=key(s);if(k)(old.get(k)||old.set(k,[]).get(k)).push(i);});
      incoming.forEach((s,i)=>{if(matches[i]!==null)return;const k=key(s);if(k)(fresh.get(k)||fresh.set(k,[]).get(k)).push(i);});
      for(const [k,indices]of fresh){const candidates=old.get(k);if(indices.length===1&&candidates?.length===1){matches[indices[0]]=candidates[0];used.add(candidates[0]);}}
    }
    unique(s=>body(s)?heading(s)+'|'+body(s):'');
    unique(s=>body(s).length>=24?normalize(s.chapter)+'|'+body(s):'');
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
    state.script.activeVersionId=version.id;version.appliedAt=new Date().toISOString();
    return {added,updated,retained:state.scenes.filter(s=>!used.has(s.id)).length};
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
