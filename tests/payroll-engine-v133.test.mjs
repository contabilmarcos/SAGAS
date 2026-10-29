import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateEnvelope133,payrollEnginePreview133} from '../sagas-payroll-engine133.js';
import {readFileSync} from 'node:fs';

const envelope=()=>({
 employee_id:'E1',employee_code:'00001',employee_name:'Funcionaria Exemplo',
 cost_center_id:'CC1',cost_center_code:'001',
 earnings_cents:300000,deductions_cents:30000,net_cents:270000,
 inss_cents:27000,irrf_cents:3000,fgts_cents:24000,
 lines:[
  {event_code:'SALARIO_BASE',line_type:'PROVENTO',amount_cents:300000,reference_text:'30 dias'},
  {event_code:'INSS_EMP',line_type:'DESCONTO',amount_cents:27000,reference_text:'Base 3000.00'},
  {event_code:'IRRF_EMP',line_type:'DESCONTO',amount_cents:3000,reference_text:'Base 2500.00'},
  {event_code:'FGTS_PATRONAL',line_type:'INFORMATIVO',amount_cents:24000,reference_text:'Base 3000.00'}
 ]
});
const evt=(code,category,query)=>({config:{code,name:code,active:true,
 trigger:'AUTOMATICO',category,calculation:'SQL_PERSONALIZADO',
 sql_query:query,nature_id:'NAT',group_id:'GR'},formula_version:'2020-01#1'});
