// SAGAS v115 — quadro documental da rescisão, com valores em R$ na interface.
function pterm115Number(v){
 const s=String(v==null?'':v).trim().replace(/\s/g,'').replace(',','.');
 if(!/^\d{1,11}(?:\.\d{1,2})?$/.test(s))throw Error('Valor inválido: informe R$ com até duas casas decimais.');
 const cents=Math.round(Number(s)*100);
 if(!Number.isSafeInteger(cents)||cents>99999999999)throw Error('Valor acima do limite.');
 return cents;
}
function pterm115InputMoney(cents){return cents==null?'0,00':(Number(cents)/100).toFixed(2).replace('.',',')}
function pterm115Req(base){return {
 employee_id:base.employee.id,termination_date:base.termination_date,
 kind:base.termination_kind,notice_kind:base.notice_kind
}}
async function payrollTermination115Open(base){
 const p=await api('/api/payroll/termination/reconciliation',{method:'POST',body:pterm115Req(base)});
 const e=p.documentary_evidence||{},fgts=p.termination_kind==='WITHOUT_CAUSE';
 openModal('Rescisão — documentos e bases de cálculo',
  'Conferir férias adquiridas, médias documentadas e base da multa rescisória do FGTS.',
  '<p class="help"><b>Funcionário:</b> '+esc(p.employee.code)+' — '+esc(p.employee.name)+
  ' · <b>Desligamento:</b> '+esc(p.termination_date)+'. Valores são referências em reais; a apuração de INSS/IRRF e do líquido ainda é independente.</p>'+
  '<form id="pterm115Form" class="grid">'+
  '<label class="field"><span>Períodos completos de férias adquiridas ainda não pagas</span>'+
  '<input name="vacation_acquired_periods" type="number" min="0" max="8" step="1" required value="'+
   esc(e.vacation_acquired_periods??0)+'"></label>'+
  '<label class="field"><span>Desses, quantos períodos exigem pagamento em dobro comprovado</span>'+
  '<input name="vacation_double_periods" type="number" min="0" max="8" step="1" required value="'+
   esc(e.vacation_double_periods??0)+'"></label>'+
  '<label class="field"><span>Média salarial aplicável ao 13º (R$)</span>'+
  '<input name="average_thirteenth" inputmode="decimal" required value="'+pterm115InputMoney(e.average_thirteenth_cents)+'"></label>'+
  '<label class="field"><span>Média salarial aplicável às férias (R$)</span>'+
  '<input name="average_vacation" inputmode="decimal" required value="'+pterm115InputMoney(e.average_vacation_cents)+'"></label>'+
  '<label class="field"><span>Média salarial aplicável ao aviso (R$)</span>'+
  '<input name="average_notice" inputmode="decimal" required value="'+pterm115InputMoney(e.average_notice_cents)+'"></label>'+
  (fgts?'<label class="field"><span>Base TOTAL conciliada do FGTS para fins rescisórios (R$)</span>'+
   '<input name="fgts_base" inputmode="decimal" required value="'+pterm115InputMoney(e.fgts_base_cents)+'"></label>'+
   '<label class="field"><span>Identificação do extrato ou demonstrativo FGTS</span>'+
   '<input name="fgts_reference" maxlength="200" required value="'+esc(e.fgts_reference||'')+'"></label>':'')+
  '<label class="field"><span>Referência dos documentos de férias, médias e parcelas</span>'+
  '<input name="proof_reference" maxlength="200" required value="'+esc(e.proof_reference||'')+'"></label>'+
  '<label class="field"><span>Observações sobre a conferência</span>'+
  '<textarea name="notes" maxlength="500" rows="2">'+esc(e.notes||'')+'</textarea></label>'+
  '<p class="help">Ao confirmar, você declara que conferiu esses valores em documentação própria. O SAGAS registra a fonte informada, mas não valida automaticamente a autenticidade do documento.</p>'+
  '<label class="field"><span>Digite CONFIRMAR DOCUMENTOS RESCISAO</span>'+
  '<input name="confirmation" required autocomplete="off"></label>'+
  '<div class="form-actions"><button class="btn secondary" type="button" id="pterm115Back">Voltar</button>'+
  '<button class="btn primary" type="submit">Salvar conferência documental</button></div></form>',true);
 const form=document.getElementById('pterm115Form');
 document.getElementById('pterm115Back').onclick=()=>payrollTermination114Show(base);
 form.onsubmit=async evt=>{
  evt.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
   const values=Object.fromEntries(new FormData(form));
   const payload={...pterm115Req(base),
    vacation_acquired_periods:Number(values.vacation_acquired_periods),
    vacation_double_periods:Number(values.vacation_double_periods),
    average_thirteenth_cents:pterm115Number(values.average_thirteenth),
    average_vacation_cents:pterm115Number(values.average_vacation),
    average_notice_cents:pterm115Number(values.average_notice),
    ...(fgts?{fgts_base_cents:pterm115Number(values.fgts_base),
      fgts_reference:values.fgts_reference}:{}),
    proof_reference:values.proof_reference,notes:values.notes,
    base_source_fingerprint:p.base_source_fingerprint,
    confirmation:values.confirmation};
   await api('/api/payroll/termination/evidence',{method:'POST',body:payload});
   const next=await api('/api/payroll/termination/reconciliation',{method:'POST',body:pterm115Req(base)});
   toast('Conferência documental registrada na origem.');
   payrollTermination115Show(next);
  }catch(e){toast(e.message,'error');btn.disabled=false}
 };
}
function payrollTermination115Show(p){
 const a=p.amounts||{},fmt=pterm114Money;
 const lines=[
  ['Salário histórico na data',p.employee.salary_cents],
  ['Saldo de salário',a.salary_balance_cents],
  ['13º proporcional e médias',a.thirteenth_cents],
  ['13º por projeção do aviso',a.thirteenth_notice_projection_cents],
  ['Férias proporcionais e médias',a.vacation_proportional_cents],
  ['1/3 das férias proporcionais',a.vacation_third_cents],
  ['Férias adquiridas pendentes',a.vacation_accrued_unpaid_cents],
  ['1/3 das férias adquiridas',a.vacation_accrued_third_cents],
  ['Aviso indenizado e médias',a.notice_indemnity_cents],
  ['Total bruto de referência, sem descontos',p.full_gross_reference_cents],
  ['Multa FGTS 40% referencial (fora do líquido)',p.fgts_fine_reference_cents],
  ['Líquido efetivo',p.net_cents]
 ].map(([label,value])=>'<tr><td>'+esc(label)+'</td><td>'+fmt(value)+'</td></tr>').join('');
 const issues=(p.problems||[]).concat(p.documentary_issues||[]).map(x=>
  '<tr><td>'+esc(x.code)+'</td><td>'+esc(x.message)+'</td></tr>').join('');
 openModal('Rescisão — quadro documental · '+esc(p.employee.code||'—'),
  'Conferência da base salarial e documentos; não corresponde a TRCT aprovado.',
  '<p class="help"><b>Documento:</b> '+esc(p.documentary_evidence?.proof_reference||'—')+
  ' · <b>Base FGTS:</b> '+esc(p.documentary_evidence?.fgts_reference||'não informada')+'</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Composição</th><th>Valor</th></tr></thead><tbody>'+
  lines+'</tbody></table></div>'+
  '<h4>Pendências para apuração definitiva</h4>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Código</th><th>Pendência</th></tr></thead><tbody>'+
  issues+'</tbody></table></div>'+
  (p.warnings||[]).map(x=>'<p class="help">'+esc(x)+'</p>').join('')+
  '<p class="help">A multa do FGTS é uma referência separada do valor líquido. Ainda não há cálculo final das incidências, impostos, compensações ou integração contábil e financeira.</p>'+
  '<div class="form-actions"><button class="btn secondary" id="pterm115Edit" type="button">Editar bases</button>'+
  '<button class="btn secondary" id="pterm115Deductions" type="button">Conferir descontos</button>'+
  '<button class="btn secondary" id="pterm115History" type="button">Histórico documental</button>'+
  (p.documentary_ready&&can('payroll.manage')?
  '<button class="btn primary" id="pterm115Record" type="button">Registrar memória DRAFT</button>':'')+
  '</div>',true);
 document.getElementById('pterm115Edit').onclick=()=>payrollTermination115Open(p).catch(e=>toast(e.message,'error'));
 document.getElementById('pterm115Deductions').onclick=()=>payrollTermination116Open(p).catch(e=>toast(e.message,'error'));
 document.getElementById('pterm115History').onclick=()=>payrollTermination115History(p.employee.id,p.employee.name).catch(e=>toast(e.message,'error'));
 const save=document.getElementById('pterm115Record');
 if(save)save.onclick=async()=>{
  save.disabled=true;
  try{
   const result=await api('/api/payroll/termination/workpapers',{method:'POST',body:{
    ...pterm115Req(p),source_fingerprint:p.source_fingerprint,
    confirmation:'REGISTRAR CONFERENCIA RESCISAO'
   }});
   toast(result.reused?'Conferência já registrada.':'Memória documental DRAFT registrada.');
   payrollTermination115Show(p);
  }catch(e){toast(e.message,'error');save.disabled=false}
 };
}
async function payrollTermination115History(employeeId,name){
 const response=await api('/api/payroll/termination/workpapers?employee_id='+encodeURIComponent(employeeId));
 const runs=response.runs||[];
 const rows=runs.map((r,i)=>'<tr><td>'+esc(r.termination_date)+'</td>'+
  '<td>'+esc(r.kind)+'</td><td>'+esc(r.revision)+'</td>'+
  '<td>DRAFT</td><td><button type="button" class="btn secondary sm" data-pterm115-workpaper="'+i+'">Conferir</button></td></tr>').join('');
 openModal('Histórico documental de rescisão — '+esc(name),
  'Fotografias documentais versionadas; nenhum registro representa pagamento ou desligamento.',
  '<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Modalidade</th>'+
  '<th>Revisão</th><th>Situação</th><th>Ação</th></tr></thead><tbody>'+
  (rows||'<tr><td colspan="5">Nenhuma memória documental registrada.</td></tr>')+
  '</tbody></table></div>'+
  '<div class="form-actions"><button type="button" class="btn secondary" id="pterm115New">Nova prévia</button></div>',true);
 document.getElementById('pterm115New').onclick=()=>payrollTermination114Open().catch(e=>toast(e.message,'error'));
 $$('[data-pterm115-workpaper]').forEach(btn=>btn.onclick=async()=>{
  try{
   const item=runs[Number(btn.dataset.pterm115Workpaper)];
   const r=await api('/api/payroll/termination/workpapers/'+encodeURIComponent(item.id));
   payrollTermination115Show(r.snapshot);
  }catch(e){toast(e.message,'error')}
 });
}
