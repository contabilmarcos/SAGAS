// SAGAS v124: auditoria READ ONLY do D1 de producao, por empresa.
// Nenhuma chamada CREATE/ALTER/INSERT/UPDATE/DELETE, nenhum processamento de folha.
// Status de integridade NAO substitui homologacao contábil ou documental externa.
const CONTRACT124=[
 ['payroll_employees','Funcionários','id','company_id'],
 ['payroll_employee_functional_history','Histórico funcional','id','company_id'],
 ['payroll_calc_runs','Folha mensal','id','company_id'],
 ['payroll_finance_postings37','Integração mensal','run_id','company_id'],
 ['payroll_finance_payables37','Títulos da folha','payable_id','company_id'],
 ['payroll_employer_postings120','Encargos patronais','run_id','company_id'],
 ['payroll_employer_payables120','Títulos patronais','payable_id','company_id'],
 ['payroll_provision_movements43','Movimentações de provisões','id','company_id'],
 ['payroll_provision_postings45','Diários de provisões','id','company_id'],
 ['payroll_provision_posted_movements45','Vínculos das provisões','movement_id','company_id'],
 ['payroll_vacation_integrations121','Férias v121','run_id','company_id'],
 ['payroll_thirteenth_runs71','Cálculo de 13º','id','company_id'],
 ['payroll_thirteenth_postings112','Quitação do 13º','run_id','company_id'],
 ['payroll_thirteenth_payables112','Títulos do 13º','payable_id','company_id'],
 ['payroll_termination_approvals122','Aprovações pedido de demissão','id','company_id'],
 ['payroll_termination_postings122','Rescisões pedido de demissão','id','company_id'],
 ['payroll_termination_payables122','Títulos rescisórios v122','payable_id','company_id'],
 ['payroll_termination_fgts_documents123','Documentos de FGTS Digital','id','company_id'],
 ['payroll_termination_approvals123','Aprovações dispensa sem justa causa','id','company_id'],
 ['payroll_termination_postings123','Rescisões sem justa causa','id','company_id'],
 ['payroll_termination_payables123','Títulos rescisórios v123','payable_id','company_id'],
 ['journal_entries','Diário contábil','id','company_id'],
 ['journal_lines','Partidas contábeis','id','company_id'],
 ['financial_payables','Contas a pagar','id','company_id'],
 ['payroll_finance_batches38','Lote contábil de folha','company_id','company_id'],
 ['payroll_termination_natures119','Naturezas rescisórias','component','company_id'],
 ['payroll_termination_fgts_settings123','Credor FGTS','company_id','company_id']
];
const MODULES124=[
 ['MENSAL','Folha mensal','payroll_finance_postings37'],
 ['ENCARGOS','CPP, RAT, terceiros e PIS','payroll_employer_postings120'],
 ['PROVISOES','Provisões e baixas','payroll_provision_postings45'],
 ['FERIAS','Férias integradas à folha','payroll_vacation_integrations121'],
 ['DECIMO_TERCEIRO','13º contabilizado','payroll_thirteenth_postings112'],
 ['PEDIDO_DEMISSAO','Pedido de demissão','payroll_termination_postings122'],
 ['SEM_JUSTA_CAUSA','Dispensa sem justa causa','payroll_termination_postings123']
];
function issue124(arr,code,message,source_id=null){
 if(!arr.some(x=>x.code===code&&x.source_id===source_id))
  arr.push({code,message,source_id});
}
function money124(v){return Number.isSafeInteger(Number(v))&&Number(v)>=0&&Number(v)<=99999999999}
function equal124(a,b){return money124(a)&&money124(b)&&Number(a)===Number(b)}
function label124(t){return CONTRACT124.find(x=>x[0]===t)?.[1]||t}
async function sample124(env,companyId,table,fields,sort='rowid'){
 const q="SELECT "+fields+" FROM "+table+" WHERE company_id=? ORDER BY "+sort+" DESC LIMIT 101";
 const values=(await env.DB.prepare(q).bind(companyId).all()).results||[];
 return {rows:values.slice(0,100),limited:values.length>100};
}
async function balance124(env,companyId,entryId,expected){
 const issues=[];
 if(!entryId||!money124(expected)){issue124(issues,'JOURNAL_INVALID','Identificador/valor de diário inválido.');return issues}
 const [head,groups]=await Promise.all([
  env.DB.prepare("SELECT id,status,source_module,source_reference,total_debit_cents,total_credit_cents FROM journal_entries WHERE company_id=? AND id=?").bind(companyId,entryId).first(),
  env.DB.prepare("SELECT side,cost_center_id,COALESCE(SUM(amount_cents),0) AS cents FROM journal_lines WHERE company_id=? AND entry_id=? GROUP BY side,cost_center_id").bind(companyId,entryId).all()
 ]);
 if(!head||head.status!=='POSTED'||!equal124(head.total_debit_cents,expected)||!equal124(head.total_credit_cents,expected))
  issue124(issues,'JOURNAL_HEADER','Diário não está POSTED ou cabeçalho difere do valor.');
 const centers=new Map();let D=0,C=0;
 for(const g of groups.results||[]){
  const cents=Number(g.cents);
  if(!g.cost_center_id||!['D','C'].includes(g.side)||!Number.isSafeInteger(cents)||cents<=0){
   issue124(issues,'JOURNAL_LINE','Partida sem centro de custo ou valor positivo.');continue;
  }
  const c=centers.get(g.cost_center_id)||{D:0,C:0};
  c[g.side]+=cents;centers.set(g.cost_center_id,c);
  if(g.side==='D')D+=cents;else C+=cents;
 }
 if(D!==Number(expected)||C!==Number(expected)||[...centers.values()].some(x=>x.D!==x.C))
  issue124(issues,'JOURNAL_CENTER','Partidas não conciliam por centro de custo.');
 return issues;
}
async function titles124(env,companyId,linkTable,linkKey,valueKey,origin){
 // link table, field names and origin are constants from code only.
 const cols=linkTable==='payroll_finance_payables37'?'employee_id':'component';
 const query="SELECT l.payable_id,l."+cols+" AS target,t.id,t.source_type,t.source_id,t.amount_cents,t.status FROM "+
  linkTable+" l LEFT JOIN financial_payables t ON t.id=l.payable_id AND t.company_id=l.company_id WHERE l.company_id=? AND l."+linkKey+"=?";
 const lines=(await env.DB.prepare(query).bind(companyId,valueKey).all()).results||[];
 let amount=0,problems=[];
 for(const x of lines){
  if(!x.id||x.source_type!==origin||!money124(x.amount_cents)||x.status==='CANCELLED')
   issue124(problems,'TITLE_INVALID','Título vinculado ausente, cancelado ou com origem divergente.');
  if(origin==='PAYROLL_MONTHLY'&&x.source_id!==valueKey+':'+x.target)
   issue124(problems,'TITLE_ORIGIN','Origem do título mensal diverge do funcionário.');
  if(x.id&&money124(x.amount_cents))amount+=Number(x.amount_cents);
 }
 return {count:lines.length,total_cents:amount,problems};
}
async function check124(env,companyId,kind,table,allowed){
 const p=[];
 const warn=(code,msg,source=null)=>issue124(p,code,msg,source);
 let records=0,examined=0,limit=false;
 if(!allowed.has(table))return {kind,status:'NAO_INICIALIZADO',count:0,examined:0,problems:[]};
 const data=await sample124(env,companyId,table,'*');
 records=data.rows.length;examined=records;limit=data.limited;
 if(limit)warn('HISTORY_LIMIT','Auditoria limitada aos 100 registros mais recentes. Períodos anteriores não foram inspecionados.');
 for(const v of data.rows){
  const id=(v.run_id||v.id||v.movement_id||'').slice(0,100);
  const append=(arr)=>{for(const x of arr)warn(x.code,x.message,id)};
  try{
   if(kind==='MENSAL'){
    append(await balance124(env,companyId,v.journal_entry_id,(await env.DB.prepare("SELECT total_debit_cents FROM journal_entries WHERE company_id=? AND id=?").bind(companyId,v.journal_entry_id).first())?.total_debit_cents));
    const run=await env.DB.prepare("SELECT source_fingerprint,status FROM payroll_calc_runs WHERE company_id=? AND id=?").bind(companyId,v.run_id).first();
    if(!run||run.source_fingerprint!==v.source_fingerprint||run.status!=='APPROVED')
     warn('MONTHLY_SOURCE','Folha fechada não corresponde ao lançamento contábil.',id);
    if(allowed.has('payroll_finance_payables37')){
     const t=await titles124(env,companyId,'payroll_finance_payables37','run_id',v.run_id,'PAYROLL_MONTHLY');
     append(t.problems);
     if(!equal124(t.total_cents,v.payable_total_cents)||t.count!==Number(v.payable_count))
      warn('MONTHLY_TITLES','Total e número de títulos não conciliam com fechamento.',id);
    }
   }
   if(kind==='ENCARGOS'){
    append(await balance124(env,companyId,v.journal_entry_id,v.amount_cents));
    if(allowed.has('payroll_employer_payables120')){
     const t=await titles124(env,companyId,'payroll_employer_payables120','run_id',v.run_id,'PAYROLL_EMPLOYER');
     append(t.problems);
     if(!equal124(t.total_cents,v.amount_cents)||t.count!==Number(v.payable_count))
      warn('EMPLOYER_TITLES','Encargos patronais e títulos divergem.',id);
    }
   }
   if(kind==='PROVISOES'){
    append(await balance124(env,companyId,v.journal_entry_id,v.total_cents));
    if(allowed.has('payroll_provision_posted_movements45')&&allowed.has('payroll_provision_movements43')){
     const r=await env.DB.prepare("SELECT COUNT(m.id) AS qtd,COALESCE(SUM(m.amount_cents),0) AS sum_cents FROM payroll_provision_posted_movements45 l JOIN payroll_provision_movements43 m ON m.company_id=l.company_id AND m.id=l.movement_id WHERE l.company_id=? AND l.posting_id=?").bind(companyId,v.id).first();
     const expected=v.kind==='USE'?-Number(v.total_cents):Number(v.total_cents);
     if(!r||Number(r.qtd)===0||Number(r.sum_cents)!==expected)
      warn('PROVISION_MOVEMENTS','Movimentos vinculados não reconciliam com o diário.',id);
    }
   }
   if(kind==='FERIAS'){
    const monthly=await env.DB.prepare("SELECT journal_entry_id FROM payroll_finance_postings37 WHERE company_id=? AND run_id=?").bind(companyId,v.run_id).first();
    if(!monthly||monthly.journal_entry_id!==v.journal_entry_id)
     warn('VACATION_MONTHLY_LINK','Férias não vinculadas ao diário mensal.',id);
    const gl=await env.DB.prepare("SELECT total_debit_cents FROM journal_entries WHERE company_id=? AND id=?").bind(companyId,v.journal_entry_id).first();
    append(await balance124(env,companyId,v.journal_entry_id,gl?.total_debit_cents));
   }
   if(kind==='DECIMO_TERCEIRO'){
    const [a,b]=await Promise.all([
     env.DB.prepare("SELECT total_debit_cents FROM journal_entries WHERE company_id=? AND id=?").bind(companyId,v.provision_journal_id).first(),
     env.DB.prepare("SELECT total_debit_cents FROM journal_entries WHERE company_id=? AND id=?").bind(companyId,v.settlement_journal_id).first()
    ]);
    append(await balance124(env,companyId,v.provision_journal_id,a?.total_debit_cents));
    append(await balance124(env,companyId,v.settlement_journal_id,b?.total_debit_cents));
   }
   if(kind==='PEDIDO_DEMISSAO'||kind==='SEM_JUSTA_CAUSA'){
    const refs=[v.settlement_journal_id,v.provision_journal_id,v.fgts_journal_id].filter(Boolean);
    for(const entry of refs){
     const h=await env.DB.prepare("SELECT total_debit_cents FROM journal_entries WHERE company_id=? AND id=?").bind(companyId,entry).first();
     append(await balance124(env,companyId,entry,h?.total_debit_cents));
    }
    const [employee,history]=await Promise.all([
     env.DB.prepare("SELECT active FROM payroll_employees WHERE company_id=? AND id=?").bind(companyId,v.employee_id).first(),
     env.DB.prepare("SELECT situation,effective_from FROM payroll_employee_functional_history WHERE company_id=? AND id=? AND employee_id=?").bind(companyId,v.history_id,v.employee_id).first()
    ]);
    if(!employee||Number(employee.active)!==0||!history||history.situation!=='DESLIGADO'||history.effective_from!==v.termination_date)
     warn('TERMINATION_HISTORY','Desligamento não corresponde ao estado funcional.',id);
    const payids=kind==='PEDIDO_DEMISSAO'?[v.payable_id]:[v.employee_payable_id,v.fgts_payable_id];
    for(const [i,pay] of payids.entries()){
     const t=await env.DB.prepare("SELECT source_type,source_id,status,amount_cents FROM financial_payables WHERE company_id=? AND id=?").bind(companyId,pay).first();
     const type=kind==='PEDIDO_DEMISSAO'||i===0?'PAYROLL_TERMINATION':'PAYROLL_TERMINATION_FGTS';
     const total=kind==='PEDIDO_DEMISSAO'||i===0?v.net_cents:v.fgts_fine_cents;
     if(!t||t.source_type!==type||t.source_id!==v.id||t.status==='CANCELLED'||!equal124(t.amount_cents,total))
      warn('TERMINATION_TITLE','Título rescisório não corresponde à origem, valor ou status.',id);
    }
   }
  }catch(e){
   warn('AUDIT_QUERY_ERROR','Falha ao conferir origem: '+String(e?.message||e).slice(0,220),id);
  }
 }
 return {kind,status:p.length?'PENDENTE':records?'CONFERIDO':'SEM_HISTORICO',
  count:records,examined,limited:limit,problems:p};
}
export async function payrollLiveAudit124({env,companyId,auth,d}){
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 await d.requirePermission(env,auth.user.id,companyId,'financial.payable.read');
 const list=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results||[];
 const names=new Set(list.map(x=>x.name));
 const modules=[],schema=[];
 for(const [name,title,key,companyField] of CONTRACT124){
  let count=null,error=null;
  if(names.has(name)){
   try{
    const r=await env.DB.prepare("SELECT COUNT(*) AS qty FROM "+name+" WHERE "+companyField+"=?").bind(companyId).first();
    count=Number(r?.qty);
   }catch(e){error=String(e?.message||e).slice(0,180)}
  }
  schema.push({name,title,initialized:names.has(name),records:count,
   status:!names.has(name)?'NAO_INICIALIZADO':error?'ERRO':'OK',error});
 }
 for(const [kind,title,table] of MODULES124){
  try{
   const r=await check124(env,companyId,kind,table,names);
   modules.push({...r,title});
  }catch(e){
   modules.push({kind,title,status:'ERRO',count:0,examined:0,
    problems:[{code:'AUDIT_MODULE_ERROR',message:String(e?.message||e).slice(0,240)}]});
  }
 }
 const failed=modules.filter(x=>['PENDENTE','ERRO'].includes(x.status));
 const missing=schema.filter(x=>x.status==='NAO_INICIALIZADO').map(x=>x.name);
 const initialized=modules.filter(x=>x.status==='CONFERIDO');
 return {
  kind:'SAGAS_D1_LIVE_AUDIT_V124',version:124,read_only:true,tenant_scoped:true,
  database_consulted:true,production_deployed_version_claim:false,
  no_personal_records_returned:true,
  integrity_result:failed.length?'PENDENCIAS':!initialized.length?'SEM_HISTORICO':'CONFERENCIA_PARCIAL',
  modules,schema,missing_tables:missing,
  summary:{modules_checked:modules.length,modules_with_history:initialized.length,
   modules_pending:failed.length,not_initialized:missing.length,
   counted_tables:schema.filter(x=>x.initialized&&x.status==='OK').length},
  limitations:[
   'Consulta executada sobre o D1 ao qual este Worker está vinculado; não confirma por si só se é banco de produção.',
   'Tabelas não inicializadas podem significar que a rotina ainda não foi usada pela empresa, não que o módulo esteja ausente do código.',
   'Até 100 registros recentes por módulo; resultados parciais não constituem homologação de todas as competências.',
   'Não valida cálculo CLT com auditoria humana, documentos externos, saldo de passivo no balancete, bancos, guias do FGTS Digital ou transmissão ao eSocial.',
   'Nenhum funcionário, título, diário, provisão ou guia foi criado, modificado ou pago por esta consulta.'
  ]};
}
