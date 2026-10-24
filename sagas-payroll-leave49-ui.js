// SAGAS Folha 49 — classificação de licenças/afastamentos (modal).
async function payrollLeave49Open(period){
 const periods=await api('/api/payroll/competences');
 const selected=(periods.items||[]).find(x=>x.id===window.sagasPayrollCompetence);
 const today=new Date(),month=period||selected?.competence||today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
 const data=await api('/api/payroll/leaves?competence='+encodeURIComponent(month));
 const treatmentNames=data.treatments||{};
 const rows=(data.items||[]).map(x=>'<tr><td>'+esc(x.employee_number==null?'—':String(x.employee_number).padStart(5,'0'))+' — '+esc(x.employee_name)+'</td>'+
  '<td>'+esc(x.kind)+'</td><td>'+esc(x.start_date)+' a '+esc(x.end_date)+'</td>'+
  '<td>'+(x.kind==='FERIAS'?'Prévia disponível — apuração pendente':esc(treatmentNames[x.treatment]||'Pendente de classificação'))+'</td>'+
  '<td>'+(x.kind==='FERIAS'?'<button class="btn secondary sm" type="button" data-vacation49="'+esc(x.id)+'">Prévia de férias</button>':
  '<button class="btn secondary sm" type="button" data-leave49="'+esc(x.id)+'">Classificar</button>')+'</td></tr>').join('');
 openModal('Afastamentos e licenças',
  'Classificação por ocorrência e impacto no cálculo mensal.',
  '<div class="toolbar"><label class="field"><span>Competência</span><input id="leave49Month" type="month" value="'+esc(month)+'"></label>'+
  '<button class="btn secondary" id="leave49Search" type="button">Consultar</button></div>'+
  '<p class="help">Cadastre a ocorrência no histórico do funcionário (tipo Licença ou Afastamento). Esta tela define o tratamento da ocorrência; não substitui documentos ou conferência do DP.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Ocorrência</th><th>Período</th><th>Tratamento</th><th>Ação</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="5">Nenhuma licença ou afastamento cadastrado para esta competência.</td></tr>')+'</tbody></table></div>'+
  '<p class="help">Liberação inicial: licença remunerada (sem desconto), licença sem remuneração (desconto por divisor selecionado) e doença de até 15 dias sob responsabilidade da empresa. Benefício previdenciário, acidente, maternidade e férias ainda exigem seus processos próprios.</p>',true);
 $('#leave49Search').onclick=()=>payrollLeave49Open($('#leave49Month').value).catch(e=>toast(e.message,'error'));
 $$('[data-vacation49]').forEach(btn=>{
  btn.onclick=()=>payrollVacation49Preview(month,(data.items||[]).find(x=>x.id===btn.dataset.vacation49)).catch(e=>toast(e.message,'error'));
 });
 $$('[data-leave49]').forEach(btn=>{
  btn.disabled=!can('payroll.manage');
  btn.onclick=()=>payrollLeave49Classify(month,(data.items||[]).find(x=>x.id===btn.dataset.leave49),data.treatments||{},data.modes||{});
 });
}
function payrollLeave49Classify(month,occ,treatments,modes){
 if(!occ)return;
 const choices=occ.kind==='LICENCA'?['PAID','UNPAID']:
  ['SICK_EMPLOYER_15','INSS','MATERNITY','WORK_ACCIDENT','OTHER'];
 const options=choices.map(value=>'<option value="'+esc(value)+'" '+(occ.treatment===value?'selected':'')+'>'+esc(treatments[value]||value)+'</option>').join('');
 openModal('Classificar '+(occ.kind==='LICENCA'?'licença':'afastamento'),
  esc(occ.employee_name)+' — '+esc(occ.start_date)+' até '+esc(occ.end_date),
  '<form id="leave49Form"><div class="grid">'+
  '<label class="field full"><span>Tratamento</span><select name="treatment" id="leave49Treatment" required>'+options+'</select></label>'+
  '<label class="field" id="leave49DivisorWrap" style="display:none"><span>Divisor da licença sem remuneração</span><select name="proration_mode">'+
  '<option value="CALENDAR" '+(occ.proration_mode==='CALENDAR'?'selected':'')+'>Dias efetivos do mês</option>'+
  '<option value="COMMERCIAL_30" '+(occ.proration_mode==='COMMERCIAL_30'?'selected':'')+'>Mês comercial de 30 dias</option></select></label>'+
  '<label class="field" id="leave49ConfirmWrap" style="display:none"><span>Confirme digitando PRIMEIROS 15 DIAS</span><input name="confirmation" autocomplete="off"></label>'+
  '<label class="field full"><span>Documento/justificativa do DP</span><textarea name="notes" maxlength="500" required rows="3">'+esc(occ.decision_notes||'')+'</textarea></label>'+
  '</div><p class="help">Sem cálculo automático de INSS, salário-maternidade e acidente de trabalho além dos casos expressamente suportados. Classificar não reabre uma folha fechada.</p>'+
  '<div class="form-actions"><button class="btn secondary" id="leave49Cancel" type="button">Cancelar</button><button class="btn primary" type="submit">Salvar classificação</button></div></form>',true);
 const form=$('#leave49Form');
 const toggle=()=>{
  const kind=form.elements.treatment.value;
  $('#leave49DivisorWrap').style.display=kind==='UNPAID'?'':'none';
  $('#leave49ConfirmWrap').style.display=kind==='SICK_EMPLOYER_15'?'':'none';
  form.elements.confirmation.required=kind==='SICK_EMPLOYER_15';
 };
 $('#leave49Cancel').onclick=()=>payrollLeave49Open(month).catch(e=>toast(e.message,'error'));
 form.elements.treatment.onchange=toggle;toggle();
 form.onsubmit=async event=>{
  event.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
   const body={occurrence_id:occ.id,...Object.fromEntries(new FormData(form))};
   await api('/api/payroll/leaves',{method:'POST',body});
   toast('Classificação registrada no histórico de afastamento.');
   await payrollLeave49Open(month);
  }catch(e){toast(e.message,'error');btn.disabled=false;}
 };
}

 // Etapa 50 (v87): prévia de férias, consulta somente leitura.
