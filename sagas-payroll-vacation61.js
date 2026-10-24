// SAGAS Folha v99: gravacao controlada da MEMORIA de eventos mensais de ferias.
// IMPORTANTE: tabela de preparacao. Nao altera payroll_calc_lines, a fonte de
// payrollMonthlySource35, nem libera pagamento, fechamento ou contabilizacao.
import { payrollVacationBridge60 } from './sagas-payroll-vacation60.js';

function error61(d,message,code='VACATION_STAGE_BLOCKED',status=409){
 throw new d.HttpError(status,message,code);
}
function money61(v,d,label){
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>99999999999)
  error61(d,'Valor invalido em '+label,'INVALID_AMOUNT');
 return v;
}
function date61(v,d){
 const s=String(v||'');
 if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])-[0-3]\d$/.test(s))
  error61(d,'Data de pagamento invalida.','INVALID_DATE',400);
 const t=new Date(s+'T00:00:00Z');
 if(!Number.isFinite(t.valueOf())||t.toISOString().slice(0,10)!==s)
  error61(d,'Data de pagamento inexistente.','INVALID_DATE',400);
 return s;
}
export async function payrollVacationStageSchema61(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_monthly_stage61 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,occurrence_id TEXT NOT NULL REFERENCES payroll_employee_occurrences(id) ON DELETE RESTRICT,vacation_run_id TEXT NOT NULL REFERENCES payroll_calc_runs(id) ON DELETE RESTRICT,competence_id TEXT NOT NULL REFERENCES payroll_competences(id) ON DELETE RESTRICT,competence TEXT NOT NULL,payment_date TEXT NOT NULL,source_fingerprint TEXT NOT NULL,events_json TEXT NOT NULL,snapshot_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('STAGED','VOID')),created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,voided_by TEXT,voided_at TEXT,void_reason TEXT)"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_vacation_stage61_employee_month ON payroll_vacation_monthly_stage61(company_id,employee_id,competence_id) WHERE status='STAGED'"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_vacation_stage61_occurrence ON payroll_vacation_monthly_stage61(company_id,occurrence_id,status)"),
  env.DB.prepare("CREATE TRIGGER IF NOT EXISTS tr_vac_stage61_no_monthly BEFORE INSERT ON payroll_vacation_monthly_stage61 WHEN NOT EXISTS (SELECT 1 FROM payroll_competences WHERE id=NEW.competence_id AND company_id=NEW.company_id AND status='OPEN') OR EXISTS (SELECT 1 FROM payroll_calc_runs WHERE company_id=NEW.company_id AND competence_id=NEW.competence_id AND process_kind='MONTHLY') BEGIN SELECT RAISE(ABORT,'VACATION_STAGE_COMPETENCE_CONFLICT'); END"),
  env.DB.prepare("CREATE TRIGGER IF NOT EXISTS tr_vac_stage61_block_monthly BEFORE INSERT ON payroll_calc_runs WHEN NEW.process_kind='MONTHLY' AND EXISTS (SELECT 1 FROM payroll_vacation_monthly_stage61 WHERE company_id=NEW.company_id AND competence_id=NEW.competence_id AND status='STAGED') BEGIN SELECT RAISE(ABORT,'VACATION_MONTHLY_STAGE_PENDING'); END")
 ]);
}
async function staged61(env,companyId,occurrenceId){
 return (await env.DB.prepare("SELECT id,employee_id,occurrence_id,vacation_run_id,competence_id,competence,payment_date,source_fingerprint,events_json,snapshot_json,status,created_at FROM payroll_vacation_monthly_stage61 WHERE company_id=? AND occurrence_id=? AND status='STAGED' ORDER BY competence").bind(companyId,occurrenceId).all()).results||[];
}
export async function payrollVacationStage61(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 if(!['read','record','void'].includes(action))
  error61(d,'Acao desconhecida.','NOT_FOUND',404);
 await d.requirePermission(env,auth.user.id,companyId,action==='read'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-vacation-monthly-stage61',2,()=>payrollVacationStageSchema61(env));
 const occurrenceId=String(action==='read'?c.occurrenceId||'':body.occurrence_id||'').trim();
 if(!occurrenceId||occurrenceId.length>128)
  error61(d,'Informe uma ocorrencia valida.','INVALID_OCCURRENCE',400);
 const existing=await staged61(env,companyId,occurrenceId);
 if(action==='read')return {
  occurrence_id:occurrenceId,status:existing.length?'STAGED':'NOT_STAGED',
  items:existing.map(x=>({id:x.id,competence:x.competence,payment_date:x.payment_date,
   vacation_run_id:x.vacation_run_id,events:JSON.parse(x.events_json),snapshot:JSON.parse(x.snapshot_json),
   source_fingerprint:x.source_fingerprint,created_at:x.created_at})),
  ready_for_monthly_posting:false,ready_for_finance:false,ready_for_accounting:false,
  note:'Memoria preparada; ainda nao altera envelopes MONTHLY.'
 };
 if(action==='void'){
  if(!existing.length)error61(d,'Nao ha memoria ativa para anular.','NOT_FOUND',404);
  if(body.confirmation!=='ANULAR MEMORIA FERIAS')
   error61(d,'Confirme digitando ANULAR MEMORIA FERIAS.','CONFIRMATION_REQUIRED',400);
  const reason=String(body.notes||'').trim();
  if(reason.length<15||reason.length>600)
   error61(d,'Justificativa de 15 a 600 caracteres obrigatoria.','INVALID_NOTES',400);
  const stmts=existing.map(x=>env.DB.prepare("UPDATE payroll_vacation_monthly_stage61 SET status='VOID',voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=? WHERE id=? AND company_id=? AND status='STAGED'").bind(auth.user.id,reason,x.id,companyId));
  const results=await env.DB.batch(stmts);
  if(results.some(x=>x.meta?.changes!==1))error61(d,'Concorrencia ao anular; verifique os registros.','STAGE_CONFLICT');
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'VOID',entity:'payroll_vacation_monthly_stage61',entityId:occurrenceId,
    before:{staged:existing.map(x=>x.id)},after:{status:'VOID',reason}});
  return {voided:true,count:existing.length,ready_for_monthly_posting:false};
 }
 // A fotografia v98 e recalculada antes de cada gravacao. Nao aceitar eventos
 // monetarios enviados pelo navegador.
 const preview=await payrollVacationBridge60('prepare',{...c,occurrenceId,body:{},d});
 if(preview.blockers.length)error61(d,'A ponte de ferias possui pendencias.','BRIDGE_NOT_READY');
 if(body.expected_fingerprint!==preview.fingerprint)
  error61(d,'Origens alteradas. Reabra a conferencia.','SOURCE_CHANGED');
 if(!Array.isArray(body.payment_dates)||body.payment_dates.length!==preview.monthly_competences.length)
  error61(d,'Informe data de pagamento para cada competencia.','PAYMENT_DATES_REQUIRED',400);
 const paymentDates=body.payment_dates.map(x=>date61(x,d));
 const simulation=await payrollVacationBridge60('simulate',{...c,body:{
  occurrence_id:occurrenceId,expected_fingerprint:preview.fingerprint,payment_dates:paymentDates
 },d});
 if(!simulation.simulated||simulation.blockers?.length)
  error61(d,'A simulacao mensal possui pendencias e nao pode ser gravada.','SIMULATION_NOT_READY');
 const months=simulation.months||[];
 if(months.length!==preview.monthly_competences.length)
  error61(d,'Numero de competencias diverge da simulacao.','MONTHS_MISMATCH');
 const employeeId=preview.monthly_competences?.length?
  (await env.DB.prepare("SELECT employee_id FROM payroll_vacation_envelope_links58 WHERE company_id=? AND occurrence_id=? AND run_id=? AND status='ACTIVE' LIMIT 1").bind(companyId,occurrenceId,preview.vacation_run_id).first())?.employee_id:null;
 if(!employeeId)error61(d,'Vinculo do envelope de ferias nao encontrado.','VACATION_LINK_MISSING');
 const all=[];
 for(let i=0;i<months.length;i++){
  const m=months[i],expected=preview.monthly_competences[i];
  if(!m||m.competence!==expected.competence)
   error61(d,'Ordem ou competencia mensal divergente.','MONTH_ORDER_MISMATCH');
  const record=await env.DB.prepare("SELECT id,status FROM payroll_competences WHERE company_id=? AND competence=? LIMIT 1").bind(companyId,m.competence).first();
  if(!record||record.status!=='OPEN')
   error61(d,'Competencia fechada ou inexistente: '+m.competence,'COMPETENCE_LOCKED');
  const latest=await env.DB.prepare("SELECT id,status FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY' ORDER BY revision DESC LIMIT 1").bind(companyId,record.id).first();
  if(latest&&latest.status!=='CALCULATED')
   error61(d,'Folha mensal ja revisada ou fechada: '+m.competence,'MONTHLY_LOCKED');
  if(latest)error61(d,'Existe calculo mensal que deve ser reconciliado antes da gravacao: '+m.competence,'MONTHLY_EXISTS');
  const other=await env.DB.prepare("SELECT id,occurrence_id FROM payroll_vacation_monthly_stage61 WHERE company_id=? AND employee_id=? AND competence_id=? AND status='STAGED' LIMIT 1").bind(companyId,employeeId,record.id).first();
  if(other&&other.occurrence_id!==occurrenceId)
   error61(d,'Ja existe memoria de outras ferias na mesma competencia.','STAGE_DUPLICATE');
  const lines=m.events;
  if(!Array.isArray(lines)||!lines.length||lines.length>30)
   error61(d,'Rubricas invalidas na simulacao.','LINES_INVALID');
  for(const line of lines){
   if(!['PROVENTO','DESCONTO','INFORMATIVO'].includes(line.line_type)||typeof line.event_code!=='string'||line.event_code.length>64)
    error61(d,'Rubrica invalida.','LINE_INVALID');
   money61(line.amount_cents,d,line.event_code);
  }
  const advance=lines.filter(l=>l.event_code==='ADIANTAMENTO_FERIAS');
  if(advance.length!==1||advance[0].line_type!=='DESCONTO'||
     advance[0].amount_cents!==expected.gross_advance_compensation_cents)
   error61(d,'Compensacao duplicada ou incorreta.','ADVANCE_MISMATCH');
  const earnings=lines.filter(l=>l.line_type==='PROVENTO').reduce((n,l)=>n+l.amount_cents,0);
  const deductions=lines.filter(l=>l.line_type==='DESCONTO').reduce((n,l)=>n+l.amount_cents,0);
  if(earnings!==money61(m.earnings_cents,d,'bruto mensal')||
     deductions!==money61(m.deductions_cents,d,'descontos mensais')||
     earnings-deductions!==money61(m.illustrative_net_cents,d,'liquido mensal'))
   error61(d,'Rubricas e totais mensais divergentes.','TOTALS_MISMATCH');
  all.push({competence_id:record.id,competence:m.competence,payment_date:paymentDates[i],
   lines,snapshot:m,hash:await d.hash({version:61,bridge:preview.fingerprint,
    vacation_run_id:preview.vacation_run_id,month:m,payment_date:paymentDates[i]})});
 }
 if(existing.length){
  const same=existing.length===all.length&&existing.every((x,i)=>
   x.competence===all[i].competence&&x.source_fingerprint===all[i].hash&&x.payment_date===all[i].payment_date);
  if(same)return {recorded:true,reused:true,count:existing.length,
   ready_for_monthly_posting:false,ready_for_finance:false,ready_for_accounting:false};
  error61(d,'Ja ha uma memoria ativa. Anule antes de refazer.','STAGE_EXISTS');
 }
 if(body.confirmation!=='GRAVAR MEMORIA FERIAS')
  error61(d,'Confirme digitando GRAVAR MEMORIA FERIAS.','CONFIRMATION_REQUIRED',400);
 const insert=all.map(m=>env.DB.prepare(
  "INSERT INTO payroll_vacation_monthly_stage61(id,company_id,employee_id,occurrence_id,vacation_run_id,competence_id,competence,payment_date,source_fingerprint,events_json,snapshot_json,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,'STAGED',?)")
  .bind(d.uuid(),companyId,employeeId,occurrenceId,preview.vacation_run_id,m.competence_id,m.competence,m.payment_date,m.hash,
   JSON.stringify(m.lines),JSON.stringify(m.snapshot),auth.user.id));
 let results;
 try{results=await env.DB.batch(insert)}
 catch(e){
  if(/UNIQUE|FOREIGN KEY|constraint/i.test(String(e?.message||'')))
   error61(d,'Registro duplicado ou concorrente. Atualize a conferencia.','STAGE_CONFLICT');
  throw e;
 }
 if(results.some(x=>x.meta?.changes!==1))
  error61(d,'Registro nao confirmado integralmente; confira o historico.','STAGE_INCOMPLETE');
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'CREATE',entity:'payroll_vacation_monthly_stage61',entityId:occurrenceId,
  after:{status:'STAGED',vacation_run_id:preview.vacation_run_id,competences:all.map(x=>x.competence)}});
 return {recorded:true,reused:false,count:all.length,competences:all.map(x=>x.competence),
  ready_for_monthly_posting:false,ready_for_finance:false,ready_for_accounting:false,
  note:'Memoria de eventos armazenada, SEM inclusao nos envelopes MONTHLY. Proxima etapa: adaptar calculo e fechamento com incidencias e hash de origem.'};
}


