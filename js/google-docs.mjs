// File-specific Google authorization. Tokens stay in memory for this browser session.
export function resolveGoogleDocsSource(version,saved,entered='',parseLink){
  const source=version?.source;
  const selected=source?.type==='google-doc'&&source.documentId?{
    ...(saved?.id===source.documentId?saved:{}),id:source.documentId,
    url:source.url||'https://docs.google.com/document/d/'+encodeURIComponent(source.documentId)+'/edit',
    title:source.name||'',...(source.accountEmail?{accountEmail:source.accountEmail}:{})
  }:saved||null;
  if(!String(entered||'').trim())return selected;
  const link=parseLink(entered);
  // Parsing the visible URL must not discard the account authorized for that file.
  const metadata=selected?.id===link.id?selected:saved?.id===link.id?saved:null;
  return {...metadata,...link};
}

export function createGoogleDocsImporter({auth,GoogleAuthProvider,reauthenticateWithPopup,authorizeOtherAccount,config,runtime=globalThis,requestTimeout=30000,interactionTimeout=120000}){
  let accessToken='',expiresAt=0,authorizedUid='',documentAccountEmail='',pickerReady;
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
  async function authorize(signal,onProgress,chooseAccount=false,expectedEmail=''){
    const user=auth.currentUser;if(!user)throw Error('Iniciá sesión en GB Studio para importar.');
    if(!chooseAccount&&accessToken&&authorizedUid===user.uid&&Date.now()<expiresAt)return accessToken;
    onProgress('Autorizá la lectura del guion en la ventana de Google. Podés cancelar la carga.');
    const provider=new GoogleAuthProvider();provider.addScope('https://www.googleapis.com/auth/drive.file');provider.setCustomParameters(chooseAccount?{prompt:'select_account',...(expectedEmail?{login_hint:expectedEmail}:{})}:{login_hint:user.email});
    try{
      if(chooseAccount&&!authorizeOtherAccount)throw Error('La importación con otra cuenta no está disponible. Recargá Roda.');
      const result=await waitFor(chooseAccount?authorizeOtherAccount(provider):reauthenticateWithPopup(user,provider),signal,interactionTimeout,'La autorización de Google no terminó. Volvé a importar y completá la ventana de Google.');
      if(auth.currentUser?.uid!==user.uid)throw Error('Tu sesión de GB Studio cambió. Volvé a abrir el proyecto antes de importar.');
      if(!chooseAccount&&result.user.uid!==user.uid)throw Error('Para usar una cuenta distinta, elegí «Importar con otra cuenta de Google».');
      const credential=GoogleAuthProvider.credentialFromResult(result);
      if(!credential?.accessToken)throw Error('Google no autorizó la lectura del documento.');
      accessToken=credential.accessToken;expiresAt=Date.now()+50*60*1000;authorizedUid=user.uid;documentAccountEmail=result.user.email||user.email;return accessToken;
    }catch(error){
      if(['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(error.code))return null;
      if(error.code==='auth/popup-blocked')throw Error('Permití la ventana de Google en tu navegador y volvé a intentar.');
      if(error.code==='auth/user-mismatch')throw Error('Para usar una cuenta distinta, elegí «Importar con otra cuenta de Google».');
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
    const account=documentAccountEmail||auth.currentUser?.email||'';
    onProgress((expected?'Autorizá el documento vinculado en la primera pestaña del selector.':'Elegí el Google Docs de tu guion en el selector de Google.')+(account?' Cuenta: '+account+'. Si no aparece, abrí su enlace y comprobá que esté compartido con esta cuenta.':''));
    await waitFor(loadPicker(),signal,requestTimeout,'El selector de Google no respondió. Volvé a intentar.');
    let picker;
    const selected=new Promise((resolve,reject)=>{
      const p=runtime.google.picker;
      try{
        const view=()=>new p.DocsView(p.ViewId.DOCUMENTS).setMimeTypes('application/vnd.google-apps.document').setMode(p.DocsViewMode.LIST);
        const builder=new p.PickerBuilder();
        // Pin the exact linked file first. Drive filters must use separate views: setEnableDrives overrides setFileIds.
        if(expected?.id)builder.addView(view().setFileIds(expected.id).setLabel('Guion vinculado'));
        builder.addView(view().setIncludeFolders(true).setSelectFolderEnabled(false).setLabel('Buscar en Drive'));
        builder.addView(view().setOwnedByMe(false).setLabel('Compartidos conmigo'));
        builder.addView(view().setEnableDrives(true).setLabel('Unidades compartidas'));
        picker=builder.setLocale('es')
          .setAppId(config.messagingSenderId).setDeveloperKey(config.apiKey).setOAuthToken(token).setOrigin(runtime.location.origin)
          .setTitle((expected?'Autorizá el guion vinculado':'Elegí el Google Docs de tu guion')+(account?' · '+account:''))
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
  async function pageSnapshot(id,token,signal,onProgress){
    if(!runtime.RodaScriptPages)return null;
    const controller=new AbortController();
    return waitFor((async()=>{
      onProgress('Descargando las páginas originales del guion…');
      const response=await runtime.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'/export?mimeType=application%2Fpdf',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('No pudimos obtener las páginas originales de Google Docs. Actualizá otra vez o cargá su PDF.');
      if(Number(response.headers?.get('content-length'))>runtime.RodaScriptPages.PDF_LIMIT)throw Error('La copia PDF es demasiado grande. Cargá un PDF más liviano para conservar sus hojas.');
      return runtime.RodaScriptPages.capture(await response.arrayBuffer());
    })(),signal,requestTimeout,'Google tardó demasiado en entregar las páginas originales.',()=>controller.abort());
  }
  return async function importDocument(link,{signal,onProgress=()=>{},chooseAccount=false}={}){
    signal?.throwIfAborted();
    const savedOtherAccount=link?.accountEmail&&link.accountEmail!==auth.currentUser?.email;
    const otherAccount=chooseAccount||!!savedOtherAccount&&documentAccountEmail!==link.accountEmail;
    let token=await authorize(signal,onProgress,otherAccount,link?.accountEmail);if(!token)return null;
    let id=link?.id;
    if(!id){const picked=await choose(token,null,signal,onProgress);if(!picked)return null;id=picked.id;}
    const read=()=>{onProgress('Leyendo la última versión del documento de Google…');return readDocument(id,token,signal);};
    let result=await read();
    if(result.response.status===401){
      accessToken='';expiresAt=0;
      onProgress('Renovando el permiso de Google para leer los últimos cambios…');
      token=await authorize(signal,onProgress,chooseAccount||documentAccountEmail!==auth.currentUser?.email,documentAccountEmail);
      if(!token)return null;
      result=await read();
    }
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
      if([403,404].includes(response.status))throw Error('No pudimos leer el documento vinculado con '+(documentAccountEmail||'esta cuenta')+'. Abrí su enlace para comprobar el acceso, o elegí «Importar con otra cuenta de Google».');
      throw Error('Google no pudo entregar el guion. Intentá de nuevo o cargá una copia Word.');
    }
    signal?.throwIfAborted();
    if(auth.currentUser?.uid!==authorizedUid)throw Error('Tu sesión cambió. Volvé a importar con la cuenta actual.');
    if(doc.documentId&&doc.documentId!==id)throw Error('Google devolvió otro documento. Volvé a vincular el enlace del guion.');
    onProgress('Detectando las escenas de la última versión…');
    const formatted=runtime.RodaScriptDocument.docsFormat(doc),text=formatted.text;
    if(!text.trim())throw Error('El documento no contiene texto de guion.');
    let snapshot;
    try{snapshot=await pageSnapshot(id,token,signal,onProgress);}
    catch(error){if(error.name==='AbortError')throw error;formatted.format.pageWarning=error.message;}
    if(snapshot){
      if(doc.revisionId){const checked=await readDocument(id,token,signal);if(!checked.response.ok||checked.doc.revisionId!==doc.revisionId)throw Error('El documento cambió mientras se descargaban sus páginas. Volvé a actualizar; el guion anterior se conserva.');}
      formatted.format.pdf=snapshot;
    }
    signal?.throwIfAborted();
    return {id,url:'https://docs.google.com/document/d/'+id+'/edit',title:doc.title||'Google Docs',revisionId:doc.revisionId||'',accountEmail:documentAccountEmail,text,format:formatted.format};
  };
}
