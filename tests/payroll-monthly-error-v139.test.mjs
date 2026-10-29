import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const worker=readFileSync(new URL('../SAGAS_worker.js',import.meta.url),'utf8');
const from=worker.indexOf('function payrollMonthlyTechnical139(');
const to=worker.indexOf('async function payrollMonthlyRunCreate35(',from);
assert.ok(from>=0&&to>from,'Não localizou o diagnóstico de falhas mensais');
class HttpError extends Error {
 constructor(status,message,code,details){super(message);this.status=status;this.code=code;this.details=details}
}
const {payrollMonthlyTechnical139,payrollMonthlyChecked139}=
 new Function('HttpError',worker.slice(from,to)+
  ';return {payrollMonthlyTechnical139,payrollMonthlyChecked139}')(HttpError);

test('erro 500 de esquema vira diagnóstico específico sem vazar instruções SQL',async()=>{
 const error=new Error('D1_ERROR: no such table: payroll_salary_history, SQL SELECT salary FROM secret WHERE cpf=123');
 const e=await payrollMonthlyChecked139('LER_HISTORICOS_OPCIONAIS',
  async()=>{throw error}).then(()=>null,err=>err);
 assert.ok(e instanceof HttpError);
 assert.equal(e.status,503);
 assert.equal(e.code,'PAYROLL_SCHEMA_139');
 assert.deepEqual(e.details,{stage:'LER_HISTORICOS_OPCIONAIS'});
 assert.match(e.message,/payroll_salary_history/);
 assert.doesNotMatch(e.message,/SELECT|secret|cpf|123/);
});
test('falha desconhecida não divulga dados nem nomes de funcionários',async()=>{
 const e=payrollMonthlyTechnical139(new Error('Falha funcionário João 012.345.678-90'),
 'CALCULAR_FUNCIONARIO');
 assert.equal(e.status,503);
 assert.equal(e.code,'PAYROLL_SERVER_139');
 assert.match(e.message,/CALCULAR_FUNCIONARIO/);
 assert.doesNotMatch(e.message,/João|012\.345/);
});
test('falhas de validação já tratadas mantêm status e mensagem original',async()=>{
 const known=new HttpError(409,'Corrija o salário cadastrado.','PREPARATION_PENDING');
 const r=payrollMonthlyTechnical139(known,'PREPARAR_FUNCIONARIOS');
 assert.equal(r,known);
});
test('falhas de parâmetros D1 têm código próprio',()=>{
 const r=payrollMonthlyTechnical139(
  new Error('Incorrect number of bindings supplied. The current statement uses 2 and there are 3 supplied.'),
  'LER_LANCAMENTOS');
 assert.equal(r.code,'PAYROLL_PARAMETERS_139');
 assert.equal(r.status,503);
});
test('erro de gravação por conflito continua sendo tratado antes do diagnóstico técnico',()=>{
 const segment=worker.slice(worker.indexOf('async function payrollMonthlyRunCreate35('),
  worker.indexOf('// ===== SAGAS Folha Etapa 36'));
 assert.match(segment,/UNIQUE constraint failed\|FOREIGN KEY constraint failed/);
 assert.match(segment,/payrollMonthlyTechnical139\(err,'GRAVAR_ENVELOPES'\)/);
 assert.match(segment,/payrollMonthlyChecked139\('CALCULAR_FONTE_MENSAL'/);
});
test('a etapa de preparação aponta separadamente cadastros, frequência e lançamentos',()=>{
 const segment=worker.slice(worker.indexOf('async function payrollMonthlyPreparation34('),
  worker.indexOf('async function payrollMonthlyEmployeeCalc35('));
 for(const stage of ['LER_FUNCIONARIOS','LER_HISTORICOS_OPCIONAIS',
  'CONSULTAR_FREQUENCIA','LER_LANCAMENTOS','LER_PARAMETROS_EVENTOS'])
  assert.ok(segment.includes("'"+stage+"'"),'Etapa ausente: '+stage);
});
