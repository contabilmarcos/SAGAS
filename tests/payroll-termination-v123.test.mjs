import test from 'node:test';
import assert from 'node:assert/strict';
import {assess123} from '../sagas-payroll-termination123.js';
const clone=v=>JSON.parse(JSON.stringify(v));
const e={id:'e1',code:'00001',name:'Maria',cost_center_id:'CC1'};
const employee={id:'e1',active:1,cost_center_id:'CC1',position_id:'P'};
const review={employee:e,termination_date:'2026-10-27',termination_kind:'WITHOUT_CAUSE',notice_kind:'INDEMNIFIED',
 source_fingerprint:'tax',base_source_fingerprint:'document-base',
 documentary_evidence:{fgts_base_cents:200000},documentary_ready:true,deduction_ready:true,
 tax_ready_for_review:true,tax_summary:{month_inss:1000},tax_comparison:{matched:true},
 tax_issues:[],documentary_issues:[],deduction_issues:[],problems:[],
 full_gross_reference_cents:500000,net_reference_cents:450000,fgts_fine_reference_cents:80000,
 amounts:{provisional_gross_cents:500000}};
const diag={employee:e,tax_source_fingerprint:'tax'};
const plan={employee:e,payment_date:'2026-10-31',batch_id:'B1',source_fingerprint:'plan',
 financial:{gross_reference_cents:500000,net_payable_preview_cents:450000,fgts_fine_separate_cents:80000},
 blocks:['FGTS_STATEMENT','VACATION_RIGHTS_UNVERIFIED','TAX_CALC_PENDING','PENDING_CLOSING'].map(code=>({code:'PRECHECK_SOURCE_'+code,message:'Await external review'})),
 provision_movements_preview:[{component:'FERIAS',employee_id:'e1',cost_center_id:'CC1',amount_cents:100000,operational_only:true}],
 provision_journal_lines:[{side:'D',amount_cents:100000},{side:'C',amount_cents:100000}],
 settlement_journal_lines:[{side:'D',amount_cents:500000},{side:'C',amount_cents:500000}]};
const fgts={id:'fgtsdoc',employee_id:'e1',termination_date:'2026-10-27',kind:'WITHOUT_CAUSE',notice_kind:'INDEMNIFIED',
 fgts_source_fingerprint:'document-base',fgts_base_cents:200000,fine_cents:80000,
 statement_reference:'FGTS-STATEMENT-2026',base_reference:'FGTS-HISTORY-BASE',
 guide_reference:'GUIDE-FGTS-2026',due_date:'2026-11-06'};
const config={supplier_id:'gov-fgts',active:1};
const account={problems:[],lines:[
 {side:'D',component:'FGTS_FINE_EXPENSE',account_id:'EXP',cost_center_id:'CC1',amount_cents:80000},
 {side:'C',component:'FGTS_FINE_PAYABLE',account_id:'PAY',cost_center_id:'CC1',amount_cents:80000}
]};
const approval={source_fingerprint:'plan',employee_id:'e1',gross_cents:500000,net_cents:450000,
 payment_date:'2026-10-31',fgts_document_id:'fgtsdoc',fgts_fine_cents:80000};
const go=(r=review,d=diag,p=plan,a=null,existing=null,emp=employee,
 doc=fgts,cfg=config,gl=account,foreign=null)=>assess123(r,d,p,a,existing,emp,doc,cfg,gl,foreign);
