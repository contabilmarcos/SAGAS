import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollLiveAudit124} from '../sagas-payroll-live-audit124.js';
function make124({tables=[],data={},journal={},lines={},run=null,payable={}}={}){
 const sqlLog=[];
 const db={prepare(sql){
  if(!sql.trim().toUpperCase().startsWith('SELECT'))throw Error('WRITE IN READ-ONLY AUDIT: '+sql);
  function all(args=[]){
   sqlLog.push({sql,args});
   if(sql.includes('FROM sqlite_master'))return {results:tables.map(name=>({name}))};
   if(sql.includes('FROM journal_lines'))return {results:lines[args[1]]||[]};
   const t=sql.match(/FROM\s+(\w+)\b/)?.[1];
   return {results:data[t]||[]};
  }
  function first(args=[]){
   sqlLog.push({sql,args});
   if(sql.includes('COUNT(*) AS qty FROM')){
    const t=sql.match(/FROM\s+(\w+)\s+WHERE/)?.[1];return {qty:(data[t]||[]).length};
   }
   if(sql.includes('FROM journal_entries'))return journal[args[1]]||null;
   if(sql.includes('FROM payroll_calc_runs'))return run;
   if(sql.includes('FROM financial_payables'))return payable[args[1]]||null;
   if(sql.includes('FROM payroll_provision_postings45'))return (data.payroll_provision_postings45||[]).find(x=>x.id===args[1])||null;
   return null;
  }
  return {all:async()=>all(),first:async()=>first(),bind:(...args)=>({all:async()=>all(args),first:async()=>first(args)})};
 }};
 return {db,sqlLog};
}
async function check(fixture,deny=false){
 const {db,sqlLog}=make124(fixture);
 let authCount=0;
 const result=await payrollLiveAudit124({
  env:{DB:db},companyId:'tenant-001',auth:{user:{id:'user'}},
  d:{requirePermission:async(_db,_user,_company,perm)=>{authCount++;
   if(deny&&perm==='financial.payable.read')throw Error('ACCESS_DENIED')}}
 });
 return {result,sqlLog,authCount};
}
const journal=(amount,source_reference='EMPLOYER120:R1')=>({status:'POSTED',source_reference,total_debit_cents:amount,total_credit_cents:amount,source_module:'PAYROLL'});
const entries=amount=>[{side:'D',cost_center_id:'CC1',cents:amount},{side:'C',cost_center_id:'CC1',cents:amount}];
test('no postings means no production homologation',async()=>{
 const {result,sqlLog,authCount}=await check({tables:['journal_entries','journal_lines','financial_payables']});
 assert.equal(result.read_only,true);assert.equal(result.integrity_result,'SEM_HISTORICO');
 assert.ok(result.missing_tables.length>0);assert.equal(authCount,2);
 assert.ok(sqlLog.every(x=>x.sql.startsWith('SELECT')));
});
test('requires payroll + financial access',async()=>{
 await assert.rejects(()=>check({},true),/ACCESS_DENIED/);
});
test('balanced posted employer journal is OK even when other modules uninitialized',async()=>{
 const {result}=await check({tables:['journal_entries','journal_lines','payroll_employer_postings120','payroll_employer_payables120','financial_payables'],
  data:{payroll_employer_postings120:[{run_id:'R1',journal_entry_id:'J1',amount_cents:150000,payable_count:1}],
    payroll_employer_payables120:[{payable_id:'P1',component:'CPP',target:'CPP',id:'P1',source_type:'PAYROLL_EMPLOYER',source_id:'R1:CPP',amount_cents:150000,status:'OPEN'}]},
  journal:{J1:journal(150000)},lines:{J1:entries(150000)}});
 assert.equal(result.modules.find(x=>x.kind==='ENCARGOS').status,'CONFERIDO');
 assert.equal(result.integrity_result,'CONFERENCIA_PARCIAL');
});
test('voided employer journal is flagged',async()=>{
 const {result}=await check({tables:['journal_entries','journal_lines','payroll_employer_postings120'],
  data:{payroll_employer_postings120:[{run_id:'R1',journal_entry_id:'J1',amount_cents:150000}]},
  journal:{J1:{...journal(150000),status:'VOID'}},lines:{J1:entries(150000)}});
 const e=result.modules.find(x=>x.kind==='ENCARGOS');
 assert.equal(e.status,'PENDENTE');assert.ok(e.problems.some(x=>x.code==='JOURNAL_HEADER'));
});
test('cost-center imbalance is flagged',async()=>{
 const unequal=[{side:'D',cost_center_id:'CC1',cents:150000},{side:'C',cost_center_id:'CC2',cents:150000}];
 const {result}=await check({tables:['journal_entries','journal_lines','payroll_employer_postings120'],
  data:{payroll_employer_postings120:[{run_id:'R1',journal_entry_id:'J1',amount_cents:150000}]},
  journal:{J1:journal(150000)},lines:{J1:unequal}});
 assert.ok(result.modules.find(x=>x.kind==='ENCARGOS').problems.some(x=>x.code==='JOURNAL_CENTER'));
});
test('only client-scoped read queries are run',async()=>{
 const {sqlLog}=await check({tables:['journal_entries','payroll_employer_postings120']});
 assert.ok(sqlLog.filter(x=>!x.sql.includes('sqlite_master')).every(x=>x.sql.includes('company_id')));
 assert.ok(sqlLog.every(x=>x.sql.trim().startsWith('SELECT')));
});

