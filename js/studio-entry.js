const base=new URL(window.RODA_STUDIO_BASE);
const asset=path=>new URL(path,base).href;
for(const path of ['assets/studio-header.css','assets/studio-tool-access.css','studio-projects.css']){
  const link=document.createElement('link');link.rel='stylesheet';link.href=asset(path);document.head.append(link);
}
document.querySelector('[data-studio-home]').href=base.href;
document.querySelector('[data-studio-logo]').src=asset('assets/gb-studio-icon.svg?v=2');
const [{initializeApp,getApps,getApp},{getAuth,GoogleAuthProvider,signInWithPopup,reauthenticateWithPopup,onAuthStateChanged,signOut}]=await Promise.all([
  import('https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js'),
  import(asset('firebase-config.js'))
]);
const auth=getAuth(getApps().length?getApp():initializeApp(window.STORYBOARD_FIREBASE_CONFIG));
const {createGoogleDocsImporter}=await import('./google-docs.mjs?v=1.3.0');
window.RODA_IMPORT_GOOGLE_DOC=createGoogleDocsImporter({auth,GoogleAuthProvider,reauthenticateWithPopup,config:window.STORYBOARD_FIREBASE_CONFIG});
const [{createSubscriptionGate},{createAccessController},{watchStaffRole}]=await Promise.all([
  import(asset('studio-subscription-gate.mjs?v=2')),import(asset('compi/access.mjs?v=4')),import(asset('reviews-cloud.js?v=16'))
]);
await import(asset('studio-projects.js?v=roda-1.3.0'));
const projects=window.GBStudioProjects,home=document.getElementById('roda-home'),workspace=document.querySelector('.shell');
const account=document.getElementById('roda-account');
const login=()=>signInWithPopup(auth,new GoogleAuthProvider());
const gate=createSubscriptionGate({appName:'Roda',onLogin:login});
let bootedUid=null,starting=false;
async function script(path){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=path;s.onload=resolve;s.onerror=()=>reject(Error('No pudimos cargar Roda. Recargá la página.'));document.body.append(s);});}
async function start(user){
  if(starting)return;starting=true;
  try{
    const project=projects.context();
    if(!project){home.hidden=false;workspace.hidden=true;projects.show(document.getElementById('roda-projects'),'roda');return;}
    window.RODA_STUDIO={canEdit:project.role!=='viewer',project,userName:user.displayName||user.email};
    await script('js/studio-storage.js?v=1.3.0');
    window.StorageLayer=window.createRodaStorage({projects,project,user});
    // Fail closed before boot: never create or edit a placeholder after a failed pull.
    await StorageLayer.init();
    bootedUid=user.uid;home.hidden=true;workspace.hidden=false;
    document.getElementById('roda-context').textContent=project.clientName?project.clientName+' / '+project.name:project.name;
    const back=new URL('roda/',base);document.getElementById('roda-back').href=back.href;
    document.getElementById('projectTitle').readOnly=true;
    await script('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js').catch(()=>{});
    await script('js/screenplay.js?v=1.3.0');
    await script('js/utils.js?v=1');await script('js/app.js?v=1.3.0');
  }catch(error){workspace.hidden=true;home.hidden=false;document.getElementById('roda-projects').textContent=error.message;}
  finally{starting=false;}
}
const controller=createAccessController({appName:'Roda',allowReadOnly:true,watchRole:watchStaffRole,view:{
  account(user){account.textContent=user?.displayName||user?.email||'Iniciar sesión';},
  deny(message,reason){gate.deny(message,reason);workspace.inert=true;home.inert=true;},
  async allow(){
    if(bootedUid){if(bootedUid!==auth.currentUser?.uid)location.reload();else{gate.allow();workspace.inert=false;home.inert=false;}return;}
    gate.allow();workspace.inert=false;home.inert=false;
    try{
      await projects.ready;
      const params=new URLSearchParams(location.search);
      if(params.get('studioProject'))await projects.setContext(params.get('studioSpace')||'gb-films',params.get('studioProject'));
      document.getElementById('roda-legacy-link').hidden=auth.currentUser?.email?.toLowerCase()!=='info@granbertafilms.com';
      await start(auth.currentUser);
    }catch(error){home.hidden=false;document.getElementById('roda-projects').textContent=error.message;}
  }
}});
onAuthStateChanged(auth,user=>{if(bootedUid&&bootedUid!==user?.uid){location.reload();return;}controller.change(user);});
account.onclick=()=>{if(!auth.currentUser)return login();const dialog=document.getElementById('roda-account-dialog');document.getElementById('roda-account-email').textContent=auth.currentUser.email;dialog.showModal();};
document.getElementById('roda-account-close').onclick=()=>document.getElementById('roda-account-dialog').close();
document.getElementById('roda-signout').onclick=async()=>{
  try{if(window.RODA_UNSAVED)await window.RODA_FLUSH();await signOut(auth);}
  catch(error){window.dispatchEvent(new CustomEvent('roda-sync-error',{detail:error.message}));}
};
window.addEventListener('roda-sync-error',event=>{const node=document.getElementById('roda-sync-message');node.textContent=event.detail;node.hidden=false;});
let leaving=false;
document.addEventListener('click',async event=>{
  const link=event.target.closest('[data-studio-home],#roda-back,.roda-project-change');
  if(!link||!window.RODA_UNSAVED||event.ctrlKey||event.metaKey||event.shiftKey)return;
  event.preventDefault();if(leaving)return;leaving=true;
  try{await window.RODA_FLUSH();location.assign(link.href);}catch(error){window.dispatchEvent(new CustomEvent('roda-sync-error',{detail:error.message}));}finally{leaving=false;}
},true);
