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
  if(month)month.onchange=()=>{state.competence=month.value;state.payment_date='';render(S.page);};
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
    const details='<details><summary>Ver todos os eventos</summary><table style="width:100%;margin-top:8px">'+
      defs.filter(v=>Number(x.events[v.code]||0)>0).map(v=>
       '<tr><td>'+e(v.name)+'</td><td style="text-align:right">'+cur(x.events[v.code])+'</td></tr>').join('')+
      '</table></details>';
    return '<tr><td>'+e(x.employee_code||'')+'</td><td>'+e(x.name)+'</td>'+
     '<td>'+e(shortName(x.cost_center_id))+'</td><td>'+cur(x.events.SALARIO_BASE)+'</td>'+
     '<td>'+cur(x.events.INSS_EMP)+'</td><td>'+cur(x.events.IRRF_EMP)+'</td>'+
     '<td><b>'+cur(x.events.SALARIO_LIQUIDO)+'</b></td><td>'+cur(x.events.FGTS_PATRONAL)+'</td>'+
     '<td>'+cur(charge)+'</td><td>'+cur(prov)+'</td></tr>'+
     '<tr><td colspan="10" style="padding:4px 14px 12px;background:#fafbfc">'+details+'</td></tr>';
   }).join('')+'</tbody></table></div>';
 };
 async function render(page){
  if(!pages.has(page))return;
  if(state.company!==S.companyId){state.company=S.companyId;state.competence='';state.cost_center_id='all';state.setup=null;}
  state.setup=await api('/api/payroll/simple141/setup');
  if(!state.competence||!state.setup.months.some(x=>x.competence===state.competence))
    state.competence=state.setup.months[0]?.competence||'';
  if(!state.setup.months.length){document.getElementById('content').innerHTML=
   '<div class="empty"><b>Abra uma competência</b>Vá em Folha → Competências e abra o mês para calcular.</div>';return;}
  if(!state.payment_date||!state.payment_date.startsWith(state.competence)){
   const year=Number(state.competence.slice(0,4)),month=Number(state.competence.slice(5,7));
   state.payment_date=state.competence+'-'+String(new Date(Date.UTC(year,month,0)).getUTCDate()).padStart(2,'0');
  }
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
     if(!r.employee_count){el.innerHTML='<p class="muted">Nenhuma folha ativa para o filtro selecionado. Se desfez a contabilização, recalcule a folha.</p>';return;}
     const provRows=(r.provision_history||[]).map(h=>{
      const f=Number(h.totals.PROV_FERIAS||0)+Number(h.totals.PROV_TERCO||0);
      const special=Number(h.accrued_cents||0)-Number(h.totals.PROV_13||0)-f;
      return '<tr><td>'+e(h.competence.slice(5,7)+'/'+h.competence.slice(0,4))+'</td>'+
       '<td>'+cur(h.totals.PROV_13)+'</td><td>'+cur(f)+'</td>'+
       '<td>'+cur(special)+'</td><td>'+cur(h.accrued_cents)+'</td>'+
       '<td>'+cur(h.cumulative_estimate_cents)+'</td></tr>';
     }).join('');
     const provTable='<div class="table-wrap"><table class="table"><thead><tr>'+
      '<th>Competência</th><th>13º</th><th>Férias + terço</th><th>Encargos estimados</th>'+
      '<th>Total do mês</th><th>Acumulado sem baixas</th></tr></thead><tbody>'+
      provRows+'</tbody></table></div>';
     el.innerHTML='<p><b>'+e(r.employee_count)+' funcionário(s)</b> · '+e(r.run_count)+' centro(s) de custo</p>'+
      '<div class="section-title">Resumo geral de eventos</div>'+sumTable(r.totals)+
      '<div class="section-title">Detalhamento individual</div>'+indivTable(r.employees)+
      '<div class="section-title">Controle de provisões mensais</div>'+provTable+
      '<div class="section-title">Livro de provisões — principal constituído e baixado</div>'+
      '<div class="table-wrap"><table class="table"><thead><tr><th>Componente</th><th>Constituições e abertura</th><th>Baixas</th><th>Saldo</th></tr></thead><tbody>'+
      (r.provision_balances||[]).map(b=>'<tr><td>'+e({FERIAS:'Férias',TERCO_FERIAS:'Terço de férias',DECIMO_TERCEIRO:'13º salário'}[b.component]||b.component)+'</td><td>'+cur(b.constituted_cents)+'</td><td>'+cur(b.used_cents)+'</td><td>'+cur(b.balance_cents)+'</td></tr>').join('')+'</tbody></table></div>'+
      '<p class="muted">'+e(r.provision_notice)+'</p>';
    }catch(err){el.textContent=err.message;toast(err.message,'error')}
   };
   document.getElementById('s141query').click();return;
  }
  if(page==='payroll-simple-accounting'){
   document.getElementById('content').innerHTML=title('Contabilização da folha','Após calcular, selecione a natureza de cada componente. Os defaults definem as partidas por centro de custo. O sistema cria um lote novo.')+
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
      '<p>Lote: '+e(r.posted.batch_code||r.posted.batch_id)+' — '+e(r.posted.batch_description||'')+' · Lançamento: '+e(r.posted.entry_id)+'</p>'+
      '<p class="muted">Títulos de salário líquido usam o Financeiro existente. Provisões de férias, terço e 13º usam o livro de provisões e suas baixas. Encargos provisionados permanecem estimativas contábeis; não geram guias.</p>'+
      ['finance','provisions'].map(kind=>'<button class="btn secondary" data-s141integrate="'+kind+'" '+
       (r.integrations.some(x=>x.kind===kind)?'disabled':'')+'>'+
       (kind==='finance'?'Gerar títulos de salário líquido':'Constituir férias, terço e 13º')+
       (r.integrations.some(x=>x.kind===kind)?' — concluído':'')+'</button> ').join('')+
      '<div style="margin-top:16px"><button class="btn secondary" id="s141undo">Desfazer contabilização e liberar recálculo</button></div>';
     document.getElementById('s141undo').onclick=openUndo;
     target.querySelectorAll('[data-s141integrate]').forEach(btn=>btn.onclick=async()=>{
      btn.disabled=true;
      try{await api141(btn.dataset.s141integrate,{competence:state.competence,cost_center_id:state.cost_center_id});
       toast('Integração concluída.');await loadAccounting();
      }catch(err){btn.disabled=false;toast(err.message,'error')}
     });return;}
   if(r.reversal){
    target.innerHTML='<p class="badge yellow">Contabilização desfeita — recálculo necessário</p>'+
     '<p>O lote anterior e o lançamento anulado foram preservados no histórico.</p>'+
     '<p>Motivo: '+e(r.reversal.reason)+'</p>'+
     '<button class="btn primary" id="s141recalculate">Ir para calcular folha</button>';
    document.getElementById('s141recalculate').onclick=()=>nav('payroll-simple-calculate');return;
   }
   const rows=r.events.filter(x=>x.amount_cents>0).map(x=>{
    const nature=state.setup.natures.find(a=>a.id===x.nature_id);
    return '<tr><td>'+e(x.code)+'</td><td>'+e(x.name)+'</td><td>'+cur(x.amount_cents)+'</td>'+
     '<td>'+e(nature?nature.code+' - '+nature.description:'—')+'</td>'+
     '<td><button class="btn secondary sm" data-s141map="'+e(x.code)+'">Configurar natureza</button></td></tr>';
   }).join('');
   const issues=[...r.plan.missing.map(x=>'Sem natureza: '+x),...r.plan.problems];
   const issue=issues.length?'<p class="muted">'+e(issues.join(' · '))+'</p>':'';
   target.innerHTML='<p>Centro de custo '+e(shortName(state.cost_center_id))+' · Revisão '+e(r.revision)+'</p>'+
    '<div style="padding-bottom:14px"><button class="btn secondary" id="s141copyPrevious">Usar parâmetros da competência anterior</button>'+
    '<p class="muted">Preenche as naturezas ainda não configuradas para o mesmo centro de custo. Mantém os ajustes deste mês e aplica os defaults atuais das naturezas.</p></div>'+
    '<div class="table-wrap"><table class="table"><thead><tr><th>Evento</th><th>Descrição</th><th>Total</th>'+
    '<th>Natureza orçamentária</th><th>Ação</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="totals"><span>Débitos: <b>'+cur(r.plan.debit_cents)+'</b></span><span>Créditos: <b>'+cur(r.plan.credit_cents)+
    '</b></span></div>'+issue+'<div style="padding:12px 0"><button class="btn primary" id="s141post" '+(r.plan.balanced?'':'disabled')+
    '>Criar lote e contabilizar</button></div>'+
    '<p class="muted">O lote é criado somente ao confirmar a contabilização. A natureza pode definir débito, crédito ou ambos. O líquido exige somente crédito. Defaults específicos do centro prevalecem sobre os gerais por lado.</p>';
   target.querySelectorAll('[data-s141map]').forEach(btn=>btn.onclick=()=>openMapping(r.events.find(x=>x.code===btn.dataset.s141map)));
   const copyButton=document.getElementById('s141copyPrevious');
   copyButton.onclick=async()=>{
    copyButton.disabled=true;
    try{
     const copied=await api141('copy-previous',{competence:state.competence,cost_center_id:state.cost_center_id});
     const source=copied.source_competence.slice(5,7)+'/'+copied.source_competence.slice(0,4);
     const notice=copied.copied+' parâmetro(s) preenchido(s) de '+source+'. Ajustes existentes foram mantidos.'+
      (copied.skipped.length?' Naturezas indisponíveis, não copiadas: '+copied.skipped.join(', ')+'.':'');
     await loadAccounting();
     toast(notice,copied.skipped.length?'error':undefined);
    }catch(err){copyButton.disabled=false;toast(err.message,'error')}
   };
   const button=document.getElementById('s141post');
   button.onclick=openPosting;
  }catch(err){target.innerHTML='<p class="badge red">'+e(err.message)+'</p>'}
 }
 async function openUndo(){
  const competence=state.competence,cost_center_id=state.cost_center_id;
  try{
   const preview=await api141('undo-preview');
   openModal('Desfazer contabilização da folha','Confira os documentos vinculados antes de confirmar.',
    '<form id="s141undoForm" class="stack">'+
    '<p>Lote '+e(preview.batch_code||preview.batch_id)+'. Títulos em aberto a cancelar: <b>'+e(preview.payable_count)+
    '</b>. Constituições de provisões a retirar: <b>'+e(preview.provision_count)+'</b>.</p>'+
    '<p>O lançamento será anulado e o histórico preservado. Depois, recalcule a folha e use outro número de lote para contabilizar a nova revisão.</p>'+
    (preview.problems.length?'<p class="badge red">'+preview.problems.map(x=>e(x.message)).join('<br>')+'</p>':'')+
    (preview.can_undo?'<label class="field"><span>Motivo do desfazimento</span><textarea name="reason" required maxlength="1000"></textarea></label>'+
    '<label class="field"><span>Digite DESFAZER para confirmar</span><input name="confirmation" required pattern="DESFAZER" autocomplete="off"></label>':'')+
    '<div class="form-actions"><button class="btn secondary" type="button" id="s141undoCancel">Cancelar</button>'+
    (preview.can_undo?'<button class="btn primary" id="s141undoConfirm" type="submit">Confirmar desfazimento</button>':'')+'</div></form>');
   document.getElementById('s141undoCancel').onclick=closeModal;
   document.getElementById('s141undoForm').onsubmit=async ev=>{
    ev.preventDefault();if(!preview.can_undo)return;
    const button=document.getElementById('s141undoConfirm');if(button.disabled)return;
    const fd=new FormData(ev.currentTarget);button.disabled=true;
    try{
     await api141('undo',{competence,cost_center_id,run_id:preview.run_id,entry_id:preview.entry_id,
      reason:String(fd.get('reason')||'').trim(),confirmation:String(fd.get('confirmation')||'').trim()});
     closeModal();toast('Contabilização desfeita. Recalcule a folha antes de contabilizar novamente.');await loadAccounting();
    }catch(err){button.disabled=false;toast(err.message,'error')}
   };
  }catch(err){toast(err.message,'error')}
 }
 function openPosting(){
  const competence=state.competence,cost_center_id=state.cost_center_id;
  const description='Folha simplificada '+competence+' — centro de custo '+shortName(cost_center_id);
  openModal('Criar lote e contabilizar','Informe os dados do novo lote para esta folha.',
   '<form id="s141postForm" class="stack">'+
   '<label class="field"><span>Número do lote</span><input name="batch_code" inputmode="numeric" pattern="[0-9]+" maxlength="15" required autocomplete="off"></label>'+
   '<p class="muted">Use um número positivo ainda não cadastrado na empresa. O lote 0 é reservado.</p>'+
   '<label class="field"><span>Descrição do lote</span><input name="batch_description" maxlength="500" required value="'+e(description)+'"></label>'+
   '<div class="form-actions"><button class="btn secondary" type="button" id="s141postCancel">Cancelar</button>'+
   '<button class="btn primary" type="submit" id="s141postConfirm">Criar lote e contabilizar</button></div></form>');
  document.getElementById('s141postCancel').onclick=closeModal;
  document.getElementById('s141postForm').onsubmit=async ev=>{
   ev.preventDefault();
   const submit=document.getElementById('s141postConfirm');
   if(submit.disabled)return;
   const fd=new FormData(ev.currentTarget);
   submit.disabled=true;
   try{
    const p=await api141('post',{competence,cost_center_id,
     batch_code:String(fd.get('batch_code')||'').trim(),batch_description:String(fd.get('batch_description')||'').trim()});
    closeModal();toast('Lote '+p.batch_code+' criado e contabilizado.');await loadAccounting();
   }catch(err){submit.disabled=false;toast(err.message,'error')}
  };
 }
 function openMapping(row){
  const natures=state.setup.natures||[];
  const select='<select name="nature_id" required><option value="">Selecione</option>'+
   natures.map(n=>option(n.id,n.code+' · '+n.description,row.nature_id)).join('')+'</select>';
  openModal('Contabilização — '+e(row.name),'Use os defaults do cadastro de naturezas do SAGAS.',
   '<form id="s141mapForm" class="stack">'+
   '<p>Valor do componente: <b>'+cur(row.amount_cents)+'</b></p>'+
   '<label class="field"><span>Natureza orçamentária</span>'+select+'</label>'+
   '<div class="form-actions"><button class="btn secondary" type="button" id="s141cancel">Cancelar</button>'+
   '<button class="btn primary" type="submit">Salvar contabilização</button></div></form>');
  document.getElementById('s141cancel').onclick=closeModal;
  document.getElementById('s141mapForm').onsubmit=async ev=>{
   ev.preventDefault();
   const fd=new FormData(ev.currentTarget);
   try{
    await api141('mapping',{competence:state.competence,cost_center_id:state.cost_center_id,
     event_code:row.code,nature_id:fd.get('nature_id')});
    closeModal();await loadAccounting();
   }catch(err){toast(err.message,'error')}
  };
 }
 window.SAGAS_SIMPLE141={render};
})();
