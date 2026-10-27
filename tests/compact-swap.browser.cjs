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
  const seed={meta:{version:14,title:'PRUEBA DE INTERCAMBIO',updatedAt:new Date().toISOString()},scenes:['before','a','middle','b','after'].map((id,i)=>({id,number:i+1,slugline:'INT. SALA '+id.toUpperCase()+' - DÍA',elements:{cast:[]}})),crew:[],project:{},shootDays:[{id:'day',date:'2026-11-05',callTime:'08:00',sceneIds:['before','a','middle','b','after'],times:{before:0,a:15,middle:105,b:135,after:195},durations:{before:15,a:30,middle:20,b:60,after:30},castCallTimes:{LUCIA:'07:30'},blocks:[{id:'meal',startMin:60,durMin:45,title:'Almuerzo',detail:'',blockType:'lunch',color:'#fb7500'}]},{id:'day2',date:'2026-11-06',callTime:'10:00',sceneIds:['other'],times:{other:0},durations:{other:45},blocks:[]}]};seed.scenes.push({id:'other',number:6,slugline:'INT. OTRO DÍA',elements:{cast:[]}});
  const longIds=Array.from({length:25},(_,i)=>'long'+i);seed.scenes.push(...longIds.map((id,i)=>({id,number:20+i,slugline:'INT. PRUEBA LARGA '+i,elements:{cast:[]}})));seed.shootDays.push({id:'longday',date:'2026-11-07',callTime:'08:00',sceneIds:longIds,times:Object.fromEntries(longIds.map((id,i)=>[id,i*15])),durations:Object.fromEntries(longIds.map(id=>[id,15])),blocks:[]});
  for(const day of seed.shootDays)Object.assign(day,{night:false,shotsDone:{},sceneColors:{},castCallTime:'',castPickUpTimes:{},castRTSTimes:{},crewAreaCallTimes:{},crewCallTimes:{},crewIds:[],crewPickUpTimes:{},pickupCastEnabled:false,pickupCastOffsetMin:-30,pickupCrewEnabled:false,pickupCrewOffsetMin:-30,rtsEnabled:false,rtsOffsetMin:60,castCallTimes:day.castCallTimes||{}});
  await page.evaluate(data=>{
   sessionStorage.setItem('gb_edit_unlocked__default','1');
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
  let baseline=await page.evaluate(()=>structuredClone(savedState));
  const current=()=>page.evaluate(()=>structuredClone(savedState));
  const writes=()=>page.evaluate(()=>savedWrites);
  await page.getByRole('button',{name:'Plan de Rodaje',exact:true}).click();await page.locator('#dayplanView').selectOption('compact');
  await page.locator('.navBtn[data-view="schedule"]').click();await page.locator('.navBtn[data-view="dayplan"]').click();
  const daily=id=>page.locator('#dpLane .dpBlock[data-id="'+id+'"]'),general=id=>page.locator('#schedBoard .schedBlock[data-item-id="'+id+'"]');
  async function begin(source,target){
    const a=await source.boundingBox(),b=await target.boundingBox();
    await page.mouse.move(a.x+100,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+100,b.y+b.height/2,{steps:8});
    assert.equal(await target.evaluate(el=>el.classList.contains('swap-target')),true);
    assert.equal(await source.evaluate(el=>getComputedStyle(el).zIndex),'60');
  }
  await daily('a').click();await page.locator('#dpCloseInspector').click();baseline=await current();const startWrites=await writes();
  await begin(daily('a'),daily('b'));
  await page.screenshot({path:path.join(output,'intercambio-compacto-arrastre.png')});
  await page.mouse.up();
  let saved=await current();assert.deepEqual(saved.shootDays[0].times,{before:0,a:165,middle:135,b:15,after:195});assert.deepEqual(saved.shootDays[0].durations,baseline.shootDays[0].durations);assert.equal(saved.shootDays[0].blocks[0].startMin,90);assert.deepEqual(saved.shootDays[1],baseline.shootDays[1]);assert.equal(await writes(),startWrites+1);
  assert.equal(await daily('a').locator('.dpTime').textContent(),'10:45–11:15');assert.equal(await daily('a').locator('.planDuration').textContent(),'30 min');
  await page.locator('#dpCloseInspector').click();await page.locator('.navBtn[data-view="schedule"]').click();
  await begin(general('a'),general('b'));await page.mouse.up();saved=await current();assert.deepEqual(saved.shootDays,baseline.shootDays);assert.equal(await writes(),startWrites+2);
  await page.locator('#dpCloseInspector').click();
  // Cancel with Escape, pointercancel, invalid production block, outside the list; cancel a valid cross-day preview.
  async function unchanged(action){const before=await current(),count=await writes();await action();assert.deepEqual(await current(),before);assert.equal(await writes(),count);assert.equal(await page.locator('.compact-swap-source,.swap-target').count(),0);}
  await unchanged(async()=>{await begin(general('a'),general('b'));await page.keyboard.press('Escape');await page.mouse.up();});
  await unchanged(async()=>{await begin(general('a'),general('b'));await page.locator('#schedBoard').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();});
  async function invalidDrag(source,target){const a=await source.boundingBox(),b=await target.boundingBox();await page.mouse.move(a.x+100,a.y+15);await page.mouse.down();await page.mouse.move(b.x+100,b.y+15,{steps:6});assert.equal(await target.evaluate(el=>el.classList.contains('swap-target')),false);await page.mouse.up();}
  await unchanged(()=>invalidDrag(general('a'),general('meal')));
  await unchanged(async()=>{await begin(general('a'),general('other'));await page.keyboard.press('Escape');await page.mouse.up();});
  await unchanged(async()=>{const a=await general('a').boundingBox();await page.mouse.move(a.x+100,a.y+15);await page.mouse.down();await page.mouse.move(50,100,{steps:8});await page.mouse.up();});
  // Adjacent scenes with unequal duration leave the following scene, meal and next day fixed.
  await begin(general('a'),general('before'));await page.mouse.up();saved=await current();assert.deepEqual(saved.shootDays[0].times,{before:30,a:0,middle:105,b:135,after:195});assert.deepEqual(saved.shootDays[0].durations,baseline.shootDays[0].durations);assert.equal(saved.shootDays[0].blocks[0].startMin,60);assert.deepEqual(saved.shootDays[1],baseline.shootDays[1]);
  await page.locator('#dpCloseInspector').click();
  await begin(general('a'),general('after'));await page.mouse.up();saved=await current();assert.deepEqual(saved.shootDays[0].times,{before:30,a:195,middle:105,b:135,after:0});assert.deepEqual(saved.shootDays[0].durations,baseline.shootDays[0].durations);
  await page.locator('#dpCloseInspector').click();await page.locator('.navBtn[data-view="dayplan"]').click();
  await unchanged(async()=>{
    await page.locator('#dayplanSelect').selectOption('longday');const source=daily('long0'),a=await source.boundingBox(),r=await page.locator('#dpScroller').boundingBox();
    await page.mouse.move(a.x+100,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+100,r.y+r.height-8,{steps:8});
    await page.waitForFunction(()=>document.getElementById('dpScroller').scrollTop>180);
    await page.keyboard.press('Escape');await page.mouse.up();await page.locator('#dayplanSelect').selectOption('day');
  });
  await page.screenshot({path:path.join(output,'intercambio-compacto-resultado.png')});
  if(studio){
    await begin(daily('a'),daily('b'));await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:{planning:'read'}};RodaAccess.apply();});
    const before=await current(),count=await writes();await page.mouse.up();assert.deepEqual(await current(),before);assert.equal(await writes(),count);
    await unchanged(()=>invalidDrag(daily('a'),daily('b')));await daily('a').click();assert.equal(await page.locator('#dpi_time').isEnabled(),false);
  }
  assert.deepEqual(errors,[]);console.log('OK: compact swaps in both plans, unequal durations, adjacent/reverse swaps, unchanged interval end/later scenes/other days, cancellation, invalid targets and read-only access. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
