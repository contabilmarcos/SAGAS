// SAGAS Folha 47: histórico salarial durante a competência (comportamento RM).
async function payrollSalary47Open(selected){
 const today=new Date(),fallback=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
 const periods=await api('/api/payroll/competences');
 const selectedPeriod=(periods.items||[]).find(x=>x.id===window.sagasPayrollCompetence);
 const month=selected||selectedPeriod?.competence||fallback;
 const data=await api('/api/payroll/salary-change-settings?competence='+encodeURIComponent(month));
 const s=data.settings||{},editable=can('payroll.manage');
 const history=(data.history||[]).map(x=>'<tr><td>'+esc(x.effective_from)+'</td><td>'+esc(x.revision)+
   '</td><td>'+esc(data.modes[x.mode]||x.mode)+'</td></tr>').join('');
 openModal('Alteração salarial dentro do mês',
  'Parâmetros de cálculo por empresa e vigência, no padrão do TOTVS RM.',
  '<p class="help"><b>Padrão do RM:</b> o salário do início da competência é considerado na folha mensal, e o reajuste passa a compor o cálculo mensal na competência seguinte. A proporcionalização no mesmo mês exige fórmula ou ajuste específico.</p>'+
  '<div class="toolbar"><label class="field"><span>Consultar competência</span><input type="month" id="sagasSalary47Month" value="'+esc(month)+'"></label>'+
   '<button type="button" class="btn secondary" id="sagasSalary47Query">Consultar</button></div>'+
  '<p class="help"><b>Método vigente:</b> '+esc(data.modes[data.mode]||data.mode)+
    (s.effective_from?' (desde '+esc(s.effective_from)+', revisão '+esc(s.revision)+')':' (padrão, sem cadastro)')+'</p>'+
  (editable?'<form id="sagasSalary47Form"><div class="grid">'+
    '<label class="field"><span>Vigência inicial</span><input type="month" name="effective_from" value="'+esc(month)+'" required></label>'+
    '<label class="field"><span>Método de cálculo</span><select name="mode" required>'+
      '<option value="RM_NEXT_MONTH" '+(data.mode==='RM_NEXT_MONTH'?'selected':'')+'>Padrão RM — salário inicial; reajuste no mês seguinte</option>'+
      '<option value="PRORATE_CALENDAR" '+(data.mode==='PRORATE_CALENDAR'?'selected':'')+'>Proporcional no mês — dias reais por vigência</option>'+
    '</select></label>'+
    '<label class="field full"><span>Observações / orientação do DP</span><textarea rows="2" name="notes" maxlength="450">'+esc(s.notes||'')+'</textarea></label>'+
    '</div><div class="form-actions"><button type="submit" class="btn primary">Salvar nova versão</button></div></form>':
    '<p class="help">Para alterar este parâmetro, é necessária a permissão de gerenciamento da folha.</p>')+
  '<h4>Histórico de parâmetros</h4><div class="table-wrap"><table class="table"><thead><tr><th>Vigência</th><th>Versão</th><th>Método</th></tr></thead><tbody>'+
  (history||'<tr><td colspan="3">Sem configurações registradas (vale o padrão RM).</td></tr>')+'</tbody></table></div>'+
  '<p class="help">A proporcionalização utiliza o histórico salarial e os dias reais de cada faixa. Admissão e reajuste no mesmo mês exigem admissão por calendário. Eventos com fórmulas salariais, mudanças de jornada e ocorrências continuam bloqueados até revisão específica. Competências já fechadas não serão recalculadas.</p>',true);
 document.getElementById('sagasSalary47Query').onclick=()=>payrollSalary47Open(document.getElementById('sagasSalary47Month').value).catch(e=>toast(e.message,'error'));
 const form=document.getElementById('sagasSalary47Form');
 if(form)form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const body=Object.fromEntries(new FormData(form));
   await api('/api/payroll/salary-change-settings',{method:'POST',body});
   toast('Parâmetro salarial salvo com nova versão.');
   await payrollSalary47Open(body.effective_from);
  }catch(err){toast(err.message,'error');button.disabled=false;}
 };
}
