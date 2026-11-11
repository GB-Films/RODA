const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),studio=fs.existsSync(path.join(root,'roda/index.html')),appRoot=studio?path.join(root,'roda'):root;
const output=process.env.RODA_PLANNING_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'roda-print-'));
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
  page.setDefaultTimeout(10000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await page.route('https://**/*',r=>r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/roda/');
  const seed={meta:{version:14,title:'PRUEBA SHOTLIST',updatedAt:new Date().toISOString()},project:{},scenes:[
   {id:'s1',number:1,slugline:'EXT. FÁBRICA - DÍA',summary:'Llegada del equipo.',elements:{props:['LLAVE']},shots:[{id:'a',type:'Plano general',desc:'Llegada de prueba',durMin:30},{id:'b',type:'Primer plano',desc:'Reacción de prueba',durMin:30}]},
   {id:'s2',number:2,slugline:'INT. FÁBRICA - DÍA',elements:{props:['LLAVE']},shots:[]},
   {id:'s3',number:3,slugline:'INT. HOTEL - DÍA',elements:{props:['LIBRO']},shots:[{id:'c',type:'Plano medio',desc:'Encuentro en hotel',durMin:20}]},
   {id:'s4',number:4,slugline:'EXT. CALLE - DÍA',elements:{props:['MAPA']},shots:[]}],
   crew:[{id:'p0',area:'Produccion',role:'Producción',name:'Ada Prueba'},{id:'p1',area:'Sonido',role:'Sonido',name:'Bruno Ejemplo'}],
   shootDays:[{id:'d1',date:'2026-11-05',label:'Día 1 · Fábrica',location:'Fábrica',callTime:'08:00',sceneIds:['s2','s1'],crewIds:['p0'],times:{s1:0,s2:15},durations:{s1:15,s2:45},blocks:[]},
    {id:'d2',date:'2026-11-06',label:'Día 2 · Hotel',location:'Hotel',callTime:'10:00',sceneIds:['s3'],crewIds:['p1'],times:{s3:0},durations:{s3:30},blocks:[]},
    {id:'d3',date:'',label:'Día 3 · Calle',location:'Calle',callTime:'08:00',sceneIds:[],times:{},durations:{},blocks:[]}]};
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
  for(const f of ['dialogs','roda-policy','roda-access','cast','script-pages','script-document','screenplay','script-revisions','script-history','utils','day-swap','production-blocks','form-autosave','day-navigation','responsive','planning-history','shot-planning','shot-planning-view','app'].filter(f=>fs.existsSync(path.join(appRoot,'js',f+'.js'))))await page.addScriptTag({url:'js/'+f+'.js'});
  await page.waitForFunction(isStudio=>isStudio?!!window.RODA_READY:!document.body.classList.contains('bootLoading'),studio);await page.evaluate(()=>{document.querySelector('.shell').hidden=false;window.RodaAccess?.bind();});
  }


  seed.scenes[0].shots=[{id:'a',type:'Plano general',desc:'Llegada',durMin:10},{id:'b',type:'Primer plano',desc:'Reacción',durMin:20},{id:'c',type:'Plano detalle',desc:'Llave',durMin:30}];
  seed.shootDays[0].durations.s1=60;seed.shootDays[0].times.s2=105;seed.shootDays[0].blocks=[{id:'lunch',title:'Almuerzo',startMin:60,durMin:45,color:'#f97316'}];
  for(const scene of seed.scenes)for(const shot of scene.shots)shot.thumbUrl="";
  await boot(seed);
  await page.locator('.navBtn[data-view="dayplan"]').click();
  const unit=page.locator('#dayplanCard [aria-label="Organizar plan por"]');
  assert.equal(await unit.inputValue(),'scenes');
  const baseline=await page.evaluate(()=>structuredClone(savedState));
  await unit.selectOption('shots');
  assert.equal(await page.locator('#shotPlanDay .shotPlanRow.shot').count(),3);
  assert.deepEqual(await page.evaluate(()=>savedState.shootDays),baseline.shootDays);
  const clock=()=>page.locator('#shotPlanDay .shotPlanRow.shot .shotPlanClock').allTextContents();
  assert.ok((await clock())[0].includes('08:00–08:10'));
  const grip=page.locator('#shotPlanDay [data-key="s1|c"] .shotPlanGrip');await grip.press('ArrowUp');
  assert.deepEqual(await page.evaluate(()=>savedState.shootDays[0].shotPlanning.s1.order),['s1|a','s1|c','s1|b']);
  await page.locator('#shotPlanDay [data-key="s1|a"] .shotPlanSelect').click();
  const input=page.locator('#shotPlanDay [aria-label="Duración del plano"]');await input.fill('25');await input.press('Tab');
  await page.waitForFunction(()=>savedState.shootDays[0].durations.s1===75);
  assert.equal(await page.evaluate(()=>savedState.shootDays[0].times.s2),120);
  assert.equal(await page.evaluate(()=>savedState.shootDays[0].blocks[0].startMin),75);
  assert.deepEqual(await page.evaluate(()=>savedState.scenes.map(s=>s.shots)),baseline.scenes.map(s=>s.shots));
  const changed=await page.evaluate(()=>structuredClone(savedState.shootDays));
  await page.locator('#btnDayplanUndo').click();assert.equal(await page.evaluate(()=>savedState.shootDays[0].durations.s1),60);
  await page.locator('#btnDayplanRedo').click();assert.deepEqual(await page.evaluate(()=>savedState.shootDays),changed);
  await page.locator('#btnDayplanPrint').click();await page.waitForFunction(()=>!!window.printSnapshot);
  const printed=await page.evaluate(()=>new DOMParser().parseFromString(printSnapshot,'text/html').querySelector('#gbPrintRoot').textContent);
  assert.ok(printed.includes('Plano 3'));assert.ok(printed.indexOf('Plano 3')<printed.indexOf('Plano 2'));
  await page.screenshot({path:path.join(output,'planos-desktop.png')});
  await page.locator('.navBtn[data-view="shotlist"]').click();
  const scene=page.locator('.shotSceneBox[data-scene-id="s1"]');await scene.locator('.shotSceneToggle').click();
  assert.deepEqual(await scene.locator('tbody tr[data-shot-id]').evaluateAll(ns=>ns.map(n=>n.dataset.shotId)),['a','c','b']);
  assert.deepEqual((await scene.locator('.shotTime').allTextContents()).slice(1),['08:00','08:25','08:55']);
  await page.locator('.navBtn[data-view="schedule"]').click();
  assert.ok(await page.locator('.shotPlanDayColumn').count()>0);
  await page.screenshot({path:path.join(output,'planos-general.png')});
  await page.locator('.navBtn[data-view="dayplan"]').click();
  await page.locator('#shotPlanDay .shotPlanClose').click();
  for(const width of [820,390]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(400);
    await page.screenshot({path:path.join(output,'planos-'+width+'.png')});
    const fit=await page.locator('#shotPlanDay').evaluate(n=>({w:n.clientWidth,scroll:n.scrollWidth,h:n.clientHeight,b:n.getBoundingClientRect().bottom}));
    assert.ok(fit.h>=140,JSON.stringify(fit));assert.ok(fit.scroll<=fit.w+2,JSON.stringify(fit));assert.ok(fit.b<=920,JSON.stringify(fit));
  }
  await page.setViewportSize({width:1600,height:1000});
  await unit.selectOption('scenes');assert.equal(await page.locator('#shotPlanDay').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>savedState.scenes.map(s=>s.shots)),baseline.scenes.map(s=>s.shots));
  const persisted=await page.evaluate(()=>structuredClone(savedState));await page.reload();await boot(persisted);
  await page.locator('.navBtn[data-view="dayplan"]').click();await page.locator('#dayplanCard [aria-label="Organizar plan por"]').selectOption('shots');
  assert.deepEqual(await page.locator('#shotPlanDay .shotPlanRow.shot').evaluateAll(ns=>ns.map(n=>n.dataset.key)),['s1|a','s1|c','s1|b']);
  // A real pointer drag conserves duration, IDs, schedule end and non-shot data.
  const from=await page.locator('#shotPlanDay [data-key="s1|a"] .shotPlanGrip').boundingBox(),to=await page.locator('#shotPlanDay [data-key="s1|c"]').boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+60,to.y+to.height/2,{steps:8});await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>savedState.shootDays[0].shotPlanning.s1.order),['s1|c','s1|a','s1|b']);
  assert.deepEqual(await page.evaluate(()=>savedState.shootDays[0].times),persisted.shootDays[0].times);
  if(studio){
    await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:{planning:'read',shotlist:'read'}};RodaAccess.apply();});
    const handle=page.locator('#shotPlanDay .shotPlanGrip').first();assert.equal(await handle.isEnabled(),false);
    const writes=await page.evaluate(()=>savedWrites);await handle.dispatchEvent('keydown',{key:'ArrowDown'});assert.equal(await page.evaluate(()=>savedWrites),writes);
    await page.locator('#shotPlanDay .shotPlanSelect').first().click();assert.equal(await page.locator('#shotPlanDay [aria-label="Duración del plano"]').isEnabled(),false);
  }
  assert.deepEqual(errors,[]);
  console.log('Shot planning UI passed; screenshots: '+output);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
