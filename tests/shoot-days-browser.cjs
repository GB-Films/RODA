const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=process.env.RODA_ROOT||path.resolve(__dirname,'..'),studio=process.env.STUDIO_ROOT;
if(!studio)throw Error('Definí STUDIO_ROOT y RODA_ROOT para probar la distribución integrada de Roda.');
const qa=process.env.RODA_QA_DIR||path.join(root,'.qa');fs.mkdirSync(qa,{recursive:true});
const id='12345678-1234-1234-1234-123456789abc';
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname;const area=p.startsWith('/roda/')?root:studio;const relative=p.startsWith('/roda/')?p.slice(5):p;const f=path.resolve(area,'.'+(relative.endsWith('/')?relative+'index.html':relative));if(!f.startsWith(area+path.sep))return res.writeHead(403).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'})[path.extname(f)]||'text/plain');fs.readFile(f,(e,b)=>e?res.writeHead(404).end():res.end(b));});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext();
 let project=null,parts={},viewer=false,guestLogin=false,accessOverride=null,accessMembers=[],accessRevision=0;const policy=require(path.join(root,'js/roda-policy.js'));const writes=[],errors=[];
 await context.route('**/firebase-app.js',r=>r.fulfill({contentType:'text/javascript',body:'export const initializeApp=()=>({}),getApps=()=>[{}],getApp=()=>({});'}));
 await context.route('**/firebase-auth.js',r=>r.fulfill({contentType:'text/javascript',body:`const user={uid:'qa-user',email:'info@granbertafilms.com',displayName:'Prueba Studio',emailVerified:true,providerData:[{providerId:'google.com'}],getIdToken:async()=> 'qa-token'};export const setPersistence=async()=>{},inMemoryPersistence={},getAuth=()=>({currentUser:user}),GoogleAuthProvider=class{addScope(s){if(s!=='https://www.googleapis.com/auth/drive.file')throw Error('Overbroad scope');}setCustomParameters(){}static credentialFromResult(){return {accessToken:'qa-google-token'};}},reauthenticateWithPopup=async()=>({user}),signInWithPopup=async()=>({user}),signOut=async()=>{},onAuthStateChanged=(a,cb)=>{queueMicrotask(()=>cb(user));return ()=>{};};`}));
 await context.route('**/reviews-cloud.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const watchStaffRole=(user,cb)=>{'+(guestLogin?'cb(null,{state:"no-plan"});':'cb({role:"admin"});')+'return ()=>{};};export const trialRequest=async()=>({});'}));
 await context.route('https://pres-web-475470109485.southamerica-east1.run.app/**',async r=>{
  const req=r.request(),url=new URL(req.url()),p=url.pathname;let body,status=200;
  if(p.startsWith('/api/roda/projects/')){
   const permissions=accessOverride||{version:1,revision:accessRevision,sections:policy.all(viewer?'read':'edit'),admin:!viewer,unrestricted:!viewer,projectOnly:false,configured:false};
   if(p.endsWith('/access')){if(req.method()==='POST'){const input=req.postDataJSON();accessMembers=accessMembers.filter(m=>m.email!==input.email);if(!input.remove)accessMembers.push(input);accessRevision++;body={saved:true,revision:accessRevision};}else body={members:accessMembers,revision:accessRevision,owner:'owner@example.com',studioOwner:'owner@example.com',configured:!!accessMembers.length};}
   else if(p.endsWith('/state')){if(req.method()==='PATCH'){const input=req.postDataJSON();assert.equal(viewer,false);assert.equal(input.accessRevision,permissions.revision);for(const key of ['core','script'])assert.equal(input.revisions[key],parts[key]?.revision||0);if(input.changes)for(const key of Object.keys(input.changes))assert.equal(permissions.sections[key],'edit');const next=input.changes?policy.merge(parts.core?.payload,parts.script?.payload,input.changes):input;for(const key of ['core','script']){parts[key]={payload:next[key],revision:(parts[key]?.revision||0)+1};writes.push(key);}body={saved:true,revisions:{core:parts.core.revision,script:parts.script.revision}};}else body={parts:policy.project(parts.core?.payload||null,parts.script?.payload||null,permissions),revisions:{core:parts.core?.revision||0,script:parts.script?.revision||0},access:permissions};}
   else body={...project,role:permissions.admin?'manager':Object.values(permissions.sections).includes('edit')?'editor':'viewer',rodaAccess:permissions};
  }
  else if(p==='/api/studio/spaces')body={spaces:[{id:'gb-films',name:'GB Films',role:'admin',ownerEmail:'info@granbertafilms.com'}]};
  else if(p.endsWith('/clients'))body={clients:[]};
  else if(p.endsWith('/projects')&&req.method()==='POST'){const input=req.postDataJSON();project={...input,id,spaceId:'gb-films',name:input.name,clientName:input.clientName,role:'manager',canEditMetadata:true,libraryId:id,studioName:'GB Films',presentationCount:0,fileCount:0,reviewCount:0,miraFileCount:0};body=project;status=201;}
  else if(p.endsWith('/projects'))body={projects:project?[project]:[]};
  else if(p.includes('/roda/')){const part=p.split('/').pop(),row=parts[part]||{payload:null,revision:0};if(part==='state'){const input=req.postDataJSON();assert.equal(viewer,false);for(const key of ['core','script']){assert.equal(input.revisions[key],parts[key]?.revision||0);}for(const key of ['core','script']){parts[key]={payload:input[key],revision:(parts[key]?.revision||0)+1};writes.push(key);}body={saved:true,revisions:{core:parts.core.revision,script:parts.script.revision}};}else if(req.method()==='PATCH'){const input=req.postDataJSON();assert.equal(viewer,false,'viewer must never attempt to write');assert.equal(input.revision,row.revision);parts[part]={payload:input.payload,revision:row.revision+1};writes.push(part);body={saved:true,revision:row.revision+1};}else body={...row,role:viewer?'viewer':'manager'};}
  else if(p.endsWith('/presentations'))body={presentations:[]};
  else if(p.endsWith('/files'))body={files:[]};
  else if(p.endsWith('/projects/'+id))body={...project,role:viewer?'viewer':'manager'};
  else {status=404;body={error:'Unexpected QA request: '+p};}
  await r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await context.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await context.route('https://gbstudio.com.ar/**',r=>r.abort());
 await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/roda/');await page.getByRole('button',{name:'Nuevo proyecto'}).click();
 await page.locator('#gbp-project-form [name="name"]').fill('Campaña Roda');await page.locator('#gbp-project-client').fill('Cliente compartido');
 const cover=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');ctx.fillStyle='#758b99';ctx.fillRect(0,0,320,180);ctx.fillStyle='#344650';ctx.fillRect(100,45,120,90);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#gbp-cover-file').setInputFiles({name:'portada.png',mimeType:'image/png',buffer:Buffer.from(cover,'base64')});await page.locator('#gbp-cover-preview img').waitFor();await page.getByRole('button',{name:'Crear proyecto',exact:true}).click();
 await page.locator('.shell:not([hidden])').waitFor();await page.waitForFunction(()=>window.RODA_READY===true);assert.equal(await page.getByRole('link',{name:'Crear Roda',exact:true}).count(),0,'new projects open their only Roda directly');
 await page.setViewportSize({width:1440,height:900});
 await page.locator('.navBtn[data-view=dayplan]').click();
 assert.equal(await page.locator('#dayplanSelect option').count(),0,'new projects do not invent a shooting day');
 assert.equal(await page.locator('#btnDeleteShootDay').isDisabled(),true);
 const flush=()=>page.evaluate(()=>window.RODA_FLUSH());
 const add=async()=>{await page.locator('#btnAddShootDay').click();await flush();return page.locator('#dayplanSelect').inputValue();};
 const days=[];for(let i=0;i<5;i++)days.push(await add());
 // Existing projects can contain multiple jornadas per date as well as undated jornadas.
 for(const [index,date] of ['2026-11-05','2026-11-05','2026-11-07'].entries())parts.core.payload.shootDays.find(d=>d.id===days[index]).date=date;
 parts.core.revision++;
 await page.reload();await page.waitForFunction(()=>window.RODA_READY===true);
 assert.equal(parts.core.payload.shootDays.length,5);
 await page.locator('.navBtn[data-view=breakdown]').click();await page.locator('#btnAddScene').click();await flush();
 await page.locator('.navBtn[data-view=dayplan]').click();await page.locator('#dayplanSelect').selectOption(days[3]);await page.locator('#dpSceneBankList .scene-plan-action').first().click();await flush();
 const screenplay=JSON.stringify(parts.script.payload.scenes),fourth=JSON.stringify(parts.core.payload.shootDays.find(d=>d.id===days[3]));
 await page.locator('.navBtn[data-view=schedule]').click();await page.locator('#btnSchedDays').click();
 assert.equal(await page.locator('#schedUndatedDays input:checked').count(),2);
 assert.equal(await page.locator('#schedCalGrid button[aria-pressed=true]').count(),2,'all dated groups are highlighted');
 await page.locator(`[data-sched-day="${days[4]}"]`).uncheck();assert.equal(await page.locator('.schedDay').count(),4,'hiding day five keeps the other four');
 assert.equal(await page.locator(`[data-sched-day="${days[3]}"]`).isChecked(),true);
 await page.locator('#schedCalGrid [data-date="2026-11-05"]').click();assert.equal(await page.locator('.schedDay').count(),2,'one date toggles both of its jornadas');
 await page.locator('#schedCalGrid [data-date="2026-11-05"]').click();assert.equal(await page.locator('.schedDay').count(),4);
 await page.screenshot({path:path.join(qa,'shoot-days-picker-1440.png')});await page.locator('#schedCalDone').click();
 await page.reload();await page.waitForFunction(()=>window.RODA_READY===true);await page.locator('.navBtn[data-view=schedule]').click();assert.equal(await page.locator('.schedDay').count(),4,'visibility survives reload');
 await page.locator('.navBtn[data-view=dayplan]').click();await page.locator('#dayplanSelect').selectOption(days[4]);
 assert.equal(await page.locator('#btnDeleteShootDay').isVisible(),true);assert.equal(await page.locator('#dpDayMetaEditor').isVisible(),false);
 page.once('dialog',d=>{assert.match(d.message(),/Día 5/);d.dismiss();});await page.locator('#btnDeleteShootDay').click();await flush();assert.equal(parts.core.payload.shootDays.length,5,'cancel keeps day');
 page.once('dialog',d=>d.accept());await page.locator('#btnDeleteShootDay').click();await flush();assert.equal(parts.core.payload.shootDays.length,4);assert.equal(JSON.stringify(parts.core.payload.shootDays.find(d=>d.id===days[3])),fourth,'day four is unchanged');
 await page.reload();await page.waitForFunction(()=>window.RODA_READY===true);await page.locator('.navBtn[data-view=dayplan]').click();assert.equal(await page.locator('#dayplanSelect option').count(),4,'deleted day stays deleted');
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});if(width===390)await page.waitForFunction(()=>document.querySelector(".sidebar").getBoundingClientRect().right<=0);await page.screenshot({path:path.join(qa,`shoot-days-plan-${width}.png`),fullPage:true});assert.equal(await page.locator('#btnDeleteShootDay').isVisible(),true);}
 await page.setViewportSize({width:1440,height:900});await page.locator('#dayplanSelect').selectOption(days[3]);page.once('dialog',d=>{assert.match(d.message(),/escena queda disponible/);d.accept();});await page.locator('#btnDeleteShootDay').click();await flush();assert.equal(JSON.stringify(parts.script.payload.scenes),screenplay,'deleting a scheduled day preserves all scene data');assert.ok(await page.locator('#dpSceneBankList .scene-plan-action').count()>0);
 for(let i=0;i<3;i++){page.once('dialog',d=>d.accept());await page.locator('#btnDeleteShootDay').click();await flush();}
 assert.equal(parts.core.payload.shootDays.length,0);await page.reload();await page.waitForFunction(()=>window.RODA_READY===true);await page.locator('.navBtn[data-view=dayplan]').click();assert.equal(await page.locator('#dayplanSelect option').count(),0,'last deleted day does not reappear');
 await add();assert.equal(await page.locator('#btnDeleteShootDay').isVisible(),true);await page.locator('#dpEditDay').click();assert.equal(await page.locator('#btnDayplanNight').isVisible(),true,'day actions survive deleting the final day');await page.locator('#dpCloseMeta').click();
 viewer=true;await page.reload();await page.waitForFunction(()=>window.RODA_READY===true);await page.locator('.navBtn[data-view=dayplan]').click();assert.equal(await page.locator('#btnDeleteShootDay').isDisabled(),true);const before=writes.length;await page.locator('.navBtn[data-view=schedule]').click();await page.locator('#btnSchedDays').click();await page.locator('#schedUndatedDays input').uncheck();assert.equal(await page.locator('.schedDay').count(),0);assert.equal(writes.length,before,'viewers can hide undated days without writing shared data');
 assert.deepEqual(errors,[]);console.log('PASS: undated/double-date filtering, reload, cancel/delete, scene preservation, empty-plan recovery, desktop/mobile and reader permissions.');
 }finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

