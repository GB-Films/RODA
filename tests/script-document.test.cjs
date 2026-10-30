const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {isTabCover}=require('../js/script-pages.js');

test('only synthetic Google tab cover pages absent from the screenplay are hidden',()=>{
 const raw='SUPER AGENTE 700\n1. INT. CASA - DÍA\nUna acción.';
 assert.equal(isTabCover('Pestaña 1',{source:'google-doc'},raw),true);
 assert.equal(isTabCover('Mi capítulo',{source:'google-doc',tabTitles:['Mi capítulo']},raw),true);
 assert.equal(isTabCover('Pestaña 1',{source:'word'},raw),false);
 assert.equal(isTabCover('Pestaña 1',{source:'google-doc'},'Pestaña 1\n'+raw),false);
 assert.equal(isTabCover('SUPER AGENTE 700',{source:'google-doc',tabTitles:['SUPER AGENTE 700']},raw),false);
 assert.equal(isTabCover('Pestaña 1 Guion real',{source:'google-doc'},raw),false);
});
test('Google Docs imports nested tabs and latest styled text into one screenplay',()=>{
 const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/script-document.js'),'utf8'),context);
 const paragraph=text=>({paragraph:{elements:[{textRun:{content:text+'\n',textStyle:{bold:true}}}]}});
 const doc={tabs:[{documentTab:{body:{content:[paragraph('1. INT. CASA - DÍA'),paragraph('Última revisión de la escena.')]},namedStyles:{styles:[]}},childTabs:[{documentTab:{body:{content:[paragraph('2. EXT. CALLE - NOCHE'),paragraph('Escena nueva.')]}}}]}]};
 const formatted=context.window.RodaScriptDocument.docsFormat(doc);
 assert.equal(formatted.format.blocks.length,4);assert.equal(formatted.format.blocks[0].runs[0].style.bold,true);assert.match(formatted.text,/Última revisión/);assert.match(formatted.text,/2\. EXT\. CALLE/);
 const scenes=require('../js/screenplay.js').parse(formatted.text);assert.equal(scenes.length,2);assert.equal(scenes[1].number,'2');
});

test('Google page geometry and explicit breaks remain available to the reading-page fallback',()=>{
 const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/script-document.js'),'utf8'),context);
 const result=context.window.RodaScriptDocument.docsFormat({documentStyle:{documentSize:{width:{magnitude:595},height:{magnitude:842}},marginTop:{magnitude:50},marginLeft:{magnitude:60}},body:{content:[{paragraph:{paragraphStyle:{pageBreakBefore:true},elements:[{textRun:{content:'1. INT. CASA - DÍA\n'}}]}}]}});
 assert.equal(result.format.page.width,595);assert.equal(result.format.page.height,842);assert.equal(result.format.page.margins.top,50);assert.equal(result.format.page.margins.left,60);assert.equal(result.format.blocks[0].style.breakBefore,true);
});

test('character mentions match full names and aliases with original Unicode offsets',()=>{
 const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/script-document.js'), 'utf8'),context);
 const find=context.window.RodaScriptDocument.firstMention;
 for(const [text,variants,want] of [
  ['122 mira a 22.',['22'],'22'],
  ['Secretariado. La secretária llega. SECRETARIA',['SECRETARIA'],'secretária'],
  ['La ASISTENTE llega. SECRETARIA después.',['SECRETARIA','ASISTENTE'],'ASISTENTE'],
  ['SECUAZ-1 entra.',['SECUAZ 1'],'SECUAZ-1'],
  ['IVÁN RAPOSKY se detiene.',['IVAN','IVAN RAPOSKY'],'IVÁN RAPOSKY']
 ]){const range=find(text,variants);assert.ok(range);assert.equal(text.slice(range.start,range.end),want);}
 assert.equal(find('1700 y 122', ['700','22']),null);
 assert.equal(find('Una acción sin personajes.', []),null);
});
