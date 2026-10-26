(function(root){
  function editing(document){
    const active=document.activeElement;
    return !!(active?.matches('input,textarea,select,[contenteditable="true"]')&&!active.disabled&&!active.readOnly&&!active.closest('[data-ro-allow="1"]'));
  }
  function paint(document,render){
    const active=document.activeElement,focusId=active?.id;
    const selection=typeof active?.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null;
    const scrolls=[...document.querySelectorAll('[id]')].filter(n=>n.scrollTop||n.scrollLeft).map(n=>[n.id,n.scrollLeft,n.scrollTop]);
    render();
    const focused=focusId&&document.getElementById(focusId);
    if(focused&&focused!==document.activeElement&&!focused.disabled){focused.focus({preventScroll:true});if(selection)focused.setSelectionRange(...selection);}
    for(const [id,x,y] of scrolls){const node=document.getElementById(id);if(node){node.scrollLeft=x;node.scrollTop=y;}}
  }
  root.RodaLiveView={editing,paint};
  if(typeof module!=='undefined')module.exports=root.RodaLiveView;
})(typeof window==='undefined'?globalThis:window);
