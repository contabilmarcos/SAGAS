import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEvent127,simulateEvent127} from '../sagas-payroll-designer127.js';
class H extends Error{
 constructor(status,message,code){super(message);this.status=status;this.code=code;}
}
const d={HttpError:H};
const base=(overrides={})=>({
 code:'SALARIO_BASE',name:'Salario base',active:true,category:'PROVENTO',
 system:'REMUNERACAO',trigger:'AUTOMATICO',calculation:'SALARIO_DIAS',
 base:'SALARIO_CONTRATUAL',effective_from:'2026-10',
 days_basis:30,incidences:{inss:'SIM',irrf:'SIM',fgts:'SIM'},...overrides
});
test('salario e parametrizado por divisor comercial de 30 dias',()=>{
 const c=normalizeEvent127(base(),d);
 assert.equal(simulateEvent127(c,{SALARIO_CONTRATUAL:1800,quantidade:30}).amount,1800);
 assert.equal(simulateEvent127(c,{SALARIO_CONTRATUAL:1800,quantidade:15}).amount,900);
});
test('faltas configuradas com quantidade de dias e base salarial',()=>{
 const c=normalizeEvent127(base({code:'FALTA',name:'Falta desconto',category:'DESCONTO',
  trigger:'MANUAL',calculation:'FALTA_DIAS',incidences:{inss:'SIM',irrf:'SIM',fgts:'SIM'}}),d);
 assert.deepEqual(simulateEvent127(c,{SALARIO_CONTRATUAL:1800,quantidade:2}),
  {amount_cents:12000,amount:120,employee_discount:true,employer_charge:false,read_only:true});
});
test('INSS progressivo usa aliquotas por faixas cadastradas, sem taxar base inteira',()=>{
 const c=normalizeEvent127(base({code:'INSS_EMP',name:'INSS empregado',category:'DESCONTO',system:'RETENCAO',
  calculation:'TABELA_PROGRESSIVA',base:'BASE_INSS',incidences:{inss:'NAO',irrf:'NAO',fgts:'NAO'},
  bands:[{to:1000,rate:5},{to:2000,rate:10},{to:100000,rate:12}]}),d);
 assert.equal(simulateEvent127(c,{BASE_INSS:1800}).amount,130);
});
test('tabela dedutivel suporta faixa e parcela a deduzir configuravel',()=>{
 const c=normalizeEvent127(base({code:'IRRF_EMP',name:'Imposto de renda',category:'DESCONTO',system:'RETENCAO',
  calculation:'TABELA_FAIXA_DEDUCAO',base:'BASE_IRRF',incidences:{inss:'NAO',irrf:'NAO',fgts:'NAO'},
  bands:[{to:1000,rate:0,deduction:0},{to:20000,rate:15,deduction:100}]}),d);
 assert.equal(simulateEvent127(c,{BASE_IRRF:3000}).amount,350);
});
test('FGTS e encargo patronal, nunca desconto do empregado',()=>{
 const c=normalizeEvent127(base({code:'FGTS_PATRONAL',name:'FGTS patronal',category:'ENCARGO',
  system:'ENCARGO_PATRONAL',calculation:'PERCENTUAL_BASE',base:'BASE_FGTS',rate:8,
  incidences:{inss:'NAO',irrf:'NAO',fgts:'NAO'}}),d);
 assert.equal(simulateEvent127(c,{BASE_FGTS:1800}).amount,144);
 assert.equal(simulateEvent127(c,{BASE_FGTS:1800}).employee_discount,false);
 assert.equal(simulateEvent127(c,{BASE_FGTS:1800}).employer_charge,true);
});
test('INSS patronal, terceiros e RAT sao configuracoes independentes sem porcentagem fixa no codigo',()=>{
 const mk=(code,rate)=>normalizeEvent127(base({code,name:code,category:'ENCARGO',
  system:'ENCARGO_PATRONAL',calculation:'PERCENTUAL_BASE',base:'BASE_INSS',rate,
  incidences:{inss:'NAO',irrf:'NAO',fgts:'NAO'}}),d);
 assert.deepEqual([20,5.8,2].map((rate,i)=>
  simulateEvent127(mk(['CPP','TERCEIROS','RAT'][i],rate),{BASE_INSS:1800}).amount),
  [360,104.4,36]);
});
test('falta de aliquota em percentual nao pode ser salva',()=>{
 assert.throws(()=>normalizeEvent127(base({code:'CPP',name:'CPP',category:'ENCARGO',
  system:'ENCARGO_PATRONAL',calculation:'PERCENTUAL_BASE',rate:undefined}),d),/aliquota/);
});
test('tabelas com faixas fora de ordem sao rejeitadas',()=>{
 assert.throws(()=>normalizeEvent127(base({calculation:'TABELA_PROGRESSIVA',
  bands:[{to:500,rate:10},{to:300,rate:20}]}),d),/crescentes/);
});
test('retencao de imposto nao cria nova incidencia na propria base',()=>{
 assert.throws(()=>normalizeEvent127(base({code:'INSS_EMP',name:'INSS',category:'DESCONTO',
  system:'RETENCAO',calculation:'PERCENTUAL_BASE',rate:10,incidences:{inss:'SIM',irrf:'NAO',fgts:'NAO'}}),d),/Retencao/);
});
test('nao permite regras sem competencia e categoria',()=>{
 assert.throws(()=>normalizeEvent127(base({effective_from:'2026-15'}),d),/vigencia/);
 assert.throws(()=>normalizeEvent127(base({category:'INVALIDO'}),d),/classificacao/);
});
test('configuracao carrega natureza e grupo como IDs, sem codigo contábil gravado no evento',()=>{
 const c=normalizeEvent127(base({group_id:'GRUPO1',nature_id:'NAT1'}),d);
 assert.equal(c.group_id,'GRUPO1');assert.equal(c.nature_id,'NAT1');
});
test('salario mensal com valor fora dos limites nao e processado',()=>{
 const c=normalizeEvent127(base(),d);
 assert.throws(()=>simulateEvent127(c,{SALARIO_CONTRATUAL:-1,quantidade:30}),/invalida/);
});
