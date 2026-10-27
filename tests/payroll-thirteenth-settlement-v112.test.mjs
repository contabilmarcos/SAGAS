import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollThirteenth70} from '../sagas-payroll-thirteenth70.js';
import {payrollThirteenth112} from '../sagas-payroll-thirteenth112.js';

function setup(opts={}){
 const {balance=300000,posted=true,opening=false,wrongCC=false,wrongClearing=false,
   missingNature=false,existing=false,sourceChanged=false}=opts;
 const employee={id:'emp1',name:'Maria',admission_date:'2025-01-01',active:1,
  cost_center_id:'cc1',cost_center_code:'001',employee_number:1,salary_cents:300000,situation:'ATIVO'};
 const run={id:'run1',calendar_year:'2025',phase:'SECOND',revision:1,status:'APPROVED',
  employee_count:1,source_fingerprint:'not-set',gross_cents:300000,advance_cents:150000,
  inss_cents:26000,irrf_cents:5000,fgts_cents:12000,net_cents:119000};
 const envelope={employee_id:'emp1',employee_code:'00001',employee_name:'Maria',cost_center_id:'cc1',avos:12,
  salary_cents:300000,gross_cents:300000,advance_cents:150000,inss_cents:26000,
  irrf_cents:5000,fgts_cents:12000,net_cents:119000,snapshot_json:'{}'};
 const mapping=[['ADVANCE_OFFSET','advance'],['INSS_WITHHELD','inss'],
  ['IRRF_WITHHELD','irrf'],['NET_PAYABLE','net'],['FGTS_SECOND','fgts']]
  .filter(([c])=>!(missingNature&&c==='NET_PAYABLE'))
  .map(([component,nature_id])=>({component,nature_id,code:nature_id,description:component,active:1,synthetic_analytic:'ANALYTIC'}));
 const accounts={
  use:['provision-liability','13-clearing'],
  advance:[wrongClearing?'other-clearing':'13-clearing','advance-asset'],
  inss:['13-clearing','inss-liability'],irrf:['13-clearing','irrf-liability'],
  net:['13-clearing','net-liability'],
  fgts:['fgts-expense','fgts-liability']
 };
 const ledger=[{id:'mov1',employee_id:'emp1',component:'DECIMO_TERCEIRO',cost_center_id:wrongCC?'cc-other':'cc1',
  movement_kind:opening?'OPENING':'ACCRUAL',competence:'2025-11',
  amount_cents:balance,origin_key:'ACC:2025:11',posting_id:posted?'acc-post1':null,
  journal_status:posted?'POSTED':null}];
 const advance=[{id:'external1',employee_id:'emp1',amount_cents:150000,
  payment_date:'2025-10-20',document_ref:'COMP-EXTERNO-2025'}];
 const queries=[],batches=[],built=[],auditActions=[];
 const DB={prepare(sql){
  return {sql,bind(...params){
   const stmt={sql,params,all:async()=>{
    queries.push({sql,params});
    if(sql.includes('FROM payroll_thirteenth_envelopes71'))return {results:[envelope]};
    if(sql.includes('FROM payroll_employees e LEFT JOIN'))return {results:[employee]};
    if(sql.includes('FROM payroll_employee_occurrences'))return {results:[]};
    if(sql.includes('FROM payroll_movements m JOIN'))return {results:[]};
    if(sql.includes('FROM payroll_employee_dependents'))return {results:[]};
    if(sql.includes('FROM payroll_thirteenth_advances70 WHERE'))return {results:advance};
    if(sql.includes('FROM payroll_thirteenth_natures112'))return {results:mapping};
    if(sql.includes('FROM payroll_provision_movements43 m LEFT JOIN'))return {results:ledger};
    if(sql.includes('FROM budget_nature_accounts')){
     const [debit,credit]=accounts[params[1]]||[];
     return {results:debit?[{side:'D',account_id:debit,percentage:100,cost_center_id:null},
      {side:'C',account_id:credit,percentage:100,cost_center_id:null}]:[]};
    }
    throw Error('SQL all inesperado: '+sql);
   },first:async()=>{
    queries.push({sql,params});
    if(sql.includes('FROM payroll_thirteenth_runs71 WHERE company_id=? AND id=?'))return run;
    if(sql.includes('FROM payroll_thirteenth_runs71 WHERE company_id=? AND calendar_year'))return {id:'run1'};
    if(sql.includes('FROM payroll_finance_batches38'))return {batch_id:'batch1'};
    if(sql.includes('FROM payroll_provision_use_natures45'))return {nature_id:'use',code:'USE13',active:1,synthetic_analytic:'ANALYTIC'};
    if(sql.includes('FROM payroll_thirteenth_postings112 p LEFT JOIN'))
     return existing?{run_id:'run1',provision_journal_status:'POSTED',settlement_journal_status:'POSTED'}:null;
    if(sql.includes('FROM journal_batches'))return {id:'batch1',status:'OPEN'};
    if(sql.includes('FROM journal_entries'))return null;
    if(sql.includes('FROM cost_centers'))return {id:'cc1',code:'001',active:1};
    if(sql.includes('FROM accounts'))return {id:params[0]};
    throw Error('SQL first inesperado: '+sql);
   },run:async()=>({meta:{changes:1}})};
   return stmt;
  }};
 },batch:async stmts=>{batches.push(stmts);return stmts.map(x=>({success:true,meta:{changes:1}}))}};
 let seq=0;
 const d={
  HttpError:class HttpError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code}},
  requirePermission:async()=>{},ensureSchemaRevision:async()=>{},
  audit:async(_env,payload)=>auditActions.push(payload),
  uuid:()=> 'uid'+(++seq),
  hash:async obj=>JSON.stringify(obj),
  nextPayableNumber:async()=> 'CP-000001',
  taxes:()=>({inss_cents:26000,irrf_cents:5000,inss_table_from:'2025-01',irrf_table_from:'2025-05'}),
  buildEntry:async(_env,_auth,_company,body)=>{
   built.push(body);
   const debit=Math.round(body.lines.filter(x=>x.side==='D').reduce((t,x)=>t+Number(x.amount)*100,0));
   return {entryId:'journal-'+built.length,total_cents:debit,
    stmts:[{sql:'INSERT journal header '+built.length},{sql:'INSERT journal lines '+built.length}]};
  }
 };
 const c={env:{DB},companyId:'co1',auth:{user:{id:'u1'}},request:{},
  runId:'run1',year:'2025',phase:'SECOND',body:{},d};
 return {c,run,employee,ledger,queries,batches,built,auditActions,sourceChanged};
}
async function ready(opts){
 const x=setup(opts);
 const current=await payrollThirteenth70('preview',x.c);
 x.run.source_fingerprint=x.sourceChanged?'alterado':current.source_fingerprint;
 return x;
}
test('prévia: baixa da provisão sem nova despesa do 13º, tributos, adiantamento, FGTS e líquido',async()=>{
 const x=await ready(),p=await payrollThirteenth112('preview',x.c);
 assert.equal(p.ready,true);
 assert.equal(p.provision_debit_cents,300000);
 assert.equal(p.provision_credit_cents,300000);
 assert.equal(p.settlement_debit_cents,312000);
 assert.equal(p.settlement_credit_cents,312000);
 assert.equal(p.totals.inss_cents,26000);
 assert.equal(p.totals.irrf_cents,5000);
 assert.equal(p.totals.fgts_cents,12000);
 assert.equal(p.totals.advance_cents,150000);
 assert.equal(p.totals.net_cents,119000);
 assert.equal(p.payable_count,1);
 assert.equal(x.batches.length,0);
});
test('integração: dois diários, baixa provisão e título na mesma transação',async()=>{
 const x=await ready(),p=await payrollThirteenth112('preview',x.c);
 const result=await payrollThirteenth112('integrate',{...x.c,body:{
  confirmation:'INTEGRAR QUITACAO 13',source_fingerprint:p.source_fingerprint,posting_date:'2025-12-15'
 }});
 assert.equal(result.integrated,true);
 assert.equal(result.provision_use_cents,300000);
 assert.equal(result.payable_total_cents,119000);
 assert.equal(result.bank_paid,false);
 assert.equal(result.accounting_posted,true);
 assert.equal(x.built.length,2);
 assert.equal(x.built[0].source_reference,'THIRTEENTH_SECOND_USE:run1');
 assert.equal(x.built[1].source_reference,'THIRTEENTH_SECOND_SETTLE:run1');
 assert.equal(x.batches.length,1);
 const sql=x.batches[0].map(s=>s.sql);
 assert.ok(sql.some(s=>s.includes('payroll_provision_movements43')));
 assert.ok(sql.some(s=>s.includes('payroll_provision_posted_movements45')));
 assert.ok(sql.some(s=>s.includes('payroll_thirteenth_payables112')));
 assert.ok(sql.some(s=>s.includes("'PAYROLL_THIRTEENTH'")));
});
test('provisão insuficiente impede a quitação',async()=>{
 const x=await ready({balance:200000}),p=await payrollThirteenth112('preview',x.c);
 assert.equal(p.ready,false);
 assert.ok(p.problems.some(z=>z.code==='INSUFFICIENT_PROVISION'));
});
test('provisão operacional ainda não contabilizada impede quitação',async()=>{
 const x=await ready({posted:false}),p=await payrollThirteenth112('preview',x.c);
 assert.equal(p.ready,false);
 assert.ok(p.problems.some(z=>z.code==='PROVISION_NOT_POSTED'));
});
test('saldo de abertura sem vínculo contábil exige conferência própria',async()=>{
 const x=await ready({opening:true}),p=await payrollThirteenth112('preview',x.c);
 assert.equal(p.ready,false);
 assert.ok(p.problems.some(z=>z.code==='OPENING_UNVERIFIED'));
});
test('centro de custo diferente do histórico bloqueia baixa',async()=>{
 const x=await ready({wrongCC:true}),p=await payrollThirteenth112('preview',x.c);
 assert.equal(p.ready,false);
 assert.ok(p.problems.some(z=>z.code==='PROVISION_CENTER_CHANGED'));
});
test('natureza incompleta impede contabilização',async()=>{
 const x=await ready({missingNature:true}),p=await payrollThirteenth112('preview',x.c);
 assert.equal(p.ready,false);
 assert.ok(p.problems.some(z=>z.code==='NATURE_MISSING'));
});
test('conta credora da provisão diferente da liquidação impede saída de caixa fictícia',async()=>{
 const x=await ready({wrongClearing:true}),p=await payrollThirteenth112('preview',x.c);
 assert.equal(p.ready,false);
 assert.ok(p.problems.some(z=>z.code==='CLEARING_ACCOUNT_MISMATCH'));
});
test('duplicidade ou alteração de origem bloqueia segunda integração',async()=>{
 for(const opts of [{existing:true},{sourceChanged:true}]){
  const x=await ready(opts),p=await payrollThirteenth112('preview',x.c);
  assert.equal(p.ready,false);
  assert.ok(p.problems.some(z=>['ALREADY_INTEGRATED','SOURCE_CHANGED'].includes(z.code)));
 }
});
test('prévia desatualizada não grava títulos',async()=>{
 const x=await ready();
 await assert.rejects(()=>payrollThirteenth112('integrate',{...x.c,body:{
  confirmation:'INTEGRAR QUITACAO 13',source_fingerprint:'stale',posting_date:'2025-12-15'
 }}),e=>e.code==='PREVIEW_STALE');
 assert.equal(x.batches.length,0);
});
test('data fora de dezembro e confirmações incorretas são rejeitadas',async()=>{
 const x=await ready(),p=await payrollThirteenth112('preview',x.c);
 await assert.rejects(()=>payrollThirteenth112('integrate',{...x.c,body:{
  confirmation:'INTEGRAR QUITACAO 13',source_fingerprint:p.source_fingerprint,posting_date:'2025-11-30'
 }}),e=>e.code==='POSTING_DATE_INVALID');
 await assert.rejects(()=>payrollThirteenth112('integrate',{...x.c,body:{
  confirmation:'errado',source_fingerprint:p.source_fingerprint,posting_date:'2025-12-15'
 }}),e=>e.code==='CONFIRM_REQUIRED');
 assert.equal(x.batches.length,0);
});
