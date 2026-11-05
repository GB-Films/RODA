import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {characterScript} from '../js/character-script.mjs';
const require=createRequire(import.meta.url),cast=require('../js/cast.js'),{parse}=require('../js/screenplay.js');
const dependencies={cast,parse};
const block=(text,style={})=>({runs:[{text}],style});
function fixture(){
 const blocks=[block('PELÍCULA'),block('ESCENA 20 INT. CASA - DÍA'),block('MARTA'),block('No te vayas.',{left:72}),block('OTRO'),block('Me quedo.'),block('ESCENA 21 EXT. PATIO - DÍA'),block('Esta escena no debe salir. MARTA se menciona pero no participa.'),block('ESCENA 25 INT. SALA - DÍA'),block('Marta escucha, sin hablar.'),block('ESCENA 30 EXT. CALLE - NOCHE'),block('MARTA'),{runs:[{text:'Hasta '},{text:'mañana.',style:{italic:true}}],style:{left:72,right:93.6}}];
 const rawText=blocks.map(b=>b.runs.map(r=>r.text).join('')).join('\n\n'),scenes=parse(rawText).map((s,i)=>({...s,id:'v'+i,productionSceneId:'p'+i}));
 return {meta:{title:'Película'},crew:[],scenes:scenes.map((s,i)=>({...s,id:'p'+i,elements:{cast:i===1?['OTRO']:['MARTA']}})),script:{activeVersionId:'active',castAliases:[{name:'MARTA',aliases:['REHÉN 1']}],versions:[{id:'draft',draft:true,rawText:'Incorrecto'},{id:'active',name:'V3',scenes,rawText,documentFormat:{blocks,pdf:{version:1,data:'old whole PDF'}}}]}};
}
test('exports complete associated scenes in screenplay order, including silent roles, with cover and no other scenes',()=>{
 const state=fixture();state.scenes.reverse();state.scenes[0].elements.cast=['REHÉN 1'];const before=JSON.stringify(state);
 const sides=characterScript(state,'REHÉN 1',dependencies);
 assert.equal(sides.character,'MARTA');assert.deepEqual(sides.scenes.map(s=>s.number),['20','25','30']);
 assert.match(sides.version.rawText,/3 escenas · V3/);assert.match(sides.version.rawText,/OTRO\n\nMe quedo/);assert.match(sides.version.rawText,/Marta escucha/);assert.doesNotMatch(sides.version.rawText,/Esta escena no debe salir/);
 assert.equal(sides.version.documentFormat.pdf,undefined);assert.equal(sides.version.documentFormat.blocks.at(-1).runs[1].style.italic,true);
 assert.equal(sides.version.documentFormat.blocks.at(-1).style.left,72);
 assert.equal(sides.version.documentFormat.blocks.filter(b=>b.style.breakBefore).length,3);
 assert.equal(JSON.stringify(state),before);
});
test('refuses a partial export when a production scene has no unambiguous screenplay link',()=>{
 const state=fixture();state.scenes.push({id:'lost',number:'50',elements:{cast:['MARTA']}});
 assert.throws(()=>characterScript(state,'MARTA',dependencies),/escena 50/);
});
test('uses active production version, never a newer draft or the latest unrelated version',()=>{
 const state=fixture();state.script.versions.push({id:'newer',name:'V8',rawText:'No compartir',createdAt:'2099-01-01'});
 assert.equal(characterScript(state,'MARTA',dependencies).version.name,'V3');
 state.script.activeVersionId='missing';assert.throws(()=>characterScript(state,'MARTA',dependencies),/versión de producción/);
});
test('handles suffixes, repeated numbers in separate chapters, stale offsets and chapter boundaries',()=>{
 const state=fixture(),rawText='CAPÍTULO 1\nESCENA 9B INT. SALA - DÍA\nMARTA\nHola.\nCAPÍTULO 2\nESCENA 9B EXT. CALLE - NOCHE\nOTRO\nSecreto.';
 const scenes=parse(rawText).map((s,i)=>({...s,sourceLine:999,id:'v'+i,productionSceneId:'p'+i}));
 state.script.versions[1]={id:'active',name:'V4',rawText,scenes};state.scenes=scenes.map((s,i)=>({...s,id:'p'+i,elements:{cast:i===0?['MARTA']:['OTRO']}}));
 const sides=characterScript(state,'MARTA',dependencies);assert.deepEqual(sides.scenes.map(s=>[s.chapter,s.number]),[[1,'9B']]);
 assert.doesNotMatch(sides.version.rawText,/CAPÍTULO 2|Secreto/);assert.match(sides.version.rawText,/Hola/);
});
test('rejects stale scene indexes and supports scenes-only versions without exporting summaries',()=>{
 const state=fixture();state.script.versions[1].rawText+='\nESCENA 99 EXT. OTRO - NOCHE\nCambio.';
 assert.throws(()=>characterScript(state,'MARTA',dependencies),/actualizarse/);
 state.script.versions[1].rawText='';state.script.versions[1].scenes[0].summary='Resumen privado';
 const sides=characterScript(state,'MARTA',dependencies);assert.match(sides.version.rawText,/No te vayas/);assert.doesNotMatch(sides.version.rawText,/Resumen privado/);
});
test('clips a formatted block spanning two scene boundaries without leaking the excluded scene',()=>{
 const state=fixture(),v=state.script.versions[1];v.documentFormat.blocks=[block(v.rawText,{left:0})];
 const sides=characterScript(state,'MARTA',dependencies);assert.doesNotMatch(sides.version.rawText,/Esta escena no debe salir/);assert.match(sides.version.rawText,/Me quedo/);
});
