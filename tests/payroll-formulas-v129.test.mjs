import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize129,payrollFormulas129,formulaSnapshot129} from '../sagas-payroll-formulas129.js';
const HttpError=class extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code}};
const d={HttpError};
const defaultFormula=(data={})=>({
 code:'F001',name:'Decimo terceiro por avos',
 effective_from:'2026-10',calculation:'SQL_PERSONALIZADO',
 base:'SALARIO_REFERENCIA_13',
 sql_query:'SELECT ROUND(:SALARIO_REFERENCIA_13 * :AVOS_13 / 12, 2) AS VALOR',
 ...data
});
function mock({current=null,revisions=[],formula={id:'F1',code:'F001',name:'Decimo terceiro',active:1}}={}){
 const queries=[],batched=[],audits=[];
 const DB={
  prepare(sql){
   return {bind(...args){
    return {
     first:async()=>{
      queries.push({sql,args});
      if(sql.includes('MAX(revision)'))return {rev:revisions.length};
      if(sql.includes('FROM payroll_formulas129'))return current||formula;
      if(sql.includes('FROM payroll_formula_versions129')){
       if(!revisions.length)return null;
       const v=revisions.find(x=>x.effective_from<=args[2]);
       return v||null;
      }
      if(sql.startsWith('SELECT ')&&!sql.includes(' FROM '))return {VALOR:Number(args[0]||0)*Number(args[1]||0)/12};
      return null;
     },
     all:async()=>({results:[]})
    };
   }};
  },
  batch:async stmts=>{batched.push(stmts.length);return stmts.map(()=>({meta:{changes:1}}));}
 };
 const extras={
  env:{DB},companyId:'C1',auth:{user:{id:'U1'}},request:{},
  d:{HttpError,requirePermission:async (_env,_u,company,p)=>{
   assert.equal(company,'C1');assert.ok(['payroll.read','payroll.manage'].includes(p));
  },ensureSchemaRevision:async()=>{},uuid:()=>crypto.randomUUID(),audit:async(_e,o)=>audits.push(o)}
 };
 return {extras,batched,audits,queries};
}
test('catalogo aceita SQL do 13º e dados de vigencia',()=>{
 const data=normalize129(defaultFormula(),d);
 assert.equal(data.calculation,'SQL_PERSONALIZADO');
 assert.equal(data.source.sql_query,defaultFormula().sql_query);
 assert.deepEqual(data.sql_variables,['SALARIO_REFERENCIA_13','AVOS_13']);
});
test('catalogo suporta percentuais e tabelas sem SQL',()=>{
 const pct=normalize129(defaultFormula({calculation:'PERCENTUAL_BASE',base:'BASE_FGTS',rate:8}),d);
 assert.equal(pct.source.rate,8);
 const table=normalize129(defaultFormula({calculation:'TABELA_PROGRESSIVA',base:'BASE_INSS',
  bands:[{to:1000,rate:7.5},{to:3000,rate:9}]}),d);
 assert.equal(table.source.bands.length,2);
});
test('codigo, tabela e consulta SQL inseguros sao rejeitados',()=>{
 assert.throws(()=>normalize129(defaultFormula({code:'X;DROP'}),d),/Codigo/);
 assert.throws(()=>normalize129(defaultFormula({effective_from:'2026-13'}),d),/Competencia/);
 assert.throws(()=>normalize129(defaultFormula({sql_query:'SELECT email FROM users AS VALOR'}),d),/SQL invalida/);
 assert.throws(()=>normalize129(defaultFormula({calculation:'FORMULA_CADASTRADA'}),d),/nao suportada/);
});
test('a criacao grava catalogo e versao em batch, com auditoria',async()=>{
 const m=mock();
 const v=await payrollFormulas129('save',{...m.extras,body:defaultFormula()});
 assert.equal(v.saved,true);
 assert.equal(v.revision,1);
 assert.deepEqual(m.batched,[2]);
 assert.equal(m.audits[0].entity,'payroll_formulas129');
 assert.equal(m.audits[0].after.code,'F001');
});
test('edição nao sobrescreve versao antiga; cria nova revisao',async()=>{
 const m=mock({current:{id:'F1',code:'F001'},revisions:[{effective_from:'2026-10'}]});
 const v=await payrollFormulas129('save',{...m.extras,formulaId:'F1',body:defaultFormula()});
 assert.equal(v.revision,2);assert.deepEqual(m.batched,[2]);
});
test('edicao nao permite trocar codigo historico',async()=>{
 const m=mock({current:{id:'F1',code:'F001'}});
 await assert.rejects(()=>payrollFormulas129('save',{
  ...m.extras,formulaId:'F1',body:defaultFormula({code:'F002'})
 }),/alterar o codigo/);
 assert.equal(m.batched.length,0);
});
test('simulacao antes de salvar usa SQL parametrizado, sem alterar o catalogo',async()=>{
 const m=mock();
 const result=await payrollFormulas129('preview',{...m.extras,body:{
  config:defaultFormula(),values:{SALARIO_REFERENCIA_13:3000,AVOS_13:8}
 }});
 assert.equal(result.result.amount,2000);
 assert.equal(result.unsaved_preview,true);
 assert.equal(m.batched.length,0);
});
test('simulacao nao permite SQL de tabela real',async()=>{
 const m=mock();
 await assert.rejects(()=>payrollFormulas129('preview',{...m.extras,body:{
  config:defaultFormula({sql_query:'SELECT 1 FROM payroll_employees AS VALOR'}),
  values:{SALARIO_REFERENCIA_13:3000,AVOS_13:8}
 }}),/Consulta SQL invalida/);
});
test('resolucao de versao prioriza competencia e empresa',async()=>{
 const m=mock({revisions:[{id:'V1',effective_from:'2026-01',revision:1,
  source_json:JSON.stringify(defaultFormula()),created_at:'2026-01-01'}]});
 const v=await formulaSnapshot129(m.extras.env,'C1','F1','2026-10');
 assert.equal(v.version.id,'V1');
 assert.equal(v.formula.id,'F1');
 assert.ok(m.queries.some(x=>x.sql.includes('effective_from<=?')&&x.args[0]==='C1'));
});
