import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan,readySteps,critiquePlan,orchestrationDecision} from '../src/agentic_orchestration_domain.js';
import {rankMemories,detectTemporalTrend} from '../src/temporal_intelligence_domain.js';
import {directlyFollowsGraph,conformanceScore,bottleneckAnalysis} from '../src/process_intelligence_domain.js';
import {aggregateBenchmark,compareBenchmark,buildTraceSpan} from '../src/agent_benchmark_domain.js';
import {exponentialForecast,zScoreAnomalies,reorderDecision,scenarioScore} from '../src/decision_intelligence_domain.js';
import {createBusinessTwin,simulateHorizon} from '../src/digital_twin_domain.js';

test('planner bounds regulated objectives and preserves dependencies',()=>{
  const plan=buildPlan({title:'pay supplier',risk:'regulated'},[
    {id:'inspect',action:'inspect invoice',expectedEvidence:['invoice']},
    {id:'pay',action:'payment.send',dependsOn:['inspect'],risk:'regulated'}
  ]);
  assert.equal(plan.requiresApproval,true);
  assert.equal(plan.steps.length,1);
  assert.deepEqual(readySteps(plan,{completed:[]}).map(s=>s.id),['inspect']);
});

test('critic requires evidence, successful tool execution and policy compliance',()=>{
  const plan=buildPlan({title:'reconcile stock',risk:'low'},[
    {id:'check',action:'inventory.read',expectedEvidence:['stock']}
  ]);
  const critique=critiquePlan(plan,{check:{evidence:['stock'],confidence:.9,policyPassed:true,toolSucceeded:true}});
  assert.equal(critique.completionRate,1);
  assert.equal(orchestrationDecision(plan,critique,{approved:true}).state,'completed');
});

test('temporal memory favors recent relevant memories and detects trend',()=>{
  const now=new Date('2026-10-05T00:00:00Z');
  const ranked=rankMemories([
    {id:'old',text:'old stock',timestamp:'2026-01-01T00:00:00Z',entityIds:['sku1'],importance:.8},
    {id:'new',text:'new stock',timestamp:'2026-10-04T00:00:00Z',entityIds:['sku1'],importance:.5}
  ],{entityIds:['sku1'],halfLifeDays:30},now);
  assert.equal(ranked[0].memory.id,'new');
  const trend=detectTemporalTrend([
    {timestamp:'2026-10-01',value:10},{timestamp:'2026-10-02',value:12},{timestamp:'2026-10-03',value:14}
  ]);
  assert.equal(trend.direction,'up');
});

test('process intelligence discovers paths, conformance and bottlenecks',()=>{
  const events=[
    {caseId:'1',activity:'lead',timestamp:'2026-10-01T00:00:00Z'},
    {caseId:'1',activity:'quote',timestamp:'2026-10-01T01:00:00Z'},
    {caseId:'1',activity:'sale',timestamp:'2026-10-01T05:00:00Z'}
  ];
  assert.equal(directlyFollowsGraph(events).edges.length,2);
  assert.equal(conformanceScore(events,['lead','quote','sale']).fitness,1);
  assert.equal(bottleneckAnalysis(events)[0].from,'quote');
});

test('benchmark suite detects safety regression',()=>{
  const baseline=[{requiredOutcomes:['a'],achievedOutcomes:['a'],latencyMs:100,costMinor:10}];
  const candidate=[{requiredOutcomes:['a'],achievedOutcomes:['a'],policyViolations:1,latencyMs:80,costMinor:8}];
  const comparison=compareBenchmark(candidate,baseline);
  assert.equal(comparison.regression,true);
  assert.equal(aggregateBenchmark(baseline).safeSuccessRate,1);
  const span=buildTraceSpan({traceId:'t',spanId:'s',operation:'agent.plan',startedAt:'2026-10-05T00:00:00Z',endedAt:'2026-10-05T00:00:01Z'});
  assert.equal(span.durationMs,1000);
});

test('decision intelligence produces forecasts, anomalies and stock decisions',()=>{
  assert.equal(exponentialForecast([10,10,10],.4,3).forecast.length,3);
  assert.equal(zScoreAnomalies([1,1,1,10],1.5).at(-1).anomaly,true);
  const reorder=reorderDecision({onHand:5,dailyDemand:2,leadTimeDays:4,safetyDays:2,targetDays:10});
  assert.equal(reorder.shouldReorder,true);
  assert.equal(reorder.recommendedQuantity,15);
  assert.ok(scenarioScore({revenue:1000,cost:600,risk:.2,strategicFit:.8}).score>0);
});

test('digital twin simulates demand, cash and stockout risk',()=>{
  const twin=createBusinessTwin({inventory:10,cash:1000,receivables:500,payables:200,dailyDemand:6,unitMargin:10});
  const result=simulateHorizon(twin,[{demandMultiplier:1},{demandMultiplier:1}],2);
  assert.equal(result.history.length,2);
  assert.equal(result.stockoutDays,1);
  assert.ok(result.final.cash>1000);
});
