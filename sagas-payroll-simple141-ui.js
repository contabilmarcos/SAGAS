// SAGAS Folha Simplificada v141 — três telas, sem lançamentos variáveis.
(()=>{
 const pages=new Set(['payroll-simple-calculate','payroll-simple-report','payroll-simple-accounting']);
 const state={competence:'',cost_center_id:'all',payment_date:'',setup:null,company:''};
 const e=s=>esc(String(s??''));
 const cur=v=>money(Number(v||0)/100);
 const api141=(action,body=null)=>{
  const qs=body===null?'?competence='+encodeURIComponent(state.competence)+
   '&cost_center_id='+encodeURIComponent(state.cost_center_id):'';
  return api('/api/payroll/simple141/'+action+qs,body===null?{}:{method:'POST',body});
 };
 const option=(id,label,selected)=>'<option value="'+e(id)+'" '+(id===selected?'selected':'')+'>'+e(label)+'</option>';
 const options=items=>items.map(x=>option(x.id,x.code+' · '+x.name,state.cost_center_id)).join('');
 const fields=(accounting=false)=>{
  const months=state.setup.months||[];
  if(!state.competence||!months.find(x=>x.competence===state.competence))
   state.competence=months[0]?.competence||'';
  if(accounting&&state.cost_center_id==='all')state.cost_center_id=state.setup.centers[0]?.id||'all';
  const monthOptions=months.map(x=>option(x.competence,x.competence.slice(5,7)+'/'+x.competence.slice(0,4),state.competence)).join('');
  const centers=[...(accounting?[]:[{id:'all',code:'Todos',name:'os centros de custo'}]),...state.setup.centers];
  return '<div class="toolbar" style="justify-content:flex-start;align-items:flex-end;flex-wrap:wrap">'+
   '<label class="field"><span>Competência</span><select id="s141month">'+monthOptions+'</select></label>'+
   '<label class="field"><span>Centro de custo</span><select id="s141cc">'+options(centers)+'</select></label>'+
   (!accounting&&S.page==='payroll-simple-calculate'?'<label class="field"><span>Data de pagamento</span>'+
    '<input type="date" id="s141payment" value="'+e(state.payment_date)+'"></label>':'')+
   '</div>';
 };
 const bindFilters=()=>{
  const month=document.getElementById('s141month'),cc=document.getElementById('s141cc'),pay=document.getElementById('s141payment');
  if(month)month.onchange=()=>{state.competence=month.value; if(!state.payment_date)state.payment_date=state.competence+'-01';render(S.page);};
  if(cc)cc.onchange=()=>{state.cost_center_id=cc.value;render(S.page)};
  if(pay)pay.onchange=()=>state.payment_date=pay.value;
 };
 const shortName=x=>state.setup.centers.find(v=>v.id===x)?.code||x;
 const title=(name,help)=>'<div style="padding:12px 0 18px"><h3 style="font-size:17px;margin:0 0 7px">'+e(name)+'</h3>'+
  '<p class="muted" style="margin:0">'+e(help)+'</p></div>';
 const sumTable=totals=>{
  const defs=state.setup.events||[];
  return '<div class="table-wrap"><table class="table"><thead><tr><th>Evento / totalizador</th><th>Valor</th></tr></thead>'+
   '<tbody>'+defs.filter(x=>Number(totals[x.code]||0)>0).map(x=>
   '<tr><td>'+e(x.name)+'</td><td><b>'+cur(totals[x.code])+'</b></td></tr>').join('')+
   '</tbody></table></div>';
 };
 const indivTable=employees=>{
  const defs=state.setup.events||[];
  return '<div class="table-wrap"><table class="table"><thead><tr><th>ID</th><th>Funcionário</th>'+
   '<th>CC</th><th>Salário-base</th><th>INSS</th><th>IRRF</th><th>Líquido</th><th>FGTS</th><th>Encargos patronais</th><th>Provisões estimadas</th></tr></thead>'+
   '<tbody>'+employees.map(x=>{
    const charge=['CPP_PATRONAL','RAT_PATRONAL','TERCEIROS_PATRONAL','PIS_FOLHA'].reduce((v,k)=>v+Number(x.events[k]||0),0);
    const prov=defs.filter(v=>v.category==='PROVISAO').reduce((v,k)=>v+Number(x.events[k.code]||0),0);
    return '<tr><td>'+e(x.employee_code||'')+'</td><td>'+e(x.name)+'</td>'+
     '<td>'+e(shortName(x.cost_center_id))+'</td><td>'+cur(x.events.SALARIO_BASE)+'</td>'+
     '<td>'+cur(x.events.INSS_EMP)+'</td><td>'+cur(x.events.IRRF_EMP)+'</td>'+
     '<td><b>'+cur(x.events.SALARIO_LIQUIDO)+'</b></td><td>'+cur(x.events.FGTS_PATRONAL)+'</td>'+
     '<td>'+cur(charge)+'</td><td>'+cur(prov)+'</td></tr>';
   }).join('')+'</tbody></table></div>';
 };
 async function render(page){
  if(!pages.has(page))return;
  if(state.company!==S.companyId){state.company=S.companyId;state.competence='';state.cost_center_id='all';state.setup=null;}
  state.setup=await api('/api/payroll/simple141/setup');
  if(!state.setup.months.length){document.getElementById('content').innerHTML=
   '<div class="empty"><b>Abra uma competência</b>Vá em Folha → Competências e abra o mês para calcular.</div>';return;}
  if(!state.payment_date||!state.payment_date.startsWith(state.competence))
   state.payment_date=state.competence+'-'+new Date(Date.UTC(Number(state.competence.slice(0,4)),Number(state.competence.slice(5,7)),0)).getUTCDate();
  if(page==='payroll-simple-calculate'){
   document.getElementById('content').innerHTML=title('Calcular folha','Somente salário-base e descontos legais, por centro de custo ou todos. Histórico de frequência não é obrigatório.')+
   fields()+'<div style="padding-bottom:18px"><button class="btn primary" id="s141calc">Calcular folha</button> '+
   '<button class="btn secondary" id="s141goReport">Relatório da folha</button></div>'+
   '<p class="muted">A folha considera apenas funcionários ativos cadastrados, salário e admissão. As alíquotas patronais devem estar configuradas na empresa. Provisões são estimativas mensais.</p>'+
   '<div id="s141result"></div>';
   bindFilters();
   document.getElementById('s141goReport').onclick=()=>nav('payroll-simple-report');
   document.getElementById('s141calc').onclick=async()=>{
    const btn=document.getElementById('s141calc');btn.disabled=true;
    const el=document.getElementById('s141result');
    try{
     const res=await api141('calculate',{competence:state.competence,cost_center_id:state.cost_center_id,
      payment_date:state.payment_date});
     el.innerHTML='<p class="badge green">Folha calculada e gravada</p>'+
      '<p>'+e(res.report.employee_count)+' funcionário(s), '+e(res.results.length)+' centro(s) de custo.</p>'+
      sumTable(res.report.totals)+
      '<div style="margin-top:12px"><button class="btn primary" id="s141SeeReport">Abrir relatório completo</button></div>';
     document.getElementById('s141SeeReport').onclick=()=>nav('payroll-simple-report');
    }catch(err){el.innerHTML='<p class="badge red">'+e(err.message)+'</p>';toast(err.message,'error')}
    finally{btn.disabled=false}
   };
   return;
  }
  if(page==='payroll-simple-report'){
   document.getElementById('content').innerHTML=title('Relatório da folha','Resumo dos eventos e relação individual dos funcionários, na mesma consulta.')+
    fields()+'<div style="padding-bottom:14px"><button class="btn primary" id="s141query">Consultar relatório</button> '+
    '<button class="btn secondary" id="s141print">Imprimir</button></div><div id="s141result"></div>';
   bindFilters();
   document.getElementById('s141print').onclick=()=>window.print();
   document.getElementById('s141query').onclick=async()=>{
    const el=document.getElementById('s141result');
    try{
     const r=await api141('report');
     if(!r.employee_count){el.innerHTML='<p class="muted">Nenhuma folha calculada para o filtro selecionado.</p>';return;}
     el.innerHTML='<p><b>'+e(r.employee_count)+' funcionário(s)</b> · '+e(r.run_count)+' centro(s) de custo</p>'+
      '<div class="section-title">Resumo geral de eventos</div>'+sumTable(r.totals)+
      '<div class="section-title">Detalhamento individual</div>'+indivTable(r.employees)+
      '<p class="muted">Provisões são estimativas mensais; conferir regras de férias e 13º antes de utilizar contabilmente.</p>';
    }catch(err){el.textContent=err.message;toast(err.message,'error')}
   };
   document.getElementById('s141query').click();return;
  }
  if(page==='payroll-simple-accounting'){
   document.getElementById('content').innerHTML=title('Contabilização da folha','Após calcular, informe débito e/ou crédito de cada evento. O sistema cria um lote novo automaticamente, sem selecionar lote.')+
    fields(true)+'<div style="padding-bottom:14px"><button class="btn primary" id="s141query">Consultar eventos</button></div>'+
    '<div id="s141result"></div>';
   bindFilters();
   document.getElementById('s141query').onclick=loadAccounting;
   document.getElementById('s141query').click();
  }
 }
 async function loadAccounting(){
  const target=document.getElementById('s141result');
  try{
   const r=await api141('accounting');
   if(r.posted){target.innerHTML='<p class="badge green">Contabilizado</p>'+
      '<p>Lote: '+e(r.posted.batch_id)+' · Lançamento: '+e(r.posted.entry_id)+'</p>';return;}
   const rows=r.events.filter(x=>x.amount_cents>0).map(x=>{
    const dr=state.setup.accounts.find(a=>a.id===x.debit_account_id);
    const cr=state.setup.accounts.find(a=>a.id===x.credit_account_id);
    return '<tr><td>'+e(x.code)+'</td><td>'+e(x.name)+'</td><td>'+cur(x.amount_cents)+'</td>'+
     '<td>'+e(dr?dr.code+' - '+dr.name:'—')+'</td><td>'+e(cr?cr.code+' - '+cr.name:'—')+'</td>'+
     '<td><button class="btn secondary sm" data-s141map="'+e(x.code)+'">Configurar D/C</button></td></tr>';
   }).join('');
   const issue=r.plan.missing.length?'<p class="muted">Eventos sem contas: '+e(r.plan.missing.join(', '))+'</p>':'';
   target.innerHTML='<p>Centro de custo '+e(shortName(state.cost_center_id))+' · Revisão '+e(r.revision)+'</p>'+
    '<div class="table-wrap"><table class="table"><thead><tr><th>Evento</th><th>Descrição</th><th>Total</th>'+
    '<th>Conta débito</th><th>Conta crédito</th><th>Ação</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="totals"><span>Débitos: <b>'+cur(r.plan.debit_cents)+'</b></span><span>Créditos: <b>'+cur(r.plan.credit_cents)+
    '</b></span></div>'+issue+'<div style="padding:12px 0"><button class="btn primary" id="s141post" '+(r.plan.balanced?'':'disabled')+
    '>Criar lote e contabilizar</button></div>'+
    '<p class="muted">O lote é criado somente ao confirmar a contabilização. Cada evento pode ter apenas um débito, apenas um crédito ou ambos.</p>';
   target.querySelectorAll('[data-s141map]').forEach(btn=>btn.onclick=()=>openMapping(r.events.find(x=>x.code===btn.dataset.s141map)));
   const button=document.getElementById('s141post');
   button.onclick=async()=>{
    if(!confirm('Criar um NOVO lote e contabilizar a folha deste centro de custo?'))return;
    button.disabled=true;
    try{
     const p=await api141('post',{competence:state.competence,cost_center_id:state.cost_center_id});
     toast('Lote '+p.batch_code+' criado e contabilizado.');
     await loadAccounting();
    }catch(err){button.disabled=false;toast(err.message,'error')}
   };
  }catch(err){target.innerHTML='<p class="badge red">'+e(err.message)+'</p>'}
 }
 function openMapping(row){
  const accounts=state.setup.accounts||[];
  const select=(current,name)=>'<select name="'+name+'"><option value="">Sem lançamento neste lado</option>'+
   accounts.map(a=>option(a.id,a.code+' · '+a.name,current)).join('')+'</select>';
  openModal('Contabilização — '+e(row.name),'Selecione débito, crédito ou ambos para este evento.',
   '<form id="s141mapForm" class="stack">'+
   '<p>Valor do evento: <b>'+cur(row.amount_cents)+'</b></p>'+
   '<label class="field"><span>Conta a débito (opcional)</span>'+select(row.debit_account_id,'debit_account_id')+'</label>'+
   '<label class="field"><span>Conta a crédito (opcional)</span>'+select(row.credit_account_id,'credit_account_id')+'</label>'+
   '<div class="form-actions"><button class="btn secondary" type="button" id="s141cancel">Cancelar</button>'+
   '<button class="btn primary" type="submit">Salvar contabilização</button></div></form>');
  document.getElementById('s141cancel').onclick=closeModal;
  document.getElementById('s141mapForm').onsubmit=async ev=>{
   ev.preventDefault();
   const fd=new FormData(ev.currentTarget);
   try{
    await api141('mapping',{competence:state.competence,cost_center_id:state.cost_center_id,
     event_code:row.code,debit_account_id:fd.get('debit_account_id')||null,
     credit_account_id:fd.get('credit_account_id')||null});
    closeModal();await loadAccounting();
   }catch(err){toast(err.message,'error')}
  };
 }
 window.SAGAS_SIMPLE141={render};
})();