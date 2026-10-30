const {test}=require('node:test'),assert=require('node:assert/strict');
const cast=require('../js/cast.js'),screenplay=require('../js/screenplay.js'),{applyProduction}=require('../js/script-revisions.js');
test('people are loaded in Equipo and selected for characters without creating anonymous people',()=>{
 const state={crew:[{id:'old',area:'Cast',role:'LUCÍA',name:'Ana',phone:'123',castType:'voice'},{id:'empty',area:'Cast',role:'PORTERA',name:'',castType:'extra'},{id:'new',area:'Cast',castPerson:true,role:'Actor / actriz',name:'Marta',email:'m@example.com'}]};
 assert.deepEqual(cast.people(state).map(p=>p.name),['Ana','Marta']);assert.equal(cast.actorFor(state,'LUCÍA').id,'old');
 cast.assign(state,'LUCÍA','new');cast.assign(state,'PORTERA','new');assert.equal(cast.actorFor(state,'LUCÍA').name,'Marta');assert.equal(cast.typeFor(state,'LUCÍA'),'voice');
 assert.deepEqual(new Set(cast.personRoles(state,'new')),new Set(['PORTERA','LUCÍA']));assert.equal(cast.people(state).length,2);assert.equal(state.crew.find(p=>p.id==='old').phone,'123');
 cast.assign(state,'LUCÍA','');assert.equal(cast.actorFor(state,'LUCÍA'),null);assert.equal(cast.people(state).length,2);
 assert.throws(()=>cast.assign(state,'PORTERA','missing'),/del equipo/);
 cast.removePerson(state,'new');assert.equal(cast.actorFor(state,'PORTERA'),null);assert.equal(cast.typeFor(state,'PORTERA'),'extra');
});
test('editing a legacy actor preserves character links and contacts while exposing a person job',()=>{
 const state={crew:[{id:'a',area:'Cast',role:'LUCÍA',name:'Ana',phone:'123',email:'a@example.com',castType:'voice'}]};
 cast.preparePerson(state,state.crew[0]);state.crew[0].name='Ana Pérez';assert.equal(state.crew[0].role,'Actor / actriz');assert.equal(cast.actorFor(state,'LUCÍA').name,'Ana Pérez');assert.equal(cast.typeFor(state,'LUCÍA'),'voice');assert.deepEqual(cast.roster(state),['LUCÍA']);
 cast.assign(state,'PORTERA','a');cast.unify(state,cast.rules('LUCÍA = LUCIA'));assert.equal(cast.people(state).length,1);assert.equal(cast.actorFor(state,'PORTERA').phone,'123');
});
test('concurrent actor choices resolve one assignment while independent character changes merge',()=>{
 require('../js/day-swap.js');require('../js/collaboration.js');
 const base={crew:[{id:'a',area:'Cast',castPerson:true,name:'Ana'},{id:'b',area:'Cast',castPerson:true,name:'Bea'}]},left=structuredClone(base),right=structuredClone(base);
 cast.assign(left,'PORTERA','a');cast.assign(right,'PORTERA','b');cast.assign(right,'LUCÍA','a');
 const merged=globalThis.Collaboration.merge(base,left,right);assert.equal(cast.actorFor(merged,'PORTERA').id,'a');assert.equal(cast.actorFor(merged,'LUCÍA').id,'a');assert.equal(merged.crew.filter(p=>p.castProfile&&p.role==='PORTERA').length,1);
});
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


test('legacy two-part names display separately without mutating people or guessing compound names',()=>{const person={id:'a',name:'Ana Pérez'};assert.deepEqual(cast.personNameParts(person),{firstName:'Ana',lastName:'Pérez'});assert.deepEqual(person,{id:'a',name:'Ana Pérez'});assert.deepEqual(cast.personNameParts({name:'Celeste'}),{firstName:'Celeste',lastName:''});assert.deepEqual(cast.personNameParts({name:'María José de la Cruz'}),{firstName:'María José de la Cruz',lastName:''});});
test('separate names keep the full actor name, contacts, assignment and citation',()=>{const state={crew:[{id:'a',area:'Cast',role:'LUCÍA',name:'Ana Pérez',phone:'123'}],shootDays:[{castCallTimes:{'LUCÍA':'07:15'}}]};const person=state.crew[0];cast.preparePerson(state,person);cast.setPersonName(person,'María José','de la Cruz');assert.equal(cast.actorFor(state,'LUCÍA').name,'María José de la Cruz');assert.equal(person.phone,'123');assert.equal(state.shootDays[0].castCallTimes['LUCÍA'],'07:15');assert.deepEqual(cast.personNameParts(person),{firstName:'María José',lastName:'de la Cruz'});cast.setPersonName(person,'Celeste','');assert.equal(person.name,'Celeste');});
test('concurrent given-name and surname edits combine into one consistent full name',()=>{require('../js/collaboration.js');const base={crew:[{id:'a',area:'Cast',castPerson:true,name:'Ana Pérez',firstName:'Ana',lastName:'Pérez'}]},left=structuredClone(base),right=structuredClone(base);cast.setPersonName(left.crew[0],'María José','Pérez');cast.setPersonName(right.crew[0],'Ana','López');const merged=globalThis.Collaboration.mergeProject(base,left,right);assert.equal(merged.crew[0].name,'María José López');assert.deepEqual(cast.personNameParts(merged.crew[0]),{firstName:'María José',lastName:'López'});});


