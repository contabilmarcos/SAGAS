// SAGAS v134 — prévia contábil das provisões parametrizadas por funcionário e centro de custo.
// Não constitui obrigação, não grava diário, não gera financeiro e não altera folhas fechadas.
import {planNatureDefaults126} from './sagas-payroll-ledger126.js';

const maximum134=99999999999;
const isAmount134=n=>Number.isSafeInteger(n)&&n>=0&&n<=maximum134;
const fail134=(code,message,employee_code=null)=>({code,message,employee_code});
export async function previewProvisionAccounting134({db,companyId,envelopes}){
 if(!db||!companyId||!Array.isArray(envelopes))throw Error('Fonte da prévia contábil inválida.');
 const problems=[],parts=[],natureCache=new Map(),accountCache=new Map(),centerCache=new Map();
 let expected=0,recognized=0,estimatedCount=0;
 const add=(code,message,emp)=>problems.push(fail134(code,message,emp?.employee_code||null));
 for(const emp of envelopes){
  const pending=(emp.provisions||[]).filter(p=>p.status==='ESTIMADO'&&Number(p.amount_cents)>0);
  if(!pending.length)continue;
  if(!emp.cost_center_id){
   add('CC_PROVISAO_AUSENTE','Centro de custo não informado para provisões.',emp);continue;
  }
  if(!centerCache.has(emp.cost_center_id)){
   centerCache.set(emp.cost_center_id,await db.prepare(
    'SELECT id,code FROM cost_centers WHERE company_id=? AND id=? AND active=1'
   ).bind(companyId,emp.cost_center_id).first());
  }
  if(!centerCache.get(emp.cost_center_id)){
   add('CC_PROVISAO_INVALIDO','Centro de custo da provisão inativo ou não pertence à empresa.',emp);continue;
  }
  for(const p of pending){
   const cents=Number(p.amount_cents);
   estimatedCount++;
   if(!isAmount134(cents)||cents<=0){
    add('VALOR_PROVISAO_INVALIDO','Valor da provisão '+p.code+' inválido.',emp);continue;
   }
   expected+=cents;
   if(!Number.isSafeInteger(expected)||expected>maximum134){
    add('LIMITE_PROVISOES','Total das provisões excede o limite de segurança.',emp);continue;
   }
   const natureId=String(p.nature_id||'');
   if(!natureId){add('NATUREZA_PROVISAO_AUSENTE','Provisão '+p.code+' sem natureza de constituição.',emp);continue;}
   if(!natureCache.has(natureId)){
    const nature=await db.prepare(
     'SELECT id,code,active,synthetic_analytic FROM budget_natures WHERE company_id=? AND id=?'
    ).bind(companyId,natureId).first();
    const defaults=nature&&Number(nature.active)===1&&nature.synthetic_analytic==='ANALYTIC'
     ?(await db.prepare(
       'SELECT side,account_id,percentage,cost_center_id,branch_id,history_template_id,history_complement FROM budget_nature_accounts WHERE company_id=? AND nature_id=? ORDER BY created_at,id'
      ).bind(companyId,natureId).all()).results||[]:[];
    natureCache.set(natureId,{nature,defaults});
   }
   const config=natureCache.get(natureId);
   if(!config.nature||Number(config.nature.active)!==1||config.nature.synthetic_analytic!=='ANALYTIC'){
    add('NATUREZA_PROVISAO_INVALIDA','Natureza da provisão '+p.code+' inativa, sintética ou de outra empresa.',emp);continue;
   }
   const mapped=planNatureDefaults126(config.defaults,emp.cost_center_id,cents);
   if(mapped.problems.length){
    for(const x of mapped.problems)add(x.code,'Provisão '+p.code+': '+x.message,emp);
    continue;
   }
   const debit=mapped.lines.filter(x=>x.side==='D').reduce((n,x)=>n+x.amount_cents,0);
   const credit=mapped.lines.filter(x=>x.side==='C').reduce((n,x)=>n+x.amount_cents,0);
   if(!mapped.lines.length||debit!==cents||credit!==cents){
    add('PARTIDAS_PROVISAO_INCOMPLETAS',
     'Natureza '+config.nature.code+' de '+p.code+' deve mapear débito e crédito integrais para o centro de custo.',emp);
    continue;
   }
   const current=[];
   let valid=true;
   for(const line of mapped.lines){
    if(!isAmount134(line.amount_cents)||line.amount_cents===0){
     add('PARCELA_PROVISAO_ZERADA','Rateio contábil de '+p.code+' gerou partida inválida.',emp);valid=false;break;
    }
    if(!accountCache.has(line.account_id)){
     accountCache.set(line.account_id,await db.prepare(
      'SELECT id,code,name FROM accounts WHERE company_id=? AND id=? AND active=1 AND analytic=1'
     ).bind(companyId,line.account_id).first());
    }
    const account=accountCache.get(line.account_id);
    if(!account){
     add('CONTA_PROVISAO_INVALIDA','Conta contábil de '+p.code+' ausente, inativa ou não analítica.',emp);valid=false;break;
    }
    current.push({side:line.side,amount_cents:line.amount_cents,
     account_id:account.id,account_code:account.code,account_name:account.name,
     nature_id:natureId,nature_code:config.nature.code,
     cost_center_id:emp.cost_center_id,cost_center_code:emp.cost_center_code||centerCache.get(emp.cost_center_id).code,
     employee_id:emp.employee_id,employee_code:emp.employee_code,
     provision_code:p.code,revision:p.revision,branch_id:line.branch_id||null});
   }
   if(!valid)continue;
   if(parts.length+current.length>1000){
    add('LIMITE_PARTIDAS_PROVISOES','A prévia ultrapassou 1.000 partidas. Utilize lotes menores.',emp);continue;
   }
   parts.push(...current);
   recognized+=cents;
  }
 }
 // Agrupa somente partidas com a mesma origem e dimensão contábil.
 const grouped=new Map();
 for(const part of parts){
  const key=JSON.stringify([part.side,part.account_id,part.nature_id,part.cost_center_id,
   part.branch_id,part.provision_code]);
  const row=grouped.get(key);
  if(row){row.amount_cents+=part.amount_cents;row.employee_count++;}
  else grouped.set(key,{...part,employee_id:null,employee_code:null,employee_count:1});
 }
 const lines=[...grouped.values()].sort((a,b)=>a.cost_center_code.localeCompare(b.cost_center_code)||
  a.provision_code.localeCompare(b.provision_code)||a.side.localeCompare(b.side));
 const debit_cents=lines.filter(x=>x.side==='D').reduce((n,x)=>n+x.amount_cents,0);
 const credit_cents=lines.filter(x=>x.side==='C').reduce((n,x)=>n+x.amount_cents,0);
 if(debit_cents!==credit_cents||debit_cents!==recognized)
  add('TOTAL_PROVISOES_DIVERGENTE','Prévia sem conciliação entre débitos, créditos e provisões.');
 if(expected!==recognized)
  add('PROVISOES_NAO_MAPEADAS','Há provisões estimadas que não possuem partidas contábeis válidas.');
 return {kind:'PROVISION_ACCOUNTING_PREVIEW_134',read_only:true,official:false,
  mapping_complete:problems.length===0&&estimatedCount>0,
  ready_for_posting:false,
  estimated_count:estimatedCount,expected_cents:expected,mapped_cents:recognized,
  debit_cents,credit_cents,lines,problems,
  message:'Prévia da constituição por natureza orçamentária e centro de custo. Valores estimados não são lançamentos; médias, avos, incidências e competência precisam ser homologados antes de contabilizar.'};
}
