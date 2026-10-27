// SAGAS v121 — efetivação protegida da folha com férias e compensação já paga.
// O registro de D1 só ocorre após confirmação explícita dos documentos.
async function payrollVacation121Open(month,occ,runId){
 const apiUrl='/api/payroll/monthly-runs/'+encodeURIComponent(runId)+'/vacation-final-integration';
 const p=await api(apiUrl);
 const amount=n=>vacation99Money(n);
 const rows=(p.modifications||[]).map(x=>
  '<tr><td>'+esc(x.employee_id)+'</td><td>'+esc(x.event_code)+'</td>'+
  '<td>'+esc(x.debit_from_account)+'</td><td>'+esc(x.debit_to_account)+'</td>'+
  '<td>'+amount(x.amount_cents)+'</td></tr>').join('');
 const issues=(p.problems||[]).map(x=>'<li><b>'+esc(x.code)+'</b> — '+esc(x.message)+'</li>').join('');
 const notes=(p.notes||[]).map(x=>'<li>'+esc(x)+'</li>').join('');
 const d=(p.provisional_reclassifications||[]).map(x=>
  '<tr><td>'+esc(x.employee_id)+'</td><td>'+esc(x.component)+'</td>'+
  '<td>'+amount(x.amount_cents)+'</td><td>'+esc(x.provision_journal_id||'—')+'</td>'+
  '<td>'+esc(x.advance_payment_journal_id||'—')+'</td></tr>').join('');
 openModal('Férias — integração definitiva da folha (v121)',
  esc(month)+' · Diário mensal e líquido residual. Não repete o adiantamento.',
  '<p class="help"><b>Situação:</b> '+esc(p.existing?'Já existe integração':p.ready?'Apto mediante conferência bancária':'Pendências')+
  ' · <b>Lote:</b> '+esc(p.accounting_batch_id||'Não configurado')+
  ' · <b>Funcionários:</b> '+esc(p.employee_count)+'</p>'+
  '<p class="help"><b>Valor do diário:</b> '+amount(p.accounting_total_cents)+
  ' · <b>Líquido residual a pagar:</b> '+amount(p.financial_total_cents)+
  ' · <b>Títulos previstos:</b> '+esc(p.payable_count)+'.</p>'+
  '<h4>Baixas já contabilizadas vinculadas aos direitos</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Componente</th><th>Valor</th>'+
  '<th>Diário da baixa</th><th>Diário do adiantamento</th></tr></thead><tbody>'+
  (d||'<tr><td colspan="5">Sem baixas conferidas.</td></tr>')+'</tbody></table></div>'+
  '<h4>Reclassificações do débito</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Evento</th><th>Conta original</th>'+
  '<th>Conta de liquidação</th><th>Valor</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="5">Sem transferências verificadas.</td></tr>')+'</tbody></table></div>'+
  '<h4>Pendências</h4>'+
  (issues?'<ul class="help">'+issues+'</ul>':'<p class="help">Sem pendências nas conferências internas.</p>')+
  '<h4>Observações</h4><ul class="help">'+notes+'</ul>'+
  '<div class="form-actions"><button class="btn secondary" id="vac121Back" type="button">Voltar à conciliação</button>'+
  '<button class="btn secondary" id="vac121Reload" type="button">Atualizar prévia</button>'+
  (p.ready&&!p.existing&&can('payroll.manage')?
   '<button class="btn primary" id="vac121Confirm" type="button">Confirmar extrato e integrar</button>':'')+'</div>',true);
 $('#vac121Back').onclick=()=>payrollVacation67Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 $('#vac121Reload').onclick=()=>payrollVacation121Open(month,occ,runId).catch(e=>toast(e.message,'error'));
 if($('#vac121Confirm'))$('#vac121Confirm').onclick=()=>{
  openModal('Confirmação de fechamento de férias e folha',
   'Será gerado um diário contábil POSTED e somente o líquido residual em Contas a Pagar.',
   '<p class="help"><b>Não cria novos adiantamentos nem novas baixas de provisões.</b> '+
   'Confirme com o extrato bancário real que todos os adiantamentos já foram pagos e conciliados.</p>'+
   '<form id="vac121PostForm"><label class="field"><span>Referência do extrato bancário dos adiantamentos</span>'+
   '<input name="bank_statement_reference" required minlength="12" maxlength="240" autocomplete="off"></label>'+
   '<label class="field"><span>Digite CONFIRMO ADIANTAMENTO E PROVISOES</span>'+
   '<input name="confirmed_reconciliation" required autocomplete="off"></label>'+
   '<label class="field"><span>Digite INTEGRAR FERIAS E FOLHA</span>'+
   '<input name="confirmation" required autocomplete="off"></label>'+
   '<div class="form-actions"><button type="button" class="btn secondary" id="vac121Cancel">Voltar</button>'+
   '<button type="submit" class="btn primary">Contabilizar e gerar financeiro residual</button></div></form>',true);
  $('#vac121Cancel').onclick=()=>payrollVacation121Open(month,occ,runId).catch(e=>toast(e.message,'error'));
  $('#vac121PostForm').onsubmit=async ev=>{
   ev.preventDefault();
   const form=ev.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;
   try{
    const data=Object.fromEntries(new FormData(form));
    const result=await api(apiUrl,{method:'POST',body:{...data,source_fingerprint:p.source_fingerprint}});
    toast('Folha com férias integrada; somente o líquido residual foi gerado em financeiro.');
    await payrollVacation121Open(month,occ,runId);
   }catch(e){toast(e.message,'error');button.disabled=false}
  };
 };
}
