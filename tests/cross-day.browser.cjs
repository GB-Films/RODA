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
  const current=()=>page.evaluate(()=>structuredClone(savedState));
  await page.getByRole('button',{name:'Plan de Rodaje',exact:true}).click();await page.locator('#dayplanView').selectOption('compact');
  await page.locator('.navBtn[data-view="schedule"]').click();
  const general=id=>page.locator('#schedBoard .schedBlock[data-item-id="'+id+'"]');
  const baseline=await current();
  async function drag(source,target){const a=await source.boundingBox(),b=await target.boundingBox();await page.mouse.move(a.x+100,a.y+12);await page.mouse.down();await page.mouse.move(b.x+100,b.y+20,{steps:10});assert.equal(await target.evaluate(el=>el.classList.contains('swap-target')),true);assert.equal(await source.evaluate(el=>getComputedStyle(el).zIndex),'60');await page.mouse.up();}
  await drag(general('a'),general('b'));
  let saved=await current();assert.deepEqual(saved.shootDays[0].sceneIds,['pre','b','later']);assert.deepEqual(saved.shootDays[0].times,{pre:0,b:30,later:45});assert.deepEqual(saved.shootDays[1].times,{a:0,next:30});assert.equal(saved.shootDays[0].blocks[0].startMin,90);assert.equal(saved.shootDays[1].blocks[0].startMin,90);assert.deepEqual(saved.shootDays[0].durations,{pre:15,b:15,later:45});assert.deepEqual(saved.shootDays[1].durations,{a:30,next:60});assert.equal(saved.shootDays[0].sceneColors.b,'#22c55e');assert.equal(saved.shootDays[1].sceneColors.a,'#ff0000');assert.deepEqual(saved.shootDays[2],baseline.shootDays[2]);
  assert.equal(await general('a').getAttribute('data-day-id'),'day2');assert.equal(await page.locator('#dpi_time').inputValue(),'10:00');
  await page.locator('#dpCloseInspector').click();await page.locator('#schedView').selectOption('timeline');
  await drag(general('a'),general('b'));saved=await current();assert.deepEqual(saved.shootDays,baseline.shootDays);
  await page.locator('#dpCloseInspector').click();
  const timesBefore=JSON.stringify(saved.shootDays.map(d=>({id:d.id,sceneIds:d.sceneIds,times:d.times,durations:d.durations,blocks:d.blocks.map(b=>({id:b.id,startMin:b.startMin,durMin:b.durMin}))})));
  const rgb=hex=>'rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';
  const sceneColor=await general('a').evaluate(el=>getComputedStyle(el).backgroundColor);assert.equal(sceneColor,rgb('#25282c'));
  await general('a').click();await page.locator('#dayplanInspector .inspectorColor summary').click();await page.locator('#dpi_resetPlanColors').click();
  saved=await current();for(const d of saved.shootDays){assert.deepEqual(d.sceneColors,{});for(const b of d.blocks)assert.equal(b.color,'#F97316');}
  assert.equal(JSON.stringify(saved.shootDays.map(d=>({id:d.id,sceneIds:d.sceneIds,times:d.times,durations:d.durations,blocks:d.blocks.map(b=>({id:b.id,startMin:b.startMin,durMin:b.durMin}))}))),timesBefore);
  assert.equal(await general('meal').evaluate(el=>getComputedStyle(el).backgroundColor),rgb('#F97316'));
  await page.locator('#dpCloseInspector').click();await page.locator('#schedView').selectOption('compact');
  await page.screenshot({path:path.join(output,'plan-general-paleta-unificada.png')});
  await page.locator('.navBtn[data-view="dayplan"]').click();await page.locator('#dayplanSelect').selectOption('day');
  assert.equal(await page.locator('#dpLane .dpBlock[data-id="a"]').evaluate(el=>getComputedStyle(el).backgroundColor),sceneColor);assert.equal(await page.locator('#dpLane .dpBlock[data-id="meal"]').evaluate(el=>getComputedStyle(el).backgroundColor),rgb('#F97316'));
  if(studio){await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:{planning:'read'}};RodaAccess.apply();});await page.locator('#dpLane .dpBlock[data-id="a"]').click();await page.locator('#dayplanInspector .inspectorColor summary').click();assert.equal(await page.locator('#dpi_resetPlanColors').isEnabled(),false);}
  assert.deepEqual(errors,[]);console.log('OK: cross-day swaps in compact and timeline, own durations, expanded/compressed tails and production blocks, metadata, untouched third day; palette parity and color-only reset with reader protection. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
