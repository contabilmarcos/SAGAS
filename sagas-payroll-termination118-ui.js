// SAGAS v118 — diagnóstico consolidado da rescisão: sem efetivação.
function pterm118Req(p){return pterm115Req(p)}
async function payrollTermination118Open(base){
 const p=await api('/api/payroll/termination/preclose',{method:'POST',body:pterm118Req(base)});
 payrollTermination118Show(p);
}
function payrollTermination118Show(p){
 const f=p.financial||{};
 const fin=[
  ['Bruto documental',f.gross_reference_cents],
  ['Descontos documentados',f.deductions_reference_cents],
  ['Líquido de referência (não é título)',f.net_reference_cents],
  ['Multa FGTS referencial (fora do líquido)',f.fgts_fine_reference_cents]
 ].map(([name,value])=>'<tr><td>'+esc(name)+'</td><td>'+pterm114Money(value)+'</td></tr>').join('');
 const labels={FERIAS:'Férias',TERCO_FERIAS:'1/3 de férias',DECIMO_TERCEIRO:'13º salário'};
 const prov=(p.provision_items||[]).map(r=>
  '<tr><td>'+esc(labels[r.component]||r.component)+'</td>'+
  '<td>'+pterm114Money(r.balance_cents)+'</td>'+
  '<td>'+pterm114Money(r.target_cents)+'</td>'+
  '<td>'+pterm114Money(r.proposed_use_cents)+'</td>'+
  '<td>'+pterm114Money(r.uncovered_reference_cents)+'</td>'+
  '<td>'+esc(r.accounting_verified?'Movimentos vinculados':'Conferência pendente')+'</td></tr>').join('');
 const grouped={};
 for(const issue of p.blocks||[]){
  (grouped[issue.area]||(grouped[issue.area]=[])).push(issue);
 }
 const blocks=Object.entries(grouped).map(([area,items])=>
  '<h4>'+esc(area)+'</h4><div class="table-wrap"><table class="table"><thead><tr>'+
  '<th>Código</th><th>Pendência</th></tr></thead><tbody>'+
  items.map(x=>'<tr><td>'+esc(x.code)+'</td><td>'+esc(x.message)+'</td></tr>').join('')+
  '</tbody></table></div>').join('')||
  '<p class="help">Nenhuma pendência detectada neste diagnóstico; isso não substitui a aprovação formal, nem valida automaticamente o saldo contábil.</p>';
 openModal('Rescisão — diagnóstico de fechamento',
  'Conferência integrada de tributos, líquido e saldos operacionais das provisões. Somente leitura.',
  '<p class="help"><b>Funcionário:</b> '+esc(p.employee?.code||'—')+' — '+esc(p.employee?.name||'')+
  ' · <b>Desligamento:</b> '+esc(p.termination_date)+
  ' · <b>Pendências:</b> '+esc(p.total_blocks)+
  '. <b>Situação:</b> não liberado para fechamento.</p>'+
  '<h4>Resumo financeiro de referência</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Parcela</th><th>Valor</th></tr></thead>'+
  '<tbody>'+fin+'</tbody></table></div>'+
  '<h4>Provisões por componente — saldo operacional, não saldo contábil</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr>'+
  '<th>Componente</th><th>Saldo</th><th>Direito</th><th>Uso estimado</th><th>Sem cobertura</th><th>Contabilização</th>'+
  '</tr></thead><tbody>'+prov+'</tbody></table></div>'+
  '<p class="help">O uso estimado não faz baixa contábil. A conta de passivo e o centro de custo ainda precisam ser conciliados antes de gerar qualquer lançamento.</p>'+
  '<h4>Checklist das pendências por área</h4>'+blocks+
  (p.warnings||[]).map(w=>'<p class="help">'+esc(w)+'</p>').join('')+
  '<div class="form-actions">'+
  '<button class="btn secondary" type="button" id="pterm118Plan">Preparar lançamentos</button>'+
  '<button class="btn secondary" type="button" id="pterm118Refresh">Atualizar diagnóstico</button>'+
  '<button class="btn secondary" type="button" id="pterm118History">Histórico</button>'+
  (can('payroll.manage')?
   '<button class="btn primary" type="button" id="pterm118Record">Registrar diagnóstico DRAFT</button>':'')+
  '</div>',true);
 document.getElementById('pterm118Refresh').onclick=()=>payrollTermination118Open(p).catch(e=>toast(e.message,'error'));
 document.getElementById('pterm118Plan').onclick=()=>payrollTermination119Open(p).catch(e=>toast(e.message,'error'));
 document.getElementById('pterm118History').onclick=()=>payrollTermination118History(p.employee.id,p.employee.name).catch(e=>toast(e.message,'error'));
 const record=document.getElementById('pterm118Record');
 if(record)record.onclick=async()=>{
  record.disabled=true;
  try{
   const r=await api('/api/payroll/termination/preclose-diagnostics',{method:'POST',body:{
    ...pterm118Req(p),source_fingerprint:p.source_fingerprint,
    confirmation:'REGISTRAR DIAGNOSTICO RESCISAO'
   }});
   toast(r.reused?'Diagnóstico já registrado.':'Diagnóstico DRAFT registrado, sem lançamentos ou pagamento.');
   payrollTermination118Open(p).catch(e=>toast(e.message,'error'));
  }catch(e){toast(e.message,'error');record.disabled=false}
 };
}
async function payrollTermination118History(employeeId,name){
 const response=await api('/api/payroll/termination/preclose-diagnostics?employee_id='+encodeURIComponent(employeeId));
 const items=response.runs||[];
 const rows=items.map((r,i)=>'<tr><td>'+esc(r.termination_date)+'</td><td>'+esc(r.kind)+
  '</td><td>'+esc(r.revision)+'</td><td>DRAFT</td><td>'+
  '<button class="btn secondary sm" type="button" data-term118-item="'+i+'">Conferir</button></td></tr>').join('');
 openModal('Histórico dos diagnósticos — '+esc(name),
  'Registros versionados das pendências, sem título financeiro nem movimentação contábil.',
  '<div class="table-wrap"><table class="table"><thead><tr><th>Desligamento</th><th>Tipo</th>'+
  '<th>Revisão</th><th>Status</th><th>Ação</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="5">Sem diagnósticos registrados.</td></tr>')+'</tbody></table></div>',true);
 $$('[data-term118-item]').forEach(btn=>btn.onclick=async()=>{
  try{
   const item=items[Number(btn.dataset.term118Item)];
   const detail=await api('/api/payroll/termination/preclose-diagnostics/'+encodeURIComponent(item.id));
   payrollTermination118Show(detail.snapshot);
  }catch(e){toast(e.message,'error')}
 });
}
