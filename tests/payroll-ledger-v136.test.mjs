import test from 'node:test';
import assert from 'node:assert/strict';
import {previewPayrollLedger136} from '../sagas-payroll-ledger136.js';
import {readFileSync} from 'node:fs';
const base=()=>({
 sourceEnvelopes:[{employee_id:'E1',employee_code:'00001',cost_center_id:'CC1',
  net_cents:270000,lines:[
   {event_code:'SALARIO_BASE',line_type:'PROVENTO',amount_cents:300000},
   {event_code:'INSS_EMP',line_type:'DESCONTO',amount_cents:27000},
   {event_code:'IRRF_EMP',line_type:'DESCONTO',amount_cents:3000},
   {event_code:'FGTS_PATRONAL',line_type:'INFORMATIVO',amount_cents:24000}
  ]}],
 envelopes:[{employee_id:'E1',employee_code:'00001',projected:{
   gross_cents:330000,discount_cents:35740,net_cents:294260,
   fgts_cents:26400,employer_cents:66000,
   events:[
    {code:'BONUS',category:'PROVENTO',status:'PROJETADO',amount_cents:30000},
    {code:'INSS_EMP',category:'DESCONTO',status:'PROJETADO',amount_cents:33000},
    {code:'IRRF_EMP',category:'DESCONTO',status:'PROJETADO',amount_cents:2740},
    {code:'FGTS_PATRONAL',category:'ENCARGO',status:'PROJETADO',amount_cents:26400},
    {code:'INSS_PATRONAL',category:'ENCARGO',status:'PROJETADO',amount_cents:66000}
   ]
 }}],
 configs:['SALARIO_BASE','INSS_EMP','IRRF_EMP','FGTS_PATRONAL','INSS_PATRONAL','BONUS'].map(code=>({
  config:{code,nature_id:'N_'+code}
 }))
});
function dbFake({missingNet=false,invalidNature=null,wrongNet=false,secondCenter=false}={}){
 const activity=[];
 const defaults={
  'N_SALARIO_BASE':[['D','DESPESA_SAL']],
  'N_INSS_EMP':[['C','INSS_RECOLHER']],
  'N_IRRF_EMP':[['C','IRRF_RECOLHER']],
  'N_FGTS_PATRONAL':[['D','DESPESA_FGTS'],['C','FGTS_RECOLHER']],
  'N_INSS_PATRONAL':[['D','DESPESA_CPP'],['C','CPP_RECOLHER']],
  'N_BONUS':[['D','DESPESA_BONUS']],
  'N_NET':wrongNet?[['D','ERRO_DEBITO'],['C','SALARIOS_PAGAR']]:[['C','SALARIOS_PAGAR']]
 };
 return {activity,prepare(sql){
  assert.ok(sql.startsWith('SELECT '),'Somente consultas SELECT');
  return {bind(...args){
   activity.push({sql,args});
   return {
    async first(){
     if(sql.includes('FROM payroll_finance_net_natures126'))return missingNet?null:{nature_id:'N_NET'};
     if(sql.includes('FROM cost_centers'))return {id:args[1],code:'01',active:1};
     if(sql.includes('FROM budget_natures')){
      if(invalidNature===args[1])return null;
      return {id:args[1],code:args[1],active:1,synthetic_analytic:'ANALYTIC'};
     }
     if(sql.includes('FROM accounts'))return {id:args[1],code:args[1],name:'Conta '+args[1]};
     throw Error('SQL não modelado: '+sql);
    },
    async all(){
     if(!sql.includes('FROM budget_nature_accounts'))throw Error('SQL não modelado: '+sql);
     return {results:(defaults[args[1]]||[]).map(([side,account_id])=>({
      side,account_id,percentage:100,cost_center_id:null
     }))};
    }
   };
  }};
 }};
}
test('prévia contábil v136 fecha salário, prêmio, impostos, FGTS, CPP e líquido',async()=>{
 const db=dbFake(),r=await previewPayrollLedger136({db,companyId:'A',...base()});
 assert.equal(r.kind,'PAYROLL_LEDGER_PREVIEW_136');
 assert.equal(r.debit_cents,422400);
 assert.equal(r.credit_cents,422400);
 assert.equal(r.net_payable_cents,294260);
 assert.equal(r.balanced,true);
 assert.equal(r.ready_for_posting,false);
 assert.equal(r.lines.length,9);
 assert.ok(db.activity.every(x=>x.args[0]==='A'));
 assert.ok(db.activity.every(x=>x.sql.startsWith('SELECT ')));
});
test('sem natureza do líquido o diário não pode ser considerado conciliado',async()=>{
 const r=await previewPayrollLedger136({db:dbFake({missingNet:true}),companyId:'A',...base()});
 assert.equal(r.balanced,false);
 assert.ok(r.problems.some(x=>x.code==='LEDGER_NET_NATURE_MISSING'));
 assert.ok(r.problems.some(x=>x.code==='LEDGER_UNBALANCED'));
});
test('natureza de outro cadastro não gera lançamento contabilizado',async()=>{
 const r=await previewPayrollLedger136({db:dbFake({invalidNature:'N_BONUS'}),companyId:'A',...base()});
 assert.equal(r.balanced,false);
 assert.ok(r.problems.some(x=>x.code==='LEDGER_NATURE_INVALID'));
});
test('natureza do líquido com débito é rejeitada',async()=>{
 const r=await previewPayrollLedger136({db:dbFake({wrongNet:true}),companyId:'A',...base()});
 assert.equal(r.balanced,false);
 assert.ok(r.problems.some(x=>x.code==='LEDGER_LIQUIDO_COM_DEBITO'));
});
test('evento legado sem configuração não fica invisível ao diário',async()=>{
 const s=base();
 s.sourceEnvelopes[0].lines.push({event_code:'FALTA_INJUSTIFICADA',line_type:'DESCONTO',amount_cents:10000});
 s.envelopes[0].projected.discount_cents+=10000;
 s.envelopes[0].projected.net_cents-=10000;
 const r=await previewPayrollLedger136({db:dbFake(),companyId:'A',...s});
 assert.ok(r.problems.some(x=>x.code==='LEDGER_EVENT_NOT_CONFIGURED'));
 assert.equal(r.balanced,false);
});
test('sem projeção do funcionário não inventa valor líquido nem partidas',async()=>{
 const s=base();s.envelopes[0].projected=null;
 const r=await previewPayrollLedger136({db:dbFake(),companyId:'A',...s});
 assert.equal(r.net_payable_cents,0);
 assert.ok(r.problems.some(x=>x.code==='LEDGER_PROJECTION_MISSING'));
});
test('integração da prévia na API e na tela permanece sem POST',()=>{
 const engine=readFileSync(new URL('../sagas-payroll-engine133.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../sagas-payroll-engine133-ui.js',import.meta.url),'utf8');
 assert.match(engine,/previewPayrollLedger136/);
 assert.match(ui,/Conferência contábil do novo motor/);
});
