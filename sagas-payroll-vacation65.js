// SAGAS Folha v103 — memória auditável das partidas contábeis de férias.
// Não registra lançamentos contábeis, títulos, baixas, pagamentos nem guias.
import { payrollVacationAccounting64 } from './sagas-payroll-vacation64.js';
import { payrollVacationAdvanceEvidence66 } from './sagas-payroll-vacation66.js';

function stop65(d,code,message,status=409){throw new d.HttpError(status,message,code)}
function amount65(v,d,what){
 const n=Number(v);
 if(!Number.isSafeInteger(n)||n<0||n>99999999999)stop65(d,'AMOUNT_INVALID','Valor inválido em '+what);
 return n;
}
function issue65(out,code,message,id=null){
 if(!out.some(p=>p.code===code&&p.employee_id===id))
  out.push({code,message,employee_id:id});
}
export async function payrollVacationPostingSchema65(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_accounting_packages65 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,run_id TEXT NOT NULL REFERENCES payroll_calc_runs(id) ON DELETE RESTRICT,source_fingerprint TEXT NOT NULL,snapshot_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('RECORDED','VOID')),created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,voided_by TEXT,voided_at TEXT,void_reason TEXT)"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_vac_accounting_package65 ON payroll_vacation_accounting_packages65(company_id,run_id) WHERE status='RECORDED'"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_vac_accounting_package65_company ON payroll_vacation_accounting_packages65(company_id,run_id)")
 ]);
}
async function package65(env,companyId,runId){
 const row=await env.DB.prepare("SELECT id,source_fingerprint,snapshot_json,created_at,created_by FROM payroll_vacation_accounting_packages65 WHERE company_id=? AND run_id=? AND status='RECORDED' LIMIT 1").bind(companyId,runId).first();
 return row?{id:row.id,source_fingerprint:row.source_fingerprint,created_at:row.created_at,created_by:row.created_by}:null;
}
async function build65(c){
 const {env,companyId,runId,d}=c;
 const check=await payrollVacationAccounting64(c);
 if(!check.applicable)return {applicable:false,run:check.run,note:check.note};
 const problems=[...(check.problems||[])],warnings=[...(check.warnings||[])];
 const add=(code,message,id)=>issue65(problems,code,message,id);
 const run=check.run;
 const evidence=(await env.DB.prepare(
  "SELECT r.id,r.source_fingerprint,r.status,r.revision,r.payment_date,r.competence_id,c.competence FROM payroll_calc_runs r JOIN payroll_competences c ON c.company_id=r.company_id AND c.id=r.competence_id WHERE r.company_id=? AND r.id=? AND r.process_kind='MONTHLY'"
 ).bind(companyId,runId).first());
 if(!evidence||!String(evidence.source_fingerprint||'').startsWith('VACATION100:'))
  stop65(d,'SOURCE_INVALID','O processamento mensal não possui origem de férias v100.');
 if(!['REVIEWED','APPROVED'].includes(evidence.status))
  add('FOLHA_SEM_REVISAO','Revise a competência antes de preparar partidas.');
 const detail=await d.monthlyRunDetail(env,companyId,runId);
 const allowedEmployees=new Set(check.items.map(x=>x.employee_id));
 const posted=await env.DB.prepare("SELECT p.journal_entry_id,p.payable_count,j.status AS journal_status FROM payroll_finance_postings37 p LEFT JOIN journal_entries j ON j.company_id=p.company_id AND j.id=p.journal_entry_id WHERE p.company_id=? AND p.run_id=? LIMIT 1").bind(companyId,runId).first();
 if(posted)add('CONTABILIZACAO_EXISTENTE','A folha possui uma integração contábil/financeira, lançamento '+String(posted.journal_entry_id||'')+'.');
 const eventCatalog=(await env.DB.prepare(
  "SELECT e.id,e.code,e.event_type,e.active,m.nature_id,n.code AS nature_code,n.synthetic_analytic,n.active AS nature_active FROM payroll_events e LEFT JOIN payroll_event_natures39 m ON m.company_id=e.company_id AND m.event_id=e.id LEFT JOIN budget_natures n ON n.company_id=e.company_id AND n.id=m.nature_id WHERE e.company_id=?"
 ).bind(companyId).all()).results||[];
 const events=new Map(eventCatalog.map(e=>[e.code,e]));
 const centerCache=new Map(),defaultCache=new Map(),accountCache=new Map();
 const lines=[],byEvent=new Map();
 let sumPayables=0,sumCredits=0,sumDebits=0;
 for(const envelope of detail.envelopes||[]){
  const empId=envelope.employee_id;
  const net=amount65(envelope.net_cents,d,'líquido da folha');
  sumPayables+=net;
  const ccId=envelope.cost_center_id;
  if(!centerCache.has(ccId)){
   const center=ccId?await env.DB.prepare("SELECT id,code,name,active FROM cost_centers WHERE company_id=? AND id=?").bind(companyId,ccId).first():null;
   centerCache.set(ccId,center||null);
  }
  const center=centerCache.get(ccId);
  if(!center||Number(center.active)!==1){
   add('CENTRO_CUSTO_INVALIDO','Centro de custo ausente/inativo do funcionário '+(envelope.employee_code||empId),empId);
   continue;
  }
  // Todas as rubricas da folha são incluídas, não apenas as de férias.
  // Com isso o débito/crédito esperado corresponde à integração MONTHLY integral.
  for(const line of envelope.lines||[]){
   const n=amount65(line.amount_cents,d,'rubrica '+line.event_code);
   if(n===0||line.line_type==='INFORMATIVO'&&line.event_code!=='FGTS_PATRONAL')continue;
   const event=events.get(line.event_code);
   if(!event||event.event_type!==line.line_type||Number(event.active)!==1){
    add('EVENTO_INVALIDO','Evento '+line.event_code+' sem cadastro ativo compatível.',empId);continue;
   }
   if(!event.nature_id||event.synthetic_analytic!=='ANALYTIC'||Number(event.nature_active)!==1){
    add('NATUREZA_INVALIDA','Evento '+line.event_code+' sem natureza orçamentária analítica ativa.',empId);continue;
   }
   if(!defaultCache.has(event.nature_id)){
    const ds=(await env.DB.prepare(
     "SELECT d.side,d.account_id,d.percentage,d.branch_id,d.cost_center_id,d.history_template_id,d.history_complement FROM budget_nature_accounts d WHERE d.company_id=? AND d.nature_id=? ORDER BY d.created_at,d.id"
    ).bind(companyId,event.nature_id).all()).results||[];
    defaultCache.set(event.nature_id,ds);
   }
   const defaults=defaultCache.get(event.nature_id);
   const staged=[];let complete=true;
   for(const side of ['D','C']){
    const matches=defaults.filter(x=>x.side===side);
    const specific=matches.filter(x=>x.cost_center_id===ccId);
    const selected=specific.length?specific:matches.filter(x=>!x.cost_center_id);
    const pct=selected.map(x=>Number(x.percentage));
    if(!selected.length||pct.some(x=>!Number.isFinite(x)||x<=0||x>100)||
      Math.abs(pct.reduce((a,b)=>a+b,0)-100)>0.0001){
     add('DEFAULT_INCOMPLETO','Natureza '+event.nature_code+' sem débito/crédito '+side+' totalizando 100% para '+center.code+'.',empId);
     complete=false;continue;
    }
    let used=0;
    for(let i=0;i<selected.length;i++){
     const row=selected[i];
     const value=i===selected.length-1?n-used:Math.round(n*pct[i]/100);
     used+=value;
     if(value<=0){add('RATEIO_ZERO','Natureza '+event.nature_code+' gera parcela contábil nula.',empId);complete=false;continue;}
     if(!accountCache.has(row.account_id)){
      const acct=await env.DB.prepare("SELECT id,code,name,active,analytic FROM accounts WHERE company_id=? AND id=?").bind(companyId,row.account_id).first();
      accountCache.set(row.account_id,acct||null);
     }
     const acct=accountCache.get(row.account_id);
     if(!acct||Number(acct.active)!==1||Number(acct.analytic)!==1){
      add('CONTA_INVALIDA','Conta analítica inexistente/inativa na natureza '+event.nature_code+'.',empId);
      complete=false;continue;
     }
     staged.push({side,account_id:acct.id,account_code:acct.code,amount_cents:value,
      nature_id:event.nature_id,nature_code:event.nature_code,
      employee_id:empId,employee_code:envelope.employee_code,
      cost_center_id:ccId,cost_center_code:center.code,event_code:line.event_code,
      branch_id:row.branch_id||null,history_template_id:row.history_template_id||null});
    }
   }
   if(!complete)continue;
   lines.push(...staged);
   const key=empId+'|'+line.event_code+'|'+center.code;
   byEvent.set(key,(byEvent.get(key)||0)+n);
  }
 }
 if(detail.envelopes.length>90)add('LIMITE_FUNCIONARIOS','Integração existente limita-se a 90 funcionários por lote.');
 if(lines.length>150)add('LIMITE_PARTIDAS','Quantidade de partidas supera o limite seguro da integração existente.');
 sumDebits=lines.filter(x=>x.side==='D').reduce((n,x)=>n+x.amount_cents,0);
 sumCredits=lines.filter(x=>x.side==='C').reduce((n,x)=>n+x.amount_cents,0);
 if(!Number.isSafeInteger(sumPayables)||!Number.isSafeInteger(sumDebits)||!Number.isSafeInteger(sumCredits)||sumCredits!==sumDebits)
  add('PARTIDAS_NAO_CONCILIADAS','Débitos e créditos esperados não conciliam.');
 // Baixas de provisões já contabilizadas: verificar o diário real, não apenas o vínculo.
 const sources=[];
 for(const emp of check.items){
  const cc=emp.center||null;
  const known=allowedEmployees.has(emp.employee_id);
  if(!known)continue;
  const components=[];
  for(const obj of emp.provisions||[]){
   const postedUses=(obj.provision?.movements||[]).filter(x=>x.kind==='USE'&&x.accounting_posted);
   const postedIds=postedUses.map(x=>x.movement_id);
   const journalRows=postedIds.length?(await env.DB.prepare(
    "SELECT p.movement_id,p.posting_id,j.id AS journal_entry_id,j.status,j.total_debit_cents,j.total_credit_cents FROM payroll_provision_posted_movements45 p JOIN payroll_provision_postings45 z ON z.company_id=p.company_id AND z.id=p.posting_id JOIN journal_entries j ON j.company_id=z.company_id AND j.id=z.journal_entry_id WHERE p.company_id=? AND p.movement_id IN ("+postedIds.map(()=>'?').join(',')+")"
   ).bind(companyId,...postedIds).all()).results||[]:[];
   if(journalRows.length!==postedUses.length||journalRows.some(x=>x.status!=='POSTED'||Number(x.total_debit_cents)!==Number(x.total_credit_cents)))
    add('BAIXA_CONTABIL_INVALIDA','Existe baixa vinculada a lançamento contábil ausente, anulado ou desequilibrado.',emp.employee_id);
   if((obj.provision?.unposted_use_cents||0)>0)
    add('BAIXA_NAO_CONTABILIZADA','Baixa de '+obj.component+' registrada operacionalmente, mas sem lançamento contábil.',emp.employee_id);
   const journalId=[...new Set(journalRows.map(x=>x.journal_entry_id))];
   components.push({component:obj.component,earned_cents:obj.earned_cents,
    operational_balance_cents:obj.provision?.remaining_operational_cents??null,
    used_cents:obj.provision?.used_cents??null,
    posted_use_cents:obj.provision?.posted_use_cents??null,
    unposted_use_cents:obj.provision?.unposted_use_cents??null,
    recognized_journal_entry_ids:journalId,recognized_movement_ids:postedIds,
    verified_posted:journalRows.length===postedUses.length&&!journalRows.some(x=>x.status!=='POSTED')});
  }
  const advanceEvidence=await payrollVacationAdvanceEvidence66(env,companyId,emp.occurrence_id,d);
  if(!advanceEvidence.payment_verified)
    add('ADIANTAMENTO_SEM_BAIXA_VALIDADA','O adiantamento externo não está vinculado a um título PAID com baixa contábil bancária validada.',emp.employee_id);
  sources.push({employee_id:emp.employee_id,cost_center:cc,advance:emp.advance,
   advance_evidence:advanceEvidence,month:emp.current_competence,components});
 }
 const sumCheck=check.sums||{};
 if(sumPayables!==Number(detail.totals.net_cents))
  add('LIQUIDO_FOLHA_DIVERGENTE','O líquido dos envelopes diverge do total da folha.');
 // Vinculo validado confirma apenas os registros internos do financeiro.
 // Extrato bancário externo ainda exige reconciliação independente.
 if(sources.some(x=>!x.advance_evidence.payment_verified))
  warnings.push('Falta conciliação interna da baixa financeira de um ou mais adiantamentos de férias.');
 warnings.push('Um título PAID vinculado comprova registro interno da baixa e sua partida bancária, não a confirmação por extrato externo.');
 if(sources.some(x=>x.components.some(c=>c.unposted_use_cents>0)))
  warnings.push('Regularize as baixas de provisão já existentes antes de criar novas partidas.');
 warnings.push('Esta memória contém partidas previstas por evento e CC. Ainda não distingue automaticamente realização de provisão e despesa sem conferir o diário já contabilizado.');
 const fingerprint=await d.hash({version:103,company_id:companyId,run_id:runId,
   source_fingerprint:evidence.source_fingerprint,stage:check.items.map(x=>({
     employee_id:x.employee_id,occurrence_id:x.occurrence_id,stage_id:x.stage_id,
     advance:x.advance,provisions:x.provisions})),
   lines,source_journals:sources.map(x=>({id:x.employee_id,components:x.components}))});
 return {applicable:true,kind:'VACATION_ACCOUNTING_PACKAGE_V103',
  run:{id:runId,competence:evidence.competence,status:evidence.status,revision:evidence.revision,source_fingerprint:evidence.source_fingerprint},
  sources,lines,problems,warnings,
  sums:{monthly_net_cents:sumPayables,debit_cents:sumDebits,credit_cents:sumCredits,
   compensated_gross_cents:Number(sumCheck.compensated_gross_cents||0)},
  fingerprint,employee_count:detail.envelopes.length,
  ready_to_record:true,ready_for_accounting:false,ready_for_finance:false,
  confirmed_external_payment:false,read_only:true,
  note:'Partidas calculadas e conciliadas para preparação; NÃO cria lançamento, título, baixa de provisão, transferência ou guia.'};
}
export async function payrollVacationPosting65(action,c){
 const {env,companyId,auth,request,runId,d,body={}}=c;
 if(!['read','record','void'].includes(action))stop65(d,'NOT_FOUND','Ação inexistente.',404);
 await d.requirePermission(env,auth.user.id,companyId,action==='read'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-vacation-accounting-package65',1,()=>payrollVacationPostingSchema65(env));
 const run=String(runId||body.run_id||'').trim();
 if(!run||run.length>128)stop65(d,'INVALID_RUN','Informe um processamento válido.',400);
 const current=await package65(env,companyId,run);
 if(action==='void'){
  if(!current)stop65(d,'PACKAGE_NOT_FOUND','Não existe conferência ativa para anular.',404);
  if(body.confirmation!=='ANULAR CONFERENCIA FERIAS')
   stop65(d,'CONFIRMATION_REQUIRED','Confirme digitando ANULAR CONFERENCIA FERIAS.',400);
  const note=String(body.notes||'').trim();
  if(note.length<15||note.length>600)stop65(d,'INVALID_NOTES','Informe motivo entre 15 e 600 caracteres.',400);
  const changed=await env.DB.prepare(
   "UPDATE payroll_vacation_accounting_packages65 SET status='VOID',voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=? WHERE company_id=? AND id=? AND status='RECORDED'"
  ).bind(auth.user.id,note,companyId,current.id).run();
  if(Number(changed?.meta?.changes)!==1)stop65(d,'VERSION_CONFLICT','A conferência foi alterada. Atualize.');
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'VOID',entity:'payroll_vacation_accounting_packages65',entityId:current.id,after:{reason:note}});
  return {voided:true,ready_for_accounting:false};
 }
 const preview=await build65({...c,runId:run});
 if(action==='read')return {...preview,recorded:current,
  recorded_current:!!current&&current.source_fingerprint===preview.fingerprint};
 if(!preview.applicable)stop65(d,'NOT_APPLICABLE','A folha não possui férias integradas.');
 if(body.expected_fingerprint!==preview.fingerprint)
  stop65(d,'SOURCE_CHANGED','Dados ou partidas alterados desde a prévia. Consulte novamente.');
 if(current){
  if(current.source_fingerprint===preview.fingerprint)return {recorded:true,reused:true,package_id:current.id,
   ready_for_accounting:false};
  stop65(d,'STALE_PACKAGE','A conferência existente não corresponde às fontes atuais. Anule e refaça.');
 }
 if(body.confirmation!=='REGISTRAR CONFERENCIA FERIAS')
  stop65(d,'CONFIRMATION_REQUIRED','Confirme digitando REGISTRAR CONFERENCIA FERIAS.',400);
 if(preview.problems.some(p=>['PARTIDAS_NAO_CONCILIADAS','LIQUIDO_FOLHA_DIVERGENTE',
   'ORIGENS_INCOMPLETAS','FUNCIONARIOS_INCOMPLETOS','FOLHA_NAO_REVISADA'].includes(p.code)))
  stop65(d,'ACCOUNTING_SOURCE_INVALID','Corrija as divergências estruturais antes de registrar a conferência.');
 const id=d.uuid();
 try{
  const result=await env.DB.prepare(
   "INSERT INTO payroll_vacation_accounting_packages65(id,company_id,run_id,source_fingerprint,snapshot_json,status,created_by) SELECT ?,?,?,?,?, 'RECORDED',? WHERE EXISTS(SELECT 1 FROM payroll_calc_runs WHERE company_id=? AND id=? AND source_fingerprint=? AND status IN ('REVIEWED','APPROVED'))"
  ).bind(id,companyId,run,preview.fingerprint,JSON.stringify(preview),auth.user.id,
    companyId,run,preview.run.source_fingerprint||'').run();
  if(Number(result?.meta?.changes)!==1)stop65(d,'RUN_CHANGED','Processamento foi alterado. Consulte novamente.');
 }catch(e){
  if(/UNIQUE|constraint failed/i.test(String(e)))stop65(d,'PACKAGE_CONFLICT','Conferência já registrada por outra operação.');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'CREATE',entity:'payroll_vacation_accounting_packages65',entityId:id,
  after:{run_id:run,fingerprint:preview.fingerprint,problem_count:preview.problems.length,accounting_posted:false}});
 return {recorded:true,reused:false,package_id:id,
  problems:preview.problems,ready_for_accounting:false,ready_for_finance:false};
}
