import test from 'node:test';
import assert from 'node:assert/strict';
import {compose119,split119,COMPONENTS119} from '../sagas-payroll-termination119.js';
const review={
 employee:{id:'emp1',code:'00001',name:'Ana',cost_center_id:'cc1'},
 termination_date:'2026-10-27',termination_kind:'WITHOUT_CAUSE',notice_kind:'INDEMNIFIED',
 source_fingerprint:'tax',tax_context:{payment_date:'2026-10-31'},problems:[],
 amounts:{salary_balance_cents:100000,thirteenth_cents:40000,
  thirteenth_notice_projection_cents:0,vacation_proportional_cents:30000,
  vacation_accrued_unpaid_cents:0,vacation_third_cents:10000,
  vacation_accrued_third_cents:0,notice_indemnity_cents:20000},
 deduction_documentation:{inss_salary_cents:10000,inss_thirteenth_cents:1000,
  irrf_salary_cents:5000,irrf_thirteenth_cents:1000,thirteenth_advance_cents:20000,
  notice_deduction_cents:0,other_deductions_cents:3000}
};
const diag={tax_source_fingerprint:'tax',source_fingerprint:'diag',blocks:[],
 financial:{gross_reference_cents:200000,deductions_reference_cents:40000,
  net_reference_cents:160000,fgts_fine_reference_cents:8000},
 provision_items:[
  {component:'FERIAS',proposed_use_cents:10000,balance_cents:10000},
  {component:'TERCO_FERIAS',proposed_use_cents:0,balance_cents:0},
  {component:'DECIMO_TERCEIRO',proposed_use_cents:10000,balance_cents:10000}
 ]};
const rule=(side,account,extra={})=>({side,account_id:account,
 account_active:1,account_analytic:1,percentage:100,...extra});
const natures=Object.keys(COMPONENTS119).map(component=>({
 component,active:1,synthetic_analytic:'ANALYTIC',
 rules:[rule('D',component+'-D'),rule('C',component+'-C')]
}));
const provisionNatures=['FERIAS','DECIMO_TERCEIRO'].map(component=>({
 component,active:1,synthetic_analytic:'ANALYTIC',
 rules:[rule('D',component+'-P'),rule('C','CLEARING-D')]
}));
const batch={id:'b1',status:'OPEN'};
const clone=x=>JSON.parse(JSON.stringify(x));
const go=(r=review,d=diag,n=natures,p=provisionNatures,b=batch,existing=null)=>
 compose119(r,d,n,p,b,existing);
test('dois diarios e titulo planejado batem em centavos',()=>{
 const p=go();
 assert.equal(p.block_count,0);
 assert.equal(p.provision_totals.debit_cents,20000);
 assert.equal(p.provision_totals.credit_cents,20000);
 assert.equal(p.settlement_totals.debit_cents,200000);
 assert.equal(p.settlement_totals.credit_cents,200000);
 assert.equal(p.financial.net_payable_preview_cents,160000);
 assert.equal(p.financial.fgts_fine_separate_cents,8000);
 assert.equal(p.financial.payable_created,false);
 assert.equal(p.ready_for_posting,false);
 assert.equal(p.accounting_generated,false);
 assert.equal(p.employee_status_changed,false);
});
test('provisao nao reaparece como despesa na liquidação',()=>{
 const p=go();
 const expense=p.settlement_journal_lines
  .filter(x=>x.side==='D'&&x.component!=='CLEARING')
  .reduce((v,x)=>v+x.amount_cents,0);
 assert.equal(expense,180000);
 assert.equal(p.settlement_journal_lines.filter(x=>x.component==='CLEARING')[0].amount_cents,20000);
});
test('configuracao de natureza ausente bloqueia contabilizacao',()=>{
 const p=go(review,diag,natures.filter(x=>x.component!=='INSS_PAYABLE'));
 assert.ok(p.blocks.some(x=>x.code==='NATURE_MISSING'));
 assert.equal(p.ready_for_posting,false);
});
test('conta de provisao deve casar com transitoria de liquidação',()=>{
 const p=clone(provisionNatures);
 p[0].rules[1].account_id='OUTRA-CONTA';
 assert.ok(go(review,diag,natures,p).blocks.some(x=>x.code==='CLEARING_MISMATCH'));
});
test('status lote fechado impede concluir preparacao',()=>{
 assert.ok(go(review,diag,natures,provisionNatures,{id:'b1',status:'CLOSED'})
  .blocks.some(x=>x.code==='BATCH_CLOSED'));
});
test('duplicidade por origem contabil bloqueia',()=>{
 assert.ok(go(review,diag,natures,provisionNatures,batch,{id:'journal1'})
  .blocks.some(x=>x.code==='ALREADY_POSTED'));
});
test('base tributaria alterada invalida minuta',()=>{
 assert.ok(go({...review,source_fingerprint:'changed'}).blocks.some(x=>x.code==='SOURCE_CHANGED'));
});
test('pendencias de v118 sao propagadas',()=>{
 const d=clone(diag);d.blocks=[{code:'FGTS_NOT_ATTESTED',message:'FGTS pendente'}];
 assert.ok(go(review,d).blocks.some(x=>x.code==='PRECHECK_FGTS_NOT_ATTESTED'));
});
test('desconto divergente impede contabilizar',()=>{
 const r=clone(review);r.deduction_documentation.other_deductions_cents=4000;
 assert.ok(go(r).blocks.some(x=>x.code==='GROSS_NET_MISMATCH'));
});
test('provisao acima do direito gera bloqueio',()=>{
 const d=clone(diag);d.provision_items[0].proposed_use_cents=99999;
 assert.ok(go(review,d).blocks.some(x=>x.code==='USE_ABOVE_RIGHT'));
});
test('rateio percentual errado bloqueia',()=>{
 const n=clone(natures);n[0].rules[0].percentage=90;
 assert.ok(go(review,diag,n).blocks.some(x=>x.code==='INVALID_ACCOUNTS'));
});
test('mapeamento por centro de custo prevalece sobre default',()=>{
 const p=[];
 const lines=split119([
  rule('D','default'),rule('D','cc1-specific',{cost_center_id:'cc1'})
 ],'D','cc1',12000,'SALARY_EXPENSE',p);
 assert.equal(lines.length,1);
 assert.equal(lines[0].account_id,'cc1-specific');
 assert.equal(p.length,0);
});
test('distribuicao de 60/40 conserva centavos',()=>{
 const p=[];
 const lines=split119([
  rule('C','A',{percentage:60}),
  rule('C','B',{percentage:40})
 ],'C','cc1',101,'NET_PAYABLE',p);
 assert.deepEqual(lines.map(x=>x.amount_cents),[61,40]);
 assert.equal(p.length,0);
});
test('valor zero não cria partida',()=>{
 const p=[];assert.deepEqual(split119([], 'D','cc1',0,'none',p),[]);
});
test('sem centro de custo fica impedido',()=>{
 const r=clone(review);r.employee.cost_center_id=null;
 assert.ok(go(r).blocks.some(x=>x.code==='NO_CENTER'));
});
test('FGTS fica fora do titulo líquido',()=>{
 const p=go();
 assert.equal(p.financial.net_payable_preview_cents,160000);
 assert.equal(p.financial.fgts_fine_separate_cents,8000);
 assert.equal(p.financial.payable_created,false);
});
