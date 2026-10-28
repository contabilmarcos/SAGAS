// SAGAS v126: a natureza define apenas as partidas presentes.
// Um evento pode ter somente D ou somente C; o diario completo deve fechar.
export function planNatureDefaults126(defaults,centerId,amountCents,options={}){
 const problems=[],lines=[];
 const requireCreditOnly=options.requireCreditOnly===true;
 if(!centerId||!Number.isSafeInteger(amountCents)||amountCents<0){
  return {lines:[],problems:[{code:'VALOR_OU_CC_INVALIDO',message:'Valor ou centro de custo invalido.'}]};
 }
 const input=Array.isArray(defaults)?defaults:[];
 const sides=['D','C'],selectedBySide={D:[],C:[]};
 for(const side of sides){
  const rows=input.filter(x=>x.side===side);
  const specific=rows.filter(x=>x.cost_center_id===centerId);
  selectedBySide[side]=specific.length?specific:rows.filter(x=>!x.cost_center_id);
 }
 if(requireCreditOnly&&selectedBySide.D.length)
  problems.push({code:'LIQUIDO_COM_DEBITO',message:'A natureza do liquido deve ter somente default de credito neste centro de custo.'});
 if(requireCreditOnly&&!selectedBySide.C.length)
  problems.push({code:'LIQUIDO_SEM_CREDITO',message:'A natureza do liquido precisa de default de credito para este centro de custo.'});
 if(!requireCreditOnly&&!selectedBySide.D.length&&!selectedBySide.C.length)
  problems.push({code:'DEFAULT_NATUREZA_AUSENTE',message:'Nenhum default de debito ou credito se aplica ao centro de custo.'});
 for(const side of sides){
  const rows=selectedBySide[side];
  if(!rows.length)continue;
  const percentages=rows.map(x=>Number(x.percentage));
  const pctSum=percentages.reduce((a,b)=>a+b,0);
  if(percentages.some(x=>!Number.isFinite(x)||x<=0||x>100)||Math.abs(pctSum-100)>0.0001){
   problems.push({code:'PERCENTUAIS_NATUREZA',side,message:'Percentuais do lado '+side+' nao totalizam 100%.'});
   continue;
  }
  let applied=0;
  for(let i=0;i<rows.length;i++){
   const x=rows[i];
   const value=i===rows.length-1?amountCents-applied:Math.round(amountCents*percentages[i]/100);
   applied+=value;
   if(value>0)lines.push({...x,side,amount_cents:value});
  }
 }
 return {lines:problems.length?[]:lines,problems};
}
