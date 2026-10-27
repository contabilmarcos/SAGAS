// SAGAS v115 — conciliação documental de rescisões, sem baixa, despesa ou título.
// Evidências são declaradas/atestadas por usuário autorizado e NÃO substituem TRCT.
import {payrollTermination114} from './sagas-payroll-termination114.js';

function fail115(d,code,message,status=409){throw new d.HttpError(status,message,code)}
function cents115(value,d,name){
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<0||n>99999999999)
  fail115(d,'MONEY_INVALID','Valor em centavos inválido: '+name+'.',400);
 return n;
}
function count115(value,d,name,max){
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<0||n>max)
  fail115(d,'COUNT_INVALID','Quantidade inválida: '+name+'.',400);
 return n;
}
function text115(value,d,label,min=5,max=200){
 const s=String(value||'').trim();
 if(s.length<min||s.length>max)fail115(d,'REFERENCE_REQUIRED','Informe '+label+' de '+min+' a '+max+' caracteres.',400);
 return s;
}
function date115(value,d){
 const s=String(value||'');
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(s)||
  !Number.isFinite(Date.parse(s+'T12:00:00Z'))||
  new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)
  fail115(d,'DATE_INVALID','Data inválida.',400);
 return s;
}
function div115(value,mul,den){
 return Number((BigInt(value)*BigInt(mul)+BigInt(Math.floor(den/2)))/BigInt(den));
}
async function schema115(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_evidence115 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,termination_date TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('RESIGNATION','WITHOUT_CAUSE')),notice_kind TEXT NOT NULL CHECK(notice_kind IN ('WORKED','INDEMNIFIED','WAIVED')),vacation_acquired_periods INTEGER NOT NULL CHECK(vacation_acquired_periods BETWEEN 0 AND 8),vacation_double_periods INTEGER NOT NULL CHECK(vacation_double_periods BETWEEN 0 AND 8),average_thirteenth_cents INTEGER NOT NULL CHECK(average_thirteenth_cents>=0),average_vacation_cents INTEGER NOT NULL CHECK(average_vacation_cents>=0),average_notice_cents INTEGER NOT NULL CHECK(average_notice_cents>=0),fgts_base_cents INTEGER,fgts_reference TEXT,proof_reference TEXT NOT NULL,notes TEXT NOT NULL,verified_by TEXT NOT NULL,verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,termination_date,kind,notice_kind))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_workpapers115 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,termination_date TEXT NOT NULL,kind TEXT NOT NULL,notice_kind TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),source_fingerprint TEXT NOT NULL,snapshot_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status='DRAFT'),recorded_by TEXT NOT NULL,recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,termination_date,kind,notice_kind,revision))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_term_workpapers115 ON payroll_termination_workpapers115(company_id,employee_id,termination_date,revision)")
 ]);
}
async function evidence115(env,companyId,base){
 return env.DB.prepare("SELECT id,employee_id,termination_date,kind,notice_kind,vacation_acquired_periods,vacation_double_periods,average_thirteenth_cents,average_vacation_cents,average_notice_cents,fgts_base_cents,fgts_reference,proof_reference,notes,verified_by,verified_at FROM payroll_termination_evidence115 WHERE company_id=? AND employee_id=? AND termination_date=? AND kind=? AND notice_kind=?")
  .bind(companyId,base.employee.id,base.termination_date,base.termination_kind,base.notice_kind).first();
}
export function reconcile115(base,evidence){
 const issues=[],flags=base.problems.slice(), warnings=base.warnings.slice();
 if(!evidence){
  issues.push({code:'DOCUMENTARY_EVIDENCE_MISSING',message:'Informe saldo de férias adquiridas, médias e, quando necessário, base de FGTS com documentos.'});
  return {...base,kind:'TERMINATION_DOCUMENT_RECONCILIATION_V115',documentary_evidence:null,
   documentary_issues:issues,documentary_ready:false,full_gross_reference_cents:null,
   fgts_fine_reference_cents:null,net_cents:null,read_only:true};
 }
 const a=base.amounts,salary=base.employee.salary_cents;
 if(!a||!Number.isSafeInteger(salary)||salary<=0){
  issues.push({code:'SALARY_NOT_VALIDATED',message:'Salário histórico não conciliado.'});
  return {...base,kind:'TERMINATION_DOCUMENT_RECONCILIATION_V115',documentary_evidence:evidence,
   documentary_issues:issues,documentary_ready:false,full_gross_reference_cents:null,
   fgts_fine_reference_cents:null,net_cents:null,read_only:true};
 }
 const n=evidence,avg13=n.average_thirteenth_cents,avgVac=n.average_vacation_cents,avgNotice=n.average_notice_cents;
 const base13=salary+avg13,baseVac=salary+avgVac,baseNotice=salary+avgNotice;
 const values=[base13,baseVac,baseNotice];
 if(values.some(x=>!Number.isSafeInteger(x)||x>99999999999)){
  issues.push({code:'REMUNERATION_OVERFLOW',message:'Médias e salário extrapolam o limite monetário.'});
  return {...base,kind:'TERMINATION_DOCUMENT_RECONCILIATION_V115',documentary_evidence:evidence,
   documentary_issues:issues,documentary_ready:false,full_gross_reference_cents:null,
   fgts_fine_reference_cents:null,net_cents:null,read_only:true};
 }
 const payable13=div115(base13,a.thirteenth_avos,12);
 // Deriva os avos adicionais da projeção a partir da fotografia contratual do v114.
 const extraAvos=Number(a.thirteenth_notice_projection_avos||0);
 if(!Number.isSafeInteger(extraAvos)||extraAvos<0||extraAvos>3)
  issues.push({code:'NOTICE_AVOS_INVALID',message:'Avos de projeção do aviso precisam ser recalculados.'});
 const projected13Amount=div115(base13,extraAvos,12);
 const vacationProportional=div115(baseVac,a.vacation_proportional_avos,12);
 const vacationThird=div115(vacationProportional,1,3);
 const accruedVacation=baseVac*(n.vacation_acquired_periods+n.vacation_double_periods);
 const accruedVacationThird=div115(accruedVacation,1,3);
 const indemnifiedNotice=base.notice_kind==='INDEMNIFIED'?div115(baseNotice,base.notice_days,30):0;
 const total=a.salary_balance_cents+payable13+projected13Amount+vacationProportional+
  vacationThird+accruedVacation+accruedVacationThird+indemnifiedNotice;
 if(!Number.isSafeInteger(total)||total>99999999999)
  issues.push({code:'GROSS_OVERFLOW',message:'Valor bruto supera limite seguro.'});
 const fine=base.termination_kind==='WITHOUT_CAUSE'&&n.fgts_base_cents!=null?
  div115(n.fgts_base_cents,40,100):null;
 if(base.termination_kind==='WITHOUT_CAUSE'&&fine===null)
  issues.push({code:'FGTS_NOT_ATTESTED',message:'Base do FGTS para fins rescisórios não confirmada.'});
 if(base.termination_kind==='WITHOUT_CAUSE'&&fine!==null)
  warnings.push('Multa FGTS de 40% é apenas referência a partir da base informada; o valor definitivo exige conferência com FGTS Digital.');
 if(n.vacation_acquired_periods>0)
  warnings.push('Férias adquiridas devem ser verificadas em períodos aquisitivos e recibos; eventual pagamento em dobro depende de prova do vencimento concessivo.');
 return {...base,kind:'TERMINATION_DOCUMENT_RECONCILIATION_V115',
  documentary_evidence:n,documentary_issues:issues,documentary_ready:!issues.length,
  amounts:{...a,thirteenth_cents:payable13,thirteenth_notice_projection_cents:projected13Amount,
   vacation_proportional_cents:vacationProportional,vacation_third_cents:vacationThird,
   vacation_accrued_unpaid_cents:accruedVacation,
   vacation_accrued_third_cents:accruedVacationThird,
   notice_indemnity_cents:indemnifiedNotice,
   provisional_gross_cents:total,
   fgts_fine_cents:fine,net_cents:null,legal_taxes_cents:null},
  full_gross_reference_cents:Number.isSafeInteger(total)?total:null,
  fgts_fine_reference_cents:fine,net_cents:null,warnings,problems:flags,
  ready_for_closing:false,accounting_generated:false,financial_generated:false,read_only:true};
}
async function preview115(c){
 const base=await payrollTermination114('preview',c);
 const proof=await evidence115(c.env,c.companyId,base);
 const result=reconcile115(base,proof);
 result.base_source_fingerprint=base.source_fingerprint;
 result.source_fingerprint=await c.d.hash({version:115,base:base.source_fingerprint,
  evidence:proof,documentary_results:result.amounts,problems:result.documentary_issues});
 return result;
}
export async function payrollTermination115(action,c){
 const {env,companyId,auth,d,request,body={}}=c;
 await d.requirePermission(env,auth.user.id,companyId,
  ['save','record'].includes(action)?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-termination-reconciliation115',1,()=>schema115(env));
 if(action==='history'){
  const id=String(c.employeeId||'');
  const records=(await env.DB.prepare("SELECT id,employee_id,termination_date,kind,notice_kind,revision,status,recorded_at FROM payroll_termination_workpapers115 WHERE company_id=? AND employee_id=? ORDER BY termination_date DESC,revision DESC LIMIT 100").bind(companyId,id).all()).results||[];
  return {runs:records,read_only:true};
 }
 if(action==='detail'){
  const record=await env.DB.prepare("SELECT * FROM payroll_termination_workpapers115 WHERE company_id=? AND id=?").bind(companyId,String(c.runId||'')).first();
  if(!record)fail115(d,'NOT_FOUND','Conferência não encontrada.',404);
  return {run:record,snapshot:JSON.parse(record.snapshot_json),read_only:true};
 }
 if(action==='preview')return preview115(c);
 if(action==='save'){
  if(body.confirmation!=='CONFIRMAR DOCUMENTOS RESCISAO')
   fail115(d,'CONFIRMATION_REQUIRED','Digite CONFIRMAR DOCUMENTOS RESCISAO.',400);
  const base=await payrollTermination114('preview',c);
  if(body.base_source_fingerprint!==base.source_fingerprint)
   fail115(d,'PREVIEW_CHANGED','Funcionário, data, salário ou cálculo foram alterados; atualize a prévia antes de atestar os documentos.');
  const av=count115(body.vacation_acquired_periods,d,'férias adquiridas',8);
  const double=count115(body.vacation_double_periods,d,'férias em dobro',8);
  if(double>av)fail115(d,'VACATION_DOUBLE_INVALID','Férias em dobro não podem superar os períodos adquiridos.',400);
  const avg13=cents115(body.average_thirteenth_cents,d,'média de 13º');
  const avgVac=cents115(body.average_vacation_cents,d,'média de férias');
  const avgNotice=cents115(body.average_notice_cents,d,'média de aviso');
  const fgts=base.termination_kind==='WITHOUT_CAUSE'?cents115(body.fgts_base_cents,d,'base de FGTS'):null;
  const fgtsRef=base.termination_kind==='WITHOUT_CAUSE'?
   text115(body.fgts_reference,d,'identificação do extrato/base FGTS'):null;
  const proof=text115(body.proof_reference,d,'identificação dos recibos, médias e férias');
  const notes=String(body.notes||'').slice(0,500);
  const existing=await evidence115(env,companyId,base);
  const id=existing?.id||d.uuid();
  await env.DB.prepare(
   "INSERT INTO payroll_termination_evidence115(id,company_id,employee_id,termination_date,kind,notice_kind,vacation_acquired_periods,vacation_double_periods,average_thirteenth_cents,average_vacation_cents,average_notice_cents,fgts_base_cents,fgts_reference,proof_reference,notes,verified_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(company_id,employee_id,termination_date,kind,notice_kind) DO UPDATE SET vacation_acquired_periods=excluded.vacation_acquired_periods,vacation_double_periods=excluded.vacation_double_periods,average_thirteenth_cents=excluded.average_thirteenth_cents,average_vacation_cents=excluded.average_vacation_cents,average_notice_cents=excluded.average_notice_cents,fgts_base_cents=excluded.fgts_base_cents,fgts_reference=excluded.fgts_reference,proof_reference=excluded.proof_reference,notes=excluded.notes,verified_by=excluded.verified_by,verified_at=CURRENT_TIMESTAMP"
  ).bind(id,companyId,base.employee.id,base.termination_date,base.termination_kind,base.notice_kind,
   av,double,avg13,avgVac,avgNotice,fgts,fgtsRef,proof,notes,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,request,action:existing?'UPDATE':'CREATE',
   entity:'payroll_termination_evidence115',entityId:id,
   after:{employee_id:base.employee.id,termination_date:base.termination_date,
    vacation_acquired_periods:av,vacation_double_periods:double,
    average_thirteenth_cents:avg13,average_vacation_cents:avgVac,average_notice_cents:avgNotice,
    fgts_base_cents:fgts,fgts_reference:fgtsRef,proof_reference:proof}});
  return {saved:true,id,ready_for_closing:false,financial_generated:false,accounting_generated:false};
 }
 if(action==='record'){
  if(body.confirmation!=='REGISTRAR CONFERENCIA RESCISAO')
   fail115(d,'CONFIRMATION_REQUIRED','Digite REGISTRAR CONFERENCIA RESCISAO.',400);
  const current=await preview115(c);
  if(!current.documentary_ready)fail115(d,'EVIDENCE_REQUIRED','Documentos não conciliados.');
  if(current.source_fingerprint!==body.source_fingerprint)
   fail115(d,'PREVIEW_CHANGED','Base da conferência mudou. Consulte novamente.');
  const last=await env.DB.prepare("SELECT id,revision,source_fingerprint FROM payroll_termination_workpapers115 WHERE company_id=? AND employee_id=? AND termination_date=? AND kind=? AND notice_kind=? ORDER BY revision DESC LIMIT 1")
   .bind(companyId,current.employee.id,current.termination_date,current.termination_kind,current.notice_kind).first();
  if(last?.source_fingerprint===current.source_fingerprint)
   return {reused:true,id:last.id,revision:last.revision,status:'DRAFT'};
  const revision=Number(last?.revision||0)+1;
  if(!Number.isSafeInteger(revision)||revision>99999)fail115(d,'REVISION_LIMIT','Número de revisões excedido.');
  const id=d.uuid();
  await env.DB.prepare("INSERT INTO payroll_termination_workpapers115(id,company_id,employee_id,termination_date,kind,notice_kind,revision,source_fingerprint,snapshot_json,status,recorded_by) VALUES (?,?,?,?,?,?,?,?,?,'DRAFT',?)")
   .bind(id,companyId,current.employee.id,current.termination_date,current.termination_kind,
    current.notice_kind,revision,current.source_fingerprint,JSON.stringify(current),auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'CREATE',
   entity:'payroll_termination_workpapers115',entityId:id,
   after:{employee_id:current.employee.id,termination_date:current.termination_date,revision,
    gross_reference_cents:current.full_gross_reference_cents,fgts_fine_reference_cents:current.fgts_fine_reference_cents}});
  return {created:true,id,revision,status:'DRAFT',net_cents:null,
   accounting_generated:false,financial_generated:false,employee_status_changed:false};
 }
 fail115(d,'NOT_FOUND','Ação não encontrada.',404);
}