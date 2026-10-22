// File-specific Google authorization. Tokens stay in memory for this browser session.
export function createGoogleDocsImporter({auth,GoogleAuthProvider,reauthenticateWithPopup,config,runtime=globalThis,requestTimeout=30000,interactionTimeout=120000}){
  let accessToken='',expiresAt=0,authorizedUid='',pickerReady;
  function waitFor(promise,signal,ms,message,cleanup=()=>{}){
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);cleanup();error?reject(error):resolve(value);};
      const cancel=()=>finish(new DOMException('Importación cancelada.','AbortError'));
      const timer=setTimeout(()=>finish(Error(message)),ms);
      Promise.resolve(promise).then(value=>finish(null,value),error=>finish(error));
      if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
    });
  }
  async function authorize(signal,onProgress){
    const user=auth.currentUser;if(!user)throw Error('Iniciá sesión en GB Studio para importar.');
    if(accessToken&&authorizedUid===user.uid&&Date.now()<expiresAt)return accessToken;
    onProgress('Autorizá la lectura del guion en la ventana de Google. Podés cancelar la carga.');
    const provider=new GoogleAuthProvider();provider.addScope('https://www.googleapis.com/auth/drive.file');provider.setCustomParameters({login_hint:user.email});
    try{
      const result=await waitFor(reauthenticateWithPopup(user,provider),signal,interactionTimeout,'La autorización de Google no terminó. Volvé a importar y completá la ventana de Google.');
      if(result.user.uid!==user.uid||auth.currentUser?.uid!==user.uid)throw Error('Elegí la misma cuenta con la que entraste a GB Studio.');
      const credential=GoogleAuthProvider.credentialFromResult(result);
      if(!credential?.accessToken)throw Error('Google no autorizó la lectura del documento.');
      accessToken=credential.accessToken;expiresAt=Date.now()+50*60*1000;authorizedUid=user.uid;return accessToken;
    }catch(error){
      if(['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(error.code))return null;
      if(error.code==='auth/popup-blocked')throw Error('Permití la ventana de Google en tu navegador y volvé a intentar.');
      if(error.code==='auth/user-mismatch')throw Error('Elegí la misma cuenta con la que entraste a GB Studio.');
      throw error;
    }
  }
  function loadPicker(){
    if(runtime.google?.picker)return Promise.resolve();
    if(pickerReady)return pickerReady;
    pickerReady=new Promise((resolve,reject)=>{
      const fail=message=>{clearTimeout(timeout);pickerReady=null;reject(Error(message));};
      const timeout=setTimeout(()=>fail('Google no respondió. Volvé a intentar o cargá una copia Word.'),20000);
      const ready=()=>runtime.gapi.load('picker',{callback:()=>{clearTimeout(timeout);resolve();},onerror:()=>fail('No pudimos abrir el selector de Google Docs.')});
      if(runtime.gapi)return ready();
      const script=runtime.document.createElement('script');script.src='https://apis.google.com/js/api.js';script.onload=ready;script.onerror=()=>{script.remove();fail('No pudimos conectar con Google. Revisá tu conexión.');};runtime.document.head.append(script);
    });return pickerReady;
  }
  async function choose(token,expected,signal,onProgress){
    onProgress(expected?'Elegí el documento vinculado en el selector de Google para autorizarlo.':'Elegí el Google Docs de tu guion en el selector de Google.');
    await waitFor(loadPicker(),signal,requestTimeout,'El selector de Google no respondió. Volvé a intentar.');
    let picker;
    const selected=new Promise((resolve,reject)=>{
      const p=runtime.google.picker;
      try{
        picker=new p.PickerBuilder().addView(new p.DocsView(p.ViewId.DOCUMENTS).setMimeTypes('application/vnd.google-apps.document'))
          .setAppId(config.messagingSenderId).setDeveloperKey(config.apiKey).setOAuthToken(token).setOrigin(runtime.location.origin)
          .setTitle(expected?'Elegí el guion vinculado para autorizar su importación':'Elegí el Google Docs de tu guion')
          .setCallback(data=>{
            if(data.action===p.Action.CANCEL)resolve(null);
            if(data.action===p.Action.PICKED){const doc=data.docs?.[0];if(!doc?.id){reject(Error('Google no devolvió un documento válido.'));return;}if(expected&&doc.id!==expected.id){reject(Error('Elegiste otro documento. Para cambiar el guion, pegá y vinculá su enlace primero.'));return;}resolve(doc);}
          }).build();picker.setVisible(true);
      }catch{reject(Error('No pudimos abrir Google Docs. Volvé a intentar o cargá una copia Word.'));}
    });
    return waitFor(selected,signal,interactionTimeout,'El selector de Google quedó esperando. Volvé a importar y elegí el documento.',()=>picker?.dispose());
  }
  async function readDocument(id,token,signal){
    const controller=new AbortController();
    return waitFor((async()=>{
      const response=await runtime.fetch('https://docs.googleapis.com/v1/documents/'+encodeURIComponent(id)+'?includeTabsContent=true&suggestionsViewMode=PREVIEW_WITHOUT_SUGGESTIONS',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});
      const doc=await response.json();return {response,doc};
    })(),signal,requestTimeout,'Google tardó demasiado en entregar el documento. Volvé a importar; tu guion anterior se conserva.',()=>controller.abort());
  }
  return async function importDocument(link,{signal,onProgress=()=>{}}={}){
    signal?.throwIfAborted();
    const token=await authorize(signal,onProgress);if(!token)return null;
    let id=link?.id;
    if(!id){const picked=await choose(token,null,signal,onProgress);if(!picked)return null;id=picked.id;}
    const read=()=>{onProgress('Leyendo la última versión del documento de Google…');return readDocument(id,token,signal);};
    let result=await read();
    const disabled=result.doc.error?.details?.some(d=>d.reason==='SERVICE_DISABLED');
    // drive.file grants persist across sessions: try the linked file directly before showing Picker.
    if(link?.id&&[403,404].includes(result.response.status)&&!disabled){
      const picked=await choose(token,link,signal,onProgress);if(!picked)return null;
      result=await read();
    }
    const {response,doc}=result;
    if(!response.ok){
      if(response.status===401){accessToken='';expiresAt=0;throw Error('La autorización de Google venció. Volvé a importar para renovarla.');}
      if(disabled)throw Error('La API de Google Docs no está habilitada para GB Studio. Mientras se configura, cargá una copia Word.');
      if([403,404].includes(response.status))throw Error('Tu cuenta no puede leer ese documento. Revisá los permisos en Google Docs y elegilo nuevamente.');
      throw Error('Google no pudo entregar el guion. Intentá de nuevo o cargá una copia Word.');
    }
    signal?.throwIfAborted();
    if(auth.currentUser?.uid!==authorizedUid)throw Error('Tu sesión cambió. Volvé a importar con la cuenta actual.');
    if(doc.documentId&&doc.documentId!==id)throw Error('Google devolvió otro documento. Volvé a vincular el enlace del guion.');
    onProgress('Detectando las escenas de la última versión…');
    const formatted=runtime.RodaScriptDocument.docsFormat(doc),text=formatted.text;
    if(!text.trim())throw Error('El documento no contiene texto de guion.');
    return {id,url:'https://docs.google.com/document/d/'+id+'/edit',title:doc.title||'Google Docs',revisionId:doc.revisionId||'',text,format:formatted.format};
  };
}
