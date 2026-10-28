import test from 'node:test';
import assert from 'node:assert/strict';
import {planNatureDefaults126} from '../sagas-payroll-ledger126.js';

const row=(side,account,percentage=100,cc='CC1')=>({
 side,account_id:account,percentage,cost_center_id:cc,branch_id:'BR1'
});
function planned(defaults,cents,options={}){
 return planNatureDefaults126(defaults,'CC1',cents,options);
}
test('salario-base contabiliza somente debito de 1800, sem exigir credito no mesmo evento',()=>{
 const p=planned([row('D','DESPESA_SALARIO')],180000);
 assert.deepEqual(p.problems,[]);
 assert.equal(p.lines.length,1);
 assert.deepEqual(p.lines.map(x=>[x.side,x.account_id,x.amount_cents]),[['D','DESPESA_SALARIO',180000]]);
});
test('INSS do empregado contabiliza somente credito de 144, sem exigir debito',()=>{
 const p=planned([row('C','INSS_RECOLHER')],14400);
 assert.deepEqual(p.problems,[]);
 assert.deepEqual(p.lines.map(x=>[x.side,x.account_id,x.amount_cents]),[['C','INSS_RECOLHER',14400]]);
});
test('FGTS patronal pode ser contabilizado com debito e credito',()=>{
 const p=planned([row('D','FGTS_CUSTO'),row('C','FGTS_PASSIVO')],14400);
 assert.deepEqual(p.problems,[]);
 assert.equal(p.lines.length,2);
 assert.equal(p.lines.filter(x=>x.side==='D').length,1);
 assert.equal(p.lines.filter(x=>x.side==='C').length,1);
});
test('liquido de salario exige apenas credito',()=>{
 const p=planned([row('C','SALARIOS_PAGAR')],165600,{requireCreditOnly:true});
 assert.deepEqual(p.problems,[]);
 assert.equal(p.lines[0].amount_cents,165600);
 assert.equal(p.lines[0].side,'C');
});
test('salario, INSS e liquido fecham sem contabilizar duplicado o salario-base',()=>{
 const all=[
  ...planned([row('D','DESPESA_SALARIO')],180000).lines,
  ...planned([row('C','INSS_RECOLHER')],14400).lines,
  ...planned([row('C','SALARIOS_PAGAR')],165600,{requireCreditOnly:true}).lines,
  ...planned([row('D','FGTS_CUSTO'),row('C','FGTS_PASSIVO')],14400).lines
 ];
 const total=side=>all.filter(l=>l.side===side).reduce((sum,l)=>sum+l.amount_cents,0);
 assert.equal(total('D'),194400);
 assert.equal(total('C'),194400);
 assert.equal(all.filter(l=>l.account_id==='SALARIOS_PAGAR').length,1);
});
test('natureza do liquido com debito adicional e rejeitada',()=>{
 const p=planned([row('D','DESPESA'),row('C','SALARIOS_PAGAR')],165600,{requireCreditOnly:true});
 assert.equal(p.lines.length,0);
 assert.ok(p.problems.some(x=>x.code==='LIQUIDO_COM_DEBITO'));
});
test('natureza do liquido sem credito e rejeitada',()=>{
 const p=planned([row('D','DESPESA')],165600,{requireCreditOnly:true});
 assert.equal(p.lines.length,0);
 assert.ok(p.problems.some(x=>x.code==='LIQUIDO_SEM_CREDITO'));
});
test('natureza sem defaults aplicaveis ao centro de custo e rejeitada',()=>{
 const p=planned([row('D','CC2_EXP',100,'CC2')],10000);
 assert.equal(p.lines.length,0);
 assert.ok(p.problems.some(x=>x.code==='DEFAULT_NATUREZA_AUSENTE'));
});
test('defaults especificos do CC prevalecem sobre defaults gerais',()=>{
 const p=planned([row('D','GERAL',100,null),row('D','CC1_EXP')],10000);
 assert.deepEqual(p.problems,[]);
 assert.equal(p.lines[0].account_id,'CC1_EXP');
 assert.equal(p.lines.length,1);
});
test('cada lado presente deve somar 100 por centro de custo',()=>{
 const p=planned([row('D','EXP',90),row('C','PASSIVO',100)],15000);
 assert.equal(p.lines.length,0);
 assert.ok(p.problems.some(x=>x.code==='PERCENTUAIS_NATUREZA'));
});
test('rateio de 33.33 e 66.67 distribui centavos sem perder valor',()=>{
 const p=planned([row('C','P1',33.33),row('C','P2',66.67)],101);
 assert.deepEqual(p.problems,[]);
 assert.equal(p.lines.reduce((a,x)=>a+x.amount_cents,0),101);
});
test('valores negativos e centros ausentes sao bloqueados',()=>{
 assert.equal(planned([row('D','EXP')],-1).problems[0].code,'VALOR_OU_CC_INVALIDO');
 assert.equal(planNatureDefaults126([row('C','S')],null,100).problems[0].code,'VALOR_OU_CC_INVALIDO');
});