async function payrollVacation49Preview(month,occ){
 if(!occ)return;
 const data=await api('/api/payroll/leaves?view=vacation&id='+encodeURIComponent(occ.id));
 const money=cents=>(Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const warnings=(data.warnings||[]).map(x=>'<li>'+esc(x)+'</li>').join('');
 openModal('Prévia de férias — sem processamento',
  esc(data.employee?.name||occ.employee_name)+' | '+esc(data.start_date)+' até '+esc(data.end_date),
  '<p class="help"><b>Somente simulação bruta.</b> Não equivale a recibo de férias nem libera o fechamento da folha.</p>'+
  '<div class="table-wrap"><table class="table"><tbody>'+
  '<tr><th>Matrícula</th><td>'+esc(String(data.employee?.number??'—').padStart(5,'0'))+'</td></tr>'+
  '<tr><th>Dias corridos de gozo</th><td>'+esc(String(data.days))+'</td></tr>'+
  '<tr><th>Data-limite legal de pagamento</th><td>'+esc(data.payment_deadline)+'</td></tr>'+
  '<tr><th>Salário-base histórico</th><td>'+esc(money(data.salary_cents))+'</td></tr>'+
  '<tr><th>Férias proporcionais ao gozo</th><td>'+esc(money(data.vacation_remuneration_cents))+'</td></tr>'+
  '<tr><th>Terço constitucional</th><td>'+esc(money(data.constitutional_third_cents))+'</td></tr>'+
  '<tr><th>Estimativa bruta</th><td><b>'+esc(money(data.gross_estimate_cents))+'</b></td></tr>'+
  '</tbody></table></div>'+
  '<p class="section-title">Conferências obrigatórias</p><ul>'+warnings+'</ul>'+
  '<div class="form-actions"><button class="btn secondary" type="button" id="vacation49Back">Voltar</button></div>',true);
 $('#vacation49Back').onclick=()=>payrollLeave49Open(month).catch(e=>toast(e.message,'error'));
}
