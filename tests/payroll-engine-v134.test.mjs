import test from 'node:test';
import assert from 'node:assert/strict';
import {previewProvisionAccounting134} from '../sagas-payroll-engine134.js';

function fakeDb({withoutCredit=false,wrongAccount=false,missingNature=false}={}){
 const calls=[];
 return {calls,prepare(sql){
  assert.match(sql,/^SELECT /);
  return {bind(...args){
   calls.push({sql,args});
   return {
    async first(){
     if(sql.includes('FROM cost_centers'))return {id:'CC1',code:'01'};
     if(sql.includes('FROM budget_natures'))return missingNature?null:
      {id:'N1',code:'4.01',active:1,synthetic_analytic:'ANALYTIC'};
     if(sql.includes('FROM accounts'))return wrongAccount&&args[1]==='C1'?null:
      {id:args[1],code:args[1]==='D1'?'4.01.01':'2.01.01',
       name:args[1]==='D1'?'Despesa de férias':'Provisão de férias'};
     throw Error('Consulta de teste não prevista: '+sql);
    },
    async all(){
     if(!sql.includes('FROM budget_nature_accounts'))throw Error('Consulta de teste não prevista');
     return {results:[
      {side:'D',account_id:'D1',percentage:100,cost_center_id:null},
      ...withoutCredit?[]:[{side:'C',account_id:'C1',percentage:100,cost_center_id:null}]
     ]};
    }
   };
  }};
 }};
}
const employees=()=>[
 {employee_id:'E1',employee_code:'00001',cost_center_id:'CC1',cost_center_code:'01',
  provisions:[{code:'PROV_FERIAS',status:'ESTIMADO',amount_cents:25000,nature_id:'N1',revision:1}]},
 {employee_id:'E2',employee_code:'00002',cost_center_id:'CC1',cost_center_code:'01',
  provisions:[{code:'PROV_FERIAS',status:'ESTIMADO',amount_cents:15000,nature_id:'N1',revision:1}]}
];
test('compõe partidas por natureza, centro de custo e lado, sem gravar',async()=>{
 const db=fakeDb(),result=await previewProvisionAccounting134({db,companyId:'EMPRESA_A',envelopes:employees()});
 assert.equal(result.kind,'PROVISION_ACCOUNTING_PREVIEW_134');
 assert.equal(result.read_only,true);
 assert.equal(result.official,false);
 assert.equal(result.ready_for_posting,false);
 assert.equal(result.mapping_complete,true);
 assert.equal(result.expected_cents,40000);
 assert.equal(result.mapped_cents,40000);
 assert.equal(result.debit_cents,40000);
 assert.equal(result.credit_cents,40000);
 assert.equal(result.lines.length,2);
 assert.equal(result.lines.find(x=>x.side==='D').account_code,'4.01.01');
 assert.ok(db.calls.every(x=>x.sql.startsWith('SELECT ')));
 assert.ok(db.calls.every(x=>x.args[0]==='EMPRESA_A'));
});
test('natureza sem partida a crédito impede concluir o mapeamento',async()=>{
 const r=await previewProvisionAccounting134({db:fakeDb({withoutCredit:true}),
  companyId:'A',envelopes:employees()});
 assert.equal(r.mapping_complete,false);
 assert.equal(r.mapped_cents,0);
 assert.ok(r.problems.some(x=>x.code==='PARTIDAS_PROVISAO_INCOMPLETAS'));
});
test('conta inativa impede lançamento contábil estimado',async()=>{
 const r=await previewProvisionAccounting134({db:fakeDb({wrongAccount:true}),
  companyId:'A',envelopes:employees()});
 assert.equal(r.mapping_complete,false);
 assert.equal(r.lines.length,0);
 assert.ok(r.problems.some(x=>x.code==='CONTA_PROVISAO_INVALIDA'));
});
test('natureza inexistente ou de outra empresa não pode ser usada',async()=>{
 const r=await previewProvisionAccounting134({db:fakeDb({missingNature:true}),
  companyId:'A',envelopes:employees()});
 assert.equal(r.mapping_complete,false);
 assert.ok(r.problems.some(x=>x.code==='NATUREZA_PROVISAO_INVALIDA'));
});
test('sem centro de custo a previsão não gera débito nem crédito',async()=>{
 const e=employees();e[0].cost_center_id=null;e[1].provisions=[];
 const r=await previewProvisionAccounting134({db:fakeDb(),companyId:'A',envelopes:e});
 assert.equal(r.mapping_complete,false);
 assert.equal(r.lines.length,0);
 assert.ok(r.problems.some(x=>x.code==='CC_PROVISAO_AUSENTE'));
});
test('motor novo não posta mesmo com dados mapeados e conciliados',async()=>{
 const r=await previewProvisionAccounting134({db:fakeDb(),companyId:'A',envelopes:employees()});
 assert.equal(r.mapping_complete,true);
 assert.equal(r.ready_for_posting,false);
});
