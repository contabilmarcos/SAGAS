// SAGAS Folha v98 — ponte de CONFERÊNCIA de férias aprovadas com folha mensal.
// Não insere movimentos, não altera cálculo MONTHLY e não libera financeiro/contabilidade.
import { payrollVacationReview59 } from './sagas-payroll-vacation59.js';
import { payrollVacation56 } from './sagas-payroll-vacation56.js';
import { payrollVacation55 } from './sagas-payroll-vacation55.js';

function fail60(d,message,code='VACATION_MONTHLY_BRIDGE_BLOCKED',status=409){
 throw new d.HttpError(status,message,code);
}
function cents60(v,label,d){
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>99999999999)
  fail60(d,'Valor inválido: '+label,'INVALID_AMOUNT');
 return v;
}
export async function payrollVacationBridge60(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 if(action!=='prepare'&&action!=='simulate')fail60(d,'Operação inexistente.','NOT_FOUND',404);
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 const occurrenceId=String(action==='prepare'?c.occurrenceId||'':body.occurrence_id||'').trim();
 if(!occurrenceId||occurrenceId.length>128)fail60(d,'Informe ocorrência válida.','INVALID_OCCURRENCE',400);
 const review=await payrollVacationReview59('read',{env,companyId,auth,request,occurrenceId,body:{},d});
 const receipt=await payrollVacation55('read',{env,companyId,auth,request,occurrenceId,body:{},d});
 const monthly=await payrollVacation56('prepare',{env,companyId,auth,request,occurrenceId,body:{},d});
 const blockers=[],add=(code,message)=>{if(!blockers.some(x=>x.code===code&&x.message===message))blockers.push({code,message})};
 if(review.status!=='REVIEWED')add('VACATION_NOT_REVIEWED','O envelope de férias deve estar aprovado (REVIEWED).');
 for(const p of review.problems||[])add('VACATION_'+p.code,p.message);
 if(!monthly.prepared)add('MONTHLY_PREPARATION',monthly.note||'Preparação mensal indisponível.');
 for(const p of monthly.blockers||[])add('MONTHLY_'+p.code,(p.competence||'')+' '+p.message);
 if(!receipt.active||receipt.stale||!receipt.reconciled?.plan)
  add('RECEIPT_STALE','O recibo conciliado não está válido.');
 const plan=receipt.reconciled?.plan;
 const snapshot=review.recorded?.snapshot;
 if(plan&&snapshot){
  const expected=cents60(plan.gross_cents,'bruto do recibo',d);
  if(expected!==snapshot.amounts?.gross_cents)add('GROSS_DIFF','O bruto do recibo diverge do envelope aprovado.');
  if(cents60(plan.external_paid_cents,'pagamento externo',d)!==snapshot.amounts?.net_cents)
   add('NET_DIFF','O líquido pago diverge do envelope aprovado.');
  if(review.recorded?.run_id===undefined)add('RUN_MISSING','Processamento VACATION inexistente.');
 }
 const periods=Array.isArray(plan?.periods)?plan.periods:[];
 if(periods.length<1||periods.length>3)add('PERIODS_INVALID','Distribuição por competências inválida.');
 const seen=new Set(),rows=[];
 for(const p of periods){
  if(seen.has(p.competence))add('DUPLICATE_MONTH','Competência repetida: '+p.competence);
  seen.add(p.competence);
  const month=monthly.salary_references?.find(x=>x.competence===p.competence);
  if(!month)add('MONTH_NOT_PREPARED','Competência sem conferência: '+p.competence);
  if(month?.existing_run?.status&&['REVIEWED','APPROVED'].includes(month.existing_run.status))
   add('MONTHLY_LOCKED','A folha mensal já está revisada/aprovada: '+p.competence);
  const vacation=cents60(p.remuneration_cents,'férias',d);
  const third=cents60(p.constitutional_third_cents,'terço',d);
  const gross=cents60(p.compensation_gross_cents,'adiantamento compensável',d);
  if(vacation+third!==gross)add('COMPENSATION_MISMATCH','A compensação deve ser férias + terço: '+p.competence);
  rows.push({competence:p.competence,days:p.days,vacation_cents:vacation,third_cents:third,
   gross_advance_compensation_cents:gross,
   monthly_salary_reference_days:month?.calendar?.salary_paid_reference_days??null,
   monthly_salary_cents:month?.salary_cents??null,
   monthly_run:month?.existing_run??null});
 }
 if(plan){
  const sum=rows.reduce((n,x)=>n+x.gross_advance_compensation_cents,0);
  if(sum!==cents60(plan.vacation_gross_cents,'gozo total',d))
   add('TOTAL_COMPENSATION','Gozo distribuído não concilia com total do recibo.');
 }
 // Não compensar o líquido bancário: o recibo próprio já reconhece INSS/IRRF.
 // A folha mensal somente poderá descontar o bruto de gozo + terço e o INSS residual.
 const fingerprint=await d.hash({version:60,occurrence_id:occurrenceId,
  vacation_run_id:review.recorded?.run_id||null,vacation_status:review.status,
  review_fingerprint:review.expected_fingerprint||null,
  monthly_fingerprint:monthly.fingerprint||null,rows});
 if(action==='prepare')return {prepared:true,occurrence_id:occurrenceId,
  vacation_run_id:review.recorded?.run_id||null,monthly_competences:rows,
  blockers,fingerprint,ready_for_monthly_posting:false,
  ready_for_finance:false,ready_for_accounting:false,
  note:'Conferência somente leitura. O líquido bancário não é duplicado na folha.'};
 if(body.expected_fingerprint!==fingerprint)fail60(d,'Origens alteradas: reabra a conferência.','SOURCE_CHANGED');
 if(!Array.isArray(body.payment_dates)||body.payment_dates.length!==rows.length)
  fail60(d,'Informe a data de pagamento de cada competência.','PAYMENT_DATES_REQUIRED',400);
 if(blockers.length)return {simulated:false,blockers,rows,ready_for_monthly_posting:false};
 const simulated=await payrollVacation56('simulate',{env,companyId,auth,request,body:{
  occurrence_id:occurrenceId,expected_fingerprint:monthly.fingerprint,payment_dates:body.payment_dates
 },d});
 const simulatedMonths=simulated.months||[];
 for(const p of rows){
  const calc=simulatedMonths.find(x=>x.competence===p.competence);
  if(!calc){add('SIMULATION_MISSING','Simulação ausente para '+p.competence);continue;}
  if(Number(calc.vacation_gross_cents)!==p.gross_advance_compensation_cents)
   add('SIMULATION_DIFF','Desconto compensatório divergente em '+p.competence);
  const adv=(calc.events||[]).filter(e=>e.event_code==='ADIANTAMENTO_FERIAS');
  if(adv.length!==1||Number(adv[0].amount_cents)!==p.gross_advance_compensation_cents)
   add('DUPLICATE_OR_MISSING_ADVANCE','Rubrica compensatória ausente, duplicada ou divergente em '+p.competence);
 }
 for(const p of simulated.blockers||[])add(p.code,p.message);
 return {simulated:blockers.length===0,occurrence_id:occurrenceId,
  vacation_run_id:review.recorded?.run_id,months:simulatedMonths,blockers,
  ready_for_monthly_posting:false,ready_for_finance:false,ready_for_accounting:false,
  note:'Prévia sem gravação. Exige implementação posterior de integração atômica ao cálculo MONTHLY.'};
}
