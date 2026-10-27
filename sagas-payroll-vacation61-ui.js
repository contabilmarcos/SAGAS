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
  '<button class="btn primary" id="vac103Open" type="button">Conferir partidas (v103)</button>'+
  '<button class="btn secondary" id="vac102Reload" type="button">Atualizar prévia</button></div>',true);
 $('#vac102Back').onclick=()=>payrollVacation63Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 $('#vac102Reload').onclick=()=>payrollVacation64Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 if($('#vac103Open'))$('#vac103Open').onclick=()=>payrollVacation65Open(month,occ,runId).catch(e=>toast(e.message,'error'));
}

async function payrollVacation65Open(month,occ,runId){
 const url='/api/payroll/monthly-runs/'+encodeURIComponent(runId)+'/vacation-accounting-package';
 const data=await api(url);
 if(!data.applicable){
  openModal('Férias — memória contábil (v103)',esc(occ.employee_name||''),
   '<p class="help">'+esc(data.note||'Sem férias integradas no cálculo mensal.')+'</p>'+
   '<div class="form-actions"><button type="button" id="vac103Back" class="btn secondary">Voltar</button></div>',true);
  $('#vac103Back').onclick=()=>payrollVacation64Open(month,occ,runId).catch(e=>toast(e.message,'error'));
  return;
 }
 const issues=(data.problems||[]).map(p=>'<li><b>'+esc(p.code)+'</b> — '+esc(p.message)+'</li>').join('');
 const warnings=(data.warnings||[]).map(w=>'<li>'+esc(w)+'</li>').join('');
 const rows=(data.lines||[]).map(l=>'<tr>'+
  '<td>'+esc(l.employee_code||'—')+'</td><td>'+esc(l.event_code||'')+'</td>'+
  '<td>'+esc(l.nature_code||'')+'</td><td>'+esc(l.cost_center_code||'')+'</td>'+
  '<td>'+esc(l.side)+'</td><td>'+esc(l.account_code||'')+'</td>'+
  '<td>'+esc(vacation99Money(l.amount_cents))+'</td></tr>').join('');
 const documented=data.recorded;
 const current=data.recorded_current;
 openModal('Férias — memória das partidas (v103)',esc(occ.employee_name||'')+
  ' · competência '+esc(data.run?.competence||''),
  '<p class="help"><b>Preparação, não contabilização.</b> As partidas abaixo são propostas com base na natureza orçamentária de cada evento e no centro de custo. Nenhum lançamento, baixa, título financeiro ou pagamento será criado.</p>'+
  '<p>Conferência: <b>'+esc(!documented?'Não registrada':current?'Registrada':'Registrada com fonte alterada')+'</b></p>'+
  '<p>Débitos <b>'+esc(vacation99Money(data.sums?.debit_cents))+'</b> · Créditos <b>'+
  esc(vacation99Money(data.sums?.credit_cents))+'</b> · Líquido da folha <b>'+
  esc(vacation99Money(data.sums?.monthly_net_cents))+'</b>.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Evento</th>'+
  '<th>Natureza</th><th>Centro de custo</th><th>D/C</th><th>Conta</th><th>Valor</th></tr></thead>'+
  '<tbody>'+rows+'</tbody></table></div>'+
  '<p class="section-title">Pendências</p>'+
  (issues?'<ul class="help">'+issues+'</ul>':'<p class="help">Sem pendências nos controles consultados.</p>')+
  '<p class="section-title">Observações</p><ul class="help">'+warnings+'</ul>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="vac103Back">Voltar</button>'+
  '<button type="button" class="btn secondary" id="vac104Link">Vincular pagamento antecipado</button>'+
  '<button type="button" class="btn secondary" id="vac105Preview">Conferir provisões (v105)</button>'+
  (!documented&&can('payroll.manage')?
   '<button type="button" class="btn primary" id="vac103Record">Registrar conferência</button>':'')+
  (documented&&can('payroll.manage')?
   '<button type="button" class="btn danger" id="vac103Void">Anular conferência</button>':'')+
  '<button type="button" class="btn secondary" id="vac103Reload">Atualizar</button></div>',true);
 $('#vac103Back').onclick=()=>payrollVacation64Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 $('#vac103Reload').onclick=()=>payrollVacation65Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 if($('#vac104Link'))$('#vac104Link').onclick=()=>payrollVacation66Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 if($('#vac105Preview'))$('#vac105Preview').onclick=()=>payrollVacation67Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 if($('#vac103Record'))$('#vac103Record').onclick=()=>{
  openModal('Registrar memória contábil',esc(occ.employee_name||''),
   '<p class="help">Será salvo apenas o histórico de conferência. Esta ação não cria lançamento contábil nem pagamento.</p>'+
   '<form id="vac103RecordForm"><label class="field"><span>Digite REGISTRAR CONFERENCIA FERIAS</span>'+
   '<input name="confirmation" autocomplete="off" required></label>'+
   '<div class="form-actions"><button type="button" class="btn secondary" id="vac103Cancel">Cancelar</button>'+
   '<button type="submit" class="btn primary">Registrar memória</button></div></form>',true);
  $('#vac103Cancel').onclick=()=>payrollVacation65Open(month,occ,runId).catch(e=>toast(e.message,'error'));
  $('#vac103RecordForm').onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;
   try{
    await api(url,{method:'POST',body:{action:'record',run_id:runId,
     expected_fingerprint:data.fingerprint,confirmation:form.elements.confirmation.value}});
    toast('Memória de conferência contábil registrada. Sem lançamento ou pagamento.');
    await payrollVacation65Open(month,occ,runId);
   }catch(err){toast(err.message||String(err),'error');button.disabled=false}
  };
 };
 if($('#vac103Void'))$('#vac103Void').onclick=()=>{
  openModal('Anular memória de conferência',esc(occ.employee_name||''),
   '<form id="vac103VoidForm"><label class="field"><span>Justificativa</span>'+
   '<textarea name="notes" minlength="15" maxlength="600" required></textarea></label>'+
   '<label class="field"><span>Digite ANULAR CONFERENCIA FERIAS</span>'+
   '<input name="confirmation" autocomplete="off" required></label>'+
   '<div class="form-actions"><button type="submit" class="btn danger">Anular memória</button></div></form>',true);
  $('#vac103VoidForm').onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;
   try{
    await api(url,{method:'POST',body:{action:'void',run_id:runId,
     notes:form.elements.notes.value,confirmation:form.elements.confirmation.value}});
    toast('Memória anulada, preservando histórico.');
    await payrollVacation65Open(month,occ,runId);
   }catch(err){toast(err.message||String(err),'error');button.disabled=false}
  };
 };
}

