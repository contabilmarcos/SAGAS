// SAGAS v116 — conciliação documentada de descontos, sem pagar ou contabilizar.
const pterm116Fields=[
 ['inss_salary_cents','INSS sobre parcelas salariais (R$)'],
 ['inss_thirteenth_cents','INSS sobre 13º (R$)'],
 ['irrf_salary_cents','IRRF sobre parcelas salariais (R$)'],
 ['irrf_thirteenth_cents','IRRF exclusivo de 13º (R$)'],
 ['thirteenth_advance_cents','Adiantamento de 13º já pago (R$)'],
 ['notice_deduction_cents','Aviso prévio descontado no pedido de demissão (R$)'],
 ['other_deductions_cents','Outros descontos documentados (R$)']
];
function pterm116Req(p){return pterm115Req(p)}
async function payrollTermination116Open(base){
 const p=await api('/api/payroll/termination/net-reconciliation',{method:'POST',body:pterm116Req(base)});
 if(!p.documentary_ready){
  toast('Concilie os documentos do bruto antes dos descontos.','error');
  return payrollTermination115Show(p);
 }
 const values=p.deduction_documentation||{};
 const fields=pterm116Fields.filter(x=>p.termination_kind==='RESIGNATION'||x[0]!=='notice_deduction_cents');
 const rows=fields.map(([key,label])=>
  '<label class="field"><span>'+esc(label)+'</span><input type="text" inputmode="decimal" name="'+key+
  '" required value="'+pterm115InputMoney(values[key]||0)+'"></label>').join('');
 openModal('Rescisão — descontos e líquido referencial',
  'Registre descontos conferidos em demonstrativos; não se trata de apuração automática de tributos.',
  '<p class="help"><b>Funcionário:</b> '+esc(p.employee.code||'—')+' — '+esc(p.employee.name)+
  ' · <b>Data:</b> '+esc(p.termination_date)+
  ' · <b>Bruto documental:</b> '+pterm114Money(p.full_gross_reference_cents)+
  '</p><form id="pterm116Form" class="grid">'+rows+
  '<label class="field full"><span>Referência dos documentos que comprovam INSS, IRRF, adiantamentos e descontos</span>'+
  '<input name="proof_reference" maxlength="240" required value="'+esc(values.proof_reference||'')+'"></label>'+
  '<label class="field full"><span>Observações</span><textarea name="notes" maxlength="500" rows="2">'+esc(values.notes||'')+'</textarea></label>'+
  '<p class="help">Informe 0,00 apenas quando o valor for efetivamente zero e houver conferência. A multa FGTS fica fora do líquido. Esta etapa não realiza pagamentos, contabilização nem desligamento do funcionário.</p>'+
  '<label class="field full"><span>Digite CONFIRMAR DESCONTOS RESCISAO</span>'+
  '<input name="confirmation" autocomplete="off" required></label>'+
  '<div class="form-actions"><button class="btn secondary" type="button" id="pterm116Back">Voltar</button>'+
  '<button class="btn primary" type="submit">Salvar descontos documentados</button></div></form>',true);
 document.getElementById('pterm116Back').onclick=()=>payrollTermination115Show(p);
 const form=document.getElementById('pterm116Form');
 form.onsubmit=async e=>{
  e.preventDefault();const btn=form.querySelector('[type="submit"]');btn.disabled=true;
  try{
   const v=Object.fromEntries(new FormData(form));
   const deductions={};
   for(const [key] of pterm116Fields)
    deductions[key]=v[key]==null?0:pterm115Number(v[key]);
   const payload={...pterm116Req(p),...deductions,
    proof_reference:v.proof_reference,notes:v.notes,confirmation:v.confirmation,
    base_source_fingerprint:p.base_source_fingerprint};
   await api('/api/payroll/termination/deductions',{method:'POST',body:payload});
   const next=await api('/api/payroll/termination/net-reconciliation',{method:'POST',body:pterm116Req(p)});
   toast('Descontos documentados registrados, sem geração financeira.');
   payrollTermination116Show(next);
  }catch(err){toast(err.message,'error');btn.disabled=false}
 };
}
function payrollTermination116Show(p){
 const doc=p.deduction_documentation||{},fields=pterm116Fields.filter(x=>p.termination_kind==='RESIGNATION'||x[0]!=='notice_deduction_cents');
 const rows=[
  ['Total bruto documental',p.full_gross_reference_cents],
  ...fields.map(([key,label])=>[label,doc[key]??null]),
  ['Total dos descontos',p.deductions_total_cents],
  ['Líquido de referência (não aprovado)',p.net_reference_cents],
  ['Multa do FGTS (separada do líquido)',p.fgts_fine_reference_cents]
 ].map(([label,value])=>'<tr><td>'+esc(label)+'</td><td>'+pterm114Money(value)+'</td></tr>').join('');
 const issues=(p.problems||[]).concat(p.documentary_issues||[],p.deduction_issues||[])
 .map(x=>'<tr><td>'+esc(x.code)+'</td><td>'+esc(x.message)+'</td></tr>').join('');
 openModal('Rescisão — memória do líquido',
  'Prévia documental: NÃO aprova a rescisão nem cria título ou lançamento.',
  '<p class="help"><b>Funcionário:</b> '+esc(p.employee.code||'—')+' — '+esc(p.employee.name)+
  ' · <b>Desligamento previsto:</b> '+esc(p.termination_date)+'</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Composição</th><th>Valor</th></tr></thead><tbody>'+
  rows+'</tbody></table></div>'+
  '<p class="help"><b>Comprovante:</b> '+esc(doc.proof_reference||'não atestado')+'</p>'+
  '<h4>Pendências para fechamento definitivo</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Código</th><th>Descrição</th></tr></thead><tbody>'+
  (issues||'<tr><td colspan="2">Sem pendências adicionais detectadas nesta conferência.</td></tr>')+
  '</tbody></table></div>'+
  (p.warnings||[]).map(s=>'<p class="help">'+esc(s)+'</p>').join('')+
  '<div class="form-actions"><button id="pterm116Edit" class="btn secondary" type="button">Editar descontos</button>'+
  '<button id="pterm116History" class="btn secondary" type="button">Histórico</button>'+
  (p.deduction_ready&&can('payroll.manage')?
    '<button id="pterm116Record" class="btn primary" type="button">Registrar memória DRAFT</button>':'')+
  '</div>',true);
 document.getElementById('pterm116Edit').onclick=()=>payrollTermination116Open(p).catch(e=>toast(e.message,'error'));
 document.getElementById('pterm116History').onclick=()=>payrollTermination116History(p.employee.id,p.employee.name).catch(e=>toast(e.message,'error'));
 const record=document.getElementById('pterm116Record');
 if(record)record.onclick=async()=>{
  record.disabled=true;
  try{
   const r=await api('/api/payroll/termination/net-workpapers',{method:'POST',body:{
    ...pterm116Req(p),source_fingerprint:p.source_fingerprint,confirmation:'REGISTRAR MEMORIA LIQUIDO'
   }});
   toast(r.reused?'Memória já registrada.':'Memória DRAFT registrada; nenhuma baixa financeira gerada.');
   payrollTermination116Show(p);
  }catch(e){toast(e.message,'error');record.disabled=false}
 };
}
async function payrollTermination116History(employeeId,name){
 const r=await api('/api/payroll/termination/net-workpapers?employee_id='+encodeURIComponent(employeeId));
 const runs=r.runs||[];
 const rows=runs.map((x,i)=>'<tr><td>'+esc(x.termination_date)+'</td><td>'+
  esc(x.kind)+'</td><td>'+esc(x.revision)+'</td><td>DRAFT</td><td>'+
  '<button class="btn secondary sm" data-pterm116-detail="'+i+'">Conferir</button></td></tr>').join('');
 openModal('Histórico de líquido de referência — '+esc(name),
  'Memórias versionadas; nenhuma é pagamento ou TRCT concluído.',
  '<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Modalidade</th><th>Revisão</th><th>Status</th><th>Ação</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="5">Nenhuma memória registrada.</td></tr>')+
  '</tbody></table></div>',true);
 $$('[data-pterm116-detail]').forEach(btn=>btn.onclick=async()=>{
  try{
   const row=runs[Number(btn.dataset.pterm116Detail)];
   const d=await api('/api/payroll/termination/net-workpapers/'+encodeURIComponent(row.id));
   payrollTermination116Show(d.snapshot);
  }catch(e){toast(e.message,'error')}
 });
}
