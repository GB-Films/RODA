// File-specific Google authorization. Tokens stay in memory for this browser session.
export function createGoogleDocsImporter({auth,GoogleAuthProvider,reauthenticateWithPopup,config}){
  let accessToken='',expiresAt=0,authorizedUid='',pickerReady;
  const granted=new Set();
  async function authorize(){
    const user=auth.currentUser;if(!user)throw Error('Iniciá sesión en GB Studio para importar.');
    if(accessToken&&authorizedUid===user.uid&&Date.now()<expiresAt)return accessToken;
    const provider=new GoogleAuthProvider();provider.addScope('https://www.googleapis.com/auth/drive.file');provider.setCustomParameters({login_hint:user.email});
    try{
      const result=await reauthenticateWithPopup(user,provider);
      if(result.user.uid!==user.uid)throw Error('Elegí la misma cuenta con la que entraste a GB Studio.');
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
    if(window.google?.picker)return Promise.resolve();
    if(pickerReady)return pickerReady;
    pickerReady=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{pickerReady=null;reject(Error('Google no respondió. Podés cargar una copia Word o pegar el guion.'));},20000);
      const ready=()=>window.gapi.load('picker',{callback:()=>{clearTimeout(timeout);resolve();},onerror:()=>{clearTimeout(timeout);pickerReady=null;reject(Error('No pudimos abrir el selector de Google Docs.'));}});
      if(window.gapi)return ready();
      const script=document.createElement('script');script.src='https://apis.google.com/js/api.js';script.onload=ready;script.onerror=()=>{clearTimeout(timeout);script.remove();pickerReady=null;reject(Error('No pudimos conectar con Google. Revisá tu conexión.'));};document.head.append(script);
    });return pickerReady;
  }
  async function choose(token,expected){
    await loadPicker();
    return new Promise((resolve,reject)=>{
      const p=window.google.picker;
      let picker;
      try{
        picker=new p.PickerBuilder().addView(new p.DocsView(p.ViewId.DOCUMENTS).setMimeTypes('application/vnd.google-apps.document'))
          .setAppId(config.messagingSenderId).setDeveloperKey(config.apiKey).setOAuthToken(token).setOrigin(location.origin)
          .setTitle(expected?'Elegí el guion vinculado para autorizar su importación':'Elegí el Google Docs de tu guion')
          .setCallback(data=>{
            if(data.action===p.Action.CANCEL){picker.dispose();resolve(null);}
            if(data.action===p.Action.PICKED){const doc=data.docs?.[0];picker.dispose();if(!doc?.id){reject(Error('Google no devolvió un documento válido.'));return;}if(expected&&doc.id!==expected.id){reject(Error('Elegiste otro documento. Para cambiar el guion, pegá y vinculá su enlace primero.'));return;}resolve(doc);}
          }).build();picker.setVisible(true);
      }catch{reject(Error('No pudimos abrir Google Docs. Podés vincular su enlace y cargar una copia Word.'));}
    });
  }
  return async function importDocument(link){
    const token=await authorize();if(!token)return null;
    let id=link?.id;
    if(!id||!granted.has(authorizedUid+'|'+id)){const picked=await choose(token,link);if(!picked)return null;id=picked.id;granted.add(authorizedUid+'|'+id);}
    const response=await fetch('https://docs.googleapis.com/v1/documents/'+encodeURIComponent(id)+'?includeTabsContent=true',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    if(!response.ok){
      if(response.status===401){accessToken='';expiresAt=0;throw Error('La autorización de Google venció. Volvé a importar para renovarla.');}
      if([403,404].includes(response.status)){granted.delete(authorizedUid+'|'+id);throw Error('Tu cuenta no puede leer ese documento. Revisá los permisos en Google Docs y elegilo nuevamente.');}
      throw Error('Google no pudo entregar el guion. Intentá de nuevo o cargá una copia Word.');
    }
    const doc=await response.json(),text=window.RodaScreenplay.docsText(doc);
    if(!text.trim())throw Error('El documento no contiene texto de guion.');
    return {id,url:'https://docs.google.com/document/d/'+id+'/edit',title:doc.title||'Google Docs',revisionId:doc.revisionId||'',text};
  };
}
