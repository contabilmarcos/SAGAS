// SAGAS v132 - Provisoes: cadastro proprio com duas guias no mesmo modal.
(function(){
 'use strict';
 const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const period=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
 const samples={
  PROV_FERIAS:'SELECT ROUND(:SALARIO_CONTRATUAL / 12.0, 2) AS VALOR',
  PROV_TERCO_FERIAS:'SELECT ROUND(:PROVISAO_FERIAS / 3.0, 2) AS VALOR',
  PROV_13:'SELECT ROUND(:SALARIO_REFERENCIA_13 / 12.0, 2) AS VALOR',
  PROV_FGTS_FERIAS:'SELECT ROUND(:PROVISAO_FERIAS * 0.08, 2) AS VALOR',
  PROV_FGTS_13:'SELECT ROUND(:PROVISAO_13 * 0.08, 2) AS VALOR'
 };
 const varsDefault={SALARIO_CONTRATUAL:3000,SALARIO_REFERENCIA_13:3000,
  PROVISAO_FERIAS:250,PROVISAO_13:250,PROVISAO_TERCO_FERIAS:83.33,
  BASE_INSS:3000,BASE_FGTS:3000,VALOR_FERIAS:250,AVOS_13:1,FAP:1,RAT:2};
 const modelNames=[
  ['PROV_FERIAS','Férias mensais (1/12)'],
  ['PROV_TERCO_FERIAS','1/3 sobre provisão de férias'],
  ['PROV_13','13º salário mensal (1/12)'],
  ['PROV_FGTS_FERIAS','FGTS sobre provisão de férias'],
  ['PROV_FGTS_13','FGTS sobre provisão de 13º']
 ];
 async function render(){
  const res=await api('/api/payroll/provision-definitions');
  const items=res.items||[];
  const manage=can('payroll.manage');
  const rows=items.map(v=>'<tr>'+
   '<td class="code">'+h(v.code)+'</td><td><b>'+h(v.name)+'</b></td>'+
   '<td>'+h(v.effective_from||'—')+'</td>'+
   '<td><code>'+h(String(v.formula_sql||'').slice(0,90))+'</code></td>'+
   '<td>'+(v.accrual_nature_id?'Configurada':'Pendente')+'</td>'+
   '<td>'+(v.active?'<span class="badge green">Ativa</span>':'<span class="badge gray">Inativa</span>')+'</td>'+
   '<td><button type="button" class="btn secondary sm" data-prov132="'+h(v.id)+'">'+(manage?'Configurar':'Consultar')+'</button></td>'+
   '</tr>').join('');
  tablePage({newLabel:manage?'Cadastrar provisão':null,
   onNew:manage?()=>open(null).catch(e=>toast(e.message,'error')):null,
   cols:['Código','Provisão','Vigência','Fórmula','Contabilização','Situação','Ações'],rows,
   emptyTitle:'Nenhuma provisão cadastrada',
   emptyText:'Cadastre uma provisão com fórmula e contabilização no mesmo formulário.',
   placeholder:'Pesquisar provisões...'});
  $$('[data-prov132]').forEach(b=>b.onclick=()=>open(b.dataset.prov132).catch(e=>toast(e.message,'error')));
  const bar=$('#content .toolbar');
  if(bar){
   bar.insertAdjacentHTML('beforeend','<button id="prov132Balances" type="button" class="btn secondary">Saldos e baixas existentes</button>');
   $('#prov132Balances').onclick=()=>payrollProvision43Ledger().catch(e=>toast(e.message,'error'));
  }
 }
 function field(label,control){return '<label class="field"><span>'+h(label)+'</span>'+control+'</label>';}
 function input(name,value,attr=''){
  return '<input name="'+h(name)+'" value="'+h(value??'')+'" '+attr+'>';
 }
 function opts(natures,selected,empty='Selecione a natureza'){
  return '<option value="">'+h(empty)+'</option>'+natures.map(v=>
   '<option value="'+h(v.id)+'"'+(v.id===selected?' selected':'')+'>'+h(v.code+' — '+v.description)+'</option>').join('');
 }
 async function open(id=null){
  const [data,natures,sqlCatalog]=await Promise.all([
   id?api('/api/payroll/provision-definitions/'+encodeURIComponent(id)):Promise.resolve(null),
   api('/api/payroll/accounting-natures'),
   api('/api/payroll/designer/sql-variables')
  ]);
  const item=data?.item||{};
  const recent=data?.applicable||{};
  const original=recent.config||{};
  const cfg={
   code:item.code||'',name:item.name||'',effective_from:original.effective_from||period(),
   formula_sql:original.formula_sql||samples.PROV_FERIAS,
   active:id?Boolean(item.active):true,
   accounting:{nature_accrual_id:original.accounting?.nature_accrual_id||'',
     nature_use_id:original.accounting?.nature_use_id||''}
  };
  const n=(natures.natures||[]).filter(v=>v.active&&v.synthetic_analytic==='ANALYTIC');
  const variables=sqlCatalog.variables||[];
  const selectModel='<option value="">Escolher exemplo de fórmula (opcional)</option>'+modelNames.map(([k,v])=>
   '<option value="'+h(k)+'">'+h(v)+'</option>').join('');
  const history=data?.versions||[];
  const historyRows=history.map(v=>
   '<tr><td>'+h(v.effective_from)+'</td><td>'+v.revision+'</td>'+
   '<td>'+h(v.created_at||'—')+'</td>'+
   '<td><button type="button" class="btn secondary sm" data-prov132-revision="'+h(v.id)+'">Carregar</button></td></tr>').join('');
  const readOnly=!can('payroll.manage');
  const modal='<form id="prov132Form" novalidate>'+
   '<div class="grid">'+
   field('Código',input('code',cfg.code,'maxlength="30" '+(id?'readonly':'')))+
   field('Descrição',input('name',cfg.name,'maxlength="120"'))+
   field('Vigente a partir de',input('effective_from',cfg.effective_from,'type="month"'))+
   '<label class="check"><input type="checkbox" name="active"'+(cfg.active?' checked':'')+'> Provisão ativa</label>'+
   '</div>'+
   '<div class="toolbar" role="tablist" aria-label="Configuracao da provisao" style="margin-top:12px">'+
   '<button type="button" id="prov132TabCalc" class="btn primary" role="tab" aria-selected="true" aria-controls="prov132Calc">Fórmula de Cálculo</button>'+
   '<button type="button" id="prov132TabAccounting" class="btn secondary" role="tab" aria-selected="false" aria-controls="prov132Accounting">Contabilização</button>'+
   '</div>'+
   '<section id="prov132Calc" role="tabpanel" aria-labelledby="prov132TabCalc">'+
   '<div class="section-title">Fórmula desta provisão</div>'+
   '<p class="help">A fórmula é digitada aqui, dentro do cadastro. Não precisa criar outro registro em Fórmulas de Cálculo. Use somente SELECT &lt;expressão&gt; AS VALOR, com parâmetros autorizados.</p>'+
   field('Exemplos de fórmula','<select id="prov132Sample">'+selectModel+'</select>')+
   field('Consulta SQL','<textarea id="prov132Sql" name="formula_sql" rows="5" maxlength="1200" spellcheck="false" style="font-family:monospace;min-height:135px;width:100%">'+h(cfg.formula_sql)+'</textarea>')+
   '<p class="help">Variáveis disponíveis: '+variables.map(v=>'<code>:'+h(v)+'</code>').join(' · ')+'</p>'+
   '<div class="section-title">Simular fórmula antes de salvar</div>'+
   '<div class="grid" id="prov132Parameters"></div>'+
   '<div class="toolbar"><button type="button" id="prov132Simulate" class="btn secondary">Simular cálculo</button>'+
   '<span class="help" id="prov132SimResult"></span></div>'+
   '</section>'+
   '<section id="prov132Accounting" role="tabpanel" aria-labelledby="prov132TabAccounting" class="hidden">'+
   '<div class="section-title">Contabilização da constituição</div>'+
   '<p class="help">Selecione a natureza orçamentária que determinará as partidas a débito e a crédito por centro de custo.</p>'+
   field('Natureza da constituição','<select name="nature_accrual_id">'+opts(n,cfg.accounting.nature_accrual_id)+'</select>')+
   '<div class="section-title">Contabilização da baixa</div>'+
   field('Natureza da baixa (opcional)','<select name="nature_use_id">'+opts(n,cfg.accounting.nature_use_id,'Sem natureza de baixa por enquanto')+'</select>')+
   '<p class="help">Em Naturezas Orçamentárias, configure os defaults de débito e crédito para cada centro de custo. A baixa pode usar natureza diferente da constituição. Nenhuma contabilização é gerada ao salvar este cadastro.</p>'+
   '<div id="prov132AccountHint" class="help"></div>'+
   '</section>'+
   (history.length?'<details style="margin-top:18px"><summary>Histórico de revisões ('+history.length+')</summary>'+
    '<div class="table-wrap"><table class="table"><thead><tr><th>Vigência</th><th>Revisão</th><th>Registro</th><th>Ação</th></tr></thead><tbody>'+historyRows+'</tbody></table></div></details>':'')+
   '<p id="prov132Error" role="alert" class="help hidden" style="color:#b42318;font-weight:600;margin-top:8px"></p>'+
   '<div class="form-actions"><button type="button" class="btn secondary" id="prov132Cancel">Cancelar</button>'+
   (readOnly?'':'<button type="submit" class="btn primary">Salvar provisão e configuração</button>')+
   '</div></form>';
  openModal(id?'Configurar provisão — '+h(item.code):'Cadastrar provisão',
   'Cadastre a fórmula de cálculo e a contabilização nas guias deste mesmo modal. Histórico preservado por competência.',
   modal,true);
  const form=$('#prov132Form'),query=$('#prov132Sql'),paramRoot=$('#prov132Parameters');
  const errorBox=$('#prov132Error');
  const showError=message=>{
   errorBox.textContent=message;errorBox.classList.remove('hidden');
   errorBox.scrollIntoView({block:'nearest'});
  };
  let tab='calc';
  function switchTab(next){
   tab=next;
   const accounting=next==='accounting';
   $('#prov132Calc').classList.toggle('hidden',accounting);
   $('#prov132Accounting').classList.toggle('hidden',!accounting);
   $('#prov132TabCalc').className='btn '+(accounting?'secondary':'primary');
   $('#prov132TabAccounting').className='btn '+(accounting?'primary':'secondary');
   $('#prov132TabCalc').setAttribute('aria-selected',String(!accounting));
   $('#prov132TabAccounting').setAttribute('aria-selected',String(accounting));
  }
  function params(){
   const existing=new Map([...paramRoot.querySelectorAll('[data-prov132-var]')].map(x=>[x.dataset.prov132Var,x.value]));
   const used=[...new Set([...query.value.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)]
    .map(x=>x[1].toUpperCase()).filter(v=>variables.includes(v)))];
   paramRoot.innerHTML=used.length?used.map(name=>
    field(':'+name,'<input type="number" data-prov132-var="'+h(name)+'" min="0" max="999999999.99" step="0.01" value="'+h(existing.get(name)??varsDefault[name]??3000)+'">')).join(''):
    '<p class="help">Insira variáveis como :SALARIO_CONTRATUAL na consulta.</p>';
  }
  function payload(){
   return {
    code:form.elements.code.value.trim().toUpperCase(),name:form.elements.name.value.trim(),
    active:form.elements.active.checked,effective_from:form.elements.effective_from.value,
    formula_sql:query.value,
    accounting:{nature_accrual_id:form.elements.nature_accrual_id.value,
     nature_use_id:form.elements.nature_use_id.value||null}
   };
  }
  $('#prov132TabCalc').onclick=()=>switchTab('calc');
  $('#prov132TabAccounting').onclick=()=>switchTab('accounting');
  $('#prov132Cancel').onclick=closeModal;
  $('#prov132Sample').onchange=e=>{
   if(!e.target.value||!samples[e.target.value])return;
   query.value=samples[e.target.value];params();$('#prov132SimResult').textContent='';
  };
  query.oninput=()=>{params();$('#prov132SimResult').textContent='';};
  params();
  form.elements.nature_accrual_id.onchange=()=>errorBox.classList.add('hidden');
  form.elements.nature_use_id.onchange=()=>errorBox.classList.add('hidden');
  $('#prov132Simulate').onclick=async()=>{
   try{
    const values={};
    for(const input of paramRoot.querySelectorAll('[data-prov132-var]'))
     values[input.dataset.prov132Var]=Number(input.value);
    const result=await api('/api/payroll/provision-definitions/preview',{
     method:'POST',body:{...payload(),values}
    });
    $('#prov132SimResult').textContent='Resultado: '+money(result.result.amount)+' (apenas simulação)';
    errorBox.classList.add('hidden');
   }catch(e){showError('Não foi possível simular: '+e.message);}
  };
  if(readOnly){
   [...form.querySelectorAll('input,select,textarea,button')].forEach(x=>{
    if(x.id!=='prov132Cancel')x.disabled=true;
   });
  }
  if(history.length){
   $$('[data-prov132-revision]').forEach(button=>button.onclick=()=>{
    const v=history.find(x=>x.id===button.dataset.prov132Revision);
    if(!v)return;
    const x=v.config;
    form.elements.name.value=x.name;
    form.elements.effective_from.value=x.effective_from;
    form.elements.active.checked=x.active;
    query.value=x.formula_sql;
    form.elements.nature_accrual_id.value=x.accounting?.nature_accrual_id||'';
    form.elements.nature_use_id.value=x.accounting?.nature_use_id||'';
    params();
    toast('Revisão '+v.revision+' carregada para consulta. Salvar criará outra revisão.');
   });
  }
  form.onsubmit=async ev=>{
   ev.preventDefault();
   if(readOnly)return;
   errorBox.classList.add('hidden');
   const data=payload();
   if(!/^[A-Z][A-Z0-9_]{1,29}$/.test(data.code)||data.name.length<3||
      !/^20\d{2}-(0[1-9]|1[0-2])$/.test(data.effective_from)){
    showError('Confira código, descrição e competência de vigência.');
    switchTab('calc');return;
   }
   if(!data.formula_sql.trim()){showError('Informe a fórmula SQL.');switchTab('calc');return;}
   if(!data.accounting.nature_accrual_id){
    switchTab('accounting');showError('Selecione a natureza orçamentária da constituição.');return;
   }
   const button=form.querySelector('[type=submit]');button.disabled=true;
   try{
    const saved=await api('/api/payroll/provision-definitions'+(id?'/'+encodeURIComponent(id):''),{
     method:'POST',body:data
    });
    closeModal();toast('Provisão salva (revisão '+saved.revision+').');await render();
   }catch(e){
    button.disabled=false;
    showError('Não foi possível salvar: '+e.message);
    toast(e.message,'error');
   }
  };
 }
 window.SAGAS_PROVISIONS132={render,open};
})();
