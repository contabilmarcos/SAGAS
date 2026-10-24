// SAGAS Folha 46: parâmetro RM para proporcionalidade do salário na admissão.
async function payrollAdmission46Open(selected){
 const today=new Date(),defaultMonth=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
 const periods=await api('/api/payroll/competences');
 const selectedPeriod=(periods.items||[]).find(x=>x.id===window.sagasPayrollCompetence);
 const month=selected||selectedPeriod?.competence||defaultMonth;
 const data=await api('/api/payroll/monthly-proration?competence='+encodeURIComponent(month));
 const s=data.settings||{},canSave=can('payroll.manage');
 const entries=(data.history||[]).map(x=>'<tr><td>'+esc(x.effective_from)+'</td><td>'+esc(x.revision)+'</td><td>'+
  esc(data.modes[x.mode]||x.mode)+'</td></tr>').join('');
 openModal('Salário proporcional na admissão',
  'Parâmetro da folha mensal por empresa e vigência, conforme a opção de mês comercial do RM.',
  '<p class="help">Essa configuração é usada somente quando o funcionário mensalista foi admitido depois do primeiro dia da competência. O mês integral continua com salário integral.</p>'+
  '<div class="toolbar"><label class="field"><span>Consultar competência</span><input id="sagasAdm46Month" type="month" value="'+esc(month)+'"></label>'+
  '<button type="button" class="btn secondary" id="sagasAdm46Query">Consultar</button></div>'+
  '<p class="help"><b>Configuração vigente:</b> '+esc(s.mode?data.modes[s.mode]+' (desde '+s.effective_from+')':'não configurada')+'</p>'+
  (canSave?'<form id="sagasAdm46Form"><div class="grid">'+
   '<label class="field"><span>Válido desde</span><input type="month" name="effective_from" value="'+esc(month)+'" required></label>'+
   '<label class="field"><span>Divisor na admissão</span><select name="mode" required>'+
   '<option value="">Selecione...</option>'+
   '<option value="CALENDAR" '+(s.mode==='CALENDAR'?'selected':'')+'>Dias efetivos do mês (calendário)</option>'+
   '<option value="COMMERCIAL_30" '+(s.mode==='COMMERCIAL_30'?'selected':'')+'>Mês comercial de 30 dias</option>'+
   '</select></label>'+
   '<label class="field full"><span>Observações</span><textarea name="notes" maxlength="450" rows="2">'+esc(s.notes||'')+'</textarea></label>'+
   '</div><div class="form-actions"><button class="btn primary" type="submit">Salvar nova versão</button></div></form>':
   '<p class="help">Permissão somente de consulta.</p>')+
  '<h4>Histórico por competência</h4><div class="table-wrap"><table class="table"><thead><tr><th>Vigência</th><th>Revisão</th><th>Método</th></tr></thead><tbody>'+
  (entries||'<tr><td colspan="3">Nenhuma configuração registrada.</td></tr>')+
  '</tbody></table></div>'+
  '<p class="help">Conforme o RM: o divisor por calendário considera 28, 29, 30 ou 31 dias; mês comercial considera 30 dias. Casos não suportados continuam bloqueados, sem estimativas silenciosas.</p>',true);
 document.getElementById('sagasAdm46Query').onclick=()=>payrollAdmission46Open(document.getElementById('sagasAdm46Month').value).catch(e=>toast(e.message,'error'));
 const form=document.getElementById('sagasAdm46Form');
 if(form)form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const body=Object.fromEntries(new FormData(form));
   if(!body.mode)throw Error('Escolha o divisor da admissão.');
   await api('/api/payroll/monthly-proration',{method:'POST',body});
   toast('Parâmetro de admissão salvo.');
   await payrollAdmission46Open(body.effective_from);
  }catch(e){toast(e.message,'error');button.disabled=false;}
 };
}
