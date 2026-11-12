(function(root){
  'use strict';
  const cast=()=>root.RodaCast;
  const castState=(day,name)=>day.callCastStates?.[name]||'active';
  const sceneVisible=(day,id)=>day.callHiddenScenes?.[id]!==true;
  const crewRemoved=(day,id)=>day.callCrewRemoved?.[id]===true;
  function callDay(state,day){
    const result={...day,sceneIds:(day.sceneIds||[]).filter(id=>sceneVisible(day,id)),castSceneExclusions:{...day.castSceneExclusions}},aliases=state.script?.castAliases||[];
    for(const id of result.sceneIds){
      const scene=state.scenes.find(s=>s.id===id);
      result.castSceneExclusions[id]=[...(result.castSceneExclusions[id]||[]),...(scene?.elements?.cast||[]).filter(name=>castState(day,cast().canonical(name,aliases))!=='active')];
    }
    result.blocks=(day.blocks||[]).map(b=>({...b,castNames:(b.castNames||[]).filter(name=>castState(day,cast().canonical(name,aliases))==='active')}));
    return result;
  }
  const roster=(state,day)=>cast().dayRoster(state,callDay(state,day));
  const workWindow=(state,day,name)=>cast().workWindow(state,callDay(state,day),name);
  function setCastState(day,name,value){
    if(!name||!['active','inactive','removed'].includes(value))return false;
    day.callCastStates??={};day.callCastStates[name]=value;return true;
  }
  function setSceneVisible(day,id,visible){
    if(!day.sceneIds?.includes(id))return false;
    day.callHiddenScenes??={};day.callHiddenScenes[id]=!visible;return true;
  }
  function setCrewActive(day,id,active){
    day.crewIds=(day.crewIds||[]).filter(key=>key!==id);
    if(active){day.crewIds.push(id);day.callCrewRemoved??={};day.callCrewRemoved[id]=false;}
  }
  function removeCrew(day,id){setCrewActive(day,id,false);day.callCrewRemoved??={};day.callCrewRemoved[id]=true;}
  function restoreCrew(day,id){day.callCrewRemoved??={};day.callCrewRemoved[id]=false;setCrewActive(day,id,true);}
  function removeScene(day,id){
    root.RodaShotPlanning?.removeScene(day,id);
    if(!day.sceneIds?.includes(id))return false;
    day.sceneIds=day.sceneIds.filter(key=>key!==id);
    for(const field of ['times','durations','sceneColors','shotsDone','castSceneExclusions','callHiddenScenes'])if(day[field])delete day[field][id];
    return true;
  }
  function editSceneTiming(day,id,start,duration){
    if(day.shotTimeline)throw Error('Esta jornada está organizada por planos. Ajustá sus horarios desde Plan de Rodaje → Planos.');
    if(!day.sceneIds?.includes(id))throw Error('Esta escena ya no pertenece a la jornada.');
    const [h,m]=String(day.callTime||'08:00').split(':').map(Number),base=h*60+m,end=day.night?1800:1440;
    if(!Number.isInteger(start)||!Number.isInteger(duration)||duration<1||base+start<0||base+start+duration>end)throw Error('Revisá el horario y la duración: deben quedar dentro de la jornada.');
    const others=[...(day.sceneIds||[]).filter(key=>key!==id).map(key=>({start:Number(day.times?.[key]??0),dur:Number(day.durations?.[key]??60)})),...(day.blocks||[]).map(b=>({start:Number(b.startMin),dur:Number(b.durMin)}))];
    if(others.some(it=>start<it.start+it.dur&&it.start<start+duration))throw Error('Ese horario se superpone con otra escena o actividad. Elegí un horario libre o acomodá el Plan de Rodaje.');
    day.times??={};day.durations??={};day.times[id]=start;day.durations[id]=duration;return true;
  }
  // WhatsApp expects international digits only. Unprefixed local numbers use Argentina.
  function whatsappPhone(value){
    const text=String(value||'').trim();
    if(!/^\+?[\d\s().-]+$/.test(text))return '';
    let digits=text.replace(/\D/g,''),international=text.startsWith('+')||digits.startsWith('00');
    if(digits.startsWith('00'))digits=digits.slice(2);
    if(international&&!digits.startsWith('54'))return /^[1-9]\d{7,14}$/.test(digits)?digits:'';
    if(digits.startsWith('54')&&digits.length>=12){digits=digits.slice(2);international=true;}
    digits=digits.replace(/^0/,'');
    if(digits.length===11&&digits.startsWith('9'))digits=digits.slice(1);
    if(digits.length===12){
      // A domestic 15 is removed only with an unambiguous area code.
      const candidates=[];
      for(const n of [2,3,4])if(/^(?:11|[23]\d{2,3})$/.test(digits.slice(0,n))&&digits.slice(n,n+2)==='15')candidates.push(digits.slice(0,n)+digits.slice(n+2));
      if(candidates.length!==1)return !international&&!text.startsWith('0')&&!candidates.length?digits:'';
      digits=candidates[0];
    }
    if(/^(?:11|[23]\d)\d{8}$/.test(digits))return '549'+digits;
    if(!international&&!text.startsWith('0')){
      const raw=text.replace(/\D/g,'');return /^[1-9]\d{10,14}$/.test(raw)?raw:'';
    }
    return '';
  }
  function citationMessage({project,dayNumber,date,callTime,person,role,location,cast:forCast=false}){
    const line=value=>String(value||'').replace(/[\r\n]+/g,' ').trim();
    let dateLabel='A confirmar';
    if(/^\d{4}-\d{2}-\d{2}$/.test(date||'')){
      const parsed=new Date(date+'T12:00:00Z');
      if(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date){
        const weekday=new Intl.DateTimeFormat('es-AR',{weekday:'long',timeZone:'UTC'}).format(parsed);
        dateLabel=weekday[0].toUpperCase()+weekday.slice(1)+' '+date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4);
      }
    }
    return ['*CITACIÓN*','*RODAJE “'+line(project||'Proyecto')+'”*','*JORNADA '+dayNumber+'*',
      [person?'*'+(forCast?'INTÉRPRETE':'EQUIPO')+':* '+line(person):'',role?'*'+(forCast?'PERSONAJE':'FUNCIÓN')+':* '+line(role):''].filter(Boolean).join('\n'),
      '*FECHA:* '+dateLabel,'*HORARIO:* '+(callTime?line(callTime)+' hs':'A confirmar'),
      '*UBICACIÓN:* '+(location||'A confirmar'),forCast?'*RECORDAR LLEVAR ROPA PARA EL PERSONAJE*':''].filter(Boolean).join('\n\n');
  }
  function whatsappURL(phone,message){
    const number=whatsappPhone(phone);return number?'https://wa.me/'+number+'?text='+encodeURIComponent(message):'';
  }
  const api={whatsappPhone,citationMessage,whatsappURL,castState,sceneVisible,crewRemoved,callDay,roster,workWindow,setCastState,setSceneVisible,setCrewActive,removeCrew,restoreCrew,removeScene,editSceneTiming};
  root.RodaCallSheet=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
