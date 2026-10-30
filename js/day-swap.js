(function(root){
  "use strict";
  function captureLayout(day){
    return {sceneIds:[...(day.sceneIds||[])],times:{...day.times},durations:{...day.durations},blocks:(day.blocks||[]).map(b=>({id:b.id,startMin:b.startMin,durMin:b.durMin}))};
  }
  function restoreLayout(day,before){
    day.times??={};day.durations??={};
    Object.assign(day.times,before.times);Object.assign(day.durations,before.durations);
    for(const row of before.blocks||[]){const block=(day.blocks||[]).find(b=>b.id===row.id);if(block){block.startMin=row.startMin;block.durMin=row.durMin;}}
  }
  function sceneAt(day,sourceId,minute){
    return (day.sceneIds||[]).find(id=>id!==sourceId&&minute>=Number(day.times?.[id]||0)&&minute<Number(day.times?.[id]||0)+Number(day.durations?.[id]??60))||null;
  }
  function swapScenes(day,sourceId,targetId){
    if(!day||sourceId===targetId||!day.sceneIds?.includes(sourceId)||!day.sceneIds.includes(targetId))return false;
    const items=[...day.sceneIds.map(id=>({kind:'scene',id,start:Number(day.times?.[id]??0),dur:Number(day.durations?.[id]??60)})),...(day.blocks||[]).map(b=>({kind:'block',id:b.id,start:Number(b.startMin??0),dur:Number(b.durMin??30)}))].sort((a,b)=>a.start-b.start);
    if(items.some(it=>!Number.isFinite(it.start)||!Number.isFinite(it.dur)||it.dur<=0))return false;
    const a=items.findIndex(it=>it.kind==='scene'&&it.id===sourceId),b=items.findIndex(it=>it.kind==='scene'&&it.id===targetId),lo=Math.min(a,b),hi=Math.max(a,b),region=items.slice(lo,hi+1),gaps=region.slice(1).map((it,i)=>it.start-region[i].start-region[i].dur);
    if(gaps.some(gap=>gap<0))return false;
    const reordered=[region.at(-1),...region.slice(1,-1),region[0]],changes=[];let cursor=region[0].start;
    for(let i=0;i<reordered.length;i++){const it=reordered[i];changes.push({...it,start:cursor});cursor+=it.dur+(gaps[i]||0);}
    // Only the interval between the two scenes changes. Durations, gaps and the
    // end of that interval are conserved, including meals and technical tasks.
    day.times??={};for(const it of changes){if(it.kind==='scene')day.times[it.id]=it.start;else day.blocks.find(b=>b.id===it.id).startMin=it.start;}
    return true;
  }


  function swapScenesBetweenDays(first,sourceId,second,targetId){
    if(!first||!second||first.id===second.id||!first.sceneIds?.includes(sourceId)||!second.sceneIds?.includes(targetId)||first.sceneIds.includes(targetId)||second.sceneIds.includes(sourceId))return false;
    function prepare(day,outgoing,incomingDuration){
      const start=Number(day.times?.[outgoing]??0),duration=Number(day.durations?.[outgoing]??60),end=start+duration,delta=incomingDuration-duration;
      const items=[...day.sceneIds.filter(id=>id!==outgoing).map(id=>({id,kind:'scene',start:Number(day.times?.[id]??0),dur:Number(day.durations?.[id]??60)})),...(day.blocks||[]).map(b=>({id:b.id,kind:'block',start:Number(b.startMin??0),dur:Number(b.durMin??30)}))];
      if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0||!Number.isFinite(incomingDuration)||incomingDuration<=0||items.some(it=>!Number.isFinite(it.start)||!Number.isFinite(it.dur)||it.dur<=0||it.start<end&&it.start+it.dur>start))return null;
      const parts=String(day.callTime||'08:00').split(':').map(Number),call=parts[0]*60+parts[1];
      const tail=items.filter(it=>it.start>=end).map(it=>({...it,start:it.start+delta}));
      const last=Math.max(start+incomingDuration,...items.filter(it=>it.start<end).map(it=>it.start+it.dur),...tail.map(it=>it.start+it.dur));
      if(!Number.isFinite(call)||call+start<0||call+last>1800)return null;
      return {start,tail,night:call+last>1440};
    }
    const sourceDuration=Number(first.durations?.[sourceId]??60),targetDuration=Number(second.durations?.[targetId]??60);
    const a=prepare(first,sourceId,targetDuration),b=prepare(second,targetId,sourceDuration);if(!a||!b)return false;
    const maps=['sceneColors','shotsDone'];
    const metadata=maps.map(key=>({key,source:first[key]?.[sourceId],target:second[key]?.[targetId]}));
    function apply(day,outgoing,incoming,duration,plan){
      day.sceneIds=day.sceneIds.map(id=>id===outgoing?incoming:id);day.times??={};day.durations??={};
      delete day.times[outgoing];delete day.durations[outgoing];day.times[incoming]=plan.start;day.durations[incoming]=duration;
      for(const it of plan.tail){if(it.kind==='scene')day.times[it.id]=it.start;else day.blocks.find(block=>block.id===it.id).startMin=it.start;}
      if(plan.night)day.night=true;
    }
    apply(first,sourceId,targetId,targetDuration,a);apply(second,targetId,sourceId,sourceDuration,b);
    for(const {key,source,target} of metadata){first[key]??={};second[key]??={};delete first[key][sourceId];delete second[key][targetId];delete first[key][targetId];delete second[key][sourceId];if(target!==undefined)first[key][targetId]=target;if(source!==undefined)second[key][sourceId]=source;}
    return true;
  }

  // Compact rows have no pixel-to-minute scale: hit-test another scene instead.
  function bindCompactSceneSwap(container,{enabled,readItem,getScroller,onSwap,allowCrossDay=false,touchHandleOnly=false}){
    let drag=null,frameId=null,ignoreClick=false;
    const doc=container.ownerDocument,view=doc.defaultView;
    function targetAt(p){
      const node=doc.elementFromPoint(p.x,p.y)?.closest('.dpBlock,.schedBlock');
      if(!node||node===p.el||!container.contains(node))return null;
      const item=readItem(node);
      return item?.kind==='scene'&&(allowCrossDay||item.dayId===p.item.dayId)?{node,item}:null;
    }
    function paint(){
      const p=drag;if(!p?.moved)return;
      p.el.style.transform=`translate3d(${p.x-p.startX+(p.scroller.scrollLeft-p.scrollLeft)}px,${p.y-p.startY+(p.scroller.scrollTop-p.scrollTop)}px,0)`;
      const target=targetAt(p);
      if(p.target?.node!==target?.node){p.target?.node.classList.remove('swap-target');target?.node.classList.add('swap-target');}
      p.target=target;
    }
    function tick(){
      frameId=null;const p=drag;if(!p?.moved)return;
      if(!enabled()||!p.el.isConnected){finish(false);return;}
      const r=p.scroller.getBoundingClientRect(),edge=42;
      if(p.x>=r.left&&p.x<=r.right&&p.y>=r.top-12&&p.y<=r.bottom+12){
        const speed=p.y<r.top+edge?-Math.min(12,(r.top+edge-p.y)/4):p.y>r.bottom-edge?Math.min(12,(p.y-r.bottom+edge)/4):0;
        if(speed)p.scroller.scrollTop+=speed;
      }
      if(allowCrossDay&&p.y>=r.top&&p.y<=r.bottom&&p.x>=r.left-12&&p.x<=r.right+12){
        const speed=p.x<r.left+edge?-Math.min(12,(r.left+edge-p.x)/4):p.x>r.right-edge?Math.min(12,(p.x-r.right+edge)/4):0;
        if(speed)p.scroller.scrollLeft+=speed;
      }
      paint();frameId=view.requestAnimationFrame(tick);
    }
    function finish(commit){
      const p=drag;if(!p)return;
      if(commit)paint();drag=null;
      if(frameId!==null)view.cancelAnimationFrame(frameId);frameId=null;
      p.target?.node.classList.remove('swap-target');p.el.classList.remove('is-dragging','compact-swap-source');
      p.el.style.transform=p.transform;container.classList.remove('compact-swapping');
      try{p.el.releasePointerCapture(p.pointerId);}catch(_e){}
      if(p.moved){ignoreClick=true;}
      if(commit&&p.moved&&p.target&&enabled())onSwap(p.item.dayId,p.item.id,p.target.item.id,p.target.item.dayId);
    }
    container.addEventListener('click',e=>{
      if(ignoreClick&&e.detail!==0){ignoreClick=false;e.preventDefault();e.stopImmediatePropagation();}
    },true);
    container.addEventListener('pointerdown',e=>{
      ignoreClick=false;
      if(drag||e.button!==0||!enabled())return;
      if(touchHandleOnly&&(e.pointerType==='touch'||e.pointerType==='pen')&&!e.target.closest('.planTouchGrip'))return;
      const node=e.target.closest('.dpBlock,.schedBlock');if(!node)return;
      const item=readItem(node);if(item?.kind!=='scene')return;
      const scroller=getScroller();if(!scroller)return;
      drag={el:node,item,scroller,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,scrollTop:scroller.scrollTop,scrollLeft:scroller.scrollLeft,transform:node.style.transform,moved:false,target:null};
    });
    view.addEventListener('pointermove',e=>{
      const p=drag;if(!p||p.pointerId!==e.pointerId)return;
      p.x=e.clientX;p.y=e.clientY;
      if(!p.moved&&Math.hypot(p.x-p.startX,p.y-p.startY)<6)return;
      if(!enabled()){finish(false);return;}
      e.preventDefault();
      if(!p.moved){
        p.moved=true;p.el.classList.add('is-dragging','compact-swap-source');container.classList.add('compact-swapping');
        try{p.el.setPointerCapture(p.pointerId);}catch(_e){}
        frameId=view.requestAnimationFrame(tick);
      }
      paint();
    },{passive:false});
    view.addEventListener('pointerup',e=>{if(drag?.pointerId===e.pointerId){drag.x=e.clientX;drag.y=e.clientY;finish(true);}});
    view.addEventListener('pointercancel',e=>{if(drag?.pointerId===e.pointerId)finish(false);});
    view.addEventListener('keydown',e=>{if(drag&&e.key==='Escape'){e.preventDefault();finish(false);}});
    view.addEventListener('blur',()=>finish(false));
    return ()=>finish(false);
  }
  function swapDayScenes(first, second){
    if(!first || !second || first.id === second.id) return false;
    for(const key of ["sceneIds","times","durations","sceneColors","shotsDone"]){
      const empty = ()=>key === "sceneIds" ? [] : {};
      const value = first[key] || empty();
      first[key] = second[key] || empty();
      second[key] = value;
    }
    if("location" in first || "location" in second){
      const location = first.location || "";
      first.location = second.location || "";
      second.location = location;
    }
    return true;
  }

  function createDaySwapController({getDay,canEdit,onSwap,onDragState=()=>{}}){
    let sourceId = null;
    const columns = new Map();
    function clear(){
      sourceId = null;
      for(const column of columns.values()) column.classList.remove("daySwapSource","daySwapTarget");
      onDragState(false);
    }
    function select(id){
      clear();
      sourceId = id;
      columns.get(id)?.classList.add("daySwapSource");
      onDragState(true);
    }
    function exchange(targetId){
      const fromId = sourceId;
      clear();
      if(!fromId || !canEdit()) return false;
      if(!swapDayScenes(getDay(fromId),getDay(targetId))) return false;
      onSwap(fromId,targetId);
      return true;
    }
    return {
      clear,
      bind(head,column,id){
        columns.set(id,column);
        head.classList.add("daySwapHandle");
        head.draggable = canEdit();
        head.tabIndex = canEdit() ? 0 : -1;
        head.setAttribute("role","button");
        head.setAttribute("aria-disabled",String(!canEdit()));
        head.setAttribute("aria-label",`${head.textContent.trim()}. Intercambiar escenas: arrastrá a otro día, o presioná Enter aquí y después en el destino.`);
        head.title = "Arrastrá sobre otro día para intercambiar sus escenas";
        const hint = head.ownerDocument.createElement("div");
        hint.className = "daySwapHint";
        hint.textContent = "⠿ Arrastrá para intercambiar escenas";
        head.append(hint);
        head.addEventListener("dragstart",event=>{
          if(!canEdit()){ event.preventDefault(); return; }
          event.stopPropagation();
          select(id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-roda-day-swap",id);
        });
        head.addEventListener("dragend",clear);
        head.addEventListener("keydown",event=>{
          if(event.key === "Escape"){ clear(); return; }
          if(!["Enter"," "].includes(event.key) || !canEdit()) return;
          event.preventDefault();
          if(sourceId === null) select(id);
          else exchange(id);
        });
        column.addEventListener("dragover",event=>{
          if(!sourceId || !canEdit() || sourceId === id) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          column.classList.add("daySwapTarget");
        });
        column.addEventListener("dragleave",event=>{
          if(!column.contains(event.relatedTarget)) column.classList.remove("daySwapTarget");
        });
        column.addEventListener("drop",event=>{
          if(!sourceId) return;
          event.preventDefault();
          event.stopPropagation();
          exchange(id);
        });
      }
    };
  }
  const api = {swapScenesBetweenDays,bindCompactSceneSwap,swapDayScenes,createDaySwapController,captureLayout,restoreLayout,sceneAt,swapScenes};
  root.RodaDaySwap = api;
  if(typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
