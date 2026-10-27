// SAGAS v118 — painel integrado de rescisão: líquido, provisões operacionais e pendências.
// NÃO autoriza TRCT, baixa, folha, títulos, journal, FGTS ou alteração cadastral.
import {payrollTermination117} from './sagas-payroll-termination117.js';

const PARTS118=['FERIAS','TERCO_FERIAS','DECIMO_TERCEIRO'];
const MAX118=99999999999;
function fail118(d,code,message,status=409){throw new d.HttpError(status,message,code)}
function cents118(x){return typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=MAX118}
function sum118(...values){
 if(!values.every(cents118))return null;
 const total=values.reduce((s,x)=>s+BigInt(x),0n);
 return total>BigInt(MAX118)?null:Number(total);
}
function saldo118(value){const n=Number(value);return Number.isSafeInteger(n)&&Math.abs(n)<=MAX118?n:null}
function block118(list,code,message,area){
 if(!list.some(x=>x.code===code&&x.area===area))list.push({area,code,message});
}
export function diagnose118(review,rows=[],postings=null,mapping=null,existing=null){
 const blocks=[],warnings=[],date=String(review.termination_date||'');
 const financial={
  gross_reference_cents:cents118(review.full_gross_reference_cents)?review.full_gross_reference_cents:null,
  deductions_reference_cents:cents118(review.deductions_total_cents)?review.deductions_total_cents:null,
  net_reference_cents:cents118(review.net_reference_cents)?review.net_reference_cents:null,
  fgts_fine_reference_cents:cents118(review.fgts_fine_reference_cents)?review.fgts_fine_reference_cents:null,
  payable_created:false,posted:false
 };
 if(!review.documentary_ready)block118(blocks,'DOCUMENTS_PENDING','Conciliação de férias, médias e documentos ainda não concluída.','DOCUMENTOS');
 if(!review.deduction_ready||financial.net_reference_cents===null)
  block118(blocks,'DEDUCTIONS_PENDING','Descontos e líquido de referência ainda não conciliados.','FINANCEIRO');
 if(!review.tax_ready_for_review)
  block118(blocks,'TAX_REVIEW_PENDING','INSS e IRRF não estão integralmente conciliados com os descontos informados.','TRIBUTOS');
 if(!review.employee?.cost_center_id)
  block118(blocks,'COST_CENTER_MISSING','Funcionário sem centro de custo válido na fotografia histórica.','CONTABILIDADE');
 if(!cents118(financial.gross_reference_cents))
  block118(blocks,'GROSS_NOT_VALIDATED','Bruto documental não disponível ou inválido.','DOCUMENTOS');
 if(financial.net_reference_cents!==null&&financial.deductions_reference_cents!==null&&financial.gross_reference_cents!==null&&
    financial.gross_reference_cents-financial.deductions_reference_cents!==financial.net_reference_cents)
  block118(blocks,'NET_MISMATCH','Líquido não corresponde ao bruto menos os descontos documentados.','FINANCEIRO');
 const a=review.amounts||{};
 const targets={
  FERIAS:sum118(a.vacation_proportional_cents,a.vacation_accrued_unpaid_cents),
  TERCO_FERIAS:sum118(a.vacation_third_cents,a.vacation_accrued_third_cents),
  DECIMO_TERCEIRO:sum118(a.thirteenth_cents,a.thirteenth_notice_projection_cents)
 };
 const provisionItems=[];
 const byName=new Map();
 for(const r of rows||[]){
  if(!PARTS118.includes(r.component)||byName.has(r.component)){
   block118(blocks,'LEDGER_DUPLICATED','Consulta devolveu componentes duplicados ou desconhecidos.','PROVISOES');continue;
  }
  byName.set(r.component,r);
 }
 if(rows===null)block118(blocks,'LEDGER_UNAVAILABLE','Razão operacional de provisões indisponível.','PROVISOES');
 if(!rows?.length)block118(blocks,'LEDGER_EMPTY','Nenhum movimento de provisão encontrado até a competência.','PROVISOES');
 const postedByName=new Map();
 for(const item of postings||[]){
  if(PARTS118.includes(item.component))postedByName.set(item.component,item);
 }
 let allAccounted=postings!==null;
 for(const part of PARTS118){
  const r=byName.get(part),balance=r?saldo118(r.balance_cents):0;
  const opening=r?saldo118(r.opening_cents):0;
  const accrued=r?saldo118(r.accrued_cents):0;
  const used=r?saldo118(r.used_cents):0;
  const target=targets[part];
  const posting=postedByName.get(part);
  if([balance,opening,accrued,used,target].some(v=>v===null)){
   block118(blocks,'LEDGER_AMOUNT_INVALID','Saldo ou direito acima do limite em '+part+'.','PROVISOES');
   provisionItems.push({component:part,target_cents:target,balance_cents:balance,proposed_use_cents:null,
    uncovered_reference_cents:null,accounting_verified:false});continue;
  }
  if(r&&opening+accrued-used!==balance)
   block118(blocks,'LEDGER_TOTAL_MISMATCH','Saldos não conciliam com movimentos em '+part+'.','PROVISOES');
  if(r&&Number(r.cost_center_conflicts||0)>0)
   block118(blocks,'PROVISION_CENTER_MISMATCH','Há movimentos históricos de '+part+' sem centro de custo ou vinculados a outro centro. Reconciliar antes de baixar.','CONTABILIDADE');
  if(balance<0){
   block118(blocks,'LEDGER_NEGATIVE','Saldo operacional negativo em '+part+'.','PROVISOES');
  }
  if(!r)block118(blocks,'LEDGER_COMPONENT_MISSING','Sem histórico da provisão '+part+'.','PROVISOES');
  const use=Math.min(Math.max(0,balance),target);
  const pending=posting?Number(posting.pending_count):null;
  const verified=postings!==null&&r&&Number.isSafeInteger(pending)&&pending===0;
  if(!verified){allAccounted=false;
   block118(blocks,'PROVISION_ACCOUNTING_NOT_VERIFIED','Movimentos sem vínculo com diário POSTED válido para '+part+'.','CONTABILIDADE');
  }
  provisionItems.push({component:part,opening_cents:opening,accrued_cents:accrued,
   use_history_cents:used,balance_cents:balance,target_cents:target,proposed_use_cents:use,
   uncovered_reference_cents:target-use,remaining_reference_cents:Math.max(0,balance-use),
   accounting_verified:!!verified,unposted_movement_count:pending,operational_only:true});
 }
 if(postings===null)
  block118(blocks,'POSTINGS_UNAVAILABLE','Não foi possível verificar os vínculos de contabilização das provisões.','CONTABILIDADE');
 const map=Array.isArray(mapping)?mapping:[];
 const mapBy=new Map(map.map(x=>[x.component,x]));
 for(const item of provisionItems){
  if(item.proposed_use_cents===null||item.proposed_use_cents<=0)continue;
  const m=mapBy.get(item.component);
  if(!m||Number(m.active)!==1||m.synthetic_analytic!=='ANALYTIC'){
   block118(blocks,'USE_NATURE_MISSING','Natureza orçamentária de baixa não configurada/ativa para '+item.component+'.','CONTABILIDADE');
   continue;
  }
  if(!Array.isArray(m.account_rules)){
   block118(blocks,'USE_ACCOUNTS_UNAVAILABLE','Contas da natureza não foram consultadas para '+item.component+'.','CONTABILIDADE');
   continue;
  }
  for(const side of ['D','C']){
   const available=m.account_rules.filter(x=>x.side===side);
   const specific=available.filter(x=>x.cost_center_id===review.employee?.cost_center_id);
   const chosen=specific.length?specific:available.filter(x=>!x.cost_center_id);
   const percentages=chosen.map(x=>Number(x.percentage));
   if(!chosen.length||percentages.some(x=>!Number.isFinite(x)||x<=0||x>100)||
      Math.abs(percentages.reduce((a,b)=>a+b,0)-100)>0.0001||
      chosen.some(x=>Number(x.account_active)!==1||Number(x.account_analytic)!==1))
    block118(blocks,'USE_ACCOUNT_MAPPING_INVALID','Natureza '+item.component+' sem mapeamento '+side+' válido (100%, conta analítica ativa) para o centro de custo.','CONTABILIDADE');
  }
 }
 if(mapping===null)block118(blocks,'MAPPINGS_UNAVAILABLE','Mapeamentos contábeis não disponíveis para conferência.','CONTABILIDADE');
 if(!existing||existing.source_fingerprint!==review.source_fingerprint)
  block118(blocks,'TAX_WORKPAPER_MISSING','Registre a memória tributária DRAFT da revisão atual antes de avançar com a preparação do fechamento.','AUDITORIA');
 for(const p of review.problems||[]){
  block118(blocks,'SOURCE_'+String(p.code||'UNKNOWN'),String(p.message||'Pendência da prévia original.'),'LEGAL');
 }
 for(const p of review.tax_issues||[]){
  block118(blocks,'TAX_'+String(p.code||'UNKNOWN'),String(p.message||'Pendência tributária.'),'TRIBUTOS');
 }
 for(const p of review.documentary_issues||[]){
  block118(blocks,'DOC_'+String(p.code||'UNKNOWN'),String(p.message||'Pendência documental.'),'DOCUMENTOS');
 }
 if(review.termination_kind==='WITHOUT_CAUSE'&&!cents118(financial.fgts_fine_reference_cents))
  block118(blocks,'FGTS_NOT_ATTESTED','Multa do FGTS sem memória referencial documentada.','FGTS');
 if(date.slice(0,4)!=='2026')
  block118(blocks,'YEAR_NOT_SUPPORTED','Rescisões fora de 2026 exigem tabelas próprias.','TRIBUTOS');
 warnings.push('Saldos de provisão são operacionais; só podem ser baixados na contabilidade após conciliar o passivo efetivamente contabilizado.');
 warnings.push('Uso estimado de provisão não é lançamento: a conta e o centro de custo devem ser conferidos em sua natureza orçamentária.');
 warnings.push('O financeiro permanece somente como referência; nenhum título, guia, pagamento, diário ou alteração funcional é criado.');
 return {kind:'TERMINATION_CONSOLIDATED_REVIEW_V118',employee:review.employee,
  termination_date:review.termination_date,termination_kind:review.termination_kind,notice_kind:review.notice_kind,
  source_fingerprint:review.source_fingerprint,
  financial,provision_items:provisionItems,blocks,warnings,
  tax_ready_for_review:!!review.tax_ready_for_review,
  provision_accounting_checked:allAccounted,
  tax_workpaper_recorded:!!existing&&existing.source_fingerprint===review.source_fingerprint,
  total_blocks:blocks.length,
  diagnostic_ready:!!review.documentary_ready,
  ready_for_closing:false,ready_for_posting:false,read_only:true,
  financial_generated:false,accounting_generated:false,employee_status_changed:false};
}
async function schema118(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_termination_diagnostics118 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,termination_date TEXT NOT NULL,kind TEXT NOT NULL,notice_kind TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),source_fingerprint TEXT NOT NULL,snapshot_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status='DRAFT'),recorded_by TEXT NOT NULL,recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,employee_id,termination_date,kind,notice_kind,revision))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_term_diagnostics118 ON payroll_termination_diagnostics118(company_id,employee_id,termination_date,revision)")
 ]);
}
async function snapshot118(c){
 const review=await payrollTermination117('preview',c);
 const period=String(review.termination_date||'').slice(0,7);
 const id=review.employee?.id;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||!id)
  fail118(c.d,'INVALID_TERMINATION_PREVIEW','Prévia sem funcionário ou competência válida.');
 const {env,companyId}=c;
 const rows=(await env.DB.prepare(
  "SELECT component,COALESCE(SUM(CASE WHEN movement_kind='OPENING' THEN amount_cents ELSE 0 END),0) AS opening_cents,COALESCE(SUM(CASE WHEN movement_kind='ACCRUAL' THEN amount_cents ELSE 0 END),0) AS accrued_cents,COALESCE(-SUM(CASE WHEN movement_kind='USE' THEN amount_cents ELSE 0 END),0) AS used_cents,COALESCE(SUM(amount_cents),0) AS balance_cents,COUNT(*) AS movement_count,SUM(CASE WHEN cost_center_id IS NULL OR cost_center_id<>? THEN 1 ELSE 0 END) AS cost_center_conflicts FROM payroll_provision_movements43 WHERE company_id=? AND employee_id=? AND competence<=? GROUP BY component ORDER BY component"
 ).bind(review.employee.cost_center_id||'',companyId,id,period).all()).results||[];
 let postings=null,mapping=null;
 try{
  postings=(await env.DB.prepare(
   "SELECT m.component,COUNT(*) AS movement_count,SUM(CASE WHEN p.movement_id IS NULL OR z.id IS NULL OR j.id IS NULL OR j.status<>'POSTED' THEN 1 ELSE 0 END) AS pending_count FROM payroll_provision_movements43 m LEFT JOIN payroll_provision_posted_movements45 p ON p.company_id=m.company_id AND p.movement_id=m.id LEFT JOIN payroll_provision_postings45 z ON z.id=p.posting_id AND z.company_id=m.company_id LEFT JOIN journal_entries j ON j.id=z.journal_entry_id AND j.company_id=m.company_id WHERE m.company_id=? AND m.employee_id=? AND m.competence<=? AND m.movement_kind IN ('ACCRUAL','USE') GROUP BY m.component ORDER BY m.component"
  ).bind(companyId,id,period).all()).results||[];
 }catch(e){
  if(!/no such table/i.test(String(e)))throw e;
 }
 try{
  mapping=(await env.DB.prepare(
   "SELECT u.component,u.nature_id,n.active,n.synthetic_analytic FROM payroll_provision_use_natures45 u LEFT JOIN budget_natures n ON n.id=u.nature_id AND n.company_id=u.company_id WHERE u.company_id=?"
  ).bind(companyId).all()).results||[];
  for(const m of mapping){
   m.account_rules=(await env.DB.prepare(
    "SELECT b.side,b.account_id,b.percentage,b.cost_center_id,a.active AS account_active,a.analytic AS account_analytic FROM budget_nature_accounts b LEFT JOIN accounts a ON a.id=b.account_id AND a.company_id=b.company_id WHERE b.company_id=? AND b.nature_id=? ORDER BY b.side,b.id"
   ).bind(companyId,m.nature_id).all()).results||[];
  }
 }catch(e){if(!/no such table/i.test(String(e)))throw e;}
 const existing=await env.DB.prepare(
  "SELECT id,source_fingerprint FROM payroll_termination_tax_workpapers117 WHERE company_id=? AND employee_id=? AND termination_date=? AND kind=? AND notice_kind=? ORDER BY revision DESC LIMIT 1"
 ).bind(companyId,id,review.termination_date,review.termination_kind,review.notice_kind).first();
 const result=diagnose118(review,rows,postings,mapping,existing);
 const items=result.provision_items;
 result.source_fingerprint=await c.d.hash({version:118,review:review.source_fingerprint,
  ledger:rows,posting_links:postings,mapping,workpaper:existing,
  provision_items:items,blocks:result.blocks});
 return result;
}
export async function payrollTermination118(action,c){
 const {env,companyId,auth,d,request,body={}}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='record'?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-termination-preclose118',1,()=>schema118(env));
 if(action==='history'){
  const runs=(await env.DB.prepare("SELECT id,termination_date,kind,notice_kind,revision,status,recorded_at FROM payroll_termination_diagnostics118 WHERE company_id=? AND employee_id=? ORDER BY termination_date DESC,revision DESC LIMIT 100")
   .bind(companyId,String(c.employeeId||'')).all()).results||[];
  return {runs,read_only:true};
 }
 if(action==='detail'){
  const run=await env.DB.prepare("SELECT * FROM payroll_termination_diagnostics118 WHERE company_id=? AND id=?")
   .bind(companyId,String(c.runId||'')).first();
  if(!run)fail118(d,'NOT_FOUND','Diagnóstico de rescisão não encontrado.',404);
  return {run,snapshot:JSON.parse(run.snapshot_json),read_only:true};
 }
 if(action==='preview')return snapshot118(c);
 if(action==='record'){
  if(body.confirmation!=='REGISTRAR DIAGNOSTICO RESCISAO')
   fail118(d,'CONFIRMATION_REQUIRED','Digite REGISTRAR DIAGNOSTICO RESCISAO.',400);
  const current=await snapshot118(c);
  if(current.source_fingerprint!==body.source_fingerprint)
   fail118(d,'PREVIEW_CHANGED','Saldo, mapeamento, documentos ou cálculo mudaram; consulte novamente.');
  const previous=await env.DB.prepare(
   "SELECT id,revision,source_fingerprint FROM payroll_termination_diagnostics118 WHERE company_id=? AND employee_id=? AND termination_date=? AND kind=? AND notice_kind=? ORDER BY revision DESC LIMIT 1"
  ).bind(companyId,current.employee.id,current.termination_date,current.termination_kind,current.notice_kind).first();
  if(previous?.source_fingerprint===current.source_fingerprint)
   return {reused:true,id:previous.id,revision:previous.revision,status:'DRAFT',ready_for_closing:false};
  const revision=Number(previous?.revision||0)+1;
  if(!Number.isSafeInteger(revision)||revision>99999)fail118(d,'REVISION_LIMIT','Excesso de revisões.');
  const id=d.uuid();
  try{
   await env.DB.prepare("INSERT INTO payroll_termination_diagnostics118(id,company_id,employee_id,termination_date,kind,notice_kind,revision,source_fingerprint,snapshot_json,status,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,'DRAFT',?)")
    .bind(id,companyId,current.employee.id,current.termination_date,current.termination_kind,
     current.notice_kind,revision,current.source_fingerprint,JSON.stringify(current),auth.user.id).run();
  }catch(e){
   if(/UNIQUE|constraint failed/i.test(String(e)))fail118(d,'CONCURRENT_RECORD','Diagnóstico alterado em outra operação. Atualize a consulta.');
   throw e;
  }
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'CREATE',
   entity:'payroll_termination_diagnostics118',entityId:id,
   after:{employee_id:current.employee.id,termination_date:current.termination_date,revision,
    blocked_count:current.total_blocks,ready_for_closing:false}});
  return {created:true,id,revision,status:'DRAFT',block_count:current.total_blocks,
   ready_for_closing:false,financial_generated:false,accounting_generated:false,employee_status_changed:false};
 }
 fail118(d,'NOT_FOUND','Ação de rescisão não encontrada.',404);
}
