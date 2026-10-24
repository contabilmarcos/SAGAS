import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollAbsenceAmounts48,payrollAbsenceSnapshot48,payrollAbsence48} from '../sagas-payroll-absence48.js';
class DomainError extends Error{constructor(status,msg,code){super(msg);this.status=status;this.code=code}}
const d={HttpError:DomainError};
const absence=date=>({id:'abs'+date,date,classification:'INJUSTIFICADA'});
const late=(date,minutes)=>({kind:'LATE',event_date:date,minutes});
const dsr=(date,source_date)=>({kind:'DSR_LOSS',event_date:date,source_date});
const salary=300000,hours=220000;
test('falta injustificada desconta 1/30, mantém evento automático',()=>{
 const r=payrollAbsenceAmounts48(salary,hours,'2026-10',{absences:[absence('2026-10-07')],adjustments:[],blockers:[]},[],'RM_NEXT_MONTH',d);
 assert.equal(r.discount_cents,10000);
 assert.deepEqual(r.entries.map(x=>x.event_code),['FALTA_INJUSTIFICADA']);
});
test('falta justificada não gera desconto',()=>{
 const r=payrollAbsenceAmounts48(salary,hours,'2026-10',{absences:[{id:'a',date:'2026-10-07',classification:'JUSTIFICADA'}],adjustments:[],blockers:[]},[],'RM_NEXT_MONTH',d);
 assert.equal(r.discount_cents,0);assert.equal(r.entries.length,0);
});
test('atraso de 60 minutos a 220h no salário R$3000',()=>{
 const r=payrollAbsenceAmounts48(salary,hours,'2026-10',{absences:[],adjustments:[late('2026-10-07',60)],blockers:[]},[],'RM_NEXT_MONTH',d);
 assert.equal(r.discount_cents,1364);assert.equal(r.entries[0].event_code,'ATRASO_MINUTOS');
});
test('falta, atraso e DSR explícito não duplicam eventos',()=>{
 const r=payrollAbsenceAmounts48(salary,hours,'2026-10',{absences:[absence('2026-10-07')],adjustments:[late('2026-10-08',60),dsr('2026-10-11','2026-10-08')],blockers:[]},[],'RM_NEXT_MONTH',d);
 assert.equal(r.discount_cents,21364);
 assert.deepEqual(r.entries.map(x=>x.event_code),['FALTA_INJUSTIFICADA','ATRASO_MINUTOS','DSR_DESCONTO']);
});
test('faltas repetidas em uma data ficam bloqueadas',()=>{
 assert.throws(()=>payrollAbsenceAmounts48(salary,hours,'2026-10',{absences:[absence('2026-10-07'),absence('2026-10-07')],adjustments:[],blockers:[]},[],'RM_NEXT_MONTH',d),e=>e.code==='DUPLICATE_ABSENCE');
});
test('descontos maiores que salário ficam bloqueados',()=>{
 const many=Array.from({length:31},(_,i)=>absence('2026-10-'+String(i+1).padStart(2,'0')));
 assert.throws(()=>payrollAbsenceAmounts48(salary,hours,'2026-10',{absences:many,adjustments:[],blockers:[]},[],'RM_NEXT_MONTH',d),e=>e.code==='ABSENCE_EXCEEDS_SALARY');
});
test('não presume desconto se ocorrência não estiver classificada',async()=>{
 const db={prepare(sql){return {bind(){return this},async all(){
  if(sql.includes('payroll_employee_occurrences o'))return{results:[{id:'o1',kind:'FALTA',employee_id:'e1',start_date:'2026-10-07',end_date:'2026-10-07',classification:null}]};
  return{results:[]};
 }}}};
 const snapshot=await payrollAbsenceSnapshot48({DB:db},'comp','2026-10',d);
 assert.match(snapshot.get('e1').blockers[0],/sem classificação/);
});
test('etapa 48 ignora férias que serão bloqueadas pela etapa 49',async()=>{
 const db={prepare(sql){return {bind(){return this},async all(){
  if(sql.includes('payroll_employee_occurrences o'))return{results:[{id:'o1',kind:'FERIAS',employee_id:'e1',start_date:'2026-10-07',end_date:'2026-10-07'}]};
  return{results:[]};
 }}}};
 const snapshot=await payrollAbsenceSnapshot48({DB:db},'comp','2026-10',d);
 assert.equal(snapshot.size,0);
});
test('reajuste proporcional e falta simultânea exigem conferência de vigências',()=>{
 assert.throws(()=>payrollAbsenceAmounts48(salary,hours,'2026-10',{absences:[absence('2026-10-07')],adjustments:[],blockers:[]},[{effective_from:'2026-10-16',salary_cents:320000}],'PRORATE_CALENDAR',d),e=>e.code==='ABSENCE_SALARY_CHANGE_UNSUPPORTED');
});
test('registrar DSR sem classificação comprovada é impedido',async()=>{
 const queries=[];
 const db={prepare(sql){
  queries.push(sql);
  return {bind(){return this},async first(){
   if(sql.includes('FROM payroll_competences'))return{id:'period',status:'OPEN'};
   if(sql.includes('FROM payroll_employees'))return{id:'e1',admission_date:'2024-01-01'};
   return null;
  },async run(){return{meta:{changes:1}}},async all(){return{results:[]}}};
 }};
 const deps={HttpError:DomainError,requirePermission:async()=>{},ensureSchemaRevision:async()=>{},audit:async()=>{},uuid:()=> 'uuid'};
 await assert.rejects(payrollAbsence48('add',{env:{DB:db},companyId:'c',auth:{user:{id:'u'}},request:{},body:{
  kind:'DSR_LOSS',employee_id:'e1',event_date:'2026-10-11',source_date:'2026-10-07',confirmation:'CONFIRMAR DSR',notes:'Conferido'
 },d:deps}),e=>e.code==='DSR_SOURCE_MISSING');
});
