import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollTermination114,noticeDays114,twelfths114,vacationTwelfths114} from '../sagas-payroll-termination114.js';

function setup({salary=300000,variable=false,occurrence=false,paidMonthly=false,advance=false,oldSalary=false}={}){
 const writes=[],queries=[],audits=[];
 const person={id:'emp1',name:'Empregada de teste',admission_date:'2025-01-01',
  active:1,cost_center_id:'cc1',cost_center_code:'001',center_active:1,
  employee_number:1,salary_cents:oldSalary?null:salary,situation:'ATIVO'};
 const env={DB:{prepare(sql){
  return {bind(...values){
   queries.push({sql,values});
   return {first:async()=>{
    if(sql.includes('FROM payroll_employees e LEFT JOIN'))return person;
    if(sql.includes('FROM payroll_termination_previews114 WHERE company_id=? AND employee_id=? AND termination_date=?'))return null;
    throw Error('Unexpected first: '+sql);
   },all:async()=>{
    if(sql.includes('FROM payroll_employee_occurrences WHERE')&&sql.includes('kind='))return {results:[]};
    if(sql.includes('FROM payroll_employee_occurrences WHERE'))return {results:occurrence?[{kind:'FALTA'}]:[]};
    if(sql.includes('FROM payroll_movements m JOIN'))return {results:variable?[{id:'v1'}]:[]};
    if(sql.includes('FROM payroll_thirteenth_advances70'))return {results:advance?[{id:'ext1',amount_cents:150000}]:[]};
    if(sql.includes('FROM payroll_thirteenth_runs71'))return {results:[]};
    if(sql.includes('FROM payroll_provision_movements43'))return {results:[
     {component:'FERIAS',balance_cents:300000},
     {component:'DECIMO_TERCEIRO',balance_cents:100000}]};
    if(sql.includes('FROM payroll_calc_envelopes e JOIN'))return {results:paidMonthly?[{run_id:'monthly1'}]:[]};
    throw Error('Unexpected all: '+sql);
   },run:async()=>{writes.push({sql,values});return {meta:{changes:1}}}};
  }};
 },batch:async()=>{throw Error('schema mocked')}}};
 const d={HttpError:class HttpError extends Error{constructor(status,message,code){super(message);this.code=code;this.status=status}},
  ensureSchemaRevision:async()=>{},requirePermission:async()=>{},
  hash:async v=>JSON.stringify(v),uuid:()=>'draft-uuid',audit:async(...args)=>audits.push(args)
 };
 const c={env,companyId:'company1',auth:{user:{id:'user1'}},request:{},d,body:{
  employee_id:'emp1',termination_date:'2026-10-27',kind:'WITHOUT_CAUSE',notice_kind:'INDEMNIFIED'
 }};
 return {c,writes,queries,audits};
}
test('aviso proporcional cresce por ano, limitado a 90 dias',()=>{
 assert.equal(noticeDays114('2026-01-01','2026-10-27'),30);
 assert.equal(noticeDays114('2025-01-01','2026-10-27'),33);
 assert.equal(noticeDays114('2022-01-01','2026-10-27'),42);
 assert.equal(noticeDays114('1990-01-01','2026-10-27'),90);
});
test('13º proporcional com corte de 15 dias, sem arredondar adiantamento',()=>{
 assert.equal(twelfths114('2026-10-18','2026-10-31','2026'),0);
 assert.equal(twelfths114('2026-10-17','2026-10-31','2026'),1);
 assert.equal(twelfths114('2025-01-01','2026-10-27','2026'),10);
});
test('férias proporcionais respeitam aniversário aquisitivo e fração de 15 dias',()=>{
 assert.equal(vacationTwelfths114('2026-10-18','2026-10-31').avos,0);
 assert.equal(vacationTwelfths114('2026-10-17','2026-10-31').avos,1);
 assert.equal(vacationTwelfths114('2025-05-12','2026-05-11').avos,12);
});
test('prévia não paga, não contabiliza e não altera cadastro',async()=>{
 const x=setup(),p=await payrollTermination114('preview',x.c);
 assert.equal(p.termination_kind,'WITHOUT_CAUSE');
 assert.equal(p.amounts.salary_balance_cents,270000);
 assert.equal(p.amounts.thirteenth_avos,10);
 assert.equal(p.amounts.thirteenth_cents,250000);
 assert.equal(p.amounts.notice_days,33);
 assert.equal(p.amounts.notice_indemnity_cents,330000);
 assert.equal(p.amounts.net_cents,null);
 assert.equal(p.ready_for_closing,false);
 assert.equal(p.financial_generated,false);
 assert.ok(p.problems.some(x=>x.code==='FGTS_STATEMENT'));
 assert.equal(x.writes.length,0);
});
test('histórico variável, ausências, adiantamento e folha já calculada geram bloqueios',async()=>{
 const x=setup({variable:true,occurrence:true,advance:true,paidMonthly:true});
 const p=await payrollTermination114('preview',x.c);
 const codes=p.problems.map(x=>x.code);
 assert.ok(codes.includes('VARIABLE_EARNINGS'));
 assert.ok(codes.includes('OCCURRENCES'));
 assert.ok(codes.includes('THIRTEENTH_ADVANCE'));
 assert.ok(codes.includes('MONTHLY_ALREADY_APPROVED'));
});
test('sem salário histórico não inventa valor líquido ou proporcional',async()=>{
 const x=setup({oldSalary:true}),p=await payrollTermination114('preview',x.c);
 assert.equal(p.amounts,null);
 assert.ok(p.problems.some(x=>x.code==='SALARY_HISTORY'));
});
test('registra DRAFT versionado, mas não gera financeiro nem desligamento',async()=>{
 const x=setup(),p=await payrollTermination114('preview',x.c);
 x.c.body={...x.c.body,confirmation:'REGISTRAR PREVIA RESCISAO',source_fingerprint:p.source_fingerprint};
 const result=await payrollTermination114('calculate',x.c);
 assert.equal(result.created,true);
 assert.equal(result.status,'DRAFT');
 assert.equal(result.employee_status_changed,false);
 assert.equal(result.financial_generated,false);
 assert.equal(x.writes.length,1);
 assert.ok(x.writes[0].sql.includes('payroll_termination_previews114'));
});
test('prévia desatualizada não pode ser registrada',async()=>{
 const x=setup();
 x.c.body={...x.c.body,confirmation:'REGISTRAR PREVIA RESCISAO',source_fingerprint:'OLD'};
 await assert.rejects(()=>payrollTermination114('calculate',x.c),e=>e.code==='PREVIEW_CHANGED');
 assert.equal(x.writes.length,0);
});
test('data anterior à admissão é rejeitada',async()=>{
 const x=setup();x.c.body.termination_date='2024-12-31';
 await assert.rejects(()=>payrollTermination114('preview',x.c),e=>e.code==='DATE_BEFORE_ADMISSION');
});

test('dispensa sem justa causa não aceita aviso dispensado sem indenização',async()=>{
 const x=setup();x.c.body.notice_kind='WAIVED';
 await assert.rejects(()=>payrollTermination114('preview',x.c),e=>e.code==='NOTICE_TYPE');
});
test('aviso indenizado que cruza ano gera bloqueio de 13º separado',async()=>{
 const x=setup();x.c.body.termination_date='2026-12-20';
 const p=await payrollTermination114('preview',x.c);
 assert.ok(p.problems.some(x=>x.code==='NOTICE_CROSS_YEAR'));
 assert.equal(p.ready_for_closing,false);
});
