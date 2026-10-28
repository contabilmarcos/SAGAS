// SAGAS: cadastro parametrizavel de eventos e grupos, versionado por competencia.
// Nao altera folhas fechadas nem a rotina antiga de calculo. Interpretacao segura.
const KINDS127=['SALARIO_DIAS','VALOR_INFORMADO','VALOR_FIXO','PERCENTUAL_BASE','TABELA_PROGRESSIVA','TABELA_FAIXA_DEDUCAO','FALTA_DIAS','HORAS_BASE'];
const BASES127=['SALARIO_CONTRATUAL','BASE_INSS','BASE_IRRF','BASE_FGTS','PROVENTOS_TRIBUTAVEIS','TOTAL_PROVENTOS','VALOR_INFORMADO'];
const CATEGORIES127=['PROVENTO','DESCONTO','ENCARGO','INFORMATIVO'];
const SYSTEMS127=['REMUNERACAO','RETENCAO','ENCARGO_PATRONAL','OUTRO'];
const NULL127=Object.freeze({});
function bad127(d,message,code='DESIGNER_INVALID',status=400){throw new d.HttpError(status,message,code)}
function txt127(v,max=160){return String(v??'').trim().slice(0,max)}
function cents127(value,d,name,limit=99999999999){
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>limit||Math.abs(Math.round(n*100)-n*100)>1e-7)
  bad127(d,name+' deve ser um valor monetario valido (ate duas casas).');
 return Math.round(n*100);
}
function number127(value,d,name,min,max,precision=4){
 if(value===null||value===undefined||value==='')bad127(d,'Informe '+name+'.');
 const n=Number(value);
 if(!Number.isFinite(n)||n<min||n>max||Math.abs(Math.round(n*10**precision)-n*10**precision)>1e-7)
  bad127(d,name+' fora dos limites.');
 return n;
}
function percent127(value,d,name){
 return number127(value,d,name,0,100,4);
}
function validPeriod127(v,d){
 const s=String(v??'');
 if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(s))bad127(d,'Informe vigencia no formato AAAA-MM.');
 return s;
}
export function normalizeEvent127(raw,d){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))bad127(d,'Configuracao invalida.');
 const eventType=String(raw.category||'').toUpperCase();
 if(!CATEGORIES127.includes(eventType))bad127(d,'Escolha a classificacao do evento.');
 const system=String(raw.system||'OUTRO').toUpperCase();
 if(!SYSTEMS127.includes(system))bad127(d,'Classificacao de processamento invalida.');
 if(eventType==='ENCARGO'&&system!=='ENCARGO_PATRONAL')bad127(d,'Encargos devem ter processamento patronal.');
 if(system==='ENCARGO_PATRONAL'&&eventType!=='ENCARGO')bad127(d,'Processamento patronal exige evento de encargo.');
 const calculation=String(raw.calculation||'').toUpperCase();
 if(!KINDS127.includes(calculation))bad127(d,'Escolha uma forma de calculo valida.');
 const base=String(raw.base||'SALARIO_CONTRATUAL').toUpperCase();
 if(!BASES127.includes(base))bad127(d,'Base de calculo nao reconhecida.');
 const trigger=String(raw.trigger||'').toUpperCase();
 if(!['AUTOMATICO','MANUAL'].includes(trigger))bad127(d,'Selecione Automatico ou Manual.');
 const effective_from=validPeriod127(raw.effective_from,d);
 const nature_id=txt127(raw.nature_id,100)||null;
 const group_id=txt127(raw.group_id,100)||null;
 const incidences={};
 for(const field of ['inss','irrf','fgts']){
  const v=String(raw.incidences?.[field]||'NAO').toUpperCase();
  if(!['SIM','NAO'].includes(v))bad127(d,'Incidencia '+field.toUpperCase()+' invalida.');
  incidences[field]=v;
 }
 if(system==='RETENCAO'&&(incidences.inss==='SIM'||incidences.irrf==='SIM'||incidences.fgts==='SIM'))
  bad127(d,'Retencao ja apurada nao deve entrar novamente na base de incidencia.');
 const code=txt127(raw.code,30).toUpperCase();
 if(!/^[A-Z0-9_]{2,30}$/.test(code))bad127(d,'Codigo: use de 2 a 30 letras maiusculas, numeros ou _ .');
 const name=txt127(raw.name,200);
 if(name.length<3)bad127(d,'Descricao precisa de pelo menos 3 caracteres.');
 const options={code,name,active:raw.active!==false,category:eventType,system,calculation,base,
  trigger,effective_from,nature_id,group_id,incidences,
  days_basis:30,rate:0,fixed_cents:0,bands:[]};
 if(['SALARIO_DIAS','FALTA_DIAS','HORAS_BASE'].includes(calculation)){
  // Para mensalistas a base comercial padrao e 30 dias; horas exigem divisor informado.
  options.days_basis=calculation==='HORAS_BASE'
   ?number127(raw.days_basis,d,'divisor de horas',1,300,3)
   :number127(raw.days_basis??30,d,'divisor de dias',30,30,0);
 }
 if(calculation==='PERCENTUAL_BASE')options.rate=percent127(raw.rate,d,'aliquota percentual');
 if(calculation==='VALOR_FIXO')options.fixed_cents=cents127(raw.fixed_amount,d,'valor fixo');
 if(['TABELA_PROGRESSIVA','TABELA_FAIXA_DEDUCAO'].includes(calculation)){
  const bands=raw.bands;
  if(!Array.isArray(bands)||!bands.length||bands.length>30)
   bad127(d,'Cadastre de 1 a 30 faixas na tabela.');
  let prev=0;
  options.bands=bands.map((b,i)=>{
   const to=cents127(b.to,d,'limite superior da faixa '+(i+1));
   const rate=percent127(b.rate,d,'aliquota da faixa '+(i+1));
   const deduction=cents127(b.deduction??0,d,'parcela a deduzir da faixa '+(i+1));
   if(to<=prev)bad127(d,'As faixas devem ter limites crescentes.');
   if(calculation==='TABELA_PROGRESSIVA'&&deduction!==0)
    bad127(d,'Tabela progressiva por faixas nao utiliza parcela a deduzir.');
   prev=to;return {to_cents:to,rate,deduction_cents:deduction};
  });
 }
 return options;
}
export function simulateEvent127(cfg,values={}){
 const base=Number(values[cfg.base]??0);
 const quant=Number(values.quantidade??30);
 if(!Number.isFinite(base)||base<0||!Number.isFinite(quant)||quant<0)
  throw Error('Base ou quantidade invalida.');
 const asCents=v=>Math.round(v*100);
 const basis=asCents(base);
 let cents=0;
 switch(cfg.calculation){
  case 'SALARIO_DIAS':cents=Math.round(basis*quant/cfg.days_basis);break;
  case 'FALTA_DIAS':cents=Math.round(basis*quant/cfg.days_basis);break;
  case 'HORAS_BASE':cents=Math.round(basis*quant/cfg.days_basis);break;
  case 'VALOR_INFORMADO':cents=asCents(Number(values.valor_informado||0));break;
  case 'VALOR_FIXO':cents=cfg.fixed_cents;break;
  case 'PERCENTUAL_BASE':cents=Math.round(basis*cfg.rate/100);break;
  case 'TABELA_PROGRESSIVA':{
   let prior=0;
   for(const b of cfg.bands){
    cents+=Math.round(Math.max(0,Math.min(basis,b.to_cents)-prior)*b.rate/100);
    prior=b.to_cents;
    if(basis<=prior)break;
   }
   break;
  }
  case 'TABELA_FAIXA_DEDUCAO':{
   const band=cfg.bands.find(b=>basis<=b.to_cents)||cfg.bands.at(-1);
   cents=Math.max(0,Math.round(basis*band.rate/100)-band.deduction_cents);
   break;
  }
  default:throw Error('Forma de calculo nao suportada.');
 }
 if(!Number.isSafeInteger(cents)||cents<0||cents>99999999999)throw Error('Resultado fora do limite.');
 return {amount_cents:cents,amount:cents/100,employee_discount:cfg.category==='DESCONTO',
  employer_charge:cfg.category==='ENCARGO',read_only:true};
}
async function schema127(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_designer_groups127(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,code))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_event_natures39(company_id TEXT NOT NULL,event_id TEXT NOT NULL REFERENCES payroll_events(id) ON DELETE RESTRICT,nature_id TEXT NOT NULL REFERENCES budget_natures(id) ON DELETE RESTRICT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,event_id))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_designer_config127(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,event_id TEXT NOT NULL REFERENCES payroll_events(id) ON DELETE RESTRICT,effective_from TEXT NOT NULL,revision INTEGER NOT NULL,config_json TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,event_id,effective_from,revision))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_designer_config_event127 ON payroll_designer_config127(company_id,event_id,effective_from)")
 ]);
}
async function group127(env,companyId,id){
 return env.DB.prepare("SELECT id FROM payroll_designer_groups127 WHERE company_id=? AND id=? AND active=1").bind(companyId,id).first();
}
async function nature127(env,companyId,id){
 return env.DB.prepare("SELECT id FROM budget_natures WHERE company_id=? AND id=? AND active=1 AND synthetic_analytic='ANALYTIC'").bind(companyId,id).first();
}
async function event127(env,companyId,id){
 return env.DB.prepare("SELECT id,code,name,event_type,active FROM payroll_events WHERE company_id=? AND id=?").bind(companyId,id).first();
}
async function readEvent127(env,companyId,eventId,period){
 const event=await event127(env,companyId,eventId);
 if(!event)return null;
 const ver=await env.DB.prepare("SELECT id,effective_from,revision,config_json,created_at FROM payroll_designer_config127 WHERE company_id=? AND event_id=? ORDER BY effective_from DESC,revision DESC LIMIT 201").bind(companyId,eventId).all();
 const history=(ver.results||[]).map(v=>({id:v.id,effective_from:v.effective_from,revision:v.revision,created_at:v.created_at}));
 const applicable=(ver.results||[]).find(v=>!period||v.effective_from<=period);
 return {event,history,config:applicable?JSON.parse(applicable.config_json):null,
  revision:applicable?.revision??null,configured:!!applicable};
}
export async function payrollDesigner127(action,c){
 const {env,companyId,auth,request,d,body={},eventId}=c;
 await d.requirePermission(env,auth.user.id,companyId,
   ['event-save','group-save'].includes(action)?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-designer127',1,()=>schema127(env));
 if(action==='groups'){
  const rows=await env.DB.prepare("SELECT id,code,name,active FROM payroll_designer_groups127 WHERE company_id=? ORDER BY name").bind(companyId).all();
  return {groups:rows.results||[]};
 }
 if(action==='group-save'){
  const name=txt127(body.name,120),code=txt127(body.code,30).toUpperCase();
  if(name.length<3||!/^[A-Z0-9_]{2,30}$/.test(code))bad127(d,'Informe nome e codigo valido para o grupo.');
  const id=txt127(body.id,100);
  if(id){
   const old=await group127(env,companyId,id);
   if(!old)bad127(d,'Grupo inativo ou inexistente.','NOT_FOUND',404);
   await env.DB.prepare("UPDATE payroll_designer_groups127 SET name=?,code=?,active=? WHERE company_id=? AND id=?")
    .bind(name,code,body.active===false?0:1,companyId,id).run();
  }else{
   const newid=d.uuid();
   try{await env.DB.prepare("INSERT INTO payroll_designer_groups127(id,company_id,code,name) VALUES (?,?,?,?)").bind(newid,companyId,code,name).run();}
   catch(e){if(/UNIQUE/.test(String(e)))bad127(d,'Ja existe grupo com este codigo.','DUPLICATE',409);throw e}
  }
  await d.audit(env,{companyId,userId:auth.user.id,action:id?'UPDATE':'CREATE',entity:'payroll_designer_groups127',entityId:id||code,after:{code,name},request});
  return {saved:true,code,name};
 }
 if(action==='event-detail'){
  const period=body.competence?validPeriod127(body.competence,d):null;
  const item=await readEvent127(env,companyId,eventId,period);
  if(!item)bad127(d,'Evento nao encontrado.','NOT_FOUND',404);
  return item;
 }
 if(action==='event-save'){
  const normalized=normalizeEvent127(body,d);
  const exists=eventId?await event127(env,companyId,eventId):null;
  if(eventId&&!exists)bad127(d,'Evento nao encontrado.','NOT_FOUND',404);
  if(normalized.group_id&&!await group127(env,companyId,normalized.group_id))
   bad127(d,'Grupo de eventos nao encontrado ou inativo.');
  if(normalized.nature_id&&!await nature127(env,companyId,normalized.nature_id))
   bad127(d,'Selecione uma natureza orcamentaria analitica ativa.');
  const type=normalized.category==='ENCARGO'?'INFORMATIVO':normalized.category;
  // Eventos tecnicos legados permanecem com seus codigos e tipos ate substituicao
  // total do calculador. A nova configuracao ja e personalizavel e versionada.
  if(exists&&exists.event_type!==type)
   bad127(d,'Tipo do evento existente difere do cadastro. Altere o tipo apenas quando a nova folha estiver ativada.','LEGACY_TYPE_LOCKED',409);
  if(exists&&exists.code!==normalized.code)
   bad127(d,'Codigo de evento existente nao pode ser renumerado nesta configuracao.','CODE_LOCKED',409);
  if(exists&&['SALARIO_BASE','INSS_EMP','IRRF_EMP','FGTS_PATRONAL'].includes(exists.code)&&!normalized.active)
   bad127(d,'Evento tecnico usado no calculo antigo nao pode ser inativado nesta fase.','LEGACY_ACTIVE_LOCKED',409);
  let id=eventId||d.uuid();
  const version=await env.DB.prepare("SELECT COALESCE(MAX(revision),0) AS rev FROM payroll_designer_config127 WHERE company_id=? AND event_id=? AND effective_from=?")
    .bind(companyId,id,normalized.effective_from).first();
  const revision=Number(version?.rev||0)+1;
  if(!Number.isSafeInteger(revision)||revision>99999)bad127(d,'Limite de revisoes do evento atingido.','LIMIT',409);
  const statements=[];
  if(!exists){
   statements.push(env.DB.prepare("INSERT INTO payroll_events(id,company_id,code,name,event_type,reference_unit,active) VALUES(?,?,?,?,?,'VALOR',?)")
    .bind(id,companyId,normalized.code,normalized.name,type,normalized.active?1:0));
  }else if(exists.name!==normalized.name||Number(exists.active)!==Number(normalized.active)){
   statements.push(env.DB.prepare("UPDATE payroll_events SET name=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=?")
    .bind(normalized.name,normalized.active?1:0,companyId,id));
  }
  const config=JSON.stringify(normalized);
  statements.push(env.DB.prepare("INSERT INTO payroll_designer_config127(id,company_id,event_id,effective_from,revision,config_json,created_by) VALUES (?,?,?,?,?,?,?)")
    .bind(d.uuid(),companyId,id,normalized.effective_from,revision,config,auth.user.id));
  // A natureza do novo desenho fica versionada e nao altera o mapeamento
  // da folha legada. Isso protege integracoes ainda pendentes de competencias
  // fechadas. A ativacao no novo calculador sera feita como mudanca separada.
  try{await env.DB.batch(statements);}
  catch(e){if(/UNIQUE constraint failed|FOREIGN KEY constraint failed/.test(String(e)))
    bad127(d,'Conflito de cadastro/revisao; atualize os eventos e tente novamente.','CONFLICT',409);throw e;}
  await d.audit(env,{companyId,userId:auth.user.id,action:exists?'CONFIGURE':'CREATE',entity:'payroll_designer_config127',entityId:id,
    after:{event_code:normalized.code,effective_from:normalized.effective_from,revision,group_id:normalized.group_id,nature_id:normalized.nature_id},request});
  return {saved:true,event_id:id,revision,configuration_only:true,affects_closed_payroll:false};
 }
 if(action==='simulate'){
  const normalized=normalizeEvent127(body.config,d);
  const values=body.values||{};
  const safe={};
  for(const key of BASES127){
   if(values[key]!==undefined)safe[key]=number127(values[key],d,'base '+key,0,99999999999,2);
  }
  safe.quantidade=number127(values.quantidade??30,d,'quantidade',0,300,3);
  safe.valor_informado=number127(values.valor_informado??0,d,'valor informado',0,99999999999,2);
  return {result:simulateEvent127(normalized,safe),configuration_only:true};
 }
 bad127(d,'Acao nao encontrada.','NOT_FOUND',404);
}
