// SAGAS Folha v114 — abertura auditável da rescisão CLT com estimativas e bloqueios.
// NÃO aprova rescisão, altera empregado, gera TRCT final, financeiro, diário ou FGTS.
// Incidências tributárias, convenções, férias aquisitivas e saldos FGTS exigem etapa própria.
function fail114(d,code,message,status=409){throw new d.HttpError(status,message,code)}
function date114(x,d,label){
 const value=String(x||'');
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||
    new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)
  fail114(d,'DATE_INVALID',label+' inválida.',400);
 return value;
}
function daysInMonth114(year,month){return new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate()}
function addDays114(date,days){
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
function anniversary114(date,year){
 const m=Number(date.slice(5,7)),day=Number(date.slice(8));
 return String(year)+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(day,daysInMonth114(year,m))).padStart(2,'0');
}
export function noticeDays114(admission,termination){
 const start=new Date(admission+'T12:00:00Z'),end=new Date(termination+'T12:00:00Z');
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>end)throw Error('Invalid service period');
 const year=end.getUTCFullYear();let years=year-start.getUTCFullYear();
 if(anniversary114(admission,year)>termination)years--;
 return Math.min(90,30+3*Math.min(20,Math.max(0,years)));
}
export function twelfths114(admission,until,year){
 const start=Math.max(Date.parse(admission+'T12:00:00Z'),Date.parse(year+'-01-01T12:00:00Z'));
 const end=Math.min(Date.parse(until+'T12:00:00Z'),Date.parse(year+'-12-31T12:00:00Z'));
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return 0;
 let count=0;
 for(let m=1;m<=12;m++){
  const lo=Math.max(start,Date.parse(year+'-'+String(m).padStart(2,'0')+'-01T12:00:00Z'));
  const hi=Math.min(end,Date.parse(year+'-'+String(m).padStart(2,'0')+'-'+String(daysInMonth114(year,m)).padStart(2,'0')+'T12:00:00Z'));
  if(hi>=lo&&(hi-lo)/86400000+1>=15)count++;
 }
 return count;
}
function cents114(salary,multiplier,denominator){
 if(!Number.isSafeInteger(salary)||salary<=0||salary>99999999999)throw Error('Salary must be positive cents');
 return Number((BigInt(salary)*BigInt(multiplier)+BigInt(Math.floor(denominator/2)))/BigInt(denominator));
}
function cycle114(admission,at){
 const y=Number(at.slice(0,4)),candidate=anniversary114(admission,y);
 const year=candidate>at?y-1:y;
 let start=anniversary114(admission,year);
 if(start<admission)start=admission;
 const next=anniversary114(admission,year+1);
 const dayEnd=addDays114(next,-1);
 return {start,end:dayEnd,year};
}
export function vacationTwelfths114(admission,until){
 const c=cycle114(admission,until),a=c.start;
 let avos=0,segment=a;
 for(let i=0;i<12&&segment<=until;i++){
  const y=Number(segment.slice(0,4)),m=Number(segment.slice(5,7));
  const nextMonth=m===12?String(y+1)+'-01':String(y)+'-'+String(m+1).padStart(2,'0');
  const day=Math.min(Number(a.slice(8)),daysInMonth114(nextMonth.slice(0,4),nextMonth.slice(5,7)));
  let next=nextMonth+'-'+String(day).padStart(2,'0');
  if(next<=segment)next=addDays114(segment,30);
  const end=addDays114(next,-1);
  const final=until<end?until:end;
  if(final>=segment&&(Date.parse(final+'T12:00:00Z')-Date.parse(segment+'T12:00:00Z'))/86400000+1>=15)avos++;
  segment=next;
 }
 return {avos:Math.min(12,avos),acquisition_start:c.start,acquisition_end:c.end};
}
function bounded114(n){return Number.isSafeInteger(n)&&n>=0&&n<=99999999999}
async function schema114(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_previews114(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,termination_date TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('RESIGNATION','WITHOUT_CAUSE')),notice_kind TEXT NOT NULL CHECK(notice_kind IN ('WORKED','INDEMNIFIED','WAIVED')),revision INTEGER NOT NULL CHECK(revision>0),source_fingerprint TEXT NOT NULL,snapshot_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status='DRAFT'),created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,termination_date,revision))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_termination_previews114 ON payroll_termination_previews114(company_id,employee_id,termination_date,revision)")
 ]);
}
async function preview114(c){
 const {env,companyId,d}=c;
 const {employee_id,termination_date,kind,notice_kind}=c.body||{};
 const id=String(employee_id||'').trim(),at=date114(termination_date,d,'Data de desligamento');
 const mode=String(kind||''),notice=String(notice_kind||'');
 if(!['RESIGNATION','WITHOUT_CAUSE'].includes(mode))fail114(d,'TERMINATION_TYPE','Tipo de desligamento não suportado.',400);
 if(!['WORKED','INDEMNIFIED','WAIVED'].includes(notice))fail114(d,'NOTICE_TYPE','Tipo de aviso prévio não suportado.',400);
 if(mode==='RESIGNATION'&&notice==='INDEMNIFIED')
  fail114(d,'NOTICE_TYPE','Aviso indenizado pelo empregador não se aplica a pedido de demissão nesta prévia.',400);
 const employee=await env.DB.prepare(
  "SELECT e.id,e.name,e.admission_date,e.active,e.cost_center_id,cc.code AS cost_center_code,cc.active AS center_active,n.number AS employee_number,(SELECT h.salary_cents FROM payroll_salary_history h WHERE h.company_id=e.company_id AND h.employee_id=e.id AND h.effective_from<=? ORDER BY h.effective_from DESC LIMIT 1) AS salary_cents,(SELECT h.situation FROM payroll_employee_functional_history h WHERE h.company_id=e.company_id AND h.employee_id=e.id AND h.effective_from<=? ORDER BY h.effective_from DESC LIMIT 1) AS situation FROM payroll_employees e LEFT JOIN cost_centers cc ON cc.id=e.cost_center_id AND cc.company_id=e.company_id LEFT JOIN payroll_employee_numbers n ON n.employee_id=e.id AND n.company_id=e.company_id WHERE e.company_id=? AND e.id=?"
 ).bind(at,at,companyId,id).first();
 if(!employee)fail114(d,'EMPLOYEE_NOT_FOUND','Funcionário não encontrado na empresa.',404);
 if(at<employee.admission_date)fail114(d,'DATE_BEFORE_ADMISSION','Desligamento anterior à admissão.',400);
 const problems=[],warnings=[];
 const block=(code,message)=>{if(!problems.some(x=>x.code===code))problems.push({code,message})};
 if(!employee.active||employee.situation!=='ATIVO')block('INACTIVE_EMPLOYEE','Funcionário não está ativo na vigência consultada.');
 if(!employee.cost_center_id||!employee.cost_center_code||Number(employee.center_active)!==1)
  block('COST_CENTER','Centro de custo inexistente ou inativo.');
 const salary=Number(employee.salary_cents);
 if(!bounded114(salary)||salary===0)block('SALARY_HISTORY','Salário histórico válido não cadastrado para a data.');
 const years=Number(at.slice(0,4)),month=at.slice(0,7);
 const [occ,variables,adv,history,vacation,provisions,payroll] = await Promise.all([
  env.DB.prepare("SELECT kind,start_date,end_date FROM payroll_employee_occurrences WHERE company_id=? AND employee_id=? AND start_date<=? AND end_date>=? LIMIT 201")
   .bind(companyId,id,at,employee.admission_date).all(),
  env.DB.prepare("SELECT m.id FROM payroll_movements m JOIN payroll_events e ON e.id=m.event_id AND e.company_id=m.company_id JOIN payroll_competences co ON co.id=m.competence_id AND co.company_id=m.company_id WHERE m.company_id=? AND m.employee_id=? AND co.competence>=? AND co.competence<=? AND e.event_type='PROVENTO' LIMIT 101")
   .bind(companyId,id,String(years)+'-01',month).all(),
  env.DB.prepare("SELECT id,amount_cents FROM payroll_thirteenth_advances70 WHERE company_id=? AND employee_id=? AND calendar_year=? AND status='ACTIVE' LIMIT 20")
   .bind(companyId,id,String(years)).all(),
  env.DB.prepare("SELECT id FROM payroll_thirteenth_runs71 WHERE company_id=? AND calendar_year=? AND status='APPROVED' LIMIT 5")
   .bind(companyId,String(years)).all(),
  env.DB.prepare("SELECT id FROM payroll_employee_occurrences WHERE company_id=? AND employee_id=? AND kind='FERIAS' AND start_date<=? LIMIT 101")
   .bind(companyId,id,at).all(),
  env.DB.prepare("SELECT component,SUM(amount_cents) AS balance_cents FROM payroll_provision_movements43 WHERE company_id=? AND employee_id=? AND competence<=? GROUP BY component")
   .bind(companyId,id,month).all(),
  env.DB.prepare("SELECT e.run_id FROM payroll_calc_envelopes e JOIN payroll_calc_runs r ON r.id=e.run_id AND r.company_id=e.company_id WHERE e.company_id=? AND e.employee_id=? AND r.competence=? AND r.status='APPROVED' LIMIT 10")
   .bind(companyId,id,month).all()
 ]);
 if((occ.results||[]).length){block('OCCURRENCES','Ocorrências de faltas, férias, licenças ou afastamentos requerem análise dos avos e incidências.')}
 if((variables.results||[]).length)block('VARIABLE_EARNINGS','Verbas variáveis e médias salariais dependem de cálculo próprio.');
 if((adv.results||[]).length)block('THIRTEENTH_ADVANCE','Existe adiantamento de 13º: conciliar para evitar duplicidade.');
 if((history.results||[]).length)block('THIRTEENTH_ALREADY_PROCESSED','Há cálculo de 13º aprovado no ano: conferir antecipações e incidência na rescisão.');
 if((vacation.results||[]).length)block('VACATION_HISTORY','Férias já gozadas no vínculo: conciliar períodos aquisitivos e pagamentos.');
 if((payroll.results||[]).length)block('MONTHLY_ALREADY_APPROVED','Há folha mensal aprovada para competência do desligamento; conferir saldo de salário.');
 const prov=(provisions.results||[]).map(x=>({component:x.component,balance_cents:Number(x.balance_cents)}));
 if(!prov.some(x=>x.component==='FERIAS'))block('VACATION_LEDGER','Sem saldo histórico completo das provisões de férias.');
 if(!prov.some(x=>x.component==='DECIMO_TERCEIRO'))block('THIRTEENTH_LEDGER','Sem saldo histórico completo das provisões de 13º.');
 let amounts=null;
 const terminationType=mode==='RESIGNATION'?'Pedido de demissão':'Dispensa sem justa causa';
 const noticeDays=mode==='WITHOUT_CAUSE'?noticeDays114(employee.admission_date,at):30;
 const projection=mode==='WITHOUT_CAUSE'&&notice==='INDEMNIFIED'?addDays114(at,noticeDays):at;
 if(mode==='WITHOUT_CAUSE')block('FGTS_STATEMENT','Multa de 40% exige extrato FGTS e base rescisória conciliados; valor não é presumido.');
 if(mode==='WITHOUT_CAUSE')warnings.push('Aviso indenizado projeta tempo de serviço; os efeitos tributários e de férias devem ser revisados pelo DP.');
 if(mode==='RESIGNATION'&&notice==='WAIVED')warnings.push('Dispensa do aviso no pedido de demissão exige confirmação documental da opção do empregador.');
 if(mode==='RESIGNATION'&&notice==='WORKED')warnings.push('Aviso trabalhado do pedido de demissão deve ser conferido com datas efetivas.');
 if(termination_date>new Date().toISOString().slice(0,10))warnings.push('Data de desligamento futura: somente simulação.');
 if(!problems.some(x=>x.code==='SALARY_HISTORY')){
  const lastDay=daysInMonth114(at.slice(0,4),at.slice(5,7));
  const day=Number(at.slice(8)),days=day===lastDay?30:Math.min(30,day);
  const salaryBalance=cents114(salary,days,30);
  const avos13=twelfths114(employee.admission_date,at,String(years));
  const avos13Projected=projection===at?avos13:twelfths114(employee.admission_date,projection,String(years));
  const gross13=cents114(salary,avos13,12);
  const projected13=cents114(salary,Math.max(0,avos13Projected-avos13),12);
  const vac=vacationTwelfths114(employee.admission_date,projection);
  const vacAmount=cents114(salary,vac.avos,12);
  const vacThird=Math.floor((vacAmount+1)/3);
  const noticePay=mode==='WITHOUT_CAUSE'&&notice==='INDEMNIFIED'?cents114(salary,noticeDays,30):0;
  const gross=salaryBalance+gross13+projected13+vacAmount+vacThird+noticePay;
  if(![salaryBalance,gross13,projected13,vacAmount,vacThird,noticePay,gross].every(bounded114))
   block('VALUE_LIMIT','Simulação supera o limite monetário.');
  amounts={salary_balance_cents:salaryBalance,salary_balance_days:days,
   thirteenth_avos:avos13,thirteenth_cents:gross13,
   thirteenth_notice_projection_cents:projected13,
   vacation_proportional_avos:vac.avos,vacation_period_start:vac.acquisition_start,
   vacation_period_end:vac.acquisition_end,vacation_proportional_cents:vacAmount,
   vacation_third_cents:vacThird,notice_days:noticeDays,notice_indemnity_cents:noticePay,
   provisional_gross_cents:gross,net_cents:null,fgts_fine_cents:null,
   vacation_accrued_unpaid_cents:null,legal_taxes_cents:null};
 }
 block('VACATION_RIGHTS_UNVERIFIED','Férias adquiridas/vencidas e eventual dobra não estão homologadas para o desligamento.');
 block('TAX_CALC_PENDING','INSS/IRRF rescisórios precisam ser apurados por rubrica e incidência própria.');
 block('PENDING_CLOSING','A prévia não autoriza efetivar rescisão, gerar financeiro, contabilizar ou atualizar situação funcional.');
 const fingerprint=await d.hash({version:114,company_id:companyId,employee_id:id,date:at,
  type:mode,notice,employee,occ:occ.results||[],variables:variables.results||[],
  advance:adv.results||[],history:history.results||[],vacation:vacation.results||[],
  provisions:prov,payroll:payroll.results||[],amounts,problems});
 return {kind:'TERMINATION_DRAFT_V114',employee:{
  id,code:employee.employee_number==null?null:String(employee.employee_number).padStart(5,'0'),
  name:employee.name,admission_date:employee.admission_date,cost_center_id:employee.cost_center_id,
  cost_center_code:employee.cost_center_code,salary_cents:bounded114(salary)?salary:null},
  termination_date:at,termination_kind:mode,termination_type_name:terminationType,
  notice_kind:notice,notice_days:noticeDays,projected_date:projection,
  amounts,provisions:prov,problems,warnings,source_fingerprint:fingerprint,
  ready_for_closing:false,financial_generated:false,accounting_generated:false,read_only:true,
  notes:['Estimativas contratuais: não equivalem ao TRCT definitivo.','Férias e 13º calculados apenas como referência, sem ajustes documentais.','Sem pagamento, guia, rescisão efetiva ou contabilização.']};
}
export async function payrollTermination114(action,c){
 const {env,companyId,auth,d,body={},request}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='calculate'?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-termination-previews114',1,()=>schema114(env));
 if(action==='history'){
  const employeeId=String(c.employeeId||'');
  const rows=(await env.DB.prepare("SELECT id,employee_id,termination_date,kind,notice_kind,revision,status,created_at FROM payroll_termination_previews114 WHERE company_id=? AND employee_id=? ORDER BY termination_date DESC,revision DESC LIMIT 100").bind(companyId,employeeId).all()).results||[];
  return {runs:rows,read_only:true};
 }
 if(action==='detail'){
  const row=await env.DB.prepare("SELECT * FROM payroll_termination_previews114 WHERE company_id=? AND id=?").bind(companyId,String(c.runId||'')).first();
  if(!row)fail114(d,'NOT_FOUND','Prévia não encontrada.',404);
  return {run:row,snapshot:JSON.parse(row.snapshot_json),read_only:true};
 }
 if(action==='preview')return preview114(c);
 if(action!=='calculate')fail114(d,'ACTION_INVALID','Operação não encontrada.',404);
 if(body.confirmation!=='REGISTRAR PREVIA RESCISAO')
  fail114(d,'CONFIRMATION_REQUIRED','Digite REGISTRAR PREVIA RESCISAO.',400);
 const current=await preview114(c);
 if(current.source_fingerprint!==body.source_fingerprint)
  fail114(d,'PREVIEW_CHANGED','Cadastro ou simulação alterados. Atualize a prévia.');
 const latest=await env.DB.prepare("SELECT id,revision,source_fingerprint FROM payroll_termination_previews114 WHERE company_id=? AND employee_id=? AND termination_date=? ORDER BY revision DESC LIMIT 1")
  .bind(companyId,current.employee.id,current.termination_date).first();
 if(latest?.source_fingerprint===current.source_fingerprint)
  return {reused:true,id:latest.id,revision:latest.revision,status:'DRAFT',accounting_generated:false,financial_generated:false};
 const revision=Number(latest?.revision||0)+1;
 if(revision>99999)fail114(d,'REVISION_LIMIT','Excesso de revisões preliminares.');
 const id=d.uuid();
 try{
  await env.DB.prepare("INSERT INTO payroll_termination_previews114(id,company_id,employee_id,termination_date,kind,notice_kind,revision,source_fingerprint,snapshot_json,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,'DRAFT',?)")
   .bind(id,companyId,current.employee.id,current.termination_date,current.termination_kind,current.notice_kind,
    revision,current.source_fingerprint,JSON.stringify(current),auth.user.id).run();
 }catch(e){
  if(/UNIQUE|constraint failed/i.test(String(e)))fail114(d,'CONFLICT','A prévia já foi alterada por outra operação.');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'CREATE',entity:'payroll_termination_previews114',entityId:id,
  after:{employee_id:current.employee.id,termination_date:current.termination_date,revision,ready_for_closing:false}});
 return {created:true,id,revision,status:'DRAFT',problem_count:current.problems.length,
  financial_generated:false,accounting_generated:false,employee_status_changed:false};
}