test('merging duplicate actors preserves every character, contact, custom field and the complete original record',()=>{
 const state={crew:[{id:'a',area:'Cast',castPerson:true,role:'Actor / actriz',name:'Ana Pérez',phone:'111',email:'a@example.com',notes:'Primera',custom:{agency:'A'}},{id:'b',area:'Cast',castPerson:true,role:'Actor / actriz',name:'Ana Pérez',phone:'222',email:'b@example.com',notes:'Segunda',custom:{agency:'B'}},{id:'r1',area:'Cast',castProfile:true,role:'LUCÍA',actorId:'a'},{id:'r2',area:'Cast',castProfile:true,role:'PORTERA',actorId:'b'}],scenes:[{id:'s',elements:{cast:['LUCÍA','PORTERA']}}],shootDays:[{id:'d',sceneIds:['s'],times:{s:30},durations:{s:45},castCallTimes:{'LUCÍA':'07:15',PORTERA:'08:00'}}]};
 const before=structuredClone(state);cast.mergePeople(state,'b','a');assert.equal(cast.people(state).length,1);assert.equal(cast.actorFor(state,'LUCÍA').id,'a');assert.equal(cast.actorFor(state,'PORTERA').id,'a');assert.equal(state.crew[0].phone,'111 · 222');assert.equal(state.crew[0].email,'a@example.com; b@example.com');assert.equal(state.crew[0].notes,'Primera · Segunda');for(const [k,v]of Object.entries(before.crew[1]))assert.deepEqual(state.crew.find(p=>p.id==='b')[k],v);assert.deepEqual(state.shootDays,before.shootDays);assert.deepEqual(state.scenes,before.scenes);
 assert.equal(cast.restorePerson(state,'b'),true);assert.equal(cast.people(state).length,2);assert.equal(cast.actorFor(state,'PORTERA').id,'b');assert.equal(cast.actorFor(state,'LUCÍA').id,'a');assert.equal(state.crew[0].phone,'111 · 222');
});
test('legacy assignments are materialized before merging and retain their participation types',()=>{const state={crew:[{id:'a',area:'Cast',role:'LUCÍA',name:'Ana Pérez',castType:'voice'},{id:'b',area:'Cast',role:'PORTERA',name:'Ana Pérez',castType:'extra'}]};cast.mergePeople(state,'b','a');assert.equal(cast.actorFor(state,'LUCÍA').id,'a');assert.equal(cast.actorFor(state,'PORTERA').id,'a');assert.equal(cast.typeFor(state,'LUCÍA'),'voice');assert.equal(cast.typeFor(state,'PORTERA'),'extra');assert.equal(cast.people(state).length,1);assert.equal(cast.duplicates(state,state.crew[0]).length,0);});
test('missing, distinct, anonymous or technical records cannot merge or partially mutate data',()=>{for(const pair of [['a','a'],['a','missing'],['a','b'],['x','y'],['t1','t2']]){const state={crew:[{id:'a',area:'Cast',name:'Ana Pérez'},{id:'b',area:'Cast',name:'Bea Pérez'},{id:'x',area:'Cast',castPerson:true,name:''},{id:'y',area:'Cast',castPerson:true,name:''},{id:'t1',area:'Foto',name:'Ana Pérez'},{id:'t2',area:'Foto',name:'Ana Pérez'}]},before=structuredClone(state);assert.throws(()=>cast.mergePeople(state,...pair),/dos fichas activas/);assert.deepEqual(state,before);}});
test('concurrent edits and stale actor selections cannot resurrect a merged duplicate',()=>{require('../js/collaboration.js');const base={crew:[{id:'a',area:'Cast',castPerson:true,name:'Ana Pérez'},{id:'b',area:'Cast',castPerson:true,name:'Ana Pérez',phone:'123'},{id:'r',area:'Cast',castProfile:true,role:'LUCÍA',actorId:'a'}]},local=structuredClone(base),remote=structuredClone(base);cast.mergePeople(local,'b','a');remote.crew[1].phone='456';remote.crew[2].actorId='b';const result=globalThis.Collaboration.mergeProject(base,local,remote);assert.equal(cast.people(result).length,1);assert.equal(result.crew.find(p=>p.id==='b').phone,'456');assert.equal(result.crew.find(p=>p.id==='r').actorId,'a');assert.equal(cast.actorFor(result,'LUCÍA').id,'a');});
test('nested merges restore original assignments without overwriting a later casting choice',()=>{const state={crew:['a','b','c'].map(id=>({id,area:'Cast',castPerson:true,name:'Ana Pérez'}))};cast.assign(state,'LUCÍA','a');cast.assign(state,'PORTERA','b');cast.mergePeople(state,'a','b');cast.mergePeople(state,'b','c');assert.equal(cast.actorFor(state,'LUCÍA').id,'c');cast.restorePerson(state,'a');assert.equal(cast.actorFor(state,'LUCÍA').id,'a');assert.equal(cast.actorFor(state,'PORTERA').id,'c');cast.assign(state,'PORTERA','a');cast.restorePerson(state,'b');assert.equal(cast.actorFor(state,'PORTERA').id,'a');});

test('numbered supporting characters and renamed hostages remain visible as characters without changing records',()=>{
 const state={crew:['SECUAZ 1','SECUAZ 2','LUCÍA','MIMO','VOZ'].map((role,i)=>({id:String(i),area:'Cast',castProfile:true,role,castType:role==='VOZ'?'voice':'extra',actorId:'actor'})),script:{castAliases:cast.rules('LUCÍA = REHÉN 1 (LUCÍA)')}};
 const before=structuredClone(state);
 for(const name of ['SECUAZ 1','SECUAZ 2','LUCÍA'])assert.equal(cast.typeFor(state,name),'character');
 assert.equal(cast.typeFor(state,'MIMO'),'extra');assert.equal(cast.typeFor(state,'VOZ'),'voice');assert.deepEqual(state,before);
});
