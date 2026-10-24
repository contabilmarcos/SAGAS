// SAGAS Folha v97 — conferência e aprovação de envelope VACATION, sem integrar MONTHLY.
import { payrollVacationEnvelope58 } from './sagas-payroll-vacation58.js';

function reject59(d,message,code='VACATION_REVIEW_BLOCKED',status=409){throw new d.HttpError(status,message,code)}
export async function payrollVacationReview59(action,c){
 const {env,companyId,auth,request,body={},d}=c;
 if(!['read','approve'].includes(action))reject59(d,'Ação inválida.','NOT_FOUND',404);
 await d.requirePermission(env,auth.user.id,companyId,action==='read'?'payroll.read':'payroll.manage');
 const id=String(action==='read'?c.occurrenceId||'':body.occurrence_id||'').trim();
 if(!id||id.length>128)reject59(d,'Ocorrência inválida.','INVALID_OCCURRENCE',400);
 const summary=await payrollVacationEnvelope58('read',{env,companyId,auth,request,occurrenceId:id,body:{},d});
 const problems=[...(summary.problems||[])];
 if(!summary.active||!summary.recorded)problems.push({code:'NO_ENVELOPE',message:'Grave primeiro o envelope de férias.'});
 if(summary.stale)problems.push({code:'STALE_SOURCE',message:'O recibo ou os parâmetros foram alterados.'});
 const runId=summary.recorded?.run_id,envelopeId=summary.recorded?.envelope_id;
 const run=runId?await env.DB.prepare("SELECT r.id,r.status,r.source_fingerprint,e.earnings_cents,e.deductions_cents,e.net_cents FROM payroll_calc_runs r JOIN payroll_calc_envelopes e ON e.run_id=r.id AND e.company_id=r.company_id WHERE r.company_id=? AND r.id=? AND e.id=? AND r.process_kind='VACATION' LIMIT 1").bind(companyId,runId,envelopeId).first():null;
 if(runId&&!run)problems.push({code:'MISSING_RUN',message:'Processamento de férias inexistente.'});
 if(run&&!['CALCULATED','REVIEWED'].includes(run.status))problems.push({code:'LOCKED_RUN',message:'Processamento bloqueado.'});
 const amount=summary.recorded?.snapshot?.amounts;
 if(run&&(!amount||Number(run.earnings_cents)!==amount.gross_cents||Number(run.deductions_cents)!==amount.deductions_cents||Number(run.net_cents)!==amount.net_cents))
  problems.push({code:'TOTAL_MISMATCH',message:'Totais do envelope e recibo divergem.'});
 if(run&&run.source_fingerprint!==summary.fingerprint)
  problems.push({code:'FINGERPRINT_MISMATCH',message:'Assinatura da origem foi alterada.'});
 const lines=run?(await env.DB.prepare("SELECT event_code,line_type,amount_cents FROM payroll_calc_lines WHERE company_id=? AND envelope_id=? ORDER BY sequence").bind(companyId,envelopeId).all()).results||[]:[];
 const sum=t=>lines.filter(x=>x.line_type===t).reduce((acc,x)=>acc+Number(x.amount_cents),0);
 if(run&&(!lines.length||lines.some(x=>!Number.isSafeInteger(Number(x.amount_cents))||Number(x.amount_cents)<=0)||sum('PROVENTO')!==Number(run.earnings_cents)||sum('DESCONTO')!==Number(run.deductions_cents)))
  problems.push({code:'LINES_MISMATCH',message:'Rubricas não conciliam com os totais.'});
 const posting=run?await env.DB.prepare("SELECT run_id FROM payroll_finance_postings37 WHERE company_id=? AND run_id=? LIMIT 1").bind(companyId,run.id).first():null;
 if(posting)problems.push({code:'ALREADY_POSTED',message:'Processamento já possui integração.'});
 if(action==='read')return {occurrence_id:id,status:run?.status||'NOT_RECORDED',ready_for_approval:problems.length===0&&run?.status==='CALCULATED',problems,lines,recorded:summary.recorded||null,expected_fingerprint:summary.fingerprint,ready_for_finance:false,ready_for_accounting:false};
 if(problems.length||!run||run.status!=='CALCULATED')reject59(d,'Regularize as pendências antes da aprovação.','REVIEW_NOT_READY');
 if(body.expected_fingerprint!==summary.fingerprint)reject59(d,'Reabra a conferência.','SOURCE_CHANGED');
 if(body.confirmation!=='APROVAR FERIAS')reject59(d,'Confirme digitando APROVAR FERIAS.','CONFIRMATION_REQUIRED',400);
 const result=await env.DB.prepare("UPDATE payroll_calc_runs SET status='REVIEWED' WHERE id=? AND company_id=? AND process_kind='VACATION' AND status='CALCULATED' AND source_fingerprint=?").bind(run.id,companyId,run.source_fingerprint).run();
 if(result.meta?.changes!==1)reject59(d,'Processamento alterado durante a aprovação.','VERSION_CONFLICT');
 await d.audit(env,{companyId,userId:auth.user.id,request,action:'REVIEW',entity:'payroll_calc_runs',entityId:run.id,before:{status:'CALCULATED'},after:{status:'REVIEWED',process_kind:'VACATION'}});
 return {approved:true,run_id:run.id,status:'REVIEWED',process_kind:'VACATION',ready_for_finance:false,ready_for_accounting:false};
}
