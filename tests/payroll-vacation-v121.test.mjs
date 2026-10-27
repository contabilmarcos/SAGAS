import test from 'node:test';
import assert from 'node:assert/strict';
import {plan121} from '../sagas-payroll-vacation121.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const run={id:'R1',status:'APPROVED',competence:'2026-10',payment_date:'2026-11-03',source_fingerprint:'VACATION100:FP'};
const envelope={employee_id:'E1',employee_code:'00001',employee_name:'Ana',cost_center_id:'cc1',net_cents:25000,lines:[
 {event_code:'FERIAS_GOZO',line_type:'PROVENTO',amount_cents:90000},
 {event_code:'TERCO_FERIAS',line_type:'PROVENTO',amount_cents:30000},
 {event_code:'ADIANTAMENTO_FERIAS',line_type:'DESCONTO',amount_cents:120000}
]};
const source={employee_id:'E1',occurrence_id:'O1',advance_evidence:{payment_verified:true,journal_entry_id:'PAYJ1'},
 components:[{component:'FERIAS',earned_cents:90000},{component:'TERCO_FERIAS',earned_cents:30000}]};
const line=(event_code,side,account_id,amount_cents)=>({employee_id:'E1',cost_center_id:'cc1',branch_id:null,event_code,side,account_id,amount_cents});
const pkg={applicable:true,run,problems:[],sources:[source],
 sums:{debit_cents:265000,credit_cents:265000,monthly_net_cents:25000,compensated_gross_cents:120000},
 lines:[
  line('FERIAS_GOZO','D','VAC_EXP',90000),line('FERIAS_GOZO','C','VAC_PAY',90000),
  line('TERCO_FERIAS','D','THIRD_EXP',30000),line('TERCO_FERIAS','C','THIRD_PAY',30000),
  line('SALARIO_BASE','D','SAL_EXP',25000),line('SALARIO_BASE','C','SAL_PAY',25000),
  line('ADIANTAMENTO_FERIAS','D','ADV_DEB',120000),line('ADIANTAMENTO_FERIAS','C','ADV_CRED',120000)
 ]};
