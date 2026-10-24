// SAGAS folha v86 — classificação de licenças e afastamentos.
// Tratamento mensal limitado a licença remunerada, licença sem remuneração validada
// e até quinze dias iniciais de doença pagos pela empresa; demais processos bloqueados.
const MODES49={CALENDAR:'Dias efetivos do mês',COMMERCIAL_30:'Mês comercial de 30 dias'};
const TREATMENTS49={
 PAID:'Licença remunerada',
 UNPAID:'Licença sem remuneração',
 SICK_EMPLOYER_15:'Doença — até 15 dias pagos pela empresa',
 INSS:'Benefício por incapacidade / INSS (conferência)',
 MATERNITY:'Licença-maternidade (processo próprio)',
 WORK_ACCIDENT:'Acidente de trabalho (processo próprio)',
 OTHER:'Outro afastamento (processo próprio)'
};
function fail49(d,message,code='LEAVE_REVIEW_REQUIRED',status=409){throw new d.HttpError(status,message,code)}
function month49(value,d){
 const v=String(value||'');
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v))fail49(d,'Competência inválida.','INVALID_COMPETENCE',400);
 return v;
}
function time49(d){return Date.parse(d+'T00:00:00Z')}
function days49(from,to){return Math.round((time49(to)-time49(from))/86400000)+1}
function date49(v,d){
 const s=String(v||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))fail49(d,'Data do afastamento inválida.','INVALID_DATE');
 const [year,month,day]=s.split('-').map(Number);
 if(!day||day>new Date(Date.UTC(year,month,0)).getUTCDate())fail49(d,'Data do afastamento inexistente.','INVALID_DATE');
 return s;
}
export async function payrollLeaveSchema49(env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_leave_decisions49 (occurrence_id TEXT PRIMARY KEY REFERENCES payroll_employee_occurrences(id) ON DELETE RESTRICT,company_id TEXT NOT NULL,employee_id TEXT NOT NULL,treatment TEXT NOT NULL CHECK(treatment IN ('PAID','UNPAID','SICK_EMPLOYER_15','INSS','MATERNITY','WORK_ACCIDENT','OTHER')),proration_mode TEXT CHECK(proration_mode IS NULL OR proration_mode IN ('CALENDAR','COMMERCIAL_30')),notes TEXT NOT NULL,confirmed_by TEXT NOT NULL,confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 await env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_leave_decisions49 ON payroll_leave_decisions49(company_id,employee_id)").run();
}
async function source49(env,companyId,period,d){
 const month=month49(period,d),first=month+'-01';
 const [y,m]=month.split('-').map(Number);
 const last=month+'-'+String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0');
 const q=await env.DB.prepare("SELECT o.id,o.employee_id,o.kind,o.start_date,o.end_date,o.notes,e.name AS employee_name,n.number AS employee_number,c.treatment,c.proration_mode,c.notes AS decision_notes FROM payroll_employee_occurrences o JOIN payroll_employees e ON e.id=o.employee_id AND e.company_id=o.company_id LEFT JOIN payroll_employee_numbers n ON n.employee_id=o.employee_id AND n.company_id=o.company_id LEFT JOIN payroll_leave_decisions49 c ON c.occurrence_id=o.id AND c.company_id=o.company_id WHERE o.company_id=? AND o.kind IN ('LICENCA','AFASTAMENTO','FERIAS') AND o.start_date<=? AND o.end_date>=? ORDER BY o.employee_id,o.start_date,o.id LIMIT 501").bind(companyId,last,first).all();
 const items=q.results||[];
 if(items.length>500)fail49(d,'Limite de 500 afastamentos por competência excedido.','LEAVE_LIMIT');
 return {competence:month,first,last,items};
}
export async function payrollLeaveSnapshot49(env,companyId,period,d){
 const src=await source49(env,companyId,period,d),map=new Map();
 function entry(id){
  if(!map.has(id))map.set(id,{leave:[],blockers:[],warnings:[],dates:[]});
  return map.get(id);
 }
 for(const o of src.items){
  const rec=entry(o.employee_id),id=o.id;
  const from=date49(o.start_date,d),to=date49(o.end_date,d);
  if(to<from){rec.blockers.push('Período invertido em '+id+'.');continue;}
  if(o.kind==='FERIAS'){rec.blockers.push('Férias '+from+' a '+to+': utilize o processamento próprio de férias.');continue;}
  if(!TREATMENTS49[o.treatment]){rec.blockers.push('Classifique o afastamento/licença de '+from+' a '+to+' antes de calcular.');continue;}
  const tr=o.treatment;
  if(tr==='SICK_EMPLOYER_15'&&rec.leave.some(x=>x.treatment==='SICK_EMPLOYER_15')){
   rec.blockers.push('Mais de um afastamento por doença no mês: revise possível continuidade ou recorrência previdenciária.');continue;
  }
  if(o.kind==='LICENCA'&&!['PAID','UNPAID'].includes(tr)){rec.blockers.push('A licença de '+from+' deve ser classificada como remunerada ou sem remuneração.');continue;}
  if(o.kind==='AFASTAMENTO'&&tr!=='SICK_EMPLOYER_15'){
   rec.blockers.push('O afastamento '+tr+' exige cálculo específico e não é processado nesta fase.');continue;
  }
  if(tr==='SICK_EMPLOYER_15'&&days49(from,to)>15){
   rec.blockers.push('O afastamento por doença excede os primeiros 15 dias: exige integração previdenciária.');continue;
  }
  if(tr==='UNPAID'&&!MODES49[o.proration_mode]){
   rec.blockers.push('Defina dias reais ou mês comercial na licença sem remuneração de '+from+'.');continue;
  }
  const first=from<src.first?src.first:from,last=to>src.last?src.last:to;
  const start=time49(first),end=time49(last);
  let collision=false;
  for(let time=start;time<=end;time+=86400000){
   const date=new Date(time).toISOString().slice(0,10);
   if(rec.dates.includes(date)){collision=true;break;}
  }
  if(collision){rec.blockers.push('Há licenças ou afastamentos sobrepostos para o funcionário.');continue;}
  const dates=[];
  for(let time=start;time<=end;time+=86400000)dates.push(new Date(time).toISOString().slice(0,10));
  rec.dates.push(...dates);
  rec.leave.push({id,kind:o.kind,treatment:tr,proration_mode:o.proration_mode||null,
   start_date:from,end_date:to,from:first,to:last,days:dates.length});
  rec.warnings.push(TREATMENTS49[tr]+': '+first+' a '+last+'.');
 }
 return map;
}
function halfUp49(n,d,ctx){
 const value=(n+d/2n)/d;
 if(value<0||value>99999999999n)fail49(ctx,'Valor de licença fora do limite.','LEAVE_AMOUNT');
 return Number(value);
}
export function payrollLeaveAmounts49(salaryCents,paidSalary,competence,snapshot,otherAttendance,salaryChanges,salaryMode,admissionDate,manualMovements,d){
 const out=[],data=snapshot||{leave:[],blockers:[],dates:[]};
 if(data.blockers?.length)fail49(d,data.blockers[0],'LEAVE_PENDING');
 const types=data.leave||[];
 if(!types.length)return {entries:[],discount_cents:0};
 const conflicting=(otherAttendance?.absences||[]).some(a=>data.dates?.includes(a.date))
   ||(otherAttendance?.adjustments||[]).some(a=>data.dates?.includes(a.event_date));
 if(conflicting)fail49(d,'Existe falta ou atraso sobreposto a licença/afastamento. Regularize o apontamento.','LEAVE_ATTENDANCE_OVERLAP');
 if(types.some(t=>t.treatment==='UNPAID')){
  if(String(admissionDate||'').slice(0,7)===competence)
    fail49(d,'Licença sem remuneração e admissão no mesmo mês exigem cálculo conjunto específico.','LEAVE_ADMISSION');
  if((salaryChanges||[]).length)
    fail49(d,'Licença sem remuneração e reajuste no mesmo mês exigem cálculo por vigências.','LEAVE_SALARY_CHANGE');
  if((manualMovements||[]).some(x=>x.unit!=='VALOR'))
    fail49(d,'Eventos com fórmulas por hora, dia ou percentual precisam de conferência na licença sem remuneração.','LEAVE_FORMULA');
 }
 const salary=Number(salaryCents),paid=Number(paidSalary);
 if(!Number.isSafeInteger(salary)||salary<=0||!Number.isSafeInteger(paid)||paid<=0)
  fail49(d,'Salário inválido para licença.','LEAVE_SALARY');
 const [year,month]=competence.split('-').map(Number),length=new Date(Date.UTC(year,month,0)).getUTCDate();
 const unpaid=types.filter(x=>x.treatment==='UNPAID');
 if(unpaid.length>1)fail49(d,'Há mais de uma licença sem remuneração na mesma competência. Consolide o período antes de calcular.','LEAVE_MULTIPLE_UNPAID');
 const allUnpaidDays=unpaid.reduce((n,x)=>n+x.days,0);
 let discount=0;
 // Calcula cada licença pela referência selecionada, salvo licença que cobre o mês inteiro.
 for(const x of types){
  if(x.treatment==='PAID'){
   out.push({event_code:'LICENCA_REMUNERADA',event_name:'Licença remunerada',line_type:'INFORMATIVO',amount_cents:0,
    reference_text:'Período '+x.from+' até '+x.to});
  }else if(x.treatment==='SICK_EMPLOYER_15'){
   out.push({event_code:'DOENCA_EMPRESA_15',event_name:'Doença — primeiros 15 dias',line_type:'INFORMATIVO',amount_cents:0,
    reference_text:'Empresa paga '+x.days+' dia(s), '+x.from+' até '+x.to});
  }else if(x.treatment==='UNPAID'){
   const divisor=x.proration_mode==='CALENDAR'?length:30;
   const monthCovered=allUnpaidDays===length;
   // Nunca sobrar salário em licença abrangendo o mês inteiro (fevereiro inclusive).
   // Para 31 dias em mês comercial, sobrepor 30 dias de ausência exige revisão.
   if(x.proration_mode==='COMMERCIAL_30'&&length===31&&allUnpaidDays===30)
    fail49(d,'Licença de 30 dos 31 dias em mês comercial requer apuração manual.','LEAVE_COMMERCIAL_EDGE');
   const amount=monthCovered?paid:halfUp49(BigInt(salary)*BigInt(x.days),BigInt(divisor),d);
   discount+=amount;
   out.push({event_code:'LICENCA_NAO_REMUNERADA',event_name:'Licença sem remuneração',line_type:'DESCONTO',amount_cents:amount,
    reference_text:x.days+'/'+divisor+' dia(s) de licença de '+x.from+' até '+x.to});
  }
 }
 if(discount>paid||discount>salary)
  fail49(d,'O desconto de licença supera a remuneração. Confira as vigências e dias.','LEAVE_EXCEEDS_PAY');
 return {entries:out,discount_cents:discount};
}
export async function payrollLeave49(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='list'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-leave49',1,()=>payrollLeaveSchema49(env));
 if(action==='list'){
  const result=await source49(env,companyId,c.competence,d);
  return {...result,treatments:TREATMENTS49,modes:MODES49,
   note:'Benefício previdenciário, acidente de trabalho, maternidade e férias ainda exigem processamento próprio.'};
 }
 if(action!=='classify')fail49(d,'Operação inválida.','NOT_FOUND',404);
 const id=String(body.occurrence_id||''),tr=String(body.treatment||'');
 const occ=await env.DB.prepare("SELECT id,employee_id,kind,start_date,end_date FROM payroll_employee_occurrences WHERE id=? AND company_id=?").bind(id,companyId).first();
 if(!occ||!['LICENCA','AFASTAMENTO'].includes(occ.kind))fail49(d,'Licença ou afastamento não encontrado.','NOT_FOUND',404);
 if(!Object.hasOwn(TREATMENTS49,tr))fail49(d,'Tipo de afastamento inválido.','VALIDATION_ERROR',400);
 if(occ.kind==='LICENCA'&&!['PAID','UNPAID'].includes(tr))fail49(d,'Licença deve ser remunerada ou sem remuneração.','VALIDATION_ERROR',400);
 if(occ.kind==='AFASTAMENTO'&&['PAID','UNPAID'].includes(tr))fail49(d,'Classifique afastamento pela causa correspondente.','VALIDATION_ERROR',400);
 if(tr==='SICK_EMPLOYER_15'&&days49(date49(occ.start_date,d),date49(occ.end_date,d))>15)
  fail49(d,'Doença além dos primeiros 15 dias exige processo previdenciário.','INSS_REVIEW');
 const mode=tr==='UNPAID'?String(body.proration_mode||''):null;
 if(tr==='UNPAID'&&!Object.hasOwn(MODES49,mode))fail49(d,'Escolha divisor por calendário ou 30 dias.','VALIDATION_ERROR',400);
 const notes=String(body.notes||'').trim();
 if(!notes||notes.length>500)fail49(d,'Informe comprovante ou fundamento da classificação (até 500 caracteres).','VALIDATION_ERROR',400);
 if(tr==='SICK_EMPLOYER_15'){
  const startMs=time49(occ.start_date),from=new Date(startMs-60*86400000).toISOString().slice(0,10);
  const other=await env.DB.prepare("SELECT o.id FROM payroll_employee_occurrences o JOIN payroll_leave_decisions49 z ON z.occurrence_id=o.id AND z.company_id=o.company_id WHERE o.company_id=? AND o.employee_id=? AND o.id<>? AND z.treatment='SICK_EMPLOYER_15' AND o.start_date<=? AND o.end_date>=? LIMIT 1").bind(companyId,occ.employee_id,id,occ.start_date,from).first();
  if(other)fail49(d,'Há outro afastamento por doença nos últimos 60 dias; analise continuidade e contagem previdenciária.','SICKNESS_RECURRENCE');
 }
 if(tr==='SICK_EMPLOYER_15'&&body.confirmation!=='PRIMEIROS 15 DIAS')
  fail49(d,'Confirme a responsabilidade da empresa digitando PRIMEIROS 15 DIAS.','CONFIRMATION_REQUIRED',400);
 const begin=occ.start_date.slice(0,7),end=occ.end_date.slice(0,7);
 const blocks=(await env.DB.prepare("SELECT competence,status FROM payroll_competences WHERE company_id=? AND competence>=? AND competence<=? AND status<>'OPEN' LIMIT 1").bind(companyId,begin,end).all()).results||[];
 if(blocks.length)fail49(d,'Há competência fechada ou bloqueada no período; a classificação não pode ser alterada.','COMPETENCE_LOCKED');
 const existing=(await env.DB.prepare("SELECT occurrence_id,treatment,proration_mode,notes FROM payroll_leave_decisions49 WHERE occurrence_id=? AND company_id=?").bind(id,companyId).first())||null;
 await env.DB.prepare("INSERT INTO payroll_leave_decisions49(occurrence_id,company_id,employee_id,treatment,proration_mode,notes,confirmed_by) VALUES (?,?,?,?,?,?,?) ON CONFLICT(occurrence_id) DO UPDATE SET treatment=excluded.treatment,proration_mode=excluded.proration_mode,notes=excluded.notes,confirmed_by=excluded.confirmed_by,confirmed_at=CURRENT_TIMESTAMP").bind(id,companyId,occ.employee_id,tr,mode,notes,auth.user.id).run();
 await d.audit(env,{companyId,userId:auth.user.id,action:'CONFIRM',entity:'payroll_leave_decisions49',entityId:id,request,before:existing,after:{treatment:tr,proration_mode:mode,notes}});
 return {saved:true,occurrence_id:id,treatment:tr,proration_mode:mode};
}
