const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
const clamp = (n,min,max)=>Math.min(max,Math.max(min,Number(n)||0));

export function exponentialForecast(values = [], alpha = 0.35, horizon = 1) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (!clean.length) return {forecast: [], level: 0};
  const a = clamp(alpha, 0.01, 0.99);
  let level = clean[0];
  for (let i=1;i<clean.length;i++) level = (a*clean[i]) + ((1-a)*level);
  return {forecast:Array.from({length:Math.max(1,Math.min(365,Math.floor(horizon)))},()=>Number(level.toFixed(6))),level:Number(level.toFixed(6))};
}

export function zScoreAnomalies(values = [], threshold = 3) {
  const clean = values.map(Number).filter(Number.isFinite);
  const m = mean(clean);
  const variance = clean.length ? mean(clean.map(v => (v-m)**2)) : 0;
  const sd = Math.sqrt(variance);
  return clean.map((value,index)=>({index,value,z:sd ? Number(((value-m)/sd).toFixed(4)) : 0,anomaly:sd ? Math.abs((value-m)/sd)>=threshold : false}));
}

export function reorderDecision(input = {}) {
  const onHand = Math.max(0, Number(input.onHand)||0);
  const dailyDemand = Math.max(0, Number(input.dailyDemand)||0);
  const leadTimeDays = Math.max(0, Number(input.leadTimeDays)||0);
  const safetyDays = Math.max(0, Number(input.safetyDays ?? 3)||0);
  const targetDays = Math.max(safetyDays, Number(input.targetDays ?? 30)||30);
  const reorderPoint = dailyDemand * (leadTimeDays + safetyDays);
  const targetStock = dailyDemand * targetDays;
  const quantity = Math.max(0, Math.ceil(targetStock - onHand));
  return {
    reorderPoint:Number(reorderPoint.toFixed(2)),
    targetStock:Number(targetStock.toFixed(2)),
    shouldReorder:onHand <= reorderPoint,
    recommendedQuantity:onHand <= reorderPoint ? quantity : 0,
    daysCover:dailyDemand ? Number((onHand/dailyDemand).toFixed(2)) : Infinity
  };
}

export function scenarioScore(input = {}) {
  const revenue = Number(input.revenue)||0;
  const cost = Number(input.cost)||0;
  const risk = clamp(input.risk ?? 0,0,1);
  const strategicFit = clamp(input.strategicFit ?? 0.5,0,1);
  const cashImpact = Number(input.cashImpact ?? revenue-cost)||0;
  const expectedValue = revenue - cost;
  const score = (expectedValue * (1-risk)) + (Math.abs(expectedValue || 1) * strategicFit * 0.2) + (cashImpact * 0.1);
  return {expectedValue:Number(expectedValue.toFixed(2)),score:Number(score.toFixed(2)),risk,strategicFit,cashImpact:Number(cashImpact.toFixed(2))};
}
