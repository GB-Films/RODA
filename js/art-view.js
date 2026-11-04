(function(root){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=(n,c)=>c+' '+Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
 function create(host,{getState,getScope,canEdit,save,showAll,openScene,canOpenScene,getPeople,notify}){
  let deleting=false,renaming=false,order='name';
  try{if(localStorage.getItem('roda-art-order-v1')==='status')order='status';}catch{}
  let selected=null,query='',category='all',status='all',owner='',archived=false,drafts=[],listPosition={top:0,left:0};
  const flush=()=>{let valid=true;for(const draft of drafts)if(!draft.flush())valid=false;return valid;};
  host.innerHTML=`<header class="artHeading"><h1>Arte y utilería</h1><button class="btn primary" id="artAdd">+ Elemento</button></header>
   <div class="artToolbar" data-ro-allow="1"><div class="artStats" id="artStats"></div><div class="artControls"><input aria-label="Buscar elemento" type="search" class="input artSearch" id="artSearch" placeholder="Buscar elemento…"><details class="artFilterMenu" id="artFilterMenu"><summary>Filtros <span id="artFilterCount" hidden></span><span aria-hidden="true">⌄</span></summary><div class="artFilters"><div class="artFilterRow"><label>Categoría<select class="input" id="artCategory"><option value="all">Arte y utilería</option><option value="art">Arte / ambientación</option><option value="props">Utilería / props</option></select></label><label>Estado<select class="input" id="artStatus"><option value="all">Todos</option>${Object.entries(RodaArt.statuses).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}<option value="obsolete">Fuera del desglose</option></select></label></div><label>Responsable<input type="search" class="input" id="artOwnerFilter" placeholder="Todos los responsables"></label><label class="artArchived"><input type="checkbox" id="artArchived"> Ver archivados</label><footer><button type="button" class="btn" id="artClearFilters">Limpiar filtros</button><button type="button" class="btn" id="artCloseFilters">Listo</button></footer></div></details></div></div><div class="artWorkspace">
   <section class="card artExplorer" aria-label="Inventario de arte"><label class="artOrder" data-ro-allow="1"><span>Ordenar por</span><select class="input" id="artOrder" data-ro-allow="1"><option value="name">Nombre (A–Z)</option><option value="status">Estado</option></select></label><div id="artList" class="artList"></div></section>
   <section class="card artDetail" id="artDetail" tabindex="-1" aria-label="Detalle del elemento"></section></div><p class="artSaveStatus muted small" role="status" id="artSaveStatus">Los cambios se guardan automáticamente.</p>
   <dialog class="artDialog" id="artCreateDialog"><form><header><h2>Nuevo elemento</h2><button class="btn" type="button" data-close data-ro-allow="1" aria-label="Cerrar nuevo elemento">×</button></header><label>Nombre<input class="input" name="name" maxlength="500" required placeholder="Ej.: cartel de la fábrica"></label><label>Categoría<select class="input" name="category"><option value="art">Arte / ambientación</option><option value="props">Utilería / props</option></select></label><p class="muted small">Después podés vincularlo a escenas y cargar su responsable, costo y estado.</p><p role="status" class="artError"></p><footer><button type="button" class="btn" data-close data-ro-allow="1">Cancelar</button><button class="btn primary" type="submit">Agregar elemento</button></footer></form></dialog>
   <dialog class="artDialog artPeopleDialog" id="artResponsibleDialog" aria-labelledby="artPeopleTitle"><header><h2 id="artPeopleTitle">Elegir responsable</h2><button class="btn" type="button" data-close aria-label="Cerrar responsables">×</button></header><input type="search" class="input" id="artPeopleSearch" aria-label="Buscar responsable" placeholder="Nombre, área o rol…"><p class="muted small" id="artPeopleStatus" role="status"></p><div id="artPeopleList" class="artPeopleList"></div><footer><button type="button" class="btn" id="artClearResponsible">Sin responsable</button><button type="button" class="btn" data-close>Cancelar</button></footer></dialog>`;
  const $=id=>host.querySelector('#'+id),list=$('artList'),detail=$('artDetail'),dialog=$('artCreateDialog'),filterMenu=$('artFilterMenu');
  $('artOrder').value=order;
  $('artOrder').onchange=()=>{if(!flush()){$('artOrder').value=order;return;}order=$('artOrder').value;try{localStorage.setItem('roda-art-order-v1',order);}catch{}list.scrollTop=0;listPosition={top:0,left:0};renderList();};
  function rememberList(){if(list.clientHeight)listPosition={top:list.scrollTop,left:list.scrollLeft};}
  list.addEventListener('scroll',rememberList,{passive:true});
  function restoreList(){list.scrollTop=listPosition.top;list.scrollLeft=listPosition.left;}
  function closeFilters(){filterMenu.open=false;}
  $('artCloseFilters').onclick=()=>{closeFilters();filterMenu.querySelector('summary').focus();};
  filterMenu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeFilters();filterMenu.querySelector('summary').focus();}});
  document.addEventListener('pointerdown',event=>{if(!filterMenu.contains(event.target))closeFilters();});
  $('artClearFilters').onclick=()=>{category=status='all';owner='';archived=false;$('artCategory').value=$('artStatus').value='all';$('artOwnerFilter').value='';$('artArchived').checked=false;host.classList.remove('art-show-detail');render();};
  const all=()=>RodaArt.rows(getState(),getScope());
  function visible(){return all().filter(r=>r.archived===archived&&(category==='all'||r.category===category)&&(status==='all'||status==='obsolete'&&r.obsolete||r.status===status)&&(!query||RodaArt.key(r.name+' '+r.notes).includes(RodaArt.key(query)))&&(!owner||RodaArt.key(r.responsible).includes(RodaArt.key(owner)))).sort((a,b)=>(order==='status'?(Object.keys(RodaArt.statuses).indexOf(a.status)-Object.keys(RodaArt.statuses).indexOf(b.status)):0)||a.name.localeCompare(b.name,'es',{numeric:true,sensitivity:'base'}));}
  function renderList(){
   rememberList();
   const rows=visible(),totals=RodaArt.totals(all());
   const activeFilters=Number(category!=='all')+Number(status!=='all')+Number(!!owner)+Number(archived);$('artFilterCount').hidden=!activeFilters;$('artFilterCount').textContent=activeFilters;filterMenu.classList.toggle('has-filters',!!activeFilters);
   $('artStats').innerHTML=`<span><strong>${totals.count}</strong> elementos</span><span class="artReady"><strong>${totals.ready}</strong> conseguidos</span><span><strong>${totals.pending}</strong> pendientes</span><span class="artBudget">Costo cargado <strong>${Object.entries(totals.money).map(([c,n])=>money(n,c)).join(' · ')||'—'}</strong><small>${totals.unpriced} sin precio · según jornada</small></span>`;
   list.innerHTML=rows.map(r=>`<button type="button" class="artItem ${r.id===selected?'selected':''}" data-art-id="${esc(r.id)}" data-ro-allow="1" aria-pressed="${r.id===selected}"><span class="artItemTop"><strong>${esc(r.name)}</strong><span class="artState" data-state="${esc(r.status)}">${esc(RodaArt.statuses[r.status])}</span></span><span class="artItemBottom"><span class="artItemMeta">${r.category==='art'?'Arte':'Props'} · ${r.scenes.length} escena${r.scenes.length===1?'':'s'}${r.obsolete?' · Fuera del desglose':''}<span class="artItemOwner"> · ${esc(r.responsible||'Sin responsable')}</span></span><span class="artItemPrice">${r.total===null?'Sin precio':esc(money(r.total,r.currency))}</span></span></button>`).join('')||'<div class="empty-state">No hay elementos para estos filtros.</div>';
   restoreList();
   list.querySelectorAll('[data-art-id]').forEach(b=>b.onclick=()=>{if(!flush())return;rememberList();selected=b.dataset.artId;renderList();renderDetail();host.classList.add('art-show-detail');detail.scrollTop=0;});
  }
  function renderDetail(){
   if(!flush())return;drafts.forEach(d=>d.dispose());drafts=[];
   const row=RodaArt.rows(getState()).find(r=>r.id===selected),disabled=canEdit()?'':'disabled';
   if(!row){detail.innerHTML='<div class="empty-state">Seleccioná un elemento para ver su preparación y costo.</div>';return;}
   const state=getState();
   detail.innerHTML=`<header class="artDetailHeader"><button type="button" class="btn artBack" data-ro-allow="1">← Elementos</button><p class="muted small">${esc(RodaArt.categories[row.category])} · ${row.detected?'Del desglose del guion':row.obsolete?'Ya no figura en el desglose actual':'Agregado en Arte'}</p><div class="artDetailTitle"><h2>${esc(row.name)}</h2><div class="artNameActions"><button type="button" class="btn" data-art-rename ${disabled}>Editar nombre</button><button type="button" class="btn danger" data-art-delete ${disabled}>Eliminar elemento</button></div></div>${row.obsolete?'<p class="muted small">Se conserva la preparación cargada. Podés asociarlo a escenas o archivarlo.</p>':''}</header>
    <div class="artForm" data-art-edit="${esc(row.id)}"><label>Estado<select class="input" data-field="status" ${disabled}>${Object.entries(RodaArt.statuses).map(([k,v])=>`<option value="${k}" ${k===row.status?'selected':''}>${v}</option>`).join('')}</select></label><label>Responsable<span class="artResponsibleField"><input class="input" data-field="responsible" maxlength="200" value="${esc(row.responsible)}" placeholder="Elegí una persona o escribí un nombre" ${disabled}><button type="button" class="btn" data-art-people ${disabled} aria-label="Elegir responsable del equipo y colaboradores">Elegir</button></span></label>
    <div class="artCosts"><label>Cantidad<input class="input" type="number" inputmode="numeric" data-field="quantity" min="1" max="100000" step="1" value="${row.quantity}" ${disabled}></label><label>Precio unitario<input class="input" type="number" inputmode="decimal" data-field="unitPrice" min="0" max="1000000000000" step="0.01" value="${row.unitPrice??''}" placeholder="Sin precio" ${disabled}></label><label>Moneda<select class="input" data-field="currency" ${disabled}><option ${row.currency==='ARS'?'selected':''}>ARS</option><option ${row.currency==='USD'?'selected':''}>USD</option></select></label></div><div class="artTotal">Costo total <strong id="artItemTotal">${row.total===null?'Sin precio':esc(money(row.total,row.currency))}</strong></div><label>Notas / proveedor / indicaciones<textarea class="textarea" data-field="notes" maxlength="3000" rows="3" placeholder="Dónde conseguirlo, fabricación, devolución…" ${disabled}>${esc(row.notes)}</textarea></label></div>
    <section class="artSceneSection"><h3>Escenas donde se necesita <span class="muted">${row.scenes.length}</span></h3><div class="artSceneLinks">${row.scenes.map(s=>canOpenScene()?`<button type="button" class="btn" data-art-scene="${esc(s.id)}" data-ro-allow="1" title="Ver mención en el guion">#${esc(s.number)} · ${esc(s.slugline)}</button>`:`<span>#${esc(s.number)} · ${esc(s.slugline)}</span>`).join('')||'<p class="muted small">Sin escenas asignadas; aparece en Todas las jornadas y Sin jornada asignada.</p>'}</div>
    <details class="artScenePicker"><summary data-ro-allow="1">Gestionar escenas</summary><div>${state.scenes.map(s=>`<label><input type="checkbox" data-scene-id="${esc(s.id)}" ${row.scenes.some(x=>x.id===s.id)?'checked':''} ${disabled}><span>#${esc(s.number)} · ${esc(s.slugline)}${row.sourceScenes.includes(s.id)?' · Guion':''}</span></label>`).join('')||'<p class="muted small">Todavía no hay escenas.</p>'}</div><p class="muted small">Marcá o desmarcá escenas, incluso las detectadas en el guion. Las escenas que quites seguirán desvinculadas al actualizarlo. Si son objetos distintos, creá otro elemento con un nombre específico y vinculalo a su escena.</p></details></section>
    <footer class="artDetailFooter"><button class="btn" data-art-archive ${disabled}>${row.archived?'Restaurar elemento':'Archivar elemento'}</button><span class="muted small">${row.archived?'Volverá al inventario activo.':'Podés recuperarlo con “Ver archivados”.'}</span></footer>`;
   detail.querySelector('.artBack').onclick=()=>{host.classList.remove('art-show-detail');restoreList();};
   detail.querySelectorAll('[data-art-scene]').forEach(b=>b.onclick=()=>{if(flush())openScene(b.dataset.artScene,row.sourceName);});
   detail.querySelector('[data-art-people]').onclick=openPeople;
   detail.querySelector('[data-art-rename]').onclick=async()=>{
    if(renaming||!canEdit()||!flush())return;
    renaming=true;
    try{
     const name=await root.RodaDialogs.prompt({title:'Editar nombre del elemento',label:'Nombre',value:row.name,required:true,confirmLabel:'Guardar nombre',message:'Las escenas y toda la preparación del elemento se conservan.'});
     if(name===null||!canEdit()||!flush())return;
     if(RodaArt.rename(getState(),row.id,name)){save();query='';$('artSearch').value='';renderList();renderDetail();notify('Nombre del elemento actualizado.');}
    }catch(error){notify(error.message);}finally{renaming=false;}
   };
   detail.querySelector('[data-art-delete]').onclick=async()=>{
    if(deleting||!canEdit()||!flush())return;
    deleting=true;
    try{
     const accepted=await root.RodaDialogs.confirm({title:'Eliminar elemento',message:`¿Eliminar “${row.name}” de Arte y utilería en todas las jornadas?\n\nNo volverá a aparecer al actualizar el guion. El guion, las escenas y los planos se conservan. Podés recuperarlo agregando el mismo nombre y categoría.`,confirmLabel:'Eliminar elemento',danger:true});
     if(!accepted||!canEdit()||!flush())return;
     drafts.forEach(d=>d.dispose());drafts=[];
     if(RodaArt.remove(getState(),row.id)){save();selected=null;host.classList.remove('art-show-detail');render();notify('Elemento eliminado de Arte y utilería.');}
    }catch(error){notify(error.message);}finally{deleting=false;}
   };
   detail.querySelector('[data-art-archive]').onclick=()=>{if(!canEdit())return;RodaArt.update(getState(),selected,'archived',!row.archived);save();selected=null;host.classList.remove('art-show-detail');render();};
   function changeScene(sceneId,linked){
    if(!canEdit()||!flush())return;
    try{if(RodaArt.setScene(getState(),row.id,sceneId,linked))save();const wasOpen=detail.querySelector('.artScenePicker').open;renderList();renderDetail();detail.querySelector('.artScenePicker').open=wasOpen;}catch(e){notify(e.message);}
   }
   detail.querySelectorAll('[data-scene-id]').forEach(input=>input.onchange=()=>changeScene(input.dataset.sceneId,input.checked));
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
  const peopleDialog=$('artResponsibleDialog');let directory=[],peopleRequest=0,peopleItem=null;
  function renderPeople(){
   const query=RodaArt.key($('artPeopleSearch').value);
   const rows=directory.filter(p=>RodaArt.key(p.name+' '+p.detail).includes(query));
   $('artPeopleList').innerHTML=rows.map((p,i)=>`<button type="button" class="artPerson" data-person="${i}"><strong>${esc(p.name)}</strong><span>${esc(p.detail)}</span></button>`).join('')||'<p class="muted small">No hay coincidencias. También podés escribir un nombre en la ficha.</p>';
   $('artPeopleList').querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>choosePerson(rows[Number(b.dataset.person)].name));
  }
  function choosePerson(name){
   if(!canEdit()||!peopleDialog.open||peopleItem!==selected)return;
   try{if(RodaArt.update(getState(),peopleItem,'responsible',name))save();peopleDialog.close();renderList();renderDetail();}catch(error){notify(error.message);}
  }
  async function openPeople(){
   if(!canEdit()||!flush())return;
   peopleItem=selected;const request=++peopleRequest;
   directory=RodaArt.people(getState());$('artPeopleSearch').value='';
   $('artPeopleStatus').textContent=getPeople?'Actualizando personas del proyecto…':'Equipo del proyecto';
   renderPeople();peopleDialog.showModal();$('artPeopleSearch').focus();
   if(!getPeople)return;
   try{
    const remote=await getPeople();if(request!==peopleRequest||!peopleDialog.open)return;
    directory=Array.isArray(remote)?remote:directory;
    $('artPeopleStatus').textContent='Equipo técnico, elenco y colaboradores del proyecto';renderPeople();
   }catch{
    if(request!==peopleRequest||!peopleDialog.open)return;
    $('artPeopleStatus').textContent='No pudimos actualizar los colaboradores. Mostramos el equipo disponible; volvé a abrir para reintentar.';
   }
  }
  peopleDialog.addEventListener('close',()=>{peopleRequest++;});
  peopleDialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>peopleDialog.close());
  $('artPeopleSearch').oninput=renderPeople;$('artClearResponsible').onclick=()=>choosePerson('');
  function render(){
   if(!flush())return;
   $('artAdd').disabled=!canEdit();
   const rows=visible();if(!rows.some(r=>r.id===selected))selected=rows[0]?.id||null;
   renderList();renderDetail();
  }
  for(const [id,set] of [['artSearch',v=>query=v],['artCategory',v=>category=v],['artStatus',v=>status=v],['artOwnerFilter',v=>owner=v],['artArchived',v=>archived=v]])$(id).addEventListener(id==='artSearch'||id==='artOwnerFilter'?'input':'change',event=>{set(event.target.type==='checkbox'?event.target.checked:event.target.value);host.classList.remove('art-show-detail');render();});
  $('artAdd').onclick=()=>{if(!canEdit())return;dialog.querySelector('form').reset();dialog.querySelector('.artError').textContent='';dialog.showModal();dialog.querySelector('[name="name"]').focus();};
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());
  dialog.querySelector('form').onsubmit=e=>{
   e.preventDefault();if(!canEdit())return;
   try{selected=RodaArt.add(getState(),{name:e.target.elements.name.value,category:e.target.elements.category.value});query='';category='all';status='all';owner='';archived=false;['artSearch','artOwnerFilter'].forEach(id=>$(id).value='');$('artCategory').value='all';$('artStatus').value='all';$('artArchived').checked=false;save();dialog.close();showAll();render();host.classList.add('art-show-detail');}catch(error){dialog.querySelector('.artError').textContent=error.message;}
  };
  function capture(){
   rememberList();
   return {selected,query,category,status,owner,archived,order,listPosition:{...listPosition},detailTop:detail.scrollTop,detailLeft:detail.scrollLeft,showDetail:host.classList.contains('art-show-detail'),scenePickerOpen:!!detail.querySelector('.artScenePicker')?.open};
  }
  function restore(context){
   ({selected,query,category,status,owner,archived}=context);
   if(context.order)order=context.order;$('artOrder').value=order;
   $('artSearch').value=query;$('artCategory').value=category;$('artStatus').value=status;$('artOwnerFilter').value=owner;$('artArchived').checked=archived;
   host.classList.toggle('art-show-detail',context.showDetail);render();
   listPosition={...context.listPosition};restoreList();
   const picker=detail.querySelector('.artScenePicker');if(picker)picker.open=context.scenePickerOpen;
   detail.scrollTop=context.detailTop;detail.scrollLeft=context.detailLeft;
  }
  return {render,capture,restore,select(id){selected=id;query='';category='all';status='all';owner='';archived=!!RodaArt.rows(getState()).find(r=>r.id===id)?.archived;['artSearch','artOwnerFilter'].forEach(id=>$(id).value='');$('artCategory').value='all';$('artStatus').value='all';$('artArchived').checked=archived;render();host.classList.add('art-show-detail');}};
 }
 root.RodaArtView={create};
})(window);
