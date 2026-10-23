// SAGAS Folha 44 - Mapeamento de natureza contábil para provisões e conferência.
// A consulta não cria lançamentos. Somente constituições confirmadas são consideradas.
const COMPONENTS44={FERIAS:'Férias',TERCO_FERIAS:'1/3 férias',DECIMO_TERCEIRO:'13º salário'};
const error44=(d,msg,code='PROVISION_ACCOUNTING_PENDING',status=409)=>{throw new d.HttpError(status,msg,code);};
const component44=(v,d)=>{
 const k=String(v||'');if(!Object.prototype.hasOwnProperty.call(COMPONENTS44,k))error44(d,'Componente inválido.','VALIDATION_ERROR',400);
 return k;
};
async function schema44(env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_provision_natures44(company_id TEXT NOT NULL,component TEXT NOT NULL CHECK(component IN ('FERIAS','TERCO_FERIAS','DECIMO_TERCEIRO')),nature_id TEXT NOT NULL REFERENCES budget_natures(id) ON DELETE RESTRICT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,component))").run();
}
async function mappings44(env,company){
 const rows=(await env.DB.prepare("SELECT m.component,m.nature_id,n.code AS nature_code,n.description AS nature_description,n.active,n.synthetic_analytic,m.updated_at FROM payroll_provision_natures44 m LEFT JOIN budget_natures n ON n.id=m.nature_id AND n.company_id=m.company_id WHERE m.company_id=? ORDER BY m.component").bind(company).all()).results||[];
 return rows;
}
async function preview44(c){
 const {env,companyId,competence,d}=c;
 const period=String(competence||'');
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))error44(d,'Selecione competência válida.','VALIDATION_ERROR',400);
 const cycle=await env.DB.prepare("SELECT id,run_id,competence,totals_json FROM payroll_provision_cycles43 WHERE company_id=? AND competence=?").bind(companyId,period).first();
 if(!cycle)error44(d,'Constitua as provisões desta competência antes da prévia contábil.','PROVISION_NOT_CONSTITUTED');
 const mappings=await mappings44(env,companyId);
 const cfg=new Map(mappings.map(x=>[x.component,x]));
 const mov=(await env.DB.prepare("SELECT m.employee_id,m.cost_center_id,m.component,m.amount_cents,cc.code AS center_code,e.name AS employee_name FROM payroll_provision_movements43 m JOIN payroll_employees e ON e.id=m.employee_id AND e.company_id=m.company_id LEFT JOIN cost_centers cc ON cc.id=m.cost_center_id AND cc.company_id=m.company_id WHERE m.company_id=? AND m.cycle_id=? AND m.movement_kind='ACCRUAL' ORDER BY m.component,m.employee_id LIMIT 501").bind(companyId,cycle.id).all()).results||[];
 const problems=[],lines=[];
 const block=(code,msg)=>{if(!problems.some(x=>x.code===code&&x.message===msg))problems.push({code,message:msg});};
 if(mov.length>500)block('TOO_MANY_LINES','A competência possui mais de 500 parcelas; é necessário processamento contábil por lotes.');
 if(!mov.length)block('NO_LINES','Nenhuma parcela encontrada na constituição.');
 const sums={FERIAS:0,TERCO_FERIAS:0,DECIMO_TERCEIRO:0};
 const defaultsCache=new Map(),accountCache=new Map();
 for(const x of mov){
  const value=Number(x.amount_cents);
  if(!Number.isSafeInteger(value)||value<1){block('INVALID_AMOUNT','Valor de provisão inválido.');continue;}
  sums[x.component]+=value;
  const conf=cfg.get(x.component);
  if(!conf||!conf.active||conf.synthetic_analytic!=='ANALYTIC'){
   block('MISSING_NATURE','Configure natureza analítica ativa para '+COMPONENTS44[x.component]+'.');continue;
  }
  if(!x.cost_center_id||!x.center_code){block('MISSING_CC','Centro de custo ausente no movimento de '+x.employee_name+'.');continue;}
  if(!defaultsCache.has(conf.nature_id)){
   const fetched=(await env.DB.prepare("SELECT side,account_id,percentage,branch_id,cost_center_id,history_template_id,history_complement FROM budget_nature_accounts WHERE company_id=? AND nature_id=? ORDER BY created_at,id").bind(companyId,conf.nature_id).all()).results||[];
   defaultsCache.set(conf.nature_id,fetched);
  }
  const natureDefaults=defaultsCache.get(conf.nature_id),staged=[];
  let valid=true;
  for(const side of ['D','C']){
   const candidates=natureDefaults.filter(a=>a.side===side);
   const scoped=candidates.filter(a=>a.cost_center_id===x.cost_center_id);
   const selected=scoped.length?scoped:candidates.filter(a=>!a.cost_center_id);
   if(!selected.length){block('MISSING_DEFAULT',COMPONENTS44[x.component]+' — natureza '+conf.nature_code+' sem conta '+side+' para CC '+x.center_code+'.');valid=false;continue;}
   const weights=selected.map(a=>Number(a.percentage)),sum=weights.reduce((n,a)=>n+a,0);
   if(weights.some(a=>!Number.isFinite(a)||a<=0||a>100)||Math.abs(sum-100)>0.0001){
    block('BAD_PERCENTAGE','A natureza '+conf.nature_code+' precisa totalizar 100% em '+side+' para CC '+x.center_code+'.');valid=false;continue;
   }
   let used=0;
   for(let i=0;i<selected.length;i++){
    const opt=selected[i],amt=i===selected.length-1?value-used:Math.round(value*Number(opt.percentage)/100);
    used+=amt;
    if(!amt)continue;
    if(!accountCache.has(opt.account_id)){
     const account=await env.DB.prepare("SELECT id,code,name FROM accounts WHERE id=? AND company_id=? AND active=1 AND analytic=1").bind(opt.account_id,companyId).first();
     accountCache.set(opt.account_id,account||null);
    }
    const acct=accountCache.get(opt.account_id);
    if(!acct){block('ACCOUNT_INACTIVE','Conta contábil inválida na natureza '+conf.nature_code+'.');valid=false;continue;}
    staged.push({side,account_id:acct.id,account_code:acct.code,account_name:acct.name,component:x.component,employee_id:x.employee_id,
      cost_center_id:x.cost_center_id,cost_center_code:x.center_code,nature_id:conf.nature_id,nature_code:conf.nature_code,
      amount_cents:amt,branch_id:opt.branch_id||null,history_template_id:opt.history_template_id||null});
   }
  }
  if(valid)lines.push(...staged);
 }
 for(const [component,val] of Object.entries(JSON.parse(cycle.totals_json))){
  if(Number(val)!==sums[component])block('TOTAL_MISMATCH','Total de '+COMPONENTS44[component]+' não concilia com a constituição.');
 }
 if(lines.length>150)block('ACCOUNTING_LIMIT','Mais de 150 partidas contábeis na prévia; será necessário fracionar o lançamento.');
 const debit=lines.filter(x=>x.side==='D').reduce((n,x)=>n+x.amount_cents,0);
 const credit=lines.filter(x=>x.side==='C').reduce((n,x)=>n+x.amount_cents,0);
 if(debit!==credit)block('UNBALANCED','As partidas de débito e crédito não estão conciliadas.');
 return {kind:'CONFERENCIA_CONTABIL_PROVISOES_44',competence:period,run_id:cycle.run_id,cycle_id:cycle.id,
  mappings,totals:sums,lines,problems,balanced:debit===credit,debit_cents:debit,credit_cents:credit,
  ready_for_preview:!problems.length,read_only:true,posted:false,ready_for_payment:false,
  message:'Prévia de partidas contábeis conforme natureza e centro de custo; não gera lançamento no diário, títulos ou baixas.'};
}
export async function payrollProvisionAccounting44(action,c){
 const {env,companyId,auth,d,request,body={}}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='save'?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-provision-natures44',1,()=>schema44(env));
 if(action==='settings')return {components:COMPONENTS44,mappings:await mappings44(env,companyId)};
 if(action==='preview')return preview44(c);
 if(action==='save'){
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
  const component=component44(body.component,d),natureId=String(body.nature_id||'').trim();
  const nature=await env.DB.prepare("SELECT id,code,description FROM budget_natures WHERE id=? AND company_id=? AND active=1 AND synthetic_analytic='ANALYTIC'").bind(natureId,companyId).first();
  if(!nature)error44(d,'Selecione natureza orçamentária analítica e ativa.','INVALID_NATURE',400);
  const before=await mappings44(env,companyId);
  await env.DB.prepare("INSERT INTO payroll_provision_natures44(company_id,component,nature_id,updated_by) VALUES (?,?,?,?) ON CONFLICT(company_id,component) DO UPDATE SET nature_id=excluded.nature_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(companyId,component,natureId,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'payroll_provision_natures44',entityId:component,
    before:before.find(x=>x.component===component)||null,after:{component,nature_id:natureId},request});
  return {components:COMPONENTS44,mappings:await mappings44(env,companyId)};
 }
 error44(d,'Ação não encontrada.','NOT_FOUND',404);
}
