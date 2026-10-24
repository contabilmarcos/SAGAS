// SAGAS Folha v95 — prévia mensal comercial de 30 dias, sem lançamentos.
// Reaproveita os modais do sistema; competências especiais permanecem bloqueadas.
function vacation56BRL(n){return (Number(n||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
async function payrollVacation56Open(month,occ){
 const data=await api('/api/payroll/vacation-monthly-preview?occurrence_id='+encodeURIComponent(occ.id));
 if(!data.prepared){
  openModal('Férias — cálculo mensal pendente',esc(occ.employee_name),
   '<p class="help">'+esc(data.note||'Finalize a conciliação do recibo.')+'</p>'+
   '<div class="form-actions"><button id="vac56Return" class="btn secondary" type="button">Voltar</button></div>',true);
  $('#vac56Return').onclick=()=>payrollVacation55Open(month,occ).catch(e=>toast(e.message,'error'));
  return;
 }
 const blockers=data.blockers||[];
 const rows=(data.salary_references||[]).map(p=>'<tr><td>'+esc(p.competence)+'</td>'+
  '<td>'+esc(String(p.days))+'</td><td>'+esc(String(p.month_length))+'</td>'+
  '<td>'+esc(String(p.calendar?.calendar_nonvacation_days??'—'))+'</td>'+
  '<td>'+esc(String(p.calendar?.salary_paid_reference_days??'—'))+'</td>'+
  '<td>'+esc(String(p.calendar?.commercial_salary_complement_days??0))+'</td>'+
  '<td>'+esc(p.salary_cents===null?'Histórico pendente':vacation56BRL(p.salary_cents))+'</td>'+
  '<td>'+esc(p.existing_center?.code||'Não cadastrado')+'</td>'+
  '<td>'+esc(p.existing_run?.status||'Ainda não calculada')+'</td></tr>').join('');
 const fields=(data.payment_dates_required||[]).map((date,i)=>'<label class="field">'+
  '<span>Pagamento mensal de '+esc(date)+'</span>'+
  '<input name="payment'+i+'" type="date" required></label>').join('');
 openModal('Férias — prévia da integração mensal',
  esc(data.employee?.name||occ.employee_name)+' • recibo conciliado',
  '<p class="help"><b>Prévia sem gravação.</b> A folha mensal permanece bloqueada para férias. Esta tela simula incidências e evita contar férias ou adiantamento duas vezes.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Competência</th><th>Dias férias</th><th>Dias no mês</th>'+
  '<th>Dias fora férias</th><th>Dias de salário (base 30)</th><th>Complemento</th>'+
  '<th>Salário histórico</th><th>Centro de custo atual</th><th>Folha</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<p class="help">O complemento de fevereiro completa a referência comercial de 30 dias; não representa trabalho realizado. Em meses de 31 dias, o dia excedente não gera salário adicional.</p>'+
  '<p class="help">Configuração salarial: '+esc((data.salary_references||[]).map(x=>x.competence+' — '+(x.salary_mode||'RM_NEXT_MONTH')).join('; '))+'.</p>'+
  '<p>Bruto do recibo: <b>'+esc(vacation56BRL(data.gross_cents))+'</b> · Férias gozadas + 1/3: <b>'+
  esc(vacation56BRL(data.vacation_gross_cents))+'</b>.</p>'+
  '<p class="section-title">Pendências verificadas</p>'+
  '<ul class="help">'+(blockers.length?blockers.map(x=>'<li><b>'+esc(x.competence)+' / '+esc(x.code)+'</b>: '+esc(x.message)+'</li>').join(''):
   '<li>Sem pendências nos parâmetros desta versão. Informe as datas previstas de pagamento mensal para simular.</li>')+'</ul>'+
  (blockers.length?'': '<form id="vacation56Form"><div class="grid">'+fields+'</div>'+
  '<p class="help">Use a data de pagamento prevista no calendário da folha para cada competência. O cálculo ainda não gera pagamento.</p>'+
  '<div class="form-actions"><button type="submit" class="btn primary">Simular envelopes mensais</button></div></form>')+
  '<div class="form-actions"><button id="vac56Return" type="button" class="btn secondary">Voltar ao recibo</button></div>',true);
 $('#vac56Return').onclick=()=>payrollVacation55Open(month,occ).catch(e=>toast(e.message,'error'));
 const form=$('#vacation56Form');
 if(form)form.onsubmit=async e=>{
  e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const payment_dates=(data.payment_dates_required||[]).map((x,i)=>form.elements['payment'+i].value);
   const calculated=await api('/api/payroll/vacation-monthly-preview',{method:'POST',body:{
    occurrence_id:occ.id,expected_fingerprint:data.fingerprint,payment_dates
   }});
   payrollVacation56Result(month,occ,calculated);
  }catch(err){toast(err.message||String(err),'error');button.disabled=false}
 };
}
function payrollVacation56Result(month,occ,data){
 const rows=(data.months||[]).map(m=>
  '<tr><td>'+esc(m.competence)+'</td><td>'+esc(String(m.days_worked))+'</td>'+
  '<td>'+esc(String(m.salary_reference_days??'—'))+'</td>'+
  '<td>'+esc(String(m.commercial_salary_complement_days??0))+'</td>'+
  '<td>'+esc(vacation56BRL(m.salary_worked_cents))+'</td>'+
  '<td>'+esc(vacation56BRL(m.vacation_gross_cents))+'</td>'+
  '<td>'+esc(vacation56BRL(m.receipt_inss_allocated_cents))+'</td>'+
  '<td>'+esc(vacation56BRL(m.inss_payroll_balance_cents))+'</td>'+
  '<td>'+esc(vacation56BRL(m.irrf_monthly_cents))+'</td>'+
  '<td>'+esc(vacation56BRL(m.fgts_employer_cents))+'</td>'+
  '<td><b>'+esc(vacation56BRL(m.illustrative_net_cents))+'</b></td></tr>').join('');
 const detail=(data.months||[]).map(m=>
  '<p><b>Competência '+esc(m.competence)+'</b> — Base INSS '+esc(vacation56BRL(m.base_inss_cents))+
  '; FGTS '+esc(vacation56BRL(m.base_fgts_cents))+
  ' — '+esc(String(m.month_length))+' dias calendário, '+esc(String(m.salary_reference_days))+' dias de salário na referência comercial'+
  (m.calendar_warning?' ('+esc(m.calendar_warning)+')':'')+'</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Evento</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>'+
  m.events.map(e=>'<tr><td>'+esc(e.event_code)+'</td><td>'+esc(e.line_type)+'</td>'+
   '<td>'+esc(vacation56BRL(e.amount_cents))+'</td></tr>').join('')+'</tbody></table></div>'
 ).join('');
 const blocks=(data.blockers||[]).map(p=>'<li><b>'+esc(p.code)+'</b>: '+esc(p.message)+'</li>').join('');
 openModal('Férias — resultado da prévia mensal',
  esc(occ.employee_name)+' • '+esc(String(data.calculated_months||0))+' de '+esc(String(data.expected_months||0))+' competências simuladas',
  '<p class="help"><b>Não é envelope homologado.</b> Férias e adiantamento não foram lançados e nenhum título financeiro foi criado. Todos os impostos dependem da conferência final.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Competência</th><th>Dias fora férias</th>'+
  '<th>Dias salário (base 30)</th><th>Complemento</th><th>Saldo salarial</th><th>Férias + 1/3</th><th>INSS do recibo</th><th>INSS folha</th>'+
  '<th>IRRF folha</th><th>FGTS patronal</th><th>Líquido ilustrativo</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="11">Nenhuma competência liberada para simulação.</td></tr>')+'</tbody></table></div>'+
  '<p class="section-title">Rubricas calculadas por competência</p>'+detail+
  (blocks?'<p class="section-title">Bloqueios</p><ul class="help">'+blocks+'</ul>':'')+
  '<p class="help">'+(data.months||[]).flatMap(m=>(m.salary_notes||[]).map(n=>m.competence+': '+n)).map(esc).join(' ')+'</p>'+
  '<p class="help">'+(data.notes||[]).map(esc).join(' ')+'</p>'+
  '<div class="form-actions"><button id="vac56ResultBack" class="btn secondary" type="button">Voltar</button>'+
  '<button id="vac56ResultRedo" class="btn primary" type="button">Refazer simulação</button></div>',true);
 $('#vac56ResultBack').onclick=()=>payrollVacation55Open(month,occ).catch(e=>toast(e.message,'error'));
 $('#vac56ResultRedo').onclick=()=>payrollVacation56Open(month,occ).catch(e=>toast(e.message,'error'));
}
