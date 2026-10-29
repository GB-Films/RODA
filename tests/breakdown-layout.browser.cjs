const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),studio=fs.existsSync(path.join(root,'roda/index.html')),appRoot=studio?path.join(root,'roda'):root;
const output=process.env.RODA_BREAKDOWN_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'roda-breakdown-'));
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const html=fs.readFileSync(path.join(appRoot,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const server=http.createServer((req,res)=>{
  if(req.url==='/roda/'){res.setHeader('Content-Type','text/html');return res.end(html);}
  const relative=decodeURIComponent(req.url.split('?')[0]);
  const file=path.join(studio?root:appRoot,studio?relative:relative.replace(/^\/roda\//,'/'));
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain');
  fs.readFile(file,(e,data)=>e?res.writeHead(404).end():res.end(data));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/roda/');
  const seed={meta:{version:14,title:'PRUEBA BREAKDOWN',updatedAt:new Date().toISOString()},project:{},crew:[]};
  async function boot(data){
  await page.evaluate(data=>{
   sessionStorage.setItem('gb_edit_unlocked__default','1');
   document.querySelector('.shell').hidden=false;document.body.classList.add('roda-studio');document.body.classList.remove('studio-tool-locked');
   let header=document.querySelector('.studio-global-header');if(!header){header=document.createElement('header');document.body.prepend(header);}
   header.className='studio-global-header studio-shared-header';header.innerHTML='<button>Tus proyectos</button><button>Aplicaciones</button><button>Cuenta privada</button>';
   window.RODA_STUDIO={canEdit:true,project:{rodaAccess:{admin:true,sections:Object.fromEntries(['script','breakdown','locations','cast','planning','shotlist','crew','reports'].map(k=>[k,'edit']))}}};
   window.savedState=structuredClone(data);window.savedWrites=0;
   window.StorageLayer=new Proxy({loadCfg:()=>({backend:'local',projects:[]}),loadLocal:()=>data,getProjects:()=>[],saveLocal:s=>{window.savedState=structuredClone(s);window.savedWrites++;}}, {get:(target,key)=>target[key]||(()=>null)});
   window.print=()=>{window.printSnapshot=document.documentElement.outerHTML;};
  },data);
  // Reproduce the shared header's !important display rule, also in standalone Roda.
  await page.addStyleTag({content:'.studio-global-header.studio-shared-header{display:flex!important;background:#050505;color:white;}'});
  for(const f of ['dialogs','roda-policy','roda-access','cast','script-pages','script-document','screenplay','script-revisions','script-history','utils','day-swap','production-blocks','day-navigation','app'].filter(f=>fs.existsSync(path.join(appRoot,'js',f+'.js'))))await page.addScriptTag({url:'js/'+f+'.js'});
  await page.waitForFunction(isStudio=>isStudio?!!window.RODA_READY:!document.body.classList.contains('bootLoading'),studio);await page.evaluate(()=>{document.querySelector('.shell').hidden=false;window.RodaAccess?.bind();});
  }




 seed.shootingLocations=[{id:'factory',name:'Fábrica real',address:'Dirección de prueba'}];
 seed.scenes=Array.from({length:45},(_,i)=>({id:'s'+(i+1),number:i+1,slugline:'INT. FÁBRICA · ESCALERAS Y PASILLO - DÍA '+(i+1),intExt:'Int',location:'Escaleras y pasillo',shootingLocationId:'factory',timeOfDay:'Día',summary:('Los agentes suben la escalera y se detienen a escuchar. La cámara acompaña el movimiento hacia el pasillo.\n\n').repeat(7),notes:'Nota de continuidad que se conserva.',elements:{props:['Llave','Handy'],cast:['700','22']},shots:Array.from({length:12},(_,j)=>({id:'s'+(i+1)+'sh'+j,type:'Plano medio',desc:'Acompañamos a los personajes por las escaleras. La cámara se detiene con 22 mientras 700 sale por la derecha del cuadro. Plano '+(j+1),durMin:5+j,thumbUrl:''}))}));
 seed.shootDays=[{id:'d1',date:'2026-11-05',label:'Día 1 · Fábrica',location:'Fábrica',callTime:'08:00',sceneIds:seed.scenes.map(s=>s.id),times:Object.fromEntries(seed.scenes.map((s,i)=>[s.id,i*15])),durations:Object.fromEntries(seed.scenes.map(s=>[s.id,15])),blocks:[],crewIds:[]}];
 await boot(seed);await page.locator('.navBtn[data-view="breakdown"]').click();
 await page.locator('#sceneTable tbody tr[data-scene-id="s1"] button').click();
 const initial=await page.evaluate(()=>structuredClone(savedState));
 async function wheel(locator,delta){const r=await locator.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.wheel(0,delta);await page.waitForTimeout(180);}
 async function visible(selector){return page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight+1;});}
 for(const [width,height] of [[1600,1000],[1280,720],[1024,768],[390,844],[390,667]]){
  await page.setViewportSize({width,height});if(width<=820)await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
  const list=page.locator('.bdSceneList'),right=page.locator('.bdEditorScroll');
  await list.evaluate(e=>e.scrollTop=0);await right.evaluate(e=>e.scrollTop=0);
  const search=await page.locator('.bdListControls').boundingBox(),identity=await page.locator('#sceneIdentity').boundingBox();
  await wheel(list,900);assert.ok(await list.evaluate(e=>e.scrollTop)>100,'List scrolls '+width);
  assert.deepEqual(await page.locator('.bdListControls').boundingBox(),search,'Search stays fixed');
  assert.deepEqual(await page.locator('#sceneIdentity').boundingBox(),identity,'Selection stays fixed');
  assert.equal(await right.evaluate(e=>e.scrollTop),0,'Left scroll independent');
  await list.evaluate(e=>e.scrollTop=e.scrollHeight);await page.locator('#sceneTable tbody tr[data-scene-id="s45"] button').click();
  assert.match(await page.locator('#sceneIdentity').textContent(),/45/);assert.ok(await visible('#sceneOverview'),'Selection is immediately visible '+width);
  const left=await list.evaluate(e=>e.scrollTop);await right.evaluate(e=>e.scrollTop=e.scrollHeight);
  assert.ok(await visible('.bdShotCard:last-child'),'Last shot reachable '+width);assert.equal(await list.evaluate(e=>e.scrollTop),left);
  assert.ok(await visible('#sceneIdentity'),'Scene identity pinned '+width);assert.equal(await page.locator('#view-breakdown').evaluate(e=>e.scrollTop),0);
  if(await page.locator('.bdShotCard:last-child').getAttribute('open')===null)await page.locator('.bdShotCard:last-child > summary').click();
  await right.evaluate(e=>e.scrollTop=e.scrollHeight);assert.ok(await visible('.bdShotCard:last-child .shotDelBtn'),'Shot controls reachable '+width);
  assert.ok(await page.locator('#view-breakdown').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'No horizontal workspace overflow');
  await right.evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(output,'overview-'+width+'-'+height+'.png')});
 }
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('#sceneSearch').fill('no matching scene');assert.match(await page.locator('#sceneTable').textContent(),/No hay escenas/);
 await page.locator('#sceneSearch').fill('');await page.locator('#sceneTable tbody tr[data-scene-id="s2"] button').click();
 assert.equal(await page.locator('#sceneNotesFold').getAttribute('open'),null);assert.equal(await page.locator('#sceneDataFold').getAttribute('open'),null);
 assert.ok((await page.locator('#scene_summary').boundingBox()).height>=250);
 await page.locator('#scene_summary').fill('Resumen editado y visible en el plan.');
 await page.locator('#sceneDataFold > summary').click();await page.locator('#scene_location').fill('Pasillo actualizado');
 assert.match(await page.locator('#sceneOverview').textContent(),/Pasillo actualizado/);
 await page.locator('#sceneNotesFold > summary').click();assert.equal(await page.locator('#scene_notes').inputValue(),'Nota de continuidad que se conserva.');
 await page.locator('#btnAddShot').click();const newShot=page.locator('.bdShotCard').last();
 assert.equal(await newShot.getAttribute('open'),'');await newShot.locator('.shotDescInput').fill('Descripción de plano nueva.');await newShot.locator('.bdShotDurationInput').fill('12');await newShot.locator('.bdShotDurationInput').press('Tab');
 assert.match(await newShot.locator('summary').first().textContent(),/12m/);
 await page.screenshot({path:path.join(output,'shot-edit.png')});
 await newShot.locator('.shotBatchFields > summary').click();await newShot.locator('.shotBatchSelect').selectOption('s3');assert.equal(await page.evaluate(()=>savedState.scenes[1].shots.at(-1).shootingSceneId),'s3');
 await newShot.locator('.shotDelBtn').click();assert.equal(await page.locator('.bdShotCard').count(),12);
 await page.locator('#btnOpenBDImport').click();assert.ok(await page.locator('#bdImportDialog').isVisible());await page.locator('#btnCloseBDImport').click();
 await page.locator('.navBtn[data-view="dayplan"]').click();await page.locator('#dpLane [data-kind="scene"][data-id="s2"]').click();
 assert.match(await page.locator('#dayplanInspector').textContent(),/Resumen editado y visible en el plan/);assert.match(await page.locator('#dayplanInspector .sceneOverview').textContent(),/Pasillo actualizado/);
 await page.screenshot({path:path.join(output,'planning-detail.png')});
 const timing=days=>days.map(d=>({id:d.id,callTime:d.callTime,sceneIds:d.sceneIds,times:d.times,durations:d.durations,blocks:d.blocks}));
 assert.deepEqual(timing(await page.evaluate(()=>savedState.shootDays)),timing(initial.shootDays),'Reading and scene edits preserve schedule');
 assert.deepEqual(await page.evaluate(()=>savedState.scenes[1].shots),initial.scenes[1].shots,'Existing shots retained');
 // A viewer can search and expand details without gaining write controls.
 if(studio){await page.evaluate(()=>{for(const key of Object.keys(RODA_STUDIO.project.rodaAccess.sections))RODA_STUDIO.project.rodaAccess.sections[key]='read';});
 await page.locator('.navBtn[data-view="breakdown"]').click();await page.locator('#sceneSearch').fill('45');await page.locator('#sceneTable tbody tr[data-scene-id="s45"] button').click();
 await page.locator('.bdShotCard').first().locator('summary').first().click();assert.ok(await page.locator('.bdShotCard').first().locator('.shotDescInput').isDisabled());assert.ok(await page.locator('#scene_summary').isDisabled());
 }
 assert.deepEqual(errors,[]);console.log('PASS independent scroll, pinned search and selection, responsive shot editing, shared planning detail, read-only permissions and unchanged schedule. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
