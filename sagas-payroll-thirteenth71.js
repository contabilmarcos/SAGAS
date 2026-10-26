// SAGAS folha v110 - memoria imutavel e aprovacao do calculo do 13o.
// Somente fotografias do calculo; NUNCA abre contas a pagar, paga banco, gera guia ou contabiliza.
import { payrollThirteenth70 } from './sagas-payroll-thirteenth70.js';

function fail71(d,code,message,status=409){throw new d.HttpError(status,message,code)}
function year71(x,d){
 const value=String(x||'');
 if(!/^20(2[0-6])$/.test(value))fail71(d,'YEAR_INVALID','Ano deve ser de 2020 a 2026.',400);
 return value;
}
function phase71(x,d){
 const value=String(x||'');
 if(!['FIRST','SECOND'].includes(value))fail71(d,'PHASE_INVALID','Informe FIRST ou SECOND.',400);
 return value;
}
async function schema71(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_thirteenth_runs71 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,calendar_year TEXT NOT NULL,phase TEXT NOT NULL CHECK(phase IN ('FIRST','SECOND')),revision INTEGER NOT NULL CHECK(revision>0),status TEXT NOT NULL CHECK(status IN ('CALCULATED','APPROVED')),source_fingerprint TEXT NOT NULL,employee_count INTEGER NOT NULL CHECK(employee_count>0),gross_cents INTEGER NOT NULL CHECK(gross_cents>=0),advance_cents INTEGER NOT NULL CHECK(advance_cents>=0),inss_cents INTEGER NOT NULL CHECK(inss_cents>=0),irrf_cents INTEGER NOT NULL CHECK(irrf_cents>=0),fgts_cents INTEGER NOT NULL CHECK(fgts_cents>=0),net_cents INTEGER NOT NULL CHECK(net_cents>=0),created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,approved_by TEXT,approved_at TEXT,UNIQUE(company_id,calendar_year,phase,revision))"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_thirteenth_runs71 ON payroll_thirteenth_runs71(company_id,calendar_year,phase,revision)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_thirteenth_envelopes71 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,run_id TEXT NOT NULL REFERENCES payroll_thirteenth_runs71(id) ON DELETE RESTRICT,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,cost_center_id TEXT NOT NULL,employee_code TEXT,employee_name TEXT NOT NULL,avos INTEGER NOT NULL CHECK(avos BETWEEN 0 AND 12),salary_cents INTEGER NOT NULL CHECK(salary_cents>0),gross_cents INTEGER NOT NULL CHECK(gross_cents>=0),advance_cents INTEGER NOT NULL CHECK(advance_cents>=0),inss_cents INTEGER NOT NULL CHECK(inss_cents>=0),irrf_cents INTEGER NOT NULL CHECK(irrf_cents>=0),fgts_cents INTEGER NOT NULL CHECK(fgts_cents>=0),net_cents INTEGER NOT NULL CHECK(net_cents>=0),snapshot_json TEXT NOT NULL,UNIQUE(run_id,employee_id))")
 ]);
}
function summary71(p){
 return {gross_cents:p.totals.gross_cents,
  advance_cents:p.phase==='FIRST'?p.totals.estimated_advance_cents:p.totals.advance_cents,
  inss_cents:p.totals.inss_cents,irrf_cents:p.totals.irrf_cents,
  fgts_cents:p.totals.fgts_cents,net_cents:p.totals.net_cents};
}
async function history71(env,companyId,year,phase){
 const sql="SELECT id,calendar_year,phase,revision,status,source_fingerprint,employee_count,gross_cents,advance_cents,inss_cents,irrf_cents,fgts_cents,net_cents,created_at,approved_at FROM payroll_thirteenth_runs71 WHERE company_id=? AND calendar_year=?";
 const filter=phase?" AND phase=?":"";
 const args=phase?[companyId,year,phase]:[companyId,year];
 return (await env.DB.prepare(sql+filter+" ORDER BY phase,revision DESC LIMIT 120").bind(...args).all()).results||[];
}
async function detail71(env,companyId,id,d){
 const run=await env.DB.prepare("SELECT * FROM payroll_thirteenth_runs71 WHERE company_id=? AND id=?").bind(companyId,id).first();
 if(!run)fail71(d,'RUN_NOT_FOUND','Processamento do 13o nao encontrado.',404);
 const lines=(await env.DB.prepare("SELECT employee_id,employee_code,employee_name,cost_center_id,avos,salary_cents,gross_cents,advance_cents,inss_cents,irrf_cents,fgts_cents,net_cents,snapshot_json FROM payroll_thirteenth_envelopes71 WHERE company_id=? AND run_id=? ORDER BY employee_name,employee_id").bind(companyId,id).all()).results||[];
 const sum=name=>lines.reduce((n,x)=>n+Number(x[name]||0),0);
 if(lines.length!==Number(run.employee_count)||['gross_cents','advance_cents','inss_cents','irrf_cents','fgts_cents','net_cents'].some(k=>sum(k)!==Number(run[k])))
  fail71(d,'RUN_MISMATCH','Envelopes e total do processamento nao conferem.');
 return {run,employees:lines.map(x=>({...x,snapshot:JSON.parse(x.snapshot_json),snapshot_json:undefined})),
  accounting_generated:false,financial_generated:false,read_only:true};
}
export async function payrollThirteenth71(action,c){
 const {env,companyId,auth,d,request,body={}}=c;
 await d.requirePermission(env,auth.user.id,companyId,['history','detail'].includes(action)?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-thirteenth-runs71',1,()=>schema71(env));
 if(action==='history')return {year:year71(c.year,d),runs:await history71(env,companyId,year71(c.year,d),c.phase?phase71(c.phase,d):null)};
 if(action==='detail')return detail71(env,companyId,String(c.runId||''),d);
 if(action==='calculate'){
  if(body.confirmation!=='CALCULAR 13')fail71(d,'CONFIRMATION_REQUIRED','Digite CALCULAR 13.',400);
  const year=year71(body.year,d),phase=phase71(body.phase,d);
  const preview=await payrollThirteenth70('preview',{...c,year,phase});
  if(preview.source_fingerprint!==body.source_fingerprint)
   fail71(d,'PREVIEW_STALE','A previa do 13o mudou. Atualize antes de calcular.');
  if(preview.problems.length||preview.totals.blocked||!preview.employee_count)
   fail71(d,'PREVIEW_BLOCKED','Resolva todas as pendencias dos empregados e da competencia antes de gravar.');
  if(preview.items.length>90)fail71(d,'RUN_LIMIT','O registro esta limitado a 90 empregados por revisao.');
  const previous=(await history71(env,companyId,year,phase))[0]||null;
  if(previous?.source_fingerprint===preview.source_fingerprint)
   return {reused:true,run_id:previous.id,revision:previous.revision,status:previous.status};
  if(previous&&previous.status!=='CALCULATED')
   fail71(d,'PREVIOUS_APPROVED','Ja existe calculo aprovado desta parcela. Nao e permitido sobrescrever.');
  const revision=previous?Number(previous.revision)+1:1;
  if(revision>99999)fail71(d,'REVISION_LIMIT','Muitas revisoes de calculo.');
  const id=d.uuid(),total=summary71(preview),statements=[
   env.DB.prepare("INSERT INTO payroll_thirteenth_runs71 (id,company_id,calendar_year,phase,revision,status,source_fingerprint,employee_count,gross_cents,advance_cents,inss_cents,irrf_cents,fgts_cents,net_cents,created_by) VALUES (?,?,?,?,?,'CALCULATED',?,?,?,?,?,?,?,?,?)")
    .bind(id,companyId,year,phase,revision,preview.source_fingerprint,preview.employee_count,
     total.gross_cents,total.advance_cents,total.inss_cents,total.irrf_cents,total.fgts_cents,total.net_cents,auth.user.id)
  ];
  for(const employee of preview.items){
   const a=employee.calculation;
   if(!a||!employee.ready||!Number.isSafeInteger(a.net_cents)||!Number.isSafeInteger(a.gross_cents))
    fail71(d,'ENVELOPE_INVALID','Funcionario sem calculo completo.');
   const adv=phase==='FIRST'?a.estimated_advance_cents:a.advance_cents;
   statements.push(env.DB.prepare(
    "INSERT INTO payroll_thirteenth_envelopes71 (id,company_id,run_id,employee_id,cost_center_id,employee_code,employee_name,avos,salary_cents,gross_cents,advance_cents,inss_cents,irrf_cents,fgts_cents,net_cents,snapshot_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
   ).bind(d.uuid(),companyId,id,employee.employee_id,employee.cost_center_id,
    employee.employee_code,employee.employee_name,employee.avos,employee.reference_salary_cents,
    a.gross_cents,adv,a.inss_cents,a.irrf_cents,a.fgts_cents,a.net_cents,JSON.stringify(employee)));
  }
  if(statements.length>100)fail71(d,'RUN_LIMIT','Limite seguro da transacao excedido.');
  try{
   const results=await env.DB.batch(statements);
   if(results.some(x=>!x.success))fail71(d,'TRANSACTION_FAILED','Transacao do processamento nao foi concluida.');
  }catch(e){
   if(/UNIQUE|constraint failed/i.test(String(e)))fail71(d,'VERSION_CONFLICT','Processamento ja alterado. Atualize a consulta.');
   throw e;
  }
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'CALCULATE',
   entity:'payroll_thirteenth_runs71',entityId:id,after:{year,phase,revision,total}});
  return {created:true,run_id:id,revision,status:'CALCULATED',employee_count:preview.employee_count,
   totals:total,financial_generated:false,accounting_generated:false};
 }
 if(action==='approve'){
  if(body.confirmation!=='APROVAR CALCULO 13')fail71(d,'CONFIRMATION_REQUIRED','Digite APROVAR CALCULO 13.',400);
  const id=String(body.run_id||'');
  const run=await env.DB.prepare("SELECT * FROM payroll_thirteenth_runs71 WHERE company_id=? AND id=?").bind(companyId,id).first();
  if(!run)fail71(d,'RUN_NOT_FOUND','Calculo nao encontrado.',404);
  if(run.status==='APPROVED')return {reused:true,run_id:id,status:'APPROVED'};
  if(run.status!=='CALCULATED')fail71(d,'RUN_STATUS','Situacao nao permite aprovacao.');
  if(run.phase==='SECOND'&&new Date().toISOString().slice(0,10)<run.calendar_year+'-12-01')
   fail71(d,'DECEMBER_NOT_STARTED','A quitacao do 13o nao pode ser aprovada antes de dezembro.');
  const newest=(await history71(env,companyId,run.calendar_year,run.phase))[0];
  if(!newest||newest.id!==id)fail71(d,'OLDER_REVISION','Somente a ultima revisao pode ser aprovada.');
  const now=await payrollThirteenth70('preview',{...c,year:run.calendar_year,phase:run.phase});
  if(now.source_fingerprint!==run.source_fingerprint||now.totals.blocked||now.problems.length)
   fail71(d,'PREVIEW_CHANGED','Base de calculo ou adiantamentos alterados. Gere nova revisao.');
  await detail71(env,companyId,id,d);
  const result=await env.DB.prepare("UPDATE payroll_thirteenth_runs71 SET status='APPROVED',approved_by=?,approved_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='CALCULATED' AND source_fingerprint=?")
    .bind(auth.user.id,id,companyId,run.source_fingerprint).run();
  if(Number(result.meta?.changes)!==1)fail71(d,'CONCURRENT_APPROVAL','Aprovacao simultanea. Consulte novamente.');
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'APPROVE',entity:'payroll_thirteenth_runs71',
   entityId:id,after:{year:run.calendar_year,phase:run.phase,revision:run.revision}});
  return {approved:true,run_id:id,status:'APPROVED',payment_generated:false,accounting_generated:false};
 }
 fail71(d,'NOT_FOUND','Acao inexistente.',404);
}