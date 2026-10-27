import test from 'node:test';
import assert from 'node:assert/strict';
import {twelfths70,amounts70,payrollThirteenth70} from '../sagas-payroll-thirteenth70.js';

const row={
 id:'emp1',name:'Funcionário de teste',admission_date:'2026-01-01',active:1,
 cost_center_id:'cc1',cost_center_code:'001',employee_number:1,
 salary_cents:300000,situation:'ATIVO'
};
function setup({advances=[],specials=[],variables=[],dependentCount=0,financial=[],linked=null,employee=row}={}){
 const taxCalls=[],queries=[],written=[];
 const DB={prepare(sql){
  return {bind(...params){
   queries.push({sql,params});
   return {all:async()=>{
    if(sql.includes('FROM payroll_employees e LEFT JOIN'))return {results:[employee]};
    if(sql.includes('FROM payroll_employee_occurrences'))return {results:specials.map(kind=>({employee_id:'emp1',kind,total:1}))};
    if(sql.includes('FROM payroll_movements m JOIN'))return {results:variables.map(()=>({employee_id:'emp1',total:1}))};
    if(sql.includes('FROM payroll_employee_dependents'))return {results:dependentCount?[{employee_id:'emp1',total:dependentCount}]:[]};
    if(sql.includes('FROM payroll_thirteenth_advances70 WHERE'))return {results:advances};
    if(sql.includes('FROM payroll_thirteenth_payables111 l JOIN'))return {results:financial};
    throw Error('SQL desconhecido: '+sql);
   },first:async()=>{
    if(sql.includes('SELECT l.payable_id FROM payroll_thirteenth_payables111'))return linked;
    throw Error('Consulta first desconhecida: '+sql);
   },run:async()=>{written.push({sql,params});return {meta:{changes:1}}}};
  }};
 }};
 const d={
  HttpError:class HttpError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code}},
  ensureSchemaRevision:async()=>{},requirePermission:async()=>{},audit:async()=>{},
  uuid:()=> 'document-uuid',
  hash:async(v)=>JSON.stringify(v),
  taxes:(inss,irrf,fgts,competence,date,dep)=>{
   taxCalls.push({inss,irrf,fgts,competence,date,dep});
   return {inss_cents:26000,irrf_cents:5000,fgts_cents:fgts*0.08,inss_table_from:'2026-01',irrf_table_from:'2026-01'};
  }
 };
 const c={env:{DB},companyId:'co1',auth:{user:{id:'user1'}},request:{},year:'2026',phase:'FIRST',body:{},d};
 return {c,DB,taxCalls,queries,written};
}
test('15 dias contam como avo integral, 14 dias nao',()=>{
 assert.equal(twelfths70('2026-10-17','2026'),3);
 assert.equal(twelfths70('2026-10-18','2026'),2);
 assert.equal(twelfths70('2024-02-15','2024'),11);
 assert.equal(twelfths70('2024-02-16','2024'),10);
 assert.equal(twelfths70('2025-01-01','2026'),12);
 assert.equal(twelfths70('2027-01-01','2026'),0);
});
test('primeira parcela nao desconta INSS nem IRRF e calcula FGTS',()=>{
 const item=amounts70(300000,12,0,null,'FIRST');
 assert.equal(item.gross_cents,300000);
 assert.equal(item.net_cents,150000);
 assert.equal(item.inss_cents,0);
 assert.equal(item.irrf_cents,0);
 assert.equal(item.fgts_cents,12000);
});
test('segunda parcela usa adiantamento e tributos integrais sem novo FGTS da primeira',()=>{
 const item=amounts70(300000,12,150000,{inss_cents:26000,irrf_cents:5000},'SECOND');
 assert.equal(item.net_cents,119000);
 assert.equal(item.fgts_cents,12000);
});
test('adiantamento superior ao direito e sinalizado',()=>{
 assert.equal(amounts70(300000,12,350000,null,'SECOND').overpaid,true);
});
test('preview da primeira parcela identifica salario, centro de custo e avos',async()=>{
 const {c}=setup();
 const result=await payrollThirteenth70('preview',c);
 assert.equal(result.phase,'FIRST');
 assert.equal(result.items[0].avos,12);
 assert.equal(result.items[0].calculation.net_cents,150000);
 assert.equal(result.ready_to_declare_advance,true);
 assert.equal(result.read_only,true);
});
test('segunda parcela bloqueia adiantamento sem documento',async()=>{
 const {c,taxCalls}=setup();
 c.phase='SECOND';
 const result=await payrollThirteenth70('preview',c);
 assert.equal(result.items[0].ready,false);
 assert.equal(result.totals.blocked,1);
 assert.equal(taxCalls.length,0);
});
test('segunda parcela usa base integral de IR/INSS, FGTS residual e dependentes',async()=>{
 const {c,taxCalls}=setup({dependentCount:2,advances:[{
  id:'adv1',employee_id:'emp1',amount_cents:150000,
  payment_date:'2026-10-15',document_ref:'COMP-12345',source_fingerprint:'old'
 }]});
 c.phase='SECOND';
 const result=await payrollThirteenth70('preview',c);
 assert.equal(result.items[0].ready,true);
 assert.equal(result.items[0].calculation.net_cents,119000);
 assert.deepEqual(taxCalls[0],{
  inss:300000,irrf:300000,fgts:150000,competence:'2026-12',date:'2026-12-20',dep:2
 });
});
test('afastamento e verba adicional bloqueiam apuracao automatica',async()=>{
 const {c}=setup({specials:['AFASTAMENTO'],variables:[1]});
 const result=await payrollThirteenth70('preview',c);
 assert.equal(result.items[0].ready,false);
 assert.ok(result.items[0].blockers.some(b=>b.includes('medias')));
});
test('registra adiantamento documentado sem gerar financeiro',async()=>{
 const x=setup(),preview=await payrollThirteenth70('preview',x.c);
 x.c.body={
  confirmation:'REGISTRAR ADIANTAMENTO 13',year:'2026',employee_id:'emp1',
  amount_cents:150000,payment_date:'2026-10-20',document_ref:'COMP-2026-123',
  notes:'Pagamento comprovado externamente para conferência.',
  source_fingerprint:preview.source_fingerprint
 };
 const result=await payrollThirteenth70('declare',x.c);
 assert.equal(result.declared,true);
 assert.equal(result.financial_generated,false);
 assert.equal(result.bank_verified,false);
 assert.equal(x.written.length,1);
});
test('rejeita versao desatualizada e valor divergente',async()=>{
 const x=setup();
 x.c.body={
  confirmation:'REGISTRAR ADIANTAMENTO 13',year:'2026',employee_id:'emp1',
  amount_cents:150000,payment_date:'2026-10-20',document_ref:'COMP-2026-123',
  notes:'Pagamento comprovado externamente para conferência.',
  source_fingerprint:'antigo'
 };
 await assert.rejects(()=>payrollThirteenth70('declare',x.c),e=>e.code==='PREVIEW_STALE');
 const p=await payrollThirteenth70('preview',x.c);
 x.c.body.source_fingerprint=p.source_fingerprint;
 x.c.body.amount_cents=80000;
 await assert.rejects(()=>payrollThirteenth70('declare',x.c),e=>e.code==='ADVANCE_DIFFERS');
});

