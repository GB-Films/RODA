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
  seed.scenes[0].shots=Array.from({length:8},(_,i)=>({id:'shot'+i,type:'Plano medio',desc:('Plano '+(i+1)+' · Descripción completa de la acción y el movimiento de cámara. ').repeat(6),durMin:5,...(i===0?{thumbUrl:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%2290%22%3E%3Crect width=%22160%22 height=%2290%22 fill=%22%23999%22/%3E%3C/svg%3E'}:{})}));
  seed.scenes[0].elements.props=['Maletín','Chip','Anteojos'];
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
  await page.locator('.navBtn[data-view="callsheet"]').click();
  for(const [tab,kind] of [['shotlist','gbPrintingShotlist'],['elements','gbPrintingElements']]){
   await page.locator('#reportTabs [data-tab="'+tab+'"]').click();
   const frame=page.frameLocator('#reportPane-'+tab+' iframe');
   await frame.locator('.productionReport').waitFor({state:'visible'});
   assert.match(await frame.locator('.productionPrintBrand').textContent(),/GRANBERTA FILMS/);
   assert.equal(await frame.locator('.tableWrap,.shotSceneBox,.shotPrintHeader,.eleHeader').count(),0,'No legacy layout or scroll wrappers');
   assert.ok(await frame.locator('.productionReportTable').count());
   assert.ok(await frame.locator('.productionReport').evaluate(e=>e.scrollWidth<=e.clientWidth+2));
   if(tab==='shotlist'){
    assert.equal(await frame.locator('.productionShotTable').first().locator('tbody tr').count(),8);
    assert.match(await frame.locator('.productionShotTable').first().textContent(),/Inicio \/ fin.*Duración/s);
    assert.match(await frame.locator('.productionShotTable tbody tr').first().textContent(),/08:45.*08:50.*5m/s);
    assert.equal(await frame.locator('.productionShotImage').count(),1);
   }else assert.match(await frame.locator('.productionReport').textContent(),/Maletín, Chip, Anteojos/);
   const content=await frame.locator('#gbPrintRoot').textContent();
   await page.locator('#btnPrintCallSheet').click();await page.waitForFunction(()=>!!window.printSnapshot);
   assert.equal(await page.evaluate(()=>window.printScreen.root),'none');
   const captured=await page.evaluate(()=>window.printSnapshot);
   assert.match(captured,/@page\{ size:A4 landscape; margin:12mm;/);
   const pdf=await browser.newPage();await pdf.route('https://**/*',r=>r.abort());await pdf.emulateMedia({media:'print'});
   await pdf.setContent(captured.replace('<head>','<head><base href="http://127.0.0.1:'+server.address().port+'/roda/">').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'networkidle'});
   const doc=pdf.locator('#gbPrintRoot');assert.equal((await doc.textContent()).replace(/\s/g,''),content.replace(/\s/g,''));
   assert.ok(await doc.locator('.productionPrintBrand img').evaluate(e=>e.complete&&e.naturalWidth>0));
   assert.equal(await doc.locator('.productionReportTable th').first().evaluate(e=>getComputedStyle(e).position),'static');
   await pdf.pdf({path:path.join(output,tab+'.pdf'),preferCSSPageSize:true,printBackground:true});await pdf.close();
   await page.screenshot({path:path.join(output,tab+'-preview.png')});
   await page.evaluate(()=>window.printSnapshot=null);
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(savedState)),before,'Export does not mutate scenes or planning');
  assert.equal(await page.evaluate(()=>savedWrites),writes);
  assert.deepEqual(errors,[]);console.log('PASS branded Shotlist/Elements, full descriptions, thumbnails, times, preview/print parity and no writes. '+output);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