const configurations=()=>[
 evt('INSS_EMP','DESCONTO','SELECT ROUND(:BASE_INSS * 0.10, 2) AS VALOR'),
 evt('IRRF_EMP','DESCONTO','SELECT ROUND(:BASE_IRRF * 0.01, 2) AS VALOR'),
 evt('FGTS_PATRONAL','ENCARGO','SELECT ROUND(:BASE_FGTS * 0.08, 2) AS VALOR'),
 evt('INSS_PATRONAL','ENCARGO','SELECT ROUND(:BASE_INSS * 0.20, 2) AS VALOR')
];
const provisions=()=>[
 {config:{code:'PROV_FGTS_FERIAS',name:'FGTS sobre ferias',active:true,
   formula_sql:'SELECT ROUND(:PROVISAO_FERIAS * 0.08, 2) AS VALOR',
   accounting:{nature_accrual_id:'NAT_FGTS'}},revision:1},
 {config:{code:'PROV_FERIAS',name:'Ferias',active:true,
   formula_sql:'SELECT ROUND(:SALARIO_CONTRATUAL / 12, 2) AS VALOR',
   accounting:{nature_accrual_id:'NAT_FERIAS'}},revision:1}
];
function sqlDb(){
 const activity=[];
 return {
  activity,prepare(sql){
   return {bind(...args){
    activity.push({sql,args});
    return {first:async()=>{
     if(!sql.startsWith('SELECT ')||!sql.endsWith(' AS VALOR'))throw Error('SQL de teste desconhecido');
     const x=Number(args[0]);
     if(sql.includes(' / 12'))return {VALOR:x/12};
     if(sql.includes('0.01'))return {VALOR:x*.01};
     if(sql.includes('0.08'))return {VALOR:x*.08};
     if(sql.includes('0.10'))return {VALOR:x*.1};
     if(sql.includes('0.20'))return {VALOR:x*.2};
     throw Error('Formula inesperada '+sql);
    }};
   }};
  }
 };
}
test('reprocessa INSS e IRRF por formula sem alterar envelope original',async()=>{
 const e=envelope(),copy=JSON.stringify(e);
 const db=sqlDb();
 const v=await simulateEnvelope133({db,envelope:e,employeeSalaryCents:300000,
  configs:configurations(),provisions:[],settings:{cpp_due:'SIM'},
  resolveFormula:async()=>null});
 assert.equal(JSON.stringify(e),copy);
 assert.equal(v.legacy.net,270000);
 assert.equal(v.computed.inss_cents,30000);
 // BASE_IRRF = 2500 + (270 - 300) => 2470; IRRF = R$ 24,70
 assert.equal(v.computed.irrf_cents,2470);
 assert.equal(v.computed.discount_cents,32470);
 assert.equal(v.computed.net_cents,267530);
 assert.equal(v.events.find(x=>x.code==='INSS_PATRONAL').amount_cents,60000);
 assert.equal(v.events.find(x=>x.code==='FGTS_PATRONAL').amount_cents,24000);
 assert.equal(v.events.find(x=>x.code==='INSS_EMP').legacy_cents,27000);
 assert.ok(db.activity.every(x=>!/(?:DROP|DELETE|INSERT|UPDATE|FROM)/.test(x.sql)));
});
test('dependencia entre provisoes funciona mesmo se FGTS vier antes de ferias',async()=>{
 const r=await simulateEnvelope133({db:sqlDb(),envelope:envelope(),employeeSalaryCents:300000,
  configs:configurations(),provisions:provisions(),settings:{cpp_due:'SIM'},
  resolveFormula:async()=>null});
 assert.equal(r.provisions.find(x=>x.code==='PROV_FERIAS').amount_cents,25000);
 assert.equal(r.provisions.find(x=>x.code==='PROV_FGTS_FERIAS').amount_cents,2000);
 assert.equal(r.problems.filter(p=>p.code==='PROVISION_DEPENDENCY').length,0);
});
test('nao calcula CPP quando cadastro patronal indica nao devido',async()=>{
 const result=await simulateEnvelope133({db:sqlDb(),envelope:envelope(),employeeSalaryCents:300000,
  configs:configurations(),provisions:[],settings:{cpp_due:'NAO'},resolveFormula:async()=>null});
 const cpp=result.events.find(x=>x.code==='INSS_PATRONAL');
 assert.equal(cpp.status,'NAO_DEVIDO');
 assert.equal(cpp.amount_cents,0);
});
test('estimativa 13o de salario contratual emite aviso sobre medias e avos',async()=>{
 const p=[{config:{code:'PROV_13',name:'13o salario',active:true,
  formula_sql:'SELECT ROUND(:SALARIO_REFERENCIA_13 / 12, 2) AS VALOR',
  accounting:{nature_accrual_id:'NAT_13'}},revision:1}];
 const r=await simulateEnvelope133({db:sqlDb(),envelope:envelope(),employeeSalaryCents:300000,
  configs:configurations(),provisions:p,settings:{cpp_due:'SIM'},resolveFormula:async()=>null});
 assert.equal(r.provisions[0].amount_cents,25000);
 assert.ok(r.problems.some(x=>x.code==='AVERAGE_REFERENCE_NOT_VALIDATED'));
 assert.equal(r.ready,false);
});
test('sem fonte de salario nao inventa base nem calcula provisoes',async()=>{
 const r=await simulateEnvelope133({db:sqlDb(),envelope:envelope(),employeeSalaryCents:null,
  configs:configurations(),provisions:provisions(),settings:{cpp_due:'SIM'},
  resolveFormula:async()=>null});
 assert.ok(r.problems.some(x=>x.code==='PROVISION_DEPENDENCY'));
 assert.ok(r.provisions.every(x=>x.code!=='PROV_FERIAS'||x.status!=='ESTIMADO'));
});
test('parametros patronais ausentes nunca sao tratados como isencao',async()=>{
 const result=await simulateEnvelope133({db:sqlDb(),envelope:envelope(),employeeSalaryCents:300000,
  configs:configurations(),provisions:[],settings:null,resolveFormula:async()=>null});
 const cpp=result.events.find(x=>x.code==='INSS_PATRONAL');
 assert.equal(cpp.status,'PENDENTE');
 assert.ok(result.problems.some(p=>p.code==='EMPLOYER_PARAMETERS_MISSING'));
 assert.equal(result.ready,false);
});
test('divergencia entre formula INSS e folha anterior e exibida como pendencia',async()=>{
 const result=await simulateEnvelope133({db:sqlDb(),envelope:envelope(),employeeSalaryCents:300000,
  configs:configurations(),provisions:[],settings:{cpp_due:'SIM'},
  resolveFormula:async()=>null});
 assert.ok(result.problems.some(p=>p.code==='EVENT_VALUE_DIVERGENCE'&&p.message.includes('INSS_EMP')));
 assert.equal(result.ready,false);
});
test('nao homologa fechamento sem formula essencial do INSS',async()=>{
 const r=await simulateEnvelope133({db:sqlDb(),envelope:envelope(),employeeSalaryCents:300000,
  configs:configurations().filter(x=>x.config.code!=='INSS_EMP'),
  provisions:[],settings:{cpp_due:'SIM'},resolveFormula:async()=>null});
 assert.ok(r.problems.some(x=>x.code==='INSS_NOT_CONFIGURED'));
 assert.equal(r.ready,false);
});
test('bases historicas invalidas produzem impedimento sem gerar valor inventado',async()=>{
 const e=envelope();
 e.lines[1].reference_text='Base nao conferida';
 const r=await simulateEnvelope133({db:sqlDb(),envelope:e,employeeSalaryCents:300000,
  configs:configurations(),provisions:[],settings:{cpp_due:'SIM'},resolveFormula:async()=>null});
 assert.ok(r.problems.some(x=>x.code==='SOURCE_INVALID'));
 assert.equal(r.computed,undefined);
});
test('respeita formulas versionadas, empresa e folha gravada no preview integrado',async()=>{
 const db=sqlDb();
 const events=configurations().map((x,i)=>({
  id:'E'+i,code:x.config.code,event_active:1,
  effective_from:'2020-01',revision:1,config_json:JSON.stringify(x.config)
 }));
 const ver=provisions().map((x,i)=>({
  id:'P'+i,code:x.config.code,provision_active:1,
  effective_from:'2020-01',revision:1,config_json:JSON.stringify(x.config)
 }));
 db.prepare=function(sql){
  return {bind(...args){
   db.activity.push({sql,args});
   return {
    first:async()=>{throw Error('Nao deveria ler ou escrever fora da prévia');},
    all:async()=>{
     if(sql.includes('FROM payroll_designer_config127'))return {results:events};
     if(sql.includes('FROM payroll_provision_versions132'))return {results:ver};
     if(sql.includes('FROM payroll_salary_history'))
      return {results:[{employee_id:'E1',salary_cents:300000,effective_from:'2020-01-01'}]};
     throw Error('Consulta nao reconhecida '+sql);
    }
   };
  }};
 };
 // Neste teste substituimos apenas o executor das expressoes SQL da simulação:
 // A consulta no backend real é sempre compilada e parametrizada.
 const result=await payrollEnginePreview133({
  env:{DB:db},companyId:'COMPANY_A',auth:{user:{id:'USER_A'}},runId:'RUN1',
  d:{
   requirePermission:async(_env,user,company,perm)=>{
    assert.equal(user,'USER_A');assert.equal(company,'COMPANY_A');assert.equal(perm,'payroll.read');
   },
   runDetail:async()=>({run:{id:'RUN1',competence:'2020-01',status:'APPROVED'},
    envelopes:[envelope()]}),
   employerRead:async()=>({cpp_due:'NAO'}),
   HttpError:class extends Error{constructor(status,msg,code){super(msg);this.status=status;this.code=code}}
  }
 });
 assert.equal(result.official,false);
 assert.equal(result.ready_for_posting,false);
 assert.equal(result.run.status,'APPROVED');
 assert.equal(result.employee_count,1);
 assert.equal(result.event_count,4);
 assert.equal(result.provision_count,2);
 assert.equal(result.totals.legacy_net_cents,270000);
 assert.ok(db.activity.some(x=>x.sql.includes('FROM payroll_designer_config127')&&x.args[0]==='COMPANY_A'&&x.args[1]==='2020-01'));
});
test('interface possui acao na folha mensal e detalhamento de provisoes',()=>{
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../sagas-payroll-engine133-ui.js',import.meta.url),'utf8');
 assert.ok(index.includes('payroll133Preview'));
 assert.ok(index.includes('sagas-payroll-engine133-ui.js'));
 assert.ok(ui.includes('engine-preview'));
 assert.ok(ui.includes('provisions'));
 assert.ok(ui.includes('Nenhuma provisão'));
});

