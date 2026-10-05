const clamp=(n,min,max)=>Math.min(max,Math.max(min,Number(n)||0));

export function createBusinessTwin(input = {}) {
  return {
    inventory: Math.max(0, Number(input.inventory)||0),
    cash: Number(input.cash)||0,
    receivables: Math.max(0, Number(input.receivables)||0),
    payables: Math.max(0, Number(input.payables)||0),
    dailyDemand: Math.max(0, Number(input.dailyDemand)||0),
    unitMargin: Number(input.unitMargin)||0,
    supplierLeadDays: Math.max(0, Number(input.supplierLeadDays)||0),
    serviceLevel: clamp(input.serviceLevel ?? 0.95,0,1),
    day: Math.max(0, Math.floor(Number(input.day)||0))
  };
}

export function simulateBusinessDay(twinInput, shock = {}) {
  const twin = createBusinessTwin(twinInput);
  const demandMultiplier = Math.max(0, Number(shock.demandMultiplier ?? 1)||0);
  const paymentRate = clamp(shock.receivableCollectionRate ?? 0.05,0,1);
  const payableRate = clamp(shock.payableSettlementRate ?? 0.03,0,1);
  const demand = twin.dailyDemand * demandMultiplier;
  const fulfilled = Math.min(twin.inventory, demand);
  const lostSales = Math.max(0, demand - fulfilled);
  const grossContribution = fulfilled * twin.unitMargin;
  const collections = twin.receivables * paymentRate;
  const settlements = twin.payables * payableRate;
  return {
    ...twin,
    inventory: Number((twin.inventory-fulfilled).toFixed(4)),
    cash: Number((twin.cash+grossContribution+collections-settlements).toFixed(2)),
    receivables: Number((twin.receivables-collections).toFixed(2)),
    payables: Number((twin.payables-settlements).toFixed(2)),
    day: twin.day+1,
    lastDay:{demand:Number(demand.toFixed(4)),fulfilled:Number(fulfilled.toFixed(4)),lostSales:Number(lostSales.toFixed(4)),grossContribution:Number(grossContribution.toFixed(2)),collections:Number(collections.toFixed(2)),settlements:Number(settlements.toFixed(2))}
  };
}

export function simulateHorizon(twinInput, shocks = [], days = 30) {
  let state = createBusinessTwin(twinInput);
  const history=[];
  const count=Math.max(1,Math.min(365,Math.floor(days)));
  for(let i=0;i<count;i++){
    state=simulateBusinessDay(state,shocks[i]||{});
    history.push(state);
  }
  return {final:state,history,stockoutDays:history.filter(x=>x.lastDay.lostSales>0).length,minCash:Math.min(...history.map(x=>x.cash))};
}
