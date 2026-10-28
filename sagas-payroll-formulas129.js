// SAGAS v129: catalogo compartilhado de formulas, historico imutavel por vigencia.
// O cadastro apenas configura/simula: nao recalcula folhas legadas ou fechadas.
import {normalizeEvent127,simulateEvent127} from './sagas-payroll-designer127.js';
import {evaluatePayrollSql128} from './sagas-payroll-sql128.js';

const CODE129=/^[A-Z][A-Z0-9_]{1,29}$/;
const METHODS129=new Set([
 'SALARIO_DIAS','VALOR_INFORMADO','VALOR_FIXO','PERCENTUAL_BASE',
 'TABELA_PROGRESSIVA','TABELA_FAIXA_DEDUCAO','FALTA_DIAS','HORAS_BASE',
 'DECIMO_TERCEIRO_AVOS','FERIAS_DIAS','TERCO_FERIAS','LIQUIDO_RESCISAO',
 'SQL_PERSONALIZADO'
]);
function invalid129(d,message,status=400,code='FORMULA_INVALID'){throw new d.HttpError(status,message,code);}
function period129(p,d){const s=String(p||'');if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(s))invalid129(d,'Competencia invalida: use AAAA-MM.');return s;}
function normalize129(raw,d){
 const code=String(raw?.code||'').trim().toUpperCase(),name=String(raw?.name||'').trim();
 if(!CODE129.test(code))invalid129(d,'Codigo da formula deve ter letras, numeros ou underscore (2 a 30 caracteres).');
 if(name.length<3||name.length>120)invalid129(d,'Descricao da formula deve ter de 3 a 120 caracteres.');
 const calculation=String(raw?.calculation||'').toUpperCase();
 if(!METHODS129.has(calculation))invalid129(d,'Forma de calculo nao suportada.');
 const effective_from=period129(raw.effective_from,d);
 // Valida exatamente com o motor de simulacao atual; nao grava SQL sem compilacao segura.
 const config={
  code:'FORMULA_MODELO',name:'Formula compartilhada',category:calculation==='LIQUIDO_RESCISAO'?'INFORMATIVO':'PROVENTO',
  system:calculation==='LIQUIDO_RESCISAO'?'OUTRO':'REMUNERACAO',
  trigger:'AUTOMATICO',effective_from,incidences:{inss:'NAO',irrf:'NAO',fgts:'NAO'},
  calculation,base:raw.base||'SALARIO_CONTRATUAL',
  days_basis:raw.days_basis??30,rate:raw.rate??0,fixed_amount:raw.fixed_amount??0,
  sql_query:raw.sql_query||'',bands:raw.bands||[]
 };
 const check=normalizeEvent127(config,d);
 return {code,name,active:raw.active!==false,effective_from,calculation,
  source:config,sql_variables:check.sql_variables||[],base:check.base};
}
export async function ensureFormulaSchema129(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_formulas129(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,code))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_formula_versions129(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,formula_id TEXT NOT NULL REFERENCES payroll_formulas129(id),effective_from TEXT NOT NULL,revision INTEGER NOT NULL,source_json TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,formula_id,effective_from,revision))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_formula_versions129 ON payroll_formula_versions129(company_id,formula_id,effective_from DESC,revision DESC)")
 ]);
}
export async function formulaSnapshot129(env,companyId,formulaId,competence,includeInactive=false){
 const formula=await env.DB.prepare("SELECT id,code,name,active FROM payroll_formulas129 WHERE company_id=? AND id=?")
  .bind(companyId,formulaId).first();
 if(!formula||(!includeInactive&&!formula.active))return null;
 const version=await env.DB.prepare("SELECT id,effective_from,revision,source_json,created_at FROM payroll_formula_versions129 WHERE company_id=? AND formula_id=? AND effective_from<=? ORDER BY effective_from DESC,revision DESC LIMIT 1")
  .bind(companyId,formulaId,competence).first();
 return {formula,version:version?{id:version.id,effective_from:version.effective_from,revision:version.revision,created_at:version.created_at,source:JSON.parse(version.source_json)}:null};
}
async function simulate129(env,source,values,d){
 const config=normalizeEvent127(source,d);
 const valid={};
 const amount=n=>{if(n===null||n===undefined||n==='')invalid129(d,'Variavel de simulacao nao informada.');const v=Number(n);if(!Number.isFinite(v)||v<0||v>999999999.99)invalid129(d,'Parametro fora do limite.');return v;};
 for(const key of [
 'SALARIO_CONTRATUAL','SALARIO_BASE','SALARIO_REFERENCIA_13','AVOS_13','REMUNERACAO_FERIAS',
 'VALOR_FERIAS','DIAS_FERIAS','DIAS_FALTA','BASE_INSS','BASE_IRRF','BASE_FGTS',
 'BASE_INSS_FERIAS','BASE_IRRF_FERIAS','BASE_FGTS_FERIAS','BASE_INSS_13',
 'BASE_IRRF_13','BASE_FGTS_13','PROVENTOS_TRIBUTAVEIS','TOTAL_PROVENTOS',
 'TOTAL_DESCONTOS','TOTAL_PROVENTOS_RESCISAO','TOTAL_DESCONTOS_RESCISAO',
 'VALOR_INFORMADO','QUANTIDADE','HORAS','RAT','FAP','quantidade','valor_informado'
 ]){
  if(Object.prototype.hasOwnProperty.call(values,key))valid[key]=amount(values[key]);
 }
 if(config.calculation==='SQL_PERSONALIZADO'){
  const bind={};
  for(const name of config.sql_variables||[]){
   if(!Object.prototype.hasOwnProperty.call(valid,name))invalid129(d,'Informe a variavel SQL '+name+'.');
   bind[name]=valid[name];
  }
  return evaluatePayrollSql128(env.DB,config.sql_query,bind);
 }
 if(config.calculation==='LIQUIDO_RESCISAO'&&(!('TOTAL_PROVENTOS_RESCISAO' in valid)||!('TOTAL_DESCONTOS_RESCISAO' in valid)))
  invalid129(d,'Informe proventos e descontos da rescisao.');
 if(['DECIMO_TERCEIRO_AVOS','FERIAS_DIAS','SALARIO_DIAS','FALTA_DIAS','HORAS_BASE'].includes(config.calculation)&&!('quantidade' in valid))
  invalid129(d,'Informe a quantidade de dias, horas ou avos.');
 if(!('valor_informado' in valid)&&config.calculation==='VALOR_INFORMADO')invalid129(d,'Informe o valor do evento.');
 if(!(config.base in valid)&&!['VALOR_FIXO','LIQUIDO_RESCISAO','VALOR_INFORMADO'].includes(config.calculation))
  invalid129(d,'Informe a base '+config.base+'.');
 return simulateEvent127(config,valid);
}
export async function payrollFormulas129(action,{env,companyId,auth,request,d,body={},formulaId,competence}){
 await d.requirePermission(env,auth.user.id,companyId,
  action==='save'?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-formulas129',1,()=>ensureFormulaSchema129(env));
 if(action==='list'){
  const res=await env.DB.prepare("SELECT f.id,f.code,f.name,f.active,(SELECT COUNT(*) FROM payroll_formula_versions129 v WHERE v.company_id=f.company_id AND v.formula_id=f.id) AS revisions,(SELECT COUNT(DISTINCT c.event_id) FROM payroll_designer_config127 c WHERE c.company_id=f.company_id AND json_extract(c.config_json,'$.formula_id')=f.id) AS event_versions FROM payroll_formulas129 f WHERE f.company_id=? ORDER BY f.code LIMIT 501").bind(companyId).all();
  return {formulas:res.results||[],configuration_only:true};
 }
 if(action==='save'){
  const normalized=normalize129(body,d);
  const id=formulaId&&formulaId!=='new'?formulaId:d.uuid();
  const current=formulaId&&formulaId!=='new'?
   await env.DB.prepare("SELECT id,code FROM payroll_formulas129 WHERE company_id=? AND id=?").bind(companyId,id).first():null;
  if(formulaId&&formulaId!=='new'&&!current)invalid129(d,'Formula nao encontrada.',404,'NOT_FOUND');
  if(current&&current.code!==normalized.code)invalid129(d,'Nao e permitido alterar o codigo de uma formula existente.');
  const past=await env.DB.prepare("SELECT COALESCE(MAX(revision),0) AS rev FROM payroll_formula_versions129 WHERE company_id=? AND formula_id=? AND effective_from=?").bind(companyId,id,normalized.effective_from).first();
  const revision=Number(past?.rev||0)+1;
  if(revision>99999)invalid129(d,'Limite de revisoes atingido.',409);
  const stmt=[];
  if(current)stmt.push(env.DB.prepare("UPDATE payroll_formulas129 SET name=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=?").bind(normalized.name,normalized.active?1:0,companyId,id));
  else stmt.push(env.DB.prepare("INSERT INTO payroll_formulas129(id,company_id,code,name,active) VALUES(?,?,?,?,?)").bind(id,companyId,normalized.code,normalized.name,normalized.active?1:0));
  stmt.push(env.DB.prepare("INSERT INTO payroll_formula_versions129(id,company_id,formula_id,effective_from,revision,source_json,created_by) VALUES(?,?,?,?,?,?,?)")
   .bind(d.uuid(),companyId,id,normalized.effective_from,revision,JSON.stringify(normalized.source),auth.user.id));
  try{await env.DB.batch(stmt);}
  catch(e){if(/UNIQUE constraint failed|FOREIGN KEY constraint failed/i.test(String(e)))invalid129(d,'Codigo duplicado ou revisao concorrente.',409,'CONFLICT');throw e;}
  await d.audit(env,{companyId,userId:auth.user.id,request,action:current?'CONFIGURE':'CREATE',
   entity:'payroll_formulas129',entityId:id,after:{code:normalized.code,name:normalized.name,revision,effective_from:normalized.effective_from},});
  return {saved:true,id,revision,effective_from:normalized.effective_from,configuration_only:true};
 }
 if(action==='detail'){
  const current=await env.DB.prepare("SELECT id,code,name,active FROM payroll_formulas129 WHERE company_id=? AND id=?").bind(companyId,formulaId).first();
  if(!current)invalid129(d,'Formula nao encontrada.',404,'NOT_FOUND');
  const ver=await env.DB.prepare("SELECT id,effective_from,revision,source_json,created_at FROM payroll_formula_versions129 WHERE company_id=? AND formula_id=? ORDER BY effective_from DESC,revision DESC LIMIT 501").bind(companyId,formulaId).all();
  const versions=ver.results||[];
  if(versions.length>500)invalid129(d,'Historico excedeu o limite de consulta.',409);
  const period=competence?period129(competence,d):null;
  const applicable=versions.find(v=>!period||v.effective_from<=period);
  return {formula:current,versions:versions.map(v=>({id:v.id,effective_from:v.effective_from,revision:v.revision,created_at:v.created_at,
   source:JSON.parse(v.source_json)})),
   applicable:applicable?{id:applicable.id,effective_from:applicable.effective_from,revision:applicable.revision,source:JSON.parse(applicable.source_json)}:null,
   configuration_only:true};
 }
 if(action==='snapshot'){
  const result=await formulaSnapshot129(env,companyId,formulaId,period129(competence,d));
  if(!result||!result.version)invalid129(d,'Formula sem revisao aplicavel ou inativa.',409,'FORMULA_NOT_APPLICABLE');
  return result;
 }
 if(action==='preview'){
  const normalized=normalize129(body.config,d);
  try{
   const result=await simulate129(env,normalized.source,body.values||{},d);
   return {result,validated:true,configuration_only:true,unsaved_preview:true};
  }catch(e){if(e instanceof d.HttpError)throw e;invalid129(d,'Falha na simulacao: '+e.message,400,'FORMULA_SIMULATION_FAILED');}
 }
 if(action==='simulate'){
  const result=formulaId&&formulaId!=='new'?
    await formulaSnapshot129(env,companyId,formulaId,period129(competence||body.competence,d)):
    null;
  const source=result?.version?.source;
  if(!source)invalid129(d,'Formula inexistente ou sem revisao vigente.',409,'FORMULA_NOT_APPLICABLE');
  try{
   const simulation=await simulate129(env,source,body.values||{},d);
   return {result:simulation,formula:result.formula,version:{id:result.version.id,revision:result.version.revision,
    effective_from:result.version.effective_from},configuration_only:true};
  }catch(e){if(e instanceof d.HttpError)throw e;invalid129(d,'Falha na simulacao: '+e.message,400,'FORMULA_SIMULATION_FAILED');}
 }
 invalid129(d,'Operacao de formulas nao encontrada.',404,'NOT_FOUND');
}
