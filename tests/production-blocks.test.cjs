const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create,presets}=require('../js/production-blocks.js');
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
