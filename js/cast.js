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
 function unify(state,aliases){
  for(const scene of state.scenes||[]){scene.elements??={};scene.elements.cast=names(scene.elements.cast,aliases);if(scene.castManual)scene.castManual=names(scene.castManual,aliases);}
  // Never throw away casting or contact details when two names become one.
  const groups=new Map(),crew=[];
  for(const person of state.crew||[]){
   if(person.area!=='Cast'){crew.push(person);continue;}
   const role=canonical(person.role||person.name,aliases),id=key(role),existing=groups.get(id);
   if(!existing){person.role=role;groups.set(id,person);crew.push(person);}
   else{
    const archive={...person};existing.alternateAssignments??=[];existing.alternateAssignments.push(archive);
    for(const field of ['name','phone','email'])if(!existing[field])existing[field]=person[field]||'';
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
 const api={key,rules,canonical,names,mentioned,resolveScene,unify};root.RodaCast=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
