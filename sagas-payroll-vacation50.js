// SAGAS Folha v88 — controle de períodos aquisitivos e vínculo de férias.
// NÃO homologa recibos, remuneração líquida, abatimento previdenciário, financeiro ou contábil.
// A apuração dos direitos depende de confirmação documental do DP (CLT arts. 130 e 134).
function vacationFail50(d,msg,code='VACATION_REVIEW_REQUIRED',status=409){throw new d.HttpError(status,msg,code)}
function strictDate50(value,d){
 const v=String(value||'');
 if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])-[0-3]\d$/.test(v))
  vacationFail50(d,'Data inválida (AAAA-MM-DD).','VALIDATION_ERROR',400);
 const [y,m,day]=v.split('-').map(Number);
 if(day<1||day>new Date(Date.UTC(y,m,0)).getUTCDate())
  vacationFail50(d,'Data inexistente no calendário.','VALIDATION_ERROR',400);
 return v;
}
function asDate50(s){return new Date(s+'T00:00:00Z')}
function dateShift50(s,days){let t=asDate50(s);t.setUTCDate(t.getUTCDate()+days);return t.toISOString().slice(0,10)}
function addYear50(s){const t=asDate50(s);t.setUTCFullYear(t.getUTCFullYear()+1);return t.toISOString().slice(0,10)}
function dayCount50(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)+1}
function vacationRight50(n){
 if(n<=5)return 30;
 if(n<=14)return 24;
 if(n<=23)return 18;
 if(n<=32)return 12;
 return 0;
}
function noted50(x,d){const s=String(x||'').trim();if(s.length<10||s.length>500)vacationFail50(d,'Descreva a conferência documental (10 a 500 caracteres).','VALIDATION_ERROR',400);return s}
async function payrollVacationSchema50(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_cycles50 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,acquisition_start TEXT NOT NULL,acquisition_end TEXT NOT NULL,concession_deadline TEXT NOT NULL,unjustified_absences INTEGER NOT NULL CHECK(unjustified_absences BETWEEN 0 AND 32),entitled_days INTEGER NOT NULL CHECK(entitled_days IN (12,18,24,30)),notes TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,acquisition_start))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_vacation_cycles50 ON payroll_vacation_cycles50(company_id,employee_id,acquisition_start)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_links50 (occurrence_id TEXT PRIMARY KEY REFERENCES payroll_employee_occurrences(id) ON DELETE RESTRICT,cycle_id TEXT NOT NULL REFERENCES payroll_vacation_cycles50(id) ON DELETE RESTRICT,company_id TEXT NOT NULL,employee_id TEXT NOT NULL,notes TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_vacation_links50 ON payroll_vacation_links50(company_id,employee_id,cycle_id)")
 ]);
}
async function employee50(env,companyId,id,d){
 const e=await env.DB.prepare("SELECT e.id,e.name,e.admission_date,n.number FROM payroll_employees e LEFT JOIN payroll_employee_numbers n ON n.company_id=e.company_id AND n.employee_id=e.id WHERE e.company_id=? AND e.id=? LIMIT 1").bind(companyId,id).first();
 if(!e)vacationFail50(d,'Funcionário não encontrado nesta empresa.','NOT_FOUND',404);
 strictDate50(e.admission_date,d);
 return e;
}
async function occurrence50(env,companyId,id,d){
 const o=await env.DB.prepare("SELECT o.id,o.employee_id,o.kind,o.start_date,o.end_date,e.name AS employee_name FROM payroll_employee_occurrences o JOIN payroll_employees e ON e.id=o.employee_id AND e.company_id=o.company_id WHERE o.id=? AND o.company_id=? AND o.kind='FERIAS' LIMIT 1").bind(id,companyId).first();
 if(!o)vacationFail50(d,'Ocorrência de férias inexistente nesta empresa.','NOT_FOUND',404);
 const start=strictDate50(o.start_date,d),end=strictDate50(o.end_date,d);
 if(end<start)vacationFail50(d,'O período de férias está invertido.','VACATION_DATES');
 return {...o,days:dayCount50(start,end)};
}
async function openCompetences50(env,companyId,start,end,d){
 const rows=(await env.DB.prepare("SELECT competence,status FROM payroll_competences WHERE company_id=? AND competence>=? AND competence<=? AND status<>'OPEN' LIMIT 1").bind(companyId,start.slice(0,7),end.slice(0,7)).all()).results||[];
 if(rows.length)vacationFail50(d,'Existe competência fechada ou bloqueada nas férias: '+rows[0].competence+'.','COMPETENCE_LOCKED');
}
async function employeeView50(env,companyId,employeeId,occurrenceId,d){
 const employee=await employee50(env,companyId,employeeId,d);
 const cycles=(await env.DB.prepare("SELECT id,acquisition_start,acquisition_end,concession_deadline,unjustified_absences,entitled_days,notes,created_at FROM payroll_vacation_cycles50 WHERE company_id=? AND employee_id=? ORDER BY acquisition_start DESC LIMIT 80").bind(companyId,employeeId).all()).results||[];
 const links=(await env.DB.prepare("SELECT l.occurrence_id,l.cycle_id,l.notes,o.start_date,o.end_date FROM payroll_vacation_links50 l JOIN payroll_employee_occurrences o ON o.id=l.occurrence_id AND o.company_id=l.company_id AND o.employee_id=l.employee_id AND o.kind='FERIAS' WHERE l.company_id=? AND l.employee_id=? ORDER BY o.start_date,l.occurrence_id LIMIT 150").bind(companyId,employeeId).all()).results||[];
 const byCycle=new Map();
 for(const a of links){
  const x=byCycle.get(a.cycle_id)||[];
  if(strictDate50(a.end_date,d)<strictDate50(a.start_date,d))vacationFail50(d,'Histórico de férias contém período invertido.','VACATION_DATES');
  x.push({...a,days:dayCount50(a.start_date,a.end_date)});
  byCycle.set(a.cycle_id,x);
 }
 const enriched=cycles.map(p=>{
  const items=byCycle.get(p.id)||[],used=items.reduce((n,x)=>n+x.days,0);
  const remaining=p.entitled_days-used;
  const largest=items.reduce((n,x)=>Math.max(n,x.days),0);
  return {...p,used_days:used,remaining_days:remaining,period_count:items.length,fragments:items,
   warnings:[
    ...(remaining<0?['Saldo negativo: conferir alterações das ocorrências já vinculadas.']:[]),
    ...(items.length>3?['Há mais de três frações de gozo.']:[]),
    ...(items.length>1 && largest<14?['Fracionamento exige pelo menos um período com 14 dias.']:[]),
    ...(items.some(x=>x.start_date<=p.acquisition_end)?['Férias iniciadas antes do fim do período aquisitivo: verificar hipótese legal específica.']:[]),
    ...(items.some(x=>x.end_date>p.concession_deadline)?['Gozo após o período concessivo: conferir consequências legais.']:[])
   ]};
 });
 const occurrence=occurrenceId?await occurrence50(env,companyId,occurrenceId,d):null;
 if(occurrence&&occurrence.employee_id!==employeeId)vacationFail50(d,'A ocorrência não pertence ao funcionário.','FORBIDDEN',403);
 return {employee,occurrence,periods:enriched,allocation:occurrence?links.find(x=>x.occurrence_id===occurrence.id)||null:null,
  warnings:['Direito e faltas injustificadas informados pelo DP, não apurados automaticamente a partir do histórico.',
   'Conferir suspensões do período aquisitivo, férias coletivas, escalas e feriados antes da concessão.',
   'Esta etapa não paga férias, não contabiliza e não libera folha fechada.']};
}
export async function payrollVacation50(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='read'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-vacation50',1,()=>payrollVacationSchema50(env));
 if(action==='read'){
  const occurrenceId=String(c.occurrenceId||'').trim(),employeeId=String(c.employeeId||'').trim();
  if(occurrenceId){
   const o=await occurrence50(env,companyId,occurrenceId,d);
   return await employeeView50(env,companyId,o.employee_id,occurrenceId,d);
  }
  if(!employeeId)vacationFail50(d,'Informe o funcionário ou a ocorrência.','VALIDATION_ERROR',400);
  return await employeeView50(env,companyId,employeeId,null,d);
 }
 if(action==='register'){
  const employeeId=String(body.employee_id||''),start=strictDate50(body.acquisition_start,d);
  const employee=await employee50(env,companyId,employeeId,d);
  if(start<employee.admission_date)vacationFail50(d,'Aquisição não pode começar antes da admissão.','VACATION_ACQUISITION');
  if(employee.admission_date.endsWith('-02-29'))
   vacationFail50(d,'Admissão em 29 de fevereiro requer parametrização específica de aniversário.','VACATION_LEAP_YEAR');
  if(start.slice(5)!==employee.admission_date.slice(5))
   vacationFail50(d,'O período aquisitivo deve iniciar no aniversário da admissão.','VACATION_ACQUISITION');
  const missing=Number(start.slice(0,4))-Number(employee.admission_date.slice(0,4));
  if(!Number.isSafeInteger(missing)||missing<0||missing>90)
   vacationFail50(d,'Período aquisitivo fora do vínculo empregatício.','VACATION_ACQUISITION');
  const end=dateShift50(addYear50(start),-1);
  // Período concessivo começa no dia seguinte ao aquisitivo e tem até 12 meses.
  const concessionDeadline=dateShift50(addYear50(dateShift50(end,1)),-1);
  const raw=String(body.unjustified_absences??'');
  if(!/^\d{1,2}$/.test(raw))vacationFail50(d,'Informe a quantidade conferida de faltas injustificadas.','VALIDATION_ERROR',400);
  const unjustified=Number(raw),days=vacationRight50(unjustified);
  if(!days)vacationFail50(d,'Mais de 32 faltas exige apuração específica.','VACATION_ENTITLEMENT');
  const notes=noted50(body.notes,d);
  if(body.confirmation!=='DIREITO CONFERIDO')vacationFail50(d,'Confirme digitando DIREITO CONFERIDO.','CONFIRMATION_REQUIRED',400);
  const overlap=await env.DB.prepare("SELECT id FROM payroll_vacation_cycles50 WHERE company_id=? AND employee_id=? AND acquisition_start<=? AND acquisition_end>=? LIMIT 1").bind(companyId,employeeId,end,start).first();
  if(overlap)vacationFail50(d,'Período aquisitivo já cadastrado ou sobreposto.','VACATION_DUPLICATE');
  const record={employee_id:employeeId,acquisition_start:start,acquisition_end:end,concession_deadline:concessionDeadline,unjustified_absences:unjustified,entitled_days:days,notes};
  const id=d.uuid();
  await env.DB.prepare("INSERT INTO payroll_vacation_cycles50(id,company_id,employee_id,acquisition_start,acquisition_end,concession_deadline,unjustified_absences,entitled_days,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)")
   .bind(id,companyId,employeeId,start,end,concessionDeadline,unjustified,days,notes,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'payroll_vacation_cycles50',entityId:id,request,before:null,after:record});
  return {saved:true,cycle_id:id,...record,
   note:'Registro confirmado pelo DP; revisar licenças, faltas e hipóteses de interrupção do período aquisitivo.'};
 }
 if(action==='link'){
  const occurrenceId=String(body.occurrence_id||''),cycleId=String(body.cycle_id||'');
  if(body.confirmation!=='VINCULAR FERIAS')vacationFail50(d,'Confirme digitando VINCULAR FERIAS.','CONFIRMATION_REQUIRED',400);
  const notes=noted50(body.notes,d),occ=await occurrence50(env,companyId,occurrenceId,d);
  if(occ.days<5||occ.days>30)vacationFail50(d,'Férias devem ter de 5 a 30 dias neste fluxo individual.','VACATION_DAYS');
  const cycle=await env.DB.prepare("SELECT * FROM payroll_vacation_cycles50 WHERE id=? AND company_id=? AND employee_id=? LIMIT 1").bind(cycleId,companyId,occ.employee_id).first();
  if(!cycle)vacationFail50(d,'Período aquisitivo não pertence ao funcionário.','NOT_FOUND',404);
  if(occ.start_date<=cycle.acquisition_end)vacationFail50(d,'Férias antes da aquisição integral exigem processo específico.','VACATION_EARLY');
  const prior=await env.DB.prepare("SELECT occurrence_id FROM payroll_vacation_links50 WHERE occurrence_id=? AND company_id=? LIMIT 1").bind(occurrenceId,companyId).first();
  if(prior)vacationFail50(d,'Férias já vinculadas. Desvincule primeiro para corrigir.','VACATION_LINK_EXISTS');
  const collisions=await env.DB.prepare("SELECT id FROM payroll_employee_occurrences WHERE company_id=? AND employee_id=? AND id<>? AND start_date<=? AND end_date>=? LIMIT 1").bind(companyId,occ.employee_id,occurrenceId,occ.end_date,occ.start_date).first();
  if(collisions)vacationFail50(d,'Há ocorrência sobreposta a essas férias.','VACATION_OVERLAP');
  await openCompetences50(env,companyId,occ.start_date,occ.end_date,d);
  const view=await employeeView50(env,companyId,occ.employee_id,null,d);
  const group=view.periods.find(x=>x.id===cycleId);
  if(!group||group.period_count>=3||group.remaining_days<occ.days)
   vacationFail50(d,'Saldo insuficiente ou limite de três frações atingido.','VACATION_BALANCE');
  const lengths=group.fragments.map(x=>x.days).concat(occ.days);
  const remainder=cycle.entitled_days-lengths.reduce((n,x)=>n+x,0);
  if(lengths.some(x=>x<5)||lengths.length>1 && Math.max(...lengths)<14 && remainder<14 || lengths.length===1 && lengths[0]<cycle.entitled_days && Math.max(lengths[0],remainder)<14)
   vacationFail50(d,'O fracionamento impede um período mínimo de 14 dias. Reveja os dias e o saldo.','VACATION_FRACTION');
  // Uma instrução condicional atômica protege saldo e frações contra duas gravações simultâneas.
  const insert=await env.DB.prepare(
   "INSERT INTO payroll_vacation_links50(occurrence_id,cycle_id,company_id,employee_id,notes,created_by) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM payroll_vacation_links50 WHERE cycle_id=? AND company_id=?)<3 AND (SELECT COALESCE(SUM(CAST(julianday(o.end_date)-julianday(o.start_date)+1 AS INTEGER)),0) FROM payroll_vacation_links50 l JOIN payroll_employee_occurrences o ON o.id=l.occurrence_id AND o.company_id=l.company_id WHERE l.cycle_id=? AND l.company_id=?) + ? <= ?")
   .bind(occurrenceId,cycleId,companyId,occ.employee_id,notes,auth.user.id,cycleId,companyId,cycleId,companyId,occ.days,cycle.entitled_days).run();
  if(!insert.meta?.changes)vacationFail50(d,'Saldo ou frações foram modificados durante a conferência. Atualize a tela.','VACATION_CONCURRENT');
  await d.audit(env,{companyId,userId:auth.user.id,action:'LINK',entity:'payroll_vacation_links50',entityId:occurrenceId,request,before:null,after:{cycle_id:cycleId,days:occ.days,notes}});
  return {linked:true,occurrence_id:occurrenceId,cycle_id:cycleId};
 }
 if(action==='unlink'){
  const occurrenceId=String(body.occurrence_id||''),occ=await occurrence50(env,companyId,occurrenceId,d);
  if(body.confirmation!=='DESVINCULAR FERIAS')vacationFail50(d,'Confirme digitando DESVINCULAR FERIAS.','CONFIRMATION_REQUIRED',400);
  const existing=await env.DB.prepare("SELECT cycle_id,notes FROM payroll_vacation_links50 WHERE occurrence_id=? AND company_id=? AND employee_id=? LIMIT 1").bind(occurrenceId,companyId,occ.employee_id).first();
  if(!existing)vacationFail50(d,'Férias sem vínculo para desfazer.','NOT_FOUND',404);
  await openCompetences50(env,companyId,occ.start_date,occ.end_date,d);
  await env.DB.prepare("DELETE FROM payroll_vacation_links50 WHERE occurrence_id=? AND company_id=?").bind(occurrenceId,companyId).run();
  await d.audit(env,{companyId,userId:auth.user.id,action:'UNLINK',entity:'payroll_vacation_links50',entityId:occurrenceId,request,before:existing,after:null});
  return {unlinked:true,occurrence_id:occurrenceId};
 }
 vacationFail50(d,'Ação de férias não encontrada.','NOT_FOUND',404);
}
