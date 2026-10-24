// SAGAS Folha v101 - conferencia documental do fechamento e mapeamento de férias.
// Somente LEITURA: não contabiliza, paga, baixa provisões nem cria guias.
function fail63(d,message,code='VACATION_CLOSE_REVIEW_BLOCKED',status=409){
 throw new d.HttpError(status,message,code);
}
function cents63(v,d,name){
 const n=Number(v);
 if(!Number.isSafeInteger(n)||n<0||n>99999999999)
  fail63(d,'Valor inválido: '+name,'VACATION_AMOUNT_INVALID');
 return n;
}
function base63(cents){return 'Base '+(cents/100).toFixed(2)}
function sum63(list){return list.reduce((n,x)=>n+Number(x.amount_cents),0)}
function issue63(out,code,message,employeeId=null){
 if(!out.some(x=>x.code===code&&x.employee_id===employeeId))
  out.push({code,message,employee_id:employeeId});
}
const EVENTS63=['SALARIO_BASE','FERIAS_GOZO','TERCO_FERIAS','ADIANTAMENTO_FERIAS',
 'INSS_EMP','IRRF_EMP','FGTS_PATRONAL'];
const SIDES63=['D','C'];

export async function payrollVacationClosure63(c){
 const {env,companyId,auth,request,runId,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 const id=String(runId||'').trim();
 if(!id||id.length>128)fail63(d,'Processamento inválido.','INVALID_RUN',400);
 const detail=await d.monthlyRunDetail(env,companyId,id);
 const run=detail.run;
 if(!String(run.source_fingerprint||'').startsWith('VACATION100:'))
  return {applicable:false,run:{id:run.id,status:run.status,competence:run.competence},
   note:'Este processamento não possui vínculo de férias no motor v100.'};
 const conference=await d.monthlyConference(env,companyId,id);
 const problems=[...(conference.problems||[]).map(x=>({code:'FOLHA_'+x.code,message:x.message,employee_id:null}))];
 const add=(code,message,employeeId=null)=>issue63(problems,code,message,employeeId);
 const references=(await env.DB.prepare(
  "SELECT u.stage_id,u.employee_id,u.source_fingerprint AS usage_fingerprint,s.source_fingerprint AS stage_fingerprint,s.status AS stage_status,s.competence_id,s.competence,s.payment_date,s.snapshot_json,s.events_json,s.vacation_run_id,s.occurrence_id,l.status AS vacation_link_status,l.reconciliation_id,v.status AS vacation_run_status,v.source_fingerprint AS vacation_run_fingerprint,r.status AS receipt_status,r.plan_json,r.receipt_inss_cents,r.receipt_irrf_cents FROM payroll_vacation_monthly_usage100 u JOIN payroll_vacation_monthly_stage61 s ON s.company_id=u.company_id AND s.id=u.stage_id JOIN payroll_vacation_envelope_links58 l ON l.company_id=u.company_id AND l.occurrence_id=s.occurrence_id AND l.employee_id=u.employee_id AND l.run_id=s.vacation_run_id JOIN payroll_calc_runs v ON v.company_id=u.company_id AND v.id=s.vacation_run_id AND v.process_kind='VACATION' JOIN payroll_vacation_reconciliations55 r ON r.id=l.reconciliation_id AND r.company_id=l.company_id WHERE u.company_id=? AND u.run_id=? ORDER BY u.employee_id"
 ).bind(companyId,id).all()).results||[];
 if(!references.length)add('SEM_VINCULOS','O cálculo mensal está marcado com férias, mas não possui memórias vinculadas.');
 const envelopesByEmployee=new Map(detail.envelopes.map(e=>[e.employee_id,e]));
 const uniqueStage=new Set(),uniqueEmployee=new Set();
 const items=[];
 const eventRows=(await env.DB.prepare(
  "SELECT e.id,e.code,e.name,e.event_type,e.active,e.reference_unit,m.nature_id,n.code AS nature_code,n.active AS nature_active,n.synthetic_analytic AS nature_type FROM payroll_events e LEFT JOIN payroll_event_natures39 m ON m.company_id=e.company_id AND m.event_id=e.id LEFT JOIN budget_natures n ON n.company_id=e.company_id AND n.id=m.nature_id WHERE e.company_id=? AND e.code IN ('SALARIO_BASE','FERIAS_GOZO','TERCO_FERIAS','ADIANTAMENTO_FERIAS','INSS_EMP','IRRF_EMP','FGTS_PATRONAL')"
 ).bind(companyId).all()).results||[];
 const eventsByCode=new Map(eventRows.map(e=>[e.code,e]));
 const centerCache=new Map(),natureCache=new Map(),accountCache=new Map();
 for(const link of references){
  const empId=link.employee_id;
  if(uniqueStage.has(link.stage_id)||uniqueEmployee.has(empId))
   add('USO_DUPLICADO','Memória/funcionário possui mais de um vínculo neste processamento.',empId);
  uniqueStage.add(link.stage_id);uniqueEmployee.add(empId);
  const envelope=envelopesByEmployee.get(empId);
  if(!envelope){add('ENVELOPE_NAO_ENCONTRADO','Funcionário vinculado às férias sem envelope MONTHLY.',empId);continue;}
  if(link.competence_id!==run.competence_id||link.competence!==run.competence||link.payment_date!==run.payment_date)
   add('COMPETENCIA_DIVERGENTE','Competência ou data de pagamento mudou após a integração.',empId);
  if(link.usage_fingerprint!==link.stage_fingerprint||link.stage_status!=='STAGED'||
     link.vacation_link_status!=='ACTIVE'||!['REVIEWED','APPROVED'].includes(link.vacation_run_status)||
     link.receipt_status!=='RECONCILED')
   add('ORIGEM_INVALIDA','Recibo, envelope ou memória de férias não estão válidos.',empId);
  let snapshot,plan,stageLines;
  try{
   snapshot=JSON.parse(link.snapshot_json);
   plan=JSON.parse(link.plan_json);
   stageLines=JSON.parse(link.events_json);
  }catch{
   add('JSON_ORIGEM_INVALIDO','Memória de férias não pode ser interpretada.',empId);continue;
  }
  if(!snapshot||!Array.isArray(stageLines)||!Array.isArray(plan?.periods)){
   add('MEMORIA_INCOMPLETA','Memória ou divisão de competências incompleta.',empId);continue;
  }
  if(plan.employee?.id!==empId||plan.occurrence_id!==link.occurrence_id)
   add('FUNCIONARIO_DIVERGENTE','Funcionário/ocorrência do recibo não confere com a folha.',empId);
  const periods=plan.periods.filter(p=>p.competence===run.competence);
  if(periods.length!==1){
   add('GOZO_DIVERGENTE','Recibo sem divisão única para esta competência.',empId);continue;
  }
  const original=periods[0];
  const monthlyLines=envelope.lines||[];
  const monthlyByCode=new Map();
  for(const line of monthlyLines){
   const arr=monthlyByCode.get(line.event_code)||[];arr.push(line);monthlyByCode.set(line.event_code,arr);
  }
  const expected=new Map(stageLines.map(l=>[l.event_code,l]));
  for(const code of EVENTS63){
   const found=monthlyByCode.get(code)||[],staged=expected.get(code);
   if(found.length!==1||!staged||found[0].line_type!==staged.line_type||
      Number(found[0].amount_cents)!==Number(staged.amount_cents))
    add('EVENTO_DIVERGENTE_'+code,'Evento '+code+' diverge da memória conciliada.',empId);
  }
  const amount=cents63(original.compensation_gross_cents,d,'compensação bruta');
  if(amount!==cents63(original.remuneration_cents,d,'férias')+
                 cents63(original.constitutional_third_cents,d,'terço')||
     amount!==Number(snapshot.vacation_gross_cents))
   add('COMPENSACAO_INCONSISTENTE','Compensação de férias não corresponde a férias + terço.',empId);
  if(monthlyLines.filter(l=>l.event_code==='ADIANTAMENTO_FERIAS').length!==1)
   add('ADIANTAMENTO_DUPLICADO','Compensação ausente ou aplicada mais de uma vez.',empId);
  const fgts=monthlyByCode.get('FGTS_PATRONAL')?.[0];
  const inss=monthlyByCode.get('INSS_EMP')?.[0];
  if(inss?.reference_text!==base63(cents63(snapshot.base_inss_cents,d,'base INSS'))||
     fgts?.reference_text!==base63(cents63(snapshot.base_fgts_cents,d,'base FGTS')))
   add('BASE_HISTORICA','Referência da base INSS/FGTS incompatível com os encargos patronais.',empId);
  if(cents63(snapshot.inss_total_competence_cents,d,'INSS total')!==
      cents63(snapshot.receipt_inss_allocated_cents,d,'INSS recebido no recibo')+
      cents63(envelope.inss_cents,d,'INSS residual da folha'))
   add('INSS_NAO_RECONCILIADO','INSS mensal + parcela antecipada não concilia com o INSS da competência.',empId);
  if(Number(snapshot.fgts_employer_cents)!==Number(envelope.fgts_cents))
   add('FGTS_DIVERGENTE','FGTS do envelope não coincide com a memória da competência.',empId);
  const gross=sum63(monthlyLines.filter(l=>l.line_type==='PROVENTO'));
  const deductions=sum63(monthlyLines.filter(l=>l.line_type==='DESCONTO'));
  if(gross!==Number(envelope.earnings_cents)||deductions!==Number(envelope.deductions_cents)||
     gross-deductions!==Number(envelope.net_cents))
   add('FECHAMENTO_DIVERGENTE','Valores do envelope não conciliam com proventos, descontos e líquido.',empId);
  const ccId=envelope.cost_center_id;
  if(!centerCache.has(ccId)){
   const row=ccId?await env.DB.prepare(
    "SELECT id,code,active FROM cost_centers WHERE company_id=? AND id=?"
   ).bind(companyId,ccId).first():null;
   centerCache.set(ccId,row||null);
  }
  const center=centerCache.get(ccId);
  if(!center||Number(center.active)!==1)add('CENTRO_CUSTO','Centro de custo da fotografia da folha não está ativo.',empId);
  const mappings=[];
  for(const line of monthlyLines.filter(l=>Number(l.amount_cents)>0&&
    (l.line_type!=='INFORMATIVO'||l.event_code==='FGTS_PATRONAL'))){
   const event=eventsByCode.get(line.event_code);
   if(!event||Number(event.active)!==1||event.event_type!==line.line_type){
    add('EVENTO_SEM_CADASTRO','Evento '+line.event_code+' não possui cadastro ativo compatível.',empId);continue;
   }
   if(!event.nature_id||Number(event.nature_active)!==1||event.nature_type!=='ANALYTIC'){
    add('NATUREZA_PENDENTE','Configure natureza analítica para '+line.event_code+'.',empId);continue;
   }
   if(!natureCache.has(event.nature_id)){
    const defaults=(await env.DB.prepare(
     "SELECT side,account_id,percentage,cost_center_id FROM budget_nature_accounts WHERE company_id=? AND nature_id=?"
    ).bind(companyId,event.nature_id).all()).results||[];
    natureCache.set(event.nature_id,defaults);
   }
   const defaults=natureCache.get(event.nature_id),accounts=[];
   let complete=true;
   for(const side of SIDES63){
    const candidates=defaults.filter(x=>x.side===side);
    const specific=candidates.filter(x=>x.cost_center_id===ccId);
    const selected=specific.length?specific:candidates.filter(x=>!x.cost_center_id);
    const percentages=selected.map(x=>Number(x.percentage));
    if(!selected.length||percentages.some(x=>!Number.isFinite(x)||x<=0||x>100)||
       Math.abs(percentages.reduce((a,b)=>a+b,0)-100)>0.0001){
      add('DEFAULT_NATUREZA','Natureza '+event.nature_code+' sem rateio '+side+' de 100% para '+line.event_code+'.',empId);
      complete=false;continue;
    }
    for(const def of selected){
     if(!accountCache.has(def.account_id)){
      const account=await env.DB.prepare(
       "SELECT id,code,active,analytic FROM accounts WHERE company_id=? AND id=?"
      ).bind(companyId,def.account_id).first();
      accountCache.set(def.account_id,account||null);
     }
     const account=accountCache.get(def.account_id);
     if(!account||Number(account.active)!==1||Number(account.analytic)!==1){
      add('CONTA_NAO_ANALITICA','A natureza '+event.nature_code+' utiliza conta contábil inválida.',empId);
      complete=false;continue;
     }
     accounts.push({side,account_code:account.code,percentage:Number(def.percentage)});
    }
   }
   mappings.push({event_code:line.event_code,nature_code:event.nature_code,
     cost_center_code:center?.code||null,amount_cents:Number(line.amount_cents),
     accounts,ready:complete});
  }
  items.push({employee_id:empId,employee_code:envelope.employee_code,
   employee_name:envelope.employee_name,cost_center_code:center?.code||null,
   compensation_gross_cents:amount,
   receipt_inss_allocated_cents:Number(snapshot.receipt_inss_allocated_cents),
   monthly_inss_residual_cents:Number(envelope.inss_cents),
   inss_competence_cents:Number(snapshot.inss_total_competence_cents),
   fgts_employer_cents:Number(envelope.fgts_cents),monthly_net_cents:Number(envelope.net_cents),
   mappings});
 }
 const registered=await env.DB.prepare(
  "SELECT run_id FROM payroll_finance_postings37 WHERE company_id=? AND run_id=? LIMIT 1"
 ).bind(companyId,id).first();
 if(registered)add('CONTABILIZADO','Já existe integração financeira/contábil; não gere novamente.');
 let employer=null;
 if(run.status==='APPROVED'&&conference.approved&&conference.review?.closed_at){
  try{employer=await d.employerPreview(id)}
  catch(e){add('ENCARGOS_PATRONAIS',String(e?.message||'Não foi possível conferir os encargos patronais.').slice(0,280));}
 }
 const readyClose=run.status==='REVIEWED'&&conference.ready_for_closure&&
  !problems.some(x=>!['NATUREZA_PENDENTE','DEFAULT_NATUREZA','CONTA_NAO_ANALITICA','ENCARGOS_PATRONAIS'].includes(x.code));
 return {applicable:true,run:{id:run.id,competence:run.competence,status:run.status,
   revision:run.revision,payment_date:run.payment_date},items,problems,
   employee_count:items.length,ready_for_monthly_closure:readyClose,
   closed:run.status==='APPROVED'&&conference.approved,employer,
   financial_posted:!!registered,ready_for_finance:false,ready_for_accounting:false,
   note:'Conferência documental e de parametrização. Não cria pagamentos, guias, baixas nem partidas contábeis.'};
}
