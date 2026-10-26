// SAGAS Folha v109 - 13o separado da folha mensal: duas parcelas, memoria e adiantamentos documentados.
// Nenhuma operacao aqui cria pagamento bancario, titulo financeiro, contabilizacao ou guia.
// Apenas declara adiantamentos externos com confirmacao expressa, protegidos contra duplicidade.
function bad70(d,code,message,status=409){throw new d.HttpError(status,message,code)}
function year70(v,d){
 const year=String(v||'');
 if(!/^20(2[0-6])$/.test(year))bad70(d,'YEAR_INVALID','Ano deve estar entre 2020 e 2026, conforme tabelas disponiveis.',400);
 return year;
}
function date70(value,d){
 const s=String(value||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))bad70(d,'DATE_INVALID','Data deve estar em AAAA-MM-DD.',400);
 const t=new Date(s+'T12:00:00Z');
 if(!Number.isFinite(t.getTime())||t.toISOString().slice(0,10)!==s)
  bad70(d,'DATE_INVALID','Data calendario invalida.',400);
 return s;
}
function integer70(value,d,name,nonzero=false){
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<0||(nonzero&&n===0)||n>99999999999)
  bad70(d,'AMOUNT_INVALID','Valor invalido: '+name,400);
 return n;
}
function half70(value){return Math.floor((value+1)/2)}
export function twelfths70(admission,year){
 const y=String(year),a=String(admission||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(a)||!/^20\d{2}$/.test(y))return null;
 const t=new Date(a+'T12:00:00Z');
 if(!Number.isFinite(t.getTime())||t.toISOString().slice(0,10)!==a)return null;
 if(a>y+'-12-31')return 0;
 if(a<y+'-01-01')return 12;
 const month=Number(a.slice(5,7));
 const [yy,mm]=[Number(y),month],last=new Date(Date.UTC(yy,mm,0)).getUTCDate();
 const eligible=last-Number(a.slice(8))+1>=15;
 return 12-month+(eligible?1:0);
}
export function amounts70(base,avos,advance,taxes,phase){
 const gross=(BigInt(integerPlain70(base))*BigInt(avos)+6n)/12n;
 const full=Number(gross);
 if(phase==='FIRST'){
  const estimated=half70(full);
  return {gross_cents:full,estimated_advance_cents:estimated,advance_cents:0,
   inss_cents:0,irrf_cents:0,fgts_cents:Math.floor((estimated*8+50)/100),
   net_cents:estimated,second_gross_cents:full-estimated};
 }
 const already=integerPlain70(advance);
 if(already>full)return {gross_cents:full,advance_cents:already,net_cents:0,
  inss_cents:0,irrf_cents:0,fgts_cents:0,second_gross_cents:0,overpaid:true};
 const inss=integerPlain70(taxes?.inss_cents||0),irrf=integerPlain70(taxes?.irrf_cents||0);
 const second=full-already;
 return {gross_cents:full,estimated_advance_cents:0,advance_cents:already,
  inss_cents:inss,irrf_cents:irrf,fgts_cents:Math.floor((second*8+50)/100),
  second_gross_cents:second,net_cents:Math.max(0,second-inss-irrf),
  insufficient_second:second<inss+irrf};
}
function integerPlain70(n){
 if(!Number.isSafeInteger(n)||n<0||n>99999999999)throw new Error('Invalid monetary value');
 return n;
}
async function schema70(env){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS payroll_thirteenth_advances70 (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,calendar_year TEXT NOT NULL,employee_id TEXT NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),payment_date TEXT NOT NULL,document_ref TEXT NOT NULL,notes TEXT NOT NULL,source_fingerprint TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('ACTIVE','VOID')),created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,voided_by TEXT,voided_at TEXT,void_reason TEXT)"),
  env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_thirteenth_advance70_active ON payroll_thirteenth_advances70(company_id,calendar_year,employee_id) WHERE status='ACTIVE'"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_thirteenth_advance70_year ON payroll_thirteenth_advances70(company_id,calendar_year,status)")
 ]);
}
async function advances70(env,companyId,year){
 return (await env.DB.prepare("SELECT id,employee_id,amount_cents,payment_date,document_ref,notes,source_fingerprint,created_at FROM payroll_thirteenth_advances70 WHERE company_id=? AND calendar_year=? AND status='ACTIVE' ORDER BY employee_id")
 .bind(companyId,year).all()).results||[];
}
async function preview70(c){
 const {env,companyId,d}=c,year=year70(c.year,d),phase=c.phase==='SECOND'?'SECOND':'FIRST';
 const end=year+'-12-31',salaryEnd=phase==='FIRST'?year+'-11-30':end;
 const employees=(await env.DB.prepare(
  "SELECT e.id,e.name,e.admission_date,e.active,e.cost_center_id,cc.code AS cost_center_code,n.number AS employee_number, (SELECT h.salary_cents FROM payroll_salary_history h WHERE h.company_id=e.company_id AND h.employee_id=e.id AND h.effective_from<=? ORDER BY h.effective_from DESC LIMIT 1) AS salary_cents, (SELECT h.situation FROM payroll_employee_functional_history h WHERE h.company_id=e.company_id AND h.employee_id=e.id AND h.effective_from<=? ORDER BY h.effective_from DESC LIMIT 1) AS situation FROM payroll_employees e LEFT JOIN cost_centers cc ON cc.company_id=e.company_id AND cc.id=e.cost_center_id LEFT JOIN payroll_employee_numbers n ON n.company_id=e.company_id AND n.employee_id=e.id WHERE e.company_id=? AND e.admission_date<=? ORDER BY e.name,e.id LIMIT 151"
 ).bind(salaryEnd,salaryEnd,companyId,end).all()).results||[];
 if(employees.length>150)bad70(d,'EMPLOYEE_LIMIT','Mais de 150 empregados no ano: confira em lotes menores.');
 const [occurrences,variable,advances]=await Promise.all([
  env.DB.prepare("SELECT employee_id,kind,COUNT(*) AS total FROM payroll_employee_occurrences WHERE company_id=? AND start_date<=? AND end_date>=? GROUP BY employee_id,kind")
   .bind(companyId,end,year+'-01-01').all(),
  env.DB.prepare("SELECT m.employee_id,COUNT(*) AS total FROM payroll_movements m JOIN payroll_events e ON e.id=m.event_id AND e.company_id=m.company_id JOIN payroll_competences comp ON comp.id=m.competence_id AND comp.company_id=m.company_id WHERE m.company_id=? AND comp.competence>=? AND comp.competence<=? AND e.event_type='PROVENTO' GROUP BY m.employee_id")
   .bind(companyId,year+'-01',year+'-12').all(),
  advances70(env,companyId,year)
 ]);
 const specials=new Map(),variableSet=new Set((variable.results||[]).map(x=>x.employee_id));
 for(const o of occurrences.results||[]){
  const a=specials.get(o.employee_id)||[];a.push(o.kind);specials.set(o.employee_id,a);
 }
 const advanceByEmployee=new Map(advances.map(x=>[x.employee_id,x]));
 const ids=new Set(employees.map(x=>x.id));
 const problems=[],items=[];
 const addGlobal=(code,message)=>{if(!problems.some(p=>p.code===code))problems.push({code,message})};
 for(const a of advances)if(!ids.has(a.employee_id))addGlobal('ORPHAN_ADVANCE','Adiantamento ativo com empregado ausente da pre-visualizacao.');
 for(const employee of employees){
  const blockers=[],warnings=[];
  const avos=twelfths70(employee.admission_date,year);
  const salary=Number(employee.salary_cents);
  if(avos===null||avos>12)blockers.push('Data de admissao invalida.');
  if(!Number.isSafeInteger(salary)||salary<=0||salary>99999999999)blockers.push('Salario historico de referencia nao encontrado.');
  if(!employee.cost_center_id||!employee.cost_center_code)blockers.push('Centro de custo do empregado nao cadastrado.');
  if(Number(employee.active)!==1||employee.situation!=='ATIVO')blockers.push('Situacao funcional nao ativa: exige apuracao propria.');
  if(specials.has(employee.id))blockers.push('Ocorrencias de '+[...new Set(specials.get(employee.id))].join(', ')+': conferir avos, afastamentos e direitos.');
  if(variableSet.has(employee.id))blockers.push('Verbas salariais adicionais: conferir medias e incidencias do 13o.');
  if(phase==='FIRST')warnings.push('Referencia do adiantamento: conferir remuneracao anterior, convenção e ferias antes de declarar o pagamento.');
  else warnings.push('INSS e IRRF do 13o sao exclusivos; confirmar parametrizacao tributaria e pagamento.');
  let tax=null;
  const advance=advanceByEmployee.get(employee.id)||null;
  const full=Number.isSafeInteger(salary)&&salary>0&&avos!==null?
   Number((BigInt(salary)*BigInt(avos)+6n)/12n):0;
  if(phase==='SECOND'){
   if(!advance)blockers.push('Adiantamento nao documentado. Antes de quitar, registre o pagamento anterior ou faca conciliacao especifica.');
   if(advance&&Number(advance.amount_cents)>full)blockers.push('Adiantamento declarado superior ao direito total.');
   if(!blockers.length){
    try{tax=d.taxes(full,full,Math.max(0,full-Number(advance.amount_cents)),year+'-12',year+'-12-20',0)}
    catch(e){blockers.push('Calculo tributario: '+String(e?.message||e).slice(0,180))}
   }
  }
  let calculation;
  try{calculation=amounts70(Number.isSafeInteger(salary)&&salary>0?salary:0,avos??0,
   advance?.amount_cents||0,tax,phase)}
  catch(e){blockers.push('Total monetario invalido: '+String(e?.message||e));calculation=null}
  if(phase==='SECOND'&&calculation?.insufficient_second)
   blockers.push('Saldo da segunda parcela insuficiente para os descontos legais; exige tratamento pelo DP.');
  const item={employee_id:employee.id,employee_code:employee.employee_number==null?null:String(employee.employee_number).padStart(5,'0'),
   employee_name:employee.name,admission_date:employee.admission_date,
   cost_center_id:employee.cost_center_id,cost_center_code:employee.cost_center_code,
   reference_salary_cents:Number.isSafeInteger(salary)?salary:null,
   avos,advance:advance?{id:advance.id,amount_cents:Number(advance.amount_cents),
    payment_date:advance.payment_date,document_ref:advance.document_ref,
    declared_external:true,bank_verified:false}:null,
   calculation,blockers,warnings,ready:blockers.length===0,
   tax_reference:tax?{inss_table_from:tax.inss_table_from,irrf_table_from:tax.irrf_table_from}:null};
  items.push(item);
 }
 const totals={employees:items.length,ready:items.filter(x=>x.ready).length,blocked:items.filter(x=>!x.ready).length};
 for(const key of ['gross_cents','estimated_advance_cents','advance_cents','inss_cents','irrf_cents','fgts_cents','net_cents']){
  totals[key]=items.reduce((sum,x)=>sum+Number(x.calculation?.[key]||0),0);
  if(!Number.isSafeInteger(totals[key]))addGlobal('TOTAL_OVERFLOW','Somatorio monetario fora da faixa segura.');
 }
 const fingerprint=await d.hash({version:109,company_id:companyId,year,phase,items:items.map(x=>({
  id:x.employee_id,admission:x.admission_date,cc:x.cost_center_id,salary:x.reference_salary_cents,
  avos:x.avos,advance:x.advance?.id||null,advance_amount:x.advance?.amount_cents||0,
  result:x.calculation,blockers:x.blockers})),global_problems:problems});
 return {kind:'THIRTEENTH_PREVIEW_V109',year,phase,reference_date:salaryEnd,employee_count:items.length,
  items,totals,problems,source_fingerprint:fingerprint,
  ready_to_declare_advance:phase==='FIRST'&&totals.blocked===0&&!problems.length,
  ready_for_payment:false,ready_for_accounting:false,read_only:true,
  warnings:[
   '13o e calculado separadamente da folha normal, com 1/12 por mes elegivel (15 dias ou mais).',
   'O calculo considera salario contratual de referencia e nao apura automaticamente medias ou afastamentos.',
   'Primeira parcela: sem descontos de INSS e IRRF; FGTS sobre o valor do adiantamento.',
   'Segunda parcela: INSS e IRRF sobre o total do 13o; FGTS apenas sobre o saldo da parcela.',
   'Os valores declarados como adiantamento sao documentos externos; nao comprovam conciliacao bancaria.',
   'Nenhum titulo financeiro, diario contabil, guia ou deposito e criado por esta previa.'
  ]};
}
export async function payrollThirteenth70(action,c){
 const {env,companyId,auth,d,request,body={}}=c;
 await d.requirePermission(env,auth.user.id,companyId,action==='preview'||action==='advances'?'payroll.read':'payroll.manage');
 await d.ensureSchemaRevision(env,'payroll-thirteenth-advances70',1,()=>schema70(env));
 if(action==='preview')return preview70(c);
 if(action==='advances'){
  return {year:year70(c.year,d),advances:await advances70(env,companyId,year70(c.year,d)),
   note:'Adiantamentos documentados externamente, sem comprovacao bancaria automatica.'};
 }
 if(action==='declare'){
  if(body.confirmation!=='REGISTRAR ADIANTAMENTO 13')bad70(d,'CONFIRMATION_REQUIRED','Digite REGISTRAR ADIANTAMENTO 13.',400);
  const year=year70(body.year,d),employeeId=String(body.employee_id||'').trim();
  const value=integer70(body.amount_cents,d,'adiantamento',true);
  const paidDate=date70(body.payment_date,d);
  if(paidDate>new Date().toISOString().slice(0,10))bad70(d,'FUTURE_PAYMENT','Nao declare como realizado um pagamento futuro.',400);
  if(paidDate<year+'-02-01'||paidDate>year+'-11-30')bad70(d,'PAYMENT_DATE_INVALID','O adiantamento comum deve ocorrer entre fevereiro e novembro.',400);
  const document=String(body.document_ref||'').trim(),notes=String(body.notes||'').trim();
  if(document.length<8||document.length>160||notes.length<15||notes.length>500)
   bad70(d,'DOCUMENT_INVALID','Informe referencia (8 a 160) e justificativa (15 a 500 caracteres).',400);
  const preview=await preview70({...c,year,phase:'FIRST'});
  if(preview.source_fingerprint!==body.source_fingerprint)
   bad70(d,'PREVIEW_STALE','A previa mudou; confira novamente antes de registrar.');
  const employee=preview.items.find(x=>x.employee_id===employeeId);
  if(!employee||!employee.ready)
   bad70(d,'EMPLOYEE_BLOCKED','Funcionario com pendencia na previa do 13o.');
  if(preview.problems.length)bad70(d,'PREVIEW_GLOBAL_BLOCK','Existem pendencias globais no adiantamento.');
  if(value!==employee.calculation?.estimated_advance_cents)
   bad70(d,'ADVANCE_DIFFERS','Adiantamento divergente da referencia calculada; requer conferência especifica.');
  const existing=(await advances70(env,companyId,year)).find(x=>x.employee_id===employeeId);
  if(existing)bad70(d,'ALREADY_DECLARED','Ja existe adiantamento ativo no ano para o empregado.');
  const id=d.uuid();
  try{
   const r=await env.DB.prepare("INSERT INTO payroll_thirteenth_advances70 (id,company_id,calendar_year,employee_id,amount_cents,payment_date,document_ref,notes,source_fingerprint,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,'ACTIVE',?)")
   .bind(id,companyId,year,employeeId,value,paidDate,document,notes,preview.source_fingerprint,auth.user.id).run();
   if(Number(r.meta?.changes)!==1)bad70(d,'WRITE_FAILED','Registro nao foi gravado.');
  }catch(e){
   if(/UNIQUE|constraint failed/i.test(String(e)))bad70(d,'ADVANCE_CONFLICT','Adiantamento ja registrado simultaneamente.');
   throw e;
  }
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'DECLARE',entity:'payroll_thirteenth_advances70',
   entityId:id,after:{year,employee_id:employeeId,amount_cents:value,payment_date:paidDate,document_ref:document}});
  return {declared:true,id,year,employee_id:employeeId,amount_cents:value,
   financial_generated:false,bank_verified:false,accounting_posted:false};
 }
 if(action==='void'){
  if(body.confirmation!=='DESVINCULAR ADIANTAMENTO 13')bad70(d,'CONFIRMATION_REQUIRED','Digite DESVINCULAR ADIANTAMENTO 13.',400);
  const notes=String(body.notes||'').trim();
  if(notes.length<15||notes.length>500)bad70(d,'NOTES_INVALID','Informe justificativa de 15 a 500 caracteres.',400);
  const id=String(body.id||'');
  const r=await env.DB.prepare("UPDATE payroll_thirteenth_advances70 SET status='VOID',voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=? WHERE company_id=? AND id=? AND status='ACTIVE'")
  .bind(auth.user.id,notes,companyId,id).run();
  if(Number(r.meta?.changes)!==1)bad70(d,'NOT_FOUND','Adiantamento ativo nao encontrado.',404);
  await d.audit(env,{companyId,userId:auth.user.id,request,action:'VOID',
   entity:'payroll_thirteenth_advances70',entityId:id,after:{reason:notes}});
  return {voided:true,id};
 }
 bad70(d,'NOT_FOUND','Acao nao encontrada.',404);
}