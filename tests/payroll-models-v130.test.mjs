import test from 'node:test';
import assert from 'node:assert/strict';
import {FORMULA_MODELS130,normalize129,payrollFormulas129} from '../sagas-payroll-formulas129.js';
import {compilePayrollSql128} from '../sagas-payroll-sql128.js';

class HttpError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code;}}
const d={HttpError};
function context(existing=[]){
 const batched=[],actions=[],permissions=[],queries=[];
 let counter=0;
 const DB={prepare(sql){
  return {bind(...params){
   queries.push({sql,params});
   return {all:async()=>({results:sql.startsWith('SELECT code FROM payroll_formulas129')?
     existing.map(code=>({code})):[]}),first:async()=>null};
  }};
 },batch:async statements=>{batched.push(statements.length);return statements.map(()=>({meta:{changes:1}}))}};
 return {batched,actions,permissions,queries,
  ctx:{env:{DB},companyId:'C1',auth:{user:{id:'U1'}},request:{},
   body:{effective_from:'2026-10'},
   d:{HttpError,uuid:()=>String(++counter),audit:async(_env,v)=>actions.push(v),
    ensureSchemaRevision:async()=>{},requirePermission:async(_env,_uid,_cid,name)=>permissions.push(name)}}};
}
test('modelos basicos sao sete, validados e armazenados como SQL seguro',()=>{
 assert.equal(FORMULA_MODELS130.length,7);
 assert.equal(new Set(FORMULA_MODELS130.map(m=>m.code)).size,7);
 for(const model of FORMULA_MODELS130){
  const p=normalize129({...model,calculation:'SQL_PERSONALIZADO',effective_from:'2026-10'},d);
  const compiled=compilePayrollSql128(p.source.sql_query);
  assert.ok(compiled.sql.startsWith('SELECT '));
  assert.ok(compiled.sql.endsWith(' AS VALOR'));
  assert.ok(!compiled.sql.includes(' FROM '));
  assert.ok(p.sql_variables.length>0);
 }
});
test('importacao cria modelos e revisoes no mesmo lote, apenas mediante comando',async()=>{
 const t=context();
 const out=await payrollFormulas129('import-models',t.ctx);
 assert.equal(out.imported,7);
 assert.equal(out.skipped,0);
 assert.deepEqual(t.batched,[14]);
 assert.deepEqual(t.permissions,['payroll.manage']);
 assert.equal(t.actions.length,1);
 assert.equal(t.actions[0].action,'IMPORT');
 assert.equal(t.actions[0].after.effective_from,'2026-10');
});
test('importacao preserva formulas existentes e so insere ausentes',async()=>{
 const t=context(['SALARIO_BASE','TERCO_FERIAS','FORMULA_CUSTOM']);
 const out=await payrollFormulas129('import-models',t.ctx);
 assert.equal(out.imported,5);
 assert.equal(out.skipped,2);
 assert.deepEqual(t.batched,[10]);
});
test('repetir importacao com todos os modelos existentes nao altera o D1',async()=>{
 const t=context(FORMULA_MODELS130.map(x=>x.code));
 const out=await payrollFormulas129('import-models',t.ctx);
 assert.equal(out.imported,0);
 assert.equal(out.skipped,7);
 assert.equal(t.batched.length,0);
 assert.equal(t.actions.length,0);
});
test('vigencia invalida impede a importacao',async()=>{
 const t=context();
 t.ctx.body.effective_from='2026-00';
 await assert.rejects(()=>payrollFormulas129('import-models',t.ctx),/Competencia invalida/);
 assert.equal(t.batched.length,0);
});
