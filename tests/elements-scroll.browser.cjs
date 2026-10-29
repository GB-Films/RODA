const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),studio=fs.existsSync(path.join(root,'roda/index.html')),appRoot=studio?path.join(root,'roda'):root;
const output=process.env.RODA_ELEMENTS_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'roda-elements-'));
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
  const seed={meta:{version:14,title:'PRUEBA ELEMENTOS',updatedAt:new Date().toISOString()},project:{},crew:[]};
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



 seed.scenes=Array.from({length:30},(_,i)=>({id:'s'+(i+1),number:i+1,slugline:'INT. FÁBRICA - ESCENA '+(i+1)+' - DÍA',location:'Fábrica',timeOfDay:'Día',elements:{props:['Z · Elemento compartido',...Array.from({length:3},(_,j)=>'Prop '+String(i*3+j).padStart(3,'0'))],cast:['Personaje '+i]}}));
 seed.shootDays=[{id:'d1',date:'2026-11-05',label:'Día 1 · Fábrica',location:'Fábrica',callTime:'08:00',sceneIds:seed.scenes.slice(0,15).map(s=>s.id),times:{},durations:{},blocks:[],crewIds:[]},{id:'d2',date:'2026-11-06',label:'Día 2 · Fábrica',location:'Fábrica',callTime:'08:00',sceneIds:seed.scenes.slice(15).map(s=>s.id),times:{},durations:{},blocks:[],crewIds:[]}];
 await boot(seed);await page.locator('.navBtn[data-view="elements"]').click();
 const initial=await page.evaluate(()=>structuredClone(savedState));
 async function visible(selector){return page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight+1;});}
 async function wheel(locator,delta){const r=await locator.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.wheel(0,delta);await page.waitForTimeout(200);}
 async function verifyScroll(width,height){
  await page.setViewportSize({width,height});
  if(width<=820)await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
  const list=page.locator('#elxList');await list.evaluate(e=>e.scrollTop=0);
  const controls=await page.locator('.elxControls').boundingBox();
  const geom=await list.evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,bottom:e.getBoundingClientRect().bottom}));
  assert.ok(geom.height>60&&geom.bottom<=height+1,JSON.stringify({width,geom}));
  await page.screenshot({path:path.join(output,'before-'+width+'.png')});
  await wheel(list,950);assert.ok(await list.evaluate(e=>e.scrollTop)>100,'Wheel scrolls elements '+JSON.stringify({width,geom,top:await list.evaluate(e=>e.scrollTop)}));
  assert.deepEqual(await page.locator('.elxControls').boundingBox(),controls,'Search and filters stay in place');
  await list.evaluate(e=>e.scrollTop=e.scrollHeight);
  await page.locator('#elxList .sceneCard').filter({hasText:'Z · Elemento compartido'}).click();
  assert.ok(await visible('#elxRenameInput'),'Selected element is immediately visible, including from bottom of list');
  assert.equal(await page.locator('#elxRenameInput').inputValue(),'Z · Elemento compartido');
  const detail=page.locator(width<=820?'#elxDetail':'.elxDetailScenes');
  const dgeom=await detail.evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,bottom:e.getBoundingClientRect().bottom}));
  assert.ok(dgeom.height>40&&dgeom.bottom<=height+1,JSON.stringify({width,dgeom}));
  const heading=await page.locator('#elxDetail > .catBlock').first().boundingBox();
  const leftOffset=await list.evaluate(e=>e.scrollTop);
  await wheel(detail,850);assert.ok(await detail.evaluate(e=>e.scrollTop)>100,'Wheel scrolls related scenes');
  assert.deepEqual(await page.locator('#elxDetail > .catBlock').first().boundingBox(),heading,'Element information stays visible');
  assert.equal(await list.evaluate(e=>e.scrollTop),leftOffset,'Right scroll does not move the element list');
  await detail.evaluate(e=>e.scrollTop=e.scrollHeight);
  assert.ok(await visible('.elxDetailScenes .sceneCard:last-child'),'Last related scene is reachable');

  await page.screenshot({path:path.join(output,'elements-'+width+'.png')});
  assert.equal(await page.locator('#view-elements').evaluate(e=>e.scrollTop),0,'Workspace itself never scrolls');
 }
 await verifyScroll(1600,1000);await verifyScroll(1280,720);await verifyScroll(1024,768);await verifyScroll(390,844);await verifyScroll(390,667);
 await page.setViewportSize({width:1280,height:720});
 await page.locator('#elxList').focus();await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('#elxList').scrollTop===0);await page.keyboard.press('PageDown');await page.waitForFunction(()=>document.querySelector('#elxList').scrollTop>0);
 await page.locator('#elxSearch').fill('Prop 089');assert.equal(await page.locator('#elxList .sceneCard').count(),1);
 assert.equal(await page.locator('#elxRenameInput').inputValue(),'Prop 089');assert.ok(await visible('#elxRenameInput'));
 await page.locator('#elxSearch').fill('not-a-prop');assert.match(await page.locator('#elxList').textContent(),/No hay elementos/);
 await page.locator('#elxSearch').fill('');
 await page.locator('.dayPicker > summary').click();await page.locator('.dayPickerOption[data-day="d2"]').click();
 await page.locator('#elxList .sceneCard').filter({hasText:'Z · Elemento compartido'}).click();assert.equal(await page.locator('.elxDetailScenes .sceneCard').count(),15);
 await page.locator('.elxDetailScenes .sceneCard').last().getByRole('button',{name:'Abrir',exact:true}).click();
 assert.equal(await page.locator('#view-breakdown').evaluate(e=>!e.classList.contains('hidden')),true,'Open related scene still works');
 assert.deepEqual(await page.evaluate(()=>savedState.shootDays),initial.shootDays);assert.deepEqual(await page.evaluate(()=>savedState.scenes),initial.scenes);
 assert.deepEqual(errors,[]);console.log('PASS independent wheel scrolling, fixed controls and detail, first/last items, search, day filtering, related scene opening, desktop/laptop/mobile. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
