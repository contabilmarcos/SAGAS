// SAGAS v123 — dispensa sem justa causa: TRCT + multa FGTS Digital 40%.
function pterm123Money(c){return pterm114Money(c)}
async function payrollTermination123Settings(base){
 const cfg=await api('/api/payroll/termination/dismissal123/settings');
 const selected=cfg.current?.supplier_id||'';
 const options=(cfg.creditors||[]).map(x=>
  '<option value="'+esc(x.id)+'"'+(selected===x.id?' selected':'')+'>'+
  esc(x.code+' — '+x.name)+'</option>').join('');
 openModal('Multa FGTS — credor e natureza orçamentária',
  'A multa rescisória é obrigação própria; não integra o líquido do trabalhador.',
  '<p class="help">Selecione o credor registrado em Fornecedores (recolhimento FGTS Digital). Configure também FGTS_FINE_EXPENSE e FGTS_FINE_PAYABLE nas naturezas da rescisão. As contas serão obtidas por centro de custo.</p>'+
  '<form id="pterm123SettingsForm"><label class="field"><span>Credor da multa FGTS</span>'+
  '<select name="supplier_id" required><option value="">Selecione o credor</option>'+options+'</select></label>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="pterm123SettingsBack">Voltar</button>'+
  '<button type="submit" class="btn primary">Salvar credor</button>'+
  '<button type="button" class="btn secondary" id="pterm123Natures">Configurar naturezas</button></div></form>',true);
 document.getElementById('pterm123SettingsBack').onclick=()=>payrollTermination123Open(base).catch(x=>toast(x.message,'error'));
 document.getElementById('pterm123Natures').onclick=()=>payrollTermination119Settings(base).catch(x=>toast(x.message,'error'));
 document.getElementById('pterm123SettingsForm').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,b=form.querySelector('[type=submit]');b.disabled=true;
  try{
   await api('/api/payroll/termination/dismissal123/settings',{method:'POST',body:{
    supplier_id:form.elements.supplier_id.value
   }});
   toast('Credor da multa FGTS configurado.');
   await payrollTermination123Settings(base);
  }catch(x){toast(x.message,'error');b.disabled=false}
 };
}
async function payrollTermination123Evidence(base,p){
 const url='/api/payroll/termination/dismissal123';
 const money=pterm123Money;
 openModal('FGTS Digital — comprovação da multa rescisória',
  esc(p.employee?.name||'')+' · '+esc(p.termination_date),
  '<p class="help">Informe apenas a <b>multa compensatória de 40%</b>, não o valor total da guia que pode incluir outros depósitos. Confira o histórico e o valor base total para fins rescisórios no FGTS Digital. O cálculo do SAGAS deve coincidir exatamente.</p>'+
  '<form id="pterm123EvidenceForm">'+
  '<label class="field"><span>Base histórica de FGTS para fins rescisórios (R$)</span><input readonly value="'+esc((Number(p.fgts_base_cents||0)/100).toFixed(2))+'"></label>'+
  '<label class="field"><span>Multa de 40% apurada e conferida (R$)</span><input readonly value="'+esc((Number(p.fgts_fine_cents||0)/100).toFixed(2))+'"></label>'+
  '<label class="field"><span>Extrato histórico de FGTS do trabalhador</span><input name="statement_reference" minlength="12" maxlength="240" required value="'+esc(p.fgts?.statement_reference||'')+'"></label>'+
  '<label class="field"><span>Referência do valor base total no FGTS Digital</span><input name="base_reference" minlength="12" maxlength="240" required value="'+esc(p.fgts?.base_reference||'')+'"></label>'+
  '<label class="field"><span>Identificador da guia FGTS Digital</span><input name="guide_reference" minlength="12" maxlength="240" required value="'+esc(p.fgts?.guide_reference||'')+'"></label>'+
  '<label class="field"><span>Vencimento da guia</span><input name="due_date" type="date" required value="'+esc(p.fgts?.due_date||'')+'"></label>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="pterm123EvidenceBack">Voltar</button>'+
  '<button type="submit" class="btn primary">Conferir e vincular documento</button></div></form>',true);
 document.getElementById('pterm123EvidenceBack').onclick=()=>payrollTermination123Open(base).catch(x=>toast(x.message,'error'));
 document.getElementById('pterm123EvidenceForm').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,b=form.querySelector('[type=submit]');b.disabled=true;
  try{
   await api(url,{method:'POST',body:{
    ...pterm119Req(base),...Object.fromEntries(new FormData(form)),action:'save-fgts',
    fgts_base_cents:p.fgts_base_cents,fgts_fine_cents:p.fgts_fine_cents
   }});
   toast('Multa FGTS vinculada à base rescisória e documentação atual.');
   await payrollTermination123Open(base);
  }catch(x){toast(x.message,'error');b.disabled=false}
 };
}
async function payrollTermination123Open(base){
 const url='/api/payroll/termination/dismissal123';
 const p=await api(url,{method:'POST',body:{...pterm119Req(base),action:'preview'}});
 const money=pterm123Money;
 const errors=(p.problems||[]).map(x=>'<tr><td>'+esc(x.code)+'</td><td>'+esc(x.message)+'</td></tr>').join('');
 const fgtsLines=(p.fgts_lines||[]).map(x=>'<tr><td>'+esc(x.side)+'</td><td>'+
  esc(x.account_code||x.account_id||'')+'</td><td>'+esc(x.cost_center_id||'')+'</td><td>'+
  money(x.amount_cents)+'</td></tr>').join('');
 const state=p.posting?'Integrada':p.ready_for_integration?'Apta ao encerramento':
  p.ready_for_approval?'Apta à aprovação do TRCT e da multa':'Pendências';
 openModal('Dispensa sem justa causa — fechamento v123',
  esc(p.employee?.code||'')+' — '+esc(p.employee?.name||'')+' · '+esc(p.termination_date),
  '<p class="help"><b>Situação:</b> '+esc(state)+'. Diário de multa e obrigação FGTS independentes do líquido rescisório do trabalhador.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Bruto TRCT</th><th>Líquido do empregado</th><th>Multa FGTS 40%</th><th>Vencimento FGTS</th></tr></thead><tbody><tr>'+
  '<td>'+money(p.gross_cents)+'</td><td>'+money(p.net_cents)+'</td><td>'+money(p.fgts_fine_cents)+
  '</td><td>'+esc(p.fgts?.due_date||'Não conferido')+'</td></tr></tbody></table></div>'+
  (p.posting?'<p class="help"><b>Conferência após encerramento:</b> '+esc(p.verified?'Diários e títulos conciliados':'Existem pendências de auditoria')+
    ' · <b>Diário(s):</b> '+esc((p.journal_ids||[]).join(', '))+
    ' · <b>Título do trabalhador:</b> '+esc(p.financial?.employee_payable_id||'—')+
    ' ('+esc(p.financial?.employee_payable_status||'—')+')'+
    ' · <b>Título da multa FGTS:</b> '+esc(p.financial?.fgts_payable_id||'—')+
    ' ('+esc(p.financial?.fgts_payable_status||'—')+')</p>':'')+
  '<p class="help"><b>Guia FGTS:</b> '+esc(p.fgts?.guide_reference||'Ainda não vinculada')+
  ' · <b>Lote contábil:</b> '+esc(p.accounting_batch_id||'Não configurado')+'</p>'+
  '<h4>Diário proposto da multa (separado do TRCT)</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>D/C</th><th>Conta</th><th>Centro de custo</th><th>Valor</th></tr></thead><tbody>'+
  (fgtsLines||'<tr><td colspan="4">Configure as duas naturezas da multa FGTS.</td></tr>')+'</tbody></table></div>'+
  '<h4>Pendências</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Etapa</th><th>Mensagem</th></tr></thead><tbody>'+
  (errors||'<tr><td colspan="2">Sem pendências na conferência interna.</td></tr>')+'</tbody></table></div>'+
  '<p class="help">Esta rotina contabiliza somente a multa de 40%, além da quitação normal. FGTS mensal, aviso, 13º e demais valores da guia precisam de escrituração e recolhimento próprios. Não transmite eSocial nem paga guias automaticamente.</p>'+
  '<div class="form-actions"><button class="btn secondary" id="pterm123Back" type="button">Voltar ao plano</button>'+
  '<button class="btn secondary" id="pterm123Reload" type="button">Recalcular</button>'+
  '<button class="btn secondary" id="pterm123Settings" type="button">Configurar multa</button>'+
  (!p.approval&&!p.posting&&can('payroll.manage')?'<button class="btn secondary" id="pterm123FGTS" type="button">Conferir FGTS Digital</button>':'')+
  (p.ready_for_approval&&can('payroll.manage')?'<button class="btn primary" id="pterm123Approve" type="button">Homologar TRCT e multa</button>':'')+
  (p.ready_for_integration&&can('payroll.manage')?'<button class="btn primary" id="pterm123Integrate" type="button">Integrar dispensa</button>':'')+
  '</div>',true);
 document.getElementById('pterm123Back').onclick=()=>payrollTermination119Open(base).catch(x=>toast(x.message,'error'));
 document.getElementById('pterm123Reload').onclick=()=>payrollTermination123Open(base).catch(x=>toast(x.message,'error'));
 document.getElementById('pterm123Settings').onclick=()=>payrollTermination123Settings(base).catch(x=>toast(x.message,'error'));
 if(document.getElementById('pterm123FGTS'))document.getElementById('pterm123FGTS').onclick=()=>payrollTermination123Evidence(base,p).catch(x=>toast(x.message,'error'));
 if(document.getElementById('pterm123Approve'))document.getElementById('pterm123Approve').onclick=()=>{
  openModal('Homologar TRCT e FGTS Digital',
   'Confirme as verbas e os documentos; não há geração de título antes da integração.',
   '<p class="help"><b>Bruto:</b> '+money(p.gross_cents)+' · <b>Líquido:</b> '+money(p.net_cents)+
   ' · <b>Multa FGTS:</b> '+money(p.fgts_fine_cents)+'.</p>'+
   '<form id="pterm123ApprovalForm">'+
   '<label class="field"><span>TRCT assinado</span><input name="trct_reference" minlength="12" maxlength="240" required></label>'+
   '<label class="field"><span>Conferência das retenções INSS/IRRF</span><input name="tax_reference" minlength="12" maxlength="240" required></label>'+
   '<label class="field"><span>Férias e períodos aquisitivos</span><input name="vacation_reference" minlength="12" maxlength="240" required></label>'+
   '<label class="field"><span>Aviso prévio e sua projeção</span><input name="notice_reference" minlength="12" maxlength="240" required></label>'+
   '<label class="field"><span>FGTS regular: referência da obrigação separada</span><input name="fgts_regular_reference" minlength="12" maxlength="240" required></label>'+
   '<label class="field"><span>Digite APROVAR DISPENSA E FGTS</span><input name="confirmation" required autocomplete="off"></label>'+
   '<div class="form-actions"><button type="button" class="btn secondary" id="pterm123ApproveBack">Voltar</button>'+
   '<button type="submit" class="btn primary">Homologar TRCT e FGTS</button></div></form>',true);
  document.getElementById('pterm123ApproveBack').onclick=()=>payrollTermination123Open(base).catch(x=>toast(x.message,'error'));
  document.getElementById('pterm123ApprovalForm').onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,b=form.querySelector('[type=submit]');b.disabled=true;
   try{
    await api(url,{method:'POST',body:{...pterm119Req(base),...Object.fromEntries(new FormData(form)),
     action:'approve',source_fingerprint:p.source_fingerprint,
     trct_gross_cents:p.gross_cents,trct_net_cents:p.net_cents,fgts_fine_cents:p.fgts_fine_cents,
     payment_date:p.payable_due_date,fgts_due_date:p.fgts?.due_date}});
    toast('TRCT e multa FGTS homologados, aguardando integração.');
    await payrollTermination123Open(base);
   }catch(x){toast(x.message,'error');b.disabled=false}
  };
 };
 if(document.getElementById('pterm123Integrate'))document.getElementById('pterm123Integrate').onclick=()=>{
  openModal('Integrar dispensa e multa FGTS',
   esc(p.employee?.name||'')+' · '+esc(p.termination_date),
   '<p class="help">Serão gerados diário das verbas, diário da multa FGTS, baixas de provisões quando aplicáveis, título líquido do empregado, título próprio da multa e situação DESLIGADO, na mesma transação. Nenhum pagamento será realizado.</p>'+
   '<form id="pterm123FinalForm"><label class="field"><span>Digite CONTABILIZAR DISPENSA E MULTA FGTS</span>'+
   '<input name="confirmation" required autocomplete="off"></label>'+
   '<div class="form-actions"><button class="btn secondary" id="pterm123FinalBack" type="button">Voltar</button>'+
   '<button class="btn primary" type="submit">Contabilizar e gerar dois títulos</button></div></form>',true);
  document.getElementById('pterm123FinalBack').onclick=()=>payrollTermination123Open(base).catch(x=>toast(x.message,'error'));
  document.getElementById('pterm123FinalForm').onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,b=form.querySelector('[type=submit]');b.disabled=true;
   try{
    const r=await api(url,{method:'POST',body:{...pterm119Req(base),action:'integrate',
     source_fingerprint:p.source_fingerprint,confirmation:form.elements.confirmation.value}});
    toast('Dispensa contabilizada: dois títulos abertos, diário da multa e situação DESLIGADO.');
    await payrollTermination123Open(base);
   }catch(x){toast(x.message,'error');b.disabled=false}
  };
 };
}
