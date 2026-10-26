// SAGAS Folha v104 — vínculo comprovável de adiantamento de férias ao Financeiro.
// Não cria pagamentos, títulos, lançamentos ou baixas. Apenas lê e vincula origens existentes.
const fail66=(d,msg,code='VACATION_ADVANCE_LINK_BLOCKED',status=409)=>{throw new d.HttpError(status,msg,code)};
const strict66=(v,d,label)=>{
 const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>99999999999)
  fail66(d,'Valor inválido: '+label,'AMOUNT_INVALID');return n;
};
export async function payrollVacationAdvanceSchema66(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_advance_payments66 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,occurrence_id TEXT NOT NULL REFERENCES payroll_employee_occurrences(id) ON DELETE RESTRICT,reconciliation_id TEXT NOT NULL REFERENCES payroll_vacation_reconciliations55(id) ON DELETE RESTRICT,advance_id TEXT NOT NULL REFERENCES payroll_vacation_advances54(id) ON DELETE RESTRICT,payable_id TEXT NOT NULL REFERENCES financial_payables(id) ON DELETE RESTRICT,journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),payment_date TEXT NOT NULL,document_ref TEXT NOT NULL,source_fingerprint TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('ACTIVE','VOID')),created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,voided_by TEXT,voided_at TEXT,void_reason TEXT)"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_vac_advance66_occurrence ON payroll_vacation_advance_payments66(company_id,occurrence_id) WHERE status='ACTIVE'"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_vac_advance66_payable ON payroll_vacation_advance_payments66(company_id,payable_id) WHERE status='ACTIVE'"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_vac_advance66_journal ON payroll_vacation_advance_payments66(company_id,journal_entry_id) WHERE status='ACTIVE'"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_vac_advance66_company ON payroll_vacation_advance_payments66(company_id,reconciliation_id)")
 ]);
}
async function origin66(env,companyId,occurrenceId,d){
 const r=await env.DB.prepare(
  "SELECT r.id AS reconciliation_id,r.plan_fingerprint,r.status AS reconciliation_status,r.advance_amount_cents,r.plan_json,a.id AS advance_id,a.amount_cents,a.payment_date,a.external_reference,a.status AS advance_status,e.id AS employee_id,e.name AS employee_name,o.start_date,o.end_date FROM payroll_vacation_reconciliations55 r JOIN payroll_vacation_advances54 a ON a.id=r.advance_id AND a.company_id=r.company_id JOIN payroll_employee_occurrences o ON o.id=r.occurrence_id AND o.company_id=r.company_id JOIN payroll_employees e ON e.id=r.employee_id AND e.company_id=r.company_id WHERE r.company_id=? AND r.occurrence_id=? AND r.status='RECONCILED' AND a.status='DECLARED' LIMIT 1"
 ).bind(companyId,occurrenceId).first();
 if(!r)fail66(d,'Conciliação e declaração do adiantamento de férias precisam estar ativas.','VACATION_RECONCILIATION_REQUIRED');
 let plan;try{plan=JSON.parse(r.plan_json)}catch{fail66(d,'Plano de férias corrompido.','RECEIPT_INVALID')}
 const amount=strict66(r.amount_cents,d,'adiantamento'),gross=strict66(plan?.external_paid_cents,d,'recibo externo');
 if(amount<=0||amount!==gross||amount!==Number(r.advance_amount_cents))
  fail66(d,'Recibo conciliado diverge do adiantamento declarado.','RECEIPT_MISMATCH');
 if(!r.plan_fingerprint||!r.external_reference||!r.payment_date)
  fail66(d,'Origem sem documento, data ou assinatura.','DOCUMENT_MISSING');
 return {reconciliation_id:r.reconciliation_id,advance_id:r.advance_id,
  employee_id:r.employee_id,employee_name:r.employee_name,occurrence_id:occurrenceId,
  amount_cents:amount,payment_date:r.payment_date,document_ref:String(r.external_reference).trim(),
  plan_fingerprint:r.plan_fingerprint};
}
async function paid66(env,companyId,payableId,origin,d){
 const p=await env.DB.prepare(
  "SELECT id,number,source_type,source_id,status,amount_cents,balance_cents,payment_cash_cents,payment_date,document_number,payment_cash_account_id,payment_journal_entry_id,payment_discount_cents,payment_advance_cents,payment_interest_cents,paid_by,paid_at FROM financial_payables WHERE company_id=? AND id=? LIMIT 1"
 ).bind(companyId,payableId).first();
 if(!p)fail66(d,'Título financeiro inexistente nesta empresa.','PAYABLE_NOT_FOUND',404);
 if(p.source_type==='PAYROLL_MONTHLY'||p.status!=='PAID'||Number(p.balance_cents)!==0||
    !p.paid_by||!p.paid_at||!p.payment_cash_account_id||!p.payment_journal_entry_id)
  fail66(d,'Selecione um título externo já pago e contabilizado, diferente da folha mensal.','PAYABLE_NOT_ELIGIBLE');
 if(strict66(p.amount_cents,d,'valor do título')!==origin.amount_cents||
    strict66(p.payment_cash_cents,d,'valor baixado')!==origin.amount_cents||
    Number(p.payment_discount_cents||0)!==0||Number(p.payment_advance_cents||0)!==0||
    Number(p.payment_interest_cents||0)!==0)
  fail66(d,'Baixa financeira não corresponde exatamente ao líquido do recibo.','PAYMENT_AMOUNT_MISMATCH');
 if(p.payment_date!==origin.payment_date||String(p.document_number||'').trim()!==origin.document_ref)
  fail66(d,'Data ou número do documento do título divergem do adiantamento de férias.','PAYMENT_DOCUMENT_MISMATCH');
 const j=await env.DB.prepare(
  "SELECT id,status,entry_date,source_module,source_reference,total_debit_cents,total_credit_cents FROM journal_entries WHERE company_id=? AND id=? LIMIT 1"
 ).bind(companyId,p.payment_journal_entry_id).first();
 if(!j||j.status!=='POSTED'||j.source_module!=='FINANCE'||
    j.source_reference!=='PAYABLE_PAYMENT:'+p.id||j.entry_date!==p.payment_date||
    Number(j.total_debit_cents)!==Number(j.total_credit_cents)||
    Number(j.total_debit_cents)<origin.amount_cents)
  fail66(d,'Lançamento de baixa inexistente, anulado ou incompatível com o título.','JOURNAL_NOT_VERIFIED');
 const account=await env.DB.prepare(
  "SELECT id,active,credit_account_id FROM financial_cash_accounts WHERE company_id=? AND id=?"
 ).bind(companyId,p.payment_cash_account_id).first();
 if(!account||Number(account.active)!==1||!account.credit_account_id)
  fail66(d,'Conta/Caixa não possui conta de crédito configurada e ativa.','CASH_NOT_VERIFIED');
 const bankCredit=await env.DB.prepare(
  "SELECT id,amount_cents FROM journal_lines WHERE company_id=? AND entry_id=? AND account_id=? AND side='C' AND amount_cents=? LIMIT 1"
 ).bind(companyId,j.id,account.credit_account_id,origin.amount_cents).first();
 if(!bankCredit)fail66(d,'O lançamento não possui crédito bancário igual ao líquido pago.','BANK_CREDIT_NOT_VERIFIED');
 const payrollJournal=await env.DB.prepare(
  "SELECT run_id FROM payroll_finance_postings37 WHERE company_id=? AND journal_entry_id=? LIMIT 1"
 ).bind(companyId,j.id).first();
 if(payrollJournal)fail66(d,'Lançamento financeiro já é origem de outra folha mensal.','JOURNAL_ALREADY_USED');
 return {payable_id:p.id,payable_number:p.number,journal_entry_id:j.id,
  payment_date:p.payment_date,amount_cents:origin.amount_cents,
  document_ref:origin.document_ref,bank_credit_line_id:bankCredit.id,
  linked_cash_account_id:p.payment_cash_account_id};
}
async function active66(env,companyId,occurrenceId){
 return env.DB.prepare(
  "SELECT id,company_id,occurrence_id,reconciliation_id,advance_id,payable_id,journal_entry_id,amount_cents,payment_date,document_ref,source_fingerprint,created_by,created_at FROM payroll_vacation_advance_payments66 WHERE company_id=? AND occurrence_id=? AND status='ACTIVE' LIMIT 1"
 ).bind(companyId,occurrenceId).first();
}
export async function payrollVacationAdvanceEvidence66(env,companyId,occurrenceId,d){
 const current=await active66(env,companyId,occurrenceId);
 if(!current)return {linked:false,payment_verified:false};
 try{
  const origin=await origin66(env,companyId,occurrenceId,d);
  if(origin.reconciliation_id!==current.reconciliation_id||origin.advance_id!==current.advance_id||
    current.source_fingerprint!==origin.plan_fingerprint||Number(current.amount_cents)!==origin.amount_cents||
    current.payment_date!==origin.payment_date||current.document_ref!==origin.document_ref)
   return {linked:true,payment_verified:false,status:'SOURCE_CHANGED',id:current.id,payable_id:current.payable_id};
  const verified=await paid66(env,companyId,current.payable_id,origin,d);
  if(verified.journal_entry_id!==current.journal_entry_id)
   return {linked:true,payment_verified:false,status:'JOURNAL_CHANGED',id:current.id,payable_id:current.payable_id};
  return {linked:true,payment_verified:true,status:'VALID',id:current.id,
   payable_id:verified.payable_id,payable_number:verified.payable_number,
   journal_entry_id:verified.journal_entry_id,amount_cents:verified.amount_cents,
   payment_date:verified.payment_date,document_ref:verified.document_ref,
   source_fingerprint:current.source_fingerprint};
 }catch(e){
  return {linked:true,payment_verified:false,status:e?.code||'INVALID',id:current.id,payable_id:current.payable_id};
 }
}
export async function payrollVacationAdvance66(action,c){
 const {env,companyId,auth,request,d,body={}}=c;
 if(!['read','link','void'].includes(action))fail66(d,'Operação de vínculo inexistente.','NOT_FOUND',404);
 await d.requirePermission(env,auth.user.id,companyId,action==='read'?'payroll.read':'payroll.manage');
 if(action!=='read')await d.requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
 await d.ensureSchemaRevision(env,'payroll-vacation-advance-link66',1,()=>payrollVacationAdvanceSchema66(env));
 const occurrenceId=String(action==='read'?c.occurrenceId||'':body.occurrence_id||'').trim();
 if(!occurrenceId||occurrenceId.length>128)fail66(d,'Informe a ocorrência de férias.','INVALID_OCCURRENCE',400);
 const origin=await origin66(env,companyId,occurrenceId,d);
 const current=await active66(env,companyId,occurrenceId);
 const verified=await payrollVacationAdvanceEvidence66(env,companyId,occurrenceId,d);
 const response={occurrence_id:occurrenceId,employee_id:origin.employee_id,employee_name:origin.employee_name,
  advance:{amount_cents:origin.amount_cents,payment_date:origin.payment_date,
   document_ref:origin.document_ref},linked:verified,read_only:action==='read',
  note:'Vínculo de títulos já pagos; não cria novo pagamento, baixa ou lançamento. O registro no SAGAS não substitui extrato bancário.'};
 if(action==='read'){
  const rows=(await env.DB.prepare(
   "SELECT p.id,p.number,p.document_number,p.payment_date,p.payment_cash_cents,p.payment_journal_entry_id FROM financial_payables p WHERE p.company_id=? AND p.status='PAID' AND p.source_type<>'PAYROLL_MONTHLY' AND p.amount_cents=? AND p.payment_cash_cents=? AND p.payment_date=? AND p.document_number=? AND p.payment_journal_entry_id IS NOT NULL ORDER BY p.number LIMIT 51"
  ).bind(companyId,origin.amount_cents,origin.amount_cents,origin.payment_date,origin.document_ref).all()).results||[];
  if(rows.length>50)fail66(d,'Mais de 50 títulos candidatos; detalhe o documento.','CANDIDATE_LIMIT');
  return {...response,candidates:rows};
 }
 if(action==='void'){
  if(!current)fail66(d,'Não há vínculo ativo para desfazer.','LINK_NOT_FOUND',404);
  if(body.confirmation!=='DESVINCULAR ADIANTAMENTO')fail66(d,'Confirme digitando DESVINCULAR ADIANTAMENTO.','CONFIRMATION_REQUIRED',400);
  const notes=String(body.notes||'').trim();
  if(notes.length<15||notes.length>600)fail66(d,'Informe justificativa entre 15 e 600 caracteres.','INVALID_NOTES',400);
  const r=await env.DB.prepare("UPDATE payroll_vacation_advance_payments66 SET status='VOID',voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=? WHERE id=? AND company_id=? AND status='ACTIVE'").bind(auth.user.id,notes,current.id,companyId).run();
  if(Number(r.meta?.changes)!==1)fail66(d,'O vínculo foi modificado por outra operação.','CONFLICT');
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'VOID',entity:'payroll_vacation_advance_payments66',entityId:current.id,after:{reason:notes}});
  return {voided:true,payment_verified:false};
 }
 const payableId=String(body.payable_id||'').trim();
 if(!payableId||payableId.length>128)fail66(d,'Selecione um título já pago.','INVALID_PAYABLE',400);
 if(body.confirmation!=='VINCULAR ADIANTAMENTO')fail66(d,'Confirme digitando VINCULAR ADIANTAMENTO.','CONFIRMATION_REQUIRED',400);
 if(current){
  if(current.payable_id===payableId&&verified.payment_verified)return {linked:true,reused:true,link_id:current.id,evidence:verified};
  fail66(d,'A ocorrência já tem vínculo; desvincule primeiro para corrigir.','LINK_EXISTS');
 }
 const financial=await paid66(env,companyId,payableId,origin,d);
 const id=d.uuid();
 try{
  const r=await env.DB.prepare(
   "INSERT INTO payroll_vacation_advance_payments66(id,company_id,occurrence_id,reconciliation_id,advance_id,payable_id,journal_entry_id,amount_cents,payment_date,document_ref,source_fingerprint,status,created_by) SELECT ?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',? WHERE EXISTS(SELECT 1 FROM financial_payables WHERE company_id=? AND id=? AND status='PAID' AND payment_journal_entry_id=? AND payment_cash_cents=?)"
  ).bind(id,companyId,occurrenceId,origin.reconciliation_id,origin.advance_id,financial.payable_id,financial.journal_entry_id,origin.amount_cents,origin.payment_date,origin.document_ref,origin.plan_fingerprint,auth.user.id,companyId,financial.payable_id,financial.journal_entry_id,origin.amount_cents).run();
  if(Number(r?.meta?.changes)!==1)fail66(d,'Pagamento alterado durante a vinculação.','SOURCE_CHANGED');
 }catch(e){
  if(/UNIQUE|FOREIGN KEY|constraint failed/i.test(String(e)))fail66(d,'Recibo ou título já está vinculado a outra operação.','DUPLICATE_LINK');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'CREATE',entity:'payroll_vacation_advance_payments66',entityId:id,after:{occurrence_id:occurrenceId,payable_id:financial.payable_id,journal_entry_id:financial.journal_entry_id,amount_cents:origin.amount_cents}});
 return {linked:true,reused:false,link_id:id,evidence:await payrollVacationAdvanceEvidence66(env,companyId,occurrenceId,d)};
}
