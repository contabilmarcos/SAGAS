// SAGAS Folha 43: constituição, saldos de abertura e baixas de provisões.
// Movimento operacional auditável; não contabiliza nem cria títulos/encargos.
const C43={FERIAS:'Férias',TERCO_FERIAS:'1/3 de férias',DECIMO_TERCEIRO:'13º salário'};
function e43(d,msg,code='PROVISION_LEDGER_BLOCKED',status=409){throw new d.HttpError(status,msg,code)}
function month43(v,d){v=String(v||'');if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v))e43(d,'Competência inválida (AAAA-MM).','VALIDATION_ERROR',400);return v;}
function component43(v,d){v=String(v||'');if(!Object.prototype.hasOwnProperty.call(C43,v))e43(d,'Componente de provisão inválido.','VALIDATION_ERROR',400);return v}
function cents43(v,d){
 const s=String(v??'').trim().replace(',','.');
 if(!/^\d{1,10}(\.\d{1,2})?$/.test(s))e43(d,'Valor inválido (reais, até duas casas decimais).','VALIDATION_ERROR',400);
 const p=s.split('.'),n=Number(p[0])*100+Number((p[1]||'').padEnd(2,'0'));
 if(!Number.isSafeInteger(n)||n<1||n>99999999999)e43(d,'Valor fora dos limites.','VALIDATION_ERROR',400);
 return n;
}
function text43(v,name,d,max=160,required=true){
 v=String(v??'').trim();
 if((required&&!v)||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))e43(d,'Informe '+name+' válido.','VALIDATION_ERROR',400);
 return v;
}
async function schema43(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_provision_cycles43 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,competence TEXT NOT NULL,run_id TEXT NOT NULL,source_fingerprint TEXT NOT NULL,totals_json TEXT NOT NULL,confirmed_by TEXT NOT NULL,confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,competence),UNIQUE(company_id,run_id))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_provision_movements43 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,cost_center_id TEXT,component TEXT NOT NULL CHECK(component IN ('FERIAS','TERCO_FERIAS','DECIMO_TERCEIRO')),movement_kind TEXT NOT NULL CHECK(movement_kind IN ('OPENING','ACCRUAL','USE')),competence TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents<>0),origin_key TEXT NOT NULL,document_ref TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',cycle_id TEXT REFERENCES payroll_provision_cycles43(id) ON DELETE RESTRICT,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,origin_key),CHECK((movement_kind='USE' AND amount_cents<0) OR (movement_kind IN ('OPENING','ACCRUAL') AND amount_cents>0)))"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_prov_accrual43 ON payroll_provision_movements43(company_id,employee_id,component,competence) WHERE movement_kind='ACCRUAL'"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_prov_opening43 ON payroll_provision_movements43(company_id,employee_id,component) WHERE movement_kind='OPENING'"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_prov_balance43 ON payroll_provision_movements43(company_id,employee_id,component,competence)")
 ]);
}
async function ledger43(c){
 const {env,companyId,d}=c;const period=month43(c.competence,d);
 const rows=(await env.DB.prepare("SELECT m.employee_id,e.name AS employee_name,n.number AS employee_number,cc.code AS cost_center_code,m.component,m.movement_kind,m.competence,m.amount_cents,m.document_ref,m.created_at FROM payroll_provision_movements43 m JOIN payroll_employees e ON e.id=m.employee_id AND e.company_id=m.company_id LEFT JOIN payroll_employee_numbers n ON n.employee_id=m.employee_id AND n.company_id=m.company_id LEFT JOIN cost_centers cc ON cc.id=m.cost_center_id AND cc.company_id=m.company_id WHERE m.company_id=? AND m.competence<=? ORDER BY m.competence,m.created_at,m.id LIMIT 5001").bind(companyId,period).all()).results||[];
 if(rows.length>5000)e43(d,'Limite de consulta alcançado: histórico superior a 5.000 movimentos.','LEDGER_LIMIT');
 const map=new Map();
 for(const m of rows){
  const key=m.employee_id+'|'+m.component;
  if(!map.has(key))map.set(key,{employee_id:m.employee_id,employee_code:m.employee_number==null?'':String(m.employee_number).padStart(5,'0'),employee_name:m.employee_name,component:m.component,component_name:C43[m.component],cost_center_code:m.cost_center_code||null,opening_cents:0,accrual_cents:0,use_cents:0,balance_cents:0});
  const v=map.get(key),n=Number(m.amount_cents);
  if(!Number.isSafeInteger(n))e43(d,'Movimento de valor inválido.','INVALID_LEDGER');
  v.balance_cents+=n;
  if(m.movement_kind==='OPENING')v.opening_cents+=n;
  else if(m.movement_kind==='ACCRUAL')v.accrual_cents+=n;
  else v.use_cents-=n;
  if(v.balance_cents<0||!Number.isSafeInteger(v.balance_cents))e43(d,'Saldo histórico negativo ou inválido.','INVALID_LEDGER');
 }
 const balances=[...map.values()].sort((a,b)=>a.employee_name.localeCompare(b.employee_name)||a.component.localeCompare(b.component));
 const cycles=(await env.DB.prepare("SELECT competence,run_id,confirmed_at,totals_json FROM payroll_provision_cycles43 WHERE company_id=? AND competence<=? ORDER BY competence DESC LIMIT 72").bind(companyId,period).all()).results||[];
 const totals=Object.fromEntries(Object.keys(C43).map(code=>[code,balances.filter(v=>v.component===code).reduce((sum,x)=>sum+x.balance_cents,0)]));
 return {competence:period,components:C43,balances,totals,cycles:cycles.map(x=>({competence:x.competence,run_id:x.run_id,confirmed_at:x.confirmed_at,totals:JSON.parse(x.totals_json)})),accounting_posted:false,partial_history:true,
  note:'Saldo operacional desde as movimentações cadastradas. Não equivale automaticamente ao passivo contábil; os encargos patronais são apenas estimativas na prévia.'};
}
async function accrue43(c){
 const {env,companyId,auth,request,runId,body,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'payroll.manage');
 if(body?.confirmation!=='CONSTITUIR')e43(d,'Confirme digitando CONSTITUIR.','CONFIRMATION_REQUIRED',400);
 const preview=await d.preview42(runId);
 if(!preview.fingerprint||typeof body?.preview_fingerprint!=='string'||
    preview.fingerprint!==body.preview_fingerprint)
  e43(d,'A previa de provisoes mudou ou nao foi conferida. Atualize os valores antes de constituir.','STALE_PROVISION_PREVIEW');
 if(preview.unresolved_employee_count)e43(d,'Há eventos variáveis; confira as médias e os direitos antes de constituir.','VARIABLE_EARNINGS');
 if(preview.employee_count>90)e43(d,'Limite de 90 empregados por constituição.','LIMIT');
 const period=month43(preview.run.competence,d);
 const already=await env.DB.prepare("SELECT run_id FROM payroll_provision_cycles43 WHERE company_id=? AND competence=?").bind(companyId,period).first();
 if(already)e43(d,'A competência já teve provisão constituída; não é permitido duplicar.','ALREADY_CONSTITUTED');
 const futureManual=await env.DB.prepare("SELECT id FROM payroll_provision_movements43 WHERE company_id=? AND competence>? LIMIT 1").bind(companyId,period).first();
 if(futureManual)e43(d,'Existem movimentações posteriores; constitua competências em ordem cronológica.','BACKDATED');
 const future=await env.DB.prepare("SELECT id FROM payroll_provision_cycles43 WHERE company_id=? AND competence>? LIMIT 1").bind(companyId,period).first();
 if(future)e43(d,'Existe constituição posterior. Regularize o histórico antes de registrar retroativamente.','BACKDATED');
 const detail=await d.detail35(runId);
 if(detail.run.status!=='APPROVED'||detail.run.competence!==period)e43(d,'A revisão original não está fechada.','RUN_CHANGED');
 const employees=new Map(detail.envelopes.map(x=>[x.employee_id,x]));
 const keys={FERIAS:'vacation_cents',TERCO_FERIAS:'vacation_third_cents',DECIMO_TERCEIRO:'thirteenth_cents'};
 const items=[],totals={FERIAS:0,TERCO_FERIAS:0,DECIMO_TERCEIRO:0};
 for(const emp of preview.items){
  if(!emp.cost_center_id||employees.get(emp.employee_id)?.cost_center_id!==emp.cost_center_id)e43(d,'Centro de custo não registrado ou alterado: '+emp.employee_name+'.','COST_CENTER_CHANGED');
  for(const [component,k] of Object.entries(keys)){
   const value=Number(emp[k]);if(!Number.isSafeInteger(value)||value<0)e43(d,'Valor histórico inválido.','INVALID_AMOUNT');
   if(value){items.push({id:d.uuid(),employee_id:emp.employee_id,cost_center_id:emp.cost_center_id,component,amount_cents:value,origin_key:'PROV43:'+runId+':'+emp.employee_id+':'+component});totals[component]+=value;}
  }
 }
 if(!items.length)e43(d,'Nenhuma provisão mensal positiva.','EMPTY');
 const cycleId=d.uuid();
 const statements=[
  env.DB.prepare("INSERT INTO payroll_provision_cycles43(id,company_id,competence,run_id,source_fingerprint,totals_json,confirmed_by) VALUES (?,?,?,?,?,?,?)").bind(cycleId,companyId,period,runId,detail.run.source_fingerprint,JSON.stringify(totals),auth.user.id),
  env.DB.prepare("INSERT INTO payroll_provision_movements43(id,company_id,employee_id,cost_center_id,component,movement_kind,competence,amount_cents,origin_key,document_ref,notes,cycle_id,created_by) SELECT json_extract(j.value,'$.id'),?,json_extract(j.value,'$.employee_id'),json_extract(j.value,'$.cost_center_id'),json_extract(j.value,'$.component'),'ACCRUAL',?,json_extract(j.value,'$.amount_cents'),json_extract(j.value,'$.origin_key'),?, '',?,? FROM json_each(?) j")
    .bind(companyId,period,'FOLHA-'+period,cycleId,auth.user.id,JSON.stringify(items))
 ];
 try{
  const result=await env.DB.batch(statements);
  if(Number(result[0]?.meta?.changes)!==1||Number(result[1]?.meta?.changes)!==items.length)e43(d,'Quantidade de lançamentos inconsistente. Confira o histórico.','WRITE_MISMATCH');
 }catch(err){
  if(/UNIQUE constraint|constraint failed|FOREIGN KEY/i.test(String(err)))e43(d,'Já existe constituição ou os dados foram alterados.','CONFLICT');
  throw err;
 }
 await d.audit(env,{companyId,userId:auth.user.id,action:'CONFIRM',entity:'payroll_provision_cycles43',entityId:cycleId,request,after:{run_id:runId,competence:period,totals,accounting_posted:false}});
 return {constituted:true,competence:period,totals,item_count:items.length,accounting_posted:false};
}
async function manual43(c){
 const {env,companyId,auth,request,body,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'payroll.manage');
 const kind=String(body.movement_kind||'').toUpperCase();
 if(!['OPENING','USE'].includes(kind))e43(d,'Informe ABERTURA ou BAIXA.','VALIDATION_ERROR',400);
 if(body.confirmation!==(kind==='OPENING'?'ABERTURA':'BAIXAR'))e43(d,'Confirmação incorreta.','CONFIRMATION_REQUIRED',400);
 const component=component43(body.component,d),period=month43(body.competence,d),value=cents43(body.amount,d);
 const ref=text43(body.document_ref,'a referência do documento',d,160);
 const notes=text43(body.notes,'observações',d,350,false);
 const key=text43(body.request_key,'a chave da operação',d,100);
 if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key))e43(d,'Chave da operação inválida.','VALIDATION_ERROR',400);
 const emp=await env.DB.prepare("SELECT id,cost_center_id FROM payroll_employees WHERE company_id=? AND id=?").bind(companyId,String(body.employee_id||'')).first();
 if(!emp)e43(d,'Funcionário não encontrado nesta empresa.','NOT_FOUND',404);
 const amount=kind==='USE'?-value:value;
 const prev=await env.DB.prepare("SELECT id,employee_id,component,movement_kind,competence,amount_cents,document_ref FROM payroll_provision_movements43 WHERE company_id=? AND origin_key=?").bind(companyId,key).first();
 if(prev){
  if(prev.employee_id===emp.id&&prev.component===component&&prev.movement_kind===kind&&prev.competence===period&&Number(prev.amount_cents)===amount&&prev.document_ref===ref)return {reused:true,id:prev.id};
  e43(d,'Chave de operação já utilizada para outra movimentação.','IDEMPOTENCY_CONFLICT');
 }
 const guard=kind==='OPENING'?
  "NOT EXISTS(SELECT 1 FROM payroll_provision_movements43 WHERE company_id=? AND employee_id=? AND component=?)":
  "COALESCE((SELECT SUM(amount_cents) FROM payroll_provision_movements43 WHERE company_id=? AND employee_id=? AND component=? AND competence<=?),0)>=? AND NOT EXISTS(SELECT 1 FROM payroll_provision_movements43 WHERE company_id=? AND employee_id=? AND component=? AND competence>?)";
 const check=kind==='OPENING'?[companyId,emp.id,component]:[companyId,emp.id,component,period,value,companyId,emp.id,component,period];
 const id=d.uuid();
 const statement="INSERT INTO payroll_provision_movements43(id,company_id,employee_id,cost_center_id,component,movement_kind,competence,amount_cents,origin_key,document_ref,notes,cycle_id,created_by) SELECT ?,?,?,?,?,?,?,?,?,?,?,NULL,? WHERE "+guard;
 try{
  const r=await env.DB.prepare(statement).bind(id,companyId,emp.id,emp.cost_center_id||null,component,kind,period,amount,key,ref,notes,auth.user.id,...check).run();
  if(Number(r?.meta?.changes)!==1)e43(d,kind==='OPENING'?'Há movimentos anteriores; abertura somente antes da primeira constituição.':'Saldo disponível insuficiente na competência.','BALANCE_BLOCKED');
 }catch(err){
  if(/UNIQUE constraint|constraint failed|FOREIGN KEY/i.test(String(err)))e43(d,'Movimentação repetida ou dados alterados.','CONFLICT');
  throw err;
 }
 await d.audit(env,{companyId,userId:auth.user.id,action:kind,entity:'payroll_provision_movements43',entityId:id,request,after:{employee_id:emp.id,component,competence:period,amount_cents:amount,document_ref:ref,accounting_posted:false}});
 return {created:true,id,component,movement_kind:kind,amount_cents:amount,competence:period,accounting_posted:false};
}
export async function ensureProvisionLedger43(env){await schema43(env);}
export async function payrollProvisions43(action,c){
 const {env,companyId,auth,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='ledger'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-provision-ledger43',1,()=>schema43(env));
 if(action==='ledger')return ledger43(c);
 if(action==='accrue')return accrue43(c);
 if(action==='movement')return manual43(c);
 e43(d,'Ação de provisão inexistente.','NOT_FOUND',404);
}
