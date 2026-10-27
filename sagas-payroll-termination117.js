// SAGAS v117 — prévia assistida de INSS/IRRF 2026 na rescisão.
// NÃO é TRCT definitivo, não fecha folha, não paga nem gera lançamentos.
// Tabelas: gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal
// e gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026
// Projeção 13º do aviso: IRRF tributável; INSS empregado não incluso conforme manual web eSocial MEI.
import {payrollTermination116} from './sagas-payroll-termination116.js';

const MAX117=99999999999;
const RATES_INSS117=[[162100,75],[290284,90],[435427,120],[847555,140]]; // /1000
const RATES_IR117=[[242880,0,0],[282665,750,18216],[375105,1500,39416],[466468,2250,67549],[MAX117,2750,90873]]; // /10000
const MONEY_FIELDS117=[
 'other_monthly_cents','other_thirteenth_cents','prior_inss_month_cents',
 'prior_inss_thirteenth_cents','prior_irrf_month_cents',
 'prior_irrf_thirteenth_cents','pension_month_cents','pension_thirteenth_cents'
];
function fail117(d,code,message,status=409){throw new d.HttpError(status,message,code)}
function valid117(n){return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=MAX117}
function add117(...values){
 const sum=values.reduce((a,v)=>a+BigInt(v),0n);
 return sum<=BigInt(MAX117)?Number(sum):null;
}
function round117(num,den){return Number((BigInt(num)+BigInt(den)/2n)/BigInt(den))}
export function inss2026v117(baseCents){
 if(!valid117(baseCents))throw Error('Base de INSS inválida');
 const capped=Math.min(baseCents,847555);
 let previous=0,weighted=0n;
 for(const [ceiling,rate] of RATES_INSS117){
  const amount=Math.max(0,Math.min(capped,ceiling)-previous);
  weighted+=BigInt(amount)*BigInt(rate);
  previous=ceiling;
  if(capped<=ceiling)break;
 }
 return round117(weighted,1000);
}
function irrfBracket117(baseCents){
 const band=RATES_IR117.find(r=>baseCents<=r[0]);
 if(!band)throw Error('Faixa tributária fora do limite');
 return Math.max(0,round117(BigInt(baseCents)*BigInt(band[1]),10000)-band[2]);
}
export function irrf2026v117(grossCents,inssCents,dependents=0,pensionCents=0){
 if(![grossCents,inssCents,pensionCents].every(valid117)||!Number.isSafeInteger(dependents)||dependents<0||dependents>20)
  throw Error('Base/deduções IRRF inválidas');
 const legalDeduction=add117(inssCents,pensionCents,dependents*18959);
 if(legalDeduction===null)throw Error('Deduções tributárias acima do limite');
 const deduction=Math.max(60720,legalDeduction);
 const taxableBase=Math.max(0,grossCents-deduction);
 const beforeReduction=irrfBracket117(taxableBase);
 let reduction=0;
 if(grossCents<=500000)reduction=Math.min(beforeReduction,31289);
 else if(grossCents<=735000)
  reduction=Math.min(beforeReduction,Math.max(0,97862-round117(BigInt(grossCents)*133145n,1000000)));
 return {gross_cents:grossCents,deduction_cents:deduction,legal_deduction_cents:legalDeduction,
  simplified_applied:deduction===60720&&legalDeduction<=60720,
  taxable_base_cents:taxableBase,irrf_before_reduction_cents:beforeReduction,
  reduction_cents:reduction,irrf_cents:Math.max(0,beforeReduction-reduction)};
}
function moneyMap117(values){
 if(!values||typeof values!=='object'||Array.isArray(values)||!MONEY_FIELDS117.every(k=>valid117(values[k])))
  return null;
 if(!Number.isSafeInteger(values.dependents)||values.dependents<0||values.dependents>20)
  return null;
 return values;
}
export function assessTaxes117(base,context){
 const issues=[],warnings=[];
 const result={kind:'TERMINATION_TAX_REVIEW_V117',tax_year:2026,context_recorded:!!context,
  tax_ready_for_review:false,tax_ready_for_closing:false,tax_issues:issues,
  tax_warnings:warnings,tax_lines:[],tax_summary:null,tax_comparison:null,
  read_only:true,accounting_generated:false,financial_generated:false,
  employee_status_changed:false,ready_for_closing:false};
 if(String(base.termination_date||'').slice(0,4)!=='2026'){
  issues.push({code:'YEAR_NOT_SUPPORTED',message:'A tabela desta etapa é exclusiva do ano-calendário 2026.'});
  return result;
 }
 if(!base.documentary_ready||!base.amounts||!valid117(base.full_gross_reference_cents)){
  issues.push({code:'GROSS_UNVERIFIED',message:'Conciliação documental da v115 incompleta.'});
  return result;
 }
 const a=base.amounts;
 const keys=['salary_balance_cents','thirteenth_cents','thirteenth_notice_projection_cents',
  'vacation_proportional_cents','vacation_third_cents','vacation_accrued_unpaid_cents',
  'vacation_accrued_third_cents','notice_indemnity_cents'];
 if(!keys.every(k=>valid117(a[k]))){
  issues.push({code:'RUBRICS_INCOMPLETE',message:'Rubricas rescisórias incompletas; refaça a apuração documental.'});
  return result;
 }
 const breakdown=[
  ['SALDO_SALARIO',a.salary_balance_cents,'MONTHLY_INSS_IRRF'],
  ['DECIMO_TERCEIRO',a.thirteenth_cents,'THIRTEENTH_INSS_IRRF'],
  ['DECIMO_AVISO',a.thirteenth_notice_projection_cents,'THIRTEENTH_IRRF_ONLY'],
  ['FERIAS_PROP',a.vacation_proportional_cents,'INDEMNITY_EXCLUDED'],
  ['TERCO_FERIAS_PROP',a.vacation_third_cents,'INDEMNITY_EXCLUDED'],
  ['FERIAS_ADQUIRIDAS',a.vacation_accrued_unpaid_cents,'INDEMNITY_EXCLUDED'],
  ['TERCO_FERIAS_ADQUIRIDAS',a.vacation_accrued_third_cents,'INDEMNITY_EXCLUDED'],
  ['AVISO_INDENIZADO',a.notice_indemnity_cents,'INDEMNITY_EXCLUDED']
 ];
 result.tax_lines=breakdown.map(([code,amount_cents,tax_class])=>({code,amount_cents,tax_class}));
 if(!context){
  issues.push({code:'CONTEXT_NOT_CONFIRMED',message:'Confirme dependentes, pensão e rendimentos/retenções anteriores na competência e no 13º.'});
  return result;
 }
 if(context.base_fingerprint!==base.source_fingerprint){
  issues.push({code:'CONTEXT_STALE',message:'A memória tributária usa base salarial/documental anterior. Reconfirme os dados.'});
  return result;
 }
 let c;
 try{c=moneyMap117(JSON.parse(context.context_json))}catch{c=null}
 if(!c){
  issues.push({code:'CONTEXT_INVALID',message:'Informações do contexto tributário inválidas.'});
  return result;
 }
 const monthBase=add117(a.salary_balance_cents,c.other_monthly_cents);
 const thirteenINSS=add117(a.thirteenth_cents,c.other_thirteenth_cents);
 const thirteenIRRF=add117(thirteenINSS,a.thirteenth_notice_projection_cents);
 if([monthBase,thirteenINSS,thirteenIRRF].some(x=>x===null)){
  issues.push({code:'TAX_BASE_OVERFLOW',message:'Base tributária ultrapassa limite monetário.'});
  return result;
 }
 const inssMonthTotal=inss2026v117(monthBase),inss13Total=inss2026v117(thirteenINSS);
 if(c.prior_inss_month_cents>inssMonthTotal||c.prior_inss_thirteenth_cents>inss13Total){
  issues.push({code:'INSS_PRIOR_EXCESS',message:'INSS já recolhido/retido maior que o INSS calculado para a base informada.'});
 }
 const monthIR=irrf2026v117(monthBase,inssMonthTotal,c.dependents,c.pension_month_cents);
 const ir13=irrf2026v117(thirteenIRRF,inss13Total,c.dependents,c.pension_thirteenth_cents);
 if(c.prior_irrf_month_cents>monthIR.irrf_cents||
    c.prior_irrf_thirteenth_cents>ir13.irrf_cents)
  issues.push({code:'IRRF_PRIOR_EXCESS',message:'IRRF já retido ultrapassa a apuração; conciliar diferenças ou restituições.'});
 const tax={
  month_gross_cents:monthBase,thirteenth_inss_base_cents:thirteenINSS,
  thirteenth_irrf_gross_cents:thirteenIRRF,
  inss_month_total_cents:inssMonthTotal,inss_thirteenth_total_cents:inss13Total,
  inss_month_due_cents:Math.max(0,inssMonthTotal-c.prior_inss_month_cents),
  inss_thirteenth_due_cents:Math.max(0,inss13Total-c.prior_inss_thirteenth_cents),
  irrf_month_total_cents:monthIR.irrf_cents,irrf_thirteenth_total_cents:ir13.irrf_cents,
  irrf_month_due_cents:Math.max(0,monthIR.irrf_cents-c.prior_irrf_month_cents),
  irrf_thirteenth_due_cents:Math.max(0,ir13.irrf_cents-c.prior_irrf_thirteenth_cents),
  irrf_month_details:monthIR,irrf_thirteenth_details:ir13,
  pension_month_cents:c.pension_month_cents,pension_thirteenth_cents:c.pension_thirteenth_cents,
  dependents:c.dependents,reference:context.reference
 };
 const actual=base.deduction_documentation;
 const differences=[];
 const checks=[
  ['inss_salary_cents','inss_month_due_cents'],
  ['inss_thirteenth_cents','inss_thirteenth_due_cents'],
  ['irrf_salary_cents','irrf_month_due_cents'],
  ['irrf_thirteenth_cents','irrf_thirteenth_due_cents']
 ];
 if(!actual){
  issues.push({code:'MANUAL_DEDUCTIONS_PENDING',message:'Concilie também os quatro tributos calculados com os valores documentados na v116.'});
 }else{
  for(const [key,calculated] of checks){
   if(actual[key]!==tax[calculated])
    differences.push({field:key,documented_cents:actual[key],calculated_cents:tax[calculated],
     difference_cents:actual[key]-tax[calculated]});
  }
  if(differences.length)
   issues.push({code:'TAX_COMPARISON_MISMATCH',message:'INSS/IRRF da v116 divergentes da simulação da v117. Revise bases, descontos e recibos.'});
 }
 if((base.problems||[]).length)
  issues.push({code:'PRIOR_TERMINATION_BLOCKERS',message:'Há impedimentos herdados do cálculo da rescisão que exigem revisão antes do fechamento.'});
 result.tax_summary=tax;
 result.tax_comparison={differences,documentation_present:!!actual,matched:!!actual&&!differences.length};
 result.tax_ready_for_review=!issues.length;
 warnings.push('Esta é uma conferência assistida: parcelas indenizatórias não integram as bases de INSS/IRRF aqui simuladas.');
 warnings.push('13º do aviso indenizado compõe IRRF do 13º, mas não INSS do empregado nesta classificação; valide a rubrica no cadastro.');
 warnings.push('O fechamento continua bloqueado até conciliar folha da competência, incidências por evento, convenção coletiva, provisões e FGTS.');
 return result;
}
async function schema117(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_tax_context117(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,termination_date TEXT NOT NULL,kind TEXT NOT NULL,notice_kind TEXT NOT NULL,base_fingerprint TEXT NOT NULL,context_json TEXT NOT NULL,reference TEXT NOT NULL,recorded_by TEXT NOT NULL,recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,termination_date,kind,notice_kind))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_tax_workpapers117(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,termination_date TEXT NOT NULL,kind TEXT NOT NULL,notice_kind TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),source_fingerprint TEXT NOT NULL,snapshot_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status='DRAFT'),recorded_by TEXT NOT NULL,recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,termination_date,kind,notice_kind,revision))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_tax_workpapers117 ON payroll_termination_tax_workpapers117(company_id,employee_id,termination_date,revision)")
 ]);
}
async function context117(c,base){
 return c.env.DB.prepare("SELECT * FROM payroll_termination_tax_context117 WHERE company_id=? AND employee_id=? AND termination_date=? AND kind=? AND notice_kind=?")
  .bind(c.companyId,base.employee.id,base.termination_date,base.termination_kind,base.notice_kind).first();
}
async function preview117(c){
 const base=await payrollTermination116('preview',c);
 const ctx=await context117(c,base);
 const part=assessTaxes117(base,ctx);
 return {...base,...part,tax_context:ctx?JSON.parse(ctx.context_json):null,
  tax_context_reference:ctx?.reference||null,
  base_source_fingerprint:base.source_fingerprint,
  source_fingerprint:await c.d.hash({version:117,base:base.source_fingerprint,context:ctx,
   tax_summary:part.tax_summary,tax_issues:part.tax_issues})};
}
export async function payrollTermination117(action,c){
 const {env,companyId,auth,d,request,body={}}=c;
 await d.requirePermission(env,auth.user.id,companyId,['save','record'].includes(action)?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-termination-tax-review117',1,()=>schema117(env));
 if(action==='history'){
  const runs=(await env.DB.prepare("SELECT id,termination_date,kind,revision,status,recorded_at FROM payroll_termination_tax_workpapers117 WHERE company_id=? AND employee_id=? ORDER BY termination_date DESC,revision DESC LIMIT 100")
   .bind(companyId,String(c.employeeId||'')).all()).results||[];
  return {runs,read_only:true};
 }
 if(action==='detail'){
  const run=await env.DB.prepare("SELECT * FROM payroll_termination_tax_workpapers117 WHERE company_id=? AND id=?").bind(companyId,String(c.runId||'')).first();
  if(!run)fail117(d,'NOT_FOUND','Memória tributária não encontrada.',404);
  return {run,snapshot:JSON.parse(run.snapshot_json),read_only:true};
 }
 if(action==='preview')return preview117(c);
 if(action==='save'){
  if(body.confirmation!=='CONFIRMAR BASES TRIBUTARIAS')
   fail117(d,'CONFIRMATION_REQUIRED','Digite CONFIRMAR BASES TRIBUTARIAS.',400);
  const base=await payrollTermination116('preview',c);
  if(base.termination_date.slice(0,4)!=='2026')
   fail117(d,'YEAR_NOT_SUPPORTED','As tabelas v117 são exclusivas para 2026.',400);
  if(!base.documentary_ready||!valid117(base.full_gross_reference_cents))
   fail117(d,'GROSS_UNVERIFIED','Primeiro registre a conciliação documental da rescisão.');
  if(body.base_source_fingerprint!==base.source_fingerprint)
   fail117(d,'PREVIEW_CHANGED','A origem da rescisão mudou. Consulte e confirme novamente.');
  const dependents=Number(body.dependents);
  if(!Number.isSafeInteger(dependents)||dependents<0||dependents>20)
   fail117(d,'DEPENDENTS_INVALID','Quantidade de dependentes inválida.',400);
  const values={dependents};
  for(const k of MONEY_FIELDS117){
   if(!valid117(body[k]))fail117(d,'TAX_CONTEXT_INVALID','Centavos inválidos: '+k,400);
   values[k]=body[k];
  }
  const reference=String(body.reference||'').trim();
  if(reference.length<12||reference.length>240)
   fail117(d,'PROOF_REQUIRED','Informe identificação dos comprovantes de folha, 13º e dependentes (12 a 240 caracteres).',400);
  const previous=await context117(c,base);
  const id=previous?.id||d.uuid();
  await env.DB.prepare("INSERT INTO payroll_termination_tax_context117(id,company_id,employee_id,termination_date,kind,notice_kind,base_fingerprint,context_json,reference,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(company_id,employee_id,termination_date,kind,notice_kind) DO UPDATE SET base_fingerprint=excluded.base_fingerprint,context_json=excluded.context_json,reference=excluded.reference,recorded_by=excluded.recorded_by,recorded_at=CURRENT_TIMESTAMP")
   .bind(id,companyId,base.employee.id,base.termination_date,base.termination_kind,base.notice_kind,
    base.source_fingerprint,JSON.stringify(values),reference,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,request,action:previous?'UPDATE':'CREATE',
   entity:'payroll_termination_tax_context117',entityId:id,
   after:{employee_id:base.employee.id,termination_date:base.termination_date,
    base_fingerprint:base.source_fingerprint,context:values,reference}});
  return {saved:true,id,read_only:true,ready_for_closing:false,financial_generated:false,accounting_generated:false};
 }
 if(action==='record'){
  if(body.confirmation!=='REGISTRAR CONFERENCIA TRIBUTARIA')
   fail117(d,'CONFIRMATION_REQUIRED','Digite REGISTRAR CONFERENCIA TRIBUTARIA.',400);
  const current=await preview117(c);
  if(!current.tax_ready_for_review)
   fail117(d,'TAX_REVIEW_PENDING','Existem divergências ou pendências; confira antes de registrar memória validada.');
  if(current.source_fingerprint!==body.source_fingerprint)
   fail117(d,'PREVIEW_CHANGED','A apuração tributária mudou; consulte novamente.');
  const previous=await env.DB.prepare("SELECT id,revision,source_fingerprint FROM payroll_termination_tax_workpapers117 WHERE company_id=? AND employee_id=? AND termination_date=? AND kind=? AND notice_kind=? ORDER BY revision DESC LIMIT 1")
   .bind(companyId,current.employee.id,current.termination_date,current.termination_kind,current.notice_kind).first();
  if(previous?.source_fingerprint===current.source_fingerprint)
   return {reused:true,id:previous.id,revision:previous.revision,status:'DRAFT'};
  const revision=Number(previous?.revision||0)+1;
  if(!Number.isSafeInteger(revision)||revision>99999)fail117(d,'REVISION_LIMIT','Revisões acima do limite.');
  const id=d.uuid();
  try{
   await env.DB.prepare("INSERT INTO payroll_termination_tax_workpapers117(id,company_id,employee_id,termination_date,kind,notice_kind,revision,source_fingerprint,snapshot_json,status,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,'DRAFT',?)")
    .bind(id,companyId,current.employee.id,current.termination_date,current.termination_kind,
     current.notice_kind,revision,current.source_fingerprint,JSON.stringify(current),auth.user.id).run();
  }catch(e){
   if(/UNIQUE|constraint failed/i.test(String(e)))fail117(d,'CONCURRENT_RECORD','Outra apuração foi registrada. Atualize a consulta.');
   throw e;
  }
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'CREATE',
   entity:'payroll_termination_tax_workpapers117',entityId:id,
   after:{employee_id:current.employee.id,termination_date:current.termination_date,revision,
    tax_comparison:current.tax_comparison,ready_for_closing:false}});
  return {created:true,id,revision,status:'DRAFT',
   ready_for_closing:false,financial_generated:false,accounting_generated:false,employee_status_changed:false};
 }
 fail117(d,'NOT_FOUND','Ação tributária não encontrada.',404);
}
