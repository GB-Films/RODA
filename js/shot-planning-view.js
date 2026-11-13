(function(root){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time=(day,min)=>{const [h,m]=String(day.callTime||'08:00').split(':').map(Number),abs=h*60+m+min;return String(Math.floor(abs/60)%24).padStart(2,'0')+':'+String(Math.round(abs%60)).padStart(2,'0')+(abs>=1440?' +1':'');};
  function fit(){const host=document.getElementById('shotPlanDay');if(host&&!host.hidden)host.style.maxHeight=Math.max(160,innerHeight-host.getBoundingClientRect().top-24)+'px';}
  const observer=new ResizeObserver(()=>requestAnimationFrame(fit));
  window.addEventListener('resize',()=>requestAnimationFrame(fit));
  function render(host,{state,day,canEdit,change,openScene,query='',grouped=false}){
    const api=root.RodaShotPlanning,rows=grouped?api.groups(state,day):api.rows(state,day),top=host.scrollTop;
    const selected=host.dataset.selected;
    host.className='shotPlanning';host.dataset.dayId=day.id;
    host.innerHTML=`<p class="shotPlanHint">${grouped?'Escenas agrupadas por planos consecutivos. Arrastrá para insertar; Shift + arrastrar intercambia.':'Arrastrá para insertar y reacomodar horarios. Shift + arrastrar intercambia. Los planos y bloques conservan su duración.'}</p><div class="shotPlanRows"></div><aside class="shotPlanDetail" hidden></aside>`;
    const list=host.querySelector('.shotPlanRows');
    if(!grouped&&canEdit()){
      const scheduled=new Set((state.shootDays||[]).flatMap(d=>api.rows(state,d).filter(r=>r.kind==='shot').map(r=>r.key)));
      const available=state.scenes.flatMap(owner=>(owner.shots||[]).map((shot,i)=>({owner,shot,number:i+1,key:owner.id+'|'+shot.id}))).filter(r=>!scheduled.has(r.key));
      if(available.length){
        const add=document.createElement('details');add.className='shotPlanAdd';
        add.innerHTML='<summary>+ Programar un plano pendiente ('+available.length+')</summary><label>Plano<select class="input" aria-label="Plano pendiente"></select></label><button type="button" class="btn">Agregar a esta jornada</button>';
        const select=add.querySelector('select');for(const r of available){const opt=document.createElement('option');opt.value=r.key;opt.textContent=`E${r.owner.number} · P${r.number} · ${r.shot.type||'Plano'} · ${r.shot.desc||''}`;select.append(opt);}
        add.querySelector('button').onclick=()=>{const r=available.find(r=>r.key===select.value);if(r&&canEdit())change(()=>api.addShot(state,day,r.owner.id,r.shot.id));};host.insertBefore(add,list);
      }
    }
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
      const move=(target,targetDay=day,position='before')=>{if(!canEdit())return;change(()=>api.move(state,day,row.key,targetDay,target,position));};
      grip.onkeydown=e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const index=rows.findIndex(r=>r.key===row.key),target=rows[index+(e.key==='ArrowUp'?-1:1)];if(target)move(target.key,day,e.key==='ArrowDown'?'after':'before');};
      grip.onpointerdown=e=>{
        if(root.RodaPlanningMovementView)return;
        if(e.button!==0||!canEdit())return;e.preventDefault();
        const pointer=e.pointerId,x0=e.clientX,y0=e.clientY;let x=x0,y=y0,target=null,moving=false,frame=0,finished=false;
        grip.setPointerCapture(pointer);
        const clear=()=>document.querySelectorAll('.shotPlanning .dropTarget,.shotPlanning.dropEmpty').forEach(n=>{n.classList.remove('dropTarget','dropEmpty');delete n.dataset.dropPosition;});
        const locate=()=>{
          clear();target=null;
          const destination=Array.from(document.querySelectorAll('.shotPlanning')).find(n=>{const r=n.getBoundingClientRect();return n.offsetWidth&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});
          if(!destination||destination.querySelector('.shotPlanDetail:not([hidden])')?.contains(document.elementFromPoint(x,y)))return;
          const targetDay=(state.shootDays||[]).find(d=>d.id===destination.dataset.dayId);if(!targetDay)return;
          const nodes=Array.from(destination.querySelectorAll('.shotPlanRow'));
          const hit=nodes.find(n=>y<=n.getBoundingClientRect().bottom)||nodes.at(-1);
          if(hit){if(hit===node)return;const r=hit.getBoundingClientRect(),position=y<(r.top+r.bottom)/2?'before':'after';hit.classList.add('dropTarget');hit.dataset.dropPosition=position;target={day:targetDay,key:hit.dataset.key,position};}
          else{destination.classList.add('dropEmpty');target={day:targetDay,key:null,position:'before'};}
        };
        const tick=()=>{
          for(const destination of document.querySelectorAll('.shotPlanning')){const b=destination.getBoundingClientRect();if(x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom){if(y<b.top+50)destination.scrollTop-=10;else if(y>b.bottom-50)destination.scrollTop+=10;}}
          const board=document.getElementById('schedWrap');if(board&&host.closest('.shotPlanBoard')){const b=board.getBoundingClientRect();if(x<b.left+50)board.scrollLeft-=12;else if(x>b.right-50)board.scrollLeft+=12;}
          locate();frame=requestAnimationFrame(tick);
        };
        const onmove=event=>{if(event.pointerId!==pointer)return;x=event.clientX;y=event.clientY;if(!moving&&Math.hypot(x-x0,y-y0)>4){moving=true;node.classList.add('dragging');document.body.classList.add('shot-plan-dragging');frame=requestAnimationFrame(tick);}if(moving)locate();};
        const finish=event=>{if(finished||event.pointerId!==undefined&&event.pointerId!==pointer)return;finished=true;cancelAnimationFrame(frame);window.removeEventListener('pointermove',onmove);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);window.removeEventListener('keydown',escape);window.removeEventListener('blur',finish);node.classList.remove('dragging');document.body.classList.remove('shot-plan-dragging');clear();if(grip.hasPointerCapture(pointer))grip.releasePointerCapture(pointer);if(event.type==='pointerup'&&moving&&target)move(target.key,target.day,target.position);};
        const escape=event=>{if(event.key==='Escape')finish(event);};
        window.addEventListener('pointermove',onmove);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);window.addEventListener('keydown',escape);window.addEventListener('blur',finish);
      };
    }
    if(!rows.length)list.innerHTML='<p class="muted">Jornada sin actividades. Arrastrá un plano acá o elegí esta jornada desde el detalle del plano.</p>';
    function select(row){
      host.dataset.selected=row.key;host.querySelectorAll('.shotPlanRow').forEach(n=>n.classList.toggle('selected',n.dataset.key===row.key));
      const detail=host.querySelector('.shotPlanDetail');detail.hidden=false;
      detail.innerHTML=`<button class="btn small shotPlanClose" data-ro-allow="1">Cerrar ×</button><h3>${row.kind==='shot'?`Escena ${esc(row.number)} · Plano ${row.shotNumber}`:esc(row.title)}</h3><p>${esc(row.title)}</p><p class="shotPlanFullDescription">${esc(row.desc)}</p><p><b>${time(day,row.start)}–${time(day,row.start+row.dur)}</b> · ${row.dur} min</p>${['shot','block'].includes(row.kind)?`<label>Duración de rodaje (min)<input class="input" type="number" min="1" max="720" step="1" aria-label="Duración del plano" value="${row.dur}" ${canEdit()?'':'disabled'}></label><p class="small muted">Cada plano conserva su duración. Los siguientes se acomodan al moverlo o cambiar sus minutos.</p>`:''}${row.sceneId?'<button class="btn shotPlanOpen" data-ro-allow="1">Abrir en Shotlist →</button>':''}`;
      if(row.kind==='block'&&canEdit()){
        const form=document.createElement('div');form.className='shotPlanBlockFields';
        form.innerHTML='<label>Título<input class="input" aria-label="Título del bloque"></label><label>Detalle<textarea class="input" aria-label="Detalle del bloque"></textarea></label><label>Color<input type="color" aria-label="Color del bloque"></label>';
        const b=(day.blocks||[]).find(b=>b.id===row.id);
        for(const [selector,field] of [['input[type="color"]','color'],['textarea','detail'],['input.input','title']]){const input=form.querySelector(selector);input.value=b[field]|| (field==='color'?'#f97316':'');input.onchange=()=>{if(canEdit())change(()=>{const current=(day.blocks||[]).find(b=>b.id===row.id);if(!current)return false;current[field]=input.value;return true;});};}detail.append(form);
      }
      if(row.kind==='shot'){
        const box=document.createElement('div');box.className='shotPlanMove';
        box.innerHTML='<label>Jornada de destino<select class="input" aria-label="Jornada de destino"></select></label><label>Ubicación<select class="input" aria-label="Ubicación del plano"></select></label><button class="btn" type="button">Mover plano</button>';
        detail.append(box);
        const [destination,position]=box.querySelectorAll('select'),button=box.querySelector('button');
        for(const d of state.shootDays||[]){const option=document.createElement('option');option.value=d.id;option.textContent=[d.date,d.label,d.location].filter(Boolean).join(' · ')||'Jornada';destination.append(option);}
        destination.value=day.id;
        const fill=()=>{const d=state.shootDays.find(d=>d.id===destination.value);position.replaceChildren();for(const r of api.rows(state,d).filter(r=>r.key!==row.key)){const option=document.createElement('option');option.value=r.key;option.textContent='Antes de '+(r.kind==='shot'?`E${r.number} · P${r.shotNumber}`:r.title)+' · '+time(d,r.start);position.append(option);}const end=document.createElement('option');end.value='';end.textContent='Al final de la jornada';position.append(end);};
        destination.onchange=fill;fill();
        for(const input of [destination,position,button])input.disabled=!canEdit();
        button.onclick=()=>{if(canEdit())change(()=>api.move(state,day,row.key,state.shootDays.find(d=>d.id===destination.value),position.value||null));};
      }
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