async function payrollVacation66Open(month,occ,runId){
 const url='/api/payroll/vacation-advance-finance-link';
 const data=await api(url+'?occurrence_id='+encodeURIComponent(occ.id));
 const ev=data.linked||{};
 const rows=(data.candidates||[]).map(p=>
  '<option value="'+esc(p.id)+'">'+esc(p.number||p.id)+' | '+
  esc(p.payment_date||'')+' | '+esc(vacation99Money(p.payment_cash_cents))+'</option>').join('');
 const active=ev.linked===true;
 const body='<p class="help"><b>Vínculo documental interno.</b> Somente títulos existentes, já pagos e com baixa contábil validada podem ser utilizados. Esta tela não gera novo pagamento ou lançamento.</p>'+
  '<p><b>Funcionário:</b> '+esc(data.employee_name||occ.employee_name||'')+
  '<p><b>Recibo:</b> '+esc(data.advance?.document_ref||'')+
  ' · data '+esc(data.advance?.payment_date||'')+
  ' · líquido '+esc(vacation99Money(data.advance?.amount_cents))+'</p>'+
  '<p>Situação: <b>'+esc(ev.status==='VALID'?'Vinculado e conferido':
   active?'Vínculo existente com pendência':'Aguardando vínculo')+'</b></p>'+
  (active?'<p class="help">Título: '+esc(ev.payable_number||ev.payable_id||'')+
   ' · '+esc(ev.payment_verified?'Baixa financeira registrada e conciliada ao diário.':'Conferência pendente.')+'</p>':'')+
  (!active&&can('payroll.manage')?
   '<form id="vac104LinkForm"><label class="field"><span>Título financeiro pago</span>'+
   '<select name="payable_id" required><option value="">Selecione o título</option>'+rows+'</select></label>'+
   '<p class="help">Os títulos sugeridos coincidem em valor, data e documento. Se não houver nenhum, regularize primeiro a baixa no Financeiro.</p>'+
   '<label class="field"><span>Digite VINCULAR ADIANTAMENTO</span>'+
   '<input name="confirmation" autocomplete="off" required></label>'+
   '<div class="form-actions"><button class="btn primary" type="submit">Vincular título existente</button></div></form>':'')+
  (active&&can('payroll.manage')?
   '<form id="vac104VoidForm"><label class="field"><span>Motivo da desvinculação</span>'+
   '<textarea name="notes" minlength="15" maxlength="600" required></textarea></label>'+
   '<label class="field"><span>Digite DESVINCULAR ADIANTAMENTO</span>'+
   '<input name="confirmation" autocomplete="off" required></label>'+
   '<div class="form-actions"><button class="btn danger" type="submit">Desvincular</button></div></form>':'')+
  '<div class="form-actions"><button class="btn secondary" id="vac104Back" type="button">Voltar à conferência</button>'+
  '<button class="btn secondary" id="vac104Reload" type="button">Atualizar</button></div>';
 openModal('Férias — vínculo do adiantamento (v104)',esc(occ.employee_name||''),body,true);
 $('#vac104Back').onclick=()=>payrollVacation65Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 $('#vac104Reload').onclick=()=>payrollVacation66Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 if($('#vac104LinkForm'))$('#vac104LinkForm').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   await api(url,{method:'POST',body:{action:'link',occurrence_id:occ.id,
    payable_id:form.elements.payable_id.value,confirmation:form.elements.confirmation.value}});
   toast('Adiantamento vinculado à baixa existente. Nenhum novo pagamento foi gerado.');
   await payrollVacation66Open(month,occ,runId);
  }catch(err){toast(err.message||String(err),'error');button.disabled=false}
 };
 if($('#vac104VoidForm'))$('#vac104VoidForm').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   await api(url,{method:'POST',body:{action:'void',occurrence_id:occ.id,
    notes:form.elements.notes.value,confirmation:form.elements.confirmation.value}});
   toast('Vínculo desfeito; histórico preservado.');
   await payrollVacation66Open(month,occ,runId);
  }catch(err){toast(err.message||String(err),'error');button.disabled=false}
 };
}

