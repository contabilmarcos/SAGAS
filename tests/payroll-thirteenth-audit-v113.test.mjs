import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollThirteenthAudit113} from '../sagas-payroll-thirteenth-audit113.js';

const TABLES=[
 'payroll_thirteenth_advances70','payroll_thirteenth_runs71','payroll_thirteenth_envelopes71',
 'payroll_thirteenth_postings111','payroll_thirteenth_payables111',
 'payroll_thirteenth_postings112','payroll_thirteenth_payables112',
 'payroll_provision_movements43','payroll_provision_postings45','payroll_provision_posted_movements45',
 'financial_payables','journal_entries','journal_lines','payroll_finance_batches38'
];
function fake({missing=[],posted=false,wrongPayable=false}={}){
 const calls=[],tables=new Set(TABLES.filter(x=>!missing.includes(x)));
 const run={id:'r1',calendar_year:'2026',phase:'FIRST',revision:1,
  source_fingerprint:'snapshot',status:'APPROVED',employee_count:1,
  gross_cents:300000,advance_cents:150000,inss_cents:0,irrf_cents:0,fgts_cents:12000,net_cents:150000};
 const env={DB:{prepare(sql){calls.push(sql);return {bind(...args){this.args=args;return this},
   first:async function(){
    if(sql.includes('FROM sqlite_master'))return tables.has(this.args[0])?{found:1}:null;
    if(sql.includes('FROM payroll_thirteenth_envelopes71'))return {
     count:1,gross:300000,advance:150000,inss:0,irrf:0,fgts:12000,net:150000
    };
    if(sql.includes('FROM payroll_thirteenth_postings111'))
     return posted?{run_id:'r1',journal_entry_id:'j1',source_fingerprint:'snapshot',
      payable_count:1,payable_total_cents:150000}:null;
    if(sql.includes('FROM journal_entries'))return {id:'j1',status:'POSTED',source_module:'PAYROLL',
     source_reference:'THIRTEENTH_FIRST:r1',total_debit_cents:162000,total_credit_cents:162000};
    if(sql.includes('FROM journal_lines'))return {debit:162000,credit:162000};
    if(sql.includes('FROM payroll_thirteenth_payables111'))return {
     link_count:1,payable_count:1,total_cents:wrongPayable?100000:150000,invalid_count:0
    };
    throw Error('SQL first inesperado '+sql);
   },
   all:async function(){
    if(sql.includes('FROM payroll_thirteenth_runs71'))return {results:[run]};
    throw Error('SQL all inesperado '+sql);
   },
   run:async()=>{throw Error('Auditoria não deve escrever dados')}
  }}},batch:async()=>{throw Error('Auditoria não deve executar batch')}};
 const perms=[],d={
  requirePermission:async(_env,_uid,_company,p)=>perms.push(p),
  HttpError:class HttpError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code}}
 };
 return {env,d,calls,perms,run:()=>payrollThirteenthAudit113({
  env,companyId:'c1',auth:{user:{id:'u1'}},year:'2026',d})};
}
test('diagnóstico não modifica o D1 e exige payroll.read',async()=>{
 const x=fake();
 const report=await x.run();
 assert.equal(report.read_only,true);
 assert.equal(report.checks[0].phase,'FIRST');
 assert.equal(report.checks[0].integrated,false);
 assert.equal(report.ready,false);
 assert.deepEqual(x.perms,['payroll.read']);
 assert.ok(x.calls.every(s=>/^\s*SELECT\b/i.test(s)));
});
test('ausência de tabelas retorna lista de migrações pendentes sem inventar lançamentos',async()=>{
 const x=fake({missing:['payroll_thirteenth_runs71']});
 const report=await x.run();
 assert.equal(report.ready,false);
 assert.ok(report.missing_tables.includes('payroll_thirteenth_runs71'));
 assert.ok(report.findings.some(f=>f.code==='MISSING_SCHEMA'));
});
test('confere diário e títulos já integrados',async()=>{
 const x=fake({posted:true});
 const r=await x.run();
 assert.equal(r.checks[0].integrated,true);
 assert.equal(r.checks[0].payables_count,1);
 assert.equal(r.findings.length,0);
 assert.equal(r.ready,false); // a segunda parcela não foi integrada
});
test('detecta título divergente mesmo com diário contabilizado',async()=>{
 const x=fake({posted:true,wrongPayable:true});
 const r=await x.run();
 assert.ok(r.findings.some(f=>f.code==='FINANCIAL_MISMATCH'));
});
test('ano inválido não consulta os registros',async()=>{
 const x=fake();
 await assert.rejects(()=>payrollThirteenthAudit113({
  env:x.env,companyId:'c1',auth:{user:{id:'u1'}},year:'2027',d:x.d
 }),e=>e.code==='YEAR_INVALID');
});
