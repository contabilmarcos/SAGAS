// SAGAS Folha v90 — simulação tributária de férias (2026) sem homologação.
// IRRF simulado no pagamento separado de férias; INSS/FGTS projetados por
// competência de gozo, COM demais verbas previdenciárias informadas pelo DP.
// NÃO registra desconto definitivo, pagamento, recibo quitado ou contabilização.
import { payrollVacation89 } from './sagas-payroll-vacation51.js';

const BRACKETS90=[[162100,750],[290284,900],[435427,1200],[847555,1400]];
const IR90=[[242880,0,0],[282665,750,18216],[375105,1500,39416],[466468,2250,67549],[Infinity,2750,90873]];
function error90(d,msg,code='VACATION_TAX_REVIEW',status=409){throw new d.HttpError(status,msg,code)}
function integer90(v,max,d,name){
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>max)
  error90(d,'Valor inválido em '+name+'; informe centavos inteiros não negativos.','INVALID_TAX_VALUE',400);
 return v;
}
function round90(n,den,d){
 if(den<=0n||n<0n)error90(d,'Cálculo monetário inválido.','INVALID_TAX_VALUE');
 const r=(n+den/2n)/den;
 if(r>99999999999n)error90(d,'Cálculo fora do limite monetário.','TAX_AMOUNT_OVERFLOW');
 return Number(r);
}
function inss90(base,d){
 integer90(base,99999999999,d,'base previdenciária');
 let prev=0,weighted=0n;
 const taxable=Math.min(base,847555);
 for(const [limit,rate] of BRACKETS90){
  weighted+=BigInt(Math.max(0,Math.min(taxable,limit)-prev))*BigInt(rate);
  prev=limit;
 }
 return round90(weighted,10000n,d);
}
function split90(amount,parts,d){
 const total=parts.reduce((a,b)=>a+b,0);
 if(total<=0||parts.some(a=>!Number.isSafeInteger(a)||a<=0))error90(d,'Períodos de gozo inválidos.','INVALID_DAYS');
 let acc=0,old=0;
 return parts.map(days=>{
  acc+=days;
  const next=round90(BigInt(amount)*BigInt(acc),BigInt(total),d);
  const v=next-old;old=next;return v;
 });
}
function eachMonth90(start,end,d){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)
  error90(d,'Período de férias inválido.','INVALID_DATE');
 const rows=[];
 let cur=new Date(start+'T00:00:00Z');
 const last=new Date(end+'T00:00:00Z');
 if(!Number.isFinite(cur.getTime())||!Number.isFinite(last.getTime()))
  error90(d,'Datas de férias inválidas.','INVALID_DATE');
 for(let days=0;cur<=last;days++){
  if(days>31)error90(d,'Simulação limitada a 31 dias de férias.','VACATION_SPAN');
  const competence=cur.toISOString().slice(0,7);
  let x=rows[rows.length-1];
  if(!x||x.competence!==competence){x={competence,days:0};rows.push(x)}
  x.days++;
  cur.setUTCDate(cur.getUTCDate()+1);
 }
 return rows;
}
function iso90(date,d){
 const s=String(date||''),parsed=new Date(s+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==s)
  error90(d,'Informe uma data real de pagamento.','INVALID_PAYMENT_DATE',400);
 return s;
}
function ir90(gross,inss,dependents,pension,d){
 const legal=inss+dependents*18959+pension;
 const simplified=60720;
 const deduct=Math.max(legal,simplified);
 const taxable=Math.max(0,gross-deduct);
 const bracket=IR90.find(x=>taxable<=x[0]);
 const before=Math.max(0,round90(BigInt(taxable)*BigInt(bracket[1]),10000n,d)-bracket[2]);
 let reduction=0;
 if(gross<=500000)reduction=Math.min(before,31289);
 else if(gross<=735000){
  const calculated=97862-round90(BigInt(gross)*133145n,1000000n,d);
  reduction=Math.min(before,Math.max(0,calculated));
 }
 const irrf=Math.max(0,before-reduction);
 return {irrf_cents:irrf,irrf_original_cents:before,irrf_reduction_cents:reduction,
  irrf_base_cents:taxable,irrf_deduction_cents:deduct,irrf_deduction_type:legal>=simplified?'LEGAL':'SIMPLIFICADA',
  irrf_legal_cents:legal,irrf_simplified_cents:simplified,dependent_count:dependents,pension_cents:pension,
  taxable_férias_cents:gross};
}
export function payrollVacationTaxScenario90(receipt,body,d){
 if(!receipt?.configured||receipt.status!=='MINUTA_BRUTA_NAO_HOMOLOGADA')
  error90(d,'Conclua e confira a memória de médias/abono antes dos tributos.','VACATION_CALC_REQUIRED');
 const payment=iso90(body.payment_date,d);
 if(payment.slice(0,4)!=='2026')error90(d,'Esta rotina contempla somente pagamentos com tabela tributária de 2026.','TAX_TABLE_UNAVAILABLE');
 const rows=eachMonth90(receipt.start_date,receipt.end_date,d);
 if(rows.some(x=>!x.competence.startsWith('2026-')))
  error90(d,'Gozo atravessa exercício não coberto; exige tabelas por ano.','TAX_TABLE_UNAVAILABLE');
 const gross=integer90(receipt.gross_estimate_cents,99999999999,d,'bruto férias');
 const vacation=integer90(receipt.vacation_cents,99999999999,d,'remuneração férias');
 const third=integer90(receipt.vacation_third_cents,99999999999,d,'terço férias');
 const abono=integer90(receipt.abono_cents,99999999999,d,'abono');
 const abonoThird=integer90(receipt.abono_third_cents,99999999999,d,'terço abono');
 if(gross!==vacation+third+abono+abonoThird)error90(d,'Memória bruta inconsistente.','VACATION_CALC_INVALID');
 const declaredDays=receipt.gozo_days;
 if(rows.reduce((a,x)=>a+x.days,0)!==declaredDays)error90(d,'Dias do gozo não coincidem com o recibo.','VACATION_DAYS_INVALID');
 const additional=body.other_inss_bases_cents;
 if(!Array.isArray(additional)||additional.length!==rows.length)
  error90(d,'Informe para cada competência as outras remunerações previdenciárias (pode ser zero).','OTHER_WAGES_REQUIRED',400);
 const baseVac=split90(vacation,rows.map(x=>x.days),d),baseThird=split90(third,rows.map(x=>x.days),d);
 const rate=body.fgts_rate_percent;
 if(rate!==8&&rate!==2)error90(d,'Selecione a taxa de FGTS de 8% ou 2% conforme o contrato.','FGTS_RATE_REQUIRED',400);
 const dependentCount=integer90(body.dependents_count,30,d,'dependentes de IRRF');
 const pension=integer90(body.judicial_pension_cents,99999999999,d,'pensão judicial');
 let projectedInss=0,projectedFgts=0;
 const monthly=rows.map((r,i)=>{
  const other=integer90(additional[i],99999999999,d,'outras verbas '+r.competence);
  const ferie=baseVac[i],oneThird=baseThird[i],fgtsBase=ferie+oneThird;
  const projected=inss90(fgtsBase+other,d)-inss90(other,d);
  const fgts=round90(BigInt(fgtsBase)*BigInt(rate),100n,d);
  projectedInss+=projected;projectedFgts+=fgts;
  return {competence:r.competence,days:r.days,vacation_cents:ferie,third_cents:oneThird,
   taxable_vacation_cents:fgtsBase,other_inss_base_cents:other,
   total_projected_inss_base_cents:fgtsBase+other,incremental_inss_estimate_cents:projected,
   fgts_rate_percent:rate,fgts_base_cents:fgtsBase,fgts_estimate_cents:fgts};
 });
 const irrfTaxable=vacation+third; // Abono e terço do abono não tributados (art. 143 CLT).
 const ir=ir90(irrfTaxable,projectedInss,dependentCount,pension,d);
 const assumedNet=gross-ir.irrf_cents-projectedInss;
 if(assumedNet<0)error90(d,'Descontos projetados superiores ao bruto; confira entradas.','TAX_ESTIMATE_INVALID');
 const due=new Date(receipt.start_date+'T00:00:00Z');due.setUTCDate(due.getUTCDate()-2);
 const deadline=due.toISOString().slice(0,10);
 return {
  status:'SIMULACAO_TRIBUTARIA_2026_NAO_HOMOLOGADA',
  employee:receipt.employee,occurrence_id:receipt.occurrence_id,
  calculation_revision:receipt.revision,payment_date:payment,payment_deadline:deadline,
  paid_after_deadline:payment>deadline,
  vacation_start:receipt.start_date,vacation_end:receipt.end_date,
  gross_estimate_cents:gross,taxable_vacation_cents:irrfTaxable,
  nontaxable_abono_cents:abono+abonoThird,
  estimated_inss_cents:projectedInss,estimated_fgts_cents:projectedFgts,
  fgts_employer_charge_not_employee_deduction:true,
  irrf:ir,monthly,estimated_net_cents:assumedNet,
  ready_for_payment:false,ready_for_payroll:false,ready_for_accounting:false,
  document_type:'DEMONSTRATIVO DE CONFERENCIA / NAO E RECIBO',
  warnings:[
   'IRRF sobre férias gozadas e seu terço no mês de pagamento, em separado das demais remunerações; redução mensal de 2026 estimada.',
   'Abono pecuniário e respectivo terço não compõem INSS, FGTS nem IRRF nesta simulação.',
   'INSS simulado por competência sobre remuneração total declarada: diferenças de segurado, vínculos concomitantes, tetos e folha efetiva precisam de reconciliação.',
   'FGTS é obrigação do empregador, não desconto do funcionário; apurado somente sobre férias gozadas/terço, sem demais salários.',
   'Líquido indicado é projeção, não valor autorizável para pagamento; INSS definitivo é apurado nas folhas das competências.',
   'Confirme dependentes, deduções judiciais, férias concomitantes e pagamentos do mesmo mês, incidências específicas e alterações de regras.',
   ...(payment>deadline?['Data informada posterior ao prazo de pagamento de dois dias antes das férias: verificar descumprimento.']:[])
  ]
 };
}
export async function payrollVacation90(action,c){
 const {env,companyId,auth,body={},d}=c;
 await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
 if(action!=='prepare'&&action!=='simulate')error90(d,'Ação tributária não encontrada.','NOT_FOUND',404);
 const id=String(action==='prepare'?c.occurrenceId||'':body.occurrence_id||'');
 if(!id||id.length>128)error90(d,'Informe uma ocorrência de férias.','INVALID_OCCURRENCE',400);
 const baseline=await payrollVacation89('read',{env,companyId,auth,request:c.request,occurrenceId:id,body:{},d});
 if(!baseline.configured)return {prepared:false,occurrence_id:id,
   note:baseline.note||'Conclua a memória de médias e abono antes de estimar impostos.'};
 const rows=eachMonth90(baseline.start_date,baseline.end_date,d);
 if(action==='prepare')return {prepared:true,occurrence_id:id,employee:baseline.employee,
   months:rows,calculation_revision:baseline.revision,payment_deadline:baseline.payment_deadline,
   salary_cents:baseline.salary_cents,gozo_days:baseline.gozo_days,gross_estimate_cents:baseline.gross_estimate_cents,
   notes:['Informe a data real de pagamento, outras remunerações de cada competência, número de dependentes e pensão judicial.','Nenhum valor será contabilizado ou registrado como pagamento.']};
 if(body.expected_revision!==baseline.revision)
  error90(d,'A memória das férias mudou. Reabra a simulação.','VACATION_REVISION_CHANGED');
 return payrollVacationTaxScenario90(baseline,body,d);
}
