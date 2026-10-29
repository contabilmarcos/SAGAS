// SAGAS v137 — ativa eventos automáticos do cadastro parametrizado na folha mensal oficial.
// Conserva INSS/IRRF/FGTS do motor tributário histórico e os movimentos de férias.
// Somente proventos simples e descontos sem reflexos tributários são integrados aqui.
import {simulateEvent127,normalizeEvent127} from './sagas-payroll-designer127.js';
import {compilePayrollSql128,evaluatePayrollSql128} from './sagas-payroll-sql128.js';
import {formulaSnapshot129} from './sagas-payroll-formulas129.js';

const month137=/^20\d{2}-(0[1-9]|1[0-2])$/;
const money137=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=99999999999;
const excluded137=new Set([
 'SALARIO_BASE','INSS_EMP','IRRF_EMP','FGTS_PATRONAL',
 'FALTA_INJUSTIFICADA','ATRASO_MINUTOS','DSR_DESCONTO',
 'LICENCA_NAO_REMUNERADA','LICENCA_REMUNERADA','DOENCA_EMPRESA_15'
]);
// Bases mensais calculadas e verificadas no motor oficial antes do desconto
// do INSS/IRRF. Não tratar TOTAL_DESCONTOS como líquido de tributos.
const formulaVars137=new Set([
 'SALARIO_CONTRATUAL','SALARIO_BASE','BASE_INSS','BASE_IRRF','BASE_FGTS',
 'PROVENTOS_TRIBUTAVEIS','TOTAL_PROVENTOS'
]);
const specialBases137=new Set([
 'SALARIO_REFERENCIA_13','AVOS_13','REMUNERACAO_FERIAS','VALOR_FERIAS',
 'DIAS_FERIAS','BASE_INSS_FERIAS','BASE_IRRF_FERIAS','BASE_FGTS_FERIAS',
 'BASE_INSS_13','BASE_IRRF_13','BASE_FGTS_13','TOTAL_PROVENTOS_RESCISAO',
 'TOTAL_DESCONTOS_RESCISAO'
]);
const specialMethods137=new Set([
 'DECIMO_TERCEIRO_AVOS','FERIAS_DIAS','TERCO_FERIAS','LIQUIDO_RESCISAO'
]);
// Estas fórmulas pertencem aos respectivos processos de férias, 13º e rescisão.
// Ativação AUTOMATICO no designer NÃO significa execução em todas as competências.
function specialScope137(cfg,linked){
 for(const source of [cfg,linked].filter(Boolean)){
  if(specialMethods137.has(source.calculation)||specialBases137.has(source.base))return true;
  const sql=String(source.sql_query||'');
  const names=[...sql.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)]
   .map(v=>v[1].toUpperCase());
  if(names.some(v=>specialBases137.has(v)))return true;
 }
 return false;
}
function monthlyReference137(code,name){
 const e=err137('AUTO_FORMULA_REFERENCE',
  'Base '+name+' indisponível no evento '+code+' durante o cálculo mensal.');
 e.event_code=code;
 e.base_name=name;
 return e;
}
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
  // Retenções de INSS/IRRF são apuradas uma única vez pelo cálculo tributário.
  // Não duplicar mesmo que tenham sido cadastradas com outro código.
  if(cfg.system==='RETENCAO'||specialScope137(cfg,null))continue;
  if(cfg.code!==v.code)throw err137('AUTO_CODE_MISMATCH','Código de evento mudou entre cadastro e versão: '+v.code+'.');
  // A versão da fórmula compartilhada também faz parte da fotografia oficial.
  let linked_source=null,linked_version=null;
  if(cfg.calculation==='FORMULA_CADASTRADA'){
   if(!cfg.formula_id)throw err137('AUTO_FORMULA_MISSING','Fórmula não cadastrada no evento '+cfg.code+'.');
   const snap=await formulaSnapshot129({DB:db},companyId,cfg.formula_id,period);
   if(!snap?.formula?.active||!snap?.version?.source)
    throw err137('AUTO_FORMULA_INACTIVE','Fórmula de '+cfg.code+' sem versão ativa.');
   // O catálogo de fórmulas armazena valores de edição em reais;
   // normalizar antes do cálculo oficial para obter fixed_cents e bandas.
   linked_source=normalizeEvent127(snap.version.source,{
    HttpError:class extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code;}}
   });
   linked_version=snap.version.effective_from+'#'+snap.version.revision;
  }
  if(specialScope137(cfg,linked_source))continue;
  settings137(cfg,v);
  selected.push({event_id:v.event_id,config:cfg,effective_from:v.effective_from,revision:Number(v.revision),
   linked_source,linked_version});
 }
 if(selected.length>50)throw err137('AUTO_EVENT_LIMIT','Mais de cinquenta eventos automáticos. Divida o processamento.');
 return selected.sort((a,b)=>a.config.code.localeCompare(b.config.code));
}
export async function calculateAutomaticMonthly137({
 db,companyId,period,items,salaryCents,paidCents,manualCodes,
 baseInssCents,baseIrrfCents,baseFgtsCents,grossCents
}){
 if(!Array.isArray(items)||!items.length)return [];
 if(![salaryCents,paidCents].every(money137))
  throw err137('AUTO_BASE_INVALID','Salário-base histórico inválido para eventos automáticos.');
 const manual=new Set(manualCodes||[]);
 // Valores reais obtidos DEPOIS dos eventos manuais, faltas e afastamentos.
 // São fotografias pré-eventos automáticos: ordem alfabética não altera a base.
 const context={SALARIO_CONTRATUAL:salaryCents/100,SALARIO_BASE:paidCents/100};
 for(const [key,cents] of [
  ['BASE_INSS',baseInssCents],['BASE_IRRF',baseIrrfCents],
  ['BASE_FGTS',baseFgtsCents],['TOTAL_PROVENTOS',grossCents],
  ['PROVENTOS_TRIBUTAVEIS',baseIrrfCents]
 ]){
  if(cents===undefined||cents===null)continue;
  if(!money137(cents))throw err137('AUTO_BASE_INVALID','Base '+key+' inválida para a folha.');
  context[key]=cents/100;
 }
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
    for(const name of compiled.variables){
     if(!formulaVars137.has(name)||!Object.prototype.hasOwnProperty.call(context,name))
      throw monthlyReference137(code,name);
    }
    result=await evaluatePayrollSql128(db,source.sql_query,context);
   }else{
    if(source.calculation==='PERCENTUAL_BASE'&&
      (!formulaVars137.has(source.base)||!Object.prototype.hasOwnProperty.call(context,source.base)))
      throw monthlyReference137(code,String(source.base||'NÃO_INFORMADA'));
    result=simulateEvent127(source,{...context,quantidade:30});
   }
  }catch(e){if(e?.code)throw e;throw err137('AUTO_FORMULA_ERROR',
   'Falha na fórmula automática do evento '+code+'. Confira os parâmetros e a vigência.');}
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

