/* Shared-state reconciliation. No clock comparisons: only changes since the
   last acknowledged snapshot are applied to the current server state. */
(function(root){
  "use strict";
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const keyed = arr => Array.isArray(arr) && arr.every(v => object(v) && typeof v.id === "string") && new Set(arr.map(v=>v.id)).size === arr.length;
  const scalarList = arr => Array.isArray(arr) && arr.every(v => typeof v === "string") && new Set(arr).size === arr.length;

  function mergeOrder(base, local, remote, ids){
    const allowed = new Set(ids);
    // Use the local order only when this client actually reordered existing items.
    const common = base.filter(id=>local.includes(id));
    const reordered = !equal(common, local.filter(id=>common.includes(id)));
    const primary = reordered ? local : remote;
    const secondary = reordered ? remote : local;
    const order = primary.filter(id=>allowed.has(id));
    for(let i=0; i<secondary.length; i++){
      const id = secondary[i];
      if(!allowed.has(id) || order.includes(id)) continue;
      const previous = secondary.slice(0,i).reverse().find(x=>order.includes(x));
      const next = secondary.slice(i+1).find(x=>order.includes(x));
      const at = previous !== undefined ? order.indexOf(previous)+1 : next !== undefined ? order.indexOf(next) : order.length;
      order.splice(at,0,id);
    }
    return order;
  }

  function merge(base, local, remote){
    if(equal(base,local)) return clone(remote);
    if(equal(base,remote) || equal(local,remote)) return clone(local);
    // Deletion wins over a simultaneous edit; an edit must not resurrect a row.
    if(base !== undefined && (local === undefined || remote === undefined)) return undefined;
    if(object(local) && object(remote) && (base === undefined || object(base))){
      const out = {};
      for(const key of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])){
        const value = merge(base?.[key],local[key],remote[key]);
        if(value !== undefined) out[key] = value;
      }
      return out;
    }
    if(keyed(local) && keyed(remote) && (base === undefined || keyed(base))){
      const b = new Map((base||[]).map(v=>[v.id,v]));
      const l = new Map(local.map(v=>[v.id,v]));
      const r = new Map(remote.map(v=>[v.id,v]));
      const values = new Map();
      for(const id of new Set([...b.keys(),...l.keys(),...r.keys()])){
        const value = merge(b.get(id),l.get(id),r.get(id));
        if(value !== undefined) values.set(id,value);
      }
      return mergeOrder([...b.keys()],[...l.keys()],[...r.keys()],[...values.keys()]).map(id=>values.get(id));
    }
    if(scalarList(local) && scalarList(remote) && (base === undefined || scalarList(base))){
      const b = base||[];
      const ids = [...new Set([...local,...remote])].filter(id=> !b.includes(id) || (local.includes(id) && remote.includes(id)));
      return mergeOrder(b,local,remote,ids);
    }
    // Exactly the same field edited concurrently: the last transaction wins.
    return clone(local);
  }

  function mergeProject(base, local, remote){
    const out = merge(base,local,remote);
    if(!out || !Array.isArray(out.shootDays)) return out;
    const assignments = state => new Map((state?.shootDays||[]).flatMap(d=>(d.sceneIds||[]).map(id=>[id,d.id])));
    const b = assignments(base), l = assignments(local), r = assignments(remote);
    const scenes = new Set((out.scenes||[]).map(s=>s.id));
    // Moving the same scene to different days is one conflict, even though its
    // membership is stored on two separate day objects.
    for(const day of out.shootDays){
      day.sceneIds = (day.sceneIds||[]).filter(id=>{
        const target = l.get(id) !== b.get(id) ? l.get(id) : r.get(id);
        return scenes.has(id) && target === day.id;
      });
      for(const key of ["times","durations","sceneColors"]){
        for(const id of Object.keys(day[key]||{})){
          if(!day.sceneIds.includes(id)) delete day[key][id];
        }
      }
    }
    return out;
  }

  // Preserve references captured by input handlers when updates arrive while
  // someone is typing. The screen can then repaint safely after focus leaves.
  function reconcile(target, source){
    if(Array.isArray(target) && Array.isArray(source)){
      const byId = keyed(target) && keyed(source) ? new Map(target.map(v=>[v.id,v])) : null;
      const next = source.map((value,i)=>reconcile(byId ? byId.get(value.id) : target[i],value));
      target.splice(0,target.length,...next);
      return target;
    }
    if(object(target) && object(source)){
      for(const key of Object.keys(target)) if(!(key in source)) delete target[key];
      for(const key of Object.keys(source)) target[key] = reconcile(target[key],source[key]);
      return target;
    }
    return clone(source);
  }

  const {swapDayScenes} = root.RodaDaySwap || (typeof require === "function" ? require("./day-swap.js") : {});

  function createSession(options){
    let base = clone(options.baseline) || null;
    const initial = clone(options.getState());
    let revision = -1, writing = false, stopped = false, queued = null;
    let timer = null, unsubscribe = null, retryMs = 1500;
    const dirty = () => base && !equal(base,options.getState());
    const writable = () => options.canWrite?.() !== false;
    const status = () => options.onStatus(dirty() && writable() ? "Guardando…" : "En vivo");
    function schedule(ms=600){
      clearTimeout(timer);
      if(!stopped) timer = setTimeout(()=>{ timer = null; flush(); },ms);
    }
    function accept(record, ancestor=base||initial){
      if(stopped || !record || record.revision < revision) return;
      const next = mergeProject(ancestor,options.getState(),record.state);
      base = clone(record.state);
      revision = record.revision;
      options.saveBaseline(base);
      options.applyState(next);
      status();
      if(dirty() && writable()) schedule();
    }
    function receive(record){
      if(stopped || !record || record.revision <= revision) return;
      if(writing || options.isBusy?.()){
        if(!queued || queued.revision < record.revision) queued = record;
        if(!writing) schedule(150);
      }else accept(record);
    }
    function listen(){
      if(stopped || unsubscribe) return;
      unsubscribe = options.watch(receive,error=>{
        options.onError(error);
        options.onStatus("Reconectando…");
        unsubscribe?.();
        unsubscribe = null;
        schedule(retryMs);
      });
    }
    async function flush(){
      clearTimeout(timer);
      timer = null;
      if(stopped || writing) return;
      if(options.isBusy?.()){ schedule(150); return; }
      if(queued){ const record = queued; queued = null; receive(record); }
      listen();
      if(!base){ await refresh(); return; }
      if(!writable()){ status(); return; }
      if(!dirty()){ status(); return; }
      writing = true;
      const snapshot = clone(options.getState());
      const ancestor = clone(base);
      options.onStatus("Guardando…");
      try{
        const record = await options.commit(remote=>mergeProject(ancestor,snapshot,remote));
        if(stopped) return;
        // Rebase only edits made DURING the request. Already-sent edits must
        // not be replayed over a newer transaction result.
        accept(record,snapshot);
        retryMs = 1500;
      }catch(error){
        options.onStatus("Sin conexión · guardado local");
        options.onError(error);
        schedule(retryMs);
        retryMs = Math.min(30000,retryMs*2);
      }finally{
        writing = false;
        if(queued){ const record = queued; queued = null; receive(record); }
        if(dirty() && writable() && !timer) schedule();
      }
    }
    async function refresh(){
      try{
        const record = await options.read();
        if(stopped) return;
        listen();
        if(record) receive(record);
        else if(options.allowCreate){
          accept(await options.commit(remote=>remote||initial));
        }else throw new Error("Proyecto remoto vacío; se conserva la copia local");
      }catch(error){
        options.onStatus("Sin conexión · guardado local");
        options.onError(error);
        schedule(retryMs);
        retryMs = Math.min(30000,retryMs*2);
      }
    }
    return {
      async start(){
        await refresh();
        if(stopped) return;
        listen();
      },
      notify(){ status(); if(writable()) schedule(); },
      flush,
      async refresh(){
        await refresh();
        listen();
        if(dirty()) await flush();
      },
      stop(){ stopped = true; clearTimeout(timer); unsubscribe?.(); }
    };
  }

  root.Collaboration = { merge, mergeProject, reconcile, swapDayScenes, createSession, equal, clone };
})(typeof window !== "undefined" ? window : globalThis);
