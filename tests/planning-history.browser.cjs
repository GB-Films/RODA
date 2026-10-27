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
  const seed={meta:{version:14,title:'PRUEBA ENTRE JORNADAS',updatedAt:new Date().toISOString()},scenes:['pre','a','later','b','next','untouched'].map((id,i)=>({id,number:i+1,slugline:'INT. SALA '+id.toUpperCase()+' - DÍA',elements:{cast:[]}})),crew:[],project:{},shootDays:[{id:'day',date:'2026-11-05',callTime:'08:00',sceneIds:['pre','a','later'],times:{pre:0,a:30,later:60},durations:{pre:15,a:30,later:45},blocks:[{id:'meal',startMin:105,durMin:45,title:'Almuerzo',detail:'',blockType:'lunch',color:'#8b9ba9'}],sceneColors:{a:'#ff0000'},shotsDone:{a:{one:true}}},{id:'day2',date:'2026-11-06',callTime:'10:00',sceneIds:['b','next'],times:{b:0,next:15},durations:{b:15,next:60},blocks:[{id:'setup',startMin:75,durMin:30,title:'Armado técnico',detail:'',blockType:'setup',color:'#7898ad'}],sceneColors:{b:'#22c55e'},shotsDone:{b:false}},{id:'third',date:'2026-11-07',callTime:'08:00',sceneIds:['untouched'],times:{untouched:30},durations:{untouched:30},blocks:[]}]};
  for(const day of seed.shootDays)Object.assign(day,{night:false,shotsDone:day.shotsDone||{},sceneColors:day.sceneColors||{},castCallTime:'',castPickUpTimes:{},castRTSTimes:{},crewAreaCallTimes:{},crewCallTimes:{},crewIds:[],crewPickUpTimes:{},pickupCastEnabled:false,pickupCastOffsetMin:-30,pickupCrewEnabled:false,pickupCrewOffsetMin:-30,rtsEnabled:false,rtsOffsetMin:60,castCallTimes:{ANA:'07:30'}});
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
  if(studio)await page.evaluate(()=>{StorageLayer.sharedRevisions=()=>({core:0,script:0});window.RodaTeamSync={create:options=>{window.testTeam=options;return {notify(){},refresh(){},async flush(){}};}};});
  for(const f of ['dialogs','roda-policy','roda-access','cast','script-pages','script-document','screenplay','script-revisions','script-history','utils','day-swap','production-blocks','collaboration','live-view','planning-history','app'].filter(f=>fs.existsSync(path.join(appRoot,'js',f+'.js'))))await page.addScriptTag({url:'js/'+f+'.js'});
  await page.waitForFunction(isStudio=>isStudio?!!window.RODA_READY:!document.body.classList.contains('bootLoading'),studio);await page.evaluate(()=>{document.querySelector('.shell').hidden=false;window.RodaAccess?.bind();});
  }
  await boot(seed);
  const current=()=>page.evaluate(()=>structuredClone(savedState)),layout=state=>JSON.stringify(state.shootDays,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
  await page.getByRole('button',{name:'Plan de Rodaje',exact:true}).click();await page.locator('#dayplanView').selectOption('compact');
  const daily=id=>page.locator('#dpLane .dpBlock[data-id="'+id+'"]'),general=id=>page.locator('#schedBoard .schedBlock[data-item-id="'+id+'"]');
  assert.equal(await page.locator('#btnDayplanUndo').isEnabled(),false);assert.equal(await page.locator('#btnDayplanRedo').isEnabled(),false);
  await page.locator('.navBtn[data-view="schedule"]').click();await page.locator('.navBtn[data-view="dayplan"]').click();
  await daily('a').click();await page.locator('#dpCloseInspector').click();
  const before=await current();
  async function drag(source,target){const a=await source.boundingBox(),b=await target.boundingBox();await page.mouse.move(a.x+90,a.y+12);await page.mouse.down();await page.mouse.move(b.x+90,b.y+18,{steps:10});await page.mouse.up();}
  await drag(daily('a'),daily('later'));const after=await current();assert.notEqual(layout(after),layout(before));assert.equal(await page.locator('#btnDayplanUndo').isEnabled(),true);
  await page.locator('#dpCloseInspector').click();await page.locator('.navBtn[data-view="schedule"]').click();
  await page.locator('#btnSchedUndo').click();assert.equal(layout(await current()),layout(before));assert.equal(await page.locator('#btnSchedRedo').isEnabled(),true);
  await page.keyboard.press('Control+Shift+Z');assert.equal(layout(await current()),layout(after));
  await page.keyboard.press('Control+Z');assert.equal(layout(await current()),layout(before));
  await page.keyboard.press('Control+Y');assert.equal(layout(await current()),layout(after));
  await page.locator('#btnSchedUndo').click();assert.equal(layout(await current()),layout(before));
  // New cross-day edit clears the earlier redo branch and is undone from the other view.
  await drag(general('a'),general('b'));const crossed=await current();assert.equal(await page.locator('#btnSchedRedo').isEnabled(),false);
  await page.locator('#dpCloseInspector').click();await page.locator('.navBtn[data-view="dayplan"]').click();
  await page.locator('#btnDayplanUndo').click();assert.equal(layout(await current()),layout(before));
  await page.locator('#btnDayplanRedo').click();assert.equal(layout(await current()),layout(crossed));
  // Native editing undo must not consume the project history.
  await daily('a').click();await page.locator('#dpi_time').focus();await page.keyboard.press('Control+Z');assert.equal(layout(await current()),layout(crossed));
  await page.locator('#btnDayplanUndo').click();assert.equal(layout(await current()),layout(before));
  await page.locator('#btnDayplanRedo').click();assert.equal(layout(await current()),layout(crossed));
  // Reload the same tab and origin: session history survives with its project key.
  const saved=await current();await page.reload();await boot(saved);await page.getByRole('button',{name:'Plan de Rodaje',exact:true}).click();
  assert.equal(await page.locator('#btnDayplanUndo').isEnabled(),true);await page.locator('#btnDayplanUndo').click();assert.equal(layout(await current()),layout(before));
  await page.locator('#btnDayplanRedo').click();assert.equal(layout(await current()),layout(crossed));
  // Inspector duration edits and production-block creation join the same history.
  await page.locator('#btnDayplanUndo').click();await page.locator('#dayplanSelect').selectOption('day');await page.locator('#dayplanView').selectOption('timeline');
  await daily('a').click();await page.locator('#dpi_dur_m').selectOption('45');const durationChanged=await current();assert.notEqual(layout(durationChanged),layout(before));
  await page.locator('#btnDayplanUndo').click();assert.equal(layout(await current()),layout(before));await page.locator('#btnDayplanRedo').click();assert.equal(layout(await current()),layout(durationChanged));await page.locator('#btnDayplanUndo').click();
  await page.locator('#dayplanBlockMenu summary').click();await page.locator('[data-production-block="break"]').click();const blockAdded=await current();assert.equal(blockAdded.shootDays[0].blocks.length,before.shootDays[0].blocks.length+1);
  await page.locator('#btnDayplanUndo').click();assert.equal(layout(await current()),layout(before));await page.locator('#btnDayplanRedo').click();assert.equal(layout(await current()),layout(blockAdded));await page.locator('#btnDayplanUndo').click();
  await page.locator('#dayplanView').selectOption('compact');await page.locator('.navBtn[data-view="schedule"]').click();await drag(general('a'),general('b'));await page.locator('#dpCloseInspector').click();await page.locator('.navBtn[data-view="dayplan"]').click();
  if(studio){
    // Exercise the real app's remote-apply callback, rather than replacing local state.
    await page.evaluate(()=>{const next=structuredClone(savedState);next.shootDays[0].notes='Nota remota que debe conservarse';testTeam.apply(next,{data:{parts:{core:{meta:{updatedAt:'remote'}},script:{meta:{updatedAt:'remote'}}}}});});
    await page.locator('#btnDayplanUndo').click();let state=await current();assert.equal(state.shootDays[0].notes,'Nota remota que debe conservarse');assert.deepEqual(state.shootDays[0].times,before.shootDays[0].times);
    await page.locator('#btnDayplanRedo').click();
    await page.evaluate(()=>{const next=structuredClone(savedState);next.shootDays[1].times.a=300;testTeam.apply(next,{data:{parts:{core:{meta:{updatedAt:'remote2'}},script:{meta:{updatedAt:'remote2'}}}}});});
    const concurrent=layout(await current());await page.locator('#btnDayplanUndo').click();assert.equal(layout(await current()),concurrent);assert.equal(await page.locator('#btnDayplanUndo').isEnabled(),false);
    await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:{planning:'read'}};RodaAccess.apply();});assert.equal(await page.locator('#btnDayplanUndo').isEnabled(),false);
  }
  await page.setViewportSize({width:900,height:1000});await page.locator('.navBtn[data-view="schedule"]').click();const historyBounds=await page.locator('#btnSchedRedo').boundingBox();assert.ok(historyBounds.x+historyBounds.width<=900);
  await page.screenshot({path:path.join(output,'historial-plan-publico-prueba.png')});
  assert.deepEqual(errors,[]);console.log('OK: shared undo/redo, exact same/cross-day timings and metadata, keyboard/native fields, new branches, session reload, remote conflict protection and reader permissions. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
