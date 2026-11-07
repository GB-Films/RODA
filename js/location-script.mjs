import {sceneScript} from './character-script.mjs?v=1.60.11';

const key=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const sceneKey=s=>key(s.chapter)+'|'+String(s.number||'').replace(/^0+(?=\d)/,'').toUpperCase();
export const productionVersion=state=>state.script?.versions?.find(v=>v.id===state.script.activeVersionId&&!v.draft);

export function dayChoices(state){
  const version=productionVersion(state);if(!version)return [];
  return (state.shootDays||[]).map((day,i)=>{
    const indexes=new Set(),unlinked=[];
    for(const id of new Set(day.sceneIds||[])){
      let matches=version.scenes.map((s,index)=>({s,index})).filter(({s})=>s.productionSceneId===id||s.id===id);
      if(!matches.length){
        const scene=(state.scenes||[]).find(s=>s.id===id);
        if(scene)matches=version.scenes.map((s,index)=>({s,index})).filter(({s})=>sceneKey(s)===sceneKey(scene));
      }
      if(matches.length===1)indexes.add(matches[0].index);else unlinked.push(id);
    }
    const date=day.date?new Date(day.date+'T12:00:00'):null;
    const dateLabel=date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(date):'Sin fecha';
    const label=[day.label||`Jornada ${i+1}`,dateLabel,day.location].filter(Boolean).join(' · ');
    return {id:day.id,label,indexes:[...indexes].sort((a,b)=>a-b),unlinked};
  });
}

export function locationChoices(state){
  const version=productionVersion(state);if(!version)return [];
  const choices=new Map(),places=new Map((state.shootingLocations||[]).map(p=>[p.id,p.name]));
  for(const scene of state.scenes||[]){
    let index=version.scenes.findIndex(s=>s.productionSceneId===scene.id||s.id===scene.id);
    if(index<0){const matches=version.scenes.map((s,i)=>({s,i})).filter(({s})=>sceneKey(s)===sceneKey(scene));if(matches.length===1)index=matches[0].i;}
    if(index<0)continue; // Historical/manual scenes are not part of this screenplay.
    const place=places.get(scene.shootingLocationId),space=String(scene.location||'').trim();
    for(const [id,name,kind] of [[place?'place:'+scene.shootingLocationId:'',place,'Lugar de rodaje'],[space?'space:'+key(space):'',space,'Espacio del guion']]){
      if(!id)continue;if(!choices.has(id))choices.set(id,{id,name,kind,indexes:[]});
      const row=choices.get(id);if(!row.indexes.includes(index))row.indexes.push(index);
    }
  }
  return [...choices.values()].map(row=>({...row,indexes:row.indexes.sort((a,b)=>a-b)})).sort((a,b)=>a.kind.localeCompare(b.kind,'es')||a.name.localeCompare(b.name,'es'));
}

export function locationScript(state,selection,{parse=globalThis.RodaScreenplay?.parse}={}){
  const version=productionVersion(state);if(!version)throw Error('Elegí una versión de producción antes de descargar.');
  let indexes,label,subtitle;
  if(selection.mode==='day'){
    const day=dayChoices(state).find(d=>d.id===selection.day);
    if(!day)throw Error('Elegí una jornada vigente del Plan de Rodaje.');
    if(day.unlinked.length)throw Error('Hay escenas de esta jornada sin vínculo con el guion de producción. Revisá sus vínculos antes de descargar para no omitirlas.');
    if(!day.indexes.length)throw Error('Esta jornada todavía no tiene escenas asignadas en el Plan de Rodaje.');
    indexes=day.indexes;label=day.label;subtitle='GUION POR JORNADA';
  }else if(selection.mode==='location'){
    const place=locationChoices(state).find(p=>p.id===selection.location);
    if(!place)throw Error('Esta locación no tiene escenas en el guion de producción.');
    indexes=place.indexes;label=place.name;subtitle='GUION POR LOCACIÓN';
  }else if(selection.mode==='range'){
    const {from,to}=selection;
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>=version.scenes.length)throw Error('Revisá la escena inicial y la final.');
    indexes=Array.from({length:to-from+1},(_,i)=>from+i);
    label=`Escenas ${version.scenes[from].number} a ${version.scenes[to].number}`;subtitle='GUION · SELECCIÓN DE ESCENAS';
  }else throw Error('Elegí cómo recortar el guion.');
  return sceneScript(state,new Set(indexes),{label,subtitle,parse});
}

