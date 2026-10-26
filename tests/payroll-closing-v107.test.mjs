// Testes de regressao da auditoria somente-leitura de fechamento mensal SAGAS v107.
// Executar: node --test tests/payroll-closing-v107.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { payrollMonthlyEndToEnd69 } from '../sagas-payroll-closing69.js';

function scenario(patch={}){
 const run={id:'run1',competence:'2026-10',revision:1,status:'APPROVED',source_fingerprint:'snapshot1'};
 const record={journal_entry_id:'je1',payable_count:1,payable_total_cents:10000,
  source_fingerprint:'snapshot1',journal_status:'POSTED',source_module:'PAYROLL',
  source_reference:'MONTHLY:run1',total_debit_cents:12000,total_credit_cents:12000};
 const titles={link_count:1,payable_count:1,employee_count:1,total_cents:10000,invalid_count:0};
 const lines=[{side:'D',cost_center_id:'cc1',total_cents:12000,lines:2},
  {side:'C',cost_center_id:'cc1',total_cents:12000,lines:2}];
 const data={run,record,titles,lines,cycle:null,posting:null,useHistory:{total_count:0,pending_count:0},
  usePostings:[],finance:{integrated:true,existing:{journal_entry_id:'je1'},
   problems:[{code:'LOTE_PENDENTE',message:'Lote posteriormente fechado.'}],ready:false},
  employer:{totals:{total_cents:1000}},
  provision:{totals:{vacation_cents:1000,vacation_third_cents:334,thirteenth_cents:1000},
   unresolved_employee_count:0},accrual:{ready:false,problems:[{code:'CYCLE_MISSING',message:'Sem constituicao.'}]},
  uses:{ready:false,problems:[{code:'NO_MOVEMENTS',message:'Sem baixas.'}]},...patch};
 const queries=[];
 const DB={prepare(sql){
  return {bind(...params){
   const first=async()=>{
    queries.push({sql,params,kind:'first'});
    if(sql.includes('FROM payroll_finance_postings37 p'))return data.record;
    if(sql.includes('FROM payroll_finance_payables37 l'))return data.titles;
    if(sql.includes('FROM payroll_provision_cycles43'))return data.cycle;
    if(sql.includes('FROM payroll_provision_postings45 p LEFT JOIN journal_entries'))return data.posting;
    if(sql.includes('FROM payroll_provision_movements43 m LEFT JOIN payroll_provision_posted_movements45 l'))
     return data.useHistory;
    throw Error('SQL first inesperado: '+sql);
   };
   const all=async()=>{
    queries.push({sql,params,kind:'all'});
    if(sql.includes('FROM journal_lines WHERE'))return {results:data.lines};
    if(sql.includes('FROM payroll_provision_postings45 WHERE'))return {results:data.usePostings};
    throw Error('SQL all inesperado: '+sql);
   };
   return {first,all};
  }};
 }};
 const d={
  HttpError:class extends Error{},
  requirePermission:async()=>{},
  detail:async()=>({run:data.run,envelopes:[{employee_id:'e1',net_cents:10000,cost_center_id:'cc1'}],
   totals:{net_cents:10000}}),
  conference:async()=>({approved:true,review:{closed_at:'2026-10-26'},problems:[]}),
  finance:async()=>data.finance,employer:async()=>data.employer,provision:async()=>data.provision,
  provisionPosting:async(_competence,kind)=>kind==='ACCRUAL'?data.accrual:data.uses
 };
 return {data,queries,run:()=>payrollMonthlyEndToEnd69({env:{DB},companyId:'co1',
  auth:{user:{id:'u1'}},runId:'run1',d})};
}
const section=(r,id)=>r.sections.find(x=>x.id===id);

test('integracao historica valida nao e bloqueada por previa de lote fechado',async()=>{
 const s=scenario(),r=await s.run();
 assert.equal(section(r,'FINANCEIRO').status,'CONCLUIDO');
 assert.equal(section(r,'BAIXAS').status,'SEM_MOVIMENTOS');
 assert.equal(r.read_only,true);
 assert.equal(r.monthly_operational_ready,false);
});
test('titulo cancelado impede financeiro concluido',async()=>{
 const s=scenario({titles:{link_count:1,payable_count:1,employee_count:1,total_cents:10000,invalid_count:1}});
 const r=await s.run();
 assert.equal(section(r,'FINANCEIRO').status,'PENDENTE');
 assert.ok(section(r,'FINANCEIRO').problems.some(p=>p.code==='FINANCE_TOTALS_MISMATCH'));
});
test('partidas nao equilibradas por centro de custo impedem fechamento',async()=>{
 const s=scenario({lines:[
  {side:'D',cost_center_id:'cc1',total_cents:12000,lines:2},
  {side:'C',cost_center_id:'cc1',total_cents:11000,lines:2}
 ]});
 const r=await s.run();
 assert.equal(section(r,'FINANCEIRO').status,'PENDENTE');
 assert.ok(section(r,'FINANCEIRO').problems.some(p=>p.code==='FINANCE_JOURNAL_UNBALANCED'));
});
test('baixa documentada mas nao postada nao pode ser considerada concluida',async()=>{
 const s=scenario({useHistory:{total_count:1,pending_count:1},
  uses:{ready:true,problems:[],movement_count:1}});
 const r=await s.run();
 assert.equal(section(r,'BAIXAS').status,'PRONTO');
 assert.equal(section(r,'BAIXAS').summary.pending_count,1);
 assert.equal(r.monthly_operational_ready,false);
});
test('origem financeira de outra revisao fica bloqueada',async()=>{
 const s=scenario({record:{journal_entry_id:'je1',payable_count:1,payable_total_cents:10000,
   source_fingerprint:'outro',journal_status:'POSTED',source_module:'PAYROLL',
   source_reference:'MONTHLY:run1',total_debit_cents:12000,total_credit_cents:12000}});
 const r=await s.run();
 assert.ok(section(r,'FINANCEIRO').problems.some(p=>p.code==='FINANCE_SOURCE_CHANGED'));
});
