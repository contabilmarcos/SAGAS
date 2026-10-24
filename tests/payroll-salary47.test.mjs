import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollSalaryAmount47,payrollSalaryHistory47} from '../sagas-payroll-salary47.js';
import {payrollAdmissionSalary46} from '../sagas-payroll-admission46.js';

class DomainError extends Error {
 constructor(status,message,code){super(message);this.status=status;this.code=code;}
}
function run(salary,date,period,admissionMode,salaryMode,changes){
 return payrollSalaryAmount47(salary,date,period,admissionMode,salaryMode,changes,payrollAdmissionSalary46,DomainError);
}
const october=[{effective_from:'2026-10-16',salary_cents:320000}];
test('padrão RM: salário inicial prevalece na competência, reajuste na próxima',()=>{
 const r=run(300000,'2024-05-01','2026-10',null,'RM_NEXT_MONTH',october);
 assert.equal(r.salary_cents,300000);
 assert.equal(r.change_count,1);
 assert.match(r.reference_text,/RM/);
});
test('sem cadastro de modo salarial, prevalece o padrão RM',()=>{
 const r=run(300000,'2024-05-01','2026-10',null,null,october);
 assert.equal(r.salary_cents,300000);
});
test('proporcional opcional: 15 dias a R$3000 e 16 dias a R$3200',()=>{
 const r=run(300000,'2024-05-01','2026-10',null,'PRORATE_CALENDAR',october);
 assert.equal(r.salary_cents,310323);
 assert.deepEqual(r.segments.map(x=>x.days),[15,16]);
 assert.equal(r.divisor,31);
});
test('dois reajustes: 10 dias 3000, 10 dias 3300, 11 dias 3500',()=>{
 const changes=[{effective_from:'2026-10-11',salary_cents:330000},
  {effective_from:'2026-10-21',salary_cents:350000}];
 const r=run(300000,'2024-05-01','2026-10',null,'PRORATE_CALENDAR',changes);
 assert.equal(r.salary_cents,327419);
 assert.equal(r.segments.length,3);
 assert.equal(r.segments.reduce((a,x)=>a+x.days,0),31);
});
test('admissão e reajuste em outubro com calendário: 10 dias + 16 dias',()=>{
 const r=run(300000,'2026-10-06','2026-10','CALENDAR','PRORATE_CALENDAR',october);
 assert.equal(r.salary_cents,261935);
 assert.equal(r.segments.reduce((a,x)=>a+x.days,0),26);
});
test('admissão e reajuste com mês comercial não é inferido automaticamente',()=>{
 assert.throws(()=>run(300000,'2026-10-06','2026-10','COMMERCIAL_30','PRORATE_CALENDAR',october),
   e=>e.code==='ADMISSION_CHANGE_CONFLICT');
});
test('salário integral e admissão permanecem compatíveis com meses sem reajuste',()=>{
 assert.equal(run(300000,'2024-01-01','2026-10',null,'RM_NEXT_MONTH',[]).salary_cents,300000);
 assert.equal(run(300000,'2026-10-06','2026-10','COMMERCIAL_30','RM_NEXT_MONTH',[]).salary_cents,250000);
});
test('reajustes fora de ordem bloqueiam o cálculo',()=>{
 assert.throws(()=>run(300000,'2024-01-01','2026-10',null,'PRORATE_CALENDAR',
  [{effective_from:'2026-10-21',salary_cents:350000},{effective_from:'2026-10-11',salary_cents:320000}]),
  e=>e.code==='INVALID_SALARY_DATES');
});
test('histórico mensal recupera salários novos sem reescrever folha',async()=>{
 const records=[{employee_id:'e1',effective_from:'2026-10-16',salary_cents:320000}];
 const env={DB:{prepare(sql){
  return{bind(...args){assert.equal(args[0],'company');assert.equal(args[1],'e1');
   return{all:async()=>({results:records})};}};
 }}};
 const history={changesSalary:new Map([['e1',[{effective_from:'2026-10-16'}]]])};
 const result=await payrollSalaryHistory47(env,'company',[{id:'e1',admission_date:'2024-01-01'}],
  history,'2026-10-01','2026-10-31',DomainError);
 assert.deepEqual(result.get('e1'),records);
});
test('histórico modificado durante a leitura interrompe o processamento',async()=>{
 const env={DB:{prepare(){return{bind(){return{all:async()=>({results:[]})}}}}}};
 const history={changesSalary:new Map([['e1',[{effective_from:'2026-10-16'}]]])};
 await assert.rejects(payrollSalaryHistory47(env,'company',[{id:'e1',admission_date:'2024-01-01'}],
  history,'2026-10-01','2026-10-31',DomainError),e=>e.code==='SALARY_HISTORY_CHANGED');
});
