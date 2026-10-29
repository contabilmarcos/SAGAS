import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAutomaticMonthly137,calculateAutomaticMonthly137,resolveAutomaticNature137} from '../sagas-payroll-monthly137.js';

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
test('BASE_IRRF utiliza a base efetivamente apurada e não é bloqueada',async()=>{
 const db=dbFor([cfg('BONUS','PROVENTO',{base:'BASE_IRRF'})]);
 const r=await loadAutomaticMonthly137(db,'COMP','2026-10');
 const lines=await calculateAutomaticMonthly137({db,companyId:'COMP',period:'2026-10',
  items:r,salaryCents:300000,paidCents:300000,baseIrrfCents:280000,manualCodes:[]});
 assert.equal(lines.length,1);
 assert.equal(lines[0].amount_cents,28000);
});
test('BASE_IRRF não é presumida quando a fonte não foi informada',async()=>{
 const db=dbFor([cfg('BONUS','PROVENTO',{base:'BASE_IRRF'})]);
 const items=await loadAutomaticMonthly137(db,'COMP','2026-10');
 await assert.rejects(()=>calculateAutomaticMonthly137({db,companyId:'COMP',period:'2026-10',
  items,salaryCents:300000,paidCents:300000,manualCodes:[]}),error=>
  error.code==='AUTO_FORMULA_REFERENCE'&&error.event_code==='BONUS'&&error.base_name==='BASE_IRRF');
});
test('BASE_INSS, BASE_FGTS e TOTAL_PROVENTOS são bases mensais separadas',async()=>{
 const db=dbFor([cfg('BONUS_INSS','PROVENTO',{base:'BASE_INSS'}),
  cfg('BONUS_FGTS','PROVENTO',{base:'BASE_FGTS'}),
  cfg('BONUS_BRUTO','PROVENTO',{base:'TOTAL_PROVENTOS'})]);
 const items=await loadAutomaticMonthly137(db,'COMP','2026-10');
 const lines=await calculateAutomaticMonthly137({db,companyId:'COMP',period:'2026-10',
  items,salaryCents:300000,paidCents:300000,baseInssCents:280000,
  baseIrrfCents:275000,baseFgtsCents:290000,grossCents:310000,manualCodes:[]});
 assert.deepEqual(Object.fromEntries(lines.map(x=>[x.event_code,x.amount_cents])),
  {BONUS_BRUTO:31000,BONUS_FGTS:29000,BONUS_INSS:28000});
});
test('fórmula SQL usa variáveis fiscais mensais já calculadas',async()=>{
 const db=dbFor([cfg('BONUS_SQL','PROVENTO',{
  calculation:'SQL_PERSONALIZADO',base:'SALARIO_CONTRATUAL',
  sql_query:'SELECT ROUND(:BASE_INSS * 0.08 + :BASE_FGTS * 0.02, 2) AS VALOR'
 })]);
 const original=db.prepare;
 db.prepare=(sql)=>{
  if(sql.startsWith('SELECT ROUND(')&&sql.endsWith(' AS VALOR'))return {bind(...args){return {first:async()=>({
   VALOR:Number((args[0]*0.08+args[1]*0.02).toFixed(2))
  })}}};
  return original.call(db,sql);
 };
 const items=await loadAutomaticMonthly137(db,'COMP','2026-10');
 const lines=await calculateAutomaticMonthly137({db,companyId:'COMP',period:'2026-10',
  items,salaryCents:300000,paidCents:300000,baseInssCents:300000,
  baseFgtsCents:280000,baseIrrfCents:300000,grossCents:300000,manualCodes:[]});
 assert.equal(lines[0].amount_cents,29600);
});
test('descontos e férias/13º de outros processos não geram linhas mensais',async()=>{
 const db=dbFor([
  cfg('FERIAS_AVOS','PROVENTO',{base:'REMUNERACAO_FERIAS',nature_id:null}),
  cfg('DECIMO_TERCEIRO','PROVENTO',{base:'SALARIO_REFERENCIA_13',nature_id:null}),
  cfg('AJUSTE_RETENCAO','DESCONTO',{system:'RETENCAO',nature_id:null}),
  cfg('BONUS_MENSAL','PROVENTO',{base:'SALARIO_BASE'})]);
 const items=await loadAutomaticMonthly137(db,'COMP','2026-10');
 assert.deepEqual(items.map(x=>x.config.code),['BONUS_MENSAL']);
});
test('referência TOTAL_DESCONTOS ainda não homologada é identificada sem inventar líquido',async()=>{
 const db=dbFor([cfg('AJUSTE','PROVENTO',{base:'TOTAL_DESCONTOS'})]);
 const items=await loadAutomaticMonthly137(db,'COMP','2026-10');
 await assert.rejects(()=>calculateAutomaticMonthly137({db,companyId:'COMP',period:'2026-10',
  items,salaryCents:300000,paidCents:300000,manualCodes:[],grossCents:300000}),error=>
  error.code==='AUTO_FORMULA_REFERENCE'&&error.base_name==='TOTAL_DESCONTOS'&&
  error.event_code==='AJUSTE');
});
test('só considera versão mais recente por evento dentro da competência',async()=>{
 const db=dbFor([cfg('BONUS')]);
 const r=await loadAutomaticMonthly137(db,'COMP','2026-10');
 assert.equal(r.length,1);
 assert.equal(r[0].revision,2);
});

