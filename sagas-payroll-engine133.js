// SAGAS v133 - conferencia integrada do novo motor a partir de envelopes imutaveis.
// Calcula configuracoes versionadas dos eventos, encargos e provisoes, SEM postar
// nem modificar folha, holerites historicos, lotes ou contas a pagar.
import {simulateEvent127} from './sagas-payroll-designer127.js';
import {formulaSnapshot129} from './sagas-payroll-formulas129.js';
import {compilePayrollSql128,evaluatePayrollSql128} from './sagas-payroll-sql128.js';
import {previewProvisionAccounting134} from './sagas-payroll-engine134.js';

const cents133=value=>{
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<0||n>99999999999)throw Error('Valor monetario invalido na fonte.');
 return n;
};
const money133=n=>n/100;
const taxCodes133=new Set(['INSS_EMP','IRRF_EMP']);
const baseFrom133=(lines,code)=>{
 const l=(lines||[]).filter(x=>x.event_code===code);
 if(l.length!==1)return null;
 const m=/^Base (0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(l[0].reference_text||'').trim());
 if(!m)return null;
 const n=Number(m[1])*100+Number(String(m[2]||'').padEnd(2,'0'));
 return Number.isSafeInteger(n)&&n<=99999999999?n:null;
};
const provisionVariable133={PROV_FERIAS:'PROVISAO_FERIAS',PROV_TERCO_FERIAS:'PROVISAO_TERCO_FERIAS',
 PROV_13:'PROVISAO_13'};
