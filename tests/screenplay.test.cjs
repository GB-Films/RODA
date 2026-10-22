const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse,docsLink}=require('../js/screenplay.js');
test('an unnumbered insertion between numbered scenes produces a unique chronological sequence',()=>{
 const scenes=parse('1. INT. CASA - DÍA\nAna entra.\nINT. HOTEL - DÍA\nUna escena nueva.\n2. EXT. CALLE - DÍA\nPedro sale.');
 assert.deepEqual(scenes.map(s=>s.number),['1','2','3']);assert.deepEqual(scenes.map(s=>s.sourceLine),[0,2,4]);
});
test('explicit production suffixes and chapter numbering remain intact',()=>{
 assert.deepEqual(parse('CAPÍTULO 1\n12A. INT. CASA - DÍA\nAna entra.\n12B. EXT. CASA - NOCHE\nAna sale.\nCAPÍTULO 2\n1. INT. HOTEL - DÍA\nPedro entra.').map(s=>[s.chapter,s.number]),[[1,'12A'],[1,'12B'],[2,'1']]);
});
test('duplicated explicit scene numbers remain detectable rather than being silently merged',()=>{
 assert.deepEqual(parse('1. INT. CASA - DÍA\nAna entra.\n1. EXT. CALLE - NOCHE\nAna sale.').map(s=>s.number),['1','1']);
});
test('Google Docs links normalize account paths and reject unrelated or published URLs',()=>{
 assert.deepEqual(docsLink('https://docs.google.com/document/u/1/d/document-id/edit?tab=t.123'),{id:'document-id',url:'https://docs.google.com/document/d/document-id/edit'});
 assert.throws(()=>docsLink('https://example.test/document/d/id/edit'));assert.throws(()=>docsLink('https://docs.google.com/document/d/e/published/pub'));
});
