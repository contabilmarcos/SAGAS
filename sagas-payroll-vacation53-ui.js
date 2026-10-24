// SAGAS Folha v91 — conferência de férias frente a envelopes mensais.
// Apenas leitura. Não cria adiantamento, título, recibo nem partidas contábeis.
function payrollVacation53Money(n){return (Number(n||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
async function payrollVacation53Open(month,occ){
 const data=await api('/api/payroll/vacation-integration?occurrence_id='+encodeURIComponent(occ.id));
 if(data.status==='MEMORIA_PENDENTE'){
  openModal('Férias — conciliação pendente',esc(occ.employee_name),
   '<p class="help">'+esc(data.problems?.[0]?.message||'Conclua a memória de cálculo primeiro.')+'</p>'+
   '<div class="form-actions"><button class="btn secondary" id="vacation53Back" type="button">Voltar</button></div>',true);
  $('#vacation53Back').onclick=()=>payrollVacation50Open(month,occ).catch(e=>toast(e.message,'error'));
  return;
 }
 const employeeName=data.employee?.name||occ.employee_name;
 const rows=(data.periods||[]).map(p=>{
  const env=p.monthly_envelope||null;
  const vals=(p.planned_lines||[]).map(x=>esc(x.event_code)+': '+esc(payrollVacation53Money(x.amount_cents))).join(' • ');
  const duplicates=(p.existing_special_lines||[]).map(x=>esc(x.event_code)+' ('+esc(payrollVacation53Money(x.amount_cents))+')').join(', ');
  return '<tr><td>'+esc(p.competence)+'</td><td>'+esc(String(p.days))+'</td>'+
   '<td>'+vals+'</td><td>'+esc(p.period_status)+'</td><td>'+
   (p.monthly_run?esc(p.monthly_run.status)+' / revisão '+esc(p.monthly_run.revision):'Não calculada')+'</td>'+
   '<td>'+(env?esc(env.cost_center_code||'Centro de custo ausente'):'Sem envelope')+'</td>'+
   '<td>'+esc(duplicates||'Nenhum identificado')+'</td></tr>';
 }).join('');
 const mappings=(data.event_mappings||[]).map(e=>
  '<tr><td>'+esc(e.event_code)+'</td><td>'+esc(e.type)+'</td><td>'+
  (e.configured?esc((e.nature_code||'')+' — '+(e.nature_name||'')):
    '<b>'+(e.valid?'Natureza pendente':'Evento inconsistente')+'</b>')+'</td></tr>').join('');
 const problems=(data.problems||[]).map(p=>'<li><b>'+esc(p.code)+'</b> — '+esc(p.message)+'</li>').join('');
 const totals=(data.periods||[]).reduce((sum,p)=>sum+Number(p.planned_gross_cents||0),0);
 openModal('Férias — conferir envelopes e naturezas',
  esc(employeeName)+' • '+esc(data.vacation_start)+' a '+esc(data.vacation_end),
  '<p class="help"><b>Conferência prévia, sem lançamento.</b> O cálculo mensal permanece bloqueado enquanto férias, adiantamento e impostos não forem homologados. Não utilize os valores desta tela como pagamento.</p>'+
  '<p>Verbas de gozo previstas nas competências: <b>'+esc(payrollVacation53Money(totals))+'</b> · Abono e 1/3 separados: <b>'+
   esc(payrollVacation53Money(Number(data.abono_cents||0)+Number(data.abono_third_cents||0)))+'</b>.</p>'+
  '<p class="section-title">Comparação com envelopes mensais</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Competência</th><th>Dias</th>'+
  '<th>Rubricas previstas (sem gravar)</th><th>Competência</th><th>Processamento</th>'+
  '<th>Centro de custo do envelope</th><th>Possíveis duplicidades</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="7">Nenhuma competência identificada.</td></tr>')+'</tbody></table></div>'+
  '<p class="help">Centro de custo do cadastro atual: '+esc(data.current_cost_center?.code||'Não informado')+
  '. Para competências já processadas, vale somente o centro de custo armazenado no envelope.</p>'+
  '<p class="section-title">Eventos de férias — configure a natureza em cada cadastro</p>'+
  '<p class="help">Acesse Folha → Cadastros → Eventos e use Contabilização para vincular a natureza orçamentária analítica. A conta será resolvida depois conforme o centro de custo. Nenhuma conta fixa foi cadastrada.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Evento</th><th>Tipo</th><th>Natureza orçamentária</th></tr></thead><tbody>'+mappings+'</tbody></table></div>'+
  '<p class="section-title">Pendências para integração</p>'+
  '<ul class="help">'+problems+'</ul>'+
  '<p class="help"><b>Status: não liberado para folha, financeiro ou contabilidade.</b> Não foram criados eventos nos envelopes nem títulos a pagar.</p>'+
  '<div class="form-actions"><button class="btn secondary" type="button" id="vacation53Back">Voltar às férias</button>'+
  '<button class="btn secondary" type="button" id="vacation53Refresh">Atualizar conferência</button>'+ 
  '<button class="btn primary" type="button" id="vacation54Open">Processamento preliminar</button></div>',true);
 $('#vacation53Back').onclick=()=>payrollVacation50Open(month,occ).catch(e=>toast(e.message,'error'));
 $('#vacation53Refresh').onclick=()=>payrollVacation53Open(month,occ).catch(e=>toast(e.message,'error'));
 $('#vacation54Open').onclick=()=>payrollVacation54Open(month,occ).catch(e=>toast(e.message,'error'));
}
