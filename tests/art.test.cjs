const {test}=require('node:test'),assert=require('node:assert/strict');
const Art=require('../js/art.js');
require('../js/collaboration.js');
const fixture=()=>({scenes:[{id:'s1',number:'1',elements:{props:['Cámara','Llave'],art:['Cartel']}},{id:'s2',number:'2',elements:{props:['camara','LLAVE'],art:[]}}],shootDays:[{id:'d1',sceneIds:['s1'],times:{s1:30}},{id:'d2',sceneIds:['s2']}],crew:[],script:{versions:[]}});
test('script items are deduplicated across scenes, reading does not mutate production',()=>{
 const s=fixture(),before=structuredClone(s),rows=Art.rows(s);assert.equal(rows.length,3);assert.equal(rows.find(r=>r.name==='Cámara').scenes.length,2);assert.deepEqual(s,before);
});
test('inventory follows scene schedules and keeps manual / retired items after script updates',()=>{
 const s=fixture(),id=Art.idFor('props','Cámara');Art.update(s,id,'unitPrice',1500);Art.update(s,id,'status','obtained');const manual=Art.add(s,{name:'Sillón',sceneIds:['s2']});
 assert.ok(!Art.rows(s,'d1').some(r=>r.id===manual));assert.ok(Art.rows(s,'d2').some(r=>r.id===manual));
 s.scenes[0].elements.props=[];s.scenes[1].elements.props=[];
 const row=Art.rows(s).find(r=>r.id===id);assert.equal(row.obsolete,true);assert.equal(row.unitPrice,1500);assert.equal(row.status,'obtained');
 assert.ok(Art.rows(s,'unassigned').some(r=>r.id===id));s.scenes[1].elements.props=['CÁMARA'];assert.equal(Art.rows(s).find(r=>r.id===id).obsolete,false);
});
test('prices multiply by quantity, unknown prices remain unknown and currencies are not mixed',()=>{
 const s=fixture(),id=Art.idFor('props','Cámara'),key=Art.idFor('art','Cartel');Art.update(s,id,'unitPrice',10.1);Art.update(s,id,'quantity',3);Art.update(s,id,'currency','USD');Art.update(s,key,'unitPrice',0);
 assert.deepEqual(Art.totals(Art.rows(s)).money,{USD:30.3,ARS:0});assert.equal(Art.totals(Art.rows(s)).unpriced,1);
 Art.update(s,id,'archived',true);assert.equal(Art.totals(Art.rows(s)).count,2);Art.update(s,id,'archived',false);assert.equal(Art.rows(s).find(r=>r.id===id).total,30.3);
});
test('simultaneous first edits of price and owner survive, without overwriting another department',()=>{
 const base=fixture(),a=structuredClone(base),b=structuredClone(base),id=Art.idFor('props','Llave');
 Art.update(a,id,'unitPrice',250);Art.update(b,id,'responsible','Sol');b.shootDays[0].times.s1=80;
 const merged=global.Collaboration.mergeProject(base,a,b),row=Art.rows(merged).find(r=>r.id===id);
 assert.equal(row.unitPrice,250);assert.equal(row.responsible,'Sol');assert.equal(merged.shootDays[0].times.s1,80);
});
test('invalid values, duplicate additions and stale scene links do not mutate data',()=>{
 const s=fixture(),id=Art.idFor('props','Llave'),before=structuredClone(s);
 for(const [field,value] of [['quantity',0],['quantity',1.5],['unitPrice',-1],['unitPrice',NaN],['currency','X'],['sceneIds',['missing']],['status','anything'],['script',{}]])assert.throws(()=>Art.update(s,id,field,value));
 assert.throws(()=>Art.add(s,{name:'llave',category:'props'}));assert.deepEqual(s,before);assert.equal(Art.validate([{id:'evil',category:'art',name:'x',origin:'manual',script:{}}]),false);
});

