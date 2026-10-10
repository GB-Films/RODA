// Roda's existing editor API, backed by the selected GB Studio project.
(function(root){
  function createRodaStorage({projects,project,user,accessPath}){
    const prefix=`gb-roda:studio:${user.uid}:${project.spaceId}:${project.id}:`;
    const revisions=new Map();let pendingCore=null,pull=null,baseline=null;
    const part=id=>String(id).endsWith('__script')?'script':'core';
    const path=id=>`/api/studio/spaces/${encodeURIComponent(project.spaceId)}/projects/${encodeURIComponent(project.id)}/roda/${part(id)}`;
    const read=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(prefix+key))??fallback;}catch{return fallback;}};
    const write=(key,value)=>{try{localStorage.setItem(prefix+key,JSON.stringify(value));}catch{}};
    const entry=()=>({id:project.id,name:project.name,binId:project.id,scriptBinId:project.id+'__script',remote:true,localOnly:false});
    const cfg=()=>({backend:'firebase',backendLabel:'GB Studio',syncLabel:'GB Studio',projectId:project.id,projectName:project.name,theme:'default',binId:project.id,scriptBinId:project.id+'__script',accessKey:'studio',autosync:'on',firebaseReady:true,firebaseRequired:true,projects:[entry()]});
    const assertIdentity=()=>{if(projects.context()?.uid!==user.uid||projects.context()?.id!==project.id)throw Error('Tu sesión o proyecto cambió. Volvé a abrir Roda.');};
    async function get(id){
      assertIdentity();let result;
      if(accessPath){if(!pull)pull=projects.request(accessPath+'/state');try{const data=await pull;if(project.rodaAccess&&JSON.stringify(project.rodaAccess)!==JSON.stringify(data.access)){root.location.reload();throw Error('Tus permisos cambiaron. Estamos actualizando el proyecto.');}project.rodaAccess=data.access;baseline=data.parts;for(const [key,value] of Object.entries(data.revisions))revisions.set(key,value);result={payload:data.parts[part(id)],revision:data.revisions[part(id)]};}finally{if(part(id)==='script')pull=null;}}
      else result=await projects.request(path(id));assertIdentity();
      revisions.set(part(id),result.revision);
      if(result.payload?.meta)result.payload.meta.title=project.name;
      return result.payload;
    }
    async function put(id,_key,payload){
      assertIdentity();
      if(project.role==='viewer')throw Error('Este proyecto es de solo lectura.');
      if(!revisions.has(part(id)))throw Error('Actualizá el proyecto antes de guardar.');
      if(part(id)==='core'){pendingCore=structuredClone(payload);return {saved:false,pending:true};}
      if(!pendingCore)throw Error('Guardá el proyecto completo antes de guardar las escenas.');
      try{
        let body={core:pendingCore,script:payload,revisions:Object.fromEntries(revisions)};
        if(accessPath){body.accessRevision=project.rodaAccess.revision;if(!project.rodaAccess.unrestricted){const before=RodaPolicy.split(baseline?.core,baseline?.script),after=RodaPolicy.split(pendingCore,payload),changes={};for(const key of Object.keys(after))if(project.rodaAccess.sections[key]==='edit'&&JSON.stringify(before[key])!==JSON.stringify(after[key]))changes[key]=after[key];body={changes,revisions:body.revisions,accessRevision:body.accessRevision,updatedAt:pendingCore.meta.updatedAt};}}
        const result=await projects.request(accessPath?accessPath+'/state':path(id).replace(/\/script$/,'/state'),{method:'PATCH',body:JSON.stringify(body)});
        baseline={core:pendingCore,script:payload};
        assertIdentity();for(const [key,value] of Object.entries(result.revisions))revisions.set(key,value);pendingCore=null;return result;
      }catch(error){root.dispatchEvent(new CustomEvent('roda-sync-error',{detail:error.message}));throw error;}
    }
    return {
      init:async()=>{await Promise.all([get(project.id),get(project.id+'__script')]);return cfg();},
      loadCfg:cfg,saveCfg(){},getProjects:()=>[entry()],refreshProjects:async()=>[entry()],
      getActiveProjectId:()=>project.id,getActiveProject:entry,setActiveProjectId:id=>id===project.id,
      loadLocal:()=>project.rodaAccess&&!project.rodaAccess.unrestricted?null:read('state'),saveLocal:state=>{if(!project.rodaAccess||project.rodaAccess.unrestricted)write('state',state);},hardResetLocal:()=>{try{localStorage.removeItem(prefix+'state');}catch{}},
      getRemoteStamp:id=>read('stamp:'+id,''),setRemoteStamp:(id,stamp)=>write('stamp:'+id,stamp),
      jsonbinGet:get,jsonbinPut:put,getEditPassword:()=>'',updateActiveProjectMeta:entry,
      createProject:async()=>{throw Error('Creá el proyecto desde GB Studio.');}
    };
  }
  root.createRodaStorage=createRodaStorage;
  if(typeof module!=='undefined')module.exports={createRodaStorage};
})(typeof window!=='undefined'?window:globalThis);
