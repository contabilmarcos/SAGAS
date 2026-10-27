import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnose118} from '../sagas-payroll-termination118.js';
const fields={
 employee:{id:'e1',code:'00001',name:'Ana',cost_center_id:'cc1'},
 termination_date:'2026-10-27',termination_kind:'WITHOUT_CAUSE',notice_kind:'INDEMNIFIED',
 source_fingerprint:'tax/current',documentary_ready:true,deduction_ready:true,
 tax_ready_for_review:true,full_gross_reference_cents:500000,
 deductions_total_cents:100000,net_reference_cents:400000,fgts_fine_reference_cents:50000,
 amounts:{vacation_proportional_cents:40000,vacation_accrued_unpaid_cents:60000,
 vacation_third_cents:13333,vacation_accrued_third_cents:20000,
 thirteenth_cents:90000,thirteenth_notice_projection_cents:10000},
 problems:[],documentary_issues:[],tax_issues:[]
};
const rows=[
 {component:'FERIAS',opening_cents:30000,accrued_cents:70000,used_cents:10000,balance_cents:90000},
 {component:'TERCO_FERIAS',opening_cents:0,accrued_cents:40000,used_cents:0,balance_cents:40000},
 {component:'DECIMO_TERCEIRO',opening_cents:0,accrued_cents:80000,used_cents:0,balance_cents:80000}
];
const linked=rows.map(x=>({component:x.component,pending_count:0}));
const mapping=rows.map(x=>({component:x.component,active:1,synthetic_analytic:'ANALYTIC',
 account_rules:['D','C'].map(side=>({side,account_id:'a'+side,cost_center_id:null,percentage:100,account_active:1,account_analytic:1}))}));
const workpaper={source_fingerprint:'tax/current'};
const run=(review=fields,ledger=rows,posts=linked,maps=mapping,memo=workpaper)=>diagnose118(review,ledger,posts,maps,memo);
test('valida uso referencial e cobertura sem fazer baixas',()=>{
 const x=run();
 assert.equal(x.financial.net_reference_cents,400000);
 assert.equal(x.provision_items[0].target_cents,100000);
 assert.equal(x.provision_items[0].proposed_use_cents,90000);
 assert.equal(x.provision_items[0].uncovered_reference_cents,10000);
 assert.equal(x.provision_items[1].proposed_use_cents,33333);
 assert.equal(x.provision_items[2].uncovered_reference_cents,20000);
 assert.equal(x.total_blocks,0);
 assert.equal(x.ready_for_closing,false);
 assert.equal(x.ready_for_posting,false);
 assert.equal(x.financial_generated,false);
 assert.equal(x.accounting_generated,false);
});
test('erro no total historico da provisao bloqueia',()=>{
 const bad=rows.map(x=>({...x}));bad[0].balance_cents=100000;
 assert.ok(run(fields,bad).blocks.some(x=>x.code==='LEDGER_TOTAL_MISMATCH'));
});
test('saldo negativo bloqueia mesmo se direitos positivos',()=>{
 const bad=rows.map(x=>({...x}));bad[0].balance_cents=-1000;
 assert.ok(run(fields,bad).blocks.some(x=>x.code==='LEDGER_NEGATIVE'));
});
test('sem tabela de links contabeis não considera contabilizado',()=>{
 const x=run(fields,rows,null);
 assert.equal(x.provision_accounting_checked,false);
 assert.ok(x.blocks.some(y=>y.code==='POSTINGS_UNAVAILABLE'));
});
test('movimento de provisao ainda nao contabilizado bloqueia',()=>{
 const l=linked.map(x=>({...x}));l[1].pending_count=1;
 assert.ok(run(fields,rows,l).blocks.some(x=>x.code==='PROVISION_ACCOUNTING_NOT_VERIFIED'));
});
test('sem provisões constituídas não inventa passivo',()=>{
 const x=run(fields,[]);
 assert.ok(x.blocks.some(y=>y.code==='LEDGER_EMPTY'));
 assert.ok(x.blocks.some(y=>y.code==='LEDGER_COMPONENT_MISSING'));
});
test('conciliação tributária pendente bloqueia financeiro',()=>{
 const x=run({...fields,tax_ready_for_review:false,deduction_ready:false,net_reference_cents:null});
 assert.ok(x.blocks.some(y=>y.code==='TAX_REVIEW_PENDING'));
 assert.ok(x.blocks.some(y=>y.code==='DEDUCTIONS_PENDING'));
});
test('não aceita líquido incoerente com descontos',()=>{
 assert.ok(run({...fields,net_reference_cents:410000}).blocks.some(y=>y.code==='NET_MISMATCH'));
});
test('revisao do workpaper tributario desatualizada',()=>{
 const x=run(fields,rows,linked,mapping,{source_fingerprint:'old'});
 assert.equal(x.tax_workpaper_recorded,false);
 assert.ok(x.blocks.some(y=>y.code==='TAX_WORKPAPER_MISSING'));
});
test('natureza inexistente ou inativa impede preparo',()=>{
 const x=run(fields,rows,linked,mapping.slice(1));
 assert.ok(x.blocks.some(y=>y.code==='USE_NATURE_MISSING'));
});
test('contas de natureza necessitam 100% e dois lados por centro de custo',()=>{
 const m=mapping.map(x=>({...x,account_rules:x.account_rules.map(a=>({...a}))}));
 m[0].account_rules[0].percentage=80;
 assert.ok(run(fields,rows,linked,m).blocks.some(y=>y.code==='USE_ACCOUNT_MAPPING_INVALID'));
});
test('natureza tem precedência por centro de custo',()=>{
 const m=mapping.map(x=>({...x,account_rules:x.account_rules.map(a=>({...a}))}));
 m[0].account_rules.push({side:'D',account_id:'cc-specific',cost_center_id:'cc1',percentage:100,account_active:1,account_analytic:1});
 assert.ok(!run(fields,rows,linked,m).blocks.some(y=>y.code==='USE_ACCOUNT_MAPPING_INVALID'));
});
test('bloqueio de origem continua visível, sem liberar fechamento',()=>{
 const x=run({...fields,problems:[{code:'OCCURRENCES',message:'Férias e faltas pendentes'}]});
 assert.ok(x.blocks.some(y=>y.code==='SOURCE_OCCURRENCES'));
 assert.equal(x.ready_for_closing,false);
});
test('fgts sem valor de referência permanece bloqueado',()=>{
 const x=run({...fields,fgts_fine_reference_cents:null});
 assert.ok(x.blocks.some(y=>y.code==='FGTS_NOT_ATTESTED'));
});
test('saldos e problemas sao separados por funcionario na previda pura',()=>{
 const x=run({...fields,employee:{...fields.employee,id:'e2'}});
 assert.equal(x.employee.id,'e2');
 assert.equal(x.financial.payable_created,false);
});
