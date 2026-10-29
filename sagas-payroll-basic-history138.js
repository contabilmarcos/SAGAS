// SAGAS v138: informações históricas são opcionais no processamento mensal simples.
// Preserva o histórico informado. Somente quando AUSENTE preenche a fotografia
// em memória com dados do cadastro, sem escrever linhas falsas no histórico.
export const PAYROLL_DEFAULT_HOURS138=220000; // 220h para mensalista: provisório, não altera jornada contratual.

export function payrollBasicHistory138(employees,history,firstDate){
 if(!Array.isArray(employees)||!history||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(firstDate))
  throw Error('Parâmetros inválidos para a fotografia cadastral da folha.');
 const fallback=new Map();
 for(const key of ['salary','schedule','functional','changesSalary','changesSchedule','changesFunctional','dependents','occurrences']){
  if(!(history[key] instanceof Map))history[key]=new Map();
 }
 for(const employee of employees){
  const id=employee.employee_id||employee.id;
  if(!id)throw Error('Funcionário sem identificação.');
  const assumed={salary:false,schedule:false,functional:false};
  const originalSalary=history.salary.get(id)?.[0];
  if(!originalSalary){
   const cents=Number(employee.salary_cents);
   if(Number.isSafeInteger(cents)&&cents>0&&cents<=99999999999){
    history.salary.set(id,[{
     employee_id:id,effective_from:firstDate,salary_cents:cents,
     source:'BASIC_REGISTRATION_138'
    }]);
    assumed.salary=true;
   }
  }
  const originalSchedule=history.schedule.get(id)?.[0];
  if(!originalSchedule){
   // Sem jornada informada: o salário mensal não depende do divisor; se
   // existem descontos em horas, o validador exigirá a jornada verdadeira.
   history.schedule.set(id,[{
    employee_id:id,effective_from:firstDate,
    monthly_hours_milli:PAYROLL_DEFAULT_HOURS138,weekly_hours_milli:44000,
    source:'BASIC_REGISTRATION_138'
   }]);
   assumed.schedule=true;
  }
  const originalFunctional=history.functional.get(id)?.[0];
  if(!originalFunctional){
   history.functional.set(id,[{
    employee_id:id,effective_from:firstDate,position_id:employee.position_id,
    situation:employee.active?'ATIVO':'DESLIGADO',
    source:'BASIC_REGISTRATION_138'
   }]);
   assumed.functional=true;
  }
  fallback.set(id,assumed);
 }
 return fallback;
}
