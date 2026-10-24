// SAGAS Folha 48: faltas não justificadas, atrasos e perda de DSR confirmada.
// Não presume que toda falta tira DSR. Ocorrências FALTA multi-dia exigem decomposição
// em datas individuais de trabalho; feriados, escalas e justificativas não são inferidos.
function error48(d,msg,code='ABSENCE_INVALID',status=409){throw new d.HttpError(status,msg,code)}
function month48(s,d){
 const v=String(s||'').trim();
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v))error48(d,'Competência inválida (AAAA-MM).','VALIDATION_ERROR',400);
 return v;
}
function date48(s,d){
 const v=String(s||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))error48(d,'Data inválida.','VALIDATION_ERROR',400);
 const [y,m,day]=v.split('-').map(Number);
 if(day<1||day>new Date(Date.UTC(y,m,0)).getUTCDate())error48(d,'Data inexistente no calendário.','VALIDATION_ERROR',400);
 return v;
}
function daysBetween48(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)}
function p48money(s,d){
 const v=Number(s);
 if(!Number.isSafeInteger(v)||v<=0||v>99999999999)error48(d,'Salário inválido no desconto.','INVALID_SALARY');
 return v;
}
function round48(num,den,d){
 if(den<=0n||num<0n)error48(d,'Valores inválidos no desconto.','INVALID_CALC');
 const out=(num+den/2n)/den;
 if(out>99999999999n)error48(d,'Desconto excede o limite monetário.','INVALID_CALC');
 return Number(out);
}
export async function payrollAbsenceSchema48(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_absence_decisions48 (occurrence_id TEXT PRIMARY KEY REFERENCES payroll_employee_occurrences(id) ON DELETE RESTRICT,company_id TEXT NOT NULL,employee_id TEXT NOT NULL,classification TEXT NOT NULL CHECK(classification IN ('JUSTIFICADA','INJUSTIFICADA')),notes TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_time_adjustments48 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,kind TEXT NOT NULL CHECK(kind IN ('LATE','DSR_LOSS')),event_date TEXT NOT NULL,minutes INTEGER NOT NULL CHECK(minutes BETWEEN 0 AND 1440),source_date TEXT,notes TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,kind,event_date),CHECK((kind='LATE' AND minutes>0 AND source_date IS NULL) OR (kind='DSR_LOSS' AND minutes=0 AND source_date IS NOT NULL)))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_absence_decisions48 ON payroll_absence_decisions48(company_id,employee_id)"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_time_adjust48 ON payroll_time_adjustments48(company_id,event_date,employee_id)")
 ]);
}
async function ensureOpen48(env,companyId,date,d){
 const c=await env.DB.prepare("SELECT id,status FROM payroll_competences WHERE company_id=? AND competence=?").bind(companyId,date.slice(0,7)).first();
 if(!c||c.status!=='OPEN')error48(d,'É necessário uma competência aberta para registrar ou modificar ocorrências.','COMPETENCE_LOCKED');
 return c;
}
async function fetch48(env,companyId,competence,d){
 const first=month48(competence,d)+'-01';
 const [yy,mm]=competence.split('-').map(Number);
 const last=competence+'-'+String(new Date(Date.UTC(yy,mm,0)).getUTCDate()).padStart(2,'0');
 const [oc,events]=await Promise.all([
  env.DB.prepare("SELECT o.id,o.employee_id,o.kind,o.start_date,o.end_date,o.notes,e.name AS employee_name,n.number AS employee_number,z.classification,z.notes AS decision_notes FROM payroll_employee_occurrences o JOIN payroll_employees e ON e.id=o.employee_id AND e.company_id=o.company_id LEFT JOIN payroll_employee_numbers n ON n.employee_id=o.employee_id AND n.company_id=o.company_id LEFT JOIN payroll_absence_decisions48 z ON z.occurrence_id=o.id AND z.company_id=o.company_id WHERE o.company_id=? AND o.start_date<=? AND o.end_date>=? ORDER BY e.name,o.start_date,o.id LIMIT 501").bind(companyId,last,first).all(),
  env.DB.prepare("SELECT a.id,a.employee_id,a.kind,a.event_date,a.minutes,a.source_date,a.notes,e.name AS employee_name,n.number AS employee_number FROM payroll_time_adjustments48 a JOIN payroll_employees e ON e.id=a.employee_id AND e.company_id=a.company_id LEFT JOIN payroll_employee_numbers n ON n.employee_id=a.employee_id AND n.company_id=a.company_id WHERE a.company_id=? AND a.event_date>=? AND a.event_date<=? ORDER BY e.name,a.event_date,a.kind LIMIT 501").bind(companyId,first,last).all()
 ]);
 if((oc.results||[]).length>500||(events.results||[]).length>500)error48(d,'Mais de 500 ocorrências na competência.','LIMIT');
 return {competence,occurrences:oc.results||[],adjustments:events.results||[]};
}
export async function payrollAbsenceSnapshot48(env,companyId,competence,d){
 const data=await fetch48(env,companyId,competence,d);
 const byEmployee=new Map();
 const get=id=>{if(!byEmployee.has(id))byEmployee.set(id,{absences:[],adjustments:[],blockers:[],warnings:[]});return byEmployee.get(id)};
 for(const o of data.occurrences){
  if(o.kind!=='FALTA')continue; // Outras ocorrências tratadas na etapa 49, inclusive férias bloqueadas.
  const record=get(o.employee_id);
  if(o.start_date!==o.end_date){record.blockers.push('Divida a falta de '+o.start_date+' a '+o.end_date+' em dias individuais antes de calcular.');continue;}
  if(o.start_date.slice(0,7)!==competence)continue;
  if(!['JUSTIFICADA','INJUSTIFICADA'].includes(o.classification)){
   record.blockers.push('Falta em '+o.start_date+' sem classificação justificada ou injustificada.');continue;
  }
  record.absences.push({id:o.id,date:o.start_date,classification:o.classification});
  if(o.classification==='INJUSTIFICADA')record.warnings.push('Desconto de um dia de falta confirmada em '+o.start_date+'.');
 }
 for(const a of data.adjustments){
  const record=get(a.employee_id);
  if(a.kind==='DSR_LOSS'){
   const f=await env.DB.prepare("SELECT o.id FROM payroll_employee_occurrences o JOIN payroll_absence_decisions48 z ON z.occurrence_id=o.id AND z.company_id=o.company_id WHERE o.company_id=? AND o.employee_id=? AND o.kind='FALTA' AND o.start_date=? AND o.end_date=? AND z.classification='INJUSTIFICADA' LIMIT 1").bind(companyId,a.employee_id,a.source_date,a.source_date).first();
   const late=await env.DB.prepare("SELECT id FROM payroll_time_adjustments48 WHERE company_id=? AND employee_id=? AND kind='LATE' AND event_date=? LIMIT 1").bind(companyId,a.employee_id,a.source_date).first();
   if(!f&&!late){record.blockers.push('DSR '+a.event_date+' sem falta injustificada ou atraso válido em '+a.source_date+'.');continue;}
  }
  record.adjustments.push({id:a.id,kind:a.kind,event_date:a.event_date,minutes:Number(a.minutes),source_date:a.source_date||null});
  if(a.kind==='DSR_LOSS')record.warnings.push('Perda de DSR confirmada em '+a.event_date+' por apontamento de '+a.source_date+'.');
 }
 return byEmployee;
}
export function payrollAbsenceAmounts48(salaryCents,monthlyHoursMilli,competence,snapshot,salaryChanges,salaryMode,d){
 const entries=[],changes=Array.isArray(salaryChanges)?salaryChanges:[],hasChanged=changes.length>0;
 if(!snapshot)return {entries,discount_cents:0};
 if((snapshot.blockers||[]).length)error48(d,snapshot.blockers[0],'ABSENCE_PENDING');
 const absences=snapshot.absences||[],adjustments=snapshot.adjustments||[];
 if(hasChanged&&salaryMode==='PRORATE_CALENDAR'&&(absences.length||adjustments.length))
  error48(d,'Faltas e atrasos com reajuste proporcional no mesmo mês exigem apuração por vigências dos descontos.','ABSENCE_SALARY_CHANGE_UNSUPPORTED');
 const salary=p48money(salaryCents,d),hours=Number(monthlyHoursMilli);
 if(!Number.isSafeInteger(hours)||hours<1000||hours>300000)error48(d,'Jornada mensal inválida para desconto de atrasos.','INVALID_HOURS');
 const selectedDays=new Set(),daily=()=>round48(BigInt(salary),30n,d);
 for(const absence of absences){
  if(absence.classification!=='INJUSTIFICADA')continue;
  if(selectedDays.has(absence.date))error48(d,'Faltas repetidas no mesmo dia '+absence.date+'.','DUPLICATE_ABSENCE');
  selectedDays.add(absence.date);
  entries.push({event_code:'FALTA_INJUSTIFICADA',event_name:'Falta não justificada',amount_cents:daily(),reference_text:'Falta em '+absence.date+'; 1/30 do salário'});
 }
 for(const a of adjustments){
  if(a.kind==='LATE'){
   const mins=Number(a.minutes);
   if(!Number.isSafeInteger(mins)||mins<=0||mins>1440)error48(d,'Minutos de atraso inválidos.','INVALID_LATENESS');
   const val=round48(BigInt(salary)*BigInt(mins)*1000n,BigInt(hours)*60n,d);
   if(val>0)entries.push({event_code:'ATRASO_MINUTOS',event_name:'Atraso não justificado',amount_cents:val,reference_text:mins+' minuto(s), '+a.event_date});
  }else if(a.kind==='DSR_LOSS'){
   entries.push({event_code:'DSR_DESCONTO',event_name:'Perda de DSR confirmada',amount_cents:daily(),reference_text:'DSR '+a.event_date+' vinculado à ocorrência '+a.source_date});
  }else error48(d,'Tipo de apontamento desconhecido.','INVALID_ADJUSTMENT');
 }
 const total=entries.reduce((n,x)=>n+x.amount_cents,0);
 if(!Number.isSafeInteger(total)||total>salary)error48(d,'Descontos de faltas, atrasos e DSR excedem o salário contratual. Confira os apontamentos.','ABSENCE_EXCEEDS_SALARY');
 return {entries,discount_cents:total};
}
export async function payrollAbsence48(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='list'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-absence48',1,()=>payrollAbsenceSchema48(env));
 if(action==='list'){
  const competence=month48(c.competence,d);
  return {...await fetch48(env,companyId,competence,d),
   warning:'A falta deve ser classificada. Perda de DSR nunca é presumida; confirme com a escala e o período de apuração.'};
 }
 if(action==='classify'){
  const id=String(body.occurrence_id||''),classification=String(body.classification||'');
  if(!['JUSTIFICADA','INJUSTIFICADA'].includes(classification))error48(d,'Classificação inválida.','VALIDATION_ERROR',400);
  const occ=await env.DB.prepare("SELECT id,employee_id,kind,start_date,end_date FROM payroll_employee_occurrences WHERE id=? AND company_id=?").bind(id,companyId).first();
  if(!occ||occ.kind!=='FALTA')error48(d,'Falta não encontrada na empresa.','NOT_FOUND',404);
  if(occ.start_date!==occ.end_date)error48(d,'Divida ocorrências de falta em dias individuais.','MULTIDAY_ABSENCE');
  if(classification==='JUSTIFICADA'){
   const dependent=await env.DB.prepare("SELECT id FROM payroll_time_adjustments48 WHERE company_id=? AND employee_id=? AND kind='DSR_LOSS' AND source_date=? LIMIT 1").bind(companyId,occ.employee_id,occ.start_date).first();
   if(dependent)error48(d,'Existe uma perda de DSR associada à falta. Exclua a perda de DSR antes de justificá-la.','DSR_DEPENDENCY');
  }
  await ensureOpen48(env,companyId,occ.start_date,d);
  const notes=String(body.notes||'').trim();
  if(!notes||notes.length>500)error48(d,'Informe justificativa/documento de conferência de até 500 caracteres.','VALIDATION_ERROR',400);
  await env.DB.prepare("INSERT INTO payroll_absence_decisions48(occurrence_id,company_id,employee_id,classification,notes,updated_by) VALUES (?,?,?,?,?,?) ON CONFLICT(occurrence_id) DO UPDATE SET classification=excluded.classification,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP")
    .bind(id,companyId,occ.employee_id,classification,notes,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,action:'CONFIRM',entity:'payroll_absence_decisions48',entityId:id,after:{classification,notes},request});
  return {saved:true,occurrence_id:id,classification};
 }
 if(action==='add'){
  const kind=String(body.kind||''),employeeId=String(body.employee_id||'').trim();
  if(!['LATE','DSR_LOSS'].includes(kind))error48(d,'Tipo de apontamento inválido.','VALIDATION_ERROR',400);
  const date=date48(body.event_date,d);
  await ensureOpen48(env,companyId,date,d);
  const emp=await env.DB.prepare("SELECT id,admission_date FROM payroll_employees WHERE id=? AND company_id=?").bind(employeeId,companyId).first();
  if(!emp||date<emp.admission_date)error48(d,'Funcionário ou data de apontamento inválidos.','INVALID_EMPLOYEE',400);
  const notes=String(body.notes||'').trim();
  if(!notes||notes.length>500)error48(d,'Informe o documento ou a justificativa de conferência (até 500 caracteres).','VALIDATION_ERROR',400);
  let minutes=0,sourceDate=null;
  if(kind==='LATE'){
   minutes=Number(body.minutes);
   if(!Number.isSafeInteger(minutes)||minutes<1||minutes>1440)error48(d,'Informe de 1 a 1440 minutos de atraso.','VALIDATION_ERROR',400);
  }else{
   if(String(body.confirmation||'')!=='CONFIRMAR DSR')error48(d,'Confirme a perda do DSR digitando CONFIRMAR DSR.','CONFIRMATION_REQUIRED',400);
   sourceDate=date48(body.source_date,d);
   const gap=daysBetween48(sourceDate,date);
   if(gap<1||gap>6)error48(d,'A perda do DSR deve apontar ocorrência anterior dentro dos seis dias precedentes.','DSR_SOURCE_DATE',400);
   const falta=await env.DB.prepare("SELECT o.id FROM payroll_employee_occurrences o JOIN payroll_absence_decisions48 z ON z.occurrence_id=o.id AND z.company_id=o.company_id WHERE o.company_id=? AND o.employee_id=? AND o.kind='FALTA' AND o.start_date=? AND o.end_date=? AND z.classification='INJUSTIFICADA' LIMIT 1").bind(companyId,employeeId,sourceDate,sourceDate).first();
   const delay=await env.DB.prepare("SELECT id FROM payroll_time_adjustments48 WHERE company_id=? AND employee_id=? AND kind='LATE' AND event_date=? LIMIT 1").bind(companyId,employeeId,sourceDate).first();
   if(!falta&&!delay)error48(d,'Informe uma falta injustificada ou atraso já confirmado como origem desse DSR.','DSR_SOURCE_MISSING');
  }
  const id=d.uuid();
  try{
   await env.DB.prepare("INSERT INTO payroll_time_adjustments48(id,company_id,employee_id,kind,event_date,minutes,source_date,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?)")
     .bind(id,companyId,employeeId,kind,date,minutes,sourceDate,notes,auth.user.id).run();
  }catch(e){
   if(/UNIQUE constraint failed/i.test(String(e)))error48(d,'Já existe esse tipo de apontamento para o funcionário na data.','DUPLICATE_ADJUSTMENT');
   throw e;
  }
  await d.audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'payroll_time_adjustments48',entityId:id,after:{kind,date,minutes,sourceDate,notes},request});
  return {created:true,id};
 }
 if(action==='delete'){
  const id=String(c.id||'');
  const item=await env.DB.prepare("SELECT id,kind,event_date,employee_id FROM payroll_time_adjustments48 WHERE id=? AND company_id=?").bind(id,companyId).first();
  if(!item)error48(d,'Apontamento não encontrado.','NOT_FOUND',404);
  await ensureOpen48(env,companyId,item.event_date,d);
  if(item.kind==='LATE'){
   const dsr=await env.DB.prepare("SELECT id FROM payroll_time_adjustments48 WHERE company_id=? AND employee_id=? AND kind='DSR_LOSS' AND source_date=? LIMIT 1").bind(companyId,item.employee_id,item.event_date).first();
   if(dsr)error48(d,'Existe DSR vinculado ao atraso. Exclua primeiro o DSR.','DSR_DEPENDENCY');
  }
  await env.DB.prepare("DELETE FROM payroll_time_adjustments48 WHERE company_id=? AND id=?").bind(companyId,id).run();
  await d.audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:'payroll_time_adjustments48',entityId:id,before:item,request});
  return {deleted:true,id};
 }
 error48(d,'Ação não encontrada.','NOT_FOUND',404);
}
