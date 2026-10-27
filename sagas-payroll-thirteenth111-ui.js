// SAGAS folha v111 — integração do adiantamento do 13º via naturezas e centro de custo.
async function payrollThirteenth111Settings(runId,year){
 const [r,n]=await Promise.all([
  api('/api/payroll/thirteenth/integration/settings'),
  api('/api/payroll/accounting-natures')
 ]);
 const opts=(n.natures||[]).filter(x=>x.active&&x.synthetic_analytic==='ANALYTIC');
 const mappings=new Map((r.mappings||[]).map(x=>[x.component,x]));
 const rows=Object.entries(r.components||{}).map(([component,label])=>{
  const m=mappings.get(component)||{};
  return '<tr><td>'+esc(label)+'</td><td><select id="p13nature-'+esc(component)+'">'+
   '<option value="">Selecione uma natureza</option>'+
   opts.map(o=>'<option value="'+esc(o.id)+'"'+(m.nature_id===o.id?' selected':'')+'>'+
    esc(o.code+' — '+o.description)+'</option>').join('')+'</select></td>'+
   '<td><button class="btn secondary sm" type="button" data-p13nature-save="'+esc(component)+'">Salvar</button></td></tr>';
 }).join('');
 openModal('13º — Naturezas da 1ª parcela',
  'As contas contábeis são obtidas nos defaults de cada natureza, conforme o centro de custo do funcionário.',
  '<p class="help">Configure débito e crédito de 100% para cada natureza. Para FIRST_ADVANCE, use adiantamento de 13º a compensar no débito e obrigação de pagamento no crédito. Para FIRST_FGTS, configure custo e FGTS a recolher.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Componente</th><th>Natureza</th><th>Ação</th></tr></thead>'+
  '<tbody>'+rows+'</tbody></table></div>'+
  '<div class="form-actions"><button class="btn secondary" type="button" id="p13SettingsBack">Voltar</button>'+
  '<button class="btn primary" type="button" id="p13SettingsPreview">Prévia de integração</button></div>',true);
 document.getElementById('p13SettingsBack').onclick=()=>payrollThirteenth71History(year,'FIRST').catch(e=>toast(e.message,'error'));
 document.getElementById('p13SettingsPreview').onclick=()=>payrollThirteenth111Preview(runId,year).catch(e=>toast(e.message,'error'));
 $$('[data-p13nature-save]').forEach(button=>{
  button.disabled=!can('payroll.manage');
  button.onclick=async()=>{
   const comp=button.dataset.p13natureSave;
   const selected=document.getElementById('p13nature-'+comp)?.value;
   if(!selected){toast('Selecione uma natureza orçamentária.','error');return;}
   button.disabled=true;
   try{
    await api('/api/payroll/thirteenth/integration/settings',{method:'POST',body:{component:comp,nature_id:selected}});
    toast('Natureza atualizada.');
    await payrollThirteenth111Settings(runId,year);
   }catch(e){toast(e.message,'error');button.disabled=false}
  };
 });
}
async function payrollThirteenth111Preview(runId,year){
 const p=await api('/api/payroll/thirteenth/integration?run_id='+encodeURIComponent(runId));
 const fmt=x=>money(Number(x||0)/100);
 const problems=(p.problems||[]).map(x=>'<p class="help">'+esc(x.message)+'</p>').join('');
 const lines=(p.lines||[]).map(x=>'<tr><td>'+esc(x.side==='D'?'Débito':'Crédito')+'</td>'+
  '<td>'+esc(x.account_id)+'</td><td>'+esc(x.cost_center_id)+'</td>'+
  '<td>'+fmt(x.amount_cents)+'</td></tr>').join('');
 const employees=(p.employees||[]).map(e=>'<tr><td>'+esc(e.employee_code||'—')+' — '+esc(e.employee_name)+'</td>'+
  '<td>'+fmt(e.net_cents)+'</td><td>'+fmt(e.fgts_cents)+'</td></tr>').join('');
 openModal('13º — Integração da 1ª parcela '+esc(year),
  'Contabilização por natureza orçamentária/centro de custo e geração de títulos, sem pagamento bancário.',
  '<p class="help">Integração apenas da 1ª parcela ainda não paga. Se houve pagamento externo, não gere outro título.</p>'+
  '<p class="help"><b>Funcionários:</b> '+esc(p.payable_count)+' · <b>Títulos:</b> '+fmt(p.payable_total_cents)+
  ' · <b>Débitos:</b> '+fmt(p.journal_debit_cents)+' · <b>Créditos:</b> '+fmt(p.journal_credit_cents)+'</p>'+
  '<p class="help"><b>Situação:</b> '+(p.posted?'Já integrada':p.ready?'Pronta para integração':'Possui pendências')+'</p>'+
  problems+
  '<h4>Valores por funcionário</h4><div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Adiantamento líquido</th><th>FGTS</th></tr></thead><tbody>'+
  employees+'</tbody></table></div>'+
  '<h4>Partidas contábeis</h4><div class="table-wrap"><table class="table"><thead><tr><th>D/C</th><th>Conta</th><th>Centro de custo</th><th>Valor</th></tr></thead><tbody>'+
  lines+'</tbody></table></div>'+
  (p.notes||[]).map(x=>'<p class="help">'+esc(x)+'</p>').join('')+
  '<div class="form-actions"><button type="button" class="btn secondary" id="p13IntSettings">Configurar naturezas</button>'+
  '<button type="button" class="btn secondary" id="p13IntBack">Voltar</button>'+
  (p.ready&&can('payroll.manage')?'<button type="button" class="btn primary" id="p13IntStart">Integrar 1ª parcela</button>':'')+
  '</div>',true);
 document.getElementById('p13IntSettings').onclick=()=>payrollThirteenth111Settings(runId,year).catch(e=>toast(e.message,'error'));
 document.getElementById('p13IntBack').onclick=()=>payrollThirteenth71History(year,'FIRST').catch(e=>toast(e.message,'error'));
 if(document.getElementById('p13IntStart'))document.getElementById('p13IntStart').onclick=()=>payrollThirteenth111Integrate(p,year);
}
function payrollThirteenth111Integrate(preview,year){
 const today=new Date().toISOString().slice(0,10);
 const suggested=today.startsWith(year+'-')&&today<=year+'-11-30'?today:year+'-11-30';
 openModal('Integrar 1ª parcela do 13º',
  'Esta ação cria um diário contábil e títulos a pagar na mesma transação.',
  '<p class="help"><b>Títulos:</b> '+esc(preview.payable_count)+' · <b>Total:</b> '+
  money(Number(preview.payable_total_cents||0)/100)+
  '. Confirme somente se não houver adiantamento pago por outro processo.</p>'+
  '<form id="p13IntForm"><label class="field"><span>Data da contabilização</span><input type="date" name="posting_date" required value="'+esc(suggested)+'"></label>'+
  '<label class="field"><span>Digite INTEGRAR ADIANTAMENTO 13</span><input name="confirmation" autocomplete="off" required></label>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="p13IntCancel">Cancelar</button>'+
  '<button type="submit" class="btn primary">Contabilizar e gerar títulos</button></div></form>',true);
 document.getElementById('p13IntCancel').onclick=()=>payrollThirteenth111Preview(preview.run_id,year).catch(e=>toast(e.message,'error'));
 const form=document.getElementById('p13IntForm');
 form.onsubmit=async ev=>{
  ev.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const result=await api('/api/payroll/thirteenth/integration',{method:'POST',body:{
    ...Object.fromEntries(new FormData(form)),source_fingerprint:preview.source_fingerprint,
    run_id:preview.run_id
   }});
   toast(result.integrated?'Diário e títulos da 1ª parcela integrados.':'Conferir resultado.');
   await payrollThirteenth111Preview(preview.run_id,year);
  }catch(e){toast(e.message,'error');button.disabled=false}
 };
}