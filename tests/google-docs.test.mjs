import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const pages=createRequire(import.meta.url)('../js/script-pages.js');
import {createGoogleDocsImporter,resolveGoogleDocsSource} from '../js/google-docs.mjs';
function fixture(options={}){
 const user={uid:'user',email:'user@example.test'},auth={currentUser:user},calls=[],progress=[],views=[];
 let authCalls=0,pickerCalls=0,disposed=0,callback;
 class Provider{addScope(value){assert.equal(value,'https://www.googleapis.com/auth/drive.file');}setCustomParameters(){}static credentialFromResult(){return {accessToken:'memory-token'};}}
 class View{setMimeTypes(value){this.mime=value;return this;}setMode(value){this.mode=value;return this;}setFileIds(value){assert.equal(this.drives,undefined);this.fileIds=value;return this;}setLabel(value){this.label=value;return this;}setIncludeFolders(value){this.folders=value;return this;}setSelectFolderEnabled(value){this.selectFolders=value;return this;}setOwnedByMe(value){this.owned=value;return this;}setEnableDrives(value){assert.equal(this.fileIds,undefined);assert.equal(this.owned,undefined);this.drives=value;return this;}}
 class Builder{
  addView(view){views.push(view);return this;}setLocale(value){assert.equal(value,'es');return this;}setAppId(){return this;}setDeveloperKey(){return this;}setOAuthToken(){return this;}setOrigin(){return this;}setTitle(){return this;}setCallback(fn){callback=fn;return this;}
  build(){return {setVisible(){pickerCalls++;queueMicrotask(()=>callback(options.pick||{action:'picked',docs:[{id:'doc'}]}));},dispose(){disposed++;}};}
 }
 const runtime={location:{origin:'https://studio.test'},google:{picker:{PickerBuilder:Builder,DocsView:View,DocsViewMode:{LIST:'list'},ViewId:{DOCUMENTS:'docs'},Action:{PICKED:'picked',CANCEL:'cancel'}}},RodaScriptDocument:{docsFormat:doc=>({text:doc.text,format:{version:1,blocks:[]}})},fetch:async(url,init)=>{calls.push({url,init});return options.fetch?options.fetch(url,init,calls.length):{ok:true,status:200,json:async()=>({documentId:'doc',title:'Guion',text:'1. INT. CASA - DÍA\nÚltima revisión',revisionId:'latest-revision'})};}};
 const importer=createGoogleDocsImporter({auth,GoogleAuthProvider:Provider,reauthenticateWithPopup:async()=>{authCalls++;return options.authorize?options.authorize():{user};},authorizeOtherAccount:options.authorizeOtherAccount,config:{},runtime,requestTimeout:25,interactionTimeout:40});
 return {runtime,importer,auth,calls,progress,views,get authCalls(){return authCalls;},get pickerCalls(){return pickerCalls;},get disposed(){return disposed;},onProgress:message=>progress.push(message)};
}
test('linked document reads latest revision directly, disables cache and requests all tabs with accepted text',async()=>{
 const t=fixture(),result=await t.importer({id:'doc'},{onProgress:t.onProgress});
 assert.equal(result.revisionId,'latest-revision');assert.match(result.text,/Última revisión/);assert.equal(t.pickerCalls,0);
 assert.equal(t.calls[0].init.cache,'no-store');assert.equal(new URL(t.calls[0].url).searchParams.get('includeTabsContent'),'true');assert.equal(new URL(t.calls[0].url).searchParams.get('suggestionsViewMode'),'PREVIEW_WITHOUT_SUGGESTIONS');
 await t.importer({id:'doc'});assert.equal(t.authCalls,1);assert.equal(t.calls.length,2);
});
test('permission failure asks for the linked file then retries once',async()=>{
 const t=fixture({fetch:async(_url,_init,n)=>({ok:n>1,status:n===1?403:200,json:async()=>n===1?{error:{}}:{documentId:'doc',text:'Último guion'}})});
 assert.equal((await t.importer({id:'doc'},{onProgress:t.onProgress})).id,'doc');assert.equal(t.pickerCalls,1);assert.equal(t.disposed,1);assert.equal(t.calls.length,2);
 assert.equal(t.views[0].fileIds,'doc');assert.equal(t.views[0].label,'Guion vinculado');assert.equal(t.views[0].drives,undefined);
 assert.equal(t.views[1].folders,true);assert.equal(t.views[1].selectFolders,false);assert.equal(t.views[2].owned,false);assert.equal(t.views[3].drives,true);
 assert.ok(t.views.every(view=>view.mode==='list'));assert.ok(t.progress.some(message=>message.includes('user@example.test')));
});
test('selecting another file is rejected and cancellation does not import a document',async()=>{
 const response=async()=>({ok:false,status:403,json:async()=>({error:{}})});
 const wrong=fixture({fetch:response,pick:{action:'picked',docs:[{id:'other'}]}});await assert.rejects(wrong.importer({id:'doc'}),/otro documento/);assert.equal(wrong.calls.length,1);
 const cancelled=fixture({pick:{action:'cancel'}});assert.equal(await cancelled.importer(null),null);assert.equal(cancelled.calls.length,0);assert.equal(cancelled.disposed,1);
});
test('stalled response fails clearly, aborts the request and allows retry',async()=>{
 let requestSignal;const t=fixture({fetch:(_url,init,n)=>{requestSignal=init.signal;return n===1?new Promise(()=>{}):Promise.resolve({ok:true,status:200,json:async()=>({text:'Recuperado'})});}});
 await assert.rejects(t.importer({id:'doc'}),/tardó demasiado/);assert.equal(requestSignal.aborted,true);
 assert.equal((await t.importer({id:'doc'})).text,'Recuperado');
});
test('cancel while reading rejects without applying a late response',async()=>{
 const abort=new AbortController();let finish,started;
 const ready=new Promise(resolve=>{started=resolve;});
 const t=fixture({fetch:()=>{started();return new Promise(resolve=>{finish=resolve;});}});
 const pending=t.importer({id:'doc'},{signal:abort.signal});await ready;abort.abort();await assert.rejects(pending,{name:'AbortError'});
 finish({ok:true,status:200,json:async()=>({text:'Late content'})});assert.equal(t.calls[0].init.signal.aborted,true);
});
test('stalled authorization stops instead of leaving the editor loading indefinitely',async()=>{
 const t=fixture({authorize:()=>new Promise(()=>{})});await assert.rejects(t.importer({id:'doc'}),/autorización de Google no terminó/);assert.equal(t.calls.length,0);
});
test('expired credentials are renewed within the same refresh request',async()=>{
 const t=fixture({fetch:async(_url,_init,n)=>({ok:n>1,status:n===1?401:200,json:async()=>n===1?{error:{}}:{text:'Guion'}})});
 assert.equal((await t.importer({id:'doc'})).text,'Guion');assert.equal(t.authCalls,2);assert.equal(t.calls.length,2);
});
test('API configuration and changed Google identity return explicit errors',async()=>{
 const t=fixture({fetch:async()=>({ok:false,status:403,json:async()=>({error:{details:[{reason:'SERVICE_DISABLED'}]}})})});await assert.rejects(t.importer({id:'doc'}),/API de Google Docs/);assert.equal(t.pickerCalls,0);
 const wrong=fixture({authorize:async()=>({user:{uid:'other'}})});await assert.rejects(wrong.importer({id:'doc'}),/otra cuenta de Google/);
});
test('explicit other-account import reads the linked document without changing the Studio identity',async()=>{
 let otherCalls=0;const t=fixture({authorizeOtherAccount:async()=>{otherCalls++;return {user:{uid:'doc-owner',email:'owner@example.test'}};}});
 const primary=t.auth.currentUser,result=await t.importer({id:'doc'},{chooseAccount:true});
 assert.equal(result.accountEmail,'owner@example.test');assert.equal(t.auth.currentUser,primary);assert.equal(t.authCalls,0);assert.equal(otherCalls,1);
 await t.importer({id:'doc',accountEmail:'owner@example.test'});assert.equal(otherCalls,1);
});
test('saved document account is authorized again after reload while Studio keeps its session',async()=>{
 let otherCalls=0;const t=fixture({authorizeOtherAccount:async()=>{otherCalls++;return {user:{uid:'doc-owner',email:'owner@example.test'}};}});
 await t.importer({id:'doc',accountEmail:'owner@example.test'});assert.equal(otherCalls,1);assert.equal(t.auth.currentUser.uid,'user');
});
test('another account cannot bypass a changed Studio session or import a different document',async()=>{
 const t=fixture({authorizeOtherAccount:async()=>{t.auth.currentUser={uid:'different-studio-user'};return {user:{uid:'doc-owner',email:'owner@example.test'}};}});
 await assert.rejects(t.importer({id:'doc'},{chooseAccount:true}),/sesión de GB Studio cambió/);assert.equal(t.calls.length,0);
 const u=fixture({authorizeOtherAccount:async()=>({user:{uid:'doc-owner',email:'owner@example.test'}}),fetch:async()=>({ok:false,status:403,json:async()=>({error:{}})}),pick:{action:'picked',docs:[{id:'wrong-doc'}]}});
 await assert.rejects(u.importer({id:'doc'},{chooseAccount:true}),/otro documento/);assert.equal(u.calls.length,1);
});
test('a fresh selection shows shared and folder views without an unrelated pinned document',async()=>{
 const t=fixture();await t.importer(null);assert.equal(t.views.length,3);assert.ok(t.views.every(view=>!view.fileIds));assert.equal(t.views[0].label,'Buscar en Drive');
});

