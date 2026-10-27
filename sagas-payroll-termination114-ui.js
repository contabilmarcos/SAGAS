// SAGAS v114 — rescisão CLT: prévia não conclusiva, fotografia DRAFT e pendências.
function pterm114Money(value){return value==null?'Não apurado':money(Number(value)/100)}
async function payrollTermination114Open(){
 const resp=await api('/api/payroll/employees');
 const employees=(resp.items||[]).filter(x=>x.id).sort((a,b)=>a.name.localeCompare(b.name));
 const options=employees.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.employee_code||'—')+' — '+
  esc(x.name)+'</option>').join('');
 openModal('Rescisão contratual — cálculo preliminar',
  'Conferência das verbas rescisórias e documentação. Nenhum desligamento é realizado nesta tela.',
  '<p class="help">Esta etapa cobre pedido de demissão e dispensa sem justa causa como cenários preliminares. Férias vencidas, médias, FGTS e tributos precisam de reconciliação antes de uma rescisão definitiva.</p>'+
  '<form id="termination114Form" class="grid">'+
  '<label class="field"><span>Funcionário</span><select name="employee_id" required><option value="">Selecione</option>'+
  options+'</select></label>'+
  '<label class="field"><span>Data de desligamento</span><input type="date" name="termination_date" required></label>'+
  '<label class="field"><span>Tipo</span><select name="kind" required>'+
  '<option value="WITHOUT_CAUSE">Dispensa sem justa causa</option>'+
  '<option value="RESIGNATION">Pedido de demissão</option></select></label>'+
  '<label class="field"><span>Aviso prévio</span><select name="notice_kind" required>'+
  '<option value="INDEMNIFIED">Indenizado pelo empregador</option>'+
  '<option value="WORKED">Trabalhado</option>'+
  '<option value="WAIVED">Dispensado (verificar documentação)</option></select></label>'+
  '<div class="form-actions"><button type="submit" class="btn primary">Calcular prévia</button>'+
  '<button type="button" class="btn secondary" id="term114Audit124">Auditar D1 da folha</button>'+ 
  '<button type="button" class="btn secondary" id="term114Cancel">Fechar</button></div></form>',true);
 const form=document.getElementById('termination114Form');
 document.getElementById('term114Cancel').onclick=closeModal;
 document.getElementById('term114Audit124').onclick=()=>payrollLiveAudit124Open().catch(e=>toast(e.message,'error'));

 function syncNotice(){
  const select=form.elements.notice_kind,resignation=form.elements.kind.value==='RESIGNATION';
  [...select.options].forEach(option=>{
   option.disabled=resignation?option.value==='INDEMNIFIED':option.value==='WAIVED';
  });
  if(select.selectedOptions[0]?.disabled)select.value='WORKED';
 }
 form.elements.kind.onchange=syncNotice;
 syncNotice();
 form.onsubmit=async ev=>{
  ev.preventDefault();
  const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const request=Object.fromEntries(new FormData(form));
   const preview=await api('/api/payroll/termination/preview',{method:'POST',body:request});
   payrollTermination114Show(preview);
  }catch(e){toast(e.message,'error');button.disabled=false}
 };
}
function payrollTermination114Show(p){
 const a=p.amounts||{},fmt=pterm114Money;
 const rows=[
  ['Saldo de salário ('+(a.salary_balance_days??'—')+' dias)',a.salary_balance_cents],
  ['13º proporcional ('+(a.thirteenth_avos??'—')+'/12)',a.thirteenth_cents],
  ['13º proporcional do aviso',a.thirteenth_notice_projection_cents],
  ['Férias proporcionais ('+(a.vacation_proportional_avos??'—')+'/12)',a.vacation_proportional_cents],
  ['Terço de férias proporcionais',a.vacation_third_cents],
  ['Aviso prévio indenizado',a.notice_indemnity_cents],
  ['Total bruto provisório (incompleto)',a.provisional_gross_cents],
  ['Férias adquiridas/vencidas',a.vacation_accrued_unpaid_cents],
  ['Multa e regularizações do FGTS',a.fgts_fine_cents],
  ['Líquido da rescisão',a.net_cents]
 ].map(([title,value])=>'<tr><td>'+esc(title)+'</td><td>'+fmt(value)+'</td></tr>').join('');
 const issues=(p.problems||[]).map(x=>'<tr><td>'+esc(x.code)+'</td><td>'+esc(x.message)+'</td></tr>').join('');
 const warning=(p.warnings||[]).map(x=>'<p class="help">'+esc(x)+'</p>').join('');
 openModal('Rescisão — '+esc(p.employee.code||'—')+' '+esc(p.employee.name),
  esc(p.termination_type_name)+' · '+esc(p.termination_date)+' · Centro de custo '+esc(p.employee.cost_center_code||'—'),
  '<p class="help"><b>Somente prévia.</b> O líquido não é apurado e nenhum título ou lançamento é criado. '+
  'Projeção contratual: '+esc(p.projected_date)+'.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Verba</th><th>Referência</th></tr></thead><tbody>'+
  rows+'</tbody></table></div>'+
  '<h4>Pendências para a rescisão definitiva ('+esc((p.problems||[]).length)+')</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Código</th><th>Conferência necessária</th></tr></thead><tbody>'+
  issues+'</tbody></table></div>'+warning+
  '<div class="form-actions">'+
  '<button type="button" class="btn secondary" id="term114Back">Alterar simulação</button>'+
  '<button type="button" class="btn secondary" id="term114History">Histórico preliminar</button>'+
  '<button type="button" class="btn secondary" id="term115Documents">Conferir documentos e bases</button>'+
  (can('payroll.manage')?'<button type="button" class="btn primary" id="term114Save">Registrar prévia DRAFT</button>':'')+
  '</div>',true);
 document.getElementById('term114Back').onclick=()=>payrollTermination114Open().catch(e=>toast(e.message,'error'));
 document.getElementById('term114History').onclick=()=>payrollTermination114History(p.employee.id,p.employee.name).catch(e=>toast(e.message,'error'));
 document.getElementById('term115Documents').onclick=()=>payrollTermination115Open(p).catch(e=>toast(e.message,'error'));
 if(document.getElementById('term114Save'))document.getElementById('term114Save').onclick=async()=>{
  const button=document.getElementById('term114Save');button.disabled=true;
  try{
   const data=await api('/api/payroll/termination/drafts',{method:'POST',body:{
    employee_id:p.employee.id,termination_date:p.termination_date,
    kind:p.termination_kind,notice_kind:p.notice_kind,
    source_fingerprint:p.source_fingerprint,
    confirmation:'REGISTRAR PREVIA RESCISAO'
   }});
   toast(data.reused?'Prévia já registrada.':'Prévia de rescisão registrada somente como DRAFT.');
   await payrollTermination114History(p.employee.id,p.employee.name);
  }catch(e){toast(e.message,'error');button.disabled=false}
 };
}
async function payrollTermination114History(employeeId,name){
 const d=await api('/api/payroll/termination/drafts?employee_id='+encodeURIComponent(employeeId));
 const rows=(d.runs||[]).map((x,i)=>'<tr><td>'+esc(x.termination_date)+'</td>'+
  '<td>'+esc(x.kind)+'</td><td>'+esc(x.revision)+'</td><td>DRAFT</td>'+
  '<td><button class="btn secondary sm" type="button" data-term114-detail="'+i+'">Conferir</button></td></tr>').join('');
 openModal('Prévia de rescisão — '+esc(name),
  'Registro DRAFT sem aprovação, desligamento funcional, diário ou financeiro.',
  '<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Tipo</th><th>Revisão</th><th>Estado</th><th>Ação</th></tr></thead><tbody>'+
  rows+'</tbody></table></div>'+
  '<div class="form-actions"><button class="btn secondary" id="term114New">Nova simulação</button></div>',true);
 document.getElementById('term114New').onclick=()=>payrollTermination114Open().catch(e=>toast(e.message,'error'));
 $$('[data-term114-detail]').forEach(button=>button.onclick=async()=>{
  try{
   const e=(d.runs||[])[Number(button.dataset.term114Detail)];
   if(!e)return;
   const detail=await api('/api/payroll/termination/drafts/'+encodeURIComponent(e.id));
   payrollTermination114Show(detail.snapshot);
  }catch(e){toast(e.message,'error')}
 });
}