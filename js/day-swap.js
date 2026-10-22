(function(root){
  "use strict";
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
  const api = {swapDayScenes,createDaySwapController};
  root.RodaDaySwap = api;
  if(typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