test('fórmula compartilhada de valor fixo é convertida corretamente de reais para centavos',async()=>{
 const original=cfg('PREMIO','PROVENTO',{calculation:'FORMULA_CADASTRADA',formula_id:'FORMULA1'});
 const db=dbFor([original]);
 const prepare=db.prepare;
 db.prepare=function(sql){
  if(sql.includes('FROM payroll_formulas129'))
   return {bind:()=>({first:async()=>({id:'FORMULA1',active:1,code:'PREMIO'})})};
  if(sql.includes('FROM payroll_formula_versions129'))
   return {bind:()=>({first:async()=>({id:'FV1',effective_from:'2026-10',revision:1,
    source_json:JSON.stringify({
     code:'PREMIO',name:'Prêmio mensal',active:true,category:'PROVENTO',system:'REMUNERACAO',
     trigger:'AUTOMATICO',calculation:'VALOR_FIXO',fixed_amount:125.5,
     base:'SALARIO_CONTRATUAL',effective_from:'2026-10',
     incidences:{inss:'NAO',irrf:'NAO',fgts:'NAO'}
    })
   })})};
  return prepare.call(this,sql);
 };
 const items=await loadAutomaticMonthly137(db,'COMP','2026-10');
 assert.equal(items[0].linked_version,'2026-10#1');
 const r=await calculateAutomaticMonthly137({db,companyId:'COMP',period:'2026-10',
  items,salaryCents:300000,paidCents:300000,manualCodes:[]});
 assert.equal(r[0].amount_cents,12550);
});
test('natureza contábil usa revisão imutável gravada no envelope',async()=>{
 const item=cfg('BONUS');
 const db={prepare(sql){
  assert.match(sql,/^SELECT /);
  return {bind(...args){
   return {first:async()=>{
    if(sql.includes('payroll_designer_config127')){
     assert.deepEqual(args,['COMP','E1','2026-10',2]);
     return {config_json:JSON.stringify(item)};
    }
    if(sql.includes('FROM budget_natures'))
     return {id:'N_BONUS',code:'4.01',description:'Bônus',active:1,synthetic_analytic:'ANALYTIC'};
    throw Error('Consulta inesperada');
   }};
  }};
 }};
 const n=await resolveAutomaticNature137(db,'COMP',{id:'E1',code:'BONUS',event_type:'PROVENTO'},
  'DESIGNER137:2026-10#2');
 assert.equal(n.nature_id,'N_BONUS');
 await assert.rejects(()=>resolveAutomaticNature137(db,'COMP',{id:'E1',code:'BONUS',event_type:'DESCONTO'},
  'DESIGNER137:2026-10#2'),/classificação/);
});
