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
  const seed={meta:{version:14,title:'PRUEBA REPARTO',updatedAt:new Date().toISOString()},scenes:[{id:'s1',number:1,slugline:'INT. SALA - DÍA',elements:{cast:['700','LOCUTOR']}},{id:'s2',number:2,slugline:'EXT. ACCESO - DÍA',elements:{cast:['AGENTE']}},{id:'s3',number:3,slugline:'INT. OFICINA - DÍA',elements:{cast:['700']}}],crew:[{id:'p0',area:'Cast',castPerson:true,role:'Actor / actriz',name:'Roberto Ejemplo',firstName:'Roberto',lastName:'Ejemplo',phone:'123',email:'actor@example.com'},{id:'p1',area:'Cast',castPerson:true,role:'Actor / actriz',name:'Celeste Prueba',firstName:'Celeste',lastName:'Prueba',phone:'456'},{id:'role700',area:'Cast',castProfile:true,role:'700',actorId:'p0',castType:'character'},{id:'roleAgent',area:'Cast',castProfile:true,role:'AGENTE',actorId:'',castType:'character'},{id:'roleVoice',area:'Cast',castProfile:true,role:'LOCUTOR',actorId:'',castType:'voice'}],project:{},shootDays:[{id:'d1',date:'2026-11-05',callTime:'08:00',sceneIds:['s1','s2'],times:{s1:0,s2:60},durations:{s1:60,s2:30},blocks:[]},{id:'d2',date:'2026-11-06',callTime:'10:00',sceneIds:['s3'],times:{s3:0},durations:{s3:30},blocks:[]}]};
  seed.scenes[0].elements.cast.push('SECUAZ 1','SECUAZ 2','MIMO');
  seed.crew.push(...['SECUAZ 1','SECUAZ 2','MIMO'].map(role=>({id:role,area:'Cast',castProfile:true,role,actorId:'',castType:'extra'})));
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
  for(const f of ['dialogs','roda-policy','roda-access','cast','script-pages','script-document','screenplay','script-revisions','script-history','utils','day-swap','production-blocks','app'].filter(f=>fs.existsSync(path.join(appRoot,'js',f+'.js'))))await page.addScriptTag({url:'js/'+f+'.js'});
  await page.waitForFunction(isStudio=>isStudio?!!window.RODA_READY:!document.body.classList.contains('bootLoading'),studio);await page.evaluate(()=>{document.querySelector('.shell').hidden=false;window.RodaAccess?.bind();});
  }
  await boot(seed);
  await page.locator('.navBtn[data-view="cast"]').click();await page.locator('#castKindFilter').selectOption('all');
  const card=name=>page.locator('details.cast-card').filter({has:page.locator('h2').filter({hasText:new RegExp('^'+name+'$')})});
  const writes=()=>page.evaluate(()=>savedWrites),saved=()=>page.evaluate(()=>structuredClone(savedState));
  if(errors.length)console.log(errors);
  assert.equal(await page.locator('#castKindFilter').inputValue(),'all','The full catalog opens by default');
  await page.locator('#castKindFilter').selectOption('character');assert.equal(await card('SECUAZ 1').count(),1);assert.equal(await card('SECUAZ 2').count(),1);assert.equal(await card('MIMO').count(),0);
  await page.locator('#castKindFilter').selectOption('all');
  assert.equal(await page.locator('#castDirectory details.cast-card').count(),6);assert.equal(await page.locator('#castDirectory details[open]').count(),0);
  assert.equal(await card('700').locator('.cast-actor-name').textContent(),'✓ Roberto Ejemplo');assert.match(await card('700').getAttribute('class'),/cast-card--assigned/);
  assert.match(await card('700').locator('.cast-summary-counts').textContent(),/2 escenas.*2 jornadas/);assert.match(await card('AGENTE').locator('.cast-summary-counts').textContent(),/1 escena.*1 jornada/);assert.match(await card('AGENTE').locator('.cast-actor-name').textContent(),/Sin intérprete/);
  assert.equal(await page.locator('[data-cast-type]').count(),0);assert.equal(await page.getByText('Participación',{exact:true}).count(),0);
  const beforeExpand=await writes();await card('AGENTE').locator('summary').click();assert.equal(await card('AGENTE').locator('select').isVisible(),true);assert.equal(await writes(),beforeExpand);
  await page.getByLabel('Intérprete de AGENTE',{exact:true}).selectOption('p1');
  assert.match(await card('AGENTE').getAttribute('class'),/cast-card--assigned/);assert.equal(await card('AGENTE').locator('.cast-actor-name').textContent(),'✓ Celeste Prueba');assert.equal(await card('AGENTE').getAttribute('open'),'');assert.equal(await page.locator('[data-cast-assigned]').textContent(),'2');
  let state=await saved();assert.equal(state.crew.find(p=>p.id==='roleAgent').actorId,'p1');assert.equal(state.crew.find(p=>p.id==='roleVoice').castType,'voice');assert.equal(state.crew.find(p=>p.id==='p0').phone,'123');assert.equal(state.crew.find(p=>p.id==='p1').phone,'456');assert.deepEqual(state.shootDays.map(d=>d.times),seed.shootDays.map(d=>d.times));
  await page.getByLabel('Intérprete de AGENTE',{exact:true}).selectOption('');assert.match(await card('AGENTE').getAttribute('class'),/cast-card--pending/);assert.match(await card('AGENTE').locator('.cast-actor-name').textContent(),/Sin intérprete/);assert.equal(await page.locator('[data-cast-assigned]').textContent(),'1');
  await card('AGENTE').locator('summary').click();await page.screenshot({path:path.join(output,'reparto-contraido.png')});
  // Keyboard expansion and search preserve the chosen state without modifying project data.
  const beforeUI=await saved(),writeCount=await writes();await card('700').locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await card('700').getAttribute('open'),'');
  await page.locator('#castSearch').fill('Roberto');assert.equal(await card('700').getAttribute('open'),'');await page.locator('#castSearch').fill('');
  assert.equal(await writes(),writeCount);assert.deepEqual(await saved(),beforeUI);await page.screenshot({path:path.join(output,'reparto-expandido.png')});
  state=await saved();await page.reload();await boot(state);await page.locator('.navBtn[data-view="cast"]').click();await page.locator('#castKindFilter').selectOption('all');assert.equal(await card('700').getAttribute('open'),'');assert.equal(await card('AGENTE').getAttribute('open'),null);
  await page.setViewportSize({width:850,height:900});const bounds=await card('700').locator('summary').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=850);
  if(studio){await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:{cast:'read'}};RodaAccess.apply();});assert.equal(await page.getByLabel('Intérprete de 700',{exact:true}).isEnabled(),false);await card('700').locator('summary').click();assert.equal(await card('700').getAttribute('open'),null);await card('700').locator('summary').click();assert.equal(await card('700').getAttribute('open'),'');}
  assert.deepEqual(errors,[]);console.log('OK: assigned/pending visibility; compact character/actor/count summary; per-card expansion, keyboard, search and session reload; participation removed; assignment/unassignment preserve cast types, contacts and timings; readers can expand. '+output);
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
