import test from 'node:test';
import assert from 'node:assert/strict';
import {assess122} from '../sagas-payroll-termination122.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const employee={id:'E1',name:'Maria',cost_center_id:'CC1',cost_center_code:'01',code:'00001'};
const live={id:'E1',active:1,cost_center_id:'CC1',position_id:'P1'};
const review={employee,termination_kind:'RESIGNATION',notice_kind:'WORKED',
 termination_date:'2026-10-27',source_fingerprint:'tax-fp',
 documentary_ready:true,deduction_ready:true,tax_ready_for_review:true,
 tax_issues:[],deduction_issues:[],documentary_issues:[],
 tax_summary:{inss_month_due_cents:1000},tax_comparison:{matched:true},
 full_gross_reference_cents:500000,net_reference_cents:450000,
 fgts_fine_reference_cents:null,amounts:{provisional_gross_cents:500000}};
const diag={employee,tax_source_fingerprint:'tax-fp'};
const plan={employee,batch_id:'batch',payment_date:'2026-10-31',source_fingerprint:'plan-fp',
 financial:{gross_reference_cents:500000,net_payable_preview_cents:450000},
 blocks:['VACATION_RIGHTS_UNVERIFIED','TAX_CALC_PENDING','PENDING_CLOSING'].map(code=>({code:'PRECHECK_SOURCE_'+code,message:'Documentation required'})),
 provision_movements_preview:[{employee_id:'E1',component:'FERIAS',cost_center_id:'CC1',amount_cents:100000,operational_only:true}],
 provision_journal_lines:[{side:'D',account_id:'PROV',amount_cents:100000},{side:'C',account_id:'CLEAR',amount_cents:100000}],
 settlement_journal_lines:[{side:'D',account_id:'SALARY',amount_cents:400000},{side:'D',account_id:'CLEAR',amount_cents:100000},
 {side:'C',account_id:'PAY',amount_cents:450000},{side:'C',account_id:'INSS',amount_cents:50000}]};
const approval={id:'A1',employee_id:'E1',approved_by:'user1',approved_at:'2026-10-27',
 source_fingerprint:'plan-fp',gross_cents:500000,net_cents:450000,payment_date:'2026-10-31',trct_reference:'TRCT-2026-00001'};
