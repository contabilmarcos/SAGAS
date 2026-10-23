// SAGAS Folha 45 — contabilização explícita de provisões constituídas e baixas documentadas.
// Não cria financeiro, não integra lote 0 e não contabiliza encargos apenas estimados.
const N45=['FERIAS','TERCO_FERIAS','DECIMO_TERCEIRO'];
function fail45(d,msg,code='PROVISION_POSTING_BLOCKED',status=409){throw new d.HttpError(status,msg,code)}
function period45(v,d){v=String(v||'');if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v))fail45(d,'Competência inválida.','VALIDATION_ERROR',400);return v}
async function schema45(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_provision_use_natures45 (company_id TEXT NOT NULL,component TEXT NOT NULL CHECK(component IN ('FERIAS','TERCO_FERIAS','DECIMO_TERCEIRO')),nature_id TEXT NOT NULL REFERENCES budget_natures(id) ON DELETE RESTRICT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,component))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_provision_postings45 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('ACCRUAL','USE')),competence TEXT NOT NULL,cycle_id TEXT,source_fingerprint TEXT NOT NULL,journal_entry_id TEXT NOT NULL,accounting_batch_id TEXT NOT NULL,total_cents INTEGER NOT NULL CHECK(total_cents>0),line_count INTEGER NOT NULL CHECK(line_count>1),posted_by TEXT NOT NULL,posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,kind,cycle_id),UNIQUE(company_id,journal_entry_id))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_provision_posted_movements45(company_id TEXT NOT NULL,movement_id TEXT NOT NULL REFERENCES payroll_provision_movements43(id) ON DELETE RESTRICT,posting_id TEXT NOT NULL REFERENCES payroll_provision_postings45(id) ON DELETE RESTRICT,PRIMARY KEY(company_id,movement_id))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_provision_postings45 ON payroll_provision_postings45(company_id,competence,kind)")
 ]);
}
function amt45(n,d){n=Number(n);if(!Number.isSafeInteger(n)||n<=0)fail45(d,'Valor de origem inválido.','INVALID_AMOUNT');return n}
async function mappingUse45(env,companyId){
 return (await env.DB.prepare("SELECT m.component,m.nature_id,n.code AS nature_code,n.description AS nature_description,n.active,n.synthetic_analytic FROM payroll_provision_use_natures45 m LEFT JOIN budget_natures n ON n.id=m.nature_id AND n.company_id=m.company_id WHERE m.company_id=? ORDER BY m.component").bind(companyId).all()).results||[];
}
async function source45(env,companyId,period,kind,d){
 if(kind==='ACCRUAL'){
  const cycle=await env.DB.prepare("SELECT id,run_id,source_fingerprint,totals_json FROM payroll_provision_cycles43 WHERE company_id=? AND competence=?").bind(companyId,period).first();
  if(!cycle)fail45(d,'Constitua as provisões da competência antes da contabilização.','CYCLE_MISSING');
  const items=(await env.DB.prepare("SELECT m.id,m.employee_id,m.component,m.cost_center_id,m.amount_cents FROM payroll_provision_movements43 m WHERE m.company_id=? AND m.cycle_id=? AND m.competence=? AND m.movement_kind='ACCRUAL' ORDER BY m.employee_id,m.component,m.id LIMIT 501").bind(companyId,cycle.id,period).all()).results||[];
  if(items.length>500)fail45(d,'Mais de 500 parcelas: dividir por lotes antes de contabilizar.','LIMIT');
  const totals=JSON.parse(cycle.totals_json);
  for(const component of N45){
   if(items.filter(x=>x.component===component).reduce((a,x)=>a+amt45(x.amount_cents,d),0)!==Number(totals[component]||0))
     fail45(d,'Valores da constituição não conciliam com a fotografia salva.','CYCLE_MISMATCH');
  }
  return {items,cycle};
 }
 const items=(await env.DB.prepare("SELECT m.id,m.employee_id,m.component,m.cost_center_id,-m.amount_cents AS amount_cents,e.name AS employee_name,cc.code AS cost_center_code FROM payroll_provision_movements43 m JOIN payroll_employees e ON e.id=m.employee_id AND e.company_id=m.company_id LEFT JOIN cost_centers cc ON cc.id=m.cost_center_id AND cc.company_id=m.company_id LEFT JOIN payroll_provision_posted_movements45 z ON z.company_id=m.company_id AND z.movement_id=m.id WHERE m.company_id=? AND m.competence=? AND m.movement_kind='USE' AND z.movement_id IS NULL ORDER BY m.employee_id,m.component,m.id LIMIT 501").bind(companyId,period).all()).results||[];
 if(items.length>500)fail45(d,'Mais de 500 baixas pendentes: dividir por lotes.','LIMIT');
 return {items,cycle:null};
}
async function linesUse45(env,companyId,items,d){
 const mapping=new Map((await mappingUse45(env,companyId)).map(x=>[x.component,x]));
 const problem=[],lines=[],natureCache=new Map(),accounts=new Map();
 const block=(code,message)=>{if(!problem.some(x=>x.code===code&&x.message===message))problem.push({code,message})};
 for(const x of items){
  const m=mapping.get(x.component);
  const value=amt45(x.amount_cents,d);
  if(!m||Number(m.active)!==1||m.synthetic_analytic!=='ANALYTIC'){
   block('MISSING_USE_NATURE','Cadastre uma natureza de baixa ativa para '+x.component+'.');continue;
  }
  if(!x.cost_center_id||!x.cost_center_code){
   block('COST_CENTER_MISSING','Centro de custo original ausente para '+x.employee_name+'.');continue;
  }
  if(!natureCache.has(m.nature_id)){
   natureCache.set(m.nature_id,(await env.DB.prepare("SELECT side,account_id,percentage,branch_id,cost_center_id,history_template_id,history_complement FROM budget_nature_accounts WHERE company_id=? AND nature_id=? ORDER BY created_at,id").bind(companyId,m.nature_id).all()).results||[]);
  }
  const all=natureCache.get(m.nature_id),staged=[];
  let valid=true;
  for(const side of ['D','C']){
   const options=all.filter(z=>z.side===side);
   const center=options.filter(z=>z.cost_center_id===x.cost_center_id);
   const chosen=center.length?center:options.filter(z=>!z.cost_center_id);
   if(!chosen.length){block('NO_ACCOUNT',m.nature_code+' sem conta '+side+' para centro de custo '+x.cost_center_code);valid=false;continue;}
   const weights=chosen.map(z=>Number(z.percentage));
   if(weights.some(z=>!Number.isFinite(z)||z<=0||z>100)||Math.abs(weights.reduce((n,z)=>n+z,0)-100)>0.0001){
    block('INVALID_SPLIT','Default da natureza '+m.nature_code+' não totaliza 100% para '+side+'.');valid=false;continue;
   }
   let assigned=0;
   for(let j=0;j<chosen.length;j++){
    const def=chosen[j],n=j===chosen.length-1?value-assigned:Math.round(value*weights[j]/100);assigned+=n;
    if(n<=0){block('ZERO_SPLIT','Default da natureza '+m.nature_code+' produz parcela nula.');valid=false;continue;}
    if(!accounts.has(def.account_id)){
     const r=await env.DB.prepare("SELECT id,code,name FROM accounts WHERE id=? AND company_id=? AND active=1 AND analytic=1").bind(def.account_id,companyId).first();
     accounts.set(def.account_id,r||null);
    }
    const acct=accounts.get(def.account_id);
    if(!acct){block('INVALID_ACCOUNT','Conta inválida na natureza '+m.nature_code+'.');valid=false;continue;}
    staged.push({side,account_id:acct.id,account_code:acct.code,account_name:acct.name,amount_cents:n,
     component:x.component,employee_id:x.employee_id,cost_center_id:x.cost_center_id,cost_center_code:x.cost_center_code,
     branch_id:def.branch_id||null,history_template_id:def.history_template_id||null,
     nature_code:m.nature_code,nature_id:m.nature_id});
   }
  }
  if(valid)lines.push(...staged);
 }
 return {lines,problems:problem,mappings:[...mapping.values()]};
}
async function preview45(c){
 const {env,companyId,d}=c,period=period45(c.competence,d),kind=c.kind;
 if(!['ACCRUAL','USE'].includes(kind))fail45(d,'Tipo de contabilização inválido.','VALIDATION_ERROR',400);
 const src=await source45(env,companyId,period,kind,d);
 const existing=kind==='ACCRUAL'?await env.DB.prepare("SELECT p.id,p.journal_entry_id,p.total_cents,p.posted_at,j.status AS journal_status FROM payroll_provision_postings45 p LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=p.company_id WHERE p.company_id=? AND p.kind='ACCRUAL' AND p.cycle_id=?").bind(companyId,src.cycle.id).first():null;
 let lines=[],problems=[],mappings=[];
 if(kind==='ACCRUAL'){
  // Mesmo mapeamento validado da etapa 44; validação definitiva será repetida no POST.
  const x=await c.d.preview44(period);
  lines=x.lines;problems=x.problems;mappings=x.mappings;
  if(x.cycle_id!==src.cycle.id)fail45(d,'Fotografia das provisões foi alterada.','CYCLE_CHANGED');
 }else{
  const x=await linesUse45(env,companyId,src.items,d);
  lines=x.lines;problems=x.problems;mappings=x.mappings;
 }
 if(!src.items.length)problems.push({code:'NO_MOVEMENTS',message:'Não há parcelas deste tipo pendentes para contabilizar na competência.'});
 if(lines.length>150||lines.length+src.items.length+2>220)problems.push({code:'LINE_LIMIT',message:'A contabilização excede o limite transacional (partidas e origens). É necessário dividir por lotes.'});
 const debit=lines.filter(x=>x.side==='D').reduce((n,x)=>n+Number(x.amount_cents),0);
 const credit=lines.filter(x=>x.side==='C').reduce((n,x)=>n+Number(x.amount_cents),0);
 const expected=src.items.reduce((n,x)=>n+amt45(x.amount_cents,d),0);
 if(debit!==credit||debit!==expected)problems.push({code:'MISMATCH',message:'Débitos, créditos e movimentações de origem não conciliam.'});
 if(existing)problems.push({code:'ALREADY_POSTED',message:'Esta constituição já está vinculada ao lançamento '+existing.journal_entry_id+'.'});
 if(existing&&existing.journal_status!=='POSTED')problems.push({code:'JOURNAL_CHANGED',message:'Lançamento de origem foi alterado ou anulado: requer conciliação manual.'});
 // Garante que todos os movimentos estão na mesma competência e não tenham integração prévia.
 if(src.items.length){
  const ids=src.items.map(x=>x.id);
  const links=(await env.DB.prepare("SELECT movement_id FROM payroll_provision_posted_movements45 WHERE company_id=? AND movement_id IN ("+ids.map(()=>'?').join(',')+")").bind(companyId,...ids).all()).results||[];
  if(links.length)problems.push({code:'MOVEMENT_POSTED',message:'Há movimentos já contabilizados: atualize a consulta.'});
 }
 const fingerprint=await d.hash({version:45,company_id:companyId,competence:period,kind,cycle_id:src.cycle?.id||null,
  movements:src.items.map(x=>({id:x.id,employee_id:x.employee_id,component:x.component,cost_center_id:x.cost_center_id,amount_cents:x.amount_cents})),
  lines:lines.map(x=>({side:x.side,account_id:x.account_id,amount_cents:x.amount_cents,cost_center_id:x.cost_center_id,
    branch_id:x.branch_id||null,history_template_id:x.history_template_id||null,nature_id:x.nature_id}))});
 return {kind,competence:period,cycle_id:src.cycle?.id||null,run_id:src.cycle?.run_id||null,
  fingerprint,movement_count:src.items.length,lines,mappings,problems,existing,
  debit_cents:debit,credit_cents:credit,total_cents:expected,ready:!problems.length,
  read_only:true,posted:!!existing,ready_for_payment:false,
  note:kind==='ACCRUAL'?'Contabilização da constituição: débito custo/despesa e crédito provisão, conforme natureza. Encargos estimados não estão incluídos.':
    'Contabilização da baixa: débito provisão e crédito conta de liquidação, conforme natureza de baixa. Não creditar automaticamente custo/despesa.'};
}
export async function payrollProvisionAccounting45(action,c){
 const {env,companyId,auth,request,d,body={}}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='save-use'||action==='post'?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-provision-posting45',1,()=>schema45(env));
 if(action==='use-settings')return {components:N45,mappings:await mappingUse45(env,companyId)};
 if(action==='save-use'){
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
  const component=String(body.component||''),natureId=String(body.nature_id||'');
  if(!N45.includes(component))fail45(d,'Componente inválido.','VALIDATION_ERROR',400);
  const nature=await env.DB.prepare("SELECT id FROM budget_natures WHERE company_id=? AND id=? AND active=1 AND synthetic_analytic='ANALYTIC'").bind(companyId,natureId).first();
  if(!nature)fail45(d,'Escolha uma natureza de baixa analítica e ativa.','INVALID_NATURE',400);
  const prior=(await mappingUse45(env,companyId)).find(x=>x.component===component)||null;
  await env.DB.prepare("INSERT INTO payroll_provision_use_natures45(company_id,component,nature_id,updated_by) VALUES (?,?,?,?) ON CONFLICT(company_id,component) DO UPDATE SET nature_id=excluded.nature_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(companyId,component,natureId,auth.user.id).run();
  await d.audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'payroll_provision_use_natures45',entityId:component,
   before:prior,after:{component,nature_id:natureId},request});
  return {components:N45,mappings:await mappingUse45(env,companyId)};
 }
 if(action==='preview')return preview45(c);
 if(action!=='post')fail45(d,'Ação desconhecida.','NOT_FOUND',404);
 await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
 await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.post');
 if(body.confirmation!=='CONTABILIZAR')fail45(d,'Digite CONTABILIZAR para confirmar.','CONFIRMATION_REQUIRED',400);
 const current=await preview45(c);
 if(current.fingerprint!==body.fingerprint)fail45(d,'Dados ou naturezas foram alterados. Atualize a prévia antes de contabilizar.','STALE_PREVIEW');
 if(!current.ready)fail45(d,current.problems[0]?.message||'Prévia ainda pendente.');
 const batchId=String(body.batch_id||'').trim();
 if(!batchId)fail45(d,'Selecione lote contábil aberto.','BATCH_REQUIRED',400);
 const [yy,mm]=current.competence.split('-').map(Number);
 const end=current.competence+'-'+String(new Date(Date.UTC(yy,mm,0)).getUTCDate()).padStart(2,'0');
 const refKey='PROVISION45:'+current.kind+':'+(current.kind==='ACCRUAL'?current.cycle_id:current.fingerprint);
 const old=await env.DB.prepare("SELECT id,status FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference=? LIMIT 1").bind(companyId,refKey).first();
 if(old)fail45(d,'Um lançamento para esta origem já foi criado. Concilie-o antes de repetir.','SOURCE_ALREADY_POSTED');
 const voucher=current.kind==='ACCRUAL'?'PROVISAO':'BAIXA-PROV';
 const built=await d.buildEntry(env,auth,companyId,{
  batch_id:batchId,entry_date:end,document_number:voucher+'-'+current.competence,
  description:(current.kind==='ACCRUAL'?'Constituição de provisões ':'Baixas documentadas de provisões ')+current.competence,
  source_module:'PAYROLL',source_reference:refKey,
  lines:current.lines.map(x=>({
    side:x.side,account_id:x.account_id,amount:d.centsToMoney(x.amount_cents),
    branch_id:x.branch_id||null,cost_center_id:x.cost_center_id||null,history_template_id:x.history_template_id||null,
    history_complement:(current.kind==='ACCRUAL'?'Constituição ':'Baixa ')+x.component+' CC '+(x.cost_center_code||''),
    document_number:voucher+'-'+current.competence
  }))
 });
 if(built.total_cents!==current.total_cents)fail45(d,'Total do diário diverge da fotografia das provisões.','TOTAL_MISMATCH');
 const src=await source45(env,companyId,current.competence,current.kind,d);
 const postingId=d.uuid();
 const statements=[
  ...built.stmts,
  env.DB.prepare("INSERT INTO payroll_provision_postings45(id,company_id,kind,competence,cycle_id,source_fingerprint,journal_entry_id,accounting_batch_id,total_cents,line_count,posted_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(postingId,companyId,current.kind,current.competence,current.cycle_id,current.fingerprint,built.entryId,batchId,current.total_cents,current.lines.length,auth.user.id)
 ];
 for(const m of src.items)statements.push(env.DB.prepare("INSERT INTO payroll_provision_posted_movements45(company_id,movement_id,posting_id) VALUES (?,?,?)").bind(companyId,m.id,postingId));
 if(statements.length>220)fail45(d,'Lançamento excede o limite de segurança.','LIMIT');
 try{
  const result=await env.DB.batch(statements);
  if(result.some(z=>!z.success))fail45(d,'Falha transacional na contabilização. Confira o lote.','POSTING_INCOMPLETE');
 }catch(e){
  if(/UNIQUE constraint|FOREIGN KEY constraint|constraint failed/i.test(String(e)))fail45(d,'Origem já contabilizada ou alterada. Consulte o lote antes de repetir.','CONFLICT');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,action:'POST',entity:'payroll_provision_postings45',entityId:postingId,
  after:{kind:current.kind,competence:current.competence,posting_id:postingId,journal_entry_id:built.entryId,
    total_cents:current.total_cents,movement_count:src.items.length},request});
 return {posted:true,kind:current.kind,competence:current.competence,posting_id:postingId,journal_entry_id:built.entryId,
  movement_count:src.items.length,total_cents:current.total_cents,financial_generated:false};
}