const parseLink=value=>{const url=new URL(value);return {id:url.pathname.split('/')[3],url:url.origin+url.pathname};};
test('refresh resolves the selected screenplay source before the last imported project document',()=>{
 const version={source:{type:'google-doc',documentId:'selected',url:'https://docs.google.com/document/d/selected/edit',name:'Guion seleccionado',accountEmail:'writer@example.test'}};
 const saved={id:'other',url:'https://docs.google.com/document/d/other/edit',accountEmail:'other@example.test'};
 const source=resolveGoogleDocsSource(version,saved);assert.equal(source.id,'selected');assert.equal(source.accountEmail,'writer@example.test');assert.equal(source.title,'Guion seleccionado');
 assert.equal(resolveGoogleDocsSource(version,saved,source.url,parseLink).accountEmail,'writer@example.test');
 assert.equal(resolveGoogleDocsSource(version,saved,saved.url,parseLink).accountEmail,'other@example.test');
 assert.equal(resolveGoogleDocsSource(version,saved,'https://docs.google.com/document/d/new/edit',parseLink).accountEmail,undefined);
});
test('pasting the same linked URL retains its independent Google account after reload',()=>{
 const saved={id:'doc',url:'https://docs.google.com/document/d/doc/edit',accountEmail:'writer@example.test'};
 const version={source:{type:'google-doc',documentId:'doc'}};
 assert.equal(resolveGoogleDocsSource(version,saved,saved.url,parseLink).accountEmail,'writer@example.test');
 assert.equal(resolveGoogleDocsSource({source:{type:'file'}},saved).id,'doc');
});
test('a second expired response fails without an unbounded retry loop',async()=>{
 const t=fixture({fetch:async()=>({ok:false,status:401,json:async()=>({error:{}})})});
 await assert.rejects(t.importer({id:'doc'}),/venció/);assert.equal(t.calls.length,2);assert.equal(t.authCalls,2);
});

