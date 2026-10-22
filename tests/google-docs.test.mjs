import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleDocsImporter} from '../js/google-docs.mjs';
function fixture(options={}){
 const user={uid:'user',email:'user@example.test'},auth={currentUser:user},calls=[],progress=[];
 let authCalls=0,pickerCalls=0,disposed=0,callback;
 class Provider{addScope(value){assert.equal(value,'https://www.googleapis.com/auth/drive.file');}setCustomParameters(){}static credentialFromResult(){return {accessToken:'memory-token'};}}
 class View{setMimeTypes(){return this;}}
 class Builder{
  addView(){return this;}setAppId(){return this;}setDeveloperKey(){return this;}setOAuthToken(){return this;}setOrigin(){return this;}setTitle(){return this;}setCallback(fn){callback=fn;return this;}
  build(){return {setVisible(){pickerCalls++;queueMicrotask(()=>callback(options.pick||{action:'picked',docs:[{id:'doc'}]}));},dispose(){disposed++;}};}
 }
 const runtime={location:{origin:'https://studio.test'},google:{picker:{PickerBuilder:Builder,DocsView:View,ViewId:{DOCUMENTS:'docs'},Action:{PICKED:'picked',CANCEL:'cancel'}}},RodaScriptDocument:{docsFormat:doc=>({text:doc.text,format:{version:1,blocks:[]}})},fetch:async(url,init)=>{calls.push({url,init});return options.fetch?options.fetch(url,init,calls.length):{ok:true,status:200,json:async()=>({documentId:'doc',title:'Guion',text:'1. INT. CASA - DÍA\nÚltima revisión',revisionId:'latest-revision'})};}};
 const importer=createGoogleDocsImporter({auth,GoogleAuthProvider:Provider,reauthenticateWithPopup:async()=>{authCalls++;return options.authorize?options.authorize():{user};},config:{},runtime,requestTimeout:25,interactionTimeout:40});
 return {importer,auth,calls,progress,get authCalls(){return authCalls;},get pickerCalls(){return pickerCalls;},get disposed(){return disposed;},onProgress:message=>progress.push(message)};
}
test('linked document reads latest revision directly, disables cache and requests all tabs with accepted text',async()=>{
 const t=fixture(),result=await t.importer({id:'doc'},{onProgress:t.onProgress});
 assert.equal(result.revisionId,'latest-revision');assert.match(result.text,/Última revisión/);assert.equal(t.pickerCalls,0);
 assert.equal(t.calls[0].init.cache,'no-store');assert.equal(new URL(t.calls[0].url).searchParams.get('includeTabsContent'),'true');assert.equal(new URL(t.calls[0].url).searchParams.get('suggestionsViewMode'),'PREVIEW_WITHOUT_SUGGESTIONS');
 await t.importer({id:'doc'});assert.equal(t.authCalls,1);assert.equal(t.calls.length,2);
});
test('permission failure asks for the linked file then retries once',async()=>{
 const t=fixture({fetch:async(_url,_init,n)=>({ok:n>1,status:n===1?403:200,json:async()=>n===1?{error:{}}:{documentId:'doc',text:'Último guion'}})});
 assert.equal((await t.importer({id:'doc'})).id,'doc');assert.equal(t.pickerCalls,1);assert.equal(t.disposed,1);assert.equal(t.calls.length,2);
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
test('expired credentials are cleared so the next attempt can reauthorize',async()=>{
 const t=fixture({fetch:async(_url,_init,n)=>({ok:n>1,status:n===1?401:200,json:async()=>n===1?{error:{}}:{text:'Guion'}})});
 await assert.rejects(t.importer({id:'doc'}),/venció/);await t.importer({id:'doc'});assert.equal(t.authCalls,2);
});
test('API configuration and changed Google identity return explicit errors',async()=>{
 const t=fixture({fetch:async()=>({ok:false,status:403,json:async()=>({error:{details:[{reason:'SERVICE_DISABLED'}]}})})});await assert.rejects(t.importer({id:'doc'}),/API de Google Docs/);assert.equal(t.pickerCalls,0);
 const wrong=fixture({authorize:async()=>({user:{uid:'other'}})});await assert.rejects(wrong.importer({id:'doc'}),/misma cuenta/);
});
