// SAGAS v111 — integração contábil e financeira da PRIMEIRA parcela do 13º.
// O adiantamento é registrado em ativo a compensar (natureza de ADVANCE),
// FGTS em natureza separada, e cria um título líquido por funcionário.
// A segunda parcela exige integração própria da provisão para evitar dupla despesa.
import { payrollThirteenth71 } from './sagas-payroll-thirteenth71.js';
import { payrollThirteenth70 } from './sagas-payroll-thirteenth70.js';

const TYPES111={FIRST_ADVANCE:'Adiantamento de 13º (ativo / obrigação)',
 FIRST_FGTS:'FGTS do adiantamento (custo / obrigação)'};
function fail111(d,code,msg,status=409){throw new d.HttpError(status,msg,code)}
async function schema111(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_thirteenth_natures111 (company_id TEXT NOT NULL,component TEXT NOT NULL CHECK(component IN ('FIRST_ADVANCE','FIRST_FGTS')),nature_id TEXT NOT NULL REFERENCES budget_natures(id) ON DELETE RESTRICT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,component))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_thirteenth_postings111 (run_id TEXT PRIMARY KEY REFERENCES payroll_thirteenth_runs71(id) ON DELETE RESTRICT,company_id TEXT NOT NULL,source_fingerprint TEXT NOT NULL,journal_entry_id TEXT NOT NULL,accounting_batch_id TEXT NOT NULL,payable_count INTEGER NOT NULL,payable_total_cents INTEGER NOT NULL,posted_by TEXT NOT NULL,posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,journal_entry_id))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_thirteenth_payables111 (payable_id TEXT PRIMARY KEY REFERENCES financial_payables(id) ON DELETE RESTRICT,company_id TEXT NOT NULL,run_id TEXT NOT NULL REFERENCES payroll_thirteenth_runs71(id) ON DELETE RESTRICT,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,UNIQUE(company_id,run_id,employee_id))")
 ]);
}
async function configurations111(env,companyId){
 return (await env.DB.prepare("SELECT m.component,m.nature_id,n.code,n.description,n.active,n.synthetic_analytic FROM payroll_thirteenth_natures111 m LEFT JOIN budget_natures n ON n.id=m.nature_id AND n.company_id=m.company_id WHERE m.company_id=?").bind(companyId).all()).results||[];
}
function valid111(value){return Number.isSafeInteger(Number(value))&&Number(value)>=0&&Number(value)<=99999999999}
function money111(x){if(!valid111(x))throw Error('Invalid monetary amount');return (Number(x)/100).toFixed(2)}
async function defaults111(env,companyId,natureId,cc,d){
 const rows=(await env.DB.prepare("SELECT side,account_id,percentage,branch_id,cost_center_id,history_template_id,history_complement FROM budget_nature_accounts WHERE company_id=? AND nature_id=? ORDER BY created_at,id").bind(companyId,natureId).all()).results||[];
 const accountCache=new Map(),lines=[];
 const failures=[];
 for(const side of ['D','C']){
  const choices=rows.filter(x=>x.side===side),specific=choices.filter(x=>x.cost_center_id===cc.id);
  const chosen=specific.length?specific:choices.filter(x=>!x.cost_center_id);
  const perc=chosen.map(x=>Number(x.percentage)),total=perc.reduce((a,b)=>a+b,0);
  if(!chosen.length||perc.some(x=>!Number.isFinite(x)||x<=0)||Math.abs(total-100)>0.00001){
   failures.push('Defaults '+side+' da natureza não totalizam 100% para CC '+cc.code+'.');continue;
  }
  for(const line of chosen){
   if(!accountCache.has(line.account_id)){
    const account=await env.DB.prepare("SELECT id FROM accounts WHERE company_id=? AND id=? AND analytic=1 AND active=1").bind(companyId,line.account_id).first();
    accountCache.set(line.account_id,!!account);
   }
   if(!accountCache.get(line.account_id))failures.push('Conta default inativa ou não analítica na natureza do CC '+cc.code+'.');
  }
  lines.push(...chosen.map(x=>({...x,side})));
 }
 return {defaults:lines,problems:failures};
}
function split111(amount,entries){
 const chosen=entries.map(x=>({...x,amount_cents:0})),total=Number(amount);
 let added=0;
 for(let i=0;i<chosen.length;i++){
  const v=i===chosen.length-1?total-added:Math.round(total*Number(chosen[i].percentage)/100);
  chosen[i].amount_cents=v;added+=v;
 }
 return chosen.filter(x=>x.amount_cents>0);
}
async function preview111(c){
 const {env,companyId,d}=c,runId=String(c.runId||'');
 const detail=await payrollThirteenth71('detail',{...c,runId});
 const run=detail.run,problems=[];
 const block=(code,message)=>{if(!problems.some(x=>x.code===code&&x.message===message))problems.push({code,message})};
 if(run.phase!=='FIRST')block('SECOND_NOT_READY','A quitação da segunda parcela exige integração de provisões; não use contabilização do adiantamento.');
 if(run.status!=='APPROVED')block('APPROVAL_REQUIRED','A primeira parcela precisa estar aprovada.');
 const [mappings,batchSetting,old,advances,newest]=await Promise.all([
  configurations111(env,companyId),
  env.DB.prepare("SELECT batch_id FROM payroll_finance_batches38 WHERE company_id=?").bind(companyId).first(),
  env.DB.prepare("SELECT p.*,j.status AS journal_status FROM payroll_thirteenth_postings111 p LEFT JOIN journal_entries j ON j.company_id=p.company_id AND j.id=p.journal_entry_id WHERE p.company_id=? AND p.run_id=?").bind(companyId,runId).first(),
  env.DB.prepare("SELECT employee_id FROM payroll_thirteenth_advances70 WHERE company_id=? AND calendar_year=? AND status='ACTIVE'").bind(companyId,run.calendar_year).all(),
  env.DB.prepare("SELECT id FROM payroll_thirteenth_runs71 WHERE company_id=? AND calendar_year=? AND phase='FIRST' ORDER BY revision DESC LIMIT 1").bind(companyId,run.calendar_year).first()
 ]);
 if(newest?.id!==runId)block('OLDER_REVISION','Somente a última revisão da primeira parcela pode ser integrada.');
 if(old)block('ALREADY_POSTED','Esta parcela já foi integrada; não gerar outro título.');
 if(old&&old.journal_status!=='POSTED')block('POSTING_CHANGED','Lançamento contábil vinculado foi alterado ou anulado.');
 const external=new Set((advances.results||[]).map(x=>x.employee_id));
 if(external.size)block('EXTERNAL_ADVANCE','Existe adiantamento externo documentado. Não gere título novamente para estes empregados.');
 if(!detail.employees.length||detail.employees.length>70)block('RUN_LIMIT','A integração atende 1 a 70 funcionários por lote.');
 const batch=await env.DB.prepare("SELECT id,status FROM journal_batches WHERE company_id=? AND id=?").bind(companyId,batchSetting?.batch_id||'').first();
 if(!batch||batch.status!=='OPEN')block('BATCH_REQUIRED','Configure lote contábil aberto em Integrar Financeiro / Contábil.');
 const cfg=new Map(mappings.map(x=>[x.component,x]));
 for(const component of Object.keys(TYPES111)){
  const m=cfg.get(component);
  if(!m||Number(m.active)!==1||m.synthetic_analytic!=='ANALYTIC')
   block('NATURE_REQUIRED','Configure uma natureza analítica ativa para '+TYPES111[component]+'.');
 }
 let fresh=null;
 if(run.status==='APPROVED'){
  try{fresh=await payrollThirteenth70('preview',{...c,year:run.calendar_year,phase:'FIRST'});
   if(fresh.source_fingerprint!==run.source_fingerprint)
    block('SOURCE_CHANGED','Cadastro, salário, períodos ou adiantamentos mudaram desde a aprovação.');
   if(fresh.problems.length||fresh.totals.blocked)block('SOURCE_BLOCKED','A prévia atual do 13º apresenta pendências.');
  }catch(e){block('SOURCE_UNAVAILABLE','Não foi possível validar a memória de cálculo: '+String(e?.message||e))}
 }
 const ccCache=new Map(),natureCache=new Map(),lines=[],employeeRows=[];
 let netSum=0,fgtsSum=0;
 for(const employee of detail.employees){
  const ccId=employee.cost_center_id;
  if(!ccCache.has(ccId)){
   const cc=ccId?await env.DB.prepare("SELECT id,code,active FROM cost_centers WHERE company_id=? AND id=?").bind(companyId,ccId).first():null;
   ccCache.set(ccId,cc);
  }
  const cc=ccCache.get(ccId);
  if(!cc||Number(cc.active)!==1){block('COST_CENTER_INVALID','Centro de custo do funcionário '+employee.employee_name+' não está ativo.');continue;}
  const adv=Number(employee.advance_cents),fgts=Number(employee.fgts_cents),net=Number(employee.net_cents);
  if(![adv,fgts,net].every(valid111)||adv<=0||net!==adv){
   block('ENVELOPE_INVALID','Adiantamento do funcionário '+employee.employee_name+' diverge do envelope.');continue;
  }
  netSum+=net;fgtsSum+=fgts;
  employeeRows.push({employee_id:employee.employee_id,employee_code:employee.employee_code,
   employee_name:employee.employee_name,net_cents:net,cost_center_id:cc.id,fgts_cents:fgts});
  for(const [component,amount] of [['FIRST_ADVANCE',adv],['FIRST_FGTS',fgts]]){
   if(!amount)continue;
   const mapping=cfg.get(component);
   if(!mapping||mapping.active!==1&&mapping.active!=='1'||mapping.synthetic_analytic!=='ANALYTIC')continue;
   const cacheKey=mapping.nature_id+'|'+cc.id;
   if(!natureCache.has(cacheKey))
    natureCache.set(cacheKey,await defaults111(env,companyId,mapping.nature_id,cc,d));
   const data=natureCache.get(cacheKey);
   if(data.problems.length){for(const m of data.problems)block('ACCOUNT_MAPPING',m);continue;}
   for(const side of ['D','C']){
    for(const entry of split111(amount,data.defaults.filter(x=>x.side===side))){
     lines.push({side,account_id:entry.account_id,amount_cents:entry.amount_cents,
      cost_center_id:cc.id,branch_id:entry.branch_id||null,history_template_id:entry.history_template_id||null,
      history_complement:entry.history_complement||('13º '+run.calendar_year+' / '+component+' / '+(employee.employee_code||'')+' / CC '+cc.code)});
    }
   }
  }
 }
 const debit=lines.filter(x=>x.side==='D').reduce((a,b)=>a+b.amount_cents,0);
 const credit=lines.filter(x=>x.side==='C').reduce((a,b)=>a+b.amount_cents,0);
 if(debit!==credit||debit!==netSum+fgtsSum)block('JOURNAL_UNBALANCED','Partidas contábeis não conciliam com adiantamentos e FGTS.');
 if(netSum!==Number(run.net_cents)||fgtsSum!==Number(run.fgts_cents))
  block('TOTAL_MISMATCH','Somatórios não coincidem com a revisão aprovada.');
 if(lines.length>150)block('TOO_MANY_LINES','Excedido o limite de 150 partidas para integração.');
 const fingerprint=await d.hash({version:111,run_id:runId,source:run.source_fingerprint,
  journal_batch:batch?.id||null,mappings,accounts:lines,employees:employeeRows,existing:old?.run_id||null});
 return {kind:'THIRTEENTH_FIRST_POSTING_V111',run_id:runId,year:run.calendar_year,phase:run.phase,revision:run.revision,
  posted:!!old,existing:old,ready:!problems.length,problems,source_fingerprint:fingerprint,
  mappings,lines,employees:employeeRows,journal_debit_cents:debit,journal_credit_cents:credit,
  payable_count:employeeRows.filter(x=>x.net_cents>0).length,payable_total_cents:netSum,
  journal_batch_id:batch?.id||null,read_only:true,
  notes:['Registra adiantamento a compensar e FGTS por natureza e centro de custo.',
   'Gera contas a pagar apenas para a primeira parcela ainda não paga/documentada.',
   'O pagamento efetivo deve ocorrer no financeiro com evento contábil de baixa.',
   'A segunda parcela e utilização de provisões não são integradas nesta rotina.']};
}
export async function payrollThirteenth111(action,c){
 const {env,companyId,auth,body={},request,d}=c;
 await d.ensureSchemaRevision(env,'payroll-thirteenth-integration111',1,()=>schema111(env));
 if(action==='settings'||action==='save'){
  await d.requirePermission(env,auth.user.id,companyId,action==='save'?'payroll.manage':'payroll.read');
  if(action==='settings')return {components:TYPES111,mappings:await configurations111(env,companyId)};
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
  const component=String(body.component||''),natureId=String(body.nature_id||'');
  if(!Object.hasOwn(TYPES111,component))fail111(d,'COMPONENT_INVALID','Componente não reconhecido.',400);
  const nature=await env.DB.prepare("SELECT id FROM budget_natures WHERE company_id=? AND id=? AND active=1 AND synthetic_analytic='ANALYTIC'").bind(companyId,natureId).first();
  if(!nature)fail111(d,'NATURE_INVALID','Escolha natureza analítica ativa.',400);
  const existing=(await configurations111(env,companyId)).find(x=>x.component===component)||null;
  await env.DB.prepare("INSERT INTO payroll_thirteenth_natures111(company_id,component,nature_id,updated_by) VALUES (?,?,?,?) ON CONFLICT(company_id,component) DO UPDATE SET nature_id=excluded.nature_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP")
   .bind(companyId,component,natureId,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,request,entity:'payroll_thirteenth_natures111',
   entityId:component,action:'UPDATE',before:existing,after:{component,nature_id:natureId}});
  return {saved:true,mappings:await configurations111(env,companyId)};
 }
 await d.requirePermission(env,auth.user.id,companyId,action==='integrate'?'payroll.manage':'payroll.read');
 if(action==='integrate'){
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.post');
  await d.requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
 }
 const current=await preview111(c);
 if(action==='preview')return current;
 if(action!=='integrate')fail111(d,'INVALID_ACTION','Ação não encontrada.',404);
 if(body.confirmation!=='INTEGRAR ADIANTAMENTO 13')fail111(d,'CONFIRMATION_REQUIRED','Digite INTEGRAR ADIANTAMENTO 13.',400);
 if(current.source_fingerprint!==body.source_fingerprint)
  fail111(d,'PREVIEW_STALE','A prévia foi alterada. Consulte novamente.');
 if(!current.ready)fail111(d,'INTEGRATION_BLOCKED',current.problems[0]?.message||'Conferência não concluída.');
 const runId=current.run_id,year=current.year,source='THIRTEENTH_FIRST:'+runId;
 const used=await env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference=? LIMIT 1")
  .bind(companyId,source).first();
 if(used)fail111(d,'JOURNAL_ALREADY_EXISTS','Existe lançamento desta origem, concilie antes de repetir.');
 const [prior,number]=await Promise.all([
  env.DB.prepare("SELECT run_id FROM payroll_thirteenth_postings111 WHERE company_id=? AND run_id=?").bind(companyId,runId).first(),
  d.nextPayableNumber(env,companyId)
 ]);
 if(prior)fail111(d,'ALREADY_POSTED','Esta revisão já foi integrada.');
 const first=Number(String(number).slice(3));
 if(!Number.isSafeInteger(first)||first<1||first+current.payable_count-1>999999)
  fail111(d,'PAYABLE_NUMBER_LIMIT','Numeração de títulos fora do limite.');
 const entryDate=year+'-11-30';
 const built=await d.buildEntry(env,auth,companyId,{
  batch_id:current.journal_batch_id,entry_date:entryDate,document_number:'13-ADV-'+year,
  description:'Primeira parcela do 13º '+year,source_module:'PAYROLL',source_reference:source,
  lines:current.lines.map(x=>({side:x.side,account_id:x.account_id,amount:money111(x.amount_cents),
   cost_center_id:x.cost_center_id,branch_id:x.branch_id,history_template_id:x.history_template_id,
   history_complement:x.history_complement}))
 });
 if(Number(built.total_cents)!==current.journal_debit_cents)
  fail111(d,'TOTAL_MISMATCH','Lançamento contábil difere da prévia.');
 const stmts=[...built.stmts];let index=0;
 for(const e of current.employees){
  if(e.net_cents<=0)continue;
  const id=d.uuid(),no='CP-'+String(first+index).padStart(6,'0');
  const due=year+'-11-30';
  stmts.push(env.DB.prepare("INSERT INTO financial_payables(id,company_id,number,supplier_id,source_type,source_id,issue_date,due_date,document_number,description,amount_cents,balance_cents,status,created_by) VALUES (?,?,?,?,'PAYROLL_THIRTEENTH',?,?,?,?,?,?,?,'OPEN',?)")
   .bind(id,companyId,no,e.employee_id,runId+':'+e.employee_id,entryDate,due,'13-ADV-'+year,
    'Adiantamento 13º '+year+' — '+(e.employee_code||'')+' '+e.employee_name,e.net_cents,e.net_cents,auth.user.id));
  stmts.push(env.DB.prepare("INSERT INTO payroll_thirteenth_payables111(payable_id,company_id,run_id,employee_id) VALUES (?,?,?,?)")
   .bind(id,companyId,runId,e.employee_id));
  index++;
 }
 const postingId=d.uuid();
 stmts.push(env.DB.prepare("INSERT INTO payroll_thirteenth_postings111(run_id,company_id,source_fingerprint,journal_entry_id,accounting_batch_id,payable_count,payable_total_cents,posted_by) VALUES (?,?,?,?,?,?,?,?)")
  .bind(runId,companyId,current.source_fingerprint,built.entryId,current.journal_batch_id,index,
   current.payable_total_cents,auth.user.id));
 if(index!==current.payable_count||stmts.length>210)
  fail111(d,'TRANSACTION_LIMIT','Conferência de títulos ou limite transacional.');
 try{
  const result=await env.DB.batch(stmts);
  if(result.some(x=>!x.success))fail111(d,'TRANSACTION_FAILED','Erro transacional na integração.');
 }catch(e){
  if(/UNIQUE|FOREIGN KEY|constraint failed/i.test(String(e)))fail111(d,'CONCURRENT_POST','A integração foi alterada simultaneamente. Consulte de novo.');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'INTEGRATE',entity:'payroll_thirteenth_postings111',
  entityId:runId,after:{journal_entry_id:built.entryId,employee_count:index,payable_total_cents:current.payable_total_cents}});
 return {integrated:true,run_id:runId,journal_entry_id:built.entryId,payable_count:index,
  payable_total_cents:current.payable_total_cents,financial_generated:true,bank_paid:false,accounting_posted:true};
}