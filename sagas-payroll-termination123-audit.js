// SAGAS v123 — auditoria read-only da rescisão já contabilizada.
// Independente de a pessoa permanecer ativa; não recalcula TRCT após desligamento.
export async function payrollTerminationAudit123(c){
 const {env,companyId,body={},employeeId,d}=c;
 await d.requirePermission(env,c.auth.user.id,companyId,'payroll.read');
 const emp=String(body.employee_id||employeeId||''),at=String(body.termination_date||'');
 if(!emp||!/^20\d\d-\d\d-\d\d$/.test(at))
  throw new d.HttpError(400,'Informe funcionário e data do desligamento.','AUDIT_REFERENCE');
 const r=await env.DB.prepare(
  "SELECT p.*,a.gross_cents,a.payment_date,a.trct_reference,a.notice_kind,f.guide_reference,f.due_date AS fgts_due_date,e.name AS employee_name,e.active AS employee_active,e.cost_center_id AS employee_center,n.number AS employee_number FROM payroll_termination_postings123 p JOIN payroll_termination_approvals123 a ON a.id=p.approval_id AND a.company_id=p.company_id JOIN payroll_termination_fgts_documents123 f ON f.id=a.fgts_document_id AND f.company_id=a.company_id JOIN payroll_employees e ON e.id=p.employee_id AND e.company_id=p.company_id LEFT JOIN payroll_employee_numbers n ON n.company_id=p.company_id AND n.employee_id=p.employee_id WHERE p.company_id=? AND p.employee_id=? AND p.termination_date=?"
 ).bind(companyId,emp,at).first();
 if(!r)return {applicable:false,integrated:false,termination_date:at,note:'Não há rescisão sem justa causa integrada para esta data.'};
 const problems=[];const add=(code,message)=>problems.push({code,message});
 if(Number(r.employee_active)!==0)add('EMPLOYEE_ACTIVE','Funcionário ainda consta ativo.');
 const [history,employeeTitle,fgtsTitle]=await Promise.all([
  env.DB.prepare("SELECT id,situation,effective_from FROM payroll_employee_functional_history WHERE company_id=? AND id=? AND employee_id=?").bind(companyId,r.history_id,emp).first(),
  env.DB.prepare("SELECT id,source_type,source_id,supplier_id,amount_cents,status,due_date FROM financial_payables WHERE company_id=? AND id=?").bind(companyId,r.employee_payable_id).first(),
  env.DB.prepare("SELECT id,source_type,source_id,supplier_id,amount_cents,status,due_date FROM financial_payables WHERE company_id=? AND id=?").bind(companyId,r.fgts_payable_id).first()
 ]);
 if(!history||history.situation!=='DESLIGADO'||history.effective_from!==at)
  add('FUNCTIONAL_HISTORY_INVALID','Histórico do desligamento não confere com a data.');
 if(!employeeTitle||employeeTitle.source_type!=='PAYROLL_TERMINATION'||employeeTitle.source_id!==r.id||
    employeeTitle.supplier_id!==emp||Number(employeeTitle.amount_cents)!==Number(r.net_cents)||
    employeeTitle.due_date!==r.payment_date||!['OPEN','PAID'].includes(employeeTitle.status))
  add('EMPLOYEE_PAYABLE_INVALID','Título do líquido rescisório ausente ou divergente.');
 if(!fgtsTitle||fgtsTitle.source_type!=='PAYROLL_TERMINATION_FGTS'||fgtsTitle.source_id!==r.id||
    Number(fgtsTitle.amount_cents)!==Number(r.fgts_fine_cents)||
    fgtsTitle.due_date!==r.fgts_due_date||!['OPEN','PAID'].includes(fgtsTitle.status))
  add('FGTS_PAYABLE_INVALID','Título da multa FGTS ausente ou divergente da guia.');
 const journals=[
  {kind:'TRCT',id:r.settlement_journal_id,reference:'TERMINATION_SETTLE:'+emp+':'+at,value:r.gross_cents},
  {kind:'FGTS_FINE',id:r.fgts_journal_id,reference:'TERMINATION_FGTS_FINE:'+emp+':'+at,value:r.fgts_fine_cents},
  ...(Number(r.provision_cents)>0?[{kind:'PROVISION_USE',id:r.provision_journal_id,reference:'TERMINATION_USE:'+emp+':'+at,value:r.provision_cents}]:[])
 ];
 for(const j of journals){
  const entry=await env.DB.prepare(
   "SELECT status,source_module,source_reference,total_debit_cents,total_credit_cents FROM journal_entries WHERE company_id=? AND id=?"
  ).bind(companyId,j.id).first();
  if(!entry||entry.status!=='POSTED'||entry.source_module!=='PAYROLL'||entry.source_reference!==j.reference||
     Number(entry.total_debit_cents)!==Number(j.value)||Number(entry.total_credit_cents)!==Number(j.value)){
   add('JOURNAL_'+j.kind+'_INVALID','Diário '+j.kind+' ausente ou divergente.');continue;
  }
  const lines=(await env.DB.prepare(
   "SELECT side,cost_center_id,SUM(amount_cents) AS amount_cents FROM journal_lines WHERE company_id=? AND entry_id=? GROUP BY side,cost_center_id"
  ).bind(companyId,j.id).all()).results||[];
  let debit=0,credit=0;const cc=new Map();
  for(const x of lines){
   const n=Number(x.amount_cents);
   if(!x.cost_center_id||!Number.isSafeInteger(n)||n<=0||!['D','C'].includes(x.side)){
    add('JOURNAL_LINE_INVALID','Partida contábil com lado, valor ou centro de custo inválido.');continue;
   }
   const previous=cc.get(x.cost_center_id)||{D:0,C:0};
   previous[x.side]+=n;cc.set(x.cost_center_id,previous);
   if(x.side==='D')debit+=n;else credit+=n;
  }
  if(debit!==Number(j.value)||credit!==Number(j.value)||
     [...cc.values()].some(x=>x.D!==x.C))
   add('JOURNAL_'+j.kind+'_UNBALANCED','Diário '+j.kind+' não concilia por centro de custo.');
 }
 if(Number(r.provision_cents)>0){
  const [posted,moves]=await Promise.all([
   env.DB.prepare("SELECT journal_entry_id,kind,total_cents FROM payroll_provision_postings45 WHERE company_id=? AND id=?").bind(companyId,r.provision_posting_id).first(),
   env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(m.amount_cents),0) AS amount_cents,COALESCE(SUM(CASE WHEN m.employee_id<>? OR m.movement_kind<>'USE' OR m.competence<>? THEN 1 ELSE 0 END),0) AS invalid_count FROM payroll_provision_posted_movements45 z JOIN payroll_provision_movements43 m ON m.id=z.movement_id AND m.company_id=z.company_id WHERE z.company_id=? AND z.posting_id=?").bind(emp,at.slice(0,7),companyId,r.provision_posting_id).first()
  ]);
  if(!posted||posted.kind!=='USE'||posted.journal_entry_id!==r.provision_journal_id||
     Number(posted.total_cents)!==Number(r.provision_cents)||
     !moves||Number(moves.count)<1||Number(moves.invalid_count)!==0||
     Number(moves.amount_cents)!==-Number(r.provision_cents))
   add('PROVISION_ACCOUNTING_INVALID','Baixas e diário de provisões não conciliam.');
 }
 return {kind:'TERMINATION_AUDIT_V123',applicable:true,integrated:true,
  employee:{id:emp,code:r.employee_number==null?null:String(r.employee_number).padStart(5,'0'),name:r.employee_name,cost_center_id:r.employee_center},
  employee_situation:Number(r.employee_active)===0?'DESLIGADO':'DIVERGENTE',
  termination_date:at,termination_kind:'WITHOUT_CAUSE',notice_kind:r.notice_kind,
  gross_cents:Number(r.gross_cents),net_cents:Number(r.net_cents),fgts_fine_cents:Number(r.fgts_fine_cents),
  payable_due_date:r.payment_date,fgts:{guide_reference:r.guide_reference,due_date:r.fgts_due_date},
  financial:{employee_payable_id:r.employee_payable_id,employee_payable_status:employeeTitle?.status||null,
   fgts_payable_id:r.fgts_payable_id,fgts_payable_status:fgtsTitle?.status||null},
  journal_ids:journals.map(x=>x.id),posting:{id:r.id,posted_at:r.posted_at},
  verified:problems.length===0,problems,ready_for_approval:false,ready_for_integration:false,
  accounting_generated:true,financial_generated:true,read_only:true,
  note:'Conferência interna de diário e títulos, não prova quitação bancária, recolhimento oficial ou envio eSocial.'};
}
