import test from 'node:test';
import assert from 'node:assert/strict';
import { payrollThirteenth111 } from '../sagas-payroll-thirteenth111.js';
import { payrollThirteenth70 } from '../sagas-payroll-thirteenth70.js';

function harness({missingFgts=false,external=false,alreadyPosted=false,badAccount=false}={}){
 const staff={id:'emp1',name:'Funcionário',admission_date:'2026-01-01',active:1,
  cost_center_id:'cc1',cost_center_code:'01',employee_number:1,
  salary_cents:300000,situation:'ATIVO'};
 const run={id:'run1',company_id:'company1',calendar_year:'2026',phase:'FIRST',revision:1,
  status:'APPROVED',source_fingerprint:null,employee_count:1,
  gross_cents:300000,advance_cents:150000,inss_cents:0,irrf_cents:0,
  fgts_cents:12000,net_cents:150000};
 const envelope={employee_id:'emp1',employee_code:'00001',employee_name:'Funcionário',
  cost_center_id:'cc1',avos:12,salary_cents:300000,gross_cents:300000,
  advance_cents:150000,inss_cents:0,irrf_cents:0,fgts_cents:12000,
  net_cents:150000,snapshot_json:'{}'};
 const natures=[{component:'FIRST_ADVANCE',nature_id:'n1',code:'1',description:'Adiantamento',active:1,synthetic_analytic:'ANALYTIC'},
  ...(!missingFgts?[{component:'FIRST_FGTS',nature_id:'n2',code:'2',description:'FGTS',active:1,synthetic_analytic:'ANALYTIC'}]:[])];
 const executed=[],queries=[],journalInputs=[],permissions=[];
 const DB={prepare(sql){
  return {bind(...params){
   queries.push({sql,params});
   const stmt={
    first:async()=>{
     if(sql.includes('SELECT COUNT(l.payable_id) AS link_count'))return {link_count:1,valid_count:1,total_cents:150000,invalid_count:0};
     if(sql.includes('FROM payroll_thirteenth_runs71 WHERE company_id=? AND id=?'))return run;
     if(sql.includes('FROM payroll_finance_batches38'))return {batch_id:'batch1'};
     if(sql.includes('FROM payroll_thirteenth_postings111')&&sql.includes('LEFT JOIN journal_entries'))
      return alreadyPosted?{run_id:'run1',journal_entry_id:'journal1',journal_status:'POSTED',payable_count:1,payable_total_cents:150000}:null;
     if(sql.includes('FROM payroll_thirteenth_runs71 WHERE company_id=? AND calendar_year'))return {id:'run1'};
     if(sql.includes('FROM journal_batches'))return {id:'batch1',status:'OPEN'};
     if(sql.includes('FROM cost_centers'))return {id:'cc1',code:'01',active:1};
     if(sql.includes('FROM accounts'))return badAccount?null:{id:params[1]};
     if(sql.includes('FROM journal_entries WHERE'))return null;
     if(sql.includes('FROM payroll_thirteenth_postings111 WHERE'))return alreadyPosted?{run_id:'run1'}:null;
     throw Error('SQL first desconhecido: '+sql);
    },
    all:async()=>{
     if(sql.includes('FROM payroll_thirteenth_envelopes71'))return {results:[envelope]};
     if(sql.includes('FROM payroll_employees e LEFT JOIN'))return {results:[staff]};
     if(sql.includes('FROM payroll_employee_occurrences'))return {results:[]};
     if(sql.includes('FROM payroll_movements m JOIN'))return {results:[]};
     if(sql.includes('FROM payroll_employee_dependents'))return {results:[]};
     if(sql.includes('FROM payroll_thirteenth_advances70 WHERE'))return {results:external?[{employee_id:'emp1',id:'ext1',amount_cents:150000}]:[]};
     if(sql.includes('FROM payroll_thirteenth_natures111'))return {results:natures};
     if(sql.includes('FROM budget_nature_accounts')){
      const nature=params[1];
      return {results:[
       {side:'D',account_id:nature==='n1'?'ad-asset':'fgts-expense',percentage:100,branch_id:null,cost_center_id:null},
       {side:'C',account_id:nature==='n1'?'ad-payable':'fgts-payable',percentage:100,branch_id:null,cost_center_id:null}
      ]};
     }
     throw Error('SQL all desconhecido: '+sql);
    },
    run:async()=>({meta:{changes:1}})
   };
   return stmt;
  }};
 },batch:async statements=>{executed.push(statements);return statements.map(()=>({success:true}))}};
 const d={
  HttpError:class HttpError extends Error{
   constructor(status,message,code){super(message);this.status=status;this.code=code}
  },
  requirePermission:async(_env,_user,_company,permission)=>{permissions.push(permission)},
  ensureSchemaRevision:async()=>{},audit:async()=>{},
  uuid:()=> 'generated-id-'+queries.length,
  nextPayableNumber:async()=> 'CP-000001',
  hash:async data=>JSON.stringify(data),
  buildEntry:async(_env,_auth,_company,payload)=>{
   journalInputs.push(payload);
   return {entryId:'journal-new',total_cents:162000,stmts:[{journal:'entry'},{journal:'lines'}]};
  },
  taxes:()=>({inss_cents:0,irrf_cents:0,fgts_cents:0})
 };
 const ctx={env:{DB},companyId:'company1',auth:{user:{id:'user1'}},
  request:{},runId:'run1',year:'2026',phase:'FIRST',d};
 return {ctx,run,envelope,executed,queries,journalInputs,permissions};
}
async function prepared(options={}){
 const x=harness(options);
 const preview=await payrollThirteenth70('preview',x.ctx);
 x.run.source_fingerprint=preview.source_fingerprint;
 return x;
}
test('partidas D/C por natureza e CC, 1 título por empregado',async()=>{
 const x=await prepared();
 const result=await payrollThirteenth111('preview',x.ctx);
 assert.equal(result.ready,true);
 assert.equal(result.journal_debit_cents,162000);
 assert.equal(result.journal_credit_cents,162000);
 assert.equal(result.payable_total_cents,150000);
 assert.equal(result.payable_count,1);
 assert.equal(result.lines.length,4);
 assert.deepEqual(new Set(result.lines.map(l=>l.cost_center_id)),new Set(['cc1']));
 assert.equal(x.executed.length,0);
});
test('integra em uma transação título e diário sem pagar banco',async()=>{
 const x=await prepared();
 const preview=await payrollThirteenth111('preview',x.ctx);
 const result=await payrollThirteenth111('integrate',{...x.ctx,body:{
  confirmation:'INTEGRAR ADIANTAMENTO 13',
  source_fingerprint:preview.source_fingerprint,posting_date:'2026-10-20'
 }});
 assert.equal(result.integrated,true);
 assert.equal(result.payable_total_cents,150000);
 assert.equal(result.bank_paid,false);
 assert.equal(result.accounting_posted,true);
 assert.equal(x.executed.length,1);
 assert.equal(x.executed[0].length,5);
 assert.equal(x.journalInputs[0].source_reference,'THIRTEENTH_FIRST:run1');
 assert.ok(x.queries.some(q=>q.sql.includes("'PAYROLL_THIRTEENTH'")));
 assert.ok(x.permissions.includes('financial.payable.manage'));
});
test('natureza de FGTS ausente bloqueia integração',async()=>{
 const x=await prepared({missingFgts:true});
 const result=await payrollThirteenth111('preview',x.ctx);
 assert.equal(result.ready,false);
 assert.ok(result.problems.some(p=>p.code==='NATURE_REQUIRED'));
});
test('comprovante de pagamento externo bloqueia criação de títulos',async()=>{
 const x=await prepared({external:true});
 const result=await payrollThirteenth111('preview',x.ctx);
 assert.equal(result.ready,false);
 assert.ok(result.problems.some(p=>p.code==='EXTERNAL_ADVANCE'));
});
test('conta inválida e integração já gravada bloqueiam nova postagem',async()=>{
 for(const opts of [{badAccount:true},{alreadyPosted:true}]){
  const x=await prepared(opts);
  const preview=await payrollThirteenth111('preview',x.ctx);
  assert.equal(preview.ready,false);
  assert.ok(preview.problems.some(p=>['ALREADY_POSTED','ACCOUNT_MAPPING'].includes(p.code)));
 }
});
test('confirmação e data contábil são obrigatórias',async()=>{
 const x=await prepared();
 const p=await payrollThirteenth111('preview',x.ctx);
 await assert.rejects(()=>payrollThirteenth111('integrate',{...x.ctx,body:{
  confirmation:'INTEGRAR ADIANTAMENTO 13',source_fingerprint:p.source_fingerprint,
  posting_date:'2027-01-01'
 }}),e=>e.code==='POSTING_DATE_INVALID');
 assert.equal(x.executed.length,0);
});
