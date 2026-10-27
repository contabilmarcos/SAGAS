// SAGAS folha | Parametros patronais no cadastro de eventos. Sem resumo lateral.
(function(){
 'use strict';
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const brl=v=>(Number(v||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const p=(value,precision=2)=>value==null?'':(Number(value)/(precision===4?10000:100)).toFixed(precision);
 const choice=(name,value,label)=>'<label class="field"><span>'+e(label)+'</span><select name="'+name+'" required>'+
  [['','Selecione'],['SIM','Sim'],['NAO','Não']].map(([v,t])=>'<option value="'+v+'" '+(v===value?'selected':'')+'>'+t+'</option>').join('')+'</select></label>';
 const num=(name,value,label,placeholder,step='0.01')=>'<label class="field"><span>'+e(label)+'</span><input type="number" name="'+name+'" min="0" step="'+step+'" value="'+e(value)+'" placeholder="'+e(placeholder)+'"></label>';
 function attach(){
  if(!S?.token||!S.companyId||S.page!=='payroll-events'||!can('payroll.read'))return;
  const bar=document.querySelector('#content .toolbar');if(!bar||bar.querySelector('#sagasEmployer40'))return;
  const button=document.createElement('button');button.type='button';button.id='sagasEmployer40';
  button.className='btn secondary';button.textContent='Encargos patronais da empresa';
  button.onclick=()=>open().catch(x=>toast(x.message,'error'));bar.append(button);
 }
 async function open(selected){
  const dt=new Date(),month=selected||dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
  const r=await api('/api/payroll/employer/settings?competence='+encodeURIComponent(month));
  const s=r.settings||{},admin=can('payroll.manage');
  const fields='<div class="grid">'+
   '<label class="field"><span>Vigente desde</span><input type="month" name="effective_from" value="'+e(month)+'" required></label>'+
   choice('cpp_due',s.cpp_due,'INSS patronal devido?')+num('cpp_rate',p(s.cpp_bp),'INSS patronal (%)','20,00')+
   choice('rat_due',s.rat_due,'RAT devido?')+num('rat_rate',p(s.rat_bp),'RAT nominal (%)','1, 2 ou 3')+
   num('fap',p(s.fap_10000,4),'FAP','1,0000','0.0001')+
   choice('thirds_due',s.thirds_due,'Contribuicoes a terceiros devidas?')+num('thirds_rate',p(s.thirds_bp),'Terceiros (%)','Conforme enquadramento')+
   '<label class="field"><span>FPAS</span><input name="fpas" maxlength="3" value="'+e(s.fpas||'')+'" placeholder="3 dígitos"></label>'+
   '<label class="field"><span>Código de terceiros</span><input name="thirds_code" maxlength="6" value="'+e(s.thirds_code||'')+'" placeholder="4 a 6 dígitos"></label>'+
   choice('pis_due',s.pis_due,'Empresa recolhe PIS sobre a folha?')+num('pis_rate',p(s.pis_bp),'PIS folha (%)','1,00')+
   '<label class="field full"><span>Enquadramento / justificativa</span><textarea name="notes" maxlength="450" rows="2">'+e(s.notes||'')+'</textarea></label>'+
   '</div>';
  const history=(r.history||[]).map(x=>'<tr><td>'+e(x.effective_from)+'</td><td>'+x.revision+'</td><td>'+e(x.cpp_due)+'</td><td>'+e(x.rat_due)+'</td><td>'+e(x.thirds_due)+'</td><td>'+e(x.pis_due)+'</td></tr>').join('');
  openModal('Encargos patronais e PIS — Empresa','Alíquotas configuradas por competência, sem mudança automática na folha.',
   '<p class="help">Confirme o enquadramento da empresa. Selecione Sim ou Não expressamente para cada encargo; nenhuma alíquota é presumida.</p>'+
   (admin?'<form id="e40form">'+fields+'<div class="form-actions"><button type="button" class="btn secondary" id="e40cancel">Cancelar</button><button type="submit" class="btn primary">Salvar versão</button></div></form>':
    '<p class="help">Você tem somente permissão de consulta para estes parâmetros.</p>')+
   '<div class="toolbar"><input type="month" id="e40period" value="'+e(month)+'"><button type="button" class="btn secondary" id="e40consult">Consultar vigência</button><button type="button" class="btn secondary" id="e40preview">Prévia patronal</button></div>'+
   '<h4>Histórico de configuração</h4><div class="table-wrap"><table class="table"><thead><tr><th>Vigência</th><th>Versão</th><th>CPP</th><th>RAT</th><th>Terceiros</th><th>PIS folha</th></tr></thead><tbody>'+
   (history||'<tr><td colspan="6">Ainda não configurado.</td></tr>')+'</tbody></table></div>',true);
  const form=document.getElementById('e40form');
  if(form)form.onsubmit=async ev=>{
   ev.preventDefault();const btn=form.querySelector('button[type=submit]');btn.disabled=true;
   const data=Object.fromEntries(new FormData(form));
   try{await api('/api/payroll/employer/settings',{method:'POST',body:data});toast('Configuração patronal salva.');await open(data.effective_from);}
   catch(x){toast(x.message,'error');btn.disabled=false;}
  };
  document.getElementById('e40cancel')?.addEventListener('click',closeModal);
  document.getElementById('e40consult').onclick=()=>open(document.getElementById('e40period').value).catch(x=>toast(x.message,'error'));
  document.getElementById('e40preview').onclick=()=>preview(document.getElementById('e40period').value).catch(x=>toast(x.message,'error'));
 }
 async function preview(month){
  const cs=await api('/api/payroll/competences');
  const period=(cs.items||[]).find(x=>x.competence===month);
  if(!period)throw Error('Abra a competência '+month+' antes de consultar a prévia patronal.');
  const list=await api('/api/payroll/monthly-runs?competence_id='+encodeURIComponent(period.id));
  const run=(list.runs||[])[0];
  if(!run||run.status!=='APPROVED')throw Error('Feche a última revisão da folha mensal antes da prévia.');
  const r=await api('/api/payroll/monthly-runs/'+encodeURIComponent(run.id)+'/employer-preview');
  const rows=r.items.map(x=>'<tr><td>'+e(x.employee_code)+' - '+e(x.employee_name)+'</td><td>'+brl(x.inss_base_cents)+'</td><td>'+brl(x.cpp_cents)+'</td><td>'+brl(x.rat_cents)+'</td><td>'+brl(x.thirds_cents)+'</td><td>'+brl(x.pis_cents)+'</td></tr>').join('');
  const t=r.totals;
  openModal('Prévia patronal — '+e(month),'Apenas conferência: sem geração de guias, financeiro ou contabilidade.',
   '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Base INSS</th><th>INSS patronal</th><th>RAT/FAP</th><th>Terceiros</th><th>PIS folha</th></tr></thead><tbody>'+
   rows+'<tr><th>Total</th><th>'+brl(t.inss_base_cents)+'</th><th>'+brl(t.cpp_cents)+'</th><th>'+brl(t.rat_cents)+'</th><th>'+brl(t.thirds_cents)+'</th><th>'+brl(t.pis_cents)+'</th></tr></tbody></table></div>'+
   '<p><b>Total de encargos: '+brl(t.total_cents)+'</b></p><p class="help">'+r.warnings.map(e).join(' ')+'</p>'+
   '<div class="form-actions"><button type="button" class="btn secondary" id="e40accounting">Contabilizar encargos / gerar financeiro</button><button type="button" class="btn secondary" id="e40back">Voltar</button></div>',true);
  document.getElementById('e40back').onclick=()=>open(month).catch(x=>toast(x.message,'error'));
  document.getElementById('e40accounting').onclick=()=>SAGAS_EMPLOYER120.preview(run.id,month).catch(x=>toast(x.message,'error'));
 }
 window.SAGAS_EMPLOYER40={attach,open,preview};
})();
