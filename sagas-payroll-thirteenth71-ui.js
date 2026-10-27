// SAGAS folha 13o v110: revisoes de calculo e aprovacao sem pagamento nem contabilizacao.
function p13money71(c){return money(Number(c||0)/100)}
async function payrollThirteenth71History(year,phase){
 const u='/api/payroll/thirteenth/runs?year='+encodeURIComponent(year)+'&phase='+encodeURIComponent(phase||'');
 const data=await api(u);
 const rows=(data.runs||[]).map((r,i)=>
  '<tr><td>'+esc(r.calendar_year)+'</td><td>'+esc(r.phase==='FIRST'?'1ª':'2ª')+'</td>'+
  '<td>'+esc(r.revision)+'</td><td><b>'+esc(r.status==='APPROVED'?'Aprovado':'Calculado')+'</b></td>'+
  '<td>'+esc(r.employee_count)+'</td><td>'+p13money71(r.gross_cents)+'</td>'+
  '<td>'+p13money71(r.net_cents)+'</td><td>'+
  '<button type="button" class="btn secondary sm" data-p13-detail="'+i+'">Conferir</button> '+
  (r.status==='CALCULATED'&&can('payroll.manage')?
   '<button type="button" class="btn primary sm" data-p13-approve="'+i+'">Aprovar cálculo</button>':'')+
  (r.status==='APPROVED'&&r.phase==='FIRST'?
   '<button type="button" class="btn secondary sm" data-p13-integrate="'+i+'">Integrar financeiro / contábil</button>':'')+
  '</td></tr>').join('');
 openModal('Histórico de cálculos do 13º — '+esc(year),
  'Revisões próprias do 13º. A integração da 1ª parcela é uma ação posterior à aprovação.',
  '<div class="table-wrap"><table class="table"><thead><tr><th>Ano</th><th>Parcela</th><th>Revisão</th>'+
  '<th>Situação</th><th>Funcionários</th><th>Bruto</th><th>Líquido</th><th>Ações</th></tr></thead>'+
  '<tbody>'+rows+'</tbody></table></div>'+
  '<p class="help">'+(rows?'Cálculos armazenados; financeiro da 1ª parcela disponível após aprovação e configuração das naturezas.':
   'Ainda não há processamentos calculados.')+'</p>'+
  '<div class="form-actions"><button class="btn secondary" type="button" id="p13HBack">Voltar à prévia</button></div>',true);
 document.getElementById('p13HBack').onclick=()=>payrollThirteenth70Open(year,phase).catch(e=>toast(e.message,'error'));
 $$('[data-p13-detail]').forEach(button=>button.onclick=async()=>{
  const r=data.runs[Number(button.dataset.p13Detail)];
  if(r)await payrollThirteenth71Detail(r.id,year,phase);
 });
 $('[data-p13-integrate]').forEach(button=>button.onclick=()=>{
  const r=data.runs[Number(button.dataset.p13Integrate)];
  if(r)payrollThirteenth111Preview(r.id,year).catch(e=>toast(e.message,'error'));
 });
 $('[data-p13-approve]').forEach(button=>button.onclick=()=>{
  const r=data.runs[Number(button.dataset.p13Approve)];
  if(r)payrollThirteenth71Approve(r.id,year,phase);
 });
}
async function payrollThirteenth71Detail(id,year,phase){
 const d=await api('/api/payroll/thirteenth/runs/'+encodeURIComponent(id));
 const r=d.run;
 const lines=(d.employees||[]).map(x=>'<tr><td>'+esc(x.employee_code||'—')+' — '+esc(x.employee_name)+'</td>'+
  '<td>'+esc(x.avos)+'/12</td><td>'+p13money71(x.salary_cents)+'</td><td>'+p13money71(x.gross_cents)+'</td>'+
  '<td>'+p13money71(x.advance_cents)+'</td><td>'+p13money71(x.inss_cents)+'</td>'+
  '<td>'+p13money71(x.irrf_cents)+'</td><td>'+p13money71(x.net_cents)+'</td></tr>').join('');
 openModal('13º — '+esc(r.calendar_year)+' · Revisão '+esc(r.revision),
  'Envelope imutável da '+esc(r.phase==='FIRST'?'primeira':'segunda')+' parcela · '+esc(r.status),
  '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Avos</th><th>Salário</th>'+
  '<th>13º total</th><th>Adiantamento</th><th>INSS</th><th>IRRF</th><th>Líquido</th></tr></thead>'+
  '<tbody>'+lines+'</tbody></table></div>'+
  '<p class="help"><b>Líquido da etapa:</b> '+p13money71(r.net_cents)+' · <b>FGTS:</b> '+
  p13money71(r.fgts_cents)+'. Aprovação não equivale a pagamento, guia ou contabilização.</p>'+
  '<div class="form-actions"><button class="btn secondary" id="p13DBack">Voltar ao histórico</button></div>',true);
 document.getElementById('p13DBack').onclick=()=>payrollThirteenth71History(year,phase).catch(e=>toast(e.message,'error'));
}
function payrollThirteenth71Calculate(preview){
 openModal('Calcular 13º — '+esc(preview.year),
  'Grava a fotografia da '+esc(preview.phase==='FIRST'?'1ª':'2ª')+' parcela para conferência e aprovação posterior.',
  '<p class="help">Funcionários: '+esc(preview.employee_count)+' · Bruto: '+p13money71(preview.totals.gross_cents)+
  ' · Líquido da parcela: '+p13money71(preview.totals.net_cents)+'.</p>'+
  '<p class="help">Não gera pagamentos, títulos, guias ou lançamentos contábeis.</p>'+
  '<form id="p13CalcForm"><label class="field"><span>Digite CALCULAR 13</span><input name="confirmation" required></label>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="p13CBack">Voltar</button>'+
  '<button type="submit" class="btn primary">Registrar cálculo</button></div></form>',true);
 document.getElementById('p13CBack').onclick=()=>payrollThirteenth70Open(preview.year,preview.phase).catch(e=>toast(e.message,'error'));
 const form=document.getElementById('p13CalcForm');
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const result=await api('/api/payroll/thirteenth/runs/calculate',{method:'POST',body:{
    year:preview.year,phase:preview.phase,source_fingerprint:preview.source_fingerprint,
    confirmation:form.elements.confirmation.value
   }});
   toast(result.reused?'Revisão já calculada.':'Cálculo do 13º registrado.');
   await payrollThirteenth71History(preview.year,preview.phase);
  }catch(e){button.disabled=false;toast(e.message,'error')}
 };
}
function payrollThirteenth71Approve(id,year,phase){
 openModal('Aprovar cálculo do 13º',
  'A aprovação congela a revisão calculada. Não realiza pagamento financeiro.',
  '<p class="help">Confira previamente os envelopes, a base contratual, avos, médias, adiantamentos e tributos.</p>'+
  '<form id="p13ApproveForm"><label class="field"><span>Digite APROVAR CALCULO 13</span>'+
  '<input name="confirmation" required autocomplete="off"></label>'+
  '<div class="form-actions"><button class="btn secondary" type="button" id="p13ABack">Cancelar</button>'+
  '<button class="btn primary" type="submit">Aprovar cálculo</button></div></form>',true);
 document.getElementById('p13ABack').onclick=()=>payrollThirteenth71History(year,phase).catch(e=>toast(e.message,'error'));
 const form=document.getElementById('p13ApproveForm');
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const data=await api('/api/payroll/thirteenth/runs/approve',{method:'POST',body:{
    run_id:id,confirmation:form.elements.confirmation.value}});
   toast(data.approved?'Cálculo do 13º aprovado.':'Cálculo já aprovado.');
   await payrollThirteenth71History(year,phase);
  }catch(e){button.disabled=false;toast(e.message,'error')}
 };
}