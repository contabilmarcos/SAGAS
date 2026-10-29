import {planNatureDefaults126} from './sagas-payroll-ledger126.js';
// SAGAS — Folha Simplificada v141.
// Fluxo: cadastro básico -> cálculo fechado por CC -> relatório -> configurações D/C -> lote novo.
// Não executa o fluxo legado de eventos manuais, férias, 13º ou rescisão.
// Constituições do principal integram o livro existente; encargos seguem estimativas.
const C141=[
 ['SALARIO_BASE','Salário-base','PROVENTO'],
 ['INSS_EMP','INSS empregado','DESCONTO'],
 ['IRRF_EMP','IRRF empregado','DESCONTO'],
 ['SALARIO_LIQUIDO','Salário líquido a pagar','LIQUIDO'],
 ['FGTS_PATRONAL','FGTS patronal','ENCARGO'],
 ['CPP_PATRONAL','INSS patronal','ENCARGO'],
 ['RAT_PATRONAL','RAT/FAP','ENCARGO'],
 ['TERCEIROS_PATRONAL','Terceiros','ENCARGO'],
 ['PIS_FOLHA','PIS sobre folha','ENCARGO'],
 ['PROV_13','Provisão de 13º','PROVISAO'],
 ['PROV_FERIAS','Provisão de férias','PROVISAO'],
 ['PROV_TERCO','Provisão de 1/3 de férias','PROVISAO'],
 ['PROV_FGTS_13','FGTS sobre 13º provisionado','PROVISAO'],
 ['PROV_FGTS_FERIAS','FGTS sobre férias e terço provisionados','PROVISAO'],
 ['PROV_CPP_13','CPP estimada sobre 13º','PROVISAO'],
 ['PROV_CPP_FERIAS','CPP estimada sobre férias e terço','PROVISAO'],
 ['PROV_RAT_13','RAT estimado sobre 13º','PROVISAO'],
 ['PROV_RAT_FERIAS','RAT estimado sobre férias e terço','PROVISAO'],
 ['PROV_TERCEIROS_13','Terceiros estimados sobre 13º','PROVISAO'],
 ['PROV_TERCEIROS_FERIAS','Terceiros estimados sobre férias e terço','PROVISAO']
];
const labels141=Object.fromEntries(C141.map(([k,label])=>[k,label]));
const money141=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=99999999999;
const sum141=(arr,k)=>arr.reduce((v,x)=>v+(x.events?.[k]||0),0);
const round141=(amount,bp,div=10000)=>{
 if(!money141(amount)||!Number.isSafeInteger(bp)||bp<0)throw Error('Base monetária ou alíquota inválida.');
 const n=(BigInt(amount)*BigInt(bp)+BigInt(div)/2n)/BigInt(div);
 if(n>99999999999n)throw Error('Valor acima do limite.');
 return Number(n);
};
const fail141=(d,code,message,status=409)=>{throw new d.HttpError(status,message,code)};
const date141=s=>/^20\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(s)&&
 !Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const period141=s=>/^20\d\d-(?:0[1-9]|1[0-2])$/.test(s);
