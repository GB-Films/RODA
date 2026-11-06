import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {locationChoices,locationScript} from '../js/location-script.mjs';
const require=createRequire(import.meta.url),{parse}=require('../js/screenplay.js');
function fixture(){
 const blocks=[27,28,29,30,31,32,33].flatMap(n=>[{style:{bold:true},runs:[{text:`ESCENA ${n} INT. ${n<28?'CASA':'HOTEL'} - DÍA`}]},{style:{left:72,right:94},runs:[{text:`Diálogo completo ${n}.`,style:{italic:true}}]}]);
 const rawText=blocks.map(b=>b.runs.map(r=>r.text).join('')).join('\n\n'),scenes=parse(rawText).map((s,i)=>({...s,id:'v'+i,productionSceneId:'p'+i}));
 return {meta:{title:'Prueba'},shootingLocations:[{id:'hotel',name:'Hotel real'},{id:'casa',name:'Casa real'}],scenes:scenes.map((s,i)=>({...s,id:'p'+i,shootingLocationId:i?'hotel':'casa',shots:[{id:'shot'+i,durationMin:7}]})),days:[{id:'d1',items:[{sceneId:'p1',start:600,duration:30}]}],script:{activeVersionId:'active',versions:[{id:'active',name:'V38',scenes,rawText,documentFormat:{version:1,blocks,pdf:{version:1,data:'whole PDF'}}}]}};
}
test('location export follows original screenplay order, preserves complete styled scenes and never changes production',()=>{
 const state=fixture();state.scenes.reverse();const before=JSON.stringify(state),out=locationScript(state,{mode:'location',location:'place:hotel'},{parse});
 assert.deepEqual(out.scenes.map(s=>s.number),['28','29','30','31','32','33']);assert.doesNotMatch(out.version.rawText,/Diálogo completo 27/);
 assert.match(out.version.rawText,/Diálogo completo 33/);assert.equal(out.version.documentFormat.pdf,undefined);
 assert.equal(out.version.documentFormat.blocks.at(-1).style.left,72);assert.equal(out.version.documentFormat.blocks.at(-1).runs[0].style.italic,true);
 assert.equal(JSON.stringify(state),before);assert.equal(out.version.name,'V38');
});
test('range exports through the final scene independently of filming locations or days',()=>{
 const state=fixture();state.scenes[3].shootingLocationId='casa';const out=locationScript(state,{mode:'range',from:1,to:6},{parse});
 assert.deepEqual(out.scenes.map(s=>s.number),['28','29','30','31','32','33']);
 assert.throws(()=>locationScript(state,{mode:'range',from:3,to:1},{parse}),/inicial/);
 assert.throws(()=>locationScript(state,{mode:'range',from:0,to:7},{parse}),/inicial/);
 assert.throws(()=>locationScript(state,{mode:'location',location:'missing'},{parse}),/no tiene escenas/);
});
test('only linked production scenes enter location choices; same numbers across chapters stay distinct',()=>{
 const state=fixture();state.scenes.push({id:'historical',number:'99',location:'Archivo',shootingLocationId:'hotel'});
 assert.equal(locationChoices(state).find(p=>p.id==='place:hotel').indexes.length,6);
 state.script.versions[0].scenes[1].chapter=2;state.scenes[1].chapter=1;state.scenes[1].id='missing-link';
 assert.equal(locationChoices(state).find(p=>p.id==='place:hotel').indexes.length,5);
});
test('no active production version and changed parsing fail rather than exporting stale text',()=>{
 const state=fixture();state.script.versions[0].rawText+='\nESCENA 34 EXT. CALLE - DÍA\nMás texto.';
 assert.throws(()=>locationScript(state,{mode:'range',from:1,to:6},{parse}),/actualizarse/);
 state.script.activeVersionId=null;assert.deepEqual(locationChoices(state),[]);
 assert.throws(()=>locationScript(state,{mode:'range',from:1,to:6},{parse}),/producción/);
});
