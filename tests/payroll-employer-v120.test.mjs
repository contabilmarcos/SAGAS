import test from 'node:test';
import assert from 'node:assert/strict';
import {compose120,split120} from '../sagas-payroll-employer120.js';
const run={id:'run-1',competence:'2026-10',status:'APPROVED',source_fingerprint:'monthly-001'};
const base={
 items:[
  {employee_id:'e1',employee_code:'00001',cost_center_id:'cc1',cpp_cents:20000,rat_cents:1000,thirds_cents:5800,pis_cents:1000},
  {employee_id:'e2',employee_code:'00002',cost_center_id:'cc2',cpp_cents:10000,rat_cents:500,thirds_cents:2900,pis_cents:500}
 ],
 totals:{cpp_cents:30000,rat_cents:1500,thirds_cents:8700,pis_cents:1500,total_cents:41700}
};
const mappings=['CPP','RAT','THIRDS','PIS'].map(component=>({
 component,nature_id:component,active:1,synthetic_analytic:'ANALYTIC',supplier_id:'gov',
 supplier_active:1
}));
const accounts=mappings.map(m=>({nature_id:m.nature_id,rules:[
 {side:'D',account_id:m.component+'-expense',percentage:100,account_active:1,account_analytic:1},
 {side:'C',account_id:m.component+'-liability',percentage:100,account_active:1,account_analytic:1}
]}));
const centers=['cc1','cc2'].map(cost_center_id=>({cost_center_id,active:1}));
const batch={id:'batch',status:'OPEN'};
const monthly={source_fingerprint:'monthly-001',journal_status:'POSTED'};
const copy=x=>JSON.parse(JSON.stringify(x));
const go=(b=base,r=run,m=mappings,a=[...accounts,...centers],bt=batch,mon=monthly,old=null)=>compose120(b,r,m,a,bt,mon,old);
test('patronal por CC monta diario com mesmo valor no debito e credito',()=>{
 const x=go();
 assert.equal(x.problems.length,0);
 assert.equal(x.total_cents,41700);
 assert.equal(x.lines.filter(r=>r.side==='D').reduce((v,r)=>v+r.amount_cents,0),41700);
 assert.equal(x.lines.filter(r=>r.side==='C').reduce((v,r)=>v+r.amount_cents,0),41700);
 assert.equal(x.payable_count,4);
 assert.equal(x.financial_generated,false);
});
test('FGTS não entra na dupla contabilização v120',()=>{
 const x=go();assert.equal(x.amount_by_component.FGTS,undefined);
 assert.equal(x.total_cents,30000+1500+8700+1500);
});
test('somente revisão fechada',()=>{
 assert.ok(go(base,{...run,status:'REVIEWED'}).problems.some(x=>x.code==='RUN_NOT_CLOSED'));
});
test('folha com ferias nao integra por atalho',()=>{
 assert.ok(go(base,{...run,source_fingerprint:'VACATION100:snapshot'}).problems.some(x=>x.code==='VACATION_NOT_HOMOLOGATED'));
});
test('exige folha mensal contabilizada',()=>{
 assert.ok(go(base,run,mappings,[...accounts,...centers],batch,null).problems.some(x=>x.code==='MONTHLY_NOT_ACCOUNTED'));
});
test('fonte contábil mensal não pode estar alterada',()=>{
 assert.ok(go(base,run,mappings,[...accounts,...centers],batch,{source_fingerprint:'wrong',journal_status:'POSTED'}).problems.some(x=>x.code==='MONTHLY_NOT_ACCOUNTED'));
});
test('lote fechado bloqueia',()=>{
 assert.ok(go(base,run,mappings,[...accounts,...centers],{id:'batch',status:'CLOSED'}).problems.some(x=>x.code==='BATCH_CLOSED'));
});
test('origem já integrada bloqueia duplicação',()=>{
 assert.ok(go(base,run,mappings,[...accounts,...centers],batch,monthly,{journal_entry_id:'j'}).problems.some(x=>x.code==='ALREADY_INTEGRATED'));
});
test('natureza ou credor ausente gera bloqueio',()=>{
 assert.ok(go(base,run,mappings.slice(1)).problems.some(x=>x.code==='CONFIG_REQUIRED'));
});
test('centro de custo histórico ausente',()=>{
 const b=copy(base);b.items[0].cost_center_id=null;
 assert.ok(go(b).problems.some(x=>x.code==='CENTER_MISSING'));
});
test('conta sintética ou inativa não aceita',()=>{
 const a=copy(accounts);a[0].rules[0].account_analytic=0;
 assert.ok(go(base,run,mappings,[...a,...centers]).problems.some(x=>x.code==='ACCOUNT_MAPPING_INVALID'));
});
test('valor divergente entre envelopes e total de guia',()=>{
 const b=copy(base);b.totals.cpp_cents=30500;
 assert.ok(go(b).problems.some(x=>x.code==='ENVELOPE_TOTAL_MISMATCH'));
});
test('natureza não debita e credita na mesma conta',()=>{
 const a=copy(accounts);a[0].rules[1].account_id=a[0].rules[0].account_id;
 assert.ok(go(base,run,mappings,[...a,...centers]).problems.some(x=>x.code==='SAME_ACCOUNT'));
});
test('rateio 60 40 distribui com arredondamento seguro',()=>{
 const p=[];
 const lines=split120([{side:'D',account_id:'A',percentage:60,account_active:1,account_analytic:1},
  {side:'D',account_id:'B',percentage:40,account_active:1,account_analytic:1}],'D','cc1',101,'CPP',p);
 assert.deepEqual(lines.map(x=>x.amount_cents),[61,40]);assert.equal(p.length,0);
});
test('configuração específica CC prevalece sobre geral',()=>{
 const p=[];
 const lines=split120([{side:'D',account_id:'GEN',percentage:100,account_active:1,account_analytic:1},
  {side:'D',account_id:'CC',cost_center_id:'cc1',percentage:100,account_active:1,account_analytic:1}],'D','cc1',1000,'CPP',p);
 assert.equal(lines[0].account_id,'CC');assert.equal(p.length,0);
});
test('somente componentes positivos geram títulos',()=>{
 const b=copy(base);b.items.forEach(x=>x.pis_cents=0);b.totals.pis_cents=0;b.totals.total_cents=40200;
 const x=go(b);assert.equal(x.payable_count,3);assert.equal(x.total_cents,40200);
});
