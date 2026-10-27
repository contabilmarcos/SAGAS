import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcile115,payrollTermination115} from '../sagas-payroll-termination115.js';
function base(){
 return {employee:{id:'e1',code:'00001',name:'Maria',salary_cents:300000},
 termination_date:'2026-10-27',termination_kind:'WITHOUT_CAUSE',notice_kind:'INDEMNIFIED',
 notice_days:33,source_fingerprint:'raw',
 amounts:{salary_balance_cents:270000,thirteenth_avos:10,thirteenth_cents:250000,
 thirteenth_notice_projection_cents:25000,thirteenth_notice_projection_avos:1,
 vacation_proportional_avos:7,vacation_proportional_cents:175000,
 vacation_third_cents:58333,notice_indemnity_cents:330000,net_cents:null},
 problems:[{code:'TAX_PENDING',message:'apurar incidencias'}],warnings:[],ready_for_closing:false};
}
function proof(extra={}){
 return {id:'p1',employee_id:'e1',vacation_acquired_periods:1,vacation_double_periods:0,
 average_thirteenth_cents:30000,average_vacation_cents:20000,average_notice_cents:10000,
 fgts_base_cents:1800000,fgts_reference:'EXTRATO FGTS DIGITAL 2026',
 proof_reference:'RECIBOS FERIAS 2025 E FOLHAS 2026',notes:'conferido',...extra};
}
test('ausencia de documentos nao inventa multa, ferias, liquido',()=>{
 const x=reconcile115(base(),null);
 assert.equal(x.documentary_ready,false);
 assert.equal(x.full_gross_reference_cents,null);
 assert.equal(x.net_cents,null);
});
test('medias compoem separadamente 13, aviso e ferias, sem impostos presumidos',()=>{
 const p=reconcile115(base(),proof());
 assert.equal(p.documentary_ready,true);
 assert.equal(p.amounts.thirteenth_cents,275000);
 assert.equal(p.amounts.thirteenth_notice_projection_cents,27500);
 assert.equal(p.amounts.vacation_proportional_cents,186667);
 assert.equal(p.amounts.vacation_third_cents,62222);
 assert.equal(p.amounts.vacation_accrued_unpaid_cents,320000);
 assert.equal(p.amounts.vacation_accrued_third_cents,106667);
 assert.equal(p.amounts.notice_indemnity_cents,341000);
 assert.equal(p.fgts_fine_reference_cents,720000);
 assert.equal(p.net_cents,null);
 assert.equal(p.ready_for_closing,false);
});
test('dobro acrescenta apenas o adicional dos periodos vencidos declarados',()=>{
 const x=reconcile115(base(),proof({vacation_double_periods:1}));
 assert.equal(x.amounts.vacation_accrued_unpaid_cents,640000);
 assert.equal(x.amounts.vacation_accrued_third_cents,213333);
});
test('pedido de demissao nao gera multa ou aviso patronal',()=>{
 const b=base();b.termination_kind='RESIGNATION';b.notice_kind='WORKED';
 const x=reconcile115(b,proof({fgts_base_cents:null}));
 assert.equal(x.fgts_fine_reference_cents,null);
 assert.equal(x.amounts.notice_indemnity_cents,0);
});
function fake({missing=false}={}){
 const dbChanges=[],events=[],snapshot=base();
 const DB={prepare(sql){
  return {bind(...args){
   return {first:async()=>{
    if(sql.includes('FROM payroll_termination_evidence115'))return missing?null:proof();
    if(sql.includes('FROM payroll_termination_workpapers115 WHERE company_id=? AND employee_id=?'))return null;
    throw Error('unexpected SELECT '+sql);
   },all:async()=>({results:[]}),
   run:async()=>{dbChanges.push({sql,args});return {meta:{changes:1}}}};
  }};
 },batch:async()=>{throw Error('unexpected batch')}};
 const d={HttpError:class HttpError extends Error{constructor(status,msg,code){super(msg);this.code=code;this.status=status}},
  requirePermission:async()=>{},ensureSchemaRevision:async()=>{},
  hash:async(obj)=>JSON.stringify(obj),uuid:()=>('uid'+(dbChanges.length+1)),
  audit:async(_env,obj)=>events.push(obj)};
 const c={env:{DB},companyId:'org',auth:{user:{id:'u1'}},request:{},d,
  body:{employee_id:'e1',termination_date:'2026-10-27',kind:'WITHOUT_CAUSE',notice_kind:'INDEMNIFIED'}};
 return {c,dbChanges,events,snapshot};
}
test('preview sem documentos nao cria gravacoes',async()=>{
 const x=fake({missing:true}),p=await payrollTermination115('preview',x.c);
 assert.equal(p.documentary_ready,false);
 assert.equal(x.dbChanges.length,0);
});
test('documentos confirmados ficam referenciados no D1 sem criar titulo',async()=>{
 const x=fake();x.c.body={...x.c.body,confirmation:'CONFIRMAR DOCUMENTOS RESCISAO',
 vacation_acquired_periods:1,vacation_double_periods:1,
 average_thirteenth_cents:30000,average_vacation_cents:20000,average_notice_cents:10000,
 fgts_base_cents:1800000,fgts_reference:'FGTS DIGITAL OUTUBRO 2026',
 proof_reference:'RECIBOS 2025 FOLHAS 2026'};
 const result=await payrollTermination115('save',x.c);
 assert.equal(result.saved,true);
 assert.equal(x.dbChanges.length,1);
 assert.ok(x.dbChanges[0].sql.includes('payroll_termination_evidence115'));
 assert.equal(result.accounting_generated,false);
});
test('dobro maior que periodos adquiridos invalida atestacao',async()=>{
 const x=fake();x.c.body={...x.c.body,confirmation:'CONFIRMAR DOCUMENTOS RESCISAO',
 vacation_acquired_periods:1,vacation_double_periods:2};
 await assert.rejects(()=>payrollTermination115('save',x.c),e=>e.code==='VACATION_DOUBLE_INVALID');
 assert.equal(x.dbChanges.length,0);
});
test('workpaper DRAFT documentado nao desliga ou gera financeiro',async()=>{
 const x=fake(),p=await payrollTermination115('preview',x.c);
 x.c.body={...x.c.body,source_fingerprint:p.source_fingerprint,
  confirmation:'REGISTRAR CONFERENCIA RESCISAO'};
 const r=await payrollTermination115('record',x.c);
 assert.equal(r.created,true);
 assert.equal(r.status,'DRAFT');
 assert.equal(r.employee_status_changed,false);
 assert.equal(r.accounting_generated,false);
 assert.ok(x.dbChanges[0].sql.includes('payroll_termination_workpapers115'));
});
test('versao da conferencia alterada nao pode registrar historico',async()=>{
 const x=fake();x.c.body={...x.c.body,
  confirmation:'REGISTRAR CONFERENCIA RESCISAO',source_fingerprint:'older'};
 await assert.rejects(()=>payrollTermination115('record',x.c),e=>e.code==='PREVIEW_CHANGED');
 assert.equal(x.dbChanges.length,0);
});
