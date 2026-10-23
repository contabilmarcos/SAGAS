// SAGAS - Contabilizacao configurada dentro de cada evento/encargo.
// Mantem os modais e o estilo do cadastro existente.
const payrollSystemCodes38=new Set(['SALARIO_BASE','INSS_EMP','IRRF_EMP','FGTS_PATRONAL']);
async function payrollEventAccounting38(event,returnRunId=''){
  if(!event)return;
  const [r,a]=await Promise.all([
    api('/api/payroll/events/'+encodeURIComponent(event.id)+'/accounting'),
    api('/api/accounts')
  ]);
  const settings=r.settings||{};
  const accounts=(a.accounts||[]).filter(x=>x.analytic&&x.active);
  const sel=(name,val)=>'<select name="'+name+'" required><option value="">Selecione a conta</option>'+
    accounts.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===val?'selected':'')+'>'+
      esc(x.code||'')+' — '+esc(x.name||x.description||'')+'</option>').join('')+'</select>';
  const kind=event.code==='FGTS_PATRONAL'?'Encargo patronal':payrollSystemCodes38.has(event.code)?'Evento automático':'Evento da folha';
  openModal('Contabilização — '+event.code+' · '+event.name,
    kind+' · Configure débito e crédito deste evento, independentemente dos demais.',
    '<form id="payrollEventAccountingForm38"><div class="grid">'+
      '<label class="field"><span>Conta de débito</span>'+sel('debit_account_id',settings.debit_account_id)+'</label>'+
      '<label class="field"><span>Conta de crédito</span>'+sel('credit_account_id',settings.credit_account_id)+'</label></div>'+
      '<p class="help">Exemplo: salário — débito em despesa, crédito em salários a pagar; INSS — débito em salários a pagar, crédito em INSS a recolher. Não existe conta global obrigatória. Os lançamentos já realizados não serão alterados.</p>'+
      '<div class="form-actions"><button class="btn secondary" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar contabilização</button></div></form>',true);
  $('[data-close]').onclick=()=>returnRunId?payrollFinanceModal38(returnRunId).catch(e=>toast(e.message,'error')):closeModal();
  $('#payrollEventAccountingForm38').onsubmit=async e=>{
    e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
    try{
      const data=Object.fromEntries(new FormData(e.target));
      await api('/api/payroll/events/'+encodeURIComponent(event.id)+'/accounting',{method:'POST',body:data});
      toast('Contabilização do evento '+event.code+' salva.');
      if(returnRunId)await payrollFinanceModal38(returnRunId);
      else closeModal();
    }catch(err){toast(err.message,'error');btn.disabled=false;}
  };
}
async function payrollFinanceModal38(runId=''){
  const comp=window.sagasPayrollCompetence;
  if(!comp){toast('Selecione uma competência.','error');return;}
  const [runsAnswer,batchAnswer,batchesAnswer,eventsAnswer]=await Promise.all([
    api('/api/payroll/monthly-runs?competence_id='+encodeURIComponent(comp)),
    api('/api/payroll/monthly-finance/settings'),
    api('/api/journal-batches'),
    api('/api/payroll/events')
  ]);
  const runs=runsAnswer.runs||[];
  const selected=runId||runs[0]?.id;
  if(!selected){toast('Calcule e feche uma folha antes de integrar.','error');return;}
  const data=await api('/api/payroll/monthly-runs/'+encodeURIComponent(selected)+'/finance-preview');
  const batches=(batchesAnswer.batches||[]).filter(x=>x.status==='OPEN');
  const current=batchAnswer.settings||{};
  const fmt=value=>(Number(value||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const options='<option value="">Selecione um lote aberto</option>'+batches.map(x=>
    '<option value="'+esc(x.id)+'" '+(current.batch_id===x.id?'selected':'')+'>'+
    esc(x.number||x.code||'')+' — '+esc(x.description||x.name||'')+'</option>').join('');
  const errors=(data.problems||[]).map(p=>'<div class="help" style="color:#a33">'+esc(p.message)+'</div>').join('');
  const done=data.existing?'Integrada — lançamento '+esc(data.existing.journal_entry_id):'Ainda não integrada';
  const rows=(data.event_totals||[]).map(x=>
    '<tr><td>'+esc(x.code)+' — '+esc(x.name)+'</td><td>'+fmt(x.amount_cents)+'</td><td>'+esc(x.type)+'</td></tr>').join('');
  const missed=(data.problems||[]).filter(x=>x.code==='EVENTO_SEM_CONTA');
  const events=eventsAnswer.items||[];
  openModal('Integrar folha — Financeiro / Contábil',
    'Competência '+esc(data.run.competence)+' · '+done,
    '<p class="help">As contas contábeis são configuradas no cadastro de CADA evento e encargo da folha. Aqui você seleciona somente o lote e confirma a integração.</p>'+
    '<div class="grid three"><div class="field"><span>Proventos</span><b>'+fmt(data.totals.earnings_cents)+'</b></div>'+
    '<div class="field"><span>Descontos</span><b>'+fmt(data.totals.deductions_cents)+'</b></div>'+
    '<div class="field"><span>Salário líquido</span><b>'+fmt(data.totals.net_cents)+'</b></div></div>'+
    '<form id="payrollFinanceBatchForm38"><div class="grid"><label class="field"><span>Lote contábil</span><select required name="batch_id">'+options+'</select></label></div>'+
    '<div class="form-actions"><button class="btn secondary" type="button" data-close>Fechar</button><button class="btn primary" type="submit">Salvar lote</button></div></form>'+
    (missed.length?'<h4>Eventos que precisam de contabilização</h4><div class="toolbar" style="flex-wrap:wrap">'+
      events.filter(x=>missed.some(p=>p.message.includes(x.code+' — '))).map(x=>
        '<button type="button" class="btn secondary sm" data-payroll38-config="'+esc(x.id)+'">'+esc(x.code)+' — '+esc(x.name)+'</button>').join('')+'</div>':'')+
    errors+'<h4>Eventos contabilizados nesta folha</h4>'+
    '<div class="table-wrap"><table class="table"><thead><tr><th>Evento</th><th>Valor</th><th>Tipo</th></tr></thead><tbody>'+
    (rows||'<tr><td colspan="3">Configure as contas dos eventos com valores positivos.</td></tr>')+'</tbody></table></div>'+
    '<p class="help">A integração cria títulos apenas dos salários líquidos. Retenções e FGTS ficam como obrigações contábeis; não são emitidas guias fiscais automaticamente.</p>'+
    '<div class="form-actions"><button type="button" class="btn secondary" id="payroll38Refresh">Atualizar conferência</button>'+
    (data.existing?'<span class="badge green">Folha já integrada</span>':
      '<button type="button" class="btn success" id="payroll38Integrate" '+(data.ready?'':'disabled')+'>Gerar financeiro e contabilidade</button>')+'</div>',true);
  $('[data-close]').onclick=closeModal;
  $('#payrollFinanceBatchForm38').onsubmit=async e=>{
    e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
    try{
      await api('/api/payroll/monthly-finance/settings',{method:'POST',body:Object.fromEntries(new FormData(e.target))});
      toast('Lote contábil salvo.');await payrollFinanceModal38(selected);
    }catch(err){toast(err.message,'error');btn.disabled=false}
  };
  $$('[data-payroll38-config]').forEach(b=>b.onclick=()=>payrollEventAccounting38(events.find(x=>x.id===b.dataset.payroll38Config),selected).catch(e=>toast(e.message,'error')));
  $('#payroll38Refresh').onclick=()=>payrollFinanceModal38(selected).catch(e=>toast(e.message,'error'));
  const go=$('#payroll38Integrate');
  if(go)go.onclick=async()=>{
    if(!confirm('Confirma gerar os títulos de salário líquido e contabilizar CADA evento no lote selecionado?'))return;
    go.disabled=true;
    try{
      const posted=await api('/api/payroll/monthly-runs/'+encodeURIComponent(selected)+'/integrate-finance',
        {method:'POST',body:{confirmation:'INTEGRAR'}});
      toast('Integração concluída: '+(posted.posting?.payable_count||0)+' títulos gerados.');
      await payrollFinanceModal38(selected);
    }catch(err){toast(err.message,'error');go.disabled=false;}
  };
}
// Substitui exclusivamente o modal antigo de parametrização global.
window.payrollFinanceModal37=payrollFinanceModal38;
