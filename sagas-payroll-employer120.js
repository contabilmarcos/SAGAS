// SAGAS Folha v120 — encargos patronais de competência, conferidos documentalmente.
// Posta somente CPP/RAT/terceiros/PIS quando base e documento são confirmados.
// NÃO duplica FGTS mensal, não gera guia de arrecadação nem paga títulos.
import {payrollEmployer40} from './sagas-payroll-employer40.js';
const PARTS120={CPP:'INSS patronal',RAT:'RAT ajustado pelo FAP',THIRDS:'Contribuições a terceiros',PIS:'PIS sobre folha'};
const FIELD120={CPP:'cpp_cents',RAT:'rat_cents',THIRDS:'thirds_cents',PIS:'pis_cents'};
const MAX120=99999999999;
function fail120(d,code,message,status=409){throw new d.HttpError(status,message,code)}
function amount120(v){return typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=MAX120}
function plus120(a){if(!a.every(amount120))return null;const v=a.reduce((s,x)=>s+BigInt(x),0n);return v<=BigInt(MAX120)?Number(v):null}
function date120(value,d){
 const v=String(value||'');
 if(!/^20\d\d-\d\d-\d\d$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||
     new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)
  fail120(d,'INVALID_DATE','Informe vencimento válido no formato AAAA-MM-DD.',400);
 return v;
}
function note120(value,d,min=8,max=160){
 const s=String(value||'').trim();
 if(s.length<min||s.length>max||/[\x00-\x1f]/.test(s))fail120(d,'INVALID_REFERENCE','Informe documento comprobatório válido.',400);
 return s;
}
function problem120(all,code,message){
 if(!all.some(x=>x.code===code&&x.message===message))all.push({code,message});
}
async function schema120(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_employer_mapping120(company_id TEXT NOT NULL,component TEXT NOT NULL CHECK(component IN ('CPP','RAT','THIRDS','PIS')),nature_id TEXT NOT NULL REFERENCES budget_natures(id) ON DELETE RESTRICT,supplier_id TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,component))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_employer_postings120(run_id TEXT PRIMARY KEY,company_id TEXT NOT NULL,source_fingerprint TEXT NOT NULL,journal_entry_id TEXT NOT NULL,accounting_batch_id TEXT NOT NULL,payable_count INTEGER NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),evidence_reference TEXT NOT NULL,posted_by TEXT NOT NULL,posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_employer_payables120(company_id TEXT NOT NULL,run_id TEXT NOT NULL REFERENCES payroll_employer_postings120(run_id) ON DELETE RESTRICT,component TEXT NOT NULL,payable_id TEXT NOT NULL REFERENCES financial_payables(id) ON DELETE RESTRICT,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),due_date TEXT NOT NULL,document_ref TEXT NOT NULL,PRIMARY KEY(company_id,run_id,component),UNIQUE(company_id,payable_id))")
 ]);
}
async function mapped120(env,companyId){
 return (await env.DB.prepare(
  "SELECT m.component,m.nature_id,m.supplier_id,n.code AS nature_code,n.description AS nature_name,n.active,n.synthetic_analytic,s.code AS supplier_code,s.name AS supplier_name,s.active AS supplier_active FROM payroll_employer_mapping120 m LEFT JOIN budget_natures n ON n.id=m.nature_id AND n.company_id=m.company_id LEFT JOIN purchase_suppliers s ON s.id=m.supplier_id AND s.company_id=m.company_id WHERE m.company_id=? ORDER BY m.component"
 ).bind(companyId).all()).results||[];
}
export function split120(defaults,side,center,amount,component,problems){
 if(!amount)return [];
 const options=(defaults||[]).filter(x=>x.side===side),specific=options.filter(x=>x.cost_center_id===center);
 const chosen=specific.length?specific:options.filter(x=>!x.cost_center_id);
 const values=chosen.map(x=>Number(x.percentage));
 if(!chosen.length||values.some(x=>!Number.isFinite(x)||x<=0||x>100)||
    Math.abs(values.reduce((a,b)=>a+b,0)-100)>0.00001||
    chosen.some(x=>Number(x.account_active)!==1||Number(x.account_analytic)!==1)){
  problem120(problems,'ACCOUNT_MAPPING_INVALID','Natureza de '+component+' sem contas '+side+' válidas e rateio total de 100% no centro de custo.');
  return [];
 }
 let remaining=amount;const lines=[];
 for(let i=0;i<chosen.length;i++){
  const x=chosen[i],value=i===chosen.length-1?remaining:
   Number((BigInt(amount)*BigInt(Math.round(values[i]*10000))+500000n)/1000000n);
  remaining-=value;
  if(value<1||remaining<0){problem120(problems,'INVALID_SPLIT','Rateio gerou parcela nula ou negativa em '+component);return []}
  lines.push({side,component,account_id:x.account_id,cost_center_id:center,
   branch_id:x.branch_id||null,history_template_id:x.history_template_id||null,
   amount_cents:value,account_code:x.account_code||null,account_name:x.account_name||null});
 }
 return lines;
}
export function compose120(base,run,mappings,rules,batch,monthly,existing,vacationHistory=null){
 const problems=[],entries=[],expected={};
 if(!run||run.status!=='APPROVED')problem120(problems,'RUN_NOT_CLOSED','Folha mensal ainda não fechada.');
 if(String(run?.source_fingerprint||'').startsWith('VACATION100:')&&
    (!vacationHistory||vacationHistory.journal_entry_id!==monthly?.journal_entry_id||
     vacationHistory.journal_status!=='POSTED'))
  problem120(problems,'VACATION_NOT_HOMOLOGATED','Folha com férias exige contabilização definitiva v121 vinculada a diário POSTED antes dos encargos.');
 if(!monthly||monthly.source_fingerprint!==run?.source_fingerprint||monthly.journal_status!=='POSTED')
  problem120(problems,'MONTHLY_NOT_ACCOUNTED','Integre a folha mensal com diário POSTED antes dos encargos patronais.');
 if(!batch||batch.status!=='OPEN')problem120(problems,'BATCH_CLOSED','Configure lote contábil aberto.');
 if(existing)problem120(problems,'ALREADY_INTEGRATED','Encargos já integrados; consulte os títulos existentes.');
 if(!base?.items?.length||base.items.length>90)
  problem120(problems,'EMPLOYEE_LIMIT','Processamento deve ter de 1 a 90 funcionários.');
 const config=new Map((mappings||[]).map(x=>[x.component,x]));
 const used=new Map();
 for(const part of Object.keys(PARTS120)){
  const field=FIELD120[part],v=base?.totals?.[field];
  if(!amount120(v)){problem120(problems,'AMOUNT_INVALID','Total inválido de '+PARTS120[part]);continue}
  expected[part]=v;
  if(!v)continue;
  const m=config.get(part);
  if(!m||Number(m.active)!==1||m.synthetic_analytic!=='ANALYTIC'||
     Number(m.supplier_active)!==1||!m.supplier_id){
   problem120(problems,'CONFIG_REQUIRED','Configure natureza e credor ativo para '+PARTS120[part]);continue;
  }
  used.set(part,m);
 }
 const byNature=new Map((rules||[]).map(x=>[x.nature_id,x.rules]));
 const costCenters=new Map((rules||[]).filter(x=>x.cost_center_id).map(x=>[x.cost_center_id,x]));
 const sumEmployee={CPP:0,RAT:0,THIRDS:0,PIS:0};
 for(const employee of base?.items||[]){
  const center=employee.cost_center_id,cc=costCenters.get(center);
  if(!center||!cc||Number(cc.active)!==1){
   problem120(problems,'CENTER_MISSING','Centro de custo histórico inválido para '+(employee.employee_code||employee.employee_id));continue;
  }
  for(const part of Object.keys(PARTS120)){
   const value=employee[FIELD120[part]];
   if(!amount120(value)){
    problem120(problems,'EMPLOYEE_AMOUNT_INVALID','Encargo inválido de '+PARTS120[part]+' para '+(employee.employee_code||employee.employee_id));continue;
   }
   sumEmployee[part]+=value;
   if(!value||!used.has(part))continue;
   const cfg=used.get(part),def=byNature.get(cfg.nature_id)||[];
   const debit=split120(def,'D',center,value,part,problems);
   const credit=split120(def,'C',center,value,part,problems);
   // Uma natureza de encargo NÃO pode debitar e creditar exatamente a mesma conta.
   const debts=new Set(debit.map(x=>x.account_id+'|'+(x.branch_id||'')));
   if(credit.some(x=>debts.has(x.account_id+'|'+(x.branch_id||''))))
    problem120(problems,'SAME_ACCOUNT','A natureza de '+PARTS120[part]+' usa a mesma conta no débito e no crédito.');
   entries.push(...debit,...credit);
  }
 }
 for(const part of Object.keys(PARTS120))if(expected[part]!==sumEmployee[part])
  problem120(problems,'ENVELOPE_TOTAL_MISMATCH','Soma por funcionário difere do total '+PARTS120[part]+'.');
 const total=plus120(Object.values(expected));
 if(total===null||total<=0)problem120(problems,'NO_AMOUNT','Nenhum encargo positivo e válido.');
 const deb=plus120(entries.filter(x=>x.side==='D').map(x=>x.amount_cents));
 const cred=plus120(entries.filter(x=>x.side==='C').map(x=>x.amount_cents));
 if(deb===null||cred===null||deb!==cred||deb!==total)
  problem120(problems,'UNBALANCED','Débitos e créditos não correspondem aos encargos confirmados.');
 if(entries.length>160||entries.length+Object.values(expected).filter(Boolean).length+5>220)
  problem120(problems,'TRANSACTION_LIMIT','Integração excede o limite de partidas.');
 return {kind:'EMPLOYER_CHARGES_INTEGRATION_V120',run_id:run?.id,
  competence:run?.competence,source_fingerprint:null,employee_count:base?.items?.length||0,
  amount_by_component:expected,total_cents:total,accounting_batch_id:batch?.id||null,
  lines:entries,problems,ready:problems.length===0,integrated:!!existing,existing,
  payable_count:Object.values(expected).filter(x=>x>0).length,
  financial_generated:!!existing,accounting_generated:!!existing,read_only:true,
  note:'Não inclui FGTS já contabilizado com a folha; guias e pagamentos não são emitidos automaticamente.'};
}
async function preview120(c){
 const {env,companyId,runId,d}=c;
 const [base,detail,mappings,batchSetting,monthly,existing]=await Promise.all([
  payrollEmployer40('preview',c),
  d.payrollMonthlyRunDetail35(env,companyId,runId),
  mapped120(env,companyId),
  env.DB.prepare("SELECT batch_id FROM payroll_finance_batches38 WHERE company_id=?").bind(companyId).first(),
  env.DB.prepare("SELECT p.source_fingerprint,j.status AS journal_status,p.journal_entry_id FROM payroll_finance_postings37 p LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=p.company_id WHERE p.company_id=? AND p.run_id=?").bind(companyId,runId).first(),
  env.DB.prepare("SELECT p.*,j.status AS journal_status FROM payroll_employer_postings120 p LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=p.company_id WHERE p.company_id=? AND p.run_id=?").bind(companyId,runId).first()
 ]);
 const batch=await env.DB.prepare("SELECT id,status FROM journal_batches WHERE company_id=? AND id=?").bind(companyId,batchSetting?.batch_id||'').first();
 const rules=[];
 const needed=[...new Set(mappings.map(x=>x.nature_id))];
 for(const nature_id of needed){
  const z=(await env.DB.prepare("SELECT b.side,b.account_id,b.percentage,b.cost_center_id,b.branch_id,b.history_template_id,a.active AS account_active,a.analytic AS account_analytic,a.code AS account_code,a.name AS account_name FROM budget_nature_accounts b LEFT JOIN accounts a ON a.id=b.account_id AND a.company_id=b.company_id WHERE b.company_id=? AND b.nature_id=? ORDER BY b.side,b.id").bind(companyId,nature_id).all()).results||[];
  rules.push({nature_id,rules:z});
 }
 const ids=[...new Set(base.items.map(x=>x.cost_center_id).filter(Boolean))];
 for(const id of ids){
  const cc=await env.DB.prepare("SELECT id,code,active FROM cost_centers WHERE company_id=? AND id=?").bind(companyId,id).first();
  rules.push({cost_center_id:id,active:cc?.active||0,code:cc?.code||null});
 }
 const vacationHistory=String(detail.run.source_fingerprint||'').startsWith('VACATION100:')?
   await (async()=>{
    try{return await env.DB.prepare(
      "SELECT v.journal_entry_id,j.status AS journal_status FROM payroll_vacation_integrations121 v JOIN journal_entries j ON j.id=v.journal_entry_id AND j.company_id=v.company_id WHERE v.company_id=? AND v.run_id=?"
    ).bind(companyId,runId).first();}
    catch(e){if(/no such table/i.test(String(e)))return null;throw e}
   })():null;
 const result=compose120(base,detail.run,mappings,rules,batch,monthly,existing,vacationHistory);
 if(existing&&existing.journal_status!=='POSTED')
  problem120(result.problems,'POSTED_JOURNAL_CHANGED','Diário anterior alterado/anulado; concilie antes de nova integração.');
 result.ready=!result.problems.length;
 result.source_fingerprint=await d.hash({
  version:120,company_id:companyId,run_id:runId,run_fingerprint:detail.run.source_fingerprint,
  employer:base.totals,employees:base.items,settings:base.settings,
  mappings,rules,batch,monthly,existing,vacationHistory,lines:result.lines,problems:result.problems
 });
 return result;
}
export async function payrollEmployer120(action,c){
 const {env,companyId,auth,d,request,body={},runId}=c;
 const write=['save','integrate'].includes(action);
 await d.requirePermission(env,auth.user.id,companyId,write?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-employer-posting120',1,()=>schema120(env));
 if(action==='settings'){
  const creditors=(await env.DB.prepare("SELECT id,code,name FROM purchase_suppliers WHERE company_id=? AND active=1 ORDER BY code LIMIT 300").bind(companyId).all()).results||[];
  return {components:PARTS120,mappings:await mapped120(env,companyId),creditors};
 }
 if(action==='save'){
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
  await d.requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
  const component=String(body.component||''),natureId=String(body.nature_id||''),supplierId=String(body.supplier_id||'');
  if(!Object.prototype.hasOwnProperty.call(PARTS120,component))
   fail120(d,'COMPONENT_INVALID','Componente patronal inválido.',400);
  const [n,s]=await Promise.all([
   env.DB.prepare("SELECT id FROM budget_natures WHERE company_id=? AND id=? AND active=1 AND synthetic_analytic='ANALYTIC'").bind(companyId,natureId).first(),
   env.DB.prepare("SELECT id FROM purchase_suppliers WHERE company_id=? AND id=? AND active=1").bind(companyId,supplierId).first()
  ]);
  if(!n||!s)fail120(d,'CONFIG_INVALID','Natureza analítica ativa e credor ativo são obrigatórios.',400);
  await env.DB.prepare("INSERT INTO payroll_employer_mapping120(company_id,component,nature_id,supplier_id,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(company_id,component) DO UPDATE SET nature_id=excluded.nature_id,supplier_id=excluded.supplier_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(companyId,component,natureId,supplierId,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'UPDATE',entity:'payroll_employer_mapping120',entityId:component,after:{nature_id:natureId,supplier_id:supplierId}});
  return {saved:true,mappings:await mapped120(env,companyId)};
 }
 if(action==='history'){
  const records=(await env.DB.prepare("SELECT p.run_id,p.posted_at,p.amount_cents,p.payable_count,p.journal_entry_id,j.status AS journal_status FROM payroll_employer_postings120 p LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=p.company_id WHERE p.company_id=? ORDER BY p.posted_at DESC LIMIT 100").bind(companyId).all()).results||[];
  return {records};
 }
 if(action!=='preview'&&action!=='integrate')fail120(d,'NOT_FOUND','Ação inexistente.',404);
 if(action==='integrate'){
  for(const code of ['accounting.entry.create','accounting.entry.post','financial.payable.manage'])
   await d.requirePermission(env,auth.user.id,companyId,code);
 }
 const p=await preview120(c);
 if(action==='preview')return p;
 if(body.confirmation!=='INTEGRAR ENCARGOS PATRONAIS'||body.bases_confirmed!=='CONFIRMO BASES E INCIDENCIAS')
  fail120(d,'CONFIRMATION_REQUIRED','Confirme a integração e a responsabilidade pelas bases e incidências.',400);
 if(p.source_fingerprint!==body.source_fingerprint)
  fail120(d,'PREVIEW_CHANGED','A folha, os encargos, as naturezas ou o lote mudaram; consulte novamente.');
 if(!p.ready)fail120(d,'INTEGRATION_BLOCKED',p.problems[0]?.message||'Existem pendências.');
 const doc=note120(body.evidence_reference,d,12,240);
 const payload=body.components||{},items=[];
 for(const [component,value] of Object.entries(p.amount_by_component)){
  if(!value)continue;
  const x=payload[component]||{};
  if(!amount120(x.confirmed_amount_cents)||x.confirmed_amount_cents!==value)
   fail120(d,'DOCUMENT_MISMATCH','Valor do documento diverge da prévia do encargo '+component+'.');
  const due=date120(x.due_date,d),reference=note120(x.document_ref,d,6,120);
  if(due<p.competence+'-01')fail120(d,'DUE_DATE_BEFORE_PERIOD','Vencimento anterior à competência do encargo.',400);
  items.push({component,value,due,reference});
 }
 if(items.length!==p.payable_count)fail120(d,'ITEMS_CHANGED','Componentes dos encargos divergentes.');
 const old=await env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference=? LIMIT 1").bind(companyId,'EMPLOYER120:'+runId).first();
 if(old)fail120(d,'JOURNAL_EXISTS','Já existe lançamento contábil para estes encargos.');
 const first=await d.nextPayableNumber(env,companyId);
 const n=Number(first.slice(3));
 if(!Number.isSafeInteger(n)||n<1||n+items.length-1>999999)
  fail120(d,'NUMBER_LIMIT','Numeração dos títulos ultrapassa o limite.');
 const [year,month]=p.competence.split('-').map(Number);
 const closingDate=p.competence+'-'+String(new Date(Date.UTC(year,month,0)).getUTCDate()).padStart(2,'0');
 const built=await d.buildInternalPostedEntry(env,auth,companyId,{
  batch_id:p.accounting_batch_id,entry_date:closingDate,
  document_number:'ENC-'+p.competence,description:'Encargos patronais '+p.competence+' — '+doc,
  source_module:'PAYROLL',source_reference:'EMPLOYER120:'+runId,
  lines:p.lines.map(x=>({side:x.side,account_id:x.account_id,amount:d.centsToMoney(x.amount_cents),
   cost_center_id:x.cost_center_id,branch_id:x.branch_id,history_template_id:x.history_template_id,
   history_complement:PARTS120[x.component]+' — folha '+p.competence}))
 });
 if(built.total_cents!==p.total_cents)
  fail120(d,'JOURNAL_MISMATCH','Contabilização difere dos encargos conferidos.');
 const settings=await mapped120(env,companyId),configured=new Map(settings.map(x=>[x.component,x]));
 const statements=[...built.stmts];
 // Chave única run_id evita repetir contabilização. O journal e os títulos
 // participam do MESMO DB.batch do D1 (rollback por violação de constraint).
 statements.push(env.DB.prepare("INSERT INTO payroll_employer_postings120(run_id,company_id,source_fingerprint,journal_entry_id,accounting_batch_id,payable_count,amount_cents,evidence_reference,posted_by) VALUES(?,?,?,?,?,?,?,?,?)")
  .bind(runId,companyId,p.source_fingerprint,built.entryId,p.accounting_batch_id,items.length,p.total_cents,doc,auth.user.id));
 const ids=[];
 for(let i=0;i<items.length;i++){
  const x=items[i],m=configured.get(x.component),id=d.uuid();
  if(!m||Number(m.supplier_active)!==1)fail120(d,'CREDITOR_CHANGED','Credor não está mais ativo.');
  ids.push(id);
  statements.push(env.DB.prepare("INSERT INTO financial_payables(id,company_id,number,supplier_id,source_type,source_id,issue_date,due_date,document_number,description,amount_cents,balance_cents,status,created_by) VALUES(?,?,?,?,'PAYROLL_EMPLOYER',?,?,?,?,?,?,?,'OPEN',?)")
   .bind(id,companyId,'CP-'+String(n+i).padStart(6,'0'),m.supplier_id,
    runId+':'+x.component,closingDate,x.due,x.reference,
    PARTS120[x.component]+' '+p.competence+' / '+doc,x.value,x.value,auth.user.id));
  statements.push(env.DB.prepare("INSERT INTO payroll_employer_payables120(company_id,run_id,component,payable_id,amount_cents,due_date,document_ref) VALUES(?,?,?,?,?,?,?)")
   .bind(companyId,runId,x.component,id,x.value,x.due,x.reference));
 }
 if(statements.length>220)fail120(d,'TRANSACTION_LIMIT','Partidas excedem limite transacional.');
 try{
  const outcome=await env.DB.batch(statements);
  if(outcome.some(x=>x.success===false))fail120(d,'TRANSACTION_FAILED','Falha nos lançamentos; confira o histórico.');
 }catch(e){
  if(/UNIQUE|FOREIGN KEY|constraint failed/i.test(String(e)))
   fail120(d,'DUPLICATE','Integração já executada ou origem alterada. Consulte os títulos e o diário.');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'INTEGRATE',
  entity:'payroll_employer_postings120',entityId:runId,
  after:{run_id:runId,journal_entry_id:built.entryId,total_cents:p.total_cents,
   payable_count:ids.length,components:items.map(x=>x.component),source_fingerprint:p.source_fingerprint}});
 return {integrated:true,run_id:runId,journal_entry_id:built.entryId,payable_ids:ids,
  payable_count:ids.length,total_cents:p.total_cents,bank_paid:false,
  financial_generated:true,accounting_posted:true,fgts_duplicated:false};
}
