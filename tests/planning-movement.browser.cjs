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
  seed.shootDays[0].sceneIds=['s1','s2','s4'];seed.shootDays[0].times={s1:0,s2:60,s4:90};seed.shootDays[0].durations={s1:30,s2:30,s4:45};seed.shootDays[0].blocks=[{id:'meal',title:'Almuerzo',startMin:30,durMin:30}];
  await boot(seed);await page.locator('.navBtn[data-view="dayplan"]').click();
  const unit=page.locator('#dayplanCard [aria-label="Organizar plan por"]');assert.equal(await unit.isVisible(),true);
  async function drag(from,to,after=false,touch=false){const a=await page.locator(from).boundingBox(),b=await page.locator(to).boundingBox(),x=a.x+a.width/2,y=a.y+a.height/2,tx=b.x+b.width/2,ty=after==='swap'?b.y+b.height/2:after?b.y+b.height-3:b.y+3;if(touch){const grip=await page.locator(from+' .planTouchGrip').boundingBox(),cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:grip.x+grip.width/2,y}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:grip.x+grip.width/2+(tx-grip.x-grip.width/2)*i/8,y:y+(ty-y)*i/8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(tx,ty,{steps:8});assert.equal(await page.locator('.planningDragGhost,.planningDragMode').count(),0);assert.equal(await page.locator(after==='swap'?'.planning-swap-target':after?'.planning-insert-after':'.planning-insert-before').count(),1);await page.screenshot({path:path.join(output,after==='swap'?'swap-preview.png':'insert-preview.png')});await page.mouse.up();}await page.waitForTimeout(100);}
  async function box(first,last,gutter){const a=await page.locator(first).boundingBox(),b=await page.locator(last).boundingBox();await page.mouse.move(a.x-gutter,a.y+2);await page.mouse.down();await page.mouse.move(a.x+60,b.y+b.height-2,{steps:8});await page.mouse.up();}
  assert.equal(await page.locator('.planningCheck,.planningSelectionBar,.planningDragMode,.daySwapHint').count(),0);
  await page.locator('#dpScroller').evaluate(n=>n.scrollTop=Math.max(0,n.scrollTop-100));
  await box('#dpLane [data-key="scene:s1"]','#dpLane [data-key="block:meal"]',20);
  assert.equal(await page.locator('#dpLane .movement-selected').count(),2);
  await page.keyboard.down('Shift');await drag('#dpLane [data-key="scene:s1"]','#dpLane [data-key="scene:s4"]',true);await page.keyboard.up('Shift');
  assert.deepEqual(await page.evaluate(()=>savedState.shootDays[0].times),{s2:0,s4:30,s1:75});assert.equal(await page.evaluate(()=>savedState.shootDays[0].blocks[0].startMin),105);
  await page.keyboard.press('Control+z');await page.keyboard.press('Escape');
  await page.locator('#dayplanView').selectOption('compact');
  await page.locator('.navBtn[data-view="schedule"]').click();await page.locator('#dayNavigation summary').click();await page.locator('#dayNavigation [data-day="all"]').click();
  await box('#schedBoard [data-item-id="s1"]','#schedBoard [data-item-id="meal"]',15);assert.equal(await page.locator('#schedBoard .movement-selected').count(),2);
  await drag('#schedBoard [data-item-id="s1"]','#schedBoard [data-item-id="s3"]');assert.equal(await page.evaluate(()=>savedState.shootDays[1].times.s3),60);await page.locator('#btnSchedUndo').click();await page.keyboard.press('Escape');
  await drag('#schedBoard [data-item-id="s4"]','#schedBoard [data-item-id="s3"]','swap');
  assert.equal(await page.evaluate(()=>savedState.shootDays[1].durations.s4),45);assert.equal(await page.evaluate(()=>savedState.shootDays[0].times.s3),90);
  await page.locator('#btnSchedUndo').click();await page.keyboard.press('Escape');
  await page.locator('.navBtn[data-view="dayplan"]').click();
  for(const width of [820,390]){
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(150);
   const before=await page.evaluate(()=>structuredClone(savedState.shootDays[0]));
   await drag('#dpLane [data-key="block:meal"]','#dpLane [data-key="scene:s4"]','swap',true);
   assert.equal(await page.evaluate(()=>savedState.shootDays[0].blocks[0].startMin),105);assert.equal(await page.evaluate(()=>savedState.shootDays[0].times.s4),30);assert.equal(await page.evaluate(()=>savedState.shootDays[0].durations.s4),45);
   await page.keyboard.press('Control+z');await page.keyboard.press('Escape');
   await drag('#dpLane [data-key="block:meal"]','#dpLane [data-key="scene:s4"]',false,true);
   assert.equal(await page.evaluate(()=>savedState.shootDays[0].blocks[0].startMin),60);assert.equal(await page.evaluate(()=>savedState.shootDays[0].times.s4),90);await page.keyboard.press('Control+z');await page.keyboard.press('Escape');
   const fit=await page.locator('#dayplanHead').evaluate(n=>n.scrollWidth<=n.clientWidth+2);assert.ok(fit);await page.screenshot({path:path.join(output,'marquee-'+width+'.png')});
  }
  await page.setViewportSize({width:1600,height:1000});await page.waitForTimeout(100);
  await unit.selectOption('shots');await page.keyboard.press('Escape');
  const beforeBox=await page.evaluate(()=>JSON.stringify(savedState.shootDays));
  await box('#shotPlanDay [data-key="s1|a"]','#shotPlanDay [data-key="s1|b"]',12);
  assert.equal(await page.locator('#shotPlanDay .movement-selected').count(),2);
  assert.equal(await page.evaluate(()=>JSON.stringify(savedState.shootDays)),beforeBox);
  await drag('#shotPlanDay [data-key="s1|a"]','#shotPlanDay [data-key="block:meal"]',true);
  assert.equal(await page.evaluate(()=>savedState.shootDays[0].shotTimeline['s1|a'].start),30);
  assert.equal(await page.evaluate(()=>savedState.shootDays[0].shotTimeline['s1|b'].dur),15);
  await page.keyboard.press('Control+z');await page.keyboard.press('Escape');
  const r=await page.locator('#shotPlanDay [data-key="s1|a"]').boundingBox();
  await page.mouse.move(r.x-12,r.y+2);await page.mouse.down();await page.mouse.move(r.x+80,r.y+r.height-2,{steps:6});assert.equal(await page.locator('.planningMarquee').count(),1);
  await page.screenshot({path:path.join(output,'marquee-desktop.png')});await page.keyboard.press('Escape');await page.mouse.up();
  assert.equal(await page.locator('#shotPlanDay .movement-selected').count(),0);assert.equal(await page.locator('.planningMarquee').count(),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(savedState.shootDays)),beforeBox);
  assert.deepEqual(errors,[]);console.log('Marquee selection, group movement, cross-day insertion, position-based touch insert/swap for scenes and blocks, undo and responsive controls passed. '+output);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
