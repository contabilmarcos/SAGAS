// SAGAS Folha v124 - Diagnostico read-only do D1 vinculado ao Worker.
async function payrollLiveAudit124Open(){
 const audit=await api('/api/payroll/audit/live124');
 const count=audit.summary||{};
 const modules=(audit.modules||[]).map(m=>{
  const ps=(m.problems||[]).map(x=>'<div><b>'+esc(x.code)+'</b>: '+esc(x.message)+
   (x.source_id?' ('+esc(x.source_id)+')':'')+'</div>').join('');
  return '<tr><td>'+esc(m.title)+'</td><td>'+esc(m.status)+'</td>'+
   '<td>'+esc(m.count)+'</td><td>'+esc(m.examined)+'</td>'+
   '<td>'+((ps?ps:'Sem divergências detectadas nesta amostra')||'—')+'</td></tr>';
 }).join('');
 const schema=(audit.schema||[]).filter(x=>x.status!=='OK').map(x=>
  '<tr><td>'+esc(x.title)+'</td><td>'+esc(x.name)+'</td><td>'+
  esc(x.status)+'</td><td>'+esc(x.error||'Inicialização ainda não identificada')+'</td></tr>').join('');
 const limitations=(audit.limitations||[]).map(x=>'<li>'+esc(x)+'</li>').join('');
 const warn=audit.integrity_result==='PENDENCIAS'?
  'Divergências detectadas; não fechar competências com essas pendências.':
  audit.integrity_result==='SEM_HISTORICO'?
  'Não há registros contabilizados suficientes nesta empresa para homologar a folha.':
  'Conferência parcial aprovada nos módulos com registros; não equivale à homologação total.';
 openModal('Auditoria do D1 — folha SAGAS v124',
  'Diagnóstico apenas de leitura. Nenhum funcionário, diário ou título é alterado.',
  '<p class="help"><b>Resultado:</b> '+esc(audit.integrity_result)+'. '+esc(warn)+'</p>'+
  '<p class="help"><b>Módulos verificados:</b> '+esc(count.modules_checked)+
  ' · <b>Com histórico conferido:</b> '+esc(count.modules_with_history)+
  ' · <b>Com pendências:</b> '+esc(count.modules_pending)+
  ' · <b>Tabelas ainda não inicializadas:</b> '+esc(count.not_initialized)+'</p>'+
  '<h4>Integridade por processo (até 100 registros recentes)</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Módulo</th><th>Situação</th><th>Registros na amostra</th><th>Conferidos</th><th>Pendências de integração</th></tr></thead><tbody>'+
  (modules||'<tr><td colspan="5">Nenhum módulo consultado.</td></tr>')+'</tbody></table></div>'+
  '<h4>Estrutura não inicializada ou inconsistente</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Tabela</th><th>Identificador técnico</th><th>Situação</th><th>Observação</th></tr></thead><tbody>'+
  (schema||'<tr><td colspan="4">Todas as tabelas verificadas foram encontradas e puderam ser consultadas.</td></tr>')+
  '</tbody></table></div>'+
  '<h4>Limitações desta auditoria</h4><ul class="help">'+limitations+'</ul>'+
  '<div class="form-actions"><button id="live124Refresh" type="button" class="btn primary">Conferir D1 novamente</button>'+
  '<button id="live124Close" type="button" class="btn secondary">Fechar</button></div>',true);
 document.getElementById('live124Refresh').onclick=()=>payrollLiveAudit124Open().catch(e=>toast(e.message,'error'));
 document.getElementById('live124Close').onclick=()=>closeModal();
}
