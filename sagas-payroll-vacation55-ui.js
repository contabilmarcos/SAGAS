// SAGAS Folha v93 — conciliação formal do recibo e preparação de eventos da folha.
// Não cria nem edita envelopes, contas a pagar, contas contábeis ou pagamentos.
function vac55Fmt(n){return (Number(n||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function vac55Input(n){return (Number(n||0)/100).toFixed(2).replace('.',',')}
function vac55Cents(v){
 const txt=String(v||'').trim().replace(',','.');
 if(!/^\d{1,9}(\.\d{1,2})?$/.test(txt))throw Error('Informe valor em reais com até duas casas decimais.');
 const n=Math.round(Number(txt)*100);
 if(!Number.isSafeInteger(n)||n<0)throw Error('Valor fora do limite.');
 return n;
}
async function payrollVacation55Open(month,occ){
 const data=await api('/api/payroll/vacation-reconciliation?occurrence_id='+encodeURIComponent(occ.id));
 const active=data.reconciled?.plan||null;
 const blockers=(data.blockers||[]).map(p=>'<li><b>'+esc(p.code)+'</b> — '+esc(p.message)+'</li>').join('');
 const planRows=(active?.periods||[]).map(p=>{
  return '<tr><td>'+esc(p.competence)+'</td><td>'+esc(String(p.days))+'</td>'+
  '<td>'+esc(vac55Fmt(p.remuneration_cents))+'</td><td>'+esc(vac55Fmt(p.constitutional_third_cents))+'</td>'+
  '<td><b>'+esc(vac55Fmt(p.compensation_gross_cents))+'</b></td>'+
  '<td>'+esc(p.proposed_lines.map(x=>x.event_code).join(' / '))+'</td></tr>';
 }).join('');
 const gross=Number(data.gross_cents||0),paid=Number(data.bank_amount_cents||0),diff=gross-paid;
 openModal('Férias — conciliar recibo e competências',
  esc(data.employee?.name||occ.employee_name||'Funcionário')+' • '+esc(data.period_start||occ.start_date)+' a '+esc(data.period_end||occ.end_date),
  '<p class="help"><b>Conciliação de recibo, sem lançamento.</b> Informe os descontos que constam no recibo emitido fora do SAGAS. Não confunda o pagamento bancário líquido com a compensação bruta de férias nos envelopes.</p>'+
  '<p>Bruto da minuta: <b>'+esc(vac55Fmt(gross))+'</b> · Pago externamente: <b>'+esc(vac55Fmt(paid))+
  '</b> · Descontos a justificar: <b>'+esc(vac55Fmt(diff))+'</b>.</p>'+
  (data.active?'<p><b>Recibo conciliado documentalmente</b> em '+esc(data.reconciled.recorded_at||'')+
    (data.stale?' — <b>Fonte alterada: conciliação indisponível</b>':'')+'.</p>'+
    '<div class="table-wrap"><table class="table"><thead><tr><th>Competência</th><th>Dias</th><th>Férias</th><th>1/3</th><th>Compensação bruta sugerida</th><th>Eventos propostos</th></tr></thead><tbody>'+planRows+'</tbody></table></div>'+
    '<p class="help">INSS do recibo '+esc(vac55Fmt(active?.receipt_inss_cents))+
    ' · IRRF do recibo '+esc(vac55Fmt(active?.receipt_irrf_cents))+
    ' · Outros descontos '+esc(vac55Fmt(active?.receipt_other_cents))+'. Essas verbas não foram lançadas na folha.</p>':
    '<p class="help">O sistema só concilia se bruto – descontos documentados = pagamento externo, sem diferenças.</p>')+
  (data.active?'':data.ready_for_reconciliation&&can('payroll.manage')?
    '<form id="vac55Form"><div class="grid">'+
    '<label class="field"><span>INSS descontado no recibo (R$)</span><input name="inss" inputmode="decimal" value="0,00" required></label>'+
    '<label class="field"><span>IRRF retido no pagamento de férias (R$)</span><input name="irrf" inputmode="decimal" value="0,00" required></label>'+
    '<label class="field"><span>Outros descontos comprovados (R$)</span><input name="other" inputmode="decimal" value="0,00" required></label>'+
    '<label class="field full"><span>Documento e justificativa da conferência (DP)</span>'+
    '<textarea name="notes" rows="3" minlength="15" maxlength="700" required></textarea></label>'+
    '<label class="field full"><span>Confirme digitando RECIBO CONFERIDO</span>'+
    '<input name="confirmation" autocomplete="off" required></label></div>'+
    '<div class="form-actions"><button type="submit" class="btn primary">Conferir e guardar plano</button></div></form>':
    '<p class="help">Conclua as pendências de processamento, adiantamento e competência para habilitar a conciliação.</p>')+
  '<p class="section-title">Pendências e ressalvas</p><ul class="help">'+
  (blockers||'<li>Sem outras pendências cadastrais; o lançamento mensal continua não autorizado.</li>')+'</ul>'+
  '<p class="help"><b>Nenhum desconto ou provento foi aplicado ao envelope mensal.</b> A apuração definitiva de INSS, FGTS e IRRF continua dependente da folha e do recibo homologado.</p>'+
  '<div class="form-actions"><button class="btn secondary" id="vac55Back" type="button">Voltar</button>'+
  (data.active&&can('payroll.manage')?'<button class="btn secondary" id="vac55Void" type="button">Anular conciliação</button>':'')+
  (data.active?'<button class="btn primary" id="vac56Open" type="button">Prévia da folha mensal</button>':'')+
  '</div>',true);
 $('#vac55Back').onclick=()=>payrollVacation54Open(month,occ).catch(e=>toast(e.message,'error'));
 if($('#vac55Void'))$('#vac55Void').onclick=()=>payrollVacation55Void(month,occ);
 if($('#vac56Open'))$('#vac56Open').onclick=()=>payrollVacation56Open(month,occ).catch(e=>toast(e.message,'error'));
 const form=$('#vac55Form');
 if(form)form.onsubmit=async ev=>{
  ev.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
   const body={action:'reconcile',occurrence_id:occ.id,
    receipt_inss_cents:vac55Cents(form.elements.inss.value),
    receipt_irrf_cents:vac55Cents(form.elements.irrf.value),
    receipt_other_cents:vac55Cents(form.elements.other.value),
    notes:form.elements.notes.value,confirmation:form.elements.confirmation.value};
   const sum=body.receipt_inss_cents+body.receipt_irrf_cents+body.receipt_other_cents;
   if(sum!==diff)throw Error('Os descontos somados ('+vac55Fmt(sum)+') não conciliam com bruto menos pagamento externo ('+vac55Fmt(diff)+').');
   await api('/api/payroll/vacation-reconciliation',{method:'POST',body});
   toast('Recibo conciliado. O plano não foi lançado na folha.');
   await payrollVacation55Open(month,occ);
  }catch(e){toast(e.message||String(e),'error');btn.disabled=false}
 };
}
function payrollVacation55Void(month,occ){
 openModal('Anular conciliação de férias',
  esc(occ.employee_name)+' • '+esc(occ.start_date)+' a '+esc(occ.end_date),
  '<p class="help">Anula somente o plano de conciliação. Não altera o registro do pagamento bancário nem realiza estorno contábil.</p>'+
  '<form id="vac55VoidForm"><label class="field"><span>Motivo documentado</span>'+
  '<textarea name="notes" minlength="15" maxlength="700" required rows="3"></textarea></label>'+
  '<label class="field"><span>Digite ANULAR CONCILIACAO</span><input name="confirmation" required autocomplete="off"></label>'+
  '<div class="form-actions"><button class="btn secondary" type="button" id="vac55Cancel">Cancelar</button>'+
  '<button class="btn danger" type="submit">Anular conciliação</button></div></form>',true);
 $('#vac55Cancel').onclick=()=>payrollVacation55Open(month,occ).catch(e=>toast(e.message,'error'));
 const f=$('#vac55VoidForm');
 f.onsubmit=async ev=>{
  ev.preventDefault();const btn=f.querySelector('[type=submit]');btn.disabled=true;
  try{
   await api('/api/payroll/vacation-reconciliation',{method:'POST',body:{
    action:'void',occurrence_id:occ.id,confirmation:f.elements.confirmation.value,notes:f.elements.notes.value
   }});
   toast('Conciliação anulada com histórico de auditoria.');
   await payrollVacation55Open(month,occ);
  }catch(e){toast(e.message||String(e),'error');btn.disabled=false}
 };
}
