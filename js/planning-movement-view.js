(function(root){
  'use strict';
  const selections=new Map();
  const selected=day=>{if(!selections.has(day))selections.set(day,new Set());return selections.get(day);};
  const selector='.dpBlock,.schedBlock,.shotPlanRow';
  function bind(container,config){
    container._movement=config;
    const doc=container.ownerDocument;
    const read=node=>container._movement.read(node);
    function paint(){for(const node of container.querySelectorAll(selector)){const r=read(node);if(r)node.classList.toggle('movement-selected',selected(r.dayId).has(r.key));}}
    for(const node of container.querySelectorAll(selector)){
      if(!node.querySelector('.planTouchGrip,.shotPlanGrip')){const grip=doc.createElement('span');grip.className='planTouchGrip';grip.textContent='⠿';node.append(grip);}
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
      if(e.ctrlKey||e.metaKey){e.preventDefault();e.stopImmediatePropagation();const set=selected(r.dayId);set.has(r.key)?set.delete(r.key):set.add(r.key);paint();}
    },true);
    container.addEventListener('keydown',e=>{
      if(e.target.matches('input,textarea,select'))return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){const r=read(e.target.closest(selector))||container._movement.items(container._movement.bars()[0]?.dayId)[0];if(!r)return;e.preventDefault();selections.set(r.dayId,new Set(container._movement.items(r.dayId).map(r=>r.key)));paint();}
    });
    container.addEventListener('pointerdown',e=>{
      const c=container._movement,node=e.target.closest(selector),r=node&&read(node);
      if(!c.canEdit()||e.button!==0||e.target.closest('input,textarea,select,.resize,[data-action="resize"],.shotPlanDetail'))return;
      if(!r){
        if(e.target.closest('button,a,summary,.schedHead,.shotPlanDayHeading'))return;
        const zone=c.zones().find(z=>z.node.contains(e.target));if(!zone)return;
        const rect=zone.node.getBoundingClientRect();e.preventDefault();e.stopImmediatePropagation();
        drag={marquee:true,node:container,zone,r:{dayId:zone.dayId},keys:[],before:new Set(selected(zone.dayId)),add:e.ctrlKey||e.metaKey,anchorX:e.clientX-rect.left+zone.node.scrollLeft,anchorY:e.clientY-rect.top+zone.node.scrollTop,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,pointer:e.pointerId,moved:false,frame:0};
        if(!drag.add)selected(zone.dayId).clear();paint();return;
      }
      if(e.target.closest('button')&&!e.target.closest('.shotPlanSelect,.shotPlanGrip'))return;
      if((e.pointerType==='touch'||e.pointerType==='pen')&&!e.target.closest('.planTouchGrip,.shotPlanGrip'))return;
      e.stopImmediatePropagation();
      if(e.ctrlKey||e.metaKey)return;
      const keys=selected(r.dayId).has(r.key)?[...selected(r.dayId)]:[r.key];
      drag={node,r,keys,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,pointer:e.pointerId,moved:false,target:null,frame:0};
      if(c.timeline()){const zone=c.zones().find(z=>z.dayId===r.dayId);drag.pressMinute=c.minute(zone,e.clientY);drag.activeStart=c.items(r.dayId).find(row=>row.key===r.key)?.start||0;}
    },true);
    function clearTarget(){doc.querySelectorAll('.planning-insert-before,.planning-insert-after,.planning-swap-target').forEach(n=>n.classList.remove('planning-insert-before','planning-insert-after','planning-swap-target'));}
    function locate(){const p=drag,c=container._movement;clearTarget();p.target=null;
      if(p.marquee){
        const rect=p.zone.node.getBoundingClientRect(),ax=rect.left+p.anchorX-p.zone.node.scrollLeft,ay=rect.top+p.anchorY-p.zone.node.scrollTop;
        const box={left:Math.max(rect.left,Math.min(ax,p.x)),right:Math.min(rect.right,Math.max(ax,p.x)),top:Math.max(rect.top,Math.min(ay,p.y)),bottom:Math.min(rect.bottom,Math.max(ay,p.y))};
        const ids=p.add?new Set(p.before):new Set();
        for(const node of container.querySelectorAll(selector)){const r=read(node),b=node.getBoundingClientRect();if(r?.dayId===p.r.dayId&&b.left<box.right&&b.right>box.left&&b.top<box.bottom&&b.bottom>box.top)ids.add(r.key);}
        selections.set(p.r.dayId,ids);paint();if(p.ghost)Object.assign(p.ghost.style,{left:box.left+'px',top:box.top+'px',width:Math.max(0,box.right-box.left)+'px',height:Math.max(0,box.bottom-box.top)+'px'});return;
      }
      if(doc.elementFromPoint(p.x,p.y)?.closest('.schedHead,.shotPlanDayHeading,.shotPlanDetail'))return;
      const zone=c.zones().find(z=>{const r=z.node.getBoundingClientRect();return p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom;});if(!zone)return;
      const candidates=Array.from(container.querySelectorAll(selector)).filter(n=>{const r=read(n);return r?.dayId===zone.dayId&&!(r.dayId===p.r.dayId&&p.keys.includes(r.key));});
      let hit=candidates.find(n=>{const b=n.getBoundingClientRect();return p.y>=b.top&&p.y<=b.bottom;});
      if(!hit&&c.timeline())hit=candidates.map(node=>{const b=node.getBoundingClientRect();return {node,distance:Math.min(Math.abs(p.y-b.top),Math.abs(p.y-b.bottom))};}).filter(r=>r.distance<=8).sort((a,b)=>a.distance-b.distance)[0]?.node;
      if(!hit&&!c.timeline())hit=candidates.find(n=>p.y<n.getBoundingClientRect().top)||candidates.at(-1);
      if(hit){
        const rect=hit.getBoundingClientRect(),r=read(hit),edge=Math.min(18,rect.height/4);
        // Edges insert; only the interior of the actual card exchanges it.
        // Gaps and the time gutter remain insertion targets, including on touch.
        const swap=p.x>=rect.left&&p.x<=rect.right&&p.y>rect.top+edge&&p.y<rect.bottom-edge;
        const position=p.y<(rect.top+rect.bottom)/2?'before':'after';
        hit.classList.add(swap?'planning-swap-target':'planning-insert-'+position);
        p.target={dayId:r.dayId,targetKey:r.key,position,swap};
      }else{
        if(c.timeline()){const delta=c.minute(zone,p.y)-p.pressMinute,start=p.activeStart+delta;p.target={dayId:zone.dayId,...(zone.dayId===p.r.dayId?{delta}:{start})};}
        else p.target={dayId:zone.dayId};
      }
    }
    function preview(){
      const p=drag,c=container._movement;
      p.preview?.remove();p.preview=null;
      if(!p.target||p.marquee||!c.timeline()||!c.rectangle)return;
      const zone=c.zones().find(z=>z.dayId===p.target.dayId);if(!zone)return;
      const signature=JSON.stringify(p.target);
      if(p.previewSignature!==signature){
        p.previewSignature=signature;p.previewRows=[];
        // Use the same movement engine on copies: preview never writes project data.
        const source=JSON.parse(JSON.stringify(c.day(p.r.dayId))),target=source.id===p.target.dayId?source:JSON.parse(JSON.stringify(c.day(p.target.dayId)));
        const keys=p.keys.flatMap(key=>c.members(p.r.dayId,key));
        const ids=new Set(root.RodaPlanningMovement.rows(c.state(),source,c.shots()).filter(r=>keys.includes(r.key)||keys.includes('scene:'+r.sceneId)).map(r=>r.key));
        try{
          root.RodaPlanningMovement.move(c.state(),source,keys,target,{...p.target,shots:c.shots(),targetKeys:p.target.targetKey?c.members(p.target.dayId,p.target.targetKey):[]});
          p.previewRows=root.RodaPlanningMovement.rows(c.state(),target,c.shots()).filter(r=>ids.has(r.key));
        }catch(_e){return;}
      }
      const clip=scrollBounds(zone.node,p),layer=doc.createElement('div');layer.className='planningDropPreview';layer.setAttribute('aria-hidden','true');
      for(const sc of c.scrollers().filter(sc=>sc&&sc.contains(zone.node))){const bounds=scrollBounds(sc,p);clip.top=Math.max(clip.top,bounds.top);clip.bottom=Math.min(clip.bottom,bounds.bottom);}
      for(const row of p.previewRows){
        const r=c.rectangle(zone,row),left=Math.max(clip.left,r.left),top=Math.max(clip.top,r.top),right=Math.min(clip.right,r.right),bottom=Math.min(clip.bottom,r.top+r.height);
        if(right<=left||bottom<=top)continue;
        const box=doc.createElement('div');box.className='planningDropOutline'+(p.target.swap?' is-swap':'');box.dataset.key=row.key;box.dataset.start=row.start;box.dataset.duration=row.dur;
        Object.assign(box.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});layer.append(box);
      }
      doc.body.append(layer);p.preview=layer;
    }
    function scrollBounds(sc,p){
      const rect=sc.getBoundingClientRect(),view=root.visualViewport;
      const b={left:Math.max(view?.offsetLeft||0,rect.left+sc.clientLeft),right:Math.min((view?.offsetLeft||0)+(view?.width||innerWidth),rect.left+sc.clientLeft+sc.clientWidth),top:Math.max(view?.offsetTop||0,rect.top+sc.clientTop),bottom:Math.min((view?.offsetTop||0)+(view?.height||innerHeight),rect.top+sc.clientTop+sc.clientHeight)};
      // A nested shot list may be taller than its visible parent. Use the part
      // actually on screen, not the off-screen bottom of the list.
      for(let parent=sc.parentElement;parent;parent=parent.parentElement){
        const style=getComputedStyle(parent),r=parent.getBoundingClientRect();
        if(/auto|scroll|hidden|clip/.test(style.overflowY)){b.top=Math.max(b.top,r.top+parent.clientTop);b.bottom=Math.min(b.bottom,r.top+parent.clientTop+parent.clientHeight);}
        if(/auto|scroll|hidden|clip/.test(style.overflowX)){b.left=Math.max(b.left,r.left+parent.clientLeft);b.right=Math.min(b.right,r.left+parent.clientLeft+parent.clientWidth);}
      }
      // The fixed day headings cover the top of the general plan's scroll area.
      for(const head of sc.querySelectorAll('.schedHead,.shotPlanDayHeading')){
        const r=head.getBoundingClientRect();if(p.x>=r.left&&p.x<=r.right&&r.top<=b.top+12&&r.bottom>b.top)b.top=Math.min(b.bottom,r.bottom);
      }
      return b;
    }
    function edgeSpeed(value,start,end,band,maxSpeed){
      band=Math.min(band,(end-start)/3);if(band<=0)return 0;
      const distance=Math.min(value-start,end-value);if(distance>=band)return 0;
      const strength=Math.min(1,Math.max(0,(band-distance)/band));
      return (value<(start+end)/2?-1:1)*(100+(maxSpeed-100)*strength*strength);
    }
    function tick(now){const p=drag;if(!p)return;if(!container._movement.canEdit()||!p.node.isConnected){finish(false);return;}
      const elapsed=Math.min(32,Math.max(0,now-(p.scrollFrame??now-16)))/1000;p.scrollFrame=now;
      let changed=false,movedX=false,movedY=false;
      // Prefer the inner scrollable list; never scroll two nested panels on
      // the same axis in one frame. The pointer can stay still at the edge.
      for(const sc of [...container._movement.scrollers()].filter(Boolean).reverse()){
        const b=scrollBounds(sc,p);if(b.right<=b.left||b.bottom<=b.top||p.x<b.left-48||p.x>b.right+48||p.y<b.top-72||p.y>b.bottom+72)continue;
        const x=sc.scrollLeft,y=sc.scrollTop;
        if(!movedY&&sc.scrollHeight>sc.clientHeight+1)sc.scrollTop+=edgeSpeed(p.y,b.top,b.bottom,72,1000)*elapsed;
        if(!movedX&&sc.scrollWidth>sc.clientWidth+1)sc.scrollLeft+=edgeSpeed(p.x,b.left,b.right,48,650)*elapsed;
        movedY ||= sc.scrollTop!==y;movedX ||= sc.scrollLeft!==x;changed ||= sc.scrollTop!==y||sc.scrollLeft!==x;
      }
      if(changed){locate();preview();}p.frame=requestAnimationFrame(tick);
    }
    function finish(commit){const p=drag;if(!p)return;if(commit)locate();drag=null;cancelAnimationFrame(p.frame);p.ghost?.remove();p.preview?.remove();clearTarget();doc.body.classList.remove('shot-plan-dragging');container.querySelectorAll('.planning-moving').forEach(n=>n.classList.remove('planning-moving'));
      if(p.marquee&&!commit){selections.set(p.r.dayId,p.before);paint();}
      if(!p.moved)return;ignoreClick=true;setTimeout(()=>{ignoreClick=false;},0);
      if(commit&&!p.marquee&&p.target)perform(p.r.dayId,p.keys,p.target.dayId,p.target);paint();
    }
    window.addEventListener('pointermove',e=>{const p=drag;if(!p||p.pointer!==e.pointerId)return;p.x=e.clientX;p.y=e.clientY;if(!p.moved&&Math.hypot(p.x-p.x0,p.y-p.y0)<6)return;e.preventDefault();
      if(!p.moved){p.moved=true;if(!p.marquee)selections.set(p.r.dayId,new Set(p.keys));paint();doc.body.classList.add('shot-plan-dragging');for(const n of container.querySelectorAll(selector)){const r=read(n);if(r?.dayId===p.r.dayId&&p.keys.includes(r.key))n.classList.add('planning-moving');}if(p.marquee){p.ghost=doc.createElement('div');p.ghost.className='planningMarquee';doc.body.append(p.ghost);}p.frame=requestAnimationFrame(tick);}locate();preview();},{passive:false});
    window.addEventListener('pointerup',e=>{if(drag?.pointer===e.pointerId){finish(true);}});
    window.addEventListener('pointercancel',()=>finish(false));window.addEventListener('blur',()=>finish(false));
    window.addEventListener('keydown',e=>{if(!drag&&e.key==='Escape'&&!e.target.matches('input,textarea,select')){selections.clear();paint();}if(drag&&e.key==='Escape'){e.preventDefault();finish(false);}});
  }
  root.RodaPlanningMovementView={bind};
})(window);
