import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollLeaveAmounts49,payrollLeaveSnapshot49,payrollLeave49} from '../sagas-payroll-leave49.js';
class DomainError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code}}
const d={HttpError:DomainError};
const paid=(from,to)=>({id:'p',kind:'LICENCA',treatment:'PAID',from,to,days:1});
const leave=(from,to,days,mode='CALENDAR')=>({id:'u',kind:'LICENCA',treatment:'UNPAID',proration_mode:mode,from,to,days});
const out=(items,extra={})=>payrollLeaveAmounts49(300000,300000,'2026-10',
 {leave:items,blockers:[],dates:items.flatMap(x=>[x.from,x.to])},
 {absences:[],adjustments:[]},[],'RM_NEXT_MONTH','2024-01-01',[],d);
test('licença remunerada registra evento informativo sem reduzir bases',()=>{
 const r=out([paid('2026-10-06','2026-10-06')]);
 assert.equal(r.discount_cents,0);assert.equal(r.entries[0].event_code,'LICENCA_REMUNERADA');
});
test('doença inicial de até 15 dias paga pela empresa não reduz remuneração',()=>{
 const r=out([{id:'s',treatment:'SICK_EMPLOYER_15',days:10,from:'2026-10-01',to:'2026-10-10'}]);
 assert.equal(r.discount_cents,0);assert.equal(r.entries[0].event_code,'DOENCA_EMPRESA_15');
});
test('licença não remunerada por 10 dias de outubro — dias reais',()=>{
 const r=out([leave('2026-10-11','2026-10-20',10)]);
 assert.equal(r.discount_cents,96774);
 assert.equal(r.entries[0].event_code,'LICENCA_NAO_REMUNERADA');
});
test('licença não remunerada por 10 dias, divisor comercial 30',()=>{
 const r=out([leave('2026-10-11','2026-10-20',10,'COMMERCIAL_30')]);
 assert.equal(r.discount_cents,100000);
});
test('licença cobrindo fevereiro inteiro zera salário, inclusive com mês comercial',()=>{
 const r=payrollLeaveAmounts49(300000,300000,'2026-02',
 {leave:[leave('2026-02-01','2026-02-28',28,'COMMERCIAL_30')],blockers:[],dates:[]},
 null,[],'RM_NEXT_MONTH','2024-01-01',[],d);
 assert.equal(r.discount_cents,300000);
});
test('30 dias em outubro de 31 dias e comercial requer conferência',()=>{
 assert.throws(()=>out([leave('2026-10-01','2026-10-30',30,'COMMERCIAL_30')]),e=>e.code==='LEAVE_COMMERCIAL_EDGE');
});
test('licenças sem remuneração múltiplas não são apropriadas sem consolidar',()=>{
 assert.throws(()=>out([leave('2026-10-01','2026-10-10',10),leave('2026-10-20','2026-10-22',3)]),e=>e.code==='LEAVE_MULTIPLE_UNPAID');
});
test('admissão proporcional e licença sem remuneração são bloqueadas',()=>{
 assert.throws(()=>payrollLeaveAmounts49(300000,250000,'2026-10',
 {leave:[leave('2026-10-11','2026-10-20',10)],blockers:[],dates:[]},
 null,[],'RM_NEXT_MONTH','2026-10-06',[],d),e=>e.code==='LEAVE_ADMISSION');
});
test('falta sobreposta à licença impede duplicidade',()=>{
 assert.throws(()=>payrollLeaveAmounts49(300000,300000,'2026-10',
 {leave:[leave('2026-10-11','2026-10-20',10)],blockers:[],dates:['2026-10-15']},
 {absences:[{date:'2026-10-15'}],adjustments:[]},[],'RM_NEXT_MONTH','2024-01-01',[],d),
 e=>e.code==='LEAVE_ATTENDANCE_OVERLAP');
});
test('férias continuam bloqueadas e nunca viram licença',async()=>{
 const env={DB:{prepare(){return {bind(){return this},async all(){return{results:[{id:'o',employee_id:'e1',kind:'FERIAS',start_date:'2026-10-01',end_date:'2026-10-10'}]}}}}}};
 const snap=await payrollLeaveSnapshot49(env,'company','2026-10',d);
 assert.match(snap.get('e1').blockers[0],/Férias/);
});
test('afastamento por doença acima de quinze dias permanece bloqueado',async()=>{
 const env={DB:{prepare(){return {bind(){return this},async all(){return{results:[{id:'o',employee_id:'e1',kind:'AFASTAMENTO',start_date:'2026-10-01',end_date:'2026-10-19',treatment:'SICK_EMPLOYER_15'}]}}}}}};
 const snap=await payrollLeaveSnapshot49(env,'company','2026-10',d);
 assert.match(snap.get('e1').blockers[0],/excede os primeiros 15 dias/);
});
test('licença sem classificação mantém folha bloqueada',async()=>{
 const env={DB:{prepare(){return {bind(){return this},async all(){return{results:[{id:'o',employee_id:'e1',kind:'LICENCA',start_date:'2026-10-01',end_date:'2026-10-10'}]}}}}}};
 const snap=await payrollLeaveSnapshot49(env,'company','2026-10',d);
 assert.match(snap.get('e1').blockers[0],/Classifique/);
});
test('afastamentos de benefício INSS continuam pendentes de processo previdenciário',async()=>{
 const env={DB:{prepare(){return {bind(){return this},async all(){return{results:[{id:'o',employee_id:'e1',kind:'AFASTAMENTO',start_date:'2026-10-01',end_date:'2026-10-20',treatment:'INSS'}]}}}}}};
 const snap=await payrollLeaveSnapshot49(env,'company','2026-10',d);
 assert.match(snap.get('e1').blockers[0],/cálculo específico/);
});
