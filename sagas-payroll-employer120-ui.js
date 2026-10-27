// SAGAS v120: integração patronal documentada, sem guia e sem pagamento bancário.
(function(){
 'use strict';
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=c=> (Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const dateToday=()=>new Date().toISOString().slice(0,10);
 const components=['CPP','RAT','THIRDS','PIS'];
 async function settings(runId,month){
  const [r,n]=await Promise.all([api('/api/payroll/employer/accounting/settings'),api('/api/payroll/accounting-natures')]);
  const options=(n.natures||[]).filter(x=>x.active&&x.synthetic_analytic==='ANALYTIC');
  const creditors=r.creditors||[],map=new Map((r.mappings||[]).map(x=>[x.component,x]));
  const rows=Object.entries(r.components||{}).map(([key,label])=>{
   const m=map.get(key)||{};
   return '<tr><td>'+e(label)+'</td><td><select data-p120-nature="'+e(key)+'"><option value="">Selecione</option>'+
    options.map(x=>'<option value="'+e(x.id)+'"'+(x.id===m.nature_id?' selected':'')+'>'+e(x.code+' — '+x.description)+'</option>').join('')+
    '</select></td><td><select data-p120-creditor="'+e(key)+'"><option value="">Selecione</option>'+
    creditors.map(x=>'<option value="'+e(x.id)+'"'+(x.id===m.supplier_id?' selected':'')+'>'+e(x.code+' — '+x.name)+'</option>').join('')+
    '</select></td><td><button type="button" class="btn secondary sm" data-p120-save="'+e(key)+'">Salvar</button></td></tr>';
  }).join('');
  openModal('Encargos patronais — contabilização por natureza',
   'Configure uma natureza e um credor cadastrado para cada obrigação de CPP, RAT, terceiros e PIS.',
   '<p class="help">Cada natureza fornecerá contas de débito e crédito conforme o centro de custo. '+
   'Os credores devem ser cadastrados em Fornecedores/Clientes (por exemplo, o órgão arrecadador). '+
   'O FGTS mensal não será novamente contabilizado aqui.</p>'+
   '<div class="table-wrap"><table class="table"><thead><tr><th>Encargo</th><th>Natureza</th><th>Credor</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
   '<div class="form-actions"><button type="button" class="btn secondary" id="p120Back">Voltar</button>'+
   '<button type="button" class="btn primary" id="p120Preview">Conferir contabilização</button></div>',true);
  document.getElementById('p120Back').onclick=()=>SAGAS_EMPLOYER40.preview(month).catch(x=>toast(x.message,'error'));
  document.getElementById('p120Preview').onclick=()=>preview(runId,month).catch(x=>toast(x.message,'error'));
  $$('[data-p120-save]').forEach(btn=>{
   btn.disabled=!can('payroll.manage');
   btn.onclick=async()=>{
    const component=btn.dataset.p120Save;
    const nature_id=document.querySelector('[data-p120-nature="'+component+'"]')?.value;
    const supplier_id=document.querySelector('[data-p120-creditor="'+component+'"]')?.value;
    if(!nature_id||!supplier_id){toast('Selecione natureza e credor.','error');return}
    btn.disabled=true;
    try{
     await api('/api/payroll/employer/accounting/settings',{method:'POST',body:{component,nature_id,supplier_id}});
     toast('Parâmetros do encargo salvos.');
     await settings(runId,month);
    }catch(err){toast(err.message,'error');btn.disabled=false}
   };
  });
 }
 async function preview(runId,month){
  const p=await api('/api/payroll/monthly-runs/'+encodeURIComponent(runId)+'/employer-accounting');
  const lines=(p.lines||[]).map(x=>'<tr><td>'+e(x.side==='D'?'Débito':'Crédito')+'</td>'+
   '<td>'+e((x.account_code||x.account_id||'—')+' — '+(x.account_name||''))+'</td>'+
   '<td>'+e(x.cost_center_id||'—')+'</td><td>'+e(x.component)+'</td><td>'+fmt(x.amount_cents)+'</td></tr>').join('');
  const errors=(p.problems||[]).map(x=>'<tr><td>'+e(x.code)+'</td><td>'+e(x.message)+'</td></tr>').join('');
  const amounts=Object.entries(p.amount_by_component||{}).map(([key,val])=>'<tr><td>'+e(key)+'</td><td>'+
   fmt(val)+'</td></tr>').join('');
  openModal('Contabilização dos encargos patronais — '+e(month),
   'Conciliação da folha fechada, natureza contábil, credores e títulos financeiros.',
   '<p class="help"><b>Total patronal:</b> '+fmt(p.total_cents)+' · <b>Títulos previstos:</b> '+
   e(p.payable_count)+' · <b>Lote:</b> '+e(p.accounting_batch_id||'Não configurado')+
   ' · <b>Situação:</b> '+(p.integrated?'Integrado':p.ready?'Apto à confirmação documental':'Pendências')+'</p>'+
   '<div class="table-wrap"><table class="table"><thead><tr><th>Encargo</th><th>Valor</th></tr></thead><tbody>'+amounts+'</tbody></table></div>'+
   '<h4>Partidas do diário proposto</h4>'+
   '<div class="table-wrap"><table class="table"><thead><tr><th>D/C</th><th>Conta</th><th>Centro de custo</th><th>Encargo</th><th>Valor</th></tr></thead><tbody>'+lines+'</tbody></table></div>'+
   '<h4>Pendências</h4><div class="table-wrap"><table class="table"><thead><tr><th>Código</th><th>Descrição</th></tr></thead><tbody>'+
   (errors||'<tr><td colspan="2">Sem divergências nesta conferência.</td></tr>')+'</tbody></table></div>'+
   '<p class="help">'+e(p.note||'')+' Verifique a DCTFWeb, FPAS, FAP e as incidências antes de confirmar. '+
   'Esta integração cria títulos abertos, mas não emite guia nem realiza pagamento.</p>'+
   '<div class="form-actions"><button class="btn secondary" type="button" id="p120Settings">Configurar naturezas/credores</button>'+
   '<button class="btn secondary" type="button" id="p120Reload">Recalcular conferência</button>'+
   (p.ready&&!p.integrated&&can('payroll.manage')?
    '<button class="btn primary" type="button" id="p120Integrate">Conferir documento e integrar</button>':'')+
   '</div>',true);
  document.getElementById('p120Settings').onclick=()=>settings(runId,month).catch(x=>toast(x.message,'error'));
  document.getElementById('p120Reload').onclick=()=>preview(runId,month).catch(x=>toast(x.message,'error'));
  const button=document.getElementById('p120Integrate');
  if(button)button.onclick=()=>integrationForm(p,month);
 }
 function integrationForm(p,month){
  const valid=Object.entries(p.amount_by_component||{}).filter(([,x])=>Number(x)>0);
  const fields=valid.map(([key,amount])=>
   '<fieldset class="field full"><legend>'+e(key)+' — '+fmt(amount)+'</legend>'+
   '<label class="field"><span>Valor confirmado (R$)</span><input name="confirmed_'+e(key)+'" type="text" readonly value="'+
    e((Number(amount)/100).toFixed(2))+'"></label>'+
   '<label class="field"><span>Vencimento da guia/documento</span><input name="due_'+e(key)+'" type="date" min="'+e(month)+'-01" required></label>'+
   '<label class="field"><span>Número da guia/documento</span><input name="doc_'+e(key)+'" maxlength="120" minlength="6" required></label></fieldset>').join('');
  openModal('Confirmar integração patronal — '+e(month),
   'Esta ação criará um diário POSTED e títulos a pagar na mesma transação do banco.',
   '<p class="help">Confirme os valores conforme as guias oficiais. Se forem diferentes, não integre: revise os cálculos e o enquadramento da empresa.</p>'+
   '<form id="p120Confirm"><label class="field full"><span>Referência da documentação de conferência (DCTFWeb, guias etc.)</span>'+
   '<input name="evidence_reference" maxlength="240" minlength="12" required></label>'+fields+
   '<label class="field full"><span>Digite CONFIRMO BASES E INCIDENCIAS</span><input name="bases_confirmed" required autocomplete="off"></label>'+
   '<label class="field full"><span>Digite INTEGRAR ENCARGOS PATRONAIS</span><input name="confirmation" required autocomplete="off"></label>'+
   '<div class="form-actions"><button class="btn secondary" type="button" id="p120Cancel">Voltar</button>'+
   '<button class="btn primary" type="submit">Gerar diário e títulos a pagar</button></div></form>',true);
  document.getElementById('p120Cancel').onclick=()=>preview(p.run_id,month).catch(x=>toast(x.message,'error'));
  document.getElementById('p120Confirm').onsubmit=async ev=>{
   ev.preventDefault();const form=ev.currentTarget,submit=form.querySelector('button[type=submit]');
   submit.disabled=true;
   const values=Object.fromEntries(new FormData(form));
   const comps={};
   for(const [key,amount] of valid)comps[key]={
    confirmed_amount_cents:Number(amount),due_date:values['due_'+key],document_ref:values['doc_'+key]
   };
   try{
    const r=await api('/api/payroll/monthly-runs/'+encodeURIComponent(p.run_id)+'/employer-accounting',
      {method:'POST',body:{
       source_fingerprint:p.source_fingerprint,confirmation:values.confirmation,
       bases_confirmed:values.bases_confirmed,evidence_reference:values.evidence_reference,
       components:comps
      }});
    toast('Encargos integrados: diário e '+r.payable_count+' títulos gerados, sem pagamento.');
    await preview(p.run_id,month);
   }catch(err){toast(err.message,'error');submit.disabled=false}
  };
 }
 window.SAGAS_EMPLOYER120={settings,preview};
})();
