// SAGAS v137 — ativa eventos automáticos do cadastro parametrizado na folha mensal oficial.
// Conserva INSS/IRRF/FGTS do motor tributário histórico e os movimentos de férias.
// Somente proventos simples e descontos sem reflexos tributários são integrados aqui.
import {simulateEvent127} from './sagas-payroll-designer127.js';
import {compilePayrollSql128,evaluatePayrollSql128} from './sagas-payroll-sql128.js';
import {formulaSnapshot129} from './sagas-payroll-formulas129.js';

const month137=/^20\d{2}-(0[1-9]|1[0-2])$/;
const money137=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=99999999999;
const excluded137=new Set([
 'SALARIO_BASE','INSS_EMP','IRRF_EMP','FGTS_PATRONAL',
 'FALTA_INJUSTIFICADA','ATRASO_MINUTOS','DSR_DESCONTO',
 'LICENCA_NAO_REMUNERADA','LICENCA_REMUNERADA','DOENCA_EMPRESA_15'
]);
const formulaVars137=new Set(['SALARIO_CONTRATUAL','SALARIO_BASE']);
const err137=(code,message)=>Object.assign(new Error(message),{code});
const validInc137=i=>i&&['inss','irrf','fgts'].every(k=>['SIM','NAO'].includes(i[k]));
const settings137=(cfg,ver)=>{
 if(!cfg||!cfg.code||!cfg.name||!month137.test(ver.effective_from))
  throw err137('AUTO_EVENT_INVALID','Cadastro automático com versão ou identificação inválida.');
 if(!['PROVENTO','DESCONTO'].includes(cfg.category)||cfg.trigger!=='AUTOMATICO'||!cfg.active)
  throw err137('AUTO_EVENT_INVALID','Classificação automática inválida para '+cfg.code+'.');
 if(!validInc137(cfg.incidences))
  throw err137('AUTO_INCIDENCE_MISSING','Informe as três incidências de '+cfg.code+'.');
 if(cfg.category==='DESCONTO'&&['inss','irrf','fgts'].some(k=>cfg.incidences[k]==='SIM'))
  throw err137('AUTO_DISCOUNT_INCIDENCE','Descontos com reflexos tributários exigem rotina legal específica: '+cfg.code+'.');
 if(!cfg.nature_id)
  throw err137('AUTO_NATURE_MISSING','Informe natureza orçamentária para contabilizar '+cfg.code+'.');
 const kind=cfg.calculation;
 if(!['VALOR_FIXO','PERCENTUAL_BASE','SQL_PERSONALIZADO','FORMULA_CADASTRADA'].includes(kind))
  throw err137('AUTO_FORMULA_UNSUPPORTED',
   'O evento '+cfg.code+' precisa de fórmula simples ou cálculo específico antes da folha oficial.');
};
export async function loadAutomaticMonthly137(db,companyId,period){
 if(!month137.test(period)||!companyId)throw err137('AUTO_PERIOD_INVALID','Competência automática inválida.');
 const fetched=(await db.prepare(
  "SELECT ev.id AS event_id,ev.code,ev.active AS event_active,cfg.effective_from,cfg.revision,cfg.config_json "+
  "FROM payroll_designer_config127 cfg JOIN payroll_events ev ON ev.id=cfg.event_id AND ev.company_id=cfg.company_id "+
  "WHERE cfg.company_id=? AND cfg.effective_from<=? ORDER BY ev.id,cfg.effective_from DESC,cfg.revision DESC LIMIT 2001"
 ).bind(companyId,period).all()).results||[];
 if(fetched.length>2000)throw err137('AUTO_VERSION_LIMIT','Histórico de eventos automáticos excede 2.000 versões.');
 const seen=new Set(),selected=[],codes=new Set();
 for(const v of fetched){
  if(seen.has(v.event_id))continue;seen.add(v.event_id);
  if(!v.event_active)continue;
  let cfg;
  try{cfg=JSON.parse(v.config_json);}catch(_){
   throw err137('AUTO_CONFIG_CORRUPTED','Versão de evento parametrizado não pode ser lida.');
  }
  if(!cfg.active||cfg.trigger!=='AUTOMATICO'||!['PROVENTO','DESCONTO'].includes(cfg.category)||excluded137.has(cfg.code))
   continue;
  if(codes.has(cfg.code))throw err137('AUTO_EVENT_DUPLICATE','Evento automático com código repetido: '+cfg.code+'.');
  codes.add(cfg.code);
  settings137(cfg,v);
  if(cfg.code!==v.code)throw err137('AUTO_CODE_MISMATCH','Código de evento mudou entre cadastro e versão: '+v.code+'.');
  // A versão da fórmula compartilhada também faz parte da fotografia oficial.
  let linked_source=null,linked_version=null;
  if(cfg.calculation==='FORMULA_CADASTRADA'){
   if(!cfg.formula_id)throw err137('AUTO_FORMULA_MISSING','Fórmula não cadastrada no evento '+cfg.code+'.');
   const snap=await formulaSnapshot129({DB:db},companyId,cfg.formula_id,period);
   if(!snap?.formula?.active||!snap?.version?.source)
    throw err137('AUTO_FORMULA_INACTIVE','Fórmula de '+cfg.code+' sem versão ativa.');
   linked_source=snap.version.source;
   linked_version=snap.version.effective_from+'#'+snap.version.revision;
  }
  selected.push({event_id:v.event_id,config:cfg,effective_from:v.effective_from,revision:Number(v.revision),
   linked_source,linked_version});
 }
 if(selected.length>50)throw err137('AUTO_EVENT_LIMIT','Mais de cinquenta eventos automáticos. Divida o processamento.');
 return selected.sort((a,b)=>a.config.code.localeCompare(b.config.code));
}
export async function calculateAutomaticMonthly137({db,companyId,period,items,salaryCents,paidCents,manualCodes}){
 if(!Array.isArray(items)||!items.length)return [];
 if(![salaryCents,paidCents].every(money137))
  throw err137('AUTO_BASE_INVALID','Salário-base histórico inválido para eventos automáticos.');
 const manual=new Set(manualCodes||[]);
 const context={SALARIO_CONTRATUAL:salaryCents/100,SALARIO_BASE:paidCents/100};
 const out=[];
 for(const item of items){
  const cfg=item.config,code=cfg.code;
  if(manual.has(code))throw err137('AUTO_EVENT_MANUAL_DUPLICATE',
   'O evento '+code+' está lançado manualmente e configurado como automático. Retire uma das origens.');
  let source=cfg;
  if(cfg.calculation==='FORMULA_CADASTRADA'){
   if(!item.linked_source)
    throw err137('AUTO_FORMULA_INACTIVE','Fórmula de '+code+' não possui versão ativa na competência.');
   source=item.linked_source;
  }
  if(!['VALOR_FIXO','PERCENTUAL_BASE','SQL_PERSONALIZADO'].includes(source.calculation))
   throw err137('AUTO_FORMULA_UNSUPPORTED','Fórmula de '+code+' não é suportada no cálculo mensal oficial.');
  let result;
  try{
   if(source.calculation==='SQL_PERSONALIZADO'){
    const compiled=compilePayrollSql128(source.sql_query);
    if(compiled.variables.some(v=>!formulaVars137.has(v)))
     throw err137('AUTO_FORMULA_REFERENCE',
      'Fórmula de '+code+' utiliza base dinâmica ou não comprovada; use SALARIO_CONTRATUAL ou SALARIO_BASE.');
    result=await evaluatePayrollSql128(db,source.sql_query,context);
   }else{
    if(source.calculation==='PERCENTUAL_BASE'&&!formulaVars137.has(source.base))
     throw err137('AUTO_FORMULA_REFERENCE','Base de '+code+' não comprovada para o cálculo oficial.');
    result=simulateEvent127(source,{...context,quantidade:30});
   }
  }catch(e){if(e?.code)throw e;throw err137('AUTO_FORMULA_ERROR',
   'Falha no cálculo automático de '+code+': '+String(e?.message||e).slice(0,200));}
  const amount=Number(result.amount_cents);
  if(!money137(amount))throw err137('AUTO_AMOUNT_INVALID','Valor automático inválido para '+code+'.');
  if(amount===0)continue;
  out.push({event_id:item.event_id,event_code:code,event_name:cfg.name,
   line_type:cfg.category,amount_cents:amount,reference_text:'Automático por fórmula cadastrada',
   rule_version:'DESIGNER137:'+item.effective_from+'#'+item.revision,
   incidences:cfg.incidences,nature_id:cfg.nature_id});
 }
 return out;
}
