import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateEmployee141,ledgerLines141} from '../sagas-payroll-simple141.js';
class H extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code}}
const d={HttpError:H,tax:(base,irrf,fgts)=>({
 inss_cents:Math.round(base*.1),irrf_cents:Math.round(irrf*.01),
 fgts_cents:Math.round(fgts*.08)})};
const settings={cpp_due:'SIM',rat_due:'SIM',thirds_due:'SIM',pis_due:'SIM',
 cpp_bp:2000,rat_bp:200,thirds_bp:580,pis_bp:100,fap_10000:10000};
const employee={
 id:'EMP1',employee_code:'00001',name:'Funcionário',salary_cents:300000,
 admission_date:'2020-01-01',cost_center_id:'CC1'};
const tax=()=>calculateEmployee141(employee,'2020-01','2020-01-31',settings,d);
test('cálculo simples usa somente salário e impostos, sem lançar eventos variáveis',()=>{
 const r=tax();
 assert.equal(r.events.SALARIO_BASE,300000);
 assert.equal(r.events.INSS_EMP,30000);
 assert.equal(r.events.IRRF_EMP,3000);
 assert.equal(r.events.SALARIO_LIQUIDO,267000);
 assert.equal(r.events.FGTS_PATRONAL,24000);
 assert.equal(r.events.CPP_PATRONAL,60000);
 assert.equal(r.events.RAT_PATRONAL,6000);
 assert.equal(r.events.TERCEIROS_PATRONAL,17400);
 assert.equal(r.events.PIS_FOLHA,3000);
});
test('provisão mensal separa 13º, férias, 1/3 e FGTS',()=>{
 const t=tax().events;
 assert.equal(t.PROV_13,25000);
 assert.equal(t.PROV_FERIAS,25000);
 assert.equal(t.PROV_TERCO,8333);
 assert.equal(t.PROV_FGTS_13,2000);
 assert.equal(t.PROV_FGTS_FERIAS,2667);
 assert.equal(t.PROV_CPP_13,5000);
});
test('admissão em 20 de janeiro calcula salário proporcional e não cria avo integral',()=>{
 const r=calculateEmployee141({...employee,admission_date:'2020-01-20'},'2020-01','2020-01-31',settings,d);
 assert.equal(r.worked_days,12);
 assert.equal(r.events.SALARIO_BASE,116129);
 assert.equal(r.events.PROV_13,0);
 assert.equal(r.events.PROV_FERIAS,0);
});
test('admissão em 2 de janeiro mantém provisões com 30 dias de vínculo',()=>{
 const r=calculateEmployee141({...employee,admission_date:'2020-01-02'},'2020-01','2020-01-31',settings,d);
 assert.equal(r.worked_days,30);
 assert.equal(r.events.SALARIO_BASE,290323);
 assert.equal(r.events.PROV_13,25000);
});
test('alíquotas dispensadas não são cobradas',()=>{
 const s={...settings,cpp_due:'NAO',rat_due:'NAO',thirds_due:'NAO',pis_due:'NAO'};
 const e=calculateEmployee141(employee,'2020-01','2020-01-31',s,d).events;
 for(const k of ['CPP_PATRONAL','RAT_PATRONAL','TERCEIROS_PATRONAL','PIS_FOLHA','PROV_CPP_13'])
  assert.equal(e[k],0);
});
test('lançamentos contábeis aceitam apenas D, apenas C ou D/C',()=>{
 const t=tax().events;
 const m={
  SALARIO_BASE:{debit_account_id:'DESP_SAL'},
  INSS_EMP:{credit_account_id:'INSS_REC'},
  IRRF_EMP:{credit_account_id:'IRRF_REC'},
  SALARIO_LIQUIDO:{credit_account_id:'SAL_PAG'}
 };
 for(const code of ['FGTS_PATRONAL','CPP_PATRONAL','RAT_PATRONAL','TERCEIROS_PATRONAL','PIS_FOLHA',
 'PROV_13','PROV_FERIAS','PROV_TERCO','PROV_FGTS_13','PROV_FGTS_FERIAS',
 'PROV_CPP_13','PROV_CPP_FERIAS','PROV_RAT_13','PROV_RAT_FERIAS',
 'PROV_TERCEIROS_13','PROV_TERCEIROS_FERIAS'])
  m[code]={debit_account_id:'DESP_'+code,credit_account_id:'PAG_'+code};
 const r=ledgerLines141(t,m,'CC1',d);
 assert.equal(r.balanced,true);
 assert.equal(r.debit_cents,r.credit_cents);
 assert.ok(r.lines.some(x=>x.event_code==='SALARIO_BASE'&&x.side==='D'));
 assert.ok(r.lines.some(x=>x.event_code==='INSS_EMP'&&x.side==='C'));
 assert.ok(r.lines.some(x=>x.event_code==='PROV_13'&&x.side==='D'));
 assert.ok(r.lines.some(x=>x.event_code==='PROV_13'&&x.side==='C'));
 assert.ok(r.lines.every(x=>x.cost_center_id==='CC1'));
});
test('se faltar conta ou houver diferença D/C, lote novo é bloqueado',()=>{
 const t=tax().events;
 const r=ledgerLines141(t,{SALARIO_BASE:{debit_account_id:'DESP_SAL'}},'CC1',d);
 assert.equal(r.balanced,false);
 assert.ok(r.missing.length>0);
});
test('API mantém contabilidade separada do cálculo e exige fechamento do lote equilibrado',()=>{
 const worker=readFileSync(new URL('../SAGAS_worker.js',import.meta.url),'utf8');
 const module=readFileSync(new URL('../sagas-payroll-simple141.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(worker,/payrollSimple141\(/);
 assert.match(module,/payroll_simple_postings141/);
 assert.match(module,/d\.createBatch/);
 assert.match(module,/if\(!plan\.balanced\)/);
 assert.match(module,/accounting\.batch\.manage/);
 assert.match(module,/accounting\.entry\.create/);
 assert.match(ui,/payroll-simple-calculate/);
 assert.match(ui,/payroll-simple-report/);
 assert.match(ui,/payroll-simple-accounting/);
});
