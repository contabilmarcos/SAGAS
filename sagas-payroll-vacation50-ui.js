// SAGAS Folha v88 — períodos aquisitivos e vínculo de férias (modais).
// Usa componentes visuais existentes do SAGAS, sem lateral fixa nem telas de resumo.
async function payrollVacation50Open(month,occ){
 if(!occ||!occ.id)return;
 const query='/api/payroll/vacations?occurrence_id='+encodeURIComponent(occ.id);
 const data=await api(query);
 let preview=null,previewError='';
 try{preview=await api('/api/payroll/leaves?view=vacation&id='+encodeURIComponent(occ.id))}
 catch(e){previewError=String(e.message||e)}
 const money=c=>Number(c||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) // convertido abaixo, centavos
 const brMoney=c=>money(Number(c)/100);
 const cycles=data.periods||[],canEdit=can('payroll.manage'),linked=!!data.allocation;
 const opt=cycles.filter(p=>p.remaining_days>=Number(data.occurrence?.days||0)&&p.period_count<3&&p.acquisition_end<occ.start_date);
 const options='<option value="">Selecione o período aquisitivo</option>'+opt.map(p=>
  '<option value="'+esc(p.id)+'">'+esc(p.acquisition_start)+' a '+esc(p.acquisition_end)+' — '+esc(String(p.remaining_days))+' dia(s) disponíveis</option>').join('');
 const rows=cycles.map(p=>
  '<tr><td>'+esc(p.acquisition_start)+' a '+esc(p.acquisition_end)+'</td>'+
  '<td>'+esc(String(p.unjustified_absences))+'</td><td>'+esc(String(p.entitled_days))+'</td>'+
  '<td>'+esc(String(p.used_days))+'</td><td><b>'+esc(String(p.remaining_days))+'</b></td>'+
  '<td>'+esc(p.concession_deadline)+'</td></tr>').join('');
 const current=cycles.find(x=>x.id===data.allocation?.cycle_id);
 const pre=preview?'<p class="section-title">Prévia bruta — sem homologação</p><div class="table-wrap"><table class="table"><tbody>'+
  '<tr><td>Salário-base histórico</td><td>'+esc(brMoney(preview.salary_cents))+'</td></tr>'+
  '<tr><td>Remuneração fixa do gozo</td><td>'+esc(brMoney(preview.vacation_remuneration_cents))+'</td></tr>'+
  '<tr><td>Terço constitucional</td><td>'+esc(brMoney(preview.constitutional_third_cents))+'</td></tr>'+
  '<tr><td><b>Bruto estimado</b></td><td><b>'+esc(brMoney(preview.gross_estimate_cents))+'</b></td></tr>'+
  '</tbody></table></div><p class="help">Data-limite estimada de pagamento: '+esc(preview.payment_deadline)+'. Sem médias, abono, impostos, recibo ou integração financeira.</p>':
  '<p class="help">Prévia bruta indisponível: '+esc(previewError||'Conferência pendente')+'.</p>';
 const notes=(data.warnings||[]).concat(current?.warnings||[]).concat(preview?.warnings||[]);
 openModal('Férias — períodos aquisitivos',
  esc(data.employee.name)+' • '+esc(occ.start_date)+' a '+esc(occ.end_date)+' ('+esc(String(data.occurrence.days))+' dias)',
  '<p class="help">O direito aos dias e as faltas devem ser confirmados pelo Departamento Pessoal. O vínculo não quita férias nem retira o bloqueio do cálculo mensal.</p>'+
  '<div class="toolbar"><div><b>Períodos aquisitivos cadastrados</b></div>'+
  (canEdit?'<button id="vacation50Add" class="btn secondary" type="button">+ Novo período</button>':'')+'</div>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Aquisição</th><th>Faltas</th><th>Direito</th><th>Utilizados</th><th>Saldo</th><th>Concessão até</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="6">Nenhum período aquisitivo cadastrado.</td></tr>')+'</tbody></table></div>'+
  (linked?'<p class="section-title">Ocorrência vinculada</p><p>Período aquisitivo: <b>'+
    esc(current?current.acquisition_start+' a '+current.acquisition_end:'Não encontrado')+
    '</b>. Saldo após o vínculo: <b>'+esc(String(current?.remaining_days??'—'))+' dia(s)</b>.</p>'+
    (canEdit?'<button id="vacation50Unlink" type="button" class="btn danger">Desvincular ocorrência</button>':''):
   '<p class="section-title">Vincular férias ao período aquisitivo</p>'+
   (canEdit?'<form id="vacation50LinkForm"><div class="grid">'+
   '<label class="field full"><span>Período aquisitivo</span><select name="cycle_id" required>'+options+'</select></label>'+
   '<label class="field full"><span>Documento / justificativa da conferência</span><textarea name="notes" minlength="10" maxlength="500" required rows="2"></textarea></label>'+
   '<label class="field full"><span>Confirme digitando VINCULAR FERIAS</span><input name="confirmation" required autocomplete="off"></label>'+
   '</div><div class="form-actions"><button class="btn primary" type="submit" '+(opt.length?'':'disabled')+'>Salvar vínculo</button></div></form>':
   '<p class="help">Apenas usuários com permissão de gerenciar folha podem vincular férias.</p>'))+
  pre+'<p class="section-title">Pontos de atenção</p><ul class="help">'+notes.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>'+
  '<div class="form-actions"><button id="vacation50Back" type="button" class="btn secondary">Voltar à lista</button></div>',true);
 if($('#vacation50Back'))$('#vacation50Back').onclick=()=>payrollLeave49Open(month).catch(e=>toast(e.message,'error'));
 if($('#vacation50Add'))$('#vacation50Add').onclick=()=>payrollVacation50Register(month,occ,data.employee);
 if($('#vacation50Unlink'))$('#vacation50Unlink').onclick=()=>payrollVacation50Unlink(month,occ);
 const form=$('#vacation50LinkForm');
 if(form)form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   await api('/api/payroll/vacations',{method:'POST',body:{
    action:'link',occurrence_id:occ.id,...Object.fromEntries(new FormData(form))
   }});
   toast('Ocorrência vinculada ao período aquisitivo.');
   await payrollVacation50Open(month,occ);
  }catch(e){toast(e.message,'error');button.disabled=false}
 };
}
function payrollVacation50Register(month,occ,employee){
 openModal('Cadastrar período aquisitivo',
  esc(employee.name)+' • admissão '+esc(employee.admission_date),
  '<p class="help">O cadastro não calcula automaticamente faltas, suspensões ou direito. Utilize os dados conferidos pelo DP; para anos anteriores, registre a competência aquisitiva correspondente.</p>'+
  '<form id="vacation50RegisterForm"><div class="grid">'+
  '<label class="field"><span>Início do período aquisitivo</span><input name="acquisition_start" type="date" value="'+esc(employee.admission_date)+'" required></label>'+
  '<label class="field"><span>Faltas injustificadas confirmadas</span><input name="unjustified_absences" type="number" min="0" max="32" step="1" value="0" required></label>'+
  '<label class="field full"><span>Justificativa / conferência documental do DP</span><textarea name="notes" rows="3" minlength="10" maxlength="500" required></textarea></label>'+
  '<label class="field full"><span>Confirme digitando DIREITO CONFERIDO</span><input name="confirmation" autocomplete="off" required></label>'+
  '</div><div class="form-actions">'+
  '<button id="vacation50Cancel" type="button" class="btn secondary">Cancelar</button>'+
  '<button type="submit" class="btn primary">Cadastrar período</button></div></form>',true);
 $('#vacation50Cancel').onclick=()=>payrollVacation50Open(month,occ).catch(e=>toast(e.message,'error'));
 const form=$('#vacation50RegisterForm');
 form.onsubmit=async event=>{
  event.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
   const body={action:'register',employee_id:employee.id,...Object.fromEntries(new FormData(form))};
   await api('/api/payroll/vacations',{method:'POST',body});
   toast('Período aquisitivo cadastrado com confirmação do DP.');
   await payrollVacation50Open(month,occ);
  }catch(e){toast(e.message,'error');btn.disabled=false}
 };
}
function payrollVacation50Unlink(month,occ){
 openModal('Desvincular férias',
  esc(occ.employee_name)+' • '+esc(occ.start_date)+' a '+esc(occ.end_date),
  '<p class="help">A correção desfaz somente o vínculo com o período aquisitivo. A ocorrência do funcionário permanece cadastrada, sem alterar folha fechada.</p>'+
  '<form id="vacation50UnlinkForm">'+
  '<label class="field"><span>Confirme digitando DESVINCULAR FERIAS</span><input name="confirmation" required autocomplete="off"></label>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="vacation50CancelUnlink">Cancelar</button>'+
  '<button type="submit" class="btn danger">Desvincular</button></div></form>',true);
 $('#vacation50CancelUnlink').onclick=()=>payrollVacation50Open(month,occ).catch(e=>toast(e.message,'error'));
 const form=$('#vacation50UnlinkForm');
 form.onsubmit=async event=>{
  event.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
   await api('/api/payroll/vacations',{method:'POST',body:{
    action:'unlink',occurrence_id:occ.id,...Object.fromEntries(new FormData(form))
   }});
   toast('Vínculo de férias desfeito; confira o saldo.');
   await payrollVacation50Open(month,occ);
  }catch(e){toast(e.message,'error');btn.disabled=false}
 };
}
