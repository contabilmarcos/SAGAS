import { planNatureDefaults126 } from './sagas-payroll-ledger126.js';
// SAGAS Folha v126: eventos com D/C unilaterais e liquido credor por centro de custo.
// Mantém integrações existentes, não reaproveita mapeamentos antigos de contas fixas.
const AUTO_EVENTS38 = [
  ['SALARIO_BASE','Salário mensal','PROVENTO'],
  ['INSS_EMP','INSS do empregado','DESCONTO'],
  ['IRRF_EMP','IRRF do empregado','DESCONTO'],
  ['FGTS_PATRONAL','FGTS patronal','INFORMATIVO'],
  ['FALTA_INJUSTIFICADA','Falta não justificada','DESCONTO'],
  ['ATRASO_MINUTOS','Atraso não justificado','DESCONTO'],
  ['DSR_DESCONTO','Perda de DSR confirmada','DESCONTO'],
  ['LICENCA_NAO_REMUNERADA','Licença sem remuneração','DESCONTO'],
  ['LICENCA_REMUNERADA','Licença remunerada','INFORMATIVO'],
  ['DOENCA_EMPRESA_15','Doença — primeiros 15 dias','INFORMATIVO']
];
const codes38 = new Set(AUTO_EVENTS38.map(e=>e[0]));
async function schema126(env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_finance_net_natures126(company_id TEXT PRIMARY KEY,nature_id TEXT NOT NULL REFERENCES budget_natures(id) ON DELETE RESTRICT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
const fail38=(d,message,code='PAYROLL_EVENT_ACCOUNTING_BLOCKED',status=409)=>{
  throw new d.HttpError(status,message,code);
};
async function schema38(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_event_accounts38 (company_id TEXT NOT NULL,event_id TEXT NOT NULL REFERENCES payroll_events(id) ON DELETE RESTRICT,debit_account_id TEXT NOT NULL,credit_account_id TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,event_id))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_event_natures39(company_id TEXT NOT NULL,event_id TEXT NOT NULL REFERENCES payroll_events(id) ON DELETE RESTRICT,nature_id TEXT NOT NULL REFERENCES budget_natures(id) ON DELETE RESTRICT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_id,event_id))"),
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
export async function payrollFinance39(action,c) {
  const {env,companyId,request,auth,body={},runId,d}=c;
  // v38 foi aplicado em produção antes da tabela de naturezas existir.
  // Usar escopo novo garante a migração aditiva em D1 já atualizado.
  await d.ensureSchemaRevision(env,'payroll-event-natures39',1,()=>schema38(env));
  await d.ensureSchemaRevision(env,'payroll-finance-net-natures126',1,()=>schema126(env));
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
    const read=()=>env.DB.prepare("SELECT m.nature_id,n.code AS nature_code,n.description AS nature_description,m.updated_at FROM payroll_event_natures39 m JOIN budget_natures n ON n.id=m.nature_id AND n.company_id=m.company_id WHERE m.company_id=? AND m.event_id=?").bind(companyId,event.id).first();
    if(action==='event-settings')return {event,settings:await read(),automatic:codes38.has(event.code)};
    const natureId=String(body.nature_id||'').trim();
    if(!natureId||natureId.length>100)fail38(d,'Selecione a natureza orçamentária do evento.','INVALID_NATURE',400);
    const nature=await env.DB.prepare("SELECT id,code,description FROM budget_natures WHERE company_id=? AND id=? AND active=1 AND synthetic_analytic='ANALYTIC'").bind(companyId,natureId).first();
    if(!nature)fail38(d,'Selecione uma natureza analítica, ativa e da mesma empresa.','INVALID_NATURE',400);
    const before=await read();
    await env.DB.prepare("INSERT INTO payroll_event_natures39(company_id,event_id,nature_id,updated_by) VALUES (?,?,?,?) ON CONFLICT(company_id,event_id) DO UPDATE SET nature_id=excluded.nature_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(companyId,event.id,natureId,auth.user.id).run();
    await d.audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'payroll_event_natures39',entityId:event.id,before,after:{nature_id:nature.id},request});
    return {event,settings:await read()};
  }
  if(action==='settings'||action==='save'){
    await d.requirePermission(env,auth.user.id,companyId,action==='save'?'payroll.manage':'payroll.read');
    if(action==='save')await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.create');
    const read=async()=>{
      const [batch,net]=await Promise.all([
        env.DB.prepare("SELECT batch_id,updated_at FROM payroll_finance_batches38 WHERE company_id=?").bind(companyId).first(),
        env.DB.prepare("SELECT nature_id,updated_at FROM payroll_finance_net_natures126 WHERE company_id=?").bind(companyId).first()
      ]);
      return {...(batch||{}),net_nature_id:net?.nature_id||null};
    };
    if(action==='settings')return {settings:await read()};
    const batchId=String(body.batch_id||'').trim();
    if(!batchId||batchId.length>100)fail38(d,'Selecione o lote contábil.','INVALID_BATCH',400);
    const batch=await env.DB.prepare("SELECT id,status FROM journal_batches WHERE id=? AND company_id=?").bind(batchId,companyId).first();
    if(!batch||batch.status!=='OPEN')fail38(d,'O lote contábil precisa estar aberto nesta empresa.','INVALID_BATCH');
    const netNatureId=String(body.net_nature_id||'').trim();
    if(netNatureId){
      const valid=await env.DB.prepare("SELECT id FROM budget_natures WHERE company_id=? AND id=? AND synthetic_analytic='ANALYTIC' AND active=1").bind(companyId,netNatureId).first();
      if(!valid)fail38(d,'Selecione natureza analitica ativa para o credito do salario liquido.','INVALID_NET_NATURE',400);
    }
    const before=await read();
    await env.DB.prepare("INSERT INTO payroll_finance_batches38(company_id,batch_id,updated_by) VALUES (?,?,?) ON CONFLICT(company_id) DO UPDATE SET batch_id=excluded.batch_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(companyId,batchId,auth.user.id).run();
    if(netNatureId){
      await env.DB.prepare("INSERT INTO payroll_finance_net_natures126(company_id,nature_id,updated_by) VALUES (?,?,?) ON CONFLICT(company_id) DO UPDATE SET nature_id=excluded.nature_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(companyId,netNatureId,auth.user.id).run();
    }
    await d.audit(env,{companyId,userId:auth.user.id,action:'UPDATE',entity:'payroll_finance_batches38',entityId:companyId,before,after:{batch_id:batchId,net_nature_id:netNatureId||before.net_nature_id},request});
    return {settings:await read()};
  }
  await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
  const events=await catalog38(env,companyId,d);
  const [detail,conference,batchSetting,existing,mappings,netNatureSetting]=await Promise.all([
    d.payrollMonthlyRunDetail35(env,companyId,runId),
    d.payrollMonthlyConference36(env,companyId,runId),
    env.DB.prepare("SELECT batch_id FROM payroll_finance_batches38 WHERE company_id=?").bind(companyId).first(),
    env.DB.prepare("SELECT * FROM payroll_finance_postings37 WHERE company_id=? AND run_id=?").bind(companyId,runId).first(),
    env.DB.prepare("SELECT m.event_id,m.nature_id,n.code AS nature_code,n.description AS nature_description,n.active,n.synthetic_analytic FROM payroll_event_natures39 m JOIN budget_natures n ON n.id=m.nature_id AND n.company_id=m.company_id WHERE m.company_id=?").bind(companyId).all(),
    env.DB.prepare("SELECT n.id,n.code,n.active,n.synthetic_analytic FROM payroll_finance_net_natures126 m JOIN budget_natures n ON n.company_id=m.company_id AND n.id=m.nature_id WHERE m.company_id=?").bind(companyId).first()
  ]);
  const {run,envelopes,totals}=detail,problems=[];
  const block=(code,message)=>{if(!problems.some(p=>p.code===code&&p.message===message))problems.push({code,message});};
  if(run.status!=='APPROVED'||!conference.approved||!conference.review?.closed_at)
    block('FOLHA_NAO_FECHADA','A folha deve estar conferida e fechada.');
  if(conference.problems?.length)block('CONFERENCIA_DIVERGENTE',conference.problems[0].message);
  if(!envelopes.length)block('SEM_ENVELOPES','A folha não possui envelopes.');
  if(envelopes.length>90)block('LIMITE','A integração está limitada a 90 funcionários por lote.');
  const batch=await env.DB.prepare("SELECT id,status FROM journal_batches WHERE company_id=? AND id=?").bind(companyId,batchSetting?.batch_id||'').first();
  if(!batch||batch.status!=='OPEN')block('LOTE_PENDENTE','Selecione um lote contábil aberto.');
  const mapById=new Map((mappings.results||[]).map(x=>[x.event_id,x]));
  const catalogByCode=new Map(events.map(e=>[e.code,e]));
  const centers=new Map(),natureDefaults=new Map(),accountValidity=new Map();
  const accountingLines=[],eventTotalsMap=new Map(),netByCenter=new Map();
  let sumNet=0,sumGross=0,sumDeductions=0,sumInss=0,sumIrrf=0,sumFgts=0;
  // Resolve as linhas presentes: nao exigir D e C dentro de cada evento.
  // Cada lado configurado precisa somar 100%; a partida integral fecha no final.
  const appendNatureLines126=async(defaults,cc,amount,natureCode,label,options={})=>{
    const plan=planNatureDefaults126(defaults,cc.id,amount,options);
    for(const issue of plan.problems)
      block(issue.code,'Natureza '+natureCode+' / '+label+': '+issue.message);
    if(plan.problems.length)return false;
    const staged=[];
    let valid=true;
    for(const line of plan.lines){
      if(!accountValidity.has(line.account_id)){
        const account=await env.DB.prepare("SELECT id FROM accounts WHERE id=? AND company_id=? AND analytic=1 AND active=1").bind(line.account_id,companyId).first();
        accountValidity.set(line.account_id,!!account);
      }
      if(!accountValidity.get(line.account_id)){
        block('CONTA_INVALIDA','Default '+line.side+' da natureza '+natureCode+' aponta conta invalida para '+label+'.');
        valid=false;continue;
      }
      staged.push({side:line.side,account_id:line.account_id,amount:d.centsToMoney(line.amount_cents),
        cost_center_id:cc.id,branch_id:line.branch_id||null,history_template_id:line.history_template_id||null,
        history_complement:line.history_complement||('Folha '+run.competence+' - '+label+' - '+cc.code)});
    }
    if(valid)accountingLines.push(...staged);
    return valid;
  };
  // Fotografia do centro de custo gravada no processamento. Não inferir o passado
  // do cadastro atual: folhas antigas sem essa fotografia ficam bloqueadas.
  for(const envp of envelopes){
    sumNet+=Number(envp.net_cents);
    sumGross+=Number(envp.earnings_cents);
    sumDeductions+=Number(envp.deductions_cents);
    sumInss+=Number(envp.inss_cents);
    sumIrrf+=Number(envp.irrf_cents);
    sumFgts+=Number(envp.fgts_cents);
    if(!Number.isSafeInteger(Number(envp.net_cents))||Number(envp.net_cents)<0)
      block('LIQUIDO_INVALIDO','Valor líquido inválido no envelope '+(envp.employee_code||envp.employee_id)+'.');
    const ccId=envp.cost_center_id;
    let cc=centers.get(ccId);
    if(ccId&&!centers.has(ccId)){
      cc=await env.DB.prepare("SELECT id,code,name,active FROM cost_centers WHERE id=? AND company_id=?").bind(ccId,companyId).first();
      centers.set(ccId,cc||null);
    }
    if(!ccId||!cc||!cc.active)
      block('CENTRO_CUSTO_AUSENTE','O funcionário '+(envp.employee_code||envp.employee_name)+' não possui centro de custo válido na fotografia da folha. Requer regularização controlada, sem atribuição retroativa.');
    if(cc?.id&&cc.active&&Number.isSafeInteger(Number(envp.net_cents))&&Number(envp.net_cents)>0){
      const group=netByCenter.get(cc.id)||{center:cc,amount_cents:0};
      group.amount_cents+=Number(envp.net_cents);
      netByCenter.set(cc.id,group);
    }
    const centerCode=cc?.code||'SEM_CC';
    for(const line of envp.lines||[]){
      const amount=Number(line.amount_cents);
      if(!Number.isSafeInteger(amount)||amount<0||amount>99999999999){
        block('VALOR_INVALIDO','Valor inválido no evento '+line.event_code);continue;
      }
      const event=catalogByCode.get(line.event_code);
      if(!event||event.event_type!==line.line_type){
        block('EVENTO_DIVERGENTE','O evento '+line.event_code+' não está corretamente cadastrado.');continue;
      }
      if(!event.active)block('EVENTO_INATIVO','O evento '+line.event_code+' está inativo.');
      // Apenas o FGTS patronal é contabilizado dentre os eventos informativos
      // nesta etapa. Valores puramente demonstrativos não geram partidas.
      if(line.line_type==='INFORMATIVO'&&line.event_code!=='FGTS_PATRONAL')continue;
      if(!amount)continue;
      const cfg=mapById.get(event.id);
      if(!cfg||!cfg.active||cfg.synthetic_analytic!=='ANALYTIC'){
        block('EVENTO_SEM_NATUREZA','Configure a natureza do evento '+event.code+' — '+event.name+'.');continue;
      }
      if(!cc)continue;
      const natureId=cfg.nature_id;
      let defaults=natureDefaults.get(natureId);
      if(!defaults){
        const r=await env.DB.prepare("SELECT d.id,d.side,d.account_id,d.percentage,d.branch_id,d.cost_center_id,d.history_template_id,d.history_complement FROM budget_nature_accounts d WHERE d.company_id=? AND d.nature_id=? ORDER BY d.created_at,d.id").bind(companyId,natureId).all();
        defaults=r.results||[];
        natureDefaults.set(natureId,defaults);
      }
      const label=event.code+' / CC '+centerCode;
      const complete=await appendNatureLines126(defaults,cc,amount,cfg.nature_code,label);
      if(!complete)continue;
      const key=event.id+'|'+cc.id;
      const existingEvent=eventTotalsMap.get(key);
      if(existingEvent)existingEvent.amount_cents+=amount;
      else eventTotalsMap.set(key,{event_id:event.id,code:event.code,name:event.name,type:event.event_type,
        nature_id:natureId,nature_code:cfg.nature_code,cost_center_id:cc.id,cost_center_code:cc.code,amount_cents:amount});
    }
  }
  // Credito automatico do salario liquido, por centro de custo, sem duplicar
  // as obrigacoes tributarias que ja foram creditadas nos eventos de desconto.
  if(sumNet>0&&(!netNatureSetting||!netNatureSetting.active||netNatureSetting.synthetic_analytic!=='ANALYTIC'))
    block('LIQUIDO_SEM_NATUREZA','Configure a natureza do salario liquido a pagar no lote da integracao.');
  if(netNatureSetting&&netNatureSetting.active&&netNatureSetting.synthetic_analytic==='ANALYTIC'){
    let netDefaults=natureDefaults.get(netNatureSetting.id);
    if(!netDefaults){
      const r=await env.DB.prepare("SELECT d.id,d.side,d.account_id,d.percentage,d.branch_id,d.cost_center_id,d.history_template_id,d.history_complement FROM budget_nature_accounts d WHERE d.company_id=? AND d.nature_id=? ORDER BY d.created_at,d.id").bind(companyId,netNatureSetting.id).all();
      netDefaults=r.results||[];
      natureDefaults.set(netNatureSetting.id,netDefaults);
    }
    for(const group of netByCenter.values()){
      const cc=group.center,amount=group.amount_cents;
      if(!Number.isSafeInteger(amount)||amount<=0){
        block('LIQUIDO_INVALIDO','Liquido por centro de custo inconsistente.');continue;
      }
      const complete=await appendNatureLines126(netDefaults,cc,amount,netNatureSetting.code,
        'LIQUIDO_FOLHA / CC '+cc.code,{requireCreditOnly:true});
      if(complete){
        eventTotalsMap.set('LIQUIDO_FOLHA|'+cc.id,{
          event_id:null,code:'LIQUIDO_FOLHA',name:'Salarios liquidos a pagar',
          type:'LIQUIDO',nature_id:netNatureSetting.id,nature_code:netNatureSetting.code,
          cost_center_id:cc.id,cost_center_code:cc.code,amount_cents:amount
        });
      }
    }
  }
  const journalDebits=accountingLines.filter(x=>x.side==='D').reduce((a,x)=>a+Math.round(Number(x.amount)*100),0);
  const journalCredits=accountingLines.filter(x=>x.side==='C').reduce((a,x)=>a+Math.round(Number(x.amount)*100),0);
  if(!Number.isSafeInteger(journalDebits)||!Number.isSafeInteger(journalCredits)||journalDebits!==journalCredits)
    block('DIARIO_DESBALANCEADO','Diario da folha nao fecha: debitos '+(journalDebits/100).toFixed(2)+' / creditos '+(journalCredits/100).toFixed(2)+'. Confira lados dos eventos e do liquido.');
  if(![sumGross,sumNet,sumDeductions,sumInss,sumIrrf,sumFgts].every(Number.isSafeInteger)
    ||sumGross!==sumNet+sumDeductions
    ||sumGross!==Number(totals.earnings_cents)||sumNet!==Number(totals.net_cents)
    ||sumInss!==Number(totals.inss_cents)||sumIrrf!==Number(totals.irrf_cents)
    ||sumFgts!==Number(totals.fgts_cents))
    block('TOTAIS_DIVERGENTES','Totais de eventos e envelopes não conciliam.');
  if(accountingLines.length>150)block('LIMITE_PARTIDAS','Mais de 150 partidas contábeis: ajuste o processamento para lotes menores.');
  const eventTotals=[...eventTotalsMap.values()];
  const latest=await env.DB.prepare("SELECT id FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY' ORDER BY revision DESC LIMIT 1").bind(companyId,run.competence_id).first();
  if(latest?.id!==runId)block('REVISAO_ANTERIOR','Somente a revisão mais recente pode ser integrada.');
  const preview={kind:'INTEGRACAO_NATUREZA_CC_ETAPA_37_AJUSTE',run,totals,settings:batchSetting,
    existing,employee_count:envelopes.length,payable_total_cents:sumNet,
    event_totals:eventTotals,journal_debit_cents:journalDebits,journal_credit_cents:journalCredits,problems,integrated:!!existing,ready:!existing&&!problems.length,
    notes:['Cada evento aponta para uma natureza, que fornece as contas por centro de custo.',
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
  if(!eventTotals.length||!accountingLines.length)fail38(d,'Nenhum evento com valor positivo para contabilizar.');
  const year=Number(run.competence.slice(0,4)),month=Number(run.competence.slice(5,7));
  const date=run.competence+'-'+String(new Date(Date.UTC(year,month,0)).getUTCDate()).padStart(2,'0');
  const desc='Folha mensal '+run.competence+' (revisão '+run.revision+')';
  const lines=accountingLines;
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
