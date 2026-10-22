const {test}=require('node:test');
const assert=require('node:assert/strict');
const history=require('../js/script-history.js');
test('large archived history does not consume the current production document budget',()=>{
 const core={shootDays:[{id:'day',sceneIds:['s1']}]},pack={scenes:[{id:'s1',notes:'Keep'}],script:{versions:Array.from({length:6},(_,i)=>({id:'v'+i,name:'V'+i,rawText:'Guion.\n'.repeat(60000),documentFormat:{blocks:[{text:'Formatted scene'}]}}))}};
 const before=structuredClone({core,pack});assert.ok(history.bytes(pack)>1048576);history.validateParts(core,pack);assert.deepEqual({core,pack},before);
 assert.throws(()=>history.validateParts(core,pack,{separateVersions:false}),/espacio disponible/,'legacy inline storage keeps its document limit');
});
test('current scenes, a single version and total request still have bounded UTF-8 sizes',()=>{
 assert.throws(()=>history.validateParts({}, {scenes:[{notes:'á'.repeat(390000)}]}),/espacio disponible/);
 assert.throws(()=>history.validateParts({}, {script:{versions:[{id:'v',rawText:'x'.repeat(history.VERSION_LIMIT)}]}}),/versión del guion/);
 assert.throws(()=>history.validateParts({}, {script:{versions:Array.from({length:3},(_,i)=>({id:'v'+i,rawText:'x'.repeat(9000000)}))}}),/actualización completa/);
});
