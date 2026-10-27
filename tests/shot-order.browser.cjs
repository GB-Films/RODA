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

  seed.scenes[0].shots=[{id:'a',type:'Plano general',desc:'Llegada',durMin:10,thumbUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'},{id:'b',type:'Primer plano',desc:'Reacción',durMin:20},{id:'c',type:'Plano detalle',desc:'Llave',durMin:5}];
  seed.shootDays[0].durations.s1=45;seed.shootDays[0].times.s2=45;seed.shootDays[0].shotsDone={'s1|a':true};
  await boot(seed);
  await page.locator('.navBtn[data-view="shotlist"]').click();
  const scene=page.locator('.shotSceneBox[data-scene-id="s1"]'),other=page.locator('.shotSceneBox[data-scene-id="s2"]');
  await scene.locator('.shotSceneToggle').click();await other.locator('.shotSceneToggle').click();await other.locator('.shotAddBtn').click();
  const row=id=>scene.locator('tr[data-shot-id="'+id+'"]');
  const grip=id=>row(id).locator('.shotDragHandle');
  const order=()=>scene.locator('tbody tr[data-shot-id]').evaluateAll(ns=>ns.map(n=>n.dataset.shotId));
  const clocks=()=>scene.locator('.shotTime').allTextContents();
  const saved=()=>page.evaluate(()=>structuredClone(savedState));
  const baseline=await saved();const initialShots=structuredClone(baseline.scenes[0].shots);
  const assertSafe=async()=>{const data=await saved();assert.deepEqual(data.shootDays,baseline.shootDays,'reordering never changes the shooting plan or completion IDs');assert.deepEqual([...data.scenes[0].shots].sort((a,b)=>a.id.localeCompare(b.id)),initialShots,'durations, descriptions and references stay with the same IDs');assert.deepEqual(data.scenes.slice(1),baseline.scenes.slice(1));};
  const drag=async(from,to,after)=>{const a=await grip(from).boundingBox(),b=await row(to).boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+50,after?b.y+b.height-6:b.y+6,{steps:8});assert.equal(await scene.locator('.shotDragging').count(),1);assert.equal(await scene.locator(after?'.shotDropAfter':'.shotDropBefore').count(),1);await page.mouse.up();};
  assert.deepEqual(await order(),['a','b','c']);
  await drag('c','a',false);assert.deepEqual(await order(),['c','a','b']);assert.deepEqual((await clocks()).slice(1),['08:00','08:05','08:15']);await assertSafe();
  assert.equal(await row('a').locator('input[type=checkbox]').isChecked(),true);assert.equal(await row('a').locator('.shotThumbImg').getAttribute('src'),initialShots[0].thumbUrl);
  await drag('c','b',true);assert.deepEqual(await order(),['a','b','c']);assert.deepEqual((await clocks()).slice(1),['08:00','08:10','08:30']);await assertSafe();
  await grip('b').press('ArrowUp');assert.deepEqual(await order(),['b','a','c']);assert.deepEqual((await clocks()).slice(1),['08:00','08:20','08:30']);await assertSafe();
  await grip('b').press('ArrowDown');assert.deepEqual(await order(),['a','b','c']);
  // Escape, an outside drop, and simply pressing the handle are all non-mutating.
  let writes=await page.evaluate(()=>savedWrites);
  const a=await grip('a').boundingBox(),c=await row('c').boundingBox();
  await page.mouse.move(a.x+5,a.y+5);await page.mouse.down();await page.mouse.move(c.x+50,c.y+c.height-6,{steps:6});await page.keyboard.press('Escape');await page.mouse.up();
  assert.deepEqual(await order(),['a','b','c']);assert.equal(await scene.locator('.shotDragging,.shotDropAfter,.shotDropBefore').count(),0);
  const destination=await other.locator('.shotSceneHead').boundingBox();await page.mouse.move(a.x+5,a.y+5);await page.mouse.down();await page.mouse.move(destination.x+50,destination.y+10,{steps:8});await page.mouse.up();assert.deepEqual(await order(),['a','b','c']);
  await grip('a').click();await grip('a').press('ArrowUp');assert.equal(await page.evaluate(()=>savedWrites),writes);await assertSafe();
  await page.setViewportSize({width:780,height:1000});
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
  await grip('a').scrollIntoViewIfNeeded();await drag('a','b',true);
  assert.deepEqual(await order(),['b','a','c']);await assertSafe();
  const fit=await scene.locator('.tableWrap').evaluate(n=>({width:n.clientWidth,content:n.scrollWidth}));assert.ok(fit.content<=fit.width+1);
  await page.screenshot({path:path.join(output,'shotlist-reordenar.png')});
  await page.setViewportSize({width:1600,height:1000});
  // Duration edits still recompute following shot clocks after the reordered sequence.
  await row('b').locator('.shotDurSel').selectOption('15');assert.deepEqual((await clocks()).slice(1),['08:00','08:15','08:25']);
  await page.locator('#btnShotPrint').click();await page.waitForFunction(()=>!!window.printSnapshot);const print=await page.evaluate(()=>new DOMParser().parseFromString(printSnapshot,'text/html').querySelector('#gbPrintRoot').textContent);assert.ok(print.indexOf('Reacción')<print.indexOf('Llegada'),'printed shot order follows the stored order');
  // The persisted order survives a full app reload.
  const persisted=await saved();await page.reload();await boot(persisted);await page.locator('.navBtn[data-view="shotlist"]').click();await scene.locator('.shotSceneToggle').click();assert.deepEqual(await order(),['b','a','c']);assert.deepEqual((await clocks()).slice(1),['08:00','08:15','08:25']);
  if(studio){
    await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:Object.fromEntries(['script','breakdown','locations','cast','planning','shotlist','crew','reports'].map(k=>[k,'read']))};RodaAccess.apply();});
    assert.equal(await grip('b').isEnabled(),false);writes=await page.evaluate(()=>savedWrites);
    await grip('b').dispatchEvent('keydown',{key:'ArrowDown'});assert.deepEqual(await order(),['b','a','c']);assert.equal(await page.evaluate(()=>savedWrites),writes);
    await page.evaluate(()=>{RODA_STUDIO.canEdit=true;RODA_STUDIO.project.rodaAccess.sections.shotlist='edit';RodaAccess.apply();});
    await grip('a').press('ArrowUp');assert.deepEqual(await order(),['a','b','c'],'Shotlist editors can reorder without needing Planning edit access');
    assert.deepEqual((await saved()).shootDays,persisted.shootDays);
  }
  // Concurrent edits to a shot survive an independent reorder of the same scene.
  require(path.join(appRoot,'js','collaboration.js'));
  const local=structuredClone(baseline),remote=structuredClone(baseline);
  local.scenes[0].shots.reverse();remote.scenes[0].shots[1].desc='Cambio de otra persona';remote.scenes[0].shots[1].durMin=25;
  const merged=globalThis.Collaboration.mergeProject(baseline,local,remote);
  assert.deepEqual(merged.scenes[0].shots.map(s=>s.id),['c','b','a']);
  assert.equal(merged.scenes[0].shots[1].desc,'Cambio de otra persona');assert.equal(merged.scenes[0].shots[1].durMin,25);
  assert.deepEqual(errors,[]);console.log('PASS: pointer/keyboard shot reordering, variable durations and clocks, cancellation, cross-scene protection, persisted order, stable shot IDs and completion, responsive layout, print and permissions. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
