// SAGAS v132: catalogo de provisoes, formula SQL diretamente no cadastro
// e configuracao contabil por natureza (constituicao/baixa).
// Esta configuracao e independente das provisoes legadas 42-45 e nao faz postagem.
import {compilePayrollSql128,evaluatePayrollSql128,PAYROLL_SQL_VARIABLES128} from './sagas-payroll-sql128.js';

const codePattern132=/^[A-Z][A-Z0-9_]{1,29}$/;
const months132=/^20\d{2}-(0[1-9]|1[0-2])$/;
const fail132=(d,message,code='PROVISION_CATALOG_INVALID',status=400)=>{
 throw new d.HttpError(status,message,code);
};
export function normalizeProvision132(raw,d,{requireAccounting=true}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail132(d,'Cadastro de provisao invalido.');
 const code=String(raw.code||'').trim().toUpperCase();
 const name=String(raw.name||'').trim();
 const effective_from=String(raw.effective_from||'');
 if(!codePattern132.test(code))fail132(d,'Codigo: use de 2 a 30 caracteres, iniciando por letra.');
 if(name.length<3||name.length>120)fail132(d,'Descricao: informe de 3 a 120 caracteres.');
 if(!months132.test(effective_from))fail132(d,'Vigencia invalida. Informe AAAA-MM.');
 const formula_sql=String(raw.formula_sql||'').trim();
 let compiled;
 try{compiled=compilePayrollSql128(formula_sql);}
 catch(e){fail132(d,'Formula SQL invalida: '+e.message,'PROVISION_SQL_INVALID');}
 const acc=raw.accounting||{};
 const nature_accrual_id=String(acc.nature_accrual_id||'').trim();
 const nature_use_id=String(acc.nature_use_id||'').trim()||null;
 if((requireAccounting&&!nature_accrual_id)||nature_accrual_id.length>100)
  fail132(d,'Selecione a natureza orcamentaria da constituicao da provisao.');
 if(nature_use_id&&nature_use_id.length>100)
  fail132(d,'Natureza de baixa invalida.');
 return {
  code,name,active:raw.active!==false,effective_from,formula_sql,
  formula_variables:compiled.variables,
  accounting:{nature_accrual_id,nature_use_id}
 };
}
export async function schemaProvision132(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_provision_definitions132 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,code))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_provision_versions132 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,provision_id TEXT NOT NULL REFERENCES payroll_provision_definitions132(id) ON DELETE RESTRICT,effective_from TEXT NOT NULL,revision INTEGER NOT NULL,config_json TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,provision_id,effective_from,revision))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_provision_versions132 ON payroll_provision_versions132(company_id,provision_id,effective_from DESC,revision DESC)")
 ]);
}
async function ensureProvision132(env,d){
 await d.ensureSchemaRevision(env,'payroll-provision-definitions132',1,()=>schemaProvision132(env));
}
async function nature132(env,companyId,id){
 return env.DB.prepare("SELECT id,code,description FROM budget_natures WHERE company_id=? AND id=? AND active=1 AND synthetic_analytic='ANALYTIC'")
  .bind(companyId,id).first();
}
function checkPeriod132(competence,d){
 const period=String(competence||'');
 if(!months132.test(period))fail132(d,'Competencia invalida (AAAA-MM).');
 return period;
}
async function getDefinition132(env,companyId,id){
 return env.DB.prepare("SELECT id,code,name,active FROM payroll_provision_definitions132 WHERE company_id=? AND id=?")
  .bind(companyId,id).first();
}
export async function provisionCatalog132(action,{env,companyId,auth,request,d,body={},id,competence}){
 await d.requirePermission(env,auth.user.id,companyId,action==='save'?'payroll.manage':'payroll.read');
 await ensureProvision132(env,d);
 if(action==='list'){
  const rows=(await env.DB.prepare("SELECT p.id,p.code,p.name,p.active,(SELECT COUNT(*) FROM payroll_provision_versions132 v WHERE v.company_id=p.company_id AND v.provision_id=p.id) AS revisions,(SELECT v.config_json FROM payroll_provision_versions132 v WHERE v.company_id=p.company_id AND v.provision_id=p.id ORDER BY v.effective_from DESC,v.revision DESC LIMIT 1) AS last_json FROM payroll_provision_definitions132 p WHERE p.company_id=? ORDER BY p.code LIMIT 501")
   .bind(companyId).all()).results||[];
  if(rows.length>500)fail132(d,'Ha mais de 500 provisoes; refine o cadastro.',409);
  return {items:rows.map(x=>{
   const {last_json,...basic}=x;
   const cfg=last_json?JSON.parse(last_json):null;
   return {...basic,effective_from:cfg?.effective_from||null,
    formula_sql:cfg?.formula_sql||null,
    accrual_nature_id:cfg?.accounting?.nature_accrual_id||null,
    use_nature_id:cfg?.accounting?.nature_use_id||null};
  }),configuration_only:true};
 }
 if(action==='detail'){
  const item=await getDefinition132(env,companyId,id);
  if(!item)fail132(d,'Provisao nao encontrada.','NOT_FOUND',404);
  const rows=(await env.DB.prepare("SELECT id,effective_from,revision,config_json,created_at FROM payroll_provision_versions132 WHERE company_id=? AND provision_id=? ORDER BY effective_from DESC,revision DESC LIMIT 501")
   .bind(companyId,id).all()).results||[];
  if(rows.length>500)fail132(d,'Historico excedeu 500 revisoes.',409);
  const versions=rows.map(v=>({id:v.id,effective_from:v.effective_from,revision:v.revision,
   created_at:v.created_at,config:JSON.parse(v.config_json)}));
  const period=competence?checkPeriod132(competence,d):null;
  return {item,versions,applicable:versions.find(v=>!period||v.effective_from<=period)||null,configuration_only:true};
 }
 if(action==='preview'){
  // Formula pode ser testada antes de preencher a guia Contabilizacao.
  const rule=normalizeProvision132(body,d,{requireAccounting:false});
  const values=body.values||{};
  if(!values||typeof values!=='object'||Array.isArray(values))fail132(d,'Parametros de simulacao invalidos.');
  const args={};
  for(const key of rule.formula_variables){
   if(!Object.prototype.hasOwnProperty.call(values,key))
    fail132(d,'Informe o parametro '+key+' para simular a provisao.');
   const value=Number(values[key]);
   if(!Number.isFinite(value)||value<0||value>999999999.99)
    fail132(d,'Parametro '+key+' invalido.');
   args[key]=value;
  }
  try{
   const result=await evaluatePayrollSql128(env.DB,rule.formula_sql,args);
   return {result,formula_variables:rule.formula_variables,configuration_only:true,
    no_accounting_posted:true,no_employee_data_used:true};
  }catch(e){fail132(d,'Erro ao simular formula: '+e.message,'PROVISION_SIMULATION_ERROR');}
 }
 if(action==='save'){
  const normalized=normalizeProvision132(body,d);
  const exists=id?await getDefinition132(env,companyId,id):null;
  if(id&&!exists)fail132(d,'Provisao nao encontrada.','NOT_FOUND',404);
  if(exists&&exists.code!==normalized.code)
   fail132(d,'O codigo de uma provisao existente nao pode mudar.','CODE_LOCKED',409);
  const acct=normalized.accounting;
  const accrualNature=await nature132(env,companyId,acct.nature_accrual_id);
  if(!accrualNature)fail132(d,'Natureza de constituicao inexistente, inativa ou nao analitica.');
  if(acct.nature_use_id&&!await nature132(env,companyId,acct.nature_use_id))
   fail132(d,'Natureza de baixa inexistente, inativa ou nao analitica.');
  const provId=id||d.uuid();
  const prev=await env.DB.prepare("SELECT COALESCE(MAX(revision),0) AS rev FROM payroll_provision_versions132 WHERE company_id=? AND provision_id=? AND effective_from=?")
   .bind(companyId,provId,normalized.effective_from).first();
  const rev=Number(prev?.rev||0)+1;
  if(!Number.isSafeInteger(rev)||rev>99999)fail132(d,'Limite de revisoes atingido.',409);
  const sql=[];
  if(!exists)sql.push(env.DB.prepare("INSERT INTO payroll_provision_definitions132(id,company_id,code,name,active) VALUES(?,?,?,?,?)")
   .bind(provId,companyId,normalized.code,normalized.name,normalized.active?1:0));
  else sql.push(env.DB.prepare("UPDATE payroll_provision_definitions132 SET name=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?")
   .bind(normalized.name,normalized.active?1:0,provId,companyId));
  sql.push(env.DB.prepare("INSERT INTO payroll_provision_versions132(id,company_id,provision_id,effective_from,revision,config_json,created_by) VALUES(?,?,?,?,?,?,?)")
   .bind(d.uuid(),companyId,provId,normalized.effective_from,rev,JSON.stringify(normalized),auth.user.id));
  try{await env.DB.batch(sql);}
  catch(e){if(/UNIQUE constraint failed|FOREIGN KEY constraint failed/i.test(String(e)))
    fail132(d,'Codigo duplicado ou revisao concorrente. Atualize e tente novamente.','CONFLICT',409);
   throw e;
  }
  await d.audit(env,{companyId,userId:auth.user.id,request,action:exists?'CONFIGURE':'CREATE',
   entity:'payroll_provision_definitions132',entityId:provId,after:{code:normalized.code,
    effective_from:normalized.effective_from,revision:rev,accounting:normalized.accounting}});
  return {saved:true,id:provId,revision:rev,effective_from:normalized.effective_from,configuration_only:true};
 }
 fail132(d,'Operacao de provisao desconhecida.','NOT_FOUND',404);
}
