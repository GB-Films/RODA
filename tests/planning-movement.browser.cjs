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
  for(const f of ['dialogs','roda-policy','roda-access','cast','call-sheet','script-pages','script-document','screenplay','script-revisions','script-history','utils','day-swap','production-blocks','form-autosave','day-navigation','responsive','planning-history','shot-planning','shot-planning-view','planning-movement','planning-movement-view','app'].filter(f=>fs.existsSync(path.join(appRoot,'js',f+'.js'))))await page.addScriptTag({url:'js/'+f+'.js'});
  await page.waitForFunction(isStudio=>isStudio?!!window.RODA_READY:!document.body.classList.contains('bootLoading'),studio);await page.evaluate(()=>{document.querySelector('.shell').hidden=false;window.RodaAccess?.bind();});
  }
  seed.shootDays[0].sceneIds=['s1','s2','s4'];seed.shootDays[0].times={s1:0,s2:60,s4:90};seed.shootDays[0].durations={s1:30,s2:30,s4:45};seed.shootDays[0].blocks=[{id:'meal',title:'Almuerzo',startMin:30,durMin:30}];
  await boot(seed);await page.locator('.navBtn[data-view="dayplan"]').click();
  const unit=page.locator('#dayplanCard [aria-label="Organizar plan por"]');assert.equal(await unit.isVisible(),true);
  const baseline=await page.evaluate(()=>structuredClone(savedState.shootDays));
  async function drag(from,to,fraction=.2,shift=false){await page.locator(from).scrollIntoViewIfNeeded();await page.locator(to).scrollIntoViewIfNeeded();const a=await page.locator(from).boundingBox(),b=await page.locator(to).boundingBox();assert(a&&b);await page.mouse.move(a.x+Math.min(90,a.width/2),a.y+a.height/2);await page.mouse.down();if(shift)await page.keyboard.down('Shift');await page.mouse.move(b.x+Math.min(100,b.width/2),b.y+b.height*fraction,{steps:12});await page.mouse.up();if(shift)await page.keyboard.up('Shift');await page.waitForTimeout(150);}
  await drag('#dpLane [data-key="scene:s4"]','#dpLane [data-key="scene:s2"]');
  assert.deepEqual(await page.evaluate(()=>savedState.shootDays[0].times),{s1:0,s4:60,s2:105});
  await page.locator('#btnDayplanUndo').click();assert.deepEqual(await page.evaluate(()=>savedState.shootDays.map(d=>({times:d.times,durations:d.durations,blocks:d.blocks.map(b=>[b.id,b.startMin,b.durMin])}))),baseline.map(d=>({times:d.times,durations:d.durations,blocks:d.blocks.map(b=>[b.id,b.startMin,b.durMin])})));
  await page.locator('#dpScroller').evaluate(n=>n.scrollTop=Math.max(0,n.scrollTop-120));
  await drag('#dpLane [data-key="scene:s4"]','#dpLane [data-key="scene:s1"]',.2,true);
  assert.deepEqual(await page.evaluate(()=>savedState.shootDays[0].times),{s4:0,s2:75,s1:105});
  await page.locator('#btnDayplanUndo').click();
  await page.locator('#dayplanHead .planningSelectAll').click();assert.equal(await page.locator('#dpLane .planningCheck:checked').count(),4);
  await page.locator('#dayplanHead [data-shift="-1"]').click();assert.deepEqual(await page.evaluate(()=>savedState.shootDays[0].times),{s1:-15,s2:45,s4:75});assert.equal(await page.evaluate(()=>savedState.shootDays[0].blocks[0].startMin),15);
  await page.locator('#btnDayplanUndo').click();await page.locator('#dayplanHead .planningClear').click();
  // Real group drag includes a production block and a scene.
  await page.locator('#dpLane [data-key="scene:s1"] .planningCheck').click();await page.locator('#dpLane [data-key="block:meal"] .planningCheck').click();
  await drag('#dpLane [data-key="scene:s1"]','#dpLane [data-key="scene:s4"]',.85);
  assert.deepEqual(await page.evaluate(()=>savedState.shootDays[0].times),{s2:0,s4:30,s1:75});assert.equal(await page.evaluate(()=>savedState.shootDays[0].blocks[0].startMin),105);
  await page.locator('#btnDayplanUndo').click();await page.locator('#dayplanHead .planningClear').click();
  await page.locator('#dayplanView').selectOption('compact');
  await drag('#dpLane [data-key="block:meal"]','#dpLane [data-key="scene:s4"]',.85);
  assert.equal(await page.evaluate(()=>savedState.shootDays[0].blocks[0].startMin),105);await page.locator('#btnDayplanUndo').click();
  await page.locator('.navBtn[data-view="schedule"]').click();await page.locator('#dayNavigation summary').click();await page.locator('#dayNavigation [data-day="all"]').click();
  await drag('#schedBoard [data-day-id="d1"][data-item-id="s4"]','#schedBoard [data-day-id="d2"][data-item-id="s3"]');
  assert.equal(await page.evaluate(()=>savedState.shootDays[1].times.s4),0);assert.equal(await page.evaluate(()=>savedState.shootDays[1].times.s3),45);
  await page.locator('#btnSchedUndo').click();
  await drag('#schedBoard [data-day-id="d1"][data-item-id="s4"]','#schedBoard [data-day-id="d2"][data-item-id="s3"]',.2,true);
  assert.equal(await page.evaluate(()=>savedState.shootDays[1].times.s4),0);assert.equal(await page.evaluate(()=>savedState.shootDays[0].times.s3),90);assert.equal(await page.evaluate(()=>savedState.shootDays[0].durations.s3),30);assert.equal(await page.evaluate(()=>savedState.shootDays[1].durations.s4),45);await page.locator('#btnSchedUndo').click();
  const day1=page.locator('.schedDay').filter({has:page.locator('[data-day-id="d1"]')});await day1.locator('.planningSelectAll').click();await day1.locator('[data-shift="1"]').click();assert.equal(await page.evaluate(()=>savedState.shootDays[0].times.s1),15);await page.locator('#btnSchedUndo').click();
  await page.locator('.navBtn[data-view="dayplan"]').click();await page.locator('#dayplanHead .planningClear').click();await unit.selectOption('shots');
  assert.equal(await page.locator('#shotPlanDay .shotPlanRow.shot').count(),2);
  await drag('#shotPlanDay [data-key="s1|a"]','#shotPlanDay [data-key="scene:s2"]');assert.equal(await page.evaluate(()=>savedState.shootDays[0].shotTimeline['s1|a'].start),45);
  await page.locator('#btnDayplanUndo').click();await page.locator('#btnDayplanRedo').click();
  await page.locator('.navBtn[data-view="schedule"]').click();assert.equal(await page.locator('#scheduleCard [aria-label="Organizar plan por"]').inputValue(),'shots');
  assert.ok(await page.locator('.shotPlanDayColumn').count()>=2);
  await page.locator('.navBtn[data-view="dayplan"]').click();await unit.selectOption('scenes');
  assert.equal(await page.locator('#shotPlanDay .shotPlanRow .planningCheck').count(),5);
  await page.locator('#dayplanHead .planningSelectAll').click();await page.locator('#dayplanHead [data-shift="1"]').click();assert.equal(await page.evaluate(()=>savedState.shootDays[0].shotTimeline['s1|b'].start),15);
  for(const width of [820,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(250);assert.equal(await unit.isVisible(),true);const fit=await page.locator('#shotPlanDay').evaluate(n=>({w:n.clientWidth,s:n.scrollWidth,h:n.clientHeight}));assert.ok(fit.s<=fit.w+2,JSON.stringify(fit));assert.ok(fit.h>=(studio?180:160),JSON.stringify(fit));await page.screenshot({path:path.join(output,'movement-'+width+'.png')});}
  await page.setViewportSize({width:1600,height:1000});
  async function cancelDrag(reason){
   const source=page.locator('#shotPlanDay .shotPlanRow').first(),target=page.locator('#shotPlanDay .shotPlanRow').last();await source.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();const a=await source.boundingBox(),b=await target.boundingBox(),before=await page.evaluate(()=>JSON.stringify(savedState)),writes=await page.evaluate(()=>savedWrites);
   await page.mouse.move(a.x+90,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+90,b.y+10,{steps:8});assert.equal(await page.locator('.planningDragGhost').count(),1);
   if(reason==='escape')await page.keyboard.press('Escape');else if(reason==='pointercancel')await source.dispatchEvent('pointercancel',{pointerId:1});else await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:RodaPolicy.all('read')};RodaAccess.apply();});
   await page.mouse.up();assert.equal(await page.evaluate(()=>JSON.stringify(savedState)),before);assert.equal(await page.evaluate(()=>savedWrites),writes);assert.equal(await page.locator('.planningDragGhost').count(),0);
  }
  await cancelDrag('escape');await cancelDrag('pointercancel');if(studio)await cancelDrag('permission');
  assert.deepEqual(errors,[]);console.log('Planning movement browser passed; '+output);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
