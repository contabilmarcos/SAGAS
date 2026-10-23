// SAGAS - Ajuste da Etapa 37: contabilizacao por evento e encargo.
// Sem migracao automatica de contas globais, sem titulos/diario na consulta.
const AUTO_EVENTS38 = [
  ['SALARIO_BASE','Salário mensal','PROVENTO'],
  ['INSS_EMP','INSS do empregado','DESCONTO'],
  ['IRRF_EMP','IRRF do empregado','DESCONTO'],
  ['FGTS_PATRONAL','FGTS patronal','INFORMATIVO']
];
const codes38 = new Set(AUTO_EVENTS38.map(e=>e[0]));
const fail38=(d,message,code='PAYROLL_EVENT_ACCOUNTING_BLOCKED',status=409)=>{
  throw new d.HttpError(status,message,code);
};
async function schema38(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_event_accounts38 (company_id TEXT NOT NULL,event_id TEXT NOT NULL REFERENCES payroll_events(id) ON DELETE RESTRICT,debit_account_id TEXT NOT NULL,credit_account_id TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,event_id))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_finance_batches38 (company_id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_finance_postings37 (run_id TEXT PRIMARY KEY,company_id TEXT NOT NULL,source_fingerprint TEXT NOT NULL,journal_entry_id TEXT NOT NULL,payable_count INTEGER NOT NULL,payable_total_cents INTEGER NOT NULL,posted_by TEXT NOT NULL,posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_finance_payables37 (payable_id TEXT PRIMARY KEY,company_id TEXT NOT NULL,run_id TEXT NOT NULL,employee_id TEXT NOT NULL,UNIQUE(run_id,employee_id))")
  ]);
}
async function catalog38(env,companyId,d) {
  for(const [code,name,eventType] of AUTO_EVENTS38){
    await env.DB.prepare("INSERT OR IGNORE INTO payroll_events (id,company_id,code,name,event_type,reference_unit,active) VALUES (?,?,?,?,?,'VALOR',1)")
      .bind(d.uuid(),companyId,code,name,eventType).run();
  }
  const rows=(await env.DB.prepare("SELECT id,code,name,event_type,reference_unit,active FROM payroll_events WHERE company_id=? ORDER BY code").bind(companyId).all()).results||[];
  for(const [code,,eventType] of AUTO_EVENTS38){
    const row=rows.find(x=>x.code===code);
    if(!row||row.event_type!==eventType||row.reference_unit!=='VALOR'||!row.active)
      fail38(d,'O evento automático '+code+' já existe com tipo, unidade ou situação incompatível. Corrija o cadastro antes da integração.','AUTO_EVENT_CONFLICT');
  }
  return rows;
}
async function account38(env,companyId,id,d) {
  const row=await env.DB.prepare("SELECT id FROM accounts WHERE company_id=? AND id=? AND analytic=1 AND active=1").bind(companyId,id).first();
  if(!row)fail38(d,'A conta contábil precisa ser analítica, ativa e pertencer à empresa.','INVALID_ACCOUNT');
  return row.id;
}
export async function payrollFinance38(action,c) {
  const {env,companyId,request,auth,body={},runId,d}=c;
  await d.ensureSchemaRevision(env,'payroll-event-accounting38',1,()=>schema38(env));
  if(action==='catalog'){
    await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
    return {items:await catalog38(env,companyId,d)};
  }
  if(action==='event-settings'||action==='save-event'){
    await d.requirePermission(env,auth.user.id,companyId,action==='save-event'?'payroll.manage':'payroll.read');
    if(action==='save-event')await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
    const events=await catalog38(env,companyId,d);
    const event=events.find(e=>e.id===String(c.eventId||''));
    if(!event)fail38(d,'Evento não encontrado nesta empresa.','NOT_FOUND',404);
    const read=()=>env.DB.prepare("SELECT debit_account_id,credit_account_id,updated_at FROM payroll_event_accounts38 WHERE company_id=? AND event_id=?").bind(companyId,event.id).first();
    if(action==='event-settings')return {event,settings:await read(),automatic:codes38.has(event.code)};
    const debit=String(body.debit_account_id||'').trim(),credit=String(body.credit_account_id||'').trim();
    if(!debit||!credit||debit.length>100||credit.length>100)fail38(d,'Informe débito e crédito no cadastro deste evento.','INVALID_ACCOUNT',400);
    await account38(env,companyId,debit,d);await account38(env,companyId,credit,d);
    const before=await read();
    await env.DB.prepare("INSERT INTO payroll_event_accounts38(company_id,event_id,debit_account_id,credit_account_id,updated_by) VALUES (?,?,?,?,?) ON CONFLICT(company_id,event_id) DO UPDATE SET debit_account_id=excluded.debit_account_id,credit_account_id=excluded.credit_account_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(companyId,event.id,debit,credit,auth.user.id).run();
    await d.audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'payroll_event_accounts38',entityId:event.id,before,after:{debit_account_id:debit,credit_account_id:credit},request});
    return {event,settings:await read()};
  }
  if(action==='settings'||action==='save'){
    await d.requirePermission(env,auth.user.id,companyId,action==='save'?'payroll.manage':'payroll.read');
    if(action==='save')await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
    const read=()=>env.DB.prepare("SELECT batch_id,updated_at FROM payroll_finance_batches38 WHERE company_id=?").bind(companyId).first();
    if(action==='settings')return {settings:await read()};
    const batchId=String(body.batch_id||'').trim();
    if(!batchId||batchId.length>100)fail38(d,'Selecione o lote contábil.','INVALID_BATCH',400);
    const batch=await env.DB.prepare("SELECT id,status FROM journal_batches WHERE id=? AND company_id=?").bind(batchId,companyId).first();
    if(!batch||batch.status!=='OPEN')fail38(d,'O lote contábil precisa estar aberto nesta empresa.','INVALID_BATCH');
    const before=await read();
    await env.DB.prepare("INSERT INTO payroll_finance_batches38(company_id,batch_id,updated_by) VALUES (?,?,?) ON CONFLICT(company_id) DO UPDATE SET batch_id=excluded.batch_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(companyId,batchId,auth.user.id).run();
    await d.audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'payroll_finance_batches38',entityId:companyId,before,after:{batch_id:batchId},request});
    return {settings:await read()};
  }
  await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
  const events=await catalog38(env,companyId,d);
  const [detail,conference,batchSetting,existing,mappings]=await Promise.all([
    d.payrollMonthlyRunDetail35(env,companyId,runId),
    d.payrollMonthlyConference36(env,companyId,runId),
    env.DB.prepare("SELECT batch_id FROM payroll_finance_batches38 WHERE company_id=?").bind(companyId).first(),
    env.DB.prepare("SELECT * FROM payroll_finance_postings37 WHERE company_id=? AND run_id=?").bind(companyId,runId).first(),
    env.DB.prepare("SELECT a.event_id,a.debit_account_id,a.credit_account_id FROM payroll_event_accounts38 a WHERE a.company_id=?").bind(companyId).all()
  ]);
  const {run,envelopes,totals}=detail,problems=[];
  const block=(code,message)=>{if(!problems.some(p=>p.code===code&&p.message===message))problems.push({code,message});};
  if(run.status!=='APPROVED'||!conference.approved||!conference.review?.closed_at)
    block('FOLHA_NAO_FECHADA','A folha deve estar conferida e fechada.');
  if(conference.problems?.length)block('CONFERENCIA_DIVERGENTE',conference.problems[0].message);
  if(!envelopes.length)block('SEM_ENVELOPES','A folha não possui envelopes.');
  if(envelopes.length>90)block('LIMITE','A integração está limitada a 90 funcionários por lote.');
  const active=await env.DB.prepare("SELECT id,status FROM journal_batches WHERE company_id=? AND id=?").bind(companyId,batchSetting?.batch_id||'').first();
  if(!active||active.status!=='OPEN')block('LOTE_PENDENTE','Selecione um lote contábil aberto.');
  const mapById=new Map((mappings.results||[]).map(x=>[x.event_id,x]));
  const catalogByCode=new Map(events.map(e=>[e.code,e]));
  const grouped=new Map();
  let sumNet=0, sumGross=0, sumDeductions=0, sumInss=0,sumIrrf=0,sumFgts=0;
  for(const envp of envelopes){
    sumNet+=Number(envp.net_cents);
    sumGross+=Number(envp.earnings_cents);
    sumDeductions+=Number(envp.deductions_cents);
    sumInss+=Number(envp.inss_cents);
    sumIrrf+=Number(envp.irrf_cents);
    sumFgts+=Number(envp.fgts_cents);
    if(!Number.isSafeInteger(Number(envp.net_cents))||Number(envp.net_cents)<0)block('LIQUIDO_INVALIDO','Valor líquido inválido no envelope.');
    for(const line of envp.lines||[]){
      const amount=Number(line.amount_cents);
      if(!Number.isSafeInteger(amount)||amount<0||amount>99999999999){block('VALOR_INVALIDO','Valor inválido no evento '+line.event_code);continue;}
      const event=catalogByCode.get(line.event_code);
      if(!event||event.event_type!==line.line_type){
        block('EVENTO_DIVERGENTE','O evento '+line.event_code+' não está corretamente cadastrado.');continue;
      }
      if(event.active!==1)block('EVENTO_INATIVO','O evento '+line.event_code+' está inativo.');
      // Informativos comuns não são despesas/obrigações: apenas o FGTS patronal
      // é um encargo contábil nesta etapa.
      if(line.line_type==='INFORMATIVO'&&line.event_code!=='FGTS_PATRONAL')continue;
      if(amount===0)continue;
      const old=grouped.get(event.id);
      if(old)old.cents+=amount;else grouped.set(event.id,{event,amount,cents:amount});
    }
  }
  if(![sumGross,sumNet,sumDeductions,sumInss,sumIrrf,sumFgts].every(Number.isSafeInteger)
    ||sumGross!==sumNet+sumDeductions
    ||sumGross!==Number(totals.earnings_cents)
    ||sumNet!==Number(totals.net_cents)
    ||sumInss!==Number(totals.inss_cents)||sumIrrf!==Number(totals.irrf_cents)||sumFgts!==Number(totals.fgts_cents))
      block('TOTAIS_DIVERGENTES','Totais de eventos e envelopes não conciliam.');
  const accountCache=new Map(), eventTotals=[];
  for(const g of grouped.values()){
    const conf=mapById.get(g.event.id);
    if(!conf||!conf.debit_account_id||!conf.credit_account_id){
      block('EVENTO_SEM_CONTA','Configure débito e crédito no evento '+g.event.code+' — '+g.event.name+'.');
      continue;
    }
    for(const id of [conf.debit_account_id,conf.credit_account_id]){
      if(accountCache.has(id))continue;
      const a=await env.DB.prepare("SELECT id FROM accounts WHERE company_id=? AND id=? AND analytic=1 AND active=1").bind(companyId,id).first();
      accountCache.set(id,!!a);
    }
    if(!accountCache.get(conf.debit_account_id)||!accountCache.get(conf.credit_account_id))
      block('CONTA_INVALIDA','Uma das contas do evento '+g.event.code+' não está analítica e ativa.');
    eventTotals.push({event_id:g.event.id,code:g.event.code,name:g.event.name,
      type:g.event.event_type,amount_cents:g.cents,
      debit_account_id:conf.debit_account_id,credit_account_id:conf.credit_account_id});
  }
  const latest=await env.DB.prepare("SELECT id FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY' ORDER BY revision DESC LIMIT 1").bind(companyId,run.competence_id).first();
  if(latest?.id!==runId)block('REVISAO_ANTERIOR','Somente a revisão mais recente pode ser integrada.');
  const preview={kind:'INTEGRACAO_POR_EVENTO_ETAPA_37_AJUSTE',run,totals,settings:batchSetting,
    existing,employee_count:envelopes.length,payable_total_cents:sumNet,
    event_totals:eventTotals,problems,integrated:!!existing,ready:!existing&&!problems.length,
    notes:['As contas de débito e crédito são definidas em cada evento de folha ou encargo.',
      'O salário líquido é gerado por funcionário em Contas a Pagar.',
      'INSS retido, IRRF e FGTS são contabilizados sem gerar guias automaticamente.',
      'Informativos distintos do FGTS não geram lançamentos contábeis nesta etapa.']};
  if(action==='preview')return preview;
  if(action!=='integrate')fail38(d,'Operação inválida.','NOT_FOUND',404);
  await d.requirePermission(env,auth.user.id,companyId,'payroll.manage');
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.post');
  await d.requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
  if(existing)return {...preview,reused:true};
  if(body.confirmation!=='INTEGRAR')fail38(d,'Digite INTEGRAR para confirmar a integração.','CONFIRMATION_REQUIRED',400);
  if(problems.length)fail38(d,'Integração bloqueada: '+problems[0].message);
  if(!eventTotals.length)fail38(d,'Nenhum evento com valor positivo para contabilizar.');
  const year=Number(run.competence.slice(0,4)),month=Number(run.competence.slice(5,7));
  const date=run.competence+'-'+String(new Date(Date.UTC(year,month,0)).getUTCDate()).padStart(2,'0');
  const desc='Folha mensal '+run.competence+' (revisão '+run.revision+')';
  const lines=[];
  for(const item of eventTotals){
    for(const [side,id] of [['D',item.debit_account_id],['C',item.credit_account_id]]){
      lines.push({side,account_id:id,amount:d.centsToMoney(item.amount_cents),
        history_complement:desc+' — '+item.code+' '+item.name});
    }
  }
  const used=await env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference=? AND status<>'VOID' LIMIT 1").bind(companyId,'MONTHLY:'+runId).first();
  if(used)fail38(d,'Esta folha já possui lançamento contábil. Integração bloqueada.','ALREADY_POSTED');
  const built=await d.buildInternalPostedEntry(env,auth,companyId,{
    batch_id:batchSetting.batch_id,entry_date:date,
    document_number:'FOLHA-'+run.competence,description:desc,
    source_module:'PAYROLL',source_reference:'MONTHLY:'+runId,lines
  });
  const number=await d.nextPayableNumber(env,companyId);
  const first=Number(number.slice(3));
  if(!Number.isSafeInteger(first)||first<1||first+envelopes.length>999999)
    fail38(d,'Limite de numeração dos títulos financeiros.');
  const stmts=[...built.stmts];
  let titleCount=0,total=0;
  for(const e of envelopes){
    if(!Number.isSafeInteger(Number(e.net_cents))||e.net_cents<0)fail38(d,'Valor líquido inválido.');
    if(!e.net_cents)continue;
    const payableId=d.uuid();
    stmts.push(env.DB.prepare("INSERT INTO financial_payables (id,company_id,number,supplier_id,source_type,source_id,issue_date,due_date,document_number,description,amount_cents,balance_cents,status,created_by) VALUES (?,?,?,?,'PAYROLL_MONTHLY',?,?,?,?,?,?,?,'OPEN',?)")
      .bind(payableId,companyId,'CP-'+String(first+titleCount).padStart(6,'0'),e.employee_id,
        runId+':'+e.employee_id,date,run.payment_date,'FOLHA-'+run.competence,
        'Salário líquido '+(e.employee_code||'')+' - '+e.employee_name,e.net_cents,e.net_cents,auth.user.id));
    stmts.push(env.DB.prepare("INSERT INTO payroll_finance_payables37 (payable_id,company_id,run_id,employee_id) VALUES (?,?,?,?)").bind(payableId,companyId,runId,e.employee_id));
    titleCount++;total+=Number(e.net_cents);
  }
  if(total!==sumNet)fail38(d,'A soma dos títulos diverge do líquido da folha.');
  stmts.push(env.DB.prepare("INSERT INTO payroll_finance_postings37(run_id,company_id,source_fingerprint,journal_entry_id,payable_count,payable_total_cents,posted_by) VALUES (?,?,?,?,?,?,?)")
    .bind(runId,companyId,run.source_fingerprint,built.entryId,titleCount,total,auth.user.id));
  if(stmts.length>220)fail38(d,'Integração excede o limite transacional seguro.');
  try{await env.DB.batch(stmts)}catch(err){
    if(/UNIQUE constraint failed|FOREIGN KEY constraint failed|constraint failed/i.test(String(err?.message||err)))
      fail38(d,'O processamento foi integrado ou alterado por outra operação. Confira antes de tentar novamente.','CONFLICT');
    throw err;
  }
  await d.audit(env,{companyId,userId:auth.user.id,action:'INTEGRATE',entity:'payroll_finance_postings37',entityId:runId,
    after:{run_id:runId,journal_entry_id:built.entryId,payable_count:titleCount,payable_total_cents:total,event_count:eventTotals.length},request});
  return {...preview,integrated:true,ready:false,posting:{journal_entry_id:built.entryId,payable_count:titleCount,payable_total_cents:total}};
}
