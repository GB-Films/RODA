(function(root){
 const views={script:'Guion',breakdown:'Breakdown',locations:'Locaciones',cast:'Reparto',shooting:'Call diario',dayplan:'Plan de rodaje',schedule:'Plan general',shotlist:'Shotlist',elements:'Elementos',crew:'Equipo técnico',reports:'Reportes',callsheet:'Reportes',filters:'Filtros'};
 const fields={time:'horario',duration:'duración',notes:'notas',title:'nombre',date:'fecha',location:'locación',actor:'intérprete',scene:'escena',script:'guion',element:'elemento',shot:'plano',crew:'integrante'};
 function create({send,getActivity,describe,mount}){
  const sessionId=crypto.randomUUID();let rows=[],timer,busy=false,again=false,stopped=false,lastKey='',connected=false,dragging=null;
  const host=document.createElement('section');host.className='roda-presence';host.setAttribute('aria-label','Equipo conectado');
  host.innerHTML='<details><summary><span class="presence-dot"></span><span class="presence-count">Conectando equipo…</span></summary><ul class="presence-people"></ul></details><p class="presence-conflict" role="status" hidden></p>';
  mount?.append(host);
  function activity(){const value=getActivity(dragging);if(document.hidden)value.editing=false;return value;}
  function update(incoming){
   if(stopped)return;rows=(incoming||[]).filter(row=>Date.now()-row.seenAt<35000);connected=true;render();
  }
  function render(){
   const grouped=new Map();
   for(const row of rows){const old=grouped.get(row.userId);if(!old||(!old.editing&&row.editing)||old.editing===row.editing&&row.seenAt>old.seenAt)grouped.set(row.userId,row);}
   host.querySelector('.presence-count').textContent=connected?(grouped.size+' conectado'+(grouped.size===1?'':'s')):'Reconectando equipo…';
   host.classList.toggle('is-connected',connected);const list=host.querySelector('ul');list.replaceChildren();
   for(const row of grouped.values()){
    const li=document.createElement('li'),avatar=document.createElement('span'),info=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');
    avatar.className='presence-avatar';avatar.textContent=row.name.trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
    name.textContent=row.name+(row.self?' · vos':'');const item=describe(row),field=fields[row.field];
    detail.textContent=row.view?(row.editing?'Editando ':'Viendo ')+(views[row.view]||row.view)+(item?' · '+item:'')+(row.editing&&field?' · '+field:''):'En el proyecto';
    info.append(name,detail);li.append(avatar,info);list.append(li);
   }
   const current=activity(),other=rows.find(row=>row.sessionId!==sessionId&&row.editing&&current.editing&&row.section===current.section&&row.kind===current.kind&&row.entityId===current.entityId);
   const warning=host.querySelector('.presence-conflict');warning.hidden=!other;
   warning.textContent=other?other.name+' también está editando '+(describe(other)||views[other.view]||'esta sección')+'. Coordinen antes de guardar.':'';
  }
  async function heartbeat(force=false){
   if(stopped)return;if(busy){again=true;return;}const value=activity(),key=JSON.stringify(value);if(!force&&key===lastKey){render();return;}
   busy=true;
   try{const result=await send({...value,sessionId});lastKey=key;update(result.presence);}
   catch{connected=false;rows=[];render();}
   finally{busy=false;if(again){again=false;changed();}}
  }
  function changed(){clearTimeout(timer);timer=setTimeout(()=>heartbeat(),250);}
  const events=['focusin','focusout','input','change','visibilitychange','roda-view'];
  events.forEach(name=>document.addEventListener(name,changed,true));
  const down=event=>{dragging=event.target.closest?.('.dpBlock,.sceneCard');changed();};
  const up=()=>{dragging=null;changed();};document.addEventListener('pointerdown',down,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',up,true);
  const beat=setInterval(()=>heartbeat(true),10000),expiry=setInterval(()=>{rows=rows.filter(row=>Date.now()-row.seenAt<35000);render();},5000);
  function stop(){if(stopped)return;stopped=true;clearTimeout(timer);clearInterval(beat);clearInterval(expiry);events.forEach(name=>document.removeEventListener(name,changed,true));document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);send({sessionId,leave:true}).catch(()=>{});}
  window.addEventListener('pagehide',stop,{once:true});heartbeat(true);
  return {update,changed,stop,sessionId};
 }
 root.RodaPresence={create};
})(typeof window==='undefined'?globalThis:window);