const go=(r=review,d=diag,p=plan,a=null,e=null,employee=live)=>assess122(r,d,p,a,e,employee);
test('homologação TRCT permitida com comprovantes consistentes',()=>{const p=go();assert.equal(p.ready_for_approval,true);assert.equal(p.problems.length,0);});
test('aprovado permite iniciar escrituração',()=>{const p=go(review,diag,plan,approval);assert.equal(p.ready_for_integration,true);assert.equal(p.provision_use_cents,100000);});
test('bloqueia desligamento sem justa causa e multa FGTS',()=>{
 const r=clone(review);r.termination_kind='WITHOUT_CAUSE';r.fgts_fine_reference_cents=30000;
 assert.ok(go(r).problems.some(x=>x.code==='FGTS_FINE_INTEGRATION_REQUIRED'));
});
test('não libera rescisão de 2025',()=>{const r=clone(review);r.termination_date='2025-12-20';assert.ok(go(r).problems.some(x=>x.code==='YEAR_UNSUPPORTED'));});
test('sem conciliação de INSS/IRRF permanece bloqueado',()=>{const r=clone(review);r.tax_comparison.matched=false;assert.ok(go(r).problems.some(x=>x.code==='TAX_NOT_RECONCILED'));});
test('base sem conferência documentária fica bloqueada',()=>{const r=clone(review);r.documentary_ready=false;assert.ok(go(r).problems.some(x=>x.code==='DOCUMENTARY_TAX_NOT_READY'));});
test('pendência legal não autorizada permanece bloqueada',()=>{
 const p=clone(plan);p.blocks.push({code:'PRECHECK_SOURCE_MONTHLY_ALREADY_APPROVED',message:'Monthly payroll conflict'});
 assert.ok(go(review,diag,p).problems.some(x=>x.code==='BLOCKED_PRECHECK_SOURCE_MONTHLY_ALREADY_APPROVED'));
});
test('aprovação nunca ignora erro de provisão',()=>{
 const p=clone(plan);p.blocks.push({code:'PRECHECK_LEDGER_COMPONENT_MISSING',message:'Ledger missing'});
 assert.ok(go(review,diag,p,approval).problems.some(x=>x.code==='BLOCKED_PRECHECK_LEDGER_COMPONENT_MISSING'));
});
test('provisões devem ter o mesmo funcionário',()=>{
 const p=clone(plan);p.provision_movements_preview[0].employee_id='E2';
 assert.ok(go(review,diag,p).problems.some(x=>x.code==='PROVISION_NOT_VERIFIED'));
});
test('débito e crédito devem fechar',()=>{const p=clone(plan);p.provision_journal_lines[1].amount_cents=99999;assert.ok(go(review,diag,p).problems.some(x=>x.code==='JOURNAL_UNBALANCED'));});
test('liquidação tem que fechar com valor bruto',()=>{const p=clone(plan);p.settlement_journal_lines[3].amount_cents=49999;assert.ok(go(review,diag,p).problems.some(x=>x.code==='JOURNAL_UNBALANCED'));});
test('TRCT bruto distinto bloqueia',()=>{const p=clone(plan);p.financial.gross_reference_cents=400000;assert.ok(go(review,diag,p).problems.some(x=>x.code==='FINANCIAL_MISMATCH'));});
test('TRCT líquido distinto bloqueia',()=>{const p=clone(plan);p.financial.net_payable_preview_cents=200000;assert.ok(go(review,diag,p).problems.some(x=>x.code==='FINANCIAL_MISMATCH'));});
test('fonte de aprovação alterada exige nova homologação',()=>{
 const a=clone(approval);a.source_fingerprint='outdated';
 assert.ok(go(review,diag,plan,a).problems.some(x=>x.code==='APPROVAL_STALE'));
});
test('funcionário inativo não pode receber nova baixa rescisória',()=>{
 const e=clone(live);e.active=0;assert.ok(go(review,diag,plan,null,null,e).problems.some(x=>x.code==='EMPLOYEE_NOT_ACTIVE'));
});
test('troca de CC bloqueia rescisão',()=>{
 const e=clone(live);e.cost_center_id='other';assert.ok(go(review,diag,plan,null,null,e).problems.some(x=>x.code==='EMPLOYEE_NOT_ACTIVE'));
});
test('estado já finalizado não autoriza segundo lançamento',()=>{
 const x=go(review,diag,plan,approval,{id:'FINAL'});
 assert.ok(x.problems.some(p=>p.code==='ALREADY_FINALIZED'));
});
test('aviso prévio indenizado não permitido no pedido de demissão',()=>{
 const r=clone(review);r.notice_kind='INDEMNIFIED';assert.ok(go(r).problems.some(x=>x.code==='NOTICE_NOT_SUPPORTED'));
});
test('aviso dispensado com documentos pode ser aprovado',()=>{
 const r=clone(review);r.notice_kind='WAIVED';assert.equal(go(r).ready_for_approval,true);
});
test('vencimento após 10 dias é rejeitado',()=>{
 const p=clone(plan);p.payment_date='2026-11-08';assert.ok(go(review,diag,p).problems.some(x=>x.code==='PAYMENT_DEADLINE'));
});
test('vencimento anterior à rescisão é rejeitado',()=>{
 const p=clone(plan);p.payment_date='2026-10-26';assert.ok(go(review,diag,p).problems.some(x=>x.code==='PAYMENT_DEADLINE'));
});
test('source tributária alterada impede postagem',()=>{
 const d=clone(diag);d.tax_source_fingerprint='other';assert.ok(go(review,d).problems.some(x=>x.code==='SOURCE_CHANGED'));
});
test('sem lote contábil não existe aprovação',()=>{
 const p=clone(plan);p.batch_id=null;assert.ok(go(review,diag,p).problems.some(x=>x.code==='BATCH_OR_DATE_MISSING'));
});
test('valores e provisão sem cobertura geram zero baixa e um único diário',()=>{
 const p=clone(plan);p.provision_movements_preview=[];p.provision_journal_lines=[];
 assert.equal(go(review,diag,p).provision_use_cents,0);
});
test('caráter de minuta não altera nenhum objeto de cálculo original',()=>{
 const r=clone(review),p=clone(plan),before=JSON.stringify([r,p]);go(r,diag,p);
 assert.equal(JSON.stringify([r,p]),before);
});
