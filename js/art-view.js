(function(root){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=(n,c)=>c+' '+Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
 function create(host,{getState,getScope,canEdit,save,showAll,openScene,canOpenScene,notify}){
  let selected=null,query='',category='all',status='all',owner='',archived=false,drafts=[];
  const flush=()=>{let valid=true;for(const draft of drafts)if(!draft.flush())valid=false;return valid;};
  host.innerHTML=`<header class="artHeading"><div><h1>Arte y utilería</h1><p>Del desglose al set: qué hace falta, quién lo consigue y cuánto cuesta.</p></div><button class="btn primary" id="artAdd">+ Elemento</button></header>
   <div class="artStats" id="artStats"></div><div class="artWorkspace">
   <section class="card artExplorer" aria-label="Inventario de arte"><div class="artFilters" data-ro-allow="1"><label class="artSearch">Buscar elemento<input type="search" class="input" id="artSearch" placeholder="Nombre o notas…"></label><div class="artFilterRow"><label>Categoría<select class="input" id="artCategory"><option value="all">Arte y utilería</option value="art">Arte / ambientación</option><option value="props">Utilería / props</option></select></label><label>Estado<select class="input" id="artStatus"><option value="all">Todos</option>${Object.entries(RodaArt.statuses).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}<option value="obsolete">Fuera del desglose</option></select></label></div><label>Responsable<input type="search" class="input" id="artOwnerFilter" placeholder="Todos los responsables"></label><label class="artArchived"><input type="checkbox" id="artArchived"> Ver archivados</label></div><div id="artList" class="artList"></div></section>
   <section class="card artDetail" id="artDetail" aria-label="Detalle del elemento"></section></div><p class="artSaveStatus muted small" role="status" id="artSaveStatus">Los cambios se guardan automáticamente.</p>
   <dialog class="artDialog" id="artCreateDialog"><form><header><h2>Nuevo elemento</h2><button class="btn" type="button" data-close data-ro-allow="1" aria-label="Cerrar nuevo elemento">×</button></header><label>Nombre<input class="input" name="name" maxlength="500" required placeholder="Ej.: cartel de la fábrica"></label><label>Categoría<select class="input" name="category"><option value="art">Arte / ambientación</option><option value="props">Utilería / props</option></select></label><p class="muted small">Después podés vincularlo a escenas y cargar su responsable, costo y estado.</p><p role="status" class="artError"></p><footer><button type="button" class="btn" data-close data-ro-allow="1">Cancelar</button><button class="btn primary" type="submit">Agregar elemento</button></footer></form></dialog>`;
  const $=id=>host.querySelector('#'+id),list=$('artList'),detail=$('artDetail'),dialog=$('artCreateDialog');
  const all=()=>RodaArt.rows(getState(),getScope());
  function visible(){return all().filter(r=>r.archived===archived&&(category==='all'||r.category===category)&&(status==='all'||status==='obsolete'&&r.obsolete||r.status===status)&&(!query||RodaArt.key(r.name+' '+r.notes).includes(RodaArt.key(query)))&&(!owner||RodaArt.key(r.responsible).includes(RodaArt.key(owner))));}
  function renderList(){
   const rows=visible(),totals=RodaArt.totals(all());
   $('artStats').innerHTML=`<span><strong>${totals.count}</strong> elementos</span><span class="artReady"><strong>${totals.ready}</strong> conseguidos</span><span><strong>${totals.pending}</strong> pendientes</span><span class="artBudget">Costo cargado <strong>${Object.entries(totals.money).map(([c,n])=>money(n,c)).join(' · ')||'—'}</strong><small>${totals.unpriced} sin precio · según jornada</small></span>`;
   list.innerHTML=rows.map(r=>`<button type="button" class="artItem ${r.id===selected?'selected':''}" data-art-id="${esc(r.id)}" data-ro-allow="1" aria-pressed="${r.id===selected}"><span class="artItemTop"><strong>${esc(r.name)}</strong><span class="artState" data-state="${esc(r.status)}">${esc(RodaArt.statuses[r.status])}</span></span><span class="artItemMeta">${esc(RodaArt.categories[r.category])} · ${r.scenes.length} escena${r.scenes.length===1?'':'s'}${r.obsolete?' · Fuera del desglose':''}</span><span class="artItemBottom"><span>${esc(r.responsible||'Sin responsable')}</span><span>${r.total===null?'Sin precio':esc(money(r.total,r.currency))}</span></span></button>`).join('')||'<div class="empty-state">No hay elementos para estos filtros.</div>';
   list.querySelectorAll('[data-art-id]').forEach(b=>b.onclick=()=>{if(!flush())return;selected=b.dataset.artId;renderList();renderDetail();host.classList.add('art-show-detail');detail.scrollTop=0;});
  }
  function renderDetail(){
   if(!flush())return;drafts.forEach(d=>d.dispose());drafts=[];
   const row=RodaArt.rows(getState()).find(r=>r.id===selected),disabled=canEdit()?'':'disabled';
   if(!row){detail.innerHTML='<div class="empty-state">Seleccioná un elemento para ver su preparación y costo.</div>';return;}
   const state=getState(),people=[...new Set([...(state.crew||[]),...(state.artPeople||[])].filter(p=>!p.castProfile&&!p.mergedInto).map(p=>[p.firstName,p.lastName].filter(Boolean).join(' ')||p.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
   detail.innerHTML=`<header class="artDetailHeader"><button type="button" class="btn artBack" data-ro-allow="1">← Elementos</button><p class="muted small">${esc(RodaArt.categories[row.category])} · ${row.detected?'Del desglose del guion':row.obsolete?'Ya no figura en el desglose actual':'Agregado en Arte'}</p><h2>${esc(row.name)}</h2>${row.obsolete?'<p class="muted small">Se conserva la preparación cargada. Podés asociarlo a escenas o archivarlo.</p>':''}</header>
    <div class="artForm" data-art-edit="${esc(row.id)}"><label>Estado<select class="input" data-field="status" ${disabled}>${Object.entries(RodaArt.statuses).map(([k,v])=>`<option value="${k}" ${k===row.status?'selected':''}>${v}</option>`).join('')}</select></label><label>Responsable<input class="input" data-field="responsible" list="artPeople" maxlength="200" value="${esc(row.responsible)}" placeholder="Elegí del equipo o escribí un nombre" ${disabled}></label><datalist id="artPeople">${people.map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist>
    <div class="artCosts"><label>Cantidad<input class="input" type="number" inputmode="numeric" data-field="quantity" min="1" max="100000" step="1" value="${row.quantity}" ${disabled}></label><label>Precio unitario<input class="input" type="number" inputmode="decimal" data-field="unitPrice" min="0" max="1000000000000" step="0.01" value="${row.unitPrice??''}" placeholder="Sin precio" ${disabled}></label><label>Moneda<select class="input" data-field="currency" ${disabled}><option ${row.currency==='ARS'?'selected':''}>ARS</option><option ${row.currency==='USD'?'selected':''}>USD</option></select></label></div><div class="artTotal">Costo total <strong id="artItemTotal">${row.total===null?'Sin precio':esc(money(row.total,row.currency))}</strong></div><label>Notas / proveedor / indicaciones<textarea class="textarea" data-field="notes" maxlength="3000" rows="3" placeholder="Dónde conseguirlo, fabricación, devolución…" ${disabled}>${esc(row.notes)}</textarea></label></div>
    <section class="artSceneSection"><h3>Escenas donde se necesita <span class="muted">${row.scenes.length}</span></h3><div class="artSceneLinks">${row.scenes.map(s=>canOpenScene()?`<button type="button" class="btn" data-art-scene="${esc(s.id)}" data-ro-allow="1">#${esc(s.number)} · ${esc(s.slugline)}</button>`:`<span>#${esc(s.number)} · ${esc(s.slugline)}</span>`).join('')||'<p class="muted small">Sin escenas asignadas; aparece en Todas las jornadas y Sin jornada asignada.</p>'}</div>
    <details class="artScenePicker"><summary data-ro-allow="1">Vincular a otras escenas</summary><div>${state.scenes.map(s=>`<label><input type="checkbox" data-scene-id="${esc(s.id)}" ${row.scenes.some(x=>x.id===s.id)?'checked':''} ${row.sourceScenes.includes(s.id)?'disabled':disabled}><span>#${esc(s.number)} · ${esc(s.slugline)}${row.sourceScenes.includes(s.id)?' · Guion':''}</span></label>`).join('')||'<p class="muted small">Todavía no hay escenas.</p>'}</div><p class="muted small">Las asociaciones del guion se actualizan desde el desglose.</p></details></section>
    <footer class="artDetailFooter"><button class="btn" data-art-archive ${disabled}>${row.archived?'Restaurar elemento':'Archivar elemento'}</button><span class="muted small">${row.archived?'Volverá al inventario activo.':'Podés recuperarlo con “Ver archivados”.'}</span></footer>`;
   detail.querySelector('.artBack').onclick=()=>host.classList.remove('art-show-detail');
   detail.querySelectorAll('[data-art-scene]').forEach(b=>b.onclick=()=>openScene(b.dataset.artScene));
   detail.querySelector('[data-art-archive]').onclick=()=>{if(!canEdit())return;RodaArt.update(getState(),selected,'archived',!row.archived);save();selected=null;host.classList.remove('art-show-detail');render();};
   detail.querySelectorAll('[data-scene-id]').forEach(input=>input.onchange=()=>{
    if(!canEdit())return;
    const current=RodaArt.rows(getState()).find(r=>r.id===selected),ids=new Set(current.sceneIds);
    if(input.checked)ids.add(input.dataset.sceneId);else ids.delete(input.dataset.sceneId);
    try{RodaArt.update(getState(),selected,'sceneIds',[...ids]);save();renderList();const wasOpen=detail.querySelector('.artScenePicker').open;renderDetail();detail.querySelector('.artScenePicker').open=wasOpen;}catch(e){notify(e.message);}
   });
   detail.querySelectorAll('[data-field]').forEach(input=>{
    const field=input.dataset.field;
    const write=()=>{
     if(!canEdit())throw Error('Solo tenés permiso de lectura.');
     let value=input.value;if(field==='quantity'||field==='unitPrice')value=field==='unitPrice'&&value===''?null:value===''?NaN:Number(value);
     if(RodaArt.update(getState(),row.id,field,value)){save();renderList();const latest=RodaArt.rows(getState()).find(r=>r.id===row.id);$('artItemTotal').textContent=latest.total===null?'Sin precio':money(latest.total,latest.currency);}
    };
    drafts.push(RodaFormAutosave.bind(input,{read:()=>input.value,write,onState:(state,error)=>{$('artSaveStatus').textContent=error||(state==='pending'?'Guardando…':'Los cambios se guardan automáticamente.');input.setCustomValidity(error||'');}}));
   });
  }
  function render(){
   if(!flush())return;
   $('artAdd').disabled=!canEdit();
   const rows=visible();if(!rows.some(r=>r.id===selected))selected=rows[0]?.id||null;
   renderList();renderDetail();
  }
  for(const [id,set] of [['artSearch',v=>query=v],['artCategory',v=>category=v],['artStatus',v=>status=v],['artOwnerFilter',v=>owner=v],['artArchived',v=>archived=v]])$(id).addEventListener(id==='artSearch'||id==='artOwnerFilter'?'input':'change',event=>{set(event.target.type==='checkbox'?event.target.checked:event.target.value);render();});
  $('artAdd').onclick=()=>{if(!canEdit())return;dialog.querySelector('form').reset();dialog.querySelector('.artError').textContent='';dialog.showModal();dialog.querySelector('[name="name"]').focus();};
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());
  dialog.querySelector('form').onsubmit=e=>{
   e.preventDefault();if(!canEdit())return;
   try{selected=RodaArt.add(getState(),{name:e.target.elements.name.value,category:e.target.elements.category.value});query='';category='all';status='all';owner='';archived=false;['artSearch','artOwnerFilter'].forEach(id=>$(id).value='');$('artCategory').value='all';$('artStatus').value='all';$('artArchived').checked=false;save();dialog.close();showAll();render();host.classList.add('art-show-detail');}catch(error){dialog.querySelector('.artError').textContent=error.message;}
  };
  return {render,select(id){selected=id;query='';category='all';status='all';owner='';archived=!!RodaArt.rows(getState()).find(r=>r.id===id)?.archived;['artSearch','artOwnerFilter'].forEach(id=>$(id).value='');$('artCategory').value='all';$('artStatus').value='all';$('artArchived').checked=archived;render();host.classList.add('art-show-detail');}};
 }
 root.RodaArtView={create};
})(window);
