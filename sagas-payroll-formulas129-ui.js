// SAGAS v129 - catalogo central de formulas da folha, com versoes e simulacao.
(function(){
'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const methods=[
 ['SQL_PERSONALIZADO','Consulta SQL personalizada'],
 ['SALARIO_DIAS','Salario por dias (base / 30 x dias)'],
 ['DECIMO_TERCEIRO_AVOS','13º por avos'],
 ['FERIAS_DIAS','Ferias por dias'],
 ['TERCO_FERIAS','1/3 de ferias'],
 ['LIQUIDO_RESCISAO','Liquido de rescisao'],
 ['PERCENTUAL_BASE','Percentual sobre base'],
 ['TABELA_PROGRESSIVA','Tabela progressiva'],
 ['TABELA_FAIXA_DEDUCAO','Tabela por faixa e deducao'],
 ['VALOR_FIXO','Valor fixo'],
 ['VALOR_INFORMADO','Valor informado'],
 ['FALTA_DIAS','Desconto por dias de falta'],
 ['HORAS_BASE','Calculo por horas']
];
const bases=[
 ['SALARIO_CONTRATUAL','Salario contratual'],['SALARIO_REFERENCIA_13','Salario referencia 13º'],
 ['REMUNERACAO_FERIAS','Remuneracao de ferias'],['VALOR_FERIAS','Valor das ferias'],
 ['BASE_INSS','Base INSS'],['BASE_IRRF','Base IRRF'],['BASE_FGTS','Base FGTS'],
 ['BASE_INSS_FERIAS','Base INSS ferias'],['BASE_IRRF_FERIAS','Base IRRF ferias'],
 ['BASE_FGTS_FERIAS','Base FGTS ferias'],['BASE_INSS_13','Base INSS 13º'],
 ['BASE_IRRF_13','Base IRRF 13º'],['BASE_FGTS_13','Base FGTS 13º'],
 ['PROVENTOS_TRIBUTAVEIS','Proventos tributaveis'],['TOTAL_PROVENTOS','Total proventos'],
 ['TOTAL_DESCONTOS','Total descontos'],['TOTAL_PROVENTOS_RESCISAO','Proventos rescisorios'],
 ['TOTAL_DESCONTOS_RESCISAO','Descontos rescisorios'],['VALOR_INFORMADO','Valor informado']
];
const option=(list,val)=>list.map(([v,n])=>'<option value="'+E(v)+'"'+(String(v)===String(val)?' selected':'')+'>'+E(n)+'</option>').join('');
const month=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const baseChoice=m=>({DECIMO_TERCEIRO_AVOS:'SALARIO_REFERENCIA_13',FERIAS_DIAS:'REMUNERACAO_FERIAS',TERCO_FERIAS:'VALOR_FERIAS'})[m]||'SALARIO_CONTRATUAL';
async function render(){
 const d=await api('/api/payroll/formulas'),items=d.formulas||[];
 const cols=['Codigo','Formula','Tipo / Consulta','Situação','Versoes','Eventos vinculados','Acoes'];
 const rows=items.map(f=>'<tr><td class="code">'+E(f.code)+'</td><td><b>'+E(f.name)+'</b></td>'+
  '<td><div>'+E(f.calculation||'—')+'</div><small title="'+E(f.rule_preview||'')+'">'+E((f.rule_preview||'').slice(0,68))+'</small></td>'+
  '<td>'+(f.active?'Ativa':'Inativa')+'</td><td>'+Number(f.revisions||0)+'</td>'+
  '<td>'+Number(f.event_versions||0)+'</td>'+
  '<td><button class="btn secondary sm" type="button" data-formula129="'+E(f.id)+'">Editar / historico</button></td></tr>').join('');
 const manage=can('payroll.manage');
 tablePage({newLabel:manage?'Nova formula de calculo':null,onNew:manage?()=>open(null).catch(e=>toast(e.message,'error')):null,
  cols,rows:rows||null,emptyTitle:'Nenhuma formula cadastrada',emptyText:'Cadastre formulas para reutilizar em varios eventos da folha.',placeholder:'Pesquisar formulas...'});
 $$('[data-formula129]').forEach(b=>b.onclick=()=>open(b.dataset.formula129).catch(e=>toast(e.message,'error')));
 const toolbar=$('#content .toolbar');
 if(toolbar)toolbar.insertAdjacentHTML('beforeend','<button class="btn secondary" type="button" id="formula129Refresh">Atualizar</button>'+
   (manage?'<button class="btn secondary" type="button" id="formula129Import">Importar 7 modelos iniciais</button>':''));
 $('#formula129Refresh').onclick=()=>render().catch(e=>toast(e.message,'error'));
 if(manage&&$('#formula129Import'))$('#formula129Import').onclick=()=>importModels().catch(e=>toast(e.message,'error'));
}
async function importModels(){
 openModal('Importar modelos de formulas',
  'Os modelos serao gravados no D1 da empresa selecionada. Formulas existentes nao serao alteradas.',
  '<form id="f130-import-form">'+
  '<p class="help">Serão incluídos: salário-base, salário líquido, 13º por avos, férias por dias, 1/3 de férias, desconto de faltas e líquido de rescisão. São modelos matemáticos editáveis, não tabelas oficiais de INSS ou IRRF.</p>'+
  '<label class="field"><span>Vigente a partir da competência</span>'+
  '<input name="effective_from" type="month" value="'+E(month())+'" required></label>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="f130-import-cancel">Cancelar</button>'+
  '<button type="submit" class="btn primary">Cadastrar modelos</button></div></form>',true);
 const form=$('#f130-import-form');
 $('#f130-import-cancel').onclick=closeModal;
 form.onsubmit=async ev=>{
  ev.preventDefault();
  const button=form.querySelector('[type=submit]');
  button.disabled=true;
  try{
   const effective_from=form.elements.effective_from.value;
   const result=await api('/api/payroll/formulas/import-models',{method:'POST',body:{effective_from}});
   closeModal();
   toast(result.imported+' modelo(s) cadastrado(s), '+result.skipped+' existente(s) preservado(s).');
   await render();
  }catch(err){button.disabled=false;toast(err.message,'error')}
 };
}
async function open(formulaId=null){
 const detail=formulaId?await api('/api/payroll/formulas/'+encodeURIComponent(formulaId)):null;
 const version=detail?.applicable||null,source=version?.source||{};
 const catalog=await api('/api/payroll/designer/sql-variables');
 const editing=!!formulaId,info=detail?.formula||{};
 const fields=(name,label,value,type='text',extra='')=>'<label class="field"><span>'+E(label)+'</span><input name="'+name+'" type="'+type+'" value="'+E(value??'')+'" '+extra+'></label>';
 const oldSource=source||{};
 const c=oldSource.calculation||'SQL_PERSONALIZADO';
 const b=oldSource.base||baseChoice(c);
 const versions=detail?.versions||[];
 const selection=versions.map(v=>'<option value="'+E(v.id)+'">'+E(v.effective_from)+' · revisão '+E(v.revision)+'</option>').join('');
 const bandRow=v=>'<tr><td><input type="number" class="f129-to" step="0.01" min="0.01" value="'+E(v?.to??'')+'"></td>'+
  '<td><input type="number" class="f129-rate" step="0.0001" min="0" max="100" value="'+E(v?.rate??0)+'"></td>'+
  '<td><input type="number" class="f129-discount" step="0.01" min="0" value="'+E(v?.deduction??0)+'"></td>'+
  '<td><button type="button" class="btn secondary sm f129-remove">Remover</button></td></tr>';
 const body='<form id="formula129Form">'+
  (editing?'<div class="help"><b>Historico de versoes:</b> '+versions.length+' revisão(ões). As versões anteriores nunca são sobrescritas.</div>'+
   '<div class="grid"><label class="field"><span>Consultar revisao anterior</span><select id="f129-history"><option value="">Versao aplicavel mais recente</option>'+selection+'</select></label>'+
   '<div id="f129-history-data" class="help"></div></div>':'')+
  '<div class="section-title">Identificacao</div><div class="grid">'+
   fields('code','Codigo',info.code||'','text','required maxlength="30" '+(editing?'readonly':''))+
   fields('name','Descricao',info.name||'','text','required maxlength="120"')+
   fields('effective_from','Vigente a partir de',source.effective_from||version?.effective_from||month(),'month','required')+
   '<label class="check"><input type="checkbox" name="active" '+(!editing||info.active?'checked':'')+'> Ativa</label>'+
   '</div><div class="section-title">Regra de calculo</div><div class="grid">'+
   '<label class="field"><span>Tipo de formula</span><select name="calculation">'+option(methods,c)+'</select></label>'+
   '<label class="field" id="f129-base-wrap"><span>Base de calculo</span><select name="base">'+option(bases,b)+'</select></label>'+
   '<div id="f129-rate-wrap">'+fields('rate','Aliquota (%)',oldSource.rate??0,'number','min="0" max="100" step="0.0001"')+'</div>'+
   '<div id="f129-fixed-wrap">'+fields('fixed_amount','Valor fixo',oldSource.fixed_amount??0,'number','min="0" step="0.01"')+'</div>'+
   '<div id="f129-div-wrap">'+fields('days_basis','Divisor',oldSource.days_basis??30,'number','min="1" max="300" step="0.001"')+'</div>'+
   '</div>'+
   '<div id="f129-sql-wrap"><label class="field full"><span>Consulta SQL (SELECT ... AS VALOR)</span>'+
   '<textarea name="sql_query" id="f129-sql" rows="5" maxlength="1200" spellcheck="false" style="font-family:monospace;min-height:108px">'+E(oldSource.sql_query||'SELECT ROUND(:SALARIO_REFERENCIA_13 * :AVOS_13 / 12, 2) AS VALOR')+'</textarea></label>'+
   '<p class="help">Variaveis autorizadas: '+(catalog.variables||[]).map(v=>'<code>:'+E(v)+'</code>').join(' · ')+'</p></div>'+
   '<div id="f129-bands-wrap"><div class="section-title">Tabela por faixas</div>'+
   '<div class="table-wrap"><table class="table"><thead><tr><th>Ate R$</th><th>%</th><th>Parcela deduzir R$</th><th></th></tr></thead><tbody id="f129-bands"></tbody></table></div>'+
   '<button class="btn secondary sm" type="button" id="f129-add-band">+ Faixa</button></div>'+
   '<div class="section-title">Simulacao</div><p class="help">Informe valores de exemplo para os parametros; esta simulacao nao utiliza dados reais dos funcionarios.</p>'+
   '<div class="grid" id="f129-params"></div>'+
   '<div class="form-actions"><button class="btn secondary" type="button" id="f129-test">Simular formula</button>'+
   '<button class="btn primary" type="submit">Salvar nova revisao</button></div>'+
   '<div class="help" id="f129-output"></div></form>';
 openModal(editing?'Editar formula: '+E(info.code):'Nova formula de calculo',
  'Formulas reutilizaveis pelos eventos. Cada salvamento cria uma nova revisao com vigencia; folhas anteriores nao sao modificadas.',
  body,true);
 const form=$('#formula129Form'),method=form.elements.calculation,base=form.elements.base,query=form.elements.sql_query;
 const attachRemoval=()=>$$('#f129-bands .f129-remove').forEach(btn=>btn.onclick=()=>btn.closest('tr').remove());
 function addBand(v){$('#f129-bands').insertAdjacentHTML('beforeend',bandRow(v));attachRemoval();}
 const currentBands=oldSource.bands||[];
 for(const v of currentBands)addBand(v);
 const paramList=()=>{
  const meth=method.value;
  if(meth==='SQL_PERSONALIZADO')return [...new Set([...query.value.matchAll(/:([A-Za-z][A-Za-z_0-9]*)/g)]
    .map(m=>m[1].toUpperCase()).filter(v=>(catalog.variables||[]).includes(v)))];
  if(meth==='LIQUIDO_RESCISAO')return ['TOTAL_PROVENTOS_RESCISAO','TOTAL_DESCONTOS_RESCISAO'];
  if(meth==='VALOR_FIXO')return [];
  if(meth==='VALOR_INFORMADO')return ['valor_informado'];
  if(meth==='DECIMO_TERCEIRO_AVOS')return ['SALARIO_REFERENCIA_13','quantidade'];
  if(meth==='FERIAS_DIAS')return ['REMUNERACAO_FERIAS','quantidade'];
  if(meth==='TERCO_FERIAS')return ['VALOR_FERIAS'];
  if(['SALARIO_DIAS','FALTA_DIAS','HORAS_BASE'].includes(meth))return [base.value,'quantidade'];
  return [base.value];
 };
 const renderParams=()=>{
  const existing=new Map([...$$('#f129-params [data-f129-var]')].map(x=>[x.dataset.f129Var,x.value]));
  const defaults={quantidade:12,AVOS_13:12,DIAS_FERIAS:30,DIAS_FALTA:2,TOTAL_DESCONTOS_RESCISAO:144,
   valor_informado:1800,FAP:1,RAT:2};
  $('#f129-params').innerHTML=paramList().map(key=>fields('value_'+key,key,existing.get(key)??defaults[key]??1800,'number',
   'data-f129-var="'+E(key)+'" step="0.01" min="0" max="999999999.99"')).join('')||
   '<p class="help">Esta formula nao exige parametros para simular.</p>';
 };
 const appearance=()=>{
  const type=method.value;
  const baseFixed={DECIMO_TERCEIRO_AVOS:'SALARIO_REFERENCIA_13',FERIAS_DIAS:'REMUNERACAO_FERIAS',TERCO_FERIAS:'VALOR_FERIAS'};
  if(baseFixed[type]){base.value=baseFixed[type];base.disabled=true}else base.disabled=false;
  const visible=(id,show)=>$(id).classList.toggle('hidden',!show);
  visible('#f129-sql-wrap',type==='SQL_PERSONALIZADO');
  visible('#f129-bands-wrap',type.startsWith('TABELA_'));
  visible('#f129-rate-wrap',type==='PERCENTUAL_BASE');
  visible('#f129-fixed-wrap',type==='VALOR_FIXO');
  visible('#f129-div-wrap',type==='HORAS_BASE');
  visible('#f129-base-wrap',!['LIQUIDO_RESCISAO','VALOR_FIXO','VALOR_INFORMADO'].includes(type));
  renderParams();
 };
 const sourceValues=()=>{
  const bands=[...$$('#f129-bands tr')].map(tr=>({
   to:tr.querySelector('.f129-to').value,rate:tr.querySelector('.f129-rate').value,
   deduction:tr.querySelector('.f129-discount').value
  }));
  return {code:form.elements.code.value,name:form.elements.name.value,effective_from:form.elements.effective_from.value,
   active:form.elements.active.checked,calculation:method.value,base:base.value,
   rate:form.elements.rate.value,days_basis:form.elements.days_basis.value,
   fixed_amount:form.elements.fixed_amount.value,sql_query:query.value,bands};
 };
 const assign=v=>{
  method.value=v.calculation||'SQL_PERSONALIZADO';base.value=v.base||'SALARIO_CONTRATUAL';
  form.elements.rate.value=v.rate??0;form.elements.days_basis.value=v.days_basis??30;
  form.elements.fixed_amount.value=v.fixed_amount??0;query.value=v.sql_query||'';
  $('#f129-bands').innerHTML='';
  for(const b of v.bands||[])addBand(b);
  appearance();
 };
 if(editing){
  $('#f129-history').onchange=ev=>{
   const v=versions.find(x=>x.id===ev.target.value);
   if(v){
    $('#f129-history-data').textContent='Revisao '+v.revision+' vigente desde '+v.effective_from+
     '. Visualizacao da configuracao historica (ao salvar sera criada nova revisao).';
    assign(v.source);
    form.elements.effective_from.value=v.effective_from;
   }else{
    $('#f129-history-data').textContent='';
    assign(source);
    form.elements.effective_from.value=version?.effective_from||month();
   }
  };
 }
 $('#f129-add-band').onclick=()=>addBand();
 query.oninput=renderParams;method.onchange=appearance;base.onchange=renderParams;appearance();
 $('#f129-test').onclick=async()=>{
  try{
   const current=sourceValues();
   // Nao salva uma simulacao. Usa a revisao salva se existir; para a nova regra
   // permite validar via endpoint de preview temporario.
   const values={};$$('#f129-params [data-f129-var]').forEach(i=>values[i.dataset.f129Var]=Number(i.value));
   const result=await api('/api/payroll/formulas/preview',{method:'POST',body:{config:current,values}});
   $('#f129-output').textContent='Resultado da simulacao: '+money(result.result.amount)+' (sem gerar folha)';
  }catch(e){toast(e.message,'error')}
 };
 form.onsubmit=async ev=>{
  ev.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
   const body=sourceValues();
   await api('/api/payroll/formulas'+(editing?'/'+encodeURIComponent(formulaId):''),{method:'POST',body});
   closeModal();toast('Formula salva. Nova revisao registrada.');await render();
  }catch(e){btn.disabled=false;toast(e.message,'error')}
 };
}
window.SAGAS_FORMULAS129={render,open};
})();
