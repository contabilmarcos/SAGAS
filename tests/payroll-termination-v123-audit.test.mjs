import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollTerminationAudit123} from '../sagas-payroll-termination123-audit.js';
const source={
 id:'P123',company_id:'C',employee_id:'E1',termination_date:'2026-10-27',
 employee_name:'Ana',employee_active:0,employee_center:'CC1',employee_number:1,
 notice_kind:'INDEMNIFIED',gross_cents:500000,net_cents:450000,fgts_fine_cents:80000,
 payment_date:'2026-10-31',trct_reference:'TRCT',
 guide_reference:'FGTS-GUIDE',fgts_due_date:'2026-11-06',
 settlement_journal_id:'SETTLE',fgts_journal_id:'FINE',
 provision_journal_id:'USE',provision_posting_id:'PP',provision_cents:100000,
 employee_payable_id:'NET',fgts_payable_id:'FGTS',history_id:'H'};
function ctx123(options={}){
 const opts={...options},posted={...source,...opts.posted};
 const statements={
  net:{id:'NET',source_type:'PAYROLL_TERMINATION',source_id:'P123',supplier_id:'E1',
   amount_cents:450000,due_date:'2026-10-31',status:opts.netStatus||'OPEN'},
  fine:{id:'FGTS',source_type:'PAYROLL_TERMINATION_FGTS',source_id:'P123',supplier_id:'GOV',
   amount_cents:opts.fgtsAmount??80000,due_date:'2026-11-06',status:opts.fgtsStatus||'OPEN'},
  functional:{id:'H',situation:'DESLIGADO',effective_from:'2026-10-27'},
  provision:{kind:'USE',journal_entry_id:'USE',total_cents:100000},
  moves:{count:1,amount_cents:-100000,invalid_count:0}
 };
 const journal=kind=>{
  const value=kind==='SETTLE'?500000:kind==='FINE'?80000:100000;
  const sourceRef=kind==='SETTLE'?'TERMINATION_SETTLE:E1:2026-10-27':
   kind==='FINE'?'TERMINATION_FGTS_FINE:E1:2026-10-27':'TERMINATION_USE:E1:2026-10-27';
  return {status:opts.invalidJournal===kind?'VOID':'POSTED',source_module:'PAYROLL',
   source_reference:sourceRef,total_debit_cents:value,total_credit_cents:value};
 };
 const db={prepare(sql){return{bind(...args){return{
  async first(){
   if(sql.includes('FROM payroll_termination_postings123 p JOIN'))return posted;
   if(sql.includes('FROM payroll_employee_functional_history'))return statements.functional;
   if(sql.includes('FROM financial_payables'))return args[1]==='NET'?statements.net:statements.fine;
   if(sql.includes('FROM journal_entries'))return journal(args[1]);
   if(sql.includes('FROM payroll_provision_postings45'))return statements.provision;
   if(sql.includes('FROM payroll_provision_posted_movements45'))return statements.moves;
   throw Error('Unknown audit query '+sql.slice(0,100));
  },
  async all(){
   if(sql.includes('FROM journal_lines')){
    const entry=args[1],amount=entry==='SETTLE'?500000:entry==='FINE'?80000:100000;
    return {results:[{side:'D',cost_center_id:'CC1',amount_cents:amount},
     {side:'C',cost_center_id:'CC1',amount_cents:amount}]};
   }
   throw Error('Unknown all');
  }
 };}}}};
 return {env:{DB:db},companyId:'C',employeeId:'E1',auth:{user:{id:'reader'}},
  body:{employee_id:'E1',termination_date:'2026-10-27'},
  d:{requirePermission:async()=>{},HttpError:class extends Error{}}};
}
test('audit confirms three journals, two payable titles, employee inactive',async()=>{
 const a=await payrollTerminationAudit123(ctx123());
 assert.equal(a.integrated,true);assert.equal(a.verified,true);
 assert.equal(a.journal_ids.length,3);
 assert.equal(a.financial.fgts_payable_status,'OPEN');
 assert.equal(a.employee_situation,'DESLIGADO');
});
test('already paid titles can stay valid',async()=>{
 const a=await payrollTerminationAudit123(ctx123({netStatus:'PAID',fgtsStatus:'PAID'}));
 assert.equal(a.verified,true);
});
test('wrong FGTS liability blocks clean audit',async()=>{
 const a=await payrollTerminationAudit123(ctx123({fgtsAmount:70000}));
 assert.equal(a.verified,false);assert.ok(a.problems.some(x=>x.code==='FGTS_PAYABLE_INVALID'));
});
test('voided journal is detected after closing',async()=>{
 const a=await payrollTerminationAudit123(ctx123({invalidJournal:'FINE'}));
 assert.equal(a.verified,false);assert.ok(a.problems.some(x=>x.code==='JOURNAL_FGTS_FINE_INVALID'));
});
test('employee unexpectedly reactivated is detected',async()=>{
 const a=await payrollTerminationAudit123(ctx123({posted:{employee_active:1}}));
 assert.equal(a.verified,false);assert.ok(a.problems.some(x=>x.code==='EMPLOYEE_ACTIVE'));
});
