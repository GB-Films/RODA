(function(root){
  'use strict';
  const DOCUMENT_LIMIT=760000,VERSION_LIMIT=12000000,REQUEST_LIMIT=24000000;
  const bytes=value=>new TextEncoder().encode(JSON.stringify(value??null)).length;
  function versionIndex(version){
    return Object.fromEntries(['id','name','createdAt','updatedAt','authorName','draft','appliedAt','parserVersion'].filter(k=>version[k]!==undefined).map(k=>[k,version[k]]));
  }
  function validateParts(core,pack){
    const versions=pack?.script?.versions||[];
    const index={...pack,script:{...pack?.script,versions:versions.map(versionIndex)}};
    if(bytes(core)>DOCUMENT_LIMIT||bytes(index)>DOCUMENT_LIMIT)throw Error('La producción supera el espacio disponible para escenas, planos o jornadas. La nueva carga no se guardó y la producción anterior se conserva.');
    if(versions.some(v=>bytes(v)>VERSION_LIMIT))throw Error('Una versión del guion es demasiado grande. La nueva carga no se guardó; todas las versiones anteriores se conservan.');
    if(bytes({core,script:pack})>REQUEST_LIMIT-100000)throw Error('La actualización completa es demasiado grande para enviarla. La nueva carga no se guardó; el historial y la producción anterior se conservan.');
  }
  const api={DOCUMENT_LIMIT,VERSION_LIMIT,REQUEST_LIMIT,bytes,versionIndex,validateParts};
  root.RodaScriptHistory=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
