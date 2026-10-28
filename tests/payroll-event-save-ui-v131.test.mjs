import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

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
