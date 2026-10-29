import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {payrollSimple141,natureLedger141} from '../sagas-payroll-simple141.js';
import {ensureProvisionLedger43,payrollProvisions43} from '../sagas-payroll-provisions43.js';

class HttpError extends Error {constructor(status,message,code){super(message);this.status=status;this.code=code;}}
function fixture(){
 const sql=new DatabaseSync(':memory:');
 const DB={prepare(text){return {args:[],bind(...args){this.args=args;return this;},async first(){return sql.prepare(text).get(...this.args)||null;},async all(){return {results:sql.prepare(text).all(...this.args)};},async run(){const r=sql.prepare(text).run(...this.args);return {meta:{changes:Number(r.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 sql.exec(`CREATE TABLE cost_centers(id TEXT,company_id TEXT,code TEXT,name TEXT,active INTEGER);
 CREATE TABLE accounts(id TEXT,company_id TEXT,code TEXT,name TEXT,active INTEGER,analytic INTEGER);
 CREATE TABLE budget_natures(id TEXT,company_id TEXT,code TEXT,description TEXT,active INTEGER,synthetic_analytic TEXT);
 CREATE TABLE budget_nature_accounts(id TEXT,company_id TEXT,nature_id TEXT,side TEXT,account_id TEXT,percentage REAL,cost_center_id TEXT,branch_id TEXT,history_template_id TEXT,history_complement TEXT,created_at TEXT);
 CREATE TABLE branches(id TEXT,company_id TEXT,active INTEGER);
 CREATE TABLE history_templates(id TEXT,company_id TEXT,active INTEGER);
 CREATE TABLE payroll_competences(id TEXT,company_id TEXT,competence TEXT,status TEXT);
 CREATE TABLE accounting_periods(id TEXT,company_id TEXT,code TEXT,status TEXT,start_date TEXT,end_date TEXT,closed_until TEXT);
 CREATE TABLE journal_batches(id TEXT PRIMARY KEY,company_id TEXT,period_id TEXT,code TEXT,description TEXT,start_date TEXT,end_date TEXT,status TEXT,created_by TEXT,cover_mode TEXT,cover_amount_cents INTEGER,UNIQUE(company_id,code));
 CREATE TABLE journal_entries(id TEXT PRIMARY KEY,company_id TEXT,batch_id TEXT,branch_id TEXT,entry_date TEXT,document_number TEXT,description TEXT,source_module TEXT,source_reference TEXT,status TEXT,total_debit_cents INTEGER,total_credit_cents INTEGER,created_by TEXT,posted_by TEXT,posted_at TEXT);
 CREATE TABLE journal_lines(id TEXT PRIMARY KEY,company_id TEXT,entry_id TEXT,line_no INTEGER,account_id TEXT,side TEXT,amount_cents INTEGER,branch_id TEXT,cost_center_id TEXT,history_template_id TEXT,history_complement TEXT,document_number TEXT);
 CREATE TABLE financial_payables(id TEXT PRIMARY KEY,company_id TEXT,number TEXT,supplier_id TEXT,source_type TEXT,source_id TEXT,issue_date TEXT,due_date TEXT,document_number TEXT,description TEXT,amount_cents INTEGER,balance_cents INTEGER,status TEXT,created_by TEXT,UNIQUE(company_id,source_type,source_id));
 CREATE TABLE payroll_employees(id TEXT PRIMARY KEY,company_id TEXT,name TEXT,cost_center_id TEXT);
 CREATE TABLE payroll_employee_numbers(employee_id TEXT,company_id TEXT,number INTEGER);
 INSERT INTO cost_centers VALUES('cc','company','001','Produção',1),('other','company','002','Admin',1);
 INSERT INTO payroll_employees VALUES('employee','company','Maria','cc');
 INSERT INTO accounts VALUES('expense','company','1','Despesa',1,1),('payable','company','2','Passivo',1,1),('specific','company','3','Específica',1,1);
 INSERT INTO budget_natures VALUES('salary','company','1','Salários',1,'ANALYTIC'),('net','company','2','Líquido',1,'ANALYTIC'),('provision','company','3','Provisões',1,'ANALYTIC');
 INSERT INTO budget_nature_accounts VALUES
 ('d','company','salary','D','expense',100,NULL,NULL,NULL,'Salário',''),
 ('ds','company','salary','D','specific',100,'cc',NULL,NULL,'Salário CC',''),
 ('c','company','net','C','payable',100,NULL,NULL,NULL,'Líquido',''),
 ('pd','company','provision','D','expense',100,NULL,NULL,NULL,'Provisão',''),
 ('pc','company','provision','C','payable',100,NULL,NULL,NULL,'Provisão','');
 INSERT INTO accounting_periods VALUES('period','company','2026','OPEN','2026-01-01','2026-12-31',NULL);`);
 let seq=0;const initialized=new Set(),permissions=[];
 const d={HttpError,uuid:()=>`id${++seq}`,audit:async()=>{},requirePermission:async(...args)=>permissions.push(args.at(-1)),
 ensureSchemaRevision:async(e,key,revision,fn)=>{if(!initialized.has(key)){await fn();initialized.add(key);}}};
 d.createBatch=realCreateBatch(DB,d);
 const base={env:{DB},companyId:'company',auth:{user:{id:'user'}},d};
 const call=(action,body={})=>payrollSimple141(action,{...base,body:{competence:'2026-01',cost_center_id:'cc',...(action==='post'?{batch_code:'77',batch_description:'Folha de janeiro'}:{}),...body}});
 async function seed(){
  await call('setup');await ensureProvisionLedger43(base.env);
  const setup=await call('setup');
  const events={...Object.fromEntries(setup.events.map(x=>[x.code,0])),SALARIO_BASE:10000,SALARIO_LIQUIDO:10000,PROV_FERIAS:833,PROV_TERCO:278,PROV_13:833};
  sql.prepare('INSERT INTO payroll_simple_runs141(id,company_id,competence,cost_center_id,revision,payment_date,report_json,created_by) VALUES(?,?,?,?,?,?,?,?)').run('run','company','2026-01','cc',1,'2026-02-05',JSON.stringify({totals:events,employees:[{employee_id:'employee',name:'Maria',cost_center_id:'cc',events}]}),'user');
  for(const [event_code,nature_id] of Object.entries({SALARIO_BASE:'salary',SALARIO_LIQUIDO:'net',PROV_FERIAS:'provision',PROV_TERCO:'provision',PROV_13:'provision'}))await call('mapping',{event_code,nature_id});
 }
 return {sql,DB,base,call,seed,permissions};
}
test('natureza usa defaults específicos por lado, preserva CC e concilia lote',async()=>{
 const f=fixture();await f.seed();const r=await f.call('accounting');
 assert.equal(r.plan.balanced,true);
 assert.equal(r.plan.lines.find(x=>x.event_code==='SALARIO_BASE').account_id,'specific');
 assert.ok(r.plan.lines.every(x=>x.cost_center_id==='cc'));
 await f.call('post');assert.ok(f.permissions.includes('accounting.entry.post'));
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM journal_entries").get().n,1);
 assert.equal(f.sql.prepare("SELECT history_complement FROM journal_lines WHERE account_id='specific'").get().history_complement,'Salário CC');
 assert.equal((await f.call('post')).reused,true);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM journal_entries').get().n,1);
});
test('natureza inativa, percentuais incorretos, conta externa e líquido devedor bloqueiam postagem',async()=>{
 for(const change of ["UPDATE budget_natures SET active=0 WHERE id='salary'","UPDATE budget_nature_accounts SET percentage=50 WHERE id='ds'","UPDATE accounts SET company_id='foreign' WHERE id='specific'","UPDATE budget_nature_accounts SET side='D' WHERE id='c'","UPDATE cost_centers SET active=0 WHERE id='cc'"]){
  const f=fixture();await f.seed();f.sql.exec(change);
  assert.equal((await f.call('accounting')).plan.balanced,false);
  await assert.rejects(f.call('post'),e=>e.code==='UNBALANCED_OR_UNMAPPED');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM journal_entries').get().n,0);
 }
});
test('títulos exigem contabilização, conciliam líquido e são idempotentes',async()=>{
 const f=fixture();await f.seed();await assert.rejects(f.call('finance'),e=>e.code==='NOT_POSTED');
 await f.call('post');const r=await f.call('finance');assert.equal(r.total_cents,10000);
 const title=f.sql.prepare('SELECT * FROM financial_payables').get();
 assert.equal(title.supplier_id,'employee');assert.equal(title.source_type,'PAYROLL_MONTHLY');assert.equal(title.due_date,'2026-02-05');assert.equal(title.balance_cents,10000);
 assert.equal((await f.call('finance')).reused,true);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM financial_payables').get().n,1);
 assert.ok(f.permissions.includes('financial.payable.manage'));
});
test('duplicidade histórica de título bloqueia e falha SQL reverte marcador',async()=>{
 const f=fixture();await f.seed();await f.call('post');
 f.sql.exec("INSERT INTO financial_payables(id,company_id,supplier_id,source_type,issue_date,status) VALUES('old','company','employee','PAYROLL_MONTHLY','2026-01-31','PAID')");
 await assert.rejects(f.call('finance'),e=>e.code==='PAYABLE_EXISTS');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payroll_simple_integrations141').get().n,0);
 f.sql.exec("DELETE FROM financial_payables; CREATE TRIGGER reject_title BEFORE INSERT ON financial_payables BEGIN SELECT RAISE(ABORT,'test failure'); END");
 await assert.rejects(f.call('finance'),/test failure/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payroll_simple_integrations141').get().n,0);
});
test('constituição usa livro existente, permite baixa, bloqueia saldo insuficiente e duplicidade legada',async()=>{
 const f=fixture();await f.seed();await f.call('post');
 assert.equal((await f.call('provisions')).count,3);assert.equal((await f.call('provisions')).reused,true);
 const movement={employee_id:'employee',component:'FERIAS',competence:'2026-01',movement_kind:'USE',amount:'5.00',document_ref:'Recibo férias',request_key:'baixa_ferias_000001',confirmation:'BAIXAR'};
 await payrollProvisions43('movement',{...f.base,body:movement});
 const balance=f.sql.prepare("SELECT SUM(amount_cents) n FROM payroll_provision_movements43 WHERE component='FERIAS'").get().n;
 assert.equal(balance,333);
 await assert.rejects(payrollProvisions43('movement',{...f.base,body:{...movement,request_key:'baixa_ferias_000002'}}),e=>e.code==='BALANCE_BLOCKED');
 f.sql.exec("DELETE FROM payroll_simple_integrations141 WHERE kind='provisions'");
 await assert.rejects(f.call('provisions'),e=>e.code==='INTEGRATION_CONFLICT');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payroll_provision_movements43').get().n,4);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM payroll_simple_integrations141 WHERE kind='provisions'").get().n,0);
});
test('postagem preserva snapshot das naturezas mesmo após alterar defaults',async()=>{
 const f=fixture();await f.seed();const before=(await f.call('accounting')).plan;
 await f.call('post');f.sql.exec("UPDATE budget_nature_accounts SET account_id='expense' WHERE id='ds'");
 assert.deepEqual((await f.call('accounting')).plan,before);
});
test('relatório separa estimativas das constituições e baixas do principal',async()=>{
 const f=fixture();await f.seed();
 assert.deepEqual((await f.call('report')).provision_balances,[]);
 await f.call('post');await f.call('provisions');
 const report=await f.call('report');
 assert.equal(report.provision_balances.find(x=>x.component==='FERIAS').balance_cents,833);
 assert.equal(report.provision_history[0].totals.PROV_FERIAS,833);
});

import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('baixa financeira herda CC da folha; evento conflitante é bloqueado',async()=>{
 const source=readFileSync(new URL('../SAGAS_worker.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('async function buildFinancialPaymentAccountingLines'),source.indexOf('async function payFinancialPayable'));
 const event={active:1,process:'BAIXA',items:[{side:'D',account_id:'payable',formula:'VALUE'},{side:'C',account_id:'bank',formula:'VALUE'}]};
 const ctx={HttpError,getFinancialAccountingEvent:async()=>event,getFinancialCashAccount:async()=>({active:1}),
  evalFinancialPaymentFormula:()=>10000,assertAnalyticActiveAccount:async()=>{},centsToMoney:n=>n/100,financialHistoryTokens:s=>s};
 const build=runInNewContext(code+';buildFinancialPaymentAccountingLines',ctx);
 const env={DB:{prepare:sql=>({bind(){return this;},async first(){return sql.includes('sqlite_master')?{name:'payroll_simple_payables141'}:{cost_center_id:'cc'};}})}};
 const args={eventId:'event',cashAccountId:'bank',payable:{id:'title',source_type:'PAYROLL_MONTHLY',balance_cents:10000},paymentDate:'2026-02-05'};
 const result=await build(env,'company',args);
 assert.ok(result.lines.every(x=>x.cost_center_id==='cc'));
 event.items[0].cost_center_id='other';
 await assert.rejects(build(env,'company',args),e=>e.code==='PAYROLL_PAYMENT_CENTER_MISMATCH');
});
test('rateio conserva centavos e outro CC usa defaults gerais',async()=>{
 const f=fixture();await f.seed();
 f.sql.exec("UPDATE budget_nature_accounts SET percentage=50 WHERE id='ds'; INSERT INTO budget_nature_accounts(id,company_id,nature_id,side,account_id,percentage,cost_center_id,created_at) VALUES('ds2','company','salary','D','expense',50,'cc','')");
 const plan=await natureLedger141(f.DB,'company',{SALARIO_BASE:101,SALARIO_LIQUIDO:101},{SALARIO_BASE:{nature_id:'salary'},SALARIO_LIQUIDO:{nature_id:'net'}},'cc');
 assert.equal(plan.balanced,true);assert.equal(plan.debit_cents,101);
 assert.deepEqual(plan.lines.filter(x=>x.side==='D').map(x=>x.amount_cents),[51,50]);
 const general=await natureLedger141(f.DB,'company',{SALARIO_BASE:101,SALARIO_LIQUIDO:101},{SALARIO_BASE:{nature_id:'salary'},SALARIO_LIQUIDO:{nature_id:'net'}},'other');
 assert.equal(general.balanced,true);assert.equal(general.lines[0].account_id,'expense');
 const external=await natureLedger141(f.DB,'foreign',{SALARIO_BASE:101},{SALARIO_BASE:{nature_id:'salary'}},'cc');
 assert.equal(external.balanced,false);
});

function nextRun(f,month='2026-02',cc='cc',company='company'){
 const original=f.sql.prepare("SELECT * FROM payroll_simple_runs141 WHERE id='run'").get();
 f.sql.prepare(`INSERT INTO payroll_simple_runs141(id,company_id,competence,cost_center_id,revision,payment_date,report_json,created_by)
 VALUES(?,?,?,?,1,?,?,?)`).run('run-'+month+'-'+cc+'-'+company,company,month,cc,month+'-28',original.report_json,'user');
}
test('copiar competência anterior preenche a tela contábil sem alterar os parâmetros da origem',async()=>{
 const f=fixture();await f.seed();await f.call('post');nextRun(f);
 const before=await f.call('accounting',{competence:'2026-02'});
 assert.equal(before.events.find(x=>x.code==='SALARIO_BASE').nature_id,null);
 const copy=await f.call('copy-previous',{competence:'2026-02'});
 assert.equal(copy.source_competence,'2026-01');assert.equal(copy.copied,5);
 assert.equal((await f.call('accounting',{competence:'2026-02'})).plan.balanced,true);
 assert.equal((await f.call('copy-previous',{competence:'2026-02'})).copied,0);
 await f.call('mapping',{competence:'2026-02',event_code:'SALARIO_BASE',nature_id:'provision'});
 assert.equal((await f.call('accounting')).events.find(x=>x.code==='SALARIO_BASE').nature_id,'salary');
 assert.ok(f.permissions.includes('payroll.manage'));
});
test('cópia preserva ajustes do destino e ignora naturezas inativas ou de outra empresa',async()=>{
 const f=fixture();await f.seed();nextRun(f);
 await f.call('mapping',{competence:'2026-02',event_code:'SALARIO_BASE',nature_id:'provision'});
 f.sql.exec("UPDATE budget_natures SET active=0 WHERE id='net'; UPDATE budget_natures SET company_id='foreign' WHERE id='salary'");
 const copy=await f.call('copy-previous',{competence:'2026-02'});
 assert.equal(copy.copied,3);assert.deepEqual(copy.skipped,['Salário líquido a pagar']);
 const r=await f.call('accounting',{competence:'2026-02'});
 assert.equal(r.events.find(x=>x.code==='SALARIO_BASE').nature_id,'provision');
 assert.equal(r.events.find(x=>x.code==='SALARIO_LIQUIDO').nature_id,null);
 assert.equal(r.plan.balanced,false);
});
test('cópia usa mês imediatamente anterior inclusive na virada de ano e respeita empresa/CC',async()=>{
 const f=fixture();await f.seed();
 nextRun(f,'2026-03');
 await assert.rejects(f.call('copy-previous',{competence:'2026-03'}),e=>e.code==='PREVIOUS_MAPPING_MISSING');
 nextRun(f,'2026-02','other');
 await assert.rejects(f.call('copy-previous',{competence:'2026-02',cost_center_id:'other'}),e=>e.code==='PREVIOUS_MAPPING_MISSING');
 nextRun(f,'2026-02','cc','foreign');
 await assert.rejects(payrollSimple141('copy-previous',{...f.base,companyId:'foreign',body:{competence:'2026-02',cost_center_id:'cc'}}),e=>e.code==='PREVIOUS_MAPPING_MISSING');
 f.sql.exec("UPDATE payroll_simple_period_natures141 SET competence='2025-12'");
 assert.equal((await f.call('copy-previous')).source_competence,'2025-12');
 assert.equal((await f.call('accounting')).plan.balanced,true);
});
test('folhas contabilizadas bloqueiam cópia, e falhas na cópia são atômicas',async()=>{
 const f=fixture();await f.seed();await f.call('post');
 await assert.rejects(f.call('copy-previous'),e=>e.code==='ALREADY_POSTED');
 nextRun(f);
 f.sql.exec("CREATE TRIGGER reject_copy BEFORE INSERT ON payroll_simple_period_natures141 WHEN NEW.competence='2026-02' AND NEW.event_code='SALARIO_LIQUIDO' BEGIN SELECT RAISE(ABORT,'copy failure'); END");
 await assert.rejects(f.call('copy-previous',{competence:'2026-02'}),/copy failure/);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM payroll_simple_period_natures141 WHERE competence='2026-02'").get().n,0);
});
test('migração preserva snapshots históricos e cadastro antigo somente no último mês calculado',async()=>{
 const f=fixture();await f.seed();await f.call('post');nextRun(f);
 f.sql.exec(`DELETE FROM payroll_simple_period_natures141;
 INSERT INTO payroll_simple_natures141(company_id,cost_center_id,event_code,nature_id,updated_by) VALUES('company','cc','SALARIO_BASE','provision','user');`);
 // Simula a primeira execução da nova revisão em um banco da versão anterior.
 const ensure=f.base.d.ensureSchemaRevision;
 f.base.d.ensureSchemaRevision=async(env,key,revision,fn)=>key==='payroll-simple-period-mappings141'?fn():ensure(env,key,revision,fn);
 const january=await f.call('accounting');
 const february=await f.call('accounting',{competence:'2026-02'});
 assert.equal(january.events.find(x=>x.code==='SALARIO_BASE').nature_id,'salary');
 assert.equal(february.events.find(x=>x.code==='SALARIO_BASE').nature_id,'provision');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM payroll_simple_period_natures141 WHERE competence='2025-12'").get().n,0);
});

test('botão de copiar preenche os parâmetros e atualiza a prévia na mesma tela',async()=>{
 const elements=new Map(),messages=[];let copied=false;
 const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',querySelectorAll:()=>[],click(){return this.onclick?.();}});return elements.get(id);};
 const setup={months:[{competence:'2026-02'}],centers:[{id:'cc',code:'001',name:'Produção'}],natures:[{id:'salary',code:'1',description:'Salários'}]};
 const api=async(path,options={})=>{
  if(path.endsWith('/setup'))return setup;
  if(path.endsWith('/copy-previous')){assert.equal(options.body.competence,'2026-02');assert.equal(options.body.cost_center_id,'cc');copied=true;return {source_competence:'2026-01',copied:1,skipped:[]};}
  return {posted:null,revision:1,events:[{code:'SALARIO_BASE',name:'Salário',amount_cents:100,nature_id:copied?'salary':null}],plan:{lines:[],missing:[],problems:[],debit_cents:100,credit_cents:100,balanced:true}};
 };
 const window={};
 runInNewContext(readFileSync(new URL('../sagas-payroll-simple141-ui.js',import.meta.url),'utf8'),{
  window,api,S:{companyId:'company',page:'payroll-simple-accounting'},esc:x=>x,money:x=>String(x),toast:x=>messages.push(x),document:{getElementById:element}
 });
 await window.SAGAS_SIMPLE141.render('payroll-simple-accounting');
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(element('s141result').innerHTML,/Usar parâmetros da competência anterior/);
 await element('s141copyPrevious').onclick();
 assert.match(element('s141result').innerHTML,/1 - Salários/);
 assert.match(messages.at(-1),/1 parâmetro\(s\) preenchido\(s\) de 01\/2026/);
});

// Executa o cadastro de lotes real do Worker sobre SQLite, sem rede ou migrações externas.
function realCreateBatch(DB,d){
 const worker=readFileSync(new URL('../SAGAS_worker.js',import.meta.url),'utf8');
 const common=worker.slice(worker.indexOf('function required('),worker.indexOf('function bool01('));
 const numbering=worker.slice(worker.indexOf('function nextIsoDate('),worker.indexOf('async function batchEntrySummary('));
 const create=worker.slice(worker.indexOf('async function createBatch('),worker.indexOf('async function updateBatch('));
 return runInNewContext(common+numbering+create+';createBatch',{
  HttpError,requirePermission:d.requirePermission,uuid:d.uuid,audit:d.audit,
  ensureAccountingPeriodSchema:async()=>{},ensureBatchIntegrationSchema:async()=>{},
  assertCompanyEntity:async(env,table,id,company)=>{
   const row=await DB.prepare('SELECT * FROM '+table+' WHERE id=? AND company_id=?').bind(id,company).first();
   if(!row)throw new HttpError(404,'Registro não encontrado.','NOT_FOUND');
   return row;
  }
 });
}
test('postagem grava o número e a descrição informados no lote real',async()=>{
 const f=fixture();await f.seed();
 const posted=await f.call('post',{batch_code:'00123',batch_description:'  Salários da produção — janeiro  '});
 const batch=f.sql.prepare('SELECT * FROM journal_batches WHERE id=?').get(posted.batch_id);
 assert.equal(batch.code,'123');assert.equal(batch.description,'Salários da produção — janeiro');
 assert.equal(batch.period_id,'period');assert.equal(posted.batch_code,'123');
 assert.equal(f.sql.prepare('SELECT batch_id FROM journal_entries').get().batch_id,batch.id);
 assert.equal((await f.call('post',{batch_code:'999',batch_description:'Outra descrição'})).reused,true);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM journal_batches').get().n,1);
});
test('postagem exige número positivo e descrição, sem criar lote em caso de erro',async()=>{
 const f=fixture();await f.seed();
 for(const batch_code of ['', '0','000','-3','1.5','12A','1234567890123456']){
  await assert.rejects(f.call('post',{batch_code}),e=>e.code==='INVALID_BATCH_CODE');
 }
 for(const batch_description of ['', '   ','a'.repeat(501)]){
  await assert.rejects(f.call('post',{batch_description}),e=>e.code==='INVALID_BATCH_DESCRIPTION');
 }
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM journal_batches').get().n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM journal_entries').get().n,0);
});
test('número existente na empresa bloqueia sem usar o lote anterior',async()=>{
 const f=fixture();await f.seed();
 f.sql.exec("INSERT INTO journal_batches(id,company_id,code,description) VALUES('old','company','00077','Lote existente')");
 await assert.rejects(f.call('post'),e=>e.code==='BATCH_CODE_EXISTS');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM journal_batches').get().n,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM journal_entries').get().n,0);
 assert.equal(f.sql.prepare('SELECT description FROM journal_batches').get().description,'Lote existente');
});
test('cadastro compartilhado mantém numeração automática e permite o mesmo número em outra empresa',async()=>{
 const f=fixture();await f.seed();
 f.sql.exec("INSERT INTO journal_batches(id,company_id,code) VALUES('foreign','foreign','77')");
 assert.equal((await f.call('post')).batch_code,'77');
 const automatic=await f.base.d.createBatch(f.base.env,null,f.base.auth,'company',{period_id:'period',description:'Lote automático'});
 assert.equal(automatic.code,'78');
 for(const code of ['0','-1','1A'])await assert.rejects(f.base.d.createBatch(f.base.env,null,f.base.auth,'company',{period_id:'period',description:'Inválido',code}),e=>e.code==='INVALID_BATCH_CODE');
});

test('clicar em contabilizar abre formulário; só a confirmação envia os dados do lote',async()=>{
 const elements=new Map(),requests=[],messages=[];let modal=null,closed=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',disabled:false,querySelectorAll:()=>[],click(){return this.onclick?.();}});return elements.get(id);};
 const setup={months:[{competence:'2026-01'}],centers:[{id:'cc',code:'001',name:'Produção'}],natures:[]};
 const api=async(path,options={})=>{
  if(path.endsWith('/setup'))return setup;
  if(path.endsWith('/post')){
   requests.push(options.body);
   if(requests.length===1)throw new Error('Este número de lote já existe na empresa.');
   return {batch_code:options.body.batch_code};
  }
  return {posted:null,revision:1,events:[],plan:{lines:[],missing:[],problems:[],debit_cents:100,credit_cents:100,balanced:true}};
 };
 const window={};
 runInNewContext(readFileSync(new URL('../sagas-payroll-simple141-ui.js',import.meta.url),'utf8'),{
  window,api,S:{companyId:'company',page:'payroll-simple-accounting'},esc:x=>x,money:x=>String(x),toast:x=>messages.push(x),
  document:{getElementById:element},openModal:(title,help,html)=>{modal={title,help,html};element('s141postConfirm').disabled=false;},closeModal:()=>closed++,
  FormData:class {constructor(form){this.values=form.values;}get(key){return this.values[key];}}
 });
 await window.SAGAS_SIMPLE141.render('payroll-simple-accounting');await new Promise(resolve=>setImmediate(resolve));
 element('s141post').click();
 assert.equal(requests.length,0);assert.match(modal.html,/name="batch_code"/);assert.match(modal.html,/name="batch_description"/);
 assert.match(modal.html,/Folha simplificada 2026-01/);
 element('s141postCancel').click();assert.equal(closed,1);assert.equal(requests.length,0);
 element('s141post').click();
 const form=element('s141postForm');form.values={batch_code:' 77 ',batch_description:' Salários janeiro '};
 await form.onsubmit({preventDefault(){},currentTarget:form});
 assert.equal(element('s141postConfirm').disabled,false);assert.equal(closed,1);
 assert.match(messages.at(-1),/já existe/);
 form.values.batch_code='78';
 await form.onsubmit({preventDefault(){},currentTarget:form});
 assert.equal(closed,2);assert.equal(requests[1].batch_code,'78');assert.equal(requests[1].batch_description,'Salários janeiro');
 assert.equal(requests[1].competence,'2026-01');assert.equal(requests[1].cost_center_id,'cc');
});
