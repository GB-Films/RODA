(function(root){
 'use strict';
 const empty=()=>({points:[],geocodes:{},days:{}}), data=s=>s.logistics||empty();
 const people=s=>{const rows=new Map();for(const p of [...(s.logisticsPeople||[]),...(s.crew||[])])rows.set(p.id,{...rows.get(p.id),...p});return [...rows.values()];};
 function roster(s,d){
  const crew=people(s),state={...s,crew},byId=new Map(crew.filter(p=>!p.mergedInto&&!p.castProfile).map(p=>[p.id,p])),result=new Map(),missing=[];
  function add(p,role,kind){if(!p)return;const r=result.get(p.id)||{...p,roles:[],kind};if(kind==='cast')r.kind='cast';if(role&&!r.roles.includes(role))r.roles.push(role);result.set(p.id,r);}
  for(const id of d.crewIds||[])if(!root.RodaCallSheet.crewRemoved(d,id)){const p=byId.get(id);add(p,p?.role,p?.area==='Cast'?'cast':'crew');}
  for(const name of root.RodaCallSheet.roster(state,d)){const p=root.RodaCast.actorFor(state,name);if(p&&!p.mergedInto)add(p,name,'cast');else missing.push(name);}
  return {people:[...result.values()].sort((a,b)=>(a.name||'').localeCompare(b.name||'','es')),missing};
 }
 const leg=(s,id,direction)=>data(s).days[id]?.[direction]||{vehicles:[],assignments:{}};
 function ensure(s,id,direction){if(!(s.shootDays||[]).some(d=>d.id===id)||!['ida','vuelta'].includes(direction))throw Error('Elegí una jornada válida.');s.logistics??=empty();s.logistics.days[id]??={};return s.logistics.days[id][direction]??={vehicles:[],assignments:{}};}
 function status(s,d,direction,p){const l=leg(s,d.id,direction),a=l.assignments[p.id]||{};return a.mode==='self'?'self':a.mode==='vehicle'&&l.vehicles.some(v=>v.id===a.vehicleId)?'vehicle':'pending';}
 function occupancy(s,d,direction,v){const l=leg(s,d.id,direction);return roster(s,d).people.filter(p=>status(s,d,direction,p)==='vehicle'&&l.assignments[p.id]?.vehicleId===v.id).length;}
 function assign(s,id,direction,personId,mode,vehicleId=''){
  const d=s.shootDays.find(d=>d.id===id),l=ensure(s,id,direction);if(!roster(s,d).people.some(p=>p.id===personId))throw Error('Esta persona ya no está citada.');
  if(!['pending','self','vehicle'].includes(mode))throw Error('Traslado inválido.');
  if(mode==='vehicle'){const v=l.vehicles.find(v=>v.id===vehicleId);if(!v)throw Error('El vehículo ya no existe.');const passengers=roster(s,d).people.filter(p=>p.id!==personId&&l.assignments[p.id]?.mode==='vehicle'&&l.assignments[p.id]?.vehicleId===vehicleId);if(passengers.length>=v.capacity)throw Error('No quedan plazas disponibles en ese vehículo.');}
  l.assignments[personId]={...(l.assignments[personId]||{}),mode,vehicleId:mode==='vehicle'?vehicleId:''};
 }
 function markers(s,scope='all'){
  const days=scope==='all'?(s.shootDays||[]):(s.shootDays||[]).filter(d=>d.id===scope),persons=new Map();
  for(const d of days)for(const p of roster(s,d).people){const old=persons.get(p.id);persons.set(p.id,{...p,kind:old?.kind==='cast'?'cast':p.kind});}
  if(scope==='all')for(const p of people(s))if(!p.castProfile&&!p.mergedInto&&!persons.has(p.id))persons.set(p.id,{...p,kind:p.area==='Cast'?'cast':'crew'});
  const sceneIds=new Set(days.flatMap(d=>d.sceneIds||[])),locationIds=new Set((s.scenes||[]).filter(sc=>sceneIds.has(sc.id)).map(sc=>sc.shootingLocationId));
  const rows=[...[...persons.values()].map(p=>({id:'person:'+p.id,name:p.name||'Sin nombre',address:p.address||'',kind:p.kind})),...(s.shootingLocations||[]).filter(l=>scope==='all'||locationIds.has(l.id)).map(l=>({id:'location:'+l.id,name:l.name,address:l.address||'',kind:'location'})),...data(s).points.filter(p=>scope==='all'||!p.dayIds.length||p.dayIds.includes(scope)).map(p=>({...p,id:'point:'+p.id,kind:'point'}))];
  return rows.map(r=>{const geo=data(s).geocodes[r.id];return {...r,geo:geo?.address===r.address?geo:addressInfo(r.address).geo};});
 }
 function addressInfo(value){
  const address=String(value||'').trim(),empty={url:'',query:'',geo:null},search=q=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q);
  if(!address)return empty;
  if(!/^[a-z][a-z\d+.-]*:|^\/\/|^(?:www\.|maps\.|goo\.gl\/)/i.test(address))return {...empty,url:search(address),query:address};
  try{
   const url=new URL(address.startsWith('//')?'https:'+address:/^[a-z][a-z\d+.-]*:/i.test(address)?address:'https://'+address),host=url.hostname.toLowerCase(),google=/(^|\.)google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/.test(host);
   if(!['http:','https:'].includes(url.protocol)||url.port||url.username||url.password||!(host==='maps.app.goo.gl'||host==='goo.gl'&&/^\/maps(?:\/|$)/.test(url.pathname)||google&&(host.startsWith('maps.')||/^\/maps(?:\/|$)/.test(url.pathname))))return empty;
   url.protocol='https:';
   // Opaque short IDs must be expanded by the authenticated Maps resolver.
   if(!google)return {...empty,url:url.href,short:true};
   const query=url.searchParams.get('query')||url.searchParams.get('q')||url.searchParams.get('ll')||'',path=decodeURIComponent(url.pathname),pin=path.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/),pair=query.match(/^(?:loc:)?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/i)||pin||path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
   if(pair){const lat=Number(pair[1]),lng=Number(pair[2]);if(Math.abs(lat)<=90&&Math.abs(lng)<=180)return {url:url.href,query:'',geo:{address:String(value||''),lat,lng,label:'Ubicación del enlace de Maps',confirmed:false}};}
   const text=query||path.match(/\/maps\/(?:place|search)\/([^/]+)/)?.[1]?.replace(/\+/g,' ')||'';
   return {url:url.href,query:/^[a-z][a-z\d+.-]*:|^\/\//i.test(text)?'':text,geo:null};
  }catch(_){return empty;}
 }
 const addressURL=value=>addressInfo(value).url,addressQuery=value=>addressInfo(value).query;
 const mapsURL=r=>addressURL(r.geo?`${r.geo.lat},${r.geo.lng}`:r.address||r.name);
 function routeURL(stops){const q=r=>r.geo?`${r.geo.lat},${r.geo.lng}`:addressQuery(r.address);const usable=stops.filter(r=>q(r));if(usable.length<2)return '';const params=new URLSearchParams({api:'1',travelmode:'driving',origin:q(usable[0]),destination:q(usable.at(-1))});if(usable.length>2)params.set('waypoints',usable.slice(1,-1).map(q).join('|'));return 'https://www.google.com/maps/dir/?'+params;}
 function validate(v){
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x),txt=(x,n=500)=>typeof x==='string'&&x.length<=n,id=x=>txt(x,200)&&!!x&&!['__proto__','prototype','constructor'].includes(x),keys=(x,allowed)=>obj(x)&&Object.keys(x).every(k=>allowed.includes(k));
  const dict=(x,fn)=>obj(x)&&Object.keys(x).length<=3000&&Object.entries(x).every(([k,v])=>id(k)&&fn(v));
  const list=(x,fn)=>Array.isArray(x)&&x.length<=2000&&x.every(fn)&&new Set(x.map(p=>p.id)).size===x.length;
  const geo=g=>keys(g,['address','lat','lng','label','confirmed'])&&txt(g.address,2000)&&txt(g.label)&&Number.isFinite(g.lat)&&Math.abs(g.lat)<=90&&Number.isFinite(g.lng)&&Math.abs(g.lng)<=180&&typeof g.confirmed==='boolean';
  const vehicle=v=>keys(v,['id','name','type','capacity','driver','departure','pointId','destinationId','notes','cost'])&&id(v.id)&&txt(v.name)&&['auto','uber','traffic','bus','otro'].includes(v.type)&&Number.isInteger(v.capacity)&&v.capacity>=1&&v.capacity<=100&&['driver','departure','pointId','destinationId','notes'].every(k=>txt(v[k]===undefined?'':v[k],k==='notes'?2000:500))&&(v.cost==null||Number.isFinite(v.cost)&&v.cost>=0&&v.cost<=1e12);
  const assignment=a=>keys(a,['mode','vehicleId','pointId','time','notes'])&&['pending','self','vehicle'].includes(a.mode)&&['vehicleId','pointId','time','notes'].every(k=>txt(a[k]===undefined?'':a[k],k==='notes'?2000:500));
  return keys(v,['points','geocodes','days'])&&list(v.points,p=>keys(p,['id','name','address','dayIds','notes'])&&id(p.id)&&txt(p.name)&&!!p.name.trim()&&txt(p.address)&&txt(p.notes||'',2000)&&Array.isArray(p.dayIds)&&p.dayIds.length<=2000&&p.dayIds.every(id))&&dict(v.geocodes,geo)&&dict(v.days,d=>keys(d,['ida','vuelta'])&&Object.values(d).every(l=>keys(l,['vehicles','assignments'])&&list(l.vehicles,vehicle)&&dict(l.assignments,assignment)));
 }
 const api={empty,data,people,roster,leg,ensure,status,occupancy,assign,markers,addressInfo,addressURL,addressQuery,mapsURL,routeURL,validate};root.RodaLogistics=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
