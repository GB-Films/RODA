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


  seed.scenes[0].shots=[{id:'own',type:'Plano general',desc:'Local',durMin:5}];
  seed.scenes[2].shots=[{id:'insert',type:'Primer plano',desc:'Intercut',durMin:10,shootingSceneId:'s1'}];
  seed.shootDays[0].shotsDone={'s3|insert':true};
  await boot(seed);await page.locator('.navBtn[data-view="shotlist"]').click();
  const batch=page.locator('.shotSceneBox[data-scene-id="s1"]');await batch.locator('.shotSceneToggle').click();
  const row=batch.locator('tr[data-shot-id="insert"]');assert.match(await row.textContent(),/Escena original #3/);assert.equal(await row.locator('input[type=checkbox]').isChecked(),true);
  await row.locator('.shotDragHandle').press('ArrowUp');assert.deepEqual(await batch.locator('tbody tr[data-shot-id]').evaluateAll(ns=>ns.map(n=>n.dataset.shotId)),['insert','own']);
  let state=await page.evaluate(()=>structuredClone(savedState));assert.deepEqual(state.scenes[2].shots.map(sh=>sh.id),['insert']);assert.deepEqual(state.scenes[0].shots.map(sh=>sh.id),['own']);
  const baseDays=structuredClone(state.shootDays);
  await row.locator('.shotBatchFields summary').click();await row.locator('.shotBatchSelect').selectOption('s3');
  state=await page.evaluate(()=>structuredClone(savedState));assert.equal(state.scenes[2].shots[0].shootingSceneId,undefined);assert.equal(state.shootDays[1].shotsDone['s3|insert'],true);assert.equal(state.shootDays[0].shotsDone['s3|insert'],undefined);
  assert.deepEqual(state.shootDays.map(d=>({id:d.id,t:d.times,u:d.durations})),baseDays.map(d=>({id:d.id,t:d.times,u:d.durations})));
  assert.equal(await batch.locator('tr[data-shot-id="insert"]').count(),0);
  await page.locator('.dayPicker > summary').click();await page.locator('.dayPickerOption[data-day="d2"]').click();const second=page.locator('.shotSceneBox[data-scene-id="s3"]');await second.locator('.shotSceneToggle').click();assert.equal(await second.locator('tr[data-shot-id="insert"]').count(),1);
  await page.locator('#btnShotPrint').click();assert.match(await page.evaluate(()=>printSnapshot),/Escena original #3/);
  assert.deepEqual(errors,[]);console.log('PASS original scene ownership, cross-day batch selection, completion, times, print and mixed-owner ordering');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
