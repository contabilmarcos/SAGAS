import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {payrollDesigner127} from '../sagas-payroll-designer127.js';

// Regression for IRRF_EMP: default TABELA_FAIXA_DEDUCAO inserts blank,
// required band controls. Switching to a linked formula used to leave these
// hidden controls enabled, blocking the native submit event without feedback.
const source=readFileSync(new URL('../sagas-payroll-designer127-ui.js',import.meta.url),'utf8');
const anchor='window.SAGAS_PAYROLL_DESIGNER127={open,groups};';
assert.ok(source.includes(anchor),'O teste precisa localizar a UI atual');
const ui=source.replace(anchor,'window.SAGAS_PAYROLL_DESIGNER127={open,groups,appearance};');
function scenario(){
 const nodes=new Map();
 const document={
  getElementById(id){
   if(!nodes.has(id))nodes.set(id,{
    textContent:'',classList:{toggle:()=>{},add:()=>{},remove:()=>{}}
   });
   return nodes.get(id);
  }
 };
 const ctx={window:{},document};
 runInNewContext(ui,ctx,{filename:'sagas-payroll-designer127-ui.js'});
 const fields={
  calculation:{value:'FORMULA_CADASTRADA'},
  base:{value:'BASE_IRRF',disabled:false},
  formula_id:{disabled:false,required:false},
  sql_query:{disabled:false},
  category:{value:'DESCONTO'},
  system:{value:'RETENCAO'},
  days_basis:{value:'30',dataset:{hours:'220'},readOnly:false},
  test_qty:{value:'30',max:'300',step:'0.001'}
 };
 const band=[
  {classList:{contains:(x)=>x==='ed127-to'},disabled:false,required:true},
  {classList:{contains:(x)=>x==='ed127-rate'},disabled:false,required:true},
  {classList:{contains:(x)=>x==='ed127-deduction'},disabled:false,required:false}
 ];
 const form={
  elements:fields,
  querySelectorAll(sel){
   if(sel==='#ed127-bands input')return band;
   if(sel==='.ed127-deduction')return [band[2]];
   throw Error('Unexpected selector '+sel);
  }
 };
 return {appearance:ctx.window.SAGAS_PAYROLL_DESIGNER127.appearance,form,fields,band};
}
test('IRRF vinculado a formula: campos de faixas ocultas nao impedem o submit',()=>{
 const t=scenario();
 t.appearance(t.form);
 assert.ok(t.band.every(b=>b.disabled),'Inputs obrigatorios invisiveis devem ser desativados');
 assert.equal(t.fields.formula_id.disabled,false);
 assert.equal(t.fields.formula_id.required,true);
 assert.equal(t.fields.sql_query.disabled,true);
});
test('ao voltar a tabela, reativar faixas obrigatorias e desligar vinculo',()=>{
 const t=scenario();
 t.appearance(t.form);
 t.fields.calculation.value='TABELA_FAIXA_DEDUCAO';
 t.appearance(t.form);
 assert.equal(t.band[0].disabled,false);
 assert.equal(t.band[1].disabled,false);
 assert.equal(t.band[2].disabled,false);
 assert.equal(t.fields.formula_id.disabled,true);
 assert.equal(t.fields.formula_id.required,false);
});
test('ao voltar ao IRRF progressivo, parcela a deduzir permanece desativada',()=>{
 const t=scenario();
 t.fields.calculation.value='TABELA_PROGRESSIVA';
 t.appearance(t.form);
 assert.equal(t.band[0].disabled,false);
 assert.equal(t.band[1].disabled,false);
 assert.equal(t.band[2].disabled,true);
});

test('IRRF_EMP com F_IRRF_2020 e faixa antiga oculta salva uma nova revisao no Worker',async()=>{
 const batches=[],audit=[];
 class HttpError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code;}}
 const event={id:'EV_IRRF',code:'IRRF_EMP',name:'IRRF do empregado',event_type:'DESCONTO',active:1};
 const DB={
  prepare(sql){
   return {
    sql,values:[],
    bind(...args){this.values=args;return this;},
    async first(){
     if(sql.includes('FROM payroll_designer_groups127'))return {id:'GR_001'};
     if(sql.includes('FROM budget_natures'))return {id:'NAT_IRRF'};
     if(sql.includes('FROM payroll_events'))return event;
     if(sql.includes('MAX(revision)'))return {rev:0};
     throw Error('SQL inesperado '+sql);
    }
   };
  },
  async batch(statements){batches.push(statements);return statements.map(()=>({meta:{changes:1}}));}
 };
 const d={
  HttpError,uuid:()=> 'NEW_REVISION',
  requirePermission:async(_env,_id,_company,permission)=>assert.equal(permission,'payroll.manage'),
  ensureSchemaRevision:async()=>{},
  audit:async(_env,a)=>audit.push(a),
  resolveFormula:async(id,date)=>{
   assert.equal(id,'FORMULA_IRRF_2020');
   assert.equal(date,'2020-01');
   return {formula:{id,active:1},version:{id:'V2',revision:2,effective_from:'2020-01'}};
  }
 };
 const body={
  code:'IRRF_EMP',name:'IRRF do empregado',active:true,
  category:'DESCONTO',system:'RETENCAO',trigger:'AUTOMATICO',
  calculation:'FORMULA_CADASTRADA',base:'BASE_IRRF',
  effective_from:'2020-01',group_id:'GR_001',nature_id:'NAT_IRRF',
  formula_id:'FORMULA_IRRF_2020',
  incidences:{inss:'NAO',irrf:'NAO',fgts:'NAO'},
  // Os dados desativados no formulario podem permanecer em memoria.
  bands:[{to:'',rate:'',deduction:0}],days_basis:'30'
 };
 const result=await payrollDesigner127('event-save',{
  env:{DB},companyId:'COMPANY_1',auth:{user:{id:'USER_1'}},
  request:{},d,body,eventId:'EV_IRRF'
 });
 assert.equal(result.saved,true);
 assert.equal(result.revision,1);
 assert.equal(result.configuration_only,true);
 assert.equal(batches.length,1);
 assert.equal(batches[0].length,1);
 assert.match(batches[0][0].sql,/INSERT INTO payroll_designer_config127/);
 const cfg=JSON.parse(batches[0][0].values[5]);
 assert.equal(cfg.formula_id,'FORMULA_IRRF_2020');
 assert.equal(cfg.calculation,'FORMULA_CADASTRADA');
 assert.equal(cfg.effective_from,'2020-01');
 assert.equal(audit.length,1);
});
