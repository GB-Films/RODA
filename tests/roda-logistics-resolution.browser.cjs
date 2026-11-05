const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),app=fs.existsSync(path.join(root,'roda'))?path.join(root,'roda'):root;
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(6000);
  await page.route('**/*',r=>r.abort());await page.setContent('<main id="host"></main>');
  for(const file of ['logistics.js','logistics-view.js'])await page.addScriptTag({path:path.join(app,'js',file)});
  await page.evaluate(()=>{
   window.s={crew:[{id:'p',name:'Persona de prueba',address:'https://maps.app.goo.gl/old'}],shootDays:[],logistics:RodaLogistics.empty()};window.calls=[];window.pending=[];window.editable=true;
   window.view=RodaLogisticsView.create(document.querySelector('#host'),{getState:()=>s,getScope:()=> 'all',canEdit:()=>editable,save(){},dayLabel:()=>'',notify(){},resolveMapsLink:url=>{calls.push(url);return new Promise((resolve,reject)=>pending.push({resolve,reject}));}});view.render();
  });
  await page.waitForFunction(()=>pending.length===1);
  // The address changes while Google is answering. The old pin must not win.
  await page.evaluate(()=>{s.crew[0].address='https://maps.app.goo.gl/new';view.render();pending[0].resolve({geo:{lat:1,lng:2}});});
  await page.waitForFunction(()=>pending.length===2);assert.equal(await page.evaluate(()=>s.logistics.geocodes['person:p']),undefined);
  await page.evaluate(()=>pending[1].reject(Error('Temporary failure')));
  await page.waitForFunction(()=>document.querySelector('#logPoints').textContent.includes('No se pudo ubicar'));
  await page.waitForFunction(()=>document.querySelector('#logMapStatus').textContent.includes('Buscar otra vez'));
  await page.locator('#host details').evaluate(el=>el.open=true);await page.locator('[data-retry]').click();await page.waitForFunction(()=>pending.length===3);
  await page.evaluate(()=>pending[2].resolve({geo:{lat:-34,lng:-58,label:'Punto compartido'}}));
  await page.waitForFunction(()=>s.logistics.geocodes['person:p']?.lat===-34);
  assert.equal(await page.evaluate(()=>s.logistics.geocodes['person:p'].address),'https://maps.app.goo.gl/new');
  // Revoking edit access while resolving cannot save coordinates.
  await page.evaluate(()=>{s.crew[0].address='https://maps.app.goo.gl/last';view.render();});
  await page.waitForFunction(()=>pending.length===4);
  await page.evaluate(()=>{editable=false;pending[3].resolve({geo:{lat:10,lng:20}});});
  await page.waitForFunction(()=>document.querySelector('#logMapStatus').textContent.includes('Revisá las ubicaciones'));
  assert.equal(await page.evaluate(()=>s.logistics.geocodes['person:p'].lat),-34);
  console.log('PASS address changes during resolution, transient errors/retry and permissions revoked in flight.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