async function payrollVacation67Open(month,occ,runId){
 const base='/api/payroll/monthly-runs/'+encodeURIComponent(runId);
 const data=await api(base+'/vacation-provision-reconciliation');
 if(!data.applicable){
  openModal('Férias — provisões (v105)',esc(occ.employee_name||''),
   '<p class="help">'+esc(data.note||'Não aplicável.')+'</p>'+
   '<div class="form-actions"><button id="vac105Back" class="btn secondary" type="button">Voltar</button></div>',true);
  $('#vac105Back').onclick=()=>payrollVacation65Open(month,occ,runId).catch(e=>toast(e.message,'error'));
  return;
 }
 const rows=(data.items||[]).flatMap(item=>(item.components||[]).map(comp=>
  '<tr><td>'+esc(item.employee_id)+'</td><td>'+esc(comp.component)+'</td>'+
  '<td>'+esc(vacation99Money(comp.earned_cents))+'</td>'+
  '<td>'+esc(vacation99Money(comp.accrual_posted_cents))+'</td>'+
  '<td>'+esc(vacation99Money(comp.use_posted_cents))+'</td>'+
  '<td>'+esc(vacation99Money(comp.explicitly_linked_use_cents))+'</td>'+
  '<td>'+esc(comp.linked_to_occurrence?'Vinculado':'Pendente')+'</td>'+
  '<td><button type="button" class="btn secondary vac105UseLink" data-occ="'+
   esc(comp.occurrence_id||'')+'" data-component="'+esc(comp.component)+'">Vincular baixa</button></td></tr>')).join('');
 const problems=(data.problems||[]).map(p=>'<li><b>'+esc(p.code)+'</b> — '+esc(p.message)+'</li>').join('');
 const warnings=(data.warnings||[]).map(w=>'<li>'+esc(w)+'</li>').join('');
 const journals=(data.verified_journals||[]).map(j=>'<tr><td>'+esc(j.journal_entry_id||'Não encontrado')+
  '</td><td>'+esc(j.kind||'')+'</td><td>'+esc(vacation99Money(j.amount_cents))+'</td>'+
  '<td>'+esc(j.valid?'Conferido':'Divergente')+'</td></tr>').join('');
 openModal('Férias — conciliação de provisões (v105)',
  esc(occ.employee_name||'Funcionário')+' · '+esc(data.run?.competence||''),
  '<p class="help"><b>Conferência do diário.</b> Compara origem, funcionário, centro de custo, débito e crédito do lançamento já contabilizado. Não cria lançamentos nem pagamentos.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Componente</th><th>Verba do mês</th>'+
  '<th>Constituído contabilizado</th><th>Baixa contabilizada</th><th>Vinculado à ocorrência</th>'+
  '<th>Situação</th><th>Ação</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<p class="section-title">Lançamentos de provisões conferidos</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Diário</th><th>Tipo</th><th>Valor</th>'+
  '<th>Situação</th></tr></thead><tbody>'+journals+'</tbody></table></div>'+
  '<p class="section-title">Pendências</p>'+
  (problems?'<ul class="help">'+problems+'</ul>':'<p class="help">Sem divergências detectadas nos registros consultados.</p>')+
  '<p class="section-title">Observações</p><ul class="help">'+warnings+'</ul>'+
  '<p class="help"><b>Integração definitiva:</b> exige adiantamento pago comprovado, baixas de provisões vinculadas, contas conferidas e fechamento mensal aprovado.</p>'+
  '<div class="form-actions"><button type="button" id="vac105Back" class="btn secondary">Voltar</button>'+
  '<button type="button" id="vac121Open" class="btn primary">Conferir integração definitiva</button>'+
  '<button type="button" id="vac105Reload" class="btn secondary">Atualizar</button></div>',true);
 $('#vac105Back').onclick=()=>payrollVacation65Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 $('#vac105Reload').onclick=()=>payrollVacation67Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 $('#vac121Open').onclick=()=>payrollVacation121Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 document.querySelectorAll('.vac105UseLink').forEach(el=>{
  el.onclick=()=>payrollVacation68Open(month,occ,runId,el.dataset.occ,el.dataset.component).catch(e=>toast(e.message,'error'));
 });
}
async function payrollVacation68Open(month,occ,runId,occurrenceId,component){
 const url='/api/payroll/monthly-runs/'+encodeURIComponent(runId)+'/vacation-provision-use-links';
 const data=await api(url+'?occurrence_id='+encodeURIComponent(occurrenceId)+'&component='+encodeURIComponent(component));
 const options=(data.candidates||[]).map(m=>'<option value="'+esc(m.id)+'">'+
  esc(m.document_ref||'')+' · '+esc(vacation99Money(Math.abs(Number(m.amount_cents))))+
  ' · diário '+esc(m.journal_entry_id||'')+'</option>').join('');
 const linked=(data.links||[]).map(x=>
  '<tr><td>'+esc(x.movement_id)+'</td><td>'+esc(vacation99Money(x.amount_cents))+'</td>'+
  '<td>'+esc(x.journal_entry_id||'')+'</td><td>'+
  (can('payroll.manage')?
   '<button class="btn danger vac105Unlink" type="button" data-id="'+esc(x.id)+'">Desvincular</button>':'—')+
  '</td></tr>').join('');
 openModal('Férias — vínculo da baixa de provisão (v105)',esc(component)+' · '+esc(data.competence),
  '<p class="help">Associe somente uma baixa de provisão já contabilizada, do mesmo funcionário, competência e documento. Esta ação não altera o lançamento.</p>'+
  '<p>Verba do mês: <b>'+esc(vacation99Money(data.expected_cents))+'</b> · '+
  'Vinculado: <b>'+esc(vacation99Money(data.linked_cents))+'</b> · '+
  'Pendente: <b>'+esc(vacation99Money(data.remaining_cents))+'</b></p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Movimento</th><th>Valor</th><th>Diário</th><th>Ação</th>'+
  '</tr></thead><tbody>'+linked+'</tbody></table></div>'+
  (can('payroll.manage')&&data.remaining_cents>0?
   '<form id="vac105UseForm"><label class="field"><span>Baixa de provisão contabilizada</span>'+
   '<select name="movement_id" required><option value="">Selecione</option>'+options+'</select></label>'+
   '<label class="field"><span>Digite VINCULAR BAIXA FERIAS</span>'+
   '<input name="confirmation" autocomplete="off" required></label>'+
   '<div class="form-actions"><button class="btn primary" type="submit">Vincular baixa existente</button></div></form>':'')+
  '<div class="form-actions"><button id="vac105UseBack" class="btn secondary" type="button">Voltar</button></div>',true);
 $('#vac105UseBack').onclick=()=>payrollVacation67Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 if($('#vac105UseForm'))$('#vac105UseForm').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   await api(url,{method:'POST',body:{action:'link',occurrence_id:occurrenceId,component,
    movement_id:form.elements.movement_id.value,confirmation:form.elements.confirmation.value}});
   toast('Baixa vinculada à ocorrência. Nenhum novo lançamento criado.');
   await payrollVacation68Open(month,occ,runId,occurrenceId,component);
  }catch(err){toast(err.message||String(err),'error');button.disabled=false;}
 };
 document.querySelectorAll('.vac105Unlink').forEach(button=>{
  button.onclick=()=>{
   const id=button.dataset.id;
   openModal('Desvincular baixa',esc(component),
    '<form id="vac105UnlinkForm"><label class="field"><span>Justificativa</span>'+
    '<textarea name="notes" minlength="15" maxlength="600" required></textarea></label>'+
    '<label class="field"><span>Digite DESVINCULAR BAIXA FERIAS</span>'+
    '<input name="confirmation" autocomplete="off" required></label>'+
    '<div class="form-actions"><button class="btn danger" type="submit">Desvincular</button></div></form>',true);
   $('#vac105UnlinkForm').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget,submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try{
     await api(url,{method:'POST',body:{action:'void',occurrence_id:occurrenceId,component,link_id:id,
      notes:form.elements.notes.value,confirmation:form.elements.confirmation.value}});
     toast('Vínculo desfeito, sem estorno contábil.');
     await payrollVacation68Open(month,occ,runId,occurrenceId,component);
    }catch(err){toast(err.message||String(err),'error');submit.disabled=false;}
   };
  };
 });
}
