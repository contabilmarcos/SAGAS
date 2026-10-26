// SAGAS folha v108: provisoes de competencia fechada.
// Considera admissao >=15 dias e salario contratual; demais situacoes especiais
// seguem exigindo conferencia, sem contabilizacao implicita.
import { payrollAdmissionSalary46 } from './sagas-payroll-admission46.js';

function err42(d,message,code='PROVISION_PREVIEW_BLOCKED',status=409){
 throw new d.HttpError(status,message,code);
}
function round42(base,num,den,d){
 if(!Number.isSafeInteger(base)||base<0||!Number.isSafeInteger(num)||num<0||
  !Number.isSafeInteger(den)||den<=0)err42(d,'Valor invalido na provisao.','INVALID_PROVISION_BASE');
 const value=(BigInt(base)*BigInt(num)+BigInt(den)/2n)/BigInt(den);
 if(value>BigInt(Number.MAX_SAFE_INTEGER))err42(d,'Provisao fora do limite seguro.','INVALID_PROVISION_BASE');
 return Number(value);
}
function salary42(envelope,d){
 const rows=(envelope.lines||[]).filter(x=>x.event_code==='SALARIO_BASE'&&x.line_type==='PROVENTO');
 const value=Number(rows[0]?.amount_cents);
 if(rows.length!==1||!Number.isSafeInteger(value)||value<=0)
  err42(d,'Salario-base do envelope indisponivel: '+(envelope.employee_code||envelope.employee_name),'SALARY_SNAPSHOT_MISSING');
 return value;
}
export function payrollProvisionEligibility42(date,competence){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competence||''))
  return null;
 const [year,month]=competence.split('-').map(Number);
 const last=new Date(Date.UTC(year,month,0)).getUTCDate();
 const final=competence+'-'+String(last).padStart(2,'0');
 if(date>final)return {days:0,eligible:false,month_of_admission:false};
 if(date<competence+'-01')return {days:last,eligible:true,month_of_admission:false};
 const days=last-Number(date.slice(8))+1;
 if(days<1||days>last)return null;
 return {days,eligible:days>=15,month_of_admission:true};
}
function line42(base,settings,d){
 const vacation=round42(base,1,12,d),third=round42(base,1,36,d);
 const thirteenth=round42(base,1,12,d),labor=vacation+third+thirteenth;
 if(!Number.isSafeInteger(labor))err42(d,'Total de provisao invalido.','INVALID_PROVISION_TOTAL');
 const cpp=settings.cpp_due==='SIM'?round42(labor,Number(settings.cpp_bp),10000,d):0;
 const rat=settings.rat_due==='SIM'?round42(labor,Number(settings.rat_bp)*Number(settings.fap_10000),100000000,d):0;
 const thirds=settings.thirds_due==='SIM'?round42(labor,Number(settings.thirds_bp),10000,d):0;
 const fgts=round42(labor,800,10000,d),charges=cpp+rat+thirds+fgts;
 return {vacation_cents:vacation,vacation_third_cents:third,thirteenth_cents:thirteenth,
  labor_total_cents:labor,cpp_estimate_cents:cpp,rat_estimate_cents:rat,
  thirds_estimate_cents:thirds,fgts_estimate_cents:fgts,charges_estimate_cents:charges,
  combined_estimate_cents:labor+charges};
}
export async function payrollProvisions42(c){
 const {env,companyId,auth,runId,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 const detail=await d.payrollMonthlyRunDetail35(env,companyId,runId);
 const conference=await d.payrollMonthlyConference36(env,companyId,runId);
 const run=detail.run;
 if(run.status!=='APPROVED'||!conference.approved||!conference.review?.closed_at||conference.problems?.length)
  err42(d,'A provisao exige folha mensal conferida e fechada.');
 const settings=(await d.readEmployerSettings(run.competence)).settings;
 if(!settings)err42(d,'Configure encargos patronais em '+run.competence+'.','EMPLOYER_CONFIG_MISSING');
 const envelopes=detail.envelopes||[];
 if(!envelopes.length||envelopes.length>100)err42(d,'Quantidade de envelopes invalida para provisoes.','LIMIT');
 const ids=envelopes.map(e=>e.employee_id),placeholders=ids.map(()=>'?').join(',');
 const month=run.competence;
 const [year,number]=month.split('-').map(Number);
 const end=month+'-'+String(new Date(Date.UTC(year,number,0)).getUTCDate()).padStart(2,'0');
 const first=month+'-01';
 const [staff,changes,occurrences]=await Promise.all([
  env.DB.prepare("SELECT e.id,e.admission_date,(SELECT h.salary_cents FROM payroll_salary_history h WHERE h.company_id=e.company_id AND h.employee_id=e.id AND h.effective_from<=? ORDER BY h.effective_from DESC LIMIT 1) AS contractual_salary_cents FROM payroll_employees e WHERE e.company_id=? AND e.id IN ("+placeholders+")").bind(end,companyId,...ids).all(),
  env.DB.prepare("SELECT employee_id,effective_from FROM payroll_salary_history WHERE company_id=? AND effective_from>=? AND effective_from<=? AND employee_id IN ("+placeholders+") ORDER BY employee_id,effective_from").bind(companyId,first,end,...ids).all(),
  env.DB.prepare("SELECT employee_id,kind,COUNT(*) AS entries FROM payroll_employee_occurrences WHERE company_id=? AND start_date<=? AND end_date>=? AND employee_id IN ("+placeholders+") GROUP BY employee_id,kind").bind(companyId,end,first,...ids).all()
 ]);
 const employees=new Map((staff.results||[]).map(r=>[r.id,r]));
 const changed=new Map(),special=new Map();
 for(const row of changes.results||[]){
  const list=changed.get(row.employee_id)||[];list.push(row.effective_from);changed.set(row.employee_id,list);
 }
 for(const row of occurrences.results||[]){
  const list=special.get(row.employee_id)||[];list.push(String(row.kind));special.set(row.employee_id,list);
 }
 const needsMode=envelopes.some(e=>{
  const date=employees.get(e.employee_id)?.admission_date||'';
  return date.slice(0,7)===month&&date.slice(8)!=='01';
 });
 const mode=needsMode?await env.DB.prepare(
  "SELECT mode FROM payroll_admission_proration46 WHERE company_id=? AND effective_from<=? ORDER BY effective_from DESC,revision DESC LIMIT 1"
 ).bind(companyId,month).first():null;
 const items=envelopes.map(e=>{
  const paidSalary=salary42(e,d),employee=employees.get(e.employee_id);
  const admission=employee?payrollProvisionEligibility42(employee.admission_date,month):null;
  const others=(e.lines||[]).filter(l=>l.line_type==='PROVENTO'&&l.event_code!=='SALARIO_BASE'&&Number(l.amount_cents)>0);
  const flags=[];
  if(others.length)flags.push('Proventos adicionais: conferir medias e incidencias de ferias e 13o.');
  if(!admission)flags.push('Data de admissao ou historico do empregado nao conferido.');
  let base=paidSalary;
  const dates=changed.get(e.employee_id)||[];
  if(admission?.month_of_admission){
   const historical=Number(employee.contractual_salary_cents);
   if(!Number.isSafeInteger(historical)||historical<=0||historical>99999999999)
    flags.push('Salario contratual historico ausente ou invalido.');
   else{
    base=historical;
    if(employee.admission_date.slice(8)==='01'||mode?.mode){
     const expected=payrollAdmissionSalary46(historical,employee.admission_date,month,mode?.mode||'CALENDAR',d.HttpError);
     if(expected.salary_cents!==paidSalary)
      flags.push('Salario pago nao coincide com o salario historico proporcional na admissao.');
    }else flags.push('Modo de proporcionalidade de admissao nao encontrado.');
   }
   if(dates.some(date=>date>employee.admission_date))
    flags.push('Mudanca salarial apos admissao na mesma competencia exige revisao.');
  }else if(dates.length)flags.push('Alteracao salarial nesta competencia exige conferencia da base.');
  const kinds=special.get(e.employee_id)||[];
  if(kinds.length)flags.push('Ocorrencias de '+[...new Set(kinds)].join(', ')+': validar dias e periodos aquisitivos.');
  if(String(run.source_fingerprint||'').startsWith('VACATION100:'))
   flags.push('Ferias integradas: reconciliar gozadas, adiantamento e provisoes utilizadas.');
  const eligible=admission?.eligible===true;
  const amounts=line42(eligible?base:0,settings,d);
  return {employee_id:e.employee_id,employee_code:e.employee_code,employee_name:e.employee_name,
   cost_center_id:e.cost_center_id,cost_center_code:e.cost_center_code,
   salary_base_cents:base,payroll_salary_snapshot_cents:paidSalary,
   admission_date:employee?.admission_date||null,eligible_days:admission?.days??null,
   counts_for_13th:eligible,month_of_admission:admission?.month_of_admission??null,
   variable_earnings:others.length,flags,...amounts};
 });
 const fields=['salary_base_cents','vacation_cents','vacation_third_cents','thirteenth_cents',
  'labor_total_cents','cpp_estimate_cents','rat_estimate_cents','thirds_estimate_cents',
  'fgts_estimate_cents','charges_estimate_cents','combined_estimate_cents'];
 const totals=Object.fromEntries(fields.map(key=>[key,items.reduce((sum,r)=>sum+r[key],0)]));
 if(fields.some(key=>!Number.isSafeInteger(totals[key])))err42(d,'Soma de provisoes invalida.','INVALID_PROVISION_TOTAL');
 const fingerprint=d.hash?await d.hash({
  version:108,run_id:run.id,run_fingerprint:run.source_fingerprint,
  settings_revision:settings.revision,competence:month,
  employees:items.map(({employee_id,admission_date,eligible_days,salary_base_cents,
   payroll_salary_snapshot_cents,counts_for_13th,flags,component, ...rest})=>({
    employee_id,admission_date,eligible_days,salary_base_cents,payroll_salary_snapshot_cents,
    counts_for_13th,flags,vacation_cents:rest.vacation_cents,
    vacation_third_cents:rest.vacation_third_cents,thirteenth_cents:rest.thirteenth_cents
  })),totals
 }):null;
 return {kind:'PROVISOES_MENSAIS_PREVIA_108',
  run:{id:run.id,competence:month,revision:run.revision,status:run.status},
  settings_effective_from:settings.effective_from,settings_revision:settings.revision,
  employee_count:items.length,items,totals,fingerprint,read_only:true,is_monthly_reference:true,
  posted:false,ready_for_accounting:false,ready_for_payment:false,
  unresolved_employee_count:items.filter(i=>i.flags.length).length,
  eligibility_checked_count:items.filter(i=>i.eligible_days!==null).length,
  ineligible_15_day_count:items.filter(i=>i.eligible_days!==null&&!i.counts_for_13th).length,
  pis_on_provisions_cents:null,
  warnings:[
   'Na admissao, o avo do mes exige pelo menos 15 dias; a base e o salario contratual, nao a parcela paga.',
   'Avos de ferias e 13o sao referencias mensais; alteracoes salariais, afastamentos e medias exigem revisao.',
   'A competencia nao reconstitui automaticamente direitos vencidos, saldo patrimonial ou pagamentos ja efetuados.',
   'CPP, RAT/FAP, terceiros e FGTS sobre provisoes sao estimativas; conferir incidencia efetiva.',
   'PIS sobre provisoes nao foi apurado; validar regras tributarias e categoria do empregado.',
   'Nao gera lancamentos, baixas, guias nem pagamentos.'
  ]};
}
