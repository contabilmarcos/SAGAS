// SAGAS Folha v94 — motor de conferência mensal de férias reconciliadas.
// Imita a estrutura das rubricas do cálculo mensal existente, SEM gravar envelopes.
// Bloqueia cenários com datas/divisores ou incidências ainda não homologados.
import { payrollVacation55 } from './sagas-payroll-vacation55.js';
import { payrollVacation54 } from './sagas-payroll-vacation54.js';

function fail56(d,message,code='VACATION_MONTHLY_REVIEW_REQUIRED',status=409){
 throw new d.HttpError(status,message,code);
}
function safe56(n,label,d){
 if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>99999999999)
  fail56(d,'Montante inválido em '+label+'.','VACATION_AMOUNT_INVALID');
 return n;
}
function half56(n,k,d){
 if(k<=0n||n<0n)fail56(d,'Divisor incompatível com cálculo de férias.','VACATION_DIVISOR');
 const value=(n+k/2n)/k;
 if(value>99999999999n)fail56(d,'Valor ultrapassa o limite monetário.','VACATION_AMOUNT_LIMIT');
 return Number(value);
}
function allocate56(total,parts,d){
 safe56(total,'rateio do INSS',d);
 const denominator=parts.reduce((a,x)=>a+x,0);
 if(!Number.isSafeInteger(denominator)||denominator<=0||parts.some(x=>!Number.isSafeInteger(x)||x<=0))
  fail56(d,'Não foi possível distribuir o INSS do recibo por competência.','VACATION_SPLIT_INVALID');
 let accrued=0,previous=0;
 return parts.map(p=>{
  accrued+=p;
  const step=half56(BigInt(total)*BigInt(accrued),BigInt(denominator),d);
  const part=step-previous;previous=step;return part;
 });
}
function actualDate56(value,d){
 const s=String(value||'');
 if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])-[0-3]\d$/.test(s))
  fail56(d,'Informe a data de pagamento da folha (AAAA-MM-DD).','INVALID_DATE',400);
 const date=new Date(s+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==s)
  fail56(d,'Data de pagamento inexistente.','INVALID_DATE',400);
 return s;
}
function blockers56(){
 const items=[];
 return {items,add:(code,message)=>{if(!items.some(x=>x.code===code&&x.message===message))items.push({code,message})}};
}
async function baseMonth56(env,companyId,employeeId,occId,month,p,d){
 const [year,m]=month.split('-').map(Number);
 if(!Number.isInteger(year)||!Number.isInteger(m)||m<1||m>12)
  fail56(d,'Competência de férias inválida.','INVALID_MONTH');
 const length=new Date(Date.UTC(year,m,0)).getUTCDate(),first=month+'-01',last=month+'-'+String(length).padStart(2,'0');
 const fail=blockers56(),value={competence:month,days:p.days,month_length:length,salary_cents:null,
  pay_date:null,dependents:0,existing_run:null,existing_center:null,blockers:fail.items};
 if(length!==30)
  fail.add('DIVISOR_MES','O cálculo mensal integrado ainda requer competência de 30 dias. Meses de '+length+' dias precisam de regra específica para dias trabalhados.');
 if(!month.startsWith('2026-'))fail.add('TABELA_ANO','A integração desta fase exige tabelas tributárias de 2026.');
 if(!Number.isSafeInteger(p.days)||p.days<1||p.days>length)fail.add('DIAS_INCOMPATIVEIS','Dias de férias incompatíveis com a competência.');
 const period=await env.DB.prepare("SELECT id,status FROM payroll_competences WHERE company_id=? AND competence=? LIMIT 1").bind(companyId,month).first();
 if(!period){fail.add('COMPETENCIA_AUSENTE','Competência de folha não cadastrada.');return value}
 if(period.status!=='OPEN')fail.add('COMPETENCIA_FECHADA','Competência da folha não está aberta.');
 const run=await env.DB.prepare("SELECT id,status,revision,payment_date FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY' ORDER BY revision DESC LIMIT 1").bind(companyId,period.id).first();
 value.existing_run=run?{id:run.id,status:run.status,revision:run.revision}:null;
 if(run?.status==='REVIEWED'||run?.status==='APPROVED')
  fail.add('FOLHA_REVISADA','Processamento mensal já revisado/aprovado; não alterar o cálculo.');
 if(run?.status==='CALCULATED')fail.add('RECALCULO_NECESSARIO','Já existe cálculo mensal nesta competência; os valores desta prévia não o modificam.');
 const salary=await env.DB.prepare("SELECT salary_cents,effective_from FROM payroll_salary_history WHERE company_id=? AND employee_id=? AND effective_from<=? ORDER BY effective_from DESC LIMIT 1").bind(companyId,employeeId,first).first();
 if(!salary||!Number.isSafeInteger(Number(salary.salary_cents))||Number(salary.salary_cents)<=0)
  fail.add('SALARIO_AUSENTE','Não existe salário histórico válido desde o início desta competência.');
 else value.salary_cents=Number(salary.salary_cents);
 const salaryChange=await env.DB.prepare("SELECT effective_from FROM payroll_salary_history WHERE company_id=? AND employee_id=? AND effective_from>? AND effective_from<=? LIMIT 1").bind(companyId,employeeId,first,last).first();
 if(salaryChange)fail.add('REAJUSTE_NO_MES','Há alteração salarial durante a competência. Exige cálculo por vigências.');
 const functional=await env.DB.prepare("SELECT id FROM payroll_employee_functional_history WHERE company_id=? AND employee_id=? AND effective_from>? AND effective_from<=? LIMIT 1").bind(companyId,employeeId,first,last).first();
 if(functional)fail.add('ALTERACAO_FUNCIONAL','Há mudança funcional durante o mês de férias.');
 const schedule=await env.DB.prepare("SELECT id FROM payroll_work_schedule_history WHERE company_id=? AND employee_id=? AND effective_from>? AND effective_from<=? LIMIT 1").bind(companyId,employeeId,first,last).first();
 if(schedule)fail.add('ALTERACAO_JORNADA','Há alteração de jornada na competência.');
 const others=await env.DB.prepare("SELECT id,kind FROM payroll_employee_occurrences WHERE company_id=? AND employee_id=? AND id<>? AND start_date<=? AND end_date>=? LIMIT 1").bind(companyId,employeeId,occId,last,first).first();
 if(others)fail.add('OCORRENCIA_CONCOMITANTE','Outra ocorrência ('+others.kind+') precisa ser conciliada no mesmo mês.');
 const time=await env.DB.prepare("SELECT id FROM payroll_time_adjustments48 WHERE company_id=? AND employee_id=? AND event_date>=? AND event_date<=? LIMIT 1").bind(companyId,employeeId,first,last).first();
 if(time)fail.add('APONTAMENTO_FREQUENCIA','Existem ajustes de ponto/DSR na competência, exigindo cálculo conjunto.');
 const otherEvent=await env.DB.prepare("SELECT v.code FROM payroll_movements m JOIN payroll_events v ON v.id=m.event_id AND v.company_id=m.company_id WHERE m.company_id=? AND m.competence_id=? AND m.employee_id=? LIMIT 1").bind(companyId,period.id,employeeId).first();
 if(otherEvent)fail.add('OUTRAS_RUBRICAS','Existe movimento '+otherEvent.code+' lançado; cálculo conjunto de eventos ainda não habilitado.');
 const person=await env.DB.prepare("SELECT e.admission_date,e.cost_center_id,c.name AS category_name,cc.code AS cc_code,cc.active AS cc_active FROM payroll_employees e LEFT JOIN payroll_categories c ON c.id=e.category_id AND c.company_id=e.company_id LEFT JOIN cost_centers cc ON cc.id=e.cost_center_id AND cc.company_id=e.company_id WHERE e.company_id=? AND e.id=? LIMIT 1").bind(companyId,employeeId).first();
 if(!person)fail.add('FUNCIONARIO_INEXISTENTE','Funcionário não encontrado na empresa.');
 else{
  if(person.admission_date>first)fail.add('ADMISSAO_COMPETENCIA','Admissão na competência: precisa combinar proporcionalidade de admissão e férias.');
  if(/APRENDIZ/i.test(String(person.category_name||'')))fail.add('FGTS_APRENDIZ','Aprendiz possui incidência diferenciada de FGTS, ainda não habilitada.');
  if(!person.cost_center_id||Number(person.cc_active)!==1)fail.add('CENTRO_CUSTO','Centro de custo ativo ausente no cadastro do funcionário.');
  value.existing_center={id:person.cost_center_id||null,code:person.cc_code||null};
 }
 const dependents=await env.DB.prepare("SELECT COUNT(*) AS total FROM payroll_employee_dependents WHERE company_id=? AND employee_id=? AND irrf_eligible=1 AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)").bind(companyId,employeeId,run?.payment_date||first,run?.payment_date||first).first();
 value.dependents=Number(dependents?.total||0);
 if(!Number.isInteger(value.dependents)||value.dependents<0||value.dependents>100)
  fail.add('DEPENDENTES_INVALIDOS','Quantidade de dependentes fora dos limites.');
 return value;
}
export async function payrollVacation56(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 if(action!=='prepare'&&action!=='simulate')
  fail56(d,'Ação não encontrada.','NOT_FOUND',404);
 const id=String(action==='prepare'?c.occurrenceId||'':body.occurrence_id||'').trim();
 if(!id||id.length>128)fail56(d,'Informe ocorrência de férias válida.','INVALID_OCCURRENCE',400);
 const details=await payrollVacation55('read',{env,companyId,auth,request,occurrenceId:id,body:{},d});
 if(!details.active||!details.reconciled?.plan)return {
  prepared:false,occurrence_id:id,blockers:details.blockers||[],
  note:'Concilie o recibo de férias na v93 antes de simular a integração mensal.'};
 if(details.stale||details.blockers?.some(x=>x.code!=='PAGAMENTO_FORA_DO_PRAZO'))
  return {prepared:false,stale:true,occurrence_id:id,blockers:details.blockers,
   note:'A conciliação perdeu a validade ou existem pendências nas competências; regularize primeiro.'};
 const plan=details.reconciled.plan,employeeId=plan.employee?.id;
 if(!employeeId||plan.occurrence_id!==id||!Array.isArray(plan.periods)||!plan.periods.length||plan.periods.length>3)
  fail56(d,'Plano de férias está incompleto.','PLAN_INVALID');
 const original=await payrollVacation54('read',{env,companyId,auth,request,occurrenceId:id,body:{},d});
 if(!original.prepared||original.stale||!original.snapshot||!original.processing)
  return {prepared:false,stale:true,note:'Preparação de férias alterada. Refaça as etapas anteriores.'};
 const periods=[];
 for(const period of plan.periods){
  periods.push(await baseMonth56(env,companyId,employeeId,id,period.competence,period,d));
 }
 const signature=await d.hash({
  code_version:56,plan,reconciliation_id:details.reconciled.id,receipt_recorded_at:details.reconciled.recorded_at,
  processing_id:original.processing.id,original_model:original.snapshot.model_revision,
  months:periods.map(x=>({competence:x.competence,salary:x.salary_cents,dependents:x.dependents,
   existing_run:x.existing_run,center:x.existing_center,blockers:x.blockers}))
 });
 if(action==='prepare')return {prepared:true,employee:plan.employee,occurrence_id:id,
  salary_references:periods,payment_dates_required:plan.periods.map(p=>p.competence),
  gross_cents:plan.gross_cents,vacation_gross_cents:plan.vacation_gross_cents,
  receipt_inss_cents:plan.receipt_inss_cents,receipt_irrf_cents:plan.receipt_irrf_cents,
  fingerprint:signature,blockers:periods.flatMap(p=>p.blockers.map(x=>({...x,competence:p.competence}))),
  note:'Somente simulação. Não altera a folha nem libera integração financeira.'};
 if(body.expected_fingerprint!==signature)
  fail56(d,'Dados das férias/folha mudaram desde a abertura. Reabra a conferência.','SOURCE_CHANGED');
 if(!Array.isArray(body.payment_dates)||body.payment_dates.length!==plan.periods.length)
  fail56(d,'Informe a data de pagamento mensal de cada competência.','PAYMENT_DATES_REQUIRED',400);
 const receipts=allocate56(safe56(plan.receipt_inss_cents,'INSS do recibo',d),
  plan.periods.map(p=>safe56(p.compensation_gross_cents,'gozo bruto',d)),d);
 const summaries=[],blockers=blockers56();
 for(let i=0;i<plan.periods.length;i++){
  const item=plan.periods[i],month=periods[i],payment=actualDate56(body.payment_dates[i],d);
  month.pay_date=payment;
  const exact=await env.DB.prepare("SELECT COUNT(*) AS total FROM payroll_employee_dependents WHERE company_id=? AND employee_id=? AND irrf_eligible=1 AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)").bind(companyId,employeeId,payment,payment).first();
  month.dependents=Number(exact?.total||0);
  if(!Number.isInteger(month.dependents)||month.dependents<0||month.dependents>100)
   blockers.add('DEPENDENTES_IRRF',month.competence+': dependentes inválidos na data efetiva de pagamento.');
  if(month.blockers.length){for(const issue of month.blockers)blockers.add(issue.code,month.competence+': '+issue.message);continue}
  if(payment.slice(0,4)!=='2026'){
   blockers.add('TABELA_PAGAMENTO',month.competence+': somente pagamento em 2026 nesta fase.');continue;
  }
  const salary=month.salary_cents;
  const nonVacation=half56(BigInt(salary)*BigInt(30-item.days),30n,d);
  const compensation=safe56(item.compensation_gross_cents,'compensação bruta',d);
  const inssBase=nonVacation+compensation,fgtsBase=inssBase;
  if(!Number.isSafeInteger(inssBase)||inssBase>99999999999){
   blockers.add('BASE_INSS',month.competence+': base previdenciária fora dos limites.');continue;
  }
  const total=d.taxes(inssBase,nonVacation,fgtsBase,month.competence,payment,month.dependents);
  const allocated=receipts[i],outstanding=total.inss_cents-allocated;
  if(outstanding<0){
   blockers.add('INSS_ANTECIPADO_EXCESSIVO',month.competence+': INSS do recibo distribuído ('+allocated+' centavos) excede INSS total da competência ('+total.inss_cents+' centavos).');continue;
  }
  const irrf=d.monthlyIrrf(nonVacation,outstanding,month.dependents,payment);
  const net=nonVacation-outstanding-irrf.irrf_cents;
  if(net<0){
   blockers.add('LIQUIDO_NEGATIVO',month.competence+': saldo salarial após tributos seria negativo. Requer tratamento específico.');continue;
  }
  const lines=[
   {event_code:'SALARIO_BASE',event_name:'Salário de dias trabalhados',line_type:'PROVENTO',amount_cents:nonVacation,reference_text:(30-item.days)+' dia(s) trabalhados em mês comercial'},
   {event_code:'FERIAS_GOZO',event_name:'Férias gozadas',line_type:'PROVENTO',amount_cents:item.remuneration_cents,reference_text:item.days+' dia(s) de gozo'},
   {event_code:'TERCO_FERIAS',event_name:'Terço constitucional de férias',line_type:'PROVENTO',amount_cents:item.constitutional_third_cents,reference_text:'Conforme recibo conciliado'},
   {event_code:'ADIANTAMENTO_FERIAS',event_name:'Compensação bruta do adiantamento de férias',line_type:'DESCONTO',amount_cents:compensation,reference_text:'Compensa férias e terço; não é o líquido do banco'},
   {event_code:'INSS_EMP',event_name:'INSS residual na folha',line_type:'DESCONTO',amount_cents:outstanding,reference_text:'INSS competência '+total.inss_cents+' - antecipado '+allocated},
   {event_code:'IRRF_EMP',event_name:'IRRF mensal sem duplicar férias pagas',line_type:'DESCONTO',amount_cents:irrf.irrf_cents,reference_text:'Rendimentos mensais sem férias do recibo'},
   {event_code:'FGTS_PATRONAL',event_name:'FGTS empregador',line_type:'INFORMATIVO',amount_cents:total.fgts_cents,reference_text:'Base com salário + férias e 1/3'}
  ];
  const credits=lines.filter(x=>x.line_type==='PROVENTO').reduce((a,x)=>a+x.amount_cents,0);
  const deductions=lines.filter(x=>x.line_type==='DESCONTO').reduce((a,x)=>a+x.amount_cents,0);
  if(credits-deductions!==net||credits!==nonVacation+compensation)
   fail56(d,'Envelope simulado não fecha na competência '+month.competence+'.','MONTHLY_BALANCE_MISMATCH');
  summaries.push({competence:month.competence,payment_date:payment,days_worked:30-item.days,
   days_vacation:item.days,salary_cents:salary,salary_worked_cents:nonVacation,
   vacation_gross_cents:compensation,base_inss_cents:inssBase,base_fgts_cents:fgtsBase,
   receipt_inss_allocated_cents:allocated,inss_total_competence_cents:total.inss_cents,
   inss_payroll_balance_cents:outstanding,irrf_monthly_cents:irrf.irrf_cents,
   fgts_employer_cents:total.fgts_cents,earnings_cents:credits,deductions_cents:deductions,
   illustrative_net_cents:net,dependent_count:month.dependents,
   cost_center_id:month.existing_center?.id||null,cost_center_code:month.existing_center?.code||null,
   events:lines,ready_for_posting:false});
 }
 return {status:'CALCULO_MENSAL_FERIAS_SIMULADO_V94',occurrence_id:id,employee:plan.employee,
  months:summaries,source_fingerprint:signature,blockers:blockers.items,
  calculated_months:summaries.length,expected_months:plan.periods.length,
  checked_read_only:true,ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
  notes:[
   'O cálculo não grava eventos em folha existente e não modifica processamento mensal revisado/fechado.',
   'Requer a competência comercial de 30 dias; demais meses, afastamentos, movimentos, reajustes e incidências especiais permanecem bloqueados.',
   'INSS do recibo foi distribuído matematicamente por férias gozadas e subtraído do INSS total projetado da competência. A conferência final precisa validar os valores efetivos.',
   'IRRF das férias já foi documentado no pagamento; IRRF da folha mensal é calculado somente sobre o salário dos dias trabalhados.',
   'FGTS patronal calculado sobre salário dos dias trabalhados, férias gozadas e terço, sem desconto no salário do trabalhador.'
  ]};
}
