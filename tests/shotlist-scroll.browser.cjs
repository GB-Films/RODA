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


 seed.scenes=Array.from({length:30},(_,i)=>({id:'s'+(i+1),number:i+1,slugline:'INT. FÁBRICA - ESCENA '+(i+1)+' - DÍA',summary:'Cobertura del operativo.',elements:{cast:[]},shots:i===0?Array.from({length:34},(_,j)=>({id:'shot-'+j,type:'Plano medio',desc:'Plano '+(j+1)+' · Continuidad de la escena, actores y utilería.',durMin:1,thumbUrl:''})):[]}));
 seed.shootDays=[{id:'d1',date:'2026-11-05',label:'Día 1 · Fábrica',location:'Fábrica',callTime:'08:00',sceneIds:seed.scenes.map(s=>s.id),times:Object.fromEntries(seed.scenes.map((s,i)=>[s.id,i*15])),durations:Object.fromEntries(seed.scenes.map(s=>[s.id,45])),blocks:[],crewIds:[]}];
 await boot(seed);await page.locator('.navBtn[data-view="shotlist"]').click();
 const initial=await page.evaluate(()=>structuredClone(savedState));
 async function verifyScroll(width,height){
  await page.setViewportSize({width,height});
  if(width<=820)await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
  const list=page.locator('.shotlistMain');
  await list.evaluate(n=>n.scrollTop=0);
  const geometry=await list.evaluate(n=>({height:n.clientHeight,scroll:n.scrollHeight,bottom:n.getBoundingClientRect().bottom,viewport:innerHeight}));
  assert.ok(geometry.height>100&&geometry.bottom<=geometry.viewport+1,'scroll region stays inside the viewport: '+JSON.stringify(geometry));
  assert.ok(geometry.scroll>geometry.height+500,'collapsed scenes should overflow the list');
  const box=await list.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,1000);await page.waitForTimeout(180);
  assert.ok(await list.evaluate(n=>n.scrollTop)>100,'wheel must move between collapsed scenes');
  await list.evaluate(n=>n.scrollTop=n.scrollHeight);assert.ok(await page.locator('.shotSceneBox[data-scene-id="s30"]').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'last scene is reachable');
  await list.evaluate(n=>n.scrollTop=0);
  const scene=page.locator('.shotSceneBox[data-scene-id="s1"]');await scene.locator('.shotSceneToggle').click();
  const table=scene.locator('.tableWrap');assert.ok(await table.evaluate(n=>n.clientHeight>520),'all shots belong to the outer list instead of a capped hidden table');
  await page.mouse.move(box.x+box.width-8,box.y+box.height/2);await page.mouse.wheel(0,800);await page.waitForTimeout(180);assert.ok(await list.evaluate(n=>n.scrollTop)>100,'wheel must move through an expanded scene');
  const row=scene.locator('tr[data-shot-id="shot-33"]');await row.scrollIntoViewIfNeeded();assert.ok(await row.evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'last of 34 shots is visible');
  await page.screenshot({path:path.join(output,'shotlist-expanded-'+width+'.png')});
  await list.evaluate(n=>n.scrollTop=0);await scene.locator('.shotSceneToggle').click();
  assert.deepEqual(await page.evaluate(()=>savedState.shootDays),initial.shootDays,'scrolling/expansion must not change the plan');
  await page.screenshot({path:path.join(output,'shotlist-scroll-'+width+'.png')});
 }
 await verifyScroll(1600,1000);await verifyScroll(1280,720);await verifyScroll(390,844);
 assert.deepEqual(errors,[]);console.log('PASS wheel through 30 scenes, 34 expanded shots, desktop/laptop/mobile viewport constraints, unchanged plan. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