test('responsibles include crew, actors and collaborators, deduplicate accents and omit profiles and private fields',()=>{
 const s={crew:[{firstName:' Carolina ',lastName:'Mora',area:'Arte',role:'Directora de arte',phone:'private'},
 {name:'Roberto Peña',area:'Cast',role:'Actor'}, {name:'Character',castProfile:true},{name:'Old person',mergedInto:'new'},{name:'',role:'Director'}]};
 const original=structuredClone(s),result=Art.people(s,[{name:'CAROLINA MORA',detail:'Colaboradora'},{name:'Luz',detail:'Colaboradora'}]);
 assert.deepEqual(result.map(p=>p.name),['Carolina Mora','Luz','Roberto Peña']);assert.match(result[0].detail,/Directora de arte.*Colaboradora/);
 assert.ok(!JSON.stringify(result).includes('private'));assert.deepEqual(s,original);
});
test('prop mentions prefer the full name over generic earlier words and support descriptive inventory labels',()=>{
 const context={window:{}};require('node:vm').runInNewContext(require('node:fs').readFileSync('js/script-document.js','utf8'),context);const find=context.window.RodaScriptDocument.firstMention;
 const text='Hay un arma. 22 guarda el arma de Chueco en la mochila.';
 const hit=find(text,Art.mentionVariants('Arma de Chueco'),true);assert.equal(text.slice(hit.start,hit.end),'arma de Chueco');
 const long='700 sostiene las botellas.';const match=find(long,Art.mentionVariants('Bebida de utilería para el gag de devolución a las botellas'),true);
 assert.equal(long.slice(match.start,match.end),'botellas');
 assert.equal(find('En la escena 6 no vemos objetos.',Art.mentionVariants('Guion impreso para el gag de página 6'),true),null);
});

test('deleting detected items persists across imports and preserves production and other categories',()=>{
 const s=fixture(),original=structuredClone(s);s.scenes[0].elements.art.push('Llave');
 const before=structuredClone(s),id=Art.idFor('props','Llave');assert.equal(Art.remove(s,id),true);assert.equal(Art.remove(s,id),false);
 assert.equal(Art.validate(s.artItems),true);assert.ok(!Art.rows(s).some(r=>r.id===id));assert.ok(Art.rows(s).some(r=>r.id==='art:llave'));
 for(const field of ['scenes','shootDays','crew','script'])assert.deepEqual(s[field],before[field]);
 const reloaded=JSON.parse(JSON.stringify(s));reloaded.scenes.push({id:'s3',elements:{props:['LLÁVE']}});
 assert.ok(!Art.rows(reloaded).some(r=>r.id===id));assert.equal(Art.totals(Art.rows(reloaded,'all',{includeDeleted:true})).count,3);
 assert.throws(()=>Art.update(reloaded,id,'notes','stale edit'));
 assert.equal(Art.validate([{...s.artItems[0],deleted:'true'}]),false);
});
test('manual and archived deletions can be re-added without losing preparation or duplicating rows',()=>{
 const s=fixture(),id=Art.add(s,{name:'Sillón',sceneIds:['s1']});Art.update(s,id,'unitPrice',300);Art.update(s,id,'notes','Devolver a Sol');Art.update(s,id,'archived',true);
 Art.remove(s,id);assert.ok(!Art.rows(s).some(r=>r.id===id));
 assert.equal(Art.add(s,{name:'sillon',sceneIds:['s2']}),id);const row=Art.rows(s).find(r=>r.id===id);
 assert.equal(row.archived,false);assert.equal(row.unitPrice,300);assert.equal(row.notes,'Devolver a Sol');assert.deepEqual(row.sceneIds,['s1','s2']);assert.equal(s.artItems.length,1);
});
test('concurrent inventory edits cannot bring back a deleted detection',()=>{
 const base=fixture(),id=Art.idFor('props','Llave'),a=structuredClone(base),b=structuredClone(base);
 Art.remove(a,id);Art.update(b,id,'responsible','Sol');const merged=global.Collaboration.mergeProject(base,a,b);
 assert.ok(!Art.rows(merged).some(r=>r.id===id));assert.equal(merged.artItems.find(r=>r.id===id).responsible,'Sol');
});

