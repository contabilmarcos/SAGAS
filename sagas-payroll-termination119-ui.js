// SAGAS v119 — minutas de diário e título, SEM integração definitiva.
function pterm119Req(p){return pterm115Req(p)}
async function payrollTermination119Settings(p){
 const [cfg,nat]=await Promise.all([
  api('/api/payroll/termination/plan/natures'),
  api('/api/payroll/accounting-natures')
 ]);
 const opts=(nat.natures||[]).filter(x=>x.active&&x.synthetic_analytic==='ANALYTIC');
 const names=cfg.components||{},m=new Map((cfg.mappings||[]).map(x=>[x.component,x]));
 const rows=Object.entries(names).map(([k,label])=>{
  const selected=m.get(k)?.nature_id||'';
  return '<tr><td>'+esc(label)+'</td><td><select id="pterm119Map-'+esc(k)+'" aria-label="Natureza '+esc(label)+'">'+
   '<option value="">Selecione</option>'+opts.map(x=>'<option value="'+esc(x.id)+'"'+
    (selected===x.id?' selected':'')+'>'+esc(x.code+' — '+x.description)+'</option>').join('')+
   '</select></td><td><button class="btn secondary sm" data-pterm119-map="'+esc(k)+'" type="button">Salvar</button></td></tr>';
 }).join('');
 openModal('Rescisão — parametrização das naturezas',
  'Contas contábeis obtidas da natureza e centro de custo; sem lançamento nesta tela.',
  '<p class="help">Além das naturezas abaixo, configure a baixa de férias, 1/3 e 13º no Controle de Provisões. '+
  'O crédito da baixa precisa coincidir com a conta transitória debitada na liquidação para cada centro de custo.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Componente</th><th>Natureza orçamentária</th><th></th></tr></thead><tbody>'+
  rows+'</tbody></table></div>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="pterm119Back">Voltar à prévia</button></div>',true);
 document.getElementById('pterm119Back').onclick=()=>payrollTermination119Open(p).catch(e=>toast(e.message,'error'));
 $$('[data-pterm119-map]').forEach(btn=>{
  btn.disabled=!can('payroll.manage');
  btn.onclick=async()=>{
   const k=btn.dataset.pterm119Map,val=document.getElementById('pterm119Map-'+k)?.value;
   if(!val){toast('Selecione uma natureza orçamentária.','error');return}
   btn.disabled=true;
   try{
    await api('/api/payroll/termination/plan/natures',{method:'POST',body:{component:k,nature_id:val}});
    toast('Natureza da rescisão configurada.');
    await payrollTermination119Settings(p);
   }catch(e){toast(e.message,'error');btn.disabled=false}
  };
 });
}
async function payrollTermination119Open(base){
 const p=await api('/api/payroll/termination/integration-plan',{method:'POST',body:pterm119Req(base)});
 payrollTermination119Show(p);
}
function payrollTermination119Show(p){
 const moneyfmt=n=>pterm114Money(n);
 const lines=items=>
  '<div class="table-wrap"><table class="table"><thead><tr><th>D/C</th><th>Conta contábil</th><th>Centro de custo</th><th>Origem</th><th>Valor</th></tr></thead><tbody>'+
  (items||[]).map(x=>'<tr><td>'+esc(x.side==='D'?'Débito':'Crédito')+'</td><td>'+
   esc([x.account_code,x.account_name].filter(Boolean).join(' — ')||x.account_id||'—')+'</td><td>'+
   esc(x.cost_center_id||'—')+'</td><td>'+esc(x.component)+'</td><td>'+moneyfmt(x.amount_cents)+'</td></tr>').join('')+
  '</tbody></table></div>';
 const f=p.financial||{};
 const uses=(p.provision_movements_preview||[]).map(x=>'<tr><td>'+esc(x.component)+'</td>'+
  '<td>'+moneyfmt(x.amount_cents)+'</td><td>'+esc(x.cost_center_id||'—')+'</td></tr>').join('');
 const blocks=(p.blocks||[]).map(x=>'<tr><td>'+esc(x.code)+'</td><td>'+esc(x.message)+'</td></tr>').join('');
 openModal('Rescisão — plano de integração contábil e financeira',
  'Minutas para conferência. Nenhum diário, título, pagamento ou baixa de provisão é gerado.',
  '<p class="help"><b>Funcionário:</b> '+esc(p.employee?.code||'—')+' — '+esc(p.employee?.name||'')+
  ' · <b>Data:</b> '+esc(p.termination_date)+
  ' · <b>Lote:</b> '+esc(p.batch_id||'não definido')+
  ' · <b>Pendências:</b> '+esc(p.block_count)+'</p>'+
  '<h4>Financeiro previsto</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Bruto</th><th>Descontos</th><th>Líquido a pagar</th><th>Vencimento</th></tr></thead>'+
  '<tbody><tr><td>'+moneyfmt(f.gross_reference_cents)+'</td><td>'+moneyfmt(f.deductions_cents)+
  '</td><td><b>'+moneyfmt(f.net_payable_preview_cents)+'</b></td><td>'+
  esc(p.payment_date||'—')+'</td></tr></tbody></table></div>'+
  '<p class="help">Multa FGTS em separado: '+moneyfmt(f.fgts_fine_separate_cents)+
  '. A obrigação financeira ainda não existe: trata-se de um título planejado.</p>'+
  '<h4>Uso estimado de provisões</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Provisão</th><th>Baixa prevista</th><th>Centro de custo</th></tr></thead><tbody>'+
  (uses||'<tr><td colspan="3">Sem baixa planejada.</td></tr>')+'</tbody></table></div>'+
  '<h4>Diário 1 — provisões</h4>'+lines(p.provision_journal_lines)+
  '<p class="help">Débitos: '+moneyfmt(p.provision_totals?.debit_cents)+
  ' / Créditos: '+moneyfmt(p.provision_totals?.credit_cents)+'</p>'+
  '<h4>Diário 2 — liquidação e retenções</h4>'+lines(p.settlement_journal_lines)+
  '<p class="help">Débitos: '+moneyfmt(p.settlement_totals?.debit_cents)+
  ' / Créditos: '+moneyfmt(p.settlement_totals?.credit_cents)+'</p>'+
  '<h4>Pendências da integração</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Código</th><th>Descrição</th></tr></thead><tbody>'+
  (blocks||'<tr><td colspan="2">Sem divergências nesta minuta; ainda não liberada a efetivação.</td></tr>')+
  '</tbody></table></div>'+
  '<p class="help"><b>Importante:</b> o SAGAS ainda não contabiliza ou gera títulos desta rescisão. O plano não substitui TRCT aprovado, guia FGTS ou revisão das incidências.</p>'+
  '<div class="form-actions">'+
  '<button type="button" class="btn secondary" id="pterm119Setup">Configurar naturezas</button>'+
  '<button type="button" class="btn secondary" id="pterm119Refresh">Atualizar prévia</button>'+
  '<button type="button" class="btn secondary" id="pterm119History">Histórico</button>'+
  '<button type="button" class="btn primary" id="pterm122Open">Fechamento definitivo (pedido de demissão)</button>'+
  (can('payroll.manage')?'<button type="button" class="btn primary" id="pterm119Record">Registrar minuta DRAFT</button>':'')+
  '</div>',true);
 document.getElementById('pterm119Setup').onclick=()=>payrollTermination119Settings(p).catch(e=>toast(e.message,'error'));
 document.getElementById('pterm119Refresh').onclick=()=>payrollTermination119Open(p).catch(e=>toast(e.message,'error'));
 document.getElementById('pterm119History').onclick=()=>payrollTermination119History(p.employee.id,p.employee.name).catch(e=>toast(e.message,'error'));
 document.getElementById('pterm122Open').onclick=()=>payrollTermination122Open(p).catch(e=>toast(e.message,'error'));
 const record=document.getElementById('pterm119Record');
 if(record)record.onclick=async()=>{
  record.disabled=true;
  try{
   const r=await api('/api/payroll/termination/integration-plans',{method:'POST',body:{
    ...pterm119Req(p),source_fingerprint:p.source_fingerprint,confirmation:'REGISTRAR PLANO RESCISAO'
   }});
   toast(r.reused?'Minuta já registrada.':'Minuta DRAFT registrada sem gerar diário ou financeiro.');
   await payrollTermination119Open(p);
  }catch(e){toast(e.message,'error');record.disabled=false}
 };
}
async function payrollTermination119History(employeeId,name){
 const r=await api('/api/payroll/termination/integration-plans?employee_id='+encodeURIComponent(employeeId));
 const runs=r.runs||[];
 const rows=runs.map((v,i)=>'<tr><td>'+esc(v.termination_date)+'</td><td>'+esc(v.kind)+
  '</td><td>'+esc(v.revision)+'</td><td>DRAFT</td><td>'+
  '<button type="button" class="btn secondary sm" data-pterm119-h="'+i+'">Abrir</button></td></tr>').join('');
 openModal('Histórico de minutas de integração — '+esc(name),
  'Fotografias auditáveis, sem diário ou título gerado.',
  '<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Modalidade</th>'+
  '<th>Revisão</th><th>Status</th><th></th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="5">Nenhuma minuta registrada.</td></tr>')+
  '</tbody></table></div>',true);
 $$('[data-pterm119-h]').forEach(btn=>btn.onclick=async()=>{
  try{
   const v=runs[Number(btn.dataset.pterm119H)];
   const d=await api('/api/payroll/termination/integration-plans/'+encodeURIComponent(v.id));
   payrollTermination119Show(d.snapshot);
  }catch(e){toast(e.message,'error')}
 });
}
