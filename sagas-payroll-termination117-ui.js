// SAGAS v117 — revisão assistida das incidências 2026, apenas prévia DRAFT.
const pterm117Fields=[
 ['other_monthly_cents','Outras verbas salariais tributáveis já pagas na competência (R$)'],
 ['other_thirteenth_cents','Outras verbas tributáveis de 13º no ano (R$)'],
 ['prior_inss_month_cents','INSS mensal já descontado na competência (R$)'],
 ['prior_inss_thirteenth_cents','INSS de 13º já descontado (R$)'],
 ['prior_irrf_month_cents','IRRF mensal já retido no período (R$)'],
 ['prior_irrf_thirteenth_cents','IRRF de 13º já retido (R$)'],
 ['pension_month_cents','Pensão alimentícia dedutível na competência (R$)'],
 ['pension_thirteenth_cents','Pensão alimentícia dedutível no 13º (R$)']
];
function pterm117Req(p){return pterm115Req(p)}
async function payrollTermination117Open(base){
 const p=await api('/api/payroll/termination/tax-review',{method:'POST',body:pterm117Req(base)});
 if(String(p.termination_date||'').slice(0,4)!=='2026'){
  toast('O cálculo automático de INSS/IRRF desta etapa aceita somente rescisões em 2026.','error');
  return payrollTermination117Show(p);
 }
 const v=p.tax_context||{};
 const fields=pterm117Fields.map(([k,label])=>'<label class="field"><span>'+esc(label)+
  '</span><input name="'+k+'" inputmode="decimal" required value="'+pterm115InputMoney(v[k]??0)+'"></label>').join('');
 openModal('Rescisão — bases tributárias de 2026',
  'Concilie bases, dependentes e retenções anteriores antes de comparar INSS e IRRF com a v116.',
  '<p class="help"><b>Funcionário:</b> '+esc(p.employee.code||'—')+' — '+esc(p.employee.name)+
  ' · <b>Data:</b> '+esc(p.termination_date)+'. Informe valores adicionais à rescisão, sem duplicar o salário e o 13º já calculados.</p>'+
  '<form id="pterm117Form" class="grid">'+
  '<label class="field"><span>Dependentes para IRRF</span><input name="dependents" type="number" min="0" max="20" step="1" required value="'+esc(v.dependents??0)+'"></label>'+
  fields+
  '<label class="field full"><span>Referência dos demonstrativos e comprovação de dependentes, pensão e retenções</span>'+
  '<input name="reference" maxlength="240" required value="'+esc(p.tax_context_reference||'')+'"></label>'+
  '<p class="help full">Os valores 0,00 precisam corresponder a conferência documental. Salário já calculado, 13º projetado, férias e aviso indenizado estão tratados nas rubricas da prévia. Esta apuração não substitui guias, TRCT ou cálculo definitivo da folha.</p>'+
  '<label class="field full"><span>Digite CONFIRMAR BASES TRIBUTARIAS</span>'+
  '<input name="confirmation" required autocomplete="off"></label>'+
  '<div class="form-actions"><button id="pterm117Back" type="button" class="btn secondary">Voltar</button>'+
  '<button type="submit" class="btn primary">Conferir e salvar contexto</button></div></form>',true);
 document.getElementById('pterm117Back').onclick=()=>payrollTermination117Show(p);
 const form=document.getElementById('pterm117Form');
 form.onsubmit=async e=>{
  e.preventDefault();const btn=form.querySelector('[type="submit"]');btn.disabled=true;
  try{
   const v=Object.fromEntries(new FormData(form));
   const payload={...pterm117Req(p),dependents:Number(v.dependents),
    reference:v.reference,confirmation:v.confirmation,
    base_source_fingerprint:p.base_source_fingerprint};
   for(const [k] of pterm117Fields)payload[k]=pterm115Number(v[k]);
   await api('/api/payroll/termination/tax-context',{method:'POST',body:payload});
   const next=await api('/api/payroll/termination/tax-review',{method:'POST',body:pterm117Req(p)});
   toast('Bases tributárias documentadas. Confira as divergências antes de registrar a memória.');
   payrollTermination117Show(next);
  }catch(err){toast(err.message,'error');btn.disabled=false}
 };
}
function payrollTermination117Show(p){
 const t=p.tax_summary;
 const taxRows=t?[
  ['Base mensal para INSS/IRRF',t.month_gross_cents],
  ['Base do INSS sobre 13º',t.thirteenth_inss_base_cents],
  ['Base do IRRF sobre 13º (com projeção)',t.thirteenth_irrf_gross_cents],
  ['INSS mensal total',t.inss_month_total_cents],
  ['INSS 13º total',t.inss_thirteenth_total_cents],
  ['INSS mensal a descontar na rescisão',t.inss_month_due_cents],
  ['INSS 13º a descontar na rescisão',t.inss_thirteenth_due_cents],
  ['IRRF mensal total após redutor',t.irrf_month_total_cents],
  ['IRRF 13º total após redutor',t.irrf_thirteenth_total_cents],
  ['IRRF mensal a reter na rescisão',t.irrf_month_due_cents],
  ['IRRF 13º a reter na rescisão',t.irrf_thirteenth_due_cents]
 ].map(([name,value])=>'<tr><td>'+esc(name)+'</td><td>'+pterm114Money(value)+'</td></tr>').join(''):'<tr><td colspan="2">Confirme as bases de cálculo para gerar a simulação.</td></tr>';
 const taxNames={
  MONTHLY_INSS_IRRF:'INSS mensal e IRRF mensal',
  THIRTEENTH_INSS_IRRF:'INSS 13º e IRRF 13º',
  THIRTEENTH_IRRF_ONLY:'Somente IRRF do 13º',
  INDEMNITY_EXCLUDED:'Indenizatória — sem INSS/IRRF nesta prévia'
 };
 const lines=(p.tax_lines||[]).map(x=>'<tr><td>'+esc(x.code)+'</td><td>'+
  pterm114Money(x.amount_cents)+'</td><td>'+esc(taxNames[x.tax_class]||x.tax_class)+'</td></tr>').join('');
 const differences=p.tax_comparison?.differences||[];
 const diffs=differences.map(x=>'<tr><td>'+esc(x.field)+'</td><td>'+
  pterm114Money(x.documented_cents)+'</td><td>'+pterm114Money(x.calculated_cents)+
  '</td><td>'+pterm114Money(x.difference_cents)+'</td></tr>').join('');
 const issues=(p.tax_issues||[]).map(x=>'<p class="help"><b>'+esc(x.code)+':</b> '+esc(x.message)+'</p>').join('');
 const inherited=(p.problems||[]).map(x=>'<p class="help"><b>'+esc(x.code)+':</b> '+esc(x.message)+'</p>').join('');
 openModal('Rescisão — memória tributária de 2026',
  'Comparação automática dos tributos; não corresponde a rescisão aprovada nem fechamento da folha.',
  '<p class="help"><b>Funcionário:</b> '+esc(p.employee.code||'—')+' — '+esc(p.employee.name)+
  ' · <b>Data:</b> '+esc(p.termination_date)+' · <b>Documento:</b> '+esc(p.tax_context_reference||'não informado')+'</p>'+
  '<h4>Incidências por rubrica</h4><div class="table-wrap"><table class="table"><thead>'+
  '<tr><th>Rubrica</th><th>Valor</th><th>Incidência</th></tr></thead><tbody>'+lines+'</tbody></table></div>'+
  '<h4>INSS e IRRF — 2026</h4><div class="table-wrap"><table class="table"><thead>'+
  '<tr><th>Apuração</th><th>Valor</th></tr></thead><tbody>'+taxRows+'</tbody></table></div>'+
  '<h4>Diferenças contra os descontos documentados</h4><div class="table-wrap"><table class="table"><thead>'+
  '<tr><th>Tributo</th><th>Documento v116</th><th>Cálculo v117</th><th>Diferença</th></tr></thead><tbody>'+
  (diffs||'<tr><td colspan="4">Nenhuma divergência identificada (ou conferência ainda não disponível).</td></tr>')+
  '</tbody></table></div>'+
  '<h4>Bloqueios e observações</h4>'+issues+inherited+
  (p.tax_warnings||[]).map(x=>'<p class="help">'+esc(x)+'</p>').join('')+
  '<p class="help"><b>Fechamento:</b> ainda bloqueado. É necessário validar histórico de férias, incidências especiais, 13º já pago, FGTS, provisões e integração dos lançamentos antes da geração definitiva.</p>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="pterm117Edit">Editar contexto</button>'+
  '<button type="button" class="btn secondary" id="pterm117History">Histórico de conferência</button>'+
  (p.tax_ready_for_review&&can('payroll.manage')?
   '<button type="button" class="btn primary" id="pterm117Record">Registrar memória DRAFT</button>':'')+
  '</div>',true);
 document.getElementById('pterm117Edit').onclick=()=>payrollTermination117Open(p).catch(e=>toast(e.message,'error'));
 document.getElementById('pterm117History').onclick=()=>payrollTermination117History(p.employee.id,p.employee.name).catch(e=>toast(e.message,'error'));
 const record=document.getElementById('pterm117Record');
 if(record)record.onclick=async()=>{
  record.disabled=true;
  try{
   const r=await api('/api/payroll/termination/tax-workpapers',{method:'POST',body:{
    ...pterm117Req(p),source_fingerprint:p.source_fingerprint,
    confirmation:'REGISTRAR CONFERENCIA TRIBUTARIA'
   }});
   toast(r.reused?'Memória de incidências já registrada.':'Conferência tributária DRAFT registrada; sem financeiro ou contabilidade.');
   payrollTermination117Show(p);
  }catch(e){toast(e.message,'error');record.disabled=false}
 };
}
async function payrollTermination117History(employeeId,name){
 const r=await api('/api/payroll/termination/tax-workpapers?employee_id='+encodeURIComponent(employeeId));
 const runs=r.runs||[];
 const rows=runs.map((x,i)=>'<tr><td>'+esc(x.termination_date)+'</td><td>'+esc(x.kind)+
  '</td><td>'+esc(x.revision)+'</td><td>DRAFT</td><td>'+
  '<button type="button" class="btn secondary sm" data-pterm117-history="'+i+'">Abrir</button></td></tr>').join('');
 openModal('Histórico tributário da rescisão — '+esc(name),
  'Memórias documentais versionadas, sem lançamento financeiro nem mudança funcional.',
  '<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Tipo</th>'+
  '<th>Revisão</th><th>Status</th><th>Detalhe</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="5">Nenhuma conferência tributária registrada.</td></tr>')+
  '</tbody></table></div>',true);
 $$('[data-pterm117-history]').forEach(btn=>btn.onclick=async()=>{
  try{
   const run=runs[Number(btn.dataset.pterm117History)];
   const d=await api('/api/payroll/termination/tax-workpapers/'+encodeURIComponent(run.id));
   payrollTermination117Show(d.snapshot);
  }catch(e){toast(e.message,'error')}
 });
}
