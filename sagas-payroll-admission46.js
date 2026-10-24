// SAGAS Folha 46 — admissão proporcional de mensalistas, conforme parâmetro do RM.
// Não altera processamentos fechados. Sem presumir modo quando há admissão no mês.
const MODE_46={CALENDAR:'Dias efetivos do mês',COMMERCIAL_30:'Mês comercial de 30 dias'};
function err46(HttpError,msg,code='PAYROLL_ADMISSION_CONFIG_REQUIRED',status=409){
 throw new HttpError(status,msg,code);
}
function period46(v,HttpError){
 const x=String(v||'').trim();
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(x))err46(HttpError,'Competência inválida (AAAA-MM).','VALIDATION_ERROR',400);
 return x;
}
export async function payrollAdmissionSchema46(env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_admission_proration46 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,effective_from TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),mode TEXT NOT NULL CHECK(mode IN ('CALENDAR','COMMERCIAL_30')),notes TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,effective_from,revision))").run();
 await env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_payroll_admission46_company ON payroll_admission_proration46(company_id,effective_from,revision)").run();
}
export async function payrollAdmissionRead46(env,companyId,month){
 return await env.DB.prepare("SELECT id,effective_from,revision,mode,notes,created_at FROM payroll_admission_proration46 WHERE company_id=? AND effective_from<=? ORDER BY effective_from DESC,revision DESC LIMIT 1").bind(companyId,month).first();
}
export async function payrollAdmission46(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='save'?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-admission-proration46',1,()=>payrollAdmissionSchema46(env));
 if(action==='read'){
  const month=period46(c.competence,d.HttpError);
  const settings=await payrollAdmissionRead46(env,companyId,month);
  const history=(await env.DB.prepare("SELECT id,effective_from,revision,mode,notes,created_at FROM payroll_admission_proration46 WHERE company_id=? ORDER BY effective_from DESC,revision DESC LIMIT 30").bind(companyId).all()).results||[];
  return {competence:month,settings,history,modes:MODE_46,note:'Sem parâmetro vigente, uma admissão dentro do mês bloqueia o cálculo mensal.'};
 }
 if(action!=='save')err46(d.HttpError,'Ação não encontrada.','NOT_FOUND',404);
 const competence=period46(body.effective_from,d.HttpError);
 const mode=String(body.mode||'');
 if(!Object.hasOwn(MODE_46,mode))err46(d.HttpError,'Selecione o método dos dias efetivos ou do mês comercial de 30 dias.','VALIDATION_ERROR',400);
 const notes=String(body.notes||'').trim();
 if(notes.length>450)err46(d.HttpError,'Observações acima de 450 caracteres.','VALIDATION_ERROR',400);
 const prior=await payrollAdmissionRead46(env,companyId,competence);
 const last=await env.DB.prepare("SELECT COALESCE(MAX(revision),0) AS rev FROM payroll_admission_proration46 WHERE company_id=? AND effective_from=?").bind(companyId,competence).first();
 const revision=Number(last?.rev||0)+1,id=d.uuid();
 try{
  await env.DB.prepare("INSERT INTO payroll_admission_proration46(id,company_id,effective_from,revision,mode,notes,created_by) VALUES (?,?,?,?,?,?,?)")
   .bind(id,companyId,competence,revision,mode,notes,auth.user.id).run();
 }catch(e){
  if(/UNIQUE constraint failed/i.test(String(e)))err46(d.HttpError,'Configuração simultânea. Consulte novamente.','CONFIG_CONFLICT');
  throw e;
 }
 const saved=await payrollAdmissionRead46(env,companyId,competence);
 await d.audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'payroll_admission_proration46',entityId:id,before:prior,after:saved,request});
 return {saved,mode,revision};
}
function lastDay46(competence){
 const [year,month]=competence.split('-').map(Number);
 return new Date(Date.UTC(year,month,0)).getUTCDate();
}
export function payrollAdmissionSalary46(monthlySalary,admissionDate,competence,mode,HttpError){
 const salary=Number(monthlySalary);
 if(!Number.isSafeInteger(salary)||salary<=0||salary>99999999999)
  err46(HttpError,'Salário contratual inválido na admissão.','INVALID_SALARY');
 const date=String(admissionDate||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>competence+'-'+String(lastDay46(competence)).padStart(2,'0'))
  err46(HttpError,'Data de admissão inválida ou posterior à competência.','INVALID_ADMISSION');
 const first=competence+'-01';
 if(date<=first)return {salary_cents:salary,worked_days:null,divisor:null,
  reference_text:'Mês integral',prorated:false};
 if(date.slice(0,7)!==competence)
  err46(HttpError,'Admissão incompatível com a competência.','INVALID_ADMISSION');
 if(!Object.hasOwn(MODE_46,mode))
  err46(HttpError,'Configure primeiro o parâmetro de dias de admissão da empresa.','PRORATION_CONFIG_MISSING');
 const d=Number(date.slice(8,10)),calendarDays=lastDay46(competence);
 if(d<2||d>calendarDays)err46(HttpError,'Dia da admissão inválido.','INVALID_ADMISSION');
 const divisor=mode==='CALENDAR'?calendarDays:30;
 const days=divisor-d+1;
 if(days<=0)err46(HttpError,'Admissão no dia 31 é incompatível com o mês comercial de 30 dias: ajuste a regra antes de calcular.','PRORATION_DAY_31');
 const value=(BigInt(salary)*BigInt(days)+BigInt(divisor)/2n)/BigInt(divisor);
 if(value>BigInt(Number.MAX_SAFE_INTEGER))err46(HttpError,'Salário proporcional fora do limite seguro.','INVALID_SALARY');
 return {salary_cents:Number(value),worked_days:days,divisor,prorated:true,
  reference_text:'Admissão '+date+' · '+days+'/'+divisor+' dias ('+(mode==='CALENDAR'?'calendário':'comercial')+')'};
}
export async function payrollAdmissionHistory46(env,companyId,employees,first,last,history,HttpError){
 const admissions=employees.filter(e=>{
  const date=String(e.admission_date||'');return date>first&&date<=last;
 });
 if(admissions.length>100)err46(HttpError,'Admissões em lote acima do limite de conferência.','LIMIT');
 for(const emp of admissions){
  const employeeId=emp.employee_id||emp.id,date=String(emp.admission_date);
  if(!employeeId)err46(HttpError,'Funcionário sem identificação na admissão.','INVALID_EMPLOYEE');
  const sources=[
   ['salary',"SELECT employee_id,effective_from,salary_cents FROM payroll_salary_history WHERE company_id=? AND employee_id=? AND effective_from<=? ORDER BY effective_from DESC LIMIT 1"],
   ['schedule',"SELECT employee_id,effective_from,weekly_hours_milli,monthly_hours_milli FROM payroll_work_schedule_history WHERE company_id=? AND employee_id=? AND effective_from<=? ORDER BY effective_from DESC LIMIT 1"],
   ['functional',"SELECT employee_id,effective_from,situation,position_id FROM payroll_employee_functional_history WHERE company_id=? AND employee_id=? AND effective_from<=? ORDER BY effective_from DESC LIMIT 1"]
  ];
  for(const [type,sql] of sources){
   const row=await env.DB.prepare(sql).bind(companyId,employeeId,date).first();
   if(row)history[type].set(employeeId,[row]);
   else history[type].delete(employeeId);
  }
  for(const type of ['changesSalary','changesSchedule','changesFunctional']){
   const changes=history[type].get(employeeId)||[];
   history[type].set(employeeId,changes.filter(x=>x.effective_from>date));
  }
 }
 return history;
}
