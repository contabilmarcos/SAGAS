// SAGAS folha v112: provisão contabilizada + quitação separada da 2ª parcela do 13º.
async function payrollThirteenth112Settings(runId,year){
 const [r,n]=await Promise.all([
  api('/api/payroll/thirteenth/settlement/settings'),
  api('/api/payroll/accounting-natures')
 ]);
 const options=(n.natures||[]).filter(x=>x.active&&x.synthetic_analytic==='ANALYTIC');
 const mapping=new Map((r.mappings||[]).map(x=>[x.component,x]));
 const rows=Object.entries(r.components||{}).map(([comp,label])=>{
  const current=mapping.get(comp)||{};
  return '<tr><td>'+esc(label)+'</td><td><select id="p13s112-'+esc(comp)+'" aria-label="Natureza '+esc(label)+'">'+
   '<option value="">Selecione</option>'+options.map(x=>'<option value="'+esc(x.id)+'"'+
    (x.id===current.nature_id?' selected':'')+'>'+esc(x.code+' — '+x.description)+'</option>').join('')+
   '</select></td><td><button type="button" class="btn secondary sm" data-p13s112-save="'+esc(comp)+'">Salvar</button></td></tr>';
 }).join('');
 openModal('13º — Naturezas da quitação',
  'Débitos e créditos vêm da natureza orçamentária, conforme o centro de custo.',
  '<p class="help">Configure também a natureza de <b>baixa DECIMO_TERCEIRO</b> no Controle de Provisões. O crédito dessa baixa precisa ser a mesma conta debitada nas naturezas de adiantamento, retenções e líquido; o FGTS usa contas próprias.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Componente</th><th>Natureza</th><th>Ação</th></tr></thead><tbody>'+
  rows+'</tbody></table></div>'+
  '<div class="form-actions"><button class="btn secondary" id="p13s112Back">Histórico do 13º</button>'+
  '<button class="btn primary" id="p13s112Preview">Conferir partidas</button></div>',true);
 document.getElementById('p13s112Back').onclick=()=>payrollThirteenth71History(year,'SECOND').catch(e=>toast(e.message,'error'));
 document.getElementById('p13s112Preview').onclick=()=>payrollThirteenth112Preview(runId,year).catch(e=>toast(e.message,'error'));
 $$('[data-p13s112-save]').forEach(btn=>{
  btn.disabled=!can('payroll.manage');
  btn.onclick=async()=>{
   const component=btn.dataset.p13s112Save;
   const nature=document.getElementById('p13s112-'+component)?.value;
   if(!nature){toast('Selecione a natureza orçamentária.','error');return}
   btn.disabled=true;
   try{
    await api('/api/payroll/thirteenth/settlement/settings',{method:'POST',body:{component,nature_id:nature}});
    toast('Natureza da quitação atualizada.');
    await payrollThirteenth112Settings(runId,year);
   }catch(e){toast(e.message,'error');btn.disabled=false}
  };
 });
}
async function payrollThirteenth112Preview(runId,year){
 const r=await api('/api/payroll/thirteenth/settlement?run_id='+encodeURIComponent(runId));
 const fmt=n=>money(Number(n||0)/100);
 const problems=(r.problems||[]).map(x=>'<p class="help">'+esc(x.message)+'</p>').join('');
 const journal=(rows)=>'<div class="table-wrap"><table class="table"><thead>'+
   '<tr><th>D/C</th><th>Conta contábil</th><th>Centro de custo</th><th>Componente</th><th>Valor</th></tr></thead><tbody>'+
   (rows||[]).map(x=>'<tr><td>'+esc(x.side==='D'?'Débito':'Crédito')+'</td>'+
    '<td>'+esc(x.account_id)+'</td><td>'+esc(x.cost_center_id)+'</td><td>'+esc(x.component)+'</td>'+
    '<td>'+fmt(x.amount_cents)+'</td></tr>').join('')+'</tbody></table></div>';
 const employees='<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Saldo da provisão</th>'+
  '<th>Baixa do 13º</th><th>Adiantamento</th><th>INSS</th><th>IRRF</th><th>Líquido</th></tr></thead><tbody>'+
  (r.employees||[]).map(e=>'<tr><td>'+esc(e.employee_code||'—')+' — '+esc(e.employee_name)+'</td>'+
   '<td>'+fmt(e.provision_balance_cents)+'</td><td>'+fmt(e.provision_use_cents)+'</td>'+
   '<td>'+fmt(e.advance_cents)+'</td><td>'+fmt(e.inss_cents)+'</td>'+
   '<td>'+fmt(e.irrf_cents)+'</td><td><b>'+fmt(e.net_cents)+'</b></td></tr>').join('')+'</tbody></table></div>';
 openModal('13º — Quitação da 2ª parcela '+esc(year),
  'Conferência dos diários e títulos a pagar, utilizando provisões já contabilizadas.',
  '<p class="help"><b>Situação:</b> '+(r.posted?'Já integrada':r.ready?'Pronta para integração':'Pendências a regularizar')+
  ' · <b>Provisões:</b> '+fmt(r.totals?.provision_cents)+' · <b>Adiantamentos:</b> '+
  fmt(r.totals?.advance_cents)+' · <b>Líquido:</b> '+fmt(r.totals?.net_cents)+
  ' · <b>FGTS residual:</b> '+fmt(r.totals?.fgts_cents)+'.</p>'+
  (problems||'<p class="help">Valores e contas conciliados na prévia.</p>')+
  '<h4>Conferência por funcionário</h4>'+employees+
  '<h4>Diário 1 — Baixa da provisão</h4>'+journal(r.provision_lines)+
  '<p class="help">Débitos '+fmt(r.provision_debit_cents)+' / Créditos '+fmt(r.provision_credit_cents)+'</p>'+
  '<h4>Diário 2 — Liquidação e FGTS</h4>'+journal(r.settlement_lines)+
  '<p class="help">Débitos '+fmt(r.settlement_debit_cents)+' / Créditos '+fmt(r.settlement_credit_cents)+'</p>'+
  (r.notes||[]).map(x=>'<p class="help">'+esc(x)+'</p>').join('')+
  '<div class="form-actions"><button class="btn secondary" id="p13s112Settings">Configurar naturezas</button>'+
  '<button class="btn secondary" id="p13s112Back">Histórico</button>'+
  (r.ready&&can('payroll.manage')?
   '<button class="btn primary" id="p13s112Integrate">Integrar quitação</button>':'')+'</div>',true);
 document.getElementById('p13s112Settings').onclick=()=>payrollThirteenth112Settings(runId,year).catch(e=>toast(e.message,'error'));
 document.getElementById('p13s112Back').onclick=()=>payrollThirteenth71History(year,'SECOND').catch(e=>toast(e.message,'error'));
 if(document.getElementById('p13s112Integrate'))
  document.getElementById('p13s112Integrate').onclick=()=>payrollThirteenth112Integrate(r,year);
}
function payrollThirteenth112Integrate(preview,year){
 openModal('Confirmar quitação contábil do 13º',
  'Dois diários, baixas de provisões e títulos financeiros serão criados em uma transação.',
  '<p class="help"><b>Provisão:</b> '+money(preview.totals.provision_cents/100)+
  ' · <b>Líquido a pagar:</b> '+money(preview.totals.net_cents/100)+
  '. Esta ação <b>não</b> efetua depósito bancário nem emite guias.</p>'+
  '<form id="p13s112Form"><label class="field"><span>Data contábil da quitação (dezembro)</span>'+
  '<input name="posting_date" type="date" required min="'+esc(year)+'-12-01" max="'+esc(year)+'-12-31"></label>'+
  '<label class="field"><span>Digite INTEGRAR QUITACAO 13</span><input name="confirmation" required autocomplete="off"></label>'+
  '<div class="form-actions"><button class="btn secondary" id="p13s112Cancel" type="button">Voltar</button>'+
  '<button class="btn primary" type="submit">Integrar diários e títulos</button></div></form>',true);
 document.getElementById('p13s112Cancel').onclick=()=>payrollThirteenth112Preview(preview.run_id,year).catch(e=>toast(e.message,'error'));
 const form=document.getElementById('p13s112Form');
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const result=await api('/api/payroll/thirteenth/settlement',{method:'POST',body:{
    ...Object.fromEntries(new FormData(form)),
    run_id:preview.run_id,source_fingerprint:preview.source_fingerprint
   }});
   toast(result.integrated?'Quitação contabilizada e títulos a pagar gerados.':'Revise o lançamento.');
   await payrollThirteenth112Preview(preview.run_id,year);
  }catch(e){button.disabled=false;toast(e.message,'error')}
 };
}