test('original PDF bytes are stored with the version under the same bounded file permission',async()=>{
 const bytes=new TextEncoder().encode('%PDF-1.4\noriginal-page-data');
 const t=fixture({fetch:async(url,init)=>url.includes('/drive/v3/')?{ok:true,status:200,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer}:{ok:true,status:200,json:async()=>({documentId:'doc',text:'Ultimo guion',revisionId:'stable'})}});
 t.runtime.RodaScriptPages=pages;const result=await t.importer({id:'doc'});
 assert.equal(Buffer.from(result.format.pdf.data,'base64').toString(),'%PDF-1.4\noriginal-page-data');assert.equal(t.calls.length,3);
 const exported=t.calls.find(c=>c.url.includes('/drive/v3/'));assert.equal(exported.init.cache,'no-store');assert.equal(exported.init.headers.Authorization,'Bearer memory-token');assert.equal(result.format.pdf.Authorization,undefined);
});
test('unavailable original pages retain readable text and explain the reading-page fallback',async()=>{
 const t=fixture({fetch:async url=>url.includes('/drive/v3/')?{ok:false,status:403}:{ok:true,status:200,json:async()=>({text:'Texto intacto'})}});t.runtime.RodaScriptPages=pages;
 const result=await t.importer({id:'doc'});assert.equal(result.text,'Texto intacto');assert.equal(result.format.pdf,undefined);assert.match(result.format.pageWarning,/páginas originales/);
});
test('a document edited during PDF export is not saved as a mismatched text/PDF version',async()=>{
 let reads=0;const bytes=new TextEncoder().encode('%PDF-1.4\npages');
 const t=fixture({fetch:async url=>url.includes('/drive/v3/')?{ok:true,status:200,arrayBuffer:async()=>bytes.buffer}:{ok:true,status:200,json:async()=>({text:'Texto',revisionId:String(++reads)})}});t.runtime.RodaScriptPages=pages;
 await assert.rejects(t.importer({id:'doc'}),/cambió mientras/);
});
test('PDF snapshots reject invalid or oversized content and keep only original bytes',()=>{
 assert.throws(()=>pages.capture(new TextEncoder().encode('not a PDF').buffer),/PDF válida/);
 assert.throws(()=>pages.capture(new ArrayBuffer(pages.PDF_LIMIT+1)),/4 MB/);
});
