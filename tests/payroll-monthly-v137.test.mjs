import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAutomaticMonthly137,calculateAutomaticMonthly137} from '../sagas-payroll-monthly137.js';

const cfg=(code,category='PROVENTO',extra={})=>({
 code,name:code,active:true,trigger:'AUTOMATICO',category,
 calculation:'PERCENTUAL_BASE',base:'SALARIO_BASE',rate:10,
 nature_id:'N_'+code,incidences:{inss:'SIM',irrf:'SIM',fgts:'SIM'},...extra
});
const dbFor=(rules=[])=>{
 const calls=[];return {calls,prepare(sql){
  assert.ok(sql.startsWith('SELECT '),'Cálculo deve realizar apenas SELECT');
  return {bind(...params){
   calls.push({sql,params});
   return {all:async()=>({results:rules.map((c,i)=>({
    event_id:'E'+i,code:c.code,event_active:1,effective_from:'2026-10',revision:2,
    config_json:JSON.stringify(c)
   }))}),first:async()=>{throw Error('SQL não previsto no teste')}};
  }};
 }};
};
test('folha oficial aceita provento automático e grava versão auditável',async()=>{
 const db=dbFor([cfg('BONUS')]);
 const items=await loadAutomaticMonthly137(db,'COMP','2026-10');
 const lines=await calculateAutomaticMonthly137({
  db,companyId:'COMP',period:'2026-10',items,salaryCents:300000,paidCents:300000,manualCodes:[]});
 assert.equal(lines.length,1);
 assert.equal(lines[0].amount_cents,30000);
 assert.equal(lines[0].line_type,'PROVENTO');
 assert.equal(lines[0].rule_version,'DESIGNER137:2026-10#2');
 assert.equal(lines[0].incidences.inss,'SIM');
 assert.equal(lines[0].nature_id,'N_BONUS');
});
test('desconto automático sem incidências calcula valor e não altera bases',async()=>{
 const db=dbFor([cfg('ADIANTAMENTO','DESCONTO',{
  calculation:'VALOR_FIXO',fixed_cents:10000,
  incidences:{inss:'NAO',irrf:'NAO',fgts:'NAO'}})]);
 const [one]=await loadAutomaticMonthly137(db,'COMP','2026-10');
 const lines=await calculateAutomaticMonthly137({db,companyId:'COMP',period:'2026-10',
  items:[one],salaryCents:300000,paidCents:300000,manualCodes:[]});
 assert.equal(lines[0].amount_cents,10000);
 assert.equal(lines[0].line_type,'DESCONTO');
});
test('evita duplicar evento que já está no movimento manual',async()=>{
 const db=dbFor([cfg('BONUS')]);
 const items=await loadAutomaticMonthly137(db,'COMP','2026-10');
 await assert.rejects(()=>calculateAutomaticMonthly137({db,companyId:'COMP',period:'2026-10',
  items,salaryCents:300000,paidCents:300000,manualCodes:['BONUS']}),/lançado manualmente/);
});
test('não aceita desconto com reflexo fiscal sem regra especial',async()=>{
 const db=dbFor([cfg('FALTA_ESPECIAL','DESCONTO')]);
 await assert.rejects(()=>loadAutomaticMonthly137(db,'COMP','2026-10'),/reflexos tributários/);
});
test('não aceita evento sem natureza para futura contabilização',async()=>{
 const db=dbFor([cfg('BONUS','PROVENTO',{nature_id:null})]);
 await assert.rejects(()=>loadAutomaticMonthly137(db,'COMP','2026-10'),/natureza orçamentária/);
});
test('ignora eventos técnicos já calculados no módulo legal',async()=>{
 const db=dbFor([cfg('SALARIO_BASE'),cfg('INSS_EMP','DESCONTO'),cfg('FGTS_PATRONAL','ENCARGO')]);
 const r=await loadAutomaticMonthly137(db,'COMP','2026-10');
 assert.equal(r.length,0);
});
test('valida base salarial permitida para não tratar desconto como fórmula dinâmica',async()=>{
 const db=dbFor([cfg('BONUS','PROVENTO',{base:'BASE_IRRF'})]);
 const r=await loadAutomaticMonthly137(db,'COMP','2026-10');
 await assert.rejects(()=>calculateAutomaticMonthly137({db,companyId:'COMP',period:'2026-10',
  items:r,salaryCents:300000,paidCents:300000,manualCodes:[]}),/não comprovada/);
});
test('só considera versão mais recente por evento dentro da competência',async()=>{
 const db=dbFor([cfg('BONUS')]);
 const r=await loadAutomaticMonthly137(db,'COMP','2026-10');
 assert.equal(r.length,1);
 assert.equal(r[0].revision,2);
});
