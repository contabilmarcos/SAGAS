// SAGAS Etapa 37 - Modal de integracao financeira e contabil da folha fechada.
async function payrollFinanceModal37(runId=''){
  const comp=window.sagasPayrollCompetence;
  if(!comp){toast('Selecione uma competencia da folha.','error');return;}
  const result=await Promise.all([
    api('/api/payroll/monthly-runs?competence_id='+encodeURIComponent(comp)),
    api('/api/payroll/monthly-finance/settings'),
    api('/api/accounts'),
    api('/api/journal-batches')
  ]);
  const runs=result[0].runs||[];
  const latest=runs[0];
  if(!latest){toast('Calcule e feche uma folha antes da integracao.','error');return;}
  const selectedRun=runId||latest.id;
  const data=await api('/api/payroll/monthly-runs/'+encodeURIComponent(selectedRun)+'/finance-preview');
  const accounts=(result[2].accounts||[]).filter(a=>a.analytic&&a.active);
  const batches=(result[3].batches||[]).filter(x=>x.status==='OPEN');
  const current=result[1].settings||{};
  const fields=[
    ['batch_id','Lote contábil'],
    ['earnings_expense_account_id','Débito: despesas/custos de proventos'],
    ['wages_payable_account_id','Crédito: salários líquidos a pagar'],
    ['inss_payable_account_id','Crédito: INSS retido dos empregados'],
    ['irrf_payable_account_id','Crédito: IRRF retido dos empregados'],
    ['fgts_expense_account_id','Débito: despesa de FGTS'],
    ['fgts_payable_account_id','Crédito: FGTS a recolher']
  ];
  const opts=(items,val)=>'<option value="">Selecione</option>'+items.map(x=>
    '<option value="'+esc(x.id)+'" '+(val===x.id?'selected':'')+'>'+esc(x.code||x.number||'')+' - '+esc(x.name||x.description||'')+'</option>').join('');
  const issueList=(data.problems||[]).map(x=>'<div class="help" style="color:#a33">'+esc(x.message)+'</div>').join('');
  const format=v=>(Number(v||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const formHtml='<form id="payrollFinanceForm37"><div class="grid">'+fields.map(([name,title])=>
    '<label class="field"><span>'+esc(title)+'</span><select name="'+name+'" required>'+opts(name==='batch_id'?batches:accounts,current[name])+'</select></label>').join('')+
    '</div><div class="form-actions"><button type="button" class="btn secondary" data-close>Fechar</button><button type="submit" class="btn primary">Salvar contas</button></div></form>';
  const done=data.existing?'Integrado — lançamento '+esc(data.existing.journal_entry_id):'Ainda não integrado';
  openModal('Integrar folha — Financeiro / Contábil',
    'Etapa 37 · Competencia '+esc(data.run.competence)+' · '+done,
    '<p class="help">Somente uma folha fechada pode ser integrada. O fechamento não cria pagamentos. Esta integração criará títulos líquidos dos funcionários e um lançamento contábil no lote selecionado.</p>'+
    '<div class="grid three"><div class="field"><span>Proventos</span><b>'+format(data.totals.earnings_cents)+'</b></div><div class="field"><span>Descontos</span><b>'+format(data.totals.deductions_cents)+'</b></div><div class="field"><span>Líquido a pagar</span><b>'+format(data.totals.net_cents)+'</b></div></div>'+
    '<p class="help">'+esc(data.employee_title_count)+' título(s) de salários. INSS retido, IRRF e FGTS são contabilizados, mas guias tributárias não são criadas. Para registrar baixa salarial será necessário configurar um Evento Contábil Financeiro compatível.</p>'+
    issueList+formHtml+
    '<div class="form-actions"><button type="button" class="btn secondary" id="payroll37Refresh">Atualizar conferência</button>'+
    (data.existing?'<span class="badge green">Integração já realizada</span>':
      '<button type="button" class="btn success" id="payroll37Integrate" '+(data.ready?'':'disabled')+'>Gerar financeiro e contabilidade</button>')+'</div>',true);
  $('[data-close]').onclick=closeModal;
  $('#payrollFinanceForm37').onsubmit=async e=>{
    e.preventDefault();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
    try{await api('/api/payroll/monthly-finance/settings',{method:'POST',body:Object.fromEntries(new FormData(e.target))});toast('Contas e lote salvos.');await payrollFinanceModal37(selectedRun)}
    catch(err){toast(err.message,'error');btn.disabled=false}
  };
  $('#payroll37Refresh').onclick=()=>payrollFinanceModal37(selectedRun).catch(e=>toast(e.message,'error'));
  const go=$('#payroll37Integrate');
  if(go)go.onclick=async()=>{
    if(!confirm('Confirma criar os titulos de salarios liquidos e o lancamento contabil desta folha FECHADA?'))return;
    go.disabled=true;
    try{const r=await api('/api/payroll/monthly-runs/'+encodeURIComponent(selectedRun)+'/integrate-finance',{
      method:'POST',body:{confirmation:'INTEGRAR'}});
      toast('Integracao realizada: '+(r.posting?.payable_count||0)+' titulo(s) e um lancamento contábil.');
      await payrollFinanceModal37(selectedRun);
    }catch(e){toast(e.message,'error');go.disabled=false}
  };
}