const last141=s=>{
 const [y,m]=s.split('-').map(Number);
 return s+'-'+String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0');
};
const validId141=s=>typeof s==='string'&&s.length>=1&&s.length<=128;
const get141=(values,code)=>Number(values[code]||0);
const keys141=C141.map(x=>x[0]);
function total141(employees){
 const totals=Object.fromEntries(keys141.map(k=>[k,0]));
 for(const e of employees)for(const k of keys141){
  if(!money141(e.events[k]))throw Error('Total de evento inválido: '+k);
  totals[k]+=e.events[k];
  if(!money141(totals[k]))throw Error('Total fora do limite.');
 }
 return totals;
}
export function calculateEmployee141(emp,month,payment,settings,d){
 if(!date141(payment)||!period141(month))fail141(d,'DATE_INVALID','Competência ou data de pagamento inválida.',400);
 const salary=Number(emp.salary_cents);
 if(!money141(salary)||salary===0)fail141(d,'SALARY_INVALID','Salário inválido no funcionário '+(emp.employee_code||'')+'.');
 const admission=String(emp.admission_date||'');
 if(!date141(admission)||admission>last141(month))fail141(d,'ADMISSION_INVALID','Admissão inválida no funcionário '+(emp.employee_code||'')+'.');
 const monthFirst=month+'-01',calendarDays=Number(last141(month).slice(8));
 const days=admission<=monthFirst?calendarDays:calendarDays-Number(admission.slice(8))+1;
 const base=days===calendarDays?salary:round141(salary,days,calendarDays);
 // O modelo simplificado usa somente salário, sem faltas e sem demais proventos.
 const tax=d.tax(base,base,base,month,payment,0);
 const inss=Number(tax.inss_cents),irrf=Number(tax.irrf_cents),fgts=Number(tax.fgts_cents);
 if(![inss,irrf,fgts].every(money141)||inss+irrf>base)
  fail141(d,'TAX_INVALID','Impostos da folha não conciliam com o salário.');
 const due=(name)=>settings?.[name+'_due']==='SIM';
 const bp=(name)=>{const v=Number(settings?.[name+'_bp']);if(!Number.isSafeInteger(v)||v<0)
  fail141(d,'EMPLOYER_INVALID','Alíquota patronal inválida: '+name);return v;};
 const calcCpp=v=>due('cpp')?round141(v,bp('cpp')):0;
 const calcRat=v=>due('rat')?round141(v,bp('rat')*Number(settings.fap_10000),100000000):0;
 const calcThirds=v=>due('thirds')?round141(v,bp('thirds')):0;
 const calcPis=v=>due('pis')?round141(v,bp('pis')):0;
 // Uma fração mensal é estimada apenas se houve 15 dias de vínculo no mês.
 const entitled=days>=15;
 const thirteenth=entitled?round141(salary,1,12):0;
 const vacation=entitled?round141(salary,1,12):0;
 const third=entitled?round141(vacation,1,3):0;
 const vacationTotal=vacation+third;
 const events={
  SALARIO_BASE:base,INSS_EMP:inss,IRRF_EMP:irrf,SALARIO_LIQUIDO:base-inss-irrf,
  FGTS_PATRONAL:fgts,CPP_PATRONAL:calcCpp(base),RAT_PATRONAL:calcRat(base),
  TERCEIROS_PATRONAL:calcThirds(base),PIS_FOLHA:calcPis(base),
  PROV_13:thirteenth,PROV_FERIAS:vacation,PROV_TERCO:third,
  PROV_FGTS_13:round141(thirteenth,800),
  PROV_FGTS_FERIAS:round141(vacationTotal,800),
  PROV_CPP_13:calcCpp(thirteenth),PROV_CPP_FERIAS:calcCpp(vacationTotal),
  PROV_RAT_13:calcRat(thirteenth),PROV_RAT_FERIAS:calcRat(vacationTotal),
  PROV_TERCEIROS_13:calcThirds(thirteenth),PROV_TERCEIROS_FERIAS:calcThirds(vacationTotal)
 };
 return {employee_id:emp.id,employee_code:emp.employee_code||null,
  name:emp.name,cost_center_id:emp.cost_center_id,salary_cents:salary,
  admission_date:admission,worked_days:days,events};
}
export function ledgerLines141(totals,maps,cc,d){
 const lines=[],missing=[];
 for(const [code,label] of C141){
  const amount=Number(totals[code]||0);if(!amount)continue;
  const mapping=maps[code]||{};
  if(!mapping.debit_account_id&&!mapping.credit_account_id){missing.push(label);continue;}
  for(const [side,key] of [['D','debit_account_id'],['C','credit_account_id']]){
   const account_id=mapping[key];if(account_id)lines.push({event_code:code,description:label,
    account_id,side,amount_cents:amount,cost_center_id:cc});
  }
 }
 const debit=lines.filter(x=>x.side==='D').reduce((v,x)=>v+x.amount_cents,0);
 const credit=lines.filter(x=>x.side==='C').reduce((v,x)=>v+x.amount_cents,0);
 return {lines,missing,debit_cents:debit,credit_cents:credit,
  balanced:!missing.length&&debit===credit&&debit>0};
}
// A mesma seleção de defaults do SAGAS: específico por lado, senão geral.
export async function natureLedger141(db,company,totals,maps,cc){
 const lines=[],missing=[],problems=[];
 const center=await db.prepare('SELECT id FROM cost_centers WHERE company_id=? AND id=? AND active=1').bind(company,cc).first();
 if(!center)problems.push('Centro de custo inativo ou de outra empresa.');
 for(const [code,label] of C141){
  const amount=Number(totals[code]||0);if(!amount)continue;
  if(!money141(amount)){problems.push('Valor inválido: '+label);continue;}
  const id=maps[code]?.nature_id;
  if(!id){missing.push(label);continue;}
  const nature=await db.prepare("SELECT id FROM budget_natures WHERE company_id=? AND id=? AND active=1 AND synthetic_analytic='ANALYTIC'").bind(company,id).first();
  if(!nature){problems.push('Natureza inválida: '+label);continue;}
  const defaults=(await db.prepare('SELECT * FROM budget_nature_accounts WHERE company_id=? AND nature_id=? ORDER BY created_at,id').bind(company,id).all()).results||[];
  const plan=planNatureDefaults126(defaults,cc,amount,{requireCreditOnly:code==='SALARIO_LIQUIDO'});
  for(const issue of plan.problems)problems.push(label+': '+issue.message);
  for(const side of ['D','C']){
   const entries=plan.lines.filter(x=>x.side===side);
   if(entries.length&&entries.reduce((n,x)=>n+x.amount_cents,0)!==amount)
    problems.push('Rateio não concilia com o valor do componente: '+label);
  }
  for(const x of plan.lines){
   if(!money141(x.amount_cents)||!x.amount_cents){problems.push('Rateio inválido: '+label);continue;}
   const account=await db.prepare('SELECT id FROM accounts WHERE company_id=? AND id=? AND active=1 AND analytic=1').bind(company,x.account_id).first();
   if(!account){problems.push('Conta inválida: '+label);continue;}
   for(const [table,key] of [['branches','branch_id'],['history_templates','history_template_id']]){
    if(x[key]&&!await db.prepare('SELECT id FROM '+table+' WHERE company_id=? AND id=? AND active=1').bind(company,x[key]).first())
     problems.push('Filial ou histórico inválido: '+label);
   }
   lines.push({...x,event_code:code,description:label,nature_id:id,cost_center_id:cc});
  }
 }
 const sum=side=>lines.filter(x=>x.side===side).reduce((n,x)=>n+x.amount_cents,0);
 const debit=sum('D'),credit=sum('C');
 return {lines,missing,problems,debit_cents:debit,credit_cents:credit,
  balanced:!missing.length&&!problems.length&&money141(debit)&&debit>0&&debit===credit};
}
async function schema141(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_simple_runs141(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,competence TEXT NOT NULL,cost_center_id TEXT NOT NULL,revision INTEGER NOT NULL,payment_date TEXT NOT NULL,report_json TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,competence,cost_center_id,revision))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_simple_runs141 ON payroll_simple_runs141(company_id,competence,cost_center_id,revision)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_simple_accounts141(company_id TEXT NOT NULL,cost_center_id TEXT NOT NULL,event_code TEXT NOT NULL,debit_account_id TEXT,credit_account_id TEXT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,cost_center_id,event_code))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_simple_postings141(run_id TEXT PRIMARY KEY,company_id TEXT NOT NULL,batch_id TEXT NOT NULL,entry_id TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
 ]);
}
async function integrationSchema141(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_simple_ledger141(run_id TEXT PRIMARY KEY,company_id TEXT NOT NULL,entry_id TEXT NOT NULL,plan_json TEXT NOT NULL)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_simple_payables141(payable_id TEXT PRIMARY KEY,company_id TEXT NOT NULL,run_id TEXT NOT NULL,employee_id TEXT NOT NULL,cost_center_id TEXT NOT NULL,UNIQUE(company_id,run_id,employee_id))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_simple_natures141(company_id TEXT NOT NULL,cost_center_id TEXT NOT NULL,event_code TEXT NOT NULL,nature_id TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,cost_center_id,event_code))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_simple_integrations141(run_id TEXT NOT NULL,company_id TEXT NOT NULL,kind TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(run_id,kind))")
 ]);
}
async function periodMappingSchema141(env){
 await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_simple_period_natures141(
   company_id TEXT NOT NULL,competence TEXT NOT NULL,cost_center_id TEXT NOT NULL,
   event_code TEXT NOT NULL,nature_id TEXT NOT NULL,updated_by TEXT NOT NULL,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY(company_id,competence,cost_center_id,event_code))`),
  // Folhas contabilizadas fornecem a configuração efetivamente aplicada no mês.
  env.DB.prepare(`INSERT OR IGNORE INTO payroll_simple_period_natures141
   (company_id,competence,cost_center_id,event_code,nature_id,updated_by)
   SELECT r.company_id,r.competence,r.cost_center_id,json_extract(j.value,'$.event_code'),
    json_extract(j.value,'$.nature_id'),r.created_by
   FROM payroll_simple_ledger141 l JOIN payroll_simple_runs141 r ON r.id=l.run_id AND r.company_id=l.company_id,
    json_each(l.plan_json,'$.lines') j
   WHERE json_extract(j.value,'$.nature_id') IS NOT NULL
    AND json_extract(j.value,'$.event_code') IS NOT NULL ORDER BY r.revision DESC`),
  // O cadastro antigo não tinha competência. Preservá-lo somente no último mês
  // calculado de cada CC, sem atribuir a meses antigos uma configuração incerta.
  env.DB.prepare(`INSERT OR IGNORE INTO payroll_simple_period_natures141
   (company_id,competence,cost_center_id,event_code,nature_id,updated_by,updated_at)
   SELECT m.company_id,r.competence,m.cost_center_id,m.event_code,m.nature_id,m.updated_by,m.updated_at
   FROM payroll_simple_natures141 m JOIN
    (SELECT company_id,cost_center_id,MAX(competence) competence FROM payroll_simple_runs141 GROUP BY company_id,cost_center_id) r
   ON r.company_id=m.company_id AND r.cost_center_id=m.cost_center_id`)
 ]);
}
function previousMonth141(month){
 const [year,m]=month.split('-').map(Number);
 return m===1?String(year-1)+'-12':String(year)+'-'+String(m-1).padStart(2,'0');
}
async function read141(env,company,month,cc){
 const cond=cc==='all'?'':' AND r.cost_center_id=?';
 const rows=(await env.DB.prepare(`SELECT r.* FROM payroll_simple_runs141 r
 WHERE r.company_id=? AND r.competence=? ${cond} AND r.revision=(
  SELECT MAX(z.revision) FROM payroll_simple_runs141 z
  WHERE z.company_id=r.company_id AND z.competence=r.competence AND z.cost_center_id=r.cost_center_id)
 ORDER BY r.cost_center_id`).bind(...(cc==='all'?[company,month]:[company,month,cc])).all()).results||[];
 return rows.map(x=>({...x,report:JSON.parse(x.report_json)}));
}
function assemble141(runs){
 const employees=runs.flatMap(r=>r.report.employees);
 const totals=total141(employees);
 return {run_count:runs.length,employee_count:employees.length,totals,employees,
  centers:runs.map(x=>({id:x.cost_center_id,revision:x.revision,run_id:x.id,
   employee_count:x.report.employees.length,posted:!!x.posting,
   totals:x.report.totals})),event_definitions:C141.map(([code,name,category])=>({code,name,category}))};
}
// Controle cronológico das estimativas por competência. Não presume baixas de férias
// ou 13º e não altera o livro de provisões já existente no SAGAS.
async function provisionHistory141(env,company,month,cc){
 const codes=keys141.filter(k=>k.startsWith('PROV_'));
 const fields=codes.map(k=>
  "SUM(COALESCE(CAST(json_extract(r.report_json, '$.totals."+k+"') AS INTEGER),0)) AS "+k);
 const where=cc==='all'?'':' AND r.cost_center_id=?';
 const sql="SELECT r.competence,"+fields.join(',')+
  " FROM payroll_simple_runs141 r WHERE r.company_id=? AND r.competence<=?"+where+
  " AND r.revision=(SELECT MAX(z.revision) FROM payroll_simple_runs141 z"+
  " WHERE z.company_id=r.company_id AND z.competence=r.competence AND z.cost_center_id=r.cost_center_id)"+
  " GROUP BY r.competence ORDER BY r.competence LIMIT 241";
 const rows=(await env.DB.prepare(sql).bind(...(cc==='all'?[company,month]:[company,month,cc])).all()).results||[];
 if(rows.length>240)throw Error('Histórico mensal superior a 240 competências.');
 let accumulated=0;
 return rows.map(row=>{
  const totals=Object.fromEntries(codes.map(k=>[k,Number(row[k]||0)]));
  const accrued=Object.values(totals).reduce((a,b)=>a+b,0);
  if(!money141(accrued))throw Error('Total de provisão inválido.');
  accumulated+=accrued;
  if(!money141(accumulated))throw Error('Provisão acumulada excedeu limite seguro.');
  return {competence:row.competence,totals,
   accrued_cents:accrued,cumulative_estimate_cents:accumulated};
 });
}
async function mapping141(env,company,month,cc){
 const r=(await env.DB.prepare("SELECT event_code,nature_id FROM payroll_simple_period_natures141 WHERE company_id=? AND competence=? AND cost_center_id=?").bind(company,month,cc).all()).results||[];
 return Object.fromEntries(r.map(x=>[x.event_code,x]));
}
export async function payrollSimple141(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 await d.requirePermission(env,auth.user.id,companyId,
  ['calculate','mapping','copy-previous','post','finance','provisions'].includes(action)?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-simple141',1,()=>schema141(env));
 await d.ensureSchemaRevision(env,'payroll-simple-integration141',3,()=>integrationSchema141(env));
 await d.ensureSchemaRevision(env,'payroll-simple-period-mappings141',1,()=>periodMappingSchema141(env));
 const month=String(body.competence||c.competence||''),cc=String(body.cost_center_id||c.cost_center_id||'all');
 if(action==='setup'){
  const centers=(await env.DB.prepare("SELECT id,code,name FROM cost_centers WHERE company_id=? AND active=1 ORDER BY code").bind(companyId).all()).results||[];
  const months=(await env.DB.prepare("SELECT id,competence,status FROM payroll_competences WHERE company_id=? ORDER BY competence DESC LIMIT 240").bind(companyId).all()).results||[];
  const accounts=(await env.DB.prepare("SELECT id,code,name FROM accounts WHERE company_id=? AND analytic=1 AND active=1 ORDER BY code LIMIT 3000").bind(companyId).all()).results||[];
  const natures=(await env.DB.prepare("SELECT id,code,description FROM budget_natures WHERE company_id=? AND active=1 AND synthetic_analytic='ANALYTIC' ORDER BY code").bind(companyId).all()).results||[];
  return {centers,months,accounts,natures,events:C141.map(([code,name,category])=>({code,name,category}))};
 }
 if(!period141(month))fail141(d,'PERIOD_INVALID','Informe a competência no formato AAAA-MM.',400);
 if(cc!=='all'&&!validId141(cc))fail141(d,'CC_INVALID','Centro de custo inválido.',400);
 if(action==='calculate'){
  const payment=String(body.payment_date||'');
  if(!date141(payment))fail141(d,'DATE_INVALID','Informe a data efetiva de pagamento.',400);
  const cperiod=await env.DB.prepare('SELECT status FROM payroll_competences WHERE company_id=? AND competence=?').bind(companyId,month).first();
  if(!cperiod||cperiod.status!=='OPEN')fail141(d,'PERIOD_NOT_OPEN','Abra a competência da folha antes do cálculo simplificado.');
  let s=null;
  try{
   s=await env.DB.prepare("SELECT * FROM payroll_employer_settings40 WHERE company_id=? AND effective_from<=? ORDER BY effective_from DESC,revision DESC LIMIT 1").bind(companyId,month).first();
  }catch(err){
   if(!/no such table:\s*(?:main\.)?payroll_employer_settings40/i.test(String(err?.message||err)))throw err;
  }
  if(!s)fail141(d,'EMPLOYER_MISSING','Configure INSS patronal, terceiros, RAT/FAP e PIS (devidos ou dispensados) antes de calcular.');
  for(const k of ['cpp','rat','thirds','pis'])if(!['SIM','NAO'].includes(s[k+'_due']))
   fail141(d,'EMPLOYER_INVALID','Confira se '+k.toUpperCase()+' é devido ou dispensado.');
  const allowed=(await env.DB.prepare("SELECT id,code,name,active FROM cost_centers WHERE company_id=? AND active=1 ORDER BY code").bind(companyId).all()).results||[];
  const allowedIds=new Set(allowed.map(x=>x.id));
  if(cc!=='all'&&!allowedIds.has(cc))fail141(d,'CC_INVALID','Centro de custo inativo ou de outra empresa.');
  const persons=(await env.DB.prepare(`SELECT e.id,e.name,e.salary_cents,e.admission_date,e.cost_center_id,
   printf('%05d',n.number) AS employee_code
   FROM payroll_employees e
   LEFT JOIN payroll_employee_numbers n ON n.employee_id=e.id AND n.company_id=e.company_id
   WHERE e.company_id=? AND e.active=1 AND e.admission_date<=?
   ORDER BY e.name,e.id LIMIT 2001`).bind(companyId,last141(month)).all()).results||[];
  if(persons.length>2000)fail141(d,'EMPLOYEE_LIMIT','Limite de 2.000 funcionários por cálculo.');
  const selected=persons.filter(e=>cc==='all'||e.cost_center_id===cc);
  if(!selected.length)fail141(d,'NO_EMPLOYEES','Nenhum funcionário ativo cadastrado nesse centro de custo e competência.');
  for(const e of selected)if(!allowedIds.has(e.cost_center_id))
   fail141(d,'EMPLOYEE_CC_MISSING','Funcionário '+(e.employee_code||e.name)+' não possui centro de custo ativo.');
  const groups=new Map();
  for(const e of selected){
   const employee=calculateEmployee141(e,month,payment,s,d);
   if(!groups.has(e.cost_center_id))groups.set(e.cost_center_id,[]);
   groups.get(e.cost_center_id).push(employee);
  }
  // Não substituir uma competência já contabilizada.
  for(const [cost] of groups){
   const latest=await read141(env,companyId,month,cost);
   if(latest.length){
    const posting=await env.DB.prepare("SELECT run_id FROM payroll_simple_postings141 WHERE company_id=? AND run_id=?").bind(companyId,latest[0].id).first();
    if(posting)fail141(d,'RUN_POSTED','A folha do centro de custo já foi contabilizada. Não é permitido substituir sua revisão.');
   }
  }
  const result=[];
  for(const [cost,employees] of groups){
   const prior=await read141(env,companyId,month,cost),revision=prior.length?prior[0].revision+1:1;
   const totals=total141(employees),id=d.uuid();
   await env.DB.prepare("INSERT INTO payroll_simple_runs141(id,company_id,competence,cost_center_id,revision,payment_date,report_json,created_by) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id,companyId,month,cost,revision,payment,JSON.stringify({employees,totals,
      employer_settings_revision:{effective_from:s.effective_from,revision:s.revision}}),auth.user.id).run();
   result.push({run_id:id,cost_center_id:cost,revision,employee_count:employees.length,totals});
  }
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'CALCULATE',entity:'payroll_simple_runs141',
   entityId:month,after:{competence:month,cost_centers:result.map(x=>x.cost_center_id),employees:selected.length}});
  return {saved:true,competence:month,results:result,report:assemble141(await read141(env,companyId,month,cc))};
 }
 if(action==='report'){
  const runs=await read141(env,companyId,month,cc);
  for(const r of runs)r.posting=await env.DB.prepare("SELECT batch_id,entry_id FROM payroll_simple_postings141 WHERE company_id=? AND run_id=?").bind(companyId,r.id).first();
  const provision_balances=(await env.DB.prepare(`SELECT component,SUM(CASE WHEN movement_kind IN ('ACCRUAL','OPENING') THEN amount_cents ELSE 0 END) AS constituted_cents,
   -SUM(CASE WHEN movement_kind='USE' THEN amount_cents ELSE 0 END) AS used_cents,SUM(amount_cents) AS balance_cents
   FROM payroll_provision_movements43 WHERE company_id=? AND competence<=? AND (?='all' OR cost_center_id=?) GROUP BY component`).bind(companyId,month,cc,cc).all()).results||[];
  return {competence:month,cost_center_id:cc,...assemble141(runs),provision_balances,
   provision_history:await provisionHistory141(env,companyId,month,cc),
   provision_notice:'A tabela mensal mostra estimativas de principal e encargos. Os saldos do livro incluem constituições e baixas registradas (inclusive históricas) de férias, terço e 13º; não incluem encargos. Nenhuma baixa é presumida pelo pagamento do salário mensal.'};
 }
 if(cc==='all')fail141(d,'SELECT_CENTER','Selecione um centro de custo específico para contabilizar.');
 const latest=(await read141(env,companyId,month,cc))[0];
 if(!latest)fail141(d,'RUN_MISSING','Calcule primeiro a folha deste centro de custo.');
 const posted=await env.DB.prepare(`SELECT p.batch_id,p.entry_id,b.code AS batch_code,b.description AS batch_description
  FROM payroll_simple_postings141 p LEFT JOIN journal_batches b ON b.id=p.batch_id AND b.company_id=p.company_id
  WHERE p.run_id=? AND p.company_id=?`).bind(latest.id,companyId).first();
 if(action==='mapping'){
  if(posted)fail141(d,'ALREADY_POSTED','O centro de custo já foi contabilizado. Mapeamentos dessa folha estão bloqueados.');
  const code=String(body.event_code||''),natureId=String(body.nature_id||'');
  if(!keys141.includes(code))fail141(d,'EVENT_INVALID','Selecione um evento da folha.',400);
  const nature=await env.DB.prepare("SELECT id FROM budget_natures WHERE company_id=? AND id=? AND active=1 AND synthetic_analytic='ANALYTIC'").bind(companyId,natureId).first();
  if(!nature)fail141(d,'NATURE_INVALID','Selecione natureza analítica, ativa e da mesma empresa.',400);
  await env.DB.prepare(`INSERT INTO payroll_simple_period_natures141
   (company_id,competence,cost_center_id,event_code,nature_id,updated_by) VALUES(?,?,?,?,?,?)
   ON CONFLICT(company_id,competence,cost_center_id,event_code) DO UPDATE SET nature_id=excluded.nature_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
   .bind(companyId,month,cc,code,natureId,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'UPDATE',entity:'payroll_simple_period_natures141',entityId:month+':'+cc+':'+code,after:{nature_id:natureId}});
  return {saved:true,event_code:code};
 }
 if(action==='copy-previous'){
  if(posted)fail141(d,'ALREADY_POSTED','A folha já foi contabilizada. Seus parâmetros estão bloqueados.');
  const previous=previousMonth141(month),source=await mapping141(env,companyId,previous,cc);
  if(!Object.keys(source).length)fail141(d,'PREVIOUS_MAPPING_MISSING','Não há parâmetros contábeis na competência anterior para este centro de custo.');
  const current=await mapping141(env,companyId,month,cc),skipped=[],statements=[];
  for(const [code,label] of C141){
   const natureId=source[code]?.nature_id;
   if(!natureId||current[code])continue;
   const nature=await env.DB.prepare("SELECT id FROM budget_natures WHERE company_id=? AND id=? AND active=1 AND synthetic_analytic='ANALYTIC'").bind(companyId,natureId).first();
   if(!nature){skipped.push(label);continue;}
   statements.push(env.DB.prepare(`INSERT INTO payroll_simple_period_natures141
    (company_id,competence,cost_center_id,event_code,nature_id,updated_by)
    SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM payroll_simple_postings141 WHERE company_id=? AND run_id=?)
    ON CONFLICT(company_id,competence,cost_center_id,event_code) DO NOTHING`)
    .bind(companyId,month,cc,code,natureId,auth.user.id,companyId,latest.id));
  }
  const results=statements.length?await env.DB.batch(statements):[];
  const copied=results.reduce((n,r)=>n+Number(r.meta?.changes||0),0);
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'COPY_PREVIOUS',entity:'payroll_simple_period_natures141',entityId:month+':'+cc,
   after:{source_competence:previous,copied,skipped}});
  return {saved:true,source_competence:previous,copied,skipped};
 }
 if(action==='finance'||action==='provisions')return integrate141(action,{...c,latest,posted,month,cc});
 const maps=await mapping141(env,companyId,month,cc);
 const snapshot=posted?await env.DB.prepare('SELECT plan_json FROM payroll_simple_ledger141 WHERE company_id=? AND run_id=?').bind(companyId,latest.id).first():null;
 const plan=snapshot?JSON.parse(snapshot.plan_json):await natureLedger141(env.DB,companyId,latest.report.totals,maps,cc);
 if(action==='accounting'){
  return {competence:month,cost_center_id:cc,revision:latest.revision,
   events:C141.map(([code,name,category])=>({code,name,category,amount_cents:get141(latest.report.totals,code),
    nature_id:maps[code]?.nature_id||null})),
   plan,posted,integrations:(await env.DB.prepare("SELECT kind FROM payroll_simple_integrations141 WHERE company_id=? AND run_id=?").bind(companyId,latest.id).all()).results||[],run_id:latest.id};
 }
 if(action==='post'){
  await d.requirePermission(env,auth.user.id,companyId,'accounting.batch.manage');
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.post');
  if(posted)return {posted:true,reused:true,...posted};
  const batchCode=String(body.batch_code??'').trim(),batchDescription=String(body.batch_description??'').trim();
  if(!/^\d{1,15}$/.test(batchCode)||Number(batchCode)===0)
   fail141(d,'INVALID_BATCH_CODE','Informe um número de lote inteiro e positivo, com até 15 dígitos. O lote 0 é reservado.',400);
  if(!batchDescription||batchDescription.length>500)
   fail141(d,'INVALID_BATCH_DESCRIPTION','Informe a descrição do lote, com até 500 caracteres.',400);
  if(plan.lines.length>180)fail141(d,'LEDGER_LIMIT','Rateios excedem 180 partidas por centro de custo. Reduza os defaults antes de contabilizar.');
  if(!plan.balanced)fail141(d,'UNBALANCED_OR_UNMAPPED','Configure os débitos e créditos de todos os eventos e confira o equilíbrio antes de contabilizar.');
  // Impedir que uma conta excluída, inativa ou alterada após o mapeamento
  // entre em lote oficial sem validação no momento da postagem.
  const accountIds=[...new Set(plan.lines.map(x=>x.account_id))];
  for(const id of accountIds){
   const account=await env.DB.prepare('SELECT id FROM accounts WHERE company_id=? AND id=? AND active=1 AND analytic=1')
    .bind(companyId,id).first();
   if(!account)fail141(d,'ACCOUNT_INACTIVE','O mapeamento utiliza uma conta inativa ou inválida. Revise as contas do evento.');
  }
  const date=last141(month);
  const periods=(await env.DB.prepare("SELECT id,code,status,start_date,end_date,closed_until FROM accounting_periods WHERE company_id=? AND start_date<=? AND end_date>=?").bind(companyId,date,date).all()).results||[];
  const eligible=periods.filter(p=>p.status!=='LOCKED'&&p.status!=='CLOSED'&&(!p.closed_until||p.closed_until<date));
  if(eligible.length!==1)fail141(d,'ACCOUNTING_PERIOD_INVALID','Cadastre um único período contábil aberto que inclua o último dia da competência.');
  const batch=await d.createBatch(env,request,auth,companyId,{period_id:eligible[0].id,
    code:batchCode,description:batchDescription});
  const entry=d.uuid(),lines=plan.lines;
  const statements=[env.DB.prepare(`INSERT INTO payroll_simple_postings141
    (run_id,company_id,batch_id,entry_id,created_by) VALUES(?,?,?,?,?)`)
    .bind(latest.id,companyId,batch.id,entry,auth.user.id),
   env.DB.prepare('INSERT INTO payroll_simple_ledger141(run_id,company_id,entry_id,plan_json) VALUES(?,?,?,?)')
    .bind(latest.id,companyId,entry,JSON.stringify(plan)),
   env.DB.prepare(`INSERT INTO journal_entries
    (id,company_id,batch_id,branch_id,entry_date,document_number,description,
     source_module,source_reference,status,total_debit_cents,total_credit_cents,
     created_by,posted_by,posted_at)
    VALUES(?,?,?,NULL,?,?,?,'PAYROLL_SIMPLE',?,'POSTED',?,?,?,?,CURRENT_TIMESTAMP)`)
    .bind(entry,companyId,batch.id,date,'FOLHA '+month,
     'Folha salarial simplificada '+month,'SIMPLE141:'+latest.id,
     plan.debit_cents,plan.credit_cents,auth.user.id,auth.user.id)];
  for(let i=0;i<lines.length;i++){
   const x=lines[i];
   statements.push(env.DB.prepare(`INSERT INTO journal_lines
    (id,company_id,entry_id,line_no,account_id,side,amount_cents,branch_id,
     cost_center_id,history_template_id,history_complement,document_number)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(d.uuid(),companyId,entry,i+1,x.account_id,x.side,x.amount_cents,x.branch_id||null,cc,x.history_template_id||null,
     x.history_complement||x.description,'FOLHA '+month));
  }
  // Marcador único e partidas na MESMA transação: nunca duplicar contabilização.
  try{await env.DB.batch(statements);}
  catch(e){
   if(/UNIQUE constraint failed/i.test(String(e)))fail141(d,'POST_ALREADY_EXISTS','Esta folha já foi contabilizada por outra operação.');
   throw e;
  }
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'POST',entity:'payroll_simple_runs141',
   entityId:latest.id,after:{batch_id:batch.id,entry_id:entry,total_cents:plan.debit_cents}});
  return {posted:true,batch_id:batch.id,batch_code:batch.code,entry_id:entry,
   debit_cents:plan.debit_cents,credit_cents:plan.credit_cents};
 }
 fail141(d,'NOT_FOUND','Operação não encontrada.',404);
}

// Integrações explícitas, após a contabilização. O marcador e os documentos
// são gravados na mesma transação; repetir a requisição não duplica valores.
async function integrate141(kind,c){
 const {env,companyId,auth,request,latest,posted,month,cc,d}=c;
 if(kind==='finance')await d.requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
 if(!posted)fail141(d,'NOT_POSTED','Contabilize a folha antes de gerar títulos ou constituir provisões.');
 const exists=await env.DB.prepare('SELECT kind FROM payroll_simple_integrations141 WHERE company_id=? AND run_id=? AND kind=?').bind(companyId,latest.id,kind).first();
 if(exists)return {integrated:true,reused:true,kind};
 const employees=latest.report.employees;
 if(!employees.length||employees.length>2000)fail141(d,'EMPLOYEE_LIMIT','Quantidade de funcionários inválida.');
 const statements=[env.DB.prepare('INSERT INTO payroll_simple_integrations141(run_id,company_id,kind,created_by) VALUES(?,?,?,?)').bind(latest.id,companyId,kind,auth.user.id)];
 let count=0,total=0;
 if(kind==='finance'){
  const old=await env.DB.prepare(`SELECT id FROM financial_payables WHERE company_id=? AND supplier_id IN (SELECT json_extract(value,'$.employee_id') FROM json_each(?)) AND source_type='PAYROLL_MONTHLY' AND substr(issue_date,1,7)=? AND status<>'CANCELLED' LIMIT 1`).bind(companyId,JSON.stringify(employees),month).first();
  if(old)fail141(d,'PAYABLE_EXISTS','Já existe título mensal de funcionário na competência. Confira a integração anterior.');
  // O tipo mensal mantém as permissões, restrições e baixa contábil do Financeiro.
  const items=[];
  for(const e of employees){
   const amount=e.events.SALARIO_LIQUIDO;
   if(!money141(amount))fail141(d,'NET_INVALID','Salário líquido inválido.');
   if(!amount)continue;
   items.push({id:d.uuid(),employee_id:e.employee_id,amount,source_id:'SIMPLE141:'+month+':'+e.employee_id,
    description:'Salário líquido '+month+' — '+e.name+' — CC '+cc});
   total+=amount;
  }
  if(total!==latest.report.totals.SALARIO_LIQUIDO||!money141(total))fail141(d,'NET_MISMATCH','Títulos não conciliam com o líquido da folha.');
  count=items.length;
  statements.push(env.DB.prepare(`INSERT INTO financial_payables
   (id,company_id,number,supplier_id,source_type,source_id,issue_date,due_date,document_number,description,amount_cents,balance_cents,status,created_by)
   SELECT json_extract(value,'$.id'),?,'FL-'||json_extract(value,'$.id'),json_extract(value,'$.employee_id'),
    'PAYROLL_MONTHLY',json_extract(value,'$.source_id'),?,?,?,json_extract(value,'$.description'),
    json_extract(value,'$.amount'),json_extract(value,'$.amount'),'OPEN',? FROM json_each(?)`)
   .bind(companyId,last141(month),latest.payment_date,'FOLHA '+month,auth.user.id,JSON.stringify(items)));
  statements.push(env.DB.prepare(`INSERT INTO payroll_simple_payables141(payable_id,company_id,run_id,employee_id,cost_center_id)
   SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.employee_id'),? FROM json_each(?)`)
   .bind(companyId,latest.id,cc,JSON.stringify(items)));
 }else{
  const items=[],components={PROV_FERIAS:'FERIAS',PROV_TERCO:'TERCO_FERIAS',PROV_13:'DECIMO_TERCEIRO'};
  const future=await env.DB.prepare(`SELECT id FROM payroll_provision_movements43 WHERE company_id=? AND employee_id IN (SELECT json_extract(value,'$.employee_id') FROM json_each(?)) AND competence>? LIMIT 1`).bind(companyId,JSON.stringify(employees),month).first();
  if(future)fail141(d,'PROVISION_BACKDATED','Há movimentos posteriores no livro de provisões de funcionário.');
  for(const e of employees){
   // O livro compartilhado não aceita constituição retroativa após uma baixa.
   for(const [code,component] of Object.entries(components)){
    const amount=e.events[code];
    if(!money141(amount))fail141(d,'PROVISION_INVALID','Valor de provisão inválido.');
    if(!amount)continue;
    items.push({id:d.uuid(),employee_id:e.employee_id,component,amount,
     origin:'SIMPLE141:'+latest.id+':'+e.employee_id+':'+component});
    total+=amount;
   }
  }
  count=items.length;
  statements.push(env.DB.prepare(`INSERT INTO payroll_provision_movements43
   (id,company_id,employee_id,cost_center_id,component,movement_kind,competence,amount_cents,origin_key,document_ref,notes,cycle_id,created_by)
   SELECT json_extract(value,'$.id'),?,json_extract(value,'$.employee_id'),?,json_extract(value,'$.component'),
    'ACCRUAL',?,json_extract(value,'$.amount'),json_extract(value,'$.origin'),?,'Constituição pela folha simplificada; encargos permanecem estimativas contábeis.',NULL,? FROM json_each(?)`)
   .bind(companyId,cc,month,'FOLHA '+month,auth.user.id,JSON.stringify(items)));
 }
 try{await env.DB.batch(statements);}catch(err){
  if(/UNIQUE constraint failed/i.test(String(err)))fail141(d,'INTEGRATION_CONFLICT','Integração ou constituição já existente. Atualize a consulta; nenhuma gravação parcial foi mantida.');
  throw err;
 }
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'INTEGRATE',entity:'payroll_simple_integrations141',entityId:latest.id,after:{kind,count,total_cents:total}});
 return {integrated:true,kind,count,total_cents:total};
}
