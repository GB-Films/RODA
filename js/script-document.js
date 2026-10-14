/* Safe document styles: structured text and a small allowlist, never imported HTML. */
(function(root){
  const cleanText=s=>String(s||'').replace(/\r\n?/g,'\n');
  const textOf=b=>b.runs.map(r=>r.text).join('');
  const documentText=blocks=>blocks.map(textOf).join('\n\n').trim();
  const point=(value,min=-200,max=300)=>Math.max(min,Math.min(max,Number(value)||0));
  const font=value=>String(value||'').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80);
  function applyStyle(node,s={}){
    if(['left','right','center','justify'].includes(s.align))node.style.textAlign=s.align;
    for(const [key,css] of [['left','marginLeft'],['right','marginRight'],['indent','textIndent'],['before','marginTop'],['after','marginBottom']])if(Number.isFinite(s[key]))node.style[css]=['left','right','indent'].includes(key)?`clamp(-20%, ${point(s[key])}pt, ${key==='right'?25:40}%)`:point(s[key])+'pt';
    if(Number.isFinite(s.line))node.style.lineHeight=String(Math.max(.8,Math.min(3,s.line)));
    if(Number.isFinite(s.linePt))node.style.lineHeight=point(s.linePt,8,72)+'pt';
    if(s.font)node.style.fontFamily='"'+font(s.font)+'", monospace';
    if(Number.isFinite(s.size))node.style.fontSize=point(s.size,8,36)+'pt';
    if(typeof s.bold==='boolean')node.style.fontWeight=s.bold?'700':'400';
    if(typeof s.italic==='boolean')node.style.fontStyle=s.italic?'italic':'normal';
    if(typeof s.underline==='boolean')node.style.textDecoration=s.underline?'underline':'none';
  }
  async function zipXML(buffer,name){
    const bytes=new Uint8Array(buffer),v=new DataView(buffer);let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
    if(end<0)throw Error('El archivo Word no es válido. Volvé a exportarlo como DOCX.');
    let p=v.getUint32(end+16,true);const count=v.getUint16(end+10,true),decoder=new TextDecoder();
    for(let i=0;i<count;i++){
      if(p+46>bytes.length||v.getUint32(p,true)!==0x02014b50)throw Error('El archivo Word está incompleto.');
      const method=v.getUint16(p+10,true),size=v.getUint32(p+20,true),expanded=v.getUint32(p+24,true),n=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),offset=v.getUint32(p+42,true);
      if(decoder.decode(bytes.subarray(p+46,p+46+n))===name){
        if(expanded>5000000||offset+30>bytes.length)throw Error('El contenido del Word es demasiado grande.');
        const start=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true);
        if(start+size>bytes.length)throw Error('El archivo Word está incompleto.');
        let data=bytes.slice(start,start+size);
        if(method===8){
          const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let total=0;
          try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>5000000)throw Error('El contenido del Word es demasiado grande.');chunks.push(part.value);}}finally{await reader.cancel();}
          data=new Uint8Array(total);let pos=0;for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.length;}
        }else if(method!==0)throw Error('Exportá el documento nuevamente como DOCX.');
        const xml=decoder.decode(data);if(/<!DOCTYPE/i.test(xml))throw Error('El Word contiene una estructura no compatible.');
        const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('No pudimos leer el contenido del Word.');return doc;
      }
      p+=46+n+extra+comment;
    }
    return null;
  }
  const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const child=(node,name)=>Array.from(node?.children||[]).find(n=>n.localName===name&&n.namespaceURI===W);
  const attr=(node,name)=>node?.getAttributeNS(W,name);
  function runStyle(node){
    const s={};for(const [name,key] of [['b','bold'],['i','italic'],['u','underline']]){const n=child(node,name);if(n)s[key]=!['0','false','off','none'].includes(attr(n,'val'));}
    const size=attr(child(node,'sz'),'val');if(size!==null&&size!==undefined)s.size=Number(size)/2;
    const fonts=child(node,'rFonts'),family=attr(fonts,'ascii')||attr(fonts,'hAnsi');if(family)s.font=font(family);return s;
  }
  function paraStyle(node){
    const s={},align=attr(child(node,'jc'),'val');if(align)s.align=({start:'left',end:'right',both:'justify'})[align]||align;
    const ind=child(node,'ind'),spacing=child(node,'spacing');
    for(const [names,key] of [[['start','left'],'left'],[['end','right'],'right'],[['firstLine'],'indent']])for(const name of names){const x=attr(ind,name);if(x!==null&&x!==undefined){s[key]=Number(x)/20;break;}}
    if(attr(ind,'hanging')!=null)s.indent=-Number(attr(ind,'hanging'))/20;
    for(const key of ['before','after'])if(attr(spacing,key)!=null)s[key]=Number(attr(spacing,key))/20;
    if(attr(spacing,'line')!=null){const value=Number(attr(spacing,'line'));if(['exact','atLeast'].includes(attr(spacing,'lineRule')))s.linePt=value/20;else s.line=value/240;}
    return s;
  }
  async function readWord(buffer){
    const doc=await zipXML(buffer,'word/document.xml'),styles=await zipXML(buffer,'word/styles.xml');if(!doc)throw Error('No encontramos el documento dentro del Word.');
    const defaults=styles?.getElementsByTagNameNS(W,'docDefaults')[0];
    const defaultP=paraStyle(child(child(defaults,'pPrDefault'),'pPr')),defaultR=runStyle(child(child(defaults,'rPrDefault'),'rPr'));
    const map=new Map(Array.from(styles?.getElementsByTagNameNS(W,'style')||[]).map(n=>[attr(n,'styleId'),n]));
    function resolve(id,seen=new Set()){
      if(!id||seen.has(id)||seen.size>20)return {p:{},r:{}};seen.add(id);const n=map.get(id),base=resolve(attr(child(n,'basedOn'),'val'),seen);
      return {p:{...base.p,...paraStyle(child(n,'pPr'))},r:{...base.r,...runStyle(child(n,'rPr'))}};
    }
    const normal=Array.from(map.values()).find(n=>attr(n,'type')==='paragraph'&&attr(n,'default')==='1');
    const blocks=[];
    for(const p of doc.getElementsByTagNameNS(W,'p')){
      // Text boxes are separate stories, not duplicate paragraphs in the body.
      if(p.parentElement?.closest('txbxContent'))continue;
      const pr=child(p,'pPr'),style=resolve(attr(child(pr,'pStyle'),'val')||attr(normal,'styleId')),runs=[];
      for(const r of p.getElementsByTagNameNS(W,'r')){
        let owner=r.parentElement;while(owner&&owner.localName!=='p')owner=owner.parentElement;if(owner!==p)continue;
        const rp=child(r,'rPr'),rs=resolve(attr(child(rp,'rStyle'),'val'));
        let text='';for(const n of r.children){if(n.namespaceURI!==W)continue;if(n.localName==='t')text+=n.textContent;else if(n.localName==='tab')text+='\t';else if(['br','cr'].includes(n.localName))text+='\n';}
        if(text)runs.push({text:cleanText(text),style:{...defaultR,...style.r,...rs.r,...runStyle(rp)}});
      }
      blocks.push({style:{...defaultP,...style.p,...paraStyle(pr)},runs:runs.length?runs:[{text:''}]});
    }
    while(blocks.length&&!textOf(blocks[0]).trim())blocks.shift();while(blocks.length&&!textOf(blocks.at(-1)).trim())blocks.pop();
    return {text:documentText(blocks),format:{version:1,source:'word',blocks}};
  }
  function docsFormat(doc){
    const blocks=[];
    function textStyle(s={}){const out={};for(const key of ['bold','italic','underline'])if(typeof s[key]==='boolean')out[key]=s[key];if(s.weightedFontFamily?.fontFamily)out.font=font(s.weightedFontFamily.fontFamily);if(s.fontSize?.magnitude)out.size=s.fontSize.magnitude;return out;}
    function paragraphStyle(s={}){const out={};if(s.alignment)out.align=({START:'left',END:'right',CENTER:'center',JUSTIFIED:'justify'})[s.alignment];for(const [key,to] of [['indentStart','left'],['indentEnd','right'],['spaceAbove','before'],['spaceBelow','after']])if(s[key])out[to]=s[key].magnitude||0;if(s.indentFirstLine)out.indent=(s.indentFirstLine.magnitude||0)-(s.indentStart?.magnitude||0);if(s.lineSpacing)out.line=s.lineSpacing/100;return out;}
    function content(items,named){for(const item of items||[]){
      if(item.paragraph){const p=item.paragraph,normal=named.find(n=>n.namedStyleType==='NORMAL_TEXT')||{},style=named.find(n=>n.namedStyleType===p.paragraphStyle?.namedStyleType)||{};
        const runs=(p.elements||[]).filter(e=>e.textRun).map(e=>({text:cleanText(e.textRun.content),style:textStyle({...normal.textStyle,...style.textStyle,...e.textRun.textStyle})}));
        if(runs.length)runs.at(-1).text=runs.at(-1).text.replace(/\n$/,'');
        blocks.push({style:paragraphStyle({...normal.paragraphStyle,...style.paragraphStyle,...p.paragraphStyle}),runs:runs.length?runs:[{text:''}]});
      }if(item.table)for(const row of item.table.tableRows||[])for(const cell of row.tableCells||[])content(cell.content,named);
    }}
    function tabs(items){for(const tab of items||[]){const d=tab.documentTab;content(d?.body?.content,d?.namedStyles?.styles||doc.namedStyles?.styles||[]);tabs(tab.childTabs);}}
    if(doc.tabs?.length)tabs(doc.tabs);else content(doc.body?.content,doc.namedStyles?.styles||[]);
    while(blocks.length&&!textOf(blocks[0]).trim())blocks.shift();while(blocks.length&&!textOf(blocks.at(-1)).trim())blocks.pop();
    return {text:documentText(blocks),format:{version:1,source:'google-doc',blocks}};
  }
  function textNodes(container){const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT),nodes=[];let node,offset=0;while(node=walker.nextNode()){nodes.push({node,start:offset,end:offset+node.length});offset+=node.length;}return nodes;}
  function render(container,raw,format,keywords){
    container.replaceChildren();const rich=format?.version===1&&Array.isArray(format.blocks)&&format.blocks.length>0;
    const blocks=rich?format.blocks:raw.split('\n').map(text=>({runs:[{text}]}));
    blocks.forEach((block,i)=>{if(i)container.append(document.createTextNode(rich?'\n\n':'\n'));const p=document.createElement('p');p.className='script-paragraph';if(rich)applyStyle(p,block.style);
      for(const run of block.runs||[]){const span=document.createElement('span');span.textContent=run.text||'';if(rich)applyStyle(span,run.style);p.append(span);}
      if(!p.textContent)p.classList.add('script-blank');container.append(p);
    });
    const text=container.textContent,lines=text.split('\n'),offsets=[];let pos=0;for(const line of lines){offsets.push(pos);pos+=line.length+1;}
    const scenes=root.RodaScreenplay.parse(text,keywords),nodes=textNodes(container);
    // Work backwards so offsets in the text nodes stay valid.
    for(let i=scenes.length-1;i>=0;i--){const offset=offsets[scenes[i].sourceLine],entry=nodes.find(n=>n.start<=offset&&n.end>offset);if(!entry)continue;const anchor=document.createElement('span');anchor.id='script-scene-'+i;anchor.className='script-scene-anchor';entry.node.splitText(offset-entry.start).before(anchor);if(!rich)anchor.closest('p')?.classList.add('script-slugline');}
    return {rich,scenes};
  }
  let readerKey='',matches=[],current=-1,anchors=[],searchTimer;
  const $=id=>document.getElementById(id);
  function reveal(node){if(!node)return;const scroller=$('scriptDocumentScroll'),box=node.getBoundingClientRect();scroller.scrollTop+=box.top-scroller.getBoundingClientRect().top-36;}
  function clearMatches(){for(const node of $('scriptFullText').querySelectorAll('mark'))node.replaceWith(document.createTextNode(node.textContent));$('scriptFullText').normalize();matches=[];current=-1;}
  function navigateMatch(direction=1){if(!matches.length)return;current=(current+direction+matches.length)%matches.length;for(const mark of $('scriptFullText').querySelectorAll('mark'))mark.classList.toggle('current',Number(mark.dataset.match)===current);$('scriptSearchCount').textContent=`${current+1} de ${matches.length}`;reveal(matches[current]);}
  function search(){
    clearTimeout(searchTimer);searchTimer=null;clearMatches();const query=$('scriptSearch').value.trim();$('scriptSearchCount').textContent=query?'Sin resultados':'';
    if(!query){$('scriptSearchPrev').disabled=$('scriptSearchNext').disabled=true;return;}
    const nodes=textNodes($('scriptFullText')),text=nodes.map(n=>n.node.data).join(''),normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase(),needle=normalize(query),hay=normalize(text),ranges=[];
    // Screenplays use ordinary Unicode text; build an offset map for decomposed accents too.
    const offsets=[];let original=0;for(const char of text){for(let i=0;i<normalize(char).length;i++)offsets.push(original);original+=char.length;}offsets.push(text.length);
    if(needle)for(let at=0;(at=hay.indexOf(needle,at))>=0&&ranges.length<1000;at+=needle.length)ranges.push({start:offsets[at],end:offsets[at+needle.length]});
    matches=new Array(ranges.length);
    for(let i=ranges.length-1;i>=0;i--){const range=ranges[i];for(let j=nodes.length-1;j>=0;j--){const e=nodes[j],start=Math.max(range.start,e.start),end=Math.min(range.end,e.end);if(end<=start)continue;const selected=e.node.splitText(start-e.start);selected.splitText(end-start);const mark=document.createElement('mark');mark.dataset.match=i;selected.replaceWith(mark);mark.append(selected);matches[i]=mark;}}
    $('scriptSearchPrev').disabled=$('scriptSearchNext').disabled=!matches.length;if(matches.length)navigateMatch(1);
  }
  function update(v,raw){
    const key=JSON.stringify([v?.id,raw,v?.documentFormat]);if(key===readerKey)return;readerKey=key;
    clearTimeout(searchTimer);const result=render($('scriptFullText'),raw,v?.documentFormat,v?.keywords);anchors=result.scenes;
    $('scriptFullText').dataset.version=v?.id||'';matches=[];current=-1;$('scriptSearch').value='';$('scriptSearchCount').textContent='';$('scriptSearchPrev').disabled=$('scriptSearchNext').disabled=true;
    $('scriptSceneSelect').replaceChildren(new Option('Ir a una escena…',''));anchors.forEach((s,i)=>$('scriptSceneSelect').add(new Option(`${s.chapter?'Cap. '+s.chapter+' · ':''}${s.number} · ${s.slugline}`,String(i))));
    $('scriptSceneNumber').value='';$('scriptJumpStatus').textContent='';$('scriptSceneTotal').textContent=anchors.length+' escenas';
    for(const id of ['scriptSceneSelect','scriptSceneNumber','scriptJump','scriptSearch'])$(id).disabled=!anchors.length;
    $('scriptFormatHint').textContent=!raw?'':result.rich?'Formato del documento · vista adaptable':'Formato de lectura. Reimportá el Word o Google Docs para recuperar sus estilos originales.';
    $('scriptDocumentScroll').scrollTop=0;
  }
  function jump(index){if(!anchors[index])return;$('scriptSceneSelect').value=index;$('scriptSceneNumber').value=anchors[index].number;$('scriptJumpStatus').textContent='Escena '+anchors[index].number;if(matchMedia('(max-width:700px)').matches){$('scriptReaderTools').classList.remove('is-open');$('scriptToolsToggle').setAttribute('aria-expanded','false');}const node=$('script-scene-'+index);reveal(node);node?.closest('p')?.animate([{backgroundColor:'#e7d998'},{backgroundColor:'transparent'}],{duration:900});}
  function bind(){
    $('scriptSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,180);});
    $('scriptSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(searchTimer){search();}else navigateMatch(e.shiftKey?-1:1);}if(e.key==='Escape'){e.target.value='';search();}});
    $('scriptSearchPrev').onclick=()=>navigateMatch(-1);$('scriptSearchNext').onclick=()=>navigateMatch(1);
    $('scriptSceneSelect').onchange=e=>{if(e.target.value!=='')jump(Number(e.target.value));};
    $('scriptJumpForm').onsubmit=e=>{e.preventDefault();const value=$('scriptSceneNumber').value.trim().replace(/^0+(?=\d)/,'').toUpperCase(),found=anchors.map((s,i)=>({s,i})).filter(({s})=>s.number===value);if(found.length===1)jump(found[0].i);else $('scriptJumpStatus').textContent=found.length?'Ese número aparece en varios capítulos. Elegilo en la lista.':'No hay una escena con ese número.';};
    $('scriptToolsToggle').onclick=()=>{const aside=$('scriptReaderTools'),open=aside.classList.toggle('is-open');$('scriptToolsToggle').setAttribute('aria-expanded',String(open));};
  }
  root.RodaScriptDocument={readWord,docsFormat,render,update,bind};
})(window);
