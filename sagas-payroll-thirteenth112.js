// SAGAS folha v112 — quitacao do 13o com baixa da provisao e financeiro em UMA transacao.
// Diario A: debito provisao 13o, credito obrigacao de liquidacao.
// Diario B: debito obrigacao, credito adiantamento/INSS/IRRF/liquido, mais FGTS complementar.
// Nao contabiliza o custo do 13o novamente; apenas provisoes contabilizadas podem ser baixadas.
import {payrollThirteenth71} from './sagas-payroll-thirteenth71.js';
import {payrollThirteenth70} from './sagas-payroll-thirteenth70.js';

const COMPONENTS112={
 ADVANCE_OFFSET:'Compensação do adiantamento do 13º',
 INSS_WITHHELD:'INSS descontado no 13º',
 IRRF_WITHHELD:'IRRF descontido no 13º',
 NET_PAYABLE:'Líquido do 13º a pagar',
 FGTS_SECOND:'FGTS complementar do 13º'
};
function stop112(d,code,msg,status=409){throw new d.HttpError(status,msg,code)}
function amount112(n){return Number.isSafeInteger(Number(n))&&Number(n)>=0&&Number(n)<=99999999999}
function month112(y){return y+'-12'}
function money112(value){return (Number(value)/100).toFixed(2)}
async function schema112(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_thirteenth_natures112(company_id TEXT NOT NULL,component TEXT NOT NULL CHECK(component IN ('ADVANCE_OFFSET','INSS_WITHHELD','IRRF_WITHHELD','NET_PAYABLE','FGTS_SECOND')),nature_id TEXT NOT NULL REFERENCES budget_natures(id) ON DELETE RESTRICT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,component))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_thirteenth_postings112(run_id TEXT PRIMARY KEY REFERENCES payroll_thirteenth_runs71(id) ON DELETE RESTRICT,company_id TEXT NOT NULL,source_fingerprint TEXT NOT NULL,provision_posting_id TEXT NOT NULL REFERENCES payroll_provision_postings45(id) ON DELETE RESTRICT,provision_journal_id TEXT NOT NULL,settlement_journal_id TEXT NOT NULL,accounting_batch_id TEXT NOT NULL,provision_total_cents INTEGER NOT NULL CHECK(provision_total_cents>0),payable_count INTEGER NOT NULL CHECK(payable_count>0),payable_total_cents INTEGER NOT NULL CHECK(payable_total_cents>0),posted_by TEXT NOT NULL,posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,provision_journal_id),UNIQUE(company_id,settlement_journal_id))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_thirteenth_payables112(payable_id TEXT PRIMARY KEY REFERENCES financial_payables(id) ON DELETE RESTRICT,company_id TEXT NOT NULL,run_id TEXT NOT NULL REFERENCES payroll_thirteenth_runs71(id) ON DELETE RESTRICT,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,UNIQUE(company_id,run_id,employee_id))")
 ]);
}
async function maps112(env,companyId){
 return (await env.DB.prepare("SELECT m.component,m.nature_id,n.code,n.description,n.active,n.synthetic_analytic FROM payroll_thirteenth_natures112 m LEFT JOIN budget_natures n ON n.company_id=m.company_id AND n.id=m.nature_id WHERE m.company_id=? ORDER BY m.component").bind(companyId).all()).results||[];
}
function grouped112(lines){
 const map=new Map();
 for(const l of lines){
  if(!amount112(l.amount_cents)||!l.amount_cents)throw Error('Invalid journal line');
  const key=[l.component,l.side,l.account_id,l.cost_center_id,l.branch_id||'',l.history_template_id||''].join('|');
  if(map.has(key)){
   const prior=map.get(key);
   prior.amount_cents+=l.amount_cents;
   if(!Number.isSafeInteger(prior.amount_cents))throw Error('Overflow');
  }else map.set(key,{...l});
 }
 return [...map.values()];
}
async function configuredLines112(env,companyId,mapping,cc,amount,component,cache,problems){
 if(!amount)return [];
 if(!mapping||Number(mapping.active)!==1||mapping.synthetic_analytic!=='ANALYTIC'){
  problems.push({code:'MISSING_NATURE',message:'Configure natureza analítica ativa para '+component+'.'});
  return [];
 }
 if(!cc||Number(cc.active)!==1){
  problems.push({code:'INVALID_CENTER',message:'Centro de custo inválido para '+component+'.'});return [];
 }
 if(!cache.has(mapping.nature_id)){
  const defaults=(await env.DB.prepare("SELECT side,account_id,percentage,branch_id,cost_center_id,history_template_id FROM budget_nature_accounts WHERE company_id=? AND nature_id=? ORDER BY created_at,id")
   .bind(companyId,mapping.nature_id).all()).results||[];
  cache.set(mapping.nature_id,defaults);
 }
 const defs=cache.get(mapping.nature_id),out=[],accounts=new Map();
 for(const side of ['D','C']){
  const all=defs.filter(x=>x.side===side),specific=all.filter(x=>x.cost_center_id===cc.id);
  const chosen=specific.length?specific:all.filter(x=>!x.cost_center_id);
  const pct=chosen.map(x=>Number(x.percentage));
  if(!chosen.length||pct.some(x=>!Number.isFinite(x)||x<=0||x>100)||
    Math.abs(pct.reduce((x,y)=>x+y,0)-100)>0.0001){
   problems.push({code:'DEFAULT_INVALID',message:'Defaults de '+side+' da natureza '+mapping.code+' não totalizam 100% no CC '+cc.code+'.'});continue;
  }
  let applied=0;
  for(let i=0;i<chosen.length;i++){
   const def=chosen[i];
   const part=i===chosen.length-1?amount-applied:Math.round(amount*Number(def.percentage)/100);
   applied+=part;
   if(part<=0){problems.push({code:'SPLIT_ZERO',message:'Percentual da natureza gerou parcela nula no CC '+cc.code+'.'});continue}
   if(!accounts.has(def.account_id)){
    const acct=await env.DB.prepare("SELECT id FROM accounts WHERE id=? AND company_id=? AND analytic=1 AND active=1")
     .bind(def.account_id,companyId).first();
    accounts.set(def.account_id,!!acct);
   }
   if(!accounts.get(def.account_id)){problems.push({code:'ACCOUNT_INVALID',message:'Conta analítica inválida na natureza '+mapping.code+'.'});continue;}
   out.push({component,side,account_id:def.account_id,cost_center_id:cc.id,
    branch_id:def.branch_id||null,history_template_id:def.history_template_id||null,
    history_complement:'13º / '+component+' / CC '+cc.code,amount_cents:part});
  }
 }
 // Impede mapeamento que apenas debita e credita a mesma conta em 100%.
 if(out.length===2&&out[0].account_id===out[1].account_id)
  problems.push({code:'SAME_ACCOUNT',message:'Natureza '+mapping.code+' debita e credita a mesma conta no CC '+cc.code+'.'});
 return out;
}
async function preview112(c){
 const {env,companyId,d}=c,runId=String(c.runId||'');
 const detail=await payrollThirteenth71('detail',{...c,runId}),run=detail.run,problems=[];
 const block=(code,message)=>{if(!problems.some(x=>x.code===code&&x.message===message))problems.push({code,message})};
 if(run.phase!=='SECOND')block('WRONG_PHASE','Use a rotina da primeira parcela para o adiantamento.');
 if(run.status!=='APPROVED')block('NOT_APPROVED','A segunda parcela precisa estar aprovada.');
 if(!detail.employees.length||detail.employees.length>90)block('LIMIT','Esta integração exige de 1 a 90 funcionários.');
 const year=String(run.calendar_year),competence=month112(year);
 const [latest,config,batchSetting,useNature,existing,finance,written,journalA,journalB]=await Promise.all([
  env.DB.prepare("SELECT id FROM payroll_thirteenth_runs71 WHERE company_id=? AND calendar_year=? AND phase='SECOND' ORDER BY revision DESC LIMIT 1").bind(companyId,year).first(),
  maps112(env,companyId),
  env.DB.prepare("SELECT batch_id FROM payroll_finance_batches38 WHERE company_id=?").bind(companyId).first(),
  env.DB.prepare("SELECT m.nature_id,n.code,n.active,n.synthetic_analytic FROM payroll_provision_use_natures45 m LEFT JOIN budget_natures n ON n.id=m.nature_id AND n.company_id=m.company_id WHERE m.company_id=? AND m.component='DECIMO_TERCEIRO'").bind(companyId).first(),
  env.DB.prepare("SELECT p.*,j.status AS provision_journal_status,z.status AS settlement_journal_status FROM payroll_thirteenth_postings112 p LEFT JOIN journal_entries j ON j.id=p.provision_journal_id AND j.company_id=p.company_id LEFT JOIN journal_entries z ON z.id=p.settlement_journal_id AND z.company_id=p.company_id WHERE p.company_id=? AND p.run_id=?").bind(companyId,runId).first(),
  env.DB.prepare("SELECT id,status FROM journal_batches WHERE company_id=? AND id=(SELECT batch_id FROM payroll_finance_batches38 WHERE company_id=?)").bind(companyId,companyId).first(),
  env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference IN (?,?) LIMIT 1").bind(companyId,'THIRTEENTH_SECOND_USE:'+runId,'THIRTEENTH_SECOND_SETTLE:'+runId).first(),
  env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference=? LIMIT 1").bind(companyId,'THIRTEENTH_SECOND_USE:'+runId).first(),
  env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference=? LIMIT 1").bind(companyId,'THIRTEENTH_SECOND_SETTLE:'+runId).first()
 ]);
 if(latest?.id!==runId)block('OLD_REVISION','Somente a última revisão da segunda parcela pode ser integrada.');
 if(existing)block('ALREADY_INTEGRATED','Esta segunda parcela já foi integrada.');
 if(existing&&['provision_journal_status','settlement_journal_status'].some(k=>existing[k]!=='POSTED'))
  block('JOURNAL_CHANGED','Lançamento vinculado foi alterado ou anulado.');
 if(written||journalA||journalB)block('JOURNAL_EXISTS','Há diário anterior com esta origem. Concilie antes de repetir.');
 if(!finance||finance.status!=='OPEN'||!batchSetting?.batch_id||finance.id!==batchSetting.batch_id)
  block('BATCH_CLOSED','Configure lote contábil aberto para integração de 13º.');
 const mapByComponent=new Map(config.map(x=>[x.component,x]));
 if(!useNature||Number(useNature.active)!==1||useNature.synthetic_analytic!=='ANALYTIC')
  block('USE_NATURE_MISSING','Configure natureza de baixa da provisão DECIMO_TERCEIRO no Controle de Provisões.');
 for(const comp of Object.keys(COMPONENTS112)){
  const entry=mapByComponent.get(comp);
  if(!entry||Number(entry.active)!==1||entry.synthetic_analytic!=='ANALYTIC')
   block('NATURE_MISSING','Configure natureza analítica ativa para '+COMPONENTS112[comp]+'.');
 }
 let live=null;
 if(run.status==='APPROVED'){
  try{
   live=await payrollThirteenth70('preview',{...c,year,phase:'SECOND'});
   if(live.source_fingerprint!==run.source_fingerprint)
    block('SOURCE_CHANGED','Folha ou adiantamentos mudaram após a aprovação. Recalcule o 13º.');
   if(live.totals.blocked||live.problems.length)
    block('SOURCE_BLOCKED','A apuração da 2ª parcela possui pendências.');
  }catch(e){block('SOURCE_ERROR','Não foi possível validar a base atual: '+String(e.message||e).slice(0,160))}
 }
 const ids=detail.employees.map(x=>x.employee_id);
 const costCenters=new Map(),ledger=new Map();
 if(ids.length&&ids.length<=90){
  const rows=(await env.DB.prepare(
   "SELECT m.id,m.employee_id,m.cost_center_id,m.movement_kind,m.competence,m.amount_cents,m.origin_key,l.posting_id,j.status AS journal_status FROM payroll_provision_movements43 m LEFT JOIN payroll_provision_posted_movements45 l ON l.company_id=m.company_id AND l.movement_id=m.id LEFT JOIN payroll_provision_postings45 p ON p.company_id=l.company_id AND p.id=l.posting_id LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=p.company_id WHERE m.company_id=? AND m.component='DECIMO_TERCEIRO' AND m.competence<=? AND m.employee_id IN ("+ids.map(()=>'?').join(',')+") ORDER BY m.employee_id,m.competence,m.id LIMIT 3001"
  ).bind(companyId,competence,...ids).all()).results||[];
  if(rows.length>3000)block('LEDGER_LIMIT','Histórico de provisões extenso; faça a conciliação em lotes menores.');
  for(const row of rows){const list=ledger.get(row.employee_id)||[];list.push(row);ledger.set(row.employee_id,list)}
 }
 const centersCache=new Map(),defaultsCache=new Map(),journalProvision=[],journalSettlement=[],moves=[],employeeTotals=[];
 for(const e of detail.employees){
  if(!centersCache.has(e.cost_center_id)){
   const cc=e.cost_center_id?await env.DB.prepare("SELECT id,code,active FROM cost_centers WHERE company_id=? AND id=?").bind(companyId,e.cost_center_id).first():null;
   centersCache.set(e.cost_center_id,cc);
  }
  const center=centersCache.get(e.cost_center_id);
  if(!center||Number(center.active)!==1){block('BAD_CENTER','Centro de custo inválido para '+e.employee_name+'.');continue;}
  const n={gross:Number(e.gross_cents),advance:Number(e.advance_cents),
   inss:Number(e.inss_cents),irrf:Number(e.irrf_cents),net:Number(e.net_cents),fgts:Number(e.fgts_cents)};
  if(Object.values(n).some(x=>!amount112(x))||n.gross<=0||n.net<=0||
      n.gross!==n.advance+n.inss+n.irrf+n.net){
   block('ENVELOPE_MISMATCH','Valores do envelope não conciliam para '+e.employee_name+'.');continue;
  }
  const list=ledger.get(e.employee_id)||[],amount=list.reduce((sum,row)=>sum+Number(row.amount_cents),0);
  if(!Number.isSafeInteger(amount)){block('LEDGER_CORRUPT','Saldo monetário inválido da provisão de '+e.employee_name);continue;}
  if(list.some(x=>x.movement_kind==='OPENING'))
   block('OPENING_UNVERIFIED','Há saldo de abertura sem prova contábil vinculada para '+e.employee_name+'.');
  if(list.some(x=>!x.posting_id||x.journal_status!=='POSTED'))
   block('PROVISION_NOT_POSTED','Constituição ou baixa não contabilizada para '+e.employee_name+'.');
  if(list.some(x=>x.cost_center_id!==center.id))
   block('PROVISION_CENTER_CHANGED','Provisão em centro de custo diferente do cálculo aprovado: '+e.employee_name+'.');
  if(list.some(x=>String(x.origin_key||'').startsWith('THIRTEENTH112:')))
   block('PROVISION_ALREADY_USED','Já existe baixa de provisão de 13º por integração anterior: '+e.employee_name+'.');
  if(amount<n.gross)
   block('INSUFFICIENT_PROVISION','Provisão contabilizada insuficiente para '+e.employee_name+': saldo '+money112(Math.max(0,amount))+'; necessário '+money112(n.gross)+'.');
  if(!useNature||Number(useNature.active)!==1)continue;
  const start=problems.length;
  journalProvision.push(...await configuredLines112(env,companyId,useNature,center,n.gross,'DECIMO_TERCEIRO',defaultsCache,problems));
  for(const [component,value] of [
   ['ADVANCE_OFFSET',n.advance],['INSS_WITHHELD',n.inss],
   ['IRRF_WITHHELD',n.irrf],['NET_PAYABLE',n.net],['FGTS_SECOND',n.fgts]
  ])journalSettlement.push(...await configuredLines112(env,companyId,mapByComponent.get(component),center,value,component,defaultsCache,problems));
  if(problems.length!==start)block('MAPPING_INCOMPLETE','Mapeamento incompleto para '+e.employee_name+'.');
  employeeTotals.push({employee_id:e.employee_id,employee_code:e.employee_code,employee_name:e.employee_name,
   cost_center_id:center.id,provision_balance_cents:amount,provision_use_cents:n.gross,
   advance_cents:n.advance,net_cents:n.net,inss_cents:n.inss,irrf_cents:n.irrf,fgts_cents:n.fgts});
  moves.push({id:null,employee_id:e.employee_id,cost_center_id:center.id,
   amount_cents:n.gross,origin_key:'THIRTEENTH112:'+runId+':'+e.employee_id});
 }
 let linesA=[],linesB=[];
 try{linesA=grouped112(journalProvision);linesB=grouped112(journalSettlement)}
 catch(e){block('LINE_OVERFLOW','Valores de partidas ultrapassaram limites seguros.')}
 const sum=arr=>arr.reduce((a,b)=>a+Number(b.amount_cents),0);
 const sides=arr=>({debit:sum(arr.filter(x=>x.side==='D')),credit:sum(arr.filter(x=>x.side==='C'))});
 const a=sides(linesA),b=sides(linesB);
 const totals={provision_cents:employeeTotals.reduce((t,x)=>t+x.provision_use_cents,0),
  advance_cents:employeeTotals.reduce((t,x)=>t+x.advance_cents,0),
  inss_cents:employeeTotals.reduce((t,x)=>t+x.inss_cents,0),
  irrf_cents:employeeTotals.reduce((t,x)=>t+x.irrf_cents,0),
  fgts_cents:employeeTotals.reduce((t,x)=>t+x.fgts_cents,0),
  net_cents:employeeTotals.reduce((t,x)=>t+x.net_cents,0)};
 if(a.debit!==a.credit||a.debit!==totals.provision_cents||a.debit<=0)
  block('PROVISION_JOURNAL_UNBALANCED','Partidas de baixa das provisões não fecham com o bruto do 13º.');
 if(b.debit!==b.credit||b.debit!==totals.provision_cents+totals.fgts_cents)
  block('SETTLEMENT_JOURNAL_UNBALANCED','Partidas da liquidação não fecham com adiantamentos, impostos e líquido.');
 if(totals.provision_cents!==Number(run.gross_cents)||totals.net_cents!==Number(run.net_cents)||
    totals.advance_cents!==Number(run.advance_cents)||totals.inss_cents!==Number(run.inss_cents)||
    totals.irrf_cents!==Number(run.irrf_cents)||totals.fgts_cents!==Number(run.fgts_cents))
  block('TOTAL_CHANGED','Totais do lançamento não coincidem com revisão aprovada.');
 if(linesA.length>150||linesB.length>150||linesA.length+linesB.length+employeeTotals.length*2+8>220)
  block('TRANSACTION_LIMIT','Número de partidas ou títulos acima do limite seguro da transação D1.');
 if([a.debit,a.credit,b.debit,b.credit,...Object.values(totals)].some(x=>!amount112(x)))
  block('INVALID_TOTAL','Somatório dos lançamentos fora do limite seguro.');
 const sourceFingerprint=await d.hash({version:112,run_id:runId,run_source:run.source_fingerprint,
  batch_id:finance?.id||null,config,useNature,
  employees:employeeTotals,ledger:[...ledger.entries()].map(([employee_id,items])=>({employee_id,items:items.map(x=>[x.id,x.amount_cents,x.posting_id,x.journal_status,x.cost_center_id])})),
  a:linesA,b:linesB,existing:existing?.run_id||null});
 return {kind:'THIRTEENTH_SECOND_INTEGRATION_V112',run_id:runId,year,competence,phase:run.phase,
  ready:!problems.length,posted:!!existing,problems,source_fingerprint:sourceFingerprint,
  batch_id:finance?.id||null,provision_nature:useNature,mappings:config,employees:employeeTotals,
  provision_lines:linesA,settlement_lines:linesB,provision_debit_cents:a.debit,
  provision_credit_cents:a.credit,settlement_debit_cents:b.debit,settlement_credit_cents:b.credit,
  totals,payable_count:employeeTotals.filter(x=>x.net_cents>0).length,existing,read_only:true,
  notes:[
   'Diário 1: débito provisão de 13º e crédito obrigação de liquidação; não reconhece despesa novamente.',
   'Diário 2: débito obrigação, crédito adiantamento, INSS, IRRF e líquido; FGTS residual em custo e obrigação.',
   'A contabilização da provisão exige constituições já lançadas e saldo suficiente por empregado/CC.',
   'Os dois diários, as baixas do saldo de provisões e os títulos são criados na mesma transação do D1.',
   'O título é uma obrigação ainda não paga: a baixa bancária exige procedimento financeiro separado.',
   'Não gera automaticamente guias de FGTS, INSS, IRRF ou seus pagamentos.'
  ]};
}
export async function payrollThirteenth112(action,c){
 const {env,companyId,auth,body={},request,d}=c;
 await d.ensureSchemaRevision(env,'payroll-thirteenth-second112',1,()=>schema112(env));
 if(['settings','save'].includes(action)){
  await d.requirePermission(env,auth.user.id,companyId,action==='save'?'payroll.manage':'payroll.read');
  if(action==='settings')return {components:COMPONENTS112,mappings:await maps112(env,companyId)};
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
  const component=String(body.component||''),natureId=String(body.nature_id||'');
  if(!Object.prototype.hasOwnProperty.call(COMPONENTS112,component))
   stop112(d,'COMPONENT_INVALID','Componente de integração inválido.',400);
  const valid=await env.DB.prepare("SELECT id FROM budget_natures WHERE company_id=? AND id=? AND active=1 AND synthetic_analytic='ANALYTIC'").bind(companyId,natureId).first();
  if(!valid)stop112(d,'NATURE_INVALID','Natureza orçamentária não é analítica, ativa e da empresa.',400);
  await env.DB.prepare("INSERT INTO payroll_thirteenth_natures112(company_id,component,nature_id,updated_by) VALUES (?,?,?,?) ON CONFLICT(company_id,component) DO UPDATE SET nature_id=excluded.nature_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP")
   .bind(companyId,component,natureId,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'UPDATE',entity:'payroll_thirteenth_natures112',entityId:component,after:{nature_id:natureId}});
  return {saved:true,mappings:await maps112(env,companyId)};
 }
 await d.requirePermission(env,auth.user.id,companyId,action==='integrate'?'payroll.manage':'payroll.read');
 if(action==='integrate'){
  for(const permission of ['accounting.entry.create','accounting.entry.post','financial.payable.manage'])
   await d.requirePermission(env,auth.user.id,companyId,permission);
 }
 const current=await preview112(c);
 if(action==='preview')return current;
 if(action!=='integrate')stop112(d,'ACTION_INVALID','Ação inválida.',404);
 if(body.confirmation!=='INTEGRAR QUITACAO 13')stop112(d,'CONFIRM_REQUIRED','Digite INTEGRAR QUITACAO 13.',400);
 if(current.source_fingerprint!==body.source_fingerprint)
  stop112(d,'PREVIEW_STALE','A prévia mudou; confira novamente as provisões e descontos.');
 if(!current.ready)stop112(d,'INTEGRATION_BLOCKED',current.problems[0]?.message||'Existem pendências.');
 const date=String(body.posting_date||''),year=current.year;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
   !Number.isFinite(Date.parse(date+'T00:00:00Z'))||
   new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||
   date<year+'-12-01'||date>year+'-12-31'||date>new Date().toISOString().slice(0,10))
  stop112(d,'POSTING_DATE_INVALID','Informe data de dezembro do ano do 13º, não futura.',400);
 const refA='THIRTEENTH_SECOND_USE:'+current.run_id,refB='THIRTEENTH_SECOND_SETTLE:'+current.run_id;
 const duplicates=(await env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference IN (?,?) LIMIT 1").bind(companyId,refA,refB).first());
 if(duplicates)stop112(d,'JOURNAL_ALREADY_EXISTS','Uma contabilização com esta origem já existe.');
 const payableBase=await d.nextPayableNumber(env,companyId);
 const start=Number(String(payableBase).slice(3));
 if(!Number.isSafeInteger(start)||start<1||start+current.payable_count-1>999999)
  stop112(d,'PAYABLE_NUMBER_LIMIT','Numeração de contas a pagar fora do limite.');
 const entryA=await d.buildEntry(env,auth,companyId,{
  batch_id:current.batch_id,entry_date:date,document_number:'13-PROV-'+year,
  description:'Baixa da provisão na quitação do 13º '+year,source_module:'PAYROLL',source_reference:refA,
  lines:current.provision_lines.map(x=>({side:x.side,account_id:x.account_id,amount:money112(x.amount_cents),
   cost_center_id:x.cost_center_id,branch_id:x.branch_id,history_template_id:x.history_template_id,history_complement:x.history_complement}))
 });
 const entryB=await d.buildEntry(env,auth,companyId,{
  batch_id:current.batch_id,entry_date:date,document_number:'13-QUIT-'+year,
  description:'Quitação do 13º '+year+' e FGTS residual',source_module:'PAYROLL',source_reference:refB,
  lines:current.settlement_lines.map(x=>({side:x.side,account_id:x.account_id,amount:money112(x.amount_cents),
   cost_center_id:x.cost_center_id,branch_id:x.branch_id,history_template_id:x.history_template_id,history_complement:x.history_complement}))
 });
 if(Number(entryA.total_cents)!==current.provision_debit_cents||
    Number(entryB.total_cents)!==current.settlement_debit_cents)
  stop112(d,'ENTRY_MISMATCH','Lançamentos montados divergem da prévia.');
 const postedId=d.uuid(),stmts=[...entryA.stmts,...entryB.stmts];
 stmts.push(env.DB.prepare("INSERT INTO payroll_provision_postings45(id,company_id,kind,competence,cycle_id,source_fingerprint,journal_entry_id,accounting_batch_id,total_cents,line_count,posted_by) VALUES (?,?,'USE',?,NULL,?,?,?,?,?,?)")
  .bind(postedId,companyId,current.competence,current.source_fingerprint,entryA.entryId,current.batch_id,
   current.totals.provision_cents,current.provision_lines.length,auth.user.id));
 const moves=current.employees.map(x=>({id:d.uuid(),employee_id:x.employee_id,cost_center_id:x.cost_center_id,
  amount_cents:x.provision_use_cents,origin_key:'THIRTEENTH112:'+current.run_id+':'+x.employee_id}));
 stmts.push(env.DB.prepare(
  "INSERT INTO payroll_provision_movements43(id,company_id,employee_id,cost_center_id,component,movement_kind,competence,amount_cents,origin_key,document_ref,notes,cycle_id,created_by) SELECT json_extract(x.value,'$.id'),?,json_extract(x.value,'$.employee_id'),json_extract(x.value,'$.cost_center_id'),'DECIMO_TERCEIRO','USE',?,-json_extract(x.value,'$.amount_cents'),json_extract(x.value,'$.origin_key'),?,'Baixa de provisão vinculada à quitação do 13º',NULL,? FROM json_each(?) x WHERE COALESCE((SELECT SUM(m.amount_cents) FROM payroll_provision_movements43 m WHERE m.company_id=? AND m.employee_id=json_extract(x.value,'$.employee_id') AND m.component='DECIMO_TERCEIRO' AND m.competence<=?),0)>=json_extract(x.value,'$.amount_cents')"
 ).bind(companyId,current.competence,'13-QUIT-'+year,auth.user.id,JSON.stringify(moves),companyId,current.competence));
 stmts.push(env.DB.prepare(
  "INSERT INTO payroll_provision_posted_movements45(company_id,movement_id,posting_id) SELECT ?,json_extract(x.value,'$.id'),? FROM json_each(?) x"
 ).bind(companyId,postedId,JSON.stringify(moves)));
 let idx=0;
 for(const x of current.employees){
  if(!x.net_cents)continue;
  const title=d.uuid();
  stmts.push(env.DB.prepare("INSERT INTO financial_payables(id,company_id,number,supplier_id,source_type,source_id,issue_date,due_date,document_number,description,amount_cents,balance_cents,status,created_by) VALUES (?,?,?,?,'PAYROLL_THIRTEENTH',?,?,?,?,?,?,?,'OPEN',?)")
   .bind(title,companyId,'CP-'+String(start+idx).padStart(6,'0'),x.employee_id,
    current.run_id+':'+x.employee_id,date,year+'-12-20','13-QUIT-'+year,
    'Quitação 13º '+year+' — '+(x.employee_code||'')+' '+x.employee_name,x.net_cents,x.net_cents,auth.user.id));
  stmts.push(env.DB.prepare("INSERT INTO payroll_thirteenth_payables112(payable_id,company_id,run_id,employee_id) VALUES (?,?,?,?)")
   .bind(title,companyId,current.run_id,x.employee_id));
  idx++;
 }
 stmts.push(env.DB.prepare("INSERT INTO payroll_thirteenth_postings112(run_id,company_id,source_fingerprint,provision_posting_id,provision_journal_id,settlement_journal_id,accounting_batch_id,provision_total_cents,payable_count,payable_total_cents,posted_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
  .bind(current.run_id,companyId,current.source_fingerprint,postedId,entryA.entryId,entryB.entryId,
   current.batch_id,current.totals.provision_cents,idx,current.totals.net_cents,auth.user.id));
 if(idx!==current.payable_count||stmts.length>220)
  stop112(d,'TRANSACTION_LIMIT','Títulos ou partidas ultrapassaram o limite transacional.');
 try{
  const outcome=await env.DB.batch(stmts);
  if(outcome.some(x=>!x.success)||
    Number(outcome[entryA.stmts.length+entryB.stmts.length+1]?.meta?.changes)!==moves.length)
   stop112(d,'POSTING_INCOMPLETE','Conferência transacional dos saldos e baixas falhou. Verifique a origem.');
 }catch(e){
  if(/UNIQUE|FOREIGN KEY|constraint failed/i.test(String(e)))
   stop112(d,'CONCURRENT_POST','A folha ou provisão foi integrada por outra operação. Consulte a origem.');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'INTEGRATE',entity:'payroll_thirteenth_postings112',
  entityId:current.run_id,after:{provision_journal_id:entryA.entryId,settlement_journal_id:entryB.entryId,
   employee_count:idx,provision_cents:current.totals.provision_cents,net_cents:current.totals.net_cents}});
 return {integrated:true,run_id:current.run_id,provision_posting_id:postedId,
  provision_journal_id:entryA.entryId,settlement_journal_id:entryB.entryId,payable_count:idx,
  payable_total_cents:current.totals.net_cents,provision_use_cents:current.totals.provision_cents,
  bank_paid:false,financial_generated:true,accounting_posted:true};
}