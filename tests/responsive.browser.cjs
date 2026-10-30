const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const root=process.env.STUDIO_ROOT||path.resolve(__dirname,'..');
const output=process.env.RODA_MOBILE_QA_DIR||path.join(require('node:os').tmpdir(),'roda-mobile-qa');
const views=['script','breakdown','locations','cast','wardrobe','shooting','dayplan','schedule','shotlist','elements','crew','reports','callsheet'];
function fixture(){
 const scenes=Array.from({length:33},(_,i)=>({id:'s'+i,number:String(i+1),slugline:'INT. FÁBRICA - SALA '+(i+1)+' - DÍA',location:'SALA '+(i+1),intExt:'Int',timeOfDay:'Día',summary:'700 y SECRETARIA revisan el equipo antes del operativo. '.repeat(8),elements:{cast:['700','SECRETARIA'],props:['Radio '+i,'Llave']},shots:Array.from({length:8},(_,j)=>({id:'sh'+i+'-'+j,type:'Plano medio',desc:'Seguimos al personaje mientras recorre el pasillo y se detiene ante la puerta.',durMin:5}))}));
 const rawText=scenes.map(s=>s.number+'. '+s.slugline+'\n\n'+s.summary+'\n\nSECRETARIA\nEstamos listos.').join('\n\n');
 return {meta:{version:14,title:'RODA · Prueba móvil',updatedAt:new Date().toISOString()},project:{},scenes,crew:[{id:'actor',area:'Cast',castPerson:true,firstName:'Ana',lastName:'Prueba',name:'Ana Prueba',phone:'123',email:'ana@example.test'},{id:'cast',area:'Cast',castProfile:true,role:'SECRETARIA',actorId:'actor'},...Array.from({length:20},(_,i)=>({id:'p'+i,area:i<10?'Direccion':'Fotografia',name:'Persona '+i,role:'Asistente'}))],shootDays:[0,1,2].map(d=>({id:'d'+d,date:'2026-11-0'+(5+d),label:'Día '+(d+1),location:['Fábrica','Hotel','Oficinas'][d],callTime:'08:00',sceneIds:scenes.slice(d*11,d*11+11).map(s=>s.id),times:Object.fromEntries(scenes.slice(d*11,d*11+11).map((s,i)=>[s.id,45+i*45])),durations:Object.fromEntries(scenes.slice(d*11,d*11+11).map(s=>[s.id,45])),crewIds:['p0'],blocks:[{id:'arrival'+d,startMin:0,durMin:15,title:'Llegada al rodaje',blockType:'arrival'},{id:'setup'+d,startMin:15,durMin:30,title:'Armado técnico',blockType:'setup'}]})),script:{activeVersionId:'v1',versions:[{id:'v1',name:'V1',productionSyncVersion:2,createdAt:'2026-10-30T12:00:00Z',rawText,scenes:scenes.map(s=>({...s,productionSceneId:s.id}))}]}};
}
async function boot(page,url,seed){
 await page.route('https://**/*',r=>r.abort());await page.goto(url);
 await page.addStyleTag({url:'/assets/studio-header.css'});
 await page.evaluate(data=>{
  document.querySelector('.shell').hidden=false;document.body.classList.remove('studio-tool-locked');
  const header=document.querySelector('.studio-global-header');header.classList.add('studio-shared-header');
  header.innerHTML='<a class="studio-global-brand" href="#"><span class="brand-logo-frame">GB</span><span class="studio-brand-name">GB Films</span></a><span class="studio-global-context">GB FILMS / PROYECTO</span><div class="studio-global-actions"><a class="studio-header-home-link" href="#">Tus proyectos</a><button class="studio-settings-button" aria-label="Ajustes">⚙</button><button data-studio-shell-account><span class="studio-shell-avatar">G</span><span class="studio-shell-user">Guido</span></button></div>';
  window.RODA_STUDIO={canEdit:true,project:{name:data.meta.title,rodaAccess:{admin:true,sections:Object.fromEntries(['script','breakdown','locations','cast','planning','shotlist','crew','reports'].map(k=>[k,'edit']))}}};
  window.savedState=structuredClone(data);window.savedWrites=0;
  window.StorageLayer=new Proxy({loadCfg:()=>({backend:'local',projects:[]}),loadLocal:()=>data,getProjects:()=>[],saveLocal:s=>{window.savedState=structuredClone(s);window.savedWrites++;}}, {get:(t,k)=>t[k]||(()=>null)});
  window.print=()=>{window.printSnapshot=document.documentElement.outerHTML;};
 },seed);
 for(const f of ['dialogs','roda-policy','roda-access','cast','wardrobe','wardrobe-view','script-pages','script-document','screenplay','script-revisions','script-history','utils','day-swap','planning-history','production-blocks','day-navigation','responsive','app'])await page.addScriptTag({url:'js/'+f+'.js'});
 await page.waitForFunction(()=>window.RODA_READY);await page.evaluate(()=>{document.querySelector('.shell').hidden=false;RodaAccess.bind();});
}
async function navigate(page,view){
 if(await page.locator('#mMenuBtn').isVisible())await page.locator('#mMenuBtn').click();
 await page.locator('.navBtn[data-view="'+view+'"]').click();
 await page.waitForFunction(view=>document.body.dataset.rodaView===view,view);
 await page.waitForTimeout(220);
}
async function interactions(page,engine,name){
 const small=await page.evaluate(()=>matchMedia('(max-width:700px), (max-height:500px) and (max-width:1279px)').matches);
 const tools=async card=>{const menu=page.locator('#'+card+' .responsiveTools');if(small&&await menu.getAttribute('open')===null)await menu.locator(':scope > summary').click();};
 const shotSnapshot=await page.evaluate(()=>JSON.stringify(savedState.scenes.map(s=>s.shots)));
 await navigate(page,'script');await page.locator('#scriptToolsToggle').click();await page.locator('#btnScriptUpload').click();
 assert.ok(await page.locator('#scriptUploadDialog').isVisible());
 assert.ok(await page.locator('#scriptUploadDialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1));await page.locator('#btnScriptUploadClose').click();
 await page.waitForFunction(()=>document.querySelectorAll('#scriptSceneSelect option').length>25);
 await page.locator('#scriptSceneSelect').selectOption('20');assert.equal(await page.locator('#scriptReaderTools').isVisible(),false);assert.ok(await page.locator('#scriptDocumentScroll').evaluate(n=>n.scrollTop)>0);
 await navigate(page,'breakdown');await page.locator('#sceneSearch').fill('SALA 12');await page.locator('.bdSceneSelect').click();
 assert.ok(await page.locator('#scene_summary').isVisible());assert.match(await page.locator('#sceneIdentity').textContent(),/SALA 12/);
 await page.locator('#scene_summary').fill('Resumen revisado desde celular.');
 assert.equal(await page.evaluate(()=>savedState.scenes[11].summary),'Resumen revisado desde celular.');
 if(small)await page.locator('#view-breakdown .responsivePaneTabs button').first().click();
 await page.locator('#sceneSearch').fill('');await page.locator('#sceneListCard .bdSceneList').evaluate(n=>n.scrollTop=n.scrollHeight);
 assert.ok(await page.locator('#sceneSearch').isVisible());
 await navigate(page,'elements');await page.locator('#elxSearch').fill('Radio 24');await page.locator('#elxList .sceneCard').click();
 assert.match(await page.locator('#elxDetail').textContent(),/Radio 24/);assert.ok(await page.locator('#elxDetail').isVisible());
 await navigate(page,'crew');await tools('crewCard');await page.locator('#crewSearch').fill('Ana');await page.locator('#crewSearch').press('Escape');
 const actor=page.locator('#crewTable tr[data-crew-id="actor"]');await actor.getByRole('textbox',{name:'Teléfono',exact:true}).fill('555123');assert.equal(await page.evaluate(()=>savedState.crew.find(p=>p.id==='actor').phone),'555123');
 await actor.locator('.crewExpander').click();assert.ok(await page.locator('.crewDetailRow').isVisible());
 await page.locator('.crewGroupToggle').click();assert.equal(await actor.isVisible(),false);await page.locator('.crewGroupToggle').click();
 await navigate(page,'cast');await page.locator('#castSearch').fill('secretaria');await page.locator('.cast-summary').click();assert.equal(await page.locator('[data-cast-entry]').inputValue(),'actor');
 await navigate(page,'wardrobe');await page.locator('.wardrobe-card>summary').first().click();await page.locator('[data-field="outfit"]').first().fill('Traje negro');assert.equal(await page.locator('[data-field="outfit"]').first().inputValue(),'Traje negro');
 await navigate(page,'shotlist');await page.locator('.shotSceneToggle').first().click();const shot=page.locator('.shotTable tbody tr[data-shot-id]').first();
 await shot.locator('.shotDescInput').fill('Plano editado desde tablet.');await shot.locator('.shotDescInput').press('Tab');assert.equal(await page.evaluate(()=>savedState.scenes[0].shots[0].desc),'Plano editado desde tablet.');
 await page.screenshot({path:path.join(output,engine+'-'+name+'-shot-edit.png')});
 await page.locator('.shotlistMain').evaluate(n=>n.scrollTop=n.scrollHeight);assert.ok(await page.locator('.shotSceneToggle').last().isVisible());
 await navigate(page,'shooting');if(small)await page.locator('.responsiveCallTabs button').nth(1).click();
 const call=page.locator('#dayCast input[data-kind="call"]').first();await call.fill('09:15');await call.dispatchEvent('change');assert.equal(await call.inputValue(),'09:15');
 if(small){await page.locator('.responsiveCallTabs button').nth(2).click();assert.ok(await page.locator('#dayCrewPicker').isVisible());}
 await navigate(page,'dayplan');await page.locator('#dpEditDay').click();assert.ok(await page.locator('#dpCloseMeta').isVisible());await page.locator('#dpCloseMeta').click();
 await page.locator('.responsiveBankToggle').click();assert.ok(await page.locator('#dpBankSearch').isVisible());await page.locator('#dpBankSearch').fill('SALA 12');await page.locator('#dpSceneBankList .scene-plan-action').click();assert.equal(await page.locator('#dpBankSearch').isVisible(),false);
 await page.locator('.dayPicker>summary').click();await page.locator('.dayPickerOption[data-day="d0"]').click();
 await navigate(page,'dayplan');await page.locator('#dpScroller').evaluate(n=>n.scrollTop=150);
 const source=page.locator('#dpLane [data-id="s0"]'),target=page.locator('#dpLane [data-id="s1"]');
 await source.click({position:{x:60,y:20}});assert.ok(await page.locator('#dpi_time').isVisible());assert.ok(await page.locator('#dpi_time').isEnabled());await page.locator('#dpCloseInspector').click();
 const before=await page.evaluate(()=>structuredClone(savedState.shootDays));
 if(engine==='chromium'&&await page.locator('#dpScroller').evaluate(n=>n.scrollHeight>n.clientHeight+30)){
  await page.locator('#dpScroller').evaluate(n=>n.scrollTop=0);
  const cdp=await page.context().newCDPSession(page),r=await page.locator('#dpScroller').boundingBox(),x=r.x+Math.min(120,r.width/2),y=r.y+r.height-30,top=await page.locator('#dpScroller').evaluate(n=>n.scrollTop);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*18}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);
  assert.ok(await page.locator('#dpScroller').evaluate(n=>n.scrollTop)>top,'A real finger swipe scrolls the plan');assert.deepEqual(await page.evaluate(()=>savedState.shootDays),before);
  await cdp.detach();await page.locator('#dpScroller').evaluate(n=>n.scrollTop=150);
 }
 // Synthetic pointer gestures exercise the app's touch/pen path in both engines.
 async function drag(from,to,grip=true,cancel=false){const handle=grip?from.locator('.planTouchGrip'):from;const a=await handle.boundingBox(),b=await to.boundingBox();const base={pointerId:71,pointerType:'touch',button:0,isPrimary:true,bubbles:true};await handle.dispatchEvent('pointerdown',{...base,clientX:a.x+a.width/2,clientY:a.y+a.height/2});await page.locator('body').dispatchEvent('pointermove',{...base,clientX:b.x+b.width/2,clientY:b.y+b.height/2});await page.locator('body').dispatchEvent(cancel?'pointercancel':'pointerup',{...base,clientX:b.x+b.width/2,clientY:b.y+b.height/2});}
 await drag(source,target,false);assert.deepEqual(await page.evaluate(()=>savedState.shootDays),before,'Swiping a card never moves it');
 await drag(source,target,true,true);assert.deepEqual(await page.evaluate(()=>savedState.shootDays),before,'Cancelled touch preserves plan');
 await drag(source,target);assert.equal(await page.evaluate(()=>savedState.shootDays[0].times.s0),90);assert.equal(await page.evaluate(()=>savedState.shootDays[0].times.s1),45);assert.deepEqual(await page.evaluate(()=>savedState.shootDays[0].durations),before[0].durations);
 await tools('dayplanCard');await page.locator('#btnDayplanUndo').click();assert.deepEqual(await page.evaluate(()=>savedState.shootDays),before);await page.locator('#btnDayplanRedo').click();assert.equal(await page.evaluate(()=>savedState.shootDays[0].times.s0),90);await page.locator('#btnDayplanUndo').click();
 await navigate(page,'schedule');await page.locator('.dayPicker>summary').click();await page.locator('.dayPickerOption[data-day="all"]').click();
 const first=page.locator('#schedBoard [data-item-id="s0"]'),other=page.locator('#schedBoard [data-item-id="s11"]');
 const handle=first.locator('.planTouchGrip'),a=await handle.boundingBox(),base={pointerId:72,pointerType:'touch',button:0,isPrimary:true,bubbles:true};
 await handle.dispatchEvent('pointerdown',{...base,clientX:a.x+a.width/2,clientY:a.y+12});await other.scrollIntoViewIfNeeded();const b=await other.boundingBox();
 await page.locator('body').dispatchEvent('pointermove',{...base,clientX:b.x+80,clientY:b.y+20});await page.locator('body').dispatchEvent('pointerup',{...base,clientX:b.x+80,clientY:b.y+20});
 assert.ok(await page.evaluate(()=>savedState.shootDays[1].sceneIds.includes('s0')),'Touch swaps across days');await tools('scheduleCard');await page.locator('#btnSchedUndo').click();assert.deepEqual(await page.evaluate(()=>savedState.shootDays),before);
 await navigate(page,'dayplan');await tools('dayplanCard');
 await page.locator('#dayplanView').selectOption('timeline');await page.locator('#dayplanView').press('Escape');if(await page.locator('#dpCloseInspector').isVisible())await page.locator('#dpCloseInspector').click();await page.locator('#dpLane [data-id="s0"]').tap();assert.ok(await page.locator('#dpi_time').isVisible());await page.locator('#dpCloseInspector').click();
 await page.evaluate(()=>{RODA_STUDIO.canEdit=false;RODA_STUDIO.project.rodaAccess={admin:false,sections:Object.fromEntries(['script','breakdown','locations','cast','planning','shotlist','crew','reports'].map(k=>[k,'read']))};RodaAccess.apply();});
 await tools('dayplanCard');assert.equal(await page.locator('#btnAddShootDay').isEnabled(),false);await page.locator('#dayplanView').selectOption('compact');await page.locator('#dayplanView').press('Escape');if(await page.locator('#dpCloseInspector').isVisible())await page.locator('#dpCloseInspector').click();
 await page.waitForTimeout(400);await page.locator('#dpLane [data-id="s0"]').tap();assert.equal(await page.locator('#dpi_time').isEnabled(),false);await page.locator('#dpCloseInspector').click();
 await navigate(page,'crew');await tools('crewCard');await page.locator('#crewSearch').fill('Ana');await page.locator('#crewSearch').press('Escape');assert.equal(await actor.getByRole('textbox',{name:'Teléfono',exact:true}).isEnabled(),false);
 assert.deepEqual(await page.evaluate(()=>savedState.shootDays),before,'Permissions and reading never change timings');
 assert.notEqual(await page.evaluate(()=>JSON.stringify(savedState.scenes.map(s=>s.shots))),shotSnapshot,'Shot edits persisted');
}
async function main(){
 fs.mkdirSync(output,{recursive:true});
 const html=fs.readFileSync(path.join(root,'roda/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const server=http.createServer((req,res)=>{const rel=decodeURIComponent(req.url.split('?')[0]);if(rel==='/roda/'){res.setHeader('Content-Type','text/html');return res.end(html);}const file=path.join(root,rel);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'text/plain');fs.readFile(file,(e,b)=>e?res.writeHead(404).end():res.end(b));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const configs=process.env.RODA_MOBILE_BASELINE?[['phone',390,844],['ipad',820,1180],['ipad-landscape',1180,820]]:[['phone-se',320,568],['phone-small',360,640],['phone',390,844],['phone-landscape',844,390],['ipad',820,1180],['ipad-landscape',1180,820],['ipad-pro',1024,1366],['ipad-pro-landscape',1366,1024],['desktop',1440,1000]];
 const engines=process.env.RODA_MOBILE_BASELINE?['chromium']:(process.env.RODA_ENGINE||'chromium,webkit').split(',');
 const results=[];
 try{for(const engine of engines){const browser=await ({chromium,webkit}[engine]).launch({headless:true});try{
  for(const [name,width,height] of configs.filter(c=>!process.env.RODA_SIZE||process.env.RODA_SIZE.split(',').includes(c[0]))){const page=await browser.newPage({viewport:{width,height},hasTouch:name!=='desktop',isMobile:name!=='desktop',deviceScaleFactor:1});page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page,'http://127.0.0.1:'+server.address().port+'/roda/',fixture());
   const initial=await page.evaluate(()=>JSON.stringify(savedState.shootDays));
   for(const view of views){await navigate(page,view);
    const layout=await page.locator('#view-'+view).evaluate(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,w:n.clientWidth,h:n.clientHeight,overflow:n.scrollWidth>n.clientWidth+2,body:document.documentElement.scrollWidth>innerWidth+2}));
    results.push({engine,name,view,...layout});
    if(!process.env.RODA_MOBILE_BASELINE){assert.ok(layout.h>90,JSON.stringify(results.at(-1)));assert.ok(!layout.overflow&&!layout.body,JSON.stringify(results.at(-1)));}
    if(['script','dayplan','shotlist','crew','elements','breakdown'].includes(view))await page.screenshot({path:path.join(output,engine+'-'+name+'-'+view+'.png')});
   }
   assert.equal(await page.evaluate(()=>JSON.stringify(savedState.shootDays)),initial,'Browsing never edits timings');
   if(!process.env.RODA_MOBILE_BASELINE&&['phone','ipad'].includes(name))await interactions(page,engine,name);
   assert.deepEqual(errors,[]);await page.close();console.log(engine+' '+name+': 13 sections checked');
  }
  if(!process.env.RODA_MOBILE_BASELINE){
   const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),empty=fixture(),errors=[];empty.scenes=[];empty.shootDays=[];empty.crew=[];empty.script={versions:[]};page.on('pageerror',e=>errors.push(e.message));
   await boot(page,'http://127.0.0.1:'+server.address().port+'/roda/',empty);for(const view of views){await navigate(page,view);assert.ok(await page.locator('#view-'+view).evaluate(n=>n.clientHeight>90&&n.scrollWidth<=n.clientWidth+2),'Empty '+view);}
   assert.deepEqual(await page.evaluate(()=>savedState.shootDays),[]);assert.deepEqual(errors,[]);await page.close();console.log(engine+' empty project: 13 sections checked');
  }
 }finally{await browser.close();}}}finally{server.close();fs.writeFileSync(path.join(output,'layout.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify({passed:true,output,layouts:results.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
