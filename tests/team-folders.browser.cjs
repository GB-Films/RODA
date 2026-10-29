const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),studio=fs.existsSync(path.join(root,'roda/index.html')),appRoot=studio?path.join(root,'roda'):root;
const output=process.env.RODA_TEAM_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'roda-team-folders-'));
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
  const seed={meta:{version:14,title:'PRUEBA EQUIPO',updatedAt:new Date().toISOString()},project:{},crew:[]};
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




 seed.crew=[{id:'director',area:'Direccion',role:'Director',name:'Diego Ejemplo'},{id:'assistant',area:'Direccion',role:'Asistente',name:'Laura Ejemplo'},
  {id:'actor1',area:'Cast',castPerson:true,role:'Actor / actriz',name:'Ana Pérez'},{id:'actor2',area:'Cast',castPerson:true,role:'Actor / actriz',name:'Bruno Ejemplo'},
  {id:'profile',area:'Cast',castProfile:true,role:'PROTAGONISTA',actorId:'actor1'},{id:'photo',area:'Foto',role:'Cámara',name:'Clara Ejemplo'}];
 seed.scenes=[{id:'s1',number:1,slugline:'INT. CASA - DÍA',elements:{cast:['PROTAGONISTA']}}];
 seed.shootDays=[{id:'day',date:'2026-11-05',label:'Día 1',callTime:'08:00',sceneIds:['s1'],times:{s1:0},durations:{s1:60},blocks:[],crewIds:['director']}];
 await boot(seed);await page.locator('.navBtn[data-view="crew"]').click();
 const initial=await page.evaluate(()=>JSON.stringify(savedState)),writes=await page.evaluate(()=>savedWrites);
 const group=area=>page.locator('.crewGroupToggle').filter({hasText:new RegExp('^'+(area==='Cast'?'[▸▾]Cast': '[▸▾]'+area))});
 assert.equal(await group('Cast').getAttribute('aria-expanded'),'true');assert.match(await group('Cast').textContent(),/2 integrantes/);
 await page.locator('[data-crew-id="actor1"] .crewExpander').click();assert.equal(await page.locator('.crewDetailRow:visible').count(),1);
 await group('Cast').click();assert.equal(await page.locator('[data-crew-id="actor1"]').isVisible(),false);assert.equal(await page.locator('.crewDetailRow:visible').count(),0);
 assert.equal(await page.locator('[data-crew-id="director"]').isVisible(),true);
 await group('Cast').press('Enter');assert.equal(await page.locator('[data-crew-id="actor1"]').isVisible(),true);assert.equal(await page.locator('.crewDetailRow:visible').count(),1);
 await group('Cast').press('Space');
 await page.locator('.navBtn[data-view="elements"]').click();await page.locator('.navBtn[data-view="crew"]').click();assert.equal(await group('Cast').getAttribute('aria-expanded'),'false');
 await page.locator('#crewSearch').fill('Ana');assert.equal(await page.locator('[data-crew-id="actor1"]').isVisible(),true);assert.match(await group('Cast').textContent(),/1 integrante/);
 await page.locator('#crewSearch').fill('');assert.equal(await group('Cast').getAttribute('aria-expanded'),'false');
 await page.evaluate(()=>RODA_STUDIO.project.id='another-project');await page.locator('#crewAreaFilter').selectOption('Cast');assert.equal(await group('Cast').getAttribute('aria-expanded'),'true','Collapse preference is scoped to project');
 await page.evaluate(()=>delete RODA_STUDIO.project.id);await page.locator('#crewAreaFilter').selectOption('all');assert.equal(await group('Cast').getAttribute('aria-expanded'),'false');
 assert.equal(await page.evaluate(()=>JSON.stringify(savedState)),initial);assert.equal(await page.evaluate(()=>savedWrites),writes,'Folding never saves project data');
 await page.reload();await boot(seed);await page.locator('.navBtn[data-view="crew"]').click();assert.equal(await group('Cast').getAttribute('aria-expanded'),'false','Preference survives reload');
 await group('Direccion').click();await page.screenshot({path:path.join(output,'team-collapsed.png')});
 await page.locator('#btnAddCast').click();assert.equal(await group('Cast').getAttribute('aria-expanded'),'true','Adding a person reveals the destination area');assert.match(await group('Cast').textContent(),/3 integrantes/);
 await page.locator('[data-crew-id="photo"] select').selectOption('Direccion');assert.equal(await group('Direccion').getAttribute('aria-expanded'),'true','Moving a person reveals the destination area');
 await page.locator('[data-crew-id="photo"]').getByLabel('Nombre',{exact:true}).fill('Clara editada');assert.ok((await page.evaluate(()=>savedState.crew.find(c=>c.id==='photo').name)).includes('Clara editada'));
 if(studio){
 await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:{crew:'read',cast:'read'}};RodaAccess.apply();});
 assert.equal(await group('Cast').isEnabled(),true);await group('Cast').click();await group('Cast').click();assert.equal(await page.locator('[data-crew-id="actor1"]').getByLabel('Nombre',{exact:true}).isEnabled(),false);
 }
 await page.setViewportSize({width:390,height:844});await group('Direccion').click();assert.equal(await group('Direccion').getAttribute('aria-expanded'),'false');
 assert.deepEqual(errors,[]);console.log('PASS per-area disclosure, counts, nested details, keyboard, search, navigation/reload, project isolation, add/move/edit and reader access. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
