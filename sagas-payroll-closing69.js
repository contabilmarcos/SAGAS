import { payrollVacationProvisionJournal67 } from './sagas-payroll-vacation67.js';
// SAGAS — fechamento mensal integrado, auditoria e pendencias reunidas.
// Consulta unica: folha, financeiro, encargos, provisoes e contabilidade.
// Nunca grava processamento, movimentacoes, guias ou partidas.
function step69(id,title,status,problems=[],summary=null){
 return {id,title,status,problems:problems.map(p=>typeof p==='string'?{code:'BLOCK',message:p}:{code:String(p.code||'BLOCK'),message:String(p.message||p.code||'Pendencia')}),summary};
}
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
 // O historico integrado prevalece sobre bloqueios da previa atual (ex.: lote
 // fechado depois da contabilizacao). Confere origem, diario e titulos reais.
 const financialRecord=await call('FINANCEIRO_GRAVADO',()=>env.DB.prepare(
  "SELECT p.journal_entry_id,p.payable_count,p.payable_total_cents,p.source_fingerprint,j.status AS journal_status,j.source_module,j.source_reference,j.total_debit_cents,j.total_credit_cents FROM payroll_finance_postings37 p LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=p.company_id WHERE p.company_id=? AND p.run_id=?"
 ).bind(companyId,runId).first());
 const titles=financialRecord?await call('TITULOS_GRAVADOS',()=>env.DB.prepare(
  "SELECT COUNT(l.payable_id) AS link_count,COUNT(t.id) AS payable_count,COUNT(DISTINCT l.employee_id) AS employee_count,COALESCE(SUM(t.amount_cents),0) AS total_cents,COALESCE(SUM(CASE WHEN t.id IS NULL OR t.company_id<>? OR t.source_type<>'PAYROLL_MONTHLY' OR t.source_id<>l.run_id||':'||l.employee_id OR t.status='CANCELLED' THEN 1 ELSE 0 END),0) AS invalid_count FROM payroll_finance_payables37 l LEFT JOIN financial_payables t ON t.id=l.payable_id WHERE l.company_id=? AND l.run_id=?"
 ).bind(companyId,companyId,runId).first()):null;
 const journalLines=financialRecord?await call('PARTIDAS_FINANCEIRO',()=>env.DB.prepare(
  "SELECT side,cost_center_id,COALESCE(SUM(amount_cents),0) AS total_cents,COUNT(*) AS lines FROM journal_lines WHERE company_id=? AND entry_id=? GROUP BY side,cost_center_id"
 ).bind(companyId,financialRecord.journal_entry_id).all()):null;
 const financialProblems=[];
 if(financialRecord){
  const problem=(code,message)=>financialProblems.push({code,message});
  if(financialRecord.source_fingerprint!==run.source_fingerprint)
   problem('FINANCE_SOURCE_CHANGED','Fotografia financeira difere da revisão da folha.');
  if(financialRecord.journal_status!=='POSTED'||financialRecord.source_module!=='PAYROLL'||
     financialRecord.source_reference!=='MONTHLY:'+runId)
   problem('FINANCE_JOURNAL_INVALID','Diário financeiro ausente, anulado ou com origem divergente.');
  if(!journalLines)problem('FINANCE_LINES_UNAVAILABLE','Não foi possível conferir as partidas contábeis da folha.');
  else{
   const rows=journalLines.results||[],centers=new Set(detail.envelopes.map(e=>e.cost_center_id).filter(Boolean));
   let debit=0,credit=0;
   const sums=new Map();
   for(const line of rows){
    const cents=Number(line.total_cents),qty=Number(line.lines);
    if(!['D','C'].includes(line.side)||!Number.isSafeInteger(cents)||cents<=0||
       !Number.isSafeInteger(qty)||qty<=0||!line.cost_center_id||!centers.has(line.cost_center_id))
     problem('FINANCE_LINE_INVALID','Partida contábil com valor, lado ou centro de custo incompatível.');
    if(line.side==='D')debit+=cents;
    if(line.side==='C')credit+=cents;
    const key=line.cost_center_id||'SEM_CC';
    const p=sums.get(key)||{D:0,C:0};p[line.side]=(p[line.side]||0)+cents;sums.set(key,p);
   }
   if(!Number.isSafeInteger(debit)||debit<=0||debit!==credit||
      debit!==Number(financialRecord.total_debit_cents)||
      credit!==Number(financialRecord.total_credit_cents)||
      [...sums.values()].some(p=>p.D!==p.C))
    problem('FINANCE_JOURNAL_UNBALANCED','Diário financeiro diverge do cabeçalho ou está desequilibrado por centro de custo.');
  }
  if(!titles)problem('PAYABLES_UNAVAILABLE','Não foi possível conferir títulos financeiros.');
  else{
   const expectedCount=detail.envelopes.filter(e=>Number(e.net_cents)>0).length;
   const values=[financialRecord.payable_count,financialRecord.payable_total_cents,
    titles.link_count,titles.payable_count,titles.employee_count,titles.total_cents,titles.invalid_count];
   if(values.some(v=>!Number.isSafeInteger(Number(v))||Number(v)<0)||
      Number(financialRecord.payable_count)!==expectedCount||
      Number(titles.link_count)!==expectedCount||
      Number(titles.payable_count)!==expectedCount||
      Number(titles.employee_count)!==expectedCount||
      Number(titles.invalid_count)!==0||
      Number(financialRecord.payable_total_cents)!==Number(titles.total_cents)||
      Number(titles.total_cents)!==Number(detail.totals?.net_cents))
    problem('FINANCE_TOTALS_MISMATCH','Títulos do líquido não conciliam com funcionários, total ou origem da folha.');
  }
  if(errors.FINANCEIRO_GRAVADO||errors.TITULOS_GRAVADOS||errors.PARTIDAS_FINANCEIRO)
   problem('FINANCE_AUDIT_FAILED','Consulta dos registros financeiros incompleta.');
 }else if(errors.FINANCEIRO_GRAVADO){
  financialProblems.push(errors.FINANCEIRO_GRAVADO);
 }else{
  financialProblems.push(...(finance?.problems||[errors.FINANCEIRO||{code:'NO_PREVIEW',message:'Prévia financeira indisponível.'}]));
 }
 const financialComplete=!!financialRecord&&!financialProblems.length;
 sections.push(step69('FINANCEIRO','Contas a pagar e diário da folha',
  financialComplete?'CONCLUIDO':financialRecord?'PENDENTE':finance?.ready?'PRONTO':'PENDENTE',
  financialProblems,{integrated:!!financialRecord,employee_count:titles?.employee_count??finance?.employee_count??0,
   payable_total_cents:financialRecord?.payable_total_cents??finance?.payable_total_cents??null,
   journal_entry_id:financialRecord?.journal_entry_id||null,journal_status:financialRecord?.journal_status||null,
   journal_total_cents:financialRecord?.total_debit_cents??null,
   payable_count:titles?.payable_count??null,
   note:'Títulos do líquido não equivalem a pagamento bancário. A contabilização já feita é conciliada por sua origem histórica.'}));
 // v120: conciliar efetivamente os lançamentos e títulos, não apenas a prévia.
 const employerPosting=await call('PATRONAL_GRAVADO',async()=>{
  try{return await env.DB.prepare("SELECT p.run_id,p.amount_cents,p.journal_entry_id,p.payable_count,j.status AS journal_status,j.source_module,j.source_reference,j.total_debit_cents,j.total_credit_cents FROM payroll_employer_postings120 p LEFT JOIN journal_entries j ON j.company_id=p.company_id AND j.id=p.journal_entry_id WHERE p.company_id=? AND p.run_id=?").bind(companyId,runId).first()}
  catch(e){if(/no such table/i.test(String(e)))return null;throw e}
 });
 const patronalTitles=employerPosting?await call('PATRONAL_TITULOS',()=>env.DB.prepare(
  "SELECT COUNT(l.payable_id) AS link_count,COUNT(t.id) AS payable_count,COALESCE(SUM(l.amount_cents),0) AS expected_cents,COALESCE(SUM(t.amount_cents),0) AS total_cents,COALESCE(SUM(CASE WHEN t.id IS NULL OR t.company_id<>? OR t.source_type<>'PAYROLL_EMPLOYER' OR t.source_id<>(l.run_id||':'||l.component) OR t.status='CANCELLED' OR t.amount_cents<>l.amount_cents THEN 1 ELSE 0 END),0) AS invalid_count FROM payroll_employer_payables120 l LEFT JOIN financial_payables t ON t.id=l.payable_id AND t.company_id=l.company_id WHERE l.company_id=? AND l.run_id=?"
 ).bind(companyId,companyId,runId).first()):null;
 const patronalLines=employerPosting?await call('PATRONAL_PARTIDAS',()=>env.DB.prepare(
  "SELECT side,cost_center_id,SUM(amount_cents) AS cents FROM journal_lines WHERE company_id=? AND entry_id=? GROUP BY side,cost_center_id"
 ).bind(companyId,employerPosting.journal_entry_id).all()):null;
 const employerProblems=[];
 if(employerPosting){
  const amount=Number(employerPosting.amount_cents);
  if(employerPosting.journal_status!=='POSTED'||employerPosting.source_module!=='PAYROLL'||
     employerPosting.source_reference!=='EMPLOYER120:'+runId)
   employerProblems.push({code:'PATRONAL_JOURNAL_INVALID',message:'Diário patronal ausente, anulado ou com origem divergente.'});
  if(!Number.isSafeInteger(amount)||amount<=0||
     (employer?.totals&&Number(employer.totals.total_cents)!==amount))
   employerProblems.push({code:'PATRONAL_AMOUNT_INVALID',message:'Total patronal gravado diverge da prévia.'});
  if(!patronalTitles||Number(patronalTitles.link_count)!==Number(employerPosting.payable_count)||
     Number(patronalTitles.payable_count)!==Number(employerPosting.payable_count)||
     Number(patronalTitles.expected_cents)!==amount||Number(patronalTitles.total_cents)!==amount||
     Number(patronalTitles.invalid_count)!==0)
   employerProblems.push({code:'PATRONAL_PAYABLES_INVALID',message:'Títulos patronais divergentes, ausentes ou cancelados.'});
  if(!patronalLines)employerProblems.push({code:'PATRONAL_LINES_UNAVAILABLE',message:'Não foi possível consultar as partidas patronais.'});
  else{
   let debit=0,credit=0;
   const byCenter=new Map();
   for(const line of patronalLines.results||[]){
    const n=Number(line.cents),side=line.side,cc=line.cost_center_id;
    if(!Number.isSafeInteger(n)||n<=0||!cc||!['D','C'].includes(side))
     employerProblems.push({code:'PATRONAL_LINE_INVALID',message:'Partida patronal inválida ou sem centro de custo.'});
    if(side==='D')debit+=n;if(side==='C')credit+=n;
    const z=byCenter.get(cc)||{D:0,C:0};
    if(['D','C'].includes(side))z[side]+=n;
    byCenter.set(cc,z);
   }
   if(debit!==amount||credit!==amount||
      debit!==Number(employerPosting.total_debit_cents)||credit!==Number(employerPosting.total_credit_cents)||
      [...byCenter.values()].some(x=>x.D!==x.C))
    employerProblems.push({code:'PATRONAL_JOURNAL_UNBALANCED',message:'Diário patronal divergente ou desequilibrado por centro de custo.'});
  }
 }else employerProblems.push(...(employer?.problems?.length?employer.problems:
  [{code:'PATRONAL_NOT_POSTED',message:'Integre os encargos patronais e seus títulos após a conferência da DCTFWeb e das guias.'}]));
 if(errors.PATRONAL_GRAVADO||errors.PATRONAL_TITULOS||errors.PATRONAL_PARTIDAS)
  employerProblems.push({code:'PATRONAL_AUDIT_UNAVAILABLE',message:'Não foi possível conferir todos os registros patronais.'});
 const employerComplete=!!employerPosting&&!employerProblems.length;
 sections.push(step69('ENCARGOS','Encargos patronais — contabilidade e financeiro',
  employerComplete?'CONCLUIDO':employerPosting?'PENDENTE':employer?'PRONTO':'PENDENTE',
  employerProblems,{totals:employer?.totals||null,integrated:!!employerPosting,
   journal_entry_id:employerPosting?.journal_entry_id||null,
   payable_count:patronalTitles?.payable_count||0,
   note:'CPP/RAT/terceiros/PIS; FGTS já está na folha. Guias e pagamentos bancários permanecem separados.'}));
 const pProblems=provision?.unresolved_employee_count?
  [{code:'MEDIAS_PENDENTES',message:'Funcionários com remuneração variável exigem cálculo das médias antes de constituir provisões.'}]:[];
 if(!provision)pProblems.push(errors.PROVISOES||{code:'NO_PREVIEW',message:'Prévia das provisões indisponível.'});
 const cycle=await call('CICLO',()=>env.DB.prepare(
  'SELECT id,run_id,totals_json,confirmed_at FROM payroll_provision_cycles43 WHERE company_id=? AND competence=?'
 ).bind(companyId,run.competence).first());
 const provisionConfirmed=!!cycle&&cycle.run_id===runId;
 if(cycle&&cycle.run_id!==runId)pProblems.push({code:'OUTRA_REVISAO',message:'Provisões constituídas a partir de outra revisão da folha.'});
 sections.push(step69('PROVISOES','Constituição mensal de férias, terço e 13º',
  provisionConfirmed&&!pProblems.length?'CONCLUIDO':provisionConfirmed?'CONFERIR':provision&&!pProblems.length?'PRONTO':'PENDENTE',pProblems,
  {cycle_id:cycle?.id||null,confirmed:provisionConfirmed,estimated_totals:provision?.totals||null,
   note:'A prévia é simplificada: remuneração variável, períodos aquisitivos e alterações salariais dependem de apuração específica.'}));
 const [accrual,uses]=await Promise.all([
  call('CONTABILIZACAO_PROVISOES',()=>d.provisionPosting(run.competence,'ACCRUAL')),
  call('BAIXAS',()=>d.provisionPosting(run.competence,'USE'))
 ]);
 const postedProvision=cycle?await call('DIARIO_PROVISOES',()=>env.DB.prepare(
  "SELECT p.id,p.journal_entry_id,p.total_cents,j.status AS journal_status FROM payroll_provision_postings45 p LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=p.company_id WHERE p.company_id=? AND p.kind='ACCRUAL' AND p.cycle_id=?"
 ).bind(companyId,cycle.id).first()):null;
 const verifiedAccrual=postedProvision?await call('AUDITORIA_PROVISAO',()=>
  payrollVacationProvisionJournal67(env,companyId,postedProvision.id,d)):null;
 const accountingProblems=postedProvision?
  (verifiedAccrual?.problems||[errors.AUDITORIA_PROVISAO||{code:'JOURNAL_AUDIT_FAILED',message:'Não foi possível conciliar o diário contábil.'}]):
  (accrual?.problems||[errors.CONTABILIZACAO_PROVISOES||{code:'NOT_AVAILABLE',message:'Prévia contábil indisponível.'}]);
 if(errors.DIARIO_PROVISOES)accountingProblems.push(errors.DIARIO_PROVISOES);
 const postingDone=!!verifiedAccrual?.valid;
 if(postedProvision&&!postingDone&&!accountingProblems.length)
  accountingProblems.push({code:'JOURNAL_INVALID',message:'O diário da provisão não conciliou com os movimentos e os centros de custo.'});
 sections.push(step69('CONTABILIZACAO_PROVISOES','Contabilização das provisões',
  postingDone?'CONCLUIDO':postedProvision?'PENDENTE':accrual?.ready?'PRONTO':'PENDENTE',
  accountingProblems,
  {posted:postingDone,journal_entry_id:postedProvision?.journal_entry_id||null,
   amount_cents:verifiedAccrual?.amount_cents??postedProvision?.total_cents??null,
   origin_count:verifiedAccrual?.movement_count??null,
   note:'Confere partidas e centros de custo do diário gravado; não inclui encargos estimados sobre provisões.'}));
 // Separar baixas inexistentes, pendentes e efetivamente contabilizadas.
 // A previa USE ignora movimentos ja postados e sozinha nao pode provar conclusao.
 const useHistory=await call('HISTORICO_BAIXAS',()=>env.DB.prepare(
  "SELECT COUNT(*) AS total_count,COALESCE(SUM(CASE WHEN l.movement_id IS NULL THEN 1 ELSE 0 END),0) AS pending_count FROM payroll_provision_movements43 m LEFT JOIN payroll_provision_posted_movements45 l ON l.company_id=m.company_id AND l.movement_id=m.id WHERE m.company_id=? AND m.competence=? AND m.movement_kind='USE'"
 ).bind(companyId,run.competence).first());
 const useRecords=await call('DIARIOS_BAIXAS',()=>env.DB.prepare(
  "SELECT id FROM payroll_provision_postings45 WHERE company_id=? AND competence=? AND kind='USE' ORDER BY posted_at,id LIMIT 101"
 ).bind(companyId,run.competence).all());
 const useProblems=[];
 const useTotal=Number(useHistory?.total_count),pending=Number(useHistory?.pending_count);
 if(!useHistory||!Number.isSafeInteger(useTotal)||!Number.isSafeInteger(pending)||pending<0||pending>useTotal)
  useProblems.push(errors.HISTORICO_BAIXAS||{code:'USE_HISTORY_INVALID',message:'Histórico de baixas indisponível ou inconsistente.'});
 const records=useRecords?.results||[];
 if(!useRecords)useProblems.push(errors.DIARIOS_BAIXAS||{code:'USE_JOURNALS_UNAVAILABLE',message:'Diários de baixas indisponíveis.'});
 if(records.length>100)useProblems.push({code:'USE_AUDIT_LIMIT',message:'Mais de 100 diários de baixa; exige conferência específica.'});
 let verifiedUseCount=0,verifiedUseAmount=0;
 for(const record of records.slice(0,100)){
  const verified=await call('BAIXA_'+record.id,()=>payrollVacationProvisionJournal67(env,companyId,record.id,d));
  if(!verified){useProblems.push(errors['BAIXA_'+record.id]||{code:'USE_AUDIT_FAILED',message:'Erro ao conferir diário de baixa.'});continue;}
  if(!verified.valid){
   useProblems.push(...(verified.problems||[{code:'USE_JOURNAL_INVALID',message:'Diário de baixa divergente.'}]));
  }else{verifiedUseCount+=Number(verified.movement_count);verifiedUseAmount+=Number(verified.amount_cents);}
 }
 if(useHistory&&useRecords&&!useProblems.length&&verifiedUseCount!==useTotal-pending)
  useProblems.push({code:'USE_ORIGINS_UNBALANCED',message:'Movimentos contabilizados e origens dos diários de baixa não coincidem.'});
 if(useTotal>0&&pending>0&&!uses?.ready)
  useProblems.push(...(uses?.problems||[errors.BAIXAS||{code:'USE_PREVIEW_UNAVAILABLE',message:'Prévia das baixas pendentes indisponível.'}]).filter(x=>x.code!=='NO_MOVEMENTS'));
 const useStatus=useProblems.length?'PENDENTE':useTotal===0?'SEM_MOVIMENTOS':
  pending===0?'CONCLUIDO':uses?.ready?'PRONTO':'PENDENTE';
 sections.push(step69('BAIXAS','Baixas de provisões por utilização',useStatus,useProblems,
  {movement_count:useTotal,pending_count:pending,posted_count:verifiedUseCount,
   posted_total_cents:verifiedUseAmount,
   note:'Baixas postadas foram conciliadas com seus diários. As ainda pendentes exigem conferência e contabilização sem repetição.'}));
 const hasVacations=String(run.source_fingerprint||'').startsWith('VACATION100:');
 const vacationLink=hasVacations?await call('FERIAS_CONTABILIZADA',async()=>{
  try{return await env.DB.prepare(
   "SELECT v.run_id,v.journal_entry_id,j.status AS journal_status,j.source_module,j.source_reference,v.source_fingerprint FROM payroll_vacation_integrations121 v LEFT JOIN journal_entries j ON j.id=v.journal_entry_id AND j.company_id=v.company_id WHERE v.company_id=? AND v.run_id=?"
  ).bind(companyId,runId).first();}
  catch(e){if(/no such table/i.test(String(e)))return null;throw e}
 }):null;
 const vacationComplete=!!vacationLink&&financialComplete&&
  vacationLink.journal_entry_id===financialRecord?.journal_entry_id&&
  vacationLink.journal_status==='POSTED'&&vacationLink.source_module==='PAYROLL'&&
  vacationLink.source_reference==='MONTHLY:'+runId;
 if(hasVacations)sections.push(step69('FERIAS','Integração definitiva das férias e líquido residual',
  vacationComplete?'CONCLUIDO':'PENDENTE',vacationComplete?[]:[
   errors.FERIAS_CONTABILIZADA||{code:'FERIAS_INTEGRACAO_PENDENTE',
    message:'Integre a folha de férias v121 após vincular o pagamento do adiantamento e as baixas de provisões.'}
  ],{integrated:vacationComplete,journal_entry_id:vacationLink?.journal_entry_id||null,
   note:'Diário v121 deve coincidir com origem mensal, contas por centro de custo e títulos do líquido residual; não repete adiantamento.'}));
 const critical=sections.filter(x=>x.status==='PENDENTE'||(x.status==='CONFERIR'&&x.problems.length)).map(x=>x.id);
 const finished=sections.filter(x=>x.status==='CONCLUIDO').map(x=>x.id);
 return {kind:'SAGAS_MONTHLY_CLOSING_V107',read_only:true,run_id:runId,competence:run.competence,
  employee_count:detail.envelopes.length,sections,finished,blocked:critical,
  monthly_operational_ready:payrollOk&&financialComplete&&employerComplete&&provisionConfirmed&&!pProblems.length&&postingDone&&['CONCLUIDO','SEM_MOVIMENTOS'].includes(useStatus)&&(!hasVacations||vacationComplete),
  total_process_homologated:false,
  next_actions:sections.filter(s=>['PENDENTE','PRONTO'].includes(s.status)||(s.status==='CONFERIR'&&s.problems.length)).map(s=>({
   stage:s.id,status:s.status,first_problem:s.problems[0]?.message||null
  })),
  warnings:['A existência de rotinas no repositório não comprova que estejam publicadas no Cloudflare Worker.',
   'A consulta não valida automaticamente extratos bancários, saldo de passivos no balancete nem guias de tributos.',
   'Não libere o uso em produção sem testes com D1 real e conferência externa das competências.']};
}
