// SAGAS Folha v95 — referência comercial de 30 dias em meses de 28,29,30,31 dias.
// Baseado no comportamento documentado em RM (complemento salarial em fevereiro).
// Somente apuração de PRÉVIA. Não modifica envelopes ou competências.
function monthFail57(d,message,code='VACATION_MONTH_DAYS_INVALID'){
 throw new d.HttpError(409,message,code);
}
export function payrollVacationDays57(competence,vacationDays,context){
 const month=String(competence||'');
 if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month))
  monthFail57(context,'Competência inválida para o tratamento de férias.');
 const [year,mm]=month.split('-').map(Number);
 const monthLength=new Date(Date.UTC(year,mm,0)).getUTCDate();
 if(!Number.isSafeInteger(vacationDays)||vacationDays<1||vacationDays>monthLength)
  monthFail57(context,'Dias de gozo são incompatíveis com os dias reais da competência.');
 const calendarWorkDays=monthLength-vacationDays;
 // Na convenção de referência comercial, férias e remuneração ordinária
 // somam 30 unidades. O dia excedente em mês de 31 não vira salário extra.
 const paidSalaryDays=30-vacationDays;
 if(paidSalaryDays<0)
  monthFail57(context,'Mais de 30 dias de férias atribuídos à mesma competência.');
 const supplementDays=Math.max(0,30-monthLength);
 const calendarDifferenceDays=Math.max(0,monthLength-30);
 if(calendarWorkDays+supplementDays-calendarDifferenceDays!==paidSalaryDays)
  monthFail57(context,'Dias comerciais não reconciliam com o calendário.','VACATION_CALENDAR_RECONCILIATION');
 return {
  competence:month,reference_mode:'COMMERCIAL_30',
  calendar_month_days:monthLength,
  calendar_vacation_days:vacationDays,
  calendar_nonvacation_days:calendarWorkDays,
  salary_paid_reference_days:paidSalaryDays,
  commercial_salary_complement_days:supplementDays,
  calendar_excess_day_adjustment:calendarDifferenceDays,
  warning:monthLength<30?
   'Em fevereiro, a diferença até 30 dias é identificada como complemento salarial de referência comercial; não representa dias efetivamente trabalhados.':
   monthLength===31?
   'Em mês de 31 dias, a folha utiliza referência comercial de 30 dias; o 31º dia não deve gerar salário adicional pela mesma referência.':
   null
 };
}
export function payrollVacationSalary57(salaryCents,distribution,context){
 if(!Number.isSafeInteger(salaryCents)||salaryCents<=0||salaryCents>99999999999)
  monthFail57(context,'Salário-base histórico inválido.','VACATION_SALARY_INVALID');
 const days=distribution?.salary_paid_reference_days;
 if(!Number.isSafeInteger(days)||days<0||days>30)
  monthFail57(context,'Referência salarial inválida.','VACATION_REFERENCE_INVALID');
 const cents=(BigInt(salaryCents)*BigInt(days)+15n)/30n;
 if(cents>99999999999n)
  monthFail57(context,'Salário proporcional ultrapassa limite.','VACATION_SALARY_OVERFLOW');
 return Number(cents);
}
