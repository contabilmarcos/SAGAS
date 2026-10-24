// SAGAS Folha v89: memória de cálculo bruta e não homologada para férias.
// 12 competências de comissão antes do início do gozo; adicionais do período aquisitivo.
// Valores de adicionais devem ser corrigidos/confirmados pelo DP antes do lançamento.
const MAX89=99999999999n;
function fail89(d,msg,code='VACATION_CALC89_BLOCKED',status=409){throw new d.HttpError(status,msg,code)}
function date89(s,d){
 const v=String(s||'');
 if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])-[0-3]\d$/.test(v))fail89(d,'Data inválida.','INVALID_DATE',400);
 const [y,m,day]=v.split('-').map(Number);
 if(!day||day>new Date(Date.UTC(y,m,0)).getUTCDate())fail89(d,'Data inexistente.','INVALID_DATE',400);
 return v;
}
function shift89(s,days){const x=new Date(s+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+days);return x.toISOString().slice(0,10)}
function monthSteps89(start,delta){
 const [y,m]=start.split('-').map(Number);
 const d=new Date(Date.UTC(y,m-1+delta,1));
 return d.toISOString().slice(0,7);
}
function months89(first){return Array.from({length:12},(_,i)=>monthSteps89(first,i))}
function sum89(a){return a.reduce((n,x)=>n+BigInt(x),0n)}
function money89(n,d){
 if(n<0n||n>MAX89)fail89(d,'Valor acumulado excede limite permitido.','AMOUNT_LIMIT');
 return Number(n);
}
function round89(n,d,ctx){
 if(d<=0n||n<0n)fail89(ctx,'Parâmetros incorretos no cálculo bruto.','AMOUNT_INVALID');
 return money89((n+d/2n)/d,ctx);
}
function list89(values,d,label){
 if(!Array.isArray(values)||values.length!==12)fail89(d,'Informe 12 competências de '+label+'.','MONTHLY_VALUES_REQUIRED',400);
 return values.map(v=>{
  if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>10000000000)
   fail89(d,'Os valores de '+label+' devem ser centavos inteiros não negativos.','INVALID_MONTHLY_VALUE',400);
  return v;
 });
}
export async function payrollVacationSchema89(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_vacation_models89 (occurrence_id TEXT PRIMARY KEY REFERENCES payroll_employee_occurrences(id) ON DELETE RESTRICT,cycle_id TEXT NOT NULL REFERENCES payroll_vacation_cycles50(id) ON DELETE RESTRICT,company_id TEXT NOT NULL,employee_id TEXT NOT NULL,occurrence_start TEXT NOT NULL,occurrence_end TEXT NOT NULL,commission_json TEXT NOT NULL,additional_json TEXT NOT NULL,abono_days INTEGER NOT NULL CHECK(abono_days IN (0,4,6,8,10)),request_date TEXT,notes TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),updated_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK((abono_days=0 AND request_date IS NULL) OR (abono_days>0 AND request_date IS NOT NULL)))"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_vacation_abono89 ON payroll_vacation_models89(company_id,cycle_id) WHERE abono_days>0"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_vacation89_employee ON payroll_vacation_models89(company_id,employee_id,cycle_id)")
 ]);
}
async function ctx89(env,companyId,occurrenceId,d){
 const occ=await env.DB.prepare("SELECT o.id,o.employee_id,o.start_date,o.end_date,o.kind,e.name AS employee_name,e.admission_date,n.number AS employee_number FROM payroll_employee_occurrences o JOIN payroll_employees e ON e.id=o.employee_id AND e.company_id=o.company_id LEFT JOIN payroll_employee_numbers n ON n.company_id=e.company_id AND n.employee_id=e.id WHERE o.id=? AND o.company_id=? AND o.kind='FERIAS' LIMIT 1").bind(occurrenceId,companyId).first();
 if(!occ)fail89(d,'Ocorrência de férias não encontrada.','NOT_FOUND',404);
 date89(occ.start_date,d);date89(occ.end_date,d);
 if(occ.end_date<occ.start_date)fail89(d,'Datas invertidas na ocorrência.','VACATION_DATES');
 const link=await env.DB.prepare("SELECT l.cycle_id,c.acquisition_start,c.acquisition_end,c.entitled_days,c.concession_deadline FROM payroll_vacation_links50 l JOIN payroll_vacation_cycles50 c ON c.id=l.cycle_id AND c.company_id=l.company_id AND c.employee_id=l.employee_id WHERE l.company_id=? AND l.employee_id=? AND l.occurrence_id=? LIMIT 1").bind(companyId,occ.employee_id,occurrenceId).first();
 if(!link)fail89(d,'Vincule estas férias ao período aquisitivo antes da memória de cálculo.','VACATION_CYCLE_REQUIRED');
 const changed=await env.DB.prepare("SELECT effective_from FROM payroll_salary_history WHERE company_id=? AND employee_id=? AND effective_from>? AND effective_from<=? LIMIT 1").bind(companyId,occ.employee_id,occ.start_date,occ.end_date).first();
 if(changed)fail89(d,'Salário alterado durante o gozo; exige cálculo por vigências.','VACATION_SALARY_CHANGE');
 const salary=await env.DB.prepare("SELECT salary_cents,effective_from FROM payroll_salary_history WHERE company_id=? AND employee_id=? AND effective_from<=? ORDER BY effective_from DESC LIMIT 1").bind(companyId,occ.employee_id,occ.start_date).first();
 if(!salary||!Number.isSafeInteger(Number(salary.salary_cents))||Number(salary.salary_cents)<=0)
  fail89(d,'Salário histórico inválido no início das férias.','VACATION_SALARY_MISSING');
 const startMonth=occ.start_date.slice(0,7);
 const commissionMonths=months89(monthSteps89(startMonth,-12));
 const additionalMonths=months89(link.acquisition_start.slice(0,7));
 return {...occ,link,salary_cents:Number(salary.salary_cents),salary_effective_from:salary.effective_from,
  commission_months:commissionMonths,additional_months:additionalMonths,
  gozo_days:Math.round((Date.parse(occ.end_date+'T00:00:00Z')-Date.parse(occ.start_date+'T00:00:00Z'))/86400000)+1};
}
async function checkLocked89(env,companyId,x,d){
 const rows=(await env.DB.prepare("SELECT competence FROM payroll_competences WHERE company_id=? AND competence>=? AND competence<=? AND status<>'OPEN' LIMIT 1").bind(companyId,x.start_date.slice(0,7),x.end_date.slice(0,7)).all()).results||[];
 if(rows.length)fail89(d,'Competência de férias fechada/bloqueada: '+rows[0].competence+'.','COMPETENCE_LOCKED');
}
async function model89(env,companyId,occurrenceId){
 return await env.DB.prepare("SELECT occurrence_id,cycle_id,company_id,employee_id,occurrence_start,occurrence_end,commission_json,additional_json,abono_days,request_date,notes,revision,updated_at FROM payroll_vacation_models89 WHERE occurrence_id=? AND company_id=? LIMIT 1").bind(occurrenceId,companyId).first();
}
function preview89(ctx,model,d){
 const commission=list89(JSON.parse(model.commission_json),d,'comissões');
 const additions=list89(JSON.parse(model.additional_json),d,'adicionais');
 const commissionAverage=round89(sum89(commission),12n,d);
 const additionalAverage=round89(sum89(additions),12n,d);
 const base=money89(BigInt(ctx.salary_cents)+BigInt(commissionAverage)+BigInt(additionalAverage),d);
 const vacation=round89(BigInt(base)*BigInt(ctx.gozo_days),30n,d);
 const vacationThird=round89(BigInt(vacation),3n,d);
 const abonoDays=Number(model.abono_days||0);
 const abono=round89(BigInt(base)*BigInt(abonoDays),30n,d);
 const abonoThird=round89(BigInt(abono),3n,d);
 const gross=money89(BigInt(vacation)+BigInt(vacationThird)+BigInt(abono)+BigInt(abonoThird),d);
 return {
  status:'MINUTA_BRUTA_NAO_HOMOLOGADA',
  employee:{id:ctx.employee_id,name:ctx.employee_name,number:ctx.employee_number},
  occurrence_id:ctx.id,acquisition_start:ctx.link.acquisition_start,acquisition_end:ctx.link.acquisition_end,
  concession_deadline:ctx.link.concession_deadline,start_date:ctx.start_date,end_date:ctx.end_date,
  gozo_days:ctx.gozo_days,entitled_days:ctx.link.entitled_days,abono_days:abonoDays,request_date:model.request_date,
  commission_months:ctx.commission_months,additional_months:ctx.additional_months,
  commission_monthly_cents:commission,additional_monthly_cents:additions,
  salary_cents:ctx.salary_cents,salary_effective_from:ctx.salary_effective_from,
  average_commission_cents:commissionAverage,average_additional_cents:additionalAverage,
  remuneration_base_cents:base,vacation_cents:vacation,vacation_third_cents:vacationThird,
  abono_cents:abono,abono_third_cents:abonoThird,gross_estimate_cents:gross,
  payment_deadline:shift89(ctx.start_date,-2),notes:model.notes,revision:model.revision,
  warnings:[
   'Minuta bruta: não é recibo quitado, líquido devido nem autorização de pagamento.',
   'Comissões: doze competências completas anteriores ao mês de início; confirmar ajustes por concessão em data intermediária.',
   'Adicionais: doze competências ancoradas no início aquisitivo; DP deve atualizar valores e confirmar o período efetivo.',
   'Confirme médias de horas extras, adicional noturno, insalubridade, periculosidade, reflexos e instrumentos coletivos.',
   'Abono é conversão de um terço do direito total; esta versão não aplica descontos previdenciários ou fiscais.',
   'Não registra pagamento, FGTS, IRRF, INSS, eventos financeiros, contabilização ou baixa de provisões.',
   ...(ctx.gozo_days<14?['Revise os outros períodos de férias para garantir pelo menos uma fração de 14 dias.']:[])
  ]};
}
export async function payrollVacation89(action,c){
 const {env,companyId,auth,request,body={},d}=c,occId=String(action==='read'?c.occurrenceId||'':body.occurrence_id||'').trim();
 await d.requirePermission(env,auth.user.id,companyId,action==='read'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-vacation89',1,()=>payrollVacationSchema89(env));
 if(!occId||occId.length>128)fail89(d,'Selecione a ocorrência de férias.','VALIDATION_ERROR',400);
 const x=await ctx89(env,companyId,occId,d),prior=await model89(env,companyId,occId);
 if(action==='read'){
  if(!prior)return {configured:false,employee:{id:x.employee_id,name:x.employee_name},occurrence_id:occId,
   gozo_days:x.gozo_days,acquisition_start:x.link.acquisition_start,acquisition_end:x.link.acquisition_end,
   entitled_days:x.link.entitled_days,commission_months:x.commission_months,additional_months:x.additional_months,
   salary_cents:x.salary_cents,payment_deadline:shift89(x.start_date,-2),
   note:'É preciso informar ou confirmar doze valores mensais por grupo, inclusive zeros, antes da prévia.'};
  if(prior.cycle_id!==x.link.cycle_id||prior.occurrence_start!==x.start_date||prior.occurrence_end!==x.end_date)
   return {configured:false,stale:true,occurrence_id:occId,
    note:'Ocorrência/vínculo alterado desde a memória gravada. Exclua a memória e refaça os valores.'};
  return {configured:true,...preview89(x,prior,d)};
 }
 if(action!=='save'&&action!=='delete')fail89(d,'Ação de férias inválida.','NOT_FOUND',404);
 await checkLocked89(env,companyId,x,d);
 if(prior&&(prior.cycle_id!==x.link.cycle_id||prior.occurrence_start!==x.start_date||prior.occurrence_end!==x.end_date)&&action==='save')
  fail89(d,'Ocorrência alterada desde a memória anterior. Exclua a memória e refaça.','VACATION_STALE');
 if(action==='delete'){
  if(!prior)fail89(d,'Não existe memória para excluir.','NOT_FOUND',404);
  if(body.confirmation!=='EXCLUIR MEMORIA')fail89(d,'Confirme digitando EXCLUIR MEMORIA.','CONFIRMATION_REQUIRED',400);
  await env.DB.prepare("DELETE FROM payroll_vacation_models89 WHERE occurrence_id=? AND company_id=?").bind(occId,companyId).run();
  await d.audit(env,{companyId,userId:auth.user.id,action:'DELETE',entity:'payroll_vacation_models89',entityId:occId,request,before:prior,after:null});
  return {deleted:true};
 }
 const commission=list89(body.commission_monthly_cents,d,'comissões');
 const additions=list89(body.additional_monthly_cents,d,'adicionais');
 const raw=body.abono_days;
 if(typeof raw!=='number'||!Number.isInteger(raw))fail89(d,'Dias de abono devem ser inteiros.','INVALID_ABONO',400);
 const abono=raw,expected=x.link.entitled_days/3;
 if(abono!==0 && abono!==expected)fail89(d,'O abono deve corresponder exatamente a um terço dos dias de direito.','INVALID_ABONO',400);
 const requestDate=abono?date89(body.abono_request_date,d):null;
 if(abono&&requestDate>shift89(x.link.acquisition_end,-15))
  fail89(d,'Solicitação de abono fora do prazo de quinze dias antes do fim aquisitivo; revise com o DP.','ABONO_REQUEST_LATE');
 if(abono&&requestDate<x.admission_date)
  fail89(d,'Data do pedido de abono anterior à admissão.','ABONO_REQUEST_DATE');
 const notes=String(body.notes||'').trim();
 if(notes.length<15||notes.length>600)fail89(d,'Documente origem das médias e fundamento do abono (15 a 600 caracteres).','INVALID_NOTES',400);
 if(body.confirmation!=='MEDIAS CONFERIDAS')
  fail89(d,'Confirme digitando MEDIAS CONFERIDAS.','CONFIRMATION_REQUIRED',400);
 const used=await env.DB.prepare("SELECT COALESCE(SUM(CAST(julianday(o.end_date)-julianday(o.start_date)+1 AS INTEGER)),0) AS days, COUNT(*) AS fragments, COALESCE(MAX(CAST(julianday(o.end_date)-julianday(o.start_date)+1 AS INTEGER)),0) AS longest FROM payroll_vacation_links50 l JOIN payroll_employee_occurrences o ON o.id=l.occurrence_id AND o.company_id=l.company_id WHERE l.company_id=? AND l.cycle_id=?").bind(companyId,x.link.cycle_id).first();
 if(Number(used?.days||0)+abono>x.link.entitled_days)
  fail89(d,'Dias gozados e abono ultrapassam o direito total do período aquisitivo.','ABONO_EXCEEDS_BALANCE');
 const balance=x.link.entitled_days-Number(used?.days||0)-abono;
 if((balance>0&&balance<5)||(Number(used?.fragments||0)>=3&&balance!==0)||
    (Number(used?.fragments||0)>0 && Number(used?.longest||0)<14 && balance<14))
  fail89(d,'Abono deixaria saldo sem possibilidade de fracionamento legal; revise os períodos.','ABONO_FRACTION_BALANCE');
 const others=await env.DB.prepare("SELECT occurrence_id FROM payroll_vacation_models89 WHERE company_id=? AND cycle_id=? AND occurrence_id<>? AND abono_days>0 LIMIT 1").bind(companyId,x.link.cycle_id,occId).first();
 if(others&&abono)fail89(d,'Abono já previsto em outra ocorrência do mesmo período aquisitivo.','ABONO_DUPLICATE');
 // Bloqueia atualização silenciosa sobre uma revisão vista antes em outra sessão.
 const revision=Number(prior?.revision||0)+1;
 if(prior&&Number(body.expected_revision)!==Number(prior.revision))
  fail89(d,'Memória alterada em outra sessão. Reabra e confira os valores.','VERSION_CONFLICT');
 if(!prior&&Number(body.expected_revision||0)!==0)
  fail89(d,'Versão de memória inesperada. Atualize a tela.','VERSION_CONFLICT');
 const jsonCommission=JSON.stringify(commission),jsonAdditions=JSON.stringify(additions);
 const args=[occId,x.link.cycle_id,companyId,x.employee_id,x.start_date,x.end_date,jsonCommission,jsonAdditions,abono,requestDate,notes,revision,auth.user.id];
 try{
  const sql=prior?
   "UPDATE payroll_vacation_models89 SET commission_json=?,additional_json=?,abono_days=?,request_date=?,notes=?,revision=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE occurrence_id=? AND company_id=? AND cycle_id=? AND revision=?":
   "INSERT INTO payroll_vacation_models89(occurrence_id,cycle_id,company_id,employee_id,occurrence_start,occurrence_end,commission_json,additional_json,abono_days,request_date,notes,revision,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)";
  const write=prior?await env.DB.prepare(sql).bind(jsonCommission,jsonAdditions,abono,requestDate,notes,revision,auth.user.id,occId,companyId,x.link.cycle_id,prior.revision).run():
    await env.DB.prepare(sql).bind(...args).run();
  if(!write.meta?.changes)fail89(d,'Não foi possível gravar devido à alteração concorrente.','VERSION_CONFLICT');
 }catch(e){
  if(String(e?.message||'').includes('UNIQUE'))fail89(d,'Memória/abono já registrado por outro usuário. Recarregue a tela.','ABONO_CONFLICT');
  throw e;
 }
 await d.audit(env,{companyId,userId:auth.user.id,action:prior?'UPDATE':'CREATE',entity:'payroll_vacation_models89',entityId:occId,request,before:prior,after:{cycle_id:x.link.cycle_id,abono_days:abono,revision,notes}});
 return {saved:true,configured:true,...preview89(x,{commission_json:jsonCommission,additional_json:jsonAdditions,abono_days:abono,request_date:requestDate,notes,revision},d)};
}
