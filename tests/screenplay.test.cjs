const test=require('node:test'),assert=require('node:assert/strict');
const {breakdown,docsLink,docsText,sceneKey,pdfLines}=require('../js/screenplay.js');
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
