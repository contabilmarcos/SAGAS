// SAGAS Folha Etapa 37: integracao mensal ao contas a pagar e ao diario.
// Nao cria guias fiscais nem paga titulos. Mapeamento autorizado pela empresa.
const FIELDS37 = [
  'batch_id','earnings_expense_account_id','wages_payable_account_id',
  'inss_payable_account_id','irrf_payable_account_id',
  'fgts_expense_account_id','fgts_payable_account_id'
];

export async function payrollFinance37(action, c) {
  const {env,companyId,auth,request,d} = c;
  const fail = (msg,code='PAYROLL_FINANCE_BLOCKED',status=409) => { throw new d.HttpError(status,msg,code); };
  await d.ensureSchemaRevision(env,'payroll-finance-integration37',1,async()=>{
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS payroll_finance_settings37 (company_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, earnings_expense_account_id TEXT NOT NULL, wages_payable_account_id TEXT NOT NULL, inss_payable_account_id TEXT NOT NULL, irrf_payable_account_id TEXT NOT NULL, fgts_expense_account_id TEXT NOT NULL, fgts_payable_account_id TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS payroll_finance_postings37 (run_id TEXT PRIMARY KEY, company_id TEXT NOT NULL, source_fingerprint TEXT NOT NULL, journal_entry_id TEXT NOT NULL, payable_count INTEGER NOT NULL, payable_total_cents INTEGER NOT NULL, posted_by TEXT NOT NULL, posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_payroll_finance_postings37_company ON payroll_finance_postings37(company_id,run_id)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS payroll_finance_payables37 (payable_id TEXT PRIMARY KEY,company_id TEXT NOT NULL,run_id TEXT NOT NULL,employee_id TEXT NOT NULL, UNIQUE(run_id,employee_id))')
    ]);
  });
  const getSettings = async()=>await env.DB.prepare('SELECT * FROM payroll_finance_settings37 WHERE company_id=?').bind(companyId).first();
  const getPosting = async runId=>await env.DB.prepare('SELECT * FROM payroll_finance_postings37 WHERE company_id=? AND run_id=?').bind(companyId,runId).first();
  if(action==='settings'){
    await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
    return {settings:await getSettings(),fields:FIELDS37};
  }
  if(action==='save'){
    await d.requirePermission(env,auth.user.id,companyId,'payroll.manage');
    await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
    await d.requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
    const settings={};
    for(const f of FIELDS37){
      settings[f]=String(c.body?.[f]||'').trim();
      if(!settings[f]||settings[f].length>100)fail('Informe todos os campos de parametrizacao contábil.','INVALID_SETTINGS',400);
    }
    const batch=await env.DB.prepare('SELECT id,status FROM journal_batches WHERE company_id=? AND id=?').bind(companyId,settings.batch_id).first();
    if(!batch||batch.status!=='OPEN')fail('Selecione um lote contábil aberto da empresa.');
    for(const f of FIELDS37.slice(1)){
      const row=await env.DB.prepare('SELECT id FROM accounts WHERE id=? AND company_id=? AND analytic=1 AND active=1').bind(settings[f],companyId).first();
      if(!row)fail('A conta '+f+' deve ser analitica, ativa e pertencer a empresa.','INVALID_SETTINGS');
    }
    const old=await getSettings();
    await env.DB.prepare('INSERT INTO payroll_finance_settings37 (company_id,batch_id,earnings_expense_account_id,wages_payable_account_id,inss_payable_account_id,irrf_payable_account_id,fgts_expense_account_id,fgts_payable_account_id,updated_by) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET batch_id=excluded.batch_id,earnings_expense_account_id=excluded.earnings_expense_account_id,wages_payable_account_id=excluded.wages_payable_account_id,inss_payable_account_id=excluded.inss_payable_account_id,irrf_payable_account_id=excluded.irrf_payable_account_id,fgts_expense_account_id=excluded.fgts_expense_account_id,fgts_payable_account_id=excluded.fgts_payable_account_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP').bind(companyId,...FIELDS37.map(f=>settings[f]),auth.user.id).run();
    await d.audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'payroll_finance_settings37',entityId:companyId,before:old,after:settings,request});
    return {settings:await getSettings()};
  }
  const runId=String(c.runId||'');
  await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
  const [detail,conference,settings,existing]=await Promise.all([
    d.payrollMonthlyRunDetail35(env,companyId,runId),
    d.payrollMonthlyConference36(env,companyId,runId),
    getSettings(),getPosting(runId)
  ]);
  const {run,envelopes,totals}=detail;
  const problems=[];
  const add=(code,message)=>problems.push({code,message});
  if(run.status!=='APPROVED'||!conference.approved||!conference.review?.closed_at)
    add('FOLHA_NAO_FECHADA','Conclua a conferencia e o fechamento da folha antes da integracao.');
  if(conference.problems?.length)add('CONFERENCIA_DIVERGENTE',conference.problems[0].message);
  if(!settings)add('PARAMETROS_AUSENTES','Configure as contas e o lote contábil da folha.');
  if(!envelopes.length)add('SEM_ENVELOPES','Nenhum funcionario no processamento.');
  if(envelopes.length>90)add('LIMITE','Mais de 90 funcionarios; processe por lote em uma futura implementacao.');
  let otherDiscounts=0;
  let totalsSafe=true;
  for(const row of envelopes){
    const nums=['earnings_cents','deductions_cents','net_cents','inss_cents','irrf_cents','fgts_cents'];
    if(nums.some(k=>!Number.isSafeInteger(Number(row[k]))||Number(row[k])<0))totalsSafe=false;
    const other=Number(row.deductions_cents)-Number(row.inss_cents)-Number(row.irrf_cents);
    if(other<0)totalsSafe=false;
    otherDiscounts+=other;
  }
  if(!totalsSafe||Object.values(totals).some(v=>!Number.isSafeInteger(Number(v))||Number(v)<0))
    add('VALORES_INVALIDOS','Os envelopes possuem valores monetarios invalidos.');
  if(otherDiscounts>0)
    add('OUTROS_DESCONTOS','Existem descontos alem de INSS e IRRF. Parametrize seus credores e contas antes de integrar; o sistema nao criara obrigacoes genericas.');
  if(Number(totals.earnings_cents)!==Number(totals.net_cents)+Number(totals.inss_cents)+Number(totals.irrf_cents)+otherDiscounts)
    add('TOTAIS_DIVERGENTES','Bruto, descontos e liquido nao conciliam.');
  const current=await env.DB.prepare("SELECT id FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY' ORDER BY revision DESC LIMIT 1").bind(companyId,run.competence_id).first();
  if(current?.id!==runId)add('VERSAO_ANTERIOR','Somente a ultima revisao pode ser integrada.');
  const preview={kind:'INTEGRACAO_MENSAL_ETAPA_37',run,settings,existing,
    totals,employee_count:envelopes.length,employee_title_count:envelopes.filter(x=>x.net_cents>0).length,
    payable_total_cents:Number(totals.net_cents),other_discounts_cents:otherDiscounts,
    problems,ready:!existing&&!problems.length,integrated:!!existing,
    notes:['Títulos financeiros apenas de salarios liquidos, por funcionario.',
      'INSS exibido representa somente a parte retida do empregado: nao corresponde ao DARF total.',
      'IRRF e FGTS sao contabilizados como obrigacoes; guias/vencimentos nao sao gerados automaticamente.',
      'FGTS, encargos patronais adicionais, ferias, 13o e provisoes exigem conciliacao propria.']};
  if(action==='preview')return preview;
  if(action!=='integrate')fail('Operacao inexistente.','NOT_FOUND',404);
  await d.requirePermission(env,auth.user.id,companyId,'payroll.manage');
  await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
  await d.requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
  if(existing)return {...preview,reused:true};
  if(c.body?.confirmation!=='INTEGRAR')fail('Digite INTEGRAR para confirmar.','CONFIRMATION_REQUIRED',400);
  if(problems.length)fail('Integracao bloqueada: '+problems[0].message);
  const date=run.competence+'-'+String(new Date(Date.UTC(Number(run.competence.slice(0,4)),Number(run.competence.slice(5,7)),0)).getUTCDate()).padStart(2,'0');
  const documentNumber='FOLHA-'+run.competence;
  const desc='Folha mensal '+run.competence+' (processamento '+run.revision+')';
  const lines=[];
  const make=(side,accountId,cents,label)=>{
    if(cents>0)lines.push({side,account_id:accountId,amount:d.centsToMoney(cents),history_complement:desc+' - '+label});
  };
  make('D',settings.earnings_expense_account_id,Number(totals.earnings_cents),'proventos');
  make('C',settings.wages_payable_account_id,Number(totals.net_cents),'salarios liquidos');
  make('C',settings.inss_payable_account_id,Number(totals.inss_cents),'INSS empregado retido');
  make('C',settings.irrf_payable_account_id,Number(totals.irrf_cents),'IRRF empregado');
  make('D',settings.fgts_expense_account_id,Number(totals.fgts_cents),'FGTS mensal despesa');
  make('C',settings.fgts_payable_account_id,Number(totals.fgts_cents),'FGTS mensal a recolher');
  if(lines.length<2)fail('Nenhum valor positivo para contabilizar.');
  const built=await d.buildInternalPostedEntry(env,auth,companyId,{batch_id:settings.batch_id,
    entry_date:date,document_number:documentNumber,description:desc,
    source_module:'PAYROLL',source_reference:'MONTHLY:'+runId,lines});
  const conflicting=await env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference=? AND status <> 'VOID' LIMIT 1").bind(companyId,'MONTHLY:'+runId).first();
  if(conflicting)fail('Ja existe um lancamento contábil vinculado a esta folha.','ALREADY_POSTED');
  const first=await d.nextPayableNumber(env,companyId);
  const firstNumber=Number(first.slice(3));
  if(!Number.isSafeInteger(firstNumber)||firstNumber<1||firstNumber+envelopes.length>999999)fail('Limite de numeracao de contas a pagar.');
  const stmts=[...built.stmts];
  let payableCount=0, payableSum=0;
  for(const emp of envelopes){
    if(emp.net_cents<=0)continue;
    const id=d.uuid(),num='CP-'+String(firstNumber+payableCount).padStart(6,'0');
    const info=String(emp.employee_code||'').padStart(5,'0');
    const sourceId=runId+':'+emp.employee_id;
    stmts.push(env.DB.prepare("INSERT INTO financial_payables (id,company_id,number,supplier_id,source_type,source_id,issue_date,due_date,document_number,description,amount_cents,balance_cents,status,created_by) VALUES (?,?,?,?,'PAYROLL_MONTHLY',?,?,?,?,?,?,?,'OPEN',?)")
      .bind(id,companyId,num,emp.employee_id,sourceId,date,run.payment_date,documentNumber,
        'Salario liquido '+info+' - '+emp.employee_name+' - '+run.competence,emp.net_cents,emp.net_cents,auth.user.id));
    stmts.push(env.DB.prepare('INSERT INTO payroll_finance_payables37 (payable_id,company_id,run_id,employee_id) VALUES (?,?,?,?)').bind(id,companyId,runId,emp.employee_id));
    payableCount++;payableSum+=Number(emp.net_cents);
  }
  if(payableSum!==Number(totals.net_cents))fail('A soma dos titulos difere do salario liquido.');
  stmts.push(env.DB.prepare("INSERT INTO payroll_finance_postings37 (run_id,company_id,source_fingerprint,journal_entry_id,payable_count,payable_total_cents,posted_by) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM payroll_calc_runs WHERE id=? AND company_id=? AND status='APPROVED')").bind(runId,companyId,run.source_fingerprint,built.entryId,payableCount,payableSum,auth.user.id,runId,companyId));
  if(stmts.length>220)fail('Processamento excede o limite transacional seguro.');
  try{await env.DB.batch(stmts)}catch(err){
    if(/UNIQUE constraint failed|FOREIGN KEY constraint failed/i.test(String(err?.message||err)))fail('Integracao ja realizada ou alterada por outra operacao. Confira os titulos antes de tentar novamente.','CONFLICT');
    throw err;
  }
  await d.audit(env,{companyId,userId:auth.user.id,action:'INTEGRATE',entity:'payroll_finance_postings37',entityId:runId,
    after:{run_id:runId,journal_entry_id:built.entryId,payable_count:payableCount,payable_total_cents:payableSum},request});
  return {...preview,integrated:true,ready:false,posting:{journal_entry_id:built.entryId,payable_count:payableCount,payable_total_cents:payableSum}};
}
