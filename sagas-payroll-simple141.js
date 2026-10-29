// SAGAS — Folha Simplificada v141.
// Fluxo: cadastro básico -> cálculo fechado por CC -> relatório -> configurações D/C -> lote novo.
// Não executa o fluxo legado de eventos manuais, férias, 13º ou rescisão.
// Os valores das provisões neste fluxo são estimativas mensais, não baixas de direitos.
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
async function schema141(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_simple_runs141(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,competence TEXT NOT NULL,cost_center_id TEXT NOT NULL,revision INTEGER NOT NULL,payment_date TEXT NOT NULL,report_json TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,competence,cost_center_id,revision))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_simple_runs141 ON payroll_simple_runs141(company_id,competence,cost_center_id,revision)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_simple_accounts141(company_id TEXT NOT NULL,cost_center_id TEXT NOT NULL,event_code TEXT NOT NULL,debit_account_id TEXT,credit_account_id TEXT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,cost_center_id,event_code))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_simple_postings141(run_id TEXT PRIMARY KEY,company_id TEXT NOT NULL,batch_id TEXT NOT NULL,entry_id TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
 ]);
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
async function mapping141(env,company,cc){
 const r=(await env.DB.prepare("SELECT event_code,debit_account_id,credit_account_id FROM payroll_simple_accounts141 WHERE company_id=? AND cost_center_id=?").bind(company,cc).all()).results||[];
 return Object.fromEntries(r.map(x=>[x.event_code,x]));
}
export async function payrollSimple141(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 await d.requirePermission(env,auth.user.id,companyId,
  ['calculate','mapping','post'].includes(action)?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-simple141',1,()=>schema141(env));
 const month=String(body.competence||c.competence||''),cc=String(body.cost_center_id||c.cost_center_id||'all');
 if(action==='setup'){
  const centers=(await env.DB.prepare("SELECT id,code,name FROM cost_centers WHERE company_id=? AND active=1 ORDER BY code").bind(companyId).all()).results||[];
  const months=(await env.DB.prepare("SELECT id,competence,status FROM payroll_competences WHERE company_id=? ORDER BY competence DESC LIMIT 240").bind(companyId).all()).results||[];
  const accounts=(await env.DB.prepare("SELECT id,code,name FROM accounts WHERE company_id=? AND analytic=1 AND active=1 ORDER BY code LIMIT 3000").bind(companyId).all()).results||[];
  return {centers,months,accounts,events:C141.map(([code,name,category])=>({code,name,category}))};
 }
 if(!period141(month))fail141(d,'PERIOD_INVALID','Informe a competência no formato AAAA-MM.',400);
 if(cc!=='all'&&!validId141(cc))fail141(d,'CC_INVALID','Centro de custo inválido.',400);
 if(action==='calculate'){
  const payment=String(body.payment_date||'');
  if(!date141(payment))fail141(d,'DATE_INVALID','Informe a data efetiva de pagamento.',400);
  const cperiod=await env.DB.prepare('SELECT status FROM payroll_competences WHERE company_id=? AND competence=?').bind(companyId,month).first();
  if(!cperiod||cperiod.status!=='OPEN')fail141(d,'PERIOD_NOT_OPEN','Abra a competência da folha antes do cálculo simplificado.');
  const s=await env.DB.prepare("SELECT * FROM payroll_employer_settings40 WHERE company_id=? AND effective_from<=? ORDER BY effective_from DESC,revision DESC LIMIT 1").bind(companyId,month).first();
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
  return {competence:month,cost_center_id:cc,...assemble141(runs)};
 }
 if(cc==='all')fail141(d,'SELECT_CENTER','Selecione um centro de custo específico para contabilizar.');
 const latest=(await read141(env,companyId,month,cc))[0];
 if(!latest)fail141(d,'RUN_MISSING','Calcule primeiro a folha deste centro de custo.');
 const posted=await env.DB.prepare("SELECT batch_id,entry_id FROM payroll_simple_postings141 WHERE run_id=? AND company_id=?").bind(latest.id,companyId).first();
 if(action==='mapping'){
  if(posted)fail141(d,'ALREADY_POSTED','O centro de custo já foi contabilizado. Mapeamentos dessa folha estão bloqueados.');
  const code=String(body.event_code||''),debit=body.debit_account_id||null,credit=body.credit_account_id||null;
  if(!keys141.includes(code))fail141(d,'EVENT_INVALID','Selecione um evento da folha.',400);
  if(!debit&&!credit)fail141(d,'ACCOUNT_REQUIRED','Informe uma conta a débito, a crédito ou ambas.',400);
  for(const id of [debit,credit].filter(Boolean)){
   const a=await env.DB.prepare('SELECT id FROM accounts WHERE company_id=? AND id=? AND analytic=1 AND active=1').bind(companyId,id).first();
   if(!a)fail141(d,'ACCOUNT_INVALID','A conta escolhida deve ser analítica, ativa e pertencer à empresa.');
  }
  await env.DB.prepare(`INSERT INTO payroll_simple_accounts141
   (company_id,cost_center_id,event_code,debit_account_id,credit_account_id,updated_by)
   VALUES(?,?,?,?,?,?) ON CONFLICT(company_id,cost_center_id,event_code)
   DO UPDATE SET debit_account_id=excluded.debit_account_id,credit_account_id=excluded.credit_account_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
   .bind(companyId,cc,code,debit,credit,auth.user.id).run();
  return {saved:true,event_code:code};
 }
 const maps=await mapping141(env,companyId,cc);
 const plan=ledgerLines141(latest.report.totals,maps,cc,d);
 if(action==='accounting'){
  return {competence:month,cost_center_id:cc,revision:latest.revision,
   events:C141.map(([code,name,category])=>({code,name,category,amount_cents:get141(latest.report.totals,code),
    debit_account_id:maps[code]?.debit_account_id||null,
    credit_account_id:maps[code]?.credit_account_id||null})),
   plan,posted,run_id:latest.id};
 }
 if(action==='post'){
  if(posted)return {posted:true,reused:true,batch_id:posted.batch_id,entry_id:posted.entry_id};
  if(!plan.balanced)fail141(d,'UNBALANCED_OR_UNMAPPED','Configure os débitos e créditos de todos os eventos e confira o equilíbrio antes de contabilizar.');
  const date=last141(month);
  const periods=(await env.DB.prepare("SELECT id,code,status,start_date,end_date,closed_until FROM accounting_periods WHERE company_id=? AND start_date<=? AND end_date>=?").bind(companyId,date,date).all()).results||[];
  const eligible=periods.filter(p=>p.status!=='LOCKED'&&p.status!=='CLOSED'&&(!p.closed_until||p.closed_until<date));
  if(eligible.length!==1)fail141(d,'ACCOUNTING_PERIOD_INVALID','Cadastre um único período contábil aberto que inclua o último dia da competência.');
  const batch=await d.createBatch(env,request,auth,companyId,{period_id:eligible[0].id,
    description:'Folha simplificada '+month+' — centro de custo '+cc});
  const entry=d.uuid(),lines=plan.lines;
  const statements=[env.DB.prepare(`INSERT INTO payroll_simple_postings141
    (run_id,company_id,batch_id,entry_id,created_by) VALUES(?,?,?,?,?)`)
    .bind(latest.id,companyId,batch.id,entry,auth.user.id),
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
    VALUES(?,?,?,?,?,?,?,NULL,?,NULL,?,?)`)
    .bind(d.uuid(),companyId,entry,i+1,x.account_id,x.side,x.amount_cents,cc,
     x.description,'FOLHA '+month));
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
