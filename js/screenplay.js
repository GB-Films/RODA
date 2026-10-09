(function(root){
  const categories = ['cast','props','wardrobe','art','makeup','sound','sfx','vfx','vehicles','animals','extras'];
  const labels = {cast:'Cast',props:'Props',wardrobe:'Vestuario',art:'Arte',makeup:'Maquillaje',sound:'Sonido',sfx:'SFX',vfx:'VFX',vehicles:'Vehículos',animals:'Animales',extras:'Extras'};
  const normalize = s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  // These are suggestions grounded in words actually present in the scene, never inferred budgets or crew.
  const vocabulary = {
    props:['pistola','revolver','cuchillo','telefono','celular','carta','maleta','valija','mochila','llave','vaso','botella','copa','libro','computadora','laptop','paraguas','linterna','cigarrillo','reloj','dinero','arma'],
    wardrobe:['sombrero','abrigo','camisa','vestido','uniforme','traje','zapatos','botas','mascara','casco','guantes'],
    art:['mesa','silla','sofa','cama','cuadro','espejo','cartel','lampara'],
    makeup:['maquillaje','herida','sangre','cicatriz','peluca','moreton'],
    sound:['musica','sirena','telefono suena','timbre','disparo','explosion','trueno'],
    sfx:['lluvia','humo','fuego','explosion','disparo','viento','nieve'],
    vfx:['pantalla verde','croma','efecto digital','vfx','criatura digital'],
    vehicles:['auto','coche','camion','camioneta','moto','bicicleta','helicoptero','barco','tren','ambulancia','taxi'],
    animals:['perro','gato','caballo','pajaro'],
    extras:['multitud','peatones','clientes','publico','manifestantes','soldados','invitados']
  };
  function breakdown(scene){
    const elements=Object.fromEntries(categories.map(c=>[c,[]]));
    const text=String(scene.body||'');
    const normalized=normalize(text);
    const add=(cat,item)=>{if(item&&!elements[cat].some(x=>normalize(x)===normalize(item)))elements[cat].push(item);};
    for(const [cat,words] of Object.entries(vocabulary))for(const word of words){
      const re=new RegExp('(?<![\\p{L}\\p{N}])'+word+'(?:s|es)?(?![\\p{L}\\p{N}])','u');
      const match=normalized.match(re);if(match)add(cat,match[0]);
    }
    const lines=text.split(/\r?\n/);
    for(let i=0;i<lines.length;i++){
      const line=lines[i].trim();
      const cue=line.replace(/^@/,'').replace(/\s*\((?:V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT.*|FUERA.*)\)\s*$/i,'').replace(/\^$/,'').trim();
      let next=i+1;while(next<lines.length&&!lines[next].trim())next++;
      const excluded=/^(?:INT|EXT|CORTE|CUT|FADE|FUNDIDO|DISUELVE|TRANSICION|CONTINU[OA]|FIN|TITLE|TITULO|CAP[IÍ]TULO|EPISODIO)\b/i;
      if(cue.length<55&&/^[\p{Lu}][\p{Lu}\p{N} .’'_-]*$/u.test(cue)&&!excluded.test(cue)&&!/[.!?:]$/.test(cue)&&next<lines.length&&next-i<=3&&(!/^[\p{Lu}\s]+$/u.test(lines[next].trim())||line.startsWith('@'))){add('cast',cue);}
      // Explicit production tags allow unusual elements to be recognized without guessing.
      for(const match of line.matchAll(/\[([^:\]]+):\s*([^\]]+)\]/g)){
        const key=normalize(match[1]);const cat=categories.find(c=>normalize(c)===key||normalize(labels[c])===key);
        if(cat)for(const item of match[2].split(/[,;]/))add(cat,item.trim());
      }
    }
    return elements;
  }
  function docsLink(value){
    let u;try{u=new URL(String(value).trim());}catch{throw Error('Pegá un enlace de Google Docs válido.');}
    const match=u.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
    if(u.protocol!=='https:'||u.hostname!=='docs.google.com'||!match||match[1]==='e')throw Error('El enlace debe ser un documento editable de docs.google.com.');
    return {id:match[1],url:'https://docs.google.com/document/d/'+match[1]+'/edit'};
  }
  function docsText(doc){
    const parts=[];
    function content(items){for(const item of items||[]){
      if(item.paragraph)parts.push((item.paragraph.elements||[]).map(e=>e.textRun?.content||'').join(''));
      if(item.table)for(const row of item.table.tableRows||[])for(const cell of row.tableCells||[])content(cell.content);
      if(item.sectionBreak)parts.push('\n');
    }}
    function tabs(items){for(const tab of items||[]){content(tab.documentTab?.body?.content);tabs(tab.childTabs);}}
    if(doc.tabs?.length)tabs(doc.tabs);else content(doc.body?.content);
    return parts.join('').trim();
  }
  function sceneKey(scene){return String(scene.chapter||'')+'|'+String(scene.number||'').trim().toUpperCase();}
  function pdfLines(items){
    const rows=[];
    for(const item of items){if(!item.str?.trim())continue;const y=item.transform[5],x=item.transform[4];let row=rows.find(r=>Math.abs(r.y-y)<2);if(!row){row={y,items:[]};rows.push(row);}row.items.push({x,text:item.str});}
    return rows.sort((a,b)=>b.y-a.y).map(r=>r.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ')).join('\n');
  }
  const libraries={};
  function script(url){return libraries[url]||(libraries[url]=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>{delete libraries[url];s.remove();reject(Error('No pudimos abrir el archivo. Revisá tu conexión e intentá de nuevo.'));};document.head.append(s);}));}
  async function readFile(file){
    if(file.size>20*1024*1024)throw Error('El archivo supera los 20 MB. Exportá una copia más liviana.');
    const ext=file.name.split('.').pop().toLowerCase();let text;
    if(['txt','fountain'].includes(ext))text=await file.text();
    else if(ext==='docx'){
      await script('js/vendor/mammoth.browser.js');
      text=(await root.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value;
    }else if(ext==='pdf'){
      const pdf=await import('./vendor/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc=new URL('js/vendor/pdf.worker.mjs',document.baseURI).href;
      const task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
      try{const doc=await task.promise;if(doc.numPages>500)throw Error('El PDF supera las 500 páginas.');const pages=[];for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n);pages.push(pdfLines((await page.getTextContent()).items));}text=pages.join('\n\n');}finally{await task.destroy();}
    }else throw Error('Usá un PDF con texto, DOCX, TXT o Fountain.');
    if(!text?.trim())throw Error('No encontramos texto en el archivo. Si el PDF está escaneado, cargá una copia con texto seleccionable.');
    return text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  }
  const api={categories,labels,breakdown,docsLink,docsText,sceneKey,pdfLines,readFile};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.RodaScreenplay=api;
})(typeof window!=='undefined'?window:globalThis);
