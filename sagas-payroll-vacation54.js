// SAGAS Folha v92 — processamento PRELIMINAR de férias e adiantamento documentado.
// NÃO homologado: registros de preparação e referência a pagamento EXTERNO.
// Nenhuma alteração de envelope mensal, contas a pagar, financeiro, FGTS ou contabilidade.
import { payrollVacation89 } from './sagas-payroll-vacation51.js';

function fail54(d,message,code='VACATION_PROCESSING_BLOCKED',status=409){
 throw new d.HttpError(status,message,code);
}
function day54(date,d){
 const s=String(date||'');
 if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])-[0-3]\d$/.test(s))fail54(d,'Data inválida.','INVALID_DATE',400);
 const x=new Date(s+'T00:00:00Z');
 if(!Number.isFinite(x.valueOf())||x.toISOString().slice(0,10)!==s)
  fail54(d,'Data não existe no calendário.','INVALID_DATE',400);
 return s;
}
function cents54(n,label,d){
 if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>99999999999)
  fail54(d,'Valor inválido em '+label+'.','INVALID_AMOUNT',400);
 return n;
}
function count54(a,b,d){
 day54(a,d);day54(b,d);
 if(b<a)fail54(d,'Datas de férias invertidas.','VACATION_DATES');
 const days=Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)+1;
 if(days<5||days>30)fail54(d,'Período de gozo fora da faixa de 5 a 30 dias.','VACATION_DAYS');
 return days;
}
function split54(amount,parts,d){
 cents54(amount,'valor a ratear',d);
 const total=parts.reduce((a,b)=>a+b,0);
 if(!total||parts.some(x=>!Number.isInteger(x)||x<0))fail54(d,'Dias inválidos no rateio.','INVALID_DAYS');
 let previous=0,cumulative=0;
 return parts.map(n=>{
  cumulative+=n;
  const v=Number((BigInt(amount)*BigInt(cumulative)+BigInt(Math.floor(total/2)))/BigInt(total));
  const part=v-previous;previous=v;return part;
 });
}
function months54(start,end,d){
 count54(start,end,d);
 const arr=[],cursor=new Date(start+'T00:00:00Z'),last=new Date(end+'T00:00:00Z');
 while(cursor<=last){
  const month=cursor.toISOString().slice(0,7);
  let current=arr[arr.length-1];
  if(!current||current.competence!==month){current={competence:month,days:0};arr.push(current)}
  current.days++;
  cursor.setUTCDate(cursor.getUTCDate()+1);
 }
 return arr;
}
export async function payrollVacationSchema54(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_processings54 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,occurrence_id TEXT NOT NULL REFERENCES payroll_employee_occurrences(id) ON DELETE RESTRICT,model_revision INTEGER NOT NULL CHECK(model_revision>0),source_fingerprint TEXT NOT NULL,snapshot_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('PREPARED','VOID')),prepared_by TEXT NOT NULL,prepared_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,voided_by TEXT,voided_at TEXT,void_reason TEXT)"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_vacation_prepared54 ON payroll_vacation_processings54(company_id,occurrence_id) WHERE status='PREPARED'"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_vacation_processings54 ON payroll_vacation_processings54(company_id,employee_id,occurrence_id,prepared_at)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_advances54 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,occurrence_id TEXT NOT NULL REFERENCES payroll_employee_occurrences(id) ON DELETE RESTRICT,processing_id TEXT NOT NULL REFERENCES payroll_vacation_processings54(id) ON DELETE RESTRICT,payment_date TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=99999999999),external_reference TEXT NOT NULL,notes TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('DECLARED','CANCELLED')),declared_by TEXT NOT NULL,declared_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,cancelled_by TEXT,cancelled_at TEXT,cancel_reason TEXT)"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_vacation_advance54 ON payroll_vacation_advances54(company_id,occurrence_id) WHERE status='DECLARED'"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_vacation_advance_by_process54 ON payroll_vacation_advances54(company_id,processing_id)")
 ]);
}
function snapshot54(preview,d){
 if(!preview?.configured||preview.status!=='MINUTA_BRUTA_NAO_HOMOLOGADA')
  fail54(d,'Conclua a memória de cálculo das férias antes de preparar processamento.','VACATION_MODEL_PENDING');
 const days=count54(preview.start_date,preview.end_date,d),components=[
  'vacation_cents','vacation_third_cents','abono_cents','abono_third_cents'
 ];
 for(const k of components)cents54(preview[k],k,d);
 const gross=cents54(preview.gross_estimate_cents,'total bruto',d);
 if(components.reduce((a,k)=>a+preview[k],0)!==gross)
  fail54(d,'Total bruto diverge da composição da minuta.','VACATION_AMOUNT_MISMATCH');
 if(preview.gozo_days!==days)fail54(d,'A quantidade de dias mudou na minuta.','VACATION_DAYS_MISMATCH');
 const slices=months54(preview.start_date,preview.end_date,d);
 const vacation=split54(preview.vacation_cents,slices.map(x=>x.days),d),
  third=split54(preview.vacation_third_cents,slices.map(x=>x.days),d);
 const periods=slices.map((x,i)=>({...x,
  vacation_cents:vacation[i],constitutional_third_cents:third[i],
  taxable_gross_cents:vacation[i]+third[i],
  proposal_codes:['FERIAS_GOZO','TERCO_FERIAS']
 }));
 const taxable=periods.reduce((a,x)=>a+x.taxable_gross_cents,0);
 if(taxable!==preview.vacation_cents+preview.vacation_third_cents)
  fail54(d,'Distribuição das férias não concilia com os valores brutos.','VACATION_SPLIT_MISMATCH');
 return {
  version:54,occurrence_id:preview.occurrence_id,employee:preview.employee,
  model_revision:preview.revision,acquisition_start:preview.acquisition_start,
  acquisition_end:preview.acquisition_end,start_date:preview.start_date,end_date:preview.end_date,
  gozo_days:preview.gozo_days,abono_days:preview.abono_days,entitled_days:preview.entitled_days,
  salary_cents:preview.salary_cents,salary_effective_from:preview.salary_effective_from,
  vacation_cents:preview.vacation_cents,vacation_third_cents:preview.vacation_third_cents,
  abono_cents:preview.abono_cents,abono_third_cents:preview.abono_third_cents,
  gross_cents:gross,periods,
  payment_deadline:preview.payment_deadline,
  status:'PROCESSAMENTO_PRELIMINAR',ready_for_payroll:false,
  ready_for_payment:false,ready_for_accounting:false
 };
}
async function getPrep54(env,companyId,occurrenceId){
 return await env.DB.prepare("SELECT id,company_id,employee_id,occurrence_id,model_revision,source_fingerprint,snapshot_json,status,prepared_by,prepared_at FROM payroll_vacation_processings54 WHERE company_id=? AND occurrence_id=? AND status='PREPARED' LIMIT 1").bind(companyId,occurrenceId).first();
}
async function advance54(env,companyId,occurrenceId){
 return await env.DB.prepare("SELECT id,processing_id,payment_date,amount_cents,external_reference,notes,status,declared_by,declared_at FROM payroll_vacation_advances54 WHERE company_id=? AND occurrence_id=? AND status='DECLARED' LIMIT 1").bind(companyId,occurrenceId).first();
}
async function blockers54(env,companyId,snapshot,d){
 const blockers=[],add=(code,message)=>{
  if(!blockers.some(x=>x.code===code&&x.message===message))blockers.push({code,message});
 };
 for(const p of snapshot.periods){
  const competent=await env.DB.prepare("SELECT id,status FROM payroll_competences WHERE company_id=? AND competence=? LIMIT 1").bind(companyId,p.competence).first();
  if(!competent){add('COMPETENCIA_PENDENTE','Competência '+p.competence+' não cadastrada.');continue}
  const prior=await env.DB.prepare("SELECT id,status FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY' ORDER BY revision DESC LIMIT 1").bind(companyId,competent.id).first();
  if(competent.status!=='OPEN'||prior?.status==='APPROVED')
   add('COMPETENCIA_FECHADA','A folha da competência '+p.competence+' está bloqueada/fechada.');
  if(prior){
   const duplicate=await env.DB.prepare("SELECT l.event_code FROM payroll_calc_envelopes e JOIN payroll_calc_lines l ON l.envelope_id=e.id AND l.company_id=e.company_id WHERE e.company_id=? AND e.run_id=? AND e.employee_id=? AND (l.event_code IN ('FERIAS_GOZO','TERCO_FERIAS','ABONO_FERIAS','TERCO_ABONO_FERIAS','ADIANTAMENTO_FERIAS','INSS_FERIAS','IRRF_FERIAS','FGTS_FERIAS') OR UPPER(l.event_code) LIKE '%FERIA%') LIMIT 1").bind(companyId,prior.id,snapshot.employee.id).first();
   if(duplicate)add('EVENTO_DUPLICADO','Já existe evento de férias ('+duplicate.event_code+') no envelope de '+p.competence+'.');
   const posted=await env.DB.prepare("SELECT run_id FROM payroll_finance_postings37 WHERE company_id=? AND run_id=? LIMIT 1").bind(companyId,prior.id).first();
   if(posted)add('LOTE_EXISTENTE','Folha da competência '+p.competence+' já foi contabilizada.');
  }
 }
 return blockers;
}
function projection54(snapshot,advance,d){
 // A antecipação documentada é uma referência de pagamento fora do SAGAS.
 // Rateio é meramente MATEMÁTICO para análise de risco: IRRF/INSS e a
 // compensação na folha ainda precisam ser homologados por competência.
 const declared=advance?cents54(Number(advance.amount_cents),'adiantamento',d):0;
 const portions=snapshot.periods.map(p=>p.taxable_gross_cents);
 const part=declared?split54(declared,portions,d):portions.map(()=>0);
 return {
  declared_advance_cents:declared,compensation_review: snapshot.periods.map((p,i)=>({
   competence:p.competence,gozo_days:p.days,
   vacation_cents:p.vacation_cents,third_cents:p.constitutional_third_cents,
   taxable_gross_cents:p.taxable_gross_cents,
   mathematical_advance_allocation_cents:part[i],posting_authorized:false
  })),
  notice:'Distribuição ilustrativa do adiantamento declarado; NÃO lançar estes valores no envelope. O abono e os descontos devem ser tratados separadamente.'
 };
}
export async function payrollVacation54(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 if(!['read','prepare','void','declare-advance','cancel-advance'].includes(action))
  fail54(d,'Ação de processamento de férias inválida.','NOT_FOUND',404);
 await d.requirePermission(env,auth.user.id,companyId,action==='read'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-vacation54',1,()=>payrollVacationSchema54(env));
 const id=String(action==='read'?c.occurrenceId||'':body.occurrence_id||'').trim();
 if(!id||id.length>128)fail54(d,'Selecione uma ocorrência de férias.','INVALID_OCCURRENCE',400);
 // A fonte é SEMPRE recalculada; não utilizar snapshot antigo como verdade atual.
 const model=await payrollVacation89('read',{env,companyId,auth,request,occurrenceId:id,body:{},d});
 if(!model.configured){
  const old=await getPrep54(env,companyId,id);
  return {prepared:!!old,stale:!!old,locked:true,
   note:'Memória de férias inexistente ou alterada. A preparação não pode ser utilizada.'};
 }
 const fresh=snapshot54(model,d),fingerprint=await d.hash(fresh);
 const existing=await getPrep54(env,companyId,id);
 const declared=await advance54(env,companyId,id);
 const sourceChanged=!!existing&&(existing.source_fingerprint!==fingerprint||Number(existing.model_revision)!==model.revision);
 const blockers=await blockers54(env,companyId,fresh,d);
 if(sourceChanged)blockers.push({code:'FONTE_ALTERADA',message:'A memória original foi modificada após o processamento. Anule o processamento para recalcular; não utilize valores antigos.'});
 if(action==='read'){
  const snapshot=existing?JSON.parse(existing.snapshot_json):fresh;
  return {
   prepared:!!existing,stale:sourceChanged,locked:sourceChanged,
   processing:existing?{id:existing.id,status:existing.status,model_revision:existing.model_revision,
    prepared_at:existing.prepared_at,prepared_by:existing.prepared_by}:null,
   employee:fresh.employee,occurrence_id:id,start_date:fresh.start_date,end_date:fresh.end_date,
   gross_cents:fresh.gross_cents,abono_cents:fresh.abono_cents+fresh.abono_third_cents,
   snapshot:existing?snapshot:null,
   advance:declared?{id:declared.id,processing_id:declared.processing_id,date:declared.payment_date,
    amount_cents:declared.amount_cents,external_reference:declared.external_reference,notes:declared.notes,
    declared_at:declared.declared_at}:null,
   ...projection54(existing?snapshot:fresh,declared,d),blockers,
   ready_for_payroll:false,ready_for_payment:false,ready_for_accounting:false,
   note:'Preparação documental; nenhuma compensação foi gravada na folha, nenhum título foi pago.'
  };
 }
 if(sourceChanged)fail54(d,'Memória alterada: anule a preparação antiga antes de criar nova.','PROCESSING_STALE');
 if(action==='prepare'){
  if(existing){
   if(existing.source_fingerprint===fingerprint)return {prepared:true,reused:true,processing_id:existing.id,
    model_revision:existing.model_revision,gross_cents:fresh.gross_cents,blockers};
   fail54(d,'Já existe preparação de férias para esta ocorrência.','PROCESSING_EXISTS');
  }
  if(body.confirmation!=='PREPARAR FERIAS')fail54(d,'Confirme digitando PREPARAR FERIAS.','CONFIRMATION_REQUIRED',400);
  if(blockers.some(x=>['COMPETENCIA_FECHADA','EVENTO_DUPLICADO','LOTE_EXISTENTE'].includes(x.code)))
   fail54(d,'Há folha fechada, evento duplicado ou lote existente. Resolva as pendências antes de preparar férias.','VACATION_DUPLICATE_RISK');
  const processId=d.uuid(),saved=JSON.stringify(fresh);
  try{
   await env.DB.prepare("INSERT INTO payroll_vacation_processings54(id,company_id,employee_id,occurrence_id,model_revision,source_fingerprint,snapshot_json,status,prepared_by) VALUES (?,?,?,?,?,?,?,'PREPARED',?)")
    .bind(processId,companyId,fresh.employee.id,id,model.revision,fingerprint,saved,auth.user.id).run();
  }catch(e){if(String(e.message||'').includes('UNIQUE'))fail54(d,'Outro usuário já preparou estas férias. Atualize a tela.','PROCESSING_CONFLICT');throw e}
  await d.audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'payroll_vacation_processings54',entityId:processId,request,
   before:null,after:{occurrence_id:id,model_revision:model.revision,gross_cents:fresh.gross_cents,fingerprint}});
  return {prepared:true,processing_id:processId,gross_cents:fresh.gross_cents,blockers,
   note:'Preparação gravada como rascunho operacional NÃO HOMOLOGADO.'};
 }
 if(!existing)fail54(d,'Prepare as férias antes de registrar adiantamento ou anular.','PROCESSING_REQUIRED');
 if(action==='void'){
  if(declared)fail54(d,'Cancele primeiro a referência de adiantamento registrada.','ADVANCE_EXISTS');
  if(body.confirmation!=='ANULAR PREPARACAO')fail54(d,'Confirme digitando ANULAR PREPARACAO.','CONFIRMATION_REQUIRED',400);
  const reason=String(body.notes||'').trim();
  if(reason.length<12||reason.length>500)fail54(d,'Justifique a anulação (12–500 caracteres).','INVALID_REASON',400);
  const updated=await env.DB.prepare("UPDATE payroll_vacation_processings54 SET status='VOID',voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=? WHERE company_id=? AND id=? AND status='PREPARED'")
   .bind(auth.user.id,reason,companyId,existing.id).run();
  if(updated.meta?.changes!==1)fail54(d,'Preparação alterada por outro usuário.','VERSION_CONFLICT');
  await d.audit(env,{companyId,userId:auth.user.id,action:'VOID',entity:'payroll_vacation_processings54',entityId:existing.id,request,
   before:{status:'PREPARED'},after:{status:'VOID',reason}});
  return {voided:true};
 }
 if(action==='declare-advance'){
  if(declared)fail54(d,'Já existe adiantamento declarado. Cancele a referência anterior antes de corrigir.','ADVANCE_ALREADY_DECLARED');
  if(body.confirmation!=='PAGAMENTO EXTERNO CONFERIDO')
   fail54(d,'Confirme digitando PAGAMENTO EXTERNO CONFERIDO.','CONFIRMATION_REQUIRED',400);
  const amount=cents54(body.amount_cents,'valor do comprovante',d);
  if(amount<=0||amount>fresh.gross_cents)fail54(d,'Informe o valor positivo efetivamente pago, limitado ao bruto das férias.','ADVANCE_AMOUNT');
  const paymentDate=day54(body.payment_date,d);
  if(paymentDate>fresh.end_date)fail54(d,'Data de pagamento posterior ao fim do gozo; revise o documento.','ADVANCE_DATE');
  const reference=String(body.external_reference||'').trim();
  if(reference.length<6||reference.length>160)fail54(d,'Informe o número ou identificação do comprovante (6–160 caracteres).','PAYMENT_REFERENCE');
  const notes=String(body.notes||'').trim();
  if(notes.length<12||notes.length>500)fail54(d,'Descreva a conferência do pagamento (12–500 caracteres).','PAYMENT_NOTES');
  const advanceId=d.uuid();
  try{
   await env.DB.prepare("INSERT INTO payroll_vacation_advances54(id,company_id,employee_id,occurrence_id,processing_id,payment_date,amount_cents,external_reference,notes,status,declared_by) SELECT ?,?,?,?,?,?,?,?,?,'DECLARED',? WHERE EXISTS(SELECT 1 FROM payroll_vacation_processings54 WHERE id=? AND company_id=? AND occurrence_id=? AND source_fingerprint=? AND status='PREPARED')")
    .bind(advanceId,companyId,fresh.employee.id,id,existing.id,paymentDate,amount,reference,notes,auth.user.id,existing.id,companyId,id,fingerprint).run();
  }catch(e){if(String(e.message||'').includes('UNIQUE'))fail54(d,'Adiantamento já declarado por outra sessão.','ADVANCE_CONFLICT');throw e}
  await d.audit(env,{companyId,userId:auth.user.id,action:'DECLARE',entity:'payroll_vacation_advances54',entityId:advanceId,request,
   before:null,after:{occurrence_id:id,processing_id:existing.id,payment_date:paymentDate,amount_cents:amount,external_reference:reference}});
  return {declared:true,advance_id:advanceId,amount_cents:amount,
   note:'Referência documental gravada; NÃO foi emitido pagamento, financeiro nem desconto na folha.'};
 }
 if(action==='cancel-advance'){
  if(!declared)fail54(d,'Não existe declaração de adiantamento ativa.','NOT_FOUND',404);
  if(body.confirmation!=='CANCELAR REFERENCIA')
   fail54(d,'Confirme digitando CANCELAR REFERENCIA.','CONFIRMATION_REQUIRED',400);
  const reason=String(body.notes||'').trim();
  if(reason.length<12||reason.length>500)fail54(d,'Justifique o cancelamento (12–500 caracteres).','INVALID_REASON',400);
  const updated=await env.DB.prepare("UPDATE payroll_vacation_advances54 SET status='CANCELLED',cancelled_by=?,cancelled_at=CURRENT_TIMESTAMP,cancel_reason=? WHERE id=? AND company_id=? AND status='DECLARED'")
   .bind(auth.user.id,reason,declared.id,companyId).run();
  if(updated.meta?.changes!==1)fail54(d,'Adiantamento alterado por outra sessão.','VERSION_CONFLICT');
  await d.audit(env,{companyId,userId:auth.user.id,action:'CANCEL',entity:'payroll_vacation_advances54',entityId:declared.id,request,
   before:{status:'DECLARED',amount_cents:declared.amount_cents},after:{status:'CANCELLED',reason}});
  return {cancelled:true,note:'Declaração cancelada no SAGAS; esta operação não estorna transações bancárias.'};
 }
}
