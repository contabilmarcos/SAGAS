// SAGAS Folha v89 — média salarial, abono e espelho BRUTO de férias.
// Todos os registros dependem de comprovação manual. Sem integração financeira.
function vacation89Format(c){return (Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function vacation89Value(c){return (Number(c||0)/100).toFixed(2).replace('.',',')}
function vacation89ToCents(s){
 const str=String(s||'').trim().replace(',','.');
 if(!/^\d{1,8}(\.\d{1,2})?$/.test(str))throw Error('Informe valor mensal em reais com até 2 casas decimais.');
 const amount=Math.round(Number(str)*100);
 if(!Number.isSafeInteger(amount)||amount<0)throw Error('Valor mensal inválido.');
 return amount;
}
async function payrollVacation89Open(month,occ){
 const data=await api('/api/payroll/vacation-calculation?occurrence_id='+encodeURIComponent(occ.id));
 if(!data.configured){
  if(data.stale){
   openModal('Memória de férias desatualizada',
    esc(occ.employee_name),'<p class="help">'+esc(data.note)+'</p>'+
    '<div class="form-actions"><button id="vacation89Back" class="btn secondary" type="button">Voltar</button>'+
    '<button id="vacation89RemoveStale" class="btn danger" type="button">Excluir memória antiga</button></div>',true);
   $('#vacation89Back').onclick=()=>payrollVacation50Open(month,occ).catch(e=>toast(e.message,'error'));
 $('#vacation90Open').onclick=()=>payrollVacation90Open(month,occ).catch(e=>toast(e.message,'error'));
   $('#vacation89RemoveStale').onclick=()=>payrollVacation89Delete(month,occ);
   return;
  }
  payrollVacation89Edit(month,occ,data);
  return;
 }
 const lines=[
  ['Salário fixo histórico',data.salary_cents],
  ['Média mensal de comissões',data.average_commission_cents],
  ['Média mensal de adicionais',data.average_additional_cents],
  ['Base mensal estimada de férias',data.remuneration_base_cents],
  ['Férias gozadas ('+data.gozo_days+' dias)',data.vacation_cents],
  ['1/3 constitucional sobre gozo',data.vacation_third_cents],
  ['Abono pecuniário ('+data.abono_days+' dias)',data.abono_cents],
  ['Parte do 1/3 constitucional atribuída ao abono',data.abono_third_cents],
  ['Total bruto estimado, sem descontos',data.gross_estimate_cents]
 ];
 const rows=lines.map(([name,value],i)=>'<tr><td>'+(i===lines.length-1?'<b>'+esc(name)+'</b>':esc(name))+
  '</td><td style="text-align:right">'+(i===lines.length-1?'<b>'+esc(vacation89Format(value))+'</b>':esc(vacation89Format(value)))+'</td></tr>').join('');
 openModal('Minuta de férias — não homologada',
  esc(occ.employee_name)+' | '+esc(data.start_date)+' a '+esc(data.end_date),
  '<p class="help"><b>Memória bruta apenas.</b> Esta tela não é recibo quitado e não gera pagamento, descontos, FGTS nem lançamento contábil.</p>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Verba</th><th style="text-align:right">Valor</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<p class="help">Período aquisitivo: '+esc(data.acquisition_start)+' a '+esc(data.acquisition_end)+
  ' · Limite estimado para pagamento: '+esc(data.payment_deadline)+' · Revisão '+esc(data.revision)+'</p>'+
  '<p class="section-title">Conferências obrigatórias</p><ul class="help">'+(data.warnings||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+
  '<div class="form-actions"><button class="btn secondary" id="vacation89Back" type="button">Voltar</button>'+
  '<button class="btn primary" id="vacation90Open" type="button">INSS / IRRF / FGTS</button>'+
  (can('payroll.manage')?'<button class="btn secondary" id="vacation89Edit" type="button">Editar médias e abono</button>'+
  '<button class="btn danger" id="vacation89Delete" type="button">Excluir memória</button>':'')+'</div>',true);
 $('#vacation89Back').onclick=()=>payrollVacation50Open(month,occ).catch(e=>toast(e.message,'error'));
 if($('#vacation89Edit'))$('#vacation89Edit').onclick=()=>payrollVacation89Edit(month,occ,data);
 if($('#vacation89Delete'))$('#vacation89Delete').onclick=()=>payrollVacation89Delete(month,occ);
}
function payrollVacation89Edit(month,occ,data){
 if(!can('payroll.manage')){toast('Você não possui permissão para editar férias.','error');return}
 const commMonths=data.commission_months||[],addMonths=data.additional_months||[];
 const commissions=data.commission_monthly_cents||new Array(12).fill(0);
 const adds=data.additional_monthly_cents||new Array(12).fill(0);
 const fields=(months,values,prefix)=>months.map((m,i)=>
  '<label class="field"><span>'+esc(m)+'</span>'+
  '<input name="'+prefix+i+'" type="text" inputmode="decimal" autocomplete="off" value="'+esc(vacation89Value(values[i]))+'" required></label>').join('');
 const allowed=data.entitled_days/3;
 const selected=Number(data.abono_days||0);
 openModal('Médias e abono — memória de férias',
  esc(occ.employee_name)+' · '+esc(String(data.gozo_days))+' dias de gozo',
  '<p class="help">Informe todas as 12 competências de cada grupo, inclusive valores zero. Os adicionais devem estar corrigidos conforme os reajustes aplicáveis e conferidos pelo DP.</p>'+
  '<form id="vacation89Form">'+
  '<p class="section-title">Comissões e percentagens — 12 competências anteriores ao mês do gozo</p>'+
  '<div class="grid three">'+fields(commMonths,commissions,'comm')+'</div>'+
  '<p class="section-title">Adicionais — 12 competências a partir do início aquisitivo</p>'+
  '<div class="grid three">'+fields(addMonths,adds,'add')+'</div>'+
  '<div class="grid" style="margin-top:16px">'+
  '<label class="field"><span>Abono pecuniário</span><select name="abono_days" id="vacation89Abono">'+
  '<option value="0" '+(selected===0?'selected':'')+'>Não converter dias</option>'+
  '<option value="'+esc(allowed)+'" '+(selected===allowed?'selected':'')+'>Converter '+esc(allowed)+' dias (1/3 do direito)</option>'+
  '</select></label>'+
  '<label class="field" id="vacation89RequestWrap"><span>Data do pedido escrito de abono</span>'+
  '<input name="abono_request_date" type="date" value="'+esc(data.request_date||'')+'"></label>'+
  '<label class="field full"><span>Fonte dos valores, reajustes, documentos e conferência do DP</span>'+
  '<textarea name="notes" rows="3" minlength="15" maxlength="600" required>'+esc(data.notes||'')+'</textarea></label>'+
  '<label class="field full"><span>Confirme digitando MEDIAS CONFERIDAS</span><input name="confirmation" autocomplete="off" required></label>'+
  '</div>'+
  '<p class="help">O abono só será aceito com pedido documentado no prazo legal. A prévia não calcula INSS/IRRF/FGTS nem as diferenças de competência.</p>'+
  '<div class="form-actions"><button class="btn secondary" id="vacation89Cancel" type="button">Cancelar</button>'+
  '<button class="btn primary" type="submit">Salvar e calcular minuta</button></div></form>',true);
 const form=$('#vacation89Form'),wrap=$('#vacation89RequestWrap'),abono=$('#vacation89Abono');
 function toggle(){wrap.style.display=Number(abono.value)>0?'':'none';form.elements.abono_request_date.required=Number(abono.value)>0}
 abono.onchange=toggle;toggle();
 $('#vacation89Cancel').onclick=()=>payrollVacation50Open(month,occ).catch(e=>toast(e.message,'error'));
 form.onsubmit=async ev=>{
  ev.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
   const commission_monthly_cents=commMonths.map((_,i)=>vacation89ToCents(form.elements['comm'+i].value));
   const additional_monthly_cents=addMonths.map((_,i)=>vacation89ToCents(form.elements['add'+i].value));
   const body={action:'save',occurrence_id:occ.id,commission_monthly_cents,additional_monthly_cents,
    abono_days:Number(abono.value),abono_request_date:form.elements.abono_request_date.value,
    notes:form.elements.notes.value,confirmation:form.elements.confirmation.value,
    expected_revision:data.revision||0};
   await api('/api/payroll/vacation-calculation',{method:'POST',body});
   toast('Memória bruta de férias registrada. Confira os valores.');
   await payrollVacation89Open(month,occ);
  }catch(e){toast(e.message||String(e),'error');btn.disabled=false}
 };
}
function payrollVacation89Delete(month,occ){
 openModal('Excluir memória de cálculo',
  esc(occ.employee_name)+' · '+esc(occ.start_date)+' a '+esc(occ.end_date),
  '<p class="help">Exclui as médias e o abono reservado nesta memória. A ocorrência e o período aquisitivo permanecem cadastrados.</p>'+
  '<form id="vacation89DeleteForm"><label class="field"><span>Digite EXCLUIR MEMORIA</span>'+
  '<input name="confirmation" autocomplete="off" required></label>'+
  '<div class="form-actions"><button id="vacation89CancelDelete" class="btn secondary" type="button">Cancelar</button>'+
  '<button class="btn danger" type="submit">Excluir memória</button></div></form>',true);
 $('#vacation89CancelDelete').onclick=()=>payrollVacation50Open(month,occ).catch(e=>toast(e.message,'error'));
 const form=$('#vacation89DeleteForm');form.onsubmit=async ev=>{
  ev.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{await api('/api/payroll/vacation-calculation',{method:'POST',
   body:{action:'delete',occurrence_id:occ.id,confirmation:form.elements.confirmation.value}});
   toast('Memória de cálculo excluída.');
   await payrollVacation50Open(month,occ);
  }catch(e){toast(e.message||String(e),'error');btn.disabled=false}
 };
}
