import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollThirteenth71} from '../sagas-payroll-thirteenth71.js';

function mock(){
 const writes=[],saved=[],logs=[];
 const employee={id:'employee1',name:'Funcionário',admission_date:'2026-01-01',active:1,
  cost_center_id:'cc1',cost_center_code:'001',employee_number:1,salary_cents:300000,situation:'ATIVO'};
 const context={
  env:{DB:{
   prepare(sql){return {bind(...params){
    return {
     all:async()=>{
      if(sql.includes('FROM payroll_employees e LEFT JOIN'))return {results:[employee]};
      if(sql.includes('FROM payroll_employee_occurrences'))return {results:[]};
      if(sql.includes('FROM payroll_movements m JOIN'))return {results:[]};
      if(sql.includes('FROM payroll_employee_dependents'))return {results:[]};
      if(sql.includes('FROM payroll_thirteenth_advances70 WHERE'))return {results:[]};
      if(sql.includes('FROM payroll_thirteenth_runs71 WHERE'))return {results:saved};
      throw Error('SQL inesperado em all: '+sql);
     },
     first:async()=>{
      if(sql.includes('FROM payroll_thirteenth_runs71 WHERE company_id=? AND id=?'))
       return saved.find(r=>r.id===params[1])||null;
      throw Error('SQL inesperado em first: '+sql);
     },
     run:async()=>{writes.push({sql,params});return {meta:{changes:1}}},
    };
   }}},
   batch:async(statements)=>{logs.push(statements);return statements.map(()=>({success:true}))}
  }},
  companyId:'company1',auth:{user:{id:'user1'}},request:{},year:'2026',phase:'FIRST',
  d:{
   HttpError:class HttpError extends Error{
    constructor(status,message,code){super(message);this.status=status;this.code=code}
   },
   requirePermission:async()=>{},ensureSchemaRevision:async()=>{},audit:async()=>{},
   uuid:()=>String('id-'+(logs.length+1)),
   hash:async o=>JSON.stringify(o),
   taxes:()=>({inss_cents:0,irrf_cents:0,inss_table_from:'2026-01',irrf_table_from:'2026-01'})
  }
 };
 return {context,writes,saved,logs};
}
test('registrar calculo de 13 cria memoria e envelopes mas nao cria financeiro',async()=>{
 const t=mock();
 const preview=await (await import('../sagas-payroll-thirteenth70.js')).payrollThirteenth70('preview',t.context);
 t.context.body={
  year:'2026',phase:'FIRST',source_fingerprint:preview.source_fingerprint,confirmation:'CALCULAR 13'
 };
 const result=await payrollThirteenth71('calculate',t.context);
 assert.equal(result.created,true);
 assert.equal(result.employee_count,1);
 assert.equal(result.totals.advance_cents,150000);
 assert.equal(result.financial_generated,false);
 assert.equal(result.accounting_generated,false);
 assert.equal(t.logs.length,1);
 assert.equal(t.logs[0].length,2);
});
test('bloqueia calculo com previa desatualizada',async()=>{
 const t=mock();
 t.context.body={year:'2026',phase:'FIRST',source_fingerprint:'desatualizado',confirmation:'CALCULAR 13'};
 await assert.rejects(()=>payrollThirteenth71('calculate',t.context),e=>e.code==='PREVIEW_STALE');
 assert.equal(t.logs.length,0);
});
test('nao aprova processamento sem confirmacao expressa',async()=>{
 const t=mock();
 await assert.rejects(()=>payrollThirteenth71('approve',{...t.context,
  body:{run_id:'run1',confirmation:'errado'}}),e=>e.code==='CONFIRMATION_REQUIRED');
});
test('historico retorna lista do ano e fase sem efeitos financeiros',async()=>{
 const t=mock(),result=await payrollThirteenth71('history',t.context);
 assert.equal(result.year,'2026');
 assert.deepEqual(result.runs,[]);
 assert.equal(t.writes.length,0);
});
