// SAGAS Folha v113 — auditoria de leitura dos cálculos e integrações do 13º no D1.
async function payrollThirteenthAudit113Open(year){
 const report=await api('/api/payroll/thirteenth/audit?year='+encodeURIComponent(year));
 const money113=n=>money(Number(n||0)/100);
 const state={FIRST:'1ª parcela',SECOND:'2ª parcela'};
 const labels={CALCULATED:'Calculado',APPROVED:'Aprovado',NOT_CALCULATED:'Não calculado'};
 const checks=(report.checks||[]).map(p=>'<tr>'+
  '<td>'+esc(state[p.phase]||p.phase)+'</td>'+
  '<td>'+esc(labels[p.status]||p.status)+'</td>'+
  '<td>'+esc(p.revision||'—')+'</td>'+
  '<td>'+esc(p.integrated?'Sim':'Não')+'</td>'+
  '<td>'+esc(p.payables_count||0)+'</td>'+
  '<td>'+money113(p.net_cents)+'</td>'+
  '<td>'+esc((p.issues||[]).join(', ')||'—')+'</td></tr>').join('');
 const missing=(report.missing_tables||[]).length?
  '<p class="help"><b>Faltam tabelas no D1:</b> '+(report.missing_tables||[]).map(esc).join(', ')+'</p>':'';
 const problems=(report.findings||[]).map(x=>
  '<tr><td>'+esc(state[x.phase]||'Geral')+'</td><td>'+esc(x.code)+'</td>'+
  '<td>'+esc(x.message)+'</td></tr>').join('');
 openModal('13º — Auditoria no D1 · '+esc(year),
  'Conferência somente de leitura: não cria, exclui, aprova ou contabiliza nenhum registro.',
  '<p class="help"><b>Integridade:</b> '+(report.integrity_ok?'Sem divergências encontradas':'Com pendências')+
  ' · <b>Fechamento completo:</b> '+(report.ready?'Sim':'Ainda não')+'</p>'+
  missing+
  '<h4>Parcelas e integração</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr>'+
  '<th>Etapa</th><th>Estado</th><th>Revisão</th><th>Integrada</th><th>Títulos</th>'+
  '<th>Líquido</th><th>Pendências</th></tr></thead><tbody>'+
  checks+'</tbody></table></div>'+
  '<h4>Ocorrências da auditoria</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Etapa</th><th>Código</th><th>Descrição</th></tr></thead><tbody>'+
  (problems||'<tr><td colspan="3">Nenhuma divergência encontrada na estrutura consultada.</td></tr>')+'</tbody></table></div>'+
  '<p class="help">'+esc(report.note||'')+'</p>'+
  '<div class="form-actions"><button class="btn secondary" type="button" id="p13AuditBack">Voltar aos cálculos</button>'+
  '<button class="btn primary" type="button" id="p13AuditReload">Atualizar conferência</button></div>',true);
 document.getElementById('p13AuditBack').onclick=()=>payrollThirteenth71History(year,'FIRST').catch(e=>toast(e.message,'error'));
 document.getElementById('p13AuditReload').onclick=()=>payrollThirteenthAudit113Open(year).catch(e=>toast(e.message,'error'));
}