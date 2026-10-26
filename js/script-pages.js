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
    if(active.frame)root.cancelAnimationFrame(active.frame);
    clearTimeout(active.idleTimer);active.scroller?.removeEventListener('scroll',active.onScroll);
    active.task?.destroy().catch(()=>{});active=null;
  }
  // Drive's all-tabs PDF can include a separator containing only the tab title.
  // Never suppress text that also occurs in the actual document body, or non-Docs PDFs.
  function isTabCover(text,format,raw){
    const normalized=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
    const title=normalized(text);
    if(format?.source!=='google-doc'||!title||!raw||normalized(raw).includes(title))return false;
    return Array.isArray(format.tabTitles)?format.tabTitles.some(t=>normalized(t)===title):/^(?:Pestaña|Tab)\s+\d+$/i.test(title);
  }
  async function renderPDF(container,snapshot,{format,raw}={}){
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
    const pages=new Map(),pending=new Set(),scroller=container.closest('.script-document-scroll');let busy=false,clock=0;
    // Keep wheel/touch scrolling on the compositor; rasterize new pages after the gesture.
    let scrolling=false;
    session.scroller=scroller;session.onScroll=()=>{scrolling=true;clearTimeout(session.idleTimer);session.idleTimer=setTimeout(()=>{scrolling=false;schedule();},140);};
    scroller?.addEventListener('scroll',session.onScroll,{passive:true});
    function release(info){info.canvas.width=info.canvas.height=0;info.rendered=false;delete info.sheet.dataset.rendered;}
    function trim(){
      const cached=Array.from(pages.values()).filter(info=>info.rendered),candidates=cached.filter(info=>!info.near).sort((a,b)=>a.lastUsed-b.lastUsed);
      let pixels=cached.reduce((n,info)=>n+info.canvas.width*info.canvas.height,0),count=cached.length;
      while((count>8||pixels>18000000)&&candidates.length){const info=candidates.shift();pixels-=info.canvas.width*info.canvas.height;count--;release(info);}
    }
    function schedule(){if(!scrolling&&!busy&&!session.frame&&pending.size&&!session.cancelled)session.frame=root.requestAnimationFrame(paintNext);}
    async function paintNext(){
      session.frame=0;if(session.cancelled||busy||scrolling)return;
      const bounds=scroller?.getBoundingClientRect()||{top:0,bottom:root.innerHeight},distance=info=>{const box=info.sheet.getBoundingClientRect();return Math.max(bounds.top-box.bottom,box.top-bounds.bottom,0);};
      const info=Array.from(pending).filter(info=>info.near&&!info.rendered).sort((a,b)=>distance(a)-distance(b))[0];
      if(!info)return;pending.delete(info);busy=true;
      const density=Math.min(root.devicePixelRatio||1,1.5),canvas=info.canvas;
      canvas.width=Math.ceil(info.viewport.width*density);canvas.height=Math.ceil(info.viewport.height*density);
      try{
        const render=info.page.render({canvasContext:canvas.getContext('2d'),viewport:info.viewport,transform:[density,0,0,density,0,0]});
        render.onContinue=next=>{const resume=()=>{if(session.cancelled)return;if(scrolling)setTimeout(resume,50);else root.requestAnimationFrame(next);};resume();};
        await render.promise;if(!session.cancelled){info.rendered=true;info.lastUsed=++clock;info.sheet.dataset.rendered='true';}
      }catch(error){if(!session.cancelled){info.sheet.dataset.renderError='true';canvas.width=canvas.height=0;}}
      finally{pending.delete(info);busy=false;if(!session.cancelled){trim();schedule();}}
    }
    session.observer=new IntersectionObserver(entries=>{for(const entry of entries){const info=pages.get(entry.target);if(!info)continue;info.near=entry.isIntersecting;if(info.near){info.lastUsed=++clock;if(!info.rendered)pending.add(info);}else pending.delete(info);}trim();schedule();},{root:scroller,rootMargin:'900px 0px'});
    session.resize=new ResizeObserver(entries=>{for(const {target}of entries){const info=pages.get(target);if(info)target.querySelector('.script-pdf-text').style.setProperty('--scale-factor',String(info.viewport.scale*target.clientWidth/info.viewport.width));}});
    for(let n=1;n<=doc.numPages;n++){
      const page=await doc.getPage(n);if(session.cancelled)return null;
      const content=await page.getTextContent();if(session.cancelled)return null;
      const pageText=content.items.map(item=>item.str||'').join(' ');
      if(isTabCover(pageText,format,raw))continue;
      const natural=page.getViewport({scale:1});
      if(!Number.isFinite(natural.width)||!Number.isFinite(natural.height)||natural.width<=0||natural.height<=0)throw Error('La página PDF no tiene un tamaño válido.');
      const viewport=page.getViewport({scale:Math.min(4/3,1600/natural.width,2200/natural.height)}),sheet=document.createElement('section');
      sheet.className='script-pdf-page';sheet.dataset.page=String(n);sheet.dataset.pageLabel=n+' / '+doc.numPages;sheet.setAttribute('aria-label','Página '+n+' de '+doc.numPages);
      sheet.style.width=viewport.width+'px';sheet.style.aspectRatio=viewport.width+'/'+viewport.height;
      const canvas=document.createElement('canvas');canvas.width=canvas.height=0;canvas.setAttribute('aria-hidden','true');
      const layer=document.createElement('div');layer.className='script-pdf-text';layer.style.setProperty('--scale-factor',String(viewport.scale));
      sheet.append(canvas,layer);container.append(sheet);if(n>1)sheet.before(document.createTextNode('\n\n'));
      pages.set(sheet,{sheet,canvas,page,viewport,rendered:false,near:false,lastUsed:0});
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
    let number=0;for(const {sheet}of pages.values()){number++;sheet.dataset.page=String(number);sheet.dataset.pageLabel=number+' / '+pages.size;sheet.setAttribute('aria-label','Página '+number+' de '+pages.size);}
    return {pages:pages.size};
  }
  async function readingPages(container,format={},isCurrent=()=>true){
    const layout=format.page||{},width=Math.min(1000,Math.max(300,Number(layout.width)||612)),height=Math.min(1600,Math.max(400,Number(layout.height)||792));
    const margins={top:72,right:72,bottom:72,left:72,...layout.margins};
    for(const side of Object.keys(margins))margins[side]=Math.max(12,Math.min(160,Number(margins[side])||72));
    const nodes=Array.from(container.childNodes);container.replaceChildren();container.classList.remove('script-pagination-ready');container.classList.add('script-reading-pages');
    let budget=performance.now();
    const yieldToInput=async()=>{await new Promise(resolve=>setTimeout(resolve,0));budget=performance.now();return isCurrent();};
    let sheet,body;
    function page(){sheet=document.createElement('section');sheet.className='script-reading-page';sheet.style.width=width*4/3+'px';sheet.style.minHeight=height*4/3+'px';
      for(const side of ['top','right','bottom','left'])sheet.style.setProperty('--page-'+side,Math.max(12,Math.min(160,Number(margins[side])||72))*4/3+'px');
      body=document.createElement('div');body.className='script-page-content';sheet.append(body);container.append(sheet);}
    page();
    const fits=()=>body.getBoundingClientRect().height<=height*4/3-(Number(margins.top)+Number(margins.bottom))*4/3+1;
    for(const node of nodes){
      if(performance.now()-budget>8&&!await yieldToInput())return null;
      if(!isCurrent())return null;
      if(node.nodeType!==1){body.append(node);continue;}
      if(node.dataset.breakBefore==='true'&&body.textContent.trim())page();
      body.append(node);
      if(fits())continue;
      if(body.children.length>1){node.remove();page();body.append(node);}
      // A long paragraph may span pages. Split its DOM rather than discarding runs or styles.
      let paragraph=node,guard=0;
      while(!fits()&&paragraph.textContent.length>1&&guard++<500){
        if(performance.now()-budget>8&&!await yieldToInput())return null;
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
    for(const [i,p]of Array.from(container.children).entries()){
      if(performance.now()-budget>8&&!await yieldToInput())return null;
      p.dataset.page=String(i+1);p.dataset.pageLabel=String(i+1);p.setAttribute('aria-label','Página '+(i+1));p.style.setProperty('--reading-page-height',p.getBoundingClientRect().height+'px');
    }
    container.classList.add('script-pagination-ready');
    return container.children.length;
  }
  const api={PDF_LIMIT,capture,renderPDF,readingPages,cancel,isTabCover};root.RodaScriptPages=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
