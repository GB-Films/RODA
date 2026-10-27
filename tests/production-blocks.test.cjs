const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create,presets,appearance}=require('../js/production-blocks.js');
test('production blocks fill the selected color and use readable black or white text',()=>{
 const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
 for(const color of [...Object.values(presets).map(p=>p.color),'#000000','#ffffff','#8b5cf6','#ef4444','#f59e0b']){const look=appearance(color);assert.equal(look.background,color);const a=luminance(look.background),b=luminance(look.ink);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);}
 assert.equal(appearance('invalid').background,'#F97316');
});
test('comidas y logística tienen duraciones independientes del snap',()=>{
  for(const [type,minutes] of [['lunch',45],['dinner',45],['travel',30],['arrival',15],['setup',30]]){
    const block=create(type,'block',120,600);assert.equal(block.durMin,minutes);assert.equal(block.startMin,120);assert.equal(block.blockType,type);
  }
});
test('no agrega ni recorta un almuerzo si no queda espacio en la jornada',()=>{
  assert.equal(create('lunch','id',570,600),null);
  assert.equal(create('lunch','id',555,600).durMin,45);
  for(const start of [-1,NaN,Infinity])assert.equal(create('lunch','id',start,600),null);
  assert.equal(create('__proto__','id',0,600),null);
});
test('editar un bloque no cambia los valores por defecto del siguiente',()=>{
  const first=create('lunch','one',0,600);first.durMin=60;first.title='Otra comida';
  assert.equal(create('lunch','two',100,600).durMin,45);assert.equal(presets.lunch.title,'Almuerzo');
});