test('existing posting with missing financial dependency is PENDENTE, never CONFERIDO',async()=>{
 const {result}=await check({tables:['journal_entries','journal_lines','payroll_employer_postings120'],
  data:{payroll_employer_postings120:[{run_id:'R1',journal_entry_id:'J1',amount_cents:150000,payable_count:1}]},
  journal:{J1:journal(150000)},lines:{J1:entries(150000)}});
 const module=result.modules.find(x=>x.kind==='ENCARGOS');
 assert.equal(module.status,'PENDENTE');
 assert.ok(module.problems.some(x=>x.code==='DEPENDENCY_MISSING'));
});
test('journal from another origin is not accepted as employer posting',async()=>{
 const {result}=await check({tables:['journal_entries','journal_lines','payroll_employer_postings120','payroll_employer_payables120','financial_payables'],
  data:{payroll_employer_postings120:[{run_id:'R1',journal_entry_id:'J1',amount_cents:150000,payable_count:1}],
    payroll_employer_payables120:[{payable_id:'P1',component:'CPP',target:'CPP',id:'P1',source_type:'PAYROLL_EMPLOYER',source_id:'R1:CPP',amount_cents:150000,status:'OPEN'}]},
  journal:{J1:journal(150000,'MONTHLY:R1')},lines:{J1:entries(150000)}});
 const module=result.modules.find(x=>x.kind==='ENCARGOS');
 assert.equal(module.status,'PENDENTE');
 assert.ok(module.problems.some(x=>x.code==='JOURNAL_ORIGIN'));
});
test('13th: valid provision journals and employee payable are reconciled',async()=>{
 const {result}=await check({tables:['journal_entries','journal_lines','payroll_thirteenth_postings112',
   'payroll_thirteenth_runs71','payroll_thirteenth_payables112','financial_payables','payroll_provision_postings45'],
  data:{
   payroll_thirteenth_postings112:[{run_id:'T1',provision_posting_id:'P1',provision_journal_id:'J1',settlement_journal_id:'J2',provision_total_cents:50000,payable_total_cents:40000,payable_count:1}],
   payroll_thirteenth_payables112:[{payable_id:'F1',employee_id:'E1',target:'E1',id:'F1',source_type:'PAYROLL_THIRTEENTH',source_id:'T1:E1',amount_cents:40000,status:'OPEN'}],
   payroll_provision_postings45:[{id:'P1',kind:'USE',journal_entry_id:'J1',total_cents:50000}]
  },
  journal:{J1:journal(50000,'THIRTEENTH_SECOND_USE:T1'),J2:journal(40000,'THIRTEENTH_SECOND_SETTLE:T1')},
  lines:{J1:entries(50000),J2:entries(40000)}});
 const module=result.modules.find(x=>x.kind==='DECIMO_TERCEIRO');
 assert.equal(module.status,'CONFERIDO',JSON.stringify(module.problems));
});
test('13th: title value divergence is detected',async()=>{
 const {result}=await check({tables:['journal_entries','journal_lines','payroll_thirteenth_postings112',
   'payroll_thirteenth_runs71','payroll_thirteenth_payables112','financial_payables','payroll_provision_postings45'],
  data:{
   payroll_thirteenth_postings112:[{run_id:'T1',provision_posting_id:'P1',provision_journal_id:'J1',settlement_journal_id:'J2',provision_total_cents:50000,payable_total_cents:40000,payable_count:1}],
   payroll_thirteenth_payables112:[{payable_id:'F1',employee_id:'E1',target:'E1',id:'F1',source_type:'PAYROLL_THIRTEENTH',source_id:'T1:E1',amount_cents:35000,status:'OPEN'}],
   payroll_provision_postings45:[{id:'P1',kind:'USE',journal_entry_id:'J1',total_cents:50000}]
  },
  journal:{J1:journal(50000,'THIRTEENTH_SECOND_USE:T1'),J2:journal(40000,'THIRTEENTH_SECOND_SETTLE:T1')},
  lines:{J1:entries(50000),J2:entries(40000)}});
 const module=result.modules.find(x=>x.kind==='DECIMO_TERCEIRO');
 assert.equal(module.status,'PENDENTE');
 assert.ok(module.problems.some(x=>x.code==='THIRTEENTH_TITLES'));
});