const issue=(p,c)=>p.problems.some(x=>x.code===c);
test('documentos FGTS permitem aprovação sem postar ainda',()=>{
 const p=go();assert.equal(p.ready_for_approval,true);assert.equal(p.accounting_generated,false);
 assert.equal(p.fgts_fine_cents,80000);assert.equal(p.net_cents,450000);
 assert.equal(p.fgts.creditor_id,'gov-fgts');
});
test('após aprovação, libera tentativa de integração',()=>{
 const p=go(review,diag,plan,approval);assert.equal(p.ready_for_integration,true);assert.equal(p.problems.length,0);
});
test('rejeita pedido de demissão na rota de multa',()=>{
 const r=clone(review);r.termination_kind='RESIGNATION';assert.ok(issue(go(r),'ONLY_DISMISSAL'));
});
test('rejeita aviso waived em dispensa sem justa causa',()=>{
 const r=clone(review);r.notice_kind='WAIVED';assert.ok(issue(go(r),'NOTICE_NOT_SUPPORTED'));
});
test('aviso trabalhado é permitido com documentação válida',()=>{
 const r=clone(review);r.notice_kind='WORKED';const doc=clone(fgts);doc.notice_kind='WORKED';
 assert.equal(go(r,diag,plan,null,null,employee,doc).ready_for_approval,true);
});
test('não aceita FGTS sem guia',()=>assert.ok(issue(go(review,diag,plan,null,null,employee,null),'FGTS_GUIDE_NOT_CONFIGURED')));
test('exige credor FGTS ativo',()=>{
 const cfg=clone(config);cfg.active=0;assert.ok(issue(go(review,diag,plan,null,null,employee,fgts,cfg),'FGTS_CREDITOR_INVALID'));
});
test('valor 40% de guia diferente é bloqueado',()=>{
 const d=clone(fgts);d.fine_cents=79000;assert.ok(issue(go(review,diag,plan,null,null,employee,d),'FGTS_GUIDE_STALE'));
});
test('base histórica divergente é bloqueada',()=>{
 const d=clone(fgts);d.fgts_base_cents=100000;assert.ok(issue(go(review,diag,plan,null,null,employee,d),'FGTS_GUIDE_STALE'));
});
test('revisão salarial/documental nova invalida a guia',()=>{
 const d=clone(fgts);d.fgts_source_fingerprint='old';assert.ok(issue(go(review,diag,plan,null,null,employee,d),'FGTS_GUIDE_STALE'));
});
test('multa é passivo separado do líquido empregado',()=>{
 const p=go();assert.equal(p.net_cents,450000);assert.equal(p.fgts_fine_cents,80000);
});
test('conta da multa não pode estar faltando',()=>{
 const gl=clone(account);gl.lines=[];assert.ok(issue(go(review,diag,plan,null,null,employee,fgts,config,gl),'FGTS_JOURNAL_UNBALANCED'));
});
test('multa precisa ter débito e crédito iguais',()=>{
 const gl=clone(account);gl.lines[0].amount_cents=70000;
 assert.ok(issue(go(review,diag,plan,null,null,employee,fgts,config,gl),'FGTS_JOURNAL_UNBALANCED'));
});
test('natureza não configurada bloqueia',()=>{
 const gl=clone(account);gl.problems=[{code:'FGTS_NATURE_MISSING',message:'natureza ausente'}];
 assert.ok(issue(go(review,diag,plan,null,null,employee,fgts,config,gl),'FGTS_NATURE_MISSING'));
});
test('vencimento guia após D+10 bloqueia',()=>{
 const d=clone(fgts);d.due_date='2026-11-07';assert.ok(issue(go(review,diag,plan,null,null,employee,d),'FGTS_DUE_DATE_INVALID'));
});
test('data inválida na guia bloqueia',()=>{
 const d=clone(fgts);d.due_date='2026-02-30';assert.ok(issue(go(review,diag,plan,null,null,employee,d),'FGTS_GUIDE_INCOMPLETE'));
});
test('vencimento anterior ao desligamento bloqueia',()=>{
 const d=clone(fgts);d.due_date='2026-10-26';assert.ok(issue(go(review,diag,plan,null,null,employee,d),'FGTS_DUE_DATE_INVALID'));
});
test('TRCT e guia somente após cálculo tributário v117 conferido',()=>{
 const r=clone(review);r.tax_ready_for_review=false;assert.ok(issue(go(r),'DOCUMENTARY_TAX_NOT_READY'));
});
test('rescisão fora do ano 2026 bloqueia',()=>{
 const r=clone(review);r.termination_date='2025-10-27';assert.ok(issue(go(r),'YEAR_UNSUPPORTED'));
});
test('data futura não altera funcionário',()=>{
 const r=clone(review);r.termination_date='2026-12-27';assert.ok(issue(go(r),'FUTURE_TERMINATION'));
});
test('funcionário inativo bloqueia duplicidade',()=>{
 const emp=clone(employee);emp.active=0;assert.ok(issue(go(review,diag,plan,null,null,emp),'EMPLOYEE_NOT_ACTIVE'));
});
test('histórico rescisório v122 bloqueia outra modalidade',()=>{
 assert.ok(issue(go(review,diag,plan,null,null,employee,fgts,config,account,{id:'v122'}),'ALREADY_FINALIZED'));
});
test('rescisão v123 já contabilizada bloqueia repetição',()=>{
 assert.ok(issue(go(review,diag,plan,null,{id:'v123'}),'ALREADY_FINALIZED'));
});
test('modificação na guia após aprovação exige nova homologação',()=>{
 const a=clone(approval);a.fgts_document_id='OTHER';assert.ok(issue(go(review,diag,plan,a),'FGTS_APPROVAL_STALE'));
});
test('alteração do lote ou natureza leva a bloqueio de aprovação',()=>{
 const a=clone(approval);a.source_fingerprint='OLD';assert.ok(issue(go(review,diag,plan,a),'APPROVAL_STALE'));
});
test('bloqueio de férias documentais não é ignorado',()=>{
 const p=clone(plan);p.blocks.push({code:'PRECHECK_SOURCE_MONTHLY_ALREADY_APPROVED',message:'folha já aprovada'});
 assert.ok(issue(go(review,diag,p),'BLOCKED_PRECHECK_SOURCE_MONTHLY_ALREADY_APPROVED'));
});
test('baixa de provisão deve conciliar por componente',()=>{
 const p=clone(plan);p.provision_movements_preview[0].employee_id='wrong';
 assert.ok(issue(go(review,diag,p),'PROVISION_NOT_VERIFIED'));
});
test('mesma conta e valor da provisão não altera o bruto',()=>{
 const p=go();assert.equal(p.provision_use_cents,100000);assert.equal(p.gross_cents,500000);
});
test('não altera os objetos de entrada',()=>{
 const r=clone(review),p=clone(plan),d=clone(fgts),first=JSON.stringify([r,p,d]);
 go(r,diag,p,null,null,employee,d);assert.equal(JSON.stringify([r,p,d]),first);
});
