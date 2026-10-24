import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollAdmissionSalary46,payrollAdmissionHistory46} from '../sagas-payroll-admission46.js';

class DomainError extends Error {
 constructor(status,message,code){super(message);this.status=status;this.code=code;}
}
test('admissão proporcional por calendário em outubro',()=>{
 const value=payrollAdmissionSalary46(300000,'2026-10-06','2026-10','CALENDAR',DomainError);
 assert.equal(value.salary_cents,251613);
 assert.equal(value.worked_days,26);
 assert.equal(value.divisor,31);
});
test('admissão pelo mês comercial, conforme parâmetro RM',()=>{
 const value=payrollAdmissionSalary46(300000,'2026-10-06','2026-10','COMMERCIAL_30',DomainError);
 assert.equal(value.salary_cents,250000);
 assert.equal(value.worked_days,25);
 assert.equal(value.divisor,30);
});
test('mês integral continua sem proporcionalidade',()=>{
 assert.equal(payrollAdmissionSalary46(300000,'2026-01-01','2026-10',null,DomainError).salary_cents,300000);
 assert.equal(payrollAdmissionSalary46(300000,'2026-02-01','2026-02',null,DomainError).salary_cents,300000);
});
test('fevereiro: calendário e comercial divergem de forma explícita',()=>{
 assert.equal(payrollAdmissionSalary46(300000,'2026-02-02','2026-02','CALENDAR',DomainError).salary_cents,289286);
 assert.equal(payrollAdmissionSalary46(300000,'2026-02-02','2026-02','COMMERCIAL_30',DomainError).salary_cents,290000);
});
test('admissão sem configuração nunca assume divisor por padrão',()=>{
 assert.throws(()=>payrollAdmissionSalary46(300000,'2026-10-06','2026-10',null,DomainError),
  e=>e.code==='PRORATION_CONFIG_MISSING'&&e.status===409);
});
test('admissão em 31 em mês comercial exige conferência específica',()=>{
 assert.throws(()=>payrollAdmissionSalary46(300000,'2026-12-31','2026-12','COMMERCIAL_30',DomainError),
  e=>e.code==='PRORATION_DAY_31');
});
test('histórico vigente na admissão recuperado mesmo após o dia 1º',async()=>{
 const queries=[];
 const db={prepare(sql){return{bind(company,id,date){return {first:async()=>{
  queries.push({company,id,date,sql});
  if(sql.includes('payroll_salary_history'))return{employee_id:id,effective_from:date,salary_cents:300000};
  if(sql.includes('payroll_work_schedule_history'))return{employee_id:id,effective_from:date,monthly_hours_milli:220000};
  return {employee_id:id,effective_from:date,situation:'ATIVO'};
 }}}}}};
 const h={salary:new Map(),schedule:new Map(),functional:new Map(),
  changesSalary:new Map([['E1',[{effective_from:'2026-10-06'},{effective_from:'2026-10-20'}]]]),
  changesSchedule:new Map(),changesFunctional:new Map()};
 await payrollAdmissionHistory46({DB:db},'company',[{id:'E1',admission_date:'2026-10-06'}],
  '2026-10-01','2026-10-31',h,DomainError);
 assert.equal(queries.length,3);
 assert.equal(h.salary.get('E1')[0].salary_cents,300000);
 assert.deepEqual(h.changesSalary.get('E1'),[{effective_from:'2026-10-20'}]);
});
