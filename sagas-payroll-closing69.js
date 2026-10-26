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
  "SELECT p.journal_entry_id,p.payable_count,p.payable_total_cents,p.source_fingerprint,j.status AS journal_status,j.source_module,j.source_reference FROM payroll_finance_postings37 p LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=p.company_id WHERE p.company_id=? AND p.run_id=?"
 ).bind(companyId,runId).first());
 const titles=financialRecord?await call('TITULOS_GRAVADOS',()=>env.DB.prepare(
  "SELECT COUNT(l.payable_id) AS link_count,COUNT(t.id) AS payable_count,COUNT(DISTINCT l.employee_id) AS employee_count,COALESCE(SUM(t.amount_cents),0) AS total_cents,COALESCE(SUM(CASE WHEN t.id IS NULL OR t.company_id<>? OR t.source_type<>'PAYROLL_MONTHLY' OR t.source_id<>l.run_id||':'||l.employee_id THEN 1 ELSE 0 END),0) AS invalid_count FROM payroll_finance_payables37 l LEFT JOIN financial_payables t ON t.id=l.payable_id WHERE l.company_id=? AND l.run_id=?"
 ).bind(companyId,companyId,runId).first()):null;
 const financialProblems=[];
 if(financialRecord){
  const problem=(code,message)=>financialProblems.push({code,message});
  if(financialRecord.source_fingerprint!==run.source_fingerprint)
   problem('FINANCE_SOURCE_CHANGED','Fotografia financeira difere da revisão da folha.');
  if(financialRecord.journal_status!=='POSTED'||financialRecord.source_module!=='PAYROLL'||
     financialRecord.source_reference!=='MONTHLY:'+runId)
   problem('FINANCE_JOURNAL_INVALID','Diário financeiro ausente, anulado ou com origem divergente.');
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
  if(errors.FINANCEIRO_GRAVADO||errors.TITULOS_GRAVADOS)
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
   payable_count:titles?.payable_count??null,
   note:'Títulos do líquido não equivalem a pagamento bancário. A contabilização já feita é conciliada por sua origem histórica.'}));
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
  accountingProblems.push({code:'JOURNAL_INVALID','O diário da provisão não conciliou com os movimentos e os centros de custo.'});
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
 if(hasVacations)sections.push(step69('FERIAS','Conciliação de férias com o fechamento',
  'PENDENTE',[{code:'FERIAS_INTEGRACAO_PROTEGIDA',message:'O fluxo de férias v100 ainda exige homologação integrada antes da liberação financeira/contábil.'}],
  {note:'Não repetir pagamento antecipado nem a despesa já provisionada.'}));
 const critical=sections.filter(x=>x.status==='PENDENTE'||(x.status==='CONFERIR'&&x.problems.length)).map(x=>x.id);
 const finished=sections.filter(x=>x.status==='CONCLUIDO').map(x=>x.id);
 return {kind:'SAGAS_MONTHLY_CLOSING_V107',read_only:true,run_id:runId,competence:run.competence,
  employee_count:detail.envelopes.length,sections,finished,blocked:critical,
  monthly_operational_ready:payrollOk&&financialComplete&&provisionConfirmed&&!pProblems.length&&postingDone&&['CONCLUIDO','SEM_MOVIMENTOS'].includes(useStatus)&&!hasVacations,
  total_process_homologated:false,
  next_actions:sections.filter(s=>['PENDENTE','PRONTO'].includes(s.status)||(s.status==='CONFERIR'&&s.problems.length)).map(s=>({
   stage:s.id,status:s.status,first_problem:s.problems[0]?.message||null
  })),
  warnings:['A existência de rotinas no repositório não comprova que estejam publicadas no Cloudflare Worker.',
   'A consulta não valida automaticamente extratos bancários, saldo de passivos no balancete nem guias de tributos.',
   'Não libere o uso em produção sem testes com D1 real e conferência externa das competências.']};
}
