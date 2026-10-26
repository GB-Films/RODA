(function(root){
  'use strict';
  const PDF_LIMIT=4*1024*1024;
  let active=null;
  function capture(buffer){
    const bytes=new Uint8Array(buffer);
    if(bytes.length>PDF_LIMIT)throw Error('La copia PDF supera los 4 MB. Se muestran páginas de lectura.');
    if(!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-'))throw Error('Google no entregó una copia PDF válida.');
    let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
    return {version:1,data:btoa(binary)};
  }
  function cancel(){
    if(!active)return;
    active.cancelled=true;active.observer?.disconnect();active.resize?.disconnect();
    active.task?.destroy().catch(()=>{});active=null;
  }
  async function renderPDF(container,snapshot){
    cancel();
    if(snapshot?.version!==1||typeof snapshot.data!=='string'||snapshot.data.length>Math.ceil(PDF_LIMIT*4/3)+8)throw Error('Copia PDF no compatible.');
    const bytes=Uint8Array.from(atob(snapshot.data),c=>c.charCodeAt(0));
    const session={cancelled:false};active=session;
    const pdf=await import(new URL('js/vendor/pdf.mjs',document.baseURI).href);
    if(session.cancelled)return null;
    pdf.GlobalWorkerOptions.workerSrc=new URL('js/vendor/pdf.worker.mjs',document.baseURI).href;
    const task=session.task=pdf.getDocument({data:bytes,isEvalSupported:false,maxImageSize:16000000});
    const doc=await task.promise;if(session.cancelled)return null;
    if(doc.numPages>500)throw Error('La copia PDF supera las 500 páginas.');
    container.replaceChildren();container.classList.add('script-pdf-pages');
    const pages=new Map(),scroller=container.closest('.script-document-scroll');
    function release(sheet){const info=pages.get(sheet);if(!info)return;const canvas=sheet.querySelector('canvas');canvas.width=canvas.height=0;info.rendered=false;info.rendering=false;delete sheet.dataset.rendered;}
    async function paint(sheet){
      const info=pages.get(sheet);if(!info||info.rendering||session.cancelled)return;
      info.rendering=true;
      const canvas=sheet.querySelector('canvas'),density=Math.min(root.devicePixelRatio||1,1.5);
      canvas.width=Math.ceil(info.viewport.width*density);canvas.height=Math.ceil(info.viewport.height*density);
      try{await info.page.render({canvasContext:canvas.getContext('2d'),viewport:info.viewport,transform:[density,0,0,density,0,0]}).promise;if(!session.cancelled){info.rendered=true;sheet.dataset.rendered='true';if(info.visible===false)release(sheet);}}
      catch(error){if(!session.cancelled)sheet.dataset.renderError='true';}
    }
    session.observer=new IntersectionObserver(entries=>{for(const entry of entries){const info=pages.get(entry.target);if(info)info.visible=entry.isIntersecting;if(entry.isIntersecting)paint(entry.target);else if(info?.rendered)release(entry.target);}},{root:scroller,rootMargin:'900px 0px'});
    session.resize=new ResizeObserver(entries=>{for(const {target}of entries){const info=pages.get(target);if(info)target.querySelector('.script-pdf-text').style.setProperty('--scale-factor',String(info.viewport.scale*target.clientWidth/info.viewport.width));}});
    for(let n=1;n<=doc.numPages;n++){
      const page=await doc.getPage(n);if(session.cancelled)return null;
      const natural=page.getViewport({scale:1});
      if(!Number.isFinite(natural.width)||!Number.isFinite(natural.height)||natural.width<=0||natural.height<=0)throw Error('La página PDF no tiene un tamaño válido.');
      const viewport=page.getViewport({scale:Math.min(4/3,1600/natural.width,2200/natural.height)}),sheet=document.createElement('section');
      sheet.className='script-pdf-page';sheet.dataset.page=String(n);sheet.dataset.pageLabel=n+' / '+doc.numPages;sheet.setAttribute('aria-label','Página '+n+' de '+doc.numPages);
      sheet.style.width=viewport.width+'px';sheet.style.aspectRatio=viewport.width+'/'+viewport.height;
      const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
      const layer=document.createElement('div');layer.className='script-pdf-text';layer.style.setProperty('--scale-factor',String(viewport.scale));
      sheet.append(canvas,layer);container.append(sheet);if(n>1)sheet.before(document.createTextNode('\n\n'));
      pages.set(sheet,{page,viewport,rendering:false});
      const content=await page.getTextContent();if(session.cancelled)return null;
      const textLayer=new pdf.TextLayer({textContentSource:content,container:layer,viewport});await textLayer.render();
      layer.style.width='100%';layer.style.height='100%';
      const items=content.items.filter(item=>typeof item.str==='string');
      let previousSpan;
      textLayer.textDivs.forEach((span,i)=>{const item=items[i],next=items[i+1];
        if(!span.isConnected){if(item?.hasEOL)previousSpan?.after(document.createTextNode('\n'));return;}
        previousSpan=span;
        const gap=next&&Math.abs(next.transform[5]-item.transform[5])<2?next.transform[4]-item.transform[4]-item.width:0;
        span.after(document.createTextNode(item?.hasEOL?'\n':gap>1?' ':''));});
      session.resize.observe(sheet);session.observer.observe(sheet);
    }
    if(session.cancelled)return null;
    if(container.firstElementChild)await paint(container.firstElementChild);
    return {pages:doc.numPages};
  }
  function readingPages(container,format={}){
    const layout=format.page||{},width=Math.min(1000,Math.max(300,Number(layout.width)||612)),height=Math.min(1600,Math.max(400,Number(layout.height)||792));
    const margins={top:72,right:72,bottom:72,left:72,...layout.margins};
    for(const side of Object.keys(margins))margins[side]=Math.max(12,Math.min(160,Number(margins[side])||72));
    const nodes=Array.from(container.childNodes);container.replaceChildren();container.classList.add('script-reading-pages');
    let sheet,body;
    function page(){sheet=document.createElement('section');sheet.className='script-reading-page';sheet.style.width=width*4/3+'px';sheet.style.minHeight=height*4/3+'px';
      for(const side of ['top','right','bottom','left'])sheet.style.setProperty('--page-'+side,Math.max(12,Math.min(160,Number(margins[side])||72))*4/3+'px');
      body=document.createElement('div');body.className='script-page-content';sheet.append(body);container.append(sheet);}
    page();
    const fits=()=>body.getBoundingClientRect().height<=height*4/3-(Number(margins.top)+Number(margins.bottom))*4/3+1;
    for(const node of nodes){
      if(node.nodeType!==1){body.append(node);continue;}
      if(node.dataset.breakBefore==='true'&&body.textContent.trim())page();
      body.append(node);
      if(fits())continue;
      if(body.children.length>1){node.remove();page();body.append(node);}
      // A long paragraph may span pages. Split its DOM rather than discarding runs or styles.
      let paragraph=node,guard=0;
      while(!fits()&&paragraph.textContent.length>1&&guard++<500){
        const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT),texts=[];let t,total=0;
        while(t=walker.nextNode()){texts.push({node:t,start:total,end:total+t.length});total+=t.length;}
        const original=paragraph.cloneNode(true);
        const text=paragraph.textContent,locate=offset=>texts.find(e=>e.end>=offset);
        let low=1,high=total-1,best=0;
        while(low<=high){const mid=(low+high)>>1,entry=locate(mid),range=document.createRange();range.setStart(paragraph,0);range.setEnd(entry.node,mid-entry.start);
          const probe=paragraph.cloneNode(false);probe.append(range.cloneContents());paragraph.replaceWith(probe);const ok=fits();probe.replaceWith(paragraph);
          if(ok){best=mid;low=mid+1;}else high=mid-1;}
        if(!best)break;
        const boundary=text.lastIndexOf(' ',best);if(boundary>best/2)best=boundary+1;
        const entry=locate(best),range=document.createRange();range.setStart(entry.node,best-entry.start);range.setEnd(paragraph,paragraph.childNodes.length);
        const rest=original.cloneNode(false);rest.append(range.extractContents());page();body.append(rest);paragraph=rest;
      }
    }
    Array.from(container.children).forEach((p,i)=>{p.dataset.page=String(i+1);p.dataset.pageLabel=String(i+1);p.setAttribute('aria-label','Página '+(i+1));});
    return container.children.length;
  }
  const api={PDF_LIMIT,capture,renderPDF,readingPages,cancel};root.RodaScriptPages=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
