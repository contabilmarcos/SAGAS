// SAGAS v116 — conferência documentada de descontos de rescisão.
// Não substitui apuração legal automática, TRCT, fechamento, pagamento ou diário.
import {payrollTermination115} from './sagas-payroll-termination115.js';
const FIELDS116=Object.freeze([
 'inss_salary_cents','inss_thirteenth_cents','irrf_salary_cents',
 'irrf_thirteenth_cents','thirteenth_advance_cents',
 'notice_deduction_cents','other_deductions_cents'
]);
const LIMIT116=99999999999;
function err116(d,code,message,status=409){throw new d.HttpError(status,message,code)}
function money116(n,d,key){
 if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>LIMIT116)
  err116(d,'INVALID_DEDUCTION','Valor em centavos inválido: '+key+'.',400);
 return n;
}
function info116(s,d,key,max=240){
 const value=String(s||'').trim();
 if(value.length<10||value.length>max)
  err116(d,'REFERENCE_REQUIRED','Informe referência documental para '+key+' (10 a '+max+' caracteres).',400);
 return value;
}
function sum116(numbers){
 const total=numbers.reduce((a,b)=>a+BigInt(b),0n);
 return total<=BigInt(LIMIT116)?Number(total):null;
}
async function schema116(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_deductions116 (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT, termination_date TEXT NOT NULL, kind TEXT NOT NULL, notice_kind TEXT NOT NULL, base_fingerprint TEXT NOT NULL, deductions_json TEXT NOT NULL, proof_reference TEXT NOT NULL, notes TEXT NOT NULL, confirmed_by TEXT NOT NULL, confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(company_id,employee_id,termination_date,kind,notice_kind))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_net_workpapers116 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,termination_date TEXT NOT NULL,kind TEXT NOT NULL,notice_kind TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),source_fingerprint TEXT NOT NULL,snapshot_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status='DRAFT'),recorded_by TEXT NOT NULL,recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,termination_date,kind,notice_kind,revision))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_termination_net_workpapers116 ON payroll_termination_net_workpapers116(company_id,employee_id,termination_date,revision)")
 ]);
}
async function getEvidence116(c,base){
 return c.env.DB.prepare("SELECT id,base_fingerprint,deductions_json,proof_reference,notes,confirmed_by,confirmed_at FROM payroll_termination_deductions116 WHERE company_id=? AND employee_id=? AND termination_date=? AND kind=? AND notice_kind=?")
  .bind(c.companyId,base.employee.id,base.termination_date,base.termination_kind,base.notice_kind).first();
}
export function reconcile116(base,evidence){
 const issues=[],warnings=[...(base.warnings||[])];
 const result={...base,kind:'TERMINATION_NET_RECONCILIATION_V116',
  net_reference_cents:null,net_cents:null,actual_net_cents:null,
  deductions_total_cents:null,deduction_documentation:null,deduction_issues:issues,
  deduction_ready:false,ready_for_closing:false,financial_generated:false,
  accounting_generated:false,employee_status_changed:false,read_only:true,
  warnings};
 if(!base.documentary_ready||!Number.isSafeInteger(base.full_gross_reference_cents))
  issues.push({code:'GROSS_NOT_VALIDATED',message:'Concilie primeiro as férias, médias e bases brutas documentadas.'});
 if(!evidence){
  issues.push({code:'DEDUCTIONS_MISSING',message:'Documente separadamente INSS, IRRF, adiantamentos e demais descontos.'});
  return result;
 }
 if(evidence.base_fingerprint!==base.source_fingerprint){
  issues.push({code:'DEDUCTIONS_STALE',message:'As verbas ou documentos mudaram; reconfirme os descontos com a nova fotografia.'});
  return result;
 }
 let values;
 try{values=JSON.parse(evidence.deductions_json)}catch{values=null}
 if(!values||typeof values!=='object'||Array.isArray(values)||
  !FIELDS116.every(k=>typeof values[k]==='number'&&Number.isSafeInteger(values[k])&&values[k]>=0&&values[k]<=LIMIT116)){
  issues.push({code:'DEDUCTIONS_INVALID',message:'Memória de descontos inválida; faça nova conferência.'});
  return result;
 }
 const total=sum116(FIELDS116.map(k=>values[k]));
 if(total===null){
  issues.push({code:'DEDUCTIONS_OVERFLOW',message:'Soma de descontos acima do limite permitido.'});
  return result;
 }
 if(base.termination_kind!=='RESIGNATION'&&values.notice_deduction_cents>0)
  issues.push({code:'NOTICE_DEDUCTION_INVALID',message:'Desconto de aviso não é permitido nesta modalidade de prévia.'});
 if(Number.isSafeInteger(base.full_gross_reference_cents)&&total>base.full_gross_reference_cents)
  issues.push({code:'DEDUCTIONS_EXCEED_GROSS',message:'Total de descontos excede o bruto da rescisão.'});
 result.deduction_documentation={
  ...values,proof_reference:evidence.proof_reference,notes:evidence.notes,
  confirmed_by:evidence.confirmed_by,confirmed_at:evidence.confirmed_at
 };
 result.deductions_total_cents=total;
 if(!issues.length){
  result.net_reference_cents=base.full_gross_reference_cents-total;
  result.deduction_ready=true;
 }
 warnings.push('Descontos declarados a partir de comprovantes: não são cálculo automático de INSS/IRRF, nem conferência de incidências por rubrica.');
 warnings.push('Líquido de referência exclui a multa do FGTS e não constitui obrigação financeira liquidada.');
 return result;
}
async function preview116(c){
 const base=await payrollTermination115('preview',c);
 const evidence=await getEvidence116(c,base);
 const result=reconcile116(base,evidence);
 result.base_source_fingerprint=base.source_fingerprint;
 result.source_fingerprint=await c.d.hash({version:116,base:base.source_fingerprint,
  evidence,net_reference_cents:result.net_reference_cents,issues:result.deduction_issues});
 return result;
}
export async function payrollTermination116(action,c){
 const {env,companyId,auth,d,request,body={}}=c;
 await d.requirePermission(env,auth.user.id,companyId,
  ['save','record'].includes(action)?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-termination-deductions116',1,()=>schema116(env));
 if(action==='history'){
  const id=String(c.employeeId||'');
  const runs=(await env.DB.prepare("SELECT id,termination_date,kind,notice_kind,revision,status,recorded_at FROM payroll_termination_net_workpapers116 WHERE company_id=? AND employee_id=? ORDER BY termination_date DESC,revision DESC LIMIT 100").bind(companyId,id).all()).results||[];
  return {runs,read_only:true};
 }
 if(action==='detail'){
  const run=await env.DB.prepare("SELECT * FROM payroll_termination_net_workpapers116 WHERE company_id=? AND id=?").bind(companyId,String(c.runId||'')).first();
  if(!run)err116(d,'NOT_FOUND','Memória rescisória não encontrada.',404);
  return {run,snapshot:JSON.parse(run.snapshot_json),read_only:true};
 }
 if(action==='preview')return preview116(c);
 if(action==='save'){
  if(body.confirmation!=='CONFIRMAR DESCONTOS RESCISAO')
   err116(d,'CONFIRMATION_REQUIRED','Digite CONFIRMAR DESCONTOS RESCISAO.',400);
  const base=await payrollTermination115('preview',c);
  if(!base.documentary_ready||!Number.isSafeInteger(base.full_gross_reference_cents))
   err116(d,'GROSS_NOT_VALIDATED','Conciliação bruta/documental ainda pendente.');
  if(body.base_source_fingerprint!==base.source_fingerprint)
   err116(d,'PREVIEW_CHANGED','A prévia mudou; recalcule antes de atestar descontos.');
  const amounts={};
  for(const key of FIELDS116)amounts[key]=money116(body[key],d,key);
  if(base.termination_kind!=='RESIGNATION'&&amounts.notice_deduction_cents)
   err116(d,'NOTICE_DEDUCTION_INVALID','Aviso descontado somente na modalidade permitida.',400);
  const total=sum116(Object.values(amounts));
  if(total===null||total>base.full_gross_reference_cents)
   err116(d,'DEDUCTIONS_EXCEED_GROSS','Descontos somados ultrapassam o valor bruto.',400);
  const proof=info116(body.proof_reference,d,'memória de impostos, adiantamentos e descontos');
  const notes=String(body.notes||'').trim().slice(0,500);
  const previous=await getEvidence116(c,base);
  const id=previous?.id||d.uuid();
  await env.DB.prepare("INSERT INTO payroll_termination_deductions116(id,company_id,employee_id,termination_date,kind,notice_kind,base_fingerprint,deductions_json,proof_reference,notes,confirmed_by) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(company_id,employee_id,termination_date,kind,notice_kind) DO UPDATE SET base_fingerprint=excluded.base_fingerprint,deductions_json=excluded.deductions_json,proof_reference=excluded.proof_reference,notes=excluded.notes,confirmed_by=excluded.confirmed_by,confirmed_at=CURRENT_TIMESTAMP")
   .bind(id,companyId,base.employee.id,base.termination_date,base.termination_kind,
    base.notice_kind,base.source_fingerprint,JSON.stringify(amounts),proof,notes,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,request,
   action:previous?'UPDATE':'CREATE',entity:'payroll_termination_deductions116',entityId:id,
   after:{employee_id:base.employee.id,termination_date:base.termination_date,
    base_fingerprint:base.source_fingerprint,deductions:amounts,deductions_total_cents:total,
    net_reference_cents:base.full_gross_reference_cents-total,proof_reference:proof}});
  return {saved:true,id,net_reference_cents:base.full_gross_reference_cents-total,
   status:'DOCUMENTED_ONLY',ready_for_closing:false,financial_generated:false,
   accounting_generated:false,employee_status_changed:false};
 }
 if(action==='record'){
  if(body.confirmation!=='REGISTRAR MEMORIA LIQUIDO')
   err116(d,'CONFIRMATION_REQUIRED','Digite REGISTRAR MEMORIA LIQUIDO.',400);
  const current=await preview116(c);
  if(!current.deduction_ready)err116(d,'DEDUCTIONS_NOT_READY','Conciliação de descontos incompleta ou alterada.');
  if(current.source_fingerprint!==body.source_fingerprint)
   err116(d,'PREVIEW_CHANGED','Prévia de líquido alterada; consulte novamente.');
  const last=await env.DB.prepare("SELECT id,revision,source_fingerprint FROM payroll_termination_net_workpapers116 WHERE company_id=? AND employee_id=? AND termination_date=? AND kind=? AND notice_kind=? ORDER BY revision DESC LIMIT 1")
   .bind(companyId,current.employee.id,current.termination_date,current.termination_kind,current.notice_kind).first();
  if(last?.source_fingerprint===current.source_fingerprint)
   return {reused:true,id:last.id,revision:last.revision,status:'DRAFT'};
  const revision=Number(last?.revision||0)+1;
  if(!Number.isSafeInteger(revision)||revision>99999)
   err116(d,'REVISION_LIMIT','Excesso de revisões de rescisão.');
  const id=d.uuid();
  try{
   await env.DB.prepare("INSERT INTO payroll_termination_net_workpapers116(id,company_id,employee_id,termination_date,kind,notice_kind,revision,source_fingerprint,snapshot_json,status,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,'DRAFT',?)")
    .bind(id,companyId,current.employee.id,current.termination_date,current.termination_kind,
     current.notice_kind,revision,current.source_fingerprint,JSON.stringify(current),auth.user.id).run();
  }catch(e){
   if(/UNIQUE|constraint failed/i.test(String(e)))
    err116(d,'CONCURRENT_RECORD','Memória alterada em outra operação. Consulte novamente.');
   throw e;
  }
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'CREATE',
   entity:'payroll_termination_net_workpapers116',entityId:id,
   after:{employee_id:current.employee.id,termination_date:current.termination_date,revision,
    net_reference_cents:current.net_reference_cents,status:'DRAFT'}});
  return {created:true,id,revision,status:'DRAFT',ready_for_closing:false,
   financial_generated:false,accounting_generated:false,employee_status_changed:false};
 }
 err116(d,'NOT_FOUND','Ação não encontrada.',404);
}
