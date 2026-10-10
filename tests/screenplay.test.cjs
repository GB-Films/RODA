const test=require('node:test'),assert=require('node:assert/strict');
const {breakdown,docsLink,docsText,sceneKey,pdfLines}=require('../js/screenplay.js');
const {parse,headingMetadata}=require('../js/screenplay.js');
test('Recognizes all 36 labeled scenes, montage headings and numeric characters; prose is not a scene',()=>{
 const text='Título del proyecto\nGuion organizado por escenas\n\n'+Array.from({length:36},(_,i)=>`ESCENA ${String(i+1).padStart(2,'0')}  ${i===11?'MONTAJE DE RECAPITULACIÓN':'INT. LUGAR '+(i+1)+' - DÍA'}\n\nInterior oficina, vemos a dos agentes chequeando unas pantallas.\n\n700\n\nEstoy listo.\n\n22\n\nVamos.`).join('\n\n');
 const scenes=parse(text);assert.equal(scenes.length,36);assert.deepEqual(scenes.map(s=>s.number),Array.from({length:36},(_,i)=>String(i+1)));assert.equal(scenes[11].slugline,'MONTAJE DE RECAPITULACIÓN');assert.match(scenes[0].body,/Interior oficina/);assert.deepEqual(breakdown(scenes[0]).cast,['700','22']);
});
test('Accepts split scene labels, suffixes, chapter restarts and conventional headings',()=>{
 const scenes=parse('CAPÍTULO 1\nESCENA 01\n\nEXT. PLAZA - NOCHE\nAcción.\nESCENA 01A: INT. AUTO - DÍA\nAcción.\nCAPÍTULO 2\n1. INTERIOR CASA - NOCHE\nInterior casa, vemos a Ana hablar.\n2 EXT. RUTA - DÍA\nAcción.');
 assert.deepEqual(scenes.map(s=>[s.chapter,s.number,s.location]),[[1,'1','PLAZA'],[1,'1A','AUTO'],[2,'1','CASA'],[2,'2','RUTA']]);assert.equal(scenes[2].timeOfDay,'Noche');
 assert.deepEqual(headingMetadata('INTERIOR AMBULANCIA'),{intExt:'Int',location:'AMBULANCIA',timeOfDay:''});
 assert.equal(parse('Interior ambulancia, vemos a los enfermeros trabajar.').length,0);
});
test('Detects Spanish production elements and dialogue cues without substring matches',()=>{
 const elements=breakdown({body:"ANA (V.O.)\nTraé la pistola.\n\nJuan usa un sombrero y corre bajo la lluvia.\n[Props: Reloj antiguo; cartel azul]\n[Extras: Vecinos]\nAutomático, gato y camisario."});
 assert.deepEqual(elements.cast,['ANA']);assert.ok(elements.props.includes('pistola'));assert.ok(elements.props.includes('Reloj antiguo'));assert.deepEqual(elements.wardrobe,['sombrero']);assert.ok(elements.sfx.includes('lluvia'));assert.deepEqual(elements.extras,['Vecinos']);assert.equal(elements.vehicles.length,0);assert.ok(!elements.wardrobe.includes('camisa'));
});
test('Accepts canonical/private Google Docs links, rejects foreign hosts, scripts and published documents',()=>{
 assert.deepEqual(docsLink('https://docs.google.com/document/u/0/d/abc-123/edit?usp=sharing'),{id:'abc-123',url:'https://docs.google.com/document/d/abc-123/edit'});
 for(const url of ['javascript:alert(1)','https://docs.google.com.evil.test/document/d/abc/edit','https://docs.google.com/document/d/e/abc/pub','https://drive.google.com/file/d/abc/view'])assert.throws(()=>docsLink(url));
});
test('Reads all document tabs and tables once, excludes duplicate legacy body and retains Unicode',()=>{
 const paragraph=text=>({paragraph:{elements:[{textRun:{content:text}}]}});
 const doc={body:{content:[paragraph('duplicate')]},tabs:[{documentTab:{body:{content:[paragraph('INT. CASA - DÍA\n'),{table:{tableRows:[{tableCells:[{content:[paragraph('ANA\nHola.\n')]}]}]}}]}},childTabs:[{documentTab:{body:{content:[paragraph('EXT. PLAZA - NOCHE\n')]}}}]}]};
 assert.equal(docsText(doc),'INT. CASA - DÍA\nANA\nHola.\nEXT. PLAZA - NOCHE');
});
test('Scene identity includes chapter; PDF text follows page coordinates instead of token order',()=>{
 assert.notEqual(sceneKey({chapter:1,number:'2a'}),sceneKey({chapter:2,number:'2A'}));
 assert.equal(pdfLines([{str:'DÍA',transform:[1,0,0,1,100,500]},{str:'Hola.',transform:[1,0,0,1,30,450]},{str:'INT. CASA -',transform:[1,0,0,1,30,500]}]),'INT. CASA - DÍA\nHola.');
});
test('Reader anchors use the original heading line, including split labels and repeated chapter numbering',()=>{
 const text='Título\n\nCAPÍTULO 1\nESCENA 01\n\nINT. CASA - DÍA\nANA\nHola.\nCAPÍTULO 2\nESCENA 01 INT. CASA - DÍA\nAdiós.';
 const scenes=parse(text);
 assert.deepEqual(scenes.map(s=>s.sourceLine),[3,9]);
 assert.notEqual(sceneKey(scenes[0]),sceneKey(scenes[1]));
});