// Protecao temporaria do calculo MONTHLY enquanto a integracao integral
// das incidencias de ferias nao estiver implementada e homologada.
export async function payrollVacationBlockMonthly61(env,companyId,competence,d){
 const name=String(competence||'');
 if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(name))
  error61(d,'Competencia invalida.','INVALID_COMPETENCE');
 const existence=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('payroll_vacation_monthly_stage61','payroll_vacation_envelope_links58')").all()).results||[];
 const has=x=>existence.some(t=>t.name===x);
 if(has('payroll_vacation_monthly_stage61')){
  const stage=await env.DB.prepare("SELECT id FROM payroll_vacation_monthly_stage61 WHERE company_id=? AND competence=? AND status='STAGED' LIMIT 1").bind(companyId,name).first();
  if(stage)error61(d,'A competencia '+name+' possui memoria de ferias ainda nao integrada ao calculo mensal. Nao calcule, revise ou feche a folha sem conciliacao.','VACATION_STAGE_NOT_INTEGRATED');
 }
 if(has('payroll_vacation_envelope_links58')){
  const rows=(await env.DB.prepare("SELECT r.plan_json FROM payroll_vacation_envelope_links58 l JOIN payroll_vacation_reconciliations55 r ON r.id=l.reconciliation_id AND r.company_id=l.company_id JOIN payroll_calc_runs v ON v.id=l.run_id AND v.company_id=l.company_id AND v.process_kind='VACATION' WHERE l.company_id=? AND l.status='ACTIVE' AND v.status IN ('CALCULATED','REVIEWED','APPROVED')").bind(companyId).all()).results||[];
  for(const row of rows){
   let plan;
   try{plan=JSON.parse(row.plan_json)}catch{error61(d,'Recibo de ferias registrado com dados invalidos.','VACATION_PLAN_INVALID')}
   if(plan?.periods?.some(p=>p.competence===name))
    error61(d,'Ha ferias de '+name+' registradas fora da folha mensal. A integracao tributaria precisa ser concluida antes de calcular ou fechar MONTHLY.','VACATION_MONTHLY_INTEGRATION_PENDING');
  }
 }
 return {blocked:false};
}
