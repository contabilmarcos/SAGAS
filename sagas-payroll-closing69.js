// SAGAS — fechamento mensal integrado, auditoria e pendencias reunidas.
// Consulta unica: folha, financeiro, encargos, provisoes e contabilidade.
// Nunca grava processamento, movimentacoes, guias ou partidas.
const allowed69=['FOLHA','FINANCEIRO','ENCARGOS','PROVISOES','CONTABILIZACAO_PROVISOES','BAIXAS','FERIAS'];
function step69(id,title,status,problems=[],summary=null){
 return {id,title,status,problems:problems.map(p=>typeof p==='string'?{code:'BLOCK',message:p}:{code:String(p.code||'BLOCK'),message:String(p.message||p.code||'Pendencia')}),summary};
}
function classify69(p){return p.length?'PENDENTE':'PRONTO'}
export async function payrollMonthlyEndToEnd69(c){
 const {env,companyId,auth,runId,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 const detail=await d.detail(runId),run=detail.run;
 if(!run||!/^20\d\d-(0[1-9]|1[0-2])$/.test(run.competence||''))throw new d.HttpError(409,'Competência mensal inválida.','RUN_INVALID');
 const base=await d.conference(runId);
 const issues=base.problems||[];
 const payrollOk=run.status==='APPROVED'&&base.approved&&base.review?.closed_at&&!issues.length;
 const sections=[
  step69('FOLHA','Cálculo, conferência e fechamento',payrollOk?'CONCLUIDO':'PENDENTE',
   [...issues,...(!payrollOk?[{code:'FOLHA_NAO_FECHADA',message:'Feche a revisão mensal sem pendências antes de integrar.'}]:[])],
   {competence:run.competence,revision:run.revision,status:run.status,employees:detail.envelopes.length,net_cents:detail.totals?.net_cents||0})
 ];
 const errors={};
 const call=async(id,fn)=>{try{return await fn()}catch(e){
  errors[id]={code:e?.code||'READ_ERROR',message:String(e?.message||e).slice(0,350)};return null;
 }};
 const [finance,employer,provision]=await Promise.all([
  call('FINANCEIRO',()=>d.finance(runId)),
  call('ENCARGOS',()=>d.employer(runId)),
  call('PROVISOES',()=>d.provision(runId))
 ]);
 const financialProblems=finance?.problems||[errors.FINANCEIRO||{code:'NO_PREVIEW',message:'Prévia financeira indisponível.'}];
 const financialComplete=!!finance?.integrated&&!!finance?.existing&&!financialProblems.length;
 sections.push(step69('FINANCEIRO','Contas a pagar e diário da folha',
  financialComplete?'CONCLUIDO':finance?.ready?'PRONTO':'PENDENTE',
  financialProblems,{integrated:!!finance?.integrated,employee_count:finance?.employee_count||0,payable_total_cents:finance?.payable_total_cents??null,
   journal_entry_id:finance?.existing?.journal_entry_id||null,
   note:'Títulos do líquido: não equivale a pagamento bancário ou emissão de guias.'}));
 const employerProblems=employer?.problems||[errors.ENCARGOS||{code:'NO_PREVIEW',message:'Encargos não disponíveis.'}];
 sections.push(step69('ENCARGOS','Prévia dos encargos patronais',employerProblems.length?'PENDENTE':'CONFERIR',
  employerProblems,{totals:employer?.totals||null,note:'Prévia patronal não comprova pagamento de FGTS, INSS ou outras guias.'}));
 const pProblems=provision?.unresolved_employee_count?
  [{code:'MEDIAS_PENDENTES',message:'Funcionários com remuneração variável exigem cálculo das médias antes de constituir provisões.'}]:[];
 if(!provision)pProblems.push(errors.PROVISOES||{code:'NO_PREVIEW',message:'Prévia das provisões indisponível.'});
 const cycle=await call('CICLO',()=>env.DB.prepare(
  'SELECT id,run_id,totals_json,confirmed_at FROM payroll_provision_cycles43 WHERE company_id=? AND competence=?'
 ).bind(companyId,run.competence).first());
 const provisionConfirmed=!!cycle&&cycle.run_id===runId;
 if(cycle&&cycle.run_id!==runId)pProblems.push({code:'OUTRA_REVISAO',message:'Provisões constituídas a partir de outra revisão da folha.'});
 sections.push(step69('PROVISOES','Constituição mensal de férias, terço e 13º',
  provisionConfirmed?'CONCLUIDO':provision&&!pProblems.length?'PRONTO':'PENDENTE',pProblems,
  {cycle_id:cycle?.id||null,confirmed:provisionConfirmed,estimated_totals:provision?.totals||null,
   note:'A prévia é simplificada: remuneração variável, períodos aquisitivos e alterações salariais dependem de apuração específica.'}));
 const [accrual,uses]=await Promise.all([
  call('CONTABILIZACAO_PROVISOES',()=>d.provisionPosting(run.competence,'ACCRUAL')),
  call('BAIXAS',()=>d.provisionPosting(run.competence,'USE'))
 ]);
 const accountingProblems=accrual?.problems||[errors.CONTABILIZACAO_PROVISOES||{code:'NOT_AVAILABLE',message:'Prévia contábil indisponível.'}];
 const postedProvision=await call('DIARIO_PROVISOES',()=>env.DB.prepare(
  "SELECT p.id,p.journal_entry_id,j.status AS journal_status,p.total_cents FROM payroll_provision_postings45 p LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=p.company_id WHERE p.company_id=? AND p.kind='ACCRUAL' AND p.cycle_id=?"
 ).bind(companyId,cycle?.id||'').first());
 const postingDone=!!postedProvision&&postedProvision.journal_status==='POSTED';
 if(postedProvision&&postedProvision.journal_status!=='POSTED')accountingProblems.push({code:'DIARIO_NAO_POSTADO',message:'Diário de constituição não está postado.'});
 sections.push(step69('CONTABILIZACAO_PROVISOES','Contabilização das provisões',
  postingDone?'CONCLUIDO':accrual?.ready?'PRONTO':'PENDENTE',accountingProblems,
  {posted:postingDone,journal_entry_id:postedProvision?.journal_entry_id||null,amount_cents:postedProvision?.total_cents??null,
   note:'Esta etapa contabiliza férias, terço e 13º, não encargos estimados sobre provisões.'}));
 const useProblems=uses?.problems||[errors.BAIXAS||{code:'NOT_AVAILABLE',message:'Baixas indisponíveis.'}];
 const noMovements=useProblems.some(x=>x.code==='NO_MOVEMENTS');
 sections.push(step69('BAIXAS','Baixas de provisões por utilização',
  noMovements?'SEM_MOVIMENTOS':uses?.ready?'PRONTO':useProblems.length?'PENDENTE':'CONFERIR',
  noMovements?[]:useProblems,
  {movement_count:uses?.movement_count??null,note:'Baixas decorrem de férias/13º efetivamente utilizados; não são uma nova provisão mensal.'}));
 const hasVacations=String(run.source_fingerprint||'').startsWith('VACATION100:');
 if(hasVacations)sections.push(step69('FERIAS','Conciliação de férias com o fechamento',
  'PENDENTE',[{code:'FERIAS_INTEGRACAO_PROTEGIDA',message:'O fluxo de férias v100 ainda exige homologação integrada antes da liberação financeira/contábil.'}],
  {note:'Não repetir pagamento antecipado nem a despesa já provisionada.'}));
 const critical=sections.filter(x=>x.status==='PENDENTE').map(x=>x.id);
 const finished=sections.filter(x=>x.status==='CONCLUIDO').map(x=>x.id);
 return {kind:'SAGAS_MONTHLY_CLOSING_V106',read_only:true,run_id:runId,competence:run.competence,
  employee_count:detail.envelopes.length,sections,finished,blocked:critical,
  monthly_operational_ready:payrollOk&&financialComplete&&postingDone&&!hasVacations,
  total_process_homologated:false,
  next_actions:sections.filter(s=>['PENDENTE','PRONTO'].includes(s.status)).map(s=>({
   stage:s.id,status:s.status,first_problem:s.problems[0]?.message||null
  })),
  warnings:['A existência de rotinas no repositório não comprova que estejam publicadas no Cloudflare Worker.',
   'A consulta não valida automaticamente extratos bancários, saldo de passivos no balancete nem guias de tributos.',
   'Não libere o uso em produção sem testes com D1 real e conferência externa das competências.']};
}
