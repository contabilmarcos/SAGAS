import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateAutomaticMonthly137} from '../sagas-payroll-monthly137.js';
class H extends Error{constructor(status,msg,code){super(msg);this.status=status;this.code=code;}}
const text=readFileSync(new URL('../SAGAS_worker.js',import.meta.url),'utf8');
const start=text.indexOf('async function payrollMonthlyEmployeeCalc35(');
const end=text.indexOf('async function payrollMonthlySource35(',start);
assert.ok(start>0&&end>start,'Rotina oficial mensal não encontrada');
const fragment=text.slice(start,end);
const salary=(cents)=>({salary_cents:cents,reference_text:'30 dias'});
const attendance=()=>({discount_cents:0,entries:[]});
const tax=(base,irrf,fgts)=>{
 const inss=Math.round(base*0.1);
 return {inss_cents:inss,irrf_cents:Math.round((irrf-inss)*0.01),
  fgts_cents:Math.round(fgts*0.08),irrf_base_cents:irrf-inss,
  inss_table_from:'2026-10',irrf_table_from:'2026-10'};
};
// Exercita exatamente o corpo em produção com um motor tributário determinístico
// apenas no teste. Nunca acessa o D1 ou grava lançamentos.
const fn=new Function('calculateAutomaticMonthly137','payrollSalaryAmount47',
 'payrollAbsenceAmounts48','payrollLeaveAmounts49','payrollTaxHistoricalWithDependents',
 'HttpError','centsToMoney','payrollExprCents','payrollAdmissionSalary46',
 fragment+';return payrollMonthlyEmployeeCalc35')(
  calculateAutomaticMonthly137,salary,attendance,attendance,tax,H,
  cents=>(cents/100).toFixed(2),()=>{throw Error('Fórmula manual não esperada');},
  ()=>{throw Error('Admissão não esperada')}
 );
const employee={employee_id:'E1',employee_code:'00001',employee_name:'Exemplo',cost_center_id:'CC1',
 salary_cents:300000,monthly_hours_milli:220000,admission_date:'2026-01-01'};
const bonus=[{event_id:'EVENT_BONUS',effective_from:'2026-10',revision:1,
 config:{code:'BONUS',name:'Prêmio',active:true,category:'PROVENTO',
 calculation:'PERCENTUAL_BASE',base:'SALARIO_BASE',rate:10,
 nature_id:'N_BONUS',incidences:{inss:'SIM',irrf:'SIM',fgts:'SIM'}}}];
test('o evento parametrizado chega à folha oficial, soma INSS IRRF FGTS e líquido',async()=>{
 const result=await fn(employee,[],new Map(),0,'2026-10','2026-11-05',null,
 'RM_NEXT_MONTH',[],null,null,bonus,{},'COMP');
 assert.equal(result.earnings_cents,330000);
 assert.equal(result.inss_cents,33000);
 assert.equal(result.irrf_cents,2970);
 assert.equal(result.fgts_cents,26400);
 assert.equal(result.net_cents,294030);
 const line=result.lines.find(x=>x.event_code==='BONUS');
 assert.equal(line.amount_cents,30000);
 assert.equal(line.rule_version,'DESIGNER137:2026-10#1');
 assert.equal(result.lines.filter(x=>x.event_code==='INSS_EMP').length,1);
});
test('impede repetição do evento na folha oficial',async()=>{
 await assert.rejects(()=>fn(employee,[{event_id:'M1',event_code:'BONUS'}],new Map(),0,
 '2026-10','2026-11-05',null,'RM_NEXT_MONTH',[],null,null,bonus,{},'COMP'),
 /Evento sem parametros fiscais vigentes|lançado manualmente/);
});
