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
 function resolveScene(scene,detected,previous,aliases=[]){
  const manual=previous?.castManual||[],unchanged=previous?.summary===scene.body;
  return names([...detected,...manual.filter(name=>unchanged||mentioned(name,scene.body,aliases))],aliases);
 }
 const isPerson=person=>person.area==='Cast'&&!person.castProfile&&(person.castPerson||['name','phone','email'].some(field=>!!String(person[field]||'').trim()));
 const people=state=>(state.crew||[]).filter(isPerson);
 const profileFor=(state,name)=>(state.crew||[]).find(p=>p.area==='Cast'&&p.castProfile&&key(p.role)===key(name));
 function actorFor(state,name){
  const profile=profileFor(state,name);
  if(profile)return people(state).find(p=>p.id===profile.actorId)||null;
  return people(state).find(p=>!p.castPerson&&key(p.role||p.name)===key(name))||null;
 }
 function typeFor(state,name){
  return profileFor(state,name)?.castType||(state.crew||[]).find(p=>p.area==='Cast'&&!p.castPerson&&key(p.role||p.name)===key(name))?.castType||'character';
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
 const api={key,rules,canonical,names,mentioned,resolveScene,unify,isPerson,people,profileFor,actorFor,typeFor,ensureProfile,assign,setType,roster,personRoles,preparePerson,removePerson};root.RodaCast=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
