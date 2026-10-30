(function(root){
 const key=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toUpperCase();
 function rules(text){
  const result=String(text||'').split(/\r?\n/).filter(s=>s.trim()).map(line=>{
   const [name,...rest]=line.split('=');if(!name.trim()||!rest.length)throw Error('Usá Nombre del personaje = variantes, separadas por coma.');
   return {name:name.trim().toUpperCase(),aliases:rest.join('=').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean)};
  });
  const owners=new Map();for(const row of result)for(const alias of [row.name,...row.aliases]){const old=owners.get(key(alias));if(old&&old!==key(row.name))throw Error('Un nombre no puede pertenecer a dos personajes: '+alias);owners.set(key(alias),key(row.name));}return result;
 }
 function canonical(name,aliases=[]){
  const found=aliases.find(row=>key(row.name)===key(name)||row.aliases?.some(alias=>key(alias)===key(name)));
  return found?.name||String(name||'').trim();
 }
 function names(items,aliases=[]){
  const seen=new Set(),out=[];for(const name of items||[]){const value=canonical(name,aliases),id=key(value);if(id&&!seen.has(id)){seen.add(id);out.push(value);}}return out;
 }
 function mentioned(name,text,aliases=[]){
  const row=aliases.find(row=>key(row.name)===key(name)),variants=[name,...(row?.aliases||[])],hay=' '+key(text)+' ';
  return variants.some(value=>hay.includes(' '+key(value)+' '));
 }
 function scriptTarget(state,sceneId,name){
  const scene=(state.scenes||[]).find(s=>s.id===sceneId),version=state.script?.versions?.find(v=>v.id===state.script.activeVersionId&&!v.draft);
  if(!scene||!version)return null;
  const sceneKey=s=>key(s.chapter)+'|'+String(s.number||'').trim().replace(/^0+(?=\d)/,'').toUpperCase();
  let index=(version.scenes||[]).findIndex(s=>s.productionSceneId===sceneId||s.id===sceneId);
  if(index<0){const candidates=(version.scenes||[]).map((s,i)=>({s,i})).filter(({s})=>sceneKey(s)===sceneKey(scene));if(candidates.length===1)index=candidates[0].i;}
  if(index<0)return null;
  const source=version.scenes[index],row=(state.script.castAliases||[]).find(r=>key(r.name)===key(name)||r.aliases?.some(a=>key(a)===key(name)));
  return {versionId:version.id,index,number:source.number,chapter:source.chapter||'',variants:[...new Set([row?.name||name,...(row?.aliases||[])].filter(Boolean))]};
 }
 function resolveScene(scene,detected,previous,aliases=[]){
  const manual=previous?.castManual||[],unchanged=previous?.summary===scene.body;
  return names([...detected,...manual.filter(name=>unchanged||mentioned(name,scene.body,aliases))],aliases);
 }
 function personNameParts(person){
  if('firstName' in person || 'lastName' in person)return {firstName:String(person.firstName||''),lastName:String(person.lastName||'')};
  const full=String(person.name||'').trim(),parts=full.split(/\s+/);
  // Two-part legacy names can be separated without guessing compound names.
  return parts.length===2?{firstName:parts[0],lastName:parts[1]}:{firstName:full,lastName:''};
 }
 function syncPersonName(person){if('firstName' in person || 'lastName' in person)person.name=[person.firstName,person.lastName].map(v=>String(v||'').trim()).filter(Boolean).join(' ');return person;}
 function setPersonName(person,firstName,lastName){Object.assign(person,{firstName,lastName});return syncPersonName(person);}
 const isPerson=person=>person.area==='Cast'&&!person.castProfile&&!person.mergedInto&&(person.castPerson||['name','phone','email'].some(field=>!!String(person[field]||'').trim()));
 const people=state=>(state.crew||[]).filter(isPerson);
 const profileFor=(state,name)=>(state.crew||[]).find(p=>p.area==='Cast'&&p.castProfile&&key(p.role)===key(name));
 function actorFor(state,name){
  const profile=profileFor(state,name);
  if(profile)return people(state).find(p=>p.id===resolvedPersonId(state,profile.actorId))||null;
  return people(state).find(p=>!p.castPerson&&key(p.role||p.name)===key(name))||null;
 }
 function typeFor(state,name){
  const stored=profileFor(state,name)?.castType||(state.crew||[]).find(p=>p.area==='Cast'&&!p.castPerson&&key(p.role||p.name)===key(name))?.castType||'character';
  // Older breakdowns marked individually identified supporting roles as extras.
  // Resolve their aliases too, so renaming a hostage keeps the same classification.
  const row=state.script?.castAliases?.find(r=>key(r.name)===key(name));
  const identified=[name,...(row?.aliases||[])].some(n=>/^(?:SECUAZ|REHEN|POLICIA|GUARDAESPALDAS|SEGURIDAD|AGENTE(?: SWAT)?) \d+(?: |$)/.test(key(n)));
  return stored==='extra'&&identified?'character':stored;
 }
 function ensureProfile(state,name){
  const existing=profileFor(state,name);if(existing)return existing;
  const actor=actorFor(state,name),type=typeFor(state,name);
  let profile=(state.crew||[]).find(p=>p.area==='Cast'&&!isPerson(p)&&!p.castPerson&&key(p.role)===key(name));
  if(!profile){
   // All sessions create the same record for a character, so simultaneous choices
   // resolve on actorId instead of assigning two people to the same role.
   let hash=14695981039346656037n;for(const byte of new TextEncoder().encode(key(name)))hash=BigInt.asUintN(64,(hash^BigInt(byte))*1099511628211n);
   profile={id:'cast-role-'+hash.toString(16),area:'Cast',role:name};state.crew.push(profile);
  }
  Object.assign(profile,{castProfile:true,actorId:actor?.id||'',castType:type});return profile;
 }
 function assign(state,name,actorId){
  if(actorId&&!people(state).some(p=>p.id===actorId&&String(p.name||'').trim()))throw Error('Elegí un actor o actriz del equipo.');
  ensureProfile(state,name).actorId=actorId||'';
 }
 const setType=(state,name,type)=>{if(!['character','extra','voice'].includes(type))throw Error('Participación inválida.');ensureProfile(state,name).castType=type;};
 function roster(state){const scenes=(state.scenes||[]).flatMap(s=>s.elements?.cast||[]),stored=(state.crew||[]).filter(p=>p.area==='Cast'&&!p.castPerson).map(p=>p.role||(!p.castProfile?p.name:''));return names(state.script?.activeVersionId?scenes:[...scenes,...stored]).filter(Boolean);}
 function personRoles(state,id){return roster(state).filter(name=>actorFor(state,name)?.id===id);}
 function preparePerson(state,person){
  if(person.area==='Cast'&&!person.castPerson&&!person.castProfile){
   if(String(person.role||'').trim()){ensureProfile(state,person.role);person.legacyRole=person.role;}
   person.castPerson=true;person.role='Actor / actriz';
  }
  return person;
 }
 function duplicates(state,person){return person?.area==='Cast'&&key(person.name)?people(state).filter(p=>p.id!==person.id&&key(p.name)===key(person.name)):[];}
 function resolvedPersonId(state,id){const seen=new Set();let person=(state.crew||[]).find(p=>p.id===id);while(person?.mergedInto&&!seen.has(person.id)){seen.add(person.id);person=state.crew.find(p=>p.id===person.mergedInto);}return person&&!person.mergedInto?person.id:id;}
 function reconcileMergedPeople(state){
  const byId=new Map((state.crew||[]).map(p=>[p.id,p]));
  for(const profile of state.crew||[]){if(!profile.castProfile||!profile.actorId)continue;const seen=new Set();let actor=byId.get(profile.actorId);while(actor?.mergedInto&&!seen.has(actor.id)){seen.add(actor.id);actor=byId.get(actor.mergedInto);}if(actor&&!actor.mergedInto)profile.actorId=actor.id;}
 }
 function mergePeople(state,sourceId,targetId){
  const source=people(state).find(p=>p.id===sourceId),target=people(state).find(p=>p.id===targetId);
  if(!source||!target||!duplicates(state,source).some(p=>p.id===targetId))throw Error('Elegí dos fichas activas de la misma persona.');
  // Materialize legacy character assignments before hiding either person record.
  for(const name of [...personRoles(state,sourceId),...personRoles(state,targetId)])ensureProfile(state,name);
  preparePerson(state,source);preparePerson(state,target);
  source.mergedProfileIds=(state.crew||[]).filter(p=>p.castProfile&&p.actorId===sourceId).map(p=>p.id);
  source.mergedInto=targetId;
  for(const field of ['phone','email','notes']){const from=String(source[field]||'').trim(),to=String(target[field]||'').trim();if(from&&from!==to)target[field]=to?to+(field==='email'?'; ':' · ')+from:source[field];}
  const reserved=new Set(['id','name','firstName','lastName','role','area','castPerson','legacyRole','mergedInto','mergedProfileIds']);
  for(const [field,value]of Object.entries(source))if(value!==undefined&&!reserved.has(field)&&(target[field]===undefined||target[field]===''))target[field]=JSON.parse(JSON.stringify(value));
  // The complete original record remains recoverable through Equipo > Unificaciones.
  reconcileMergedPeople(state);return target;
 }
 function restorePerson(state,id){
  const person=(state.crew||[]).find(p=>p.id===id);if(!person?.mergedInto)return false;
  const targetId=resolvedPersonId(state,person.mergedInto);delete person.mergedInto;
  for(const profileId of person.mergedProfileIds||[]){const profile=state.crew.find(p=>p.id===profileId);if(profile&&(profile.actorId===targetId||!profile.actorId))profile.actorId=id;}
  delete person.mergedProfileIds;return true;
 }
 function removePerson(state,id){for(const name of personRoles(state,id))ensureProfile(state,name);for(const p of state.crew||[])if(p.castProfile&&p.actorId===id)p.actorId='';state.crew=(state.crew||[]).filter(p=>p.id!==id);}
 function unify(state,aliases){
  for(const scene of state.scenes||[]){scene.elements??={};scene.elements.cast=names(scene.elements.cast,aliases);if(scene.castManual)scene.castManual=names(scene.castManual,aliases);}
  // Never throw away casting or contact details when two names become one.
  const groups=new Map(),crew=[];
  for(const person of state.crew||[]){
   if(person.area!=='Cast'||person.castPerson){crew.push(person);continue;}
   const role=canonical(person.role||person.name,aliases),id=(person.castProfile?'profile:':'legacy:')+key(role)+(!person.castProfile?':'+key(person.name):''),existing=groups.get(id);
   if(!existing){person.role=role;groups.set(id,person);crew.push(person);}
   else{
    const archive={...person};existing.alternateAssignments??=[];existing.alternateAssignments.push(archive);
    for(const profile of state.crew||[])if(profile.castProfile&&profile.actorId===person.id)profile.actorId=existing.id;
    for(const field of ['name','phone','email','castType'])if(!existing[field]&&person[field])existing[field]=person[field];
    if(existing.actorId===undefined&&person.actorId!==undefined)existing.actorId=person.actorId;
    if(person.notes&&!existing.notes?.includes(person.notes))existing.notes=[existing.notes,person.notes].filter(Boolean).join('\n');
   }
  }
  state.crew=crew;
  for(const day of state.shootDays||[])for(const field of ['castCallTimes','castPickUpTimes','castRTSTimes']){
   const before=day[field];if(!before)continue;const after={};
   for(const [name,value]of Object.entries(before)){const to=canonical(name,aliases);if(after[to]===undefined)after[to]=value;else if(after[to]!==value){day.castTimeHistory??=[];day.castTimeHistory.push({field,name,value});}}
   day[field]=after;
  }
  state.script??={versions:[]};state.script.castAliases=aliases;
 }
 // Shooting windows follow person IDs, so an actor playing several roles gets one span.
 function dayRoster(state,day){
  const aliases=state.script?.castAliases||[];
  return names([...(day.sceneIds||[]).flatMap(id=>{
   const scene=state.scenes.find(s=>s.id===id),excluded=new Set((day.castSceneExclusions?.[id]||[]).map(key));
   return (scene?.elements?.cast||[]).filter(n=>!excluded.has(key(n)));
  }),...(day.blocks||[]).flatMap(b=>b.castNames||[])],aliases);
 }
 function workWindow(state,day,name){
  const actor=actorFor(state,name),same=n=>key(n)===key(name)||(actor&&actorFor(state,n)?.id===actor.id);
  const entries=[];
  for(const id of day.sceneIds||[]){
   const scene=state.scenes.find(s=>s.id===id),excluded=new Set((day.castSceneExclusions?.[id]||[]).map(key));
   if((scene?.elements?.cast||[]).some(n=>!excluded.has(key(n))&&same(n))&&Number.isFinite(day.times?.[id]))entries.push({start:day.times[id],end:day.times[id]+Number(day.durations?.[id]||60)});
  }
  for(const b of day.blocks||[])if((b.castNames||[]).some(same))entries.push({start:b.startMin,end:b.startMin+b.durMin});
  if(!entries.length)return null;
  const [h,m]=String(day.callTime||'08:00').split(':').map(Number),base=h*60+m;
  const first=base+Math.min(...entries.map(e=>e.start)),last=base+Math.max(...entries.map(e=>e.end));
  const arrival=(day.blocks||[]).find(b=>b.blockType==='arrival');
  const call=Math.max(base+(arrival?.startMin||0),first-Number(day.castPrepMin??30));
  const clock=n=>String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  return {first:clock(first),end:clock(last),call:clock(call)};
 }
 const api={scriptTarget,dayRoster,workWindow,duplicates,reconcileMergedPeople,mergePeople,restorePerson,personNameParts,syncPersonName,setPersonName,key,rules,canonical,names,mentioned,resolveScene,unify,isPerson,people,profileFor,actorFor,typeFor,ensureProfile,assign,setType,roster,personRoles,preparePerson,removePerson};root.RodaCast=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
