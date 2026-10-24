// SAGAS Folha v92 — preparação documental e adiantamento EXTERNO de férias.
// Mantém os modais do SAGAS; não cria recibos pagos nem partidas de folha.
function payrollVacation54Money(c){return (Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function payrollVacation54Cents(raw){
 const v=String(raw||'').trim().replace(',','.');
 if(!/^\d{1,8}(\.\d{1,2})?$/.test(v))throw Error('Informe o valor em reais no formato 0,00.');
 const cents=Math.round(Number(v)*100);
 if(!Number.isSafeInteger(cents)||cents<=0)throw Error('Informe um valor positivo válido.');
 return cents;
}
async function payrollVacation54Open(month,occ){
 const res=await api('/api/payroll/vacation-processing?occurrence_id='+encodeURIComponent(occ.id));
 const snap=res.snapshot,prepared=!!res.prepared,blocked=!!res.locked,manage=can('payroll.manage');
 const rows=(res.compensation_review||[]).map(p=>
  '<tr><td>'+esc(p.competence)+'</td><td>'+esc(String(p.gozo_days))+'</td>'+
  '<td>'+esc(payrollVacation54Money(p.vacation_cents))+'</td>'+
  '<td>'+esc(payrollVacation54Money(p.third_cents))+'</td>'+
  '<td>'+esc(payrollVacation54Money(p.taxable_gross_cents))+'</td>'+
  '<td>'+esc(payrollVacation54Money(p.mathematical_advance_allocation_cents))+'</td></tr>').join('');
 const blockerRows=(res.blockers||[]).map(b=>'<li><b>'+esc(b.code)+'</b> — '+esc(b.message)+'</li>').join('');
 const adv=res.advance||null;
 openModal('Férias — processamento preliminar',
  esc(res.employee?.name||occ.employee_name||'Funcionário')+' • '+esc(res.start_date||occ.start_date)+' a '+esc(res.end_date||occ.end_date),
  '<p class="help"><b>Não homologado.</b> Esta etapa guarda a memória conferida e a referência a um pagamento externo informado pelo DP. Não efetua pagamentos, não desconta na folha nem contabiliza.</p>'+
  '<p>Status: <b>'+esc(blocked?'Fonte alterada — regularizar':prepared?'Preparação registrada':'Ainda não preparada')+'</b>'+
  (res.processing?' · Revisão da memória '+esc(String(res.processing.model_revision)):'')+'</p>'+
  '<p>Bruto da minuta: <b>'+esc(payrollVacation54Money(res.gross_cents||snap?.gross_cents))+'</b> · Abono e respectivo terço: '+
  esc(payrollVacation54Money(res.abono_cents||((snap?.abono_cents||0)+(snap?.abono_third_cents||0))))+'</p>'+
  (adv?'<p class="help"><b>Pagamento externo declarado:</b> '+esc(payrollVacation54Money(adv.amount_cents))+
   ', em '+esc(adv.date)+', comprovante '+esc(adv.external_reference)+'. Informação declaratória, ainda não conciliada ao financeiro.</p>':
   '<p class="help">Nenhum adiantamento externo declarado neste processamento.</p>')+
  (adv?'<p class="help">Distribuição exclusivamente matemática: gozo '+esc(payrollVacation54Money(res.mathematical_gozo_share_cents))+
   ' · abono '+esc(payrollVacation54Money(res.mathematical_abono_share_cents))+'. Sem lançamento no envelope.</p>':'')+
  '<p class="section-title">Proposta de compensação por competência — NÃO LANÇAR</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Competência</th><th>Dias</th><th>Férias</th><th>1/3</th><th>Bruto gozo</th><th>Rateio ilustrativo adiantamento</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="6">Sem divisão disponível.</td></tr>')+'</tbody></table></div>'+
  '<p class="help">Rateio ilustrativo. O valor declarado é separado proporcionalmente entre gozo e abono; tributos e pagamento exigem conciliação antes da compensação real. NÃO LANÇAR na folha.</p>'+
  '<p class="section-title">Pendências e restrições</p><ul class="help">'+
  (blockerRows||'<li>Sem alertas adicionais de cadastro; a homologação tributária e financeira continua pendente.</li>')+'</ul>'+
  (res.note?'<p class="help">'+esc(res.note)+'</p>':'')+
  '<div class="form-actions"><button class="btn secondary" id="vacation54Back" type="button">Voltar</button>'+
  (manage&&!prepared&&!blocked?'<button class="btn primary" type="button" id="vacation54Prepare">Preparar férias</button>':'')+
  (manage&&prepared&&!blocked&&!adv?'<button class="btn primary" type="button" id="vacation54Advance">Informar pagamento externo</button>':'')+
  (manage&&prepared&&adv?'<button class="btn secondary" type="button" id="vacation54CancelAdvance">Cancelar referência</button>':'')+
  (manage&&prepared&&!adv?'<button class="btn secondary" type="button" id="vacation54Void">Anular preparação</button>':'')+
  '</div>',true);
 $('#vacation54Back').onclick=()=>payrollVacation53Open(month,occ).catch(e=>toast(e.message,'error'));
 if($('#vacation54Prepare'))$('#vacation54Prepare').onclick=()=>payrollVacation54Action(month,occ,'prepare');
 if($('#vacation54Advance'))$('#vacation54Advance').onclick=()=>payrollVacation54Action(month,occ,'declare-advance');
 if($('#vacation54CancelAdvance'))$('#vacation54CancelAdvance').onclick=()=>payrollVacation54Action(month,occ,'cancel-advance');
 if($('#vacation54Void'))$('#vacation54Void').onclick=()=>payrollVacation54Action(month,occ,'void');
}
function payrollVacation54Action(month,occ,action){
 const isPrepare=action==='prepare',isAdvance=action==='declare-advance',
  isVoid=action==='void',isCancel=action==='cancel-advance';
 const confirmations={
  prepare:'PREPARAR FERIAS', 'declare-advance':'PAGAMENTO EXTERNO CONFERIDO',
  void:'ANULAR PREPARACAO','cancel-advance':'CANCELAR REFERENCIA'
 };
 const title=isPrepare?'Preparar processamento de férias':
  isAdvance?'Informar adiantamento externo de férias':
  isVoid?'Anular preparação de férias':'Cancelar referência de adiantamento';
 openModal(title,esc(occ.employee_name)+' • '+esc(occ.start_date)+' a '+esc(occ.end_date),
  '<p class="help">'+(isAdvance?
   'Informe apenas pagamento efetivamente realizado fora do SAGAS e já comprovado pelo DP. Este registro NÃO cria título, pagamento ou desconto na folha.':
   isPrepare?'A preparação guarda a memória de cálculo como fotografia auditável; ela não é um recibo de férias quitado.':
   'A alteração será auditada. Cancelar uma referência não estorna pagamentos bancários ou lançamentos já existentes.')+'</p>'+
  '<form id="vacation54Form"><div class="grid">'+
  (isAdvance?'<label class="field"><span>Data do pagamento externo</span><input name="payment_date" type="date" required></label>'+
   '<label class="field"><span>Valor efetivamente pago (R$)</span><input name="amount" type="text" inputmode="decimal" placeholder="0,00" required></label>'+
   '<label class="field full"><span>Identificação do comprovante bancário</span><input name="external_reference" minlength="6" maxlength="160" required></label>':'')+
  (!isPrepare?'<label class="field full"><span>'+(isAdvance?'Origem e conferência pelo DP':'Motivo da alteração')+'</span>'+
   '<textarea name="notes" rows="3" minlength="12" maxlength="500" required></textarea></label>':'')+
  '<label class="field full"><span>Confirme digitando '+esc(confirmations[action])+'</span>'+
  '<input name="confirmation" autocomplete="off" required></label></div>'+
  '<div class="form-actions"><button class="btn secondary" id="vacation54Cancel" type="button">Voltar</button>'+
  '<button class="btn primary" type="submit">Confirmar</button></div></form>',true);
 $('#vacation54Cancel').onclick=()=>payrollVacation54Open(month,occ).catch(e=>toast(e.message,'error'));
 const form=$('#vacation54Form');
 form.onsubmit=async event=>{
  event.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
   const body={action,occurrence_id:occ.id,confirmation:form.elements.confirmation.value};
   if(!isPrepare)body.notes=form.elements.notes.value;
   if(isAdvance){
    body.payment_date=form.elements.payment_date.value;
    body.amount_cents=payrollVacation54Cents(form.elements.amount.value);
    body.external_reference=form.elements.external_reference.value;
   }
   await api('/api/payroll/vacation-processing',{method:'POST',body});
   toast(isPrepare?'Preparação registrada; sem lançamento financeiro.':
    isAdvance?'Referência de pagamento externo registrada para conferência.':
    'Registro atualizado com histórico de auditoria.');
   await payrollVacation54Open(month,occ);
  }catch(e){toast(e.message||String(e),'error');btn.disabled=false}
 };
}
