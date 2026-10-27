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
  for(const f of ['dialogs','roda-policy','roda-access','cast','script-pages','script-document','screenplay','script-revisions','script-history','utils','day-swap','production-blocks','day-navigation','app'].filter(f=>fs.existsSync(path.join(appRoot,'js',f+'.js'))))await page.addScriptTag({url:'js/'+f+'.js'});
  await page.waitForFunction(isStudio=>isStudio?!!window.RODA_READY:!document.body.classList.contains('bootLoading'),studio);await page.evaluate(()=>{document.querySelector('.shell').hidden=false;window.RodaAccess?.bind();});
  }
  await boot(seed);
  const nav=view=>page.locator('.navBtn[data-view="'+view+'"]').click();
  const pick=async id=>{await page.locator('.dayPicker > summary').click();await page.locator('.dayPickerOption[data-day="'+id+'"]').click();};
  const card=id=>page.locator('.shotSceneBox[data-scene-id="'+id+'"]');
  const toggle=id=>card(id).locator('.shotSceneToggle');
  const writes=()=>page.evaluate(()=>savedWrites);
  await nav('shotlist'); const before=await writes();
  assert.equal(await page.locator('#shotDaySelect').isVisible(),false);
  assert.deepEqual(await page.locator('.shotSceneBox').evaluateAll(nodes=>nodes.map(n=>n.dataset.sceneId)),['s1','s2']);
  assert.equal(await page.locator('.shotSceneBox.collapsed').count(),2);
  await toggle('s2').click();assert.equal(await toggle('s2').getAttribute('aria-expanded'),'true','first click opens any scene');
  await toggle('s2').click();assert.equal(await toggle('s2').getAttribute('aria-expanded'),'false');
  await toggle('s1').press('Enter');assert.equal(await toggle('s1').getAttribute('aria-expanded'),'true');
  await toggle('s1').press('Space');assert.equal(await toggle('s1').getAttribute('aria-expanded'),'false');
  await toggle('s1').click();await card('s1').locator('.shotSceneContext summary').click();
  assert.equal(await toggle('s1').getAttribute('aria-expanded'),'true','scene text disclosure does not toggle the group');
  await page.screenshot({path:path.join(output,'shotlist-modernizada.png')});
  await page.locator('.dayPicker > summary').click();await page.screenshot({path:path.join(output,'selector-jornadas.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.dayPicker').getAttribute('open'),null);
  const leftPositions=[];
  await pick('d2');
  for(const view of ['shotlist','shooting','dayplan','elements','crew','reports','callsheet','schedule']){
   await nav(view);assert.match(await page.locator('.dayPickerTitle').textContent(),/Viernes 06\/11/);
   leftPositions.push((await page.locator('.dayPicker').boundingBox()).x);
  }
  assert.equal(new Set(leftPositions).size,1,'same left alignment across all sections');
  assert.equal(await page.locator('#schedBoard .schedDay').count(),1);
  await pick('all');assert.equal(await page.locator('#schedBoard .schedDay').count(),3);
  await page.locator('.dayPicker > summary').click();await page.locator('[data-day="compare"]').click();
  assert.equal(await page.locator('#schedDayPicker').isVisible(),true);await page.keyboard.press('Escape');
  await nav('elements');await pick('d2');assert.match(await page.locator('#elxList').textContent(),/LIBRO/);assert.doesNotMatch(await page.locator('#elxList').textContent(),/LLAVE/);
  await pick('unassigned');assert.match(await page.locator('#elxList').textContent(),/MAPA/);
  await nav('crew');await pick('d1');assert.equal(await page.locator('#crewTable [data-crew-id="p0"]').count(),1);assert.equal(await page.locator('#crewTable [data-crew-id="p1"]').count(),0);
  await pick('all');assert.equal(await page.locator('#crewTable [data-crew-id="p1"]').count(),1);
  await nav('shotlist');await pick('d3');assert.match(await page.locator('#shotlistWrap').textContent(),/No hay escenas/);
  await pick('d1');await toggle('s1').click();await toggle('s1').click();
  await nav('dayplan');assert.match(await page.locator('#dpLane .dpBlock[data-id="s1"] .dpTime').textContent(),/08:00–08:15/,'navigation must not enlarge a scene when its shot estimates exceed its slot');
  assert.equal(await writes(),before,'day changes and disclosure never write shared data');
  await nav('shotlist');if(await toggle('s1').getAttribute('aria-expanded')==='false')await toggle('s1').click();
  const scheduleBefore=await page.locator('.shotSceneBox .m').allTextContents();
  await card('s1').locator('.shotDescInput').first().fill('Descripción actualizada');await card('s1').locator('.shotDescInput').first().blur();
  assert.equal(await page.evaluate(()=>savedState.scenes.find(s=>s.id==='s1').shots[0].desc),'Descripción actualizada');
  assert.deepEqual(await page.locator('.shotSceneBox .m').allTextContents(),scheduleBefore,'description edits keep times');
  await card('s2').locator('.shotAddBtn').click();assert.equal(await toggle('s2').getAttribute('aria-expanded'),'true');assert.equal(await card('s2').locator('.shotDescInput').count(),1);
  await card('s2').locator('.shotDelBtn').click();assert.equal(await card('s2').locator('.shotDescInput').count(),0);
  await card('s1').getByLabel('Plano 1 realizado').check();assert.equal(await card('s1').locator('.shotRowDone').count(),1);
  await page.locator('#btnShotPrint').click();assert.match(await page.evaluate(()=>printSnapshot),/Descripción actualizada/);
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('#dayNavigation').isVisible(),false);await page.emulateMedia({media:'screen'});
  await nav('dayplan');await page.locator('#btnAddShootDay').click();
  const added=await page.evaluate(()=>savedState.shootDays.find(d=>!['d1','d2','d3'].includes(d.id)).id);
  assert.match(await page.locator('.dayPickerTitle').textContent(),/Día 4/);
  await nav('shotlist');assert.match(await page.locator('.dayPickerTitle').textContent(),/Día 4/);assert.match(await page.locator('#shotlistWrap').textContent(),/No hay escenas/);
  await nav('dayplan');await page.locator('#btnDeleteShootDay').click();await page.getByRole('dialog').getByRole('button',{name:'Eliminar día',exact:true}).click();
  await page.waitForFunction(id=>!savedState.shootDays.some(d=>d.id===id),added);
  await page.locator('.dayPicker > summary').click();assert.equal(await page.locator('.dayPickerOption[data-day="'+added+'"]').count(),0);await page.keyboard.press('Escape');
  await nav('shotlist');await pick('d1');
  await page.setViewportSize({width:780,height:900});
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
  assert.ok((await page.locator('.dayPicker').boundingBox()).x>=0);await page.screenshot({path:path.join(output,'shotlist-compacta.png')});
  if(studio){
   await page.setViewportSize({width:1600,height:1000});
   await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:Object.fromEntries(['script','breakdown','locations','cast','planning','shotlist','crew','reports'].map(k=>[k,'read']))};RodaAccess.apply();});
   await nav('shotlist');const readerBefore=await writes();await pick('d2');await toggle('s3').click();
   assert.equal(await toggle('s3').getAttribute('aria-expanded'),'true');assert.equal(await card('s3').locator('.shotAddBtn').isEnabled(),false);assert.equal(await card('s3').getByLabel('Plano 1 realizado').isEnabled(),false);
   await pick('d1');assert.equal(await writes(),readerBefore,'view-only collaborators can navigate and expand without writes');
   await page.evaluate(()=>{RODA_STUDIO.canEdit=true;RODA_STUDIO.project.rodaAccess.sections.shotlist='edit';RodaAccess.apply();});
   await pick('d2');await card('s3').locator('.shotAddBtn').click();
   assert.equal(await page.evaluate(()=>savedState.shootDays.find(d=>d.id==='d2').durations.s3),30,'shot editors cannot change a plan they can only read');
  }
  assert.deepEqual(errors,[]);console.log('OK: one-click/keyboard Shotlist, chronological order, unchanged navigation timings, shared day selection in eight sections, compare/all/undated/unassigned, editing, print, compact width and reader permissions. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
