/**
 * Cloud automation migration contract shared with the public TeknTandao HTML planner.
 * Parsing never provisions resources or creates accounts.
 * Call only after Workspace authenticates the user and an administrator authorizes
 * the target organization; link ownership server-side before persisting anything.
 */
const STACKS = new Set(["Flutter web","React","Node.js","Python FastAPI","Docker container"]);
const PROVIDERS = new Set(["Azure","AWS","Google Cloud","Private infrastructure"]);
export function validateCloudMigrationRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid request");
  if (input.schemaVersion !== 1 || input.kind !== "cloud-automation-migration-request" ||
      input.source !== "tekntandao-html" || input.mode !== "planning-only") throw new Error("Unsupported migration format");
  const appName = typeof input.appName==="string" ? input.appName.trim() : "";
  if (!appName || appName.length>120) throw new Error("Invalid application name");
  if (!STACKS.has(input.stack) || !PROVIDERS.has(input.provider)) throw new Error("Invalid provider or stack");
  if (!Number.isFinite(input.monthlyBudgetUsd) || input.monthlyBudgetUsd<1 || input.monthlyBudgetUsd>100000) throw new Error("Invalid budget");
  const repositoryUrl = input.repositoryUrl || "";
  if (typeof repositoryUrl !== "string" || (repositoryUrl &&
     !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(repositoryUrl))) throw new Error("Invalid repository URL");
  return Object.freeze({schemaVersion:1,appName,repositoryUrl,stack:input.stack,provider:input.provider,
    monthlyBudgetUsd:input.monthlyBudgetUsd,status:"awaiting-organization-verification",
    source:"tekntandao-html"});
}
export function proposeCloudAutomationSteps(request) {
  const plan=validateCloudMigrationRequest({...request,kind:"cloud-automation-migration-request",
    source:"tekntandao-html",mode:"planning-only"});
  return Object.freeze([
    {action:"verify-identity-and-tenant",approval:"required"},
    {action:"inspect-repository-read-only",approval:"required"},
    {action:"generate-iac-and-estimate",approval:"required"},
    {action:"provision-infrastructure",approval:"explicit-customer-and-operator-approval"},
    {action:"enable-monitoring-and-backups",approval:"required"},
    {action:"start-maintenance",approval:"policy-bound"}
  ].map(item=>Object.freeze(item)));
}