test('adiantamento quitado no financeiro SAGAS integra a segunda parcela',async()=>{
 const {c}=setup({financial:[{
  employee_id:'emp1',amount_cents:150000,payment_date:'2026-10-25',
  status:'PAID',payable_id:'cp1',document_number:'13-ADV-2026',
  payment_journal_entry_id:'j2',origin_status:'POSTED',payment_journal_status:'POSTED'
 }]});
 c.phase='SECOND';
 const result=await payrollThirteenth70('preview',c);
 assert.equal(result.items[0].ready,true);
 assert.equal(result.items[0].advance.from_sagas_finance,true);
 assert.equal(result.items[0].calculation.net_cents,119000);
});
test('titulo ainda aberto ou sem diario de baixa impede segunda parcela',async()=>{
 const {c}=setup({financial:[{
  employee_id:'emp1',amount_cents:150000,status:'OPEN',
  payable_id:'cp1',origin_status:'POSTED',payment_journal_status:null
 }]});
 c.phase='SECOND';
 const result=await payrollThirteenth70('preview',c);
 assert.equal(result.items[0].ready,false);
 assert.ok(result.items[0].blockers.some(x=>x.includes('Título da 1ª parcela')));
});
test('adiantamento externo e titulo interno duplicados bloqueiam segunda parcela',async()=>{
 const {c}=setup({advances:[{
  id:'external1',employee_id:'emp1',amount_cents:150000,payment_date:'2026-10-19',document_ref:'DOC-EXT'
 }],financial:[{
  employee_id:'emp1',amount_cents:150000,payment_date:'2026-10-25',
  status:'PAID',payable_id:'cp1',payment_journal_entry_id:'j2',
  origin_status:'POSTED',payment_journal_status:'POSTED'
 }]});
 c.phase='SECOND';
 const result=await payrollThirteenth70('preview',c);
 assert.equal(result.items[0].ready,false);
 assert.ok(result.items[0].blockers.some(x=>x.includes('duplicados')));
});
test('nao permite comprovante externo quando existe adiantamento no financeiro',async()=>{
 const x=setup({linked:{payable_id:'cp1'}});
 const preview=await payrollThirteenth70('preview',x.c);
 x.c.body={
  confirmation:'REGISTRAR ADIANTAMENTO 13',year:'2026',employee_id:'emp1',
  amount_cents:150000,payment_date:'2026-10-20',
  document_ref:'DOC-EXTERNO-2026',notes:'Conferencia de pagamento externo registrado.',
  source_fingerprint:preview.source_fingerprint
 };
 await assert.rejects(()=>payrollThirteenth70('declare',x.c),e=>e.code==='ADVANCE_ALREADY_FINANCED');
});
