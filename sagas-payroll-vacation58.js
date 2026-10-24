// SAGAS Folha v96 — GRAVAÇÃO de envelope próprio de férias (process_kind VACATION).
// Não modifica os envelopes MONTHLY nem cria contas a pagar, pagamentos ou partidas.
import { payrollVacation55 } from './sagas-payroll-vacation55.js';
import { payrollVacation56 } from './sagas-payroll-vacation56.js';

function reject58(d,message,code='VACATION_ENVELOPE_PENDING',status=409){throw new d.HttpError(status,message,code)}
function amount58(n,name,d){
 if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>99999999999)
  reject58(d,'Valor monetário inválido para '+name+'.','VACATION_VALUE_INVALID');
 return n;
}
const PARTS58=[
 ['FERIAS_GOZO','Férias gozadas','PROVENTO','vacation_cents'],
 ['TERCO_FERIAS','Terço constitucional de férias','PROVENTO','third_cents'],
 ['ABONO_FERIAS','Abono pecuniário de férias','PROVENTO','abono_cents'],
 ['TERCO_ABONO_FERIAS','Terço sobre abono de férias','PROVENTO','abono_third_cents'],
 ['INSS_FERIAS','INSS retido no recibo de férias','DESCONTO','receipt_inss_cents'],
 ['IRRF_FERIAS','IRRF retido no recibo de férias','DESCONTO','receipt_irrf_cents']
];
export async function payrollVacationSchema58(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_envelope_links58 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,occurrence_id TEXT NOT NULL REFERENCES payroll_employee_occurrences(id) ON DELETE RESTRICT,reconciliation_id TEXT NOT NULL REFERENCES payroll_vacation_reconciliations55(id) ON DELETE RESTRICT,run_id TEXT NOT NULL UNIQUE REFERENCES payroll_calc_runs(id) ON DELETE RESTRICT,envelope_id TEXT NOT NULL UNIQUE REFERENCES payroll_calc_envelopes(id) ON DELETE RESTRICT,source_fingerprint TEXT NOT NULL,snapshot_json TEXT NOT NULL,center_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('ACTIVE','VOID')),created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,voided_by TEXT,voided_at TEXT,void_reason TEXT)"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_vacation_envelope58 ON payroll_vacation_envelope_links58(company_id,occurrence_id) WHERE status='ACTIVE'"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_payroll_vacation_envelope58 ON payroll_vacation_envelope_links58(company_id,employee_id,status)")
 ]);
}
async function active58(env,companyId,occurrenceId){
 return await env.DB.prepare("SELECT id,employee_id,occurrence_id,reconciliation_id,run_id,envelope_id,source_fingerprint,snapshot_json,center_id,status,created_at FROM payroll_vacation_envelope_links58 WHERE company_id=? AND occurrence_id=? AND status='ACTIVE' LIMIT 1").bind(companyId,occurrenceId).first();
}
function lines58(plan,d){
 const periods=plan?.periods||[];
 if(!periods.length||periods.length>3)reject58(d,'Plano de férias sem competências válidas.','VACATION_PLAN_INVALID');
 const sumField=key=>periods.reduce((total,p)=>total+amount58(p[key],key,d),0);
 const figures={
  vacation_cents:sumField('remuneration_cents'),
  third_cents:sumField('constitutional_third_cents'),
  abono_cents:amount58(plan.abono_cents,'abono',d),
  abono_third_cents:amount58(plan.abono_third_cents,'terço do abono',d),
  receipt_inss_cents:amount58(plan.receipt_inss_cents,'INSS do recibo',d),
  receipt_irrf_cents:amount58(plan.receipt_irrf_cents,'IRRF do recibo',d)
 };
 const gross=amount58(plan.gross_cents,'bruto de férias',d),paid=amount58(plan.external_paid_cents,'pagamento externo',d),
  other=amount58(plan.receipt_other_cents,'outros descontos',d);
 if(other>0)reject58(d,'O recibo contém outros descontos: classifique cada rubrica antes de gravar envelope.','OTHER_RECEIPT_DEDUCTIONS');
 const credits=figures.vacation_cents+figures.third_cents+figures.abono_cents+figures.abono_third_cents,
  discounts=figures.receipt_inss_cents+figures.receipt_irrf_cents;
 if(credits!==gross||gross-discounts!==paid||paid<=0)
  reject58(d,'Recibo de férias não fecha em bruto, descontos e pagamento.','RECEIPT_NOT_BALANCED');
 if(figures.vacation_cents+figures.third_cents!==amount58(plan.vacation_gross_cents,'gozo bruto',d))
  reject58(d,'Verbas de férias por competência não fecham com o recibo.','VACATION_GROSS_MISMATCH');
 const list=PARTS58.filter(r=>figures[r[3]]>0).map(([event_code,event_name,line_type,key])=>({
  event_code,event_name,line_type,amount_cents:figures[key],reference_text:
   line_type==='DESCONTO'?'Desconto do recibo de férias conciliado':'Recibo de férias — processo próprio'
 }));
 return {gross_cents:gross,deductions_cents:discounts,net_cents:paid,figures,lines:list};
}
async function source58(c){
 const {env,companyId,auth,request,id,d}=c;
 const problems=[],add=(code,msg)=>{if(!problems.some(x=>x.code===code&&x.message===msg))problems.push({code,message:msg})};
 const reconciliation=await payrollVacation55('read',{env,companyId,auth,request,occurrenceId:id,body:{},d});
 if(!reconciliation.active||!reconciliation.reconciled?.plan){
  add('RECIBO_NAO_CONCILIADO','Conclua a conciliação do recibo na v93.');
  return {problems,reconciliation,ready:false};
 }
 if(reconciliation.stale)add('CONCILIACAO_OBSOLETA','Origem, recibo ou competências mudaram desde a conciliação.');
 for(const problem of reconciliation.blockers||[])if(problem.code!=='PAGAMENTO_FORA_DO_PRAZO')add(problem.code,problem.message);
 const plan=reconciliation.reconciled.plan,employeeId=plan.employee?.id;
 if(!employeeId||plan.occurrence_id!==id)
  add('PLANO_INCONSISTENTE','Funcionário ou ocorrência do recibo não conferem.');
 let amounts=null;try{amounts=lines58(plan,d)}catch(e){add(e.code||'VALORES_DIVERGENTES',e.message)}
 const advance=reconciliation.advance;
 if(!advance?.id||advance.processing_id!==reconciliation.processing_id)
  add('ADIANTAMENTO_PENDENTE','Adiantamento externo não corresponde ao processamento conciliado.');
 if(advance&&Number(advance.amount_cents)!==Number(plan.external_paid_cents))
  add('ADIANTAMENTO_DIVERGENTE','O valor do pagamento externo foi alterado após a conciliação do recibo.');
 if(advance&&String(advance.date||'').slice(0,7).length!==7)
  add('DATA_PAGAMENTO','Data do pagamento externo inválida.');
 const month=String(advance?.date||'').slice(0,7);
 const competence=month?await env.DB.prepare("SELECT id,competence,status FROM payroll_competences WHERE company_id=? AND competence=? LIMIT 1").bind(companyId,month).first():null;
 if(!competence||competence.status!=='OPEN')add('COMPETENCIA_PAGAMENTO','Competência do pagamento externo inexistente ou fechada: '+month+'.');
 const employee=await env.DB.prepare("SELECT e.cost_center_id,cc.code AS cost_center_code FROM payroll_employees e LEFT JOIN cost_centers cc ON cc.id=e.cost_center_id AND cc.company_id=e.company_id WHERE e.company_id=? AND e.id=? LIMIT 1").bind(companyId,employeeId).first();
 let center=null;
 if(!employee?.cost_center_id)add('CENTRO_CUSTO_PENDENTE','O funcionário está sem centro de custo para o registro.');
 else{
  try{center=await d.validateCenter(env,companyId,employee.cost_center_id)}
  catch(e){add('CENTRO_CUSTO_INVALIDO',e.message)}
 }
 // O cálculo da v95 já verifica ocorrências, movimentos manuais, reajustes,
 // revisão mensal, centro de custo e as competências de gozo.
 let monthly=null;
 try{
  monthly=await payrollVacation56('prepare',{env,companyId,auth,request,occurrenceId:id,body:{},d});
  if(!monthly.prepared)add('PREVIA_MENSAL_PENDENTE',monthly.note||'Sem prévia de férias.');
  for(const issue of monthly.blockers||[])add('PREVIA_'+issue.code,(issue.competence||'')+' '+issue.message);
 }catch(e){add(e.code||'PREVIA_MENSAL_PENDENTE',e.message)}
 const rows=(await env.DB.prepare("SELECT e.id,e.code,e.name,e.event_type,e.reference_unit,e.active,m.nature_id,n.code AS nature_code,n.active AS nature_active,n.synthetic_analytic AS nature_type FROM payroll_events e LEFT JOIN payroll_event_natures39 m ON m.company_id=e.company_id AND m.event_id=e.id LEFT JOIN budget_natures n ON n.company_id=e.company_id AND n.id=m.nature_id WHERE e.company_id=? AND e.code IN ('FERIAS_GOZO','TERCO_FERIAS','ABONO_FERIAS','TERCO_ABONO_FERIAS','INSS_FERIAS','IRRF_FERIAS')").bind(companyId).all()).results||[];
 const configured=(amounts?.lines||[]).map(line=>{
  const event=rows.find(x=>x.code===line.event_code),ok=!!event&&Number(event.active)===1&&event.event_type===line.line_type&&event.reference_unit==='VALOR',
   nature=ok&&!!event.nature_id&&Number(event.nature_active)===1&&event.nature_type==='ANALYTIC';
  if(!ok)add('EVENTO_INVALIDO','Rubrica '+line.event_code+' precisa existir ativa, com tipo/unidade corretos.');
  else if(!nature)add('NATUREZA_AUSENTE','Configure natureza orçamentária analítica no evento '+line.event_code+'.');
  return {...line,event_id:ok?event.id:null,nature_id:nature?event.nature_id:null,nature_code:nature?event.nature_code:null}
 });
 const fingerprint=await d.hash({
  version:58,occurrence_id:id,reconciliation_id:reconciliation.reconciled.id,
  reconciliation_recorded_at:reconciliation.reconciled.recorded_at,
  plan,advance_id:advance?.id,payment_date:advance?.date,
  payroll_monthly_signature:monthly?.fingerprint||null,
  competence_id:competence?.id,competence_status:competence?.status,
  cost_center_id:center?.id,event_settings:configured.map(x=>[x.event_code,x.event_id,x.nature_id])
 });
 return {problems,ready:problems.length===0,plan,amounts,advance,monthly,
  center,employee,competence,configured,fingerprint,reconciliation};
}
export async function payrollVacationEnvelope58(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 if(!['read','record','void'].includes(action))reject58(d,'Operação não reconhecida.','NOT_FOUND',404);
 await d.requirePermission(env,auth.user.id,companyId,action==='read'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-vacation-envelope58',1,()=>payrollVacationSchema58(env));
 const occurrenceId=String(action==='read'?c.occurrenceId||'':body.occurrence_id||'').trim();
 if(!occurrenceId||occurrenceId.length>128)reject58(d,'Informe a ocorrência de férias.','INVALID_OCCURRENCE',400);
 const old=await active58(env,companyId,occurrenceId);
 if(action==='void'){
  if(!old)reject58(d,'Não existe envelope de férias ativo.','NOT_FOUND',404);
  if(body.confirmation!=='ANULAR ENVELOPE FERIAS')
   reject58(d,'Confirme digitando ANULAR ENVELOPE FERIAS.','CONFIRMATION_REQUIRED',400);
  const note=String(body.notes||'').trim();
  if(note.length<15||note.length>600)reject58(d,'Informe justificativa de anulação entre 15 e 600 caracteres.','INVALID_NOTES',400);
  const row=await env.DB.prepare("SELECT status FROM payroll_calc_runs WHERE company_id=? AND id=? AND process_kind='VACATION' LIMIT 1").bind(companyId,old.run_id).first();
  if(!row||row.status!=='CALCULATED')reject58(d,'Envelope não está no estado CALCULATED; não permite anulação por esta tela.','RUN_LOCKED');
  const posting=await env.DB.prepare("SELECT run_id FROM payroll_finance_postings37 WHERE company_id=? AND run_id=? LIMIT 1").bind(companyId,old.run_id).first();
  if(posting)reject58(d,'Envelope já possui integração financeira/contábil. Estorno formal é necessário.','POSTING_LOCKED');
  const changes=await env.DB.batch([
   env.DB.prepare("UPDATE payroll_calc_runs SET status='VOID' WHERE id=? AND company_id=? AND process_kind='VACATION' AND status='CALCULATED'").bind(old.run_id,companyId),
   env.DB.prepare("UPDATE payroll_vacation_envelope_links58 SET status='VOID',voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=? WHERE id=? AND company_id=? AND status='ACTIVE'").bind(auth.user.id,note,old.id,companyId)
  ]);
  if(changes.some(x=>x.meta?.changes!==1))reject58(d,'Envelope modificado durante a anulação. Recarregue.','VERSION_CONFLICT');
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'VOID',entity:'payroll_vacation_envelope_links58',entityId:old.id,
   before:{status:'ACTIVE',run_id:old.run_id},after:{status:'VOID',reason:note}});
  return {voided:true,run_id:old.run_id,warning:'Anulação preserva o histórico dos eventos; não estorna pagamentos ou contabilidade.'};
 }
 const src=await source58({...c,id:occurrenceId});
 let snapshot=old?JSON.parse(old.snapshot_json):null;
 const stale=!!old&&old.source_fingerprint!==src.fingerprint;
 if(action==='read')return {
  status:old?'ENVELOPE_FERIAS_GRAVADO':'AGUARDANDO_GRAVACAO',
  active:!!old,stale,employee:src.plan?.employee||snapshot?.employee||null,occurrence_id:occurrenceId,
  payment_date:src.advance?.date||snapshot?.payment_date||null,
  amount:src.amounts||snapshot?.amounts||null,configured_events:src.configured||[],
  payment_competence:src.competence?.competence||snapshot?.competence||null,
  cost_center_code:src.center?.code||snapshot?.cost_center_code||null,
  fingerprint:src.fingerprint,ready_for_record:!old&&src.ready,
  problems:src.problems,
  recorded:old?{id:old.id,run_id:old.run_id,envelope_id:old.envelope_id,
   created_at:old.created_at,snapshot}:null,
  ready_for_monthly_posting:false,ready_for_finance:false,ready_for_accounting:false,
  warning:'Envelope próprio VACATION, somente calculado. A folha mensal, pagamento, financeiro e contabilização não são alterados.'};
 if(old)reject58(d,'Já existe envelope ativo para estas férias. Anule-o antes de refazer.','ENVELOPE_ALREADY_EXISTS');
 if(!src.ready||!src.amounts||!src.competence||!src.center)
  reject58(d,'Há pendências no recibo, nas naturezas, centro de custo ou competências.','ENVELOPE_NOT_READY');
 if(body.expected_fingerprint!==src.fingerprint)
  reject58(d,'Os dados do recibo ou parâmetros foram alterados. Reabra a conferência.','SOURCE_CHANGED');
 if(body.confirmation!=='GRAVAR ENVELOPE FERIAS')
  reject58(d,'Confirme digitando GRAVAR ENVELOPE FERIAS.','CONFIRMATION_REQUIRED',400);
 const prior=await env.DB.prepare("SELECT COALESCE(MAX(revision),0) AS rev FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='VACATION'").bind(companyId,src.competence.id).first();
 const revision=Number(prior?.rev||0)+1;
 if(!Number.isSafeInteger(revision)||revision>99999)reject58(d,'Limite de revisões do processamento de férias.','REVISION_LIMIT');
 const runId=d.uuid(),envelopeId=d.uuid(),linkId=d.uuid(),lines=src.configured;
 const amount=src.amounts,snapshotData={
  version:58,occurrence_id:occurrenceId,employee:src.plan.employee,
  reconciliation_id:src.reconciliation.reconciled.id,
  payment_date:src.advance.date,competence:src.competence.competence,
  cost_center_id:src.center.id,cost_center_code:src.center.code,
  figures:amount.figures,amounts:{gross_cents:amount.gross_cents,
   deductions_cents:amount.deductions_cents,net_cents:amount.net_cents},
  events:lines.map(x=>({event_id:x.event_id,event_code:x.event_code,
   line_type:x.line_type,amount_cents:x.amount_cents,nature_id:x.nature_id}))
 };
 const statements=[
  env.DB.prepare("INSERT INTO payroll_calc_runs(id,company_id,competence_id,process_kind,payment_date,revision,status,source_fingerprint,created_by) SELECT ?,?,?,'VACATION',?,?,'CALCULATED',?,? WHERE EXISTS(SELECT 1 FROM payroll_competences WHERE id=? AND company_id=? AND status='OPEN') AND EXISTS(SELECT 1 FROM payroll_vacation_reconciliations55 WHERE id=? AND company_id=? AND occurrence_id=? AND status='RECONCILED') AND NOT EXISTS(SELECT 1 FROM payroll_vacation_envelope_links58 WHERE company_id=? AND occurrence_id=? AND status='ACTIVE')")
   .bind(runId,companyId,src.competence.id,src.advance.date,revision,src.fingerprint,auth.user.id,
    src.competence.id,companyId,src.reconciliation.reconciled.id,companyId,occurrenceId,companyId,occurrenceId),
  env.DB.prepare("INSERT INTO payroll_calc_envelopes(id,company_id,run_id,employee_id,earnings_cents,deductions_cents,net_cents,inss_cents,irrf_cents,fgts_cents,cost_center_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
   .bind(envelopeId,companyId,runId,src.plan.employee.id,amount.gross_cents,amount.deductions_cents,
    amount.net_cents,amount.figures.receipt_inss_cents,amount.figures.receipt_irrf_cents,0,src.center.id)
 ];
 for(let i=0;i<lines.length;i++){
  const x=lines[i];
  statements.push(env.DB.prepare("INSERT INTO payroll_calc_lines(id,company_id,envelope_id,event_id,event_code,event_name,line_type,amount_cents,reference_text,rule_version,sequence) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
   .bind(d.uuid(),companyId,envelopeId,x.event_id,x.event_code,x.event_name,
    x.line_type,x.amount_cents,x.reference_text,'FERIAS58#'+src.reconciliation.reconciled.id,i+1));
 }
 statements.push(env.DB.prepare("INSERT INTO payroll_vacation_envelope_links58(id,company_id,employee_id,occurrence_id,reconciliation_id,run_id,envelope_id,source_fingerprint,snapshot_json,center_id,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,'ACTIVE',?)")
   .bind(linkId,companyId,src.plan.employee.id,occurrenceId,src.reconciliation.reconciled.id,
    runId,envelopeId,src.fingerprint,JSON.stringify(snapshotData),src.center.id,auth.user.id));
 let results;
 try{results=await env.DB.batch(statements)}catch(e){
  if(/UNIQUE|FOREIGN KEY|constraint/i.test(String(e?.message||'')))
   reject58(d,'Outro processamento, evento ou alteração de competência ocorreu; atualize a tela.','ENVELOPE_CONFLICT');
  throw e;
 }
 if(results.some(x=>x.meta?.changes!==1))
  reject58(d,'Gravação não confirmada integralmente. Verifique o processamento antes de prosseguir.','ENVELOPE_WRITE_INCOMPLETE');
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'CREATE',entity:'payroll_vacation_envelope_links58',
  entityId:linkId,before:null,after:{run_id:runId,envelope_id:envelopeId,occurrence_id:occurrenceId,
   revision,net_cents:amount.net_cents,source_fingerprint:src.fingerprint}});
 return {recorded:true,run_id:runId,envelope_id:envelopeId,revision,competence:src.competence.competence,
  net_cents:amount.net_cents,event_count:lines.length,
  ready_for_monthly_posting:false,ready_for_finance:false,ready_for_accounting:false,
  note:'Envelope VACATION gravado como CALCULATED. Não altera folha mensal nem gera pagamento.'};
}
