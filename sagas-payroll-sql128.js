// SAGAS v128 - SQL parametrizado para eventos: SOMENTE SELECT <expressao> AS VALOR.
// O compilador reconstroi toda a consulta a partir de uma gramatica fechada.
// Sem FROM, JOIN, subconsultas, tabelas, PRAGMA, escrita, comentarios ou comandos arbitrarios.
// As variaveis provem exclusivamente de um snapshot autorizado de folha.
export const PAYROLL_SQL_VARIABLES128=Object.freeze([
 'SALARIO_CONTRATUAL','SALARIO_BASE','SALARIO_REFERENCIA_13','AVOS_13',
 'REMUNERACAO_FERIAS','VALOR_FERIAS','DIAS_FERIAS','DIAS_FALTA',
 'BASE_INSS','BASE_IRRF','BASE_FGTS','BASE_INSS_FERIAS','BASE_IRRF_FERIAS',
 'BASE_FGTS_FERIAS','BASE_INSS_13','BASE_IRRF_13','BASE_FGTS_13',
 'PROVENTOS_TRIBUTAVEIS','TOTAL_PROVENTOS','TOTAL_DESCONTOS',
 'TOTAL_PROVENTOS_RESCISAO','TOTAL_DESCONTOS_RESCISAO',
 'VALOR_INFORMADO','QUANTIDADE','HORAS','RAT','FAP'
]);
const VARIABLES128=new Set(PAYROLL_SQL_VARIABLES128);
const FUNCTIONS128=new Map([
 ['ROUND',[1,2]],['ABS',[1]],['COALESCE',[2,3,4,5,6]],['IFNULL',[2]],
 ['NULLIF',[2]],['MIN',[2,3,4,5,6]],['MAX',[2,3,4,5,6]]
]);
export function compilePayrollSql128(source){
 const raw=String(source??'').trim();
 if(!raw||raw.length>1200)throw Error('A consulta SQL deve ter de 1 a 1200 caracteres.');
 const tokens=[];
 const pattern=/\s+|:[a-zA-Z][a-zA-Z0-9_]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z_][a-zA-Z0-9_]*|<=|>=|<>|!=|[()+*\/%<>=,-]/y;
 let cursor=0;
 while(cursor<raw.length){
  pattern.lastIndex=cursor;
  const match=pattern.exec(raw);
  if(!match)throw Error('Caractere ou construcao SQL nao permitida na posicao '+(cursor+1)+'.');
  cursor=pattern.lastIndex;
  if(!/^\s+$/.test(match[0]))tokens.push(match[0]);
  if(tokens.length>180)throw Error('Consulta SQL muito complexa: limite de 180 elementos.');
 }
 let pos=0,depth=0;
 const used=[],bound=new Map();
 const current=()=>tokens[pos]||null;
 const upper=()=>String(current()||'').toUpperCase();
 function take(value){
  if(upper()!==value)throw Error('SQL invalido: esperado '+value+'.');
  pos++;return value;
 }
 function enter(){
  if(++depth>20)throw Error('SQL muito aninhado.'); 
 }
 function leave(){depth--;}
 function atom(){
  enter();
  try{
   const t=current();
   if(t===null)throw Error('Expressao SQL incompleta.');
   if(t==='('){
    pos++;const v=expression();take(')');return '('+v+')';
   }
   if(/^:[A-Za-z][A-Za-z0-9_]*$/.test(t)){
    const name=t.slice(1).toUpperCase();
    if(!VARIABLES128.has(name))throw Error('Variavel SQL indisponivel: '+name+'.');
    pos++;
    if(!bound.has(name)){used.push(name);bound.set(name,used.length);}
    return '?'+bound.get(name);
   }
   if(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t)){
    const value=Number(t);
    if(!Number.isFinite(value)||value>999999999.99)throw Error('Constante numerica fora do limite.');
    pos++;return t;
   }
   if(upper()==='NULL'){pos++;return 'NULL';}
   if(upper()==='CASE'){
    pos++;const branches=[];
    do{
     take('WHEN');const condition=expression();take('THEN');const val=expression();
     branches.push('WHEN '+condition+' THEN '+val);
     if(branches.length>8)throw Error('CASE permite no maximo oito condicoes.');
    }while(upper()==='WHEN');
    take('ELSE');const other=expression();take('END');
    return '(CASE '+branches.join(' ')+' ELSE '+other+' END)';
   }
   const name=upper();
   if(FUNCTIONS128.has(name)){
    pos++;take('(');const args=[expression()];
    while(current()===','){
     pos++;args.push(expression());
     if(args.length>6)throw Error('Funcao SQL com argumentos demais.');
    }
    take(')');
    if(!FUNCTIONS128.get(name).includes(args.length))
     throw Error('Quantidade de argumentos invalida para '+name+'.');
    return name+'('+args.join(', ')+')';
   }
   throw Error('Identificador SQL nao permitido: '+String(t)+'. Use apenas variaveis e funcoes autorizadas.');
  }finally{leave();}
 }
 function unary(){
  if(current()==='+'||current()==='-'){
   const op=tokens[pos++];return '('+op+unary()+')';
  }
  if(upper()==='NOT'){pos++;return '(NOT '+unary()+')';}
  return atom();
 }
 function product(){
  let sql=unary();
  while(['*','/','%'].includes(current())){
   const op=tokens[pos++];sql='('+sql+' '+op+' '+unary()+')';
  }
  return sql;
 }
 function sum(){
  let sql=product();
  while(['+','-'].includes(current())){
   const op=tokens[pos++];sql='('+sql+' '+op+' '+product()+')';
  }
  return sql;
 }
 function comparison(){
  let sql=sum();
  if(['=','!=','<>','<','<=','>','>='].includes(current())){
   const op=tokens[pos++];sql='('+sql+' '+op+' '+sum()+')';
  }
  return sql;
 }
 function and(){
  let sql=comparison();
  while(upper()==='AND'){pos++;sql='('+sql+' AND '+comparison()+')';}
  return sql;
 }
 function expression(){
  let sql=and();
  while(upper()==='OR'){pos++;sql='('+sql+' OR '+and()+')';}
  return sql;
 }
 take('SELECT');
 const expr=expression();take('AS');take('VALOR');
 if(current()!==null)throw Error('A consulta deve retornar um unico VALOR, sem FROM nem comandos adicionais.');
 // NENHUM pedaco da consulta original e executado. So os tokens aprovados sao usados.
 return {sql:'SELECT '+expr+' AS VALOR',variables:used};
}
export function bindPayrollSql128(compiled,context){
 if(!compiled||!Array.isArray(compiled.variables))throw Error('Compilacao SQL invalida.');
 return compiled.variables.map(name=>{
  if(!Object.prototype.hasOwnProperty.call(context||{},name))
   throw Error('Variavel SQL sem valor: '+name+'.');
  const raw=context[name];
  if(raw===null||raw===undefined||raw==='')throw Error('Variavel SQL sem valor: '+name+'.');
  const value=Number(raw);
  if(!Number.isFinite(value)||value<0||value>999999999.99)
   throw Error('Valor de '+name+' fora do limite.');
  return value;
 });
}
export async function evaluatePayrollSql128(db,source,context){
 const compiled=compilePayrollSql128(source);
 const args=bindPayrollSql128(compiled,context);
 const row=await db.prepare(compiled.sql).bind(...args).first();
 if(!row||row.VALOR===null||row.VALOR===undefined)
  throw Error('A formula SQL nao retornou um VALOR numerico.');
 const n=Number(row.VALOR);
 if(!Number.isFinite(n)||n<0||n>999999999.99)
  throw Error('Resultado SQL invalido ou negativo.');
 const cents=Math.round((n+Number.EPSILON)*100);
 if(!Number.isSafeInteger(cents)||cents>99999999999)
  throw Error('Resultado SQL excede os limites.');
 return {amount_cents:cents,amount:cents/100,variables:compiled.variables,
  safe_sql:true,read_only:true};
}
