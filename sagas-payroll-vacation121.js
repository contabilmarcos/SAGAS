// SAGAS v121: integra folha com férias somente quando adiantamento, baixas e diário
// possuem vínculo unívoco verificável. Impede pagamento duplicado das férias.
import {payrollVacationPosting65} from './sagas-payroll-vacation65.js';
import {payrollVacationProvision67} from './sagas-payroll-vacation67.js';
const LIMIT121=99999999999;
const MAX_EMP121=90;
const permittedLegacy121=new Set(['SALDO_PROVISAO_INSUFICIENTE']);
function stop121(d,code,msg,status=409){throw new d.HttpError(status,msg,code)}
function cents121(n){return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=LIMIT121}
function report121(items,code,message){
 if(!items.some(x=>x.code===code&&x.message===message))items.push({code,message});
}
function key121(row){return [row.employee_id,row.event_code,row.side].join('|')}
function sums121(lines){
 const D=lines.filter(x=>x.side==='D').reduce((a,x)=>a+x.amount_cents,0);
 const C=lines.filter(x=>x.side==='C').reduce((a,x)=>a+x.amount_cents,0);
 return {debit_cents:D,credit_cents:C};
}
export function plan121(pkg,ledger,detail,postingLinks,batch,existing,review){
 const issues=[],sources=pkg?.sources||[],all=pkg?.lines||[],verified=ledger?.items||[];
 if(!pkg?.applicable||!ledger?.applicable)
  report121(issues,'VACATION_NOT_APPLICABLE','Processamento não inclui férias conciliadas.');
 if(pkg?.run?.status!=='APPROVED'||detail?.run?.status!=='APPROVED'||!review?.approved||!review?.review?.closed_at||review?.problems?.length)
  report121(issues,'MONTHLY_NOT_APPROVED','Feche e aprove a última revisão da competência.');
 if(pkg?.run?.source_fingerprint!==detail?.run?.source_fingerprint)
  report121(issues,'SNAPSHOT_CHANGED','Fotografias de férias e folha não coincidem.');
 if(!String(detail?.run?.source_fingerprint||'').startsWith('VACATION100:'))
  report121(issues,'ORIGIN_INVALID','Integração exige fechamento mensal com férias v100.');
 if(existing)report121(issues,'ALREADY_POSTED','Existe integração financeira/contábil anterior para a folha.');
 if(!batch||batch.status!=='OPEN')
  report121(issues,'BATCH_CLOSED','Selecione lote contábil aberto.');
 if(!sources.length||sources.length>MAX_EMP121||!detail?.envelopes?.length||detail.envelopes.length>MAX_EMP121)
  report121(issues,'EMPLOYEE_LIMIT','Lote deve ter entre 1 e 90 funcionários.');
 if(sources.length!==verified.length)
  report121(issues,'LEDGER_INCOMPLETE','Conferência de baixas não cobre todos os funcionários em férias.');
 if(pkg?.problems?.some(x=>!permittedLegacy121.has(x.code)))
  for(const x of pkg.problems.filter(x=>!permittedLegacy121.has(x.code)))
   report121(issues,'PACKAGE_'+x.code,x.message||'Pendência documental na preparação das férias.');
 if(ledger?.problems?.some(x=>!permittedLegacy121.has(x.code)))
  for(const x of ledger.problems.filter(x=>!permittedLegacy121.has(x.code)))
   report121(issues,'PROVISION_'+x.code,x.message||'Pendência na conciliação das provisões.');
 if(!ledger?.payment_verified_in_financial)
  report121(issues,'ADVANCE_UNVERIFIED','Pagamento do adiantamento precisa estar vinculado a título PAID e diário de baixa verificado.');
 const map=new Map((postingLinks||[]).map(x=>[x.employee_id+'|'+x.component,x]));
 const ledg=new Map(verified.map(x=>[x.employee_id,x]));
 const reclass=[],modifications=[];
 const lines=(Array.isArray(all)?all:[]).map(x=>({...x}));
 // Reclassificar SOMENTE os débitos de FERIAS_GOZO e TERCO_FERIAS que já
 // foram reconhecidos/baixados em diário de provisão com origem unívoca.
 for(const s of sources){
  const entry=ledg.get(s.employee_id);
  if(!entry||!s.advance_evidence?.payment_verified){
   report121(issues,'EMPLOYEE_ADVANCE_UNVERIFIED','Adiantamento não conciliado para '+s.employee_id);continue;
  }
  const envelope=detail.envelopes.find(x=>x.employee_id===s.employee_id);
  if(!envelope||!envelope.cost_center_id){
   report121(issues,'EMPLOYEE_CENTER_MISSING','Envelope não possui centro de custo histórico para '+s.employee_id);continue;
  }
  for(const component of ['FERIAS','TERCO_FERIAS']){
   const eventCode=component==='FERIAS'?'FERIAS_GOZO':'TERCO_FERIAS';
   const c=entry.components?.find(x=>x.component===component);
   const documented=s.components?.find(x=>x.component===component);
   const posted=map.get(s.employee_id+'|'+component);
   const expected=c?.earned_cents;
   if(!c||!documented||!cents121(expected)||!posted||
      !c.linked_to_occurrence||c.explicitly_linked_use_cents!==expected||
      c.matched_document_posted_use_cents!==expected){
    report121(issues,'USE_NOT_LINKED','Férias '+component+' não têm baixa integral, documentada e vinculada à ocorrência para '+s.employee_id);
    continue;
   }
   if(posted.occurrence_id!==s.occurrence_id||posted.component!==component||
      posted.employee_id!==s.employee_id||posted.cost_center_id!==envelope.cost_center_id||
      posted.amount_cents!==expected||posted.journal_status!=='POSTED'||
      posted.posting_kind!=='USE'||!posted.posting_gl_verified||
      !cents121(posted.gl_credit_cents)||posted.gl_credit_cents<expected||
      !posted.gl_credit_account_id){
    report121(issues,'PROVISION_JOURNAL_UNALLOCATED','Baixa '+component+' sem diário conciliado por centro de custo e conta transitória única para '+s.employee_id);
    continue;
   }
   const debits=lines.filter(x=>x.employee_id===s.employee_id&&x.event_code===eventCode&&x.side==='D');
   const total=debits.reduce((a,x)=>a+Number(x.amount_cents),0);
   if(!debits.length||total!==expected||debits.some(x=>x.cost_center_id!==envelope.cost_center_id)){
    report121(issues,'EVENT_DEBIT_MISMATCH','Débitos do evento '+eventCode+' não coincidem com o direito coberto pela provisão de '+s.employee_id);
    continue;
   }
   // Transferir o débito das férias provisionadas para a conta de compensação
   // CREDORA da baixa; não acrescentar débito nem gerar despesa novamente.
   for(const line of debits){
    modifications.push({employee_id:s.employee_id,event_code:eventCode,
     debit_from_account:line.account_id,debit_to_account:posted.gl_credit_account_id,
     amount_cents:line.amount_cents,cost_center_id:line.cost_center_id});
    // Usar o mesmo centro de custo e filial da conta transitória creditada.
    if((line.branch_id||null)!==(posted.gl_credit_branch_id||null))
     report121(issues,'PROVISION_BRANCH_MISMATCH','Filial da baixa não corresponde à rubrica '+eventCode+'.');
    line.account_id=posted.gl_credit_account_id;
    line.account_code=posted.gl_credit_account_code||null;
   }
   reclass.push({employee_id:s.employee_id,component,amount_cents:expected,
    provision_journal_id:posted.journal_entry_id,provision_movement_id:posted.movement_id,
    advance_payment_journal_id:s.advance_evidence?.journal_entry_id});
  }
 }
 if(sources.some(x=>!x.advance_evidence?.payment_verified))
  report121(issues,'ADVANCE_EVIDENCE_INVALID','Há antecipações não vinculadas a financeiro efetivamente baixado.');
 const grossComp=Number(pkg?.sums?.compensated_gross_cents);
 const reclassified=reclass.reduce((a,x)=>a+x.amount_cents,0);
 if(!cents121(grossComp)||grossComp!==reclassified)
  report121(issues,'RECLASS_TOTAL_MISMATCH','Total de férias/terço reclassificado diverge da antecipação compensada.');
 const byEmpEvents=new Map();
 for(const e of detail?.envelopes||[]){
  const lines=e.lines||[],get=(eventCode)=>lines.filter(x=>x.event_code===eventCode);
  // Exatamente um desconto compensatório já presente na fotografia da folha.
  if(sources.some(x=>x.employee_id===e.employee_id)){
   const adv=get('ADIANTAMENTO_FERIAS');
   const expected=reclass.filter(x=>x.employee_id===e.employee_id).reduce((t,x)=>t+x.amount_cents,0);
   if(adv.length!==1||adv[0].line_type!=='DESCONTO'||Number(adv[0].amount_cents)!==expected)
    report121(issues,'ADVANCE_OFFSET_MISMATCH','Rubrica de antecipação não compensa exatamente férias e terço do funcionário '+e.employee_id);
  }
  byEmpEvents.set(e.employee_id,lines);
 }
 // Não admitir naturezas que debitam e creditam a mesma conta.
 for(const s of sources){
  for(const event of ['FERIAS_GOZO','TERCO_FERIAS','ADIANTAMENTO_FERIAS']){
   const ev=lines.filter(x=>x.employee_id===s.employee_id&&x.event_code===event);
   const debits=new Set(ev.filter(x=>x.side==='D').map(x=>x.account_id+'|'+x.cost_center_id+'|'+(x.branch_id||'')));
   if(ev.some(x=>x.side==='C'&&debits.has(x.account_id+'|'+x.cost_center_id+'|'+(x.branch_id||''))))
    report121(issues,'EVENT_SAME_ACCOUNT','Natureza '+event+' debita e credita a mesma conta para '+s.employee_id);
  }
 }
 const journal=sums121(lines);
 if(!cents121(journal.debit_cents)||!cents121(journal.credit_cents)||
    journal.debit_cents!==journal.credit_cents||journal.debit_cents<=0||
    journal.debit_cents!==Number(pkg?.sums?.debit_cents))
  report121(issues,'JOURNAL_NOT_BALANCED','Diário reclassificado não corresponde à memória de férias.');
 const centerSums=new Map();
 for(const l of lines){
  const cc=l.cost_center_id,old=centerSums.get(cc)||{D:0,C:0};
  if(l.side==='D')old.D+=Number(l.amount_cents);else if(l.side==='C')old.C+=Number(l.amount_cents);
  else report121(issues,'LINE_SIDE_INVALID','Lado do diário inválido.');
  centerSums.set(cc,old);
 }
 if([...centerSums.values()].some(x=>x.D!==x.C))
  report121(issues,'CENTER_JOURNAL_UNBALANCED','Partidas não conciliam por centro de custo.');
 if(lines.length>150||lines.length+(detail?.envelopes?.length||0)*2+3>220)
  report121(issues,'TRANSACTION_LIMIT','Número de partidas/funcionários acima do limite transacional.');
 const due=detail?.run?.payment_date||null;
 let titles=0,total=0;
 for(const e of detail?.envelopes||[]){
  if(!cents121(e.net_cents))report121(issues,'NET_INVALID','Líquido mensal inválido para '+e.employee_id);
  if(Number(e.net_cents)>0){titles++;total+=Number(e.net_cents)}
 }
 if(!cents121(total)||total!==Number(detail?.totals?.net_cents))
  report121(issues,'PAYABLE_TOTAL_MISMATCH','Líquidos por funcionário não correspondem ao total fechado.');
 return {kind:'VACATION_MONTHLY_INTEGRATION_V121',run_id:detail?.run?.id,
  competence:detail?.run?.competence,employee_count:detail?.envelopes?.length||0,
  source_fingerprint:null,financial_total_cents:total,payable_count:titles,
  accounting_total_cents:journal.debit_cents,accounting_batch_id:batch?.id||null,
  provisional_reclassifications:reclass,modifications,
  lines,problems:issues,ready:issues.length===0,existing:existing||null,
  read_only:true,financial_generated:!!existing,accounting_generated:!!existing,
  external_advance_paid_separately:true,
  notes:[
   'Somente o líquido RESIDUAL do envelope gera novo título mensal. O adiantamento de férias já pago não é novamente emitido.',
   'Débitos de férias e terço integralmente cobertos por provisões são reclassificados para a conta creditada na baixa já contabilizada.',
   'Diários com vários funcionários são aceitos somente quando todos os movimentos conferem por centro de custo e cada centro credita uma única conta transitória.',
   'FGTS, impostos e encargos são contabilizados via eventos da competência; guias e seus pagamentos são rotinas separadas.',
   'Sem confirmação por extrato bancário externo, o responsável deve reconciliar e atestar os adiantamentos antes de integrar.'
  ]};
}
async function schema121(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_integrations121(run_id TEXT PRIMARY KEY REFERENCES payroll_finance_postings37(run_id) ON DELETE RESTRICT,company_id TEXT NOT NULL,source_fingerprint TEXT NOT NULL,journal_entry_id TEXT NOT NULL,advance_evidence_reference TEXT NOT NULL,source_summary_json TEXT NOT NULL,posted_by TEXT NOT NULL,posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
 ]);
}
async function postedLinks121(env,companyId,pkg){
 const rows=[],cache=new Map();
 for(const source of pkg.sources||[]){
  for(const comp of source.components||[]){
   if(!['FERIAS','TERCO_FERIAS'].includes(comp.component))continue;
   const links=(await env.DB.prepare(
    "SELECT l.movement_id,l.employee_id,l.occurrence_id,l.component,l.amount_cents,m.cost_center_id,pm.posting_id,p.kind AS posting_kind,p.journal_entry_id,j.status AS journal_status,j.total_debit_cents AS journal_debit_cents,j.total_credit_cents AS journal_credit_cents FROM payroll_vacation_provision_use_links68 l JOIN payroll_provision_movements43 m ON m.company_id=l.company_id AND m.id=l.movement_id JOIN payroll_provision_posted_movements45 pm ON pm.company_id=l.company_id AND pm.movement_id=l.movement_id JOIN payroll_provision_postings45 p ON p.id=pm.posting_id AND p.company_id=pm.company_id JOIN journal_entries j ON j.company_id=p.company_id AND j.id=p.journal_entry_id WHERE l.company_id=? AND l.employee_id=? AND l.occurrence_id=? AND l.component=? AND l.competence=? AND l.status='ACTIVE' ORDER BY l.id LIMIT 3"
   ).bind(companyId,source.employee_id,source.occurrence_id,comp.component,pkg.run.competence).all()).results||[];
   if(links.length!==1){
    rows.push({employee_id:source.employee_id,component:comp.component,posting_gl_verified:false});continue;
   }
   const l=links[0],posting=l.posting_id;
   if(!cache.has(posting)){
    const [moves,entryLines]=await Promise.all([
     env.DB.prepare("SELECT m.id,m.employee_id,m.component,m.movement_kind,m.amount_cents,m.cost_center_id FROM payroll_provision_posted_movements45 x JOIN payroll_provision_movements43 m ON m.id=x.movement_id AND m.company_id=x.company_id WHERE x.company_id=? AND x.posting_id=? ORDER BY m.id LIMIT 501").bind(companyId,posting).all(),
     env.DB.prepare("SELECT side,account_id,cost_center_id,branch_id,amount_cents FROM journal_lines WHERE company_id=? AND entry_id=? ORDER BY line_no LIMIT 501").bind(companyId,l.journal_entry_id).all()
    ]);
    const movements=moves.results||[],gl=entryLines.results||[],centers=new Map();
    let valid=movements.length>0&&movements.length<=500&&gl.length>=2&&gl.length<=500;
    let total=0;
    for(const m of movements){
     const n=Number(m.amount_cents);
     if(m.movement_kind!=='USE'||!Number.isSafeInteger(n)||n>=0||!m.cost_center_id){
      valid=false;continue;
     }
     total-=n;
     const c=centers.get(m.cost_center_id)||{movement:0,D:0,C:0,credits:[]};
     c.movement-=n;centers.set(m.cost_center_id,c);
    }
    for(const x of gl){
     const v=Number(x.amount_cents),c=centers.get(x.cost_center_id);
     if(!c||!Number.isSafeInteger(v)||v<=0||!['D','C'].includes(x.side)){valid=false;continue;}
     c[x.side]+=v;if(x.side==='C')c.credits.push(x);
    }
    for(const c of centers.values()){
     const unique=new Set(c.credits.map(x=>x.account_id+'|'+(x.branch_id||'')));
     if(c.movement<=0||c.D!==c.movement||c.C!==c.movement||unique.size!==1)valid=false;
     c.account_id=unique.size===1?c.credits[0].account_id:null;
     c.branch_id=unique.size===1?c.credits[0].branch_id:null;
    }
    if(!Number.isSafeInteger(total)||total<=0||total!==Number(l.journal_credit_cents)||
       total!==Number(l.journal_debit_cents))valid=false;
    cache.set(posting,{valid,movements,centers});
   }
   const record=cache.get(posting),c=record.centers.get(l.cost_center_id);
   const m=record.movements.find(x=>x.id===l.movement_id);
   const same=!!m&&m.employee_id===l.employee_id&&m.component===l.component&&
    m.cost_center_id===l.cost_center_id&&Number(m.amount_cents)===-Number(l.amount_cents);
   rows.push({...l,posting_gl_verified:record.valid&&same&&!!c,
    gl_credit_cents:c?.C??null,gl_credit_account_id:c?.account_id||null,
    gl_credit_branch_id:c?.branch_id||null,gl_credit_account_code:null});
  }
 }
 return rows;
}
async function preview121(c){
 const {env,companyId,runId,d}=c;
 const [pkg,ledger,detail,review,batchSetting,existing]=await Promise.all([
  payrollVacationPosting65('read',c),payrollVacationProvision67(c),
  d.monthlyRunDetail(env,companyId,runId),d.monthlyConference(env,companyId,runId),
  env.DB.prepare("SELECT batch_id FROM payroll_finance_batches38 WHERE company_id=?").bind(companyId).first(),
  env.DB.prepare("SELECT p.run_id,p.source_fingerprint,p.journal_entry_id FROM payroll_finance_postings37 p WHERE p.company_id=? AND p.run_id=?").bind(companyId,runId).first()
 ]);
 const batch=await env.DB.prepare("SELECT id,status FROM journal_batches WHERE company_id=? AND id=?").bind(companyId,batchSetting?.batch_id||'').first();
 const links=pkg.applicable?await postedLinks121(env,companyId,pkg):[];
 const plan=plan121(pkg,ledger,detail,links,batch,existing,review);
 const history=await env.DB.prepare("SELECT * FROM payroll_vacation_integrations121 WHERE company_id=? AND run_id=?").bind(companyId,runId).first();
 if(existing&&(!history||existing.journal_entry_id!==history.journal_entry_id))
  report121(plan.problems,'FOREIGN_ORIGIN_POSTED','Folha já integrada por outra origem; não repetir.');
 plan.ready=plan.problems.length===0;
 plan.source_fingerprint=await d.hash({version:121,companyId,runId,run:detail.run,
  conference:review,package:pkg.fingerprint,provisions:ledger.reconciliation_fingerprint,
  advance:pkg.sources?.map(s=>s.advance_evidence),
  links,batch,existing,history,lines:plan.lines,problems:plan.problems});
 return plan;
}
export async function payrollVacation121(action,c){
 const {env,companyId,auth,request,runId,d,body={}}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='integrate'?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-vacation-integrate121',1,()=>schema121(env));
 if(action!=='preview'&&action!=='integrate')stop121(d,'NOT_FOUND','Ação desconhecida.',404);
 if(action==='integrate')for(const permission of ['accounting.entry.create','accounting.entry.post','financial.payable.manage'])
  await d.requirePermission(env,auth.user.id,companyId,permission);
 const p=await preview121(c);
 if(action==='preview')return p;
 if(body.confirmation!=='INTEGRAR FERIAS E FOLHA'||body.confirmed_reconciliation!=='CONFIRMO ADIANTAMENTO E PROVISOES')
  stop121(d,'CONFIRMATION_REQUIRED','Confirme os adiantamentos, provisões e a integração da folha.',400);
 if(p.source_fingerprint!==body.source_fingerprint)
  stop121(d,'SOURCE_CHANGED','Lançamentos, documentos, provisões ou folha mudaram; reabra a prévia.');
 if(!p.ready)stop121(d,'NOT_READY',p.problems[0]?.message||'Conciliação incompleta.');
 const proof=String(body.bank_statement_reference||'').trim();
 if(proof.length<12||proof.length>240)
  stop121(d,'BANK_PROOF_REQUIRED','Informe referência de extrato bancário que comprove os adiantamentos.',400);
 const old=await env.DB.prepare("SELECT id FROM journal_entries WHERE company_id=? AND source_module='PAYROLL' AND source_reference=? LIMIT 1").bind(companyId,'MONTHLY:'+runId).first();
 if(old)stop121(d,'ALREADY_JOURNAL','Já existe diário com origem mensal para esta folha.');
 const detail=await d.monthlyRunDetail(env,companyId,runId);
 const journal=await d.buildInternalPostedEntry(env,auth,companyId,{
  batch_id:p.accounting_batch_id,entry_date:p.competence+'-'+String(new Date(Date.UTC(+p.competence.slice(0,4),+p.competence.slice(5,7),0)).getUTCDate()).padStart(2,'0'),
  document_number:'FOLHA-FERIAS-'+p.competence,
  description:'Folha com férias conciliadas '+p.competence+' / baixa de provisões e adiantamentos conferidos',
  source_module:'PAYROLL',source_reference:'MONTHLY:'+runId,
  lines:p.lines.map(l=>({
   side:l.side,account_id:l.account_id,amount:d.centsToMoney(l.amount_cents),
   cost_center_id:l.cost_center_id,branch_id:l.branch_id||null,history_template_id:l.history_template_id||null,
   history_complement:'Folha e férias '+p.competence+' - '+l.event_code+' - CC '+(l.cost_center_code||'')
  }))
 });
 if(journal.total_cents!==p.accounting_total_cents)stop121(d,'JOURNAL_CHANGED','O diário montado difere do cálculo.');
 const first=await d.nextPayableNumber(env,companyId),number=Number(first.slice(3));
 if(!Number.isSafeInteger(number)||number<1||number+p.payable_count-1>999999)
  stop121(d,'NUMBER_OVERFLOW','Numeração de títulos inválida.');
 const stmts=[...journal.stmts],ids=[];let total=0;
 for(const e of detail.envelopes){
  if(!Number(e.net_cents))continue;
  const id=d.uuid(),idx=ids.length,amount=Number(e.net_cents);
  ids.push(id);total+=amount;
  stmts.push(env.DB.prepare("INSERT INTO financial_payables(id,company_id,number,supplier_id,source_type,source_id,issue_date,due_date,document_number,description,amount_cents,balance_cents,status,created_by) VALUES(?,?,?,?,'PAYROLL_MONTHLY',?,?,?,?,?,?,?,'OPEN',?)")
   .bind(id,companyId,'CP-'+String(number+idx).padStart(6,'0'),e.employee_id,
    runId+':'+e.employee_id,p.competence+'-'+String(new Date(Date.UTC(+p.competence.slice(0,4),+p.competence.slice(5,7),0)).getUTCDate()).padStart(2,'0'),
    detail.run.payment_date,'FOLHA-FERIAS-'+p.competence,
    'Líquido residual da folha com férias '+p.competence+' — '+String(e.employee_code||'')+' '+e.employee_name,amount,amount,auth.user.id));
  stmts.push(env.DB.prepare("INSERT INTO payroll_finance_payables37(payable_id,company_id,run_id,employee_id) VALUES(?,?,?,?)")
   .bind(id,companyId,runId,e.employee_id));
 }
 if(total!==p.financial_total_cents||ids.length!==p.payable_count||stmts.length>220)
  stop121(d,'TOTAL_OR_LIMIT','Títulos divergentes do líquido residual ou limite de partidas excedido.');
 const postingIndex=stmts.length;
 stmts.push(env.DB.prepare("INSERT INTO payroll_finance_postings37(run_id,company_id,source_fingerprint,journal_entry_id,payable_count,payable_total_cents,posted_by) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM payroll_calc_runs WHERE company_id=? AND id=? AND source_fingerprint=? AND status='APPROVED')")
  .bind(runId,companyId,detail.run.source_fingerprint,journal.entryId,ids.length,total,auth.user.id,
   companyId,runId,detail.run.source_fingerprint));
 const integrationIndex=stmts.length;
 stmts.push(env.DB.prepare("INSERT INTO payroll_vacation_integrations121(run_id,company_id,source_fingerprint,journal_entry_id,advance_evidence_reference,source_summary_json,posted_by) VALUES(?,?,?,?,?,?,?)")
  .bind(runId,companyId,p.source_fingerprint,journal.entryId,proof,
    JSON.stringify({run_id:runId,reclassifications:p.provisional_reclassifications,payables:ids,
     accounting_total_cents:p.accounting_total_cents,net_total_cents:total}),auth.user.id));
 if(stmts.length>220)stop121(d,'TRANSACTION_LIMIT','Número de partidas superior ao permitido.');
 try{
  const completed=await env.DB.batch(stmts);
  if(completed.some(s=>s.success===false)||Number(completed[postingIndex]?.meta?.changes)!==1||
     Number(completed[integrationIndex]?.meta?.changes)!==1)
   stop121(d,'POSTING_FAILED','A origem da folha ou da integração não foi gravada. Verifique as partidas.');
 }catch(e){
  if(/UNIQUE|FOREIGN KEY|constraint failed/i.test(String(e)))
   stop121(d,'CONCURRENT_POSTING','Folha ou vínculo atualizado por outra operação. Consulte novamente.');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'INTEGRATE',
  entity:'payroll_vacation_integrations121',entityId:runId,
  after:{journal_entry_id:journal.entryId,total_cents:total,payable_count:ids.length,
   reclassified_cents:p.provisional_reclassifications.reduce((a,x)=>a+x.amount_cents,0),
   external_advance_proof:proof}});
 return {integrated:true,run_id:runId,journal_entry_id:journal.entryId,
  financial_generated:true,accounting_posted:true,payable_count:ids.length,
  residual_net_cents:total,advances_repaid:false,provision_use_created:false,
  external_advance_bank_reference:proof,paid:false};
}
