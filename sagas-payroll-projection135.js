// SAGAS v135: projeção comparativa de proventos, descontos e bases da folha.
// Não grava envelopes, diário, encargos nem financeiro.
// Os eventos antigos só podem ser substituídos na projeção quando a incidência
// da regra exata da linha histórica foi recuperada e validada.
const MAX135=99999999999;
const monetary135=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=MAX135;
const core135=new Set(['SALARIO_BASE','INSS_EMP','IRRF_EMP','FGTS_PATRONAL']);
const money135=n=>n/100;
const sum135=(items)=>items.reduce((s,x)=>s+Number(x.amount_cents),0);
const due135=code=>{
 if(code==='FGTS_PATRONAL')return null;
 if(/(?:INSS_PATRONAL|CPP)/.test(code))return 'cpp_due';
 if(/TERCEIROS/.test(code))return 'thirds_due';
 if(/RAT/.test(code))return 'rat_due';
 if(/PIS/.test(code))return 'pis_due';
 return null;
};
const inc135=cfg=>['inss','irrf','fgts'].every(key=>['SIM','NAO'].includes(cfg?.incidences?.[key]));
const idx135=(code,version)=>code+'|'+version;
export async function projectPayroll135({envelope,legacy,bases,context,configs,settings,calculate,historicalIncidences=new Map()}){
 if(!envelope||!legacy||!bases||!context||!Array.isArray(configs)||typeof calculate!=='function')
  throw Error('Fonte de projeção inválida.');
 if(![legacy.gross,legacy.discount,legacy.net,legacy.oldInss,legacy.oldIrrf,
  bases.baseInss,bases.baseIrrf,bases.baseFgts].every(monetary135))
  throw Error('Valores de origem inválidos para projeção.');
 const lines=Array.isArray(envelope.lines)?envelope.lines:[];
 const problems=[],rows=[],issues=new Set();
 const issue=(code,message)=>{
  const key=code+'|'+message;if(!issues.has(key)){issues.add(key);problems.push({code,message});}
 };
 let gross=legacy.gross,discount=legacy.discount,inss=legacy.oldInss,
  irrf=legacy.oldIrrf,fgts=Number(envelope.fgts_cents);
 let baseInss=bases.baseInss,baseIrrf=bases.baseIrrf,baseFgts=bases.baseFgts;
 const byCode=new Map();
 for(const l of lines){if(!byCode.has(l.event_code))byCode.set(l.event_code,[]);byCode.get(l.event_code).push(l);}
 const active=configs.filter(x=>x.config?.active!==false&&x.config?.trigger==='AUTOMATICO');
 const selected=new Map();
 for(const item of active){
  const code=item.config.code;
  if(selected.has(code))issue('DUPLICATE_EVENT_CONFIG','Múltiplas configurações ativas para '+code+'.');
  else selected.set(code,item);
 }
 const ctx=()=>({...context,BASE_INSS:money135(baseInss),
  BASE_IRRF:money135(baseIrrf),BASE_FGTS:money135(baseFgts),
  TOTAL_PROVENTOS:money135(gross),TOTAL_DESCONTOS:money135(discount),
  // O envelope anterior não fornece uma composição auditável de rendimentos
  // tributáveis para fórmulas arbitrárias. Evitar usar o bruto como substituto.
  PROVENTOS_TRIBUTAVEIS:undefined});
 const save=(cfg,status,value,old,reason=null)=>rows.push({
  code:cfg.code,name:cfg.name,category:cfg.category,status,
  amount_cents:value,legacy_cents:old,
  difference_cents:monetary135(value)?value-old:null,
  nature_id:cfg.nature_id||null,reason
 });
 async function calculateSafe(cfg){
  const r=await calculate(cfg,ctx());
  if(!monetary135(r?.amount_cents))throw Error('Resultado monetário inválido.');
  return Number(r.amount_cents);
 }
 // A fórmula de salário-base é conferida, mas o seu recálculo exige reprocessar
 // dias, histórico salarial, férias e frequência no motor oficial.
 const salaryCfg=selected.get('SALARIO_BASE');
 if(salaryCfg){
  const salaryLines=byCode.get('SALARIO_BASE')||[];
  if(salaryLines.length!==1){
   issue('SALARY_SOURCE_INVALID','Salário-base histórico não possui linha única verificável.');
  }else{
   try{
    const amount=await calculateSafe(salaryCfg.config);
    if(amount!==Number(salaryLines[0].amount_cents))
     issue('SALARY_RECALC_NOT_APPLIED','SALARIO_BASE diverge da folha; não pode substituir remuneração antes da apuração de dias e vigências.');
    save(salaryCfg.config,'COMPARADO',amount,Number(salaryLines[0].amount_cents),'Salário-base ainda é o do envelope original');
   }catch(e){
    issue('SALARY_FORMULA_FAILED','SALARIO_BASE: '+String(e?.message||e).slice(0,200));
    save(salaryCfg.config,'PENDENTE',null,Number(salaryLines[0].amount_cents),'Fórmula não calculada');
   }
  }
 }
 // Só o salário-base original pode ser considerado comprovado neste comparador.
 // Reajustes, férias, afastamentos e médias não são inferidos por fórmulas genéricas.
 for(const item of [...active].sort((a,b)=>a.config.code.localeCompare(b.config.code))){
  const cfg=item.config,code=cfg.code;
  if(core135.has(code)||!['PROVENTO','DESCONTO'].includes(cfg.category))continue;
  const oldLines=byCode.get(code)||[];
  const old= sum135(oldLines);
  if(!monetary135(old)){issue('LEGACY_EVENT_INVALID',code+': origem monetária inválida.');continue;}
  if(oldLines.length>1){
   issue('MULTIPLE_SOURCE_LINES',code+': há mais de uma linha histórica; quantidade e referências exigem conciliação.');
   save(cfg,'BLOQUEADO',null,old,'Múltiplas referências históricas');continue;
  }
  if(oldLines.length&&oldLines[0].line_type!==cfg.category){
   issue('EVENT_CATEGORY_CHANGED',code+': classificação diverge do envelope.');
   save(cfg,'BLOQUEADO',null,old,'Classificação alterada');continue;
  }
  if(!inc135(cfg)){
   issue('EVENT_INCIDENCE_MISSING',code+': marque INSS, IRRF e FGTS expressamente.');
   save(cfg,'BLOQUEADO',null,old,'Incidências ausentes');continue;
  }
  const previous=oldLines.length?historicalIncidences.get(idx135(code,oldLines[0].rule_version)):null;
  if(oldLines.length&&(!previous||!inc135({incidences:previous}))){
   issue('LEGACY_INCIDENCE_UNVERIFIED',code+': regra e incidências da linha histórica não comprovadas.');
   save(cfg,'BLOQUEADO',null,old,'Regra histórica não encontrada');continue;
  }
  // Desconto com reflexos tributários exige regra especializada.
  if(cfg.category==='DESCONTO'&&
     (['inss','irrf','fgts'].some(k=>cfg.incidences[k]==='SIM'||previous?.[k]==='SIM'))){
   issue('DEDUCTION_INCIDENCE_REVIEW',code+': descontos que reduzem bases exigem tratamento legal específico.');
   save(cfg,'BLOQUEADO',null,old,'Incidência especial de desconto');continue;
  }
  // Totalizações podem depender de ordem entre eventos; não tratá-las como
  // uma cadeia de dependências homologada.
  const source=(cfg.sql_query||'')+' '+String(cfg.base||'');
  if(/:(?:TOTAL_PROVENTOS|TOTAL_DESCONTOS|PROVENTOS_TRIBUTAVEIS)\b|\b(?:TOTAL_PROVENTOS|TOTAL_DESCONTOS|PROVENTOS_TRIBUTAVEIS)\b/i.test(source)){
   issue('EVENT_DEPENDENCY_REVIEW',code+': fórmula depende de totais dinâmicos, sem ordem de cálculo homologada.');
   save(cfg,'BLOQUEADO',null,old,'Dependência dinâmica');continue;
  }
  let amount;
  try{amount=await calculateSafe(cfg);}
  catch(e){
   issue('EVENT_CALC_FAILED',code+': '+String(e?.message||e).slice(0,200));
   save(cfg,'PENDENTE',null,old,'Fórmula não calculada');continue;
  }
  const delta=amount-old;
  if(cfg.category==='PROVENTO'){
   gross+=delta;
   if(!monetary135(gross)){
    gross-=delta;issue('GROSS_OUT_OF_RANGE',code+': proventos ficaram fora do limite.');
    save(cfg,'BLOQUEADO',amount,old,'Limite de valor');continue;
   }
   const original=previous||{inss:'NAO',irrf:'NAO',fgts:'NAO'};
   const change=(key)=>((cfg.incidences[key]==='SIM'?amount:0)-
     (original[key]==='SIM'?old:0));
   baseInss+=change('inss');
   baseIrrf+=change('irrf');
   baseFgts+=change('fgts');
   if(![baseInss,baseIrrf,baseFgts].every(monetary135)){
    gross-=delta;baseInss-=change('inss');baseIrrf-=change('irrf');baseFgts-=change('fgts');
    issue('BASE_OUT_OF_RANGE',code+': bases tributárias ficaram fora do limite.');
    save(cfg,'BLOQUEADO',amount,old,'Base inválida');continue;
   }
   if(change('irrf')!==0)issue('IRRF_BASE_REVIEW',
    'Alterações na base tributável podem mudar dedução simplificada e regras de IRRF; a projeção é estimativa.');
  }else{
   discount+=delta;
   if(!monetary135(discount)){discount-=delta;issue('DEDUCTIONS_OUT_OF_RANGE',code+': descontos fora do limite.');
    save(cfg,'BLOQUEADO',amount,old,'Limite de valor');continue;}
  }
  save(cfg,'PROJETADO',amount,old);
  if(!oldLines.length)issue('NEW_AUTOMATIC_EVENT',code+': evento não consta no cálculo original e só entra na projeção.');
 }
 // INSS e IRRF são sempre calculados após proventos e descontos ordinários.
 const tax=async(code,old)=>{
  const item=selected.get(code);
  if(!item){
   issue(code+'_NOT_CONFIGURED',code+': fórmula essencial ausente.');
   return old;
  }
  try{
   const value=await calculateSafe(item.config);
   discount+=value-old;
   save(item.config,'PROJETADO',value,old);
   return value;
  }catch(e){
   issue('TAX_FORMULA_FAILED',code+': '+String(e?.message||e).slice(0,200));
   save(item.config,'PENDENTE',null,old,'Fórmula não calculada');
   return old;
  }
 };
 inss=await tax('INSS_EMP',legacy.oldInss);
 // A base original do IRRF já considera INSS, dependentes e deduções do
 // cálculo anterior. Reajusta-se apenas o delta do INSS, não a dedução legal.
 baseIrrf+=(legacy.oldInss-inss);
 if(!monetary135(baseIrrf)){
  issue('IRRF_BASE_INVALID','Base estimada do IRRF negativa ou acima do limite.');
  baseIrrf=Math.max(0,Math.min(MAX135,baseIrrf));
 }
 irrf=await tax('IRRF_EMP',legacy.oldIrrf);
 const fgtsConfig=selected.get('FGTS_PATRONAL');
 if(fgtsConfig){
  try{fgts=await calculateSafe(fgtsConfig.config);
   save(fgtsConfig.config,'PROJETADO',fgts,Number(envelope.fgts_cents));
  }catch(e){
   issue('FGTS_FORMULA_FAILED','FGTS: '+String(e?.message||e).slice(0,200));
   save(fgtsConfig.config,'PENDENTE',null,Number(envelope.fgts_cents),'Fórmula não calculada');
  }
 }else issue('FGTS_NOT_CONFIGURED','FGTS_PATRONAL não configurado nesta competência.');
 let employer=0;
 for(const item of active.filter(x=>x.config.category==='ENCARGO'&&x.config.code!=='FGTS_PATRONAL')){
  const cfg=item.config,due=due135(cfg.code);
  if(due&&settings?.[due]!=='SIM'){
   if(settings?.[due]==='NAO')save(cfg,'NAO_DEVIDO',0,0);
   else{issue('EMPLOYER_SETTING_MISSING',cfg.code+': configuração de obrigação patronal ausente.');
    save(cfg,'PENDENTE',null,0,'Parâmetro patronal');}
   continue;
  }
  try{
   const amount=await calculateSafe(cfg);
   employer+=amount;
   save(cfg,'PROJETADO',amount,sum135(byCode.get(cfg.code)||[]));
  }catch(e){
   issue('EMPLOYER_CALC_FAILED',cfg.code+': '+String(e?.message||e).slice(0,200));
   save(cfg,'PENDENTE',null,0,'Fórmula não calculada');
  }
 }
 if(![gross,discount,employer].every(monetary135)||discount>gross)
  issue('NET_PROJECTION_INVALID','Proventos, encargos ou descontos não conciliam para o líquido projetado.');
 const net=monetary135(gross)&&monetary135(discount)&&gross>=discount?gross-discount:null;
 return {kind:'PAYROLL_PROJECTION_135',read_only:true,official:false,
  ready_for_posting:false,ready_for_closure:false,requires_review:true,
  gross_cents:gross,discount_cents:discount,net_cents:net,
  inss_cents:inss,irrf_cents:irrf,fgts_cents:fgts,
  employer_cents:employer,base_inss_cents:baseInss,
  base_irrf_estimated_cents:baseIrrf,base_fgts_cents:baseFgts,
  gross_delta_cents:gross-legacy.gross,
  net_delta_cents:net===null?null:net-legacy.net,
  events:rows,problems,
  message:'Projeção comparativa não homologada. Deduções legais e histórico das incidências exigem conferência antes do processamento oficial.'};
}
