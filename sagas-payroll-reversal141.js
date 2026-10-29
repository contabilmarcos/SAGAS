// Desfazimento da folha simplificada. Preserva a revisão, o diário anulado e
// uma fotografia dos documentos retirados do livro operacional de provisões.
export async function reversalSchema141(env){
 await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS payroll_simple_reversals141(
   run_id TEXT PRIMARY KEY,company_id TEXT NOT NULL,entry_id TEXT NOT NULL,batch_id TEXT NOT NULL,
   reason TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_by TEXT NOT NULL,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS payroll_simple_operation_guards141(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1))')
 ]);
}
export async function guardedBatch141(env,d,condition,args,statements){
 const id=d.uuid();
 try{
  const result=await env.DB.batch([
   env.DB.prepare('INSERT INTO payroll_simple_operation_guards141(id,valid) SELECT ?,('+condition+')').bind(id,...args),
   ...statements,env.DB.prepare('DELETE FROM payroll_simple_operation_guards141 WHERE id=?').bind(id)
  ]);
  return result.slice(1,-1);
 }catch(err){
  if(/CHECK constraint failed.*valid/i.test(String(err)))
   throw new d.HttpError(409,'Os vínculos da folha mudaram. Atualize a consulta antes de continuar.','PAYROLL_STATE_CHANGED');
  throw err;
 }
}
const fail=(d,code,message)=>{throw new d.HttpError(409,message,code);};
export async function undoPayroll141(action,c){
 const {env,companyId,auth,body={},latest,posted,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'accounting.entry.void');
 const previous=await env.DB.prepare('SELECT run_id,entry_id,reason,created_at FROM payroll_simple_reversals141 WHERE company_id=? AND run_id=?').bind(companyId,latest.id).first();
 if(!posted){
  if(action==='undo'&&previous&&body.run_id===previous.run_id&&body.entry_id===previous.entry_id)return {undone:true,reused:true};
  fail(d,'NOT_POSTED','Esta revisão não possui contabilização ativa.');
 }
 const entry=await env.DB.prepare('SELECT * FROM journal_entries WHERE company_id=? AND id=?').bind(companyId,posted.entry_id).first();
 const batch=await env.DB.prepare('SELECT * FROM journal_batches WHERE company_id=? AND id=?').bind(companyId,posted.batch_id).first();
 const period=batch?await env.DB.prepare('SELECT * FROM accounting_periods WHERE company_id=? AND id=?').bind(companyId,batch.period_id).first():null;
 const competence=await env.DB.prepare('SELECT status FROM payroll_competences WHERE company_id=? AND competence=?').bind(companyId,latest.competence).first();
 const payables=(await env.DB.prepare(`SELECT f.* FROM payroll_simple_payables141 l JOIN financial_payables f
  ON f.id=l.payable_id AND f.company_id=l.company_id WHERE l.company_id=? AND l.run_id=? ORDER BY f.id`).bind(companyId,latest.id).all()).results||[];
 if(payables.length)await d.requirePermission(env,auth.user.id,companyId,'financial.payable.manage');
 const prefix='SIMPLE141:'+latest.id+':';
 const movements=(await env.DB.prepare(`SELECT * FROM payroll_provision_movements43 WHERE company_id=?
  AND substr(origin_key,1,length(?))=? ORDER BY id`).bind(companyId,prefix,prefix).all()).results||[];
 const problems=[];
 const block=(code,message)=>problems.push({code,message});
 if(!entry||entry.status!=='POSTED'||entry.source_module!=='PAYROLL_SIMPLE'||entry.source_reference!=='SIMPLE141:'+latest.id||entry.batch_id!==posted.batch_id)
  block('ENTRY_CHANGED','O lançamento de origem foi removido ou alterado. É necessário conciliar seus vínculos antes de desfazer.');
 if(entry?.official_status==='INTEGRATED')block('ENTRY_IN_OFFICIAL_BATCH','O lançamento está no Lote 0. Desfaça primeiro a integração pelo módulo contábil.');
 if(entry?.edited_at)block('ENTRY_CHANGED','O lançamento foi editado fora da folha. Concilie a alteração antes de desfazer.');
 if(!batch||batch.status!=='OPEN')block('BATCH_CLOSED','O lote de origem precisa estar aberto.');
 const date=entry?.entry_date;
 if(!period||!date||date<period.start_date||date>period.end_date||period.status==='LOCKED'||
   (period.status==='CLOSED'&&(!period.closed_until||period.closed_until>=period.end_date))||
   (period.closed_until&&date<=period.closed_until))block('PERIOD_CLOSED','O período contábil precisa permitir manutenção na data do lançamento.');
 if(competence?.status!=='OPEN')block('PAYROLL_PERIOD_CLOSED','Reabra a competência da folha antes de desfazer.');
 if(payables.some(x=>x.status!=='OPEN'||Number(x.balance_cents)!==Number(x.amount_cents)||x.payment_journal_entry_id))
  block('PAYABLE_NOT_OPEN','Há títulos pagos, cancelados ou com baixa vinculada. Estorne e confira as baixas no Financeiro antes de desfazer a folha.');
 const dependentSql=`SELECT m.id FROM payroll_provision_movements43 m JOIN json_each(?) j
  ON m.employee_id=json_extract(j.value,'$.employee_id') AND m.component=json_extract(j.value,'$.component')
  WHERE m.company_id=? AND m.id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(?))
  AND (m.competence>? OR (m.competence=? AND m.movement_kind='USE')) LIMIT 1`;
 const movementJson=JSON.stringify(movements);
 if(movements.length&&await env.DB.prepare(dependentSql).bind(movementJson,companyId,movementJson,latest.competence,latest.competence).first())
  block('PROVISION_USED','Existem baixas ou movimentos posteriores destas provisões. Regularize os movimentos dependentes antes de desfazer.');
 const linkedTable=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payroll_provision_posted_movements45'").first();
 if(linkedTable&&movements.length&&await env.DB.prepare("SELECT movement_id FROM payroll_provision_posted_movements45 WHERE company_id=? AND movement_id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) LIMIT 1").bind(companyId,movementJson).first())
  block('PROVISION_LINKED','Uma provisão está vinculada a outra contabilização. Concilie esse vínculo antes de desfazer.');
 const preview={run_id:latest.id,entry_id:posted.entry_id,batch_id:posted.batch_id,batch_code:batch?.code,
  payable_count:payables.length,provision_count:movements.length,can_undo:!problems.length,problems};
 if(action==='undo-preview')return preview;
 if(body.run_id!==latest.id||body.entry_id!==posted.entry_id)fail(d,'STALE_UNDO','A revisão ou o lançamento mudou. Abra novamente o desfazimento.');
 const reason=String(body.reason||'').trim();
 if(body.confirmation!=='DESFAZER'||!reason||reason.length>1000)
  throw new d.HttpError(400,'Informe o motivo (até 1.000 caracteres) e confirme DESFAZER.','UNDO_CONFIRMATION_REQUIRED');
 if(problems.length)fail(d,problems[0].code,problems[0].message);
 const ledger=await env.DB.prepare('SELECT * FROM payroll_simple_ledger141 WHERE company_id=? AND run_id=?').bind(companyId,latest.id).first();
 const integrations=(await env.DB.prepare('SELECT * FROM payroll_simple_integrations141 WHERE company_id=? AND run_id=?').bind(companyId,latest.id).all()).results||[];
 const snapshot=JSON.stringify({posting:posted,entry,batch,ledger,payables,movements,integrations});
 // Todas as condições são conferidas novamente dentro da transação. Uma baixa
 // ou integração concorrente faz a guarda falhar e reverte a operação inteira.
 const conditions=[`EXISTS(SELECT 1 FROM payroll_simple_postings141 WHERE company_id=? AND run_id=? AND entry_id=? AND batch_id=?)`,
  `NOT EXISTS(SELECT 1 FROM payroll_simple_runs141 WHERE company_id=? AND competence=? AND cost_center_id=? AND revision>?)`,
  `EXISTS(SELECT 1 FROM journal_entries WHERE company_id=? AND id=? AND status='POSTED' AND COALESCE(official_status,'PENDING')<>'INTEGRATED' AND edited_at IS NULL AND source_module='PAYROLL_SIMPLE' AND source_reference=? AND batch_id=? AND entry_date=?)`,
  `EXISTS(SELECT 1 FROM journal_batches b JOIN accounting_periods p ON p.id=b.period_id AND p.company_id=b.company_id
   WHERE b.company_id=? AND b.id=? AND b.status='OPEN' AND p.status<>'LOCKED'
   AND ? BETWEEN p.start_date AND p.end_date AND (p.closed_until IS NULL OR p.closed_until<?)
   AND (p.status<>'CLOSED' OR (p.closed_until IS NOT NULL AND p.closed_until<p.end_date)))`,
  `EXISTS(SELECT 1 FROM payroll_competences WHERE company_id=? AND competence=? AND status='OPEN')`,
  `(SELECT COUNT(*) FROM payroll_simple_payables141 WHERE company_id=? AND run_id=?)=?`,
  `NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN financial_payables f ON f.id=json_extract(j.value,'$.id') AND f.company_id=?
   WHERE f.id IS NULL OR f.status<>'OPEN' OR f.balance_cents<>f.amount_cents OR f.amount_cents<>json_extract(j.value,'$.amount_cents') OR f.payment_journal_entry_id IS NOT NULL)`,
  `(SELECT COUNT(*) FROM payroll_provision_movements43 WHERE company_id=? AND substr(origin_key,1,length(?))=?)=?`,
  `NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN payroll_provision_movements43 m ON m.id=json_extract(j.value,'$.id') AND m.company_id=?
   WHERE m.id IS NULL OR m.movement_kind<>'ACCRUAL' OR m.amount_cents<>json_extract(j.value,'$.amount_cents'))`,
  'NOT EXISTS('+dependentSql+')'];
 const args=[companyId,latest.id,posted.entry_id,posted.batch_id,companyId,latest.competence,latest.cost_center_id,latest.revision,
  companyId,entry.id,entry.source_reference,posted.batch_id,date,companyId,batch.id,date,date,
  companyId,latest.competence,companyId,latest.id,payables.length,JSON.stringify(payables),companyId,
  companyId,prefix,prefix,movements.length,movementJson,companyId,movementJson,companyId,movementJson,latest.competence,latest.competence];
 if(linkedTable){
  conditions.push('NOT EXISTS(SELECT 1 FROM payroll_provision_posted_movements45 WHERE company_id=? AND movement_id IN (SELECT json_extract(value,\'$.id\') FROM json_each(?)))');
  args.push(companyId,movementJson);
 }
 const statements=[
  env.DB.prepare('INSERT INTO payroll_simple_reversals141(run_id,company_id,entry_id,batch_id,reason,snapshot_json,created_by) VALUES(?,?,?,?,?,?,?)').bind(latest.id,companyId,entry.id,batch.id,reason,snapshot,auth.user.id),
  env.DB.prepare("UPDATE journal_entries SET status='VOID',voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=?").bind(auth.user.id,reason,companyId,entry.id),
  env.DB.prepare("UPDATE financial_payables SET status='CANCELLED',balance_cents=0,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(companyId,JSON.stringify(payables)),
  env.DB.prepare("DELETE FROM payroll_provision_movements43 WHERE company_id=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(companyId,movementJson),
  env.DB.prepare('DELETE FROM payroll_simple_integrations141 WHERE company_id=? AND run_id=?').bind(companyId,latest.id),
  env.DB.prepare('DELETE FROM payroll_simple_postings141 WHERE company_id=? AND run_id=? AND entry_id=?').bind(companyId,latest.id,entry.id)
 ];
 try{await guardedBatch141(env,d,conditions.join(' AND '),args,statements);}catch(err){
  if(/UNIQUE constraint failed.*payroll_simple_reversals141/i.test(String(err)))fail(d,'PAYROLL_STATE_CHANGED','Esta revisão já foi desfeita. Atualize a consulta.');
  throw err;
 }
 await d.audit(env,{companyId,userId:auth.user.id,request:c.request,action:'UNDO',entity:'payroll_simple_runs141',entityId:latest.id,
  after:{entry_id:entry.id,batch_id:batch.id,reason,cancelled_payables:payables.length,removed_provisions:movements.length}});
 return {undone:true,run_id:latest.id,entry_id:entry.id,batch_code:batch.code,cancelled_payables:payables.length,removed_provisions:movements.length,recalculation_required:true};
}
