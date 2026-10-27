// SAGAS folha v113 — auditoria LEITURA APENAS do 13º no D1 da empresa.
// Não cria tabelas, altera processamentos, gera títulos, nem contabiliza.
function error113(d,code,msg,status=409){throw new d.HttpError(status,msg,code)}
function year113(value,d){
 const year=String(value||'');
 if(!/^20(2[0-6])$/.test(year))error113(d,'YEAR_INVALID','Ano de 2020 a 2026.',400);
 return year;
}
const REQUIRED113=[
 'payroll_thirteenth_advances70','payroll_thirteenth_runs71','payroll_thirteenth_envelopes71',
 'payroll_thirteenth_postings111','payroll_thirteenth_payables111',
 'payroll_thirteenth_postings112','payroll_thirteenth_payables112',
 'payroll_provision_movements43','payroll_provision_postings45','payroll_provision_posted_movements45',
 'financial_payables','journal_entries','journal_lines','payroll_finance_batches38'
];
async function exists113(env,name){
 return !!(await env.DB.prepare("SELECT 1 AS found FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first());
}
async function first113(env,query,...params){return env.DB.prepare(query).bind(...params).first()}
async function rows113(env,query,...params){
 return (await env.DB.prepare(query).bind(...params).all()).results||[];
}
function integers113(...values){return values.every(x=>Number.isSafeInteger(Number(x))&&Number(x)>=0)}
export async function payrollThirteenthAudit113(c){
 const {env,companyId,auth,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 const year=year113(c.year,d),missing=[],present=[];
 for(const name of REQUIRED113)(await exists113(env,name)?present:missing).push(name);
 const findings=[],checks=[];
 const warn=(code,message,phase=null,runId=null)=>{
  findings.push({code,message,phase,run_id:runId});
 };
 for(const name of missing)warn('MISSING_SCHEMA','Tabela indisponível no D1: '+name+'.');
 if(missing.includes('payroll_thirteenth_runs71'))
  return {kind:'THIRTEENTH_AUDIT_V113',year,read_only:true,ready:false,
   missing_tables:missing,checks,findings,
   note:'Diagnóstico não altera D1. Publicação do Worker/migrações ainda não confirmada.'};
 const runs=await rows113(env,
  "SELECT id,calendar_year,phase,revision,status,source_fingerprint,employee_count,gross_cents,advance_cents,inss_cents,irrf_cents,fgts_cents,net_cents,created_at,approved_at FROM payroll_thirteenth_runs71 WHERE company_id=? AND calendar_year=? ORDER BY phase,revision DESC LIMIT 201",
  companyId,year);
 if(runs.length>200)warn('TOO_MANY_RUNS','Histórico excede 200 revisões: auditoria limitada.');
 if(!runs.length)warn('NO_CALCULATIONS','Nenhum cálculo do 13º encontrado para '+year+'.');
 for(const phase of ['FIRST','SECOND']){
  const entries=runs.filter(x=>x.phase===phase),r=entries[0];
  if(!r){
   checks.push({phase,status:'NOT_CALCULATED',run_id:null,revision:null,approved:false,integrated:false,issues:[]});
   continue;
  }
  const issues=[],block=(code,msg)=>{issues.push(code);warn(code,msg,phase,r.id)};
  const summary={phase,status:r.status,run_id:r.id,revision:r.revision,
   approved:r.status==='APPROVED',integrated:false,
   employee_count:r.employee_count,gross_cents:r.gross_cents,advance_cents:r.advance_cents,
   net_cents:r.net_cents,issues,payables_count:0,journal_ids:[],read_only:true};
  if(entries.filter(x=>x.status==='APPROVED').length>1)
   block('MULTIPLE_APPROVED','Mais de uma revisão aprovada para a mesma parcela.');
  if(!integers113(r.employee_count,r.gross_cents,r.advance_cents,r.inss_cents,r.irrf_cents,r.fgts_cents,r.net_cents))
   block('INVALID_RUN_TOTAL','Totais do processamento inválidos.');
  if(!missing.includes('payroll_thirteenth_envelopes71')){
   const e=await first113(env,
    "SELECT COUNT(*) AS count,COALESCE(SUM(gross_cents),0) AS gross,COALESCE(SUM(advance_cents),0) AS advance,COALESCE(SUM(inss_cents),0) AS inss,COALESCE(SUM(irrf_cents),0) AS irrf,COALESCE(SUM(fgts_cents),0) AS fgts,COALESCE(SUM(net_cents),0) AS net FROM payroll_thirteenth_envelopes71 WHERE company_id=? AND run_id=?",
    companyId,r.id);
   if(Number(e?.count)!==Number(r.employee_count)||Number(e?.gross)!==Number(r.gross_cents)||
     Number(e?.advance)!==Number(r.advance_cents)||Number(e?.inss)!==Number(r.inss_cents)||
     Number(e?.irrf)!==Number(r.irrf_cents)||Number(e?.fgts)!==Number(r.fgts_cents)||
     Number(e?.net)!==Number(r.net_cents))
    block('ENVELOPES_MISMATCH','Totais ou quantidade dos envelopes divergem da revisão.');
  }
  const table=phase==='FIRST'?'payroll_thirteenth_postings111':'payroll_thirteenth_postings112';
  const links=phase==='FIRST'?'payroll_thirteenth_payables111':'payroll_thirteenth_payables112';
  if(missing.includes(table)||missing.includes(links)){
   if(r.status==='APPROVED')block('INTEGRATION_SCHEMA_MISSING','A integração deste tipo ainda não possui todas as tabelas.');
   checks.push(summary);continue;
  }
  const posting=phase==='FIRST'?await first113(env,
   "SELECT run_id,company_id,journal_entry_id,source_fingerprint,payable_count,payable_total_cents FROM payroll_thirteenth_postings111 WHERE company_id=? AND run_id=?",
   companyId,r.id):await first113(env,
   "SELECT run_id,company_id,provision_posting_id,provision_journal_id,settlement_journal_id,source_fingerprint,provision_total_cents,payable_count,payable_total_cents FROM payroll_thirteenth_postings112 WHERE company_id=? AND run_id=?",
   companyId,r.id);
  if(!posting){checks.push(summary);continue;}
  summary.integrated=true;
  if(r.status!=='APPROVED')block('UNAPPROVED_POSTED','Há integração associada a cálculo não aprovado.');
  if(!posting.source_fingerprint)block('FINGERPRINT_MISSING','Integração sem fotografia de conferência.');
  const ids=phase==='FIRST'?[posting.journal_entry_id]:[posting.provision_journal_id,posting.settlement_journal_id];
  summary.journal_ids=ids;
  if(missing.includes('journal_entries')||missing.includes('journal_lines')){
   block('JOURNAL_SCHEMA_MISSING','Tabelas de diário contábil ausentes.');checks.push(summary);continue;
  }
  for(const id of ids){
   const entry=await first113(env,
    "SELECT id,status,source_module,source_reference,total_debit_cents,total_credit_cents FROM journal_entries WHERE company_id=? AND id=?",
    companyId,id);
   if(!entry||entry.status!=='POSTED'||entry.source_module!=='PAYROLL')
    block('JOURNAL_NOT_POSTED','Diário contabilizado indisponível, anulado ou com origem incorreta.');
   else{
    const line=await first113(env,
     "SELECT COALESCE(SUM(CASE WHEN side='D' THEN amount_cents ELSE 0 END),0) AS debit,COALESCE(SUM(CASE WHEN side='C' THEN amount_cents ELSE 0 END),0) AS credit FROM journal_lines WHERE company_id=? AND entry_id=?",
     companyId,id);
    if(Number(line?.debit)!==Number(entry.total_debit_cents)||Number(line?.credit)!==Number(entry.total_credit_cents)||
      Number(line?.debit)!==Number(line?.credit))
     block('JOURNAL_UNBALANCED','Saldos das partidas divergem do total do diário.');
    const expectedSource=phase==='FIRST'?'THIRTEENTH_FIRST:'+r.id:
      id===posting.provision_journal_id?'THIRTEENTH_SECOND_USE:'+r.id:'THIRTEENTH_SECOND_SETTLE:'+r.id;
    if(entry.source_reference!==expectedSource)
     block('WRONG_SOURCE_REFERENCE','Origem do diário não coincide com a parcela e revisão.');
    if(phase==='SECOND'&&id===posting.provision_journal_id&&
      Number(entry.total_debit_cents)!==Number(posting.provision_total_cents))
     block('PROVISION_JOURNAL_TOTAL','Diário de baixa diverge da provisão utilizada.');
   }
  }
  if(missing.includes('financial_payables')){
   block('PAYABLE_SCHEMA_MISSING','Tabela financeira ausente.');checks.push(summary);continue;
  }
  const finance=await first113(env,
   "SELECT COUNT(*) AS link_count,COUNT(p.id) AS payable_count,COALESCE(SUM(p.amount_cents),0) AS total_cents,COALESCE(SUM(CASE WHEN p.id IS NULL OR p.source_type<>'PAYROLL_THIRTEENTH' OR p.source_id<>l.run_id||':'||l.employee_id OR p.status='CANCELLED' THEN 1 ELSE 0 END),0) AS invalid_count FROM "+links+
   " l LEFT JOIN financial_payables p ON p.id=l.payable_id AND p.company_id=l.company_id WHERE l.company_id=? AND l.run_id=?",
   companyId,r.id);
  summary.payables_count=Number(finance?.payable_count||0);
  if(!integers113(finance?.link_count,finance?.payable_count,finance?.total_cents,finance?.invalid_count)||
    Number(finance?.link_count)!==Number(posting.payable_count)||
    Number(finance?.payable_count)!==Number(posting.payable_count)||
    Number(finance?.total_cents)!==Number(posting.payable_total_cents)||
    Number(finance?.invalid_count)!==0||Number(posting.payable_total_cents)!==Number(r.net_cents))
   block('FINANCIAL_MISMATCH','Títulos não conciliam com a quitação aprovada.');
  if(phase==='SECOND'){
   if(Number(posting.provision_total_cents)!==Number(r.gross_cents))
    block('PROVISION_TOTAL_MISMATCH','Baixa das provisões difere do 13º bruto aprovado.');
   if(missing.includes('payroll_provision_postings45')||
      missing.includes('payroll_provision_posted_movements45')||
      missing.includes('payroll_provision_movements43'))
    block('PROVISION_SCHEMA_MISSING','Faltam vínculos contábeis das provisões.');
   else{
    const p=await first113(env,
     "SELECT id,kind,competence,journal_entry_id,total_cents FROM payroll_provision_postings45 WHERE company_id=? AND id=?",
     companyId,posting.provision_posting_id);
    const moved=await first113(env,
     "SELECT COUNT(*) AS count,COALESCE(SUM(-m.amount_cents),0) AS total_cents FROM payroll_provision_posted_movements45 l JOIN payroll_provision_movements43 m ON m.id=l.movement_id AND m.company_id=l.company_id WHERE l.company_id=? AND l.posting_id=? AND m.component='DECIMO_TERCEIRO' AND m.movement_kind='USE'",
     companyId,posting.provision_posting_id);
    if(!p||p.kind!=='USE'||p.competence!==year+'-12'||p.journal_entry_id!==posting.provision_journal_id||
      Number(p.total_cents)!==Number(posting.provision_total_cents)||
      Number(moved?.total_cents)!==Number(posting.provision_total_cents)||
      Number(moved?.count)!==Number(r.employee_count))
     block('PROVISION_LINK_MISMATCH','Baixas das provisões não conciliam com os envelopes e o diário.');
   }
  }
  checks.push(summary);
 }
 return {kind:'THIRTEENTH_AUDIT_V113',year,read_only:true,
  ready:findings.length===0&&checks.every(x=>!x.integrated||!x.issues.length),
  missing_tables:missing,checks,findings,
  note:'Leitura de histórico, diários e títulos existentes; não comprova publicação do Worker, execução de CI ou pagamento bancário.'};
}