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
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/roda/');
  const scenes=Array.from({length:20},(_,i)=>({id:'scene'+i,number:i+1,slugline:'INT. EDIFICIO - SALA '+(i+1)+' - DÍA',location:'EDIFICIO / SALA '+(i+1),intExt:'Int',timeOfDay:'Día',summary:'El equipo prepara la siguiente toma. Dos cámaras siguen a los personajes y registran las acciones de la escena. '.repeat(3),elements:{cast:[]}}));
  const seed={meta:{version:14,title:'PROYECTO DEMOSTRACIÓN',updatedAt:new Date().toISOString()},scenes,crew:[],project:{},shootDays:[{id:'day',date:'2026-11-05',label:'Día 1 · Edificio',location:'EDIFICIO',callTime:'08:00',sceneIds:scenes.map(s=>s.id),times:Object.fromEntries(scenes.map((s,i)=>[s.id,45+i*20+(i?100:0)])),durations:Object.fromEntries(scenes.map(s=>[s.id,s.id==='scene0'?120:20])),blocks:[{id:'arrival',startMin:0,durMin:15,title:'Llegada al rodaje',blockType:'arrival'},{id:'setup',startMin:15,durMin:30,title:'Armado técnico',blockType:'setup'}]}]};
  seed.scenes.push({id:'guest',number:21,slugline:'INT. HOTEL - DÍA',elements:{cast:[]}});seed.shootDays.push({id:'day2',date:'2026-11-06',label:'Hotel',callTime:'10:00',sceneIds:['guest'],times:{guest:30},durations:{guest:45},blocks:[]});
  seed.scenes.push({id:'night',number:99,slugline:'INT. HOTEL - NOCHE',elements:{cast:[]}});seed.shootDays.push({id:'nightday',date:'2026-11-07',label:'Noche',callTime:'22:00',night:true,sceneIds:['night'],times:{night:90},durations:{night:90},blocks:[]});
  await page.evaluate(data=>{
   sessionStorage.setItem('gb_edit_unlocked__default','1');
   document.querySelector('.shell').hidden=false;document.body.classList.add('roda-studio');document.body.classList.remove('studio-tool-locked');
   let header=document.querySelector('.studio-global-header');if(!header){header=document.createElement('header');document.body.prepend(header);}
   header.className='studio-global-header studio-shared-header';header.innerHTML='<button>Tus proyectos</button><button>Aplicaciones</button><button>Cuenta privada</button>';
   window.RODA_STUDIO={canEdit:true,project:{rodaAccess:{admin:true,sections:Object.fromEntries(['script','breakdown','locations','cast','planning','shotlist','crew','reports'].map(k=>[k,'edit']))}}};
   window.savedState=structuredClone(data);window.savedWrites=0;
   window.StorageLayer=new Proxy({loadCfg:()=>({backend:'local',projects:[]}),loadLocal:()=>data,getProjects:()=>[],saveLocal:s=>{window.savedState=structuredClone(s);window.savedWrites++;}}, {get:(target,key)=>target[key]||(()=>null)});
   window.print=()=>{window.printSnapshot=document.documentElement.outerHTML;};
  },seed);
  // Reproduce the shared header's !important display rule, also in standalone Roda.
  await page.addStyleTag({content:'.studio-global-header.studio-shared-header{display:flex!important;background:#050505;color:white;}'});
  for(const f of ['dialogs','roda-policy','roda-access','cast','script-pages','script-document','screenplay','script-revisions','script-history','utils','day-swap','production-blocks','app'].filter(f=>fs.existsSync(path.join(appRoot,'js',f+'.js'))))await page.addScriptTag({url:'js/'+f+'.js'});
  await page.waitForFunction(isStudio=>isStudio?!!window.RODA_READY:!document.body.classList.contains('bootLoading'),studio);await page.evaluate(()=>{document.querySelector('.shell').hidden=false;window.RodaAccess?.bind();});
  const before=await page.evaluate(()=>JSON.stringify(savedState.shootDays)),writes=await page.evaluate(()=>savedWrites);

  await page.getByRole('button',{name:'Plan de Rodaje',exact:true}).click();
  const long=page.locator('#dpLane .dpBlock[data-id="scene0"]');
  assert.ok((await long.boundingBox()).height>100);
  await page.locator('#dayplanView').selectOption('compact');
  assert.ok((await long.boundingBox()).height<70);
  assert.equal(await long.locator('.planDuration').textContent(),'2 h');
  assert.equal(await long.locator('.dpTime').textContent(),'08:45–10:45');
  assert.equal(await page.locator('#dpTimeCol').isVisible(),false);
  assert.equal(await page.locator('#dayplanZoom').isVisible(),false);
  assert.equal(await page.locator('#dpScroller').evaluate(el=>el.scrollTop),0);
  assert.deepEqual(await page.locator('#dpLane .dpBlock').evaluateAll(nodes=>nodes.slice(0,3).map(n=>n.dataset.id)),['arrival','setup','scene0']);
  await long.click();assert.equal(await page.locator('#dpi_dur_h').inputValue(),'2');
  await page.locator('#dpCloseInspector').click();
  await page.screenshot({path:path.join(output,'plan-compacto.png')});
  await page.locator('#dayplanSelect').selectOption('nightday');
  assert.match(await page.locator('#dpLane .dpBlock[data-id="night"] .dpTime').textContent(),/23:30.*01:00/);
  assert.equal(await page.locator('#dpLane .dpBlock[data-id="night"] .planDuration').textContent(),'1 h 30 min');
  await page.locator('#dayplanSelect').selectOption('day');
  // Pointer gestures on the list must never be interpreted as minutes on a timeline.
  const a=await long.boundingBox();await page.mouse.move(a.x+80,a.y+15);await page.mouse.down();await page.mouse.move(a.x+80,a.y+120,{steps:5});await page.mouse.up();
  await page.locator('.navBtn[data-view="schedule"]').click();
  assert.equal(await page.locator('#schedView').inputValue(),'compact');
  assert.deepEqual(await page.locator('.schedGrid[data-day-id="day"] .schedBlock').evaluateAll(nodes=>nodes.slice(0,3).map(n=>n.dataset.itemId)),['arrival','setup','scene0']);
  const general=page.locator('#schedBoard .schedBlock[data-item-id="scene0"]');
  assert.ok((await general.boundingBox()).height<90);
  assert.equal(await general.locator('.planDuration').textContent(),'2 h');
  assert.match(await page.locator('#schedBoard .schedBlock[data-item-id="guest"] .meta').textContent(),/10:30 - 11:15/);
  await general.click();assert.equal(await page.locator('#dpi_time').inputValue(),'08:45');
  await page.locator('#dpCloseInspector').click();
  await page.screenshot({path:path.join(output,'general-compacto.png')});
  await page.locator('#schedView').selectOption('timeline');
  assert.ok((await general.boundingBox()).height>100);
  await page.locator('#schedView').selectOption('compact');
  assert.equal(await page.evaluate(()=>localStorage.getItem('gb_planning_view')),'compact');
  assert.equal(await page.evaluate(()=>JSON.stringify(savedState.shootDays)),before);
  assert.equal(await page.evaluate(()=>savedWrites),writes,'View changes and selections must not save');
  if(studio){await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:{planning:'read'}};RodaAccess.apply();});}
  assert.equal(await page.locator('#schedView').isEnabled(),true);
  await page.locator('#schedView').selectOption('timeline');await page.locator('#schedView').selectOption('compact');
  await page.setViewportSize({width:850,height:900});
  await page.locator('.navBtn[data-view="dayplan"]').click();
  assert.ok(await long.locator('.planDuration').isVisible());
  await page.screenshot({path:path.join(output,'compacto-pantalla-chica.png')});
  assert.deepEqual(errors,[]);console.log('OK: compact daily/general lists, chronology, explicit times/durations, safe pointer gestures, shared preference, read-only access, small viewport; unchanged schedule and zero writes. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
