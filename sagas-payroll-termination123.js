// SAGAS Folha v123 — dispensa sem justa causa: quitação rescisória + indenização FGTS digital homologada em títulos e diários independentes.
// Apenas modalidade RESIGNATION com TRCT e valores exatamente reconciliados,
// base tributaria v117 documentada, baixa patrimonial v118, naturezas v119,
// aprovacao imutavel e diario/financeiro/historico funcional no mesmo DB.batch.
// Dispensa sem justa causa permanece BLOQUEADA (multa FGTS nao implementada).
import {payrollTermination117} from './sagas-payroll-termination117.js';
import {payrollTermination118} from './sagas-payroll-termination118.js';
import {payrollTermination119,split119} from './sagas-payroll-termination119.js';
const MAX123=99999999999;
const AUTHORIZED123=new Set([
 'PRECHECK_SOURCE_VACATION_RIGHTS_UNVERIFIED',
 'PRECHECK_SOURCE_TAX_CALC_PENDING',
 'PRECHECK_SOURCE_PENDING_CLOSING',
 'PRECHECK_SOURCE_FGTS_STATEMENT'
]);
function issue123(out,code,message){
 if(!out.some(x=>x.code===code&&x.message===message))out.push({code,message});
}
function error123(d,code,message,status=409){throw new d.HttpError(status,message,code)}
function money123(v){return typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=MAX123}
function strictDate123(v){
 const s=String(v||'');
 return /^20\d\d-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&
  new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
}
function doc123(v,d,label,min=8,max=240){
 const s=String(v||'').trim();
 if(s.length<min||s.length>max||/[\u0000-\u001f]/.test(s))
  error123(d,'DOCUMENT_REQUIRED','Informe '+label+' com '+min+' a '+max+' caracteres.',400);
 return s;
}
function plus123(nums){
 if(!nums.every(money123))return null;
 const sum=nums.reduce((a,b)=>a+BigInt(b),0n);
 return sum>BigInt(MAX123)?null:Number(sum);
}
function totals123(lines){
 if(!Array.isArray(lines))return {D:null,C:null};
 const D=plus123(lines.filter(x=>x.side==='D').map(x=>x.amount_cents));
 const C=plus123(lines.filter(x=>x.side==='C').map(x=>x.amount_cents));
 return {D,C};
}
export function assess123(review,diag,plan,approval,existing,employee,fgtsDoc=null,fgtsConfig=null,fgtsLines=null,foreign=null){
 const problems=[];
 const add=(code,message)=>issue123(problems,code,message);
 if(review?.termination_kind!=='WITHOUT_CAUSE')
  add('ONLY_DISMISSAL','Esta integração exige dispensa sem justa causa, não pedido de demissão.');
 if(!['WORKED','INDEMNIFIED'].includes(review?.notice_kind))
  add('NOTICE_NOT_SUPPORTED','Modalidade do aviso incompatível com dispensa sem justa causa.');
 if(String(review?.termination_date||'').slice(0,4)!=='2026')
  add('YEAR_UNSUPPORTED','Cálculo tributário e conclusão desta rotina restritos a 2026.');
 if(!strictDate123(review?.termination_date))
  add('DATE_INVALID','Data de desligamento inválida.');
 if(strictDate123(review?.termination_date)&&review.termination_date>new Date().toISOString().slice(0,10))
  add('FUTURE_TERMINATION','Data futura: não é permitido alterar a situação funcional antes do desligamento.');
 if(!review?.documentary_ready||!review?.deduction_ready||!review?.tax_ready_for_review||
    review?.tax_issues?.length||review?.documentary_issues?.length||review?.deduction_issues?.length)
  add('DOCUMENTARY_TAX_NOT_READY','TRCT, férias, descontos, INSS e IRRF precisam estar integralmente conciliados.');
 if(review?.tax_comparison?.matched!==true||!review?.tax_summary)
  add('TAX_NOT_RECONCILED','INSS e IRRF não coincidem com os valores documentados.');
 if(!plan||!diag||review?.source_fingerprint!==diag.tax_source_fingerprint)
  add('SOURCE_CHANGED','Minutas tributária, de provisões e de contabilização não coincidem.');
 if(review?.employee?.id!==plan?.employee?.id||review?.employee?.id!==diag?.employee?.id)
  add('EMPLOYEE_MISMATCH','As memórias de cálculo são de funcionários diferentes.');
 if(!employee||Number(employee.active)!==1||employee.cost_center_id!==review.employee?.cost_center_id||
    !employee.position_id)
  add('EMPLOYEE_NOT_ACTIVE','Funcionário inativo ou centro de custo/posição não coincidem com os cálculos.');
 if(!plan?.batch_id||!strictDate123(plan?.payment_date))
  add('BATCH_OR_DATE_MISSING','Configure lote contábil aberto e data de pagamento no contexto tributário.');
 if(existing||foreign)add('ALREADY_FINALIZED','Esta rescisão já possui encerramento registrado na v122 ou v123.');
 for(const b of plan?.blocks||[]){
  if(AUTHORIZED123.has(b.code))continue;
  add('BLOCKED_'+b.code,b.message||'Pendência da minuta contábil.');
 }
 const due=String(plan?.payment_date||'');
 if(strictDate123(due)&&strictDate123(review?.termination_date)){
  const days=(Date.parse(due+'T12:00:00Z')-Date.parse(review.termination_date+'T12:00:00Z'))/86400000;
  if(days<0||days>10)
   add('PAYMENT_DEADLINE','Pagamento deve ser planejado até dez dias corridos após a rescisão, conforme conferência documental.');
 }
 const gross=review?.full_gross_reference_cents,net=review?.net_reference_cents;
 if(!money123(gross)||!money123(net)||!net||
    gross!==plan?.financial?.gross_reference_cents||
    net!==plan?.financial?.net_payable_preview_cents||
    gross!==Number(review?.amounts?.provisional_gross_cents))
  add('FINANCIAL_MISMATCH','Bruto e líquido da rescisão não conciliam com as memórias.');
 const fine=review?.fgts_fine_reference_cents;
 if(!money123(fine)||fine<=0||fine!==plan?.financial?.fgts_fine_separate_cents)
  add('FGTS_FINE_MISMATCH','Multa FGTS positiva não concilia com a memória de férias e desligamento.');
 if(!fgtsDoc||!fgtsConfig||!fgtsLines)
  add('FGTS_GUIDE_NOT_CONFIGURED','Informe credor e naturezas da multa, base histórica e documentação conferida no FGTS Digital.');
 else{
  if(fgtsDoc.employee_id!==review?.employee?.id||
     fgtsDoc.termination_date!==review?.termination_date||
     fgtsDoc.kind!==review?.termination_kind||
     fgtsDoc.notice_kind!==review?.notice_kind||
     Number(fgtsDoc.fine_cents)!==fine||
     Number(fgtsDoc.fgts_base_cents)!==review?.documentary_evidence?.fgts_base_cents||
     fgtsDoc.fgts_source_fingerprint!==review?.base_source_fingerprint)
   add('FGTS_GUIDE_STALE','Guia ou base histórica de FGTS não coincide com o histórico de cálculos rescisórios.');
  if(!fgtsDoc.guide_reference||!fgtsDoc.statement_reference||!fgtsDoc.base_reference||
     !strictDate123(fgtsDoc.due_date))
   add('FGTS_GUIDE_INCOMPLETE','Informe referências de extrato histórico, base, guia de FGTS Digital e vencimento.');
  const fgtsDays=(Date.parse(String(fgtsDoc.due_date)+'T12:00:00Z')-Date.parse(String(review?.termination_date)+'T12:00:00Z'))/86400000;
  if(!Number.isInteger(fgtsDays)||fgtsDays<0||fgtsDays>10)
   add('FGTS_DUE_DATE_INVALID','O vencimento da obrigação rescisória do FGTS deve ser até D+10.');
  if(Number(fgtsConfig.active)!==1||!fgtsConfig.supplier_id)
   add('FGTS_CREDITOR_INVALID','Credor do FGTS Digital não está ativo.');
  for(const item of fgtsLines.problems||[])add(item.code,item.message);
  const g=totals123(fgtsLines.lines);
  if(g.D!==fine||g.C!==fine||!fgtsLines.lines.length)
   add('FGTS_JOURNAL_UNBALANCED','Débitos e créditos da multa não correspondem ao FGTS Digital.');
 }

 const use=plan?.provision_movements_preview||[];
 const useTotal=plus123(use.map(x=>x.amount_cents));
 if(useTotal===null||use.some(x=>!['FERIAS','TERCO_FERIAS','DECIMO_TERCEIRO'].includes(x.component)||
  x.employee_id!==review?.employee?.id||x.cost_center_id!==review?.employee?.cost_center_id||
  x.operational_only!==true))
  add('PROVISION_NOT_VERIFIED','Parcelas de provisões contêm valores ou origens inválidas.');
 const a=totals123(plan?.provision_journal_lines),b=totals123(plan?.settlement_journal_lines);
 if(a.D!==useTotal||a.C!==useTotal||b.D!==gross||b.C!==gross)
  add('JOURNAL_UNBALANCED','Diários de baixa e liquidação não conciliam com as provisões e o bruto.');
 if(!Array.isArray(plan?.settlement_journal_lines)||plan.settlement_journal_lines.length<2||
   plan.settlement_journal_lines.length+(plan.provision_journal_lines?.length||0)>150)
  add('JOURNAL_LIMIT','Diário incompleto ou acima do limite de partidas.');
 if(approval){
  if(!fgtsDoc||approval.fgts_document_id!==fgtsDoc.id||
     Number(approval.fgts_fine_cents)!==fine)
   add('FGTS_APPROVAL_STALE','O documento de FGTS foi alterado após a aprovação.');
  if(approval.source_fingerprint!==plan?.source_fingerprint||
     Number(approval.gross_cents)!==gross||Number(approval.net_cents)!==net||
     approval.payment_date!==due||approval.employee_id!==review?.employee?.id)
   add('APPROVAL_STALE','TRCT autorizado não corresponde à revisão atual.');
 }
 return {kind:'TERMINATION_CLOSING_123',employee:review?.employee||null,
  termination_date:review?.termination_date||null,termination_kind:review?.termination_kind,
  notice_kind:review?.notice_kind,period:String(review?.termination_date||'').slice(0,7),
  gross_cents:gross,net_cents:net,fgts_fine_cents:fine,provision_use_cents:useTotal,
  payable_due_date:due,accounting_batch_id:plan?.batch_id,
  provision_journal_lines:plan?.provision_journal_lines||[],
  settlement_journal_lines:plan?.settlement_journal_lines||[],
  provision_movements:use,
  fgts_lines:fgtsLines?.lines||[],fgts:fgtsDoc?{id:fgtsDoc.id,guide_reference:fgtsDoc.guide_reference,
   base_reference:fgtsDoc.base_reference,statement_reference:fgtsDoc.statement_reference,
   due_date:fgtsDoc.due_date,amount_cents:fgtsDoc.fine_cents,creditor_id:fgtsConfig?.supplier_id}:null,
  approval:approval?{id:approval.id,approved_by:approval.approved_by,
   approved_at:approval.approved_at,trct_reference:approval.trct_reference}:null,
  posting:existing||null,problems,
  ready_for_approval:problems.length===0&&!approval,
  ready_for_integration:problems.length===0&&!!approval&&!existing,
  accounting_generated:!!existing,financial_generated:!!existing,
  employee_status_changed:!!existing,read_only:true,
  note:'Dispensa sem justa causa: multa de 40% conciliada ao FGTS Digital, contabilizada e gerada em título específico. Depósitos de FGTS regular e outros valores do guia NÃO são gerados nesta rotina.'};
}
async function schema123(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_fgts_settings123(company_id TEXT PRIMARY KEY,supplier_id TEXT NOT NULL REFERENCES purchase_suppliers(id) ON DELETE RESTRICT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_fgts_documents123(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,termination_date TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind='WITHOUT_CAUSE'),notice_kind TEXT NOT NULL,fgts_source_fingerprint TEXT NOT NULL,fgts_base_cents INTEGER NOT NULL CHECK(fgts_base_cents>0),fine_cents INTEGER NOT NULL CHECK(fine_cents>0),statement_reference TEXT NOT NULL,base_reference TEXT NOT NULL,guide_reference TEXT NOT NULL,due_date TEXT NOT NULL,verified_by TEXT NOT NULL,verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,termination_date))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_approvals123(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,termination_date TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind='WITHOUT_CAUSE'),notice_kind TEXT NOT NULL,source_fingerprint TEXT NOT NULL,gross_cents INTEGER NOT NULL CHECK(gross_cents>0),net_cents INTEGER NOT NULL CHECK(net_cents>0),payment_date TEXT NOT NULL,fgts_document_id TEXT NOT NULL REFERENCES payroll_termination_fgts_documents123(id) ON DELETE RESTRICT,fgts_fine_cents INTEGER NOT NULL CHECK(fgts_fine_cents>0),trct_reference TEXT NOT NULL,tax_reference TEXT NOT NULL,vacation_reference TEXT NOT NULL,notice_reference TEXT NOT NULL,fgts_regular_reference TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,termination_date))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_postings123(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,approval_id TEXT NOT NULL UNIQUE REFERENCES payroll_termination_approvals123(id) ON DELETE RESTRICT,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,termination_date TEXT NOT NULL,source_fingerprint TEXT NOT NULL,provision_journal_id TEXT,provision_posting_id TEXT,settlement_journal_id TEXT NOT NULL,fgts_journal_id TEXT NOT NULL,employee_payable_id TEXT NOT NULL,fgts_payable_id TEXT NOT NULL,fgts_fine_cents INTEGER NOT NULL CHECK(fgts_fine_cents>0),history_id TEXT NOT NULL REFERENCES payroll_employee_functional_history(id) ON DELETE RESTRICT,provision_cents INTEGER NOT NULL,net_cents INTEGER NOT NULL,posted_by TEXT NOT NULL,posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,termination_date))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_payables123(company_id TEXT NOT NULL,posting_id TEXT NOT NULL REFERENCES payroll_termination_postings123(id) ON DELETE RESTRICT,payable_id TEXT NOT NULL UNIQUE REFERENCES financial_payables(id) ON DELETE RESTRICT,component TEXT NOT NULL CHECK(component IN ('EMPLOYEE_NET','FGTS_FINE')),amount_cents INTEGER NOT NULL,PRIMARY KEY(company_id,posting_id,component))")
 ]);
}
async function fgtsConfig123(env,companyId){
 return env.DB.prepare("SELECT a.company_id,a.supplier_id,s.code AS supplier_code,s.name AS supplier_name,s.active FROM payroll_termination_fgts_settings123 a LEFT JOIN purchase_suppliers s ON s.company_id=a.company_id AND s.id=a.supplier_id WHERE a.company_id=?").bind(companyId).first();
}
async function fgtsJournal123(env,companyId,amount,center){
 const problems=[],lines=[],configs=(await env.DB.prepare(
  "SELECT m.component,m.nature_id,n.active,n.synthetic_analytic FROM payroll_termination_natures119 m LEFT JOIN budget_natures n ON n.company_id=m.company_id AND n.id=m.nature_id WHERE m.company_id=? AND m.component IN ('FGTS_FINE_EXPENSE','FGTS_FINE_PAYABLE')"
 ).bind(companyId).all()).results||[];
 const map=new Map(configs.map(x=>[x.component,x]));
 for(const [component,side] of [['FGTS_FINE_EXPENSE','D'],['FGTS_FINE_PAYABLE','C']]){
  const cfg=map.get(component);
  if(!cfg||Number(cfg.active)!==1||cfg.synthetic_analytic!=='ANALYTIC'){
   issue123(problems,'FGTS_NATURE_MISSING','Configure natureza ativa para '+component);continue;
  }
  const rules=(await env.DB.prepare(
   "SELECT b.side,b.account_id,b.percentage,b.cost_center_id,b.branch_id,b.history_template_id,a.code AS account_code,a.name AS account_name,a.active AS account_active,a.analytic AS account_analytic FROM budget_nature_accounts b LEFT JOIN accounts a ON a.company_id=b.company_id AND a.id=b.account_id WHERE b.company_id=? AND b.nature_id=? ORDER BY b.side,b.id"
  ).bind(companyId,cfg.nature_id).all()).results||[];
  lines.push(...split119(rules,side,center,amount,component,problems));
 }
 const deb=new Set(lines.filter(x=>x.side==='D').map(x=>x.account_id+'|'+x.cost_center_id+'|'+(x.branch_id||'')));
 if(lines.some(x=>x.side==='C'&&deb.has(x.account_id+'|'+x.cost_center_id+'|'+(x.branch_id||''))))
  issue123(problems,'FGTS_SAME_ACCOUNT','Multa FGTS não pode ter débito e crédito na mesma conta.');
 return {lines,problems,configs};
}
async function preview123(c){
 const {env,companyId,employeeId,body={},d}=c;
 const input={employee_id:String(body.employee_id||employeeId||''),
  termination_date:body.termination_date,kind:body.kind,notice_kind:body.notice_kind};
 if(!input.employee_id||!strictDate123(input.termination_date))
  error123(d,'INVALID_REQUEST','Selecione funcionário e data de rescisão válidos.',400);
 const ctx={...c,body:input,employeeId:input.employee_id};
 const [review,diag,plan,employee,fgtsConfig,fgtsDoc]=await Promise.all([
  payrollTermination117('preview',ctx),payrollTermination118('preview',ctx),
  payrollTermination119('preview',ctx),
  env.DB.prepare("SELECT id,position_id,active,cost_center_id FROM payroll_employees WHERE company_id=? AND id=?").bind(companyId,input.employee_id).first(),
  fgtsConfig123(env,companyId),
  env.DB.prepare("SELECT * FROM payroll_termination_fgts_documents123 WHERE company_id=? AND employee_id=? AND termination_date=?").bind(companyId,input.employee_id,input.termination_date).first()
 ]);
 const [approval,existing,workTax,workPlan,history]=await Promise.all([
  env.DB.prepare("SELECT * FROM payroll_termination_approvals123 WHERE company_id=? AND employee_id=? AND termination_date=?").bind(companyId,input.employee_id,input.termination_date).first(),
  env.DB.prepare("SELECT * FROM payroll_termination_postings123 WHERE company_id=? AND employee_id=? AND termination_date=?").bind(companyId,input.employee_id,input.termination_date).first(),
  env.DB.prepare("SELECT id,source_fingerprint FROM payroll_termination_tax_workpapers117 WHERE company_id=? AND employee_id=? AND termination_date=? AND kind=? AND notice_kind=? ORDER BY revision DESC LIMIT 1").bind(companyId,input.employee_id,input.termination_date,input.kind,input.notice_kind).first(),
  env.DB.prepare("SELECT id,source_fingerprint FROM payroll_termination_plans119 WHERE company_id=? AND employee_id=? AND termination_date=? AND kind=? AND notice_kind=? ORDER BY revision DESC LIMIT 1").bind(companyId,input.employee_id,input.termination_date,input.kind,input.notice_kind).first(),
  env.DB.prepare("SELECT id FROM payroll_employee_functional_history WHERE company_id=? AND employee_id=? AND effective_from>=? LIMIT 1").bind(companyId,input.employee_id,input.termination_date).first()
 ]);
 let foreign=null;
 try{
  foreign=await env.DB.prepare("SELECT id FROM payroll_termination_postings122 WHERE company_id=? AND employee_id=? AND termination_date=?").bind(companyId,input.employee_id,input.termination_date).first();
 }catch(e){if(!/no such table/i.test(String(e)))throw e}
 const fine=review.fgts_fine_reference_cents;
 const gl=money123(fine)&&fine>0?await fgtsJournal123(env,companyId,fine,review.employee?.cost_center_id):null;
 const result=assess123(review,diag,plan,approval,existing,employee,fgtsDoc,fgtsConfig,gl,foreign);
 if(!workTax||workTax.source_fingerprint!==review.source_fingerprint)
  issue123(result.problems,'TAX_WORKPAPER_MISSING','Registre a memória tributária v117 atual.');
 if(!workPlan||workPlan.source_fingerprint!==plan.source_fingerprint)
  issue123(result.problems,'PLAN_WORKPAPER_MISSING','Registre a minuta contábil v119 atual.');
 if(history&&!existing)
  issue123(result.problems,'FUNCTIONAL_CONFLICT','Histórico funcional encontrado no desligamento ou após.');
 const ref='TERMINATION_SETTLE:'+input.employee_id+':'+input.termination_date;
 const journal=await env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference IN (?,?,?) LIMIT 1").bind(companyId,ref,'TERMINATION_USE:'+input.employee_id+':'+input.termination_date,
  'TERMINATION_FGTS_FINE:'+input.employee_id+':'+input.termination_date).first();
 if(journal&&!existing)
  issue123(result.problems,'ALREADY_JOURNAL','Já existe diário de rescisão para a data informada.');
 result.tax_source_fingerprint=review.source_fingerprint;
 result.plan_source_fingerprint=plan.source_fingerprint;
 result.ready_for_approval=!result.problems.length&&!approval;
 result.ready_for_integration=!result.problems.length&&!!approval&&!existing;
 result.source_fingerprint=await d.hash({version:123,companyId,
  employee_id:input.employee_id,review:review.source_fingerprint,
  preclose:diag.source_fingerprint,plan:plan.source_fingerprint,
  employee,fgtsDoc,fgtsConfig,fgtsMapping:gl?.configs||[],fgtsLines:gl?.lines||[],
  approval:approval?.id||null,existing:existing?.id||null,foreign:foreign?.id||null,
  history:history?.id||null,problems:result.problems});
 return result;
}
export async function payrollTermination123(action,c){
 const {env,companyId,auth,d,request,body={}}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='preview'||action==='history'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-termination-transaction123',1,()=>schema123(env));
 if(action==='history'){
  const employee=String(c.employeeId||'');
  return {records:(await env.DB.prepare("SELECT p.id,p.termination_date,p.net_cents,p.settlement_journal_id,p.payable_id,p.posted_at FROM payroll_termination_postings123 p WHERE p.company_id=? AND p.employee_id=? ORDER BY p.posted_at DESC LIMIT 100").bind(companyId,employee).all()).results||[]};
 }
 if(!['preview','approve','integrate'].includes(action))error123(d,'NOT_FOUND','Ação desconhecida.',404);
 const p=await preview123(c);
 if(action==='preview')return p;
 if(p.source_fingerprint!==body.source_fingerprint)error123(d,'STALE','Dados mudaram desde a última conferência; atualize a prévia.');
 for(const permission of ['accounting.entry.create','accounting.entry.post','financial.payable.manage'])
  await d.requirePermission(env,auth.user.id,companyId,permission);
 if(action==='approve'){
  if(!p.ready_for_approval)error123(d,'NOT_READY',p.problems[0]?.message||'Não está apto à homologação.');
  if(body.confirmation!=='APROVAR TRCT RESCISAO')error123(d,'CONFIRM_REQUIRED','Digite APROVAR TRCT RESCISAO.',400);
  if(!money123(body.trct_gross_cents)||!money123(body.trct_net_cents)||
     body.trct_gross_cents!==p.gross_cents||body.trct_net_cents!==p.net_cents)
   error123(d,'TRCT_MISMATCH','Valores do TRCT precisam coincidir exatamente com as rubricas conciliadas.');
  if(body.payment_date!==p.payable_due_date)
   error123(d,'PAYMENT_MISMATCH','Data de vencimento difere da memória tributária confirmada.');
  const trct=doc123(body.trct_reference,d,'referência do TRCT',12);
  const tax=doc123(body.tax_reference,d,'conferência de INSS e IRRF',12);
  const vacation=doc123(body.vacation_reference,d,'conferência dos períodos de férias',12);
  const notice=doc123(body.notice_reference,d,'documento do aviso',12);
  const fgts=doc123(body.fgts_regular_reference,d,'referência da conferência do FGTS regular',12);
  const id=d.uuid();
  await env.DB.prepare("INSERT INTO payroll_termination_approvals123(id,company_id,employee_id,termination_date,kind,notice_kind,source_fingerprint,gross_cents,net_cents,payment_date,trct_reference,tax_reference,vacation_reference,notice_reference,fgts_regular_reference,approved_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
   .bind(id,companyId,p.employee.id,p.termination_date,p.termination_kind,p.notice_kind,
    p.plan_source_fingerprint,p.gross_cents,p.net_cents,p.payable_due_date,
    trct,tax,vacation,notice,fgts,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'APPROVE',
   entity:'payroll_termination_approvals123',entityId:id,
   after:{employee_id:p.employee.id,date:p.termination_date,gross_cents:p.gross_cents,
    net_cents:p.net_cents,source_fingerprint:p.plan_source_fingerprint,trct_reference:trct}});
  return {approved:true,approval_id:id,accounting_generated:false,
   financial_generated:false,employee_status_changed:false};
 }
 if(!p.ready_for_integration)error123(d,'INTEGRATION_BLOCKED',p.problems[0]?.message||'TRCT não aprovado.');
 if(body.confirmation!=='CONTABILIZAR E ENCERRAR RESCISAO')
  error123(d,'CONFIRM_REQUIRED','Digite CONTABILIZAR E ENCERRAR RESCISAO.',400);
 const approval=await env.DB.prepare("SELECT * FROM payroll_termination_approvals123 WHERE company_id=? AND employee_id=? AND termination_date=?").bind(companyId,p.employee.id,p.termination_date).first();
 if(!approval||approval.source_fingerprint!==p.plan_source_fingerprint)
  error123(d,'TRCT_STALE','Homologação não corresponde à memória contábil atual.');
 // Conferir disponibilidade antes de montar os diários.
 const payrollDate=String(p.payable_due_date);
 if(!strictDate123(payrollDate)||!strictDate123(p.termination_date))error123(d,'DATES_INVALID','Datas inválidas.');
 const historical=await env.DB.prepare("SELECT id,position_id,active,cost_center_id FROM payroll_employees WHERE company_id=? AND id=?").bind(companyId,p.employee.id).first();
 if(!historical||Number(historical.active)!==1||historical.cost_center_id!==p.employee.cost_center_id)
  error123(d,'EMPLOYEE_CHANGED','Situação ou centro de custo foi alterado.');
 const duplicate=await env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference IN (?,?) LIMIT 1").bind(companyId,'TERMINATION_USE:'+p.employee.id+':'+p.termination_date,'TERMINATION_SETTLE:'+p.employee.id+':'+p.termination_date).first();
 if(duplicate)error123(d,'JOURNAL_EXISTS','Já existe diário de rescisão.');
 const date=p.termination_date,period=p.period,refs={use:'TERMINATION_USE:'+p.employee.id+':'+date,
  settle:'TERMINATION_SETTLE:'+p.employee.id+':'+date};
 const entries=[],value=x=>d.centsToMoney(x.amount_cents);
 const convert=ls=>ls.map(x=>({side:x.side,account_id:x.account_id,amount:value(x),
  cost_center_id:x.cost_center_id,branch_id:x.branch_id||null,
  history_template_id:x.history_template_id||null,
  history_complement:'Rescisão '+period+' '+p.employee.code+' — '+x.component}));
 if(p.provision_use_cents>0){
  const useEntry=await d.buildEntry(env,auth,companyId,{
   batch_id:p.accounting_batch_id,entry_date:date,document_number:'RES-PROV-'+p.employee.code,
   description:'Baixa da provisão — pedido de demissão '+p.employee.code,
   source_module:'PAYROLL',source_reference:refs.use,lines:convert(p.provision_journal_lines)
  });
  if(useEntry.total_cents!==p.provision_use_cents)error123(d,'USE_ENTRY_MISMATCH','Diário da baixa difere das provisões.');
  entries.push(useEntry);
 }
 const settlement=await d.buildEntry(env,auth,companyId,{
  batch_id:p.accounting_batch_id,entry_date:date,document_number:'TRCT-'+p.employee.code,
  description:'Verbas e retenções de rescisão '+p.employee.code+' / '+approval.trct_reference,
  source_module:'PAYROLL',source_reference:refs.settle,lines:convert(p.settlement_journal_lines)
 });
 if(settlement.total_cents!==p.gross_cents)error123(d,'SETTLEMENT_MISMATCH','Diário de rescisão não corresponde ao bruto aprovado.');
 const num=await d.nextPayableNumber(env,companyId);
 if(!/^CP-\d{6}$/.test(num))error123(d,'PAYABLE_NUMBER','Numeração de título inválida.');
 const postingId=d.uuid(),historyId=d.uuid(),payableId=d.uuid(),provisionPostingId=entries[0]?d.uuid():null;
 const stmts=[...entries.flatMap(e=>e.stmts),...settlement.stmts];
 if(provisionPostingId){
  stmts.push(env.DB.prepare("INSERT INTO payroll_provision_postings45(id,company_id,kind,competence,cycle_id,source_fingerprint,journal_entry_id,accounting_batch_id,total_cents,line_count,posted_by) VALUES (?,?,'USE',?,NULL,?,?,?,?,?,?)")
   .bind(provisionPostingId,companyId,period,p.plan_source_fingerprint,entries[0].entryId,
    p.accounting_batch_id,p.provision_use_cents,p.provision_journal_lines.length,auth.user.id));
  const movements=p.provision_movements.map(m=>({...m,id:d.uuid(),origin_key:'TERMINATION123:'+postingId+':'+m.component}));
  const guarded="INSERT INTO payroll_provision_movements43(id,company_id,employee_id,cost_center_id,component,movement_kind,competence,amount_cents,origin_key,document_ref,notes,cycle_id,created_by) SELECT json_extract(x.value,'$.id'),?,json_extract(x.value,'$.employee_id'),json_extract(x.value,'$.cost_center_id'),json_extract(x.value,'$.component'),'USE',?,CASE WHEN COALESCE((SELECT SUM(v.amount_cents) FROM payroll_provision_movements43 v WHERE v.company_id=? AND v.employee_id=json_extract(x.value,'$.employee_id') AND v.component=json_extract(x.value,'$.component') AND v.competence<=?),0)>=json_extract(x.value,'$.amount_cents') THEN -json_extract(x.value,'$.amount_cents') ELSE json_extract(x.value,'$.amount_cents') END,json_extract(x.value,'$.origin_key'),?,'Baixa vinculada ao TRCT aprovado v123',NULL,? FROM json_each(?) x";
  stmts.push(env.DB.prepare(guarded).bind(companyId,period,companyId,period,approval.trct_reference,auth.user.id,JSON.stringify(movements)));
  stmts.push(env.DB.prepare("INSERT INTO payroll_provision_posted_movements45(company_id,movement_id,posting_id) SELECT ?,json_extract(x.value,'$.id'),? FROM json_each(?) x").bind(companyId,provisionPostingId,JSON.stringify(movements)));
 }
 // Revalidar a posição funcional e bloquear corrida da alteração do cadastro.
 stmts.push(env.DB.prepare(
  "INSERT INTO payroll_employee_functional_history(id,company_id,employee_id,effective_from,position_id,situation,notes,created_by) SELECT ?,company_id,id,?,position_id,'DESLIGADO',?,? FROM payroll_employees WHERE company_id=? AND id=? AND active=1 AND cost_center_id=? AND position_id=?"
 ).bind(historyId,date,'Rescisão v123 — TRCT '+approval.trct_reference,auth.user.id,companyId,p.employee.id,p.employee.cost_center_id,historical.position_id));
 stmts.push(env.DB.prepare("UPDATE payroll_employees SET active=0,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=? AND active=1").bind(companyId,p.employee.id));
 stmts.push(env.DB.prepare("INSERT INTO financial_payables(id,company_id,number,supplier_id,source_type,source_id,issue_date,due_date,document_number,description,amount_cents,balance_cents,status,created_by) VALUES(?,?,?,?,'PAYROLL_TERMINATION',?,?,?,?,?,?,?,'OPEN',?)")
  .bind(payableId,companyId,num,p.employee.id,postingId,date,p.payable_due_date,'TRCT-'+p.employee.code,'Rescisão '+p.employee.code+' / '+approval.trct_reference,p.net_cents,p.net_cents,auth.user.id));
 stmts.push(env.DB.prepare("INSERT INTO payroll_termination_postings123(id,company_id,approval_id,employee_id,termination_date,source_fingerprint,provision_journal_id,provision_posting_id,settlement_journal_id,payable_id,history_id,provision_cents,net_cents,posted_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
  .bind(postingId,companyId,approval.id,p.employee.id,date,p.source_fingerprint,entries[0]?.entryId||null,
   provisionPostingId,settlement.entryId,payableId,historyId,p.provision_use_cents,p.net_cents,auth.user.id));
 stmts.push(env.DB.prepare("INSERT INTO payroll_termination_payables123(company_id,posting_id,payable_id,employee_id,net_cents) VALUES(?,?,?,?,?)").bind(companyId,postingId,payableId,p.employee.id,p.net_cents));
 if(stmts.length>220)error123(d,'TRANSACTION_TOO_BIG','Mais de 220 operações não suportadas numa rescisão.');
 try{
  const outcome=await env.DB.batch(stmts);
  if(outcome.some(x=>x.success===false))error123(d,'TRANSACTION_FAILED','O banco rejeitou uma das partidas; verifique a origem.');
  const functionalIndex=stmts.length-5;
  if(Number(outcome[functionalIndex]?.meta?.changes)!==1)
   error123(d,'FUNCTIONAL_NOT_RECORDED','Histórico funcional não foi gravado. Verifique os dados.');
 }catch(e){
  if(/constraint failed|UNIQUE|FOREIGN KEY|CHECK constraint/i.test(String(e)))
   error123(d,'CONCURRENT_CHANGE','Rescisão concorrente, saldo de provisão insuficiente ou cadastro alterado. Atualize a prévia.');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'INTEGRATE',
  entity:'payroll_termination_postings123',entityId:postingId,
  after:{employee_id:p.employee.id,date,net_cents:p.net_cents,provision_cents:p.provision_use_cents,
   payable_id:payableId,journal_entry_id:settlement.entryId,history_id:historyId}});
 return {integrated:true,posting_id:postingId,payable_id:payableId,
  journal_entry_id:settlement.entryId,provision_journal_id:entries[0]?.entryId||null,
  employee_status_changed:true,employee_situation:'DESLIGADO',
  accounting_posted:true,financial_generated:true,paid:false};
}
