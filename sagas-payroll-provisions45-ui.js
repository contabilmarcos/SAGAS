// SAGAS Folha 45 — confirmação manual da contabilização de constituição e baixa.
async function payrollProvision45Open(competence,kind='ACCRUAL'){
 const period=String(competence||payrollProvision43Period());
 const mode=kind==='USE'?'USE':'ACCRUAL';
 const apiUrl='/api/payroll/provisions/accounting/posting-preview?competence='+encodeURIComponent(period)+'&kind='+mode;
 const [d,bt]=await Promise.all([api(apiUrl),api('/api/journal-batches')]);
 const fmt=payrollProvision43Currency;
 const rows=(d.lines||[]).map(x=>'<tr><td>'+esc(x.component)+'</td><td>'+esc(x.cost_center_code||'—')+'</td>'+
  '<td>'+esc(x.side==='D'?'Débito':'Crédito')+'</td><td>'+esc(x.account_code)+' — '+esc(x.account_name)+'</td>'+
  '<td>'+fmt(x.amount_cents)+'</td></tr>').join('');
 const allowed=(bt.batches||[]).filter(b=>b.status==='OPEN'&&b.start_date<=period+'-01'&&b.end_date>=period+'-28');
 const options=allowed.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.code+' — '+b.description+' ('+b.start_date+' a '+b.end_date+')')+'</option>').join('');
 const pending=(d.problems||[]).map(x=>'<p class="help">'+esc(x.message)+'</p>').join('');
 const canPost=can('payroll.manage')&&can('accounting.entry.create')&&can('accounting.entry.post')&&d.ready;
 openModal('Contabilização de provisões — '+(mode==='USE'?'Baixas':'Constituição'),
  'Competência '+esc(period)+' · Prévia por natureza orçamentária e centro de custo.',
  '<div class="toolbar"><button class="btn secondary" id="p45accrual">Constituição</button><button class="btn secondary" id="p45use">Baixas</button>'+
  '<button class="btn secondary" id="p45settings">Configurar naturezas '+(mode==='USE'?'de baixa':'de provisão')+'</button></div>'+
  '<p class="help">'+esc(d.note)+'</p>'+
  '<p class="help">Somente as movimentações operacionais confirmadas são consideradas. Não gera contas a pagar, guias ou FGTS patronal sobre provisões.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Componente</th><th>Centro de custo</th><th>D/C</th><th>Conta</th><th>Valor</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="5">Nenhuma partida disponível para integração.</td></tr>')+'</tbody></table></div>'+
  '<p class="help"><b>Movimentos:</b> '+esc(d.movement_count)+
  ' · <b>Débitos:</b> '+fmt(d.debit_cents)+' · <b>Créditos:</b> '+fmt(d.credit_cents)+
  ' · <b>Status:</b> '+(d.ready?'Conferido':'Bloqueado')+'</p>'+
  pending+
  (canPost?
   '<form id="p45post"><label class="field"><span>Lote contábil aberto</span><select name="batch_id" required>'+
   '<option value="">Selecione o lote</option>'+options+'</select></label>'+
   '<label class="field"><span>Para confirmar, digite CONTABILIZAR</span><input name="confirmation" autocomplete="off" required></label>'+
   '<div class="form-actions"><button type="submit" class="btn primary">Contabilizar no lote</button></div></form>':
   '<p class="help">A contabilização está bloqueada até eliminar as pendências ou obter as permissões necessárias.</p>')+
  '<div class="form-actions"><button class="btn secondary" id="p45back">Voltar ao controle</button></div>',true);
 document.getElementById('p45accrual').onclick=()=>payrollProvision45Open(period,'ACCRUAL').catch(e=>toast(e.message,'error'));
 document.getElementById('p45use').onclick=()=>payrollProvision45Open(period,'USE').catch(e=>toast(e.message,'error'));
 document.getElementById('p45settings').onclick=()=>mode==='USE'
  ?payrollProvision45UseSettings(period).catch(e=>toast(e.message,'error'))
  :payrollProvision44Settings(period).catch(e=>toast(e.message,'error'));
 document.getElementById('p45back').onclick=()=>payrollProvision43Ledger(period).catch(e=>toast(e.message,'error'));
 const form=document.getElementById('p45post');
 if(form)form.onsubmit=async event=>{
  event.preventDefault();const btn=form.querySelector('button[type=submit]');btn.disabled=true;
  try{
   const payload={kind:mode,competence:period,batch_id:form.elements.batch_id.value,
    confirmation:form.elements.confirmation.value,fingerprint:d.fingerprint};
   if(!payload.batch_id)throw Error('Selecione um lote contábil aberto.');
   const result=await api('/api/payroll/provisions/accounting/post',{method:'POST',body:payload});
   toast('Partidas contabilizadas no lote selecionado.');
   openModal('Provisões contabilizadas','Registro gerado no lote contábil.',
    '<p><b>Competência:</b> '+esc(result.competence)+'</p>'+
    '<p><b>Tipo:</b> '+esc(result.kind==='USE'?'Baixas':'Constituição')+'</p>'+
    '<p><b>Valor contabilizado:</b> '+fmt(result.total_cents)+'</p>'+
    '<p><b>Identificador do lançamento:</b> '+esc(result.journal_entry_id)+'</p>'+
    '<p class="help">Consulte o lote em Gestão Contábil. O lançamento não foi integrado automaticamente ao Lote 0.</p>'+
    '<div class="form-actions"><button id="p45done" class="btn secondary">Voltar ao controle</button></div>',true);
   document.getElementById('p45done').onclick=()=>payrollProvision43Ledger(period).catch(e=>toast(e.message,'error'));
  }catch(err){toast(err.message,'error');btn.disabled=false;}
 };
}
async function payrollProvision45UseSettings(period){
 const [data,natures]=await Promise.all([
  api('/api/payroll/provisions/accounting/use-settings'),
  api('/api/payroll/accounting-natures')
 ]);
 const active=(natures.natures||[]).filter(x=>x.active&&x.synthetic_analytic==='ANALYTIC');
 const mapped=new Map((data.mappings||[]).map(x=>[x.component,x]));
 const title={FERIAS:'Férias',TERCO_FERIAS:'1/3 de férias',DECIMO_TERCEIRO:'13º salário'};
 const rows=(data.components||[]).map(code=>{
  const m=mapped.get(code)||{};
  return '<tr><td>'+esc(title[code]||code)+'</td><td><select aria-label="Natureza de baixa '+esc(code)+'" name="'+code+'">'+
    '<option value="">Selecione uma natureza</option>'+
    active.map(n=>'<option value="'+esc(n.id)+'" '+(n.id===m.nature_id?'selected':'')+'>'+esc(n.code+' — '+n.description)+'</option>').join('')+
    '</select></td><td><button type="button" class="btn secondary sm" data-p45save="'+code+'">Salvar</button></td></tr>';
 }).join('');
 openModal('Naturezas para baixa de provisões',
  'Diferentes das naturezas da constituição. As contas são resolvidas pelos defaults por centro de custo.',
  '<p class="help">Para férias ou 13º já provisionados, em regra debite o passivo provisionado e credite a obrigação de liquidação correspondente. Não credite automaticamente uma conta de custo.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Componente</th><th>Natureza de baixa</th><th>Ação</th></tr></thead><tbody>'+
  rows+'</tbody></table></div><div class="form-actions"><button class="btn secondary" id="p45backSettings">Voltar à integração</button></div>',true);
 document.getElementById('p45backSettings').onclick=()=>payrollProvision45Open(period,'USE').catch(e=>toast(e.message,'error'));
 $$('[data-p45save]').forEach(btn=>{
  if(!can('payroll.manage')||!can('accounting.entry.create')){btn.disabled=true;return;}
  btn.onclick=async()=>{
   const component=btn.dataset.p45save,nature_id=$('select[name="'+component+'"]')?.value;
   if(!nature_id){toast('Selecione uma natureza de baixa.','error');return;}
   btn.disabled=true;
   try{
    await api('/api/payroll/provisions/accounting/use-settings',{method:'POST',body:{component,nature_id}});
    toast('Natureza de baixa atualizada.');
    await payrollProvision45UseSettings(period);
   }catch(e){toast(e.message,'error');btn.disabled=false}
  };
 });
}