const rank133=cfg=>{
 if(cfg.code==='SALARIO_BASE')return 0;
 if(cfg.category==='PROVENTO')return 10;
 if(cfg.code==='INSS_EMP')return 20;
 if(cfg.code==='IRRF_EMP')return 30;
 if(cfg.category==='DESCONTO')return 40;
 if(cfg.category==='ENCARGO')return 50;
 return 60;
};
const recognizedPatronal133=code=>{
 if(/(?:^|_)(?:FGTS)(?:_|$)/.test(code))return null;
 if(/(?:INSS_PATRONAL|CPP)/.test(code))return 'cpp_due';
 if(/(?:TERCEIROS)/.test(code))return 'thirds_due';
 if(/(?:RAT)/.test(code))return 'rat_due';
 if(/(?:PIS)/.test(code))return 'pis_due';
 return null;
};
function params133(envelope,salaryCents,settings){
 const lines=envelope.lines||[];
 const gross=cents133(envelope.earnings_cents);
 const oldInss=cents133(envelope.inss_cents);
 const oldIrrf=cents133(envelope.irrf_cents);
 const oldFgts=cents133(envelope.fgts_cents);
 const discount=cents133(envelope.deductions_cents);
 const net=cents133(envelope.net_cents);
 // v134: origem reconciliada antes de qualquer fórmula configurável.
 // Duplicidades ou linhas que não somam o envelope impedem a prévia contábil.
 const sum=kind=>lines.filter(x=>x.line_type===kind)
  .reduce((n,x)=>n+cents133(x.amount_cents),0);
 if(sum('PROVENTO')!==gross||sum('DESCONTO')!==discount||
    discount>gross||gross-discount!==net)
  throw Error('Proventos, descontos e líquido não conciliam com as linhas da folha.');
 for(const [code,value] of [['INSS_EMP',oldInss],['IRRF_EMP',oldIrrf],['FGTS_PATRONAL',oldFgts]]){
  const found=lines.filter(x=>x.event_code===code);
  if(found.length!==1||cents133(found[0].amount_cents)!==value)
   throw Error('Evento obrigatório '+code+' não concilia com o envelope histórico.');
 }
 const baseInss=baseFrom133(lines,'INSS_EMP');
 const baseIrrf=baseFrom133(lines,'IRRF_EMP');
 const baseFgts=baseFrom133(lines,'FGTS_PATRONAL');
 if(baseInss===null||baseIrrf===null||baseFgts===null)
  throw Error('Envelope sem bases historicas verificaveis de INSS, IRRF e FGTS.');
 const salaryLine=lines.filter(x=>x.event_code==='SALARIO_BASE');
 const paid=salaryLine.length===1?cents133(salaryLine[0].amount_cents):null;
 if(paid===null)throw Error('Salario-base historico nao identificado.');
 const c={
  SALARIO_CONTRATUAL:salaryCents===null?undefined:money133(salaryCents),
  // Estimativas para provisoes: media de variaveis nao comprovada no envelope.
  SALARIO_REFERENCIA_13:salaryCents===null?undefined:money133(salaryCents),
  REMUNERACAO_FERIAS:salaryCents===null?undefined:money133(salaryCents),
  SALARIO_BASE:money133(paid),
  BASE_INSS:money133(baseInss),BASE_IRRF:money133(baseIrrf),
  BASE_FGTS:money133(baseFgts),
  PROVENTOS_TRIBUTAVEIS:money133(cents133(envelope.earnings_cents)),
  TOTAL_PROVENTOS:money133(gross),TOTAL_DESCONTOS:money133(discount),
  QUANTIDADE:30
 };
 if(settings?.rat_due==='SIM'&&Number.isSafeInteger(Number(settings.rat_bp))&&Number.isSafeInteger(Number(settings.fap_10000))){
  c.RAT=Number(settings.rat_bp)/100;
  c.FAP=Number(settings.fap_10000)/10000;
 }
 return {context:c,legacy:{gross,discount,oldInss,oldIrrf,net:cents133(envelope.net_cents)},
  bases:{baseInss,baseIrrf,baseFgts},salary:paid};
}
async function calc133(db,cfg,context,formulaResolver){
 const effective=cfg.calculation==='FORMULA_CADASTRADA'?
  await formulaResolver(cfg.formula_id):cfg;
 if(!effective)throw Error('Formula compartilhada nao possui versao vigente.');
 const values={...context};
 if(effective.calculation==='SQL_PERSONALIZADO'){
  const compiled=compilePayrollSql128(effective.sql_query);
  for(const key of compiled.variables){
   if(!Object.hasOwn(values,key)||values[key]===undefined||values[key]===null)
    throw Error('Base '+key+' indisponivel. Configure fonte e dependencias.');
  }
  return evaluatePayrollSql128(db,effective.sql_query,values);
 }
 if(effective.calculation==='VALOR_INFORMADO')
  throw Error('Evento informado manualmente nao pode ser recriado automaticamente.');
 if(['FERIAS_DIAS','DECIMO_TERCEIRO_AVOS','LIQUIDO_RESCISAO'].includes(effective.calculation))
  throw Error('Calculo exige referencia especial de ferias, 13o ou rescisao.');
 if(['SALARIO_DIAS','FALTA_DIAS','HORAS_BASE'].includes(effective.calculation)&&!Object.hasOwn(values,'QUANTIDADE'))
  throw Error('Referencia de dias/horas nao informada.');
 if(effective.base&&effective.calculation!=='VALOR_FIXO'&&
    (!Object.hasOwn(values,effective.base)||values[effective.base]===undefined))
  throw Error('Base '+effective.base+' indisponivel.');
 values.quantidade=values.QUANTIDADE;
 return simulateEvent127(effective,values);
}
export async function simulateEnvelope133({db,envelope,employeeSalaryCents,configs,provisions,settings,resolveFormula}){
 const rows=[],provisionRows=[],problems=[];
 const employee=envelope.employee_code||envelope.employee_name||envelope.employee_id;
 const issue=(code,message)=>problems.push({code,message,employee});
 let snapshot;
 try{snapshot=params133(envelope,employeeSalaryCents,settings);}
 catch(e){issue('SOURCE_INVALID',e.message);return {employee_id:envelope.employee_id,
  employee_code:envelope.employee_code,employee_name:envelope.employee_name,
  cost_center_id:envelope.cost_center_id,events:rows,provisions:provisionRows,problems,
  ready:false};}
 const {context,legacy,bases}=snapshot;
 // O snapshot mensal nao contem bases definitivas de medias de ferias/13.
 const usesEstimatedReference=provisions.some(p=>p.config.active&&
  /:(SALARIO_REFERENCIA_13|REMUNERACAO_FERIAS)\b/i.test(p.config.formula_sql||''));
 if(usesEstimatedReference)issue('AVERAGE_REFERENCE_NOT_VALIDATED',
   '13o ou ferias usam salario contratual como referencia provisoria; conferir medias, avos e historico antes de constituir.');
 let currentInss=legacy.oldInss,currentIrrf=legacy.oldIrrf;
 let discount=legacy.discount;
 const ordered=[...configs].sort((a,b)=>rank133(a.config)-rank133(b.config)||a.config.code.localeCompare(b.config.code));
 const hasInss=ordered.some(x=>x.config.code==='INSS_EMP');
 const hasIrrf=ordered.some(x=>x.config.code==='IRRF_EMP');
 if(!hasInss)issue('INSS_NOT_CONFIGURED','INSS_EMP nao configurado ou inativo para esta competencia.');
 if(!hasIrrf)issue('IRRF_NOT_CONFIGURED','IRRF_EMP nao configurado ou inativo para esta competencia.');
 for(const item of ordered){
  const cfg=item.config,code=cfg.code;
  if(!cfg.active||cfg.trigger!=='AUTOMATICO')continue;
  if(cfg.category==='ENCARGO'){
   const due=recognizedPatronal133(code);
   if(due&&settings?.[due]!=='SIM'){
    if(settings?.[due]!=='NAO'){
     issue('EMPLOYER_PARAMETERS_MISSING',code+': a obrigacao patronal nao foi configurada nesta competencia.');
     rows.push({code,name:cfg.name,category:'ENCARGO',status:'PENDENTE',
      error:'Parametros da empresa ausentes.',formula:item.formula_version});
    }else{
     rows.push({code,name:cfg.name,category:'ENCARGO',status:'NAO_DEVIDO',
      amount_cents:0,reference:'Configuracao patronal indica nao devido',formula:item.formula_version});
    }
    continue;
   }
  }
  if(code==='IRRF_EMP'){
   // A base calculada pelo motor legado ja exclui INSS e outras deducoes.
   // Ajusta-se apenas a diferenca de INSS, sem inventar dependentes.
   context.BASE_IRRF=money133(Math.max(0,bases.baseIrrf+(legacy.oldInss-currentInss)));
  }
  context.TOTAL_DESCONTOS=money133(discount);
  try{
   const result=await calc133(db,cfg,context,resolveFormula);
   const amount=cents133(result.amount_cents);
   const old=(envelope.lines||[]).filter(l=>l.event_code===code).reduce((n,l)=>n+cents133(l.amount_cents),0);
   const isCore=taxCodes133.has(code);
   if(code==='INSS_EMP'){discount+=amount-currentInss;currentInss=amount;}
   else if(code==='IRRF_EMP'){discount+=amount-currentIrrf;currentIrrf=amount;}
   if(discount>legacy.gross)issue('NET_NEGATIVE','Descontos superam os proventos apos recalculo configurado.');
   if((isCore||code==='SALARIO_BASE'||code==='FGTS_PATRONAL')&&amount!==old)
    issue('EVENT_VALUE_DIVERGENCE',code+': formula '+money133(amount).toFixed(2)+
      ', folha anterior '+money133(old).toFixed(2)+'. Confira vigencia, base e arredondamento.');
   if(!isCore&&['PROVENTO','DESCONTO'].includes(cfg.category)&&code!=='SALARIO_BASE'&&amount!==old)
    issue('EVENT_NOT_APPLIED',code+': formula calculada para comparacao; evento ainda nao esta incorporado ao novo liquido.');
   rows.push({code,name:cfg.name,category:cfg.category,status:'CALCULADO',
    amount_cents:amount,legacy_cents:old,difference_cents:amount-old,
    applies_to_net:isCore,formula:item.formula_version,
    nature_id:cfg.nature_id||null,group_id:cfg.group_id||null});
  }catch(e){
   issue('FORMULA_FAILED',code+': '+String(e.message||e).slice(0,220));
   rows.push({code,name:cfg.name,category:cfg.category,status:'PENDENTE',error:String(e.message||e),
    nature_id:cfg.nature_id||null,formula:item.formula_version});
  }
 }
 const computed={gross_cents:legacy.gross,discount_cents:Math.max(0,discount),
  net_cents:Math.max(0,legacy.gross-discount),inss_cents:currentInss,irrf_cents:currentIrrf};
 // Memorias de provisao alimentam as formulas em ordem de dependencia.
 // SEM inferir avos, medias, ferias vencidas ou bases juridicas complexas.
 const ctx={...context,TOTAL_DESCONTOS:money133(discount)};
 let pending=[...provisions].filter(x=>x.config.active);
 for(let pass=0;pass<=pending.length&&pending.length;pass++){
  const remaining=[];
  let advanced=0;
  for(const p of pending){
   const cfg=p.config,variable=provisionVariable133[cfg.code]||null;
   const required=compilePayrollSql128(cfg.formula_sql).variables;
   if(required.some(v=>!Object.hasOwn(ctx,v)||ctx[v]===undefined)){
    remaining.push(p);continue;
   }
   try{
    const value=await evaluatePayrollSql128(db,cfg.formula_sql,ctx);
    const cents=cents133(value.amount_cents);
    provisionRows.push({code:cfg.code,name:cfg.name,status:'ESTIMADO',
     amount_cents:cents,nature_id:cfg.accounting.nature_accrual_id,
     use_nature_id:cfg.accounting.nature_use_id,revision:p.revision});
    if(variable)ctx[variable]=money133(cents);
    advanced++;
   }catch(e){
    issue('PROVISION_FAILED',cfg.code+': '+String(e.message||e).slice(0,200));
    provisionRows.push({code:cfg.code,name:cfg.name,status:'PENDENTE',error:String(e.message||e)});
   }
  }
  if(!advanced){
   for(const p of remaining)issue('PROVISION_DEPENDENCY',
    p.config.code+': dependencia nao resolvida ou referencia de outra provisao ausente.');
   break;
  }
  pending=remaining;
 }
 return {employee_id:envelope.employee_id,employee_code:envelope.employee_code,
  employee_name:envelope.employee_name,cost_center_id:envelope.cost_center_id,
  cost_center_code:envelope.cost_center_code||null,
  legacy,computed,events:rows,provisions:provisionRows,problems,ready:!problems.length};
}
export async function payrollEnginePreview133({env,companyId,auth,request,runId,source,d}){
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 const detail=source?{
   run:{id:null,competence_id:source.prep.competence.id,
     competence:source.prep.competence.competence,
     payment_date:source.prep.payment_date||null,
     status:'PREVIEW_UNSTORED',source_fingerprint:source.fingerprint},
   envelopes:source.items
 }:await d.runDetail(runId);
 if(!detail?.run?.competence||!Array.isArray(detail.envelopes))
  throw new d.HttpError(409,'Folha sem envelopes verificaveis.','SOURCE_MISSING');
 const period=detail.run.competence;
 const sourceEvents=(await env.DB.prepare(
  "SELECT ev.id,ev.code,ev.active AS event_active,cfg.effective_from,cfg.revision,cfg.config_json FROM payroll_designer_config127 cfg JOIN payroll_events ev ON ev.id=cfg.event_id AND ev.company_id=cfg.company_id WHERE cfg.company_id=? AND cfg.effective_from<=? ORDER BY ev.id,cfg.effective_from DESC,cfg.revision DESC LIMIT 2001")
  .bind(companyId,period).all()).results||[];
 if(sourceEvents.length>2000)throw new d.HttpError(409,'Muitas revisoes de eventos para esta consulta.','LIMIT');
 const picked=new Set(),configs=[];
 for(const row of sourceEvents){
  if(picked.has(row.id))continue;picked.add(row.id);
  const cfg=JSON.parse(row.config_json);
  if(!row.event_active||!cfg.active||cfg.trigger!=='AUTOMATICO')continue;
  configs.push({config:cfg,formula_version:row.effective_from+'#'+row.revision});
 }
 const provisionVersions=(await env.DB.prepare(
  "SELECT p.id,p.code,p.active AS provision_active,v.effective_from,v.revision,v.config_json FROM payroll_provision_versions132 v JOIN payroll_provision_definitions132 p ON p.id=v.provision_id AND p.company_id=v.company_id WHERE v.company_id=? AND v.effective_from<=? ORDER BY p.id,v.effective_from DESC,v.revision DESC LIMIT 1001")
  .bind(companyId,period).all()).results||[];
 if(provisionVersions.length>1000)throw new d.HttpError(409,'Historico de provisoes excede o limite.','LIMIT');
 const seen=new Set(),provisions=[];
 for(const v of provisionVersions){
  if(seen.has(v.id))continue;seen.add(v.id);
  const config=JSON.parse(v.config_json);
  if(v.provision_active&&config.active)provisions.push({config,revision:v.revision});
 }
 if(configs.length>80||provisions.length>30||detail.envelopes.length>100)
  throw new d.HttpError(409,'A conferencia aceita ate 80 eventos, 30 provisoes e 100 funcionarios por chamada.','PREVIEW_LIMIT');
 const periodStart=period+'-01';
 const histories=(await env.DB.prepare(
  "SELECT employee_id,salary_cents,effective_from FROM payroll_salary_history WHERE company_id=? AND effective_from<=? ORDER BY employee_id,effective_from DESC LIMIT 5001")
  .bind(companyId,periodStart).all()).results||[];
 if(histories.length>5000)throw new d.HttpError(409,'Historico salarial excede o limite.','LIMIT');
 const salaries=new Map();
 for(const s of histories)if(!salaries.has(s.employee_id))salaries.set(s.employee_id,cents133(s.salary_cents));
 const settings=await d.employerRead(period);
 const cache=new Map();
 const resolveFormula=async id=>{
  if(!id)return null;
  if(!cache.has(id)){
   const snapshot=await formulaSnapshot129(env,companyId,id,period);
   cache.set(id,snapshot?.version?.source||null);
  }
  return cache.get(id);
 };
 const envelopes=[];
 const problems=[];
 for(const envelope of detail.envelopes){
  const result=await simulateEnvelope133({
   db:env.DB,envelope,employeeSalaryCents:salaries.get(envelope.employee_id)??null,
   configs,provisions,settings,resolveFormula
  });
  envelopes.push(result);
  problems.push(...result.problems);
 }
 const totals={gross_cents:0,legacy_net_cents:0,simulated_net_cents:0,
  estimated_employer_cents:0,estimated_provisions_cents:0};
 for(const v of envelopes){
  totals.gross_cents+=v.computed?.gross_cents||0;
  totals.legacy_net_cents+=v.legacy?.net||0;
  totals.simulated_net_cents+=v.computed?.net_cents||0;
  totals.estimated_employer_cents+=v.events.filter(x=>x.status==='CALCULADO'&&x.category==='ENCARGO')
   .reduce((n,x)=>n+x.amount_cents,0);
  totals.estimated_provisions_cents+=v.provisions.filter(x=>x.status==='ESTIMADO')
   .reduce((n,x)=>n+x.amount_cents,0);
 }
 if(!configs.length)problems.push({code:'EVENTS_NOT_CONFIGURED',
  message:'Nenhum evento automatico configurado no novo motor para '+period+'.'});
 if(!settings)problems.push({code:'EMPLOYER_SETTINGS_MISSING',
  message:'Parametros patronais nao configurados nesta competencia.'});
 // v134: resolve defaults contabeis por centro de custo sem criar diario nem titulo.
 const provisionAccounting=await previewProvisionAccounting134({db:env.DB,companyId,envelopes});
 problems.push(...provisionAccounting.problems);
 return {kind:'PAYROLL_ENGINE_COMPARISON_133',read_only:true,official:false,
  ready_for_closure:false,ready_for_posting:false,run:detail.run,
  employee_count:envelopes.length,event_count:configs.length,
  provision_count:provisions.length,totals,envelopes,problems,
  provision_accounting:provisionAccounting,
  configuration_revisions:configs.map(v=>({code:v.config.code,revision:v.formula_version,
   nature_id:v.config.nature_id,formula_id:v.config.formula_id||null})),
  message:'Previa comparativa das bases produzidas pelo motor anterior. Simula formulas configuradas, encargos e provisoes; nao substitui envelopes, bases oficiais, nem gera lancamentos financeiros ou contabeis.'};
}
