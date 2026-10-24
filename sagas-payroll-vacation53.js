// SAGAS Folha v91 — ponte de conferência férias x envelopes e naturezas.
// Não altera envelope fechado, não cria pagamento e não contabiliza.
import { payrollVacation89 } from './sagas-payroll-vacation51.js';
const VACATION_EVENTS53=[
 ['FERIAS_GOZO','Férias gozadas','PROVENTO'],
 ['TERCO_FERIAS','1/3 constitucional das férias','PROVENTO'],
 ['ABONO_FERIAS','Abono pecuniário de férias','PROVENTO'],
 ['TERCO_ABONO_FERIAS','1/3 sobre abono de férias','PROVENTO'],
 ['ADIANTAMENTO_FERIAS','Compensação de adiantamento de férias','DESCONTO'],
 ['INSS_FERIAS','INSS sobre férias','DESCONTO'],
 ['IRRF_FERIAS','IRRF sobre férias','DESCONTO'],
 ['FGTS_FERIAS','FGTS patronal de férias','INFORMATIVO']
];
function err53(d,msg,code='VACATION_INTEGRATION_PENDING',status=409){throw new d.HttpError(status,msg,code)}
function dayCount53(a,b,d){
 if(!/^20\d\d-\d\d-\d\d$/.test(a)||!/^20\d\d-\d\d-\d\d$/.test(b)||b<a)
  err53(d,'Datas incompatíveis com o gozo de férias.','INVALID_VACATION_DATES');
 const t1=new Date(a+'T00:00:00Z'),t2=new Date(b+'T00:00:00Z');
 if(!Number.isFinite(t1.valueOf())||!Number.isFinite(t2.valueOf())||t1.toISOString().slice(0,10)!==a||t2.toISOString().slice(0,10)!==b)
  err53(d,'Datas inválidas no gozo de férias.','INVALID_VACATION_DATES');
 const days=Math.round((t2-t1)/86400000)+1;
 if(days<1||days>31)err53(d,'Férias fora da faixa de 1–31 dias para conferência.','INVALID_VACATION_DAYS');
 return days;
}
function split53(amount,parts,d){
 if(!Number.isSafeInteger(amount)||amount<0||amount>99999999999)err53(d,'Valor bruto inválido.','INVALID_AMOUNT');
 const count=parts.reduce((sum,x)=>sum+x,0);
 if(!count||parts.some(x=>!Number.isSafeInteger(x)||x<=0))err53(d,'Dias de férias inválidos.','INVALID_DAYS');
 let cumulative=0,previous=0;
 return parts.map(part=>{
  cumulative+=part;
  const v=Number((BigInt(amount)*BigInt(cumulative)+BigInt(Math.floor(count/2)))/BigInt(count));
  const n=v-previous;previous=v;return n;
 });
}
function span53(start,end,d){
 dayCount53(start,end,d);
 const periods=[],last=new Date(end+'T00:00:00Z'),cursor=new Date(start+'T00:00:00Z');
 while(cursor<=last){
  const c=cursor.toISOString().slice(0,7);
  let row=periods[periods.length-1];
  if(!row||row.competence!==c){row={competence:c,days:0};periods.push(row)}
  row.days++;
  cursor.setUTCDate(cursor.getUTCDate()+1);
 }
 return periods;
}
async function seedEvents53(env,companyId,d){
 for(const [code,name,type] of VACATION_EVENTS53)
  await env.DB.prepare("INSERT OR IGNORE INTO payroll_events(id,company_id,code,name,event_type,reference_unit,active) VALUES (?,?,?,?,?,'VALOR',1)")
   .bind(d.uuid(),companyId,code,name,type).run();
 const result=(await env.DB.prepare("SELECT e.id,e.code,e.name,e.event_type,e.reference_unit,e.active,m.nature_id,n.code AS nature_code,n.description AS nature_name,n.active AS nature_active,n.synthetic_analytic AS nature_type FROM payroll_events e LEFT JOIN payroll_event_natures39 m ON m.company_id=e.company_id AND m.event_id=e.id LEFT JOIN budget_natures n ON n.company_id=e.company_id AND n.id=m.nature_id WHERE e.company_id=? AND e.code IN ('FERIAS_GOZO','TERCO_FERIAS','ABONO_FERIAS','TERCO_ABONO_FERIAS','ADIANTAMENTO_FERIAS','INSS_FERIAS','IRRF_FERIAS','FGTS_FERIAS') ORDER BY e.code").bind(companyId).all()).results||[];
 return VACATION_EVENTS53.map(([code,name,type])=>{
  const r=result.find(x=>x.code===code),valid=!!r&&r.event_type===type&&r.reference_unit==='VALOR'&&Number(r.active)===1,
   mapped=valid&&!!r.nature_id&&Number(r.nature_active)===1&&r.nature_type==='ANALYTIC';
  return {event_id:r?.id||null,event_code:code,event_name:name,type,valid,configured:!!mapped,
   nature_id:r?.nature_id||null,nature_code:r?.nature_code||null,nature_name:r?.nature_name||null};
 });
}
function issues53(){const arr=[];return {arr,add:(code,msg)=>{
 if(!arr.some(x=>x.code===code&&x.message===msg))arr.push({code,message:msg});
}}}
async function payrollVacationIntegration53(c){
 const {env,companyId,auth,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 const id=String(c.occurrenceId||'').trim();
 if(!id||id.length>128)err53(d,'Informe a ocorrência de férias.','INVALID_OCCURRENCE',400);
 // Reutiliza a rotina existente de eventos contábeis (nunca cria contas fixas).
 await c.d.payrollFinance39('catalog',{env,companyId,auth,d});
 const catalog=await seedEvents53(env,companyId,d);
 const model=await payrollVacation89('read',{env,companyId,auth,request:c.request,occurrenceId:id,body:{},d});
 if(!model.configured)return {status:'MEMORIA_PENDENTE',ready_for_payment:false,ready_for_payroll:false,
  ready_for_accounting:false,occurrence_id:id,event_mappings:catalog,
  problems:[{code:'MEMORIA_PENDENTE',message:model.note||'Conclua a memória das férias.'}]};
 const employeeId=model.employee.id;
 const current=await env.DB.prepare("SELECT e.cost_center_id,cc.code AS cc_code,cc.name AS cc_name,cc.active AS cc_active FROM payroll_employees e LEFT JOIN cost_centers cc ON cc.id=e.cost_center_id AND cc.company_id=e.company_id WHERE e.company_id=? AND e.id=? LIMIT 1").bind(companyId,employeeId).first();
 if(!current)err53(d,'Funcionário não encontrado na empresa.','EMPLOYEE_NOT_FOUND',404);
 const split=span53(model.start_date,model.end_date,d),days=split.map(x=>x.days);
 const vacation=split53(Number(model.vacation_cents),days,d),
  third=split53(Number(model.vacation_third_cents),days,d);
 const problems=issues53(),periods=[],readyNatures=catalog.every(x=>x.valid&&x.configured);
 if(!current.cost_center_id||Number(current.cc_active)!==1)problems.add('CENTRO_CUSTO_CADASTRO','Centro de custo do funcionário ausente/inativo para futuras competências. Não atribuir retroativamente aos envelopes.');
 for(const event of catalog){
  if(!event.valid)problems.add('EVENTO_INCONSISTENTE','Evento '+event.event_code+' inativo ou com tipo/unidade incompatível.');
  else if(!event.configured)problems.add('NATUREZA_PENDENTE','Configure a natureza orçamentária analítica do evento '+event.event_code+'.');
 }
 for(let i=0;i<split.length;i++){
  const {competence,days:count}=split[i],planned=[{event_code:'FERIAS_GOZO',amount_cents:vacation[i],line_type:'PROVENTO'},{event_code:'TERCO_FERIAS',amount_cents:third[i],line_type:'PROVENTO'}];
  const period=await env.DB.prepare("SELECT id,status FROM payroll_competences WHERE company_id=? AND competence=? LIMIT 1").bind(companyId,competence).first();
  const result={competence,days:count,planned_lines:planned,
   planned_gross_cents:vacation[i]+third[i],period_status:period?.status||'NOT_CREATED',
   monthly_run:null,monthly_envelope:null,existing_special_lines:[],warnings:[]};
  if(!period){problems.add('COMPETENCIA_NAO_CRIADA','Não existe competência de folha para '+competence+'.');periods.push(result);continue;}
  const run=await env.DB.prepare("SELECT id,status,revision,payment_date FROM payroll_calc_runs WHERE company_id=? AND competence_id=? AND process_kind='MONTHLY' ORDER BY revision DESC LIMIT 1").bind(companyId,period.id).first();
  if(!run){problems.add('FOLHA_NAO_CALCULADA','Nenhuma folha mensal calculada em '+competence+'.');periods.push(result);continue;}
  result.monthly_run={id:run.id,status:run.status,revision:run.revision,payment_date:run.payment_date};
  if(period.status!=='OPEN'||run.status==='APPROVED'){
   problems.add('FOLHA_FECHADA','Folha da competência '+competence+' está fechada/bloqueada; não pode receber férias retroativamente.');
  }
  const envelope=await env.DB.prepare("SELECT id,cost_center_id,earnings_cents,deductions_cents,net_cents,inss_cents,irrf_cents,fgts_cents FROM payroll_calc_envelopes WHERE company_id=? AND employee_id=? AND run_id=? LIMIT 1").bind(companyId,employeeId,run.id).first();
  if(!envelope){problems.add('ENVELOPE_AUSENTE','O funcionário ainda não possui envelope mensal em '+competence+'.');periods.push(result);continue;}
  const cc=envelope.cost_center_id?await env.DB.prepare("SELECT id,code,name,active FROM cost_centers WHERE id=? AND company_id=? LIMIT 1").bind(envelope.cost_center_id,companyId).first():null;
  result.monthly_envelope={
   id:envelope.id,cost_center_id:envelope.cost_center_id||null,
   cost_center_code:cc?.code||null,cost_center_name:cc?.name||null,
   earnings_cents:Number(envelope.earnings_cents),deductions_cents:Number(envelope.deductions_cents),
   net_cents:Number(envelope.net_cents),inss_cents:Number(envelope.inss_cents),
   irrf_cents:Number(envelope.irrf_cents),fgts_cents:Number(envelope.fgts_cents)
  };
  if(!cc||Number(cc.active)!==1)problems.add('CENTRO_CUSTO_ENVELOPE','O envelope de '+competence+' não preserva centro de custo válido; conferir histórico sem atribuir o atual.');
  const lines=(await env.DB.prepare("SELECT event_code,event_name,line_type,amount_cents FROM payroll_calc_lines WHERE company_id=? AND envelope_id=? ORDER BY sequence LIMIT 501").bind(companyId,envelope.id).all()).results||[];
  if(lines.length>500)problems.add('LIMITE_EVENTOS','Envelope de '+competence+' excede 500 eventos para conferência.');
  const specialCodes=new Set(VACATION_EVENTS53.map(x=>x[0]));
  result.existing_special_lines=lines.filter(x=>specialCodes.has(x.event_code)||/FERIA|F[ÉE]RIAS|ABONO/i.test(x.event_code)).map(x=>({
   event_code:x.event_code,event_name:x.event_name,line_type:x.line_type,amount_cents:Number(x.amount_cents)
  }));
  if(result.existing_special_lines.length)problems.add('POSSIVEL_DUPLICIDADE','Há eventos associados a férias no envelope de '+competence+'. Conferir origem antes de integrar.');
  const posted=await env.DB.prepare("SELECT run_id FROM payroll_finance_postings37 WHERE company_id=? AND run_id=? LIMIT 1").bind(companyId,run.id).first();
  if(posted)problems.add('CONTABILIZACAO_EXISTENTE','A folha de '+competence+' já possui integração; regularização exige reversão controlada.');
  periods.push(result);
 }
 if(model.abono_cents||model.abono_third_cents)
  problems.add('ABONO_SEM_EVENTO_FINANCEIRO','Abono de férias deve ser contabilizado no processo de férias, com data do pagamento e conciliação próprios.');
 problems.add('ADIANTAMENTO_NAO_CONCILIADO','Ainda não existe registro de quitação/adiantamento de férias com vínculo financeiro neste fluxo.');
 problems.add('INSS_IRRF_FGTS_NAO_HOMOLOGADOS','Tributos da v90 são apenas simulação; INSS/FGTS dependem das demais remunerações e IRRF do efetivo pagamento.');
 problems.add('PROCESSAMENTO_DE_FERIAS_PENDENTE','O cálculo mensal continua bloqueado para férias enquanto o processo próprio não for homologado e reconciliado.');
 return {status:'PREVIA_CONCILIACAO_SEM_LANCAMENTO',employee:model.employee,
  occurrence_id:id,vacation_start:model.start_date,vacation_end:model.end_date,calculation_revision:model.revision,
  periods,abono_cents:Number(model.abono_cents),abono_third_cents:Number(model.abono_third_cents),
  current_cost_center:{id:current.cost_center_id||null,code:current.cc_code||null,name:current.cc_name||null},
  event_mappings:catalog,mappings_complete:readyNatures,problems:problems.arr,
  ready_for_payment:false,ready_for_payroll:false,ready_for_accounting:false,
  note:'Conciliação informativa: nenhuma rubrica ou lançamento foi acrescentado à folha mensal.'};
}
export {payrollVacationIntegration53};
