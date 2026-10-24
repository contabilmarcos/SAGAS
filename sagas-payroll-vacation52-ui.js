// SAGAS Folha v90 — demonstração tributária de férias sem gravação.
// Abre dentro dos modais existentes; não gera recibo nem contabilização.
function payrollVacation90Money(v){return (Number(v||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function payrollVacation90Input(c){return (Number(c||0)/100).toFixed(2).replace('.',',')}
function payrollVacation90Parse(text){
 const s=String(text||'').trim().replace(',','.');
 if(!/^\d{1,9}(\.\d{1,2})?$/.test(s))throw Error('Informe valor monetário não negativo, no padrão 0,00.');
 const cents=Math.round(Number(s)*100);
 if(!Number.isSafeInteger(cents))throw Error('Valor monetário fora do limite.');
 return cents;
}
async function payrollVacation90Open(month,occ){
 const params=await api('/api/payroll/vacation-tax?occurrence_id='+encodeURIComponent(occ.id));
 if(!params.prepared){
  openModal('Impostos de férias — pendente',
   esc(occ.employee_name),'<p class="help">'+esc(params.note||'Conclua a memória de cálculo.')+'</p>'+
   '<div class="form-actions"><button id="vacation90Back" type="button" class="btn secondary">Voltar</button></div>',true);
  $('#vacation90Back').onclick=()=>payrollVacation50Open(month,occ).catch(e=>toast(e.message,'error'));
  return;
 }
 const fields=(params.months||[]).map((x,i)=>'<label class="field"><span>'+esc(x.competence)+' — '+esc(String(x.days))+' dia(s) de férias</span>'+
   '<input name="other'+i+'" inputmode="decimal" placeholder="Outras verbas INSS (R$)" autocomplete="off" required></label>').join('');
 openModal('Férias — simulação de INSS, IRRF e FGTS',
  esc(occ.employee_name)+' • '+esc(String(params.gozo_days))+' dias de gozo',
  '<p class="help"><b>Somente conferência.</b> As férias têm IRRF no pagamento, mas INSS/FGTS são conciliados por competência. Não representa valor líquido homologado.</p>'+
  '<p><b>Bruto da minuta: '+esc(payrollVacation90Money(params.gross_estimate_cents))+'</b></p>'+
  '<form id="vacation90Form"><div class="grid">'+
  '<label class="field"><span>Data efetiva ou prevista de pagamento</span>'+
  '<input name="payment_date" type="date" value="'+esc(params.payment_deadline)+'" required></label>'+
  '<label class="field"><span>Alíquota de FGTS do contrato</span><select name="fgts_rate_percent" required>'+
  '<option value="">Selecione</option><option value="8">8% — contrato geral</option><option value="2">2% — aprendiz</option></select></label>'+
  '<label class="field"><span>Dependentes válidos para IRRF</span>'+
  '<input name="dependents_count" type="number" min="0" max="30" step="1" value="0" required></label>'+
  '<label class="field"><span>Pensão alimentícia judicial dedutível (R$)</span>'+
  '<input name="judicial_pension_cents" inputmode="decimal" value="0,00" required></label>'+
  '</div><p class="section-title">Outras verbas que integram o INSS de cada competência</p>'+
  '<p class="help">Exclua as férias e o 1/3 aqui simulados. Informe salário dos dias trabalhados e demais verbas, inclusive valores zero confirmados. Isto não consulta automaticamente o envelope fechado.</p>'+
  '<div class="grid">'+fields+'</div>'+
  '<label class="check" style="margin-top:14px"><input id="vacation90Confirm" type="checkbox" required>'+
  ' Confirmo as bases adicionais, os dependentes e o tipo de contrato para esta simulação.</label>'+
  '<div class="form-actions"><button id="vacation90Cancel" class="btn secondary" type="button">Cancelar</button>'+
  '<button class="btn primary" type="submit">Calcular conferência tributária</button></div></form>',true);
 $('#vacation90Cancel').onclick=()=>payrollVacation50Open(month,occ).catch(e=>toast(e.message,'error'));
 const f=$('#vacation90Form');
 f.onsubmit=async event=>{
  event.preventDefault();const btn=f.querySelector('[type=submit]');btn.disabled=true;
  try{
   const body={occurrence_id:occ.id,expected_revision:params.calculation_revision,
    payment_date:f.elements.payment_date.value,fgts_rate_percent:Number(f.elements.fgts_rate_percent.value),
    dependents_count:Number(f.elements.dependents_count.value),
    judicial_pension_cents:payrollVacation90Parse(f.elements.judicial_pension_cents.value),
    other_inss_bases_cents:params.months.map((_,i)=>payrollVacation90Parse(f.elements['other'+i].value))};
   const result=await api('/api/payroll/vacation-tax',{method:'POST',body});
   payrollVacation90Result(month,occ,result);
  }catch(e){toast(e.message||String(e),'error');btn.disabled=false}
 };
}
function payrollVacation90Result(month,occ,data){
 const table=(data.monthly||[]).map(x=>'<tr><td>'+esc(x.competence)+'</td>'+
 '<td>'+esc(String(x.days))+'</td><td>'+esc(payrollVacation90Money(x.taxable_vacation_cents))+'</td>'+
 '<td>'+esc(payrollVacation90Money(x.other_inss_base_cents))+'</td>'+
 '<td>'+esc(payrollVacation90Money(x.incremental_inss_estimate_cents))+'</td>'+
 '<td>'+esc(payrollVacation90Money(x.fgts_estimate_cents))+'</td></tr>').join('');
 const rows=[
  ['Total bruto das férias e abono',data.gross_estimate_cents],
  ['Férias gozadas + 1/3 sujeitos à tributação',data.taxable_vacation_cents],
  ['Abono + 1/3 excluídos da tributação',data.nontaxable_abono_cents],
  ['INSS incremental estimado (competências)',data.estimated_inss_cents],
  ['IRRF estimado no pagamento',data.irrf.irrf_cents],
  ['Líquido somente ilustrativo',data.estimated_net_cents],
  ['FGTS estimado — despesa patronal',data.estimated_fgts_cents]
 ].map(([label,value])=>'<tr><td>'+esc(label)+'</td><td>'+esc(payrollVacation90Money(value))+'</td></tr>').join('');
 openModal('Conferência tributária de férias — sem homologação',
  esc(occ.employee_name)+' • pagamento '+esc(data.payment_date),
  '<p class="help"><b>Não é recibo e não libera pagamento.</b> INSS e FGTS precisam ser reconciliados com os envelopes mensais. A estimativa de IRRF é separada no pagamento de férias.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Apuração</th><th>Estimativa</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<p class="section-title">Distribuição por competência</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Comp.</th><th>Dias</th><th>Férias + 1/3</th><th>Outras bases INSS</th><th>INSS proj.</th><th>FGTS proj.</th></tr></thead><tbody>'+table+'</tbody></table></div>'+
  '<p class="help">IRRF: base '+esc(payrollVacation90Money(data.irrf.irrf_base_cents))+
  ', dedução '+esc(payrollVacation90Money(data.irrf.irrf_deduction_cents))+
  ' ('+esc(data.irrf.irrf_deduction_type)+'), redução 2026 '+esc(payrollVacation90Money(data.irrf.irrf_reduction_cents))+'.</p>'+
  '<p class="section-title">Conferências obrigatórias</p><ul class="help">'+
  (data.warnings||[]).map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>'+
  '<div class="form-actions"><button id="vacation90Return" type="button" class="btn secondary">Voltar às férias</button>'+
  ' <button id="vacation90Recalc" type="button" class="btn primary">Refazer simulação</button>'+ 
  '<button id="vacation53FromTax" type="button" class="btn secondary">Conferir envelopes</button></div>',true);
 $('#vacation90Return').onclick=()=>payrollVacation50Open(month,occ).catch(e=>toast(e.message,'error'));
 $('#vacation90Recalc').onclick=()=>payrollVacation90Open(month,occ).catch(e=>toast(e.message,'error'));
 $('#vacation53FromTax').onclick=()=>payrollVacation53Open(month,occ).catch(e=>toast(e.message,'error'));
}
