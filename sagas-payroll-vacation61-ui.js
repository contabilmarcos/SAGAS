// SAGAS v99 — fluxo em modais: revisar VACATION -> conferir MONTHLY -> gravar memoria.
function vacation99Money(n){
 return (Number(n||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}
function vacation99Issues(items){
 return (items||[]).length?'<ul class="help">'+items.map(x=>
  '<li><b>'+esc(x.code||'PENDENCIA')+'</b> — '+esc(x.message||'')+'</li>').join('')+'</ul>':
  '<p class="help">Nenhuma pendência identificada nesta conferência.</p>';
}
async function payrollVacation59Open(month,occ){
 const data=await api('/api/payroll/vacation-review?occurrence_id='+encodeURIComponent(occ.id));
 const entries=(data.lines||[]).map(x=>'<tr><td>'+esc(x.event_code)+'</td><td>'+esc(x.line_type)+
  '</td><td>'+esc(vacation99Money(x.amount_cents))+'</td></tr>').join('');
 openModal('Férias — conferência do envelope (v97)',
  esc(occ.employee_name||'Funcionário'),
  '<p class="help">Envelope do processo VACATION. A aprovação não movimenta caixa, não contabiliza e não altera a folha mensal.</p>'+
  '<p>Situação: <b>'+esc(data.status||'PENDENTE')+'</b></p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Evento</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>'+entries+'</tbody></table></div>'+
  '<p class="section-title">Conferência</p>'+vacation99Issues(data.problems)+
  '<div class="form-actions"><button id="vac99Return" type="button" class="btn secondary">Voltar</button>'+
  (can('payroll.manage')&&data.ready_for_approval?
   '<button id="vac99Approve" type="button" class="btn primary">Aprovar envelope</button>':'')+
  (data.status==='REVIEWED'?
   '<button id="vac99Bridge" type="button" class="btn primary">Conferir compensação mensal</button>':'')+
  '</div>',true);
 $('#vac99Return').onclick=()=>payrollVacation58Open(month,occ).catch(e=>toast(e.message,'error'));
 if($('#vac99Bridge'))$('#vac99Bridge').onclick=()=>payrollVacation60Open(month,occ).catch(e=>toast(e.message,'error'));
 if($('#vac99Approve'))$('#vac99Approve').onclick=()=>{
  openModal('Confirmar aprovação das férias',esc(occ.employee_name||''),
   '<p class="help">Confirme a revisão do envelope VACATION. Não haverá pagamento ou contabilização nesta ação.</p>'+
   '<form id="vac99ApproveForm"><label class="field"><span>Digite APROVAR FERIAS</span>'+
   '<input name="confirmation" autocomplete="off" required></label>'+
   '<div class="form-actions"><button class="btn secondary" type="button" id="vac99Abort">Cancelar</button>'+
   '<button class="btn primary" type="submit">Aprovar</button></div></form>',true);
  $('#vac99Abort').onclick=()=>payrollVacation59Open(month,occ).catch(e=>toast(e.message,'error'));
  $('#vac99ApproveForm').onsubmit=async ev=>{
   ev.preventDefault();const f=ev.currentTarget,b=f.querySelector('[type=submit]');b.disabled=true;
   try{
    await api('/api/payroll/vacation-review',{method:'POST',body:{
     action:'approve',occurrence_id:occ.id,expected_fingerprint:data.expected_fingerprint,
     confirmation:f.elements.confirmation.value
    }});
    toast('Envelope de férias aprovado.');await payrollVacation59Open(month,occ);
   }catch(err){toast(err.message||String(err),'error');b.disabled=false}
  };
 };
}
async function payrollVacation60Open(month,occ){
 const bridge=await api('/api/payroll/vacation-monthly-bridge?occurrence_id='+encodeURIComponent(occ.id));
 const stage=await api('/api/payroll/vacation-monthly-stage?occurrence_id='+encodeURIComponent(occ.id));
 const rows=(bridge.monthly_competences||[]).map(x=>'<tr><td>'+esc(x.competence)+'</td>'+
  '<td>'+esc(String(x.days))+'</td><td>'+esc(vacation99Money(x.vacation_cents))+'</td>'+
  '<td>'+esc(vacation99Money(x.third_cents))+'</td>'+
  '<td><b>'+esc(vacation99Money(x.gross_advance_compensation_cents))+'</b></td></tr>').join('');
 const hasProblems=(bridge.blockers||[]).length>0;
 const fields=(bridge.monthly_competences||[]).map((x,i)=>
  '<label class="field"><span>Data prevista da folha — '+esc(x.competence)+'</span>'+
  '<input type="date" name="pay'+i+'" required></label>').join('');
 openModal('Férias — compensação mensal (v98/v99)',esc(occ.employee_name||''),
  '<p class="help"><b>Somente preparação.</b> A rubrica ADIANTAMENTO_FERIAS compensará o valor bruto de gozo e terço, não o líquido já transferido ao funcionário.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Competência</th><th>Dias</th><th>Férias</th><th>1/3</th><th>Compensação</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  (stage.items?.length?'<p><b>Memória já registrada:</b> '+esc(String(stage.items.length))+' competência(s). Ainda não integrada à folha.</p>':'')+
  '<p class="section-title">Pendências</p>'+vacation99Issues(bridge.blockers)+
  (!hasProblems&&!stage.items?.length?
   '<form id="vac99BridgeForm"><div class="grid">'+fields+'</div>'+
   '<div class="form-actions"><button type="submit" class="btn primary">Simular compensação</button></div></form>':'')+
  '<div class="form-actions"><button id="vac99Back" type="button" class="btn secondary">Voltar</button>'+
  (stage.items?.length?'<button id="vac99Stage" type="button" class="btn primary">Ver memória gravada</button>':'')+
  '</div>',true);
 $('#vac99Back').onclick=()=>payrollVacation59Open(month,occ).catch(e=>toast(e.message,'error'));
 if($('#vac99Stage'))$('#vac99Stage').onclick=()=>payrollVacation61Open(month,occ).catch(e=>toast(e.message,'error'));
 const form=$('#vac99BridgeForm');
 if(form)form.onsubmit=async e=>{
  e.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  const dates=(bridge.monthly_competences||[]).map((_,i)=>form.elements['pay'+i].value);
  try{
   const simulation=await api('/api/payroll/vacation-monthly-bridge',{method:'POST',body:{
    occurrence_id:occ.id,expected_fingerprint:bridge.fingerprint,payment_dates:dates
   }});
   payrollVacation60Result(month,occ,bridge,simulation,dates);
  }catch(err){toast(err.message||String(err),'error');btn.disabled=false}
 };
}
function payrollVacation60Result(month,occ,bridge,data,dates){
 const rows=(data.months||[]).map(m=>
  '<tr><td>'+esc(m.competence)+'</td><td>'+esc(vacation99Money(m.salary_worked_cents))+'</td>'+
  '<td>'+esc(vacation99Money(m.vacation_gross_cents))+'</td>'+
  '<td>'+esc(vacation99Money(m.inss_payroll_balance_cents))+'</td>'+
  '<td>'+esc(vacation99Money(m.irrf_monthly_cents))+'</td>'+
  '<td><b>'+esc(vacation99Money(m.illustrative_net_cents))+'</b></td></tr>').join('');
 openModal('Férias — resultado da compensação',
  esc(occ.employee_name||'Funcionário'),
  '<p class="help"><b>Valores simulados.</b> Ainda não fazem parte dos envelopes MONTHLY. O registro abaixo apenas preserva a memória para a integração futura.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Competência</th><th>Saldo salarial</th><th>Férias + 1/3</th><th>INSS residual</th><th>IRRF mensal</th><th>Líquido ilustrativo</th><th>Utilização mensal</th><th>Conferência</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  vacation99Issues(data.blockers)+
  (can('payroll.manage')&&data.simulated?
   '<form id="vac99StageForm"><label class="field"><span>Confirme digitando GRAVAR MEMORIA FERIAS</span>'+
   '<input name="confirmation" autocomplete="off" required></label>'+
   '<div class="form-actions"><button type="submit" class="btn primary">Gravar memória de cálculo</button></div></form>':'')+
  '<div class="form-actions"><button id="vac99ResultBack" type="button" class="btn secondary">Voltar</button></div>',true);
 $('#vac99ResultBack').onclick=()=>payrollVacation60Open(month,occ).catch(e=>toast(e.message,'error'));
 const f=$('#vac99StageForm');
 if(f)f.onsubmit=async e=>{
  e.preventDefault();const btn=f.querySelector('[type=submit]');btn.disabled=true;
  try{
   const outcome=await api('/api/payroll/vacation-monthly-stage',{method:'POST',body:{
    action:'record',occurrence_id:occ.id,expected_fingerprint:bridge.fingerprint,
    payment_dates:dates,confirmation:f.elements.confirmation.value
   }});
   toast('Memória de férias registrada para '+outcome.count+' competência(s).');
   await payrollVacation61Open(month,occ);
  }catch(err){toast(err.message||String(err),'error');btn.disabled=false}
 };
}
async function payrollVacation61Open(month,occ){
 const data=await api('/api/payroll/vacation-monthly-stage?occurrence_id='+encodeURIComponent(occ.id));
 const rows=(data.items||[]).map(x=>'<tr><td>'+esc(x.competence)+'</td>'+
  '<td>'+esc(x.payment_date)+'</td><td>'+esc(vacation99Money(x.snapshot?.vacation_gross_cents))+'</td>'+
  '<td>'+esc(vacation99Money(x.snapshot?.illustrative_net_cents))+'</td>'+
  '<td>'+esc(x.integrated_in_monthly?(x.monthly_usage||[]).map(u=>
   'Integrado · revisão '+String(u.revision)+' ('+u.status+')').join('; '):'Aguardando cálculo mensal')+'</td>'+
  '<td>'+(x.monthly_usage?.length?
   '<button type="button" class="btn secondary vac101Check" data-run="'+esc(x.monthly_usage[0].run_id)+'">Conferir fechamento</button>':
   'Aguardando folha mensal')+'</td></tr>').join('');
 openModal('Férias — memória e integração mensal (v100)',esc(occ.employee_name||''),
  '<p class="help">Memórias de férias e vínculos com as folhas mensais. A utilização não gera pagamento bancário nem contabilização automática.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Competência</th><th>Pagamento previsto</th><th>Férias + 1/3</th><th>Líquido ilustrativo</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<div class="form-actions"><button id="vac99StageBack" class="btn secondary" type="button">Voltar</button>'+
  (can('payroll.manage')&&data.items?.length&&!data.items.some(x=>x.integrated_in_monthly)?
   '<button id="vac99StageVoid" class="btn danger" type="button">Anular memória</button>':'')+
  '</div>',true);
 $('#vac99StageBack').onclick=()=>payrollVacation60Open(month,occ).catch(e=>toast(e.message,'error'));
 document.querySelectorAll('.vac101Check').forEach(button=>{
  button.onclick=()=>payrollVacation63Open(month,occ,button.dataset.run).catch(e=>toast(e.message,'error'));
 });
 if($('#vac99StageVoid'))$('#vac99StageVoid').onclick=()=>{
  openModal('Anular memória mensal de férias',esc(occ.employee_name||''),
   '<form id="vac99StageVoidForm"><label class="field"><span>Justificativa</span>'+
   '<textarea name="notes" minlength="15" maxlength="600" required></textarea></label>'+
   '<label class="field"><span>Digite ANULAR MEMORIA FERIAS</span>'+
   '<input name="confirmation" autocomplete="off" required></label>'+
   '<div class="form-actions"><button type="submit" class="btn danger">Anular memória</button></div></form>',true);
  $('#vac99StageVoidForm').onsubmit=async e=>{
   e.preventDefault();const f=e.currentTarget,btn=f.querySelector('[type=submit]');btn.disabled=true;
   try{
    await api('/api/payroll/vacation-monthly-stage',{method:'POST',body:{
     action:'void',occurrence_id:occ.id,notes:f.elements.notes.value,
     confirmation:f.elements.confirmation.value
    }});
    toast('Memória de férias anulada; histórico preservado.');
    await payrollVacation60Open(month,occ);
   }catch(err){toast(err.message||String(err),'error');btn.disabled=false}
  };
 };
}

async function payrollVacation63Open(month,occ,runId){
 const data=await api('/api/payroll/monthly-runs/'+encodeURIComponent(runId)+'/vacation-closure-review');
 if(!data.applicable){
  openModal('Férias — conferência do fechamento (v101)',esc(occ.employee_name||''),
   '<p class="help">'+esc(data.note||'Não há férias integradas nesta folha.')+'</p>'+
   '<div class="form-actions"><button type="button" class="btn secondary" id="vac101Back">Voltar</button></div>',true);
  $('#vac101Back').onclick=()=>payrollVacation61Open(month,occ).catch(e=>toast(e.message,'error'));
  return;
 }
 const problems=(data.problems||[]).map(p=>'<li><b>'+esc(p.code)+'</b> — '+esc(p.message)+'</li>').join('');
 const items=(data.items||[]).map(item=>{
  const mappings=(item.mappings||[]).map(m=>
   '<tr><td>'+esc(m.event_code)+'</td><td>'+esc(m.nature_code||'—')+'</td>'+
   '<td>'+esc(m.cost_center_code||'—')+'</td>'+
   '<td>'+esc(vacation99Money(m.amount_cents))+'</td>'+
   '<td>'+esc((m.accounts||[]).map(a=>a.side+' '+a.account_code+' ('+a.percentage+'%)').join('; ')||'Pendente')+'</td>'+
   '<td>'+esc(m.ready?'Conferido':'Pendente')+'</td></tr>').join('');
  return '<p class="section-title">'+esc(item.employee_name||item.employee_id)+' · '+esc(item.employee_code||'')+'</p>'+
   '<p class="help">Compensação bruta: '+esc(vacation99Money(item.compensation_gross_cents))+
   ' · INSS do recibo (competência): '+esc(vacation99Money(item.receipt_inss_allocated_cents))+
   ' · INSS residual na folha: '+esc(vacation99Money(item.monthly_inss_residual_cents))+
   ' · FGTS: '+esc(vacation99Money(item.fgts_employer_cents))+'</p>'+
   '<div class="table-wrap"><table class="table"><thead><tr><th>Evento</th><th>Natureza</th>'+
   '<th>Centro de custo</th><th>Valor</th><th>Contas D/C</th><th>Conferência</th></tr></thead>'+
   '<tbody>'+mappings+'</tbody></table></div>';
 }).join('');
 const employer=data.employer?.totals;
 openModal('Férias — conferência de fechamento (v101)',
  esc(occ.employee_name||'Funcionário')+' · competência '+esc(data.run?.competence||''),
  '<p class="help"><b>Conferência sem lançamento.</b> A contabilização utiliza a natureza orçamentária configurada em cada evento e as contas vinculadas ao centro de custo.</p>'+
  '<p>Situação da folha: <b>'+esc(data.run?.status||'—')+'</b> · '+esc(data.closed?'Fechada':'Aguardando fechamento')+
  ' · '+esc(String(data.employee_count||0))+' funcionário(s) com férias integradas.</p>'+
  items+
  '<p class="section-title">Pendências</p>'+
  (problems?'<ul class="help">'+problems+'</ul>':'<p class="help">Sem divergências identificadas nesta conferência.</p>')+
  (employer?'<p class="help">Prévia patronal: INSS patronal '+esc(vacation99Money(employer.cpp_cents||0))+
   ', RAT '+esc(vacation99Money(employer.rat_cents||0))+
   ', terceiros '+esc(vacation99Money(employer.thirds_cents||0))+
   '. Valores sujeitos à conferência das configurações da empresa.</p>':
   '<p class="help">Prévia patronal será verificada após fechamento da competência.</p>')+
  '<p class="help"><b>Financeiro e contabilidade permanecem bloqueados nesta versão.</b></p>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="vac101Back">Voltar</button>'+
  '<button type="button" class="btn primary" id="vac102Preview">Prévia contábil das férias</button>'+
  '<button type="button" class="btn secondary" id="vac101Reload">Atualizar</button></div>',true);
 $('#vac101Back').onclick=()=>payrollVacation61Open(month,occ).catch(e=>toast(e.message,'error'));
 $('#vac101Reload').onclick=()=>payrollVacation63Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 if($('#vac102Preview'))$('#vac102Preview').onclick=()=>payrollVacation64Open(month,occ,runId).catch(e=>toast(e.message,'error'));
}

async function payrollVacation64Open(month,occ,runId){
 const x=await api('/api/payroll/monthly-runs/'+encodeURIComponent(runId)+'/vacation-accounting-preview');
 if(!x.applicable){
  openModal('Férias — prévia contábil (v102)',esc(occ.employee_name||''),
   '<p class="help">'+esc(x.note||'Sem férias integradas neste processamento.')+'</p>'+
   '<div class="form-actions"><button class="btn secondary" id="vac102Back" type="button">Voltar</button></div>',true);
  $('#vac102Back').onclick=()=>payrollVacation63Open(month,occ,runId).catch(e=>toast(e.message,'error'));
  return;
 }
 const rows=(x.items||[]).map(item=>{
  const reserve=(item.provisions||[]).map(comp=>{
   const p=comp.provision;
   return '<tr><td>'+esc(item.employee_name||item.employee_code||'')+'</td>'+
    '<td>'+esc(comp.description)+'</td>'+
    '<td>'+esc(vacation99Money(comp.earned_cents))+'</td>'+
    '<td>'+esc(p?vacation99Money(p.remaining_operational_cents):'Não disponível')+'</td>'+
    '<td>'+esc(p?vacation99Money(p.used_cents):'Não disponível')+'</td>'+
    '<td>'+esc(p?vacation99Money(p.unposted_use_cents):'Não disponível')+'</td></tr>';
  }).join('');
  return '<p class="section-title">'+esc(item.employee_name||item.employee_code||'Funcionário')+'</p>'+
   '<p class="help">Líquido do recibo externo: '+esc(vacation99Money(item.advance.receipt_net_cents))+
   ' · Pagamento informado: '+esc(item.advance.paid_at_declared||'Sem data')+
   ' · Referência: '+esc(item.advance.document_ref||'Não informada')+
   '. A declaração não é comprovação bancária.</p>'+
   '<p class="help">Nesta competência: férias '+esc(vacation99Money(item.current_competence.vacation_cents))+
   ', terço '+esc(vacation99Money(item.current_competence.third_cents))+
   ', adiantamento bruto compensado '+esc(vacation99Money(item.current_competence.gross_compensation_cents))+
   ', INSS residual '+esc(vacation99Money(item.current_competence.inss_monthly_residual_cents))+
   ', líquido da folha '+esc(vacation99Money(item.current_competence.net_monthly_cents))+'.</p>'+
   '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Componente</th>'+
   '<th>Verba do mês</th><th>Saldo operacional</th><th>Baixas registradas</th>'+
   '<th>Baixas não contabilizadas</th></tr></thead><tbody>'+reserve+'</tbody></table></div>';
 }).join('');
 const issues=(x.problems||[]).map(p=>'<li><b>'+esc(p.code)+'</b> — '+esc(p.message)+'</li>').join('');
 const warnings=(x.warnings||[]).map(m=>'<li>'+esc(m)+'</li>').join('');
 openModal('Férias — prévia contábil (v102)',
  esc(occ.employee_name||'Funcionário')+' · '+esc(x.run?.competence||''),
  '<p class="help"><b>Somente conferência.</b> Nenhum lançamento, pagamento, guia ou baixa de provisão será criado.</p>'+
  rows+
  '<p class="section-title">Pendências</p>'+
  (issues?'<ul class="help">'+issues+'</ul>':'<p class="help">Nenhuma pendência detectada nos controles consultados.</p>')+
  '<p class="section-title">Cuidados de contabilização</p><ul class="help">'+warnings+'</ul>'+
  '<div class="form-actions"><button class="btn secondary" id="vac102Back" type="button">Voltar</button>'+
  '<button class="btn secondary" id="vac102Reload" type="button">Atualizar prévia</button></div>',true);
 $('#vac102Back').onclick=()=>payrollVacation63Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 $('#vac102Reload').onclick=()=>payrollVacation64Open(month,occ,runId).catch(e=>toast(e.message,'error'));
}
