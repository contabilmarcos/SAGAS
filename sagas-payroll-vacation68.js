// SAGAS Folha v105 — vínculo explícito entre ocorrência e baixa de provisão.
// Não constitui, baixa ou contabiliza provisões: associa movimento já registrado.
function fail68(d,code,message,status=409){throw new d.HttpError(status,message,code)}
const AMOUNTS68={FERIAS:'remuneration_cents',TERCO_FERIAS:'constitutional_third_cents'};
export async function payrollVacationUseLinkSchema68(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_provision_use_links68 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,occurrence_id TEXT NOT NULL REFERENCES payroll_employee_occurrences(id) ON DELETE RESTRICT,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,component TEXT NOT NULL CHECK(component IN ('FERIAS','TERCO_FERIAS')),competence TEXT NOT NULL,movement_id TEXT NOT NULL REFERENCES payroll_provision_movements43(id) ON DELETE RESTRICT,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),status TEXT NOT NULL CHECK(status IN ('ACTIVE','VOID')),created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,voided_by TEXT,voided_at TEXT,void_reason TEXT)"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_vac_use68_movement ON payroll_vacation_provision_use_links68(company_id,movement_id) WHERE status='ACTIVE'"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_vac_use68_occ ON payroll_vacation_provision_use_links68(company_id,occurrence_id,competence,component,status)")
 ]);
}
async function source68(env,companyId,runId,occurrenceId,component,d){
 if(!Object.hasOwn(AMOUNTS68,component))fail68(d,'COMPONENT_INVALID','Selecione férias ou terço constitucional.',400);
 const row=await env.DB.prepare(
  "SELECT r.plan_json,r.id AS reconciliation_id,r.status AS reconciliation_status,a.external_reference,o.employee_id,pr.competence,pr.id AS run_id FROM payroll_vacation_monthly_usage100 u JOIN payroll_vacation_monthly_stage61 s ON s.id=u.stage_id AND s.company_id=u.company_id JOIN payroll_calc_runs run ON run.id=u.run_id AND run.company_id=u.company_id AND run.process_kind='MONTHLY' JOIN payroll_competences pr ON pr.id=run.competence_id AND pr.company_id=run.company_id JOIN payroll_employee_occurrences o ON o.id=s.occurrence_id AND o.company_id=s.company_id JOIN payroll_vacation_reconciliations55 r ON r.company_id=s.company_id AND r.occurrence_id=s.occurrence_id AND r.status='RECONCILED' JOIN payroll_vacation_advances54 a ON a.id=r.advance_id AND a.company_id=r.company_id WHERE u.company_id=? AND u.run_id=? AND s.occurrence_id=? AND s.status='STAGED' AND u.employee_id=o.employee_id LIMIT 1"
 ).bind(companyId,runId,occurrenceId).first();
 if(!row)fail68(d,'OCCURRENCE_NOT_STAGED','Ocorrência não vinculada a essa folha mensal.','NOT_FOUND');
 let plan;try{plan=JSON.parse(row.plan_json)}catch{fail68(d,'RECEIPT_INVALID','Plano de férias não pode ser lido.')}
 const months=(plan?.periods||[]).filter(x=>x.competence===row.competence);
 if(months.length!==1)fail68(d,'VACATION_MONTH_INVALID','Férias não têm período único na competência.');
 const expected=Number(months[0][AMOUNTS68[component]]);
 if(!Number.isSafeInteger(expected)||expected<0||expected>99999999999)
  fail68(d,'VACATION_AMOUNT_INVALID','Verba de férias ou terço inválida.');
 return {run_id:runId,occurrence_id:occurrenceId,employee_id:row.employee_id,
  competence:row.competence,component,expected_cents:expected,document_ref:String(row.external_reference||'').trim()};
}
async function lines68(env,companyId,source){
 return (await env.DB.prepare(
  "SELECT l.id,l.movement_id,l.amount_cents,l.created_at,m.document_ref,p.journal_entry_id,j.status AS journal_status FROM payroll_vacation_provision_use_links68 l JOIN payroll_provision_movements43 m ON m.id=l.movement_id AND m.company_id=l.company_id LEFT JOIN payroll_provision_posted_movements45 pm ON pm.company_id=l.company_id AND pm.movement_id=l.movement_id LEFT JOIN payroll_provision_postings45 p ON p.id=pm.posting_id AND p.company_id=l.company_id LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=l.company_id WHERE l.company_id=? AND l.occurrence_id=? AND l.competence=? AND l.component=? AND l.status='ACTIVE' ORDER BY l.created_at,l.id"
 ).bind(companyId,source.occurrence_id,source.competence,source.component).all()).results||[];
}
export async function payrollVacationUseLink68(action,c){
 const {env,companyId,auth,request,runId,d,body={}}=c;
 if(!['read','link','void'].includes(action))fail68(d,'NOT_FOUND','Ação inexistente.',404);
 await d.requirePermission(env,auth.user.id,companyId,action==='read'?'payroll.read':'payroll.manage');
 if(action!=='read')await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
 await d.ensureSchemaRevision(env,'payroll-vacation-use-link68',1,()=>payrollVacationUseLinkSchema68(env));
 const occurrenceId=String(action==='read'?c.occurrenceId||'':body.occurrence_id||'').trim();
 const component=String(action==='read'?c.component||'':body.component||'').trim();
 if(!occurrenceId||occurrenceId.length>128)fail68(d,'OCCURRENCE_INVALID','Informe uma ocorrência de férias.',400);
 const source=await source68(env,companyId,runId,occurrenceId,component,d);
 const linked=await lines68(env,companyId,source);
 const linkedTotal=linked.reduce((a,x)=>a+Number(x.amount_cents),0);
 if(!Number.isSafeInteger(linkedTotal)||linkedTotal<0||linkedTotal>source.expected_cents)
  fail68(d,'LINK_TOTAL_INVALID','A soma dos vínculos é superior à verba da competência.');
 const status={...source,linked_cents:linkedTotal,remaining_cents:source.expected_cents-linkedTotal,links:linked,
  ready_for_accounting:false,read_only:action==='read',
  note:'Associação de origem já contabilizada. Não cria baixa, despesa ou título financeiro.'};
 if(action==='read'){
  const candidates=(await env.DB.prepare(
   "SELECT m.id,m.amount_cents,m.document_ref,m.competence,cc.code AS cost_center_code,j.id AS journal_entry_id,j.status AS journal_status,l.movement_id AS linked_elsewhere FROM payroll_provision_movements43 m JOIN payroll_provision_posted_movements45 pm ON pm.company_id=m.company_id AND pm.movement_id=m.id JOIN payroll_provision_postings45 p ON p.company_id=pm.company_id AND p.id=pm.posting_id AND p.kind='USE' JOIN journal_entries j ON j.company_id=p.company_id AND j.id=p.journal_entry_id AND j.status='POSTED' LEFT JOIN payroll_vacation_provision_use_links68 l ON l.company_id=m.company_id AND l.movement_id=m.id AND l.status='ACTIVE' LEFT JOIN cost_centers cc ON cc.company_id=m.company_id AND cc.id=m.cost_center_id WHERE m.company_id=? AND m.employee_id=? AND m.component=? AND m.competence=? AND m.movement_kind='USE' AND m.document_ref=? ORDER BY m.id LIMIT 101"
  ).bind(companyId,source.employee_id,source.component,source.competence,source.document_ref).all()).results||[];
  if(candidates.length>100)fail68(d,'CANDIDATE_LIMIT','Há mais de 100 baixas candidatas; detalhe o histórico.');
  return {...status,candidates:candidates.filter(x=>!x.linked_elsewhere&&Number(x.amount_cents)<0&&
   -Number(x.amount_cents)<=status.remaining_cents)};
 }
 if(action==='void'){
  if(body.confirmation!=='DESVINCULAR BAIXA FERIAS')
   fail68(d,'CONFIRMATION_REQUIRED','Confirme digitando DESVINCULAR BAIXA FERIAS.',400);
  const note=String(body.notes||'').trim();
  if(note.length<15||note.length>600)fail68(d,'INVALID_NOTES','Informe justificativa entre 15 e 600 caracteres.',400);
  const link=linked.find(x=>x.id===String(body.link_id||''));
  if(!link)fail68(d,'LINK_NOT_FOUND','Vínculo não encontrado nesta ocorrência.',404);
  const r=await env.DB.prepare(
   "UPDATE payroll_vacation_provision_use_links68 SET status='VOID',voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=? WHERE company_id=? AND id=? AND status='ACTIVE'"
  ).bind(auth.user.id,note,companyId,link.id).run();
  if(Number(r?.meta?.changes)!==1)fail68(d,'VERSION_CONFLICT','Vínculo alterado simultaneamente.');
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'VOID',
   entity:'payroll_vacation_provision_use_links68',entityId:link.id,after:{reason:note}});
  return {voided:true,link_id:link.id,ready_for_accounting:false};
 }
 if(body.confirmation!=='VINCULAR BAIXA FERIAS')
  fail68(d,'CONFIRMATION_REQUIRED','Confirme digitando VINCULAR BAIXA FERIAS.',400);
 const movementId=String(body.movement_id||'').trim();
 if(!movementId||movementId.length>128)fail68(d,'MOVEMENT_INVALID','Selecione uma baixa da provisão.',400);
 if(linked.some(x=>x.movement_id===movementId))return {linked:true,reused:true,movement_id:movementId,ready_for_accounting:false};
 if(!source.expected_cents||status.remaining_cents<=0)fail68(d,'NO_REMAINING','Verba já está integralmente vinculada.');
 const movement=await env.DB.prepare(
  "SELECT m.id,m.employee_id,m.component,m.competence,m.movement_kind,m.amount_cents,m.document_ref,pm.posting_id,p.kind AS posting_kind,p.journal_entry_id,j.status AS journal_status FROM payroll_provision_movements43 m JOIN payroll_provision_posted_movements45 pm ON pm.company_id=m.company_id AND pm.movement_id=m.id JOIN payroll_provision_postings45 p ON p.id=pm.posting_id AND p.company_id=m.company_id JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=m.company_id WHERE m.company_id=? AND m.id=? LIMIT 1"
 ).bind(companyId,movementId).first();
 if(!movement||movement.employee_id!==source.employee_id||movement.component!==source.component||
    movement.competence!==source.competence||movement.movement_kind!=='USE'||
    movement.posting_kind!=='USE'||movement.journal_status!=='POSTED'||
    movement.document_ref!==source.document_ref)
  fail68(d,'MOVEMENT_NOT_ELIGIBLE','Baixa precisa corresponder ao funcionário, documento, competência, componente e lançamento postado.');
 const amount=-Number(movement.amount_cents);
 if(!Number.isSafeInteger(amount)||amount<=0||amount>status.remaining_cents)
  fail68(d,'AMOUNT_EXCEEDS','Baixa excede o saldo do direito a vincular.');
 const id=d.uuid();
 try{
  const r=await env.DB.prepare(
   "INSERT INTO payroll_vacation_provision_use_links68(id,company_id,occurrence_id,employee_id,component,competence,movement_id,amount_cents,status,created_by) SELECT ?,?,?,?,?,?,?,?,'ACTIVE',? WHERE NOT EXISTS(SELECT 1 FROM payroll_vacation_provision_use_links68 WHERE company_id=? AND movement_id=? AND status='ACTIVE') AND (SELECT COALESCE(SUM(amount_cents),0) FROM payroll_vacation_provision_use_links68 WHERE company_id=? AND occurrence_id=? AND component=? AND competence=? AND status='ACTIVE')+?<=?"
  ).bind(id,companyId,source.occurrence_id,source.employee_id,source.component,source.competence,movementId,amount,auth.user.id,
    companyId,movementId,companyId,source.occurrence_id,source.component,source.competence,amount,source.expected_cents).run();
  if(Number(r?.meta?.changes)!==1)fail68(d,'LINK_CONFLICT','Baixa vinculada por outra operação ou limite excedido.');
 }catch(e){
  if(/UNIQUE|FOREIGN KEY|constraint failed/i.test(String(e)))
   fail68(d,'LINK_CONFLICT','A baixa já pertence a outra ocorrência. Atualize a conferência.');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'CREATE',
  entity:'payroll_vacation_provision_use_links68',entityId:id,
  after:{occurrence_id:source.occurrence_id,movement_id:movementId,amount_cents:amount}});
 return {linked:true,reused:false,link_id:id,amount_cents:amount,ready_for_accounting:false};
}
