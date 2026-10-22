const {test}=require('node:test');
const assert=require('node:assert/strict');
const {matchScenes,applyProduction,storeVersion}=require('../js/script-revisions.js');
const scene=(number,slugline,body)=>({number:String(number),chapter:'',slugline,body});
const a=scene(1,'INT. CASA - DÍA','Ana entra y encuentra la llave sobre la mesa.'),b=scene(2,'EXT. CALLE - DÍA','Pedro sale corriendo en busca del auto.'),c=scene(3,'INT. HOTEL - NOCHE','La recepcionista recibe a todos los invitados.');
function fixture(){
 const scenes=[a,b,c].map((s,i)=>({id:'scene-'+i,...s,summary:s.body,notes:'Notas '+i,shots:[{id:'shot-'+i,lens:'50mm'}],shootingLocationId:'place-'+i,elements:{props:['Manual']},pages:2}));
 return {scenes,shootDays:[{id:'thu',date:'2026-11-05',sceneIds:['scene-0','scene-1'],times:{'scene-1':60},durations:{'scene-1':45},sceneColors:{'scene-1':'red'},shotsDone:{'shot-1':true},crewIds:['crew'],blocks:[{id:'meal'}],location:'Fábrica'}],crew:[{id:'crew',name:'Ana'}],script:{activeVersionId:'v1',versions:[{id:'v1',name:'V1',createdAt:'2026-10-01',scenes:structuredClone([a,b,c])}]}};
}
function apply(state,version,previousScenes){let id=0;return applyProduction(state,version,{previousScenes,createId:()=>`new-${id++}`,breakdown:()=>({props:['Detectado']}),headingMetadata:()=>({intExt:'Int',location:'Lugar',timeOfDay:'Día'})});}
test('insertion and renumbering retain scene identity, assignments, timings, shots, notes and assigned locations',()=>{
 const state=fixture(),before=structuredClone(state),version={id:'v2',scenes:[a,scene(2,'INT. COCINA - DÍA','Una escena nueva.'),{...b,number:'3',body:b.body+' Ahora llueve.'},{...c,number:'4'}]};
 const result=apply(state,version);
 assert.deepEqual(result,{added:1,updated:3,retained:0});
 assert.deepEqual(state.shootDays,before.shootDays);assert.deepEqual(state.crew,before.crew);
 assert.equal(state.scenes.find(s=>s.id==='scene-1').number,'3');
 for(const old of before.scenes){const updated=state.scenes.find(s=>s.id===old.id);for(const key of ['notes','shots','shootingLocationId','pages'])assert.deepEqual(updated[key],old[key]);assert.deepEqual(updated.elements.props,['Manual','Detectado']);}
 const fresh=state.scenes.find(s=>s.id.startsWith('new-'));assert.equal(fresh.number,'2');assert.equal(state.shootDays.some(d=>d.sceneIds.includes(fresh.id)),false);
 assert.deepEqual(version.scenes.map(s=>s.productionSceneId),['scene-0','new-0','scene-1','scene-2']);
});
test('a moved scene follows its content and does not take the schedule of its new number',()=>{
 assert.deepEqual(matchScenes([a,b,c],[{...c,number:'1'},{...a,number:'2'},{...b,number:'3'}]),[2,0,1]);
});
test('edited heading follows distinctive unchanged action; unchanged numbering tolerates rewritten scenes',()=>{
 assert.deepEqual(matchScenes([a,b,c],[a,{...b,slugline:'EXT. AVENIDA - NOCHE'},c]),[0,1,2]);
 assert.deepEqual(matchScenes([a,b,c],[a,scene(2,'EXT. AUTOPISTA - DÍA','Otro texto'),c]),[0,1,2]);
});
test('repeated headings with an inserted scene use action identity and never a shifted number',()=>{
 const old=[a,{...b,slugline:a.slugline}],fresh=[{...old[0]},scene(2,a.slugline,'Una escena nueva en la misma casa.'),{...old[1],number:'3'}];
 assert.deepEqual(matchScenes(old,fresh),[0,null,1]);
});
test('ambiguous changed scenes retain previous production and new candidates stay unassigned',()=>{
 const old=[a,{...b,slugline:a.slugline}],fresh=[scene(1,a.slugline,'Nueva primera'),scene(2,a.slugline,'Nueva segunda'),scene(3,a.slugline,'Nueva tercera')];
 assert.deepEqual(matchScenes(old,fresh),[null,null,null]);
 const state=fixture(),before=structuredClone(state.shootDays);const result=apply(state,{id:'v2',scenes:[a,c]});
 assert.equal(result.retained,1);assert.ok(state.scenes.some(s=>s.id==='scene-1'));assert.deepEqual(state.shootDays,before);
});
test('chapter numbers do not cross-match scenes with identical scene numbers',()=>{
 const old=[{...a,chapter:1},{...a,chapter:2}];assert.deepEqual(matchScenes(old,[old[1],old[0]]),[1,0]);
});
test('new version preserves history while replacement keeps the chosen version identity',()=>{
 const state=fixture(),original=structuredClone(state.script.versions[0]);
 storeVersion(state.script,{id:'v2',name:'V2',scenes:[a]});assert.deepEqual(state.script.versions[0],original);assert.equal(state.script.versions.length,2);
 const version=storeVersion(state.script,{id:'unused',name:'Unused',rawText:'Actualizado',scenes:[b]},{mode:'replace',targetId:'v1'});
 assert.equal(version.id,'v1');assert.equal(version.name,'V1');assert.equal(version.createdAt,original.createdAt);assert.equal(state.script.versions.length,2);
 assert.equal(state.script.versions[1].id,'v2');assert.throws(()=>storeVersion(state.script,{id:'new'},{mode:'replace',targetId:'missing'}));
});
test('replacing the active version uses its previous scene snapshot before renumbering',()=>{
 const state=fixture(),old=structuredClone(state.script.versions[0].scenes),plan=structuredClone(state.shootDays);
 const replacement=storeVersion(state.script,{id:'new',scenes:[scene(1,'EXT. JARDÍN - DÍA','Otra escena'),{...a,number:'2'},{...b,number:'3'},{...c,number:'4'}]},{mode:'replace',targetId:'v1'});
 apply(state,replacement,old);assert.equal(state.scenes.find(s=>s.id==='scene-0').number,'2');assert.deepEqual(state.shootDays,plan);
});
