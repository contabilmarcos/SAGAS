// SAGAS v125 — reabertura controlada da competencia mensal.
// Sem exclusao de historicos: fechamento anterior vira VOID e nova revisao e calculada.
// Nao permite reabrir competencia com integracao financeira, contabil ou provisao
// ja constituida/movimentada. O POST revalida os bloqueios no D1 antes da escrita.
const LINKS125=[
 ['payroll_finance_postings37','run_id','FINANCEIRO','Folha ja integrada ao financeiro/contabil.'],
 ['payroll_finance_payables37','run_id','TITULOS_FOLHA','Ha titulos salariais vinculados.'],
 ['payroll_employer_postings120','run_id','PATRONAL','Encargos patronais ja contabilizados.'],
 ['payroll_employer_payables120','run_id','TITULOS_PATRONAIS','Ha titulos patronais vinculados.'],
 ['payroll_vacation_integrations121','run_id','FERIAS_INTEGRADAS','Ferias ja integradas ao diario mensal.'],
 ['payroll_provision_cycles43','run_id','PROVISOES_CONSTITUIDAS','Provisoes ja constituidas para esta folha.'],
 ['payroll_provision_cycles43','competence','PROVISOES_COMPETENCIA','Ha provisoes constituidas nesta competencia.'],
 ['payroll_provision_movements43','competence','PROVISOES_MOVIMENTADAS','Ha movimentos de provisao nesta competencia.'],
 ['payroll_provision_postings45','competence','PROVISOES_CONTABILIZADAS','Ha contabilizacao de provisoes nesta competencia.']
];
const reason125=v=>String(v??'').trim();
function problem125(problems,code,message){
 if(!problems.some(x=>x.code===code))problems.push({code,message});
}
function checks125(tables,runId,competence){
 return LINKS125.filter(([table])=>tables.has(table)).map(([table,field,code,message])=>
  ({sql:"NOT EXISTS (SELECT 1 FROM "+table+" z WHERE z.company_id=? AND z."+field+"=?)",
   args:[null,field==='run_id'?runId:competence],table,field,code,message}));
}
async function inspect125({env,companyId,competenceId,d}){
 const errors=[];
 const comp=await env.DB.prepare("SELECT id,competence,status FROM payroll_competences WHERE company_id=? AND id=?")
  .bind(companyId,competenceId).first();
 if(!comp)throw new d.HttpError(404,'Competencia nao encontrada.','NOT_FOUND');
 const names=new Set(((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results||[]).map(x=>x.name));
 if(comp.status!=='LOCKED')
  problem125(errors,'COMPETENCIA_NAO_BLOQUEADA','A competencia nao esta bloqueada.');
 if(!names.has('payroll_calc_runs')||!names.has('payroll_calc_monthly_reviews'))
  problem125(errors,'HISTORICO_INDISPONIVEL','Nao foi possivel conferir o historico de fechamento da folha.');
 let run=null,review=null;
 if(names.has('payroll_calc_runs')){
  run=await env.DB.prepare("SELECT id,status,revision,source_fingerprint FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY' ORDER BY revision DESC LIMIT 1")
   .bind(companyId,competenceId).first();
 }
 if(!run||run.status!=='APPROVED')
  problem125(errors,'FOLHA_NAO_FECHADA','Nao ha uma ultima revisao mensal aprovada para reabrir.');
 if(run&&names.has('payroll_calc_monthly_reviews')){
  review=await env.DB.prepare("SELECT closed_at,source_fingerprint FROM payroll_calc_monthly_reviews WHERE company_id=? AND run_id=?")
   .bind(companyId,run.id).first();
 }
 if(run&&(!review?.closed_at||review.source_fingerprint!==run.source_fingerprint))
  problem125(errors,'FECHAMENTO_INCONSISTENTE','Fechamento sem conferencia final valida: requer verificacao antes de alterar.');
 if(run){
  const others=await env.DB.prepare("SELECT id FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY' AND status='APPROVED' AND id<>? LIMIT 1")
   .bind(companyId,competenceId,run.id).first();
  if(others)problem125(errors,'OUTRA_REVISAO_APROVADA','Ha mais de uma revisao aprovada nesta competencia.');
 }
 const checks=run?checks125(names,run.id,comp.competence):[];
 for(const x of checks){
  const found=await env.DB.prepare("SELECT 1 AS found FROM "+x.table+" WHERE company_id=? AND "+x.field+"=? LIMIT 1")
   .bind(companyId,x.args[1]).first();
  if(found)problem125(errors,x.code,x.message);
 }
 if(run&&names.has('journal_entries')){
  const journal=await env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference IN (?,?) LIMIT 1")
   .bind(companyId,'MONTHLY:'+run.id,'EMPLOYER120:'+run.id).first();
  if(journal)problem125(errors,'DIARIO_EXISTENTE','Ha diario contabil com origem nesta folha.');
 }
 if(run&&names.has('financial_payables')){
  const title=await env.DB.prepare("SELECT id FROM financial_payables WHERE company_id=? AND source_type IN ('PAYROLL_MONTHLY','PAYROLL_EMPLOYER') AND (source_id=? OR substr(source_id,1,length(?)+1)=?||':') LIMIT 1")
   .bind(companyId,run.id,run.id,run.id).first();
  if(title)problem125(errors,'TITULO_EXISTENTE','Ha titulo financeiro com origem nesta folha.');
 }
 return {kind:'PAYROLL_COMPETENCE_REOPEN_V125',competence_id:comp.id,competence:comp.competence,
  status:comp.status,run_id:run?.id||null,previous_revision:run?.revision||null,
  ready:errors.length===0,problems:errors,read_only:true,checks};
}
export async function payrollCompetenceReopen125(action,{env,companyId,competenceId,auth,request,d,body}){
 await d.requirePermission(env,auth.user.id,companyId,action==='reopen'?'payroll.manage':'payroll.read');
 const plan=await inspect125({env,companyId,competenceId,d});
 const {checks,...safePlan}=plan;
 if(action==='preview')return safePlan;
 if(action!=='reopen')throw new d.HttpError(404,'Acao nao encontrada.','NOT_FOUND');
 if(String(body?.confirmation||'').trim()!=='REABRIR')
  throw new d.HttpError(400,'Digite REABRIR para confirmar.','CONFIRMATION_REQUIRED');
 const justification=reason125(body?.justification);
 if(justification.length<10||justification.length>500)
  throw new d.HttpError(400,'Informe uma justificativa de 10 a 500 caracteres.','JUSTIFICATION_REQUIRED');
 if(!plan.ready)
  throw new d.HttpError(409,'Reabertura bloqueada: '+plan.problems[0].message,'REOPEN_BLOCKED');
 // Mesmo na transacao, a primeira UPDATE exige todos os vinculos ainda ausentes.
 // Um registro contabil/financeiro concorrente impede que a competencia seja liberada.
 const guards=checks.map(x=>x.sql);
 const args=checks.flatMap(x=>[companyId,x.args[1]]);
 const extra=[];
 const extraArgs=[];
 const names=new Set(((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results||[]).map(x=>x.name));
 if(names.has('journal_entries')){
  extra.push("NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.company_id=? AND j.source_module='PAYROLL' AND j.source_reference IN (?,?))");
  extraArgs.push(companyId,'MONTHLY:'+plan.run_id,'EMPLOYER120:'+plan.run_id);
 }
 if(names.has('financial_payables')){
  extra.push("NOT EXISTS (SELECT 1 FROM financial_payables f WHERE f.company_id=? AND f.source_type IN ('PAYROLL_MONTHLY','PAYROLL_EMPLOYER') AND (f.source_id=? OR substr(f.source_id,1,length(?)+1)=?||':'))");
  extraArgs.push(companyId,plan.run_id,plan.run_id,plan.run_id);
 }
 const sql="UPDATE payroll_competences SET status='OPEN' WHERE company_id=? AND id=? AND status='LOCKED'"+
  " AND EXISTS (SELECT 1 FROM payroll_calc_runs r JOIN payroll_calc_monthly_reviews v ON v.run_id=r.id AND v.company_id=r.company_id WHERE r.company_id=? AND r.competence_id=? AND r.id=? AND r.status='APPROVED' AND v.closed_at IS NOT NULL AND v.source_fingerprint=r.source_fingerprint)"+
  [...guards,...extra].map(x=>' AND '+x).join('');
 const stmts=[
  env.DB.prepare(sql).bind(companyId,competenceId,companyId,competenceId,plan.run_id,...args,...extraArgs),
  env.DB.prepare("UPDATE payroll_calc_runs SET status='VOID' WHERE company_id=? AND id=? AND competence_id=? AND status='APPROVED' AND EXISTS(SELECT 1 FROM payroll_competences WHERE company_id=? AND id=? AND status='OPEN')")
   .bind(companyId,plan.run_id,competenceId,companyId,competenceId)
 ];
 const outcome=await env.DB.batch(stmts);
 if(outcome.some(x=>Number(x?.meta?.changes)!==1))
  throw new d.HttpError(409,'A reabertura nao foi confirmada integralmente. Nao processe esta competencia sem conferencia.','REOPEN_CONFLICT');
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'REOPEN',
  entity:'payroll_competences',entityId:competenceId,
  before:{status:'LOCKED',run_id:plan.run_id,revision:plan.previous_revision},
  after:{status:'OPEN',previous_run_status:'VOID',reason:justification}});
 return {kind:'PAYROLL_COMPETENCE_REOPENED_V125',competence_id:competenceId,
  competence:plan.competence,status:'OPEN',previous_run_id:plan.run_id,
  previous_run_status:'VOID',must_recalculate:true};
}
