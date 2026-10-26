// SAGAS Folha v102 — prévia contábil das férias (somente leitura).
// Não grava diário, provisões, financeiro, guias ou pagamentos.
import { payrollVacationClosure63 } from './sagas-payroll-vacation63.js';

function err64(d,message,code='VACATION_ACCOUNTING_PREVIEW',status=409){
 throw new d.HttpError(status,message,code);
}
function money64(x,d,label){
 const n=Number(x);
 if(!Number.isSafeInteger(n)||n<0||n>99999999999)
  err64(d,'Valor inválido na conciliação: '+label,'AMOUNT_INVALID');
 return n;
}
function problem64(problems,code,message,employeeId=null){
 if(!problems.some(p=>p.code===code&&p.employee_id===employeeId))
  problems.push({code,message,employee_id:employeeId});
}
const COMP64=[{code:'FERIAS',line:'FERIAS_GOZO',label:'Férias gozadas'},
 {code:'TERCO_FERIAS',line:'TERCO_FERIAS',label:'Terço constitucional'}];
async function table64(env,name){
 const row=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first();
 return !!row;
}
async function provision64(env,companyId,employeeId,competence,component,d){
 const rows=(await env.DB.prepare(
  "SELECT m.id,m.movement_kind,m.amount_cents,m.competence,m.cost_center_id,m.origin_key,m.document_ref,pm.posting_id FROM payroll_provision_movements43 m LEFT JOIN payroll_provision_posted_movements45 pm ON pm.company_id=m.company_id AND pm.movement_id=m.id WHERE m.company_id=? AND m.employee_id=? AND m.component=? AND m.competence<=? ORDER BY m.competence,m.created_at,m.id LIMIT 301"
 ).bind(companyId,employeeId,component,competence).all()).results||[];
 if(rows.length>300)err64(d,'Histórico de provisões excede o limite para conferência.','PROVISION_HISTORY_LIMIT');
 let balance=0,credits=0,uses=0,accrued=0,postedUse=0,notPostedUse=0;
 const movements=[];
 for(const m of rows){
  const val=Number(m.amount_cents);
  if(!Number.isSafeInteger(val)||val===0||val>99999999999||val< -99999999999)
   err64(d,'Movimento de provisão inválido.','PROVISION_MOVEMENT_INVALID');
  if(m.movement_kind==='USE'&&val>=0||m.movement_kind!=='USE'&&val<=0)
   err64(d,'Sinal do movimento de provisão incompatível.','PROVISION_SIGN_INVALID');
  balance+=val;
  if(m.movement_kind==='ACCRUAL')accrued+=val;
  if(m.movement_kind==='OPENING')credits+=val;
  if(m.movement_kind==='USE'){
   uses+= -val;
   if(m.posting_id)postedUse+= -val;
   else notPostedUse+= -val;
  }
  if(!Number.isSafeInteger(balance)||balance<0)
   err64(d,'Saldo operacional da provisão inconsistente.','PROVISION_BALANCE_INVALID');
  movements.push({movement_id:m.id,competence:m.competence,kind:m.movement_kind,
   amount_cents:val,document_ref:m.document_ref,origin_key:m.origin_key,
   accounting_posted:m.movement_kind==='USE'?!!m.posting_id:null});
 }
 return {component,opening_cents:credits,accrual_cents:accrued,
  used_cents:uses,remaining_operational_cents:balance,
  posted_use_cents:postedUse,unposted_use_cents:notPostedUse,movements};
}
export async function payrollVacationAccounting64(c){
 const {env,companyId,auth,runId,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 const closure=await payrollVacationClosure63(c);
 if(!closure.applicable)return {applicable:false,run:closure.run,note:closure.note};
 const problems=[...closure.problems],warnings=[];
 const add=(code,message,employeeId)=>problem64(problems,code,message,employeeId);
 if(!['REVIEWED','APPROVED'].includes(closure.run.status))
  add('FOLHA_NAO_REVISADA','Revise a folha mensal antes da conferência contábil.');
 if(closure.financial_posted)
  add('INTEGRACAO_JA_EXISTENTE','Esta folha possui integração financeira/contábil. Não recrie os lançamentos.');
 // Não instalar esquema operacional mediante GET: se não existe, mostrar pendência.
 const hasProvision=await table64(env,'payroll_provision_movements43');
 const hasPostedProvision=await table64(env,'payroll_provision_posted_movements45');
 const hasAdvances=await table64(env,'payroll_vacation_advances54');
 const hasUsage=await table64(env,'payroll_vacation_monthly_usage100');
 if(!hasProvision||!hasPostedProvision)
  add('PROVISOES_NAO_INICIALIZADAS','Histórico de provisões ou registro de contabilização de baixas ainda não está disponível.');
 if(!hasAdvances)add('ADIANTAMENTO_SEM_HISTORICO','O cadastro documental de adiantamento não está disponível.');
 if(!hasUsage)add('MEMORIA_MENSAL_AUSENTE','Não existe estrutura de vínculo das férias com a folha mensal.');
 const source=(hasUsage&&hasAdvances)?((await env.DB.prepare(
  "SELECT u.stage_id,u.employee_id,s.occurrence_id,s.vacation_run_id,l.reconciliation_id,r.advance_id,r.plan_json,a.payment_date AS advance_payment_date,a.amount_cents AS advance_amount_cents,a.external_reference,a.status AS advance_status,v.status AS vacation_status FROM payroll_vacation_monthly_usage100 u JOIN payroll_vacation_monthly_stage61 s ON s.company_id=u.company_id AND s.id=u.stage_id JOIN payroll_vacation_envelope_links58 l ON l.company_id=u.company_id AND l.employee_id=u.employee_id AND l.occurrence_id=s.occurrence_id AND l.run_id=s.vacation_run_id AND l.status='ACTIVE' JOIN payroll_vacation_reconciliations55 r ON r.company_id=l.company_id AND r.id=l.reconciliation_id AND r.status='RECONCILED' LEFT JOIN payroll_vacation_advances54 a ON a.company_id=r.company_id AND a.id=r.advance_id WHERE u.company_id=? AND u.run_id=? ORDER BY u.employee_id"
 ).bind(companyId,runId).all()).results||[]):[];
 const employees=new Map(closure.items.map(x=>[x.employee_id,x]));
 if(source.length!==employees.size)add('ORIGENS_INCOMPLETAS','Quantidade de memórias e funcionários com férias integradas diverge.');
 const seen=new Set();
 let grossComp=0,receiptNetTotal=0,monthNetTotal=0;
 const items=[];
 for(const origin of source){
  const id=origin.employee_id,employee=employees.get(id);
  if(!employee){add('ORIGEM_SEM_FUNCIONARIO','Adiantamento sem funcionário no fechamento.',id);continue;}
  if(seen.has(id)){add('ORIGEM_DUPLICADA','Mais de um adiantamento associado ao funcionário nesta folha.',id);continue;}
  seen.add(id);
  let plan;
  try{plan=JSON.parse(origin.plan_json)}catch{add('RECIBO_INVALIDO','Plano do recibo inválido.',id);continue;}
  const periods=plan?.periods?.filter(p=>p.competence===closure.run.competence)||[];
  if(periods.length!==1){add('COMPETENCIA_SEM_RECIBO','Recibo não apresenta divisão única para a competência.',id);continue;}
  const period=periods[0];
  const vacation=money64(period.remuneration_cents,d,'gozo');
  const third=money64(period.constitutional_third_cents,d,'terço');
  const compensation=money64(period.compensation_gross_cents,d,'adiantamento compensado');
  const netExternal=money64(plan.external_paid_cents,d,'líquido externo');
  if(vacation+third!==compensation||compensation!==Number(employee.compensation_gross_cents))
   add('COMPENSACAO_DIVERGENTE','Valores do gozo, terço e compensação não coincidem.',id);
  if(!origin.advance_id||origin.advance_status!=='DECLARED'||origin.advance_amount_cents==null)
   add('ADIANTAMENTO_NAO_DECLARADO','Comprovante de adiantamento ausente ou cancelado.',id);
  else if(Number(origin.advance_amount_cents)!==netExternal)
   add('PAGAMENTO_DOCUMENTAL_DIVERGENTE','Valor externo declarado diverge do líquido do recibo.',id);
  let components=[];
  for(const cfg of COMP64){
   const corresponding=cfg.code==='FERIAS'?vacation:third;
   const balance=hasProvision&&hasPostedProvision?
    await provision64(env,companyId,id,closure.run.competence,cfg.code,d):null;
   if(balance&&balance.remaining_operational_cents<corresponding)
    add('SALDO_PROVISAO_INSUFICIENTE','Saldo operacional de '+cfg.label+' inferior à verba da competência. Confira baixas anteriores e o saldo contábil antes de classificar qualquer diferença.',id);
   if(balance&&balance.unposted_use_cents)
    add('BAIXA_PENDENTE','Existem movimentos de baixa ainda não contabilizados. Confira o documento antes de lançar novamente.',id);
   components.push({component:cfg.code,description:cfg.label,earned_cents:corresponding,
    provision:balance,proposed_use_cents:null,unprovided_expense_cents:null,
    note:'A parcela exata a utilizar depende da identificação do direito e de baixas já registradas; não inferir pelo saldo operacional.'});
  }
  grossComp+=compensation;
  // O recibo é único e pode distribuir gozo por mais de um mês. O líquido externo
  // é informativo por ocorrência, não parcela desta competência.
  receiptNetTotal+=netExternal;
  monthNetTotal+=Number(employee.monthly_net_cents);
  items.push({employee_id:id,employee_code:employee.employee_code,employee_name:employee.employee_name,
   center:employee.cost_center_code,occurrence_id:origin.occurrence_id,
   vacation_run_id:origin.vacation_run_id,stage_id:origin.stage_id,
   advance:{status:origin.advance_status||'MISSING',document_ref:origin.external_reference||null,
    paid_at_declared:origin.advance_payment_date||null,declared_net_cents:origin.advance_amount_cents??null,
    receipt_net_cents:netExternal,payment_verified_in_bank:false},
   current_competence:{vacation_cents:vacation,third_cents:third,
    gross_compensation_cents:compensation,inss_receipt_allocated_cents:employee.receipt_inss_allocated_cents,
    inss_monthly_residual_cents:employee.monthly_inss_residual_cents,
    fgts_cents:employee.fgts_employer_cents,net_monthly_cents:employee.monthly_net_cents},
   provisions:components,
   accounting_nature_map:employee.mappings,
   duplicate_payment_blocked:true});
 }
 if(items.length!==closure.employee_count)
  add('FUNCIONARIOS_INCOMPLETOS','Conferência contábil não abrange todos os funcionários de férias desta folha.');
 warnings.push(
  'O adiantamento declarado é documento externo; não comprova extrato bancário, título financeiro ou lançamento contábil.',
  'O mesmo recibo de férias pode abranger competências distintas: seu líquido não deve ser somado como novo pagamento mensal.',
  'Saldo operacional de provisões não prova saldo contábil; confirmar constituições e baixas efetivamente contabilizadas.',
  'Rubricas mensais e baixas de provisões devem ser conciliadas antes de definir débito/crédito, para não duplicar despesa ou passivo.',
  'FGTS, INSS patronal e eventuais guias têm integração própria. Não criar guias nem provisões patronais automaticamente.'
 );
 return {applicable:true,kind:'VACATION_ACCOUNTING_RECONCILIATION_V102',
  run:closure.run,closed:closure.closed,employee_count:items.length,
  items,problems,warnings,
  sums:{compensated_gross_cents:grossComp,external_receipt_net_reference_cents:receiptNetTotal,
   monthly_net_cents:monthNetTotal},
  financial_posted:closure.financial_posted,
  ready_for_finance:false,ready_for_accounting:false,ready_for_provision_posting:false,
  read_only:true,
  note:'Prévia de reconciliação. Nenhum lançamento, baixa de provisão, título, comprovante bancário ou guia foi gerado.'};
}