// This dialog only reads production data. It never changes the selected version or schedule.
export function openScriptDownload({getState,canRead=()=>true,projectKey=()=>'',exportFile}){
  if(!canRead())throw Error('Necesitás acceso al guion para descargarlo.');
  const state=getState(),version=productionVersion(state);
  if(!version?.scenes?.length)throw Error('Elegí una versión de producción antes de descargar.');
  const opener=document.activeElement,identity=projectKey(),dialog=document.createElement('dialog');
  dialog.className='roda-message-dialog script-download-dialog';dialog.dataset.roAllow='1';dialog.setAttribute('aria-labelledby','scriptDownloadTitle');
  dialog.innerHTML='<form><header class="roda-message-heading"><h2 id="scriptDownloadTitle">Descargar guion</h2><button class="btn icon ghost" type="button" data-close aria-label="Cerrar">×</button></header><p data-version></p><div class="script-download-fields"><label>Seleccionar por<select class="input" name="mode"><option value="range">Rango de escenas</option><option value="location">Locación</option><option value="day">Jornada</option></select></label><label data-location hidden>Locación<select class="input" name="location"></select></label><label data-day hidden>Jornada<select class="input" name="day"></select></label><div data-range class="script-download-range"><label>Desde la escena<select class="input" name="from"></select></label><label>Hasta la escena<select class="input" name="to"></select></label></div><section aria-label="Escenas incluidas"><strong data-count></strong><ul data-preview></ul></section><p class="small muted">Solo el guion, con diálogos y acciones completos. Se conservan el orden del guion, los números de escena y el formato; cada escena comienza en una hoja nueva.</p><p data-error role="alert" hidden></p></div><footer class="roda-message-actions"><button class="btn" type="button" data-cancel>Cancelar</button><button class="btn primary" type="submit">Descargar PDF</button></footer></form>';
  const form=dialog.querySelector('form'),mode=form.elements.mode,location=form.elements.location,day=form.elements.day,from=form.elements.from,to=form.elements.to,submit=form.querySelector('[type=submit]'),error=form.querySelector('[data-error]');
  dialog.querySelector('[data-version]').textContent='Versión de producción · '+(version.name||'Guion');
  const option=(select,value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);};
  for(const choice of locationChoices(state))option(location,choice.id,choice.name+' · '+choice.indexes.length+' escenas · '+choice.kind);
  for(const [i,scene] of version.scenes.entries())for(const select of [from,to])option(select,String(i),[scene.chapter?'Cap. '+scene.chapter:'',scene.number,scene.slugline].filter(Boolean).join(' · '));
  for(const choice of dayChoices(state))option(day,choice.id,choice.label);
  to.value=String(version.scenes.length-1);
  const selection=()=>({mode:mode.value,location:location.value,day:day.value,from:Number(from.value),to:Number(to.value)});
  let busy=false;
  const preview=()=>{
    form.querySelector('[data-day]').hidden=mode.value!=='day';form.querySelector('[data-location]').hidden=mode.value!=='location';form.querySelector('[data-range]').hidden=mode.value!=='range';
    error.hidden=true;submit.disabled=false;
    const list=form.querySelector('[data-preview]');list.replaceChildren();
    try{const excerpt=locationScript(getState(),selection());form.querySelector('[data-count]').textContent=excerpt.scenes.length+' escenas incluidas';for(const scene of excerpt.scenes){const li=document.createElement('li');li.textContent=[scene.chapter?'Cap. '+scene.chapter:'',scene.number,scene.slugline].filter(Boolean).join(' · ');list.append(li);}}
    catch(e){form.querySelector('[data-count]').textContent='Sin selección válida';error.textContent=e.message;error.hidden=false;submit.disabled=true;}
  };
  const close=()=>{if(dialog.open)dialog.close();dialog.remove();if(opener?.isConnected)opener.focus({preventScroll:true});};
  form.querySelector('[data-close]').onclick=close;form.querySelector('[data-cancel]').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  form.onchange=preview;
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;busy=true;submit.disabled=true;submit.textContent='Preparando PDF…';error.hidden=true;
    try{
      const request=selection();
      const snapshot=()=>{if(!canRead()||identity!==projectKey()||productionVersion(getState())?.id!==version.id)throw Error('Cambió el proyecto, el guion o tu acceso. Cerrá esta ventana y volvé a descargar.');return locationScript(getState(),request);};
      const excerpt=snapshot(),fingerprint=JSON.stringify(excerpt),file=await exportFile(excerpt.project+' - '+excerpt.label,excerpt.version);
      if(!dialog.isConnected)return;
      if(JSON.stringify(snapshot())!==fingerprint)throw Error('El guion, sus locaciones o las escenas de la jornada cambiaron. Volvé a descargar para incluir los cambios.');
      const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);close();
    }catch(e){if(dialog.isConnected){error.textContent=e.message||'No pudimos preparar el PDF.';error.hidden=false;}}
    finally{busy=false;submit.disabled=false;submit.textContent='Descargar PDF';}
  };
  document.body.append(dialog);preview();dialog.showModal();mode.focus();
  return dialog;
}
