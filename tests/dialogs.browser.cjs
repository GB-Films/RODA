const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.env.RODA_ROOT||path.resolve(__dirname,'..'),qa=process.env.RODA_QA_DIR||path.join(root,'.qa');
fs.mkdirSync(qa,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage(),errors=[],native=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{native.push(d.type());d.dismiss();});
 await page.setContent('<!doctype html><html lang="es"><body class="roda-studio"><button id="opener" class="btn">Eliminar día</button><button id="outside">Otra acción</button></body></html>');
 await page.addStyleTag({path:path.join(root,'css/styles.css')});if(fs.existsSync(path.join(root,'css/studio.css')))await page.addStyleTag({path:path.join(root,'css/studio.css')});
 await page.addStyleTag({path:path.join(root,'css/dialogs.css')});await page.addScriptTag({path:path.join(root,'js/dialogs.js')});
 const open=async(kind,options)=>{await page.locator('#opener').focus();await page.evaluate(({kind,options})=>{window.result='pending';RodaDialogs[kind](options).then(value=>window.result=value);},{kind,options});await page.locator('#rodaMessageDialog').waitFor();};
 const result=()=>page.evaluate(()=>window.result);
 const action={title:'Eliminar día',message:'¿Eliminar Día 6 · Sin fecha?\nSus escenas quedan disponibles para volver a programar.',confirmLabel:'Eliminar día',danger:true};
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await open('confirm',action);
  assert.equal(await page.locator('#rodaMessageTitle').textContent(),'Eliminar día');assert.equal(await page.locator('#rodaMessageDialog [data-dialog-cancel]').evaluate(n=>n===document.activeElement),true);
  const metrics=await page.locator('#rodaMessageDialog').evaluate(n=>({color:getComputedStyle(n).backgroundColor,width:n.getBoundingClientRect().width}));assert.equal(metrics.color,'rgb(27, 27, 27)');assert.ok(metrics.width<=width-30);
  await page.screenshot({path:path.join(qa,`roda-dialog-${width}.png`)});
  await page.keyboard.press('Enter');assert.equal(await result(),false,'Enter on the initial safe button cancels');assert.equal(await page.locator('#opener').evaluate(n=>n===document.activeElement),true);
 }
 await open('confirm',action);await page.keyboard.press('Escape');assert.equal(await result(),false);
 await open('confirm',action);await page.locator('[data-dialog-close]').click();assert.equal(await result(),false);
 await open('confirm',action);await page.locator('[data-dialog-accept]').click();assert.equal(await result(),true);
 await open('prompt',{title:'Habilitar edición',label:'Contraseña',inputType:'password',required:true});assert.equal(await page.locator('#rodaMessageInput').getAttribute('type'),'password');assert.equal(await page.locator('#rodaMessageInput').evaluate(n=>n===document.activeElement),true);await page.locator('[data-dialog-accept]').click();assert.equal(await result(),'pending');await page.locator('#rodaMessageInput').fill('clave de prueba');await page.keyboard.press('Enter');assert.equal(await result(),'clave de prueba');
 await open('prompt',{title:'Nuevo proyecto',label:'Nombre',value:'Anterior'});await page.keyboard.press('Escape');assert.equal(await result(),null);
 await open('alert',{title:'Aviso',message:'<img src=x onerror=alert(1)>\nTexto literal'});assert.equal(await page.locator('#rodaMessageDialog img').count(),0);assert.equal(await page.locator('[data-dialog-cancel]').isVisible(),false);await page.locator('[data-dialog-accept]').click();assert.equal(await result(),true);
 await page.evaluate(()=>{window.results=[];RodaDialogs.confirm({title:'Primero'}).then(v=>results.push(v));RodaDialogs.prompt({title:'Segundo'}).then(v=>results.push(v));});assert.equal(await page.locator('#rodaMessageTitle').textContent(),'Primero');await page.locator('[data-dialog-accept]').click();await page.getByRole('heading',{name:'Segundo'}).waitFor();await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>results),[true,null]);assert.equal(await page.locator('#rodaMessageDialog').count(),0);
 await page.evaluate(()=>{const parent=document.createElement('dialog');parent.id='parent';parent.innerHTML='<button id="nestedOpener">Eliminar versión</button>';document.body.append(parent);parent.showModal();document.querySelector('#nestedOpener').focus();RodaDialogs.confirm({title:'Eliminar versión',danger:true}).then(value=>window.result=value);});await page.keyboard.press('Escape');assert.equal(await result(),false);assert.equal(await page.locator('#parent').evaluate(n=>n.open),true);assert.equal(await page.locator('#nestedOpener').evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);assert.deepEqual(native,[]);console.log('PASS: app-styled confirm/prompt/alert, safe focus, Enter/Escape/close, password/required input, literal text, queued and nested dialogs, 1440/390 px.');
 }finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
