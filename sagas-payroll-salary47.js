// SAGAS Folha 47 - alterações salariais durante a competência.
// Padrão TOTVS RM: salário do começo do mês; proporcional somente por opção explícita.
const SALARY_MODES47={
 RM_NEXT_MONTH:'Padrão RM: salário do início da competência (reajuste na competência seguinte)',
 PRORATE_CALENDAR:'Proporcional por vigências: dias reais da competência'
};
function error47(HttpError,msg,code='SALARY_HISTORY_INVALID',status=409){
 throw new HttpError(status,msg,code);
}
function month47(value,HttpError){
 const v=String(value||'').trim();
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v))error47(HttpError,'Competência inválida (AAAA-MM).','VALIDATION_ERROR',400);
 return v;
}
export async function payrollSalarySchema47(env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_salary_change_settings47 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,effective_from TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),mode TEXT NOT NULL CHECK(mode IN ('RM_NEXT_MONTH','PRORATE_CALENDAR')),notes TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,effective_from,revision))").run();
 await env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_salary_change47 ON payroll_salary_change_settings47(company_id,effective_from DESC,revision DESC)").run();
}
export async function payrollSalaryRead47(env,companyId,competence){
 return await env.DB.prepare("SELECT id,effective_from,revision,mode,notes,created_at FROM payroll_salary_change_settings47 WHERE company_id=? AND effective_from<=? ORDER BY effective_from DESC,revision DESC LIMIT 1").bind(companyId,competence).first();
}
export async function payrollSalarySettings47(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='save'?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-salary-change47',1,()=>payrollSalarySchema47(env));
 if(action==='read'){
  const competence=month47(c.competence,d.HttpError);
  const settings=await payrollSalaryRead47(env,companyId,competence);
  const history=(await env.DB.prepare("SELECT id,effective_from,revision,mode,notes,created_at FROM payroll_salary_change_settings47 WHERE company_id=? ORDER BY effective_from DESC,revision DESC LIMIT 40").bind(companyId).all()).results||[];
  return {competence,settings,history,mode:settings?.mode||'RM_NEXT_MONTH',modes:SALARY_MODES47,
   note:'Sem parâmetro vigente, segue o padrão RM: salário do início da competência. Para proporcionalização no mês, escolha explicitamente o segundo método.'};
 }
 if(action!=='save')error47(d.HttpError,'Operação inválida.','NOT_FOUND',404);
 const effective_from=month47(body.effective_from,d.HttpError);
 const mode=String(body.mode||'');
 if(!Object.prototype.hasOwnProperty.call(SALARY_MODES47,mode))
  error47(d.HttpError,'Escolha o padrão RM ou a proporcionalização por vigências.','VALIDATION_ERROR',400);
 const notes=String(body.notes||'').trim();
 if(notes.length>450)error47(d.HttpError,'Observações devem ter até 450 caracteres.','VALIDATION_ERROR',400);
 const prior=await payrollSalaryRead47(env,companyId,effective_from);
 const last=await env.DB.prepare("SELECT COALESCE(MAX(revision),0) AS rev FROM payroll_salary_change_settings47 WHERE company_id=? AND effective_from=?").bind(companyId,effective_from).first();
 const revision=Number(last?.rev||0)+1,id=d.uuid();
 try{
  await env.DB.prepare("INSERT INTO payroll_salary_change_settings47(id,company_id,effective_from,revision,mode,notes,created_by) VALUES (?,?,?,?,?,?,?)")
   .bind(id,companyId,effective_from,revision,mode,notes,auth.user.id).run();
 }catch(err){
  if(/UNIQUE constraint failed/i.test(String(err)))error47(d.HttpError,'Parâmetro alterado simultaneamente. Reabra a consulta.','CONFLICT');
  throw err;
 }
 const saved=await payrollSalaryRead47(env,companyId,effective_from);
 await d.audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'payroll_salary_change_settings47',entityId:id,before:prior,after:saved,request});
 return {saved};
}
export async function payrollSalaryHistory47(env,companyId,employees,history,first,last,HttpError){
 // O histórico de preparação já identificou as datas alteradas; completar com
 // valores reais para que o cálculo e o fingerprint usem a mesma fotografia.
 const changes=new Map();
 for(const emp of employees){
  const id=emp.employee_id||emp.id,dates=history.changesSalary.get(id)||[];
  if(!dates.length){changes.set(id,[]);continue;}
  if(dates.length>24)error47(HttpError,'Há mais de 24 alterações salariais no mês para '+(emp.name||id)+'.','HISTORY_LIMIT');
  const initial=String(emp.admission_date||'')>first?String(emp.admission_date):first;
  const rows=(await env.DB.prepare("SELECT employee_id,effective_from,salary_cents FROM payroll_salary_history WHERE company_id=? AND employee_id=? AND effective_from>? AND effective_from<=? ORDER BY effective_from ASC LIMIT 25").bind(companyId,id,initial,last).all()).results||[];
  const expected=dates.filter(x=>x.effective_from>initial);
  if(rows.length!==expected.length||rows.some((x,i)=>x.effective_from!==expected[i].effective_from))
   error47(HttpError,'O histórico salarial foi alterado durante a consulta: '+(emp.name||id)+'.','SALARY_HISTORY_CHANGED');
  if(rows.some(x=>!Number.isSafeInteger(Number(x.salary_cents))||Number(x.salary_cents)<=0||Number(x.salary_cents)>99999999999))
   error47(HttpError,'O reajuste possui salário inválido: '+(emp.name||id)+'.','INVALID_SALARY');
  changes.set(id,rows);
 }
 return changes;
}
export function payrollSalaryAmount47(monthlySalary,admissionDate,competence,admissionMode,mode,changes,admissionFn,HttpError){
 const s=Number(monthlySalary);
 if(!Number.isSafeInteger(s)||s<=0||s>99999999999)
  error47(HttpError,'Salário do início da competência inválido.','INVALID_SALARY');
 const records=Array.isArray(changes)?changes:[];
 const method=mode||'RM_NEXT_MONTH';
 if(!Object.prototype.hasOwnProperty.call(SALARY_MODES47,method))
  error47(HttpError,'Modo salarial desconhecido.','INVALID_SALARY_MODE');
 const admission=admissionFn(s,admissionDate,competence,admissionMode,HttpError);
 if(!records.length)return {...admission,formula_salary_cents:s,change_count:0,segments:[]};
 if(method==='RM_NEXT_MONTH'){
  return {...admission,formula_salary_cents:s,change_count:records.length,segments:[],
   reference_text:admission.prorated?
    admission.reference_text+'; reajuste no mês seguinte (RM)':
    'Salário inicial; '+records.length+' alteração(ões) vigente(s) na folha seguinte (RM)'};
 }
 if(records.length>24)error47(HttpError,'Mais de 24 alterações salariais no mês.','HISTORY_LIMIT');
 const [yy,mm]=competence.split('-').map(Number),calendarDays=new Date(Date.UTC(yy,mm,0)).getUTCDate();
 const admitted=String(admissionDate||'').slice(0,7)===competence;
 if(admitted&&admissionMode!=='CALENDAR')
  error47(HttpError,'Admissão e reajuste no mesmo mês exigem divisor de calendário para cálculo conjunto.','ADMISSION_CHANGE_CONFLICT');
 const firstDay=admitted?Number(String(admissionDate).slice(8)):1;
 let day=firstDay,current=s,numerator=0n,segments=[];
 for(const entry of records){
  const effective=String(entry.effective_from||'');
  const to=Number(effective.slice(8))-1;
  if(effective.slice(0,7)!==competence||to<day||to>=calendarDays)
   error47(HttpError,'Datas de reajuste fora de ordem ou da competência.','INVALID_SALARY_DATES');
  const nextSalary=Number(entry.salary_cents);
  if(!Number.isSafeInteger(nextSalary)||nextSalary<=0||nextSalary>99999999999)
   error47(HttpError,'Novo salário inválido.','INVALID_SALARY');
  const duration=to-day+1;
  numerator+=BigInt(current)*BigInt(duration);
  segments.push({from:competence+'-'+String(day).padStart(2,'0'),to:competence+'-'+String(to).padStart(2,'0'),days:duration,salary_cents:current});
  day=to+1;current=nextSalary;
 }
 const duration=calendarDays-day+1;
 numerator+=BigInt(current)*BigInt(duration);
 segments.push({from:competence+'-'+String(day).padStart(2,'0'),to:competence+'-'+String(calendarDays).padStart(2,'0'),days:duration,salary_cents:current});
 const salaryCents=Number((numerator+BigInt(calendarDays)/2n)/BigInt(calendarDays));
 if(!Number.isSafeInteger(salaryCents)||salaryCents>99999999999)
  error47(HttpError,'Salário proporcional excede o limite.','INVALID_SALARY');
 return {salary_cents:salaryCents,worked_days:segments.reduce((n,x)=>n+x.days,0),divisor:calendarDays,
  prorated:true,change_count:records.length,formula_salary_cents:s,segments,
  reference_text:'Salário por '+segments.length+' vigências/'+calendarDays+' dias; alteração: '+records.map(x=>x.effective_from).join(', ')};
}
