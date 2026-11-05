const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),studio=fs.existsSync(path.join(root,'roda/index.html')),appRoot=studio?path.join(root,'roda'):root;
const output=process.env.RODA_LOGISTICS_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'roda-logistics-'));
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
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.request().url().includes('photon.komoot.io')?r.fulfill({contentType:'application/json',body:JSON.stringify({features:[{geometry:{coordinates:[-58.4,-34.6]},properties:{name:'Dirección de prueba',city:'Buenos Aires'}}]})}):r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/roda/');
  async function boot(data){
  await page.evaluate(data=>{
   sessionStorage.setItem('gb_edit_unlocked__default','1');
   document.querySelector('.shell').hidden=false;document.body.classList.add('roda-studio');document.body.classList.remove('studio-tool-locked');
   let header=document.querySelector('.studio-global-header');if(!header){header=document.createElement('header');document.body.prepend(header);}
   header.className='studio-global-header studio-shared-header';header.innerHTML='<button>Tus proyectos</button><button>Aplicaciones</button><button>Cuenta privada</button>';
   window.RODA_STUDIO={canEdit:true,project:{rodaAccess:{admin:true,sections:Object.fromEntries(['script','breakdown','locations','cast','planning','shotlist','crew','reports','logistics'].map(k=>[k,'edit']))}}};
   window.savedState=structuredClone(data);window.savedWrites=0;window.resolvedMaps=[];
   window.StorageLayer=new Proxy({loadCfg:()=>({backend:'local',projects:[]}),loadLocal:()=>data,getProjects:()=>[],saveLocal:s=>{window.savedState=structuredClone(s);window.savedWrites++;},resolveMapsLink:async url=>{window.resolvedMaps.push(url);return {geo:{lat:-34.61,lng:-58.39,label:'Punto compartido de prueba'},query:''};}}, {get:(target,key)=>target[key]||(()=>null)});
   window.print=()=>{window.printSnapshot=document.documentElement.outerHTML;};
  },data);
  // Reproduce the shared header's !important display rule, also in standalone Roda.
  await page.addStyleTag({content:'.studio-global-header.studio-shared-header{display:flex!important;background:#050505;color:white;}'});
  for(const f of ['vendor/leaflet/leaflet','logistics','logistics-view','call-sheet','dialogs','roda-policy','roda-access','cast','script-pages','script-document','screenplay','script-revisions','script-history','form-autosave','utils','day-swap','production-blocks','day-navigation','app'].filter(f=>fs.existsSync(path.join(appRoot,'js',f+'.js')))){await page.addScriptTag({url:'js/'+f+'.js'});if(f==='vendor/leaflet/leaflet')await page.evaluate(()=>L.Map.addInitHook(function(){window.qaMap=this;}));}
  await page.waitForFunction(isStudio=>isStudio?!!window.RODA_READY:!document.body.classList.contains('bootLoading'),studio);await page.evaluate(()=>{document.querySelector('.shell').hidden=false;window.RodaAccess?.bind();});
  }

 const seed={meta:{version:14,title:'LOGÍSTICA',updatedAt:new Date().toISOString()},project:{},crew:[{id:'actor',area:'Cast',castPerson:true,name:'Ana Prueba',firstName:'Ana',lastName:'Prueba',address:'Calle ficticia 100, Buenos Aires'},{id:'profile',area:'Cast',castProfile:true,role:'HERO',actorId:'actor'},{id:'tech',area:'Foto',name:'Caro Técnica',firstName:'Caro',lastName:'Técnica',address:'Calle ficticia 200, Buenos Aires'}],scenes:[{id:'s1',number:'1',slugline:'INT. SET - DÍA',elements:{cast:['HERO']},shots:[],shootingLocationId:'loc'}],script:{versions:[],activeVersionId:null,castAliases:[]},shootDays:[{id:'d1',date:'2026-11-05',label:'Jueves',sceneIds:['s1'],crewIds:['tech'],times:{s1:0},durations:{s1:60},blocks:[]},{id:'d2',date:'2026-11-06',label:'Viernes',sceneIds:[],crewIds:['tech'],blocks:[]}],shootingLocations:[{id:'loc',name:'Estudio de prueba',address:'Calle ficticia 300, Buenos Aires'}]};
 await boot(seed);await page.locator('.navBtn[data-view="crew"]').click();
 await page.locator('[data-crew-id="tech"]').getByLabel('Dirección').fill('https://maps.app.goo.gl/example');assert.equal(await page.locator('[data-crew-id="tech"] [data-crew-map]').getAttribute('href'),'https://maps.app.goo.gl/example');await page.locator('[data-crew-id="tech"]').getByLabel('Dirección').fill('javascript:alert(1)');assert.equal(await page.locator('[data-crew-id="tech"] [data-crew-map]').isVisible(),false);await page.locator('[data-crew-id="tech"]').getByLabel('Dirección').fill('Nueva dirección de prueba');assert.match(await page.locator('[data-crew-id="tech"] [data-crew-map]').getAttribute('href'),/maps\/search\/\?api=1&query=Nueva%20direcci/);await page.locator('[data-crew-id="tech"]').getByLabel('Dirección').fill('https://maps.app.goo.gl/persona');await page.locator('[data-crew-id="tech"]').getByLabel('Dirección').blur();
 await page.locator('.navBtn[data-view="logistics"]').click();await page.waitForSelector('#logMap.leaflet-container');
 assert.equal(await page.locator('[data-day="d1"] [data-person]').count(),2);assert.equal(await page.locator('[data-day="d2"] [data-person]').count(),1);
 await page.locator('#dayNavigation summary').click();await page.locator('#dayNavigation [data-day="d1"]').click();assert.equal(await page.locator('#logDays [data-day]').count(),1);
 await page.locator('[data-add-vehicle]').click();await page.locator('dialog [name="name"]').fill('Traffic 1');await page.locator('dialog [name="type"]').selectOption('traffic');await page.locator('dialog [name="capacity"]').fill('1');await page.locator('dialog button[type="submit"]').click();
 const vehicle=await page.locator('[data-vehicle]').getAttribute('data-vehicle');await page.locator('[data-person="actor"] [data-assign]').selectOption('v:'+vehicle);await page.locator('[data-person="tech"] [data-assign]').selectOption('v:'+vehicle);assert.equal(await page.locator('[data-person="tech"] [data-assign]').inputValue(),'pending');
 await page.locator('#logDirection').selectOption('vuelta');assert.equal(await page.locator('[data-vehicle]').count(),0);await page.locator('#logDirection').selectOption('ida');assert.equal(await page.locator('[data-person="actor"] [data-assign]').inputValue(),'v:'+vehicle);
 await page.locator('#logAddPoint').click();await page.locator('dialog [name="name"]').fill('Plaza de encuentro');await page.locator('dialog [name="address"]').fill('Plaza de prueba');await page.locator('dialog button[type="submit"]').click();
 await page.locator('[data-person="actor"] [data-pickup]').click();await page.locator('dialog [name="pointId"]').selectOption({label:'Plaza de encuentro'});await page.locator('dialog [name="time"]').fill('07:30');await page.locator('dialog button[type="submit"]').click();assert.match(await page.locator('[data-person="actor"]').textContent(),/Plaza de encuentro.*07:30/);
 await page.waitForFunction(()=>savedState.logistics?.geocodes?.['location:loc']);await page.waitForFunction(()=>savedState.logistics?.geocodes?.['person:tech']?.address==='https://maps.app.goo.gl/persona');assert.equal(await page.evaluate(()=>savedState.logistics.geocodes['person:tech'].lat),-34.61);assert.deepEqual(await page.evaluate(()=>resolvedMaps),['https://maps.app.goo.gl/persona']);assert.ok(await page.locator('.log-pin.location').count());assert.ok(await page.locator('.log-pin.cast').count());assert.ok(await page.locator('.log-pin.crew').count());
 await page.locator('#logPlacePoint').click();await page.locator('#logMap').click({position:{x:100,y:100}});await page.locator('dialog [name="name"]').fill('Salida en plaza');await page.locator('dialog button[type="submit"]').click();assert.equal(await page.evaluate(()=>Object.values(savedState.logistics.geocodes).filter(g=>g.confirmed).length),1);assert.ok(await page.locator('.log-pin.point').count());
 // Let the last synthetic geocode finish before checking the real wheel interaction.
 await page.waitForFunction(()=>Object.values(savedState.logistics.geocodes).length>=5);
 await page.locator('#logMap').hover();
 const start=await page.evaluate(()=>({zoom:qaMap.getZoom(),scroll:document.querySelector('#view-logistics').scrollTop}));
 await page.mouse.wheel(0,-240);await page.waitForFunction(z=>qaMap.getZoom()>z,start.zoom);
 assert.equal(await page.evaluate(()=>document.querySelector('#view-logistics').scrollTop),start.scroll);
 await page.waitForFunction(()=>!qaMap._animatingZoom);const closer=await page.evaluate(()=>qaMap.getZoom());await page.mouse.wheel(0,240);await page.waitForFunction(z=>qaMap.getZoom()<z,closer);
 assert.equal(await page.evaluate(()=>document.querySelector('#view-logistics').scrollTop),start.scroll);
 await page.screenshot({path:path.join(output,'logistics-desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);await page.waitForFunction(()=>document.querySelector('#view-logistics').scrollWidth<=document.querySelector('#view-logistics').clientWidth+1);if(studio)assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-crew-id="tech"] > td:nth-child(7)'), '::before').content),'"Dirección"');await page.screenshot({path:path.join(output,'logistics-mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const saved=await page.evaluate(()=>structuredClone(savedState));assert.equal(saved.crew.find(p=>p.id==='tech').address,'https://maps.app.goo.gl/persona');assert.equal(saved.logistics.days.d1.ida.assignments.actor.vehicleId,vehicle);
 await page.setViewportSize({width:1600,height:1000});await page.reload();await boot(saved);await page.locator('.navBtn[data-view="logistics"]').click();assert.deepEqual(await page.evaluate(()=>resolvedMaps),[]);assert.equal(await page.locator('[data-day="d1"] [data-person="actor"] [data-assign]').inputValue(),'v:'+vehicle);
 if(studio){await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:{logistics:'read'}};RodaAccess.apply();});assert.equal(await page.locator('[data-person="actor"] [data-assign]').isEnabled(),false);assert.equal(await page.locator('#logDirection').isEnabled(),true);}
 assert.deepEqual(errors,[]);console.log('PASS logistics map, distinct markers, geocoding, roster, addresses, shared day, capacity, return trip, meeting pickup, persistence, responsive and read-only. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
