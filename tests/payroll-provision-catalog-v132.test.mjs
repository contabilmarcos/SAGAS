import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProvision132,provisionCatalog132, schemaProvision132} from '../sagas-payroll-provision-catalog132.js';
import {readFileSync} from 'node:fs';

class HttpError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code;}}
const d={HttpError};
const input=(overrides={})=>({
 code:'PROV_FERIAS',name:'Provisao mensal de ferias',active:true,
 effective_from:'2020-01',formula_sql:'SELECT ROUND(:SALARIO_CONTRATUAL / 12.0, 2) AS VALOR',
 accounting:{nature_accrual_id:'NAT_COST',nature_use_id:'NAT_USE'},...overrides
});
const fixture=(variant={})=>{
 const queries=[],batched=[],logs=[];
 const DB={
  prepare(sql){
   return {sql,args:[],bind(...params){this.args=params;return this;},
    async first(){
     queries.push({sql:this.sql,args:this.args});
     if(this.sql.includes('FROM budget_natures'))
      return variant.invalidNature?null:{id:this.args[1],code:'04.010',description:'Provisao'};
     if(this.sql.includes('FROM payroll_provision_definitions132'))return variant.existing??null;
     if(this.sql.includes('MAX(revision)'))return {rev:variant.revisions??0};
     if(this.sql.startsWith('SELECT ')&&!this.sql.includes(' FROM '))
      return {VALOR:Number(this.args[0]??0)/12};
     throw Error('SQL inesperado '+this.sql);
    },
    async all(){queries.push({sql:this.sql,args:this.args});return {results:variant.results||[]}}
   };
  },
  async batch(statements){batched.push(statements);return statements.map(()=>({meta:{changes:1}}));}
 };
 const deps={
  HttpError,uuid:()=>String(queries.length+batched.length+1),
  requirePermission:async(_env,_user,company,permission)=>{
   assert.equal(company,'COMPANY_A');logs.push(permission);
  },
  ensureSchemaRevision:async(_env,name,rev,fn)=>{
   assert.equal(name,'payroll-provision-definitions132');assert.equal(rev,1);
  },
  audit:async(_env,item)=>logs.push(item)
 };
 return {env:{DB},batched,queries,logs,
  args:{env:{DB},companyId:'COMPANY_A',auth:{user:{id:'OWNER'}},request:{},d:deps}};
};
test('provisao aceita formula SQL inline e contabilizacao em duas naturezas',()=>{
 const res=normalizeProvision132(input(),d);
 assert.deepEqual(res.formula_variables,['SALARIO_CONTRATUAL']);
 assert.equal(res.accounting.nature_accrual_id,'NAT_COST');
 assert.equal(res.accounting.nature_use_id,'NAT_USE');
 assert.equal(res.effective_from,'2020-01');
});
test('valida codigo, vigencia, natureza e SQL inseguro',()=>{
 assert.throws(()=>normalizeProvision132(input({code:'DROP TABLE'}),d),/Codigo/);
 assert.throws(()=>normalizeProvision132(input({effective_from:'2020-13'}),d),/Vigencia/);
 assert.throws(()=>normalizeProvision132(input({accounting:{nature_accrual_id:''}}),d),/natureza/);
 assert.throws(()=>normalizeProvision132(input({formula_sql:'SELECT name FROM payroll_employees AS VALOR'}),d),/invalida/);
 assert.throws(()=>normalizeProvision132(input({formula_sql:'UPDATE payroll_events SET active=0'}),d),/invalida/);
});
test('cadastro grava definicao e configuracao numa batch e cria revisao',async()=>{
 const f=fixture();
 const res=await provisionCatalog132('save',{...f.args,body:input()});
 assert.equal(res.saved,true);assert.equal(res.revision,1);
 assert.equal(res.configuration_only,true);
 assert.equal(f.batched.length,1);
 assert.equal(f.batched[0].length,2);
 assert.match(f.batched[0][0].sql,/INSERT INTO payroll_provision_definitions132/);
 assert.match(f.batched[0][1].sql,/INSERT INTO payroll_provision_versions132/);
 const config=JSON.parse(f.batched[0][1].args[5]);
 assert.equal(config.formula_sql,input().formula_sql);
 assert.equal(config.accounting.nature_use_id,'NAT_USE');
 assert.ok(f.queries.every(x=>x.sql.includes('company_id=?')||x.sql.startsWith('SELECT ')));
});
test('edicao cria nova revisao e nao altera saldos nem folhas antigas',async()=>{
 const f=fixture({existing:{id:'DEF',code:'PROV_FERIAS',name:'Provisao mensal de ferias',active:1},revisions:1});
 const result=await provisionCatalog132('save',{...f.args,id:'DEF',body:input()});
 assert.equal(result.revision,2);
 assert.equal(f.batched[0].length,2);
 assert.match(f.batched[0][0].sql,/UPDATE payroll_provision_definitions132/);
 assert.match(f.batched[0][1].sql,/INSERT INTO payroll_provision_versions132/);
 const sql=f.batched[0].map(x=>x.sql).join(' ');
 assert.doesNotMatch(sql,/payroll_provision_movements43|payroll_monthly_runs|journal_entries/);
});
test('naturezas inativas ou de outra empresa impedem salvamento',async()=>{
 const f=fixture({invalidNature:true});
 await assert.rejects(()=>provisionCatalog132('save',{...f.args,body:input()}),
  /Natureza de constituicao inexistente/);
 assert.equal(f.batched.length,0);
});
test('simulacao usa SELECT seguro no D1 e nao escreve valores',async()=>{
 const f=fixture();
 const res=await provisionCatalog132('preview',{
  ...f.args,body:{...input(),values:{SALARIO_CONTRATUAL:3000}}
 });
 assert.equal(res.result.amount,250);
 assert.equal(res.no_accounting_posted,true);
 assert.equal(f.batched.length,0);
 assert.ok(f.queries.some(x=>x.sql.startsWith('SELECT ROUND(')&&x.args[0]===3000));
});
test('simulacao rejeita variaveis sem valores ou negativas',async()=>{
 const f=fixture();
 await assert.rejects(()=>provisionCatalog132('preview',{
  ...f.args,body:{...input(),values:{}}
 }),/Informe o parametro SALARIO_CONTRATUAL/);
 await assert.rejects(()=>provisionCatalog132('preview',{
  ...f.args,body:{...input(),values:{SALARIO_CONTRATUAL:-4}}
 }),/invalido/);
});
test('interface inclui duas guias no mesmo modal e links de revisao',()=>{
 const ui=readFileSync(new URL('../sagas-payroll-provision-catalog132-ui.js',import.meta.url),'utf8');
 assert.match(ui,/role="tablist"/);
 assert.match(ui,/Fórmula de Cálculo/);
 assert.match(ui,/Contabilização/);
 assert.match(ui,/nature_accrual_id/);
 assert.match(ui,/nature_use_id/);
 assert.match(ui,/prov132-revision/);
 assert.match(ui,/formula_sql/);
 assert.match(ui,/payroll\/provision-definitions/);
});
test('DDL do catalogo isolado nao modifica as tabelas legadas',async()=>{
 const sql=[];
 const db={prepare(s){sql.push(s);return s;},batch:async()=>{}};
 await schemaProvision132({DB:db});
 assert.equal(sql.length,3);
 assert.ok(sql.every(s=>/payroll_provision_(definitions|versions)132/i.test(s)));
});
