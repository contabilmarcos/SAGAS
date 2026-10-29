import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPayroll135} from '../sagas-payroll-projection135.js';
import {readFileSync} from 'node:fs';

const original=()=>({
 employee_id:'E1',employee_code:'00001',earnings_cents:300000,
 deductions_cents:30000,net_cents:270000,inss_cents:27000,
 irrf_cents:3000,fgts_cents:24000,
 lines:[
  {event_code:'SALARIO_BASE',line_type:'PROVENTO',amount_cents:300000,rule_version:'2020-01#1'},
  {event_code:'INSS_EMP',line_type:'DESCONTO',amount_cents:27000,rule_version:'2020-01#1'},
  {event_code:'IRRF_EMP',line_type:'DESCONTO',amount_cents:3000,rule_version:'2020-01#1'},
  {event_code:'FGTS_PATRONAL',line_type:'INFORMATIVO',amount_cents:24000,rule_version:'2020-01#1'}
 ]
});
const source=()=>({
 envelope:original(),
 legacy:{gross:300000,discount:30000,net:270000,oldInss:27000,oldIrrf:3000},
 bases:{baseInss:300000,baseIrrf:250000,baseFgts:300000},
 context:{SALARIO_CONTRATUAL:3000,SALARIO_BASE:3000,
  BASE_INSS:3000,BASE_IRRF:2500,BASE_FGTS:3000,TOTAL_PROVENTOS:3000,
  TOTAL_DESCONTOS:300,PROVENTOS_TRIBUTAVEIS:3000}
});
const event=(code,category,{amount=null,rate=null,base='SALARIO_CONTRATUAL',incidences=null}={})=>({
 config:{code,name:code,active:true,trigger:'AUTOMATICO',category,
  ...(amount!==null?{fixed_cents:amount,calculation:'VALOR_FIXO'}:
   {calculation:'PERCENTUAL_BASE',base,rate:rate??0}),
  base,incidences:incidences||{inss:'NAO',irrf:'NAO',fgts:'NAO'}}
});
const defaults=()=>[
 event('INSS_EMP','DESCONTO',{rate:10,base:'BASE_INSS'}),
 event('IRRF_EMP','DESCONTO',{rate:1,base:'BASE_IRRF'}),
 event('FGTS_PATRONAL','ENCARGO',{rate:8,base:'BASE_FGTS'}),
 event('INSS_PATRONAL','ENCARGO',{rate:20,base:'BASE_INSS'})
];
const calculate=async(cfg,c)=>{
 if(cfg.calculation==='VALOR_FIXO')return {amount_cents:cfg.fixed_cents};
 return {amount_cents:Math.round(Number(c[cfg.base])*100*cfg.rate/100)};
};
const run=(params={})=>projectPayroll135({...source(),configs:defaults(),
 calculate,settings:{cpp_due:'SIM'},...params});

