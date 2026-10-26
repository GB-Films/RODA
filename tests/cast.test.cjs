const {test}=require('node:test'),assert=require('node:assert/strict');
const cast=require('../js/cast.js'),screenplay=require('../js/screenplay.js'),{applyProduction}=require('../js/script-revisions.js');
test('shared cues, acting directions and accented full names identify people individually',()=>{
 const body="LUCÍA Y TOMÁS\n\n¡Vamos!\n\nLUCÍA, TOMÁS Y 23\n\nJajaja.\n\nELENA (en voz baja)\n\nHola.\n\nNOTAS DE PRODUCCIÓN\n\nUsar dos cámaras.\n\nMARTÍN PÉREZ\n\n¿Quién?\n";
 assert.deepEqual(screenplay.breakdown({body}).cast,['LUCÍA','TOMÁS','23','ELENA','MARTÍN PÉREZ']);
});
test('aliases consolidate roles and preserve actor assignments, contacts and day calls',()=>{
 const aliases=cast.rules('DOCTORA VEGA = DOCTORA, VEGA\nLUCÍA = LUCIA');
 const state={scenes:[{elements:{cast:['DOCTORA','VEGA','LUCIA','LUCÍA']}}],crew:[{id:'a',area:'Cast',role:'DOCTORA',name:'Paula',phone:'123'},{id:'b',area:'Cast',role:'VEGA',name:'Paula',email:'actor@example.com'}],shootDays:[{castCallTimes:{DOCTORA:'08:00'}}]};
 cast.unify(state,aliases);assert.deepEqual(state.scenes[0].elements.cast,['DOCTORA VEGA','LUCÍA']);assert.equal(state.crew.length,1);assert.equal(state.crew[0].phone,'123');assert.equal(state.crew[0].email,'actor@example.com');assert.equal(state.crew[0].alternateAssignments.length,1);assert.equal(state.shootDays[0].castCallTimes['DOCTORA VEGA'],'08:00');
 assert.throws(()=>cast.rules('A = B\nC = B'),/dos personajes/);
});
test('new screenplay replaces old automatic cast, preserving reviewed silent roles and production work',()=>{
 const old={id:'s',number:'1',slugline:'INT. CASA - DÍA',summary:'LUCÍA mira a la PORTERA.',elements:{cast:['PERSONA ANTIGUA','LUCÍA','PORTERA'],props:['Reloj']},castManual:['PORTERA'],notes:'Nota manual',shots:[{id:'sh'}],shootingLocationId:'loc'};
 const state={scenes:[old],crew:[{id:'actor',area:'Cast',role:'LUCÍA',name:'Ana'}],shootDays:[{id:'d',sceneIds:['s'],times:{s:30},durations:{s:45}}],script:{activeVersionId:'v1',versions:[{id:'v1',scenes:[{...old,productionSceneId:'s'}]}]}};
 const plan=structuredClone(state.shootDays),version={id:'v2',scenes:[{productionSceneId:'s',number:'1',slugline:old.slugline,body:'LUCÍA mira a la PORTERA.\n\nLUCÍA\n\nBuen día.'}]};
 applyProduction(state,version,{createId:()=>'',breakdown:screenplay.breakdown,headingMetadata:screenplay.headingMetadata});
 assert.deepEqual(state.scenes[0].elements.cast,['LUCÍA','PORTERA']);assert.deepEqual(state.shootDays,plan);assert.equal(state.crew[0].name,'Ana');assert.equal(state.scenes[0].notes,'Nota manual');assert.equal(state.scenes[0].shots[0].id,'sh');
 version.scenes[0].body='LUCÍA\n\nHola.';applyProduction(state,version,{createId:()=>'',breakdown:screenplay.breakdown,headingMetadata:screenplay.headingMetadata});assert.deepEqual(state.scenes[0].elements.cast,['LUCÍA']);
});