export async function resolveAutomaticNature137(db,companyId,event,ruleVersion){
 const ref=String(ruleVersion||'');
 if(!ref.startsWith('DESIGNER137:'))return null;
 const match=/^DESIGNER137:(20\d{2}-(?:0[1-9]|1[0-2]))#([1-9]\d*)$/.exec(ref);
 if(!match)throw err137('AUTO_RULE_VERSION','Versão contábil do evento automático inválida.');
 const version=await db.prepare(
  'SELECT config_json FROM payroll_designer_config127 WHERE company_id=? AND event_id=? AND effective_from=? AND revision=?'
 ).bind(companyId,event.id,match[1],Number(match[2])).first();
 if(!version)throw err137('AUTO_RULE_MISSING','Regra original do evento automático não encontrada: '+event.code);
 let cfg;
 try{cfg=JSON.parse(version.config_json);}catch(_){
  throw err137('AUTO_RULE_INVALID','Regra original do evento automático foi danificada.');
 }
 if(cfg.code!==event.code||cfg.category!==event.event_type||!cfg.nature_id)
  throw err137('AUTO_RULE_MISMATCH','Natureza ou classificação não confere com a versão do evento '+event.code+'.');
 const n=await db.prepare(
  "SELECT id,code,description,active,synthetic_analytic FROM budget_natures WHERE company_id=? AND id=?"
 ).bind(companyId,cfg.nature_id).first();
 if(!n||Number(n.active)!==1||n.synthetic_analytic!=='ANALYTIC')
  throw err137('AUTO_NATURE_INVALID','Natureza contábil original do evento '+event.code+' não é válida.');
 return {nature_id:n.id,nature_code:n.code,nature_description:n.description,
  active:n.active,synthetic_analytic:n.synthetic_analytic};
}