test('prévia sem processamento gravado utiliza fonte mensal sem chamar histórico de runs',async()=>{
 const sqlDb={prepare(sql){
  return {bind(...args){
   return {
    all:async()=>{
     if(sql.includes('FROM payroll_designer_config127'))return {results:[]};
     if(sql.includes('FROM payroll_provision_versions132'))return {results:[]};
     if(sql.includes('FROM payroll_salary_history'))return {results:[]};
     throw Error('Fonte inesperada '+sql);
    }
   };
  }};
 }};
 const r=await payrollEnginePreview133({
  env:{DB:sqlDb},companyId:'COMPANY',auth:{user:{id:'USER'}},request:{},
  source:{prep:{competence:{id:'COMP_ID',competence:'2020-01'}},fingerprint:'safe',
   items:[envelope()]},
  d:{HttpError:class extends Error{},
   requirePermission:async()=>{},
   runDetail:()=>{throw Error('Não deve consultar folha gravada');},
   employerRead:async()=>null}
 });
 assert.equal(r.run.id,null);
 assert.equal(r.run.status,'PREVIEW_UNSTORED');
 assert.equal(r.official,false);
 assert.equal(r.ready_for_posting,false);
 assert.ok(r.problems.some(x=>x.code==='EVENTS_NOT_CONFIGURED'));
});
test('tela inclui opcao de conferir antes de gravar e link para API sem run',()=>{
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../sagas-payroll-engine133-ui.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../SAGAS_worker.js',import.meta.url),'utf8');
 assert.match(index,/payroll133Preflight/);
 assert.match(ui,/openSource/);
 assert.match(ui,/monthly-engine-preview/);
 assert.match(worker,/payrollMonthlySource35\(env,companyId,competenceId,paymentDate\)/);
 assert.match(worker,/path==='\/api\/payroll\/monthly-engine-preview'/);
});

test('prévia interrompe fonte com líquido ou tributos que não conciliam com linhas',async()=>{
 const e=envelope();
 e.net_cents+=1;
 const net=await simulateEnvelope133({db:sqlDb(),envelope:e,employeeSalaryCents:300000,
  configs:configurations(),provisions:[],settings:{cpp_due:'SIM'},resolveFormula:async()=>null});
 assert.ok(net.problems.some(x=>x.code==='SOURCE_INVALID'));
 assert.equal(net.computed,undefined);
 const e2=envelope();
 e2.lines.find(x=>x.event_code==='FGTS_PATRONAL').amount_cents+=1;
 const fgts=await simulateEnvelope133({db:sqlDb(),envelope:e2,employeeSalaryCents:300000,
  configs:configurations(),provisions:[],settings:{cpp_due:'SIM'},resolveFormula:async()=>null});
 assert.ok(fgts.problems.some(x=>x.code==='SOURCE_INVALID'));
});
