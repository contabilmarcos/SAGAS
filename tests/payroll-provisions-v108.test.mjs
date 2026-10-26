import test from 'node:test';
import assert from 'node:assert/strict';
import { payrollProvisionEligibility42, payrollProvisions42 } from '../sagas-payroll-provisions42.js';

const employee=(admission_date,paid_salary_cents,extra=[])=>({
 employee_id:'e1',employee_code:'00001',employee_name:'Funcionaria',
 cost_center_id:'cc1',cost_center_code:'001',lines:[
 {event_code:'SALARIO_BASE',line_type:'PROVENTO',amount_cents:paid_salary_cents},...extra
]});
function mock({admission='2026-10-17',salary=300000,paid=145161,changes=[],occurrences=[],mode='CALENDAR'}={}){
 const run={id:'run1',competence:'2026-10',revision:1,status:'APPROVED',source_fingerprint:'snapshot1'};
 const d={
  HttpError:class extends Error{},
  requirePermission:async()=>{},
  payrollMonthlyRunDetail35:async()=>({run,envelopes:[employee(admission,paid)]}),
  payrollMonthlyConference36:async()=>({approved:true,review:{closed_at:'2026-10-26'},problems:[]}),
  readEmployerSettings:async()=>({settings:{cpp_due:'NAO',rat_due:'NAO',thirds_due:'NAO',
   cpp_bp:0,rat_bp:0,fap_10000:10000,thirds_bp:0,revision:1,effective_from:'2026-01'}}),
  hash:async obj=>JSON.stringify(obj)
 };
 const DB={prepare(sql){
  return {bind(){
   return {
    all:async()=>{
     if(sql.includes('FROM payroll_employees e WHERE'))return {results:[{id:'e1',admission_date:admission,contractual_salary_cents:salary}]};
     if(sql.includes('FROM payroll_salary_history WHERE'))return {results:changes.map(d=>({employee_id:'e1',effective_from:d}))};
     if(sql.includes('FROM payroll_employee_occurrences WHERE'))return {results:occurrences.map(kind=>({employee_id:'e1',kind,entries:1}))};
     throw Error('SQL inesperado: '+sql);
    },
    first:async()=>{
     if(sql.includes('FROM payroll_admission_proration46'))return {mode};
     throw Error('SQL first inesperado: '+sql);
    }
   };
  }};
 }};
 return payrollProvisions42({env:{DB},companyId:'company1',auth:{user:{id:'u1'}},runId:'run1',d});
}
test('regra de 15 dias e limites de competencia',()=>{
 assert.deepEqual(payrollProvisionEligibility42('2026-10-17','2026-10'),{days:15,eligible:true,month_of_admission:true});
 assert.deepEqual(payrollProvisionEligibility42('2026-10-18','2026-10'),{days:14,eligible:false,month_of_admission:true});
 assert.deepEqual(payrollProvisionEligibility42('2028-02-15','2028-02'),{days:15,eligible:true,month_of_admission:true});
 assert.deepEqual(payrollProvisionEligibility42('2028-02-16','2028-02'),{days:14,eligible:false,month_of_admission:true});
});
test('admitido com 15 dias recebe avo sobre salario contratual, nao proporcional pago',async()=>{
 const result=await mock();
 const item=result.items[0];
 assert.equal(result.kind,'PROVISOES_MENSAIS_PREVIA_108');
 assert.equal(item.eligible_days,15);
 assert.equal(item.salary_base_cents,300000);
 assert.equal(item.payroll_salary_snapshot_cents,145161);
 assert.equal(item.vacation_cents,25000);
 assert.equal(item.vacation_third_cents,8333);
 assert.equal(item.thirteenth_cents,25000);
 assert.equal(result.unresolved_employee_count,0);
 assert.ok(result.fingerprint);
});
test('admitido com 14 dias nao recebe avo na competencia de admissao',async()=>{
 const result=await mock({admission:'2026-10-18',salary:300000,paid:135484});
 assert.equal(result.items[0].counts_for_13th,false);
 assert.equal(result.items[0].vacation_cents,0);
 assert.equal(result.items[0].thirteenth_cents,0);
 assert.equal(result.ineligible_15_day_count,1);
});
test('alteracao salarial posterior a admissao exige revisao',async()=>{
 const result=await mock({changes:['2026-10-17','2026-10-25']});
 assert.equal(result.unresolved_employee_count,1);
 assert.ok(result.items[0].flags.some(x=>x.includes('Mudanca salarial')));
});
test('afastamento ou ferias impedem constituicao automatica da provisao',async()=>{
 const result=await mock({occurrences:['AFASTAMENTO']});
 assert.equal(result.unresolved_employee_count,1);
 assert.ok(result.items[0].flags.some(x=>x.includes('Ocorrencias')));
});
test('historico de salario diferente do envelope bloqueia contabilizacao',async()=>{
 const result=await mock({salary:400000,paid:145161});
 assert.equal(result.unresolved_employee_count,1);
 assert.ok(result.items[0].flags.some(x=>x.includes('Salario pago nao coincide')));
});
