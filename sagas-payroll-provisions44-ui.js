// SAGAS Folha 44 - configuração de naturezas e conferência das partidas contábeis.
async function payrollProvision44Settings(period){
 const [s,n]=await Promise.all([
  api('/api/payroll/provisions/accounting/settings'),
  api('/api/payroll/accounting-natures')
 ]);
 const options=(n.natures||[]).filter(x=>x.active&&x.synthetic_analytic==='ANALYTIC');
 const maps=new Map((s.mappings||[]).map(x=>[x.component,x]));
 const rows=Object.entries(s.components||{}).map(([component,title])=>{
  const m=maps.get(component)||{};
  return '<tr><td><b>'+esc(title)+'</b></td><td><select name="'+component+'" aria-label="Natureza '+esc(title)+'">'+
    '<option value="">Selecione a natureza</option>'+
    options.map(o=>'<option value="'+esc(o.id)+'" '+(m.nature_id===o.id?'selected':'')+'>'+esc(o.code+' — '+o.description)+'</option>').join('')+
    '</select></td><td><button type="button" class="btn secondary sm" data-p44-save="'+component+'">Salvar</button></td></tr>';
 }).join('');
 openModal('Naturezas das provisões','Uma natureza orçamentária por tipo de provisão. As contas são definidas nos defaults da natureza por centro de custo.',
  '<p class="help">Configure os defaults de débito e crédito (100% em cada lado) no cadastro de Naturezas Orçamentárias. Esta tela não cria partidas.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Componente</th><th>Natureza</th><th>Ação</th></tr></thead><tbody>'+
  rows+'</tbody></table></div>'+
  '<div class="form-actions"><button id="p44back" class="btn secondary" type="button">Voltar aos saldos</button><button id="p44preview" class="btn primary" type="button">Prévia contábil</button></div>',true);
 const readPeriod=period||payrollProvision43Period();
 document.getElementById('p44back').onclick=()=>payrollProvision43Ledger(readPeriod).catch(err=>toast(err.message,'error'));
 document.getElementById('p44preview').onclick=()=>payrollProvision44Preview(readPeriod).catch(err=>toast(err.message,'error'));
 $$('[data-p44-save]').forEach(button=>{
  if(!can('payroll.manage')){button.disabled=true;return;}
  button.onclick=async()=>{
   const component=button.dataset.p44Save;
   const id=$('select[name="'+component+'"]')?.value;
   if(!id){toast('Escolha uma natureza orçamentária.','error');return;}
   button.disabled=true;
   try{
    await api('/api/payroll/provisions/accounting/settings',{method:'POST',body:{component,nature_id:id}});
    toast('Natureza registrada: '+component+'.');
    await payrollProvision44Settings(readPeriod);
   }catch(err){toast(err.message,'error');button.disabled=false}
  };
 });
}
async function payrollProvision44Preview(period){
 const d=await api('/api/payroll/provisions/accounting/preview?competence='+encodeURIComponent(period));
 const cur=x=>payrollProvision43Currency(x);
 const problems=(d.problems||[]).map(x=>'<p class="help">'+esc(x.message)+'</p>').join('');
 const rows=(d.lines||[]).map(l=>'<tr><td>'+esc(l.component)+'</td><td>'+esc(l.cost_center_code||'—')+'</td>'+
  '<td>'+esc(l.side==='D'?'Débito':'Crédito')+'</td><td>'+esc(l.account_code)+' — '+esc(l.account_name)+'</td><td>'+cur(l.amount_cents)+'</td></tr>').join('');
 openModal('Prévia contábil — '+esc(period),'Partidas por natureza e centro de custo. Não contabiliza.',
  '<p class="help">Esta consulta utiliza exclusivamente as provisões constituídas da competência. Saldos iniciais, baixas e encargos patronais estimados não entram nesta prévia.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Provisão</th><th>Centro de custo</th><th>D/C</th><th>Conta</th><th>Valor</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="5">Nenhuma partida pronta para conferência.</td></tr>')+'</tbody></table></div>'+
  '<p class="help"><b>Débitos:</b> '+cur(d.debit_cents)+' · <b>Créditos:</b> '+cur(d.credit_cents)+' · <b>Situação:</b> '+(d.ready_for_preview?'Partidas conciliadas':'Pendências a resolver')+'</p>'+
  (problems||'<p class="help">Sem pendências de mapeamento contábil nesta prévia.</p>')+
  '<div class="form-actions"><button type="button" class="btn secondary" id="p44return">Voltar às naturezas</button></div>',true);
 document.getElementById('p44return').onclick=()=>payrollProvision44Settings(period).catch(err=>toast(err.message,'error'));
}
