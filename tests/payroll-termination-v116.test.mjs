import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcile116} from '../sagas-payroll-termination116.js';
const amounts={inss_salary_cents:7500,inss_thirteenth_cents:5000,
 irrf_salary_cents:0,irrf_thirteenth_cents:0,thirteenth_advance_cents:10000,
 notice_deduction_cents:0,other_deductions_cents:0};
const base={documentary_ready:true,full_gross_reference_cents:100000,
 source_fingerprint:'base1',termination_kind:'WITHOUT_CAUSE',warnings:[],problems:[]};
const doc={base_fingerprint:'base1',deductions_json:JSON.stringify(amounts),
 proof_reference:'TRCT E GUIAS OUTUBRO 2026',notes:'',confirmed_by:'dp'};
test('nao presume desconto se faltam documentos',()=>{
 const r=reconcile116(base,null);
 assert.equal(r.net_reference_cents,null);
 assert.equal(r.deduction_ready,false);
});
test('concilia descontos em centavos e separa liquido apenas referencial',()=>{
 const r=reconcile116(base,doc);
 assert.equal(r.deductions_total_cents,22500);
 assert.equal(r.net_reference_cents,77500);
 assert.equal(r.net_cents,null);
 assert.equal(r.ready_for_closing,false);
 assert.equal(r.financial_generated,false);
});
test('impede usar documento contra salario ou verba alterada',()=>{
 const r=reconcile116(base,{...doc,base_fingerprint:'antigo'});
 assert.equal(r.deduction_ready,false);
 assert.equal(r.net_reference_cents,null);
 assert.equal(r.deduction_issues[0].code,'DEDUCTIONS_STALE');
});
test('bloqueia total de descontos superior ao bruto',()=>{
 const r=reconcile116(base,{...doc,deductions_json:JSON.stringify({...amounts,other_deductions_cents:90000})});
 assert.equal(r.net_reference_cents,null);
 assert.equal(r.deduction_ready,false);
});
test('recusa desconto de aviso para dispensa sem justa causa',()=>{
 const r=reconcile116(base,{...doc,deductions_json:JSON.stringify({...amounts,notice_deduction_cents:1000})});
 assert.equal(r.deduction_ready,false);
 assert.ok(r.deduction_issues.some(e=>e.code==='NOTICE_DEDUCTION_INVALID'));
});
test('invalida documento com campos faltantes ou decimais',()=>{
 const r=reconcile116(base,{...doc,deductions_json:'{"inss_salary_cents":7.5}'});
 assert.equal(r.deduction_ready,false);
 assert.equal(r.deductions_total_cents,null);
});
test('bloqueia liquido se bruto documental ainda nao esta conciliado',()=>{
 const r=reconcile116({...base,documentary_ready:false},doc);
 assert.equal(r.deduction_ready,false);
 assert.equal(r.net_reference_cents,null);
});
