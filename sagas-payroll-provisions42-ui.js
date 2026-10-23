// SAGAS folha 42 - Prévia somente leitura das provisões em competência fechada.
async function payrollProvisions42Open(){
  const compId=window.sagasPayrollCompetence;
  if(!compId)throw Error('Selecione uma competência de folha.');
  const history=await api('/api/payroll/monthly-runs?competence_id='+encodeURIComponent(compId));
  const latest=(history.runs||[])[0];
  if(!latest||latest.status!=='APPROVED')throw Error('Feche a última revisão da folha mensal antes de consultar as provisões.');
  const d=await api('/api/payroll/monthly-runs/'+encodeURIComponent(latest.id)+'/provisions-preview');
  const fmt=x=>money(Number(x||0)/100);
  const rows=d.items.map((x,i)=>'<tr><td>'+esc(x.employee_code||'—')+' — '+esc(x.employee_name)+'</td>'+
    '<td>'+esc(x.cost_center_code||'—')+'</td><td>'+fmt(x.vacation_cents)+'</td><td>'+fmt(x.vacation_third_cents)+'</td>'+
    '<td>'+fmt(x.thirteenth_cents)+'</td><td>'+fmt(x.charges_estimate_cents)+'</td>'+
    '<td><button type="button" class="btn secondary sm" data-p42-employee="'+i+'">Detalhes</button></td></tr>').join('');
  const total=d.totals;
  const table='<div class="table-wrap"><table class="table"><thead><tr>'+
    '<th>Funcionário</th><th>Centro de custo</th><th>Férias 1/12</th><th>1/3 férias</th><th>13º 1/12</th><th>Encargos estimados</th><th>Ação</th>'+
    '</tr></thead><tbody>'+rows+'<tr><th colspan="2">Total</th><th>'+fmt(total.vacation_cents)+'</th><th>'+
    fmt(total.vacation_third_cents)+'</th><th>'+fmt(total.thirteenth_cents)+'</th><th>'+fmt(total.charges_estimate_cents)+
    '</th><td>—</td></tr></tbody></table></div>';
  openModal('Provisões mensais — '+esc(d.run.competence),
    'Prévia da revisão '+esc(d.run.revision)+' da folha fechada, por funcionário e centro de custo.',
    '<p class="help"><b>Estimativa da parcela mensal</b> — Não constitui, não baixa e não contabiliza provisões. Não é saldo acumulado.</p>'+
    table+'<p class="help"><b>Verbas provisionadas de referência:</b> '+fmt(total.labor_total_cents)+
    ' · <b>Encargos estimados:</b> '+fmt(total.charges_estimate_cents)+
    ' · <b>Total estimado:</b> '+fmt(total.combined_estimate_cents)+
    '</p><p class="help"><b>Proventos variáveis que requerem conferência:</b> '+esc(d.unresolved_employee_count)+' funcionário(s).</p>'+
    '<h4>Critérios e pendências</h4>'+d.warnings.map(w=>'<p class="help">'+esc(w)+'</p>').join('')+
    '<div class="form-actions"><button type="button" id="p42close" class="btn secondary">Fechar</button></div>',true);
  $('#p42close').onclick=closeModal;
  $$('[data-p42-employee]').forEach(btn=>btn.onclick=()=>{
    const x=d.items[Number(btn.dataset.p42Employee)];if(!x)return;
    const breakdown=[
      ['Salário-base de referência',x.salary_base_cents],
      ['Férias — 1/12',x.vacation_cents],['Adicional de férias — 1/36',x.vacation_third_cents],
      ['Décimo terceiro — 1/12',x.thirteenth_cents],
      ['INSS patronal estimado',x.cpp_estimate_cents],['RAT/FAP estimado',x.rat_estimate_cents],
      ['Terceiros estimados',x.thirds_estimate_cents],['FGTS estimado',x.fgts_estimate_cents],
      ['Total da parcela e encargos',x.combined_estimate_cents]
    ];
    openModal('Provisão — '+esc(x.employee_name),
      'Funcionário '+esc(x.employee_code||'—')+' · Centro de custo '+esc(x.cost_center_code||'—'),
      '<div class="table-wrap"><table class="table"><thead><tr><th>Componente</th><th>Valor</th></tr></thead><tbody>'+
      breakdown.map(([name,value])=>'<tr><td>'+esc(name)+'</td><td>'+fmt(value)+'</td></tr>').join('')+
      '</tbody></table></div>'+
      (x.flags||[]).map(f=>'<p class="help">'+esc(f)+'</p>').join('')+
      '<p class="help">Valores de referência para conferência. Não houve lançamento contábil ou financeiro.</p>'+
      '<div class="form-actions"><button type="button" class="btn secondary" id="p42back">Voltar</button></div>',true);
    $('#p42back').onclick=()=>payrollProvisions42Open().catch(err=>toast(err.message,'error'));
  });
}
