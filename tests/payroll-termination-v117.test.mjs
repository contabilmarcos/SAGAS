import test from 'node:test';
import assert from 'node:assert/strict';
import {inss2026v117,irrf2026v117,assessTaxes117} from '../sagas-payroll-termination117.js';
const b={
 termination_date:'2026-10-27',termination_kind:'WITHOUT_CAUSE',notice_kind:'INDEMNIFIED',
 source_fingerprint:'base2026',documentary_ready:true,full_gross_reference_cents:800000,
 problems:[],warnings:[],
 amounts:{
 salary_balance_cents:300000,thirteenth_cents:240000,thirteenth_notice_projection_cents:20000,
 vacation_proportional_cents:120000,vacation_third_cents:40000,
 vacation_accrued_unpaid_cents:30000,vacation_accrued_third_cents:10000,
 notice_indemnity_cents:40000
 }
};
const c={dependents:0,other_monthly_cents:0,other_thirteenth_cents:0,
 prior_inss_month_cents:0,prior_inss_thirteenth_cents:0,
 prior_irrf_month_cents:0,prior_irrf_thirteenth_cents:0,
 pension_month_cents:0,pension_thirteenth_cents:0};
function proof(extra={}){return {base_fingerprint:b.source_fingerprint,context_json:JSON.stringify({...c,...extra}),reference:'FOLHA 2026 + TRCT + DEPENDENTES'};}
test('INSS empregado usa tabela progressiva e separa teto',()=>{
 assert.equal(inss2026v117(0),0);
 assert.equal(inss2026v117(162100),12158);
 assert.equal(inss2026v117(300000),24860);
 assert.equal(inss2026v117(10000000),inss2026v117(847555));
});
test('IRRF 2026 inclui redução sobre rendimentos, não base após deduções',()=>{
 assert.equal(irrf2026v117(500000,50000).irrf_cents,0);
 assert.equal(irrf2026v117(600000,64960).reduction_cents,17975);
 assert.equal(irrf2026v117(760720,0).reduction_cents,0);
});
test('usa desconto simplificado quando superar deducoes legais',()=>{
 const r=irrf2026v117(400000,36860);
 assert.equal(r.deduction_cents,60720);
 assert.equal(r.simplified_applied,true);
});
test('deducao previdenciaria e dependentes quando superam o simplificado',()=>{
 const r=irrf2026v117(850000,90000,2,20000);
 assert.equal(r.legal_deduction_cents,147918);
 assert.equal(r.simplified_applied,false);
});
test('bloqueia resultado sem informacoes confirmadas da folha',()=>{
 const r=assessTaxes117(b,null);
 assert.equal(r.tax_summary,null);
 assert.equal(r.tax_ready_for_review,false);
 assert.equal(r.tax_lines.length,8);
});
test('mantem ferias e aviso indenizado fora das bases automaticas',()=>{
 const r=assessTaxes117(b,proof());
 assert.equal(r.tax_summary.month_gross_cents,300000);
 assert.equal(r.tax_summary.thirteenth_inss_base_cents,240000);
 assert.equal(r.tax_summary.thirteenth_irrf_gross_cents,260000);
 assert.equal(r.tax_lines.filter(x=>x.tax_class==='INDEMNITY_EXCLUDED').length,5);
});
test('diferencia IRRF 13o do INSS 13o com projecao do aviso',()=>{
 const r=assessTaxes117(b,proof());
 assert.equal(r.tax_summary.inss_thirteenth_total_cents,inss2026v117(240000));
 assert.equal(r.tax_summary.irrf_thirteenth_details.gross_cents,260000);
});
test('reconcilia base e deducoes previamente retidas',()=>{
 const r=assessTaxes117(b,proof({other_monthly_cents:100000,prior_inss_month_cents:20000,prior_irrf_month_cents:5000}));
 assert.equal(r.tax_summary.month_gross_cents,400000);
 assert.equal(r.tax_summary.inss_month_due_cents,inss2026v117(400000)-20000);
});
test('documentos antigos nao sao aproveitados como situacao atual',()=>{
 const r=assessTaxes117(b,{...proof(),base_fingerprint:'antigo'});
 assert.equal(r.tax_summary,null);
 assert.ok(r.tax_issues.some(x=>x.code==='CONTEXT_STALE'));
});
test('sem tabela de 2027 nao libera apuracao automaticamente',()=>{
 const r=assessTaxes117({...b,termination_date:'2027-01-10'},proof());
 assert.ok(r.tax_issues.some(x=>x.code==='YEAR_NOT_SUPPORTED'));
});
test('valor manual divergente gera pendencia',()=>{
 const base={...b,deduction_documentation:{
  inss_salary_cents:0,inss_thirteenth_cents:0,irrf_salary_cents:0,irrf_thirteenth_cents:0}};
 const r=assessTaxes117(base,proof());
 assert.ok(r.tax_comparison.differences.length>=2);
 assert.equal(r.tax_ready_for_review,false);
});
test('alinha tributos manuais sem liberar fechamento',()=>{
 const r=assessTaxes117(b,proof());
 const tax=r.tax_summary;
 const base={...b,deduction_documentation:{
  inss_salary_cents:tax.inss_month_due_cents,
  inss_thirteenth_cents:tax.inss_thirteenth_due_cents,
  irrf_salary_cents:tax.irrf_month_due_cents,
  irrf_thirteenth_cents:tax.irrf_thirteenth_due_cents
 }};
 const next=assessTaxes117(base,proof());
 assert.equal(next.tax_ready_for_review,true);
 assert.equal(next.tax_ready_for_closing,false);
 assert.equal(next.financial_generated,false);
 assert.equal(next.accounting_generated,false);
});
test('pendencias herdadas nao bloqueiam conferencia preliminar, mas nunca autorizam fechamento',()=>{
 const first=assessTaxes117(b,proof());
 const base={...b,problems:[{code:'VACATION_HISTORY'}],deduction_documentation:{
  inss_salary_cents:first.tax_summary.inss_month_due_cents,
  inss_thirteenth_cents:first.tax_summary.inss_thirteenth_due_cents,
  irrf_salary_cents:first.tax_summary.irrf_month_due_cents,
  irrf_thirteenth_cents:first.tax_summary.irrf_thirteenth_due_cents
 }};
 const r=assessTaxes117(base,proof());
 assert.equal(r.tax_ready_for_review,true);
 assert.equal(r.tax_ready_for_closing,false);
 assert.ok(r.tax_warnings.some(x=>x.includes('pendências herdadas')));
});
