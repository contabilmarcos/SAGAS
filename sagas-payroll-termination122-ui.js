// SAGAS v122: fechamento auditável do pedido de demissão.
// Sem liberação para dispensa sem justa causa: multa FGTS exige módulo próprio.
async function payrollTermination122Open(base){
 const query=pterm119Req(base);
 const url='/api/payroll/termination/closing122';
 const p=await api(url,{method:'POST',body:{...query,action:'preview'}});
 const fmt=pterm114Money;
 const rows=(p.problems||[]).map(x=>'<tr><td>'+esc(x.code)+'</td><td>'+esc(x.message)+'</td></tr>').join('');
 const uses=(p.provision_movements||[]).map(x=>'<tr><td>'+esc(x.component)+'</td><td>'+fmt(x.amount_cents)+'</td></tr>').join('');
 const status=p.posting?'Encerrada e contabilizada':p.ready_for_integration?'TRCT aprovado / pronta para integração':p.ready_for_approval?'Apta à homologação documental':'Existem pendências';
 openModal('Rescisão — fechamento contábil e financeiro v122',
  esc(p.employee?.code||'')+' — '+esc(p.employee?.name||'')+' · '+esc(p.termination_date),
  '<p class="help"><b>Situação:</b> '+esc(status)+'. A versão atual permite finalizar somente pedido de demissão, com TRCT e impostos conciliados. Não emite guia nem executa pagamento bancário.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Bruto TRCT</th><th>Líquido a pagar</th><th>Uso provisões</th><th>Vencimento</th></tr></thead><tbody><tr>'+
  '<td>'+fmt(p.gross_cents)+'</td><td>'+fmt(p.net_cents)+'</td>'+
  '<td>'+fmt(p.provision_use_cents)+'</td><td>'+esc(p.payable_due_date||'—')+'</td></tr></tbody></table></div>'+
  '<p class="help"><b>Centro de custo:</b> '+esc(p.employee?.cost_center_code||'—')+
  ' · <b>Lote:</b> '+esc(p.accounting_batch_id||'—')+
  ' · <b>TRCT aprovado:</b> '+esc(p.approval?.trct_reference||'Não')+'</p>'+
  '<h4>Provisões a baixar e contabilizar</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Componente</th><th>Valor</th></tr></thead><tbody>'+
  (uses||'<tr><td colspan="2">Nenhuma provisão a baixar.</td></tr>')+'</tbody></table></div>'+
  '<h4>Pendências</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Verificação</th><th>Detalhamento</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="2">Sem pendências detectadas na documentação interna.</td></tr>')+'</tbody></table></div>'+
  '<p class="help"><b>FGTS regular:</b> precisa ter conferência e contabilização própria. Esta operação não gera guia ou título do FGTS.</p>'+
  '<p class="help"><b>Importante:</b> o SAGAS exige documentos externos conferidos por responsável habilitado. A emissão do TRCT e os prazos legais não são substituídos por esta tela. O encerramento alterará definitivamente a situação do funcionário para DESLIGADO.</p>'+
  '<div class="form-actions"><button class="btn secondary" id="pterm122Back" type="button">Voltar ao plano</button>'+
  '<button class="btn secondary" id="pterm122Reload" type="button">Atualizar conferência</button>'+
  (p.ready_for_approval&&can('payroll.manage')?'<button class="btn primary" id="pterm122Approve" type="button">Homologar TRCT</button>':'')+
  (p.ready_for_integration&&can('payroll.manage')?'<button class="btn primary" id="pterm122Integrate" type="button">Contabilizar e encerrar rescisão</button>':'')+
  '</div>',true);
 document.getElementById('pterm122Back').onclick=()=>payrollTermination119Open(base).catch(e=>toast(e.message,'error'));
 document.getElementById('pterm122Reload').onclick=()=>payrollTermination122Open(base).catch(e=>toast(e.message,'error'));
 if(document.getElementById('pterm122Approve'))document.getElementById('pterm122Approve').onclick=()=>{
  openModal('Homologação documental do TRCT — '+esc(p.employee?.name||''),
   'Confirme que os valores e incidências estão idênticos aos documentos assinados.',
   '<p class="help">Bruto '+fmt(p.gross_cents)+' · Líquido '+fmt(p.net_cents)+
   ' · Pagamento até '+esc(p.payable_due_date)+'. Este ato não gera título ou lançamento ainda.</p>'+
   '<form id="pterm122ApproveForm">'+
   '<label class="field"><span>TRCT assinado / referência documental</span><input name="trct_reference" minlength="12" maxlength="240" required></label>'+
   '<label class="field"><span>Conferência de INSS e IRRF</span><input name="tax_reference" minlength="12" maxlength="240" required></label>'+
   '<label class="field"><span>Conferência de períodos aquisitivos e férias</span><input name="vacation_reference" minlength="12" maxlength="240" required></label>'+
   '<label class="field"><span>Comprovação de aviso trabalhado ou dispensa do aviso</span><input name="notice_reference" minlength="12" maxlength="240" required></label>'+
   '<label class="field"><span>Conferência do FGTS regular e registro de obrigação em rotina separada</span><input name="fgts_regular_reference" minlength="12" maxlength="240" required></label>'+
   '<label class="field"><span>Digite APROVAR TRCT RESCISAO</span><input name="confirmation" autocomplete="off" required></label>'+
   '<div class="form-actions"><button class="btn secondary" type="button" id="pterm122Cancel">Voltar</button>'+
   '<button class="btn primary" type="submit">Homologar valores exatos do TRCT</button></div></form>',true);
  document.getElementById('pterm122Cancel').onclick=()=>payrollTermination122Open(base).catch(e=>toast(e.message,'error'));
  document.getElementById('pterm122ApproveForm').onsubmit=async ev=>{
   ev.preventDefault();const form=ev.currentTarget,button=form.querySelector('[type=submit]');
   button.disabled=true;
   try{
    const values=Object.fromEntries(new FormData(form));
    await api(url,{method:'POST',body:{...query,...values,action:'approve',
     trct_gross_cents:p.gross_cents,trct_net_cents:p.net_cents,
     payment_date:p.payable_due_date,source_fingerprint:p.source_fingerprint}});
    toast('TRCT homologado e vinculado à revisão atual; ainda não contabilizado.');
    await payrollTermination122Open(base);
   }catch(e){toast(e.message,'error');button.disabled=false}
  };
 };
 if(document.getElementById('pterm122Integrate'))document.getElementById('pterm122Integrate').onclick=()=>{
  openModal('Encerrar definitivamente pedido de demissão',
   esc(p.employee?.name||'')+' · '+esc(p.termination_date),
   '<p class="help">A ação criará diário(s) POSTED, baixa da provisão, título líquido em Contas a Pagar e situação DESLIGADO no histórico funcional. O título será criado ABERTO, sem pagamento.</p>'+
   '<form id="pterm122IntegrateForm"><label class="field"><span>Digite CONTABILIZAR E ENCERRAR RESCISAO</span>'+
   '<input name="confirmation" autocomplete="off" required></label>'+
   '<div class="form-actions"><button class="btn secondary" id="pterm122PostBack" type="button">Voltar</button>'+
   '<button class="btn primary" type="submit">Gerar diário, financeiro e desligar funcionário</button></div></form>',true);
  document.getElementById('pterm122PostBack').onclick=()=>payrollTermination122Open(base).catch(e=>toast(e.message,'error'));
  document.getElementById('pterm122IntegrateForm').onsubmit=async ev=>{
   ev.preventDefault();const form=ev.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;
   try{
    const result=await api(url,{method:'POST',body:{...query,source_fingerprint:p.source_fingerprint,action:'integrate',
     confirmation:form.elements.confirmation.value}});
    toast('Rescisão encerrada. Diário, financeiro e situação funcional vinculados.');
    await payrollTermination122Open(base);
   }catch(e){toast(e.message,'error');button.disabled=false}
  };
 };
}
