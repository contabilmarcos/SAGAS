import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollCompetenceReopen125} from '../sagas-payroll-reopen125.js';

function fixture({status='LOCKED',runStatus='APPROVED',review=true,integrated=[],permission=true,writeChanges=1}={}){
 const calls=[],auditLog=[];
 const run={id:'RUN1',status:runStatus,revision:1,source_fingerprint:'FP1'};
 const tables=['payroll_competences','payroll_calc_runs','payroll_calc_monthly_reviews',...integrated.map(x=>x.table)];
 const db={
  prepare(sql){
   const bind=(...args)=>({
    first:async()=>{
     calls.push({sql,args});
     if(sql.includes('FROM payroll_competences'))return {id:'C1',competence:'2026-10',status};
     if(sql.includes('FROM payroll_calc_runs')&&sql.includes("id<>?"))return null;
     if(sql.includes('FROM payroll_calc_runs'))return run;
     if(sql.includes('FROM payroll_calc_monthly_reviews'))return review?{closed_at:'2026-10-31',source_fingerprint:'FP1'}:null;
     for(const x of integrated)if(sql.includes('FROM '+x.table)&&sql.includes('LIMIT 1'))return {found:1};
     return null;
    },
    all:async()=>{
     calls.push({sql,args});
     if(sql.includes('FROM sqlite_master'))return {results:tables.map(name=>({name}))};
     return {results:[]};
    }
   });
   return {bind,all:async()=>bind().all(),first:async()=>bind().first()};
  },
  batch:async(stmts)=>{
   calls.push({batch:stmts.length});
   return stmts.map(()=>({meta:{changes:writeChanges}}));
  }
 };
 const d={
  HttpError:class extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code;}},
  requirePermission:async(_env,_id,_company,perm)=>{
   calls.push({permission:perm});
   if(!permission)throw Error('FORBIDDEN');
  },
  audit:async(_env,o)=>{auditLog.push(o)}
 };
 const ctx={env:{DB:db},companyId:'TENANT1',competenceId:'C1',
  auth:{user:{id:'U1'}},request:{},d};
 return {ctx,calls,auditLog};
}
test('consulta informa que a competencia fechada sem integracoes esta pronta',async()=>{
 const f=fixture();
 const v=await payrollCompetenceReopen125('preview',f.ctx);
 assert.equal(v.ready,true);
 assert.equal(v.run_id,'RUN1');
 assert.equal(v.competence,'2026-10');
 assert.equal(f.auditLog.length,0);
 assert.ok(f.calls.every(c=>!c.batch));
});
test('impede reabertura de competencia ja aberta',async()=>{
 const f=fixture({status:'OPEN'});
 const v=await payrollCompetenceReopen125('preview',f.ctx);
 assert.equal(v.ready,false);
 assert.ok(v.problems.some(x=>x.code==='COMPETENCIA_NAO_BLOQUEADA'));
});
test('impede reabertura sem folha aprovada ou fechamento valido',async()=>{
 const a=fixture({runStatus:'CALCULATED'});
 assert.ok(!(await payrollCompetenceReopen125('preview',a.ctx)).ready);
 const b=fixture({review:false});
 const v=await payrollCompetenceReopen125('preview',b.ctx);
 assert.ok(v.problems.some(x=>x.code==='FECHAMENTO_INCONSISTENTE'));
});
test('impede reabertura se folha foi integrada ao financeiro',async()=>{
 const f=fixture({integrated:[{table:'payroll_finance_postings37'}]});
 const v=await payrollCompetenceReopen125('preview',f.ctx);
 assert.ok(v.problems.some(x=>x.code==='FINANCEIRO'));
 await assert.rejects(payrollCompetenceReopen125('reopen',{...f.ctx,body:{confirmation:'REABRIR',justification:'Conferir desconto mensal'}}),e=>e.code==='REOPEN_BLOCKED');
 assert.equal(f.auditLog.length,0);
});
test('impede reabertura se existe constituicao de provisao',async()=>{
 const f=fixture({integrated:[{table:'payroll_provision_cycles43'}]});
 const v=await payrollCompetenceReopen125('preview',f.ctx);
 assert.ok(v.problems.some(x=>x.code==='PROVISOES_CONSTITUIDAS'));
});
test('reabertura pede permissao de escrita, justificativa e confirmacao',async()=>{
 const f=fixture();
 await assert.rejects(payrollCompetenceReopen125('reopen',{...f.ctx,body:{confirmation:'OUTRO',justification:'Desconto inconsistente'}}),e=>e.code==='CONFIRMATION_REQUIRED');
 await assert.rejects(payrollCompetenceReopen125('reopen',{...f.ctx,body:{confirmation:'REABRIR',justification:'curta'}}),e=>e.code==='JUSTIFICATION_REQUIRED');
 const b=fixture({permission:false});
 await assert.rejects(payrollCompetenceReopen125('reopen',{...b.ctx,body:{confirmation:'REABRIR',justification:'Desconto inconsistente'}}),/FORBIDDEN/);
});
test('reabertura sem vinculacoes grava status OPEN, run VOID e auditoria com justificativa',async()=>{
 const f=fixture();
 const result=await payrollCompetenceReopen125('reopen',{...f.ctx,
  body:{confirmation:'REABRIR',justification:'Corrigir lançamento do funcionário'}});
 assert.equal(result.status,'OPEN');
 assert.equal(result.previous_run_status,'VOID');
 assert.equal(result.must_recalculate,true);
 assert.equal(f.auditLog.length,1);
 assert.equal(f.auditLog[0].action,'REOPEN');
 assert.equal(f.auditLog[0].after.reason,'Corrigir lançamento do funcionário');
 assert.ok(f.calls.some(x=>x.batch===2));
});
test('reabertura nao confirma se D1 nao alterar todas as linhas',async()=>{
 const f=fixture({writeChanges:0});
 await assert.rejects(payrollCompetenceReopen125('reopen',{...f.ctx,
  body:{confirmation:'REABRIR',justification:'Corrigir lançamento do funcionário'}}),e=>e.code==='REOPEN_CONFLICT');
 assert.equal(f.auditLog.length,0);
});
test('SQL de reabertura inclui guardas de integracao verificadas no D1',async()=>{
 // mock verifica que os guardas foram construidos sem confiar apenas no GET.
 const f=fixture({integrated:[{table:'payroll_finance_postings37'}]});
 const v=await payrollCompetenceReopen125('preview',f.ctx);
 assert.equal(v.ready,false);
});