test('incorrect detected scene links can be removed, persist after imports and can be restored',()=>{
 const s=fixture(),id='props:llave',before=structuredClone(s);Art.update(s,id,'notes','Preparado');
 assert.equal(Art.setScene(s,id,'s1',false),true);assert.equal(Art.setScene(s,id,'s1',false),false);
 assert.deepEqual(Art.rows(s).find(r=>r.id===id).scenes.map(s=>s.id),['s2']);
 assert.ok(!Art.rows(s,'d1').some(r=>r.id===id));assert.ok(Art.rows(s,'d2').some(r=>r.id===id));
 for(const field of ['scenes','shootDays','crew','script'])assert.deepEqual(s[field],before[field]);
 const reloaded=JSON.parse(JSON.stringify(s));reloaded.scenes.push({id:'s3',elements:{props:['LLÁVE']}});
 assert.deepEqual(Art.rows(reloaded).find(r=>r.id===id).scenes.map(s=>s.id),['s2','s3']);
 Art.setScene(reloaded,id,'s2',false);Art.setScene(reloaded,id,'s3',false);
 assert.ok(Art.rows(reloaded,'unassigned').some(r=>r.id===id));
 Art.setScene(reloaded,id,'s1',true);assert.deepEqual(Art.rows(reloaded).find(r=>r.id===id).scenes.map(s=>s.id),['s1']);
 assert.equal(Art.rows(reloaded).find(r=>r.id===id).notes,'Preparado');assert.equal(Art.validate(reloaded.artItems),true);
});

test('distinct objects can be assigned independently without editing the screenplay',()=>{
 const s=fixture(),before=structuredClone(s),id='art:cartel';Art.setScene(s,id,'s1',false);
 const other=Art.add(s,{name:'Cartel de la fábrica',sceneIds:['s1']});
 assert.equal(Art.rows(s).find(r=>r.id===id).scenes.length,0);assert.deepEqual(Art.rows(s).find(r=>r.id===other).scenes.map(s=>s.id),['s1']);
 Art.setScene(s,other,'s1',false);s.scenes[0].elements.art.push('Cartel de la fábrica');
 assert.equal(Art.rows(s).find(r=>r.id===other).scenes.length,0);Art.setScene(s,other,'s1',true);
 assert.equal(Art.rows(s).find(r=>r.id===other).scenes.length,1);assert.deepEqual(s.shootDays,before.shootDays);
});

test('scene exclusions validate strictly and stale operations do not mutate inventory',()=>{
 const s=fixture(),id='props:llave',before=structuredClone(s);
 for(const args of [[id,'missing',false],[id,'s1','false'],['missing','s1',false]])assert.throws(()=>Art.setScene(s,...args));
 assert.deepEqual(s,before);Art.setScene(s,id,'s1',false);
 for(const value of ['s1',['s1','s1'],[null],[''],Array.from({length:2001},(_,i)=>'s'+i)])assert.equal(Art.validate([{...s.artItems[0],excludedSceneIds:value}]),false);
 Art.remove(s,id);assert.throws(()=>Art.setScene(s,id,'s1',true));
 Art.add(s,{name:'Llave',category:'props',sceneIds:['s1']});assert.equal(Art.rows(s).find(r=>r.id===id).scenes.length,2);
});

test('concurrent preparation edits preserve scene exclusions',()=>{
 const base=fixture(),a=structuredClone(base),b=structuredClone(base),id='props:llave';
 Art.setScene(a,id,'s1',false);Art.update(b,id,'responsible','Sol');
 const row=Art.rows(global.Collaboration.mergeProject(base,a,b)).find(r=>r.id===id);
 assert.deepEqual(row.scenes.map(s=>s.id),['s2']);assert.equal(row.responsible,'Sol');
});
