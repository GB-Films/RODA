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
