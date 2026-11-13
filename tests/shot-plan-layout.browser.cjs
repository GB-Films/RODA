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
  const page=await browser.newPage({viewport:{width:1600,height:1000},hasTouch:true}),errors=[];
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

  seed.scenes[0].shots=[{id:'a',type:'Plano general',desc:'Llegada',durMin:20},{id:'b',type:'Primer plano',desc:'Reacción',durMin:40}];
  seed.shootDays[0].durations.s1=60;seed.shootDays[0].times.s2=105;seed.shootDays[0].blocks=[{id:'lunch',title:'Almuerzo',startMin:60,durMin:45,color:'#22c55e'}];
  seed.scenes[3].shots=[{id:'pending',type:'Plano general',desc:'Pendiente',durMin:15}];
  await boot(seed);await page.locator('.navBtn[data-view="dayplan"]').click();
  await page.locator('#dayplanZoom').selectOption('96');
  const layout=()=>page.evaluate(()=>savedState.shootDays.map(d=>({id:d.id,sceneIds:[...d.sceneIds].sort(),times:d.times,durations:d.durations,blocks:d.blocks.map(b=>({id:b.id,color:b.color,start:b.startMin,dur:b.durMin})),shotTimeline:d.shotTimeline})));
  const baseline=await layout();
  const sceneHeight=await page.locator('#dpLane [data-key="scene:s1"]').evaluate(n=>n.getBoundingClientRect().height);
  const unit=page.locator('#dayplanCard [aria-label="Organizar plan por"]');await unit.selectOption('shots');await page.waitForTimeout(150);
  for(const id of ['dayplanSnap','dayplanZoom','dayplanView','btnAddShootDay','btnDayplanPrint'])assert.ok(await page.locator('#'+id).isVisible(),id);
  assert.equal(await page.locator('#dayplanView').inputValue(),'timeline');
  assert.ok(await page.locator('#dayplanHead .shotPlanAdd').isVisible());
  const metrics=await page.locator('#shotPlanDay').evaluate(n=>({height:[...n.querySelectorAll('.shotPlanRow.shot')].reduce((sum,r)=>sum+r.getBoundingClientRect().height,0),line:n.querySelectorAll('.shotPlanGridLine').length,scroll:n.scrollTop}));
  assert.equal(metrics.height,sceneHeight);assert.ok(metrics.line>=48);assert.ok(metrics.scroll>0);
  assert.equal(await page.locator('#shotPlanDay .block').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(34, 197, 94)');
  assert.deepEqual(await layout(),baseline);
  await page.screenshot({path:path.join(output,'daily-timeline.png')});
  async function drag(a,b,f=.5){const x=await page.locator(a).boundingBox(),y=await page.locator(b).boundingBox();await page.mouse.move(x.x+x.width/2,x.y+x.height/2);await page.mouse.down();await page.mouse.move(y.x+y.width*.4,y.y+y.height*f,{steps:8});await page.mouse.up();}
  await page.locator('#shotPlanDay').evaluate(n=>n.scrollTop-=160);
  await drag('#shotPlanDay [data-key="s1|a"]','#shotPlanDay [data-key="s1|b"]');
  await page.waitForFunction(()=>!!savedState.shootDays[0].shotTimeline);
  assert.equal(await page.evaluate(()=>savedState.shootDays[0].shotTimeline['s1|b'].start),0);
  assert.equal(await page.evaluate(()=>savedState.shootDays[0].shotTimeline['s1|a'].dur),20);
  await page.locator('#btnDayplanUndo').click();assert.deepEqual(await layout(),baseline);
  await page.locator('#shotPlanDay [data-key="s1|a"] .shotPlanSelect').click();await page.waitForTimeout(100);
  const detail=await page.locator('#shotPlanDay .shotPlanDetail').boundingBox(),row=await page.locator('#shotPlanDay .shotPlanRow').first().boundingBox();assert.ok(detail.x>=row.x+row.width,JSON.stringify({detail,row}));
  await page.screenshot({path:path.join(output,'daily-detail.png')});await page.locator('#shotPlanDay .shotPlanClose').click();
  await page.locator('#dayplanView').selectOption('compact');await page.waitForTimeout(100);assert.equal(await page.locator('#shotPlanDay .shotPlanGridLine').count(),0);
  await page.screenshot({path:path.join(output,'daily-compact.png')});
  await page.locator('#dayplanView').selectOption('timeline');
  await page.locator('.navBtn[data-view="schedule"]').click();await page.locator('#dayNavigation summary').click();await page.locator('#dayNavigation [data-day="all"]').click();
  await page.waitForTimeout(100);assert.equal(await page.locator('.shotPlanDayColumn').count(),3);
  for(const id of ['schedSnap','schedZoom','schedView'])assert.ok(await page.locator('#'+id).isVisible());
  assert.ok(await page.locator('#shotPlanDay-d1 .shotPlanGridLine').count()>=48);
  assert.ok(await page.locator('#shotPlanDay-d3 .shotPlanGridLine').count()>=48);
  const heads=await page.locator('.shotPlanDayHeading').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().top));assert.ok(Math.max(...heads)-Math.min(...heads)<2);
  await page.screenshot({path:path.join(output,'general-timeline.png')});
  await page.locator('#schedWrap').evaluate(n=>n.scrollTop+=200);assert.ok(await page.locator('.shotPlanDayHeading').first().evaluate(n=>n.getBoundingClientRect().top>150));
  await page.locator('#schedView').selectOption('compact');await page.waitForTimeout(100);await page.screenshot({path:path.join(output,'general-compact.png')});
  await page.locator('.navBtn[data-view="dayplan"]').click();await page.locator('#dayplanView').selectOption('timeline');
  for(const width of [820,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(150);const box=await page.locator('#shotPlanDay').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth,height:n.clientHeight}));assert.ok(box.scroll<=box.width+2,JSON.stringify(box));assert.ok(box.height>140);await page.screenshot({path:path.join(output,'daily-'+width+'.png')});}
  assert.deepEqual(await layout(),baseline);assert.deepEqual(errors,[]);console.log('Shot/scene presentation parity passed. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
