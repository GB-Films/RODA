/* View preferences only. Project data and permissions remain in the app. */
window.RodaResponsive=(()=>{
 const small=()=>matchMedia('(max-width:700px), (max-height:500px) and (max-width:1279px)').matches;
 const panels=new Map();
 const showDetail=view=>{if(small())panels.get(view)?.(true);};
 function init(){
  if(!document.body.classList.contains('roda-studio'))return;
  for(const [view,list,detail,label] of [['breakdown','sceneListCard','sceneEditorCard','Escenas'],['elements','elementsExplorerCard','elementsDetailCard','Elementos']]){
   const host=document.getElementById('view-'+view),bar=document.createElement('div');
   bar.className='responsivePaneTabs';bar.dataset.roAllow='1';bar.setAttribute('role','group');bar.setAttribute('aria-label','Panel de '+label.toLowerCase());
   bar.innerHTML=`<button class="btn" type="button" aria-controls="${list}" aria-pressed="true">${label}</button><button class="btn" type="button" aria-controls="${detail}" aria-pressed="false">Detalle</button>`;
   const choose=show=>{host.classList.toggle('responsive-detail',show);bar.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(Boolean(i)===show)));};
   panels.set(view,choose);
   bar.children[0].onclick=()=>choose(false);bar.children[1].onclick=()=>choose(true);host.prepend(bar);
   document.getElementById(list).addEventListener('click',e=>{if(small()&&e.target.closest(view==='breakdown'?'.bdSceneSelect':'#elxList .sceneCard')){choose(true);const scroll=host.querySelector(view==='breakdown'?'.bdEditorScroll':'#elxDetail');if(scroll)scroll.scrollTop=0;}});
  }
  for(const id of ['dayplanCard','scheduleCard','crewCard','shotlistCard']){
   const header=document.querySelector('#'+id+'>.cardHeader'),toolbar=header?.querySelector('.row');if(!toolbar)continue;
   const menu=document.createElement('details');menu.className='responsiveTools';
   const summary=document.createElement('summary');summary.dataset.roAllow='1';summary.className='btn';summary.textContent='Herramientas';summary.setAttribute('aria-label','Herramientas de '+header.querySelector('h2').textContent);menu.append(summary);header.append(menu);menu.append(toolbar);
   const place=()=>{if(small()&&menu.open)menu.style.setProperty('--roda-tools-top',Math.min(summary.getBoundingClientRect().bottom+8,Math.max(12,innerHeight-100))+'px');};
   menu.addEventListener('toggle',place);window.addEventListener('resize',place);
   document.addEventListener('click',e=>{if(small()&&!menu.contains(e.target))menu.open=false;});
   menu.addEventListener('keydown',e=>{if(e.key==='Escape'&&small()){menu.open=false;summary.focus();}});
   // The content is always displayed on desktop, independently of disclosure state.
   const mq=matchMedia('(max-width:700px), (max-height:500px) and (max-width:1279px)');const update=()=>{menu.open=!mq.matches;};mq.addEventListener('change',update);update();
  }
  const bank=document.getElementById('dpBankCol'),head=document.querySelector('#dayplanCard>.cardHeader');
  const toggle=document.createElement('button');toggle.className='btn responsiveBankToggle';toggle.type='button';toggle.dataset.roAllow='1';toggle.textContent='Escenas';toggle.setAttribute('aria-controls','dpBankCol');toggle.setAttribute('aria-expanded','false');head.append(toggle);
  toggle.onclick=()=>{const open=!bank.classList.contains('responsive-bank-open');bank.classList.toggle('responsive-bank-open',open);toggle.setAttribute('aria-expanded',String(open));};
  bank.addEventListener('click',e=>{if(e.target.closest('.scene-plan-action,#dpBtnToggleBank')){bank.classList.remove('responsive-bank-open');toggle.setAttribute('aria-expanded','false');}},true);
  document.addEventListener('click',e=>{if(!bank.contains(e.target)&&!toggle.contains(e.target)){bank.classList.remove('responsive-bank-open');toggle.setAttribute('aria-expanded','false');}});
  const call=document.querySelector('.dayDetail3col'),callTabs=document.createElement('div');
  callTabs.className='responsivePaneTabs responsiveCallTabs';callTabs.dataset.roAllow='1';callTabs.setAttribute('role','group');callTabs.setAttribute('aria-label','Secciones del call diario');
  ['Itinerario','Elenco','Equipo'].forEach((label,i)=>{const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=label;button.setAttribute('aria-pressed',String(i===0));button.onclick=()=>{call.dataset.mobilePanel=String(i);callTabs.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));};callTabs.append(button);});
  call.dataset.mobilePanel='0';call.before(callTabs);
 }
 return {init,showDetail};
})();
