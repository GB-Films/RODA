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
  seed.scenes=Array.from({length:80},(_,i)=>({id:'s'+i,number:i+1,slugline:'INT. ESCENA '+(i+1)+' - DÍA',elements:{},shots:[{id:'p'+i,type:'Plano general',desc:'Plano de prueba',durMin:15}]}));
  seed.shootDays=[0,1].map((n)=>({id:'d'+(n+1),label:'Día '+(n+1),date:'2026-11-0'+(5+n),callTime:'08:00',sceneIds:seed.scenes.slice(n*40,n*40+40).map(s=>s.id),times:Object.fromEntries(seed.scenes.slice(n*40,n*40+40).map((s,i)=>[s.id,i*15])),durations:Object.fromEntries(seed.scenes.slice(n*40,n*40+40).map(s=>[s.id,15])),blocks:[]}));
  await boot(seed);await page.locator('.navBtn[data-view="dayplan"]').click();await page.locator('#dayplanView').selectOption('compact');
  const layout=()=>page.evaluate(()=>savedState.shootDays.map(d=>({id:d.id,sceneIds:[...d.sceneIds].sort(),times:d.times,durations:d.durations,blocks:d.blocks,shotTimeline:d.shotTimeline})));
  async function exercise(scrollSelector,rowSelector,{touch=false,heading=null,cancel=false,focusFirst=false}={}){
   const sc=page.locator(scrollSelector);await sc.evaluate(n=>n.scrollTop=0);await page.waitForTimeout(100);
   const before=await layout(),writes=await page.evaluate(()=>savedWrites);
   const first=page.locator(rowSelector).first();if(focusFirst){const a=await first.boundingBox(),b=await sc.boundingBox();await sc.evaluate((n,delta)=>n.scrollTop+=delta,a.y-b.y-90);}
   const initial=await sc.evaluate(n=>n.scrollTop),grip=first.locator('.planTouchGrip,.shotPlanGrip').first(),a=await (touch?grip:first).boundingBox(),r=await sc.boundingBox();
   const x=a.x+a.width/2,top=Math.max(r.y,0),bottom=Math.min(r.y+r.height,1000);
   let cdp;async function move(y){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});else await page.mouse.move(x,y,{steps:5});}
   if(touch){cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:a.y+a.height/2}]});}else{await page.mouse.move(x,a.y+a.height/2);await page.mouse.down();}
   await move(bottom-Math.min(60,(bottom-top)/4));await page.waitForFunction(([sel,at])=>document.querySelector(sel).scrollTop>at+60,[scrollSelector,initial]);
   // No new move events: holding at the edge must keep scrolling.
   const held=await sc.evaluate(n=>n.scrollTop);await page.waitForFunction(([sel,at])=>document.querySelector(sel).scrollTop>at+60,[scrollSelector,held]);
   await move(top+(bottom-top)/2);await page.waitForTimeout(80);const stopped=await sc.evaluate(n=>n.scrollTop);await page.waitForTimeout(150);assert.equal(await sc.evaluate(n=>n.scrollTop),stopped);
   await move(bottom-4);await page.waitForFunction(([sel,at])=>document.querySelector(sel).scrollTop>at+400,[scrollSelector,stopped]);
   const lower=await sc.evaluate(n=>n.scrollTop),head=heading?await page.locator(heading).first().boundingBox():null;
   await move((head?Math.max(top,head.y+head.height):top)+Math.min(55,(bottom-top)/4));await page.waitForFunction(([sel,at])=>document.querySelector(sel).scrollTop<at-60,[scrollSelector,lower]);
   if(cancel){await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await layout(),before);}
   else{
    // Drop onto a card revealed by scrolling. Save only once, on release.
    await move(top+(bottom-top)/2);const targets=await page.locator(rowSelector).evaluateAll((ns,b)=>ns.filter(n=>{const r=n.getBoundingClientRect();return r.top+r.height/2>b.top+12&&r.top+r.height/2<b.bottom-12}).map(n=>{const r=n.getBoundingClientRect();return {key:n.dataset.key,y:r.top+r.height/2};}),{top:head?Math.max(top,head.y+head.height):top,bottom});assert.ok(targets.length);targets.sort((a,b)=>Math.abs(a.y-(top+bottom)/2)-Math.abs(b.y-(top+bottom)/2));
    await move(targets[0].y);assert.equal(await page.evaluate(()=>savedWrites),writes);
    if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await page.mouse.up();
    await page.waitForFunction(n=>savedWrites>n,writes);assert.equal(await page.evaluate(()=>savedWrites),writes+1);
    assert.notDeepEqual(await layout(),before);
    await page.keyboard.press('Control+z');assert.deepEqual(await layout(),before);
   }
   await page.keyboard.press('Escape');await page.waitForTimeout(80);const end=await sc.evaluate(n=>n.scrollTop);await page.waitForTimeout(120);assert.equal(await sc.evaluate(n=>n.scrollTop),end);
   assert.equal(await page.locator('.planning-moving,.planning-swap-target,.planning-insert-before,.planning-insert-after').count(),0);
  }
  await exercise('#dpScroller','#dpLane .dpBlock');
  await exercise('#dpScroller','#dpLane .dpBlock',{cancel:true});
  await page.locator('#dayplanView').selectOption('timeline');await exercise('#dpScroller','#dpLane .dpBlock',{focusFirst:true});await page.locator('#dayplanView').selectOption('compact');
  await page.locator('.navBtn[data-view="schedule"]').click();await page.locator('#dayNavigation summary').click();await page.locator('#dayNavigation [data-day="all"]').click();
  await exercise('#schedWrap','#schedBoard .schedDay:first-child .schedBlock',{heading:'#schedBoard .schedHead'});
  await page.locator('#schedView').selectOption('timeline');await exercise('#schedWrap','#schedBoard .schedDay:first-child .schedBlock',{heading:'#schedBoard .schedHead',focusFirst:true});
  await page.locator('.navBtn[data-view="dayplan"]').click();await page.locator('#dayplanCard [aria-label="Organizar plan por"]').selectOption('shots');
  await exercise('#shotPlanDay','#shotPlanDay .shotPlanRow');
  await page.locator('.navBtn[data-view="schedule"]').click();
  await exercise('#shotPlanDay-d1','#shotPlanDay-d1 .shotPlanRow');
  await page.locator('.navBtn[data-view="dayplan"]').click();
  for(const width of [820,390]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);await exercise('#shotPlanDay','#shotPlanDay .shotPlanRow',{touch:true});}
  assert.deepEqual(errors,[]);console.log('Edge scrolling up/down, stationary pointer, center stop, speed increase, sticky headings, nested shot lists, mouse/touch, drop+undo and cancel passed. '+output);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
