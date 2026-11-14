const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),studio=fs.existsSync(path.join(root,'roda/index.html')),appRoot=studio?path.join(root,'roda'):root;
const output=process.env.RODA_CALL_PRINT_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'roda-call-print-'));
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
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/roda/');
  const scenes=Array.from({length:20},(_,i)=>({id:'scene'+i,number:i+1,slugline:'INT. EDIFICIO - SALA '+(i+1)+' - DÍA',location:'EDIFICIO / SALA '+(i+1),intExt:'Int',timeOfDay:'Día',summary:'El equipo prepara la siguiente toma. Dos cámaras siguen a los personajes y registran las acciones de la escena. '.repeat(3),elements:{cast:[]}}));
  let seed={meta:{version:14,title:'PROYECTO DEMOSTRACIÓN',updatedAt:new Date().toISOString()},scenes,crew:[],project:{},shootDays:[{id:'day',date:'2026-11-05',label:'Día 1 · Edificio',location:'EDIFICIO',callTime:'08:00',sceneIds:scenes.map(s=>s.id),times:Object.fromEntries(scenes.map((s,i)=>[s.id,45+i*20])),durations:Object.fromEntries(scenes.map(s=>[s.id,20])),blocks:[{id:'arrival',startMin:0,durMin:15,title:'Llegada al rodaje',blockType:'arrival'},{id:'setup',startMin:15,durMin:30,title:'Armado técnico',blockType:'setup'}]}]};
  seed.crew=[{id:'actor',area:'Cast',castPerson:true,name:'Elena Fernández'},
    {id:'role1',area:'Cast',castProfile:true,role:'ANA',actorId:'actor'},
    {id:'role2',area:'Cast',castProfile:true,role:'BETO',actorId:'actor'},
    {id:'director',area:'Dirección',name:'Pablo Pérez',role:'Director',phone:'+54 11 5555 1234'}];
  seed.scenes[0].elements.cast=['ANA','PERSONA SIN ASIGNAR'];seed.scenes[1].elements.cast=['BETO'];
  Object.assign(seed.shootDays[0],{crewIds:['director'],castCallMode:'scenes',castCallTimes:{ANA:'08:20',BETO:'08:20'},crewCallTimes:{director:'07:40'},notes:'Conservar estas notas de producción. <script>texto, no código</script>',castTransportNote:'Traslado compartido. Pasajeros por confirmar.'});
  if(process.env.RODA_CALL_PRINT_EXTRAS)Object.assign(seed.shootDays[0],{pickupCastEnabled:true,pickupCrewEnabled:true,rtsEnabled:true,castPickUpTimes:{ANA:'07:10',BETO:'07:10'},castRTSTimes:{ANA:'08:35',BETO:'08:35'},crewPickUpTimes:{director:'07:00'}});
  if(process.env.RODA_CALL_PRINT_STRESS){
    for(let i=0;i<36;i++){
      seed.crew.push({id:'extra'+i,area:'Cast',castPerson:true,name:'Intérprete de prueba con nombre largo '+i},{id:'extra-role'+i,area:'Cast',castProfile:true,role:'PERSONAJE DE PRUEBA '+i,actorId:'extra'+i});
      seed.scenes[i%20].elements.cast.push('PERSONAJE DE PRUEBA '+i);
    }
    seed.shootDays[0].notes=('Notas internas extensas de continuidad y planificación. Mantener el vestuario indicado y revisar los elementos antes del armado. ').repeat(30);
  }
  if(process.env.RODA_CALL_PRINT_FIXTURE)seed=JSON.parse(fs.readFileSync(process.env.RODA_CALL_PRINT_FIXTURE,'utf8'));
  await page.evaluate(data=>{
   document.querySelector('.shell').hidden=false;document.body.classList.add('roda-studio');document.body.classList.remove('studio-tool-locked');
   let header=document.querySelector('.studio-global-header');if(!header){header=document.createElement('header');document.body.prepend(header);}
   header.className='studio-global-header studio-shared-header';header.innerHTML='<button>Tus proyectos</button><button>Aplicaciones</button><button>Cuenta privada</button>';
   window.RODA_STUDIO={canEdit:true,project:{rodaAccess:{admin:true,sections:Object.fromEntries(['script','breakdown','locations','cast','planning','shotlist','crew','reports'].map(k=>[k,'edit']))}}};
   sessionStorage.setItem('gb_edit_unlocked__default','1');
   window.savedState=structuredClone(data);window.savedWrites=0;
   window.StorageLayer=new Proxy({loadCfg:()=>({backend:'local',projects:[]}),loadLocal:()=>data,getProjects:()=>[],saveLocal:s=>{window.savedState=structuredClone(s);window.savedWrites++;}}, {get:(target,key)=>target[key]||(()=>null)});
   window.print=()=>{
     window.printScreen={root:getComputedStyle(document.querySelector('#gbPrintRoot')).display,shell:getComputedStyle(document.querySelector('.shell')).display,visibility:getComputedStyle(document.querySelector('.shell')).visibility,header:getComputedStyle(document.querySelector('.studio-global-header')).visibility,bodyBackground:getComputedStyle(document.body).backgroundColor};
     window.printSnapshot=document.documentElement.outerHTML;
   };
  },seed);
  // Reproduce the shared header's !important display rule, also in standalone Roda.
  await page.addStyleTag({content:'.studio-global-header.studio-shared-header{display:flex!important;background:#050505;color:white;}'});
  for(const f of ['dialogs','roda-policy','roda-access','cast','script-pages','script-document','screenplay','script-revisions','script-history','form-autosave','utils','day-swap','production-blocks','call-sheet','day-navigation','responsive','workspace-ui','app'].filter(f=>fs.existsSync(path.join(appRoot,'js',f+'.js'))))await page.addScriptTag({url:'js/'+f+'.js'});
  await page.waitForFunction(isStudio=>isStudio?!!window.RODA_READY:!document.body.classList.contains('bootLoading'),studio);await page.evaluate(()=>{document.querySelector('.shell').hidden=false;window.RodaAccess?.bind();});
  const before=await page.evaluate(()=>JSON.stringify(savedState)),writes=await page.evaluate(()=>savedWrites);
  await page.getByRole('button',{name:'Call Diario',exact:true}).click();
  assert.equal(await page.getByRole('tab',{selected:true}).textContent(),'Escenas');
  assert.equal(await page.locator('#call-panel-cast').isVisible(),false);
  await page.getByRole('tab',{name:'Cast',exact:true}).click();
  assert.equal(await page.locator('#dayCast').isVisible(),true);
  assert.equal(await page.locator('#dayScenesDetail').isVisible(),false);
  await page.getByRole('tab',{name:'Cast',exact:true}).press('ArrowRight');
  assert.equal(await page.getByRole('tab',{selected:true}).textContent(),'Equipo técnico');
  await page.getByRole('tab',{name:'Cast',exact:true}).click();
  const search=page.locator('[data-call-filter="cast"] input');
  if(await search.count())await search.fill('Elena');
  await page.getByRole('tab',{name:'Escenas',exact:true}).click();await page.getByRole('tab',{name:'Cast',exact:true}).click();
  if(await search.count())assert.equal(await search.inputValue(),'Elena');
  await page.screenshot({path:path.join(output,'call-tabs-desktop.png'),fullPage:true});
  for(const width of [834,390]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(250);
   const overflow=await page.locator('#dayDetailCard').evaluate(e=>e.scrollWidth-e.clientWidth);
   assert.ok(overflow<3,'Call does not overflow at '+width+': '+overflow);
   await page.screenshot({path:path.join(output,'call-tabs-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1600,height:1000});
  await page.getByRole('button',{name:'REPORTES',exact:true}).click();
  for(const [tab,selector] of [['callsheet','.csPrintTable--agenda'],['dayplan','.dayplanPrintTable'],['schedule','.dayplanPrintTable'],['shotlist','table'],['elements','table']]){
   await page.locator('#reportTabs [data-tab="'+tab+'"]').click();
   const preview=page.frameLocator('#reportPane-'+tab+' iframe');
   await preview.locator('#gbPrintRoot').waitFor({state:'visible'});
   assert.ok(await preview.locator(selector).count(),'Print markup for '+tab);
   assert.ok(await preview.locator('#gbPrintRoot').evaluate(e=>e.getBoundingClientRect().height>100),'Document visible for '+tab);
   assert.ok(await preview.locator('#gbPrintRoot').evaluate(e=>e.scrollWidth<=e.clientWidth+2),'No paper overflow for '+tab);
   await page.screenshot({path:path.join(output,'preview-'+tab+'.png'),fullPage:true});
   if(tab==='callsheet'||tab==='dayplan'){
    const previewText=await preview.locator('#gbPrintRoot').textContent();
    await page.locator('#btnPrintCallSheet').click();await page.waitForFunction(()=>!!window.printSnapshot);
    const snapshot=await page.evaluate(()=>new DOMParser().parseFromString(printSnapshot,'text/html').querySelector('#gbPrintRoot').textContent);
    assert.equal(previewText.replace(/\s/g,''),snapshot.replace(/\s/g,''),'Preview and print have identical content');
    await page.evaluate(()=>window.printSnapshot=null);
   }
  }
  // The report owns the available height and keeps the shared day control in reach.
  const controls=page.locator('.reportControls');
  const frame=page.locator('#reportPane-elements iframe');
  const zoom=page.locator('#reportPaperZoom');
  await zoom.click();
  assert.equal(await zoom.getAttribute('aria-pressed'),'true');
  assert.equal(await frame.contentFrame().locator('#previewPaper').evaluate(p=>getComputedStyle(p).zoom),'1');
  await zoom.click();
  assert.equal(await zoom.getAttribute('aria-pressed'),'false');
  assert.equal(await controls.locator('#dayNavigation').count(),1);
  await controls.locator('.dayPicker > summary').click();
  assert.equal(await controls.locator('.dayPickerOption').first().isVisible(),true);
  await controls.locator('.dayPickerOption').first().click();
  assert.equal(await page.locator('#reportTabs .reportTabBtn[aria-pressed="true"]').textContent(),'Elementos');
  await frame.contentFrame().locator('#gbPrintRoot').waitFor({state:'visible'});
  for(const [width,height] of [[1600,1000],[834,900],[390,844],[844,390]]){
   await page.setViewportSize({width,height});
   const side=await controls.boundingBox(),paper=await frame.boundingBox();
   const stacked=width<=700;
   if(stacked)assert.ok(paper.y>=side.y+side.height-1,'Preview sits below controls');
   else{
    assert.equal(Math.round(paper.y),Math.round(side.y),'Preview starts at the top beside the controls');
    assert.ok(paper.x>=side.x+side.width-1 && paper.width>side.width,'Preview gets most of the width');
   }
   assert.ok(paper.height>100 && paper.y+paper.height<=height+1,'Preview fits available height');
   assert.ok(paper.x+paper.width<=width+1,'Preview stays within viewport');
   await page.locator('#btnPrintCallSheet').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(output,'report-layout-'+width+'x'+height+'.png')});
  }
  const mounted=await page.evaluate(()=>{const before=document.getElementById('dayNavigation');document.querySelector('.navBtn[data-view="dayplan"]').click();return before===document.querySelector('.main > #dayNavigation');});
  assert.ok(mounted,'The same day picker returns to the shared toolbar');
  assert.equal(await page.evaluate(()=>JSON.stringify(savedState)),before,'UI never changes project data');
  assert.equal(await page.evaluate(()=>savedWrites),writes);
  assert.deepEqual(errors,[]);
  console.log('OK: call tabs, keyboard, filters, responsive layout, all print previews, print parity, no project writes. '+output);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
