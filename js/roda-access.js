(function(){
 const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const permissions=()=>window.RODA_STUDIO?.project.rodaAccess;
 const section=view=>RodaPolicy.views[view]||view;
 const canView=view=>!permissions()||['read','edit'].includes(permissions().sections[section(view)]);
 const canEdit=view=>!permissions()?window.RODA_STUDIO?.canEdit!==false:permissions().sections[section(view)]==='edit';
 function apply(){
  const a=permissions();if(!a)return;
  document.querySelectorAll('.navBtn[data-view],.mDockBtn[data-view]').forEach(n=>n.hidden=!canView(n.dataset.view));
  document.querySelectorAll('.nav-section').forEach(heading=>{let node=heading.nextElementSibling,visible=false;while(node&&!node.classList.contains('nav-section')){if(node.matches('[data-view]')&&!node.hidden)visible=true;node=node.nextElementSibling;}heading.hidden=!visible;});
  $('btnRodaAccess').hidden=!a.admin;
  const view=document.body.dataset.rodaView;
  for(const node of document.querySelectorAll('#view-'+view+' input,#view-'+view+' select,#view-'+view+' textarea,#view-'+view+' button')){
   const scope=node.closest('[data-roda-section]')?.dataset.rodaSection||view;
   if(!canEdit(scope)&&!node.closest('[data-ro-allow="1"]')){if(!node.disabled){node.disabled=true;node.dataset.permissionDisabled='1';}}
   else if(node.dataset.permissionDisabled){node.disabled=false;delete node.dataset.permissionDisabled;}
  }
  if(a.projectOnly){$('roda-back').hidden=true;const brand=document.querySelector('[data-studio-home]');brand?.removeAttribute('href');brand?.removeAttribute('data-studio-home');}
 }
 const presets={director:{...RodaPolicy.all('edit')},assistant:{...RodaPolicy.all('read'),breakdown:'edit',locations:'edit',cast:'edit',planning:'edit',crew:'edit'},photo:{...RodaPolicy.all('none'),script:'read',planning:'read',shotlist:'read',locations:'read'},reader:RodaPolicy.all('read')};
 async function open(){
  const studio=window.RODA_STUDIO;if(!permissions()?.admin)return;
  const dialog=$('rodaAccessDialog'),host=$('rodaAccessContent');dialog.showModal();host.textContent='Cargando equipo…';
  const request=(suffix,options)=>window.GBStudioProjects.request(studio.accessPath+suffix,options);
  let data,selected=null;
  const status=message=>{$('rodaAccessStatus').textContent=message;};
  function form(member){selected=member;$('rodaAccessEmail').value=member?.email||'';$('rodaAccessEmail').readOnly=!!member;$('rodaAccessName').value=member?.name||'';$('rodaAccessAdmin').checked=member?.admin||false;const chosen=member?.sections||presets.assistant;for(const [k,v] of Object.entries(chosen))host.querySelector(`[data-permission="${k}"]`).value=v;$('rodaAccessRemove').hidden=!member;status('');}
  function render(){host.innerHTML=`<p class="muted">Agregá el correo de su cuenta de Google. El acceso es solo a este proyecto de Roda; no habilita otras apps ni proyectos.</p><p class="muted small">Al asignar el equipo, solo acceden las personas de esta lista y los administradores del proyecto y del estudio. Quienes ya tengan permisos propios en GB Studio conservan esos accesos por separado.</p><div class="roda-access-layout"><section><h3>Equipo de este Roda</h3><p class="muted small">Titular: ${escape(data.owner)}</p><button class="btn primary" id="rodaAccessNew" type="button">+ Agregar persona</button><div class="roda-access-members">${data.members.map((m,i)=>`<button class="btn" type="button" data-member-index="${i}"><strong>${escape(m.name||m.email)}</strong><small>${escape(m.email)} · ${m.admin?'Administrador':'Acceso personalizado'}</small></button>`).join('')||'<p class="muted">Todavía no asignaste colaboradores.</p>'}</div><button class="btn" id="rodaAccessCopy" type="button">Copiar enlace del proyecto</button></section><form id="rodaAccessForm"><label>Correo de Google<input class="input" type="email" id="rodaAccessEmail" required maxlength="200" placeholder="persona@gmail.com"></label><label>Nombre<input class="input" id="rodaAccessName" maxlength="150" placeholder="Nombre de la persona"></label><label>Partir de un perfil<select class="input" id="rodaAccessPreset"><option value="assistant">Asistencia de dirección</option><option value="director">Dirección</option><option value="photo">Fotografía · lectura</option><option value="reader">Lectura general</option></select></label><div class="roda-access-permissions">${Object.entries(RodaPolicy.sections).map(([k,label])=>`<label>${escape(label)}<select class="input" data-permission="${k}"><option value="none">Oculto</option><option value="read">Puede ver</option>${k!=='reports'?'<option value="edit">Puede editar</option>':''}</select></label>`).join('')}</div><p class="muted small">Editar Guion permite cargar versiones y elegir la base de producción; requiere edición del desglose. Los reportes muestran únicamente los datos de las secciones habilitadas.</p><label class="roda-admin-check"><input type="checkbox" id="rodaAccessAdmin"> Administrar este Roda: acceso completo y gestión del equipo.</label><div class="row gap"><button class="btn primary" type="submit">Guardar acceso</button><button class="btn" type="button" id="rodaAccessRemove" hidden>Quitar acceso</button></div></form></div><p id="rodaAccessStatus" role="status" aria-live="polite"></p>`;
   host.querySelectorAll('[data-member-index]').forEach(b=>b.onclick=()=>form(data.members[Number(b.dataset.memberIndex)]));$('rodaAccessNew').onclick=()=>form(null);
   $('rodaAccessPreset').onchange=e=>{for(const [k,v] of Object.entries(presets[e.target.value]))host.querySelector(`[data-permission="${k}"]`).value=v;};
   $('rodaAccessCopy').onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+location.pathname+'?'+new URLSearchParams({studioSpace:studio.project.spaceId,studioProject:studio.project.id}));status('Enlace copiado. Compartilo con la persona que habilitaste.');}catch{status('Copiá la dirección de esta página para compartirla.');}};
   const save=async remove=>{const buttons=host.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{if(window.RODA_UNSAVED)await window.RODA_FLUSH();const sections=Object.fromEntries([...host.querySelectorAll('[data-permission]')].map(n=>[n.dataset.permission,n.value]));const result=await request('/access',{method:'POST',body:JSON.stringify({email:$('rodaAccessEmail').value,name:$('rodaAccessName').value,admin:$('rodaAccessAdmin').checked,sections,remove,revision:data.revision})});studio.project.rodaAccess.revision=result.revision;const fresh=await request('');studio.project.rodaAccess=fresh.rodaAccess;studio.canEdit=Object.values(fresh.rodaAccess.sections).includes('edit');if(!fresh.rodaAccess.admin){location.reload();return;}data=await request('/access');render();status(remove?'Acceso retirado.':'Acceso guardado. Ya puede entrar con su cuenta de Google y el enlace del proyecto.');}catch(e){status(e.message);}finally{buttons.forEach(b=>b.disabled=false);}};
   $('rodaAccessForm').onsubmit=e=>{e.preventDefault();save(false);};$('rodaAccessRemove').onclick=()=>save(true);form(null);
  }
  try{data=await request('/access');render();}catch(e){host.textContent=e.message;}
 }
 function bind(){for(const node of document.querySelectorAll('#btnAddShot,.shotsWrap'))node.dataset.rodaSection='shotlist';apply();new MutationObserver(()=>apply()).observe(document.querySelector('.main'),{childList:true,subtree:true});$('btnRodaAccess').onclick=open;$('rodaAccessClose').onclick=()=>$('rodaAccessDialog').close();}
 window.RodaAccess={canView,canEdit,apply,bind};
})();
