import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {payrollBasicHistory138,PAYROLL_DEFAULT_HOURS138} from '../sagas-payroll-basic-history138.js';

const emp=(props={})=>({id:'EMP1',employee_code:'00001',name:'Funcionário exemplo',
 position_id:'CARGO1',cost_center_id:'CC1',admission_date:'2020-01-02',
 salary_cents:180000,active:1,...props});
const history=()=>Object.fromEntries(['salary','schedule','functional','dependents','occurrences',
 'changesSalary','changesSchedule','changesFunctional'].map(x=>[x,new Map()]));

test('cadastro básico preenche salário, jornada e situação somente em memória',()=>{
 const h=history();const o=payrollBasicHistory138([emp()],h,'2020-01-01');
 assert.deepEqual(o.get('EMP1'),{salary:true,schedule:true,functional:true});
 assert.equal(h.salary.get('EMP1')[0].salary_cents,180000);
 assert.equal(h.schedule.get('EMP1')[0].monthly_hours_milli,PAYROLL_DEFAULT_HOURS138);
 assert.equal(h.functional.get('EMP1')[0].situation,'ATIVO');
 assert.equal(h.functional.get('EMP1')[0].position_id,'CARGO1');
 assert.equal(h.salary.get('EMP1')[0].source,'BASIC_REGISTRATION_138');
 assert.equal(h.occurrences.get('EMP1'),undefined);
});
test('históricos informados continuam prioritários sobre o cadastro atual',()=>{
 const h=history();
 h.salary.set('EMP1',[{salary_cents:155000,effective_from:'2020-01-01'}]);
 h.schedule.set('EMP1',[{monthly_hours_milli:200000,effective_from:'2020-01-01'}]);
 h.functional.set('EMP1',[{situation:'ATIVO',effective_from:'2020-01-01'}]);
 const state=payrollBasicHistory138([emp({salary_cents:300000,active:0})],h,'2020-01-01');
 assert.deepEqual(state.get('EMP1'),{salary:false,schedule:false,functional:false});
 assert.equal(h.salary.get('EMP1')[0].salary_cents,155000);
 assert.equal(h.schedule.get('EMP1')[0].monthly_hours_milli,200000);
 assert.equal(h.functional.get('EMP1')[0].situation,'ATIVO');
});
test('funcionário inativo sem prova histórica não é presumido ativo',()=>{
 const h=history();payrollBasicHistory138([emp({active:0})],h,'2020-01-01');
 assert.equal(h.functional.get('EMP1')[0].situation,'DESLIGADO');
});
test('salário nulo não vira automaticamente remuneração fictícia',()=>{
 const h=history(),state=payrollBasicHistory138([emp({salary_cents:0})],h,'2020-01-01');
 assert.equal(h.salary.has('EMP1'),false);
 assert.equal(state.get('EMP1').salary,false);
});
test('cada trabalhador usa a própria referência sem contaminar outro',()=>{
 const h=history();payrollBasicHistory138([emp(),emp({id:'EMP2',salary_cents:360000})],h,'2020-01-01');
 assert.equal(h.salary.get('EMP1')[0].salary_cents,180000);
 assert.equal(h.salary.get('EMP2')[0].salary_cents,360000);
});
test('preparação e cálculo usam fallback; dados especiais continuam com bloqueios',()=>{
 const worker=readFileSync(new URL('../SAGAS_worker.js',import.meta.url),'utf8');
 const prep=worker.slice(worker.indexOf('async function payrollMonthlyPreparation34('),
  worker.indexOf('async function payrollMonthlyEmployeeCalc35('));
 const src=worker.slice(worker.indexOf('async function payrollMonthlySource35('),
  worker.indexOf('async function payrollMonthlyRunDetail35('));
 assert.match(prep,/payrollBasicHistory138\(candidates,history,first\)/);
 assert.match(prep,/salary_cents:emp\.salary_cents,position_id:emp\.position_id,active:emp\.active/);
 assert.match(src,/payrollBasicHistory138\(employees,history,prep\.first_date\)/);
 assert.match(src,/payrollBasicHistory138\(employees,history,prep\.first_date\)/);
 assert.doesNotMatch(prep,/add\('HISTORICO_(?:SALARIAL|FUNCIONAL)'/);
 assert.match(prep,/JORNADA_EVENTO_HORAS/);
 assert.match(prep,/SITUACAO_FUNCIONAL/);
 assert.match(prep,/prorationSettings\?\.mode\|\|'CALENDAR'/);
 assert.match(src,/prep\.proration_settings\?\.mode\|\|'CALENDAR'/);
 assert.match(src,/automatic137/);
});
