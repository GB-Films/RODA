/* Shared session coordinator. Only explicit local edits trigger writes. */
(function(root){
  const copy=value=>JSON.parse(JSON.stringify(value));
  function create(options){
    let base=copy(options.initial),revision=options.revision||0,generation=0,pending=false;
    let stopped=false,reading=false,writing=null,timer=null,queued=null,retry=1500;
    const status=(message)=>options.onStatus?.(message,pending);
    const schedule=(ms=600)=>{clearTimeout(timer);if(!stopped)timer=setTimeout(()=>flush(),ms);};
    function accept(record,ancestor=base){
      if(stopped||!record||record.unchanged||record.revision<revision)return;
      const next=pending?options.merge(ancestor,options.getState(),record.state):copy(record.state);
      base=copy(record.state);revision=record.revision;options.apply(next,record);status(pending?'Guardando…':'En vivo');
    }
    async function refresh(){
      if(stopped||reading)return;
      reading=true;
      try{
        const record=await options.read();
        if(stopped)return;
        if(!record.unchanged&&record.revision>revision){
          if(writing||options.isBusy?.())queued=record;
          else accept(record);
        }
        if(!pending)status('En vivo');
      }catch(error){if(!stopped){status(pending?'Sin conexión · cambios pendientes':'Reconectando…');options.onError?.(error);}}
      finally{reading=false;}
    }
    async function flush(){
      clearTimeout(timer);timer=null;
      if(stopped)return;
      if(writing)return writing;
      if(options.isBusy?.()){schedule(150);return;}
      if(queued){const record=queued;queued=null;accept(record);}
      if(!pending||options.canWrite?.()===false)return;
      const snapshot=copy(options.getState()),ancestor=copy(base),sentGeneration=generation;
      status('Guardando…');
      writing=(async()=>{
        try{
          const record=await options.commit(ancestor,snapshot);
          if(stopped)return;
          pending=generation!==sentGeneration;
          // Rebase only edits made while this request was in flight.
          accept(record,snapshot);retry=1500;
        }catch(error){if(!stopped){status('Sin guardar · reintentando');options.onError?.(error);schedule(retry);retry=Math.min(15000,retry*2);}}
        finally{writing=null;if(!stopped&&pending&&!timer)schedule();}
      })();
      return writing;
    }
    return {
      notify(){if(stopped||options.canWrite?.()===false)return;generation++;pending=true;status('Guardando…');schedule();},
      async refresh(){if(queued&&!writing&&!options.isBusy?.()){const record=queued;queued=null;accept(record);}await refresh();if(pending&&!writing&&!timer)schedule();},
      flush,
      stop(){stopped=true;clearTimeout(timer);},
      get pending(){return pending;}
    };
  }
  root.RodaTeamSync={create};
  if(typeof module!=='undefined')module.exports=root.RodaTeamSync;
})(typeof window==='undefined'?globalThis:window);
