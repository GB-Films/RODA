const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),studio=process.env.STUDIO_ROOT;
const qa=process.env.RODA_QA_DIR||path.join(root,'.qa');fs.mkdirSync(qa,{recursive:true});
const id='12345678-1234-1234-1234-123456789abc';
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname;const area=p.startsWith('/roda/')?root:studio;const relative=p.startsWith('/roda/')?p.slice(5):p;const f=path.resolve(area,'.'+(relative.endsWith('/')?relative+'index.html':relative));if(!f.startsWith(area+path.sep))return res.writeHead(403).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'})[path.extname(f)]||'text/plain');fs.readFile(f,(e,b)=>e?res.writeHead(404).end():res.end(b));});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext();
 let project=null,parts={},viewer=false;const writes=[],errors=[];
 await context.route('**/firebase-app.js',r=>r.fulfill({contentType:'text/javascript',body:'export const initializeApp=()=>({}),getApps=()=>[{}],getApp=()=>({});'}));
 await context.route('**/firebase-auth.js',r=>r.fulfill({contentType:'text/javascript',body:`const user={uid:'qa-user',email:'info@granbertafilms.com',displayName:'Prueba Studio',emailVerified:true,providerData:[{providerId:'google.com'}],getIdToken:async()=> 'qa-token'};export const getAuth=()=>({currentUser:user}),GoogleAuthProvider=class{},signInWithPopup=async()=>({user}),signOut=async()=>{},onAuthStateChanged=(a,cb)=>{queueMicrotask(()=>cb(user));return ()=>{};};`}));
 await context.route('**/reviews-cloud.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const watchStaffRole=(user,cb)=>{cb({role:"admin"});return ()=>{};};export const trialRequest=async()=>({});'}));
 await context.route('https://pres-web-475470109485.southamerica-east1.run.app/**',async r=>{
  const req=r.request(),url=new URL(req.url()),p=url.pathname;let body,status=200;
  if(p==='/api/studio/spaces')body={spaces:[{id:'gb-films',name:'GB Films',role:'admin',ownerEmail:'info@granbertafilms.com'}]};
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
 await page.locator('#gbp-project-form [name="name"]').fill('Campaña Roda');await page.locator('#gbp-project-client').fill('Cliente compartido');await page.getByRole('button',{name:'Crear proyecto',exact:true}).click();
 await page.getByRole('link',{name:'Crear Roda'}).click();await page.locator('.shell:not([hidden])').waitFor();await page.waitForFunction(()=>window.RODA_READY===true);
 assert.equal(new URL(page.url()).searchParams.get('studioProject'),id);
 assert.equal(await page.locator('#projectTitle').inputValue(),'Campaña Roda');assert.equal(await page.locator('#projectTitle').getAttribute('readonly'),'');
 for(const view of ['dayplan','shooting','shotlist','schedule','crew','elements','reports','callsheet','breakdown']){await page.locator('.navBtn[data-view="'+view+'"]').click();assert.equal(await page.locator('#view-'+view).isVisible(),true);}await page.locator('#btnAddScene').click();await page.waitForTimeout(2200);
 assert.ok(parts.script?.payload.scenes.length>0,'scene saved under the shared studio project');assert.ok(writes.includes('core'));
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(350);if(width===390)assert.ok(await page.locator(".sidebar").evaluate(el=>el.getBoundingClientRect().right<=0),"mobile drawer stays closed");await page.screenshot({path:path.join(qa,`roda-editor-${width}.png`),fullPage:true});assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(16, 16, 16)');assert.equal(await page.locator('.studio-global-header').isVisible(),true);}
 await page.reload();await page.waitForFunction(()=>window.RODA_READY===true);await page.waitForTimeout(600);assert.ok(await page.locator('#sceneTable tbody tr').count()>0,'scene survives reload');
 const activeURL=page.url();await page.setViewportSize({width:1440,height:900});await page.locator('.navBtn[data-view="breakdown"]').click();await page.locator('#btnAddScene').click();await page.locator('#roda-back').click();await page.getByRole('button',{name:'Nuevo proyecto'}).waitFor();assert.equal(parts.script.payload.scenes.length,2,'back navigation flushes the pending save');await page.goto(activeURL);await page.waitForFunction(()=>window.RODA_READY===true);viewer=true;const before=writes.length;await page.reload();await page.waitForFunction(()=>window.RODA_READY===true);await page.waitForTimeout(600);assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('readOnly')),true);assert.equal(writes.length,before,'viewer does not initialize or save');assert.match(await page.locator('#modeBanner').textContent(),/Solo lectura/);
 await page.locator('#roda-back').click();await page.getByRole('button',{name:'Nuevo proyecto'}).waitFor();assert.equal(new URL(page.url()).searchParams.has('studioProject'),false);
 assert.deepEqual(errors,[]);console.log('PASS: shared project creation, Roda open, scene autosave/reload, viewer role, header/back navigation and monochrome desktop/mobile.');
 }finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
