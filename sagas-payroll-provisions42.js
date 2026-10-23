// SAGAS - Folha Etapa 42 | Prévia mensal de provisões sobre folha FECHADA.
// Não é saldo contábil acumulado, não cria/baixa provisões nem envia guias/títulos.
// Direitos anteriores, remuneração variável e férias gozadas precisam de controle próprio.
function p42Error(d,message,code='PROVISION_PREVIEW_BLOCKED',status=409){
  throw new d.HttpError(status,message,code);
}
function p42Round(base,num,den,d){
  if(!Number.isSafeInteger(base)||base<0||!Number.isSafeInteger(num)||num<0||!Number.isSafeInteger(den)||den<=0)
    p42Error(d,'Parâmetros numéricos inválidos na provisão.','INVALID_PROVISION_BASE');
  const n=(BigInt(base)*BigInt(num)+BigInt(den)/2n)/BigInt(den);
  if(n>BigInt(Number.MAX_SAFE_INTEGER))p42Error(d,'Provisão fora do limite monetário seguro.','INVALID_PROVISION_BASE');
  return Number(n);
}
function p42Salary(envelope,d){
  const salary=(envelope.lines||[]).filter(x=>x.event_code==='SALARIO_BASE'&&x.line_type==='PROVENTO');
  if(salary.length!==1||!Number.isSafeInteger(Number(salary[0].amount_cents))||Number(salary[0].amount_cents)<=0)
    p42Error(d,'Não foi possível identificar salário-base gravado no envelope de '+(envelope.employee_code||envelope.employee_name)+'.','SALARY_SNAPSHOT_MISSING');
  return Number(salary[0].amount_cents);
}
function p42Line(base,settings,d){
  // Apuração de apenas 1/12 de uma competência integral, sem saldo de abertura/baixa.
  const vacation=p42Round(base,1,12,d);
  const vacationThird=p42Round(base,1,36,d);
  const thirteenth=p42Round(base,1,12,d);
  const amount=vacation+vacationThird+thirteenth;
  if(!Number.isSafeInteger(amount))p42Error(d,'Provisão excede limite monetário.','INVALID_PROVISION_BASE');
  const cpp=settings.cpp_due==='SIM'?p42Round(amount,Number(settings.cpp_bp),10000,d):0;
  const rat=settings.rat_due==='SIM'?p42Round(amount,Number(settings.rat_bp)*Number(settings.fap_10000),100000000,d):0;
  const thirds=settings.thirds_due==='SIM'?p42Round(amount,Number(settings.thirds_bp),10000,d):0;
  const fgts=p42Round(amount,800,10000,d);
  const contributions=cpp+rat+thirds+fgts;
  return {vacation_cents:vacation,vacation_third_cents:vacationThird,thirteenth_cents:thirteenth,
    labor_total_cents:amount,cpp_estimate_cents:cpp,rat_estimate_cents:rat,
    thirds_estimate_cents:thirds,fgts_estimate_cents:fgts,charges_estimate_cents:contributions,
    combined_estimate_cents:amount+contributions};
}
export async function payrollProvisions42(c){
  const {env,companyId,auth,runId,d}=c;
  await d.requirePermission(env,auth.user.id,companyId,'payroll.read');
  const detail=await d.payrollMonthlyRunDetail35(env,companyId,runId);
  const conference=await d.payrollMonthlyConference36(env,companyId,runId);
  const run=detail.run;
  if(run.status!=='APPROVED'||!conference.approved||!conference.review?.closed_at||conference.problems?.length)
    p42Error(d,'As provisões exigem a última revisão da folha mensal conferida e fechada.');
  const s=(await d.readEmployerSettings(run.competence)).settings;
  if(!s)p42Error(d,'Configure primeiro os encargos patronais da empresa para '+run.competence+'.','EMPLOYER_CONFIG_MISSING');
  if(!detail.envelopes.length)p42Error(d,'Não foram encontrados envelopes na folha fechada.');
  const items=detail.envelopes.map(envp=>{
    const salary=p42Salary(envp,d);
    const otherEarnings=(envp.lines||[]).filter(x=>x.line_type==='PROVENTO'&&x.event_code!=='SALARIO_BASE'&&Number(x.amount_cents)>0);
    const flags=otherEarnings.length?['Possui proventos variáveis: a base de férias e 13º exige apuração de médias. A prévia considera somente o salário-base.']:[];
    const out=p42Line(salary,s,d);
    return {employee_id:envp.employee_id,employee_code:envp.employee_code,employee_name:envp.employee_name,
      cost_center_id:envp.cost_center_id,cost_center_code:envp.cost_center_code,
      salary_base_cents:salary,variable_earnings:otherEarnings.length,flags,...out};
  });
  const fields=['salary_base_cents','vacation_cents','vacation_third_cents','thirteenth_cents',
    'labor_total_cents','cpp_estimate_cents','rat_estimate_cents','thirds_estimate_cents',
    'fgts_estimate_cents','charges_estimate_cents','combined_estimate_cents'];
  const totals=Object.fromEntries(fields.map(k=>[k,items.reduce((sum,item)=>sum+item[k],0)]));
  if(fields.some(k=>!Number.isSafeInteger(totals[k])))p42Error(d,'Total das provisões fora do limite monetário.','INVALID_PROVISION_TOTAL');
  return {kind:'PROVISOES_MENSAIS_PREVIA_42',run:{id:run.id,competence:run.competence,revision:run.revision,status:run.status},
    settings_effective_from:s.effective_from,settings_revision:s.revision,employee_count:items.length,items,totals,
    read_only:true,is_monthly_reference:true,posted:false,ready_for_accounting:false,ready_for_payment:false,
    unresolved_employee_count:items.filter(x=>x.flags.length).length,
    pis_on_provisions_cents:null,
    warnings:[
      'Parcela mensal estimada: férias 1/12, adicional de férias 1/36, 13º 1/12 do salário-base gravado no envelope.',
      'Não representa saldo acumulado do passivo. Férias gozadas, 13º pago, afastamentos, períodos aquisitivos e saldos anteriores exigem controle de constituição e baixa.',
      'CPP, RAT/FAP, Terceiros e FGTS são estimativas sobre a provisão; devem ser validados quanto às incidências e ao momento do recolhimento.',
      'FGTS usa 8% como referência da folha mensal atual, sem tratar categorias com alíquotas diferenciadas.',
      'PIS sobre provisões não foi apurado, independentemente da opção de PIS da empresa, até validação específica de incidências.',
      'Não gera lançamentos financeiros, contábeis, obrigações ou alteração de envelopes.'
    ]};
}
