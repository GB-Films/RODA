(function(root){
  'use strict';
  const selections=new Map();
  const selected=day=>{if(!selections.has(day))selections.set(day,new Set());return selections.get(day);};
  const selector='.dpBlock,.schedBlock,.shotPlanRow';
  function bind(container,config){
    container._movement=config;
    const doc=container.ownerDocument;
    const read=node=>container._movement.read(node);
    function paint(){for(const node of container.querySelectorAll(selector)){const r=read(node);if(!r)continue;const active=selected(r.dayId).has(r.key);node.classList.toggle('movement-selected',active);const input=node.querySelector('.planningCheck');if(input)input.checked=active;}
      for(const bar of container._movement.bars()){const set=selected(bar.dayId),count=bar.node.querySelector('.planningSelectionCount');if(count)count.textContent=set.size?set.size+' seleccionados':'Seleccionar actividades';for(const button of bar.node.querySelectorAll('[data-shift]'))button.disabled=!set.size||!container._movement.canEdit();}}
    for(const node of container.querySelectorAll(selector)){
      const r=read(node);if(!r||node.querySelector('.planningCheck'))continue;
      const input=doc.createElement('input');input.type='checkbox';input.className='planningCheck';input.setAttribute('aria-label','Seleccionar '+r.label);input.disabled=!config.canEdit();node.prepend(input);
      if(!node.querySelector('.planTouchGrip,.shotPlanGrip')){const grip=doc.createElement('span');grip.className='planTouchGrip';grip.textContent='⠿';node.append(grip);}
    }
    for(const bar of config.bars()){
      if(bar.node.querySelector('.planningSelectionBar'))continue;
      const toolbar=doc.createElement('div');toolbar.className='planningSelectionBar noPrint';
      toolbar.innerHTML='<button type="button" class="btn small planningSelectAll">Seleccionar todo</button><button type="button" class="btn small planningClear" aria-label="Quitar selección">×</button><span class="planningSelectionCount"></span><label>Min <input type="number" min="1" max="720" step="1" value="15" aria-label="Minutos a desplazar"></label><button type="button" class="btn small" data-shift="-1" aria-label="Adelantar selección">↑</button><button type="button" class="btn small" data-shift="1" aria-label="Atrasar selección">↓</button>';
      toolbar.title='Arrastrá para insertar. Shift + arrastrar intercambia. Ctrl/Cmd + clic suma actividades a la selección.';
      toolbar.addEventListener('pointerdown',e=>e.stopPropagation());toolbar.addEventListener('click',e=>e.stopPropagation());
      toolbar.querySelector('.planningSelectAll').onclick=()=>{selections.set(bar.dayId,new Set(config.items(bar.dayId).map(r=>r.key)));paint();};
      toolbar.querySelector('.planningClear').onclick=()=>{selected(bar.dayId).clear();paint();};
      for(const button of toolbar.querySelectorAll('[data-shift]'))button.onclick=()=>{const value=Number(toolbar.querySelector('input').value);if(!Number.isFinite(value)||value<1||value>720)return;perform(bar.dayId,[...selected(bar.dayId)],bar.dayId,{delta:value*Number(button.dataset.shift)});};
      toolbar.querySelector('.planningSelectAll').disabled=!config.canEdit();bar.node.append(toolbar);
    }
    for(const bar of config.bars()){const valid=new Set(config.items(bar.dayId).map(r=>r.key));for(const key of selected(bar.dayId))if(!valid.has(key))selected(bar.dayId).delete(key);}
    paint();
    function perform(dayId,keys,targetDayId,options){const c=container._movement;if(!c.canEdit())return;
      c.change(()=>{const changed=root.RodaPlanningMovement.move(c.state(),c.day(dayId),keys.flatMap(key=>c.members(dayId,key)),c.day(targetDayId),{...options,shots:c.shots(),targetKeys:options.targetKey?c.members(targetDayId,options.targetKey):[]});if(changed){selected(dayId).clear();selections.set(targetDayId,new Set(keys));}return changed;});}
    if(container.dataset.movementBound)return;
    container.dataset.movementBound='1';container.tabIndex=container.tabIndex<0?0:container.tabIndex;
    let drag=null,ignoreClick=false;
    container.addEventListener('click',e=>{
      if(ignoreClick){ignoreClick=false;e.preventDefault();e.stopImmediatePropagation();return;}
      const node=e.target.closest(selector),r=node&&read(node);if(!r)return;
      if(e.target.closest('.planningCheck')||e.ctrlKey||e.metaKey){if(!e.target.closest('.planningCheck'))e.preventDefault();e.stopImmediatePropagation();const set=selected(r.dayId);set.has(r.key)?set.delete(r.key):set.add(r.key);paint();}
    },true);
    container.addEventListener('keydown',e=>{
      if(e.target.matches('input,textarea,select'))return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){const r=read(e.target.closest(selector))||container._movement.items(container._movement.bars()[0]?.dayId)[0];if(!r)return;e.preventDefault();selections.set(r.dayId,new Set(container._movement.items(r.dayId).map(r=>r.key)));paint();}
    });
    container.addEventListener('pointerdown',e=>{
      const c=container._movement,node=e.target.closest(selector),r=node&&read(node);
      if(!r||!c.canEdit()||e.button!==0||e.target.closest('input,textarea,select,.resize,[data-action="resize"],.planningSelectionBar'))return;
      if(e.target.closest('button')&&!e.target.closest('.shotPlanSelect,.shotPlanGrip'))return;
      if((e.pointerType==='touch'||e.pointerType==='pen')&&!e.target.closest('.planTouchGrip,.shotPlanGrip'))return;
      e.stopImmediatePropagation();
      if(e.ctrlKey||e.metaKey)return;
      const keys=selected(r.dayId).has(r.key)?[...selected(r.dayId)]:[r.key];
      drag={node,r,keys,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,pointer:e.pointerId,shift:e.shiftKey,moved:false,target:null,frame:0};
      if(c.timeline()){const zone=c.zones().find(z=>z.dayId===r.dayId);drag.pressMinute=c.minute(zone,e.clientY);drag.activeStart=c.items(r.dayId).find(row=>row.key===r.key)?.start||0;}
    },true);
    function clearTarget(){doc.querySelectorAll('.planning-insert-before,.planning-insert-after,.planning-swap-target').forEach(n=>n.classList.remove('planning-insert-before','planning-insert-after','planning-swap-target'));}
    function locate(){const p=drag,c=container._movement;clearTarget();p.target=null;
      if(doc.elementFromPoint(p.x,p.y)?.closest('.schedHead,.shotPlanDayHeading,.planningSelectionBar,.shotPlanDetail'))return;
      const zone=c.zones().find(z=>{const r=z.node.getBoundingClientRect();return p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom;});if(!zone)return;
      const candidates=Array.from(container.querySelectorAll(selector)).filter(n=>{const r=read(n);return r?.dayId===zone.dayId&&!(r.dayId===p.r.dayId&&p.keys.includes(r.key));});
      let hit=candidates.find(n=>{const b=n.getBoundingClientRect();return p.y>=b.top&&p.y<=b.bottom;});
      if(!hit&&!c.timeline())hit=candidates.find(n=>p.y<n.getBoundingClientRect().top)||candidates.at(-1);
      if(hit){const rect=hit.getBoundingClientRect(),r=read(hit),position=p.y<(rect.top+rect.bottom)/2?'before':'after';hit.classList.add(p.shift?'planning-swap-target':'planning-insert-'+position);p.target={dayId:r.dayId,targetKey:r.key,position,swap:p.shift};}
      else if(!p.shift){
        if(c.timeline()){const delta=c.minute(zone,p.y)-p.pressMinute,start=p.activeStart+delta;p.target={dayId:zone.dayId,...(zone.dayId===p.r.dayId?{delta}:{start})};}
        else p.target={dayId:zone.dayId};
      }
      if(p.ghost){p.ghost.style.left=p.x+14+'px';p.ghost.style.top=p.y+12+'px';p.ghost.textContent=(p.shift?'Intercambiar':'Insertar')+' · '+p.keys.length+(p.keys.length===1?' actividad':' actividades');}
    }
    function tick(){const p=drag;if(!p)return;if(!container._movement.canEdit()||!p.node.isConnected){finish(false);return;}
      for(const sc of container._movement.scrollers()){const rect=sc.getBoundingClientRect(),b={left:Math.max(0,rect.left),right:Math.min(window.innerWidth,rect.right),top:Math.max(0,rect.top),bottom:Math.min(window.innerHeight,rect.bottom)};if(p.x<b.left-20||p.x>b.right+20||p.y<b.top-20||p.y>b.bottom+20)continue;if(p.y<b.top+40)sc.scrollTop-=12;else if(p.y>b.bottom-40)sc.scrollTop+=12;if(p.x<b.left+35)sc.scrollLeft-=10;else if(p.x>b.right-35)sc.scrollLeft+=10;}
      locate();p.frame=requestAnimationFrame(tick);
    }
    function finish(commit){const p=drag;if(!p)return;if(commit)locate();drag=null;cancelAnimationFrame(p.frame);p.ghost?.remove();clearTarget();doc.body.classList.remove('shot-plan-dragging');container.querySelectorAll('.planning-moving').forEach(n=>n.classList.remove('planning-moving'));
      if(!p.moved)return;ignoreClick=true;setTimeout(()=>{ignoreClick=false;},0);
      if(commit&&p.target)perform(p.r.dayId,p.keys,p.target.dayId,p.target);paint();
    }
    window.addEventListener('pointermove',e=>{const p=drag;if(!p||p.pointer!==e.pointerId)return;p.x=e.clientX;p.y=e.clientY;p.shift=e.shiftKey;if(!p.moved&&Math.hypot(p.x-p.x0,p.y-p.y0)<6)return;e.preventDefault();
      if(!p.moved){p.moved=true;selections.set(p.r.dayId,new Set(p.keys));paint();doc.body.classList.add('shot-plan-dragging');for(const n of container.querySelectorAll(selector)){const r=read(n);if(r?.dayId===p.r.dayId&&p.keys.includes(r.key))n.classList.add('planning-moving');}p.ghost=doc.createElement('div');p.ghost.className='planningDragGhost';doc.body.append(p.ghost);p.frame=requestAnimationFrame(tick);}locate();},{passive:false});
    window.addEventListener('pointerup',e=>{if(drag?.pointer===e.pointerId){drag.shift=e.shiftKey;finish(true);}});
    window.addEventListener('pointercancel',()=>finish(false));window.addEventListener('blur',()=>finish(false));
    window.addEventListener('keydown',e=>{if(drag&&e.key==='Escape'){e.preventDefault();finish(false);}else if(drag&&e.key==='Shift'){drag.shift=true;if(drag.moved)locate();}});
    window.addEventListener('keyup',e=>{if(drag&&e.key==='Shift'){drag.shift=false;if(drag.moved)locate();}});
  }
  root.RodaPlanningMovementView={bind};
})(window);
