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
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain');
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
  if(process.env.RODA_CALL_PRINT_FIXTURE)seed=JSON.parse(fs.readFileSync(process.env.RODA_CALL_PRINT_FIXTURE,'utf8'));
  await page.evaluate(data=>{
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
  async function inspectPrint(name){
   await page.waitForFunction(()=>!!window.printSnapshot);
   const captured=await page.evaluate(()=>window.printSnapshot);assert.match(captured,/@page\{ size:A4 portrait; margin:12mm;/);
   const pdf=await browser.newPage({viewport:{width:794,height:1123}});await pdf.route('https://**/*',r=>r.abort());
   await pdf.emulateMedia({media:'print'});
   await pdf.setContent(captured.replace('<head>','<head><base href="http://127.0.0.1:'+server.address().port+'/roda/">').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'networkidle'});
   assert.equal(await pdf.locator('.studio-global-header').evaluate(e=>getComputedStyle(e).display),'none');
   assert.equal(await pdf.locator('.shell').evaluate(e=>getComputedStyle(e).display),'none');
   assert.equal(await pdf.locator('#gbPrintRoot h1').textContent(),seed.meta.title);
   const day=seed.shootDays[0],items=(day.sceneIds||[]).length+(day.blocks||[]).length;
   assert.equal(await pdf.locator('.csPrintTable--agenda tbody tr').count(),Math.max(1,items));
   assert.match(await pdf.locator('.csPrintSummary').textContent(),new RegExp(day.callTime));
   for(const text of [day.notes,day.castTransportNote].filter(Boolean))assert.ok((await pdf.locator('.csPrintPeople').textContent()).includes(text));
   assert.equal(await pdf.locator('.csPrintTable--agenda tbody tr').first().evaluate(e=>getComputedStyle(e).breakInside),'avoid');
   assert.equal(await pdf.locator('.csPrintTable thead').first().evaluate(e=>getComputedStyle(e).display),'table-header-group');
   assert.equal(await pdf.locator('.csPrintPeople').evaluate(e=>getComputedStyle(e).breakBefore),'page');
   assert.deepEqual(await pdf.locator('.csPrintTable th,.csPrintTable td').evaluateAll(cells=>cells.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent)),[],'No clipped or overlapping cells');
   if(!process.env.RODA_CALL_PRINT_FIXTURE){
    assert.equal(await pdf.locator('.csPrintTable--cast tbody tr').count(),2);
    const actor=pdf.locator('.csPrintTable--cast tbody tr').filter({hasText:'Elena Fernández'});
    assert.match(await actor.textContent(),/ANA · BETO[\s\S]*08:20[\s\S]*08:45[\s\S]*09:25/);
    assert.match(await pdf.locator('.csPrintTable--crew').textContent(),/Pablo Pérez[\s\S]*07:40[\s\S]*\+54 11 5555 1234/);
    assert.equal(await pdf.locator('.csPrintTable--cast thead tr').last().locator('th').count(),process.env.RODA_CALL_PRINT_EXTRAS?6:4,'Transport columns shown only when enabled');
    if(process.env.RODA_CALL_PRINT_EXTRAS){assert.match(await actor.textContent(),/07:10[\s\S]*08:20[\s\S]*08:35/);assert.match(await pdf.locator('.csPrintTable--crew').textContent(),/07:00[\s\S]*07:40/);}
   }
   await pdf.pdf({path:path.join(output,name+'.pdf'),preferCSSPageSize:true,printBackground:true});
   await pdf.pdf({path:path.join(output,name+'-sin-fondos.pdf'),preferCSSPageSize:true,printBackground:false});
   await pdf.screenshot({path:path.join(output,name+'.png'),fullPage:true});await pdf.close();
   assert.equal(await page.evaluate(()=>JSON.stringify(savedState.shootDays)),before,'Printing must not change timings');
   assert.equal(await page.evaluate(()=>savedWrites),writes,'Printing must not save the project');
   assert.equal(await page.locator('#gbPrintRoot').textContent(),'');
   assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('gbPrintingCallsheet')),false);
   await page.evaluate(()=>{window.printSnapshot=null;});
  }
  await page.getByRole('button',{name:'Call Diario',exact:true}).click();await page.locator('#btnOpenCallSheet').click();await inspectPrint('call-diario');
  await page.getByRole('button',{name:'REPORTES',exact:true}).click();await page.locator('#reportTabs [data-tab="callsheet"]').click();await page.locator('#btnPrintCallSheet').click();await inspectPrint('call-reportes');
  assert.deepEqual(errors,[]);console.log('OK: Call Diario and Reports print, grouped roles, manual calls, contacts and notes preserved, repeated headings, intact rows, 12mm margins, no timing changes or saves. PDFs: '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
