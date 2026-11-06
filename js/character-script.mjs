// Read-only screenplay sides: production cast links select scenes, never text search.
const textOf=block=>(block.runs||[]).map(run=>run.text||'').join('');
const plain=text=>String(text||'').replace(/\s+/g,' ').trim();
const sceneKey=scene=>String(scene.chapter||'')+'|'+String(scene.number||'').replace(/^0+(?=\d)/,'').toUpperCase();
const paragraph=(text,style={})=>({runs:[{text}],style:{size:12,after:12,...style}});
const chapter=/^(?:CAP[ÍI]TULO|EPISODIO|EP\.?|CHAPTER)\s*[:.\-]?\s*\d{1,3}\b/i;

function highlightDialogue(blocks,{cast,aliases,character,roster,rich}){
  const target=cast.key(character),known=new Set(roster.map(n=>cast.key(cast.canonical(n,aliases))));
  const cueNames=text=>{
    const cue=text.trim().replace(/^@/,'').replace(/\s*\^$/,'').replace(/(?:\s*\([^)]*\))+\s*$/,'').trim();
    if(!cue||cue!==cue.toUpperCase())return null;
    const key=cast.key(cast.canonical(cue,aliases));if(known.has(key))return [key];
    const names=cue.split(/\s*(?:,|&|\/)\s*|\s+(?:Y|E|AND)\s+/).map(n=>cast.key(cast.canonical(n,aliases)));
    return names.length>1&&names.every(n=>known.has(n))?names:null;
  };
  const hasLayout=rich&&blocks.some(b=>cueNames(textOf(b))&&(b.style?.left||0)>80);
  const actionLeft=Math.min(0,...blocks.map(b=>b.style?.left||0));
  let selected=false,spoken=false;
  return blocks.map(block=>{
    const text=textOf(block),ranges=[];let offset=0;
    // Unformatted paragraphs have no reliable indentation; a paragraph break ends
    // spoken text, while a break immediately after the cue still allows dialogue.
    if(rich&&!hasLayout&&spoken){selected=false;spoken=false;}
    for(const line of text.split('\n')){
      const value=line.trim(),names=(!hasLayout||(block.style?.left||0)>120)?cueNames(value):null;
      if(names){selected=names.includes(target);spoken=false;}
      else if(!value){if(!hasLayout&&spoken){selected=false;spoken=false;}}
      else if(/^\(.*\)$/.test(value)){/* Acting directions are context, not spoken words. */}
      else if(hasLayout&&(block.style?.left||0)>120&&value===value.toUpperCase()){selected=false;spoken=false;}
      else if((!hasLayout||(block.style?.left||0)<=actionLeft+15)&&/^(?:ESCENA\s+\d|SCENE\s+\d|(?:\d+[A-Z]*[.\s]+)?(?:INT|EXT)\.|CAP[ÍI]TULO\s+\d|CORTE A:|FUNDIDO A|INTERCUT\b)/i.test(value)){selected=false;spoken=false;}
      else if(selected){
        if(hasLayout&&(block.style?.left||0)<=actionLeft+15){selected=false;spoken=false;}
        else{ranges.push([offset,offset+line.length]);spoken=true;}
      }
      offset+=line.length+1;
    }
    let start=0;const runs=[];
    for(const run of block.runs||[]){
      const end=start+String(run.text||'').length,cuts=[start,end,...ranges.flat().filter(n=>n>start&&n<end)].sort((a,b)=>a-b);
      for(let i=1;i<cuts.length;i++)if(cuts[i]>cuts[i-1]){
        const style={...run.style};delete style.characterDialogue;
        if(ranges.some(([a,b])=>cuts[i-1]>=a&&cuts[i]<=b))style.characterDialogue=true;
        runs.push({...run,text:run.text.slice(cuts[i-1]-start,cuts[i]-start),style});
      }
      start=end;
    }
    return {...block,style:{...block.style},runs};
  });
}

function sliceBlocks(blocks,start,end){
  let offset=0;const result=[];
  for(const block of blocks){
    const length=textOf(block).length,from=Math.max(0,start-offset),to=Math.min(length,end-offset);
    if(to>from){
      let runOffset=0;const runs=[];
      for(const run of block.runs||[]){
        const text=String(run.text||''),a=Math.max(0,from-runOffset),b=Math.min(text.length,to-runOffset);
        if(b>a)runs.push({...run,style:{...run.style},text:text.slice(a,b)});
        runOffset+=text.length;
      }
      result.push({...block,style:{...block.style},runs});
    }
    offset+=length+2;
  }
  return result;
}

function plainBlocks(text){
  let dialogue=false;
  return text.split('\n').map(line=>{
    const value=line.trim();if(!value){dialogue=false;return paragraph('',{after:0});}
    const heading=/^(?:ESCENA|SCENE|ESC\.?|\d+[A-Z]*[.\s]|INT\.|EXT\.)/i.test(value);
    const cue=!heading&&value.length<60&&value===value.toUpperCase()&&/[\p{L}]/u.test(value)&&!/[.!?:]$/.test(value);
    const parenthetical=dialogue&&/^\(.*\)$/.test(value);
    const style=heading?{bold:true}:cue?{left:158.4,right:36,after:0}:parenthetical?{left:108,right:115.2,after:0}:dialogue?{left:72,right:93.6,after:6}:{};
    if(cue)dialogue=true;
    return paragraph(line,style);
  });
}

