const TARGETS = {
  "Flutter web": ["Azure Static Web Apps", "S3 with CloudFront", "Firebase Hosting", "Static Nginx"],
  "React": ["Azure Static Web Apps", "S3 with CloudFront", "Firebase Hosting", "Static Nginx"],
  "Node.js": ["Azure Container Apps", "ECS", "Cloud Run", "Docker host"],
  "Python FastAPI": ["Azure Container Apps", "ECS", "Cloud Run", "Docker host"],
  "Docker container": ["Azure Container Apps", "ECS", "Cloud Run", "Docker host"]
};
const PROVIDERS = ["Azure", "AWS", "Google Cloud", "Private infrastructure"];
export function generateCloudBlueprint(plan) {
  const providerIndex = PROVIDERS.indexOf(plan.provider);
  const target = TARGETS[plan.stack]?.[providerIndex];
  if (!target) throw new Error("Unsupported configuration");
  return {
    target, planningOnly: true,
    approvalGates: ["verify tenant ownership", "inspect code", "verify price",
      "approve production deployment"],
    warnings: ["Cloud prices vary by region and usage", "Budget alerts are not hard spending caps"],
    features: ["deployment workflow", "monitoring", "backups", "audit records"]
  };
}
export function assessCloudSignals(signals) {
  const limits = {cpuPercent:85,memoryPercent:90,errorRatePercent:5,monthlySpendPercent:90,backupAgeHours:30};
  if (!Array.isArray(signals) || signals.length > 100) throw new Error("Invalid signals");
  return signals.map(item => {
    if (!item || !Object.hasOwn(limits,item.metric) ||
      !Number.isFinite(item.value) || item.value < 0 || item.value > 100000) throw new Error("Invalid signal");
    const breach = item.value >= limits[item.metric];
    return {metric:item.metric,value:item.value,severity:breach?"review":"normal",
      recommendedAction:breach?"create-human-reviewed-incident":"no-action",automaticRemediation:false};
  });
}
