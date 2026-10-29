// SAGAS v133: pre-conferencia do motor parametrizado, sem modificar folha historica.
(function(){
'use strict';
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const moneyCents=n=>(Number(n||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function problemRows(problems){
 return (problems||[]).map(p=>'<li><strong>'+h(p.code)+'</strong>: '+h(p.message)+'</li>').join('');
}
async function open(runId,source=null){
 if(!runId&&!source)throw Error('Selecione um processamento mensal antes de conferir o novo motor.');
 openModal('Novo motor: conferência integrada','Eventos, descontos, encargos e provisões configuradas confrontados com o processamento mensal existente.',
  '<p class="help" id="engine133Status">Consultando fórmulas e valores por funcionário...</p><div id="engine133Content"></div>',true);
 try{
  const endpoint=source?'/api/payroll/monthly-engine-preview?competence_id='+
   encodeURIComponent(source.competenceId)+'&payment_date='+encodeURIComponent(source.paymentDate):
   '/api/payroll/monthly-runs/'+encodeURIComponent(runId)+'/engine-preview';
  const data=await api(endpoint);
  const totals=data.totals||{};
  const envelopes=data.envelopes||[];
  const problems=data.problems||[];
  $('#engine133Status').innerHTML='<b>Competência '+h(data.run?.competence||'')+
   ' · '+h(data.employee_count)+' funcionário(s)</b> · '+h(data.event_count)+
   ' evento(s) automático(s) · '+h(data.provision_count)+' provisão(ões) cadastrada(s).';
  const totalsHtml='<div class="table-wrap"><table class="table"><thead><tr>'+
   '<th>Bruto original</th><th>Líquido antigo</th><th>Líquido simulado*</th>'+
   '<th>Encargos simulados</th><th>Provisões simuladas</th></tr></thead><tbody><tr>'+
   '<td>'+moneyCents(totals.gross_cents)+'</td>'+
   '<td><b>'+moneyCents(totals.legacy_net_cents)+'</b></td>'+
   '<td><b>'+moneyCents(totals.simulated_net_cents)+'</b></td>'+
   '<td>'+moneyCents(totals.estimated_employer_cents)+'</td>'+
   '<td>'+moneyCents(totals.estimated_provisions_cents)+'</td>'+
   '</tr></tbody></table></div>'+
   '<p class="help">*Líquido simulado substitui apenas INSS empregado e IRRF configurados no envelope antigo. Outros eventos são comparados, mas não incorporados ao líquido. Nada foi gravado.</p>';
  const employeeRows=envelopes.map((e,i)=>'<tr>'+
   '<td>'+h(e.employee_code||'—')+'</td><td>'+h(e.employee_name||'')+'</td>'+
   '<td>'+h(e.cost_center_code||'Não definido')+'</td>'+
   '<td>'+moneyCents(e.legacy?.net)+'</td><td>'+moneyCents(e.computed?.net_cents)+'</td>'+
   '<td>'+(e.problems?.length?'<span class="badge gray">'+e.problems.length+' pendência(s)</span>':'Conferido na simulação')+'</td>'+
   '<td><button type="button" class="btn secondary sm" data-engine133-person="'+i+'">Ver eventos e provisões</button></td></tr>').join('');
  $('#engine133Content').innerHTML=
   '<p class="help"><b>Prévia de conferência, não é folha fechada.</b> Valores do cálculo antigo não foram alterados. Fórmulas novas ainda não estão homologadas para lançamentos contábeis, títulos ou pagamento.</p>'+
   totalsHtml+
   '<div class="section-title">Funcionários por centro de custo</div>'+
   '<div class="table-wrap" style="max-height:320px;overflow:auto"><table class="table"><thead><tr>'+
   '<th>ID</th><th>Funcionário</th><th>Centro de custo</th>'+
   '<th>Líquido anterior</th><th>Líquido calculado</th><th>Pendências</th><th>Ações</th>'+
   '</tr></thead><tbody>'+employeeRows+'</tbody></table></div>'+
   '<div class="section-title">Pendências e regras a conferir</div>'+
   (problems.length?'<details><summary>'+problems.length+' pendência(s) por funcionário</summary><ul>'+
    problemRows(problems.slice(0,250))+'</ul></details>':
    '<p class="help">Nenhuma pendência sinalizada nas verificações implementadas. Ainda não constitui homologação legal, contábil ou fiscal.</p>')+
   '<div id="engine133Details"></div>';
  $$('[data-engine133-person]').forEach(b=>b.onclick=()=>{
   const e=envelopes[Number(b.dataset.engine133Person)];
   if(!e)return;
   const rows=(e.events||[]).map(x=>'<tr><td>'+h(x.code)+'</td><td>'+h(x.category)+'</td>'+
    '<td>'+h(x.status)+'</td><td>'+moneyCents(x.amount_cents)+'</td>'+
    '<td>'+moneyCents(x.legacy_cents)+'</td><td>'+h(x.formula||'')+'</td></tr>').join('');
   const provisionRows=(e.provisions||[]).map(x=>'<tr><td>'+h(x.code)+'</td>'+
    '<td>'+h(x.status)+'</td><td>'+moneyCents(x.amount_cents)+'</td>'+
    '<td>'+h(x.nature_id||'—')+'</td></tr>').join('');
   const target=$('#engine133Details');
   target.innerHTML='<div class="section-title">'+h(e.employee_code||'')+' · '+h(e.employee_name||'')+'</div>'+
    '<p class="help">Valores da conferência vinculados a '+h(e.cost_center_code||'sem centro de custo')+'.</p>'+
    '<div class="section-title">Eventos configurados</div>'+
    '<div class="table-wrap"><table class="table"><thead><tr><th>Evento</th><th>Classificação</th><th>Resultado</th>'+
    '<th>Simulado</th><th>Motor antigo</th><th>Versão</th></tr></thead><tbody>'+
    (rows||'<tr><td colspan="6">Nenhum evento automático configurado.</td></tr>')+'</tbody></table></div>'+
    '<div class="section-title">Provisões configuradas</div>'+
    '<div class="table-wrap"><table class="table"><thead><tr><th>Provisão</th><th>Resultado</th><th>Estimativa</th><th>Natureza</th></tr></thead>'+
    '<tbody>'+(provisionRows||'<tr><td colspan="4">Nenhuma provisão configurada.</td></tr>')+'</tbody></table></div>'+
    (e.problems?.length?'<ul>'+problemRows(e.problems)+'</ul>':'');
   target.scrollIntoView({block:'nearest',behavior:'smooth'});
  });
 }catch(e){
  const target=$('#engine133Content');
  if(target)target.innerHTML='<p class="help" style="color:#b42318">Não foi possível calcular a conferência integrada: '+h(e.message)+'</p>';
  const status=$('#engine133Status');if(status)status.textContent='Consulta não concluída.';
  toast(e.message,'error');
 }
}
window.SAGAS_ENGINE133={open,
 openSource:(competenceId,paymentDate)=>open(null,{competenceId,paymentDate})
};
})();
