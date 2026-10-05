[CmdletBinding()]
param(
    [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
    [string]$ProjectId = 'tekntandaoworkspace',
    [switch]$Deploy
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed. Deployment stopped." }
}

try {
    foreach ($command in @('gcloud', 'firebase', 'flutter')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Install $command before running this script."
        }
    }

    $billingJson = Invoke-Checked 'gcloud' @('billing', 'projects', 'describe', $ProjectId, '--format=json(billingEnabled)', '--quiet')
    if (-not (($billingJson -join "`n" | ConvertFrom-Json).billingEnabled)) {
        throw "Billing is disabled for $ProjectId. Enable the Firebase Blaze plan before deploying Cloud Functions. No changes were made."
    }

    # Query metadata only. Never fetch or print secret payloads.
    foreach ($secret in @('AUTOMATION_ENCRYPTION_KEY', 'AUTOMATION_OAUTH_CONFIG', 'GEMINI_API_KEY', 'NAMECHEAP_CONFIG', 'PAYSTACK_SECRET_KEY', 'WEBSITE_ANALYTICS_SIGNING_KEY')) {
        $versions = Invoke-Checked 'gcloud' @('secrets', 'versions', 'list', $secret, "--project=$ProjectId", '--filter=state:ENABLED', '--limit=1', '--format=value(name)', '--quiet')
        if (-not $versions) { throw "Secret $secret needs an enabled version. See docs/automation-studio.md." }
    }

    $hasModel = $false
    foreach ($name in @('.env', ".env.$ProjectId")) {
        $environmentFile = Join-Path $workspaceRoot "functions/$name"
        if (Test-Path -LiteralPath $environmentFile) {
            $hasModel = $hasModel -or [bool]((Get-Content -LiteralPath $environmentFile) -match '^\s*GEMINI_MODEL\s*=\s*[^\s#]+')
        }
    }
    if (-not $hasModel) { throw "Set GEMINI_MODEL in functions/.env.$ProjectId before deploying." }

    $firebaseConfig = Join-Path $workspaceRoot 'firebase-config.json'
    if (-not (Test-Path -LiteralPath $firebaseConfig)) { throw 'The production firebase-config.json Dart configuration is missing.' }
    $dartConfig = Get-Content -LiteralPath $firebaseConfig -Raw | ConvertFrom-Json
    if ($dartConfig.FIREBASE_PROJECT_ID -ne $ProjectId) { throw 'The Dart Firebase configuration targets a different project.' }
    if ($dartConfig.PREVIEW -eq $true -or $dartConfig.PREVIEW -eq 'true' -or $dartConfig.USE_EMULATORS -eq $true -or $dartConfig.USE_EMULATORS -eq 'true') {
        throw 'Production configuration must not enable PREVIEW or USE_EMULATORS.'
    }

    if (-not $Deploy) {
        Write-Output 'Deployment prerequisites passed. Run again with -Deploy to build and publish.'
        return
    }

    Push-Location (Join-Path $workspaceRoot 'apps/dashboard')
    try { Invoke-Checked 'flutter' @('build', 'web', "--dart-define-from-file=$firebaseConfig") }
    finally { Pop-Location }

    $functionNames = @(
        'getAutomationStudio', 'connectRemoteMcp', 'disconnectToolConnection',
        'startAutomationOAuth', 'automationOAuthCallback', 'saveToolWorkflow',
        'runToolWorkflow', 'processToolWorkflowEvent', 'processOperationalToolEvent',
        'generateCustomFeature', 'saveCustomFeature', 'previewCustomFeature',
        'publishCustomFeature', 'runCustomFeature', 'createWorkspaceMcpKey',
        'revokeWorkspaceMcpKey', 'workspaceMcp', 'workspaceApi', 'connectBusinessTool',
        'connectEnterpriseTool', 'checkToolConnection', 'refreshConnectorHealth',
        'previewAutomationConnectionTool', 'suggestDataExchangeMapping', 'saveDataExchangeRule',
        'getDataExchange', 'runDataExchangeRule', 'runScheduledDataExchange',
        'getExecutiveIntelligence', 'generateExecutiveBrief',
        'setResellerAccount', 'getResellerStudio', 'saveResellerPricing', 'priceResellerGeneration',
        'recordResellerFirebaseCost', 'saveVettedSiteTemplate', 'installVettedSiteTemplate', 'exportVettedSite',
        'quoteResellerDomain', 'createResellerBundle', 'createResellerInvoice', 'getClientBundleInvoices',
        'startResellerInvoicePayment', 'checkResellerInvoicePayment', 'resellerPaystackWebhook',
        'cancelResellerBundle', 'registerResellerDomain', 'connectResellerDomain', 'maintainResellerSubscriptions',
        'generateWebsiteFromPrompt', 'replaceWebsiteDocument', 'generateWebsiteBusinessPlan',
        'requestWebsiteBusinessAction', 'resolveWebsiteBusinessAction', 'executeAgentAction',
        'paystackWebhook', 'resolvePublishedWebsiteExperience'
    )
    $targets = ($functionNames | ForEach-Object { "functions:suite:$_" }) -join ','
    Push-Location $workspaceRoot
    try {
        Invoke-Checked 'firebase' @('deploy', '--project', $ProjectId, '--only', $targets, '--non-interactive')
        Invoke-Checked 'firebase' @('deploy', '--project', $ProjectId, '--only', 'hosting', '--non-interactive')
    }
    finally { Pop-Location }
}
catch {
    Write-Error $_.Exception.Message -ErrorAction Continue
    exit 1
}
