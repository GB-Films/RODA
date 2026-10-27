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
  const seed={meta:{version:14,title:'PROYECTO DEMOSTRACIÓN',updatedAt:new Date().toISOString()},scenes,crew:[],project:{},shootDays:[{id:'day',date:'2026-11-05',label:'Día 1 · Edificio',location:'EDIFICIO',callTime:'08:00',sceneIds:scenes.map(s=>s.id),times:Object.fromEntries(scenes.map((s,i)=>[s.id,45+i*20])),durations:Object.fromEntries(scenes.map(s=>[s.id,20])),blocks:[{id:'arrival',startMin:0,durMin:15,title:'Llegada al rodaje',blockType:'arrival'},{id:'setup',startMin:15,durMin:30,title:'Armado técnico',blockType:'setup'}]}]};
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
  async function inspectPrint(name,daily){
   await page.waitForFunction(()=>!!window.printSnapshot);
   const captured=await page.evaluate(()=>window.printSnapshot);assert.match(captured,/@page\{ size:A4 landscape; margin:12mm;/);
   const pdf=await browser.newPage({viewport:{width:1123,height:794}});await pdf.route('https://**/*',r=>r.abort());
   await pdf.emulateMedia({media:'print'});
   await pdf.setContent(captured.replace('<head>','<head><base href="http://127.0.0.1:'+server.address().port+'/roda/">').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'networkidle'});
   assert.equal(await pdf.locator('.studio-global-header').evaluate(e=>getComputedStyle(e).display),'none');
   assert.equal(await pdf.locator('.shell').evaluate(e=>getComputedStyle(e).display),'none');
   if(daily){
    assert.equal(await pdf.locator('#gbPrintRoot .dpPrintHeader h1').textContent(),seed.meta.title);
    assert.match(await pdf.locator('#gbPrintRoot .dpPrintMeta').textContent(),/08:00[\s\S]*EDIFICIO[\s\S]*20/);
    assert.equal(await pdf.locator('#gbPrintRoot .dayplanPrintTable tbody tr').count(),22);
    assert.equal(await pdf.locator('#gbPrintRoot .dayplanPrintTable tbody tr').first().evaluate(e=>getComputedStyle(e).breakInside),'avoid');
    assert.equal(await pdf.locator('#gbPrintRoot thead').evaluate(e=>getComputedStyle(e).display),'table-header-group');
    assert.equal(await pdf.locator('#gbPrintRoot').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
   }
   await pdf.pdf({path:path.join(output,name+'.pdf'),preferCSSPageSize:true,printBackground:true});
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
  assert.deepEqual(errors,[]);console.log('OK: three print routes, shared navigation hidden, project header, 12mm margins, repeated table headings, intact rows, no timing changes or saves. PDFs: '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
