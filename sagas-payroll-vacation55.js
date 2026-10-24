// SAGAS Folha v93 — conciliação documental das férias com competências da folha.
// Prepara eventos de gozo e compensação; ainda não grava em payroll_calc_lines,
// não desconta INSS/IRRF, não emite financeiro e não contabiliza.
import { payrollVacation54 } from './sagas-payroll-vacation54.js';
function fail55(d,message,code='VACATION_RECONCILIATION_BLOCKED',status=409){throw new d.HttpError(status,message,code)}
function cent55(v,label,d){
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>99999999999)
  fail55(d,'Informe valor válido em '+label+' (centavos inteiros).','INVALID_AMOUNT',400);
 return v;
}
function note55(v,d){
 const note=String(v||'').trim();
 if(note.length<15||note.length>700)fail55(d,'Registre uma justificativa/documento de 15 a 700 caracteres.','INVALID_NOTES',400);
 return note;
}
function compare55(a,b){return JSON.stringify(a)===JSON.stringify(b)}
export async function payrollVacationSchema55(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_reconciliations55 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,occurrence_id TEXT NOT NULL REFERENCES payroll_employee_occurrences(id) ON DELETE RESTRICT,processing_id TEXT NOT NULL REFERENCES payroll_vacation_processings54(id) ON DELETE RESTRICT,advance_id TEXT NOT NULL REFERENCES payroll_vacation_advances54(id) ON DELETE RESTRICT,processing_fingerprint TEXT NOT NULL,advance_amount_cents INTEGER NOT NULL CHECK(advance_amount_cents>0),receipt_inss_cents INTEGER NOT NULL CHECK(receipt_inss_cents>=0),receipt_irrf_cents INTEGER NOT NULL CHECK(receipt_irrf_cents>=0),receipt_other_cents INTEGER NOT NULL CHECK(receipt_other_cents>=0),plan_json TEXT NOT NULL,plan_fingerprint TEXT NOT NULL,notes TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('RECONCILED','VOID')),recorded_by TEXT NOT NULL,recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,voided_by TEXT,voided_at TEXT,void_reason TEXT)"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_vacation_reconciliation55 ON payroll_vacation_reconciliations55(company_id,occurrence_id) WHERE status='RECONCILED'"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_vacation_reconciliation55 ON payroll_vacation_reconciliations55(company_id,processing_id,advance_id)")
 ]);
}
function plan55(snapshot,receipt,breakdown,d){
 if(!snapshot||!Array.isArray(snapshot.periods)||!snapshot.periods.length)
  fail55(d,'A preparação de férias não possui competências válidas.','PREPARATION_INVALID');
 const gross=cent55(snapshot.gross_cents,'bruto',d),
  advance=cent55(receipt.amount_cents,'pagamento externo',d);
 if(advance===0||gross<=0)fail55(d,'Valores brutos e pagamento externo precisam ser positivos.','INVALID_AMOUNT');
 const inss=cent55(breakdown.receipt_inss_cents,'INSS do recibo',d),
  irrf=cent55(breakdown.receipt_irrf_cents,'IRRF do recibo',d),
  other=cent55(breakdown.receipt_other_cents,'outros descontos do recibo',d);
 const difference=BigInt(gross)-BigInt(advance)-BigInt(inss)-BigInt(irrf)-BigInt(other);
 if(difference!==0n)
  fail55(d,'Recibo não conciliado: bruto menos INSS, IRRF e outros descontos deve coincidir com o valor externo efetivamente pago. Divergência de '+String(difference)+' centavos.','RECEIPT_DIFFERENCE');
 const rows=snapshot.periods.map((p,i)=>{
  const vacation=cent55(p.vacation_cents,'férias competência '+p.competence,d),
   third=cent55(p.constitutional_third_cents,'terço competência '+p.competence,d);
  const base=vacation+third;
  if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(String(p.competence||''))||!Number.isSafeInteger(p.days)||p.days<1||p.days>31
   ||base!==p.taxable_gross_cents)
   fail55(d,'A divisão de férias da competência '+p.competence+' é inconsistente.','INVALID_ALLOCATION');
  return {competence:p.competence,days:p.days,source_occurrence_id:snapshot.occurrence_id,
   remuneration_cents:vacation,constitutional_third_cents:third,
   compensation_gross_cents:base,
   proposed_lines:[
    {event_code:'FERIAS_GOZO',line_type:'PROVENTO',amount_cents:vacation,
     inss_base:true,fgts_base:true,monthly_irrf_base:false},
    {event_code:'TERCO_FERIAS',line_type:'PROVENTO',amount_cents:third,
     inss_base:true,fgts_base:true,monthly_irrf_base:false},
    {event_code:'ADIANTAMENTO_FERIAS',line_type:'DESCONTO',amount_cents:base,
     inss_base:false,fgts_base:false,monthly_irrf_base:false}
   ],posting_authorized:false};
 });
 const sum=rows.reduce((a,x)=>a+x.compensation_gross_cents,0);
 if(!Number.isSafeInteger(sum)||sum!==snapshot.vacation_cents+snapshot.vacation_third_cents)
  fail55(d,'Compensação bruta não concilia com férias gozadas e terço.','VACATION_SUM_MISMATCH');
 const abono=cent55(snapshot.abono_cents,'abono',d),abonoThird=cent55(snapshot.abono_third_cents,'terço do abono',d);
 if(sum+abono+abonoThird!==gross)
  fail55(d,'Bruto das competências mais abono e terço não fecha.','TOTAL_MISMATCH');
 return {version:55,employee:snapshot.employee,occurrence_id:snapshot.occurrence_id,
  model_revision:snapshot.model_revision,processing_status:snapshot.status,
  period_start:snapshot.start_date,period_end:snapshot.end_date,
  gross_cents:gross,external_paid_cents:advance,
  receipt_inss_cents:inss,receipt_irrf_cents:irrf,receipt_other_cents:other,
  abono_cents:abono,abono_third_cents:abonoThird,
  vacation_gross_cents:sum,periods:rows,
  explanation:'O desconto bruto de antecipação compensa somente verbas de gozo. O pagamento bancário é líquido/documental e nunca deve ser descontado integralmente também no envelope.',
  ready_for_monthly_posting:false,ready_for_payment:false,ready_for_accounting:false};
}
async function active55(env,companyId,id){
 return await env.DB.prepare("SELECT id,company_id,employee_id,occurrence_id,processing_id,advance_id,processing_fingerprint,advance_amount_cents,receipt_inss_cents,receipt_irrf_cents,receipt_other_cents,plan_json,plan_fingerprint,notes,status,recorded_by,recorded_at FROM payroll_vacation_reconciliations55 WHERE company_id=? AND occurrence_id=? AND status='RECONCILED' LIMIT 1").bind(companyId,id).first();
}
async function source55(c,d){
 const {env,companyId,auth,request,id}=c;
 const record=await payrollVacation54('read',{env,companyId,auth,request,occurrenceId:id,body:{},d});
 if(!record.prepared||!record.processing||!record.snapshot)
  return {record,ready:false,blockers:[{code:'PREPARACAO_PENDENTE',message:'Prepare as férias antes de reconciliar o recibo.'}]};
 const adv=record.advance;
 const blockers=[...(record.blockers||[])];
 if(record.stale||record.locked)blockers.push({code:'ORIGEM_ALTERADA',message:'A memória mudou após preparação: anule e refaça.'});
 if(!adv)blockers.push({code:'ADIANTAMENTO_AUSENTE',message:'Informe o pagamento externo antes de reconciliar o recibo.'});
 if(adv&&adv.processing_id!==record.processing.id)
  blockers.push({code:'ADIANTAMENTO_PROCESSO',message:'O adiantamento não pertence à preparação atual.'});
 const posted=await env.DB.prepare("SELECT id,source_fingerprint FROM payroll_vacation_processings54 WHERE id=? AND company_id=? AND occurrence_id=? AND status='PREPARED' LIMIT 1").bind(record.processing.id,companyId,id).first();
 if(!posted)blockers.push({code:'PREPARACAO_MODIFICADA',message:'O processamento não está mais ativo.'});
 for(const p of record.snapshot.periods){
  const period=await env.DB.prepare("SELECT id,status FROM payroll_competences WHERE company_id=? AND competence=? LIMIT 1").bind(companyId,p.competence).first();
  if(!period){blockers.push({code:'COMPETENCIA_NAO_CADASTRADA',message:'Cadastre a competência '+p.competence+'.'});continue;}
  if(period.status!=='OPEN')blockers.push({code:'COMPETENCIA_FECHADA',message:'A competência '+p.competence+' está fechada.'});
  const manual=await env.DB.prepare("SELECT v.code FROM payroll_movements m JOIN payroll_events v ON v.id=m.event_id AND v.company_id=m.company_id WHERE m.company_id=? AND m.competence_id=? AND m.employee_id=? AND (v.code IN ('FERIAS_GOZO','TERCO_FERIAS','ABONO_FERIAS','TERCO_ABONO_FERIAS','ADIANTAMENTO_FERIAS','INSS_FERIAS','IRRF_FERIAS','FGTS_FERIAS') OR UPPER(v.code) LIKE '%FERIA%') LIMIT 1").bind(companyId,period.id,record.snapshot.employee.id).first();
  if(manual)blockers.push({code:'MOVIMENTO_FERIAS_EXISTENTE',message:'Há movimento manual de férias ('+manual.code+') na competência '+p.competence+'. Remova/concilie antes de gerar o plano.'});
  const run=await env.DB.prepare("SELECT id,status,revision FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY' ORDER BY revision DESC LIMIT 1").bind(companyId,period.id).first();
  if(run?.status==='APPROVED'||run?.status==='REVIEWED')
   blockers.push({code:'FOLHA_JA_CONFERIDA',message:'A folha de '+p.competence+' já foi revisada/aprovada.'});
  if(run){
   const duplicate=await env.DB.prepare("SELECT l.event_code FROM payroll_calc_envelopes e JOIN payroll_calc_lines l ON l.company_id=e.company_id AND l.envelope_id=e.id WHERE e.company_id=? AND e.run_id=? AND e.employee_id=? AND (l.event_code IN ('FERIAS_GOZO','TERCO_FERIAS','ABONO_FERIAS','TERCO_ABONO_FERIAS','ADIANTAMENTO_FERIAS','INSS_FERIAS','IRRF_FERIAS','FGTS_FERIAS') OR UPPER(l.event_code) LIKE '%FERIA%') LIMIT 1").bind(companyId,run.id,record.snapshot.employee.id).first();
   if(duplicate)blockers.push({code:'EVENTO_DUPLICADO',message:'O envelope de '+p.competence+' já contém '+duplicate.event_code+'.'});
   const financial=await env.DB.prepare("SELECT run_id FROM payroll_finance_postings37 WHERE company_id=? AND run_id=? LIMIT 1").bind(companyId,run.id).first();
   if(financial)blockers.push({code:'FOLHA_CONTABILIZADA',message:'A competência '+p.competence+' já foi integrada à contabilidade.'});
  }
 }
 return {record,ready:!!adv&&!blockers.some(x=>!['PAGAMENTO_FORA_DO_PRAZO'].includes(x.code)),blockers,source:posted};
}
export async function payrollVacation55(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='read'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-vacation55',1,()=>payrollVacationSchema55(env));
 if(!['read','reconcile','void'].includes(action))fail55(d,'Operação não reconhecida.','NOT_FOUND',404);
 const id=String(action==='read'?c.occurrenceId||'':body.occurrence_id||'').trim();
 if(!id||id.length>128)fail55(d,'Selecione a ocorrência de férias.','INVALID_OCCURRENCE',400);
 const active=await active55(env,companyId,id);
 if(action==='void'){
  const registered=await env.DB.prepare("SELECT run_id FROM payroll_vacation_envelope_links58 WHERE company_id=? AND occurrence_id=? AND status='ACTIVE' LIMIT 1").bind(companyId,id).first();
  if(registered)fail55(d,'Anule primeiro o envelope próprio de férias para cancelar a conciliação.','VACATION_ENVELOPE_ACTIVE');
  if(!active)fail55(d,'Não existe conciliação para anular.','NOT_FOUND',404);
  if(body.confirmation!=='ANULAR CONCILIACAO')fail55(d,'Confirme digitando ANULAR CONCILIACAO.','CONFIRMATION_REQUIRED',400);
  const reason=note55(body.notes,d);
  const change=await env.DB.prepare("UPDATE payroll_vacation_reconciliations55 SET status='VOID',voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=? WHERE company_id=? AND id=? AND status='RECONCILED'").bind(auth.user.id,reason,companyId,active.id).run();
  if(change.meta?.changes!==1)fail55(d,'Conciliação alterada por outro usuário.','VERSION_CONFLICT');
  await d.audit(env,{companyId,userId:auth.user.id,action:'VOID',entity:'payroll_vacation_reconciliations55',entityId:active.id,request,before:{status:'RECONCILED'},after:{status:'VOID',reason}});
  return {voided:true};
 }
 const reference=await source55({...c,id},d);
 const prepared=reference.record?.prepared||false,advance=reference.record?.advance||null;
 const stored=active?JSON.parse(active.plan_json):null;
 const stale=!!active&&(reference.blockers.some(x=>x.code!=='PAGAMENTO_FORA_DO_PRAZO')||
  !reference.source || active.processing_fingerprint!==reference.source.source_fingerprint ||
  active.processing_id!==reference.record?.processing?.id ||
  active.advance_id!==advance?.id ||
  Number(active.advance_amount_cents)!==Number(advance?.amount_cents)
 );
 if(action==='read')return {
  status:active?'RECIBO_CONCILIADO_SEM_LANCAMENTO':'AGUARDANDO_CONCILIACAO',
  prepared,stale,occurrence_id:id,employee:reference.record?.employee||stored?.employee||null,
  processing_id:reference.record?.processing?.id||null,
  advance,bank_amount_cents:advance?.amount_cents||null,
  gross_cents:reference.record?.gross_cents||stored?.gross_cents||null,
  period_start:reference.record?.start_date||stored?.period_start||null,
  period_end:reference.record?.end_date||stored?.period_end||null,
  blockers:reference.blockers,active:!!active,ready_for_reconciliation:reference.ready&&!active,
  reconciled:active?{id:active.id,recorded_at:active.recorded_at,notes:active.notes,processing_fingerprint:active.processing_fingerprint,
   receipt_inss_cents:active.receipt_inss_cents,receipt_irrf_cents:active.receipt_irrf_cents,receipt_other_cents:active.receipt_other_cents,plan:stored}:null,
  ready_for_monthly_posting:false,ready_for_payment:false,ready_for_accounting:false,
  warning:'A conciliação registra o recibo e a proposta de rubricas; NÃO altera envelopes ou despesas.'};
 if(active)fail55(d,'Já existe conciliação ativa. Anule-a para reprocessar.','RECONCILIATION_EXISTS');
 if(!reference.ready)fail55(d,'Corrija as pendências de preparação, pagamento e competências antes de reconciliar.','RECONCILIATION_PENDING');
 if(body.confirmation!=='RECIBO CONFERIDO')
  fail55(d,'Confirme digitando RECIBO CONFERIDO.','CONFIRMATION_REQUIRED',400);
 const notes=note55(body.notes,d);
 const plan=plan55(reference.record.snapshot,advance,body,d);
 const fingerprint=await d.hash(plan),rowId=d.uuid(),serialized=JSON.stringify(plan);
 try{
  const sql="INSERT INTO payroll_vacation_reconciliations55(id,company_id,employee_id,occurrence_id,processing_id,advance_id,processing_fingerprint,advance_amount_cents,receipt_inss_cents,receipt_irrf_cents,receipt_other_cents,plan_json,plan_fingerprint,notes,status,recorded_by) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'RECONCILED',? WHERE EXISTS(SELECT 1 FROM payroll_vacation_processings54 WHERE company_id=? AND id=? AND status='PREPARED' AND source_fingerprint=?) AND EXISTS(SELECT 1 FROM payroll_vacation_advances54 WHERE company_id=? AND id=? AND status='DECLARED' AND amount_cents=?)";
  const ins=await env.DB.prepare(sql).bind(rowId,companyId,plan.employee.id,id,reference.record.processing.id,advance.id,reference.source.source_fingerprint,advance.amount_cents,
    body.receipt_inss_cents,body.receipt_irrf_cents,body.receipt_other_cents,serialized,fingerprint,notes,auth.user.id,
    companyId,reference.record.processing.id,reference.source.source_fingerprint,companyId,advance.id,advance.amount_cents).run();
  if(ins.meta?.changes!==1)fail55(d,'Origem ou adiantamento modificado antes da gravação.','VERSION_CONFLICT');
 }catch(e){
  if(/UNIQUE/i.test(String(e.message||'')))fail55(d,'Conciliação já criada em outra sessão. Recarregue.','RECONCILIATION_EXISTS');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'payroll_vacation_reconciliations55',entityId:rowId,request,before:null,after:{
  occurrence_id:id,processing_id:reference.record.processing.id,advance_id:advance.id,receipt_inss_cents:body.receipt_inss_cents,
  receipt_irrf_cents:body.receipt_irrf_cents,receipt_other_cents:body.receipt_other_cents,plan_fingerprint:fingerprint}});
 return {reconciled:true,reconciliation_id:rowId,plan,
  ready_for_monthly_posting:false,ready_for_payment:false,ready_for_accounting:false};
}
export {plan55};
