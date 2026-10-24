// SAGAS Folha v96 — envelope próprio de férias em processo VACATION.
// Não modifica folha MONTHLY, não emite pagamento e não contabiliza.
function vac58Money(n){return (Number(n||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
async function payrollVacation58Open(month,occ){
 const data=await api('/api/payroll/vacation-envelope?occurrence_id='+encodeURIComponent(occ.id));
 const amount=data.amount||data.recorded?.snapshot?.amounts||null;
 const events=data.configured_events||[];
 const problems=(data.problems||[]).map(p=>'<li><b>'+esc(p.code)+'</b> — '+esc(p.message)+'</li>').join('');
 const rows=events.map(x=>'<tr><td>'+esc(x.event_code)+'</td>'+
  '<td>'+esc(x.line_type)+'</td><td>'+esc(vac58Money(x.amount_cents))+'</td>'+
  '<td>'+esc(x.nature_code||'Não configurada')+'</td></tr>').join('');
 const stored=data.recorded?.snapshot;
 const saved=(stored?.events||[]).map(x=>'<tr><td>'+esc(x.event_code)+'</td>'+
  '<td>'+esc(x.line_type)+'</td><td>'+esc(vac58Money(x.amount_cents))+'</td>'+
  '<td>'+esc(x.nature_id||'—')+'</td></tr>').join('');
 openModal('Férias — envelope próprio (v96)',
  esc(data.employee?.name||occ.employee_name||'Funcionário')+' · '+esc(data.payment_competence||'Competência pendente'),
  '<p class="help"><b>Processo VACATION.</b> O envelope é gravado separadamente da folha MONTHLY, para preservar o recibo conciliado. Não gera novo pagamento bancário, contas a pagar, baixa de provisão ou contabilização.</p>'+
  (data.active?'<p><b>Envelope registrado</b> · '+esc(data.recorded?.run_id||'')+
   ' · '+esc(data.recorded?.created_at||'')+(data.stale?' · <b>Origem modificada: revisar</b>':'')+'</p>':
   '<p>Status: <b>'+(data.ready_for_record?'Apto a registrar como CALCULATED':'Pendente de conferência')+'</b></p>')+
  '<p>Pagamento externo conciliado: <b>'+esc(vac58Money(amount?.net_cents))+'</b> · Bruto do recibo: <b>'+
   esc(vac58Money(amount?.gross_cents))+'</b> · Descontos: <b>'+esc(vac58Money(amount?.deductions_cents))+'</b>.</p>'+
  '<p class="section-title">Rubricas '+(data.active?'registradas':'previstas')+'</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Evento</th><th>Tipo</th><th>Valor</th><th>Natureza / Identificação</th></tr></thead><tbody>'+
  (data.active?saved:rows)+'</tbody></table></div>'+
  '<p class="help">Centro de custo do funcionário: '+esc(data.cost_center_code||'Não informado')+
   '. A natureza é configurada no cadastro de cada evento; a conta contábil será determinada posteriormente pelo centro de custo.</p>'+
  (problems?'<p class="section-title">Pendências</p><ul class="help">'+problems+'</ul>':
   '<p class="help">As verificações de consistência disponíveis nesta versão não identificaram pendências.</p>')+
  '<p class="help"><b>O envelope não está homologado.</b> A compensação nas folhas mensais, FGTS das competências e integração contábil seguem bloqueados.</p>'+
  '<div class="form-actions"><button class="btn secondary" type="button" id="vac58Back">Voltar</button>'+
  (can('payroll.manage')&&data.ready_for_record?
    '<button class="btn primary" type="button" id="vac58Record">Gravar envelope de férias</button>':'')+
  (can('payroll.manage')&&data.active?
    '<button class="btn danger" type="button" id="vac58Void">Anular envelope</button>':'')+
  (data.active?'<button class="btn primary" type="button" id="vac58Review">Conferir/aprovar férias</button>':'')+
  '<button class="btn secondary" type="button" id="vac58Refresh">Atualizar conferência</button></div>',true);
 $('#vac58Back').onclick=()=>payrollVacation56Open(month,occ).catch(e=>toast(e.message,'error'));
 $('#vac58Refresh').onclick=()=>payrollVacation58Open(month,occ).catch(e=>toast(e.message,'error'));
 if($('#vac58Record'))$('#vac58Record').onclick=()=>payrollVacation58Confirm(month,occ,data.fingerprint);
 if($('#vac58Void'))$('#vac58Void').onclick=()=>payrollVacation58Void(month,occ);
 if($('#vac58Review'))$('#vac58Review').onclick=()=>payrollVacation59Open(month,occ).catch(e=>toast(e.message,'error'));
}
function payrollVacation58Confirm(month,occ,fingerprint){
 openModal('Gravar envelope próprio de férias',
  esc(occ.employee_name)+' · '+esc(occ.start_date)+' a '+esc(occ.end_date),
  '<p class="help">Serão gravados um processamento do tipo VACATION, seu envelope e as rubricas do recibo. O histórico não altera os envelopes mensais e não produz pagamento/contabilização.</p>'+
  '<form id="vac58Form"><label class="field"><span>Confirme digitando GRAVAR ENVELOPE FERIAS</span>'+
  '<input name="confirmation" autocomplete="off" required></label>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="vac58Cancel">Cancelar</button>'+
  '<button class="btn primary" type="submit">Gravar processamento</button></div></form>',true);
 $('#vac58Cancel').onclick=()=>payrollVacation58Open(month,occ).catch(e=>toast(e.message,'error'));
 const f=$('#vac58Form');
 f.onsubmit=async e=>{
  e.preventDefault();const button=f.querySelector('[type=submit]');button.disabled=true;
  try{
   const response=await api('/api/payroll/vacation-envelope',{method:'POST',body:{
    action:'record',occurrence_id:occ.id,expected_fingerprint:fingerprint,
    confirmation:f.elements.confirmation.value
   }});
   toast('Envelope próprio de férias gravado na revisão '+response.revision+'. Sem pagamento duplicado.');
   await payrollVacation58Open(month,occ);
  }catch(err){toast(err.message||String(err),'error');button.disabled=false}
 };
}
function payrollVacation58Void(month,occ){
 openModal('Anular envelope próprio de férias',
  esc(occ.employee_name),
  '<p class="help">A anulação muda o processamento para VOID, preservando suas rubricas para auditoria. Não estorna depósitos bancários nem lançamentos de outras origens.</p>'+
  '<form id="vac58VoidForm"><label class="field"><span>Motivo da anulação</span>'+
  '<textarea name="notes" rows="3" minlength="15" maxlength="600" required></textarea></label>'+
  '<label class="field"><span>Digite ANULAR ENVELOPE FERIAS</span><input name="confirmation" autocomplete="off" required></label>'+
  '<div class="form-actions"><button type="button" id="vac58CancelVoid" class="btn secondary">Cancelar</button>'+
  '<button type="submit" class="btn danger">Anular processamento</button></div></form>',true);
 $('#vac58CancelVoid').onclick=()=>payrollVacation58Open(month,occ).catch(e=>toast(e.message,'error'));
 const f=$('#vac58VoidForm');
 f.onsubmit=async e=>{
  e.preventDefault();const button=f.querySelector('[type=submit]');button.disabled=true;
  try{
   await api('/api/payroll/vacation-envelope',{method:'POST',body:{
    action:'void',occurrence_id:occ.id,notes:f.elements.notes.value,confirmation:f.elements.confirmation.value
   }});
   toast('Envelope anulado com histórico preservado.');
   await payrollVacation58Open(month,occ);
  }catch(err){toast(err.message||String(err),'error');button.disabled=false}
 };
}