test('projetar novo provento atualiza bruto, bases, INSS, IRRF, FGTS e encargos',async()=>{
 const e=event('BONUS','PROVENTO',{rate:10,incidences:{inss:'SIM',irrf:'SIM',fgts:'SIM'}});
 const before=original(),copy=JSON.stringify(before);
 const r=await run({envelope:before,configs:[...defaults(),e]});
 assert.equal(JSON.stringify(before),copy);
 assert.equal(r.gross_cents,330000);
 assert.equal(r.base_inss_cents,330000);
 assert.equal(r.base_fgts_cents,330000);
 assert.equal(r.inss_cents,33000);
 assert.equal(r.base_irrf_estimated_cents,274000);
 assert.equal(r.irrf_cents,2740);
 assert.equal(r.fgts_cents,26400);
 assert.equal(r.employer_cents,66000);
 assert.equal(r.net_cents,294260);
 assert.equal(r.official,false);
 assert.equal(r.ready_for_posting,false);
 assert.ok(r.problems.some(x=>x.code==='NEW_AUTOMATIC_EVENT'));
 assert.ok(r.problems.some(x=>x.code==='IRRF_BASE_REVIEW'));
});
test('desconto normal entra na projeção sem alterar bases',async()=>{
 const d=event('ADIANTAMENTO','DESCONTO',{amount:10000});
 const r=await run({configs:[...defaults(),d]});
 assert.equal(r.gross_cents,300000);
 assert.equal(r.discount_cents,42470);
 assert.equal(r.net_cents,257530);
 assert.equal(r.base_inss_cents,300000);
 assert.equal(r.base_fgts_cents,300000);
});
test('evento histórico só pode ser recalculado com incidência original comprovada',async()=>{
 const s=source();
 const l={event_code:'BONUS',line_type:'PROVENTO',amount_cents:10000,rule_version:'2020-01#2'};
 s.envelope.lines.splice(1,0,l);s.envelope.earnings_cents+=10000;
 s.envelope.net_cents+=10000;s.legacy.gross+=10000;s.legacy.net+=10000;
 s.bases.baseInss+=10000;s.bases.baseIrrf+=10000;s.bases.baseFgts+=10000;
 const e=event('BONUS','PROVENTO',{amount:20000,incidences:{inss:'SIM',irrf:'SIM',fgts:'SIM'}});
 const blocked=await run({...s,configs:[...defaults(),e]});
 assert.equal(blocked.gross_cents,310000);
 assert.ok(blocked.problems.some(x=>x.code==='LEGACY_INCIDENCE_UNVERIFIED'));
 const allowed=await run({...s,configs:[...defaults(),e],
  historicalIncidences:new Map([['BONUS|2020-01#2',{inss:'SIM',irrf:'SIM',fgts:'SIM'}]])});
 assert.equal(allowed.gross_cents,320000);
 assert.equal(allowed.base_inss_cents,320000);
 assert.equal(allowed.base_fgts_cents,320000);
});
test('desconto com incidência tributária é bloqueado para evitar base indevida',async()=>{
 const e=event('FALTA_ESPECIAL','DESCONTO',{amount:10000,incidences:{inss:'SIM',irrf:'NAO',fgts:'NAO'}});
 const r=await run({configs:[...defaults(),e]});
 assert.equal(r.gross_cents,300000);
 assert.equal(r.base_inss_cents,300000);
 assert.ok(r.problems.some(x=>x.code==='DEDUCTION_INCIDENCE_REVIEW'));
 assert.equal(r.events.find(x=>x.code==='FALTA_ESPECIAL').status,'BLOQUEADO');
});
test('fórmula dependente de totalização dinâmica é bloqueada',async()=>{
 const e=event('PREMIO','PROVENTO',{rate:5,base:'TOTAL_PROVENTOS'});
 const r=await run({configs:[...defaults(),e]});
 assert.equal(r.gross_cents,300000);
 assert.ok(r.problems.some(x=>x.code==='EVENT_DEPENDENCY_REVIEW'));
});
test('fórmula essencial ausente não é considerada cálculo oficial',async()=>{
 const r=await run({configs:defaults().filter(e=>e.config.code!=='INSS_EMP')});
 assert.ok(r.problems.some(x=>x.code==='INSS_EMP_NOT_CONFIGURED'));
 assert.equal(r.ready_for_closure,false);
});
test('descontos superiores aos proventos não geram líquido fictício',async()=>{
 const e=event('DESCONTO_ABUSIVO','DESCONTO',{amount:350000});
 const r=await run({configs:[...defaults(),e]});
 assert.equal(r.net_cents,null);
 assert.ok(r.problems.some(x=>x.code==='NET_PROJECTION_INVALID'));
});
test('interface mostra projeção separada dos valores antigos e origem das incidências',()=>{
 const ui=readFileSync(new URL('../sagas-payroll-engine133-ui.js',import.meta.url),'utf8');
 const engine=readFileSync(new URL('../sagas-payroll-engine133.js',import.meta.url),'utf8');
 assert.match(ui,/Bruto projetado/);
 assert.match(ui,/Líquido projetado/);
 assert.match(ui,/projetados/);
 assert.match(engine,/historicalIncidences/);
 assert.match(engine,/payroll_event_rule_versions/);
 assert.match(engine,/projectPayroll135/);
});
