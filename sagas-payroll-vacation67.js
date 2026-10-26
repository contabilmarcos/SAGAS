// SAGAS Folha v105 — conciliação das provisões e dos lançamentos reais.
// Consulta documental. Nunca cria partidas, títulos ou movimentações patrimoniais.
import { payrollVacationPosting65 } from './sagas-payroll-vacation65.js';

const FAIL67=(d,code,message)=>{throw new d.HttpError(409,message,code)};
const safe67=(d,v,field)=>{
 const n=Number(v);
 if(!Number.isSafeInteger(n)||Math.abs(n)>99999999999)FAIL67(d,'PROVISION_INVALID_AMOUNT','Valor inválido: '+field);
 return n;
};
function issue67(problems,code,message,employeeId=null,component=null){
 if(!problems.some(p=>p.code===code&&p.employee_id===employeeId&&p.component===component))
  problems.push({code,message,employee_id:employeeId,component});
}
async function exists67(env,t){
 return !!(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(t).first());
}
const abs67=n=>Math.abs(n);
async function journal67(env,companyId,postingId,d){
 const posting=await env.DB.prepare(
  "SELECT p.id,p.kind,p.competence,p.cycle_id,p.source_fingerprint,p.total_cents,p.line_count,p.journal_entry_id,p.accounting_batch_id,j.status AS journal_status,j.source_module,j.source_reference,j.total_debit_cents,j.total_credit_cents,j.official_status FROM payroll_provision_postings45 p LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.company_id=p.company_id WHERE p.company_id=? AND p.id=? LIMIT 1"
 ).bind(companyId,postingId).first();
 if(!posting)return {id:postingId,valid:false,code:'POSTING_MISSING',message:'Registro de contabilização de provisões ausente.'};
 const problems=[];
 const problem=(code,message)=>issue67(problems,code,message);
 if(!['ACCRUAL','USE'].includes(posting.kind))problem('POSTING_KIND','Tipo contábil da provisão inválido.');
 if(posting.journal_status!=='POSTED'||posting.source_module!=='PAYROLL'||
   posting.source_reference!=='PROVISION45:'+posting.kind+':'+
    (posting.kind==='ACCRUAL'?posting.cycle_id:posting.source_fingerprint))
  problem('POSTING_JOURNAL_CHANGED','Lançamento de provisão ausente, anulado ou com origem incompatível.');
 const linked=(await env.DB.prepare(
  "SELECT m.id,m.employee_id,m.cost_center_id,m.component,m.movement_kind,m.amount_cents,m.competence FROM payroll_provision_posted_movements45 l JOIN payroll_provision_movements43 m ON m.company_id=l.company_id AND m.id=l.movement_id WHERE l.company_id=? AND l.posting_id=? ORDER BY m.id LIMIT 501"
 ).bind(companyId,postingId).all()).results||[];
 if(!linked.length||linked.length>500)problem('POSTING_ORIGINS','Lançamento sem movimentos de origem ou acima do limite.');
 let total=0;
 const byCenter=new Map();
 for(const m of linked){
  const val=safe67(d,m.amount_cents,'movimento conciliado');
  if(m.movement_kind!==posting.kind||m.competence!==posting.competence||
    val===0||(posting.kind==='USE'&&val>=0)||(posting.kind==='ACCRUAL'&&val<=0))
   problem('POSTING_ORIGIN_MISMATCH','Movimento não corresponde à natureza ou à competência do lançamento.');
  if(!m.cost_center_id)problem('POSTING_NO_CC','Origem contabilizada sem centro de custo.');
  const amount=abs67(val);total+=amount;
  byCenter.set(m.cost_center_id,(byCenter.get(m.cost_center_id)||0)+amount);
 }
 if(total!==safe67(d,posting.total_cents,'total gravado')||total<=0)
  problem('POSTING_TOTAL_MISMATCH','Total da origem é diferente do valor lançado.');
 const journalRows=(await env.DB.prepare(
  "SELECT side,cost_center_id,SUM(amount_cents) AS amount_cents,COUNT(*) AS line_count FROM journal_lines WHERE company_id=? AND entry_id=? GROUP BY side,cost_center_id"
 ).bind(companyId,posting.journal_entry_id).all()).results||[];
 let debit=0,credit=0,count=0;const perCC=new Map();
 for(const j of journalRows){
  const amount=safe67(d,j.amount_cents,'partida no diário');
  const lc=safe67(d,j.line_count,'quantidade de partidas');
  if(amount<0||lc<1||!['D','C'].includes(j.side))
   problem('JOURNAL_LINE_INVALID','Partida contábil inválida.');
  count+=lc;
  if(j.side==='D')debit+=amount;
  else if(j.side==='C')credit+=amount;
  const cc=j.cost_center_id||null;
  const k=String(cc)+'|'+j.side;
  perCC.set(k,(perCC.get(k)||0)+amount);
 }
 if(debit!==credit||debit!==total||debit!==Number(posting.total_debit_cents)||
   credit!==Number(posting.total_credit_cents)||count!==Number(posting.line_count))
  problem('JOURNAL_TOTAL_MISMATCH','Valor e quantidade de partidas no diário não conciliam com a contabilização.');
 for(const [cc,expected] of byCenter){
  if(perCC.get(String(cc)+'|D')!==expected||perCC.get(String(cc)+'|C')!==expected)
   problem('JOURNAL_CC_MISMATCH','As partidas do diário não correspondem ao centro de custo dos movimentos de origem.');
 }
 for(const key of perCC.keys()){
  const cc=key.slice(0,key.lastIndexOf('|'));
  if(!byCenter.has(cc==='null'?null:cc))
   problem('JOURNAL_CC_EXTRA','Lançamento apresenta centro de custo não encontrado nas origens da provisão.');
 }
 return {id:posting.id,kind:posting.kind,competence:posting.competence,
  journal_entry_id:posting.journal_entry_id,accounting_batch_id:posting.accounting_batch_id,
  journal_status:posting.journal_status,official_status:posting.official_status,
  amount_cents:total,line_count:count,movement_count:linked.length,
  valid:!problems.length,problems};
}
export async function payrollVacationProvision67(c){
 const {env,companyId,auth,runId,d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 const pkg=await payrollVacationPosting65('read',c);
 if(!pkg.applicable)return {applicable:false,run:pkg.run,note:pkg.note};
 const problems=[...(pkg.problems||[])];
 const warnings=[...(pkg.warnings||[])];
 const add=(code,message,employeeId=null,component=null)=>issue67(problems,code,message,employeeId,component);
 const present=await Promise.all(
  ['payroll_provision_movements43','payroll_provision_posted_movements45','payroll_provision_postings45','journal_entries','journal_lines']
   .map(t=>exists67(env,t))
 );
 if(present.some(x=>!x)){
  add('PROVISION_LEDGER_SCHEMA_MISSING','Constituição, baixa ou diário contábil ainda não possui estrutura disponível para a conferência.');
  return {applicable:true,kind:'VACATION_PROVISION_LEDGER_V105',run:pkg.run,
   employee_count:pkg.sources?.length||0,items:[],problems,warnings,
   ready_for_accounting:false,ready_for_finance:false,read_only:true,
   note:'Módulos contábeis de provisões incompletos. Nenhum lançamento foi criado.'};
 }
 const useLinksAvailable=await exists67(env,'payroll_vacation_provision_use_links68');
 if(!useLinksAvailable)add('USE_LINKS_NOT_CONFIGURED','O módulo de associação de baixas ainda não foi inicializado.');
 const cache=new Map(),items=[];
 let provisionPosted=0,usePosted=0,currentEarned=0;
 for(const source of pkg.sources||[]){
  const employeeId=source.employee_id;
  const components=[];
  for(const entry of source.components||[]){
   if(!['FERIAS','TERCO_FERIAS'].includes(entry.component))continue;
   const movements=(await env.DB.prepare(
    "SELECT m.id,m.employee_id,m.component,m.movement_kind,m.competence,m.amount_cents,m.cost_center_id,m.document_ref,m.origin_key,l.posting_id FROM payroll_provision_movements43 m LEFT JOIN payroll_provision_posted_movements45 l ON l.company_id=m.company_id AND l.movement_id=m.id WHERE m.company_id=? AND m.employee_id=? AND m.component=? AND m.competence<=? ORDER BY m.competence,m.created_at,m.id LIMIT 501"
   ).bind(companyId,employeeId,entry.component,pkg.run.competence).all()).results||[];
   if(movements.length>500){
    add('PROVISION_MOVEMENT_LIMIT','Mais de 500 movimentos no histórico: conferir em lotes.',employeeId,entry.component);
    continue;
   }
   let opening=0,accrual=0,used=0,postedAccrual=0,postedUse=0;
   let unpostedAccrual=0,unpostedUse=0,matchingUse=0,matchingPostedUse=0;
   const journals=new Set();
   const doc=String(source.advance?.document_ref||'').trim();
   for(const m of movements){
    const n=safe67(d,m.amount_cents,'origem de provisão');
    if(n===0||m.movement_kind==='USE'&&n>=0||
       m.movement_kind!=='USE'&&n<=0){
      add('PROVISION_SIGN_INVALID','Sinal de provisão ou baixa inválido.',employeeId,entry.component);
      continue;
    }
    if(m.movement_kind==='OPENING'){
     opening+=n;
     if(m.posting_id)add('OPENING_POSTING_UNEXPECTED','Saldo de abertura não possui contabilização específica nesta rotina.',employeeId,entry.component);
    }else if(m.movement_kind==='ACCRUAL'){
     accrual+=n;
     if(m.posting_id)postedAccrual+=n;else unpostedAccrual+=n;
    }else if(m.movement_kind==='USE'){
     used+=-n;
     if(m.posting_id)postedUse+=-n;else unpostedUse+=-n;
     if(m.competence===pkg.run.competence&&doc&&m.document_ref===doc){
      matchingUse+=-n;
      if(m.posting_id)matchingPostedUse+=-n;
     }
    }else add('MOVEMENT_KIND_INVALID','Tipo de movimentação não reconhecido.',employeeId,entry.component);
    if(m.movement_kind!=='OPENING'&&m.posting_id){
     if(!cache.has(m.posting_id))
      cache.set(m.posting_id,await journal67(env,companyId,m.posting_id,d));
     const posted=cache.get(m.posting_id);
     journals.add(posted.journal_entry_id||'');
     if(!posted.valid)
      for(const p of posted.problems)add(p.code,p.message,employeeId,entry.component);
     if(posted.kind!==m.movement_kind||posted.competence!==m.competence)
      add('MOVEMENT_POSTING_CHANGED','Baixa/constituição vinculada a diário de tipo ou competência divergente.',employeeId,entry.component);
    }
   }
   // A conciliação documental só é suficiente quando a própria baixa
   // está explicitamente ligada à ocorrência e ao diário validado.
   const explicit=useLinksAvailable?
    ((await env.DB.prepare(
     "SELECT l.id,l.movement_id,l.amount_cents,m.employee_id,m.component,m.competence,m.movement_kind,m.document_ref,pm.posting_id FROM payroll_vacation_provision_use_links68 l JOIN payroll_provision_movements43 m ON m.id=l.movement_id AND m.company_id=l.company_id LEFT JOIN payroll_provision_posted_movements45 pm ON pm.company_id=m.company_id AND pm.movement_id=m.id WHERE l.company_id=? AND l.occurrence_id=? AND l.component=? AND l.competence=? AND l.status='ACTIVE' ORDER BY l.id LIMIT 101"
    ).bind(companyId,source.occurrence_id,entry.component,pkg.run.competence).all()).results||[]):[];
   if(explicit.length>100)add('EXPLICIT_LINK_LIMIT','Mais de 100 vínculos para um mesmo componente.',employeeId,entry.component);
   const movementsById=new Map(movements.map(m=>[m.id,m]));
   let linkedSum=0;const linkedIds=new Set();
   for(const l of explicit){
    const amount=safe67(d,l.amount_cents,'vínculo de baixa');
    const movement=movementsById.get(l.movement_id);
    if(linkedIds.has(l.movement_id)||!movement||l.employee_id!==employeeId||
       l.component!==entry.component||l.competence!==pkg.run.competence||
       l.movement_kind!=='USE'||l.document_ref!==doc||
       !l.posting_id||Number(movement.amount_cents)!==-amount||
       !cache.get(l.posting_id)?.valid){
       add('USE_LINK_INVALID','Origem da baixa vinculada ao recibo ou diário está inconsistente.',employeeId,entry.component);
    }else linkedSum+=amount;
    linkedIds.add(l.movement_id);
   }
   const earned=safe67(d,entry.earned_cents,'férias ou terço da competência');
   currentEarned+=earned;provisionPosted+=postedAccrual;usePosted+=postedUse;
   const operational=opening+accrual-used;
   if(operational<0||operational!==Number(entry.operational_balance_cents??operational))
    add('PROVISION_BALANCE_MISMATCH','Saldo operacional de provisões não concilia.',employeeId,entry.component);
   if(unpostedUse>0)add('USE_NOT_POSTED','Há baixas operacionais ainda não contabilizadas.',employeeId,entry.component);
   if(unpostedAccrual>0)add('ACCRUAL_NOT_POSTED','Há provisões constituídas sem contabilização.',employeeId,entry.component);
   if(opening>0)add('OPENING_WITHOUT_GL','O saldo de abertura é operacional e precisa ser conciliado ao balanço patrimonial.',employeeId,entry.component);
   if(linkedSum!==earned)add('USE_OCCURRENCE_UNLINKED','Baixas vinculadas à ocorrência não somam a verba desta competência.',employeeId,entry.component);
   if(!doc)add('VACATION_DOCUMENT_MISSING','Documento de origem do recibo de férias ausente.',employeeId,entry.component);
   else if(matchingUse!==earned)
    add('USE_DOCUMENT_MISMATCH','As baixas desta competência/documento não correspondem à verba de férias ou terço.',employeeId,entry.component);
   else if(matchingPostedUse!==earned)
    add('USE_DOCUMENT_NOT_POSTED','Baixas do recibo identificadas, mas ainda não integralmente contabilizadas.',employeeId,entry.component);
   components.push({component:entry.component,
    earned_cents:earned,opening_operational_cents:opening,accrual_operational_cents:accrual,
    used_operational_cents:used,operational_balance_cents:operational,
    accrual_posted_cents:postedAccrual,accrual_unposted_cents:unpostedAccrual,
    use_posted_cents:postedUse,use_unposted_cents:unpostedUse,
    matched_document_use_cents:matchingUse,matched_document_posted_use_cents:matchingPostedUse,
    explicitly_linked_use_cents:linkedSum,linked_to_occurrence:linkedSum===earned,
    explicit_link_count:explicit.length,occurrence_id:source.occurrence_id,
    recognized_journal_entry_ids:[...journals].filter(Boolean),source_document_ref:doc||null,
    historical_gl_movements_cents:postedAccrual-postedUse,
    historical_gl_balance_verified:false});
  }
  items.push({employee_id:employeeId,cost_center_code:source.cost_center||null,
   payment_evidence:source.advance_evidence||null,components});
 }
 if(items.length!==pkg.sources.length)
  add('EMPLOYEES_NOT_RECONCILED','Há funcionários sem conferência de provisões.');
 const journals=[...cache.values()];
 warnings.push('O vínculo explícito da baixa à ocorrência não substitui a conciliação do saldo do passivo e das partidas por conta contábil no balancete.');
 warnings.push('O saldo contábil do passivo não pode ser deduzido somente da movimentação operacional; conciliar abertura, rateios e contas efetivas no balancete.');
 warnings.push('A memória v103 continua sendo uma proposta de partidas da folha mensal, sem reconhecimento automático de diferenças como despesa.');
 return {applicable:true,kind:'VACATION_PROVISION_LEDGER_V105',
  run:pkg.run,employee_count:items.length,items,
  verified_journals:journals,problems,warnings,
  totals:{vacation_entitlement_cents:currentEarned,
   posted_accrual_movement_cents:provisionPosted,posted_use_movement_cents:usePosted},
  source_fingerprint:pkg.fingerprint,
  reconciliation_fingerprint:await d.hash({version:105,source:pkg.fingerprint,components:items}),
  payment_verified_in_financial:items.length>0&&items.every(x=>x.payment_evidence?.payment_verified===true),
  accounting_posting_enabled:false,ready_for_accounting:false,ready_for_finance:false,
  read_only:true,
  note:'Conferência do diário e dos vínculos explícitos de baixas à ocorrência. Não cria lançamentos, baixas ou títulos.'};
}
