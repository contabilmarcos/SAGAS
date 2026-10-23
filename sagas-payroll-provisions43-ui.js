// SAGAS Folha 43 - controle de constituição, saldo inicial e baixas.
function payrollProvision43Currency(cents){return money(Number(cents||0)/100);}
function payrollProvision43Period(){
 const today=new Date();return today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
}
async function payrollProvision43Ledger(period){
 const competence=period||((await api('/api/payroll/competences')).items||[]).find(x=>x.id===window.sagasPayrollCompetence)?.competence||payrollProvision43Period();
 const r=await api('/api/payroll/provisions/ledger?competence='+encodeURIComponent(competence));
 const fmt=payrollProvision43Currency;
 const rows=(r.balances||[]).map(x=>'<tr><td>'+esc(x.employee_code||'—')+' — '+esc(x.employee_name)+'</td><td>'+esc(x.component_name)+'</td>'+
   '<td>'+esc(x.cost_center_code||'—')+'</td><td>'+fmt(x.opening_cents)+'</td><td>'+fmt(x.accrual_cents)+'</td>'+
   '<td>'+fmt(x.use_cents)+'</td><td><b>'+fmt(x.balance_cents)+'</b></td></tr>').join('');
 const total=Object.values(r.totals).reduce((n,x)=>n+Number(x),0);
 const history=(r.cycles||[]).map(x=>'<tr><td>'+esc(x.competence)+'</td><td>'+esc(x.confirmed_at)+'</td><td>'+fmt(Object.values(x.totals).reduce((n,a)=>n+Number(a),0))+'</td></tr>').join('');
 openModal('Controle das provisões','Saldos operacionais por funcionário, tipo de provisão e competência.',
  '<div class="toolbar"><label class="field"><span>Até a competência</span><input id="p43period" type="month" value="'+esc(competence)+'"></label>'+
  '<button class="btn secondary" id="p43consult">Consultar</button>'+
  (can('payroll.manage')?'<button class="btn secondary" id="p43opening">Saldo inicial</button><button class="btn secondary" id="p43use">Baixa documentada</button>':'')+
  '<button class="btn secondary" id="p44settings">Naturezas contábeis</button><button class="btn secondary" id="p44preview">Prévia contábil</button>'+ 
  '</div><p class="help">'+esc(r.note)+'</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Provisão</th><th>Centro de custo</th><th>Abertura</th><th>Constituído</th><th>Utilizado</th><th>Saldo</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="7">Nenhuma movimentação de provisão até esta competência.</td></tr>')+
  '</tbody></table></div><p class="help"><b>Total do controle:</b> '+fmt(total)+
  ' · Valores patronais estimados não foram incorporados ao saldo. Não é balancete contábil.</p>'+
  '<h4>Competências constituídas</h4><div class="table-wrap"><table class="table"><thead><tr><th>Competência</th><th>Registro</th><th>Valor</th></tr></thead><tbody>'+
  (history||'<tr><td colspan="3">Ainda não existem competências constituídas.</td></tr>')+'</tbody></table></div>',true);
 document.getElementById('p43consult').onclick=()=>payrollProvision43Ledger(document.getElementById('p43period').value).catch(e=>toast(e.message,'error'));
 document.getElementById('p44settings').onclick=()=>payrollProvision44Settings(competence).catch(e=>toast(e.message,'error'));
 document.getElementById('p44preview').onclick=()=>payrollProvision44Preview(competence).catch(e=>toast(e.message,'error'));
 if(document.getElementById('p43opening'))document.getElementById('p43opening').onclick=()=>payrollProvision43Movement('OPENING',competence).catch(e=>toast(e.message,'error'));
 if(document.getElementById('p43use'))document.getElementById('p43use').onclick=()=>payrollProvision43Movement('USE',competence).catch(e=>toast(e.message,'error'));
}
async function payrollProvision43Movement(kind,competence){
 const employees=(await api('/api/payroll/employees')).items||[];
 if(!employees.length)throw Error('Não há funcionários cadastrados.');
 const opening=kind==='OPENING',label=opening?'Saldo inicial':'Baixa documentada';
 const options=employees.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.employee_code||'—')+' — '+esc(x.name)+'</option>').join('');
 const components=[['FERIAS','Férias'],['TERCO_FERIAS','Adicional 1/3 de férias'],['DECIMO_TERCEIRO','13º salário']];
 openModal(label,'Controle de provisões por funcionário e componente.',
  '<p class="help">'+(opening?'A abertura só é permitida antes da primeira movimentação do funcionário neste componente.':'A baixa exige saldo suficiente na competência, não gera pagamento nem contabilização.')+'</p>'+
  '<form id="p43form"><div class="grid">'+
  '<label class="field"><span>Funcionário</span><select name="employee_id" required>'+options+'</select></label>'+
  '<label class="field"><span>Componente</span><select name="component" required>'+components.map(([v,t])=>'<option value="'+v+'">'+esc(t)+'</option>').join('')+'</select></label>'+
  '<label class="field"><span>Competência</span><input type="month" name="competence" value="'+esc(competence)+'" required></label>'+
  '<label class="field"><span>Valor (R$)</span><input type="number" name="amount" min="0.01" step="0.01" required placeholder="0,00"></label>'+
  '<label class="field full"><span>Documento de suporte</span><input type="text" name="document_ref" maxlength="160" required placeholder="Ex.: saldo inicial validado / recibo férias"></label>'+
  '<label class="field full"><span>Observações</span><textarea name="notes" maxlength="350" rows="2"></textarea></label>'+
  '<label class="field"><span>Confirme digitando '+(opening?'ABERTURA':'BAIXAR')+'</span><input name="confirmation" required autocomplete="off"></label>'+
  '</div><div class="form-actions"><button type="button" class="btn secondary" id="p43cancel">Cancelar</button>'+
  '<button type="submit" class="btn primary">'+(opening?'Registrar saldo inicial':'Registrar baixa')+'</button></div></form>',true);
 const form=document.getElementById('p43form');
 document.getElementById('p43cancel').onclick=()=>payrollProvision43Ledger(competence).catch(e=>toast(e.message,'error'));
 const requestKey=crypto.randomUUID();
 form.onsubmit=async ev=>{
  ev.preventDefault();const btn=form.querySelector('button[type=submit]');btn.disabled=true;
  try{
   const body={...Object.fromEntries(new FormData(form)),movement_kind:kind,request_key:requestKey};
   const result=await api('/api/payroll/provisions/movements',{method:'POST',body});
   toast(result.reused?'Movimento existente recuperado.':'Movimentação registrada.');
   await payrollProvision43Ledger(body.competence);
  }catch(err){toast(err.message,'error');btn.disabled=false}
 };
}
async function payrollProvision43Constitute(runId,competence){
 if(!can('payroll.manage'))throw Error('Você não tem acesso para constituir provisões.');
 openModal('Constituir provisões — '+esc(competence),'Registro operacional da competência já fechada.',
  '<p class="help">Serão gravadas somente as parcelas mensais de férias, 1/3 e 13º. Os encargos permanecem estimados. Saldo inicial, férias gozadas e 13º pago devem ser conciliados separadamente.</p>'+
  '<p class="help"><b>Atenção:</b> competência só pode ser constituída uma vez e não gera débito/crédito contábil.</p>'+
  '<form id="p43confirm"><label class="field"><span>Digite CONSTITUIR para confirmar</span><input name="confirmation" required autocomplete="off"></label>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="p43back">Cancelar</button><button type="submit" class="btn primary">Confirmar constituição</button></div></form>',true);
 document.getElementById('p43back').onclick=()=>payrollProvisions42Open().catch(e=>toast(e.message,'error'));
 const form=document.getElementById('p43confirm');
 form.onsubmit=async ev=>{
  ev.preventDefault();const btn=form.querySelector('button[type=submit]');btn.disabled=true;
  try{
   const d=await api('/api/payroll/monthly-runs/'+encodeURIComponent(runId)+'/provisions-confirm',{method:'POST',body:{confirmation:form.elements.confirmation.value}});
   toast('Constituição registrada: '+esc(String(d.item_count))+' parcelas.');
   await payrollProvision43Ledger(competence);
  }catch(err){toast(err.message,'error');btn.disabled=false;}
 };
}
