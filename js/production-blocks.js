(function(root){
  const presets=Object.freeze({
    lunch:Object.freeze({title:'Almuerzo',duration:45,color:'#b39b75'}),
    dinner:Object.freeze({title:'Cena',duration:45,color:'#ae8d78'}),
    travel:Object.freeze({title:'Traslado',duration:30,color:'#9285aa'}),
    arrival:Object.freeze({title:'Llegada al rodaje',duration:15,color:'#8b9ba9'}),
    setup:Object.freeze({title:'Armado técnico',duration:30,color:'#7898ad'}),
    break:Object.freeze({title:'Pausa',duration:15,color:'#8d9b8d'}),
    note:Object.freeze({title:'Nueva tarea',duration:15,color:'#9ca3af'})
  });
  function create(type,id,startMin,availableMin){
    const preset=Object.hasOwn(presets,type)?presets[type]:null;
    if(!preset||!id||!Number.isFinite(startMin)||startMin<0||!Number.isFinite(availableMin)||startMin+preset.duration>availableMin)return null;
    return {id,blockType:type,title:preset.title,detail:'',startMin,durMin:preset.duration,color:preset.color};
  }
  function appearance(color){
    const value=/^#[0-9a-f]{6}$/i.test(color)?color:'#E5E7EB';
    const rgb=[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
    const luminance=rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
    return {background:value,ink:luminance>0.179?'#000000':'#ffffff'};
  }
  root.RodaProductionBlocks={presets,create,appearance};
  if(typeof module!=='undefined')module.exports=root.RodaProductionBlocks;
})(typeof window!=='undefined'?window:globalThis);
