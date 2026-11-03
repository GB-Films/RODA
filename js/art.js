/* Production inventory is independent of screenplay versions and calendar slots. */
(function(root){
 'use strict';
 const categories={art:'Arte / ambientación',props:'Utilería / props'};
 const statuses={pending:'Por conseguir',working:'En gestión',obtained:'Conseguido',ready:'En set'};
 const key=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
 const idFor=(category,name)=>category+':'+key(name);
 const records=state=>Array.isArray(state.artItems)?state.artItems:[];
 const defaults={quantity:1,unitPrice:null,currency:'ARS',status:'pending',responsible:'',notes:'',sceneIds:[],archived:false};
 function rows(state,scope='all'){
  const groups=new Map(),scenes=state.scenes||[],byId=new Map(scenes.map(s=>[s.id,s]));
  for(const scene of scenes)for(const category of Object.keys(categories))for(const raw of scene.elements?.[category]||[]){
   const name=String(raw||'').trim();if(!name)continue;
   const id=idFor(category,name);if(!groups.has(id))groups.set(id,{id,category,name,origin:'script',detected:true,sourceScenes:[]});
   const row=groups.get(id);if(!row.sourceScenes.includes(scene.id))row.sourceScenes.push(scene.id);
  }
  for(const saved of records(state)){
   const detected=groups.get(saved.id);
   groups.set(saved.id,{...saved,...(detected||{detected:false,sourceScenes:[]})});
  }
  const scheduled=new Set((state.shootDays||[]).flatMap(d=>d.sceneIds||[])),day=(state.shootDays||[]).find(d=>d.id===scope);
  return [...groups.values()].map(row=>{
   row={...defaults,...row};
   row.scenes=[...new Set([...row.sourceScenes,...row.sceneIds])].map(id=>byId.get(id)).filter(Boolean);
   row.total=row.unitPrice===null?null:Math.round(row.quantity*row.unitPrice*100)/100;
   row.obsolete=row.origin==='script'&&!row.detected;
   return row;
  }).filter(row=>scope==='all'||(scope==='unassigned'?(!row.scenes.length||row.scenes.some(s=>!scheduled.has(s.id))):day&&row.scenes.some(s=>day.sceneIds?.includes(s.id))))
   .sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true}));
 }
 function validItem(item){
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v),text=(v,n)=>typeof v==='string'&&v.length<=n;
  if(!object(item)||Object.keys(item).some(k=>!['id','category','name','origin',...Object.keys(defaults)].includes(k)))return false;
  if(!Object.hasOwn(categories,item.category)||!text(item.name,500)||!item.name.trim()||item.id!==idFor(item.category,item.name)||!['script','manual'].includes(item.origin))return false;
  if('quantity' in item&&(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100000))return false;
  if('unitPrice' in item&&item.unitPrice!==null&&(!Number.isFinite(item.unitPrice)||item.unitPrice<0||item.unitPrice>1e12))return false;
  if('currency' in item&&!['ARS','USD'].includes(item.currency)||'status' in item&&!Object.hasOwn(statuses,item.status))return false;
  if('responsible' in item&&!text(item.responsible,200)||'notes' in item&&!text(item.notes,3000)||'archived' in item&&typeof item.archived!=='boolean')return false;
  if('sceneIds' in item&&(!Array.isArray(item.sceneIds)||item.sceneIds.length>2000||item.sceneIds.some(id=>!text(id,200)||!id)||new Set(item.sceneIds).size!==item.sceneIds.length))return false;
  return true;
 }
 function validate(items){return Array.isArray(items)&&items.length<=3000&&items.every(validItem)&&new Set(items.map(i=>i.id)).size===items.length;}
 function update(state,id,field,value){
  if(!Object.hasOwn(defaults,field))throw Error('Campo de arte inválido.');
  const row=rows(state).find(r=>r.id===id);if(!row)throw Error('Este elemento ya no está disponible.');
  const saved=records(state).find(r=>r.id===id);
  const next={...(saved||{id,category:row.category,name:row.name,origin:row.origin}),[field]:value};
  if(!validItem(next))throw Error('Revisá el valor ingresado. La cantidad debe ser entera y el precio no puede ser negativo.');
  if(field==='sceneIds'&&value.some(sid=>!(state.scenes||[]).some(s=>s.id===sid)))throw Error('La escena ya no está disponible.');
  if(JSON.stringify(row[field])===JSON.stringify(value))return false;
  state.artItems??=[];
  if(saved)Object.assign(saved,next);else state.artItems.push(next);
  return true;
 }
 function add(state,{name,category='art',sceneIds=[]}){
  name=String(name||'').trim();const id=idFor(category,name);
  const item={id,category,name,origin:'manual',sceneIds};
  if(!validItem(item))throw Error('Ingresá un nombre válido para el elemento.');
  if(rows(state).some(row=>row.id===id))throw Error('Este elemento ya existe. Buscalo en la lista, también entre los archivados.');
  if(sceneIds.some(sid=>!(state.scenes||[]).some(s=>s.id===sid)))throw Error('La escena ya no está disponible.');
  state.artItems??=[];state.artItems.push(item);return id;
 }
 function totals(rows){
  const active=rows.filter(r=>!r.archived),money={};
  for(const row of active)if(row.total!==null)money[row.currency]=Math.round(((money[row.currency]||0)+row.total)*100)/100;
  return {count:active.length,ready:active.filter(r=>['obtained','ready'].includes(r.status)).length,pending:active.filter(r=>['pending','working'].includes(r.status)).length,unpriced:active.filter(r=>r.unitPrice===null).length,money};
 }
 const api={categories,statuses,key,idFor,rows,update,add,totals,validate};
 root.RodaArt=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
