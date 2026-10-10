/* Shared by the browser and API. Section ownership is independent of UI visibility. */
(function(root){
 const sections={script:'Guion',breakdown:'Breakdown, elementos y filtros',locations:'Locaciones',cast:'Reparto',planning:'Planes de rodaje y calls',shotlist:'Shotlist',crew:'Equipo técnico',reports:'Reportes'};
 const views={script:'script',breakdown:'breakdown',elements:'breakdown',filters:'breakdown',locations:'locations',cast:'cast',shooting:'planning',dayplan:'planning',schedule:'planning',callsheet:'reports',shotlist:'shotlist',crew:'crew',reports:'breakdown'};
 const all=level=>Object.fromEntries(Object.keys(sections).map(k=>[k,k==='reports'&&level==='edit'?'read':level]));
 const clone=v=>JSON.parse(JSON.stringify(v));
 const basics=sc=>Object.fromEntries(Object.entries(sc).filter(([k])=>!['shots','shootingLocationId'].includes(k)));
 function split(core={},pack={}){const scenes=pack.scenes||[],crew=core.crew||[];return {
  script:pack.script||{versions:[],activeVersionId:null},breakdown:scenes.map(basics),
  locations:{items:core.shootingLocations||[],scenes:scenes.map(s=>({id:s.id,shootingLocationId:s.shootingLocationId||''}))},
  cast:crew.filter(c=>c.area==='Cast'),crew:crew.filter(c=>c.area!=='Cast'),
  planning:{shootDays:core.shootDays||[],project:core.project||{}},shotlist:scenes.map(s=>({id:s.id,shots:s.shots||[]}))
 };}
 function project(core,pack,access){
  if(access.unrestricted)return {core,script:pack};
  const can=k=>['read','edit'].includes(access.sections[k]),base=core||{meta:{version:14},scenes:[],script:{versions:[],activeVersionId:null}};
  const output={meta:clone(base.meta||{}),scenes:[],script:{versions:[],activeVersionId:null},crew:(base.crew||[]).filter(c=>can(c.area==='Cast'?'cast':'crew')).map(clone),shootDays:can('planning')?clone(base.shootDays||[]):[],project:can('planning')?clone(base.project||{}):{},shootingLocations:can('locations')?clone(base.shootingLocations||[]):[]};
  const scenes=(pack?.scenes||[]).map(s=>{const row=can('breakdown')?basics(s):Object.fromEntries(['id','number','chapter','slugline','intExt','location','timeOfDay','pages'].filter(k=>k in s).map(k=>[k,clone(s[k])]));if(!can('breakdown'))row.elements=can('cast')?{cast:clone(s.elements?.cast||[])}:{};row.shots=can('shotlist')?clone(s.shots||[]):[];row.shootingLocationId=can('locations')?(s.shootingLocationId||''):'';return row;});
  return {core:output,script:{meta:clone(pack?.meta||{}),scenes,script:can('script')?clone(pack?.script||{versions:[],activeVersionId:null}):{versions:[],activeVersionId:null}}};
 }
 function merge(core,pack,changes){
  core=clone(core||{meta:{version:14},scenes:[],script:{versions:[],activeVersionId:null},crew:[]});pack=clone(pack||{meta:{part:'script'},scenes:[],script:{versions:[],activeVersionId:null}});
  const scenes=new Map((pack.scenes||[]).map(s=>[s.id,s]));
  if('breakdown' in changes)pack.scenes=changes.breakdown.map(s=>({...basics(s),shots:scenes.get(s.id)?.shots||[],shootingLocationId:scenes.get(s.id)?.shootingLocationId||''}));
  if('script' in changes)pack.script=clone(changes.script);
  if('planning' in changes)Object.assign(core,clone(changes.planning));
  if('cast' in changes)core.crew=[...(core.crew||[]).filter(c=>c.area!=='Cast'),...clone(changes.cast)];
  if('crew' in changes)core.crew=[...(core.crew||[]).filter(c=>c.area==='Cast'),...clone(changes.crew)];
  if('locations' in changes){core.shootingLocations=clone(changes.locations.items);const values=new Map(changes.locations.scenes.map(s=>[s.id,s.shootingLocationId]));for(const s of pack.scenes)if(values.has(s.id))s.shootingLocationId=values.get(s.id);}
  if('shotlist' in changes){const values=new Map(changes.shotlist.map(s=>[s.id,s.shots]));for(const s of pack.scenes)if(values.has(s.id))s.shots=clone(values.get(s.id));}
  return {core,script:pack};
 }
 const api={sections,views,all,split,project,merge};if(typeof module!=='undefined')module.exports=api;else root.RodaPolicy=api;
})(typeof window==='undefined'?globalThis:window);
