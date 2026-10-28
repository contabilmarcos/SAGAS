import test from 'node:test';
import assert from 'node:assert/strict';
import {compilePayrollSql128,bindPayrollSql128,evaluatePayrollSql128,PAYROLL_SQL_VARIABLES128} from '../sagas-payroll-sql128.js';
import {normalizeEvent127} from '../sagas-payroll-designer127.js';

const d={HttpError:class extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code}}};
function event(sql,details={}){
 return {code:'DECIMO_TERCEIRO',name:'Decimo terceiro',
  category:'PROVENTO',system:'REMUNERACAO',calculation:'SQL_PERSONALIZADO',
  base:'SALARIO_REFERENCIA_13',trigger:'AUTOMATICO',
  effective_from:'2026-10',incidences:{inss:'SIM',irrf:'SIM',fgts:'SIM'},
  sql_query:sql,...details};
}
test('SQL valida formula de 13o, compila variaveis para placeholders sem interpolacao',()=>{
 const sql='SELECT ROUND(:SALARIO_REFERENCIA_13 * :AVOS_13 / 12.0, 2) AS VALOR';
 const p=compilePayrollSql128(sql);
 assert.equal(p.sql,'SELECT ROUND(((?1 * ?2) / 12.0), 2) AS VALOR');
 assert.deepEqual(p.variables,['SALARIO_REFERENCIA_13','AVOS_13']);
 assert.deepEqual(bindPayrollSql128(p,{SALARIO_REFERENCIA_13:3000,AVOS_13:8}),[3000,8]);
 const cfg=normalizeEvent127(event(sql),d);
 assert.deepEqual(cfg.sql_variables,['SALARIO_REFERENCIA_13','AVOS_13']);
 assert.equal(cfg.sql_query,sql);
});
test('SQL com parametro repetido reutiliza o mesmo binding',()=>{
 const p=compilePayrollSql128('SELECT :SALARIO_CONTRATUAL - :SALARIO_CONTRATUAL + 10 AS VALOR');
 assert.deepEqual(p.variables,['SALARIO_CONTRATUAL']);
 assert.equal((p.sql.match(/\?1/g)||[]).length,2);
});
test('CASE WHEN, condicoes, ROUND e COALESCE sao admitidos',()=>{
 const p=compilePayrollSql128('SELECT CASE WHEN :AVOS_13 <= 6 THEN ROUND(:SALARIO_REFERENCIA_13 * :AVOS_13 / 12, 2) ELSE COALESCE(:SALARIO_REFERENCIA_13, 0) END AS VALOR');
 assert.match(p.sql,/CASE WHEN/);assert.match(p.sql,/COALESCE/);
});
test('SQL nao permite FROM nem referencias a tabelas ou informacoes de outras empresas',()=>{
 for(const q of [
  'SELECT salary FROM payroll_employees AS VALOR',
  'SELECT (SELECT COUNT(*) FROM companies) AS VALOR',
  'SELECT :SALARIO_CONTRATUAL AS VALOR FROM payroll_employees',
  'SELECT :SALARIO_CONTRATUAL AS VALOR JOIN users',
  'SELECT sqlite_version() AS VALOR'
 ])assert.throws(()=>compilePayrollSql128(q),Error,q);
});
test('bloqueia SQL de escrita, SQL injection, comandos multiplos, comentarios e PRAGMA',()=>{
 for(const q of [
  'DELETE FROM payroll_employees',
  'UPDATE payroll_events SET active=0',
  'DROP TABLE payroll_events',
  'PRAGMA table_info(payroll_employees)',
  'SELECT :SALARIO_CONTRATUAL AS VALOR; DROP TABLE payroll_events',
  'SELECT :SALARIO_CONTRATUAL AS VALOR -- comentario',
  'SELECT :SALARIO_CONTRATUAL AS VALOR /*comment*/',
  'SELECT ?1 AS VALOR',
  'SELECT :SALARIO_CONTRATUAL AS VALOR UNION SELECT 1 AS VALOR',
  'WITH t AS (SELECT 1) SELECT * FROM t'
 ])assert.throws(()=>compilePayrollSql128(q),Error,q);
});
test('bloqueia variaveis sem cadastro, argumentos ausentes e SQL malformado',()=>{
 assert.throws(()=>compilePayrollSql128('SELECT :CPF AS VALOR'),/Variavel SQL indisponivel/);
 assert.throws(()=>compilePayrollSql128('SELECT UNKNOWN_FUNC(:BASE_FGTS) AS VALOR'),/nao permitido/);
 assert.throws(()=>compilePayrollSql128('SELECT :BASE_INSS AS OUTRO'),/esperado VALOR/);
 assert.throws(()=>bindPayrollSql128(compilePayrollSql128('SELECT :AVOS_13 AS VALOR'),{}),/sem valor/);
 assert.throws(()=>normalizeEvent127(event('SELECT * FROM employees AS VALOR'),d),/Consulta SQL invalida/);
 assert.ok(PAYROLL_SQL_VARIABLES128.includes('BASE_FGTS_13'));
});
test('simulacao server-side so executa SQL compilado e valores numericos vinculados',async()=>{
 const seen={};
 const db={prepare(sql){
  seen.sql=sql;
  return {bind(...args){seen.args=args;return {first:async()=>({VALOR:args[0]*args[1]/12})}}};
 }};
 const q='SELECT ROUND(:SALARIO_REFERENCIA_13 * :AVOS_13 / 12, 2) AS VALOR';
 const r=await evaluatePayrollSql128(db,q,{SALARIO_REFERENCIA_13:3000,AVOS_13:8});
 assert.equal(r.amount,2000);
 assert.deepEqual(r.variables,['SALARIO_REFERENCIA_13','AVOS_13']);
 assert.deepEqual(seen.args,[3000,8]);
 assert.equal(seen.sql.includes('FROM'),false);
 assert.equal(seen.sql.includes('3000'),false);
 assert.equal(r.read_only,true);
});
test('SQL nao aceita retorno negativo, nulo, texto nao numerico ou valores fora do limite',async()=>{
 for(const VALOR of [-1,null,'texto',Infinity,1000000000]){
  const db={prepare(){return{bind(){return{first:async()=>({VALOR})}}}}};
  await assert.rejects(()=>evaluatePayrollSql128(db,'SELECT 1 AS VALOR',{}),Error);
 }
});
test('valores de parametros fora do limite nao sao enviados ao D1',()=>{
 const p=compilePayrollSql128('SELECT :SALARIO_CONTRATUAL AS VALOR');
 assert.throws(()=>bindPayrollSql128(p,{SALARIO_CONTRATUAL:-2}),/fora do limite/);
 assert.throws(()=>bindPayrollSql128(p,{SALARIO_CONTRATUAL:'abc'}),/fora do limite/);
});
