(function(root){
  const queue=[];
  let active=false;

  function showNext(){
    if(active||!queue.length)return;
    active=true;
    const {options,resolve}=queue.shift(), document=root.document;
    const opener=document.activeElement, dialog=document.createElement('dialog');
    dialog.id='rodaMessageDialog';
    dialog.className='roda-message-dialog';
    dialog.dataset.roAllow='1';
    dialog.setAttribute('aria-labelledby','rodaMessageTitle');
    dialog.setAttribute('aria-describedby','rodaMessageText');
    dialog.innerHTML='<form><header class="roda-message-heading"><h2 id="rodaMessageTitle"></h2><button class="btn icon ghost" type="button" data-dialog-close aria-label="Cerrar">×</button></header><p id="rodaMessageText"></p><label class="roda-message-field" hidden><span></span><input class="input" id="rodaMessageInput"/></label><footer class="roda-message-actions"><button class="btn" type="button" data-dialog-cancel>Cancelar</button><button class="btn" type="submit" data-dialog-accept></button></footer></form>';
    const form=dialog.querySelector('form'), title=dialog.querySelector('h2'), message=dialog.querySelector('p');
    const field=dialog.querySelector('label'), input=dialog.querySelector('input');
    const cancel=dialog.querySelector('[data-dialog-cancel]'), accept=dialog.querySelector('[data-dialog-accept]');
    const error=document.createElement('p');
    error.className='roda-message-error';error.id='rodaMessageError';error.setAttribute('role','alert');error.hidden=true;
    field.append(error);form.noValidate=true;
    title.textContent=options.title||'Roda';
    message.textContent=options.message||'';
    message.hidden=!options.message;
    cancel.hidden=options.kind==='alert';
    cancel.textContent=options.cancelLabel||'Cancelar';
    accept.textContent=options.confirmLabel||(options.kind==='alert'?'Entendido':'Continuar');
    accept.classList.add(options.danger?'danger':'primary');
    if(options.kind==='prompt'){
      field.hidden=false;
      field.querySelector('span').textContent=options.label||'Valor';
      input.type=['password','email','url'].includes(options.inputType)?options.inputType:'text';
      input.value=String(options.value??'');
      input.required=!!options.required;
      input.autocomplete=options.autocomplete||(input.type==='password'?'current-password':'off');
      input.oninput=()=>{error.hidden=true;input.removeAttribute('aria-invalid');};
      input.setAttribute('aria-describedby',error.id);
    }
    let settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;
      if(dialog.open)dialog.close();
      dialog.remove();active=false;
      if(opener?.isConnected)opener.focus({preventScroll:true});
      resolve(value);
      queueMicrotask(showNext);
    };
    const dismiss=()=>finish(options.kind==='prompt'?null:false);
    cancel.onclick=dismiss;
    dialog.querySelector('[data-dialog-close]').onclick=dismiss;
    dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
    dialog.addEventListener('close',dismiss);
    form.onsubmit=event=>{
      event.preventDefault();
      if(options.kind==='prompt'&&options.required&&!input.value.trim()){
        error.textContent='Completá este campo.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;
      }
      if(options.kind==='prompt'&&!input.validity.valid){
        error.textContent='Revisá el valor ingresado.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;
      }
      finish(options.kind==='prompt'?input.value:true);
    };
    document.body.append(dialog);
    dialog.showModal();
    if(options.kind==='prompt'){input.focus();input.select();}
    else (options.danger&&options.kind!=='alert'?cancel:accept).focus();
  }

  function ask(kind,options){
    return new Promise(resolve=>{queue.push({options:{...options,kind},resolve});showNext();});
  }
  root.RodaDialogs={
    confirm:options=>ask('confirm',options),
    prompt:options=>ask('prompt',options),
    alert:options=>ask('alert',options)
  };
})(typeof window==='undefined'?globalThis:window);
