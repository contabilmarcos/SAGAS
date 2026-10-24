// SAGAS Folha v100 — consumo CONTROLADO da memória de férias no cálculo MONTHLY.
// Não transfere dinheiro, não baixa provisões e não efetua contabilização.
function block100(d,message,code='VACATION_MONTHLY_NOT_READY'){
 throw new d.HttpError(409,message,code);
}
function safe100(v,d,name){
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>99999999999)
  block100(d,'Valor inconsistente em '+name,'VACATION_AMOUNT_INVALID');
 return v;
}
export async function payrollVacationMonthlySchema100(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_monthly_usage100 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,run_id TEXT NOT NULL REFERENCES payroll_calc_runs(id) ON DELETE RESTRICT,stage_id TEXT NOT NULL REFERENCES payroll_vacation_monthly_stage61(id) ON DELETE RESTRICT,employee_id TEXT NOT NULL,competence_id TEXT NOT NULL,source_fingerprint TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(run_id,stage_id))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_vacation_usage100_run ON payroll_vacation_monthly_usage100(company_id,run_id)"),
  env.DB.prepare("DROP TRIGGER IF EXISTS tr_vac_stage61_block_monthly"),
  env.DB.prepare("CREATE TRIGGER IF NOT EXISTS tr_vac100_block_unsigned_monthly BEFORE INSERT ON payroll_calc_runs WHEN NEW.process_kind='MONTHLY' AND EXISTS(SELECT 1 FROM payroll_vacation_monthly_stage61 WHERE company_id=NEW.company_id AND competence_id=NEW.competence_id AND status='STAGED') AND NEW.source_fingerprint NOT LIKE 'VACATION100:%' BEGIN SELECT RAISE(ABORT,'VACATION_MONTHLY_NOT_SIGNED'); END")
 ]);
}
function exactly100(lines,code,d){
 const matches=lines.filter(x=>x.event_code===code);
 if(matches.length!==1)block100(d,'Rubrica '+code+' ausente ou repetida.','VACATION_LINE_DUPLICATE');
 return matches[0];
}
export async function payrollVacationMonthly100(env,companyId,competenceId,paymentDate,d){
 const period=await env.DB.prepare("SELECT competence,status FROM payroll_competences WHERE company_id=? AND id=? LIMIT 1").bind(companyId,competenceId).first();
 if(!period)block100(d,'Competência da folha inexistente.','COMPETENCE_NOT_FOUND');
 const month=period.competence;
 const types=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('payroll_vacation_envelope_links58','payroll_vacation_monthly_stage61')").all()).results||[];
 const has=n=>types.some(r=>r.name===n);
 const active=has('payroll_vacation_envelope_links58')?
  (await env.DB.prepare("SELECT l.id,l.employee_id,l.occurrence_id,l.run_id FROM payroll_vacation_envelope_links58 l JOIN payroll_vacation_reconciliations55 r ON r.id=l.reconciliation_id AND r.company_id=l.company_id JOIN payroll_calc_runs v ON v.id=l.run_id AND v.company_id=l.company_id JOIN json_each(r.plan_json,'$.periods') p WHERE l.company_id=? AND l.status='ACTIVE' AND v.process_kind='VACATION' AND v.status IN ('CALCULATED','REVIEWED','APPROVED') AND json_extract(p.value,'$.competence')=?").bind(companyId,month).all()).results||[]:[];
 const stages=has('payroll_vacation_monthly_stage61')?
  (await env.DB.prepare("SELECT s.id,s.employee_id,s.occurrence_id,s.vacation_run_id,s.payment_date,s.source_fingerprint,s.events_json,s.snapshot_json,c.status AS competence_status,e.cost_center_id,l.status AS vacation_link_status,r.status AS vacation_status,r.source_fingerprint AS vacation_fingerprint,v.plan_json,v.receipt_inss_cents,v.receipt_irrf_cents FROM payroll_vacation_monthly_stage61 s JOIN payroll_employees e ON e.id=s.employee_id AND e.company_id=s.company_id JOIN payroll_vacation_envelope_links58 l ON l.company_id=s.company_id AND l.employee_id=s.employee_id AND l.occurrence_id=s.occurrence_id AND l.run_id=s.vacation_run_id AND l.status='ACTIVE' JOIN payroll_calc_runs r ON r.id=s.vacation_run_id AND r.company_id=s.company_id AND r.process_kind='VACATION' JOIN payroll_vacation_reconciliations55 v ON v.id=l.reconciliation_id AND v.company_id=l.company_id AND v.status='RECONCILED' JOIN payroll_competences c ON c.id=s.competence_id AND c.company_id=s.company_id WHERE s.company_id=? AND s.competence_id=? AND s.status='STAGED' LIMIT 101").bind(companyId,competenceId).all()).results||[]:[];
 if(active.length!==stages.length || stages.length>100)
  block100(d,'Férias registradas precisam ter uma memória v99 única para cada funcionário e competência.','VACATION_STAGE_COVERAGE');
 const key=x=>String(x.employee_id)+'|'+String(x.occurrence_id)+'|'+String(x.run_id||x.vacation_run_id);
 const stageKeys=new Set(stages.map(key));
 if(stageKeys.size!==stages.length||active.some(x=>!stageKeys.has(key(x))))
  block100(d,'A memória de férias não cobre exatamente os recibos ativos desta competência.','VACATION_LINK_MISMATCH');
 if(stages.length&&period.status!=='OPEN')
  block100(d,'A competência com férias não está aberta.','COMPETENCE_CLOSED');
 if(!stages.length)return {byEmployee:new Map(),records:[]};
 await payrollVacationMonthlySchema100(env);
 const byEmployee=new Map(),records=[];
 for(const s of stages){
  if(byEmployee.has(s.employee_id))block100(d,'Mais de uma férias do mesmo funcionário nesta competência requer cálculo conjunto.','VACATION_OVERLAP');
  if(s.vacation_status!=='REVIEWED')
   block100(d,'Envelope VACATION não está aprovado para a competência '+month+'.','VACATION_NOT_REVIEWED');
  if(s.payment_date!==paymentDate)
   block100(d,'Data de pagamento da folha diverge da memória de férias '+month+'.','VACATION_PAYMENT_DATE_CHANGED');
  if(!s.source_fingerprint||!s.vacation_fingerprint||s.competence_status!=='OPEN')
   block100(d,'Memória de férias ou competência sem assinatura válida.','VACATION_SOURCE_INVALID');
  let snapshot,lines,plan;
  try{snapshot=JSON.parse(s.snapshot_json);lines=JSON.parse(s.events_json);plan=JSON.parse(s.plan_json)}
  catch{block100(d,'Memória documental das férias inválida.','VACATION_JSON_INVALID')}
  if(!snapshot||snapshot.competence!==month||snapshot.payment_date!==paymentDate||
     !Array.isArray(lines)||lines.length<5||lines.length>30||!Array.isArray(plan?.periods))
   block100(d,'Detalhamento das férias incompatível com a competência.','VACATION_STAGE_MALFORMED');
  const installment=plan.periods.filter(p=>p.competence===month);
  if(installment.length!==1||plan.employee?.id!==s.employee_id||plan.occurrence_id!==s.occurrence_id)
   block100(d,'Funcionário ou divisão por competência diverge do recibo conciliado.','VACATION_RECEIPT_CHANGED');
  const p=installment[0];
  const gross=safe100(p.compensation_gross_cents,d,'compensação do recibo');
  if(gross!==snapshot.vacation_gross_cents||snapshot.days_vacation!==p.days||
     gross!==safe100(p.remuneration_cents,d,'férias')+safe100(p.constitutional_third_cents,d,'terço'))
   block100(d,'Valores das férias divergem da conciliação documental.','VACATION_GROSS_CHANGED');
  if(snapshot.cost_center_id!==s.cost_center_id||!s.cost_center_id)
   block100(d,'Centro de custo alterado após preparação das férias.','VACATION_COST_CENTER_CHANGED');
  const salary=await env.DB.prepare("SELECT salary_cents FROM payroll_salary_history WHERE company_id=? AND employee_id=? AND effective_from<=? ORDER BY effective_from DESC LIMIT 1").bind(companyId,s.employee_id,month+'-01').first();
  if(!salary||Number(salary.salary_cents)!==snapshot.salary_cents)
   block100(d,'Salário histórico alterado desde a memória das férias.','VACATION_SALARY_CHANGED');
  const nDays=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
  const changes=await env.DB.prepare("SELECT COUNT(*) AS total FROM payroll_salary_history WHERE company_id=? AND employee_id=? AND effective_from>? AND effective_from<=?").bind(companyId,s.employee_id,month+'-01',month+'-'+String(nDays).padStart(2,'0')).first();
  if(Number(changes?.total||0)>0)
   block100(d,'Alteração salarial durante as férias requer cálculo por vigência homologado.','VACATION_SALARY_CHANGE');
  const conflicts=await env.DB.prepare("SELECT id FROM payroll_employee_occurrences WHERE company_id=? AND employee_id=? AND id<>? AND start_date<=? AND end_date>=? LIMIT 1").bind(companyId,s.employee_id,s.occurrence_id,month+'-'+String(nDays).padStart(2,'0'),month+'-01').first();
  if(conflicts)block100(d,'Outra ocorrência no mês impede cálculo isolado de férias.','VACATION_OTHER_OCCURRENCE');
  const time=await env.DB.prepare("SELECT id FROM payroll_time_adjustments48 WHERE company_id=? AND employee_id=? AND event_date>=? AND event_date<=? LIMIT 1").bind(companyId,s.employee_id,month+'-01',month+'-'+String(nDays).padStart(2,'0')).first();
  if(time)block100(d,'Ajustes de frequência ou DSR exigem conciliação conjunta.','VACATION_FREQUENCY_CHANGED');
  const movement=await env.DB.prepare("SELECT id FROM payroll_movements WHERE company_id=? AND employee_id=? AND competence_id=? LIMIT 1").bind(companyId,s.employee_id,competenceId).first();
  if(movement)block100(d,'Movimentos adicionais não foram conciliados com a memória de férias.','VACATION_EXTRA_MOVEMENT');
  const dep=await env.DB.prepare("SELECT COUNT(*) AS total FROM payroll_employee_dependents WHERE company_id=? AND employee_id=? AND irrf_eligible=1 AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)").bind(companyId,s.employee_id,paymentDate,paymentDate).first();
  if(Number(dep?.total||0)!==snapshot.dependent_count)
   block100(d,'Dependentes de IRRF alterados desde a simulação.','VACATION_DEPENDENTS_CHANGED');
  for(const l of lines){
   if(!l||!['PROVENTO','DESCONTO','INFORMATIVO'].includes(l.line_type)||typeof l.event_code!=='string')
    block100(d,'Rubrica da memória com tipo inválido.','VACATION_LINE_INVALID');
   safe100(l.amount_cents,d,l.event_code);
  }
  const take=(code,type,amount)=>{
   const line=exactly100(lines,code,d);
   if(line.line_type!==type||line.amount_cents!==amount)
    block100(d,'Rubrica de férias divergente: '+code,'VACATION_LINE_AMOUNT');
  };
  take('SALARIO_BASE','PROVENTO',safe100(snapshot.salary_worked_cents,d,'saldo salarial'));
  take('FERIAS_GOZO','PROVENTO',safe100(p.remuneration_cents,d,'férias'));
  take('TERCO_FERIAS','PROVENTO',safe100(p.constitutional_third_cents,d,'terço'));
  take('ADIANTAMENTO_FERIAS','DESCONTO',gross);
  take('INSS_EMP','DESCONTO',safe100(snapshot.inss_payroll_balance_cents,d,'INSS residual'));
  take('IRRF_EMP','DESCONTO',safe100(snapshot.irrf_monthly_cents,d,'IRRF mensal'));
  take('FGTS_PATRONAL','INFORMATIVO',safe100(snapshot.fgts_employer_cents,d,'FGTS patronal'));
  if(lines.length!==7)block100(d,'Memória contém rubricas não homologadas.','VACATION_EXTRA_LINES');
  const earnings=lines.filter(x=>x.line_type==='PROVENTO').reduce((n,x)=>n+x.amount_cents,0);
  const discounts=lines.filter(x=>x.line_type==='DESCONTO').reduce((n,x)=>n+x.amount_cents,0);
  if(earnings!==snapshot.earnings_cents||discounts!==snapshot.deductions_cents||
     earnings-discounts!==snapshot.illustrative_net_cents||
     snapshot.base_inss_cents!==snapshot.salary_worked_cents+gross||
     snapshot.base_fgts_cents!==snapshot.base_inss_cents||
     snapshot.inss_total_competence_cents-snapshot.receipt_inss_allocated_cents!==snapshot.inss_payroll_balance_cents)
   block100(d,'Bases, descontos ou líquido da memória não conciliam.','VACATION_TOTAL_INVALID');
  const taxes=d.taxes(snapshot.base_inss_cents,snapshot.salary_worked_cents,
   snapshot.base_fgts_cents,month,paymentDate,snapshot.dependent_count);
  const irrf=d.monthlyIrrf(snapshot.salary_worked_cents,snapshot.inss_payroll_balance_cents,
   snapshot.dependent_count,paymentDate);
  if(taxes.inss_cents!==snapshot.inss_total_competence_cents||taxes.fgts_cents!==snapshot.fgts_employer_cents||
     irrf.irrf_cents!==snapshot.irrf_monthly_cents)
   block100(d,'Impostos recalculados divergem da memória: refaça a conferência.','VACATION_TAXES_CHANGED');
  const item={employee_id:s.employee_id,cost_center_id:s.cost_center_id,
   earnings_cents:earnings,deductions_cents:discounts,net_cents:earnings-discounts,
   inss_cents:snapshot.inss_payroll_balance_cents,irrf_cents:snapshot.irrf_monthly_cents,
   fgts_cents:snapshot.fgts_employer_cents,
   inss_base_cents:snapshot.base_inss_cents,fgts_base_cents:snapshot.base_fgts_cents,
   irrf_gross_cents:snapshot.salary_worked_cents,irrf_base_cents:irrf.base_cents,
   dependent_count:snapshot.dependent_count,
   lines:lines.map(x=>({event_id:null,event_code:x.event_code,event_name:x.event_name,
    line_type:x.line_type,amount_cents:x.amount_cents,reference_text:x.reference_text||'',
    rule_version:'FERIAS100#'+s.id}))};
  byEmployee.set(s.employee_id,item);
  records.push({id:s.id,employee_id:s.employee_id,source_fingerprint:s.source_fingerprint,
   vacation_run_id:s.vacation_run_id});
 }
 records.sort((a,b)=>a.employee_id.localeCompare(b.employee_id));
 return {byEmployee,records};
}
