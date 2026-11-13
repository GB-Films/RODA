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
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain');
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

  seed.shootDays[0].sceneIds=['s1','s2'];seed.shootDays[0].times={s1:0,s2:120};seed.shootDays[0].durations={s1:60,s2:30};seed.shootDays[0].blocks=[{id:'meal',title:'Almuerzo',startMin:60,durMin:30}];
  await boot(seed);await page.locator('.navBtn[data-view="dayplan"]').click();
  if(studio){
    await page.addScriptTag({type:'module',content:"import {applyStudioDesign} from '/assets/studio-theme.mjs';applyStudioDesign({design:{font:'Poppins',mode:'dark',style:'modern'}});window.themeReady=true;"});
    await page.waitForFunction(()=>window.themeReady);await page.waitForTimeout(200);
    const nav=page.locator('.navBtn[data-view="shooting"]');
    assert.equal(await nav.evaluate(n=>getComputedStyle(n).borderTopColor),'rgba(0, 0, 0, 0)');
    assert.equal(await nav.locator('.navIco').evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');
    await nav.hover();assert.notEqual(await nav.evaluate(n=>getComputedStyle(n).borderTopColor),'rgba(0, 0, 0, 0)');
    await page.evaluate(()=>{const n=document.createElement('span');n.id='studio-project-settings-actions';n.innerHTML='<button data-project-invite>Colaborador</button><button data-project-settings>Proyecto</button>';document.querySelector('header').append(n);});
    assert.equal(await page.locator('[data-project-invite]').isVisible(),false);assert.equal(await page.locator('[data-project-settings]').isVisible(),true);
    assert.ok(!fs.readFileSync(path.join(appRoot,'js/studio-entry.js'),'utf8').includes('mountProductionLinks'));
  }
  async function gap(scroller,selector,shift=45,touch=false){
    await page.keyboard.press('Escape');await page.waitForTimeout(200);
    const sc=page.locator(scroller),row=page.locator(selector).first();
    const old=await row.boundingBox(),box=await sc.boundingBox();await sc.evaluate((n,dy)=>n.scrollTop+=dy,old.y-box.y-Math.min(280,box.height-42));await page.waitForTimeout(60);
    const a=await row.boundingBox(),dur=await row.getAttribute('data-key'),block=dur==='block:meal',ppm=a.height/(block||dur?.includes('|')?30:60),expected=(block?60:0)-shift;
    const before=await page.evaluate(()=>JSON.stringify(savedState.shootDays.map(d=>({id:d.id,sceneIds:d.sceneIds,times:d.times,durations:d.durations,blocks:d.blocks.map(b=>({id:b.id,start:b.startMin,dur:b.durMin})),shotTimeline:d.shotTimeline})))),writes=await page.evaluate(()=>savedWrites);
    const x=a.x+a.width/2,y=a.y+8,ty=y-shift*ppm;
    let cdp;if(touch){cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width-12,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+a.width-12,y:ty}]});}
    else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,ty,{steps:6});}
    const preview=page.locator('.planningDropOutline').first();await preview.waitFor();
    assert.equal(Number(await preview.getAttribute('data-start')),expected);
    const b=await preview.boundingBox();assert.ok(Math.abs(b.y-(a.y-shift*ppm))<3,JSON.stringify({a,b,ppm}));assert.ok(Math.abs(b.height-a.height)<3);
    assert.equal(await page.evaluate(()=>savedWrites),writes);assert.equal(await page.evaluate(()=>JSON.stringify(savedState.shootDays.map(d=>({id:d.id,sceneIds:d.sceneIds,times:d.times,durations:d.durations,blocks:d.blocks.map(b=>({id:b.id,start:b.startMin,dur:b.durMin})),shotTimeline:d.shotTimeline})))),before);
    await page.screenshot({path:path.join(output,'preview-'+selector.replace(/[^a-z0-9]/gi,'')+(touch?'-touch':'')+'.png')});
    if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await page.mouse.up();
    await page.waitForFunction(n=>savedWrites>n,writes);
    assert.equal(await page.locator('.planningDropPreview').count(),0);
    const start=await row.evaluate((n,args)=>{const d=savedState.shootDays.find(d=>d.id===args.day);return args.key==='block:meal'?d.blocks.find(b=>b.id==='meal').startMin:args.key.includes('|')?d.shotTimeline[args.key].start:d.times.s1;},{key:dur||'scene:s1',day:'d1'});assert.equal(start,expected);
    await page.keyboard.press('Control+z');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>JSON.stringify(savedState.shootDays.map(d=>({id:d.id,sceneIds:d.sceneIds,times:d.times,durations:d.durations,blocks:d.blocks.map(b=>({id:b.id,start:b.startMin,dur:b.durMin})),shotTimeline:d.shotTimeline})))),before);
  }
  await gap('#dpScroller','#dpLane [data-key="scene:s1"]');
  await gap('#dpScroller','#dpLane [data-key="block:meal"]',105);
  await page.locator('.navBtn[data-view="schedule"]').click();await gap('#schedWrap','#schedBoard [data-item-id="s1"]');
  await page.locator('.navBtn[data-view="dayplan"]').click();await page.locator('#dayplanCard [aria-label="Organizar plan por"]').selectOption('shots');
  await gap('#shotPlanDay','#shotPlanDay [data-key="s1|a"]');
  await page.locator('.navBtn[data-view="schedule"]').click();await gap('#schedWrap','#shotPlanDay-d1 [data-key="s1|a"]');
  await page.locator('.navBtn[data-view="dayplan"]').click();await page.setViewportSize({width:820,height:1000});await gap('#shotPlanDay','#shotPlanDay [data-key="s1|a"]',45,true);
  assert.deepEqual(errors,[]);console.log('Preview geometry, actual drop, no preview saves, undo, scene/shot daily/general, touch and local sidebar theme passed. '+output);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
