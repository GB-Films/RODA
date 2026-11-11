(function(root){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time=(day,min)=>{const [h,m]=String(day.callTime||'08:00').split(':').map(Number),abs=h*60+m+min;return String(Math.floor(abs/60)%24).padStart(2,'0')+':'+String(Math.round(abs%60)).padStart(2,'0')+(abs>=1440?' +1':'');};
  function fit(){const host=document.getElementById('shotPlanDay');if(host&&!host.hidden)host.style.maxHeight=Math.max(160,innerHeight-host.getBoundingClientRect().top-24)+'px';}
  const observer=new ResizeObserver(()=>requestAnimationFrame(fit));
  window.addEventListener('resize',()=>requestAnimationFrame(fit));
  function render(host,{state,day,canEdit,change,openScene,query=''}){
    const api=root.RodaShotPlanning,rows=api.rows(state,day),top=host.scrollTop;
    const selected=host.dataset.selected;
    host.className='shotPlanning';
    host.innerHTML=`<p class="shotPlanHint">Planos agrupados por escena / tanda. Arrastrá el asa para reordenarlos dentro de cada tanda. Al cambiar una duración, se ajustan los horarios siguientes del día.</p><div class="shotPlanRows"></div><aside class="shotPlanDetail" hidden></aside>`;
    const list=host.querySelector('.shotPlanRows');
    let lastScene=null;
    for(const row of rows){
      if(query&&!`${row.number||''} ${row.title} ${row.desc}`.toLowerCase().includes(query.toLowerCase()))continue;
      if(row.kind==='shot'&&lastScene!==row.sceneId){const scene=state.scenes.find(s=>s.id===row.sceneId),h=document.createElement('div');h.className='shotPlanGroup';h.textContent=`Tanda #${scene.number} · ${scene.slugline}`;list.append(h);}
      lastScene=row.kind==='shot'?row.sceneId:null;
      const node=document.createElement('div');node.className='shotPlanRow '+row.kind;node.dataset.key=row.key;node.dataset.scene=row.sceneId||'';
      if(row.kind==='block'&&/^#[0-9a-f]{6}$/i.test(row.color))node.style.setProperty('--block-color',row.color);
      node.innerHTML=`${row.kind==='shot'?`<button class="shotPlanGrip" aria-label="Mover escena ${esc(row.number)}, plano ${row.shotNumber}" title="Arrastrar o usar flechas arriba y abajo" ${canEdit()?'':'disabled'}>⠿</button>`:''}<button class="shotPlanSelect" data-ro-allow="1"><span class="shotPlanClock">${time(day,row.start)}–${time(day,row.start+row.dur)} <small>${row.dur} min</small></span><span><strong>${row.kind==='shot'?`E${esc(row.number)} · P${row.shotNumber} · `:row.kind==='scene'?`E${esc(row.number)} · `:''}${esc(row.title)}</strong><span class="shotPlanDescription">${esc(row.desc)}</span></span></button>`;
      list.append(node);
      node.querySelector('.shotPlanSelect').onclick=()=>select(row);
      const grip=node.querySelector('.shotPlanGrip');if(!grip)continue;
      const move=(target)=>{if(!canEdit())return;change(()=>api.reorder(state,day,row.sceneId,row.key,target));};
      grip.onkeydown=e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const siblings=rows.filter(r=>r.sceneId===row.sceneId),index=siblings.findIndex(r=>r.key===row.key),target=siblings[index+(e.key==='ArrowUp'?-1:1)];if(target)move(target.key);};
      grip.onpointerdown=e=>{
        if(e.button!==0||!canEdit())return;e.preventDefault();
        const pointer=e.pointerId,y0=e.clientY;let y=y0,target=null,moving=false,frame=0,finished=false;
        grip.setPointerCapture(pointer);
        const locate=()=>{host.querySelectorAll('.dropTarget').forEach(n=>n.classList.remove('dropTarget'));target=null;const b=list.getBoundingClientRect();if(y<b.top||y>b.bottom)return;for(const n of list.querySelectorAll('.shotPlanRow.shot')){const r=n.getBoundingClientRect();if(y>=r.top&&y<=r.bottom&&n.dataset.scene===row.sceneId&&n!==node){target=n.dataset.key;n.classList.add('dropTarget');break;}}};
        const tick=()=>{const b=host.getBoundingClientRect();if(y<b.top+50)host.scrollTop-=10;else if(y>b.bottom-50)host.scrollTop+=10;locate();frame=requestAnimationFrame(tick);};
        const onmove=event=>{if(event.pointerId!==pointer)return;y=event.clientY;if(!moving&&Math.abs(y-y0)>4){moving=true;node.classList.add('dragging');frame=requestAnimationFrame(tick);}if(moving)locate();};
        const finish=event=>{if(finished||event.pointerId!==undefined&&event.pointerId!==pointer)return;finished=true;cancelAnimationFrame(frame);window.removeEventListener('pointermove',onmove);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);window.removeEventListener('keydown',escape);window.removeEventListener('blur',finish);node.classList.remove('dragging');host.querySelectorAll('.dropTarget').forEach(n=>n.classList.remove('dropTarget'));if(grip.hasPointerCapture(pointer))grip.releasePointerCapture(pointer);if(event.type==='pointerup'&&moving&&target)move(target);};
        const escape=event=>{if(event.key==='Escape')finish(event);};
        window.addEventListener('pointermove',onmove);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);window.addEventListener('keydown',escape);window.addEventListener('blur',finish);
      };
    }
    if(!rows.length)list.innerHTML='<p class="muted">Asigná escenas a esta jornada para organizar sus planos.</p>';
    function select(row){
      host.dataset.selected=row.key;host.querySelectorAll('.shotPlanRow').forEach(n=>n.classList.toggle('selected',n.dataset.key===row.key));
      const detail=host.querySelector('.shotPlanDetail');detail.hidden=false;
      detail.innerHTML=`<button class="btn small shotPlanClose" data-ro-allow="1">Cerrar ×</button><h3>${row.kind==='shot'?`Escena ${esc(row.number)} · Plano ${row.shotNumber}`:esc(row.title)}</h3><p>${esc(row.title)}</p><p class="shotPlanFullDescription">${esc(row.desc)}</p><p><b>${time(day,row.start)}–${time(day,row.start+row.dur)}</b> · ${row.dur} min</p>${row.kind==='shot'?`<label>Duración de rodaje (min)<input class="input" type="number" min="1" max="720" step="1" aria-label="Duración del plano" value="${row.dur}" ${canEdit()?'':'disabled'}></label><p class="small muted">La duración inicial se distribuye dentro del tiempo reservado para la escena. Ajustala según lo que requiera este plano.</p>`:''}${row.sceneId?'<button class="btn shotPlanOpen" data-ro-allow="1">Abrir en Shotlist →</button>':''}`;
      detail.querySelector('.shotPlanClose').onclick=()=>{detail.hidden=true;delete host.dataset.selected;nodeSelection();};
      detail.querySelector('input')?.addEventListener('change',e=>{if(canEdit())change(()=>api.duration(state,day,row.sceneId,row.key,e.target.value));});
      detail.querySelector('.shotPlanOpen')?.addEventListener('click',()=>openScene(row.sceneId));
    }
    function nodeSelection(){host.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));}
    const previous=rows.find(r=>r.key===selected);if(previous)select(previous);
    host.scrollTop=top;if(host.id==='shotPlanDay')observer.observe(host.parentElement);requestAnimationFrame(fit);
  }
  root.RodaShotPlanningView={render,time};
})(window);
