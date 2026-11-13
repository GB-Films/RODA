const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),studio=fs.existsSync(path.join(root,'roda/index.html')),appRoot=studio?path.join(root,'roda'):root;
const output=process.env.RODA_PRINT_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'roda-print-'));
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const html=fs.readFileSync(path.join(appRoot,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const server=http.createServer((req,res)=>{
  if(req.url==='/roda/'){res.setHeader('Content-Type','text/html');return res.end(html);}
  const relative=decodeURIComponent(req.url.split('?')[0]);
  const file=path.join(studio?root:appRoot,studio?relative:relative.replace(/^\/roda\//,'/'));
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'text/plain');
  fs.readFile(file,(e,data)=>e?res.writeHead(404).end():res.end(data));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await page.route('https://**/*',r=>r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/roda/');
  const scenes=Array.from({length:20},(_,i)=>({id:'scene'+i,number:i+1,slugline:'INT. EDIFICIO - SALA '+(i+1)+' - DÍA',location:'EDIFICIO / SALA '+(i+1),intExt:'Int',timeOfDay:'Día',summary:'El equipo prepara la siguiente toma. Dos cámaras siguen a los personajes y registran las acciones de la escena. '.repeat(3),elements:{cast:[]}}));
  const seed={meta:{version:14,title:'PROYECTO DEMOSTRACIÓN',updatedAt:new Date().toISOString()},scenes,crew:[],project:{},shootDays:[{id:'day',date:'2026-11-05',label:'Día 1 · Edificio',location:'EDIFICIO',callTime:'08:00',sceneIds:scenes.map(s=>s.id),times:Object.fromEntries(scenes.map((s,i)=>[s.id,45+i*20])),durations:Object.fromEntries(scenes.map(s=>[s.id,20])),blocks:[{id:'arrival',startMin:0,durMin:15,title:'Llegada al rodaje',blockType:'arrival',color:'#176c3a'},{id:'setup',startMin:15,durMin:30,title:'Armado técnico',blockType:'setup',color:'#f7cb48'}]}]};
  seed.shootingLocations=[{id:'building',name:'EDIFICIO',address:'Av. Corrientes 1234, Buenos Aires'},{id:'hotel',name:'HOTEL',address:'https://maps.app.goo.gl/example'}];
  scenes.forEach(scene=>{scene.shootingLocationId='building';scene.shots=[1,2,3].map(n=>({id:scene.id+'p'+n,type:n===1?'Plano general':'Primer plano',desc:'Descripción completa del plano '+n+'. '+('Seguimos al personaje durante su recorrido. '.repeat(5)),durMin:5}));});
  seed.scenes.push({id:'hotelScene',number:21,slugline:'INT. HOTEL - LOBBY - DÍA',shootingLocationId:'hotel',summary:'Llegada al hotel.',elements:{cast:[]},shots:[{id:'shot1',type:'Plano medio',desc:'Entrada al lobby',durMin:10},{id:'shot2',type:'Primer plano',desc:'Reacción',durMin:20}]});
  seed.shootDays.push({id:'hotelDay',date:'2026-11-06',label:'Día 2 · Hotel',location:'HOTEL',callTime:'10:00',sceneIds:['hotelScene'],times:{hotelScene:15},durations:{hotelScene:30},blocks:[{id:'hotelArrival',startMin:0,durMin:15,title:'Llegada al hotel'}]}, {id:'emptyDay',date:'2026-11-07',label:'Día 3 · Pendiente',callTime:'08:00',sceneIds:[],times:{},durations:{},blocks:[]});
  await page.evaluate(data=>{
   document.querySelector('.shell').hidden=false;document.body.classList.add('roda-studio');document.body.classList.remove('studio-tool-locked');
   let header=document.querySelector('.studio-global-header');if(!header){header=document.createElement('header');document.body.prepend(header);}
   header.className='studio-global-header studio-shared-header';header.innerHTML='<button>Tus proyectos</button><button>Aplicaciones</button><button>Cuenta privada</button>';
   window.RODA_STUDIO={canEdit:true,project:{rodaAccess:{admin:true,sections:Object.fromEntries(['script','breakdown','locations','cast','planning','shotlist','crew','reports'].map(k=>[k,'edit']))}}};
   window.savedState=structuredClone(data);window.savedWrites=0;
   window.StorageLayer=new Proxy({loadCfg:()=>({backend:'local',projects:[]}),loadLocal:()=>data,getProjects:()=>[],saveLocal:s=>{window.savedState=structuredClone(s);window.savedWrites++;}}, {get:(target,key)=>target[key]||(()=>null)});
   window.print=()=>{
     window.printScreen={root:getComputedStyle(document.querySelector('#gbPrintRoot')).display,shell:getComputedStyle(document.querySelector('.shell')).display,visibility:getComputedStyle(document.querySelector('.shell')).visibility,header:getComputedStyle(document.querySelector('.studio-global-header')).visibility,bodyBackground:getComputedStyle(document.body).backgroundColor};
     window.printSnapshot=document.documentElement.outerHTML;
   };
  },seed);
  // Reproduce the shared header's !important display rule, also in standalone Roda.
  await page.addStyleTag({content:'.studio-global-header.studio-shared-header{display:flex!important;background:#050505;color:white;}'});
  for(const f of ['dialogs','roda-policy','roda-access','cast','call-sheet','script-pages','script-document','screenplay','script-revisions','script-history','form-autosave','utils','day-swap','production-blocks','shot-planning','shot-planning-view','planning-movement','planning-movement-view','app'].filter(f=>fs.existsSync(path.join(appRoot,'js',f+'.js'))))await page.addScriptTag({url:'js/'+f+'.js'});
  await page.waitForFunction(isStudio=>isStudio?!!window.RODA_READY:!document.body.classList.contains('bootLoading'),studio);await page.evaluate(()=>{document.querySelector('.shell').hidden=false;window.RodaAccess?.bind();});
  const before=await page.evaluate(()=>JSON.stringify(savedState.shootDays)),writes=await page.evaluate(()=>savedWrites);
  async function inspectPrint(name,daily,shots=false){
   await page.waitForFunction(()=>!!window.printSnapshot);
   const screen=await page.evaluate(()=>window.printScreen);
   assert.equal(screen.root,'none','Print document stays hidden behind the print dialog');
   assert.notEqual(screen.shell,'none','The app remains on screen');assert.equal(screen.visibility,'visible');assert.equal(screen.header,'visible');
   assert.equal(screen.bodyBackground,await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'Preparing print does not recolor the app');
   const captured=await page.evaluate(()=>window.printSnapshot);assert.match(captured,/@page\{ size:A4 landscape; margin:12mm;/);
   const pdf=await browser.newPage({viewport:{width:1123,height:794}});await pdf.route('https://**/*',r=>r.abort());
   await pdf.emulateMedia({media:'print'});
   await pdf.setContent(captured.replace('<head>','<head><base href="http://127.0.0.1:'+server.address().port+'/roda/">').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'networkidle'});
   assert.equal(await pdf.locator('.studio-global-header').evaluate(e=>getComputedStyle(e).display),'none');
   assert.equal(await pdf.locator('.shell').evaluate(e=>getComputedStyle(e).display),'none');
   if(daily){
    assert.equal(await pdf.locator('#gbPrintRoot .dpPrintHeader h1').textContent(),seed.meta.title);
    assert.match(await pdf.locator('#gbPrintRoot .dpPrintMeta').textContent(),/08:00[\s\S]*EDIFICIO[\s\S]*20/);
    assert.equal(await pdf.locator('#gbPrintRoot .dayplanPrintTable tbody tr').count(),shots?62:22);
    assert.equal(await pdf.locator('#gbPrintRoot .dayplanPrintTable tbody tr').first().evaluate(e=>getComputedStyle(e).breakInside),'avoid');
    assert.equal(await pdf.locator('#gbPrintRoot thead').evaluate(e=>getComputedStyle(e).display),'table-header-group');
    assert.equal(await pdf.locator('#gbPrintRoot').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
   }
   const sections=pdf.locator('#gbPrintRoot .dpPrintBlock');
   assert.equal(await pdf.locator('#gbPrintRoot .dpPrintContinuation').count(),0,'No duplicate project/day subtitle above columns');
   assert.equal(await sections.count(),daily?1:3,'One sequential document per selected day');
   if(shots){
    assert.deepEqual(await sections.first().locator('thead tr').last().locator('th').allTextContents(),['Inicio','Fin','Duración','Escena','Plano','Plano / actividad','Indicaciones']);
    assert.equal(await sections.first().locator('.cShot').count(),62);
    assert.deepEqual((await sections.first().locator('.cShot').allTextContents()).slice(0,5),['—','—','Plano 1','Plano 2','Plano 3']);
    assert.deepEqual((await sections.first().locator('.cNro').allTextContents()).slice(0,5),['—','—','1','1','1']);
    assert.ok((await sections.first().locator('.cSum').nth(2).textContent()).endsWith('su recorrido. '),'Keep the complete shot description');
    assert.match(await sections.first().locator('.dpPrintMeta').textContent(),/Planos programados60/);
    if(!daily){const cells=await sections.nth(1).locator('tbody tr').nth(1).locator('td').allTextContents();assert.deepEqual(cells.slice(0,5),['10:15','10:25','10m','21','Plano 1']);}
   }

   assert.equal(await pdf.locator('#gbPrintRoot .pgGrid').count(),0,'No legacy side-by-side cards');
   if(!daily){
    assert.deepEqual(await sections.locator('.dpPrintDay').allTextContents(),['Jueves 05/11 · Día 1 · Edificio','Viernes 06/11 · Día 2 · Hotel','Sábado 07/11 · Día 3 · Pendiente']);
    assert.equal(await sections.nth(1).evaluate(e=>getComputedStyle(e).breakBefore),'page');
    assert.equal(await sections.nth(1).locator('tbody tr').count(),shots?3:2);
    assert.match(await sections.nth(2).textContent(),/Sin escenas programadas/);
    if(shots)assert.match(await sections.nth(1).textContent(),/Plano 1[\s\S]*Plano 2/);
   }
   assert.equal(await sections.first().locator('.productionLocationLink a').getAttribute('href'),'https://www.google.com/maps/search/?api=1&query=Av.%20Corrientes%201234%2C%20Buenos%20Aires');
   if(!daily)assert.equal(await sections.nth(1).locator('.productionLocationLink a').getAttribute('href'),'https://maps.app.goo.gl/example');
   assert.deepEqual(await pdf.locator('#gbPrintRoot td,#gbPrintRoot th').evaluateAll(cells=>cells.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent)),[],'No clipped table cells');
   if(await pdf.locator('#gbPrintRoot .productionPrintBrand').count()){
    assert.match(await pdf.locator('#gbPrintRoot .productionPrintBrand').first().textContent(),/GRANBERTA FILMS/);
    assert.ok(await pdf.locator('#gbPrintRoot .productionPrintBrand img').first().evaluate(e=>e.complete&&e.naturalWidth>0),'Studio logo is loaded');
   }
   assert.deepEqual(await pdf.locator('#gbPrintRoot .dpPrintNote').evaluateAll(rows=>rows.slice(0,2).map(r=>({background:getComputedStyle(r.querySelector('td')).backgroundColor,ink:getComputedStyle(r.querySelector('td')).color}))),[{background:'rgb(23, 108, 58)',ink:'rgb(255, 255, 255)'},{background:'rgb(247, 203, 72)',ink:'rgb(0, 0, 0)'}]);
   await pdf.pdf({path:path.join(output,name+'-colors-no-background-option.pdf'),preferCSSPageSize:true,printBackground:false});
   await pdf.pdf({path:path.join(output,name+'.pdf'),preferCSSPageSize:true,printBackground:true});
   // Chrome's “Minimum” margin choice must still leave inner paper gutters.
   await pdf.addStyleTag({content:'@page rodaDayPlan{margin:3.175mm;}'});
   await pdf.pdf({path:path.join(output,name+'-minimum-margins.pdf'),preferCSSPageSize:true,printBackground:true});
   await pdf.screenshot({path:path.join(output,name+'.png'),fullPage:true});await pdf.close();
   assert.equal(await page.evaluate(()=>JSON.stringify(savedState.shootDays)),before,'Printing must not change timings');
   assert.equal(await page.evaluate(()=>savedWrites),writes,'Printing must not save the project');
   assert.equal(await page.locator('#gbPrintRoot').textContent(),'');
   assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('gbPrintingDayplan')),false);
   await page.evaluate(()=>{window.printSnapshot=null;});
  }
  await page.getByRole('button',{name:'Plan de Rodaje',exact:true}).click();await page.locator('#btnDayplanPrint').click();await inspectPrint('plan-dia',true);
  await page.getByRole('button',{name:'REPORTES',exact:true}).click();await page.locator('#reportTabs [data-tab="dayplan"]').click();await page.locator('#btnPrintCallSheet').click();await inspectPrint('plan-reportes',true);
  await page.locator('.navBtn[data-view="schedule"]').click();await page.locator('#btnSchedPrint').click();await inspectPrint('plan-general',false);
  await page.locator('#scheduleCard .shotPlanningUnit select').selectOption('shots');await page.locator('#btnSchedPrint').click();await inspectPrint('plan-general-planos',false,true);
  await page.locator('.navBtn[data-view="dayplan"]').click();await page.locator('#btnDayplanPrint').click();await inspectPrint('plan-dia-planos',true,true);
  await page.locator('.navBtn[data-view="schedule"]').click();
  await page.evaluate(()=>localStorage.setItem('gb_sched_dayfilter_v1__default',JSON.stringify({mode:'selected',selected:['hotelDay']})));
  await page.locator('#btnSchedPrint').click();await page.waitForFunction(()=>!!window.printSnapshot);
  assert.equal(await page.evaluate(()=>new DOMParser().parseFromString(printSnapshot,'text/html').querySelectorAll('#gbPrintRoot .dpPrintBlock').length),1,'Respect selected days');
  assert.ok((await page.evaluate(()=>printSnapshot)).includes('Día 2 · Hotel'));
  await page.evaluate(()=>{window.printSnapshot=null;localStorage.setItem('gb_sched_dayfilter_v1__default',JSON.stringify({mode:'none',selected:[]}));});
  await page.locator('#btnSchedPrint').click();assert.equal(await page.evaluate(()=>printSnapshot),null,'No empty print dialog when no days selected');
  if(studio){
   await page.evaluate(()=>localStorage.setItem('gb_sched_dayfilter_v1__default',JSON.stringify({mode:'all',selected:[]})));
   for(const admin of [false,true]){
    await page.evaluate(admin=>{RODA_STUDIO.project.rodaAccess={admin,sections:RodaPolicy.all('edit')};RodaAccess.apply();},admin);
    const writesBefore=await page.evaluate(()=>savedWrites);
    const print=async id=>{assert.equal(await page.locator(id).isEnabled(),true);await page.evaluate(()=>{window.printSnapshot=null;});await page.locator(id).click();await page.waitForFunction(()=>!!window.printSnapshot);assert.ok((await page.evaluate(()=>printSnapshot)).includes('PROYECTO DEMOSTRACIÓN'));await page.waitForFunction(()=>!document.body.className.includes('gbPrinting'));};
    for(const [view,id] of [['dayplan','#btnDayplanPrint'],['schedule','#btnSchedPrint'],['shotlist','#btnShotPrint']]){await page.locator('.navBtn[data-view="'+view+'"]').click();await print(id);}
    await page.locator('.navBtn[data-view="callsheet"]').click();
    for(const tab of ['dayplan','schedule','callsheet','shotlist','elements']){assert.equal(await page.locator('#reportTabs [data-tab="'+tab+'"]').isEnabled(),true);await page.locator('#reportTabs [data-tab="'+tab+'"]').click();await print('#btnPrintCallSheet');}
    assert.equal(await page.evaluate(()=>savedWrites),writesBefore,'Printing full-access reports never edits production data');
   }
  }
  assert.deepEqual(errors,[]);console.log('OK: daily, reports, general, shots and filtered days, shared navigation hidden, project header, 12mm margins, repeated table headings, intact rows, no timing changes or saves. PDFs: '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
