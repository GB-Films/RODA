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
  const seed={meta:{version:14,title:'PROYECTO DEMOSTRACIÓN',updatedAt:new Date().toISOString()},scenes,crew:[],project:{},shootDays:[{id:'day',date:'2026-11-05',label:'Día 1 · Edificio',location:'EDIFICIO',callTime:'08:00',sceneIds:scenes.map(s=>s.id),times:Object.fromEntries(scenes.map((s,i)=>[s.id,45+i*20])),durations:Object.fromEntries(scenes.map(s=>[s.id,20])),blocks:[{id:'arrival',startMin:0,durMin:15,title:'Llegada al rodaje',blockType:'arrival'},{id:'setup',startMin:15,durMin:30,title:'Armado técnico',blockType:'setup'}]}]};
  seed.scenes.push({id:'guest',number:21,slugline:'INT. HOTEL - DÍA',elements:{cast:[]}});seed.shootDays.push({id:'day2',date:'2026-11-06',label:'Hotel',callTime:'10:00',sceneIds:['guest'],times:{guest:0},durations:{guest:45},blocks:[]});
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
  assert.equal(await page.locator('#dpLane .dpMiniBtn').count(),0);
  assert.equal(await page.locator('#dpLane .dpBlockSummary').count(),0);
  await page.locator('#dpLane .dpBlock[data-id="scene0"]').click();
  await page.locator('#dayplanInspector').waitFor({state:'visible'});
  assert.match(await page.locator('#dayplanInspector h3').textContent(),/SALA 1/);
  assert.equal(await page.locator('#dpi_openScene').isVisible(),true);
  assert.equal(await page.locator('#dpi_removeScene').isVisible(),true);
  await page.screenshot({path:path.join(output,'plan-dia-limpio.png')});
  await page.locator('#dpCloseInspector').click();
  assert.equal(await page.locator('#dayplanInspector').isVisible(),false);
  await page.locator('.navBtn[data-view="schedule"]').click();
  assert.equal(await page.locator('#schedBoard .schedNote').count(),0);
  await page.locator('#schedBoard .schedBlock[data-item-id="scene1"]').click();
  assert.equal(await page.locator('.scheduleContent #dayplanInspector').isVisible(),true);
  assert.match(await page.locator('#dayplanInspector h3').textContent(),/SALA 2/);
  assert.equal(await page.locator('#dpi_time').inputValue(),'09:05');
  assert.equal(await page.locator('#dpi_time').count(),1);
  await page.screenshot({path:path.join(output,'plan-general-limpio.png')});
  await page.locator('#schedBoard .schedBlock[data-item-id="guest"]').click();assert.equal(await page.locator('#dpi_time').inputValue(),'10:00');
  await page.locator('#schedBoard .schedBlock[data-item-id="scene1"]').click();assert.equal(await page.locator('#dpi_time').inputValue(),'09:05');
  assert.equal(await page.evaluate(()=>JSON.stringify(savedState.shootDays)),before);
  assert.equal(await page.evaluate(()=>savedWrites),writes,'Selecting details must not save');
  await page.locator('#dayplanInspector .inspectorColor summary').click();
  await page.locator('#dayplanInspector [data-action="pickColorInspector"]').first().click();
  assert.ok(await page.evaluate(()=>savedState.shootDays[0].sceneColors.scene1));
  await page.locator('#dpi_removeScene').click();
  assert.equal(await page.locator('#schedBoard .schedBlock[data-item-id="scene1"]').count(),0);
  assert.equal(await page.evaluate(()=>savedState.scenes.some(s=>s.id==='scene1')),true,'Removing a scheduled scene preserves Breakdown');
  await page.locator('#schedBoard .schedBlock[data-item-id="setup"]').click();
  await page.locator('#dpi_title').fill('Armado técnico de cámaras');await page.locator('#dpi_title').press('Tab');
  assert.match(await page.locator('#schedBoard .schedBlock[data-item-id="setup"]').textContent(),/Armado técnico de cámaras/);
  await page.locator('#dpCloseInspector').click();
  await page.locator('#schedBoard .schedBlock[data-item-id="scene2"]').focus();await page.keyboard.press('Enter');
  assert.match(await page.locator('#dayplanInspector h3').textContent(),/SALA 3/);
  await page.locator('.navBtn[data-view="dayplan"]').click();
  assert.equal(await page.locator('.dayplanBody #dayplanInspector').count(),1);
  await page.setViewportSize({width:780,height:900});
  await page.locator('#dpLane .dpBlock[data-id="scene0"]').click();
  const bounds=await page.locator('#dayplanInspector').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=780);
  await page.screenshot({path:path.join(output,'detalle-compacto.png')});
  if(studio){await page.setViewportSize({width:1600,height:1000});await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:{planning:'read'}};RodaAccess.apply();});await page.locator('.navBtn[data-view="schedule"]').click();await page.locator('#schedBoard .schedBlock[data-item-id="scene3"]').click();assert.match(await page.locator('#dayplanInspector h3').textContent(),/SALA 4/);assert.equal(await page.locator('#dpi_time').isEnabled(),false);}
  assert.deepEqual(errors,[]);console.log('OK: clean cards; shared inspector, color, removal, keyboard, compact viewport; selection preserves timings and does not save. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
