/* Presentation-only workspace controls. Never change production data. */
(function(){
  let callSection='scene';
  try{callSection=sessionStorage.getItem('roda-call-section')||callSection;}catch(_e){}
  function callTabs(){
    const grid=document.querySelector('#dayDetailCard .dayDetail3col');
    if(!grid||grid.dataset.tabsReady)return;
    grid.dataset.tabsReady='1';
    const labels=['Escenas','Cast','Equipo técnico'],keys=['scene','cast','crew'];
    const panels=[...grid.children].filter(e=>e.classList.contains('col'));
    const tabs=document.createElement('div');tabs.className='callSectionTabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Secciones del call diario');
    tabs.dataset.roAllow='1';
    function select(key,focus=false){
      callSection=keys.includes(key)?key:'scene';
      try{sessionStorage.setItem('roda-call-section',callSection);}catch(_e){}
      [...tabs.children].forEach((b,i)=>{const active=keys[i]===callSection;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;panels[i].hidden=!active;if(active&&focus)b.focus();});
    }
    panels.forEach((panel,i)=>{
      const key=keys[i],button=document.createElement('button');button.type='button';button.className='btn callSectionTab';button.textContent=labels[i];button.id='call-tab-'+key;button.dataset.roAllow='1';button.setAttribute('role','tab');button.setAttribute('aria-controls','call-panel-'+key);
      panel.id='call-panel-'+key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
      button.onclick=()=>select(key);
      button.onkeydown=e=>{let next=i;if(e.key==='ArrowRight')next=(i+1)%keys.length;else if(e.key==='ArrowLeft')next=(i+keys.length-1)%keys.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=keys.length-1;else return;e.preventDefault();select(keys[next],true);};
      tabs.append(button);
    });
    grid.before(tabs);select(callSection);
  }
  // Use the app's actual print rules, in an isolated document. Screen-only rules
  // are excluded so responsive app layouts cannot leak into the paper preview.
  function printCSS(){
    function read(rules){return [...rules].map(rule=>{
      if(rule.type===CSSRule.MEDIA_RULE){const media=rule.conditionText;if(/print|all/.test(media))return read(rule.cssRules);return '';}
      if(rule.type===CSSRule.PAGE_RULE)return '';
      return rule.cssText;
    }).join('\n');}
    return [...document.styleSheets].map(sheet=>{try{return read(sheet.cssRules);}catch(_e){return '';}}).join('\n');
  }
  function preview(host,{html,className,landscape=false,margin=12}){
    if(!host)return;
    host.classList.remove('csPrintPreview');
    host.classList.add('reportPaperPreview');
    if(host._previewResize)host._previewResize.disconnect();
    host.replaceChildren();
    const zoom = document.getElementById('reportPaperZoom');
    const format = document.getElementById('reportPaperFormat');
    format.textContent = html ? 'A4 ' + (landscape ? 'horizontal' : 'vertical') : '';
    zoom.hidden = !html;
    zoom.textContent = 'Tamaño real';
    zoom.setAttribute('aria-pressed', 'false');
    zoom.onclick = null;
    if (!html) {
      const empty = document.createElement('p');
      empty.textContent = 'Elegí una jornada con rodaje para ver el documento.';
      host.append(empty);
      return;
    }
    const frame = document.createElement('iframe');
    frame.title = 'Vista previa del documento para imprimir';
    frame.className = 'reportPaperFrame';
    frame.setAttribute('sandbox', 'allow-same-origin');
    host.append(frame);
    const doc=frame.contentDocument;
    doc.open();doc.write('<!doctype html><html><head></head><body></body></html>');doc.close();
    const base=doc.createElement('base');base.href=document.baseURI;doc.head.append(base);
    const css=doc.createElement('style');css.textContent=printCSS()+`\nhtml{background:#252729!important;overflow:auto!important;height:100%!important}body[class*="gbPrinting"]{display:block!important;margin:0!important;padding:16px!important;min-height:100%!important;height:auto!important;overflow:visible!important;background:transparent!important;color:#17191b!important}body[class*="gbPrinting"]>#previewPaper{display:block!important;visibility:visible!important;background:white;width:${landscape?297:210}mm;min-height:${landscape?210:297}mm;padding:${margin}mm;box-sizing:border-box;margin:0 auto;box-shadow:0 2px 12px #0003}body #gbPrintRoot{display:block!important;position:static!important;visibility:visible!important;margin:0!important;width:100%!important;max-width:none!important;overflow:visible!important}body #gbPrintRoot *{visibility:visible}#gbPrintRoot>.dpPrintBlock+.dpPrintBlock{margin-top:12mm!important;border-top:1px solid #bbb!important;padding-top:12mm!important}`;
    doc.head.append(css);doc.body.className=className;
    const paper=doc.createElement('div');paper.id='previewPaper';const root=doc.createElement('div');root.id='gbPrintRoot';root.className='printOnly';root.innerHTML=html;paper.append(root);doc.body.append(paper);
    let actualSize=false;const fit=()=>{const width=frame.clientWidth-32;if(width>0)paper.style.zoom=String(actualSize?1:Math.min(1,width/(landscape?1122.52:793.7)));};
    zoom.onclick=()=>{actualSize=!actualSize;zoom.textContent=actualSize?'Ajustar al ancho':'Tamaño real';zoom.setAttribute('aria-pressed',String(actualSize));fit();};
    host._previewResize=new ResizeObserver(fit);host._previewResize.observe(frame);fit();
  }
  window.RodaWorkspace={callTabs,preview};
})();
