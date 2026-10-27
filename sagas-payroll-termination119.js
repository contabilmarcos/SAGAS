// SAGAS v119 — pré-integração de rescisões, sem gravar diário, títulos ou baixas.
import {payrollTermination117} from './sagas-payroll-termination117.js';
import {payrollTermination118} from './sagas-payroll-termination118.js';
export const COMPONENTS119={
 SALARY_EXPENSE:'Saldo salarial',VACATION_EXPENSE:'Férias sem cobertura',
 THIRD_EXPENSE:'Terço de férias sem cobertura',THIRTEENTH_EXPENSE:'13º sem cobertura',
 NOTICE_EXPENSE:'Aviso indenizado',CLEARING:'Conta transitória de quitação',
 NET_PAYABLE:'Líquido da rescisão',INSS_PAYABLE:'INSS retido',IRRF_PAYABLE:'IRRF retido',
 ADVANCE_OFFSET:'Adiantamento do 13º',NOTICE_OFFSET:'Aviso descontado',OTHER_OFFSET:'Outros descontos'
};
const MAX119=99999999999;
function error119(d,code,message,status=409){throw new d.HttpError(status,message,code)}
function valid119(x){return typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=MAX119}
function sum119(a){if(!a.every(valid119))return null;const n=a.reduce((p,v)=>p+BigInt(v),0n);return n<=BigInt(MAX119)?Number(n):null}
function warn119(problems,code,message){if(!problems.some(x=>x.code===code&&x.message===message))problems.push({code,message})}
export function split119(rules,side,center,value,label,problems){
 if(!value)return [];
 const all=(rules||[]).filter(x=>x.side===side);
 const exact=all.filter(x=>x.cost_center_id===center);
 const chosen=exact.length?exact:all.filter(x=>!x.cost_center_id);
 const weights=chosen.map(x=>Number(x.percentage));
 if(!chosen.length||weights.some(x=>!Number.isFinite(x)||x<=0||x>100)||
   Math.abs(weights.reduce((a,b)=>a+b,0)-100)>0.00001||
   chosen.some(x=>Number(x.account_active)!==1||Number(x.account_analytic)!==1)){
  warn119(problems,'INVALID_ACCOUNTS','Mapeamento '+side+' incompleto da natureza '+label+' para o centro de custo.');
  return [];
 }
 let remaining=value;const result=[];
 for(let i=0;i<chosen.length;i++){
  const r=chosen[i],p=i===chosen.length-1?remaining:
   Number((BigInt(value)*BigInt(Math.round(weights[i]*10000))+500000n)/1000000n);
  remaining-=p;
  if(!valid119(p)||p<=0||remaining<0){warn119(problems,'SPLIT_INVALID','Rateio '+label+' gerou parcela inválida.');return []}
  result.push({side,component:label,account_id:r.account_id,account_code:r.account_code||null,
   account_name:r.account_name||null,cost_center_id:center,branch_id:r.branch_id||null,
   history_template_id:r.history_template_id||null,amount_cents:p});
 }
 if(remaining!==0)warn119(problems,'SPLIT_UNBALANCED','Rateio '+label+' não conciliado.');
 return result;
}
export function compose119(review,diag,natures,provisions,batch,existing){
 const problems=[],center=review.employee?.cost_center_id,a=review.amounts||{},ded=review.deduction_documentation||{};
 if(review.source_fingerprint!==diag.tax_source_fingerprint)
  warn119(problems,'SOURCE_CHANGED','Revisão tributária não coincide com o diagnóstico.');
 for(const b of diag.blocks||[])warn119(problems,'PRECHECK_'+b.code,b.message);
 if(!center)warn119(problems,'NO_CENTER','Centro de custo histórico ausente.');
 if(!batch||batch.status!=='OPEN')warn119(problems,'BATCH_CLOSED','Configure um lote contábil aberto.');
 if(existing)warn119(problems,'ALREADY_POSTED','Existe diário anterior ligado a esta rescisão.');
 const required=['salary_balance_cents','thirteenth_cents','thirteenth_notice_projection_cents','vacation_proportional_cents',
  'vacation_accrued_unpaid_cents','vacation_third_cents','vacation_accrued_third_cents','notice_indemnity_cents'];
 const deducted=['inss_salary_cents','inss_thirteenth_cents','irrf_salary_cents','irrf_thirteenth_cents',
  'thirteenth_advance_cents','notice_deduction_cents','other_deductions_cents'];
 if(!required.every(k=>valid119(a[k]))||!deducted.every(k=>valid119(ded[k])))
  warn119(problems,'AMOUNTS_MISSING','Rubricas ou descontos não têm valores documentados completos.');
 const nums={
 SALARY_EXPENSE:a.salary_balance_cents,
 VACATION_EXPENSE:sum119([a.vacation_proportional_cents,a.vacation_accrued_unpaid_cents]),
 THIRD_EXPENSE:sum119([a.vacation_third_cents,a.vacation_accrued_third_cents]),
 THIRTEENTH_EXPENSE:sum119([a.thirteenth_cents,a.thirteenth_notice_projection_cents]),
 NOTICE_EXPENSE:a.notice_indemnity_cents,
 INSS_PAYABLE:sum119([ded.inss_salary_cents,ded.inss_thirteenth_cents]),
 IRRF_PAYABLE:sum119([ded.irrf_salary_cents,ded.irrf_thirteenth_cents]),
 ADVANCE_OFFSET:ded.thirteenth_advance_cents,NOTICE_OFFSET:ded.notice_deduction_cents,
 OTHER_OFFSET:ded.other_deductions_cents,NET_PAYABLE:diag.financial?.net_reference_cents
 };
 if(Object.values(nums).some(v=>!valid119(v)))
  warn119(problems,'VALUE_INVALID','Componente de valor fora do limite ou ausente.');
 const gross=sum119(['SALARY_EXPENSE','VACATION_EXPENSE','THIRD_EXPENSE','THIRTEENTH_EXPENSE','NOTICE_EXPENSE'].map(k=>nums[k]));
 const credits=sum119(['INSS_PAYABLE','IRRF_PAYABLE','ADVANCE_OFFSET','NOTICE_OFFSET','OTHER_OFFSET','NET_PAYABLE'].map(k=>nums[k]));
 if(gross===null||credits===null||gross!==credits||gross!==diag.financial?.gross_reference_cents)
  warn119(problems,'GROSS_NET_MISMATCH','Proventos, retenções e líquido não conciliam.');
 const map=new Map((natures||[]).map(x=>[x.component,x]));
 const natureLines=(component,side,amount)=>{
  if(!amount)return [];
  const n=map.get(component);
  if(!n||Number(n.active)!==1||n.synthetic_analytic!=='ANALYTIC'){
   warn119(problems,'NATURE_MISSING','Informe natureza analítica ativa para '+component+'.');return [];
  }
  return split119(n.rules,side,center,amount,component,problems);
 };
 const movements=[],provisionLines=[],settlementLines=[];
 if(Object.values(nums).every(valid119)){
  const amounts={...nums};
  for(const p of diag.provision_items||[]){
   const component=p.component,use=p.proposed_use_cents;
   if(!['FERIAS','TERCO_FERIAS','DECIMO_TERCEIRO'].includes(component))continue;
   if(!valid119(use)){warn119(problems,'USE_INVALID','Uso de provisão inválido para '+component+'.');continue}
   if(use<=0)continue;
   if(Number(p.opening_cents||0)>0)
    warn119(problems,'OPENING_UNVERIFIED','Existe saldo de abertura de '+component+' sem vínculo automático ao diário. Concilie o passivo contábil antes da baixa.');
   if(!p.accounting_verified)
    warn119(problems,'POSTING_UNVERIFIED','A provisão '+component+' não possui contabilização válida e conferida para liberação.');
   const source=(provisions||[]).find(x=>x.component===component);
   if(!source||Number(source.active)!==1||source.synthetic_analytic!=='ANALYTIC'){
    warn119(problems,'USE_NATURE_MISSING','Configure natureza de baixa para '+component+'.');continue;
   }
   provisionLines.push(...split119(source.rules,'D',center,use,'USE_'+component,problems),
    ...split119(source.rules,'C',center,use,'USE_'+component,problems));
   const key=component==='FERIAS'?'VACATION_EXPENSE':component==='TERCO_FERIAS'?'THIRD_EXPENSE':'THIRTEENTH_EXPENSE';
   if(amounts[key]<use){warn119(problems,'USE_ABOVE_RIGHT','Baixa de provisão maior que direito '+component+'.');continue}
   amounts[key]-=use;
   movements.push({component,amount_cents:use,employee_id:review.employee.id,cost_center_id:center,
    operational_only:true});
  }
  for(const key of ['SALARY_EXPENSE','VACATION_EXPENSE','THIRD_EXPENSE','THIRTEENTH_EXPENSE','NOTICE_EXPENSE'])
   settlementLines.push(...natureLines(key,'D',amounts[key]));
  const useTotal=sum119(movements.map(m=>m.amount_cents));
  settlementLines.push(...natureLines('CLEARING','D',useTotal||0));
  for(const key of ['INSS_PAYABLE','IRRF_PAYABLE','ADVANCE_OFFSET','NOTICE_OFFSET','OTHER_OFFSET','NET_PAYABLE'])
   settlementLines.push(...natureLines(key,'C',amounts[key]));
  const byAccount=items=>{const m=new Map();for(const l of items){
   const k=[l.account_id,l.cost_center_id,l.branch_id||''].join('|');
   m.set(k,(m.get(k)||0)+l.amount_cents)}return m};
  const a=byAccount(provisionLines.filter(l=>l.side==='C'));
  const b=byAccount(settlementLines.filter(l=>l.component==='CLEARING'&&l.side==='D'));
  if(a.size!==b.size||[...a].some(([k,v])=>b.get(k)!==v))
   warn119(problems,'CLEARING_MISMATCH','Crédito da baixa de provisões não coincide com débito da liquidação por conta/CC.');
 }
 const totals=lines=>({
  debit_cents:sum119(lines.filter(l=>l.side==='D').map(l=>l.amount_cents)),
  credit_cents:sum119(lines.filter(l=>l.side==='C').map(l=>l.amount_cents))
 });
 const provTotals=totals(provisionLines),settTotals=totals(settlementLines);
 const used=sum119(movements.map(x=>x.amount_cents));
 if(provTotals.debit_cents!==used||provTotals.credit_cents!==used)
  warn119(problems,'PROVISIONS_UNBALANCED','Minuta da baixa das provisões está desequilibrada.');
 if(settTotals.debit_cents!==gross||settTotals.credit_cents!==gross)
  warn119(problems,'SETTLEMENT_UNBALANCED','Minuta de liquidação não fecha com bruto.');
 if(provisionLines.length+settlementLines.length+movements.length+12>200)
  warn119(problems,'TRANSACTION_LIMIT','Minuta excede limite de operação atômica.');
 return {kind:'TERMINATION_INTEGRATION_PLAN_V119',employee:review.employee,
  termination_date:review.termination_date,termination_kind:review.termination_kind,notice_kind:review.notice_kind,
  payment_date:review.tax_context?.payment_date||null,batch_id:batch?.id||null,
  financial:{gross_reference_cents:gross,net_payable_preview_cents:nums.NET_PAYABLE,
   deductions_cents:diag.financial?.deductions_reference_cents??null,
   fgts_fine_separate_cents:diag.financial?.fgts_fine_reference_cents??null,
   payable_created:false,source_type_candidate:'PAYROLL_TERMINATION'},
  provision_movements_preview:movements,provision_journal_lines:provisionLines,
  settlement_journal_lines:settlementLines,provision_totals:provTotals,settlement_totals:settTotals,
  blocks:problems,block_count:problems.length,balanced_preview:!problems.length,
  ready_for_closing:false,ready_for_posting:false,read_only:true,
  financial_generated:false,accounting_generated:false,employee_status_changed:false,
  note:'Minuta de diário de baixa, diário de liquidação e título líquido; nenhuma operação foi contabilizada ou paga.'};
}
async function schema119(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_natures119(company_id TEXT NOT NULL,component TEXT NOT NULL,nature_id TEXT NOT NULL REFERENCES budget_natures(id) ON DELETE RESTRICT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,component))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_plans119(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,termination_date TEXT NOT NULL,kind TEXT NOT NULL,notice_kind TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),source_fingerprint TEXT NOT NULL,snapshot_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status='DRAFT'),recorded_by TEXT NOT NULL,recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,termination_date,kind,notice_kind,revision))")
 ]);
}
async function mappings119(env,companyId,source){
 let rows;
 try{
  const sql=source==='provisions'?
   "SELECT m.component,m.nature_id,n.active,n.synthetic_analytic,n.code FROM payroll_provision_use_natures45 m LEFT JOIN budget_natures n ON n.id=m.nature_id AND n.company_id=m.company_id WHERE m.company_id=?":
   "SELECT m.component,m.nature_id,n.active,n.synthetic_analytic,n.code FROM payroll_termination_natures119 m LEFT JOIN budget_natures n ON n.id=m.nature_id AND n.company_id=m.company_id WHERE m.company_id=?";
  rows=(await env.DB.prepare(sql).bind(companyId).all()).results||[];
 }catch(e){if(!/no such table/i.test(String(e)))throw e;return []}
 for(const x of rows){
  x.rules=(await env.DB.prepare("SELECT b.side,b.account_id,b.percentage,b.cost_center_id,b.branch_id,b.history_template_id,a.code AS account_code,a.name AS account_name,a.active AS account_active,a.analytic AS account_analytic FROM budget_nature_accounts b LEFT JOIN accounts a ON a.id=b.account_id AND a.company_id=b.company_id WHERE b.company_id=? AND b.nature_id=? ORDER BY b.side,b.id").bind(companyId,x.nature_id).all()).results||[];
 }
 return rows;
}
async function preview119(c){
 const {env,companyId}=c;
 const readBatch=async()=>{
  try{return await env.DB.prepare("SELECT batch_id FROM payroll_finance_batches38 WHERE company_id=?").bind(companyId).first()}
  catch(e){if(/no such table/i.test(String(e)))return null;throw e}
 };
 const [review,diag,natures,provisions,batchSetting]=await Promise.all([
  payrollTermination117('preview',c),payrollTermination118('preview',c),
  mappings119(env,companyId,'settlement'),mappings119(env,companyId,'provisions'),readBatch()
 ]);
 const batch=batchSetting?.batch_id?await env.DB.prepare("SELECT id,status FROM journal_batches WHERE company_id=? AND id=?").bind(companyId,batchSetting.batch_id).first():null;
 const existing=await env.DB.prepare(
  "SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference IN (?,?) LIMIT 1"
 ).bind(companyId,'TERMINATION_USE:'+review.employee.id+':'+review.termination_date,
  'TERMINATION_SETTLE:'+review.employee.id+':'+review.termination_date).first();
 const result=compose119(review,{...diag,tax_source_fingerprint:review.source_fingerprint},natures,provisions,batch,existing);
 result.source_fingerprint=await c.d.hash({version:119,tax_source:review.source_fingerprint,
  preclose_source:diag.source_fingerprint,batch,existing,natures,provisions,
  provision_lines:result.provision_journal_lines,settlement_lines:result.settlement_journal_lines,problems:result.blocks});
 return result;
}
export async function payrollTermination119(action,c){
 const {env,companyId,auth,d,request,body={}}=c;
 await d.requirePermission(env,auth.user.id,companyId,['save-nature','record'].includes(action)?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-termination-plan119',1,()=>schema119(env));
 if(action==='settings')return {components:COMPONENTS119,mappings:await mappings119(env,companyId,'settlement')};
 if(action==='save-nature'){
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
  const component=String(body.component||''),natureId=String(body.nature_id||'');
  if(!Object.prototype.hasOwnProperty.call(COMPONENTS119,component))error119(d,'COMPONENT_INVALID','Componente não suportado.',400);
  const active=await env.DB.prepare("SELECT id FROM budget_natures WHERE company_id=? AND id=? AND active=1 AND synthetic_analytic='ANALYTIC'").bind(companyId,natureId).first();
  if(!active)error119(d,'NATURE_INVALID','Natureza precisa estar ativa e ser analítica na empresa.',400);
  await env.DB.prepare("INSERT INTO payroll_termination_natures119(company_id,component,nature_id,updated_by) VALUES(?,?,?,?) ON CONFLICT(company_id,component) DO UPDATE SET nature_id=excluded.nature_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(companyId,component,natureId,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'UPDATE',entity:'payroll_termination_natures119',entityId:component,after:{nature_id:natureId}});
  return {saved:true,components:COMPONENTS119,mappings:await mappings119(env,companyId,'settlement')};
 }
 if(action==='history'){
  const runs=(await env.DB.prepare("SELECT id,termination_date,kind,revision,status,recorded_at FROM payroll_termination_plans119 WHERE company_id=? AND employee_id=? ORDER BY termination_date DESC,revision DESC LIMIT 100").bind(companyId,String(c.employeeId||'')).all()).results||[];
  return {runs,read_only:true};
 }
 if(action==='detail'){
  const run=await env.DB.prepare("SELECT * FROM payroll_termination_plans119 WHERE company_id=? AND id=?").bind(companyId,String(c.runId||'')).first();
  if(!run)error119(d,'NOT_FOUND','Minuta não encontrada.',404);
  return {run,snapshot:JSON.parse(run.snapshot_json),read_only:true};
 }
 if(action==='preview')return preview119(c);
 if(action==='record'){
  if(body.confirmation!=='REGISTRAR PLANO RESCISAO')
   error119(d,'CONFIRMATION_REQUIRED','Digite REGISTRAR PLANO RESCISAO.',400);
  const current=await preview119(c);
  if(current.source_fingerprint!==body.source_fingerprint)
   error119(d,'PREVIEW_CHANGED','Valores ou contas mudaram. Atualize a prévia.');
  const previous=await env.DB.prepare("SELECT id,revision,source_fingerprint FROM payroll_termination_plans119 WHERE company_id=? AND employee_id=? AND termination_date=? AND kind=? AND notice_kind=? ORDER BY revision DESC LIMIT 1").bind(companyId,current.employee.id,current.termination_date,current.termination_kind,current.notice_kind).first();
  if(previous?.source_fingerprint===current.source_fingerprint)
   return {reused:true,id:previous.id,revision:previous.revision,status:'DRAFT'};
  const revision=Number(previous?.revision||0)+1;
  if(!Number.isSafeInteger(revision)||revision>99999)error119(d,'REVISION_LIMIT','Excesso de revisões.');
  const id=d.uuid();
  try{
   await env.DB.prepare("INSERT INTO payroll_termination_plans119(id,company_id,employee_id,termination_date,kind,notice_kind,revision,source_fingerprint,snapshot_json,status,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,'DRAFT',?)").bind(id,companyId,current.employee.id,current.termination_date,current.termination_kind,current.notice_kind,revision,current.source_fingerprint,JSON.stringify(current),auth.user.id).run();
  }catch(e){if(/UNIQUE|constraint failed/i.test(String(e)))error119(d,'CONCURRENT_RECORD','Minuta alterada simultaneamente.');throw e}
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'CREATE',entity:'payroll_termination_plans119',entityId:id,after:{employee_id:current.employee.id,termination_date:current.termination_date,revision,block_count:current.block_count}});
  return {created:true,id,revision,status:'DRAFT',financial_generated:false,accounting_generated:false};
 }
 error119(d,'NOT_FOUND','Ação desconhecida.',404);
}
