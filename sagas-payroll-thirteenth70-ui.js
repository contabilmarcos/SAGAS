// SAGAS folha v109 — consulta modal de 13o (primeira e segunda parcelas).
// Adiantamentos declarados sao externos: nao criam deposito, financeiro ou diario.
async function payrollThirteenth70Open(year,phase){
 const selectedYear=String(year||new Date().getFullYear());
 const selectedPhase=phase==='SECOND'?'SECOND':'FIRST';
 const d=await api('/api/payroll/thirteenth/preview?year='+encodeURIComponent(selectedYear)+'&phase='+selectedPhase);
 const fmt=x=>money(Number(x||0)/100);
 const warn=(d.problems||[]).map(p=>'<p class="help">'+esc(p.message)+'</p>').join('');
 const lines=(d.items||[]).map((r,i)=>{
  const v=r.calculation||{};
  const problems=(r.blockers||[]).map(p=>'<li>'+esc(p)+'</li>').join('');
  const canDeclare=selectedPhase==='FIRST'&&r.ready&&!r.advance&&can('payroll.manage')&&v.estimated_advance_cents>0;
  const buttons=(canDeclare?'<button class="btn primary sm" type="button" data-13-declare="'+i+'">Declarar adiantamento</button>':'')+
    (r.advance&&selectedPhase==='FIRST'&&can('payroll.manage')?'<button class="btn secondary sm" type="button" data-13-void="'+i+'">Desvincular</button>':'');
  const amount=selectedPhase==='FIRST'?v.estimated_advance_cents:v.net_cents;
  return '<tr><td><b>'+esc(r.employee_code||'—')+' — '+esc(r.employee_name)+'</b>'+
   '<div class="help">CC '+esc(r.cost_center_code||'—')+' · '+esc(r.avos??'—')+'/12 avos</div></td>'+
   '<td>'+fmt(r.reference_salary_cents)+'</td>'+
   '<td>'+fmt(v.gross_cents)+'</td><td>'+fmt(r.advance?.amount_cents||v.estimated_advance_cents)+'</td>'+
   '<td>'+fmt(v.inss_cents)+'</td><td>'+fmt(v.irrf_cents)+'</td>'+
   '<td><b>'+fmt(amount)+'</b></td>'+
   '<td>'+(problems?'<ul class="help">'+problems+'</ul>':r.advance?
    '<span class="help">Adiantamento documental: '+esc(r.advance.document_ref)+'</span>':
    '<span class="help">Prévia disponível, sem pagamento gerado.</span>')+
   (buttons?'<div class="toolbar">'+buttons+'</div>':'')+'</td></tr>';
 }).join('');
 const t=d.totals||{};
 openModal('13º salário — '+esc(selectedYear),
  'Processamento separado da folha mensal: '+(selectedPhase==='FIRST'?'primeira parcela':'segunda parcela')+'.',
  '<div class="toolbar"><label class="field"><span>Ano</span><input type="number" id="p13Year" min="2020" max="2026" step="1" value="'+esc(selectedYear)+'"></label>'+
  '<label class="field"><span>Parcela</span><select id="p13Phase"><option value="FIRST"'+(selectedPhase==='FIRST'?' selected':'')+'>1ª parcela</option>'+
  '<option value="SECOND"'+(selectedPhase==='SECOND'?' selected':'')+'>2ª parcela</option></select></label>'+
  '<button class="btn secondary" type="button" id="p13Refresh">Consultar</button></div>'+
  '<p class="help"><b>Consulta sem integração financeira.</b> Valores calculados com a base contratual histórica, '+
  'avos elegíveis e pendências identificadas. Pagamento e guias dependem de conciliação específica.</p>'+
  (warn?warn:'')+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário e CC</th><th>Salário</th><th>13º bruto</th>'+
  '<th>1ª parcela</th><th>INSS</th><th>IRRF</th><th>'+(selectedPhase==='FIRST'?'Adiantamento previsto':'Líquido 2ª')+'</th>'+
  '<th>Conferência</th></tr></thead><tbody>'+lines+'</tbody></table></div>'+
  '<p class="help"><b>Funcionários:</b> '+esc(t.employees||0)+' · <b>Sem pendências detectadas:</b> '+
  esc(t.ready||0)+' · <b>Requerem conferência:</b> '+esc(t.blocked||0)+'</p>'+
  '<p class="help"><b>13º bruto:</b> '+fmt(t.gross_cents)+' · <b>Adiantamentos:</b> '+
  fmt(selectedPhase==='FIRST'?t.estimated_advance_cents:t.advance_cents)+
  ' · <b>INSS:</b> '+fmt(t.inss_cents)+' · <b>IRRF:</b> '+fmt(t.irrf_cents)+
  ' · <b>FGTS da parcela (referência):</b> '+fmt(t.fgts_cents)+
  ' · <b>Líquido da etapa:</b> '+fmt(t.net_cents)+'</p>'+
  (d.warnings||[]).map(w=>'<p class="help">'+esc(w)+'</p>').join('')+
  '<div class="form-actions"><button type="button" class="btn secondary" id="p13Close">Fechar</button></div>',true);
 document.getElementById('p13Close').onclick=closeModal;
 document.getElementById('p13Refresh').onclick=()=>payrollThirteenth70Open(
  document.getElementById('p13Year').value,document.getElementById('p13Phase').value).catch(e=>toast(e.message,'error'));
 $$('[data-13-declare]').forEach(button=>button.onclick=()=>{
  const row=d.items[Number(button.dataset['13Declare'])];
  if(row)payrollThirteenth70Declare(d,row);
 });
 $$('[data-13-void]').forEach(button=>button.onclick=()=>{
  const row=d.items[Number(button.dataset['13Void'])];
  if(row?.advance)payrollThirteenth70Void(d,row);
 });
}
function payrollThirteenth70Declare(preview,item){
 const sum=item.calculation?.estimated_advance_cents||0;
 openModal('Declarar adiantamento do 13º — '+esc(item.employee_name),
  'Apenas comprovante de pagamento externo. Não gera financeiro nem movimentação bancária.',
  '<p class="help"><b>Adiantamento de referência:</b> '+money(sum/100)+' · '+
  esc(item.avos)+' avos · Centro de custo '+esc(item.cost_center_code||'—')+'</p>'+
  '<form id="p13Form"><div class="grid">'+
  '<label class="field"><span>Data do pagamento realizado</span><input name="payment_date" type="date" required></label>'+
  '<label class="field"><span>Documento / comprovante</span><input name="document_ref" type="text" minlength="8" maxlength="160" required></label>'+
  '<label class="field full"><span>Justificativa e conferência</span><textarea name="notes" minlength="15" maxlength="500" rows="3" required></textarea></label>'+
  '<label class="field full"><span>Digite REGISTRAR ADIANTAMENTO 13 para confirmar</span>'+
  '<input name="confirmation" type="text" autocomplete="off" required></label></div>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="p13Back">Voltar</button>'+
  '<button type="submit" class="btn primary">Registrar documento</button></div></form>',true);
 document.getElementById('p13Back').onclick=()=>payrollThirteenth70Open(preview.year,'FIRST').catch(e=>toast(e.message,'error'));
 const form=document.getElementById('p13Form');
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const body={...Object.fromEntries(new FormData(form)),
    year:preview.year,employee_id:item.employee_id,amount_cents:sum,
    source_fingerprint:preview.source_fingerprint};
   const result=await api('/api/payroll/thirteenth/advances',{method:'POST',body});
   toast(result.declared?'Adiantamento documental registrado.':'Nenhuma alteração.');
   await payrollThirteenth70Open(preview.year,'FIRST');
  }catch(e){button.disabled=false;toast(e.message,'error');}
 };
}
function payrollThirteenth70Void(preview,item){
 openModal('Desvincular adiantamento — '+esc(item.employee_name),
 'Retira somente o vínculo documental, sem estornar valores bancários nem lançamentos.',
 '<form id="p13VoidForm"><label class="field"><span>Motivo (15 a 500 caracteres)</span><textarea name="notes" minlength="15" maxlength="500" required></textarea></label>'+
 '<label class="field"><span>Digite DESVINCULAR ADIANTAMENTO 13</span><input name="confirmation" required></label>'+
 '<div class="form-actions"><button class="btn secondary" type="button" id="p13VoidBack">Cancelar</button>'+
 '<button class="btn primary" type="submit">Desvincular</button></div></form>',true);
 document.getElementById('p13VoidBack').onclick=()=>payrollThirteenth70Open(preview.year,'FIRST').catch(e=>toast(e.message,'error'));
 const form=document.getElementById('p13VoidForm');
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   await api('/api/payroll/thirteenth/advances/void',{method:'POST',body:{
    id:item.advance.id,...Object.fromEntries(new FormData(form))
   }});
   toast('Documento desvinculado; confira qualquer movimento externo.');
   await payrollThirteenth70Open(preview.year,'FIRST');
  }catch(e){button.disabled=false;toast(e.message,'error')}
 };
}