export function characterScript(state,name,{cast=globalThis.RodaCast,parse=globalThis.RodaScreenplay?.parse}={}){
  const version=state.script?.versions?.find(v=>v.id===state.script.activeVersionId&&!v.draft);
  if(!version)throw Error('Elegí una versión de producción del guion antes de exportar.');
  const aliases=state.script.castAliases||[],character=cast.canonical(name,aliases),key=cast.key(character);
  const production=(state.scenes||[]).filter(s=>(s.elements?.cast||[]).some(n=>cast.key(cast.canonical(n,aliases))===key));
  if(!production.length)throw Error('Este personaje no tiene escenas vinculadas.');
  const selected=new Set();
  for(const scene of production){
    const target=cast.scriptTarget(state,scene.id,character);
    if(!target)throw Error('La escena '+scene.number+' no está vinculada al guion de producción. Revisá su vínculo antes de exportar.');
    selected.add(target.index);
  }
  const roster=[character,...(state.scenes||[]).flatMap(s=>s.elements?.cast||[]),...aliases.flatMap(a=>[a.name,...(a.aliases||[])])];
  const result=sceneScript(state,selected,{label:character,subtitle:'GUION POR PERSONAJE',actor:cast.actorFor(state,character)?.name,parse,transform:(blocks,rich)=>highlightDialogue(blocks,{cast,aliases,character,roster,rich})});
  return {...result,character};
}

// Shared, read-only extraction. Selection uses screenplay indexes, not filming order.
export function sceneScript(state,selected,{label='Guion',subtitle='GUION · SELECCIÓN DE ESCENAS',actor,parse=globalThis.RodaScreenplay?.parse,transform=blocks=>blocks}={}){
  const version=state.script?.versions?.find(v=>v.id===state.script.activeVersionId&&!v.draft);
  if(!version)throw Error('Elegí una versión de producción del guion antes de exportar.');
  if(!selected.size||[...selected].some(i=>!Number.isInteger(i)||i<0||i>=version.scenes.length))throw Error('Seleccioná al menos una escena del guion.');
  const source=version.rawText||(version.scenes||[]).map(s=>`ESCENA ${s.number} ${s.slugline}\n\n${s.body||''}`).join('\n\n');
  const original=version.documentFormat;
  const rich=original?.blocks?.length&&plain(original.blocks.map(textOf).join('\n\n'))===plain(source);
  const blocks=transform(rich?original.blocks:plainBlocks(source),rich),text=blocks.map(textOf).join('\n\n');
  const parsed=parse(text,version.keywords),lines=text.split('\n'),offsets=[];let offset=0;
  for(const line of lines){offsets.push(offset);offset+=line.length+1;}
  // Parse the actual exported text, not stale sourceLine offsets from an older import.
  if(parsed.length!==version.scenes.length||parsed.some((s,i)=>sceneKey(s)!==sceneKey(version.scenes[i])))throw Error('Las escenas del guion necesitan actualizarse antes de exportar este recorte.');
  const scenes=[],content=[];
  for(let i=0;i<parsed.length;i++){
    if(!selected.has(i))continue;
    const scene=parsed[i],start=offsets[scene.sourceLine];let endLine=parsed[i+1]?.sourceLine??lines.length;
    for(let j=scene.sourceLine+1;j<endLine;j++)if(chapter.test(lines[j].trim())){endLine=j;break;}
    const slice=sliceBlocks(blocks,start,offsets[endLine]??text.length);
    while(slice.length&&!textOf(slice.at(-1)).trim())slice.pop();
    if(!slice.length)throw Error('No encontramos el texto completo de la escena '+scene.number+'.');
    // A fresh sheet for each scene; the remaining paragraphs keep their source styles.
    slice[0].style={...slice[0].style,breakBefore:true,before:0,bold:true,left:0,right:0,indent:0,align:'left'};
    if(scene.chapter)content.push(paragraph('CAPÍTULO '+scene.chapter,{breakBefore:true,bold:true,after:12}));
    if(scene.chapter)slice[0].style.breakBefore=false;
    content.push(...slice);scenes.push({id:version.scenes[i].productionSceneId,number:scene.number,chapter:scene.chapter,slugline:scene.slugline});
  }
  const project=String(state.meta?.title||state.project?.name||'Guion');
  const cover=[paragraph(project,{align:'center',size:14,before:48,after:40}),paragraph(label,{align:'center',bold:true,size:26,after:18}),paragraph(subtitle,{align:'center',size:10,after:12})];
  if(actor)cover.push(paragraph(actor,{align:'center',size:12,after:12}));
  cover.push(paragraph(`${scenes.length} ${scenes.length===1?'escena':'escenas'} · ${version.name||'Versión de producción'}`,{align:'center',after:36}));
  cover.push(paragraph('ESCENAS INCLUIDAS',{size:10,bold:true,after:14}));
  for(const scene of scenes)cover.push(paragraph(`${scene.chapter?'Cap. '+scene.chapter+' · ':''}${scene.number} · ${scene.slugline}`,{size:10,after:8}));
  const outputBlocks=[...cover,...content];
  return {label,project,scenes,version:{id:version.id,name:version.name,updatedAt:version.updatedAt,createdAt:version.createdAt,source:{name:project+' - '+label},rawText:outputBlocks.map(textOf).join('\n\n'),documentFormat:{version:1,page:rich?original.page:undefined,blocks:outputBlocks}}};
}