const ledger={applicable:true,problems:[],payment_verified_in_financial:true,items:[{
 employee_id:'E1',components:['FERIAS','TERCO_FERIAS'].map((component,i)=>({
 component,earned_cents:i?30000:90000,linked_to_occurrence:true,
 explicitly_linked_use_cents:i?30000:90000,matched_document_posted_use_cents:i?30000:90000}))
}]};
const posted=[
 {employee_id:'E1',component:'FERIAS',occurrence_id:'O1',cost_center_id:'cc1',
  movement_id:'M1',journal_entry_id:'J1',amount_cents:90000,gl_credit_cents:90000,
  gl_credit_account_id:'FERIAS_CLEAR',journal_debit_cents:90000,journal_credit_cents:90000,
  journal_status:'POSTED',posting_kind:'USE',posting_gl_verified:true},
 {employee_id:'E1',component:'TERCO_FERIAS',occurrence_id:'O1',cost_center_id:'cc1',
  movement_id:'M2',journal_entry_id:'J2',amount_cents:30000,gl_credit_cents:30000,
  gl_credit_account_id:'TERCO_CLEAR',journal_debit_cents:30000,journal_credit_cents:30000,
  journal_status:'POSTED',posting_kind:'USE',posting_gl_verified:true}
];
const detail={run,envelopes:[envelope],totals:{net_cents:25000}},batch={id:'batch',status:'OPEN'},review={approved:true,review:{closed_at:'2026-10-31'},problems:[]};
const go=(p=pkg,l=ledger,dt=detail,li=posted,b=batch,old=null,r=review)=>plan121(p,l,dt,li,b,old,r);
test('conciliação completa gera minuta de integração permitida',()=>{
 const p=go();
 assert.equal(p.ready,true);assert.equal(p.problems.length,0);
 assert.equal(p.accounting_total_cents,265000);
 assert.equal(p.financial_total_cents,25000);assert.equal(p.payable_count,1);
 assert.equal(p.provisional_reclassifications.length,2);
 assert.equal(p.lines.find(x=>x.event_code==='FERIAS_GOZO'&&x.side==='D').account_id,'FERIAS_CLEAR');
 assert.equal(p.lines.find(x=>x.event_code==='TERCO_FERIAS'&&x.side==='D').account_id,'TERCO_CLEAR');
 assert.equal(p.lines.find(x=>x.event_code==='ADIANTAMENTO_FERIAS'&&x.side==='D').account_id,'ADV_DEB');
});
test('adiantamento não é emitido como segundo título',()=>assert.equal(go().financial_total_cents,25000));
test('diário compartilhado é permitido se conciliado por centro de custo',()=>{
 const links=copy(posted);links[0].posting_gl_verified=true;links[0].gl_credit_cents=190000;
 assert.equal(go(pkg,ledger,detail,links).ready,true);
});
test('diário compartilhado sem conferência do total por centro é bloqueado',()=>{
 const links=copy(posted);links[0].posting_gl_verified=false;
 assert.ok(go(pkg,ledger,detail,links).problems.some(x=>x.code==='PROVISION_JOURNAL_UNALLOCATED'));
});
test('diário de baixa anulado impede contabilização',()=>{
 const links=copy(posted);links[0].journal_status='VOID';
 assert.ok(go(pkg,ledger,detail,links).problems.some(x=>x.code==='PROVISION_JOURNAL_UNALLOCATED'));
});
test('baixa de provisão sem vínculo à ocorrência',()=>{
 const l=copy(ledger);l.items[0].components[0].linked_to_occurrence=false;
 assert.ok(go(pkg,l).problems.some(x=>x.code==='USE_NOT_LINKED'));
});
test('adiantamento ainda não vinculado ao financeiro',()=>{
 const p=copy(pkg);p.sources[0].advance_evidence.payment_verified=false;
 assert.ok(go(p).problems.some(x=>x.code==='EMPLOYEE_ADVANCE_UNVERIFIED'));
});
test('desconto do adiantamento deve equivaler férias e terço',()=>{
 const d=copy(detail);d.envelopes[0].lines[2].amount_cents=119999;
 assert.ok(go(pkg,ledger,d).problems.some(x=>x.code==='ADVANCE_OFFSET_MISMATCH'));
});
test('lote fechado bloqueia',()=>assert.ok(go(pkg,ledger,detail,posted,{id:'batch',status:'CLOSED'}).problems.some(x=>x.code==='BATCH_CLOSED')));
test('folha anterior bloqueia',()=>{
 const d=copy(detail);d.run.status='REVIEWED';
 assert.ok(go(pkg,ledger,d).problems.some(x=>x.code==='MONTHLY_NOT_APPROVED'));
});
test('revisão alterada bloqueia',()=>{
 const d=copy(detail);d.run.source_fingerprint='different';
 assert.ok(go(pkg,ledger,d).problems.some(x=>x.code==='SNAPSHOT_CHANGED'));
});
test('folha contabilizada anteriormente bloqueia',()=>{
 assert.ok(go(pkg,ledger,detail,posted,batch,{run_id:'R1'}).problems.some(x=>x.code==='ALREADY_POSTED'));
});
test('não aprova divergência de fechamento mensal',()=>{
 const r=copy(review);r.problems=[{code:'REVIEW_INVALID'}];
 assert.ok(go(pkg,ledger,detail,posted,batch,null,r).problems.some(x=>x.code==='MONTHLY_NOT_APPROVED'));
});
test('valor do líquido residual precisa fechar com envelopes',()=>{
 const d=copy(detail);d.totals.net_cents=26000;
 assert.ok(go(pkg,ledger,d).problems.some(x=>x.code==='PAYABLE_TOTAL_MISMATCH'));
});
test('saldo insuficiente legado não bloqueia quando a baixa integral foi posta',()=>{
 const p=copy(pkg);p.problems=[{code:'SALDO_PROVISAO_INSUFICIENTE',message:'Saldo após baixa'}];
 const l=copy(ledger);l.problems=copy(p.problems);
 assert.equal(go(p,l).ready,true);
});
test('conta transitória inválida na conciliação patronal bloqueia',()=>{
 const links=copy(posted);links[0].gl_credit_account_id=null;
 assert.ok(go(pkg,ledger,detail,links).problems.some(x=>x.code==='PROVISION_JOURNAL_UNALLOCATED'));
});
test('não altera a memória original dos eventos',()=>{
 const p=copy(pkg);
 const snapshot=JSON.stringify(p);
 go(p);
 assert.equal(JSON.stringify(p),snapshot);
});
