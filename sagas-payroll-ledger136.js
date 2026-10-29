// SAGAS v136 — conferência contábil da projeção da folha, por natureza e centro de custo.
// Usa as configurações versionadas e o crédito separado do líquido; SEM lançar no diário.
// Eventos podem conter apenas débito ou apenas crédito. O lote inteiro precisa fechar.
import {planNatureDefaults126} from './sagas-payroll-ledger126.js';
const good136=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=99999999999;
const key136=x=>[x.cost_center_id,x.nature_id,x.account_id,x.side,x.event_code,x.branch_id||''].join('|');
export async function previewPayrollLedger136({db,companyId,sourceEnvelopes,envelopes,configs}){
 if(!db||!companyId||!Array.isArray(sourceEnvelopes)||!Array.isArray(envelopes)||!Array.isArray(configs))
  throw Error('Fonte de conferência contábil inválida.');
 const problems=[],staged=[],natures=new Map(),centers=new Map(),accounts=new Map();
 const issues=new Set(),block=(code,message,employee_code=null)=>{
  const k=code+'|'+message+'|'+employee_code;
  if(!issues.has(k)){issues.add(k);problems.push({code,message,employee_code});}
 };
 if(sourceEnvelopes.length>100||envelopes.length>100){
  block('LEDGER_LIMIT','Conferência limitada a cem funcionários.');
  return {kind:'PAYROLL_LEDGER_PREVIEW_136',read_only:true,ready_for_posting:false,
   lines:[],problems,balanced:false,debit_cents:0,credit_cents:0};
 }
 const byEmployee=new Map(envelopes.map(x=>[x.employee_id,x]));
 const byCode=new Map(configs.map(x=>[x.config.code,x.config]));
 const sourceIds=new Set(),ledgerByCenter=new Map();
 async function nature(id){
  if(!natures.has(id)){
   const row=await db.prepare('SELECT id,code,active,synthetic_analytic FROM budget_natures WHERE company_id=? AND id=?')
    .bind(companyId,id).first();
   const defs=row?.active==1&&row?.synthetic_analytic==='ANALYTIC'?
    (await db.prepare('SELECT side,account_id,percentage,branch_id,cost_center_id,history_template_id,history_complement FROM budget_nature_accounts WHERE company_id=? AND nature_id=? ORDER BY created_at,id')
     .bind(companyId,id).all()).results||[]:[];
   natures.set(id,{row,defs});
  }
  return natures.get(id);
 }
 async function center(id){
  if(!centers.has(id))centers.set(id,await db.prepare(
   'SELECT id,code,active FROM cost_centers WHERE company_id=? AND id=?')
   .bind(companyId,id).first()||null);
  return centers.get(id);
 }
 async function account(id){
  if(!accounts.has(id))accounts.set(id,await db.prepare(
   'SELECT id,code,name FROM accounts WHERE company_id=? AND id=? AND active=1 AND analytic=1')
   .bind(companyId,id).first()||null);
  return accounts.get(id);
 }
 async function append({id,amount,cc,code,employee,requireCreditOnly=false}){
  if(!good136(amount)||amount===0){
   block('LEDGER_AMOUNT_INVALID','Valor inválido para '+code,employee);return;
  }
  if(!id){block('LEDGER_NATURE_MISSING','Configure a natureza do evento '+code,employee);return;}
  const n=await nature(id);
  if(!n.row||n.row.active!=1||n.row.synthetic_analytic!=='ANALYTIC'){
   block('LEDGER_NATURE_INVALID','Natureza inativa, sintética ou de outra empresa: '+code,employee);return;
  }
  const plan=planNatureDefaults126(n.defs,cc.id,amount,{requireCreditOnly});
  if(plan.problems.length){
   for(const err of plan.problems)block('LEDGER_'+err.code,
    'Natureza '+n.row.code+' / '+code+': '+err.message,employee);
   return;
  }
  let valid=true;const tmp=[];
  for(const x of plan.lines){
   if(!good136(x.amount_cents)||x.amount_cents<=0){
    block('LEDGER_SPLIT_INVALID','Rateio da natureza '+n.row.code+' tem parcela inválida.',employee);
    valid=false;continue;
   }
   const a=await account(x.account_id);
   if(!a){
    block('LEDGER_ACCOUNT_INVALID','Conta inválida para '+code+' / natureza '+n.row.code,employee);
    valid=false;continue;
   }
   tmp.push({side:x.side,amount_cents:x.amount_cents,account_id:a.id,
    account_code:a.code,account_name:a.name,
    nature_id:id,nature_code:n.row.code,
    cost_center_id:cc.id,cost_center_code:cc.code,
    event_code:code,branch_id:x.branch_id||null});
  }
  if(valid)staged.push(...tmp);
 }
 let netSource=0,projectedNet=0,expectedEvents=0;
 for(const source of sourceEnvelopes){
  const emp=source.employee_code||source.employee_id;
  if(!source.employee_id||sourceIds.has(source.employee_id)){
   block('LEDGER_DUPLICATE_EMPLOYEE','Funcionário ausente ou duplicado na fonte.',emp);continue;
  }
  sourceIds.add(source.employee_id);
  const calculation=byEmployee.get(source.employee_id);
  if(!calculation?.projected){
   block('LEDGER_PROJECTION_MISSING','Projeção inexistente para funcionário.',emp);continue;
  }
  const projected=calculation.projected;
  if(!good136(projected.net_cents)||!good136(projected.gross_cents)||
   !good136(projected.discount_cents)||projected.gross_cents!==projected.net_cents+projected.discount_cents){
   block('LEDGER_PROJECTION_INVALID','Projeção não concilia bruto, desconto e líquido.',emp);continue;
  }
  const cc=source.cost_center_id?await center(source.cost_center_id):null;
  if(!cc||cc.active!=1){
   block('LEDGER_CENTER_INVALID','Centro de custo do funcionário ausente ou inativo.',emp);continue;
  }
  const resolved=new Set(),eventLines=[],projectionRows=new Map((projected.events||[]).map(x=>[x.code,x]));
  for(const old of source.lines||[]){
   if(old.line_type==='INFORMATIVO'&&old.event_code!=='FGTS_PATRONAL')continue;
   const code=old.event_code,proj=projectionRows.get(code),valid=proj?.status==='PROJETADO';
   if(!good136(Number(old.amount_cents))){
    block('LEDGER_SOURCE_INVALID','Evento de origem inválido: '+code,emp);continue;
   }
   const amount=valid?proj.amount_cents:Number(old.amount_cents);
   if(resolved.has(code)){
    block('LEDGER_MULTIPLE_SOURCE','Evento '+code+' possui linhas históricas múltiplas; agrupar exige regra própria.',emp);
    continue;
   }
   resolved.add(code);
   if(proj&&proj.status!=='PROJETADO'&&proj.status!=='COMPARADO'&&proj.status!=='NAO_DEVIDO'){
    block('LEDGER_EVENT_PENDING','Cálculo de '+code+' ainda não aplicado na projeção.',emp);
   }
   const cfg=byCode.get(code);
   if(!cfg)block('LEDGER_EVENT_NOT_CONFIGURED','Evento histórico '+code+' sem configuração vigente.',emp);
   eventLines.push({code,amount,category:old.line_type,kind:'SOURCE',nature_id:cfg?.nature_id||null});
  }
  for(const r of projected.events||[]){
   if(resolved.has(r.code)||r.status!=='PROJETADO'||!good136(r.amount_cents)||
     !['PROVENTO','DESCONTO','ENCARGO'].includes(r.category))continue;
   eventLines.push({code:r.code,amount:r.amount_cents,category:r.category,
    kind:'PROJECTED',nature_id:byCode.get(r.code)?.nature_id||null});
   resolved.add(r.code);
  }
  const sum=(type)=>eventLines.filter(x=>x.category===type).reduce((n,x)=>n+x.amount,0);
  const gross=sum('PROVENTO');
  const discount=sum('DESCONTO');
  const employer=sum('ENCARGO');
  // FGTS é uma linha informativa na origem, embora no designer seja encargo.
  const fgts=eventLines.filter(x=>x.code==='FGTS_PATRONAL');
  const fgtsTotal=fgts.reduce((n,x)=>n+x.amount,0);
  if(gross!==projected.gross_cents||discount!==projected.discount_cents||
     employer+fgtsTotal!==projected.employer_cents+projected.fgts_cents){
   block('LEDGER_EVENT_TOTALS',
    'Eventos configurados não conciliam com bruto, descontos, FGTS ou encargos projetados.',emp);
  }
  for(const l of eventLines){
   if(l.amount===0)continue;
   await append({id:l.nature_id,amount:l.amount,cc,code:l.code,employee:emp});
   expectedEvents++;
  }
  netSource+=Number(source.net_cents);
  projectedNet+=projected.net_cents;
  ledgerByCenter.set(cc.id,(ledgerByCenter.get(cc.id)||0)+projected.net_cents);
 }
 if(sourceIds.size!==envelopes.length)block('LEDGER_EMPLOYEE_COUNT','Fonte mensal e projeção possuem funcionários distintos.');
 let netNatureId=null;
 try{
  const r=await db.prepare('SELECT nature_id FROM payroll_finance_net_natures126 WHERE company_id=?')
   .bind(companyId).first();
  netNatureId=r?.nature_id||null;
 }catch(e){block('LEDGER_NET_SETTINGS_MISSING',
  'Cadastro de natureza do líquido indisponível. Abra a configuração financeira da folha para verificar.');}
 if(!netNatureId&&ledgerByCenter.size)block('LEDGER_NET_NATURE_MISSING',
  'Configure a natureza do crédito do salário líquido a pagar na integração financeira.');
 if(netNatureId)for(const [id,amount] of ledgerByCenter){
  if(amount===0)continue;
  const cc=await center(id);
  await append({id:netNatureId,amount,cc,code:'LIQUIDO_FOLHA',employee:null,requireCreditOnly:true});
 }
 const grouped=new Map();
 for(const line of staged){
  const key=key136(line),old=grouped.get(key);
  if(old)old.amount_cents+=line.amount_cents;
  else grouped.set(key,{...line});
 }
 const lines=[...grouped.values()].sort((a,b)=>a.cost_center_code.localeCompare(b.cost_center_code)||
  a.event_code.localeCompare(b.event_code)||a.side.localeCompare(b.side));
 const debits=lines.filter(x=>x.side==='D').reduce((n,x)=>n+x.amount_cents,0);
 const credits=lines.filter(x=>x.side==='C').reduce((n,x)=>n+x.amount_cents,0);
 const totalsByCenter=new Map();
 for(const x of lines){
  const c=totalsByCenter.get(x.cost_center_id)||{cost_center_code:x.cost_center_code,D:0,C:0};
  c[x.side]+=x.amount_cents;totalsByCenter.set(x.cost_center_id,c);
 }
 const unbalanced=[...totalsByCenter.values()].filter(x=>x.D!==x.C);
 if(debits!==credits||unbalanced.length)
  block('LEDGER_UNBALANCED','Débitos e créditos não fecham para todos os centros de custo.');
 if(lines.length>1000)block('LEDGER_LINE_LIMIT','Prévia excede mil partidas; é necessário dividir em lotes.');
 return {kind:'PAYROLL_LEDGER_PREVIEW_136',read_only:true,official:false,
  ready_for_posting:false,ready_for_closure:false,
  balanced:!unbalanced.length&&debits===credits&&problems.length===0,
  debit_cents:debits,credit_cents:credits,net_payable_cents:projectedNet,
  employee_count:sourceIds.size,mapped_event_count:expectedEvents,
  lines,centers:[...totalsByCenter.values()],problems,
  message:'Conferência de débitos e créditos dos eventos projetados, encargos e líquido. Não substitui a contabilização oficial, não gera lote ou título financeiro.'};
}
