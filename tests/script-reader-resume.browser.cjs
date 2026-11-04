const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),app=fs.existsSync(path.join(root,'roda'))?path.join(root,'roda'):root;
const html=`<style>
  .hidden{display:none}#scriptDocumentScroll{height:600px;overflow:auto}#scriptFullText{width:100%}
  .script-reading-page{box-sizing:border-box;max-width:100%;padding:96px;margin:0 auto 32px}
  .script-page-content{display:flow-root}p{font:16px/1.3 monospace;white-space:pre-wrap}
</style><main id="view-script"><div class="script-workspace">
  <aside id="scriptReaderTools"><input id="scriptSearch"><span id="scriptSearchCount"></span>
  <button id="scriptSearchPrev"></button><button id="scriptSearchNext"></button><select id="scriptSceneSelect"></select>
  <span id="scriptSceneTotal"></span><span id="scriptFormatHint"></span></aside><button id="scriptToolsToggle"></button>
  <div id="scriptDocumentScroll" tabindex="0"><article id="scriptVersionUI"><div id="scriptFullText"></div></article></div>
</div></main>`;
async function main(){
  const browser=await chromium.launch({headless:true,channel:process.env.RODA_BROWSER_CHANNEL||'msedge'});
  try{for(const width of [1920,390]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message));await page.setContent(html);
    for(const file of ['screenplay','script-pages','script-document'])await page.addScriptTag({path:path.join(app,'js',file+'.js')});
    await page.evaluate(()=>{
      document.body.dataset.rodaView='script';RodaScriptDocument.bind();
      const blocks=[{runs:[{text:'GUION DE PRUEBA'}]}];
      for(let n=1;n<=33;n++){
        blocks.push({runs:[{text:`ESCENA ${String(n).padStart(2,'0')} INT. HOTEL - PASILLO - DÍA`}]});
        for(let i=0;i<24;i++)blocks.push({runs:[{text:'El equipo recorre el pasillo. Se detienen ante una puerta y esperan la señal.'}]});
        if(n===9)blocks.push({runs:[{text:'En la mesa hay un dardo.'}]});
        if(n===31)blocks.push({runs:[{text:'Le entrega la '},{text:'llave',style:{bold:true}},{text:' y sale por la puerta.'}]});
      }
      window.version={id:'v1',documentFormat:{version:1,blocks}};
      window.raw=blocks.map(b=>b.runs.map(r=>r.text).join('')).join('\n\n');
      const original=RodaScriptPages.readingPages;
      RodaScriptPages.readingPages=async(...args)=>{RodaScriptPages.readingPages=original;await new Promise(resolve=>window.finishFirstLayout=resolve);return original(...args);};
      RodaScriptDocument.update(version,raw);
      window.goToKey=()=>RodaScriptDocument.navigate({versionId:'v1',number:'31',variants:['llave'],orderedVariants:true});goToKey();
    });
    const waitForKey=async()=>{await page.waitForFunction(()=>document.querySelector('#scriptSceneSelect').value==='30');assert.equal((await page.locator('.script-cast-mention').allTextContents()).join(''),'llave');};
    const intact=async()=>assert.ok(await page.evaluate(()=>document.querySelector('#scriptFullText').textContent===raw&&document.querySelectorAll('#scriptFullText .script-scene-anchor').length===33&&document.querySelectorAll('[id^=script-scene-]').length===33));
    const search=async()=>{await page.locator('#scriptSearch').fill('dardo');await page.waitForFunction(()=>document.querySelector('#scriptSearchCount').textContent==='1 de 1');await intact();};
    await waitForKey();await intact();
    await page.waitForFunction(()=>!!window.finishFirstLayout);
    await search(); // Must work while pagination is explicitly prevented from finishing.
    await page.evaluate(()=>finishFirstLayout());
    await page.waitForFunction(()=>/páginas de lectura/.test(document.querySelector('#scriptFormatHint').textContent));
    // A resize queues pagination, then navigation hides the reader before that
    // frame runs. Returning at the measured width used to leave it stalled.
    await page.evaluate(()=>{
      const c=document.querySelector('#scriptFullText'),w=c.clientWidth;
      window.hiddenCycle=false;const observer=new ResizeObserver(()=>{
        if(c.clientWidth===w)return;observer.disconnect();document.querySelector('#view-script').classList.add('hidden');
        setTimeout(()=>{document.querySelector('#view-script').classList.remove('hidden');window.hiddenCycle=true;},250);
      });observer.observe(c);
    });
    await page.setViewportSize({width:width-40,height:900});await page.waitForFunction(()=>window.hiddenCycle);
    await search();
    // Also cancel a layout already yielding between pages, then search while
    // hidden. The queued query and complete document must survive restoration.
    await page.evaluate(()=>{
      const original=RodaScriptPages.readingPages;
      RodaScriptPages.readingPages=(...args)=>{
        RodaScriptPages.readingPages=original;const task=original(...args);
        document.querySelector('#view-script').classList.add('hidden');
        const input=document.querySelector('#scriptSearch');input.value='llave';input.dispatchEvent(new Event('input'));
        setTimeout(()=>document.querySelector('#view-script').classList.remove('hidden'),350);return task;
      };
      version.updatedAt='next';RodaScriptDocument.update(version,raw);
    });
    await page.waitForFunction(()=>document.querySelector('#scriptSearch').value==='llave'&&document.querySelector('#scriptSearchCount').textContent==='1 de 1');await intact();
    await page.evaluate(()=>goToKey());await waitForKey();
    // Recover from an actual pagination error without an endless pending search.
    await page.evaluate(()=>{
      RodaScriptPages.readingPages=async c=>{c.replaceChildren();throw Error('Simulated layout failure');};
      version.updatedAt='error';RodaScriptDocument.update(version,raw);
    });
    await search();assert.match(await page.locator('#scriptFormatHint').textContent(),/Lectura completa/);
    // Never-resolving pagination used to block both direct search and prop links.
    // Keep the promise pending while exercising the actual controls, then let an
    // obsolete layout complete after a new version has been loaded.
    await page.evaluate(()=>{
      RodaScriptPages.readingPages=async c=>{c.replaceChildren();await new Promise(resolve=>window.releaseLayout=resolve);return 0;};
      version.updatedAt='stalled';RodaScriptDocument.update(version,raw);
    });
    await page.waitForFunction(()=>!!window.releaseLayout);
    await page.evaluate(()=>goToKey());await waitForKey();await intact();
    await search();
    assert.equal(await page.locator('#scriptSearchCount').textContent(),'1 de 1');
    await page.waitForFunction(()=>document.querySelectorAll('[aria-hidden="true"].script-manuscript').length===0);
    await page.evaluate(()=>{version.updatedAt='replacement';RodaScriptDocument.update(version,raw);releaseLayout();});
    await search();await intact();
    assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${width}: queued/in-flight hide, same-width resume, scene 31, direct search, layout fallback, full text`);
  }}finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
