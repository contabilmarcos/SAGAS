// SAGAS folha: parametros patronais por empresa (40) e previa de encargos (41).
// Nao altera liquidos, diarios, contas a pagar ou dados historicos de folhas.
const e40Fail=(d,msg,code='EMPLOYER_PARAMETERS',status=400)=>{throw new d.HttpError(status,msg,code)};
function e40Period(v,d){const s=String(v||'');if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(s))e40Fail(d,'Competencia invalida (AAAA-MM).');return s;}
function e40YesNo(v,label,d){const s=String(v||'').toUpperCase();if(!['SIM','NAO'].includes(s))e40Fail(d,'Informe expressamente Sim ou Nao para '+label+'.');return s;}
function e40Decimal(v,label,d,scale,max){
 const s=String(v??'').trim().replace(',','.');
 if(!/^\d{1,3}(\.\d{1,4})?$/.test(s))e40Fail(d,'Valor de '+label+' invalido.');
 const n=Number(s)*scale;
 if(!Number.isFinite(n)||Math.abs(n-Math.round(n))>0.000001||n<0||n>max)e40Fail(d,'Valor de '+label+' fora do limite.');
 return Math.round(n);
}
function e40Form(body,d){
 const out={effective_from:e40Period(body.effective_from,d)};
 for(const name of ['cpp','rat','thirds','pis'])out[name+'_due']=e40YesNo(body[name+'_due'],name,d);
 for(const [name,max] of [['cpp',3500],['rat',300],['thirds',1500],['pis',500]]){
  out[name+'_bp']=out[name+'_due']==='SIM'?e40Decimal(body[name+'_rate'],name.toUpperCase(),d,100,max):0;
  if(out[name+'_due']==='SIM'&&out[name+'_bp']===0)e40Fail(d,'Informe a aliquota de '+name.toUpperCase()+'.');
 }
 out.fap_10000=out.rat_due==='SIM'?e40Decimal(body.fap,'FAP',d,10000,20000):0;
 if(out.rat_due==='SIM'&&(![100,200,300].includes(out.rat_bp)||out.fap_10000<5000))
   e40Fail(d,'RAT nominal deve ser 1, 2 ou 3 por cento; FAP de 0,5000 a 2,0000.');
 out.fpas=String(body.fpas||'').trim()||null;
 out.thirds_code=String(body.thirds_code||'').trim()||null;
 if(out.fpas&&!/^\d{3}$/.test(out.fpas))e40Fail(d,'FPAS deve ter tres digitos.');
 if(out.thirds_code&&!/^\d{4,6}$/.test(out.thirds_code))e40Fail(d,'Codigo de terceiros invalido.');
 if(out.thirds_due==='SIM'&&(!out.fpas||!out.thirds_code))e40Fail(d,'FPAS e codigo de terceiros sao obrigatorios quando devidos.');
 out.notes=String(body.notes||'').trim();
 if(out.notes.length>450)e40Fail(d,'Observacoes acima do limite de 450 caracteres.');
 return out;
}
async function e40Schema(env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_employer_settings40 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,effective_from TEXT NOT NULL,revision INTEGER NOT NULL,cpp_due TEXT NOT NULL,rat_due TEXT NOT NULL,thirds_due TEXT NOT NULL,pis_due TEXT NOT NULL,cpp_bp INTEGER NOT NULL,rat_bp INTEGER NOT NULL,thirds_bp INTEGER NOT NULL,pis_bp INTEGER NOT NULL,fap_10000 INTEGER NOT NULL,fpas TEXT,thirds_code TEXT,notes TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(company_id,effective_from,revision))").run();
}
async function e40Setting(env,company,period){
 return await env.DB.prepare("SELECT * FROM payroll_employer_settings40 WHERE company_id=? AND effective_from<=? ORDER BY effective_from DESC,revision DESC LIMIT 1").bind(company,period).first();
}
async function e40History(env,company){
 return (await env.DB.prepare("SELECT * FROM payroll_employer_settings40 WHERE company_id=? ORDER BY effective_from DESC,revision DESC LIMIT 40").bind(company).all()).results||[];
}
function e40Money(base,numerator,denominator){
 if(!Number.isSafeInteger(base)||base<0)throw Error('Base patronal invalida.');
 const x=(BigInt(base)*BigInt(numerator)+BigInt(denominator)/2n)/BigInt(denominator);
 if(x>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Encargo acima do limite seguro.');
 return Number(x);
}
function e40Calculate(inssBase,pisReference,s){
 const cpp=s.cpp_due==='SIM'?e40Money(inssBase,s.cpp_bp,10000):0;
 const rat=s.rat_due==='SIM'?e40Money(inssBase,Number(s.rat_bp)*Number(s.fap_10000),100000000):0;
 const thirds=s.thirds_due==='SIM'?e40Money(inssBase,s.thirds_bp,10000):0;
 const pis=s.pis_due==='SIM'?e40Money(pisReference,s.pis_bp,10000):0;
 return {cpp_cents:cpp,rat_cents:rat,thirds_cents:thirds,pis_cents:pis,total_cents:cpp+rat+thirds+pis};
}
export async function payrollEmployer40(action,c){
 const {env,companyId,auth,request,body={},runId,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='save'?'payroll.manage':'payroll.read');
 await d.ensureSchemaRevision(env,'payroll-employer-settings40',1,()=>e40Schema(env));
 if(action==='read'){
  const month=e40Period(c.competence,d);
  return {competence:month,settings:await e40Setting(env,companyId,month),history:await e40History(env,companyId)};
 }
 if(action==='save'){
  const v=e40Form(body,d),old=await e40Setting(env,companyId,v.effective_from);
  const row=await env.DB.prepare("SELECT COALESCE(MAX(revision),0) AS rev FROM payroll_employer_settings40 WHERE company_id=? AND effective_from=?").bind(companyId,v.effective_from).first();
  const rev=Number(row.rev)+1;
  try{
   await env.DB.prepare("INSERT INTO payroll_employer_settings40 (id,company_id,effective_from,revision,cpp_due,rat_due,thirds_due,pis_due,cpp_bp,rat_bp,thirds_bp,pis_bp,fap_10000,fpas,thirds_code,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(d.uuid(),companyId,v.effective_from,rev,v.cpp_due,v.rat_due,v.thirds_due,v.pis_due,v.cpp_bp,v.rat_bp,v.thirds_bp,v.pis_bp,v.fap_10000,v.fpas,v.thirds_code,v.notes,auth.user.id).run();
  }catch(e){if(/UNIQUE constraint failed/i.test(String(e)))e40Fail(d,'A vigencia foi atualizada simultaneamente; consulte novamente.','CONFLICT',409);throw e;}
  const saved=await e40Setting(env,companyId,v.effective_from);
  await d.audit(env,{companyId,userId:auth.user.id,action:'CREATE',entity:'payroll_employer_settings40',entityId:saved.id,before:old,after:saved,request});
  return {settings:saved,history:await e40History(env,companyId)};
 }
 if(action==='preview'){
  const detail=await d.payrollMonthlyRunDetail35(env,companyId,runId),run=detail.run;
  const settings=await e40Setting(env,companyId,run.competence);
  if(!settings)e40Fail(d,'Configure os encargos da empresa para '+run.competence+'.','CONFIG_MISSING',409);
  const review=await d.payrollMonthlyConference36(env,companyId,runId);
  if(run.status!=='APPROVED'||!review.approved||!review.review?.closed_at||review.problems?.length)
    e40Fail(d,'Somente a ultima revisao da folha conferida e fechada permite previa patronal.','PAYROLL_NOT_CLOSED',409);
  const source=await d.payrollMonthlySource35(env,companyId,run.competence_id,run.payment_date);
  if(source.fingerprint!==run.source_fingerprint)e40Fail(d,'Fontes alteradas. Recalcule a revisao da folha.','SOURCE_CHANGED',409);
  const saved=new Map(detail.envelopes.map(x=>[x.employee_id,x]));
  if(saved.size!==source.items.length)e40Fail(d,'Envelopes divergentes.','SOURCE_CHANGED',409);
  const items=source.items.map(x=>{
   const old=saved.get(x.employee_id);
   if(!old||Number(old.earnings_cents)!==x.earnings_cents||Number(old.fgts_cents)!==x.fgts_cents)
     e40Fail(d,'Envelope divergente: '+x.employee_name,'SOURCE_CHANGED',409);
   return {employee_id:x.employee_id,employee_code:x.employee_code,employee_name:x.employee_name,
    cost_center_id:old.cost_center_id,inss_base_cents:x.inss_base_cents,
    pis_reference_base_cents:x.earnings_cents,...e40Calculate(x.inss_base_cents,x.earnings_cents,settings)};
  });
  const totals={};for(const x of items)for(const k of ['inss_base_cents','pis_reference_base_cents','cpp_cents','rat_cents','thirds_cents','pis_cents','total_cents'])totals[k]=(totals[k]||0)+x[k];
  return {kind:'PATRONAL_PREVIA_41',read_only:true,ready_for_accounting:false,ready_for_payment:false,
   run:{id:run.id,competence:run.competence,revision:run.revision},settings,employee_count:items.length,items,totals,
   warnings:['Previa de conferencia: nenhum titulo, guia ou lancamento contabil foi gerado.',
    'Base previdenciaria deriva da folha mensal normal; incidencias especiais devem ser verificadas.',
    'PIS utiliza proventos brutos como base de referencia; valide exclusoes e incidencias legais antes de recolher.',
    'FPAS, codigo de terceiros, RAT/FAP, aliquotas e isencoes devem ser conferidos pelo responsavel tributario.']};
 }
 e40Fail(d,'Operacao nao encontrada.','NOT_FOUND',404);
}
