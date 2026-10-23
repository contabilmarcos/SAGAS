/* SAGAS | Componente global "Plano de Contas Contábil" (padrão de pesquisa RM).
   Mantém o select original e o account_id das rotinas existentes.
   Sem alterar o backend ou as regras de validação. */
(function(){
  'use strict';
  const accountSelectors=[
    'select.acct',
    'select.nd-account',
    'select.me-account',
    'select[name="debit_account_id"]',
    'select[name="credit_account_id"]',
    'select[name="account_id"]',
    'select[name="elimination_account_id"]'
  ].join(',');
  const applied=new WeakSet();
  const displays=new WeakMap();
  let activeDialog=null;
  let scanQueued=false;

  function enabledAccount(a){return !!a&&Number(a.active)===1&&Number(a.analytic)===1;}
  function filterAccounts(list,field,term){
    const query=String(term||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    if(!query)return list;
    return list.filter(a=>{
      const normalized=String(a[field]||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
      return normalized.includes(query);
    });
  }
  function accountLabel(account){
    return String(account.code||'')+' - '+String(account.name||'');
  }
  function selectedOptionText(select){
    const opt=select.selectedOptions&&select.selectedOptions[0];
    return opt&&opt.value?opt.textContent.trim():'';
  }
  function fireChange(select){
    select.dispatchEvent(new Event('input',{bubbles:true}));
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function syncSelect(select){
    const picker=displays.get(select);
    if(!picker)return;
    const disabled=!!select.disabled;
    const label=selectedOptionText(select);
    picker.input.value=label;
    picker.input.title=label||'Pesquisar conta contábil';
    picker.input.disabled=disabled;
    picker.button.disabled=disabled;
    picker.wrapper.classList.toggle('is-disabled',disabled);
  }
  function enhance(select){
    if(!select||!select.isConnected||applied.has(select))return;
    applied.add(select);
    const wrap=document.createElement('div');
    wrap.className='sagas-account-picker';
    wrap.setAttribute('data-sagas-account-picker','');
    const input=document.createElement('input');
    input.type='text';
    input.readOnly=true;
    input.setAttribute('aria-label','Pesquisar e selecionar conta contábil');
    input.placeholder='Pesquisar conta...';
    input.autocomplete='off';
    const btn=document.createElement('button');
    btn.type='button';
    btn.setAttribute('aria-label','Abrir pesquisa de contas contábeis');
    btn.title='Pesquisar no Plano de Contas Contábil';
    btn.textContent='⌕';
    wrap.append(input,btn);
    select.classList.add('sagas-account-original');
    // Mantém o select original como fonte de verdade para FormData, .value,
    // select.required, regras de contabilização e validação em telas antigas.
    select.parentNode.insertBefore(wrap,select.nextSibling);
    displays.set(select,{wrapper:wrap,input,button:btn});
    const open=()=>{if(!select.disabled)openLookup(select)};
    btn.addEventListener('click',open);
    input.addEventListener('click',open);
    input.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
    select.addEventListener('change',()=>syncSelect(select));
    syncSelect(select);
  }
  function scan(){
    scanQueued=false;
    document.querySelectorAll(accountSelectors).forEach(enhance);
    document.querySelectorAll(accountSelectors).forEach(syncSelect);
  }
  function queueScan(){
    if(scanQueued)return;
    scanQueued=true;
    queueMicrotask(scan);
  }
  function closeLookup(){
    if(!activeDialog)return;
    const old=activeDialog;
    activeDialog=null;
    old.cleanup();
    old.overlay.remove();
    if(old.focusTarget&&old.focusTarget.isConnected&&!old.focusTarget.disabled)old.focusTarget.focus();
  }
  async function openLookup(select){
    if(activeDialog)closeLookup();
    if(!select.isConnected||select.disabled)return;
    const overlay=document.createElement('div');
    overlay.className='sagas-ac-overlay';
    overlay.innerHTML='<div class="sagas-ac-dialog" role="dialog" aria-modal="true" aria-label="Plano de Contas Contábil">'+
      '<div class="sagas-ac-head"><strong>Plano de Contas Contábil</strong><button type="button" class="ac-close" aria-label="Fechar">×</button></div>'+
      '<div class="sagas-ac-toolbar"><label for="sagasAccField">Filtrar por:</label>'+
        '<select id="sagasAccField"><option value="name">Descrição</option><option value="code">Código</option><option value="reduced_code">Reduzido</option></select>'+
        '<input id="sagasAccTerm" type="search" placeholder="Digite para pesquisar..." autocomplete="off">'+
        '<button type="button" class="sagas-ac-btn ac-search">Pesquisar</button>'+
        '<button type="button" class="sagas-ac-btn ac-clearfilter">Limpar</button>'+
      '</div><div class="sagas-ac-hint">Selecione uma conta por duplo clique ou pelo botão Selecionar. Apenas contas analíticas ativas.</div>'+
      '<div class="sagas-ac-scroll"><table class="sagas-ac-table"><thead><tr>'+
      '<th>Código</th><th>Reduzido</th><th>Descrição</th><th>Natureza</th>'+
      '</tr></thead><tbody class="ac-rows"><tr><td colspan="4">Carregando plano de contas...</td></tr></tbody></table></div>'+
      '<div class="sagas-ac-footer"><span class="sagas-ac-status" role="status">Carregando...</span>'+
      '<div class="buttons"><button type="button" class="sagas-ac-btn ac-prev">‹ Anterior</button>'+
      '<button type="button" class="sagas-ac-btn ac-next">Próxima ›</button>'+
      '<button type="button" class="sagas-ac-btn ac-reset">Limpar conta</button>'+
      '<button type="button" class="sagas-ac-btn ac-cancel">Cancelar</button>'+
      '<button type="button" class="sagas-ac-btn sagas-ac-primary ac-select" disabled>Selecionar</button>'+
      '</div></div></div>';
    document.body.appendChild(overlay);
    const $=s=>overlay.querySelector(s);
    const field=$('#sagasAccField'), term=$('#sagasAccTerm'),rows=$('.ac-rows');
    const status=$('.sagas-ac-status'),pick=$('.ac-select'),next=$('.ac-next'),prev=$('.ac-prev');
    const reset=$('.ac-reset');
    reset.disabled=select.required;
    let all=[],filtered=[],page=0,selected=null,loading=true,loadFailed=false;
    const size=80;
    const focusTarget=displays.get(select)?.input||null;
    const escHandler=e=>{
      if(e.key==='Escape'){e.preventDefault();closeLookup()}
      if((e.key==='Enter')&&document.activeElement===term){e.preventDefault();if(selected)commit(selected);}
    };
    document.addEventListener('keydown',escHandler,true);
    activeDialog={overlay,focusTarget,cleanup:()=>document.removeEventListener('keydown',escHandler,true)};
    $('.ac-close').onclick=closeLookup;
    $('.ac-cancel').onclick=closeLookup;
    overlay.addEventListener('mousedown',e=>{if(e.target===overlay)closeLookup()});
    const commit=account=>{
      if(!account||select.disabled||!select.isConnected)return;
      if(!Array.from(select.options).some(o=>o.value===account.id))return;
      select.value=account.id;
      fireChange(select);
      syncSelect(select);
      closeLookup();
    };
    const render=()=>{
      rows.replaceChildren();
      const start=page*size,pageItems=filtered.slice(start,start+size);
      if(!pageItems.length){
        const tr=document.createElement('tr'),td=document.createElement('td');
        td.colSpan=4;
        td.textContent=loading?'Carregando...':loadFailed?'Não foi possível carregar o plano de contas.':'Nenhuma conta encontrada.';
        tr.append(td);rows.append(tr);
      }
      for(const a of pageItems){
        const tr=document.createElement('tr');
        tr.tabIndex=0;
        tr.title='Duplo clique para selecionar';
        tr.classList.toggle('selected',selected?.id===a.id);
        for(const str of [a.code,a.reduced_code,a.name,a.normal_side==='D'?'Devedora':a.normal_side==='C'?'Credora':'—']){
          const td=document.createElement('td');td.textContent=String(str||'');tr.append(td);
        }
        tr.onclick=()=>{
          selected=a;
          rows.querySelectorAll('tr.selected').forEach(x=>x.classList.remove('selected'));
          tr.classList.add('selected');pick.disabled=false;
        };
        tr.ondblclick=()=>commit(a);
        tr.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commit(a)}};
        rows.append(tr);
      }
      prev.disabled=page===0||loading;
      next.disabled=(page+1)*size>=filtered.length||loading;
      pick.disabled=!selected||loading;
      status.textContent=loading?'Carregando...':filtered.length+
        ' conta(s) encontrada(s) · Página '+(page+1)+' de '+Math.max(1,Math.ceil(filtered.length/size));
    };
    const search=()=>{
      filtered=filterAccounts(all,field.value,term.value);
      page=0;selected=null;render();
    };
    term.oninput=search;
    field.onchange=search;
    $('.ac-search').onclick=search;
    $('.ac-clearfilter').onclick=()=>{field.value='name';term.value='';search();term.focus()};
    next.onclick=()=>{page++;selected=null;render()};
    prev.onclick=()=>{page=Math.max(0,page-1);selected=null;render()};
    pick.onclick=()=>commit(selected);
    reset.onclick=()=>{if(select.required)return;select.value='';fireChange(select);syncSelect(select);closeLookup()};
    render();
    term.focus();
    try{
      let accountsList;
      if(typeof accounts==='function')accountsList=await accounts();
      else accountsList=(await api('/api/accounts')).accounts||[];
      if(!activeDialog||activeDialog.overlay!==overlay)return;
      const allowed=new Set(Array.from(select.options).map(o=>o.value).filter(Boolean));
      all=(Array.isArray(accountsList)?accountsList:[])
        .filter(a=>enabledAccount(a)&&allowed.has(String(a.id)))
        .sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''),'pt-BR',{numeric:true}));
      filtered=all;loading=false;render();
    }catch(err){
      if(!activeDialog||activeDialog.overlay!==overlay)return;
      loading=false;loadFailed=true;filtered=[];render();
      status.textContent='Erro ao consultar contas: '+String(err?.message||err);
    }
  }
  function initialize(){
    scan();
    const observer=new MutationObserver(records=>{
      let hasNewNodes=false;
      for(const entry of records){
        if(entry.type==='attributes'){
          if(entry.target.matches?.(accountSelectors))syncSelect(entry.target);
        }else if(entry.type==='childList')hasNewNodes=true;
      }
      // Evita recursão ao atualizar o atributo disabled nos controles visuais.
      if(hasNewNodes)queueScan();
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    window.SAGAS_ACCOUNT_LOOKUP={open:openLookup,scan:scan,filter:filterAccounts,close:closeLookup};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
