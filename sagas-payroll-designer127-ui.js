// SAGAS: Eventos de folha em tela unica - cadastro, regra, incidencia e contabilizacao.
// Nao calcula nem modifica a folha antiga: primeiro consolida as configuracoes no D1.
(function(){
 'use strict';
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const E=()=>crypto.randomUUID();
 const opt=(items,v)=>items.map(([key,label])=>'<option value="'+e(key)+'"'+(String(key)===String(v)?' selected':'')+'>'+e(label)+'</option>').join('');
 const categories=[['PROVENTO','Provento'],['DESCONTO','Desconto do empregado'],['ENCARGO','Encargo patronal'],['INFORMATIVO','Informativo']];
 const systems=[['REMUNERACAO','Remuneracao'],['RETENCAO','Retencao do empregado'],['ENCARGO_PATRONAL','Encargo patronal'],['OUTRO','Outros']];
 const methods=[
  ['SALARIO_DIAS','Salario contratual por dias'],
  ['VALOR_INFORMADO','Valor informado manualmente'],
  ['VALOR_FIXO','Valor fixo configurado'],
  ['PERCENTUAL_BASE','Percentual sobre uma base'],
  ['TABELA_PROGRESSIVA','Tabela progressiva por faixa'],
  ['TABELA_FAIXA_DEDUCAO','Tabela por faixa e parcela a deduzir'],
  ['FALTA_DIAS','Faltas: salario / 30 x dias'],
  ['HORAS_BASE','Horas: salario / divisor x horas'],
  ['DECIMO_TERCEIRO_AVOS','13º: salario de referencia x avos / 12'],
  ['FERIAS_DIAS','Ferias: remuneracao / 30 x dias'],
  ['TERCO_FERIAS','1/3 de ferias: valor das ferias / 3'],
  ['LIQUIDO_RESCISAO','Liquido da rescisao: proventos - descontos']
 ];
 const bases=[
  ['SALARIO_CONTRATUAL','Salario contratual do funcionario'],
  ['SALARIO_REFERENCIA_13','Salario de referencia do 13º (com medias)'],
  ['REMUNERACAO_FERIAS','Remuneracao de ferias (com medias)'],
  ['VALOR_FERIAS','Valor das ferias gozadas'],
  ['BASE_INSS','Base do INSS'],
  ['BASE_IRRF','Base do IRRF'],
  ['BASE_FGTS','Base do FGTS'],
  ['BASE_INSS_FERIAS','Base INSS das ferias'],
  ['BASE_IRRF_FERIAS','Base IRRF do recibo de ferias'],
  ['BASE_FGTS_FERIAS','Base FGTS das ferias'],
  ['BASE_INSS_13','Base INSS exclusiva do 13º'],
  ['BASE_IRRF_13','Base IRRF exclusiva do 13º'],
  ['BASE_FGTS_13','Base FGTS do 13º'],
  ['PROVENTOS_TRIBUTAVEIS','Total de proventos tributaveis'],
  ['TOTAL_PROVENTOS','Total de proventos'],
  ['VALOR_INFORMADO','Valor informado']
 ];
 const month=()=>new Date().toISOString().slice(0,7);
 const row=b=>'<tr><td><input class="ed127-to" inputmode="decimal" type="number" min="0.01" step="0.01" required value="'+e(b?.to??'')+'" placeholder="Limite em R$"></td>'+
  '<td><input class="ed127-rate" inputmode="decimal" type="number" min="0" max="100" step="0.0001" required value="'+e(b?.rate??'')+'" placeholder="%"></td>'+
  '<td><input class="ed127-deduction" inputmode="decimal" type="number" min="0" step="0.01" value="'+e(b?.deduction??0)+'"></td>'+
  '<td><button class="btn secondary sm ed127-remove" type="button">×</button></td></tr>';
 function addBand(b){
  const tbody=document.querySelector('#ed127-bands');
  if(!tbody)return;
  tbody.insertAdjacentHTML('beforeend',row(b));
  [...tbody.querySelectorAll('.ed127-remove')].forEach(x=>x.onclick=()=>x.closest('tr').remove());
 }
 function formBody(form){
  const v=Object.fromEntries(new FormData(form));
  return {code:v.code,name:v.name,category:form.elements.category.value,system:v.system,active:form.elements.active.checked,
   calculation:v.calculation,base:form.elements.base.value,trigger:v.trigger,effective_from:v.effective_from,
   group_id:v.group_id||null,nature_id:v.nature_id||null,
   days_basis:v.days_basis||'30',rate:v.rate||0,fixed_amount:v.fixed_amount||0,
   incidences:{inss:v.inss,irrf:v.irrf,fgts:v.fgts},
   bands:[...form.querySelectorAll('#ed127-bands tr')].map(r=>({
    to:r.querySelector('.ed127-to').value,rate:r.querySelector('.ed127-rate').value,
    deduction:r.querySelector('.ed127-deduction').value||0
   }))};
 }
 function appearance(form){
  const method=form.elements.calculation.value;
  const table=method.startsWith('TABELA_');
  const pct=method==='PERCENTUAL_BASE';
  const fixed=method==='VALOR_FIXO';
  const divisor=['SALARIO_DIAS','FALTA_DIAS','HORAS_BASE','FERIAS_DIAS'].includes(method);
  const special={DECIMO_TERCEIRO_AVOS:'SALARIO_REFERENCIA_13',
    FERIAS_DIAS:'REMUNERACAO_FERIAS',TERCO_FERIAS:'VALOR_FERIAS'};
  if(special[method]){
    form.elements.base.value=special[method];
    form.elements.base.disabled=true;
  }else form.elements.base.disabled=method==='LIQUIDO_RESCISAO';
  if(method==='LIQUIDO_RESCISAO'){
    form.elements.category.value='INFORMATIVO';
    form.elements.system.value='OUTRO';
  }
  const box=id=>document.getElementById(id);
  box('ed127-tables').classList.toggle('hidden',!table);
  box('ed127-pct').classList.toggle('hidden',!pct);
  box('ed127-fixed').classList.toggle('hidden',!fixed);
  box('ed127-divisor').classList.toggle('hidden',!divisor);
  box('ed127-test-quantity').classList.toggle('hidden',!['SALARIO_DIAS','FALTA_DIAS','HORAS_BASE','FERIAS_DIAS','DECIMO_TERCEIRO_AVOS'].includes(method));
  box('ed127-test-manual').classList.toggle('hidden',method!=='VALOR_INFORMADO');
  box('ed127-test-rescisao').classList.toggle('hidden',method!=='LIQUIDO_RESCISAO');
  const qtyLabel=document.getElementById('ed127-test-quantity-label');
  if(qtyLabel)qtyLabel.textContent=method==='DECIMO_TERCEIRO_AVOS'?'Avos do 13º (0 a 12)':
    method==='FERIAS_DIAS'?'Dias de ferias (0 a 30)':method==='HORAS_BASE'?'Horas':'Dias (0 a 30)';
  form.elements.test_qty.max=method==='DECIMO_TERCEIRO_AVOS'?'12':method==='HORAS_BASE'?'300':'30';
  form.elements.test_qty.step=method==='HORAS_BASE'?'0.001':'1';
  if(method==='DECIMO_TERCEIRO_AVOS'&&Number(form.elements.test_qty.value)>12)
    form.elements.test_qty.value='12';
  form.elements.days_basis.value=method==='HORAS_BASE'
   ?(form.elements.days_basis.dataset.hours||'220'):'30';
  form.elements.days_basis.readOnly=method!=='HORAS_BASE';
  [...form.querySelectorAll('.ed127-deduction')].forEach(x=>x.disabled=method==='TABELA_PROGRESSIVA');
  // Encargo patronal nunca pode reduzir salario liquido do empregado.
  if(form.elements.category.value==='ENCARGO')form.elements.system.value='ENCARGO_PATRONAL';
  if(form.elements.category.value!=='ENCARGO'&&form.elements.system.value==='ENCARGO_PATRONAL')
   form.elements.system.value='OUTRO';
 }
 async function open(event=null,period=''){
  const [a,g,n]=await Promise.all([
   event?api('/api/payroll/designer/events/'+encodeURIComponent(event.id)+'?competence='+encodeURIComponent(period||month())):Promise.resolve({}),
   api('/api/payroll/designer/groups'),api('/api/payroll/accounting-natures')
  ]);
  const old=a.config||{};
  const autoCodes=new Set(['SALARIO_BASE','INSS_EMP','IRRF_EMP','FGTS_PATRONAL']);
  const defaultMethod=event?.code==='SALARIO_BASE'?'SALARIO_DIAS':
   event?.code==='INSS_EMP'?'TABELA_PROGRESSIVA':
   event?.code==='IRRF_EMP'?'TABELA_FAIXA_DEDUCAO':
   event?.code==='FGTS_PATRONAL'?'PERCENTUAL_BASE':
   ['DECIMO_TERCEIRO','DECIMO_TERCEIRO_SALARIO','13_SALARIO'].includes(event?.code)?'DECIMO_TERCEIRO_AVOS':
   event?.code==='FERIAS_GOZO'?'FERIAS_DIAS':
   event?.code==='TERCO_FERIAS'?'TERCO_FERIAS':
   event?.code==='LIQUIDO_RESCISAO'?'LIQUIDO_RESCISAO':
   event?.code==='FALTA_INJUSTIFICADA'?'FALTA_DIAS':'VALOR_INFORMADO';
  const defaultBase=event?.code==='INSS_EMP'?'BASE_INSS':event?.code==='IRRF_EMP'?'BASE_IRRF':
   event?.code==='FGTS_PATRONAL'?'BASE_FGTS':
   ['DECIMO_TERCEIRO','DECIMO_TERCEIRO_SALARIO','13_SALARIO'].includes(event?.code)?'SALARIO_REFERENCIA_13':
   event?.code==='FERIAS_GOZO'?'REMUNERACAO_FERIAS':
   event?.code==='TERCO_FERIAS'?'VALOR_FERIAS':'SALARIO_CONTRATUAL';
  const cfg={
   code:event?.code||'',name:event?.name||'',
   category:event?.event_type==='INFORMATIVO'&&event.code==='FGTS_PATRONAL'?'ENCARGO':event?.event_type||'PROVENTO',
   system:event?.code==='FGTS_PATRONAL'?'ENCARGO_PATRONAL':
    ['INSS_EMP','IRRF_EMP'].includes(event?.code)?'RETENCAO':'REMUNERACAO',
   active:event?Boolean(event.active):true,
   calculation:defaultMethod,
   base:defaultBase,trigger:autoCodes.has(event?.code)?'AUTOMATICO':'MANUAL',effective_from:period||month(),
   rate:0,fixed_cents:0,days_basis:30,incidences:{inss:'NAO',irrf:'NAO',fgts:'NAO'},
   ...old
  };
  const gr=(g.groups||[]).filter(x=>x.active);
  const natures=(n.natures||[]).filter(x=>x.active&&x.synthetic_analytic==='ANALYTIC');
  const groupOptions='<option value="">Sem grupo</option>'+gr.map(x=>'<option value="'+e(x.id)+'"'+(cfg.group_id===x.id?' selected':'')+'>'+e(x.code+' — '+x.name)+'</option>').join('');
  const natureOptions='<option value="">Sem natureza contábil</option>'+natures.map(x=>'<option value="'+e(x.id)+'"'+(cfg.nature_id===x.id?' selected':'')+'>'+e(x.code+' — '+x.description)+'</option>').join('');
  const field=(name,label,element)=>'<label class="field"><span>'+label+'</span>'+element+'</label>';
  const sel=(name,label,items,v)=>field(name,label,'<select name="'+name+'" required>'+opt(items,v)+'</select>');
  const input=(name,label,value,type='text',attr='')=>field(name,label,'<input name="'+name+'" type="'+type+'" value="'+e(value??'')+'" '+attr+'>');
  const codeLocked=!!event;
  const body='<form id="ed127-form">'+
   '<div class="section-title">Identificacao</div><div class="grid">'+
   input('code','Codigo',cfg.code,'text','maxlength="30" required '+(codeLocked?'readonly':''))+
   input('name','Descricao',cfg.name,'text','maxlength="200" required')+
   sel('category','Classificacao',categories,cfg.category)+
   sel('system','Processamento',systems,cfg.system)+
   field('group','Grupo de eventos','<select name="group_id">'+groupOptions+'</select>')+
   input('effective_from','Vigente a partir de',cfg.effective_from,'month','required')+
   '<label class="check"><input name="active" type="checkbox"'+(cfg.active?' checked':'')+'> Evento ativo</label></div>'+
   '<p class="help"><b>Configurador em implantacao:</b> estas regras sao salvas e podem ser simuladas. O calculo definitivo da folha ainda nao utiliza este novo motor; o cadastro nao altera folhas fechadas ou processamentos antigos.</p>'+
   '<div class="section-title">Regra de calculo</div><div class="grid">'+
   sel('trigger','Lancamento', [['AUTOMATICO','Automatico no grupo'],['MANUAL','Incluido manualmente']],cfg.trigger)+
   sel('calculation','Forma de calculo',methods,cfg.calculation)+
   sel('base','Origem da base',bases,cfg.base)+
   '<div id="ed127-pct">'+input('rate','Aliquota (%)',cfg.rate,'number','min="0" max="100" step="0.0001"')+'</div>'+
   '<div id="ed127-fixed">'+input('fixed_amount','Valor fixo (R$)',Number(cfg.fixed_cents||0)/100,'number','min="0" step="0.01"')+'</div>'+
   '<div id="ed127-divisor">'+input('days_basis','Divisor',cfg.days_basis,'number','min="1" max="300" step="0.001"')+'</div></div>'+
   '<div id="ed127-tables"><div class="section-title">Faixas cadastradas na tabela</div>'+
   '<div class="table-wrap"><table class="table"><thead><tr><th>Ate (R$)</th><th>Aliquota %</th><th>Parcela deduzir (R$)</th><th></th></tr></thead>'+
   '<tbody id="ed127-bands"></tbody></table></div>'+
   '<button id="ed127-add-band" class="btn secondary sm" type="button">+ Adicionar faixa</button></div>'+
   '<div class="section-title">Incidencias e contabilizacao</div><div class="grid">'+
   ['inss','irrf','fgts'].map(key=>sel(key,'Compõe base '+key.toUpperCase(),[['SIM','Sim'],['NAO','Nao']],cfg.incidences?.[key]||'NAO')).join('')+
   field('nature','Natureza orcamentaria','<select name="nature_id">'+natureOptions+'</select>')+
   '</div><p class="help">Encargos patronais (FGTS, CPP, RAT e terceiros) nao sao descontos do trabalhador. Na contabilizacao, a natureza podera ter somente debito, somente credito ou ambos, conforme o evento. Nenhum valor e enviado automaticamente para uma folha fechada.</p>'+
   '<div class="section-title">Simular regra antes de salvar</div><div class="grid">'+
   input('test_base','Base de exemplo (R$)',1800,'number','min="0" step="0.01"')+
   '<div id="ed127-test-quantity"><label class="field"><span id="ed127-test-quantity-label">Dias / horas / avos</span><input name="test_qty" type="number" value="30" min="0" max="300" step="0.001"></label></div>'+
   '<div id="ed127-test-manual">'+input('test_manual','Valor informado (R$)',0,'number','min="0" step="0.01"')+'</div>'+
   '<div id="ed127-test-rescisao">'+
   input('test_gross','Proventos rescisorios (R$)',1800,'number','min="0" step="0.01"')+
   input('test_discounts','Descontos rescisorios (R$)',144,'number','min="0" step="0.01"')+
   '</div>'+
   '</div><div class="toolbar"><button type="button" class="btn secondary" id="ed127-simulate">Simular calculo</button>'+
   '<span id="ed127-simulation-result" class="help"></span></div>'+
   '<div class="form-actions"><button id="ed127-cancel" class="btn secondary" type="button">Cancelar</button>'+
   '<button type="submit" class="btn primary">Salvar evento e configuracao</button></div></form>';
  openModal((event?'Configurar':'Novo')+' evento da folha',event?
   'Edicao centralizada · '+event.code+' · '+(a.history?.length||0)+' versao(oes)':'Cadastre o evento, a regra, as incidencias, o grupo e a contabilizacao em uma tela.',body,true);
  const form=document.getElementById('ed127-form');
  const method=form.elements.calculation;
  const setup=()=>{
   if(method.value==='TABELA_PROGRESSIVA'&&!(form.querySelector('#ed127-bands tr')))addBand();
   if(method.value==='TABELA_FAIXA_DEDUCAO'&&!(form.querySelector('#ed127-bands tr')))addBand();
   appearance(form);
  };
  if(old.bands?.length)for(const band of old.bands)
   addBand({to:band.to_cents/100,rate:band.rate,deduction:band.deduction_cents/100});
  method.onchange=setup;form.elements.category.onchange=()=>appearance(form);
  form.elements.days_basis.dataset.hours=cfg.calculation==='HORAS_BASE'?String(cfg.days_basis):'220';
  if(codeLocked){
   // Campos estruturais legados so poderao mudar apos a troca do motor antigo.
   form.elements.category.disabled=true;
  }
  setup();
  document.getElementById('ed127-add-band').onclick=()=>addBand();
  document.getElementById('ed127-cancel').onclick=closeModal;
  document.getElementById('ed127-simulate').onclick=async()=>{
   try{
    const config=formBody(form);
    const values=Object.fromEntries(bases.map(([key])=>[key,Number(form.elements.test_base.value)]));
    values.quantidade=Number(form.elements.test_qty.value);
    values.valor_informado=Number(form.elements.test_manual.value);
    values.TOTAL_PROVENTOS_RESCISAO=Number(form.elements.test_gross.value);
    values.TOTAL_DESCONTOS_RESCISAO=Number(form.elements.test_discounts.value);
    const result=await api('/api/payroll/designer/simulate',{method:'POST',body:{config,values}});
    document.getElementById('ed127-simulation-result').textContent=
     'Resultado: '+money(result.result.amount)+' · '+(result.result.employer_charge?'Encargo patronal':result.result.employee_discount?'Desconto':'Nao desconta do salario');
   }catch(err){toast(err.message,'error');}
  };
  form.onsubmit=async ev=>{
   ev.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;
   try{
    const config=formBody(form);
    // Proteger codigo e tipo original: permite mudar regra, incidencia e natureza
    // sem reclassificar envelopes historicos do calculador antigo.
    const result=await api('/api/payroll/designer/events/'+(event?encodeURIComponent(event.id):'new'),{
      method:'POST',body:config});
    closeModal();invalidatePayroll();toast('Configuracao salva (revisao '+result.revision+').');
    await renderPayroll('payroll-events');
   }catch(err){toast(err.message,'error');b.disabled=false;}
  };
 }
 async function groups(){
  const d=await api('/api/payroll/designer/groups');
  const rows=(d.groups||[]).map(x=>'<tr><td>'+e(x.code)+'</td><td>'+e(x.name)+'</td><td>'+(x.active?'Ativo':'Inativo')+'</td>'+
    '<td><button class="btn secondary sm" type="button" data-127-edit="'+e(x.id)+'">Editar</button></td></tr>').join('');
  openModal('Grupos de eventos','Cadastre os grupos usados para organizar a folha e os eventos automaticos.',
   '<form id="ed127-group-form"><input type="hidden" name="id"><div class="grid">'+
   '<label class="field"><span>Codigo</span><input name="code" maxlength="30" required></label>'+
   '<label class="field"><span>Descricao</span><input name="name" maxlength="120" required></label>'+
   '</div><div class="form-actions"><button class="btn primary" type="submit">Salvar grupo</button></div></form>'+
   '<div class="table-wrap"><table class="table"><thead><tr><th>Codigo</th><th>Grupo</th><th>Ativo</th><th></th></tr></thead>'+
   '<tbody>'+rows+'</tbody></table></div>',true);
  const form=document.getElementById('ed127-group-form');
  document.querySelectorAll('[data-127-edit]').forEach(b=>b.onclick=()=>{
   const g=d.groups.find(x=>x.id===b.dataset['127Edit']);
   if(g){form.elements.id.value=g.id;form.elements.code.value=g.code;form.elements.name.value=g.name;}
  });
  form.onsubmit=async ev=>{
   ev.preventDefault();
   try{
    await api('/api/payroll/designer/groups',{method:'POST',body:Object.fromEntries(new FormData(form))});
    toast('Grupo salvo.');await groups();
   }catch(err){toast(err.message,'error')}
  };
 }
 window.SAGAS_PAYROLL_DESIGNER127={open,groups};
})();
