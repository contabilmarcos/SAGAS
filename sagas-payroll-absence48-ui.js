// SAGAS Folha 48 - conferência de falta, atraso e perda de DSR, sem painel lateral.
async function payrollAbsence48Open(month){
 const periods=await api('/api/payroll/competences');
 const current=(periods.items||[]).find(x=>x.id===window.sagasPayrollCompetence);
 const now=new Date(),defaultMonth=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
 const selected=month||current?.competence||defaultMonth;
 const [data,employees]=await Promise.all([
   api('/api/payroll/absences?competence='+encodeURIComponent(selected)),
   api('/api/payroll/employees')
 ]);
 const roster=employees.items||[];
 const catalog=roster.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.employee_code||'—')+' — '+esc(e.name)+'</option>').join('');
 const absences=(data.occurrences||[]).map(o=>'<tr><td>'+esc(o.employee_name)+'</td><td>'+
   esc(o.kind)+'</td><td>'+esc(o.start_date)+(o.start_date!==o.end_date?' até '+esc(o.end_date):'')+'</td><td>'+
   esc(o.classification||'Aguardando classificação')+'</td><td>'+
   (o.kind==='FALTA'&&o.start_date===o.end_date?
     '<button type="button" class="btn secondary sm" data-a48occ="'+esc(o.id)+'">Classificar</button>':
     '<span class="muted">Tratar em processo específico</span>')+'</td></tr>').join('');
 const adjust=(data.adjustments||[]).map(a=>'<tr><td>'+esc(a.employee_name)+'</td><td>'+
   (a.kind==='LATE'?'Atraso':'DSR confirmado')+'</td><td>'+esc(a.event_date)+'</td><td>'+
   (a.kind==='LATE'?esc(a.minutes)+' minuto(s)':'Origem: '+esc(a.source_date))+'</td><td>'+
   '<button type="button" class="btn secondary sm" data-a48remove="'+esc(a.id)+'">Excluir</button></td></tr>').join('');
 openModal('Faltas, atrasos e DSR',
  'Conferência de ocorrências, descontos e reflexos antes do cálculo mensal.',
  '<p class="help">Faltas devem ser cadastradas no histórico de ocorrências do funcionário, em datas individuais. Depois classifique cada uma como justificada ou injustificada. O desconto de DSR só ocorre após confirmação expressa com base na escala.</p>'+
  '<div class="toolbar"><label class="field"><span>Competência</span><input type="month" id="a48month" value="'+esc(selected)+'"></label>'+
  '<button class="btn secondary" type="button" id="a48search">Consultar</button></div>'+
  '<h4>Ocorrências trabalhistas</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Tipo</th><th>Data</th><th>Classificação</th><th>Ação</th></tr></thead><tbody>'+
  (absences||'<tr><td colspan="5">Nenhuma ocorrência no período. Cadastre faltas no histórico do funcionário.</td></tr>')+'</tbody></table></div>'+
  '<h4>Apontamentos confirmados</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Tipo</th><th>Data</th><th>Referência</th><th>Ação</th></tr></thead><tbody>'+
  (adjust||'<tr><td colspan="5">Nenhum atraso ou DSR confirmado.</td></tr>')+'</tbody></table></div>'+
  (can('payroll.manage')?
  '<h4>Novo atraso ou perda de DSR</h4>'+
  '<form id="a48add"><div class="grid">'+
  '<label class="field"><span>Funcionário</span><select name="employee_id" required>'+catalog+'</select></label>'+
  '<label class="field"><span>Tipo</span><select name="kind" required id="a48kind"><option value="LATE">Atraso não justificado</option><option value="DSR_LOSS">Perda de DSR confirmada</option></select></label>'+
  '<label class="field"><span>Data do apontamento</span><input name="event_date" type="date" required value="'+esc(selected)+'-01"></label>'+
  '<label class="field" id="a48minutesField"><span>Minutos de atraso</span><input name="minutes" type="number" min="1" max="1440" step="1" value="15"></label>'+
  '<label class="field" id="a48sourceField" style="display:none"><span>Data da falta ou atraso que originou o DSR</span><input name="source_date" type="date"></label>'+
  '<label class="field" id="a48confirmField" style="display:none"><span>Digite CONFIRMAR DSR</span><input name="confirmation" autocomplete="off"></label>'+
  '<label class="field full"><span>Documento ou observação da conferência</span><textarea name="notes" maxlength="500" required rows="2"></textarea></label>'+
  '</div><div class="form-actions"><button class="btn primary" type="submit">Registrar apontamento</button></div></form>':'')+
  '<p class="help">Não há desconto automático de DSR por domingo ou feriado sem confirmação. Faltas múltiplas, férias, licenças, afastamentos e regras especiais permanecem bloqueados até tratamento próprio.</p>',true);
 document.getElementById('a48search').onclick=()=>payrollAbsence48Open(document.getElementById('a48month').value).catch(e=>toast(e.message,'error'));
 $$('[data-a48occ]').forEach(btn=>{
  btn.disabled=!can('payroll.manage');
  btn.onclick=()=>payrollAbsence48Classify(selected,(data.occurrences||[]).find(o=>o.id===btn.dataset.a48occ));
 });
 $$('[data-a48remove]').forEach(btn=>{
  btn.disabled=!can('payroll.manage');
  btn.onclick=()=>payrollAbsence48Remove(selected,btn.dataset.a48remove);
 });
 const form=document.getElementById('a48add');
 if(form){
  const toggle=()=>{
   const dsr=form.elements.kind.value==='DSR_LOSS';
   document.getElementById('a48minutesField').style.display=dsr?'none':'';
   document.getElementById('a48sourceField').style.display=dsr?'':'none';
   document.getElementById('a48confirmField').style.display=dsr?'':'none';
   form.elements.minutes.required=!dsr;
   form.elements.source_date.required=dsr;
   form.elements.confirmation.required=dsr;
  };
  form.elements.kind.onchange=toggle;toggle();
  form.onsubmit=async event=>{
   event.preventDefault();const submit=form.querySelector('[type="submit"]');submit.disabled=true;
   try{
    const data=Object.fromEntries(new FormData(form));
    if(data.kind==='LATE'){delete data.source_date;delete data.confirmation;}
    else{delete data.minutes;}
    await api('/api/payroll/absences',{method:'POST',body:data});
    toast('Apontamento registrado para conferência da folha.');
    await payrollAbsence48Open(selected);
   }catch(err){toast(err.message,'error');submit.disabled=false;}
  };
 }
}
function payrollAbsence48Classify(month,occ){
 if(!occ)return;
 openModal('Classificar falta — '+esc(occ.employee_name),'Data '+esc(occ.start_date)+' · Necessário comprovar a classificação.',
 '<form id="a48classify"><div class="grid"><label class="field"><span>Tratamento</span><select name="classification" required>'+
 '<option value="">Escolha...</option><option value="JUSTIFICADA" '+(occ.classification==='JUSTIFICADA'?'selected':'')+'>Justificada — sem desconto</option>'+
 '<option value="INJUSTIFICADA" '+(occ.classification==='INJUSTIFICADA'?'selected':'')+'>Injustificada — descontar 1 dia</option></select></label>'+
 '<label class="field full"><span>Documento da justificativa ou evidência</span><textarea name="notes" maxlength="500" rows="2" required>'+esc(occ.decision_notes||'')+'</textarea></label></div>'+
 '<div class="form-actions"><button type="button" class="btn secondary" id="a48back">Cancelar</button><button type="submit" class="btn primary">Salvar classificação</button></div></form>',true);
 document.getElementById('a48back').onclick=()=>payrollAbsence48Open(month).catch(e=>toast(e.message,'error'));
 const form=document.getElementById('a48classify');
 form.onsubmit=async e=>{
  e.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
   await api('/api/payroll/absences?action=classify',{method:'POST',body:{occurrence_id:occ.id,...Object.fromEntries(new FormData(form))}});
   toast('Classificação salva.');await payrollAbsence48Open(month);
  }catch(err){toast(err.message,'error');btn.disabled=false}
 };
}
function payrollAbsence48Remove(month,id){
 openModal('Excluir apontamento','Esta alteração só é permitida em competência aberta.',
  '<p class="help">A exclusão invalidará a fotografia de eventual folha mensal ainda não fechada. Será necessário recalcular e conferir.</p>'+
  '<div class="form-actions"><button class="btn secondary" id="a48cancel">Cancelar</button><button class="btn danger" id="a48doRemove">Excluir apontamento</button></div>',true);
 document.getElementById('a48cancel').onclick=()=>payrollAbsence48Open(month).catch(err=>toast(err.message,'error'));
 document.getElementById('a48doRemove').onclick=async()=>{
  const b=document.getElementById('a48doRemove');b.disabled=true;
  try{await api('/api/payroll/absences/'+encodeURIComponent(id),{method:'DELETE'});
   toast('Apontamento excluído.');await payrollAbsence48Open(month);
  }catch(err){toast(err.message,'error');b.disabled=false}
 };
}
